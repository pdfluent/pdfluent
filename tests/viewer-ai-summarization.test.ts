// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary and confidential.
// Free for personal, non-commercial use.
// Commercial use requires a valid license.
// See https://pdfluent.com/license for terms.

import { readFileSync } from 'node:fs';
import { describe, it, expect } from 'vitest';

const source = readFileSync(
  new URL('../src/viewer/ai/summarizationModule.ts', import.meta.url),
  'utf8'
);

describe('SummarizationResult', () => {
  it('declares summary field', () => {
    const s = source.indexOf('interface SummarizationResult');
    const e = source.indexOf('\n}', s) + 2;
    expect(source.slice(s, e)).toContain('summary: string');
  });

  it('declares keyPoints field', () => {
    const s = source.indexOf('interface SummarizationResult');
    const e = source.indexOf('\n}', s) + 2;
    expect(source.slice(s, e)).toContain('keyPoints: string[]');
  });

  it('declares wordCount field', () => {
    const s = source.indexOf('interface SummarizationResult');
    const e = source.indexOf('\n}', s) + 2;
    expect(source.slice(s, e)).toContain('wordCount: number');
  });
});

describe('SUMMARIZATION_SYSTEM_PROMPT', () => {
  it('exports SUMMARIZATION_SYSTEM_PROMPT', () => {
    expect(source).toContain('export const SUMMARIZATION_SYSTEM_PROMPT');
  });

  it('mentions Dutch language instruction', () => {
    expect(source).toContain('Nederlands');
  });

  it('mentions Kernpunten format', () => {
    expect(source).toContain('Kernpunten');
  });
});

describe('buildSummarizationPrompt', () => {
  it('exports buildSummarizationPrompt function', () => {
    expect(source).toContain('export function buildSummarizationPrompt(context: DocumentAiContext)');
  });

  it('calls truncateContextToLimit before formatting', () => {
    const fnStart = source.indexOf('export function buildSummarizationPrompt');
    const fnEnd = source.indexOf('\nexport function ', fnStart + 1);
    const body = source.slice(fnStart, fnEnd);
    expect(body).toContain('truncateContextToLimit(context)');
  });

  it('calls formatContextForPrompt', () => {
    const fnStart = source.indexOf('export function buildSummarizationPrompt');
    const fnEnd = source.indexOf('\nexport function ', fnStart + 1);
    const body = source.slice(fnStart, fnEnd);
    expect(body).toContain('formatContextForPrompt(safe)');
  });
});

describe('parseSummarizationResponse', () => {
  it('exports parseSummarizationResponse function', () => {
    expect(source).toContain('export function parseSummarizationResponse(responseText: string)');
  });

  it('looks for Kernpunten: delimiter', () => {
    const fnStart = source.indexOf('export function parseSummarizationResponse');
    const fnEnd = source.indexOf('\nexport function ', fnStart + 1);
    const body = source.slice(fnStart, fnEnd);
    expect(body).toContain('Kernpunten:');
  });

  it('splits bullet points by newline', () => {
    const fnStart = source.indexOf('export function parseSummarizationResponse');
    const fnEnd = source.indexOf('\nexport function ', fnStart + 1);
    const body = source.slice(fnStart, fnEnd);
    expect(body).toContain("split('\\n')");
  });

  it('returns wordCount', () => {
    const fnStart = source.indexOf('export function parseSummarizationResponse');
    const fnEnd = source.indexOf('\nexport function ', fnStart + 1);
    const body = source.slice(fnStart, fnEnd);
    expect(body).toContain('wordCount');
  });
});

describe('makeSummarizationRequest', () => {
  it('exports makeSummarizationRequest function', () => {
    expect(source).toContain('export async function makeSummarizationRequest(');
  });

  it('calls makeAiRequest', () => {
    const fnStart = source.indexOf('export async function makeSummarizationRequest');
    const body = source.slice(fnStart, fnStart + 300);
    expect(body).toContain('makeAiRequest(');
  });
});
