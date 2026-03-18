// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary and confidential.
// Free for personal, non-commercial use.
// Commercial use requires a valid license.
// See https://pdfluent.com/license for terms.

// ---------------------------------------------------------------------------
// Document Context Builder
//
// Builds a structured DocumentAiContext from the current editor state.
// The context is passed to AI modules to construct prompts.
// Text content is truncated to AI_CONTEXT_MAX_CHARS to stay within model
// context limits and keep API costs predictable.
// ---------------------------------------------------------------------------

import type { Annotation } from '../../core/document';

/** Maximum characters of document text included in any AI prompt. */
export const AI_CONTEXT_MAX_CHARS = 12_000;

export interface DocumentAiContext {
  /** Document title (from metadata). */
  title: string;
  /** Extracted text content (may be truncated). */
  textContent: string;
  /** Brief summary of annotations present in the document. */
  annotationSummary: string;
  /** Total page count. */
  pageCount: number;
  /** Actual character count of textContent (post-truncation). */
  charCount: number;
}

/**
 * Build a DocumentAiContext from the current editor state.
 * Text spans are joined into a single string; annotations are counted
 * and summarised by type.
 */
export function buildDocumentContext(
  title: string,
  textSpans: string[],
  annotations: Annotation[],
  pageCount: number,
): DocumentAiContext {
  const textContent = textSpans.join(' ').trim();
  const annotationSummary = buildAnnotationSummary(annotations);
  return {
    title: title.trim() || 'Document',
    textContent,
    annotationSummary,
    pageCount,
    charCount: textContent.length,
  };
}

/** Summarise the annotations list into a single human-readable string. */
function buildAnnotationSummary(annotations: Annotation[]): string {
  if (annotations.length === 0) return 'Geen annotaties';
  const total = annotations.length;
  return `${total} annotatie(s)`;
}

/**
 * Truncate textContent to maxChars, updating charCount accordingly.
 * All other fields are preserved unchanged.
 */
export function truncateContextToLimit(
  context: DocumentAiContext,
  maxChars: number = AI_CONTEXT_MAX_CHARS,
): DocumentAiContext {
  if (context.textContent.length <= maxChars) return context;
  const truncated = context.textContent.slice(0, maxChars);
  return { ...context, textContent: truncated, charCount: truncated.length };
}

/**
 * Format a DocumentAiContext as a string suitable for inclusion in a prompt.
 */
export function formatContextForPrompt(context: DocumentAiContext): string {
  return [
    `Titel: ${context.title}`,
    `Pagina's: ${context.pageCount}`,
    `Annotaties: ${context.annotationSummary}`,
    '',
    '--- Documenttekst ---',
    context.textContent || '(geen tekst beschikbaar)',
  ].join('\n');
}

/**
 * Rough token count estimate.
 * Approximation: ~4 characters per token (common heuristic for English/Dutch).
 */
export function estimateTokenCount(text: string): number {
  return Math.ceil(text.length / 4);
}
