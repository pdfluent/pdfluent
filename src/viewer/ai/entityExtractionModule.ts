// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary and confidential.
// Free for personal, non-commercial use.
// Commercial use requires a valid license.
// See https://pdfluent.com/license for terms.

// ---------------------------------------------------------------------------
// Entity Extraction Module
//
// Extracts named entities (persons, organisations, dates, amounts, locations)
// from document text using the Anthropic Messages API.
// The model is instructed to return a JSON array which is then parsed.
// ---------------------------------------------------------------------------

import type { AiConfig, AiResponse } from './aiProvider';
import { makeAiRequest } from './aiProvider';
import type { DocumentAiContext } from './documentContextBuilder';
import { formatContextForPrompt, truncateContextToLimit } from './documentContextBuilder';

export type EntityType = 'person' | 'organization' | 'date' | 'amount' | 'location' | 'other';
export type EntityConfidence = 'high' | 'medium' | 'low';

export interface ExtractedEntity {
  /** The entity text as it appears in the document. */
  text: string;
  /** Semantic type of the entity. */
  type: EntityType;
  /** Model confidence in this entity. */
  confidence: EntityConfidence;
}

export interface EntityExtractionResult {
  /** Extracted entities (may be empty when none found). */
  entities: ExtractedEntity[];
  /** Raw model response text (useful for debugging). */
  rawResponse: string;
}

/** System prompt instructing the model to output a JSON array of entities. */
export const ENTITY_EXTRACTION_SYSTEM_PROMPT =
  'Je bent een assistent die named entities extraheert uit documenten. ' +
  'Retourneer uitsluitend een JSON-array met objecten: ' +
  '[{"text":"...","type":"person|organization|date|amount|location|other","confidence":"high|medium|low"}]. ' +
  'Geen extra tekst, alleen de JSON-array.';

/**
 * Build the entity extraction prompt from the document context.
 */
export function buildEntityExtractionPrompt(context: DocumentAiContext): string {
  const safe = truncateContextToLimit(context);
  return `Extraheer alle named entities uit het volgende document en retourneer ze als JSON-array:\n\n${formatContextForPrompt(safe)}`;
}

/**
 * Parse the JSON array response from the model.
 * Returns an empty entity list on any parse failure.
 */
export function parseEntityResponse(responseText: string): EntityExtractionResult {
  try {
    // Find the first '[' ... ']' block to handle extra preamble text
    const start = responseText.indexOf('[');
    const end = responseText.lastIndexOf(']');
    if (start === -1 || end === -1) {
      return { entities: [], rawResponse: responseText };
    }
    const jsonStr = responseText.slice(start, end + 1);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const parsed = JSON.parse(jsonStr) as any[];
    const entities: ExtractedEntity[] = parsed
      .filter(e => e && typeof e.text === 'string')
      .map(e => ({
        text: String(e.text),
        type: (e.type as EntityType) ?? 'other',
        confidence: (e.confidence as EntityConfidence) ?? 'medium',
      }));
    return { entities, rawResponse: responseText };
  } catch {
    return { entities: [], rawResponse: responseText };
  }
}

/**
 * Group extracted entities by their type for easier UI rendering.
 */
export function groupEntitiesByType(
  entities: ExtractedEntity[],
): Record<EntityType, ExtractedEntity[]> {
  const result: Record<EntityType, ExtractedEntity[]> = {
    person: [],
    organization: [],
    date: [],
    amount: [],
    location: [],
    other: [],
  };
  for (const entity of entities) {
    result[entity.type].push(entity);
  }
  return result;
}

/**
 * Send an entity extraction request to the AI API.
 */
export async function makeEntityExtractionRequest(
  context: DocumentAiContext,
  config: AiConfig,
): Promise<AiResponse> {
  const prompt = buildEntityExtractionPrompt(context);
  return makeAiRequest(
    [{ role: 'user', content: prompt }],
    config,
  );
}
