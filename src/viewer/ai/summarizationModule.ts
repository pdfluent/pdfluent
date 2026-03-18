// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary and confidential.
// Free for personal, non-commercial use.
// Commercial use requires a valid license.
// See https://pdfluent.com/license for terms.

// ---------------------------------------------------------------------------
// Summarization Module
//
// Generates an AI-powered document summary with key points.
// Sends a single user message to the Anthropic API and parses the result.
// ---------------------------------------------------------------------------

import type { AiConfig, AiResponse } from './aiProvider';
import { makeAiRequest } from './aiProvider';
import type { DocumentAiContext } from './documentContextBuilder';
import { formatContextForPrompt, truncateContextToLimit } from './documentContextBuilder';

export interface SummarizationResult {
  /** Main summary paragraph. */
  summary: string;
  /** Extracted key points (bullet list items). */
  keyPoints: string[];
  /** Approximate word count of the summary text. */
  wordCount: number;
}

/** System prompt instructing the model to summarise in Dutch. */
export const SUMMARIZATION_SYSTEM_PROMPT =
  'Je bent een assistent die PDF-documenten samenvat. ' +
  'Geef een korte samenvatting van maximaal 3 alinea\'s en extraheer 3-5 kernpunten als opsomming. ' +
  'Antwoord in het Nederlands. ' +
  'Formaat: eerst de samenvatting, daarna "Kernpunten:" gevolgd door bullet points (-)';

/**
 * Build the user message prompt for summarization.
 * Truncates the context before formatting to stay within limits.
 */
export function buildSummarizationPrompt(context: DocumentAiContext): string {
  const safe = truncateContextToLimit(context);
  return `Vat het volgende document samen:\n\n${formatContextForPrompt(safe)}`;
}

/**
 * Parse the model's text response into a SummarizationResult.
 * Falls back to a plain summary when the expected format is not found.
 */
export function parseSummarizationResponse(responseText: string): SummarizationResult {
  const kernpuntenIdx = responseText.indexOf('Kernpunten:');
  let summary: string;
  let keyPoints: string[] = [];

  if (kernpuntenIdx !== -1) {
    summary = responseText.slice(0, kernpuntenIdx).trim();
    const rest = responseText.slice(kernpuntenIdx + 'Kernpunten:'.length);
    keyPoints = rest
      .split('\n')
      .map(line => line.replace(/^[-•*]\s*/, '').trim())
      .filter(Boolean);
  } else {
    summary = responseText.trim();
  }

  const wordCount = summary.split(/\s+/).filter(Boolean).length;
  return { summary, keyPoints, wordCount };
}

/**
 * Send a summarization request to the AI API.
 */
export async function makeSummarizationRequest(
  context: DocumentAiContext,
  config: AiConfig,
): Promise<AiResponse> {
  const prompt = buildSummarizationPrompt(context);
  return makeAiRequest(
    [
      { role: 'user', content: prompt },
    ],
    config,
  );
}
