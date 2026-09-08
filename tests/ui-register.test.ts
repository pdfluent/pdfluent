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
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import {
  buildIndex,
  buildRegister,
  codeTokens,
  findProof,
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
  runnableText,
  shortcutLiterals,
  stripComments,
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

describe('a skipped test is not proof', () => {
  // `skip` interpolated, not written out: the no-silent-failures lint scans this
  // file and a literal `test.skip(` here would be a finding in the checkout.
  const SKIP = 'skip';
  const SPEC = [
    "import { test, expect } from '@playwright/test';",
    '',
    'async function exportAndCheck(page) {',
    "  await page.locator('[data-testid=\"export-btn\"]').click();",
    '}',
    '',
    "test('runs', async ({ page }) => {",
    "  await expect(page.locator('[data-testid=\"live-btn\"]')).toBeVisible();",
    '});',
    '',
    "test('does not run', async ({ page }) => {",
    `  test.${SKIP}(true, 'the control moved into a dropdown');`,
    '  await exportAndCheck(page);',
    '});',
    '',
    `test.${SKIP}('declared as skipped', async ({ page }) => {`,
    "  await expect(page.locator('[data-testid=\"dead-btn\"]')).toBeVisible();",
    '});',
  ].join('\n');

  const runnable = runnableText(SPEC);

  it('keeps the file the same length, so line numbers still line up', () => {
    expect(runnable).toHaveLength(SPEC.length);
  });

  it('keeps what a live test names', () => {
    expect(runnable).toContain('live-btn');
  });

  it('drops what only a skipped test names', () => {
    expect(runnable).not.toContain('dead-btn');
  });

  it('drops a helper that only skipped tests call', () => {
    // This is the one that mattered: `export-btn` was never inside a skipped
    // test body, it was in a helper four of them called, and the register read
    // it as proof that the export button was wired.
    expect(SPEC).toContain('export-btn');
    expect(runnable).not.toContain('export-btn');
  });
});

// ---------------------------------------------------------------------------
// Prose is not proof
// ---------------------------------------------------------------------------

/**
 * The register once read a doc comment as evidence that a control works.
 *
 * A shortcut was proven by two fragments -- the key character and the word
 * `key` -- found anywhere in a test file. `tests/declared-skips.test.ts` has
 * `title: 's'` in a fixture and, for one afternoon in September 2026, the word
 * "keys" in a doc comment, and that was enough to list it as the proof of
 * Cmd+S. Rewording the comment removed the row, which is the whole problem: the
 * answer depended on prose.
 *
 * What the walker reads now is what the test runs. Comments are blanked. A
 * string counts where it is evaluated -- an argument of a call, or inside an
 * object or array that is itself an argument -- and a table the test loops over
 * counts too, because those rows are the test's input. A sample document held
 * in a template is text, whoever reads it.
 *
 * The fixtures below are module-scope arrays of lines on purpose: under that
 * same rule they are data, so this file cannot become proof of what it names.
 */
describe('prose and data are not proof', () => {
  const SHORTCUT = { kind: 'shortcut', id: 'demo (F13)', literals: ['F13'] };
  const TILE = { kind: 'tile', id: 'toolbar.demoTile', commands: [] };
  const BUTTON = { kind: 'button', id: 'demo-btn', commands: [] };
  const proofOf = (a: unknown, source: string) =>
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    findProof(a as any, new Map([['tests/demo.test.ts', source]]));

  const IN_A_COMMENT = [
    "import { expect, it } from 'vitest';",
    '',
    "it('renders the shell', () => {",
    '  expect(shellSource).toContain(',
    "    // the key handler answers case 'F13' here -- see the shortcut sheet",
    "    'ShellRoot',",
    '  );',
    '});',
  ].join('\n');

  const IN_A_FIXTURE = [
    "import { expect, it } from 'vitest';",
    '',
    "it('lints a sample handler', () => {",
    '  const SAMPLE = [',
    '    "case \'F13\':",',
    "    'setMode(read);',",
    '  ];',
    '  for (const line of SAMPLE) expect(lint(line)).toHaveLength(0);',
    '});',
  ].join('\n');

  const IN_A_TYPE_AND_A_TABLE = [
    "import { expect, it } from 'vitest';",
    '',
    "type DemoKey = 'F13' | 'Escape';",
    '',
    "it('renders a heading per key', () => {",
    '  const HEADINGS: Record<DemoKey, string> = {',
    "    'F13': 'Advertised keyboard shortcuts',",
    "    'Escape': 'Close',",
    '  };',
    '  expect(Object.keys(HEADINGS)).toHaveLength(2);',
    '});',
  ].join('\n');

  const IN_AN_ASSERTION = [
    "import { expect, it } from 'vitest';",
    '',
    "it('sends the demo key to the handler', () => {",
    '  expect(effectBody).toContain("case \'F13\'");',
    '});',
  ].join('\n');

  const A_BARE_CHARACTER = [
    "import { expect, it } from 'vitest';",
    '',
    "it('mentions the character somewhere in the block', () => {",
    '  expect(effectBody).toContain("\'F13\'");',
    '});',
  ].join('\n');

  const A_TABLE_IT_LOOPS_OVER = [
    "import { expect, it } from 'vitest';",
    '',
    'const UNIVERSAL = [',
    "  'toolbar.demoTile',",
    "  'toolbar.other',",
    '];',
    '',
    "it('offers every universal tile', () => {",
    '  for (const tile of UNIVERSAL) expect(offered.has(tile)).toBe(true);',
    '});',
  ].join('\n');

  const A_SAMPLE_SPEC_IN_A_TEMPLATE = [
    "import { expect, it } from 'vitest';",
    '',
    'const SPEC_FIXTURE = `',
    'test("exports", async ({ page }) => {',
    '  await page.locator(\'[data-testid="demo-btn"]\').click();',
    '});',
    '`;',
    '',
    "it('reports the unchecked click in the fixture', () => {",
    '  expect(lint(SPEC_FIXTURE)).toHaveLength(1);',
    '});',
  ].join('\n');

  it('reads nothing from a comment', () => {
    expect(IN_A_COMMENT).toContain(String.raw`case 'F13'`);
    expect(proofOf(SHORTCUT, IN_A_COMMENT)).toHaveLength(0);
  });

  it('reads nothing from a sample handler a test carries as data', () => {
    expect(proofOf(SHORTCUT, IN_A_FIXTURE)).toHaveLength(0);
  });

  it('reads nothing from a type or a lookup table', () => {
    expect(proofOf(SHORTCUT, IN_A_TYPE_AND_A_TABLE)).toHaveLength(0);
  });

  it('reads nothing from a bare key character, which names no binding', () => {
    expect(proofOf(SHORTCUT, A_BARE_CHARACTER)).toHaveLength(0);
  });

  it('still reads an assertion about the key handler', () => {
    expect(proofOf(SHORTCUT, IN_AN_ASSERTION)).toHaveLength(1);
  });

  it('still reads the table of ids a test loops over', () => {
    expect(proofOf(TILE, A_TABLE_IT_LOOPS_OVER)).toHaveLength(1);
  });

  it('reads nothing from a sample spec a lint test holds in a template', () => {
    // This one is not hypothetical: the fixture in
    // tests/no-silent-failures-lint.test.ts names the export button, and
    // reading it would have made `button:export-btn` wired -- the one control
    // recorded as untested because its only test never runs.
    expect(proofOf(BUTTON, A_SAMPLE_SPEC_IN_A_TEMPLATE)).toHaveLength(0);
  });

  it('gives the same answer when a comment is reworded', () => {
    // The reproduction from pdfluent-internal#459, against the real file: this
    // one has `title: 's'` in a fixture, and on 2026-09-08 a doc comment in it
    // used the word "keys". That was accepted as the proof of Cmd+S, and
    // rewording the comment took the row away again.
    const file = readFileSync(join(REPO, 'tests/declared-skips.test.ts'), 'utf8');
    const reworded = `// the reporter keys its suites by title\n${file}`;
    const save = { kind: 'shortcut', id: 'save (⌘S / Ctrl+S)', literals: ['s'] };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const seen = new Map([['tests/declared-skips.test.ts', reworded]]);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(findProof(save as any, seen)).toHaveLength(0);
  });

  it('blanks a comment character for character, so offsets still line up', () => {
    const stripped = stripComments(IN_A_COMMENT);
    expect(stripped).toHaveLength(IN_A_COMMENT.length);
    expect(stripped.split('\n')).toHaveLength(IN_A_COMMENT.split('\n').length);
    expect(stripped).toContain("toContain(");
    expect(stripped).not.toContain('shortcut sheet');
  });

  it('leaves a division and a regular expression alone', () => {
    const source = ['const half = total / 2;', 'const rx = /a\\/b/;'].join('\n');
    expect(stripComments(source)).toBe(source);
    expect(codeTokens(source)).toBe(source);
  });
});

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
