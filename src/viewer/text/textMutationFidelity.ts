// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary and confidential.
// Free for personal, non-commercial use.
// Commercial use requires a valid license.
// See https://pdfluent.com/license for terms.

/**
 * Text Mutation Fidelity Validator — Phase 5 Batch 2
 *
 * Provides automated heuristic checks to validate that a text replacement
 * will not cause visible layout degradation.
 *
 * Checks:
 *   baseline alignment  — replacement is same-or-shorter: no baseline shift
 *   bounding box        — replacement bbox stays within original bbox tolerance
 *   glyph width overflow — replacement character count vs original slot width
 *   line wrap integrity — no word wrap triggered (replacement fits in line)
 *   adjacent collision  — replacement width does not overflow container
 *
 * Design:
 *   - All checks are heuristics based on character count + bounding box metrics.
 *   - No actual glyph rendering occurs here (deferred to Rust backend).
 *   - When the Rust backend provides glyph metrics, these checks can be tightened.
 *   - Phase 4 MVP constraint: replacement ≤ original length — enforced here too.
 *
 * A fidelity result with pass=true is a precondition for dispatching the
 * mutation to the Tauri backend. A failing check should surface via
 * textMutationMessaging before the IPC call is made.
 */

import type { TextParagraphTarget } from './textInteractionModel';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface FidelityCheckResult {
  /** Whether all fidelity checks passed. */
  readonly pass: boolean;
  /** Machine-readable failure code, or null when pass=true. */
  readonly failCode: FidelityFailCode | null;
  /** Human-readable description of the check result (Dutch). */
  readonly message: string;
  /** Detailed per-check breakdown. */
  readonly checks: FidelityCheckBreakdown;
}

export type FidelityFailCode =
  | 'replacement-too-long'
  | 'bbox-overflow'
  | 'glyph-width-overflow'
  | 'line-wrap-risk'
  | 'empty-replacement';

export interface FidelityCheckBreakdown {
  readonly baselineAligned: boolean;
  readonly bboxConsistent: boolean;
  readonly glyphWidthSafe: boolean;
  readonly lineWrapSafe: boolean;
  readonly noCollision: boolean;
}

/**
 * Tolerance factor for bounding box comparison.
 * A replacement up to (1 + BBOX_TOLERANCE) × original width is considered safe.
 * In Phase 4 MVP this is 0 (equal-or-shorter only); expanded in later phases.
 */
export const BBOX_TOLERANCE = 0.0;

/**
 * Estimated average character width as a fraction of fontSize.
 * Used to estimate rendered width from character count when no glyph metrics
 * are available. Typical value for proportional Latin fonts: ~0.55.
 */
export const ESTIMATED_CHAR_WIDTH_RATIO = 0.55;

// ---------------------------------------------------------------------------
// Main validator
// ---------------------------------------------------------------------------

/**
 * Run all fidelity checks for a proposed text replacement.
 *
 * @param target     The paragraph target being edited.
 * @param original   The current text in the PDF content stream.
 * @param replacement The proposed replacement text.
 */
export function checkMutationFidelity(
  target: TextParagraphTarget,
  original: string,
  replacement: string,
): FidelityCheckResult {
  // Guard: empty replacement is never safe (avoid invisible text)
  if (replacement.length === 0 && original.length > 0) {
    return {
      pass: false,
      failCode: 'empty-replacement',
      message: 'Vervangtekst mag niet leeg zijn.',
      checks: {
        baselineAligned: false,
        bboxConsistent: false,
        glyphWidthSafe: false,
        lineWrapSafe: false,
        noCollision: false,
      },
    };
  }

  // Baseline alignment: replacement is same-or-shorter → no descender shift
  const baselineAligned = replacement.length <= original.length;

  // Bounding box consistency: replacement estimated width vs original bbox
  const span = target.lines[0]?.spans[0];
  const containerWidth = span ? span.rect.width : target.rect.width;
  const fontSize = span?.fontSize ?? 12;
  const estimatedOriginalWidth = original.length * fontSize * ESTIMATED_CHAR_WIDTH_RATIO;
  const estimatedReplacementWidth = replacement.length * fontSize * ESTIMATED_CHAR_WIDTH_RATIO;
  const bboxConsistent =
    estimatedReplacementWidth <= estimatedOriginalWidth * (1 + BBOX_TOLERANCE);

  // Glyph width overflow: replacement width vs container width
  const glyphWidthSafe = estimatedReplacementWidth <= containerWidth;

  // Line wrap integrity: replacement on the same line (same-or-shorter = no wrap)
  const lineWrapSafe = replacement.length <= original.length;

  // Adjacent collision: no overflow beyond container
  const noCollision = estimatedReplacementWidth <= containerWidth;

  const breakdown: FidelityCheckBreakdown = {
    baselineAligned,
    bboxConsistent,
    glyphWidthSafe,
    lineWrapSafe,
    noCollision,
  };

  if (!baselineAligned || !bboxConsistent) {
    return {
      pass: false,
      failCode: 'replacement-too-long',
      message: 'Vervangtekst is te lang en zou de lay-out verstoren.',
      checks: breakdown,
    };
  }

  if (!glyphWidthSafe || !noCollision) {
    return {
      pass: false,
      failCode: 'bbox-overflow',
      message: 'Vervangtekst overschrijdt het tekstkader.',
      checks: breakdown,
    };
  }

  if (!lineWrapSafe) {
    return {
      pass: false,
      failCode: 'line-wrap-risk',
      message: 'Vervangtekst zou regelafbreking veroorzaken.',
      checks: breakdown,
    };
  }

  return {
    pass: true,
    failCode: null,
    message: 'Lay-outcontrole geslaagd — vervanging is visueel veilig.',
    checks: breakdown,
  };
}

// ---------------------------------------------------------------------------
// Convenience predicates
// ---------------------------------------------------------------------------

/**
 * Returns true when the replacement is guaranteed safe by all fidelity checks.
 */
export function isFidelitySafe(
  target: TextParagraphTarget,
  original: string,
  replacement: string,
): boolean {
  return checkMutationFidelity(target, original, replacement).pass;
}

/**
 * Estimate the rendered width of text in a given font size.
 * Uses the ESTIMATED_CHAR_WIDTH_RATIO heuristic.
 * Returns width in the same unit as fontSize (typically pt).
 */
export function estimateTextWidth(text: string, fontSize: number): number {
  return text.length * fontSize * ESTIMATED_CHAR_WIDTH_RATIO;
}
