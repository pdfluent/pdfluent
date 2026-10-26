// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary. The PDFluent application is free to use,
// including for commercial purposes. Redistribution, or extraction or reuse
// of its components (including the embedded PDF engine), requires a licence.
// See https://pdfluent.com/license for terms.

// #471: the ui-walk build is measured and discarded. Four conditions are pinned
// here: the feature is absent from every release profile and bundle, the publish
// path refuses a walk build, the walker finds / activates / observes controls
// honestly, and the probe set says what it did not cover.
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { acceptResult, readSigner } from '../scripts/quality/suite/ui_walk_run.mjs';
import { bundleHasWalker, defaultFeatures, sourceProblems, turnsOnWalk } from '../scripts/ci/ui-walk-fenced.mjs';
import { isWalkBuildName, WALK_MARKER } from '../scripts/lib/walk-build.mjs';
import { dialogAnswer } from '../src/viewer/uiWalk/boot';
import { AFTER, BEFORE, LAST, NEEDS, PANEL_FLOWS, UNDO_AFTER, parseShortcut, runWalk, selectorFor, WALK_MARKER as PAGE_MARKER, type KeyInit, type WalkEnv, type WalkTarget } from '../src/viewer/uiWalk/walker';

const ROOT = resolve(import.meta.dirname, '..');
const made: string[] = [];
const scratch = (): string => { const d = mkdtempSync(join(tmpdir(), 'ui-walk-')); made.push(d); return d; };
afterAll(() => { for (const d of made) rmSync(d, { recursive: true, force: true }); });

function fakeRoot(files: Record<string, string>): string {
  const root = scratch();
  const base: Record<string, string> = {
    'src-tauri/Cargo.toml': '[features]\ndefault = ["custom-protocol", "updater"]\nui-walk = []\n',
    'package.json': '{"scripts":{"build":"vite build"}}',
  };
  for (const [rel, text] of Object.entries({ ...base, ...files })) {
    mkdirSync(join(root, rel, '..'), { recursive: true });
    writeFileSync(join(root, rel), text);
  }
  return root;
}

describe('the walk build never reaches what ships (#471 condition 1)', () => {
  it('this checkout is clean', () => {
    expect(sourceProblems(ROOT)).toEqual([]);
  });
  it('ui-walk is a declared feature and not a default one', () => {
    const cargo = readFileSync(join(ROOT, 'src-tauri/Cargo.toml'), 'utf8');
    expect(cargo).toMatch(/^ui-walk\s*=/m);
    expect(defaultFeatures(cargo)).not.toContain('ui-walk');
  });
  it('fails when the feature becomes a default', () => {
    const root = fakeRoot({ 'src-tauri/Cargo.toml': '[features]\ndefault = ["custom-protocol", "ui-walk"]\nui-walk = []\n' });
    expect(sourceProblems(root).join('\n')).toContain('default features');
  });
  it('fails when a release pipeline builds with it', () => {
    const root = fakeRoot({ '.github/workflows/release.yml': 'run: npx tauri build --features ui-walk\n' });
    expect(sourceProblems(root).join('\n')).toContain('release.yml');
  });
  it('fails when the frontend flag is set outside the walk build', () => {
    const root = fakeRoot({ 'scripts/ship.sh': 'VITE_UI_WALK=1 npm run build\n' });
    expect(sourceProblems(root).join('\n')).toContain('scripts/ship.sh');
  });
  it('recognises the ways of turning it on', () => {
    expect(turnsOnWalk('cargo build --features ui-walk')).toBe(true);
    expect(turnsOnWalk('VITE_UI_WALK=1 vite build')).toBe(true);
    expect(turnsOnWalk('cargo build --release')).toBe(false);
  });
  it('the host side is compiled only with the feature', () => {
    const lib = readFileSync(join(ROOT, 'src-tauri/src/lib.rs'), 'utf8');
    expect(lib).toMatch(/#\[cfg\(feature = "ui-walk"\)\]\s*mod ui_walk;/);
    expect(lib).toMatch(/#\[cfg\(feature = "ui-walk"\)\]\s*let builder = builder\.plugin\(ui_walk::plugin\(\)\);/);
  });
  it('the page side is behind the build-time flag, so a shipped bundle drops it', () => {
    const main = readFileSync(join(ROOT, 'src/main.tsx'), 'utf8');
    expect(main).toMatch(/import\.meta\.env\.VITE_UI_WALK === "1"[\s\S]*import\("\.\/viewer\/uiWalk\/boot"\)/);
  });
  it('a bundle with the marker is a walk bundle, one without is not', () => {
    const walk = scratch();
    writeFileSync(join(walk, 'index.js'), `console.log("${WALK_MARKER}")`);
    const shipped = scratch();
    writeFileSync(join(shipped, 'index.js'), 'console.log("hello")');
    expect(bundleHasWalker(walk)).toBe(true);
    expect(bundleHasWalker(shipped)).toBe(false);
    expect(PAGE_MARKER).toBe(WALK_MARKER);
  });
});

describe('the publish path refuses a walk build (#471 condition 2)', () => {
  it('names that identify a walk build', () => {
    expect(isWalkBuildName('/x/PDFluent-ui-walk-ab12cd34ef56.dmg')).toBe(true);
    expect(isWalkBuildName('PDFluent_UIWalk.msi')).toBe(true);
    expect(isWalkBuildName('PDFluent_1.1.0_universal.dmg')).toBe(false);
  });
  it('publish-artifact exits 1 before anything is uploaded, on any platform', () => {
    for (const platform of ['darwin-aarch64', 'linux-x86_64']) {
      const r = spawnSync(process.execPath, [
        join(ROOT, 'scripts/publish-artifact.mjs'), '--version', '9.9.9', '--platform', platform,
        '--filename', 'PDFluent-ui-walk-abc.dmg', '--size', '1', '--dry-run',
      ], { encoding: 'utf8' });
      expect(r.status, `${platform}: ${r.stdout}${r.stderr}`).toBe(1);
      expect(`${r.stdout}${r.stderr}`).toContain('ui-walk build');
    }
  });
});

describe('the in-page walker (#471)', () => {
  const target = (kind: string, control: string, commands: string[] = []): WalkTarget =>
    ({ id: `${kind}:${control}`, kind, control, state: 'wired', commands, surface: 'x' });

  interface Spec { disabled?: boolean; calls?: string[]; mutates?: boolean; opens?: string[] }

  /** A page that has the given selectors; clicking one records its calls and opens others. */
  function page(present: Record<string, Spec>, mac = true): WalkEnv & { clicked: string[]; keys: KeyInit[]; filled: Array<[string, string]> } {
    let seen: string[] = [];
    let muts = 0;
    const live = new Set(Object.keys(present));
    const clicked: string[] = [];
    const keys: KeyInit[] = [];
    const filled: Array<[string, string]> = [];
    return {
      clicked, keys, filled, mac,
      find: (sel) => (live.has(sel) ? { disabled: !!present[sel]?.disabled } : null),
      click: (sel) => {
        clicked.push(sel);
        const spec = present[sel];
        if (!spec) return;
        seen = [...(spec.calls ?? [])];
        if (spec.mutates) muts += 1;
        for (const o of spec.opens ?? []) live.add(o);
      },
      press: (k) => { keys.push(k); },
      fill: (sel, value) => { filled.push([sel, value]); },
      recorded: () => seen,
      changes: () => muts,
      reset: () => { seen = []; muts = 0; },
      settle: async () => {},
    };
  }

  it('finds a button by its test id, activates it, and reports what it reached', async () => {
    const env = page({ '[data-testid="zoom-in-btn"]': { calls: ['get_page', 'get_page'] } });
    const r = await runWalk([target('button', 'zoom-in-btn')], env);
    expect(r.walked).toEqual([{ id: 'button:zoom-in-btn', found: true, activated: true, reached: ['get_page'] }]);
    expect(r.build).toBe('ui-walk');
    expect(r.marker).toBe(WALK_MARKER);
  });

  it('reports a control that is not on screen as not found', async () => {
    const r = await runWalk([target('button', 'gone-btn')], page({}));
    expect(r.walked).toEqual([{ id: 'button:gone-btn', found: false, activated: false, reached: [] }]);
  });

  it('does not count a disabled control, or a click that changed nothing, as activated', async () => {
    const r = await runWalk(
      [target('button', 'off-btn'), target('button', 'dead-btn')],
      page({ '[data-testid="off-btn"]': { disabled: true }, '[data-testid="dead-btn"]': {} }),
    );
    expect(r.walked.map((w) => [w.found, w.activated])).toEqual([[true, false], [true, false]]);
  });

  it('a control with a visible effect and no commands is walked on that effect alone', async () => {
    const r = await runWalk([target('rail-tool', 'hand')], page({ '[data-rail-tool="hand"]': { mutates: true } }));
    expect(r.walked[0]).toMatchObject({ id: 'rail-tool:hand', found: true, activated: true });
  });

  it('says so, and does not pass it, when the registered commands sit behind a second step', async () => {
    const env = page({ '[data-testid="save-btn"]': { calls: ['plugin:dialog|save'], mutates: true } });
    const r = await runWalk([target('button', 'save-btn', ['save_pdf'])], env);
    expect(r.walked).toEqual([]);
    expect(r.not_probed[0].reason).toContain('second step');
    expect(r.not_probed[0].reason).toContain('save_pdf');
  });

  it('walks a mode tab and a panel opened from the tools list', async () => {
    const env = page({
      '[data-mode-tab="edit"]': { mutates: true, opens: ['[data-panel-open="edit"]'] },
      '[data-mode-tab="tools"]': { mutates: true, opens: ['[data-panel-target]', '[data-panel-target="split"]'] },
      '[data-panel-target="split"]': { mutates: true, opens: ['[data-panel-open="split"]'] },
    });
    const r = await runWalk([target('mode-tab', 'edit'), target('panel', 'split')], env);
    expect(r.walked.map((w) => [w.id, w.activated])).toEqual([['mode-tab:edit', true], ['panel:split', true]]);
    expect(env.clicked).toEqual(['[data-mode-tab="edit"]', '[data-mode-tab="tools"]', '[data-panel-target="split"]']);
  });

  it('fails a panel that did not open', async () => {
    const env = page({ '[data-panel-target]': {}, '[data-panel-target="merge"]': { mutates: true } });
    const r = await runWalk([target('panel', 'merge')], env);
    expect(r.walked[0]).toMatchObject({ found: true, activated: false });
  });

  it('opens the command palette before it looks for a command', async () => {
    const env = page({ '[data-command-id="zoom-in"]': { mutates: true } });
    const r = await runWalk([target('palette', 'zoom-in')], env);
    expect(env.keys[0]).toMatchObject({ key: 'k', metaKey: true });
    expect(r.walked[0]).toMatchObject({ id: 'palette:zoom-in', activated: true });
  });

  it('presses the key an advertised shortcut names, for this platform', async () => {
    const mac = page({}, true);
    await runWalk([target('shortcut', 'zoomIn (⌘= / Ctrl+=)')], mac);
    expect(mac.keys[0]).toEqual({ key: '=', metaKey: true });
    const win = page({}, false);
    await runWalk([target('shortcut', 'zoomIn (⌘= / Ctrl+=)')], win);
    expect(win.keys[0]).toEqual({ key: '=', ctrlKey: true });
  });

  it('parses the shortcut spellings the register uses', () => {
    expect(parseShortcut('save (⌘S / Ctrl+S)', true)).toEqual({ key: 'S', metaKey: true });
    expect(parseShortcut('zoomOut (⌘− / Ctrl+−)', false)).toEqual({ key: '-', ctrlKey: true });
    expect(parseShortcut('toggleFullscreen (F11 / ⌘⇧F)', true)).toEqual({ key: 'F', metaKey: true, shiftKey: true });
    expect(parseShortcut('prevNextPage (← / →)', true)).toEqual({ key: 'ArrowLeft' });
    expect(parseShortcut('closeDialog (Escape)', true)).toEqual({ key: 'Escape' });
    expect(parseShortcut('fitZoom (⌘/Ctrl + Scroll)', true)).toBeNull();
  });

  it('says it cannot send a scroll wheel instead of inventing a result', async () => {
    const r = await runWalk([target('shortcut', 'fitZoom (⌘/Ctrl + Scroll)')], page({}));
    expect(r.walked).toEqual([]);
    expect(r.not_probed[0].reason).toContain('single key press');
  });

  it('every target ends up walked or not probed, never dropped', async () => {
    const targets = [target('button', 'a-btn'), target('tile', 'toolbar.x'), target('shortcut', 'fitZoom (⌘/Ctrl + Scroll)'), target('mystery', 'm')];
    const r = await runWalk(targets, page({}));
    expect(r.walked.length + r.not_probed.length).toBe(targets.length);
    expect(selectorFor(targets[3])).toBeNull();
    expect(r.not_probed.find((n) => n.id === 'mystery:m')!.reason).toContain('no probe for mystery');
  });

  it('answers native dialogs with canned values', () => {
    const plan = { targets: [], scratch: '/s', document: '/d.pdf' };
    expect(dialogAnswer('plugin:dialog|save', plan, 3)).toBe('/s/walk-out-3.pdf');
    expect(dialogAnswer('plugin:dialog|open', plan, 0)).toBe('/d.pdf');
    expect(dialogAnswer('plugin:dialog|ask', plan, 0)).toBe(true);
    expect(dialogAnswer('save_pdf', plan, 0)).toBeUndefined();
  });
});

describe('panel flows and the tile opener (#471)', () => {
  const target = (kind: string, control: string, commands: string[] = []): WalkTarget =>
    ({ id: `${kind}:${control}`, kind, control, state: 'wired', commands, surface: 'x' });
  function flowPage(present: Record<string, { calls?: string[]; opens?: string[]; disabled?: boolean }>) {
    let seen: string[] = [];
    let muts = 0;
    const live = new Set(Object.keys(present));
    const clicked: string[] = [];
    const filled: Array<[string, string]> = [];
    const env: WalkEnv = {
      mac: true,
      find: (sel) => (live.has(sel) ? { disabled: !!present[sel]?.disabled } : null),
      click: (sel) => { clicked.push(sel); const sp = present[sel]; if (!sp) return; seen.push(...(sp.calls ?? [])); muts += 1; for (const o of sp.opens ?? []) live.add(o); },
      press: () => {},
      fill: (sel, v) => { filled.push([sel, v]); },
      openPanel: () => (live.has('[data-panel-open="compress"]') ? 'compress' : null),
      recorded: () => seen, changes: () => muts, reset: () => { seen = []; muts = 0; }, settle: async () => {},
    };
    return { env, clicked, filled };
  }

  it('walks a panel to the command the register names: open it, type, click the action', async () => {
    const { env, clicked, filled } = flowPage({
      '[data-panel-target]': {}, 
      '[data-panel-target="watermark"]': { opens: ['[data-panel-open="watermark"]', '[data-panel-input="watermark-text"]', '[data-panel-action="watermark"]'] },
      '[data-panel-input="watermark-text"]': {},
      '[data-panel-action="watermark"]': { calls: ['add_watermark'] },
    });
    const r = await runWalk([target('panel', 'watermark', ['add_watermark'])], env);
    expect(filled).toEqual([['[data-panel-input="watermark-text"]', 'ui walk']]);
    expect(clicked).toContain('[data-panel-action="watermark"]');
    expect(r.walked[0]).toMatchObject({ id: 'panel:watermark', activated: true });
    expect(r.walked[0].reached).toContain('add_watermark');
  });

  it('a flow that stops says where, instead of passing or failing the panel', async () => {
    const { env } = flowPage({
      '[data-panel-target]': {},
      '[data-panel-target="compress"]': { opens: ['[data-panel-open="compress"]'] },
    });
    const r = await runWalk([target('panel', 'compress', ['compress_pdf'])], env);
    expect(r.walked).toEqual([]);
    expect(r.not_probed[0].reason).toContain('[data-panel-action="compress"] is not on screen');
  });

  it('every panel flow names handles the shell actually carries', () => {
    const shell = readFileSync(join(ROOT, 'src/viewer/v3/EditorV3Shell.tsx'), 'utf8');
    for (const steps of Object.values(PANEL_FLOWS)) {
      for (const step of steps) {
        const needle = 'click' in step ? `data-panel-action="${step.click}"` : `data-panel-input="${step.fill}"`;
        // A row component forwards its action prop to the attribute.
        const viaProp = 'click' in step ? ` action="${step.click}"` : null;
        expect(shell.includes(needle) || (viaProp !== null && shell.includes(viaProp)), needle).toBe(true);
      }
    }
  });

  it('a tile opens the All-tools modal first when it is closed', async () => {
    const { env, clicked } = flowPage({
      '[data-testid="all-tools-btn"]': { opens: ['[data-testid^="all-tools-toolbar."]', '[data-testid="all-tools-toolbar.compress"]'] },
      '[data-testid="all-tools-toolbar.compress"]': { opens: ['[data-panel-open="compress"]', '[data-panel-action="compress"]'] },
      '[data-panel-action="compress"]': { calls: ['compress_pdf'] },
    });
    const r = await runWalk([target('tile', 'toolbar.compress', ['compress_pdf'])], env);
    expect(clicked[0]).toBe('[data-testid="all-tools-btn"]');
    expect(clicked).toContain('[data-panel-action="compress"]');
    expect(r.walked[0]).toMatchObject({ id: 'tile:toolbar.compress', activated: true });
    expect(r.walked[0].reached).toContain('compress_pdf');
  });

  it('a folder picker gets the scratch folder, a file picker the walk document', () => {
    const plan = { targets: [], scratch: '/s', document: '/d.pdf' };
    expect(dialogAnswer('plugin:dialog|open', plan, 0, { options: { directory: true } })).toBe('/s');
    expect(dialogAnswer('plugin:dialog|open', plan, 0, { options: {} })).toBe('/d.pdf');
  });
});

describe('second steps for buttons, tiles and palette entries (#471)', () => {
  const target = (kind: string, control: string, commands: string[] = []): WalkTarget =>
    ({ id: `${kind}:${control}`, kind, control, state: 'wired', commands, surface: 'x' });

  /** A small page with state: selecting a page tile shows its selected mark; the palette lists commands. */
  function organizePage() {
    const live = new Set<string>(['[data-testid="command-palette"]-closed']);
    let seen: string[] = [];
    let muts = 0;
    const clicked: string[] = [];
    const keys: KeyInit[] = [];
    const calls: Record<string, string[]> = {
      '[data-testid="batch-rotate-right-btn"]': ['rotate_pages'],
      '[data-testid="batch-delete-btn"]': ['delete_pages'],
    };
    const env: WalkEnv = {
      mac: true,
      find: (sel) => {
        if (sel === '[data-testid="command-palette"]') return live.has('palette') ? { disabled: false } : null;
        if (sel === '[data-command-id="mode-organize"]') return live.has('palette') ? { disabled: false } : null;
        if (sel === '[data-testid="organize-page-tile-0"]' || sel === '[data-testid="organize-selected-0"]') {
          if (sel.includes('selected')) return live.has('selected') ? { disabled: false } : null;
          return live.has('organize') ? { disabled: false } : null;
        }
        if (sel.startsWith('[data-testid="batch-')) return live.has('selected') ? { disabled: false } : null;
        return null;
      },
      click: (sel) => {
        clicked.push(sel);
        muts += 1;
        if (sel === '[data-command-id="mode-organize"]') { live.add('organize'); live.delete('palette'); }
        if (sel === '[data-testid="organize-page-tile-0"]') live.add('selected');
        seen.push(...(calls[sel] ?? []));
      },
      press: (k) => { keys.push(k); if (k.key === 'k') live.add('palette'); },
      fill: () => {},
      recorded: () => seen, changes: () => muts, reset: () => { seen = []; muts = 0; }, settle: async () => {},
    };
    return { env, clicked, keys };
  }

  it('selects a page in the organise view before it presses a batch button', async () => {
    const { env, clicked } = organizePage();
    const r = await runWalk([target('button', 'batch-rotate-right-btn', ['rotate_pages'])], env);
    expect(clicked).toEqual([
      '[data-command-id="mode-organize"]',
      '[data-testid="organize-page-tile-0"]',
      '[data-testid="batch-rotate-right-btn"]',
    ]);
    expect(r.walked[0]).toMatchObject({ id: 'button:batch-rotate-right-btn', activated: true, reached: ['rotate_pages'] });
  });

  it('does not toggle a selection that is already made', async () => {
    const { env, clicked } = organizePage();
    await runWalk([target('button', 'batch-rotate-right-btn', ['rotate_pages']), target('button', 'batch-delete-btn', ['delete_pages'])], env);
    expect(clicked.filter((c) => c === '[data-testid="organize-page-tile-0"]')).toHaveLength(1);
  });

  it('takes a delete back, so the next control still has its pages', async () => {
    const { env, keys } = organizePage();
    await runWalk([target('button', 'batch-delete-btn', ['delete_pages'])], env);
    expect(keys.some((k) => k.key === 'z' && k.metaKey)).toBe(true);
    expect(UNDO_AFTER.has('button:batch-delete-btn')).toBe(true);
  });

  it('a setup step that cannot be done is said, and the control is not failed for it', async () => {
    const empty: WalkEnv = { mac: true, find: () => null, click: () => {}, press: () => {}, fill: () => {}, recorded: () => [], changes: () => 0, reset: () => {}, settle: async () => {} };
    const r = await runWalk([target('button', 'organize-combine-btn', ['append_pdf'])], empty);
    expect(r.walked).toEqual([]);
    expect(r.not_probed[0].reason).toContain('setting up this control stopped');
  });

  it('names what a control needs that the walk does not have, instead of walking it wrong', async () => {
    const r = await runWalk([target('panel', 'tools', ['save_pdf'])], organizePage().env);
    expect(r.walked).toEqual([]);
    expect(r.not_probed.map((n) => n.reason)).toEqual([NEEDS['panel:tools']]);
    expect(Object.keys(NEEDS)).toEqual(['panel:tools']);
  });

  it('every handle a second step names exists in the shipped markup or the components', () => {
    const files = ['src/viewer/v3/EditorV3Shell.tsx', 'src/viewer/components/OrganizeGrid.tsx', 'src/viewer/components/CommandPalette.tsx', 'src/viewer/components/AnnotationOverlay.tsx']
      .map((f) => readFileSync(join(ROOT, f), 'utf8')).join('\n');
    const all = [...Object.values(BEFORE), ...Object.values(AFTER)].flat();
    for (const step of all) {
      if ('click' in step) {
        const m = /data-testid="([a-z0-9-]+)"|data-panel-action="([a-z-]+)"|data-rail-tool="([a-z]+)"/.exec(step.click);
        expect(m, step.click).not.toBeNull();
        // Per-page ids are templates in the markup (organize-page-tile-${i}).
        const name = (m![1] ?? m![2] ?? m![3]).replace(/-\d+$/, '');
        expect(files, `${step.click}`).toContain(name);
      }
    }
  });

  it('the palette commands the steps run exist', () => {
    const commands = readFileSync(join(ROOT, 'src/viewer/hooks/useCommands.ts'), 'utf8');
    for (const step of [...Object.values(BEFORE), ...Object.values(AFTER)].flat()) {
      if ('palette' in step) expect(commands).toContain(`id: '${step.palette}'`);
    }
  });
});

describe('the controls that need a selection or a certificate (#471)', () => {
  const target = (kind: string, control: string, commands: string[] = []): WalkTarget =>
    ({ id: `${kind}:${control}`, kind, control, state: 'wired', commands, surface: 'x' });

  it('offers the checked-in test certificate to a .p12 picker, and the document to a PDF picker', () => {
    const plan = { targets: [], scratch: '/s', document: '/d.pdf', certificate: '/c/signer-test.p12', certificatePassword: 'x' };
    expect(dialogAnswer('plugin:dialog|open', plan, 0, { options: { filters: [{ name: 'PKCS#12', extensions: ['p12', 'pfx'] }] } })).toBe('/c/signer-test.p12');
    expect(dialogAnswer('plugin:dialog|open', plan, 0, { options: { filters: [{ name: 'PDF', extensions: ['pdf'] }] } })).toBe('/d.pdf');
  });

  it('the suite reads the certificate and its password from the fixture, not from code', () => {
    const signer = readSigner(ROOT);
    expect(signer.certificate.endsWith('signer-test.p12')).toBe(true);
    expect(signer.password.length).toBeGreaterThan(0);
    expect(readFileSync(signer.certificate).length).toBeGreaterThan(1000);
  });

  it('the walk source never holds the password: it holds a token the page fills from the plan', () => {
    const { password } = readSigner(ROOT);
    for (const f of ['src/viewer/uiWalk/walker.ts', 'src/viewer/uiWalk/boot.ts', 'scripts/quality/suite/ui_walk_run.mjs']) {
      expect(readFileSync(join(ROOT, f), 'utf8'), f).not.toContain(password);
    }
  });

  it('selects the image before it replaces it, and the text box before it saves it', async () => {
    const clicks: string[] = [];
    const live = new Set<string>(['[data-panel-open="edit"]', '[data-mode-tab="edit"]']);
    const env: WalkEnv = {
      mac: true,
      find: (sel) => (live.has(sel) ? { disabled: false } : null),
      click: (sel) => {
        clicks.push(sel);
        if (sel.includes('data-annotation-type="stamp"')) live.add('[data-testid="replace-image-btn"]');
        if (sel.includes('data-annotation-type="freetext"')) live.add('[data-testid="edit-text-box-btn"]');
        if (sel === '[data-testid="edit-text-box-btn"]') live.add('[data-testid="text-box-save"]');
      },
      press: () => {}, fill: () => {}, recorded: () => ['replace_annotation_image'], changes: () => 1, reset: () => {}, settle: async () => {},
    };
    live.add('[data-testid="annotation-marker"][data-annotation-type="stamp"]');
    live.add('[data-testid="annotation-marker"][data-annotation-type="freetext"]');
    const r = await runWalk([
      target('button', 'replace-image-btn', ['replace_annotation_image']),
      target('button', 'text-box-save', ['replace_annotation_image']),
    ], env);
    expect(clicks[0]).toContain('data-annotation-type="stamp"');
    expect(clicks).toContain('[data-testid="edit-text-box-btn"]');
    expect(r.walked.map((w) => w.id)).toEqual(['button:replace-image-btn', 'button:text-box-save']);
  });

  it('signs last, so the document every other control used is still the open one', async () => {
    const order: string[] = [];
    const env: WalkEnv = {
      mac: true, find: () => null, click: () => {}, press: () => {}, fill: () => {}, recorded: () => [], changes: () => 0, reset: () => {}, settle: async () => {},
    };
    const r = await runWalk([target('button', 'sign-with-certificate', ['sign_pdf']), target('button', 'a-btn'), target('button', 'b-btn')], env);
    const seen = [...r.walked.map((w) => w.id), ...r.not_probed.map((n) => n.id)];
    expect(seen.length).toBe(3);
    void order;
    expect(LAST.has('button:sign-with-certificate')).toBe(true);
  });

  it('the controls these steps press exist in the shipped markup', () => {
    const shell = readFileSync(join(ROOT, 'src/viewer/v3/EditorV3Shell.tsx'), 'utf8');
    for (const id of ['sign-cert-pick', 'sign-cert-password', 'replace-image-btn', 'edit-text-box-btn', 'text-box-save']) {
      expect(shell, id).toContain(`data-testid="${id}"`);
    }
    expect(readFileSync(join(ROOT, 'src/viewer/components/AnnotationOverlay.tsx'), 'utf8')).toContain('data-annotation-type={t}');
  });
});

describe('the macOS walk workflow cannot go quiet (#730)', () => {
  const wf = readFileSync(join(ROOT, '.github/workflows/ui-walk.yml'), 'utf8');
  it('says it is waiting for the runner before any runner picks it up', () => {
    expect(wf).toMatch(/announce:[\s\S]*Waiting for the macOS runner/);
  });
  it('the verdict runs whatever happened to the walk and fails unless it succeeded', () => {
    const verdict = wf.slice(wf.indexOf('\n  verdict:'));
    expect(verdict).toMatch(/needs: \[walk, walk-windows\]/);
    expect(verdict).toMatch(/if: \$\{\{ always\(\) \}\}/);
    expect(verdict).toContain('!= "success"');
    expect(verdict).toContain('exit $bad');
  });
  it('builds the walk build of this commit, and never publishes it', () => {
    expect(wf).toContain('scripts/build-ui-walk.sh');
    expect(wf).not.toMatch(/run:.*publish-artifact\.mjs/);
    expect(wf).not.toMatch(/continue-on-error\s*:\s*true/);
  });
});

describe('the walker finds controls by handles the shipped markup carries (#471)', () => {
  const shell = readFileSync(join(ROOT, 'src/viewer/v3/EditorV3Shell.tsx'), 'utf8');
  const palette = readFileSync(join(ROOT, 'src/viewer/components/CommandPalette.tsx'), 'utf8');
  it.each([
    ['mode tabs', shell, 'data-mode-tab={tab.id}'],
    ['rail tools', shell, 'data-rail-tool={tool}'],
    ['the open panel', shell, 'data-panel-open={panel}'],
    ['the tools list rows', shell, 'data-panel-target={target}'],
    ['palette entries', palette, 'data-command-id={cmd.id}'],
  ])('%s', (_what, source, needle) => {
    expect(source).toContain(needle);
  });
  it('they are inert attributes: no handler, no style', () => {
    expect(shell).not.toMatch(/data-(mode-tab|rail-tool|panel-open|panel-target)=\{[^}]*=>/);
  });
});

describe('the plugin permission is explicit and only in the walk build (#471)', () => {
  const buildRs = readFileSync(join(ROOT, 'src-tauri/build.rs'), 'utf8');
  const walkConf = JSON.parse(readFileSync(join(ROOT, 'src-tauri/tauri.ui-walk.conf.json'), 'utf8')) as {
    app: { security: { capabilities: Array<string | { identifier: string; permissions: string[] }> } };
  };
  it('the permission exists only when the feature is on', () => {
    expect(buildRs).toContain('CARGO_FEATURE_UI_WALK');
    expect(buildRs).toMatch(/is_none\(\)\s*\{\s*return attributes;/);
    expect(buildRs).toContain('.commands(&["targets", "report"])');
  });
  it('only the walk build config grants it to a window', () => {
    const grants = walkConf.app.security.capabilities.filter((c) => typeof c !== 'string');
    expect(grants).toHaveLength(1);
    expect(grants[0]).toMatchObject({ identifier: 'ui-walk', permissions: ['ui-walk:default'] });
    for (const shipped of ['src-tauri/capabilities/main.json', 'src-tauri/tauri.conf.json', 'src-tauri/tauri.ci.conf.json']) {
      expect(readFileSync(join(ROOT, shipped), 'utf8'), shipped).not.toContain('ui-walk');
    }
  });
  it('the plugin and the permission agree on the name and the commands', () => {
    const rs = readFileSync(join(ROOT, 'src-tauri/src/ui_walk.rs'), 'utf8');
    expect(rs).toContain('Builder::new("ui-walk")');
    expect(rs).toContain('generate_handler![targets, report]');
  });
});

describe('the result a walk build wrote is accepted only as a ui-walk result (#471)', () => {
  const put = (obj: unknown): { file: string; work: string } => {
    const work = scratch();
    const file = join(work, 'result.json');
    writeFileSync(file, typeof obj === 'string' ? obj : JSON.stringify(obj));
    return { file, work };
  };
  const good = { build: 'ui-walk', marker: WALK_MARKER, gap: '', walked: [], not_probed: [] };

  it('stamps the commit the suite was told, and writes the probe the judge reads', () => {
    const { file, work } = put(good);
    const r = acceptResult(file, { work, builtFrom: 'abc1234567890' });
    expect(r.ok).toBe(true);
    const probe = JSON.parse(readFileSync(join(work, 'probes', 'ui_walk.out'), 'utf8'));
    expect(probe.built_from).toBe('abc1234567890');
  });
  it('refuses a result that does not name the ui-walk build', () => {
    const { file, work } = put({ ...good, marker: 'something-else' });
    expect(acceptResult(file, { work, builtFrom: 'abc' })).toMatchObject({ ok: false });
  });
  it('refuses a result that is not JSON', () => {
    const { file, work } = put('not json');
    expect(acceptResult(file, { work, builtFrom: 'abc' })).toMatchObject({ ok: false });
  });
});

describe('the Windows host side (#471)', () => {
  const driver = readFileSync(join(ROOT, 'scripts/quality/suite/drivers/windows.sh'), 'utf8');
  const ps = readFileSync(join(ROOT, 'scripts/quality/suite/drivers/windows_ui_walk.ps1'), 'utf8');
  it('the driver walks only a build it was given, and leaves the probe absent otherwise', () => {
    expect(driver).toContain('UI_WALK_MSI');
    expect(driver).toContain('no ui-walk build was given to this run');
    expect(driver).toContain('ui_walk_run.mjs" --accept');
  });
  it('the host script lays the build out without installing it and finds its process by path', () => {
    expect(ps).toContain('"/a"');
    expect(ps).not.toContain('"/i"');
    expect(ps).toContain("StartsWith($walk, 'OrdinalIgnoreCase')");
    expect(ps).toContain('PDFLUENT_UI_WALK_TARGETS');
    expect(ps).toContain('PDFLUENT_UI_WALK_OUT');
  });
  it('the workflow builds the Windows walk build of the same commit and the verdict covers it', () => {
    const wf = readFileSync(join(ROOT, '.github/workflows/ui-walk.yml'), 'utf8');
    expect(wf).toMatch(/walk-windows:[\s\S]*scripts\/build-ui-walk\.sh/);
    expect(wf).toContain('--platform windows');
  });
});
