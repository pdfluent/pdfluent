// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary and confidential.
// Free for personal, non-commercial use.
// Commercial use requires a valid license.
// See https://pdfluent.com/license for terms.

import { readFileSync } from 'node:fs';
import { describe, it, expect } from 'vitest';

const tauriOcrSource = readFileSync(
  new URL('../src/platform/engine/tauri/TauriOcrEngine.ts', import.meta.url),
  'utf8'
);

const tauriIndexSource = readFileSync(
  new URL('../src/platform/engine/tauri/index.ts', import.meta.url),
  'utf8'
);

// ---------------------------------------------------------------------------
// TauriOcrEngine — structure
// ---------------------------------------------------------------------------

describe('TauriOcrEngine — class structure', () => {
  it('implements OcrEngine', () => {
    expect(tauriOcrSource).toContain('implements OcrEngine');
  });

  it('has isAvailable method', () => {
    expect(tauriOcrSource).toContain('isAvailable()');
  });

  it('has runOcr method', () => {
    expect(tauriOcrSource).toContain('async runOcr(');
  });

  it('imports runPaddleOcr from tauri-api', () => {
    expect(tauriOcrSource).toContain("from '../../../lib/tauri-api'");
    expect(tauriOcrSource).toContain('runPaddleOcr');
  });
});

// ---------------------------------------------------------------------------
// TauriOcrEngine — runOcr implementation
// ---------------------------------------------------------------------------

describe('TauriOcrEngine — runOcr wiring', () => {
  it('calls runPaddleOcr with image_base64', () => {
    const fnStart = tauriOcrSource.indexOf('async runOcr(');
    const fnEnd = tauriOcrSource.indexOf('\n  }', fnStart) + 4;
    const fnBody = tauriOcrSource.slice(fnStart, fnEnd);
    expect(fnBody).toContain('image_base64: imageBase64');
  });

  it('passes language option', () => {
    const fnStart = tauriOcrSource.indexOf('async runOcr(');
    const fnEnd = tauriOcrSource.indexOf('\n  }', fnStart) + 4;
    const fnBody = tauriOcrSource.slice(fnStart, fnEnd);
    expect(fnBody).toContain('language: options.language');
  });

  it('passes include_structure option', () => {
    const fnStart = tauriOcrSource.indexOf('async runOcr(');
    const fnEnd = tauriOcrSource.indexOf('\n  }', fnStart) + 4;
    const fnBody = tauriOcrSource.slice(fnStart, fnEnd);
    expect(fnBody).toContain('include_structure: options.includeStructure');
  });

  it('passes preprocess_mode option', () => {
    const fnStart = tauriOcrSource.indexOf('async runOcr(');
    const fnEnd = tauriOcrSource.indexOf('\n  }', fnStart) + 4;
    const fnBody = tauriOcrSource.slice(fnStart, fnEnd);
    expect(fnBody).toContain('preprocess_mode: options.preprocessMode');
  });

  it('maps response.words through mapWord', () => {
    expect(tauriOcrSource).toContain('function mapWord(');
    const fnStart = tauriOcrSource.indexOf('async runOcr(');
    const fnEnd = tauriOcrSource.indexOf('\n  }', fnStart) + 4;
    const fnBody = tauriOcrSource.slice(fnStart, fnEnd);
    expect(fnBody).toContain('mapWord(');
  });

  it('maps response.structure_blocks through mapStructureBlock', () => {
    expect(tauriOcrSource).toContain('function mapStructureBlock(');
    const fnStart = tauriOcrSource.indexOf('async runOcr(');
    const fnEnd = tauriOcrSource.indexOf('\n  }', fnStart) + 4;
    const fnBody = tauriOcrSource.slice(fnStart, fnEnd);
    expect(fnBody).toContain('mapStructureBlock(');
  });

  it('returns success: true with OcrPageResult', () => {
    const fnStart = tauriOcrSource.indexOf('async runOcr(');
    const fnEnd = tauriOcrSource.indexOf('\n  }', fnStart) + 4;
    const fnBody = tauriOcrSource.slice(fnStart, fnEnd);
    expect(fnBody).toContain('success: true');
    expect(fnBody).toContain('value: result');
  });

  it('catches errors and returns internal-error', () => {
    const fnStart = tauriOcrSource.indexOf('async runOcr(');
    const fnEnd = tauriOcrSource.indexOf('\n  }', fnStart) + 4;
    const fnBody = tauriOcrSource.slice(fnStart, fnEnd);
    expect(fnBody).toContain("code: 'internal-error'");
  });
});

// ---------------------------------------------------------------------------
// Tauri engine index exports TauriOcrEngine
// ---------------------------------------------------------------------------

describe('Tauri engine index', () => {
  it('exports TauriOcrEngine', () => {
    expect(tauriIndexSource).toContain('TauriOcrEngine');
  });
});
