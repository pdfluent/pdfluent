// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary and confidential.
// Free for personal, non-commercial use.
// Commercial use requires a valid license.
// See https://pdfluent.com/license for terms.

/**
 * TextInteractionOverlay
 *
 * Renders visual hover and selection affordances for text targets.
 * Sits between AnnotationOverlay (z=10) and TextLayer (z=20) so that:
 * - Text hover chrome is visible above annotation marks.
 * - Native browser text selection (TextLayer) still works on top.
 *
 * Pure renderer — has no event handlers. Hover state is driven by
 * PageCanvas which intercepts mouse events from the page-view div.
 *
 * Uses the selectionChrome system from Phase 1 for consistent visual style.
 */

import { memo } from 'react';
import { getChromeAttrs, chromeToSvgProps, expandRect } from '../interaction/selectionChrome';
import { pdfRectToDom } from '../text/textInteractionModel';
import type { TextHoverTarget } from '../text/textHoverHitTest';
import type { TextParagraphTarget } from '../text/textInteractionModel';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface TextInteractionOverlayProps {
  /** Whether the overlay should render any affordances. */
  active: boolean;
  /** Currently hovered text target (paragraph/line), or null. */
  hovered: TextHoverTarget | null;
  /** Currently selected paragraph, or null. */
  selected: TextParagraphTarget | null;
  pageHeightPt: number;
  zoom: number;
}

// ---------------------------------------------------------------------------
// Visual constants
// ---------------------------------------------------------------------------

/** Extra padding (DOM pixels) applied around the hover/selection rect. */
const HOVER_PADDING_PX = 2;
const SELECTED_PADDING_PX = 3;

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export const TextInteractionOverlay = memo(function TextInteractionOverlay({
  active,
  hovered,
  selected,
  pageHeightPt,
  zoom,
}: TextInteractionOverlayProps) {
  if (!active) return null;

  return (
    <svg
      data-testid="text-interaction-overlay"
      style={{
        position: 'absolute',
        inset: 0,
        width: '100%',
        height: '100%',
        pointerEvents: 'none',
        overflow: 'visible',
      }}
    >
      {/* Hovered paragraph affordance */}
      {hovered?.paragraph && (
        <HoverRect
          target={hovered.paragraph}
          pageHeightPt={pageHeightPt}
          zoom={zoom}
          padding={HOVER_PADDING_PX}
          state="hover"
          testId="text-hover-rect"
        />
      )}

      {/* Selected paragraph affordance (replaces hover chrome) */}
      {selected && !hovered?.paragraph && (
        <HoverRect
          target={selected}
          pageHeightPt={pageHeightPt}
          zoom={zoom}
          padding={SELECTED_PADDING_PX}
          state="selected"
          testId="text-selected-rect"
        />
      )}

      {/* When both hovered and selected target the same paragraph, show selected chrome */}
      {selected && hovered?.paragraph && hovered.paragraph.id === selected.id && (
        <HoverRect
          target={selected}
          pageHeightPt={pageHeightPt}
          zoom={zoom}
          padding={SELECTED_PADDING_PX}
          state="selected"
          testId="text-selected-rect"
        />
      )}
    </svg>
  );
});

// ---------------------------------------------------------------------------
// HoverRect helper
// ---------------------------------------------------------------------------

interface HoverRectProps {
  target: TextParagraphTarget;
  pageHeightPt: number;
  zoom: number;
  padding: number;
  state: 'hover' | 'selected';
  testId: string;
}

function HoverRect({ target, pageHeightPt, zoom, padding, state, testId }: HoverRectProps) {
  const attrs = getChromeAttrs('text-block', state);
  if (!attrs) return null;

  // Convert PDF rect → DOM coords, then expand by padding
  const domRect = pdfRectToDom(target.rect, pageHeightPt, zoom);
  const expandedPdf = expandRect(
    { x: domRect.left, y: domRect.top, width: domRect.width, height: domRect.height },
    padding,
  );

  return (
    <rect
      data-testid={testId}
      x={expandedPdf.x}
      y={expandedPdf.y}
      width={Math.max(0, expandedPdf.width)}
      height={Math.max(0, expandedPdf.height)}
      {...chromeToSvgProps(attrs)}
    />
  );
}
