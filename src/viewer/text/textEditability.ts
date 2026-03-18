// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary and confidential.
// Free for personal, non-commercial use.
// Commercial use requires a valid license.
// See https://pdfluent.com/license for terms.

/**
 * Text Editability Model
 *
 * Determines whether a text target can be directly edited inline,
 * and explains why it cannot when editing is not available.
 *
 * Design intent:
 * - Be honest: OCR text is not silently pretending to be writable.
 * - Be specific: show the real reason, not a generic "not editable".
 * - Be future-ready: the structure anticipates new writable target classes.
 *
 * Editability status codes:
 *   'editable'               — Digital text, edit mode, no obstacles.
 *   'ocr-read-only'          — OCR-derived text; selectable but not yet writable.
 *   'protected-mode'         — Edit mode not active (viewer is in read/review/etc.).
 *   'annotation-tool-active' — An annotation drawing tool is active; edit suppressed.
 *   'unsupported-structure'  — The span structure is too complex for inline editing.
 *   'empty-target'           — No text content to edit.
 *   'unknown'                — Editability could not be determined.
 */

import type { TextParagraphTarget } from './textInteractionModel';
import type { ViewerMode } from '../types';
import type { AnnotationTool } from '../components/ModeToolbar';

// ---------------------------------------------------------------------------
// Status codes
// ---------------------------------------------------------------------------

export type TextEditabilityStatus =
  | 'editable'
  | 'ocr-read-only'
  | 'protected-mode'
  | 'annotation-tool-active'
  | 'unsupported-structure'
  | 'empty-target'
  | 'unknown';

// ---------------------------------------------------------------------------
// Result type
// ---------------------------------------------------------------------------

export interface TextEditabilityResult {
  /** Whether inline editing is available. */
  status: TextEditabilityStatus;
  /** Short machine-readable reason code. */
  reason: string;
  /**
   * Human-readable label suitable for tooltip or status message.
   * Written in Dutch to match the app's UI language.
   */
  label: string;
  /** Whether this target can at minimum be selected (even if not editable). */
  selectable: boolean;
}

// ---------------------------------------------------------------------------
// Status → label map
// ---------------------------------------------------------------------------

const STATUS_LABELS: Record<TextEditabilityStatus, string> = {
  'editable': 'Tekst bewerken',
  'ocr-read-only': 'OCR-tekst is selecteerbaar maar nog niet bewerkbaar',
  'protected-mode': 'Schakel over naar bewerkingsmodus om tekst te bewerken',
  'annotation-tool-active': 'Deactiveer het annotatiegereedschap om tekst te bewerken',
  'unsupported-structure': 'Complexe tekststructuur — inline bewerking niet beschikbaar',
  'empty-target': 'Leeg tekstblok — niets te bewerken',
  'unknown': 'Bewerkbaarheid kon niet worden bepaald',
};

// ---------------------------------------------------------------------------
// Core resolver
// ---------------------------------------------------------------------------

/**
 * Determine the editability of a text paragraph target.
 *
 * @param target     - The paragraph to evaluate.
 * @param mode       - Current viewer mode.
 * @param activeTool - Active annotation tool (or null).
 */
export function getEditability(
  target: TextParagraphTarget,
  mode: ViewerMode,
  activeTool: AnnotationTool | null,
): TextEditabilityResult {
  // Any active annotation tool suppresses edit entry
  if (activeTool !== null) {
    return result('annotation-tool-active');
  }

  // Only edit mode allows text mutation
  if (mode !== 'edit') {
    return result('protected-mode');
  }

  // Empty target — nothing to edit
  const text = extractText(target);
  if (text.trim().length === 0) {
    return result('empty-target');
  }

  // OCR-derived text is read-only in Phase 3
  if (target.source === 'ocr') {
    return result('ocr-read-only', true);
  }

  // Complex structures: single-span targets are always safe;
  // multi-line paragraphs with many fragments are flagged as unsupported
  // only when the structure is genuinely problematic (> 50 spans).
  const spanCount = target.lines.reduce((n, l) => n + l.spans.length, 0);
  if (spanCount > 50) {
    return result('unsupported-structure');
  }

  // All checks passed — target is editable
  return result('editable');
}

// ---------------------------------------------------------------------------
// Convenience predicates
// ---------------------------------------------------------------------------

/** True when the target can enter inline edit mode. */
export function isEditable(
  target: TextParagraphTarget,
  mode: ViewerMode,
  activeTool: AnnotationTool | null,
): boolean {
  return getEditability(target, mode, activeTool).status === 'editable';
}

/** True when the target can be selected (hover + click), even if not editable. */
export function isSelectable(
  target: TextParagraphTarget,
  mode: ViewerMode,
  activeTool: AnnotationTool | null,
): boolean {
  return getEditability(target, mode, activeTool).selectable;
}

/** True when the target is OCR-derived (and therefore read-only). */
export function isOcrReadOnly(target: TextParagraphTarget): boolean {
  return target.source === 'ocr';
}

/**
 * Return a short, user-facing label for a status code.
 * Used in tooltips, disabled-state affordances, and status messages.
 */
export function getEditabilityLabel(status: TextEditabilityStatus): string {
  return STATUS_LABELS[status];
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function result(status: TextEditabilityStatus, selectable = false): TextEditabilityResult {
  return {
    status,
    reason: status,
    label: STATUS_LABELS[status],
    // editable targets are always selectable; some non-editable ones too
    selectable: status === 'editable' || selectable,
  };
}

/** Extract the full text content from a paragraph (for empty-target detection). */
export function extractText(target: TextParagraphTarget): string {
  return target.lines
    .flatMap(l => l.spans.map(s => s.text))
    .join(' ');
}
