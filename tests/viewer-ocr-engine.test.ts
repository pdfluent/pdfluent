// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary and confidential.
// Free for personal, non-commercial use.
// Commercial use requires a valid license.
// See https://pdfluent.com/license for terms.

import { readFileSync } from 'node:fs';
import { describe, it, expect } from 'vitest';

const ocrEngineSource = readFileSync(
  new URL('../src/core/engine/OcrEngine.ts', import.meta.url),
  'utf8'
);

const mockOcrEngineSource = readFileSync(
  new URL('../src/core/engine/mock/MockOcrEngine.ts', import.meta.url),
  'utf8'
);

const engineIndexSource = readFileSync(
  new URL('../src/core/engine/index.ts', import.meta.url),
  'utf8'
);

const mockIndexSource = readFileSync(
  new URL('../src/core/engine/mock/index.ts', import.meta.url),
  'utf8'
);

// ---------------------------------------------------------------------------
// OcrEngine interface
// ---------------------------------------------------------------------------

describe('OcrEngine interface', () => {
  it('defines OcrEngine interface', () => {
    expect(ocrEngineSource).toContain('export interface OcrEngine');
  });

  it('has runOcr method', () => {
    const ifStart = ocrEngineSource.indexOf('export interface OcrEngine');
    const ifEnd = ocrEngineSource.indexOf('\n}', ifStart) + 2;
    const ifBody = ocrEngineSource.slice(ifStart, ifEnd);
    expect(ifBody).toContain('runOcr(');
  });

  it('runOcr takes imageBase64 and pageIndex', () => {
    expect(ocrEngineSource).toContain('imageBase64: string');
    expect(ocrEngineSource).toContain('pageIndex: number');
  });

  it('runOcr returns AsyncEngineResult<OcrPageResult>', () => {
    expect(ocrEngineSource).toContain('AsyncEngineResult<OcrPageResult>');
  });

  it('has isAvailable method', () => {
    expect(ocrEngineSource).toContain('isAvailable(): boolean');
  });
});

// ---------------------------------------------------------------------------
// OcrRunOptions
// ---------------------------------------------------------------------------

describe('OcrRunOptions interface', () => {
  it('defines OcrRunOptions interface', () => {
    expect(ocrEngineSource).toContain('export interface OcrRunOptions');
  });

  it('has language field', () => {
    const ifStart = ocrEngineSource.indexOf('export interface OcrRunOptions');
    const ifEnd = ocrEngineSource.indexOf('\n}', ifStart) + 2;
    const ifBody = ocrEngineSource.slice(ifStart, ifEnd);
    expect(ifBody).toContain('language:');
  });

  it('has includeStructure field', () => {
    const ifStart = ocrEngineSource.indexOf('export interface OcrRunOptions');
    const ifEnd = ocrEngineSource.indexOf('\n}', ifStart) + 2;
    const ifBody = ocrEngineSource.slice(ifStart, ifEnd);
    expect(ifBody).toContain('includeStructure:');
  });

  it('has preprocessMode field with union type', () => {
    const ifStart = ocrEngineSource.indexOf('export interface OcrRunOptions');
    const ifEnd = ocrEngineSource.indexOf('\n}', ifStart) + 2;
    const ifBody = ocrEngineSource.slice(ifStart, ifEnd);
    expect(ifBody).toContain('preprocessMode:');
    expect(ifBody).toContain("'off'");
    expect(ifBody).toContain("'auto'");
    expect(ifBody).toContain("'manual'");
  });

  it('has optional preprocessSteps field', () => {
    const ifStart = ocrEngineSource.indexOf('export interface OcrRunOptions');
    const ifEnd = ocrEngineSource.indexOf('\n}', ifStart) + 2;
    const ifBody = ocrEngineSource.slice(ifStart, ifEnd);
    expect(ifBody).toContain('preprocessSteps?:');
  });
});

// ---------------------------------------------------------------------------
// OcrPageResult
// ---------------------------------------------------------------------------

describe('OcrPageResult interface', () => {
  it('defines OcrPageResult interface', () => {
    expect(ocrEngineSource).toContain('export interface OcrPageResult');
  });

  it('has words field', () => {
    expect(ocrEngineSource).toContain('words:');
  });

  it('has text field', () => {
    expect(ocrEngineSource).toContain('text:');
  });

  it('has averageConfidence field', () => {
    expect(ocrEngineSource).toContain('averageConfidence:');
  });

  it('has preprocessingApplied field', () => {
    expect(ocrEngineSource).toContain('preprocessingApplied:');
  });

  it('has qualityMetrics field', () => {
    expect(ocrEngineSource).toContain('qualityMetrics:');
  });

  it('has structureBlocks field', () => {
    expect(ocrEngineSource).toContain('structureBlocks:');
  });
});

// ---------------------------------------------------------------------------
// MockOcrEngine
// ---------------------------------------------------------------------------

describe('MockOcrEngine', () => {
  it('implements OcrEngine interface', () => {
    expect(mockOcrEngineSource).toContain('implements OcrEngine');
  });

  it('has isAvailable method returning true', () => {
    expect(mockOcrEngineSource).toContain('isAvailable()');
    expect(mockOcrEngineSource).toContain('return true');
  });

  it('has runOcr method', () => {
    expect(mockOcrEngineSource).toContain('runOcr(');
  });

  it('runOcr returns success with OcrPageResult', () => {
    const fnStart = mockOcrEngineSource.indexOf('async runOcr(');
    const fnEnd = mockOcrEngineSource.indexOf('\n  }', fnStart) + 4;
    const fnBody = mockOcrEngineSource.slice(fnStart, fnEnd);
    expect(fnBody).toContain('success: true');
    expect(fnBody).toContain('pageIndex');
  });

  it('mock result includes words array', () => {
    expect(mockOcrEngineSource).toContain('words:');
  });

  it('mock result includes qualityMetrics', () => {
    expect(mockOcrEngineSource).toContain('qualityMetrics:');
  });
});

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

describe('Engine index exports', () => {
  it('core engine index re-exports OcrEngine', () => {
    expect(engineIndexSource).toContain("'./OcrEngine'");
  });

  it('mock index re-exports MockOcrEngine', () => {
    expect(mockIndexSource).toContain("'./MockOcrEngine'");
  });
});
