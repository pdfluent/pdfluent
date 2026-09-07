// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary. The PDFluent application is free to use,
// including for commercial purposes. Redistribution, or extraction or reuse
// of its components (including the embedded PDF engine), requires a licence.
// See https://pdfluent.com/license for terms.

/**
 * The UI register's own tests, and the drift gate that makes it binding.
 *
 * Two halves, and both are load-bearing:
 *
 *  - the readers are pinned against the exact shapes that fooled them once
 *    already (a destructured parameter list read as a function body, an
 *    onClick on a plain <button> read as a prop of the component above it),
 *    because a walker that quietly stops matching produces a green register
 *    that measures nothing;
 *  - the committed register, the generated tile set and the gate are compared
 *    against a fresh walk, so drifting from the code fails the build.
 */

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import {
  buildIndex,
  buildRegister,
  gate,
  keyIsHandled,
  liveSurfaces,
  loadExceptions,
  namedFunctions,
  onClickBody,
  propBindings,
  reachableFiles,
  renderGeneratedTs,
  renderMarkdown,
  resolveEffects,
  shortcutLiterals,
  switchCases,
  wiredTiles,
  GENERATED_TS_PATH,
  MIN_AFFORDANCES,
  REGISTER_PATH,
  REPO,
  // eslint-disable-next-line @typescript-eslint/ban-ts-comment
  // @ts-ignore -- plain ESM tool script, deliberately not part of the app build
} from '../scripts/quality/ui-register.mjs';

import { getWiredTools } from '../src/viewer/tools/wiredTools';
import {
  WIRED_TILES_ALL_RUNTIMES,
  WIRED_TILES_TAURI_ONLY,
} from '../src/viewer/tools/wiredTools.generated';

const register = buildRegister();

// ---------------------------------------------------------------------------
// The readers
// ---------------------------------------------------------------------------

describe('ui-register readers', () => {
  it('reads a switch case body, including a bare fall-through', () => {
    const src = `
      function setRailTool(tool) {
        switch (tool) {
          case 'select':
            onAnnotationToolChange(null);
            break;
          case 'hand':
          case 'pan':
            setPassiveRailTool('hand');
            break;
        }
      }`;
    const cases = switchCases(src, 'setRailTool');
    expect(cases.get('select')).toContain('onAnnotationToolChange(null)');
    expect(cases.get('hand')).toContain("setPassiveRailTool('hand')");
    expect(cases.get('pan')).toContain("setPassiveRailTool('hand')");
  });

  it('takes the body after a destructured parameter list, not the parameters', () => {
    // The bug this pins: slicing from the first `{` returns `{ onApplied }`,
    // so every component that destructures its props reads as empty and the
    // panels that call encrypt_pdf and add_watermark come out inert.
    const src = `
      function WatermarkControls({ onApplied }) {
        async function apply() { await invoke('add_watermark', { text }); }
        return null;
      }`;
    expect(namedFunctions(src).get('WatermarkControls')).toContain("invoke('add_watermark'");
  });

  it('reads a handler wrapped in useCallback', () => {
    const src = `const handleRunOcr = useCallback(async (options) => { await invoke('run_paddle_ocr', {}); }, []);`;
    expect(namedFunctions(src).get('handleRunOcr')).toContain("invoke('run_paddle_ocr'");
  });

  it('binds a prop only inside its own component tag', () => {
    // Attributing every on* to the nearest component above it made `onClick`
    // on a plain <button> a binding on that component. Because props resolve
    // by name, that pulled the whole app's click handlers into every panel.
    const src = `
      <Panel onApply={handleApply}>
        <button onClick={handleSomethingElse}>go</button>
      </Panel>`;
    const bound = propBindings(src);
    expect(bound).toEqual([{ component: 'Panel', prop: 'onApply', expr: 'handleApply' }]);
  });

  it('keeps an inline arrow as the bound expression', () => {
    const src = `<Panel onRunOcr={() => { void handleRunOcr({ language: 'en' }); }} />`;
    expect(propBindings(src)[0].expr).toContain('handleRunOcr');
  });

  it('reads a handler passed by reference on a button', () => {
    expect(onClickBody(`<button data-testid="x" onClick={props.onUndo} title="u">`)).toBe('onUndo()');
    expect(onClickBody(`<button onClick={() => setZoom(1)}>`)).toContain('setZoom(1)');
  });

  it('turns an advertised shortcut into the literals a handler must match', () => {
    expect(shortcutLiterals('⌘S / Ctrl+S')).toEqual(['s']);
    expect(shortcutLiterals('← / →')).toEqual(['ArrowLeft', 'ArrowRight']);
    expect(shortcutLiterals('1 – 8')).toEqual(['1', '8']);
    expect(shortcutLiterals('⌘− / Ctrl+−')).toEqual(['-']);
  });

  it('only calls a key handled when something actually reads it', () => {
    expect(keyIsHandled('k', "if (e.key === 'k') openPalette();")).toBe(true);
    expect(keyIsHandled('ArrowLeft', "case 'ArrowLeft':")).toBe(true);
    expect(keyIsHandled('s', "const mode = 'select'; if (e.key === 'k') {}")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Reachability and effects
// ---------------------------------------------------------------------------

describe('ui-register resolution', () => {
  const sources = new Map<string, string>([
    ['src/main.tsx', `import { Shell } from './Shell';\nrender(<Shell />);`],
    ['src/Shell.tsx', `import { helper } from './Dead';\nexport function Shell() { return <Panel onApply={doApply} />; }\nfunction doApply() { void helper(); }`],
    ['src/Dead.tsx', `export function helper() {}\nexport function DeadPanel() { return <div onClick={() => invoke('never_called')} />; }`],
    ['src/Panel.tsx', `export function Panel({ onApply }) { return <button onClick={onApply}>go</button>; }`],
  ]);

  it('calls a module live only when something renders one of its components', () => {
    const live = liveSurfaces(sources, reachableFiles(sources));
    // Dead.tsx is imported for a value, so its module loads; DeadPanel is
    // still rendered by nobody. This is exactly ModeToolbar's situation.
    expect(live.has('src/Shell.tsx')).toBe(true);
    expect(live.has('src/Dead.tsx')).toBe(false);
  });

  it('follows a call into another function in the same file', () => {
    const index = buildIndex(new Map([
      ['src/A.tsx', `function outer() { inner(); }\nfunction inner() { void invoke('do_thing'); }`],
    ]));
    const out = resolveEffects(index, 'src/A.tsx', 'outer();');
    expect(out.commands).toEqual(['do_thing']);
  });

  it('reads a command through a generic type argument', () => {
    const index = buildIndex(new Map([
      ['src/A.tsx', `function outer() { void invoke<{ pages: number[] }>('split_pdf', {}); }`],
    ]));
    expect(resolveEffects(index, 'src/A.tsx', 'outer();').commands).toEqual(['split_pdf']);
  });

  it('marks a handler desktop-only when it bails out without the backend', () => {
    const index = buildIndex(new Map([
      ['src/A.tsx', `function outer() { if (!isTauri) return; doIt(); }`],
    ]));
    expect(resolveEffects(index, 'src/A.tsx', 'outer();').tauri).toBe(true);
  });

  // A menu whose items all call one handler with their own action is the shape
  // that hid four dead controls behind three working ones: reading the whole
  // handler gave "Insert date" credit for the attachment dialog its sibling
  // opens. Each caller is judged on its own branch, and the prelude every
  // branch shares -- closing the menu -- is nobody's effect.
  const dispatcher = () => buildIndex(new Map([
    ['src/A.tsx', `function onPick(action) {
        closeMenu();
        if (action === 'attach') { void invoke('add_attachment_dialog'); return; }
        if (action === 'stamp') { void invoke('add_stamp_annotation'); return; }
        if (action === 'date') { return; }
      }
      function onSwitch(action) {
        switch (action) {
          case 'save': void invoke('save_pdf'); break;
          case 'print': void invoke('print_pdf'); break;
          case 'noop': break;
        }
      }`],
  ]));

  it('credits a dispatched control with its own branch, not its siblings', () => {
    const index = dispatcher();
    expect(resolveEffects(index, 'src/A.tsx', "onPick('attach')").commands).toEqual(['add_attachment_dialog']);
    expect(resolveEffects(index, 'src/A.tsx', "onSwitch('save')").commands).toEqual(['save_pdf']);
  });

  it('leaves a control with an empty branch reaching nothing', () => {
    const index = dispatcher();
    const date = resolveEffects(index, 'src/A.tsx', "onPick('date')");
    expect(date.commands).toEqual([]);
    expect(date.effects).toEqual([]);
    expect(resolveEffects(index, 'src/A.tsx', "onSwitch('noop')").effects).toEqual([]);
  });

  it('leaves a control the dispatcher does not handle reaching nothing', () => {
    const ruler = resolveEffects(dispatcher(), 'src/A.tsx', "onPick('ruler')");
    expect(ruler.commands).toEqual([]);
    expect(ruler.effects).toEqual([]);
  });

  it('carries the action across the prop that hands the handler down', () => {
    // The menu is a child component: the item calls its `onMoreTool` prop and
    // the parent binds the real dispatcher. Losing the action at that hop puts
    // every branch back on every item.
    const index = buildIndex(new Map([
      ['src/A.tsx', `function Shell() { return <Rail onPick={onPick} />; }
        function onPick(action) {
          if (action === 'attach') { void invoke('add_attachment_dialog'); }
          if (action === 'date') { return; }
        }
        function Rail({ onPick }) {
          return <><button onClick={() => onPick('attach')} /><button onClick={() => onPick('date')} /></>;
        }`],
    ]));
    expect(resolveEffects(index, 'src/A.tsx', "onPick('attach')").commands).toEqual(['add_attachment_dialog']);
    expect(resolveEffects(index, 'src/A.tsx', "onPick('date')").effects).toEqual([]);
  });

  it('leaves a handler that does not discriminate on its argument alone', () => {
    const index = buildIndex(new Map([
      ['src/A.tsx', `function openPanel(name) { setPanel(name); void invoke('render_page'); }`],
    ]));
    expect(resolveEffects(index, 'src/A.tsx', "openPanel('edit')").commands).toEqual(['render_page']);
  });
});

// ---------------------------------------------------------------------------
// The gate
// ---------------------------------------------------------------------------

describe('ui-register gate', () => {
  const affordance = (over: Record<string, unknown> = {}) => ({
    kind: 'tile', id: 'toolbar.x', state: 'wired', claim: null, claimBroken: false, ...over,
  });

  it('fails on a gap that is not recorded', () => {
    const problems = gate({ affordances: [affordance({ state: 'NO ACTION' })], deadSurfaces: [] }, { accepted: {} });
    expect(problems.join('\n')).toContain('tile:toolbar.x is NO ACTION');
  });

  it('fails on a recorded gap that has been closed', () => {
    const problems = gate(
      { affordances: [affordance()], deadSurfaces: [] },
      { accepted: { 'tile:toolbar.x': { reason: 'was broken' } } }
    );
    expect(problems.join('\n')).toContain('is wired now');
  });

  it('fails on a claim that points at nothing', () => {
    const problems = gate(
      { affordances: [affordance({ claim: 'panel:ghost', claimBroken: true })], deadSurfaces: [] },
      { accepted: {} }
    );
    expect(problems.join('\n')).toContain("claims fulfilledBy 'panel:ghost'");
  });

  it('fails when the walk finds far fewer affordances than the shell has', () => {
    const problems = gate({ affordances: [], deadSurfaces: [] }, { accepted: {} });
    expect(problems.join('\n')).toContain('an extractor has stopped matching');
  });

  it('fails on a component nothing renders unless it is recorded', () => {
    const dead = [{ file: 'src/viewer/components/Ghost.tsx', components: ['Ghost'], lines: 900 }];
    expect(gate({ affordances: [], deadSurfaces: dead }, { accepted: {} }).join('\n'))
      .toContain('nothing renders it');
  });
});

// ---------------------------------------------------------------------------
// The register as committed
// ---------------------------------------------------------------------------

describe('the committed UI register', () => {
  it('finds the whole shell, not a fraction of it', () => {
    expect(register.affordances.length).toBeGreaterThanOrEqual(MIN_AFFORDANCES);
  });

  it('matches the code it describes', () => {
    expect(readFileSync(`${REPO}/${REGISTER_PATH}`, 'utf8')).toBe(renderMarkdown(register));
  });

  it('has no gap that nobody wrote down', () => {
    expect(gate(register, loadExceptions())).toEqual([]);
  });

  it('generates the tile set the All-tools panel renders', () => {
    expect(readFileSync(`${REPO}/${GENERATED_TS_PATH}`, 'utf8')).toBe(renderGeneratedTs(register));
  });
});

// ---------------------------------------------------------------------------
// The tile set the panel uses
// ---------------------------------------------------------------------------

describe('getWiredTools derives from the register', () => {
  it('offers exactly the tiles whose tool this shell can perform', () => {
    const expected = wiredTiles(register);
    expect([...getWiredTools(false)].sort()).toEqual(expected.both);
    expect([...getWiredTools(true)].sort()).toEqual([...expected.both, ...expected.tauriOnly].sort());
  });

  it('keeps desktop-only tools out of the browser runtime', () => {
    const browser = getWiredTools(false);
    for (const label of WIRED_TILES_TAURI_ONLY) {
      expect(browser.has(label), `browser-test must not offer ${label}`).toBe(false);
    }
  });

  it('offers no tile that the register calls unproven', () => {
    const offered = new Set([...WIRED_TILES_ALL_RUNTIMES, ...WIRED_TILES_TAURI_ONLY]);
    for (const a of register.affordances) {
      if (a.kind !== 'tile' || !offered.has(a.id)) continue;
      expect(a.hasEffect, `${a.id} is offered and reaches nothing`).toBe(true);
    }
  });
});

// ---------------------------------------------------------------------------
// The rail's More menu
// ---------------------------------------------------------------------------

/**
 * Every item in the "More" popover does the thing it is named after.
 *
 * This menu shipped seven items and three of them reached nothing: "Insert
 * date" and "Ruler" fell through `handleMoreTool` without a branch, and
 * "Stamps" opened the All-tools panel with a toast saying stamps were in
 * there, after the stamp tile had been hidden for having no handler. They read
 * as wired because every item calls the same dispatcher, and the register
 * credited each one with everything the dispatcher could do.
 *
 * Red when: an item is added with no branch, an item's branch is emptied, or
 * an item ships without a test id -- the register only sees a button it can
 * name, so an unnamed one is a control nobody is measuring.
 */
describe("the rail's More menu", () => {
  const shell = readFileSync(`${REPO}/src/viewer/v3/EditorV3Shell.tsx`, 'utf8');
  // The open tag, scanned to its own `>`: a naive [^>]* stops inside the
  // arrow function in onClick and drops the test id that follows it.
  const openTag = (from: number): string => {
    let depth = 0;
    for (let i = from; i < shell.length; i++) {
      if (shell[i] === '{') depth++;
      else if (shell[i] === '}') depth--;
      else if (shell[i] === '>' && depth === 0) return shell.slice(from, i + 1);
    }
    return shell.slice(from);
  };
  const items = [...shell.matchAll(/<button className="more-item"/g)].map((m) => openTag(m.index));
  const byId = new Map(register.affordances.map((a: { kind: string; id: string }) => [`${a.kind}:${a.id}`, a]));

  it('renders a menu at all', () => {
    expect(items.length).toBeGreaterThan(0);
  });

  it.each(items)('%s is named, registered and reaches something', (tag) => {
    const id = /data-testid="([\w-]+)"/.exec(tag)?.[1];
    expect(id, `a More-menu item without a test id is invisible to the register: ${tag}`).toBeTruthy();
    const affordance = byId.get(`button:${id}`) as { hasEffect: boolean } | undefined;
    expect(affordance, `button:${id} is not in the register`).toBeTruthy();
    expect(affordance?.hasEffect, `More-menu item ${id} reaches nothing`).toBe(true);
  });
});
