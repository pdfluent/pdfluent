// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary and confidential.
// Free for personal, non-commercial use.
// Commercial use requires a valid license.
// See https://pdfluent.com/license for terms.

// ---------------------------------------------------------------------------
// Question & Answer Module
//
// Answers natural-language questions about the document's content.
// The model is instructed to answer ONLY from the document context and to
// indicate low confidence when the answer is not in the document.
// ---------------------------------------------------------------------------

import type { AiConfig, AiResponse } from './aiProvider';
import { makeAiRequest } from './aiProvider';
import type { DocumentAiContext } from './documentContextBuilder';
import { formatContextForPrompt, truncateContextToLimit } from './documentContextBuilder';

export type QaConfidence = 'high' | 'medium' | 'low' | 'unknown';

export interface QaResult {
  /** The answer to the question. */
  answer: string;
  /** Model confidence in the answer. */
  confidence: QaConfidence;
}

/** System prompt instructing the model to answer from document context only. */
export const QA_SYSTEM_PROMPT =
  'Je bent een assistent die vragen beantwoordt over PDF-documenten. ' +
  'Beantwoord uitsluitend op basis van de meegeleverde documenttekst. ' +
  'Als het antwoord niet in het document staat, zeg dat dan expliciet. ' +
  'Antwoord in het Nederlands. Wees beknopt.';

/**
 * Build the Q&A prompt from a question and document context.
 */
export function buildQaPrompt(question: string, context: DocumentAiContext): string {
  const safe = truncateContextToLimit(context);
  return [
    `Vraag: ${question}`,
    '',
    `Documentcontext:\n${formatContextForPrompt(safe)}`,
  ].join('\n');
}

/**
 * Parse the Q&A response into a QaResult.
 * Confidence is set to 'unknown' (callers can upgrade based on response text).
 */
export function parseQaResponse(responseText: string): QaResult {
  return {
    answer: responseText.trim(),
    confidence: 'unknown',
  };
}

/**
 * Send a Q&A request to the AI API.
 */
export async function makeQaRequest(
  question: string,
  context: DocumentAiContext,
  config: AiConfig,
): Promise<AiResponse> {
  const prompt = buildQaPrompt(question, context);
  return makeAiRequest(
    [{ role: 'user', content: prompt }],
    config,
  );
}

/**
 * Return true when the question is non-empty and at least 5 characters.
 */
export function isValidQuestion(question: string): boolean {
  return question.trim().length >= 5;
}

/**
 * Trim and collapse internal whitespace in a question string.
 */
export function sanitiseQuestion(question: string): string {
  return question.trim().replace(/\s+/g, ' ');
}
