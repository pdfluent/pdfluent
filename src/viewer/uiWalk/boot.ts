// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary. The PDFluent application is free to use,
// including for commercial purposes. Redistribution, or extraction or reuse
// of its components (including the embedded PDF engine), requires a licence.
// See https://pdfluent.com/license for terms.

// Start-up of the ui-walk build: wait for the document the suite opened, walk
// the controls the register lists, hand the probe to the host and let it quit.
// Loaded only when VITE_UI_WALK=1 (src/main.tsx).
//
// Native dialogs are answered here, in the page, with canned values (a save goes
// to the scratch folder, an open returns the walk document, a question is
// answered yes). A real panel would stop the walk at its first control that
// opens one, and there is nobody to click it.

import { CERTIFICATE_PASSWORD, runWalk, WALK_MARKER, type KeyInit, type WalkEnv, type WalkFault, type WalkResult, type WalkTarget } from './walker';
// Installs window.__pjFaultWatch, the same watch the journeys and the Playwright
// suite use: error toasts, console.error, uncaught exceptions, rejections.
// A side-effect import, so it lives in the ui-walk bundle only (the file is
// loaded by main.tsx behind VITE_UI_WALK).
import '../../../tests/lib/fault-watch.js';

type Invoke = (cmd: string, args?: Record<string, unknown>) => Promise<unknown>;
interface Internals { invoke: Invoke }
interface Plan { targets: WalkTarget[]; scratch: string; document: string; certificate: string; certificatePassword: string }

/** A 2x2 opaque PNG. */
const TINY_PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAAFElEQVR4nGP8z8Dwn4EIwDiqEAAEPQEC9GIqXQAAAABJRU5ErkJggg==';
const IGNORED = /^(plugin:ui-walk\||plugin:event\||frontend_log$)/;
const sleep = (ms: number): Promise<void> => new Promise((r) => { window.setTimeout(r, ms); });

async function waitForDocument(timeoutMs: number): Promise<boolean> {
  const until = Date.now() + timeoutMs;
  while (Date.now() < until) {
    if (document.querySelector('[data-has-document="true"]')) return true;
    await sleep(250);
  }
  return false;
}

/** The runner writes either a bare list of targets or { targets, scratch, document }. */
function readPlan(text: string): Plan {
  const raw = JSON.parse(text) as WalkTarget[] | Partial<Plan>;
  const none = { scratch: '', document: '', certificate: '', certificatePassword: '' };
  if (Array.isArray(raw)) return { targets: raw, ...none };
  return { targets: raw.targets ?? [], ...none, ...raw };
}

/** A canned answer for a native dialog command, or undefined when it is not one. */
export function dialogAnswer(cmd: string, plan: Plan, n: number, args?: Record<string, unknown>): unknown {
  switch (cmd) {
    case 'plugin:dialog|save': return plan.scratch ? `${plan.scratch}/walk-out-${n}.pdf` : null;
    case 'plugin:dialog|open': {
      // A folder picker (split, extract) gets the scratch folder; a file picker the walk document.
      const options = args?.options as { directory?: boolean; filters?: Array<{ extensions?: string[] }> } | undefined;
      if (options?.directory) return plan.scratch || null;
      // The certificate picker filters on .p12/.pfx: it gets the checked-in test certificate.
      if (options?.filters?.some((f) => f.extensions?.includes('p12'))) return plan.certificate || null;
      return plan.document ? plan.document : null;
    }
    case 'plugin:dialog|message': return 'Ok';
    case 'plugin:dialog|ask':
    case 'plugin:dialog|confirm': return true;
    default: return undefined;
  }
}

export async function bootUiWalk(): Promise<void> {
  const internals = (window as unknown as { __TAURI_INTERNALS__?: Internals }).__TAURI_INTERNALS__;
  if (!internals) return;
  const real = internals.invoke.bind(internals);
  let seen: string[] = [];
  let plan: Plan = { targets: [], scratch: '', document: '', certificate: '', certificatePassword: '' };
  let answered = 0;
  internals.invoke = (cmd, args) => {
    if (!IGNORED.test(cmd)) seen.push(cmd);
    const canned = dialogAnswer(cmd, plan, answered, args);
    if (canned !== undefined) { answered += 1; return Promise.resolve(canned); }
    return real(cmd, args);
  };

  // The page's own blocking prompts, answered the way the native ones are: a
  // range, a yes, no alert. Nobody is there to click them.
  window.prompt = () => '1';
  window.confirm = () => true;
  window.alert = () => {};

  // The image picker is a file input the page clicks itself; answer it with a
  // two-pixel PNG instead of a native chooser nobody is there to use.
  const nativeClick = HTMLInputElement.prototype.click;
  HTMLInputElement.prototype.click = function click(this: HTMLInputElement) {
    if (this.type !== 'file') { nativeClick.call(this); return; }
    const bytes = Uint8Array.from(atob(TINY_PNG), (c) => c.charCodeAt(0));
    const transfer = new DataTransfer();
    transfer.items.add(new File([bytes], 'ui-walk.png', { type: 'image/png' }));
    this.files = transfer.files;
    this.dispatchEvent(new Event('change', { bubbles: true }));
  };

  let mutations = 0;
  new MutationObserver((list) => { mutations += list.length; })
    .observe(document.body, { subtree: true, childList: true, attributes: true, characterData: true });

  const env: WalkEnv = {
    find: (selector) => document.querySelector<HTMLButtonElement>(selector),
    click: (selector) => {
      const el = document.querySelector<Element>(selector);
      if (!el) return;
      // SVG elements (the annotation hit areas) have no click(); a bubbling event
      // reaches the same React handler.
      if (el instanceof HTMLElement) el.click();
      else el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    },
    fill: (selector, value) => {
      const el = document.querySelector<HTMLInputElement>(selector);
      if (!el) return;
      if (value === CERTIFICATE_PASSWORD) value = plan.certificatePassword;
      // React tracks the value itself; the native setter plus an input event is
      // what makes it see the change.
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set?.call(el, value);
      el.dispatchEvent(new Event('input', { bubbles: true }));
    },
    press: (init: KeyInit) => {
      const target = document.activeElement ?? document.body;
      target.dispatchEvent(new KeyboardEvent('keydown', { ...init, bubbles: true, cancelable: true }));
      target.dispatchEvent(new KeyboardEvent('keyup', { ...init, bubbles: true, cancelable: true }));
    },
    openPanel: () => document.querySelector('[data-panel-open]')?.getAttribute('data-panel-open') ?? null,
    recorded: () => seen,
    changes: () => mutations,
    reset: () => { seen = []; mutations = 0; },
    settle: () => sleep(400),
    mac: /Mac/i.test(navigator.platform),
    faults: () => (window as unknown as { __pjFaultWatch?: { snapshot(): WalkFault[] } }).__pjFaultWatch?.snapshot() ?? [],
  };

  let result: WalkResult;
  if (!(await waitForDocument(60_000))) {
    result = { gap: 'no document opened within 60 s, so no control could be driven', build: 'ui-walk', marker: WALK_MARKER, walked: [], not_probed: [] };
  } else {
    plan = readPlan(String(await real('plugin:ui-walk|targets')));
    result = await runWalk(plan.targets, env);
  }
  await real('plugin:ui-walk|report', { json: JSON.stringify(result) });
}
