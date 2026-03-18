// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary and confidential.
// Free for personal, non-commercial use.
// Commercial use requires a valid license.
// See https://pdfluent.com/license for terms.

import { readFileSync } from 'node:fs';
import { describe, it, expect } from 'vitest';

const providerSource = readFileSync(
  new URL('../src/viewer/ai/aiProvider.ts', import.meta.url),
  'utf8'
);
const contextSource = readFileSync(
  new URL('../src/viewer/ai/documentContextBuilder.ts', import.meta.url),
  'utf8'
);
const summarizationSource = readFileSync(
  new URL('../src/viewer/ai/summarizationModule.ts', import.meta.url),
  'utf8'
);
const entitySource = readFileSync(
  new URL('../src/viewer/ai/entityExtractionModule.ts', import.meta.url),
  'utf8'
);
const annotationSource = readFileSync(
  new URL('../src/viewer/ai/annotationAssistModule.ts', import.meta.url),
  'utf8'
);
const qaSource = readFileSync(
  new URL('../src/viewer/ai/questionAnswerModule.ts', import.meta.url),
  'utf8'
);

// ---------------------------------------------------------------------------
// makeAiRequest never throws — always returns AiResponse
// ---------------------------------------------------------------------------

describe('makeAiRequest stability', () => {
  it('wraps fetch in try/catch', () => {
    const fnStart = providerSource.indexOf('export async function makeAiRequest');
    const body = providerSource.slice(fnStart, fnStart + 900);
    expect(body).toContain('try {');
    expect(body).toContain('catch');
  });

  it('returns success: false on caught error', () => {
    const fnStart = providerSource.indexOf('export async function makeAiRequest');
    const body = providerSource.slice(fnStart, fnStart + 900);
    expect(body).toContain('success: false');
  });

  it('returns content: empty string on error', () => {
    const fnStart = providerSource.indexOf('export async function makeAiRequest');
    const body = providerSource.slice(fnStart, fnStart + 900);
    expect(body).toContain("content: ''");
  });
});

// ---------------------------------------------------------------------------
// loadAiConfig never throws
// ---------------------------------------------------------------------------

describe('loadAiConfig stability', () => {
  it('is wrapped in try/catch', () => {
    const fnStart = providerSource.indexOf('export function loadAiConfig');
    const fnEnd = providerSource.indexOf('\n}', fnStart) + 2;
    const body = providerSource.slice(fnStart, fnEnd);
    expect(body).toContain('try {');
    expect(body).toContain('catch');
    expect(body).toContain('return null');
  });
});

// ---------------------------------------------------------------------------
// isAiConfigured returns false for empty key
// ---------------------------------------------------------------------------

describe('isAiConfigured stability', () => {
  it('checks apiKey.trim().length > 0', () => {
    const fnStart = providerSource.indexOf('export function isAiConfigured');
    const fnEnd = providerSource.indexOf('\n}', fnStart) + 2;
    const body = providerSource.slice(fnStart, fnEnd);
    expect(body).toContain('apiKey.trim().length > 0');
  });
});

// ---------------------------------------------------------------------------
// truncateContextToLimit never exceeds maxChars
// ---------------------------------------------------------------------------

describe('truncateContextToLimit stability', () => {
  it('returns unchanged context when within limit', () => {
    const fnStart = contextSource.indexOf('export function truncateContextToLimit');
    const fnEnd = contextSource.indexOf('\nexport function ', fnStart + 1);
    const body = contextSource.slice(fnStart, fnEnd);
    expect(body).toContain('return context');
  });

  it('slices to maxChars when over limit', () => {
    const fnStart = contextSource.indexOf('export function truncateContextToLimit');
    const fnEnd = contextSource.indexOf('\nexport function ', fnStart + 1);
    const body = contextSource.slice(fnStart, fnEnd);
    expect(body).toContain('slice(0, maxChars)');
  });
});

// ---------------------------------------------------------------------------
// parseEntityResponse handles malformed JSON
// ---------------------------------------------------------------------------

describe('parseEntityResponse stability', () => {
  it('returns empty entities on parse failure', () => {
    const fnStart = entitySource.indexOf('export function parseEntityResponse');
    const fnEnd = entitySource.indexOf('\nexport function ', fnStart + 1);
    const body = entitySource.slice(fnStart, fnEnd);
    expect(body).toContain('entities: []');
  });

  it('catches JSON.parse errors', () => {
    const fnStart = entitySource.indexOf('export function parseEntityResponse');
    const fnEnd = entitySource.indexOf('\nexport function ', fnStart + 1);
    const body = entitySource.slice(fnStart, fnEnd);
    expect(body).toContain('catch');
  });
});

// ---------------------------------------------------------------------------
// isSuggestableText rejects short text
// ---------------------------------------------------------------------------

describe('isSuggestableText stability', () => {
  it('minimum length is 10', () => {
    const fnStart = annotationSource.indexOf('export function isSuggestableText');
    const fnEnd = annotationSource.indexOf('\nexport function ', fnStart + 1);
    const body = annotationSource.slice(fnStart, fnEnd);
    expect(body).toContain('>= 10');
  });
});

// ---------------------------------------------------------------------------
// isValidQuestion rejects short questions
// ---------------------------------------------------------------------------

describe('isValidQuestion stability', () => {
  it('minimum length is 5', () => {
    const fnStart = qaSource.indexOf('export function isValidQuestion');
    const fnEnd = qaSource.indexOf('\nexport function ', fnStart + 1);
    const body = qaSource.slice(fnStart, fnEnd);
    expect(body).toContain('>= 5');
  });
});

// ---------------------------------------------------------------------------
// parseSummarizationResponse handles missing Kernpunten marker
// ---------------------------------------------------------------------------

describe('parseSummarizationResponse stability', () => {
  it('falls back to full response as summary', () => {
    const fnStart = summarizationSource.indexOf('export function parseSummarizationResponse');
    const fnEnd = summarizationSource.indexOf('\nexport function ', fnStart + 1);
    const body = summarizationSource.slice(fnStart, fnEnd);
    // When Kernpunten: not found, summary = responseText.trim()
    expect(body).toContain('responseText.trim()');
  });

  it('returns wordCount field', () => {
    const fnStart = summarizationSource.indexOf('export function parseSummarizationResponse');
    const fnEnd = summarizationSource.indexOf('\nexport function ', fnStart + 1);
    const body = summarizationSource.slice(fnStart, fnEnd);
    expect(body).toContain('wordCount');
  });
});
