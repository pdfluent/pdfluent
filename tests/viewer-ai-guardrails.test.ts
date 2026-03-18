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
const panelSource = readFileSync(
  new URL('../src/viewer/components/AiPanel.tsx', import.meta.url),
  'utf8'
);

// ---------------------------------------------------------------------------
// Context size guardrail
// ---------------------------------------------------------------------------

describe('context size guardrails', () => {
  it('AI_CONTEXT_MAX_CHARS is defined', () => {
    expect(contextSource).toContain('export const AI_CONTEXT_MAX_CHARS');
  });

  it('truncateContextToLimit uses AI_CONTEXT_MAX_CHARS as default', () => {
    const fnStart = contextSource.indexOf('export function truncateContextToLimit');
    const sig = contextSource.slice(fnStart, fnStart + 150);
    expect(sig).toContain('AI_CONTEXT_MAX_CHARS');
  });

  it('buildSummarizationPrompt calls truncateContextToLimit', () => {
    const fnStart = summarizationSource.indexOf('export function buildSummarizationPrompt');
    const fnEnd = summarizationSource.indexOf('\nexport function ', fnStart + 1);
    const body = summarizationSource.slice(fnStart, fnEnd);
    expect(body).toContain('truncateContextToLimit(context)');
  });

  it('buildEntityExtractionPrompt calls truncateContextToLimit', () => {
    const fnStart = entitySource.indexOf('export function buildEntityExtractionPrompt');
    const fnEnd = entitySource.indexOf('\nexport function ', fnStart + 1);
    const body = entitySource.slice(fnStart, fnEnd);
    expect(body).toContain('truncateContextToLimit(context)');
  });

  it('buildAnnotationSuggestionPrompt calls truncateContextToLimit', () => {
    const fnStart = annotationSource.indexOf('export function buildAnnotationSuggestionPrompt');
    const fnEnd = annotationSource.indexOf('\nexport function ', fnStart + 1);
    const body = annotationSource.slice(fnStart, fnEnd);
    expect(body).toContain('truncateContextToLimit(context)');
  });

  it('buildQaPrompt calls truncateContextToLimit', () => {
    const fnStart = qaSource.indexOf('export function buildQaPrompt');
    const fnEnd = qaSource.indexOf('\nexport function ', fnStart + 1);
    const body = qaSource.slice(fnStart, fnEnd);
    expect(body).toContain('truncateContextToLimit(context)');
  });
});

// ---------------------------------------------------------------------------
// Token guardrail
// ---------------------------------------------------------------------------

describe('token count guardrails', () => {
  it('AI_MAX_TOKENS_DEFAULT is exported', () => {
    expect(providerSource).toContain('export const AI_MAX_TOKENS_DEFAULT = 1024');
  });

  it('makeDefaultAiConfig uses AI_MAX_TOKENS_DEFAULT', () => {
    const fnStart = providerSource.indexOf('export function makeDefaultAiConfig');
    const fnEnd = providerSource.indexOf('\n}', fnStart) + 2;
    const body = providerSource.slice(fnStart, fnEnd);
    expect(body).toContain('maxTokens: AI_MAX_TOKENS_DEFAULT');
  });
});

// ---------------------------------------------------------------------------
// Model guardrail
// ---------------------------------------------------------------------------

describe('model guardrails', () => {
  it('AI_DEFAULT_MODEL references haiku model', () => {
    expect(providerSource).toContain('claude-haiku');
  });

  it('AiPanel offers haiku as an option', () => {
    expect(panelSource).toContain('claude-haiku');
  });
});

// ---------------------------------------------------------------------------
// Prompt content guardrails
// ---------------------------------------------------------------------------

describe('prompt content guardrails', () => {
  it('buildSummarizationPrompt includes formatContextForPrompt output', () => {
    const fnStart = summarizationSource.indexOf('export function buildSummarizationPrompt');
    const fnEnd = summarizationSource.indexOf('\nexport function ', fnStart + 1);
    const body = summarizationSource.slice(fnStart, fnEnd);
    expect(body).toContain('formatContextForPrompt(safe)');
  });

  it('buildEntityExtractionPrompt requests JSON-array', () => {
    expect(entitySource).toContain('JSON');
    const fnStart = entitySource.indexOf('export function buildEntityExtractionPrompt');
    const fnEnd = entitySource.indexOf('\nexport function ', fnStart + 1);
    const body = entitySource.slice(fnStart, fnEnd);
    expect(body).toContain('formatContextForPrompt(safe)');
  });

  it('buildAnnotationSuggestionPrompt includes selectedText', () => {
    const fnStart = annotationSource.indexOf('export function buildAnnotationSuggestionPrompt');
    const fnEnd = annotationSource.indexOf('\nexport function ', fnStart + 1);
    const body = annotationSource.slice(fnStart, fnEnd);
    expect(body).toContain('selectedText');
  });

  it('buildQaPrompt includes question', () => {
    const fnStart = qaSource.indexOf('export function buildQaPrompt');
    const fnEnd = qaSource.indexOf('\nexport function ', fnStart + 1);
    const body = qaSource.slice(fnStart, fnEnd);
    expect(body).toContain('question');
  });
});

// ---------------------------------------------------------------------------
// UI guardrails — disabled buttons when not configured
// ---------------------------------------------------------------------------

describe('AiPanel UI guardrails', () => {
  it('shows ai-not-configured-notice when not configured', () => {
    expect(panelSource).toContain('!configured');
    expect(panelSource).toContain('ai-not-configured-notice');
  });

  it('disables buttons when not configured', () => {
    expect(panelSource).toContain('disabled={!configured ||');
  });

  it('annotation button disabled when text is not suggestable', () => {
    expect(panelSource).toContain('isSuggestableText(annotationText)');
  });

  it('ask button disabled when question is not valid', () => {
    expect(panelSource).toContain('isValidQuestion(question)');
  });
});
