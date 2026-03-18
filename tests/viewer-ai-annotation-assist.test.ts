// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary and confidential.
// Free for personal, non-commercial use.
// Commercial use requires a valid license.
// See https://pdfluent.com/license for terms.

import { readFileSync } from 'node:fs';
import { describe, it, expect } from 'vitest';

const source = readFileSync(
  new URL('../src/viewer/ai/annotationAssistModule.ts', import.meta.url),
  'utf8'
);

describe('AnnotationSuggestion', () => {
  it('declares text field', () => {
    const s = source.indexOf('interface AnnotationSuggestion');
    const e = source.indexOf('\n}', s) + 2;
    expect(source.slice(s, e)).toContain('text: string');
  });

  it('declares type field as comment or highlight', () => {
    const s = source.indexOf('interface AnnotationSuggestion');
    const e = source.indexOf('\n}', s) + 2;
    expect(source.slice(s, e)).toContain("type: 'comment' | 'highlight'");
  });

  it('declares reasoning field', () => {
    const s = source.indexOf('interface AnnotationSuggestion');
    const e = source.indexOf('\n}', s) + 2;
    expect(source.slice(s, e)).toContain('reasoning: string');
  });
});

describe('ANNOTATION_ASSIST_SYSTEM_PROMPT', () => {
  it('exports ANNOTATION_ASSIST_SYSTEM_PROMPT', () => {
    expect(source).toContain('export const ANNOTATION_ASSIST_SYSTEM_PROMPT');
  });

  it('mentions Dutch language', () => {
    expect(source).toContain('Nederlands');
  });
});

describe('buildAnnotationSuggestionPrompt', () => {
  it('exports buildAnnotationSuggestionPrompt function', () => {
    expect(source).toContain('export function buildAnnotationSuggestionPrompt(');
  });

  it('accepts selectedText and context params', () => {
    const fnStart = source.indexOf('export function buildAnnotationSuggestionPrompt(');
    const sig = source.slice(fnStart, fnStart + 150);
    expect(sig).toContain('selectedText: string');
    expect(sig).toContain('context: DocumentAiContext');
  });

  it('includes selectedText in prompt', () => {
    const fnStart = source.indexOf('export function buildAnnotationSuggestionPrompt(');
    const fnEnd = source.indexOf('\nexport function ', fnStart + 1);
    const body = source.slice(fnStart, fnEnd);
    expect(body).toContain('selectedText');
  });

  it('calls formatContextForPrompt', () => {
    const fnStart = source.indexOf('export function buildAnnotationSuggestionPrompt(');
    const fnEnd = source.indexOf('\nexport function ', fnStart + 1);
    const body = source.slice(fnStart, fnEnd);
    expect(body).toContain('formatContextForPrompt(safe)');
  });
});

describe('parseAnnotationSuggestion', () => {
  it('exports parseAnnotationSuggestion function', () => {
    expect(source).toContain('export function parseAnnotationSuggestion(responseText: string)');
  });

  it('trims the response text', () => {
    const fnStart = source.indexOf('export function parseAnnotationSuggestion');
    const fnEnd = source.indexOf('\nexport function ', fnStart + 1);
    const body = source.slice(fnStart, fnEnd);
    expect(body).toContain('responseText.trim()');
  });

  it('defaults type to comment', () => {
    const fnStart = source.indexOf('export function parseAnnotationSuggestion');
    const fnEnd = source.indexOf('\nexport function ', fnStart + 1);
    const body = source.slice(fnStart, fnEnd);
    expect(body).toContain("type: 'comment'");
  });
});

describe('isSuggestableText', () => {
  it('exports isSuggestableText function', () => {
    expect(source).toContain('export function isSuggestableText(text: string)');
  });

  it('requires at least 10 characters', () => {
    const fnStart = source.indexOf('export function isSuggestableText');
    const fnEnd = source.indexOf('\nexport function ', fnStart + 1);
    const body = source.slice(fnStart, fnEnd);
    expect(body).toContain('>= 10');
  });

  it('trims before checking', () => {
    const fnStart = source.indexOf('export function isSuggestableText');
    const fnEnd = source.indexOf('\nexport function ', fnStart + 1);
    const body = source.slice(fnStart, fnEnd);
    expect(body).toContain('trim()');
  });
});

describe('makeAnnotationSuggestionRequest', () => {
  it('exports makeAnnotationSuggestionRequest async function', () => {
    expect(source).toContain('export async function makeAnnotationSuggestionRequest(');
  });

  it('calls makeAiRequest', () => {
    const fnStart = source.indexOf('export async function makeAnnotationSuggestionRequest');
    const body = source.slice(fnStart, fnStart + 300);
    expect(body).toContain('makeAiRequest(');
  });
});
