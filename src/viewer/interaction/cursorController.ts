// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary and confidential.
// Free for personal, non-commercial use.
// Commercial use requires a valid license.
// See https://pdfluent.com/license for terms.

/**
 * Cursor language for PDFluent viewer.
 *
 * Centralises all cursor decisions so that:
 * - No ad-hoc cursor strings appear in components.
 * - Mode + tool combinations are documented in one place.
 * - Cursors can be changed globally without hunting through components.
 */

import type { InteractionState } from './interactionState';

// ---------------------------------------------------------------------------
// Cursor types
// ---------------------------------------------------------------------------

export type ViewerCursor =
  | 'default'
  | 'pointer'
  | 'text'
  | 'move'
  | 'resize-nw'
  | 'resize-ne'
  | 'resize-se'
  | 'resize-sw'
  | 'resize-h'
  | 'resize-v'
  | 'grab'
  | 'grabbing'
  | 'crosshair'
  | 'edit'
  | 'not-allowed'
  | 'zoom-in'
  | 'zoom-out';

/** Maps ViewerCursor to the actual CSS cursor value. */
export const CURSOR_CSS_MAP: Readonly<Record<ViewerCursor, React.CSSProperties['cursor']>> = {
  'default': 'default',
  'pointer': 'pointer',
  'text': 'text',
  'move': 'move',
  'resize-nw': 'nw-resize',
  'resize-ne': 'ne-resize',
  'resize-se': 'se-resize',
  'resize-sw': 'sw-resize',
  'resize-h': 'ew-resize',
  'resize-v': 'ns-resize',
  'grab': 'grab',
  'grabbing': 'grabbing',
  'crosshair': 'crosshair',
  'edit': 'text',
  'not-allowed': 'not-allowed',
  'zoom-in': 'zoom-in',
  'zoom-out': 'zoom-out',
};

// ---------------------------------------------------------------------------
// Tool → cursor mapping
// ---------------------------------------------------------------------------

export type AnnotationToolName =
  | 'highlight'
  | 'underline'
  | 'strikeout'
  | 'rectangle'
  | 'redaction'
  | 'freehand'
  | 'stamp'
  | 'comment'
  | null;

/**
 * Return the appropriate cursor for a given annotation tool.
 * Replaces ad-hoc switch statements in PageCanvas and ModeToolbar.
 */
export function getCursorForTool(tool: AnnotationToolName): ViewerCursor {
  switch (tool) {
    case 'highlight':
    case 'underline':
    case 'strikeout':
      return 'text';
    case 'rectangle':
      return 'crosshair';
    case 'redaction':
      return 'crosshair';
    case 'freehand':
      return 'edit';
    case 'stamp':
      return 'crosshair';
    case 'comment':
      return 'pointer';
    case null:
    default:
      return 'default';
  }
}

// ---------------------------------------------------------------------------
// Interaction state → cursor mapping
// ---------------------------------------------------------------------------

export type TargetObjectKind =
  | 'annotation'
  | 'form-field'
  | 'text-block'
  | 'page-thumbnail'
  | 'selection-handle'
  | 'canvas'
  | 'button';

/**
 * Return the cursor for a given target object in a given interaction state.
 * Used by components rendering selectable / hoverable objects.
 */
export function getCursorForInteraction(
  kind: TargetObjectKind,
  state: InteractionState,
): ViewerCursor {
  if (state === 'disabled') return 'not-allowed';
  if (state === 'dragging') return 'grabbing';

  switch (kind) {
    case 'annotation':
      return state === 'selected' ? 'move' : 'pointer';
    case 'form-field':
      return state === 'selected' || state === 'editing' ? 'text' : 'pointer';
    case 'text-block':
      return 'text';
    case 'page-thumbnail':
      return state === 'selected' ? 'grab' : 'pointer';
    case 'selection-handle':
      return 'resize-se'; // Default corner handle; directional handles override.
    case 'canvas':
      return 'default';
    case 'button':
      return 'pointer';
    default:
      return 'default';
  }
}

// ---------------------------------------------------------------------------
// DOM helper
// ---------------------------------------------------------------------------

/**
 * Apply a ViewerCursor to a DOM element.
 * Prefer letting React manage cursor via style props where possible;
 * use this only for imperative cursor changes (e.g. drag events).
 */
export function applyDomCursor(
  element: HTMLElement,
  cursor: ViewerCursor,
): void {
  const css = CURSOR_CSS_MAP[cursor];
  element.style.cursor = css as string;
}

/**
 * Reset cursor to default on a DOM element.
 */
export function resetDomCursor(element: HTMLElement): void {
  element.style.cursor = '';
}

/**
 * Return the CSS cursor string for a ViewerCursor.
 * Use when you need the raw CSS value (e.g. for style objects).
 */
export function toCssCursor(cursor: ViewerCursor): React.CSSProperties['cursor'] {
  return CURSOR_CSS_MAP[cursor];
}
