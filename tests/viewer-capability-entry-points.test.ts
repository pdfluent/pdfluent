// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary. The PDFluent application is free to use,
// including for commercial purposes. Redistribution, or extraction or reuse
// of its components (including the embedded PDF engine), requires a licence.
// See https://pdfluent.com/license for terms.

/**
 * Every backend capability the editor ships has a way in.
 *
 * The audit behind #404 found seven Tauri commands with no entry point at all
 * in the shipped shell: PDF/A validation and conversion, the outline, ink,
 * document metadata, the two Factur-X commands and signature verification.
 * Each existed, was registered in `generate_handler!`, was tested on the Rust
 * side -- and no user could ask for it. Three of them were reachable only in
 * `RightContextPanel`, which nothing renders, and the rail's "Draw" tool drew a
 * rectangle.
 *
 * The table below is the contract: capability, the command that performs it,
 * and the panel in the shipped shell that asks for it. It is checked by walking
 * the panel's own JSX -- the `{panel === 'x' && (…)}` block and the components
 * that block delegates to -- rather than grepping the file, because a grep is
 * satisfied by a dead panel further down the same file, which is exactly how
 * this gap survived.
 *
 * Red when: a panel is deleted or renamed, its `invoke` is dropped or renamed,
 * its controls move into a component the block no longer renders, the command
 * leaves `generate_handler!`, or the tools panel stops offering the way in.
 */

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import {
  WIRED_TILES_ALL_RUNTIMES,
  WIRED_TILES_TAURI_ONLY,
} from '../src/viewer/tools/wiredTools.generated';

const SHELL_PATH = 'src/viewer/v3/EditorV3Shell.tsx';
const shell = readFileSync(SHELL_PATH, 'utf8');
const libRs = readFileSync('src-tauri/src/lib.rs', 'utf8');
const useAnnotations = readFileSync('src/viewer/hooks/useAnnotations.ts', 'utf8');

/** The balanced `open…close` run starting at the first `open` at or after `from`. */
function sliceBalanced(text: string, from: number, open = '{', close = '}'): string {
  const start = text.indexOf(open, from);
  if (start < 0) return '';
  let depth = 0;
  for (let i = start; i < text.length; i++) {
    if (text[i] === open) depth++;
    else if (text[i] === close && --depth === 0) return text.slice(start, i + 1);
  }
  return '';
}

/** The body of a top-level `function Name(` declaration in the shell. */
function shellFunction(name: string): string {
  const at = shell.indexOf(`function ${name}(`);
  if (at < 0) return '';
  // Skip the parameter list: a destructured one is braces too, and reading it
  // as the body is how the register's first walker missed every handler.
  const params = shell.indexOf('(', at);
  let depth = 0;
  for (let i = params; i < shell.length; i++) {
    if (shell[i] === '(') depth++;
    else if (shell[i] === ')' && --depth === 0) return sliceBalanced(shell, i + 1);
  }
  return '';
}

/** The body of a `const name = …` or `function name(…)` anywhere in the shell. */
function shellHandler(name: string): string {
  const arrow = shell.indexOf(`const ${name} = `);
  if (arrow >= 0) return sliceBalanced(shell, arrow);
  return shellFunction(name);
}

/**
 * The Tauri commands a panel reaches: its own JSX, the components it renders,
 * and the handlers its controls are wired to. One hop each, which is enough to
 * tell a panel that performs its tool from one that only looks like it.
 */
function commandsOfPanel(panel: string): Set<string> {
  const block = sliceBalanced(shell, shell.indexOf(`{panel === '${panel}' && (`));
  const bodies = [block];
  for (const m of block.matchAll(/<([A-Z][\w]*)/g)) {
    const body = shellFunction(m[1]);
    if (body) bodies.push(body);
  }
  for (const m of block.matchAll(/\b(handle[A-Z]\w*)\b/g)) {
    const body = shellHandler(m[1]);
    if (body) bodies.push(body);
  }
  const found = new Set<string>();
  for (const body of bodies) {
    for (const m of body.matchAll(/invoke(?:<[^>]*>)?\(\s*['"]([a-z_0-9]+)['"]/g)) found.add(m[1]);
  }
  return found;
}

const ENTRY_POINTS: { capability: string; command: string; panel: string }[] = [
  { capability: 'PDF/A validation',       command: 'validate_pdfa',        panel: 'pdfa' },
  { capability: 'PDF/A conversion',       command: 'convert_to_pdfa',      panel: 'pdfa' },
  { capability: 'Document metadata',      command: 'set_metadata',         panel: 'metadata' },
  { capability: 'Factur-X extraction',    command: 'extract_invoice_data', panel: 'invoice' },
  { capability: 'Factur-X validation',    command: 'validate_invoice',     panel: 'invoice' },
  { capability: 'Signature verification', command: 'verify_signatures',    panel: 'esign' },
  { capability: 'Watermark',              command: 'add_watermark',        panel: 'watermark' },
  { capability: 'Combine files',          command: 'merge_pdfs',           panel: 'merge' },
  { capability: 'Split by range',         command: 'split_pdf',            panel: 'split' },
  { capability: 'Encrypt',                command: 'encrypt_pdf',          panel: 'protect' },
  { capability: 'Compress',               command: 'compress_pdf',         panel: 'compress' },
];

/** The `generate_handler!` list — the commands the app actually exposes. */
const handlerList = sliceBalanced(libRs, libRs.indexOf('generate_handler!'), '[', ']');

describe('backend capabilities have an entry point in the shipped shell', () => {
  it.each(ENTRY_POINTS)('$capability: the $panel panel reaches $command', ({ command, panel }) => {
    expect(libRs, `${command} is no longer a Tauri command`).toContain(`fn ${command}(`);
    expect(handlerList, `${command} is not in generate_handler!`).toContain(command);
    expect(commandsOfPanel(panel)).toContain(command);
  });

  it('every capability panel is reachable from the tools panel', () => {
    for (const panel of ['pdfa', 'metadata', 'invoice']) {
      expect(shell, `nothing opens the ${panel} panel`).toContain(`onPanelChange('${panel}')`);
    }
  });
});

describe('the outline has somewhere to be read', () => {
  it('get_outline is still the command behind the outline', () => {
    expect(libRs).toContain('fn get_outline(');
    expect(handlerList).toContain('get_outline');
  });

  it('the shell draws outline entries and they navigate', () => {
    const thumbs = shellFunction('V3Thumbnails');
    expect(thumbs, 'V3Thumbnails is gone').not.toBe('');
    expect(thumbs).toContain('data-testid="v3-outline-item"');
    expect(thumbs).toContain('onPageSelect(entry.node.pageIndex)');
    expect(thumbs).toContain('flattenOutline(outline)');
  });
});

describe('read aloud is offered because it exists', () => {
  it('the topbar read button carries the id the tile claims', () => {
    // The tile was hidden for the opposite reason to most of them: the tool
    // works, and nothing in the register could point at the control.
    expect(shell).toContain('data-testid="read-aloud-btn"');
    const at = shell.indexOf('data-testid="read-aloud-btn"');
    expect(shell.slice(at - 400, at)).toContain('props.onReadToggle');
  });
});

describe('the rail Draw tool draws ink', () => {
  it("setRailTool('draw') selects the ink tool", () => {
    const body = sliceBalanced(shell, shell.indexOf('function setRailTool('));
    const drawCase = body.slice(body.indexOf("case 'draw':"), body.indexOf("case 'text':"));
    expect(drawCase).toContain("onAnnotationToolChange('ink')");
    // The rectangle it used to select is what made the tool a misnomer.
    expect(drawCase).not.toContain("onAnnotationToolChange('rectangle')");
  });

  it('a finished stroke is committed with add_ink_annotation', () => {
    expect(useAnnotations).toContain("invoke('add_ink_annotation'");
    expect(libRs).toContain('fn add_ink_annotation(');
    expect(handlerList).toContain('add_ink_annotation');
  });
});

describe("the rail's More menu offers only what it can do", () => {
  const menu = shellFunction('EditorV3ToolRail');

  it('every item carries a test id, so the register can name it', () => {
    // A button the register cannot name is a control nobody is measuring, and
    // that is how four dead items stayed in this menu.
    for (const m of menu.matchAll(/<button className="more-item"[\s\S]*?<\/button>/g)) {
      expect(m[0], `a More-menu item without a test id: ${m[0]}`).toContain('data-testid=');
    }
  });

  it.each([
    ['annotation-tool-strikeout', 'strikeout'],
    ['annotation-tool-underline', 'underline'],
    ['annotation-tool-attachment', 'attachment'],
  ])('%s asks handleMoreTool for %s, and that branch does something', (testId, action) => {
    expect(menu).toContain(`data-testid="${testId}"`);
    expect(menu).toContain(`onMoreTool('${action}')`);
    const dispatcher = shellFunction('handleMoreTool');
    const branch = dispatcher.slice(dispatcher.indexOf(`action === '${action}'`));
    expect(sliceBalanced(branch, branch.indexOf(')') + 1).replace(/[{};\s]|return/g, ''))
      .not.toBe('');
  });

  it('the attachment item reaches the command that opens the picker', () => {
    const dispatcher = shellFunction('handleMoreTool');
    expect(dispatcher).toContain('onAddAttachment()');
    expect(handlerList).toContain('add_attachment_dialog');
  });

  it.each(['stamp', 'date', 'ruler', 'textbox'])('no longer offers %s', (action) => {
    // Each of these was a rendered item whose branch reached nothing it named:
    // date and ruler fell through, stamp pointed at a hidden tile, and textbox
    // opened a panel whose text-box control is behind a disabled flag.
    expect(menu, `${action} is back in the More menu`).not.toContain(`onMoreTool('${action}')`);
  });
});

describe('the All-tools panel offers the capabilities that now have a panel', () => {
  const offered = new Set([...WIRED_TILES_ALL_RUNTIMES, ...WIRED_TILES_TAURI_ONLY]);

  it.each([
    'toolbar.pdfa',
    'toolbar.metadata',
    'toolbar.invoice',
    'toolbar.bookmarks',
    'toolbar.readAloud',
    'toolbar.freeDraw',
    'toolbar.watermark',
    'toolbar.merge',
    'toolbar.split',
  ])('%s is offered', (tile) => {
    expect(offered.has(tile), `${tile} is defined and not offered`).toBe(true);
  });

  it('a tile that names a panel opens that panel instead of only switching mode', () => {
    const allTools = readFileSync('src/viewer/components/AllToolsPanel.tsx', 'utf8');
    expect(allTools).toContain('onOpenPanel?.(tool.opensPanel)');
    const viewer = readFileSync('src/viewer/ViewerApp.tsx', 'utf8');
    expect(viewer).toContain('onOpenPanel={setRequestedPanel}');
    expect(shell).toContain('setActivePanel(next)');
  });
});
