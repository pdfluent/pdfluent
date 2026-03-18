// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary and confidential.
// Free for personal, non-commercial use.
// Commercial use requires a valid license.
// See https://pdfluent.com/license for terms.

/**
 * Mode-specific text interaction rules.
 *
 * Defines exactly when and how text hover affordances are active,
 * preventing them from overpowering other mode-specific interactions.
 *
 * Rules per mode:
 *
 * 'read'     — No text affordance. The reader should not distract the user
 *              with hover chrome during passive reading.
 *
 * 'review'   — Annotation interactions take priority. Text hover is suppressed
 *              so that clicking near annotations selects annotations, not text.
 *
 * 'edit'     — Full text hover affordance: paragraph/line targeting with
 *              selection chrome and the contextual action bar.
 *
 * 'forms'    — Text hover is suppressed. Form field affordances have priority
 *              over text blocks on the same page.
 *
 * 'protect'  — Partial: text targeting is allowed to support redaction
 *              discoverability (users should be able to target text for
 *              redaction). No selection chrome, hover-only.
 *
 * 'organize' — No text interaction (page thumbnails, not page content).
 *
 * 'convert'  — No text interaction (conversion is a batch operation).
 */

import type { ViewerMode } from '../types';
import type { AnnotationTool } from '../components/ModeToolbar';

// ---------------------------------------------------------------------------
// Text interaction level
// ---------------------------------------------------------------------------

/**
 * The level of text interaction affordance to show.
 *
 * 'none'     — No overlay, no hit testing, no cursor change.
 * 'hover'    — Show hover chrome only (no click-to-select, no context bar).
 * 'full'     — Full affordance: hover chrome + click-to-select + context bar.
 */
export type TextInteractionLevel = 'none' | 'hover' | 'full';

// ---------------------------------------------------------------------------
// Rule definitions
// ---------------------------------------------------------------------------

/** Interaction rule for a specific mode, optionally narrowed by active tool. */
export interface TextInteractionRule {
  level: TextInteractionLevel;
  /** Human-readable reason for the rule. Used in tests and debug output. */
  reason: string;
}

// ---------------------------------------------------------------------------
// Core rule resolver
// ---------------------------------------------------------------------------

/**
 * Return the text interaction rule for the given mode and tool combination.
 *
 * @param mode       - The active viewer mode.
 * @param activeTool - The active annotation tool (or null if none).
 */
export function getTextInteractionRule(
  mode: ViewerMode,
  activeTool: AnnotationTool | null,
): TextInteractionRule {
  // Any active annotation drawing tool suppresses text interaction globally.
  // Drawing takes full pointer event priority.
  if (activeTool !== null) {
    return {
      level: 'none',
      reason: `Annotation tool '${activeTool}' is active — text interaction suppressed`,
    };
  }

  switch (mode) {
    case 'edit':
      return {
        level: 'full',
        reason: 'Edit mode: full text targeting (hover + select + context bar)',
      };

    case 'protect':
      return {
        level: 'hover',
        reason: 'Protect mode: hover-only text targeting for redaction discoverability',
      };

    case 'review':
      return {
        level: 'none',
        reason: 'Review mode: annotation interactions take priority over text',
      };

    case 'forms':
      return {
        level: 'none',
        reason: 'Forms mode: form field affordances take priority over text blocks',
      };

    case 'read':
      return {
        level: 'none',
        reason: 'Read mode: no text affordance to avoid distracting passive readers',
      };

    case 'organize':
      return {
        level: 'none',
        reason: 'Organize mode: page thumbnail view, no inline text interaction',
      };

    case 'convert':
      return {
        level: 'none',
        reason: 'Convert mode: batch operation, no text interaction',
      };

    default:
      return {
        level: 'none',
        reason: `Unknown mode '${mode}': defaulting to none`,
      };
  }
}

// ---------------------------------------------------------------------------
// Convenience predicates
// ---------------------------------------------------------------------------

/** True when any text hover affordance should be shown. */
export function isTextInteractionActive(
  mode: ViewerMode,
  activeTool: AnnotationTool | null,
): boolean {
  const rule = getTextInteractionRule(mode, activeTool);
  return rule.level !== 'none';
}

/** True when click-to-select and the context bar should be shown. */
export function isFullTextInteractionActive(
  mode: ViewerMode,
  activeTool: AnnotationTool | null,
): boolean {
  const rule = getTextInteractionRule(mode, activeTool);
  return rule.level === 'full';
}

/** True when only hover chrome (no selection, no context bar) should be shown. */
export function isHoverOnlyTextInteractionActive(
  mode: ViewerMode,
  activeTool: AnnotationTool | null,
): boolean {
  const rule = getTextInteractionRule(mode, activeTool);
  return rule.level === 'hover';
}
