// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary and confidential.
// Free for personal, non-commercial use.
// Commercial use requires a valid license.
// See https://pdfluent.com/license for terms.

import { readFileSync } from 'node:fs';
import { describe, it, expect } from 'vitest';

const viewerAppSource = readFileSync(
  new URL('../src/viewer/ViewerApp.tsx', import.meta.url),
  'utf8'
);

// Locate the title useEffect block for scoped assertions
const titleEffectStart = viewerAppSource.indexOf('Document title — browser tab');
const titleEffectEnd = viewerAppSource.indexOf('// Keep a ref so the window helper', titleEffectStart);
const titleEffectBody = viewerAppSource.slice(titleEffectStart, titleEffectEnd);

// ---------------------------------------------------------------------------
// Title format
// ---------------------------------------------------------------------------

describe('ViewerApp — document title format', () => {
  it('sets document.title inside the title effect', () => {
    expect(titleEffectBody).toContain('document.title = title');
  });

  it('uses "— PDFluent" suffix in the title', () => {
    expect(titleEffectBody).toContain('— PDFluent');
  });

  it('uses fileName when a document is open', () => {
    expect(titleEffectBody).toContain('${fileName}');
  });

  it('falls back to plain "PDFluent" when fileName is null', () => {
    expect(titleEffectBody).toContain(': \'PDFluent\'');
  });

  it('prefixes with "* " when document is dirty', () => {
    expect(titleEffectBody).toContain("isDirty ? '* ' : ''");
  });
});

// ---------------------------------------------------------------------------
// No-document state
// ---------------------------------------------------------------------------

describe('ViewerApp — document title: no document open', () => {
  it('title evaluates to "PDFluent" when fileName is falsy', () => {
    // The ternary: fileName ? `...` : 'PDFluent'
    expect(titleEffectBody).toContain("fileName\n      ?");
    // Or the single-line form — either way the 'PDFluent' fallback must be present
    const hasFallback =
      titleEffectBody.includes(": 'PDFluent'") ||
      titleEffectBody.includes(': \'PDFluent\'');
    expect(hasFallback).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Dependency array
// ---------------------------------------------------------------------------

describe('ViewerApp — document title effect dependencies', () => {
  it('depends on fileName', () => {
    expect(titleEffectBody).toContain('fileName');
    expect(titleEffectBody).toContain('[fileName, isDirty]');
  });

  it('depends on isDirty so dirty indicator updates immediately', () => {
    expect(titleEffectBody).toContain('isDirty');
    expect(titleEffectBody).toContain('[fileName, isDirty]');
  });
});

// ---------------------------------------------------------------------------
// Tauri window title
// ---------------------------------------------------------------------------

describe('ViewerApp — Tauri window title update', () => {
  it('imports getCurrentWebviewWindow dynamically inside the effect', () => {
    expect(titleEffectBody).toContain('@tauri-apps/api/webviewWindow');
    expect(titleEffectBody).toContain('getCurrentWebviewWindow');
  });

  it('calls setTitle with the same title string', () => {
    expect(titleEffectBody).toContain('setTitle(title)');
  });

  it('guards the Tauri call with isTauri', () => {
    expect(titleEffectBody).toContain('if (!isTauri) return');
  });

  it('Tauri call is inside an async IIFE (dynamic import pattern)', () => {
    expect(titleEffectBody).toContain('async () => {');
  });
});

// ---------------------------------------------------------------------------
// Effect is placed after fileName declaration
// ---------------------------------------------------------------------------

describe('ViewerApp — title effect placement', () => {
  it('effect is defined after const fileName', () => {
    const fileNameDecl = viewerAppSource.indexOf('const fileName =');
    expect(titleEffectStart).toBeGreaterThan(fileNameDecl);
  });

  it('effect is inside the ViewerApp component (before the return)', () => {
    const returnStatement = viewerAppSource.lastIndexOf('return (');
    expect(titleEffectStart).toBeLessThan(returnStatement);
  });
});
