// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary and confidential.
// Free for personal, non-commercial use.
// Commercial use requires a valid license.
// See https://pdfluent.com/license for terms.

import { readFileSync } from 'node:fs';
import { describe, it, expect } from 'vitest';

const engineSource = readFileSync(
  new URL('../src-tauri/src/pdf_engine.rs', import.meta.url),
  'utf8'
);

const libSource = readFileSync(
  new URL('../src-tauri/src/lib.rs', import.meta.url),
  'utf8'
);

const toolbarSource = readFileSync(
  new URL('../src/viewer/components/ModeToolbar.tsx', import.meta.url),
  'utf8'
);

const toolDefsSource = readFileSync(
  new URL('../src/viewer/tools/toolDefinitions.ts', import.meta.url),
  'utf8'
);

// ---------------------------------------------------------------------------
// pdf_engine.rs — rotate_page_left / rotate_page_right methods
// ---------------------------------------------------------------------------

describe('pdf_engine.rs — rotate_page_left', () => {
  it('defines rotate_page_left method', () => {
    expect(engineSource).toContain('pub fn rotate_page_left(');
  });

  it('rotate_page_left calls rotate_pages with -90', () => {
    const fnStart = engineSource.indexOf('pub fn rotate_page_left(');
    const fnEnd = engineSource.indexOf('\n    }', fnStart) + 6;
    const fnBody = engineSource.slice(fnStart, fnEnd);
    expect(fnBody).toContain('-90');
    expect(fnBody).toContain('rotate_pages(');
  });
});

describe('pdf_engine.rs — rotate_page_right', () => {
  it('defines rotate_page_right method', () => {
    expect(engineSource).toContain('pub fn rotate_page_right(');
  });

  it('rotate_page_right calls rotate_pages with 90', () => {
    const fnStart = engineSource.indexOf('pub fn rotate_page_right(');
    const fnEnd = engineSource.indexOf('\n    }', fnStart) + 6;
    const fnBody = engineSource.slice(fnStart, fnEnd);
    expect(fnBody).toContain('90');
    expect(fnBody).toContain('rotate_pages(');
  });
});

// ---------------------------------------------------------------------------
// lib.rs — Tauri commands
// ---------------------------------------------------------------------------

describe('lib.rs — rotate_page_left Tauri command', () => {
  it('declares rotate_page_left as a tauri::command', () => {
    const fnIdx = libSource.indexOf('fn rotate_page_left(');
    expect(libSource.slice(fnIdx - 40, fnIdx)).toContain('#[tauri::command]');
  });

  it('delegates to doc.rotate_page_left()', () => {
    const fnIdx = libSource.indexOf('fn rotate_page_left(');
    expect(libSource.slice(fnIdx, fnIdx + 300)).toContain('doc.rotate_page_left(');
  });

  it('returns DocumentInfo', () => {
    const fnIdx = libSource.indexOf('fn rotate_page_left(');
    expect(libSource.slice(fnIdx, fnIdx + 300)).toContain('DocumentInfo');
  });

  it('registered in invoke_handler', () => {
    expect(libSource).toContain('rotate_page_left,');
  });
});

describe('lib.rs — rotate_page_right Tauri command', () => {
  it('declares rotate_page_right as a tauri::command', () => {
    const fnIdx = libSource.indexOf('fn rotate_page_right(');
    expect(libSource.slice(fnIdx - 40, fnIdx)).toContain('#[tauri::command]');
  });

  it('delegates to doc.rotate_page_right()', () => {
    const fnIdx = libSource.indexOf('fn rotate_page_right(');
    expect(libSource.slice(fnIdx, fnIdx + 300)).toContain('doc.rotate_page_right(');
  });

  it('registered in invoke_handler', () => {
    expect(libSource).toContain('rotate_page_right,');
  });
});

// ---------------------------------------------------------------------------
// toolDefinitions.ts — organize mode tools
// ---------------------------------------------------------------------------

describe('toolDefinitions.ts — organize mode rotation tools', () => {
  it('includes Links roteren tool', () => {
    expect(toolDefsSource).toContain("'toolbar.rotateLeft'");
  });

  it('includes Rechts roteren tool', () => {
    expect(toolDefsSource).toContain("'toolbar.rotateRight'");
  });

  it('imports RotateCcwIcon for left rotation', () => {
    expect(toolDefsSource).toContain('RotateCcwIcon');
  });
});

// ---------------------------------------------------------------------------
// ModeToolbar.tsx — rotation handlers
// ---------------------------------------------------------------------------

describe('ModeToolbar — handleRotatePageLeft', () => {
  it('defines handleRotatePageLeft function', () => {
    expect(toolbarSource).toContain('async function handleRotatePageLeft()');
  });

  it('calls rotate_page_left Tauri command', () => {
    const fnStart = toolbarSource.indexOf('async function handleRotatePageLeft()');
    const fnEnd = toolbarSource.indexOf('\n  }', fnStart) + 4;
    const fnBody = toolbarSource.slice(fnStart, fnEnd);
    expect(fnBody).toContain("'rotate_page_left'");
  });

  it('Links roteren action routes to handleRotatePageLeft', () => {
    expect(toolbarSource).toContain("case 'toolbar.rotateLeft'");
    expect(toolbarSource).toContain('handleRotatePageLeft()');
  });
});

describe('ModeToolbar — handleRotatePageRight', () => {
  it('defines handleRotatePageRight function', () => {
    expect(toolbarSource).toContain('async function handleRotatePageRight()');
  });

  it('calls rotate_page_right Tauri command', () => {
    const fnStart = toolbarSource.indexOf('async function handleRotatePageRight()');
    const fnEnd = toolbarSource.indexOf('\n  }', fnStart) + 4;
    const fnBody = toolbarSource.slice(fnStart, fnEnd);
    expect(fnBody).toContain("'rotate_page_right'");
  });

  it('Rechts roteren action routes to handleRotatePageRight', () => {
    expect(toolbarSource).toContain("case 'toolbar.rotateRight'");
    expect(toolbarSource).toContain('handleRotatePageRight()');
  });
});

describe('ModeToolbar — WIRED_TOOLS includes rotation', () => {
  it('Links roteren is in WIRED_TOOLS', () => {
    const wiredStart = toolbarSource.indexOf('export const WIRED_TOOLS');
    const wiredEnd = toolbarSource.indexOf(']);', wiredStart) + 3;
    const wiredBlock = toolbarSource.slice(wiredStart, wiredEnd);
    expect(wiredBlock).toContain("'toolbar.rotateLeft'");
  });

  it('Rechts roteren is in WIRED_TOOLS', () => {
    const wiredStart = toolbarSource.indexOf('export const WIRED_TOOLS');
    const wiredEnd = toolbarSource.indexOf(']);', wiredStart) + 3;
    const wiredBlock = toolbarSource.slice(wiredStart, wiredEnd);
    expect(wiredBlock).toContain("'toolbar.rotateRight'");
  });
});
