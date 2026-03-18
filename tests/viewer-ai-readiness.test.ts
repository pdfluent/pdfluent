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
// aiProvider — all public exports
// ---------------------------------------------------------------------------

describe('aiProvider readiness', () => {
  it('exports AiConfig interface', () => {
    expect(providerSource).toContain('export interface AiConfig');
  });

  it('exports AiMessage interface', () => {
    expect(providerSource).toContain('export interface AiMessage');
  });

  it('exports AiResponse interface', () => {
    expect(providerSource).toContain('export interface AiResponse');
  });

  it('exports makeDefaultAiConfig', () => {
    expect(providerSource).toContain('export function makeDefaultAiConfig()');
  });

  it('exports loadAiConfig', () => {
    expect(providerSource).toContain('export function loadAiConfig()');
  });

  it('exports saveAiConfig', () => {
    expect(providerSource).toContain('export function saveAiConfig(');
  });

  it('exports isAiConfigured', () => {
    expect(providerSource).toContain('export function isAiConfigured(');
  });

  it('exports makeAiRequest', () => {
    expect(providerSource).toContain('export async function makeAiRequest(');
  });
});

// ---------------------------------------------------------------------------
// documentContextBuilder — all public exports
// ---------------------------------------------------------------------------

describe('documentContextBuilder readiness', () => {
  it('exports AI_CONTEXT_MAX_CHARS', () => {
    expect(contextSource).toContain('export const AI_CONTEXT_MAX_CHARS');
  });

  it('exports DocumentAiContext interface', () => {
    expect(contextSource).toContain('export interface DocumentAiContext');
  });

  it('exports buildDocumentContext', () => {
    expect(contextSource).toContain('export function buildDocumentContext(');
  });

  it('exports truncateContextToLimit', () => {
    expect(contextSource).toContain('export function truncateContextToLimit(');
  });

  it('exports formatContextForPrompt', () => {
    expect(contextSource).toContain('export function formatContextForPrompt(');
  });

  it('exports estimateTokenCount', () => {
    expect(contextSource).toContain('export function estimateTokenCount(');
  });
});

// ---------------------------------------------------------------------------
// summarizationModule — all public exports
// ---------------------------------------------------------------------------

describe('summarizationModule readiness', () => {
  it('exports SummarizationResult interface', () => {
    expect(summarizationSource).toContain('export interface SummarizationResult');
  });

  it('exports SUMMARIZATION_SYSTEM_PROMPT', () => {
    expect(summarizationSource).toContain('export const SUMMARIZATION_SYSTEM_PROMPT');
  });

  it('exports buildSummarizationPrompt', () => {
    expect(summarizationSource).toContain('export function buildSummarizationPrompt(');
  });

  it('exports parseSummarizationResponse', () => {
    expect(summarizationSource).toContain('export function parseSummarizationResponse(');
  });

  it('exports makeSummarizationRequest', () => {
    expect(summarizationSource).toContain('export async function makeSummarizationRequest(');
  });
});

// ---------------------------------------------------------------------------
// entityExtractionModule — all public exports
// ---------------------------------------------------------------------------

describe('entityExtractionModule readiness', () => {
  it('exports EntityType', () => {
    expect(entitySource).toContain('export type EntityType');
  });

  it('exports ExtractedEntity interface', () => {
    expect(entitySource).toContain('export interface ExtractedEntity');
  });

  it('exports EntityExtractionResult interface', () => {
    expect(entitySource).toContain('export interface EntityExtractionResult');
  });

  it('exports ENTITY_EXTRACTION_SYSTEM_PROMPT', () => {
    expect(entitySource).toContain('export const ENTITY_EXTRACTION_SYSTEM_PROMPT');
  });

  it('exports buildEntityExtractionPrompt', () => {
    expect(entitySource).toContain('export function buildEntityExtractionPrompt(');
  });

  it('exports parseEntityResponse', () => {
    expect(entitySource).toContain('export function parseEntityResponse(');
  });

  it('exports groupEntitiesByType', () => {
    expect(entitySource).toContain('export function groupEntitiesByType(');
  });

  it('exports makeEntityExtractionRequest', () => {
    expect(entitySource).toContain('export async function makeEntityExtractionRequest(');
  });
});

// ---------------------------------------------------------------------------
// annotationAssistModule — all public exports
// ---------------------------------------------------------------------------

describe('annotationAssistModule readiness', () => {
  it('exports AnnotationSuggestion interface', () => {
    expect(annotationSource).toContain('export interface AnnotationSuggestion');
  });

  it('exports ANNOTATION_ASSIST_SYSTEM_PROMPT', () => {
    expect(annotationSource).toContain('export const ANNOTATION_ASSIST_SYSTEM_PROMPT');
  });

  it('exports buildAnnotationSuggestionPrompt', () => {
    expect(annotationSource).toContain('export function buildAnnotationSuggestionPrompt(');
  });

  it('exports parseAnnotationSuggestion', () => {
    expect(annotationSource).toContain('export function parseAnnotationSuggestion(');
  });

  it('exports isSuggestableText', () => {
    expect(annotationSource).toContain('export function isSuggestableText(');
  });

  it('exports makeAnnotationSuggestionRequest', () => {
    expect(annotationSource).toContain('export async function makeAnnotationSuggestionRequest(');
  });
});

// ---------------------------------------------------------------------------
// questionAnswerModule — all public exports
// ---------------------------------------------------------------------------

describe('questionAnswerModule readiness', () => {
  it('exports QaConfidence type', () => {
    expect(qaSource).toContain('export type QaConfidence');
  });

  it('exports QaResult interface', () => {
    expect(qaSource).toContain('export interface QaResult');
  });

  it('exports QA_SYSTEM_PROMPT', () => {
    expect(qaSource).toContain('export const QA_SYSTEM_PROMPT');
  });

  it('exports buildQaPrompt', () => {
    expect(qaSource).toContain('export function buildQaPrompt(');
  });

  it('exports parseQaResponse', () => {
    expect(qaSource).toContain('export function parseQaResponse(');
  });

  it('exports makeQaRequest', () => {
    expect(qaSource).toContain('export async function makeQaRequest(');
  });

  it('exports isValidQuestion', () => {
    expect(qaSource).toContain('export function isValidQuestion(');
  });

  it('exports sanitiseQuestion', () => {
    expect(qaSource).toContain('export function sanitiseQuestion(');
  });
});

// ---------------------------------------------------------------------------
// AiPanel — imports all AI modules
// ---------------------------------------------------------------------------

describe('AiPanel wiring readiness', () => {
  it('imports from aiProvider', () => {
    expect(panelSource).toContain("from '../ai/aiProvider'");
  });

  it('imports from documentContextBuilder', () => {
    expect(panelSource).toContain("from '../ai/documentContextBuilder'");
  });

  it('imports from summarizationModule', () => {
    expect(panelSource).toContain("from '../ai/summarizationModule'");
  });

  it('imports from entityExtractionModule', () => {
    expect(panelSource).toContain("from '../ai/entityExtractionModule'");
  });

  it('imports from annotationAssistModule', () => {
    expect(panelSource).toContain("from '../ai/annotationAssistModule'");
  });

  it('imports from questionAnswerModule', () => {
    expect(panelSource).toContain("from '../ai/questionAnswerModule'");
  });
});
