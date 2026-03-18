// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary and confidential.
// Free for personal, non-commercial use.
// Commercial use requires a valid license.
// See https://pdfluent.com/license for terms.

// ---------------------------------------------------------------------------
// Annotation Assist Module
//
// Suggests annotation text for a selected passage of document text.
// The suggestion is concise and actionable — suitable as a comment body.
// ---------------------------------------------------------------------------

import type { AiConfig, AiResponse } from './aiProvider';
import { makeAiRequest } from './aiProvider';
import type { DocumentAiContext } from './documentContextBuilder';
import { formatContextForPrompt, truncateContextToLimit } from './documentContextBuilder';

export interface AnnotationSuggestion {
  /** Suggested annotation text. */
  text: string;
  /** Suggested annotation type. */
  type: 'comment' | 'highlight';
  /** Brief explanation of why this suggestion was made. */
  reasoning: string;
}

/** System prompt for annotation suggestions. */
export const ANNOTATION_ASSIST_SYSTEM_PROMPT =
  'Je bent een assistent die helpt bij het annoteren van PDF-documenten. ' +
  'Gegeven een geselecteerde tekstpassage en documentcontext, stel een korte, ' +
  'zinvolle annotatie voor (maximaal 2 zinnen). Antwoord in het Nederlands.';

/**
 * Build the annotation suggestion prompt.
 * Includes the selected text prominently and the broader document context.
 */
export function buildAnnotationSuggestionPrompt(
  selectedText: string,
  context: DocumentAiContext,
): string {
  const safe = truncateContextToLimit(context);
  return [
    `Geselecteerde tekst: "${selectedText}"`,
    '',
    `Documentcontext:\n${formatContextForPrompt(safe)}`,
    '',
    'Stel een annotatie voor voor de geselecteerde tekst.',
  ].join('\n');
}

/**
 * Parse the annotation suggestion response.
 * Falls back to using the raw response as the suggestion text.
 */
export function parseAnnotationSuggestion(responseText: string): AnnotationSuggestion {
  return {
    text: responseText.trim(),
    type: 'comment',
    reasoning: '',
  };
}

/**
 * Return true when the selected text is long enough to suggest an annotation.
 * Minimum length is 10 characters.
 */
export function isSuggestableText(text: string): boolean {
  return text.trim().length >= 10;
}

/**
 * Send an annotation suggestion request to the AI API.
 */
export async function makeAnnotationSuggestionRequest(
  selectedText: string,
  context: DocumentAiContext,
  config: AiConfig,
): Promise<AiResponse> {
  const prompt = buildAnnotationSuggestionPrompt(selectedText, context);
  return makeAiRequest(
    [{ role: 'user', content: prompt }],
    config,
  );
}
