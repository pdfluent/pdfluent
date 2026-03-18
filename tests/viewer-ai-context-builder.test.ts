// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary and confidential.
// Free for personal, non-commercial use.
// Commercial use requires a valid license.
// See https://pdfluent.com/license for terms.

import { readFileSync } from 'node:fs';
import { describe, it, expect } from 'vitest';

const source = readFileSync(
  new URL('../src/viewer/ai/documentContextBuilder.ts', import.meta.url),
  'utf8'
);

// ---------------------------------------------------------------------------
// AI_CONTEXT_MAX_CHARS constant
// ---------------------------------------------------------------------------

describe('AI_CONTEXT_MAX_CHARS', () => {
  it('exports AI_CONTEXT_MAX_CHARS', () => {
    expect(source).toContain('export const AI_CONTEXT_MAX_CHARS');
  });

  it('is set to 12000', () => {
    expect(source).toContain('12_000');
  });
});

// ---------------------------------------------------------------------------
// DocumentAiContext interface
// ---------------------------------------------------------------------------

describe('DocumentAiContext', () => {
  it('declares title field', () => {
    const ifaceStart = source.indexOf('interface DocumentAiContext');
    const ifaceEnd = source.indexOf('\n}', ifaceStart) + 2;
    const block = source.slice(ifaceStart, ifaceEnd);
    expect(block).toContain('title: string');
  });

  it('declares textContent field', () => {
    const ifaceStart = source.indexOf('interface DocumentAiContext');
    const ifaceEnd = source.indexOf('\n}', ifaceStart) + 2;
    const block = source.slice(ifaceStart, ifaceEnd);
    expect(block).toContain('textContent: string');
  });

  it('declares annotationSummary field', () => {
    const ifaceStart = source.indexOf('interface DocumentAiContext');
    const ifaceEnd = source.indexOf('\n}', ifaceStart) + 2;
    const block = source.slice(ifaceStart, ifaceEnd);
    expect(block).toContain('annotationSummary: string');
  });

  it('declares pageCount field', () => {
    const ifaceStart = source.indexOf('interface DocumentAiContext');
    const ifaceEnd = source.indexOf('\n}', ifaceStart) + 2;
    const block = source.slice(ifaceStart, ifaceEnd);
    expect(block).toContain('pageCount: number');
  });

  it('declares charCount field', () => {
    const ifaceStart = source.indexOf('interface DocumentAiContext');
    const ifaceEnd = source.indexOf('\n}', ifaceStart) + 2;
    const block = source.slice(ifaceStart, ifaceEnd);
    expect(block).toContain('charCount: number');
  });
});

// ---------------------------------------------------------------------------
// buildDocumentContext
// ---------------------------------------------------------------------------

describe('buildDocumentContext', () => {
  it('exports buildDocumentContext function', () => {
    expect(source).toContain('export function buildDocumentContext(');
  });

  it('accepts title, textSpans, annotations, pageCount', () => {
    const fnStart = source.indexOf('export function buildDocumentContext(');
    const sig = source.slice(fnStart, fnStart + 200);
    expect(sig).toContain('title: string');
    expect(sig).toContain('textSpans: string[]');
    expect(sig).toContain('annotations: Annotation[]');
    expect(sig).toContain('pageCount: number');
  });

  it('joins text spans', () => {
    const fnStart = source.indexOf('export function buildDocumentContext(');
    const fnEnd = source.indexOf('\nexport function ', fnStart + 1);
    const body = source.slice(fnStart, fnEnd);
    expect(body).toContain('textSpans.join(');
  });

  it('falls back to Document title when blank', () => {
    const fnStart = source.indexOf('export function buildDocumentContext(');
    const fnEnd = source.indexOf('\nexport function ', fnStart + 1);
    const body = source.slice(fnStart, fnEnd);
    expect(body).toContain("'Document'");
  });

  it('sets charCount to textContent.length', () => {
    const fnStart = source.indexOf('export function buildDocumentContext(');
    const fnEnd = source.indexOf('\nexexport function ', fnStart + 1);
    const body = source.slice(fnStart, fnStart + 500);
    expect(body).toContain('textContent.length');
  });
});

// ---------------------------------------------------------------------------
// truncateContextToLimit
// ---------------------------------------------------------------------------

describe('truncateContextToLimit', () => {
  it('exports truncateContextToLimit function', () => {
    expect(source).toContain('export function truncateContextToLimit(');
  });

  it('defaults maxChars to AI_CONTEXT_MAX_CHARS', () => {
    const fnStart = source.indexOf('export function truncateContextToLimit(');
    const sig = source.slice(fnStart, fnStart + 150);
    expect(sig).toContain('AI_CONTEXT_MAX_CHARS');
  });

  it('returns context unchanged when within limit', () => {
    const fnStart = source.indexOf('export function truncateContextToLimit(');
    const fnEnd = source.indexOf('\nexport function ', fnStart + 1);
    const body = source.slice(fnStart, fnEnd);
    expect(body).toContain('return context');
  });

  it('slices textContent to maxChars', () => {
    const fnStart = source.indexOf('export function truncateContextToLimit(');
    const fnEnd = source.indexOf('\nexport function ', fnStart + 1);
    const body = source.slice(fnStart, fnEnd);
    expect(body).toContain('slice(0, maxChars)');
  });

  it('updates charCount after truncation', () => {
    const fnStart = source.indexOf('export function truncateContextToLimit(');
    const fnEnd = source.indexOf('\nexport function ', fnStart + 1);
    const body = source.slice(fnStart, fnEnd);
    expect(body).toContain('charCount: truncated.length');
  });
});

// ---------------------------------------------------------------------------
// formatContextForPrompt
// ---------------------------------------------------------------------------

describe('formatContextForPrompt', () => {
  it('exports formatContextForPrompt function', () => {
    expect(source).toContain('export function formatContextForPrompt(context: DocumentAiContext)');
  });

  it('includes title in output', () => {
    const fnStart = source.indexOf('export function formatContextForPrompt');
    const fnEnd = source.indexOf('\nexport function ', fnStart + 1);
    const body = source.slice(fnStart, fnEnd);
    expect(body).toContain('context.title');
  });

  it('includes pageCount in output', () => {
    const fnStart = source.indexOf('export function formatContextForPrompt');
    const fnEnd = source.indexOf('\nexport function ', fnStart + 1);
    const body = source.slice(fnStart, fnEnd);
    expect(body).toContain('context.pageCount');
  });

  it('includes textContent in output', () => {
    const fnStart = source.indexOf('export function formatContextForPrompt');
    const fnEnd = source.indexOf('\nexport function ', fnStart + 1);
    const body = source.slice(fnStart, fnEnd);
    expect(body).toContain('context.textContent');
  });
});

// ---------------------------------------------------------------------------
// estimateTokenCount
// ---------------------------------------------------------------------------

describe('estimateTokenCount', () => {
  it('exports estimateTokenCount function', () => {
    expect(source).toContain('export function estimateTokenCount(text: string)');
  });

  it('divides by 4 (chars-per-token approximation)', () => {
    const fnStart = source.indexOf('export function estimateTokenCount');
    const fnEnd = source.indexOf('\n}', fnStart) + 2;
    const body = source.slice(fnStart, fnEnd);
    expect(body).toContain('/ 4');
  });

  it('uses Math.ceil to round up', () => {
    const fnStart = source.indexOf('export function estimateTokenCount');
    const fnEnd = source.indexOf('\n}', fnStart) + 2;
    const body = source.slice(fnStart, fnEnd);
    expect(body).toContain('Math.ceil');
  });
});
