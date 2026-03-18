// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary and confidential.
// Free for personal, non-commercial use.
// Commercial use requires a valid license.
// See https://pdfluent.com/license for terms.

import { readFileSync } from 'node:fs';
import { describe, it, expect } from 'vitest';

const source = readFileSync(
  new URL('../src/viewer/ai/questionAnswerModule.ts', import.meta.url),
  'utf8'
);

describe('QaConfidence', () => {
  it('exports QaConfidence type with all values', () => {
    expect(source).toContain("export type QaConfidence = 'high'");
    expect(source).toContain("'medium'");
    expect(source).toContain("'low'");
    expect(source).toContain("'unknown'");
  });
});

describe('QaResult', () => {
  it('declares answer field', () => {
    const s = source.indexOf('interface QaResult');
    const e = source.indexOf('\n}', s) + 2;
    expect(source.slice(s, e)).toContain('answer: string');
  });

  it('declares confidence field', () => {
    const s = source.indexOf('interface QaResult');
    const e = source.indexOf('\n}', s) + 2;
    expect(source.slice(s, e)).toContain('confidence: QaConfidence');
  });
});

describe('QA_SYSTEM_PROMPT', () => {
  it('exports QA_SYSTEM_PROMPT', () => {
    expect(source).toContain('export const QA_SYSTEM_PROMPT');
  });

  it('instructs answering from document only', () => {
    expect(source).toContain('documenttekst');
  });

  it('mentions Dutch language', () => {
    expect(source).toContain('Nederlands');
  });
});

describe('buildQaPrompt', () => {
  it('exports buildQaPrompt function', () => {
    expect(source).toContain('export function buildQaPrompt(question: string, context: DocumentAiContext)');
  });

  it('includes the question in the prompt', () => {
    const fnStart = source.indexOf('export function buildQaPrompt');
    const fnEnd = source.indexOf('\nexport function ', fnStart + 1);
    const body = source.slice(fnStart, fnEnd);
    expect(body).toContain('question');
  });

  it('calls formatContextForPrompt', () => {
    const fnStart = source.indexOf('export function buildQaPrompt');
    const fnEnd = source.indexOf('\nexport function ', fnStart + 1);
    const body = source.slice(fnStart, fnEnd);
    expect(body).toContain('formatContextForPrompt(safe)');
  });
});

describe('parseQaResponse', () => {
  it('exports parseQaResponse function', () => {
    expect(source).toContain('export function parseQaResponse(responseText: string)');
  });

  it('trims response text', () => {
    const fnStart = source.indexOf('export function parseQaResponse');
    const fnEnd = source.indexOf('\nexport function ', fnStart + 1);
    const body = source.slice(fnStart, fnEnd);
    expect(body).toContain('responseText.trim()');
  });

  it('sets confidence to unknown by default', () => {
    const fnStart = source.indexOf('export function parseQaResponse');
    const fnEnd = source.indexOf('\nexport function ', fnStart + 1);
    const body = source.slice(fnStart, fnEnd);
    expect(body).toContain("confidence: 'unknown'");
  });
});

describe('makeQaRequest', () => {
  it('exports makeQaRequest async function', () => {
    expect(source).toContain('export async function makeQaRequest(');
  });

  it('calls makeAiRequest', () => {
    const fnStart = source.indexOf('export async function makeQaRequest');
    const body = source.slice(fnStart, fnStart + 300);
    expect(body).toContain('makeAiRequest(');
  });
});

describe('isValidQuestion', () => {
  it('exports isValidQuestion function', () => {
    expect(source).toContain('export function isValidQuestion(question: string)');
  });

  it('requires at least 5 characters', () => {
    const fnStart = source.indexOf('export function isValidQuestion');
    const fnEnd = source.indexOf('\nexport function ', fnStart + 1);
    const body = source.slice(fnStart, fnEnd);
    expect(body).toContain('>= 5');
  });

  it('trims before checking', () => {
    const fnStart = source.indexOf('export function isValidQuestion');
    const fnEnd = source.indexOf('\nexport function ', fnStart + 1);
    const body = source.slice(fnStart, fnEnd);
    expect(body).toContain('trim()');
  });
});

describe('sanitiseQuestion', () => {
  it('exports sanitiseQuestion function', () => {
    expect(source).toContain('export function sanitiseQuestion(question: string)');
  });

  it('trims whitespace', () => {
    const fnStart = source.indexOf('export function sanitiseQuestion');
    const fnEnd = source.indexOf('\n}', fnStart) + 2;
    const body = source.slice(fnStart, fnEnd);
    expect(body).toContain('trim()');
  });

  it('collapses internal whitespace', () => {
    const fnStart = source.indexOf('export function sanitiseQuestion');
    const fnEnd = source.indexOf('\n}', fnStart) + 2;
    const body = source.slice(fnStart, fnEnd);
    expect(body).toContain("replace(/\\s+/g, ' ')");
  });
});
