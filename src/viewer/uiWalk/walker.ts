// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary. The PDFluent application is free to use,
// including for commercial purposes. Redistribution, or extraction or reuse
// of its components (including the embedded PDF engine), requires a licence.
// See https://pdfluent.com/license for terms.

// The in-page half of the S5 UI walk (#471). Pure: it takes the list of controls
// the register says exist and an environment that can find, activate and observe
// them, and returns the probe scripts/quality/suite/ui_walk.mjs judges. Only the
// ui-walk build ever loads it (src/main.tsx gates the import on VITE_UI_WALK, and
// scripts/ci/ui-walk-fenced.mjs proves the shipped bundle does not contain it).
//
// The probe set starts small on purpose. A kind without a probe is reported as
// not_probed with a reason, never left out and never counted as walked: the judge
// turns that into SKIPPED, SKIPPED into INCOMPLETE, and INCOMPLETE refuses a
// publish. Adding a probe for a kind is how coverage grows.

export const WALK_MARKER = 'pdfluent-ui-walk-build';

export interface WalkTarget {
  id: string;
  kind: string;
  control: string;
  state: string;
  commands: string[];
  surface: string;
}

export interface WalkProbe {
  id: string;
  found: boolean;
  activated: boolean;
  reached: string[];
}

/** An error the page showed or logged (tests/lib/fault-watch.js): an error toast, console.error, uncaught exception, unhandled rejection. */
export interface WalkFault {
  kind: string;
  text: string;
  /** error-toast only: the Tauri command that failed. */
  command?: string;
}

export interface WalkResult {
  gap: string;
  build: 'ui-walk';
  marker: string;
  walked: WalkProbe[];
  not_probed: Array<{ id: string; reason: string }>;
  /**
   * Every fault the page showed or logged during the walk, each with the control
   * that was being walked when it appeared ("(start)": before the first one).
   * Absent when the build could not watch for them; the judge reads that as
   * not measured, never as none.
   */
  faults?: Array<WalkFault & { control: string }>;
}

/** A key press the walk sends to the page. */
export interface KeyInit {
  key: string;
  metaKey?: boolean;
  ctrlKey?: boolean;
  shiftKey?: boolean;
  altKey?: boolean;
}

/** What the walk needs from the page; the boot code supplies the real one. */
export interface WalkEnv {
  /** The control for a selector, or null when it is not on screen. */
  find(selector: string): { disabled: boolean } | null;
  click(selector: string): void;
  press(init: KeyInit): void;
  /** Type a value into an input the way a person would (value plus an input event). */
  fill(selector: string, value: string): void;
  /** Tauri commands invoked since the last reset(), in order. */
  recorded(): string[];
  /** DOM mutations observed since the last reset(). */
  changes(): number;
  reset(): void;
  /** Let the action's consequences happen (IPC round trips, re-render). */
  settle(): Promise<void>;
  /** The panel currently open (its data-panel-open value), if the page can say. */
  openPanel?(): string | null;
  /** True on macOS: shortcuts use the command key, not control. */
  mac: boolean;
  /** Every fault the page has shown or logged so far, oldest first. Absent: the build cannot watch. */
  faults?(): WalkFault[];
}

/**
 * Selector of the control for the kinds that are a plain click on something with
 * a stable handle. Palette entries, panels and shortcuts need more than a click
 * and have their own steps below.
 */
export function selectorFor(target: WalkTarget): string | null {
  switch (target.kind) {
    case 'button': return `[data-testid="${target.control}"]`;
    case 'mode-tab': return `[data-mode-tab="${target.control}"]`;
    case 'rail-tool': return `[data-rail-tool="${target.control}"]`;
    // The tile list of the All-tools modal (AllToolsPanel). The id is the
    // translation key, which the modal also uses in its test id.
    case 'tile': return `[data-testid="all-tools-${target.control}"]`;
    case 'palette': return `[data-command-id="${target.control}"]`;
    default: return null;
  }
}

/** The four panels the top bar's mode tabs open; every other panel opens from the tools list. */
const TAB_PANELS = new Set(['tools', 'edit', 'convert', 'esign']);

/**
 * Read a shortcut's key combination out of its register id, e.g.
 * `zoomIn (⌘= / Ctrl+=)`. Returns null for the ones that are not one key press
 * (a scroll wheel) so they are reported as not probed instead of invented.
 * Where the id lists variants, the one for this platform is used.
 */
export function parseShortcut(control: string, mac: boolean): KeyInit | null {
  const m = /\((.+)\)\s*$/.exec(control);
  if (!m) return null;
  const spec = m[1] ?? '';
  if (/scroll/i.test(spec)) return null;
  const variants = spec.split(' / ').map((v) => v.trim());
  const pick = variants.find((v) => (mac ? /⌘/.test(v) : /Ctrl/.test(v))) ?? variants[0] ?? '';
  const range = /^(\d)\s*–\s*\d$/.exec(pick);
  if (range) return { key: '2' };
  const init: KeyInit = { key: '' };
  let rest = pick;
  if (rest.includes('⌘')) { init.metaKey = true; rest = rest.replace('⌘', ''); }
  if (rest.includes('⇧')) { init.shiftKey = true; rest = rest.replace('⇧', ''); }
  if (rest.includes('⌥')) { init.altKey = true; rest = rest.replace('⌥', ''); }
  for (const mod of ['Ctrl+', 'Shift+', 'Alt+']) {
    if (rest.includes(mod)) {
      if (mod === 'Ctrl+') init.ctrlKey = true;
      if (mod === 'Shift+') init.shiftKey = true;
      if (mod === 'Alt+') init.altKey = true;
      rest = rest.replace(mod, '');
    }
  }
  const keyNames: Record<string, string> = { '←': 'ArrowLeft', '→': 'ArrowRight', '−': '-' };
  init.key = keyNames[rest.trim()] ?? rest.trim();
  return init.key ? init : null;
}

/**
 * Controls whose single click leads to a modal the page cannot answer. The walk
 * build answers native dialogs itself (boot.ts), so this is for what is left:
 * things that block on something other than a dialog. Empty today; named so the
 * next one has a place to go and a reason to write down.
 */
export const NOT_DRIVEN: Readonly<Record<string, string>> = {};

/**
 * The steps that carry a panel from "open" to the command the register names, for
 * the panels whose commands are one short sequence away: nothing but clicks and
 * typed text, with native dialogs answered by the build (boot.ts). Handles are the
 * data-panel-action / data-panel-input attributes the panels carry. A panel not
 * listed here has a second step this walk does not know yet, and says so.
 */
export type FlowStep = { click: string } | { fill: string; value: string };
export const PANEL_FLOWS: Readonly<Record<string, readonly FlowStep[]>> = {
  compress: [{ click: 'compress' }],
  split: [{ click: 'split' }],
  merge: [{ click: 'merge-add' }, { click: 'merge-add' }, { click: 'merge' }],
  watermark: [{ fill: 'watermark-text', value: 'ui walk' }, { click: 'watermark' }],
  pdfa: [{ click: 'pdfa-validate' }, { click: 'pdfa-convert' }],
  metadata: [{ fill: 'metadata-title', value: 'ui walk' }, { click: 'metadata' }],
  invoice: [{ click: 'invoice' }],
  protect: [{ fill: 'encrypt-user-password', value: 'ui-walk-pw' }, { click: 'encrypt' }],
  // Checking a document's signatures needs no certificate; signing does, and the
  // walk carries none, so the register's other command (sign_pdf) is not asked for.
  esign: [{ click: 'verify-signatures' }],
  convert: [{ click: 'ocr-run' }],
};

/**
 * Steps in front of, or after, a control's own activation, keyed by target id.
 * Selectors are explicit CSS: these are the controls that have test ids already.
 *   click   click it, unless \`unless\` is on screen already (selection toggles)
 *   fill    type into an input
 *   palette run a command-palette entry by its id
 *   panel   open a panel the way a person does (mode tab, or the tools list)
 *   undo    take the last edit back, so a destructive step leaves the walk document whole
 */
export type Step =
  | { click: string; unless?: string }
  | { fill: string; value: string }
  | { palette: string }
  | { panel: string }
  | { undo: true };

/** Stands for the test certificate's password; the page replaces it from the plan (boot.ts). */
export const CERTIFICATE_PASSWORD = '@certificate-password';

/** The walk document carries one text box and one placed image on page one (make_ui_walk_doc.py). */
const SELECT_IMAGE: readonly Step[] = [{ panel: 'edit' }, { click: '[data-testid="annotation-marker"][data-annotation-type="stamp"]' }];
const SELECT_TEXT_BOX: readonly Step[] = [{ panel: 'edit' }, { click: '[data-testid="annotation-marker"][data-annotation-type="freetext"]' }];

const ORGANIZE = [{ palette: 'mode-organize' }] as const;
const SELECT_FIRST_PAGE: Step = { click: '[data-testid="organize-page-tile-0"]', unless: '[data-testid="organize-selected-0"]' };

/** What has to be on screen or selected before the control can be activated. */
export const BEFORE: Readonly<Record<string, readonly Step[]>> = {
  'button:annotation-tool-attachment': [{ click: '[data-rail-tool="more"]', unless: '[data-testid="annotation-tool-attachment"]' }],
  'button:batch-rotate-left-btn': [...ORGANIZE, SELECT_FIRST_PAGE],
  'button:batch-rotate-right-btn': [...ORGANIZE, SELECT_FIRST_PAGE],
  'button:batch-delete-btn': [...ORGANIZE, SELECT_FIRST_PAGE],
  'button:organize-insert-before-btn': [...ORGANIZE, SELECT_FIRST_PAGE],
  'button:organize-export-selection-btn': [...ORGANIZE, SELECT_FIRST_PAGE],
  'button:organize-split-range-btn': [...ORGANIZE, SELECT_FIRST_PAGE],
  'button:organize-apply-order-btn': [...ORGANIZE, SELECT_FIRST_PAGE, { click: '[data-testid="organize-move-right-btn"]' }],
  'button:organize-combine-btn': [...ORGANIZE],
  'button:organize-merge-pdf-btn': [...ORGANIZE],
  'button:organize-split-btn': [...ORGANIZE],
  'button:replace-image-btn': SELECT_IMAGE,
  'button:text-box-save': [...SELECT_TEXT_BOX, { click: '[data-testid="edit-text-box-btn"]' }],
  // The certificate is the checked-in test one; the build answers the picker with it.
  'button:sign-with-certificate': [
    { panel: 'esign' },
    { click: '[data-testid="sign-cert-pick"]' },
    { fill: '[data-testid="sign-cert-password"]', value: CERTIFICATE_PASSWORD },
  ],
  'button:validate-pdfa-btn': [{ panel: 'pdfa' }],
  'button:convert-pdfa-btn': [{ panel: 'pdfa' }],
};

/** What carries a tile on to the command it names, once the tile has been clicked. */
export const AFTER: Readonly<Record<string, readonly Step[]>> = {
  'tile:toolbar.rotateLeft': [SELECT_FIRST_PAGE, { click: '[data-testid="batch-rotate-left-btn"]' }],
  'tile:toolbar.rotateRight': [SELECT_FIRST_PAGE, { click: '[data-testid="batch-rotate-right-btn"]' }],
  'tile:toolbar.deletePage': [SELECT_FIRST_PAGE, { click: '[data-testid="batch-delete-btn"]' }, { undo: true }],
  'tile:toolbar.insertPage': [SELECT_FIRST_PAGE, { click: '[data-testid="organize-insert-before-btn"]' }],
  'tile:toolbar.editText': [...SELECT_IMAGE, { click: '[data-testid="replace-image-btn"]' }],
  'panel:edit': [{ click: '[data-testid="annotation-marker"][data-annotation-type="stamp"]' }, { click: '[data-testid="replace-image-btn"]' }],
  'tile:toolbar.readAloud': [{ click: '[data-testid="read-aloud-btn"]' }],
  'tile:toolbar.ocrScan': [{ panel: 'convert' }, { click: '[data-panel-action="ocr-run"]' }],
  'tile:toolbar.signature': [{ panel: 'esign' }, { click: '[data-panel-action="verify-signatures"]' }],
};

export const LAST = new Set(['button:sign-with-certificate']);

/** Destructive buttons: undone once judged, so the next control still has its pages. */
export const UNDO_AFTER = new Set(['button:batch-delete-btn']);

/**
 * Controls the walk cannot drive, with the reason. Not a gap hidden: each is a
 * statement of what the control needs that the walk does not have.
 */
export const NEEDS: Readonly<Record<string, string>> = {
  'panel:tools': 'it is the tools menu; the commands it names are reached from its rows, which are walked as panels and tiles',
};

/** Run a panel's flow; stops at the first handle that is not on screen and says which. */
async function runFlow(panel: string, env: WalkEnv): Promise<string> {
  for (const step of PANEL_FLOWS[panel] ?? []) {
    const sel = 'click' in step ? `[data-panel-action="${step.click}"]` : `[data-panel-input="${step.fill}"]`;
    const el = env.find(sel);
    if (!el) return `the flow for this panel stopped: ${sel} is not on screen`;
    if ('click' in step) {
      if (el.disabled) return `the flow for this panel stopped: ${sel} is disabled`;
      env.click(sel);
    } else {
      env.fill(sel, step.value);
    }
    await env.settle();
  }
  return '';
}

async function openPalette(env: WalkEnv): Promise<void> {
  if (env.find('[data-testid="command-palette"]')) return;
  env.press(env.mac ? { key: 'k', metaKey: true } : { key: 'k', ctrlKey: true });
  await env.settle();
}

async function openPanelStep(id: string, env: WalkEnv): Promise<string> {
  if (env.find(`[data-panel-open="${id}"]`)) return '';
  const tab = TAB_PANELS.has(id);
  if (!tab && !env.find('[data-panel-target]')) { env.click('[data-mode-tab="tools"]'); await env.settle(); }
  const sel = tab ? `[data-mode-tab="${id}"]` : `[data-panel-target="${id}"]`;
  if (!env.find(sel)) return `the ${id} panel has no way in on screen (${sel})`;
  env.click(sel);
  await env.settle();
  return '';
}

/** Run explicit steps; returns why it stopped, or "". */
async function runSteps(steps: readonly Step[], env: WalkEnv): Promise<string> {
  for (const step of steps) {
    if ('palette' in step) {
      await openPalette(env);
      const sel = `[data-command-id="${step.palette}"]`;
      if (!env.find(sel)) return `the palette has no ${step.palette} command on screen`;
      env.click(sel);
    } else if ('panel' in step) {
      const why = await openPanelStep(step.panel, env);
      if (why) return why;
    } else if ('undo' in step) {
      env.press(env.mac ? { key: 'z', metaKey: true } : { key: 'z', ctrlKey: true });
    } else if ('fill' in step) {
      if (!env.find(step.fill)) return `${step.fill} is not on screen`;
      env.fill(step.fill, step.value);
    } else {
      if (step.unless && env.find(step.unless)) continue;
      const el = env.find(step.click);
      if (!el) return `${step.click} is not on screen`;
      if (el.disabled) return `${step.click} is disabled`;
      env.click(step.click);
    }
    await env.settle();
  }
  return '';
}

const sleepless = async (env: WalkEnv): Promise<void> => { await env.settle(); };

function effectOf(env: WalkEnv): boolean {
  return env.recorded().length > 0 || env.changes() > 0;
}

/** Judge what one activation did against what the register says it reaches. */
function outcome(target: WalkTarget, env: WalkEnv): WalkProbe | { id: string; reason: string } {
  const reached = [...new Set(env.recorded())];
  if (!effectOf(env)) return { id: target.id, found: true, activated: false, reached: [] } as WalkProbe;
  if (target.commands.length > 0 && !target.commands.some((c) => reached.includes(c))) {
    // The control is there and did something, but the commands the register names
    // sit behind a second step this walk has no flow for yet. That is a gap in the
    // walk, not a verdict on the control, so it is said as one: reporting it as a
    // failed control would blame the product for the probe, and as a pass it
    // would claim a command nobody saw.
    return {
      id: target.id,
      reason: `activated, and reached ${reached.length ? reached.join(', ') : 'no command'}; the register's ${target.commands.join(', ')} sit behind a second step the walk has no flow for yet`,
    };
  }
  return { id: target.id, found: true, activated: true, reached };
}

async function ensureTools(env: WalkEnv): Promise<void> {
  if (!env.find('[data-panel-target]')) {
    env.click('[data-mode-tab="tools"]');
    await sleepless(env);
  }
}

async function walkOne(target: WalkTarget, env: WalkEnv): Promise<WalkProbe | { id: string; reason: string }> {
  const gone: WalkProbe = { id: target.id, found: false, activated: false, reached: [] };
  const disabled: WalkProbe = { id: target.id, found: true, activated: false, reached: [] };

  const needs = NEEDS[target.id];
  if (needs) return { id: target.id, reason: needs };

  const before = BEFORE[target.id];
  if (before) {
    const why = await runSteps(before, env);
    if (why) return { id: target.id, reason: `setting up this control stopped: ${why}` };
  }

  if (target.kind === 'shortcut') {
    const init = parseShortcut(target.control, env.mac);
    if (!init) return { id: target.id, reason: 'this shortcut is not a single key press (a scroll wheel or a pointer gesture); the walk cannot send it' };
    if (target.control.startsWith('closeDialog')) {
      // Escape closes something; open the palette first so there is something to close.
      env.press(env.mac ? { key: 'k', metaKey: true } : { key: 'k', ctrlKey: true });
      await sleepless(env);
    }
    env.reset();
    env.press(init);
    await sleepless(env);
    return outcome(target, env);
  }

  if (target.kind === 'panel') {
    const tab = TAB_PANELS.has(target.control);
    if (!tab) await ensureTools(env);
    const sel = tab ? `[data-mode-tab="${target.control}"]` : `[data-panel-target="${target.control}"]`;
    const el = env.find(sel);
    if (!el) return gone;
    if (el.disabled) return disabled;
    env.reset();
    env.click(sel);
    await sleepless(env);
    if (!env.find(`[data-panel-open="${target.control}"]`)) {
      return { id: target.id, found: true, activated: false, reached: [] };
    }
    const afterPanel = AFTER[target.id];
    const stopped = afterPanel ? await runSteps(afterPanel, env) : await runFlow(target.control, env);
    const verdict = outcome(target, env);
    if ('reason' in verdict && stopped) return { id: target.id, reason: `${verdict.reason}; ${stopped}` };
    return verdict;
  }

  if (target.kind === 'tile' && !env.find('[data-testid^="all-tools-toolbar."]')) {
    // The tiles live in the All-tools modal; open it the way a person does.
    env.click('[data-testid="all-tools-btn"]');
    await sleepless(env);
  }

  if (target.kind === 'palette') {
    if (!env.find('[data-testid="command-palette"]')) {
      env.press(env.mac ? { key: 'k', metaKey: true } : { key: 'k', ctrlKey: true });
      await sleepless(env);
    }
  }

  const selector = selectorFor(target);
  if (selector === null) return { id: target.id, reason: `the ui-walk build has no probe for ${target.kind} controls yet` };
  const el = env.find(selector);
  if (!el) return gone;
  if (el.disabled) return disabled;
  env.reset();
  env.click(selector);
  await sleepless(env);
  // A tile that opens a panel is walked on through that panel's flow, so the
  // command the register names is reached by the same steps a person would take.
  if (target.kind === 'tile') {
    const panel = env.openPanel?.() ?? null;
    const after = AFTER[target.id];
    const stopped = after ? await runSteps(after, env) : panel ? await runFlow(panel, env) : '';
    const verdict = outcome(target, env);
    if ('reason' in verdict && stopped) return { id: target.id, reason: `${verdict.reason}; ${stopped}` };
    return verdict;
  }
  const done = outcome(target, env);
  if (UNDO_AFTER.has(target.id)) {
    env.press(env.mac ? { key: 'z', metaKey: true } : { key: 'z', ctrlKey: true });
    await sleepless(env);
  }
  return done;
}

export async function runWalk(targets: WalkTarget[], env: WalkEnv): Promise<WalkResult> {
  const walked: WalkProbe[] = [];
  const notProbed: Array<{ id: string; reason: string }> = [];
  // Signing writes a signed copy and the app moves on to it, so it goes last: every
  // other control has already been walked on the document they were written for.
  const ordered = [...targets].sort((a, b) => Number(LAST.has(a.id)) - Number(LAST.has(b.id)));
  // A fault belongs to the control being walked when it appeared. What was
  // already there when the walk began is the app's own start-up.
  const faults: NonNullable<WalkResult['faults']> = [];
  let counted = 0;
  const attribute = (control: string): void => {
    const all = env.faults?.() ?? [];
    for (const f of all.slice(counted)) faults.push({ control, kind: f.kind, text: f.text, ...(f.command ? { command: f.command } : {}) });
    counted = all.length;
  };
  attribute('(start)');
  for (const target of ordered) {
    const denied = NOT_DRIVEN[target.control];
    if (denied) { notProbed.push({ id: target.id, reason: denied }); continue; }
    const r = await walkOne(target, env);
    if ('reason' in r) notProbed.push(r); else walked.push(r);
    // Back to a neutral screen for the next control: close whatever opened.
    env.press({ key: 'Escape' });
    await sleepless(env);
    attribute(target.id);
  }
  return { gap: '', build: 'ui-walk', marker: WALK_MARKER, walked, not_probed: notProbed, ...(env.faults ? { faults } : {}) };
}
