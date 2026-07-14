// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary. The PDFluent application is free to use,
// including for commercial purposes. Redistribution, or extraction or reuse
// of its components (including the embedded PDF engine), requires a licence.
// See https://pdfluent.com/license for terms.

import { memo } from 'react';
import { getChromeAttrs, chromeToSvgProps, expandRect } from '../interaction/selectionChrome';
import { pdfRectToDom } from '../text/textInteractionModel';
import type { TextHoverTarget } from '../text/textHoverHitTest';
import type { TextParagraphTarget, PageTextStructure, TextRect } from '../text/textInteractionModel';

export interface TextInteractionOverlayProps {
  active: boolean;
  hovered: TextHoverTarget | null;
  selected: TextParagraphTarget | null;
  pageHeightPt: number;
  zoom: number;
  /** Full page text structure — used to show all paragraph outlines in edit mode. */
  textStructure?: PageTextStructure | null;
  /** When true, dashed outlines are drawn around every text paragraph. */
  isEditMode?: boolean;
  /** When set, this paragraph ID is currently being edited (inline editor is active). */
  editingTargetId?: string | null;
}

const HOVER_PADDING_PX = 2;
const SELECTED_PADDING_PX = 3;

/** Resize handle squares rendered around the selected (non-editing) paragraph. */
function ResizeHandles({ domRect }: { domRect: { left: number; top: number; width: number; height: number } }) {
  const s = 6; // handle size px
  const hs = s / 2;
  const handles = [
    // top-left
    { x: domRect.left - hs,                         y: domRect.top - hs },
    // top-center
    { x: domRect.left + domRect.width / 2 - hs,     y: domRect.top - hs },
    // top-right
    { x: domRect.left + domRect.width - hs,          y: domRect.top - hs },
    // mid-left
    { x: domRect.left - hs,                         y: domRect.top + domRect.height / 2 - hs },
    // mid-right
    { x: domRect.left + domRect.width - hs,          y: domRect.top + domRect.height / 2 - hs },
    // bottom-left
    { x: domRect.left - hs,                         y: domRect.top + domRect.height - hs },
    // bottom-center
    { x: domRect.left + domRect.width / 2 - hs,     y: domRect.top + domRect.height - hs },
    // bottom-right
    { x: domRect.left + domRect.width - hs,          y: domRect.top + domRect.height - hs },
  ];
  return (
    <>
      {handles.map((h, i) => (
        <rect
          key={i}
          x={h.x}
          y={h.y}
          width={s}
          height={s}
          fill="white"
          stroke="rgb(37, 99, 235)"
          strokeWidth={1.5}
          rx={1}
          pointerEvents="none"
        />
      ))}
    </>
  );
}

export const TextInteractionOverlay = memo(function TextInteractionOverlay({
  active,
  hovered,
  selected,
  pageHeightPt,
  zoom,
  textStructure,
  isEditMode = false,
  editingTargetId = null,
}: TextInteractionOverlayProps) {
  if (!active) return null;

  const editTargets = isEditMode && textStructure ? textStructure.spans : [];
  const hoveredEditRect = isEditMode
    ? hovered?.span?.rect ?? hovered?.line.rect ?? null
    : hovered?.paragraph?.rect ?? null;
  const hoveredEditId = isEditMode
    ? hovered?.span?.id ?? hovered?.line.id ?? null
    : hovered?.paragraph?.id ?? null;
  const selectedBaseId = selected?.id.replace(/:edit-span$/, '').replace(/:edit-line$/, '') ?? null;

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
      {/* Edit mode: dashed outlines for precise editable text segments. */}
      {editTargets.map(target => {
        const isSelected = target.id === selectedBaseId;
        const isHovered = target.id === hoveredEditId;
        if (isSelected || isHovered) return null;
        const domRect = pdfRectToDom(target.rect, pageHeightPt, zoom);
        return (
          <rect
            key={target.id}
            data-testid="text-edit-outline"
            x={domRect.left - 1}
            y={domRect.top - 1}
            width={Math.max(0, domRect.width + 2)}
            height={Math.max(0, domRect.height + 2)}
            fill="none"
            stroke="rgba(37,99,235,0.25)"
            strokeWidth={1}
            strokeDasharray="4 3"
            rx={1}
          />
        );
      })}

      {/* Hovered text affordance (only when not selected). */}
      {hoveredEditRect && hoveredEditId !== selectedBaseId && (
        <HoverRect
          rect={hoveredEditRect}
          pageHeightPt={pageHeightPt}
          zoom={zoom}
          padding={HOVER_PADDING_PX}
          state="hover"
          testId="text-hover-rect"
        />
      )}

      {/* Selected or editing paragraph — unified rendering */}
      {selected && (() => {
        const isEditing = selected.id === editingTargetId;
        const domRect = pdfRectToDom(selected.rect, pageHeightPt, zoom);
        const expandedRect = {
          left: domRect.left - SELECTED_PADDING_PX,
          top: domRect.top - SELECTED_PADDING_PX,
          width: domRect.width + SELECTED_PADDING_PX * 2,
          height: domRect.height + SELECTED_PADDING_PX * 2,
        };
        const chromeState = isEditing ? 'editing' : 'selected';
        const attrs = getChromeAttrs('text-block', chromeState);
        if (!attrs) return null;
        return (
          <>
            <rect
              data-testid={isEditing ? 'text-editing-rect' : 'text-selected-rect'}
              x={expandedRect.left}
              y={expandedRect.top}
              width={Math.max(0, expandedRect.width)}
              height={Math.max(0, expandedRect.height)}
              {...chromeToSvgProps(attrs)}
            />
            {!isEditing && <ResizeHandles domRect={expandedRect} />}
          </>
        );
      })()}
    </svg>
  );
});

interface HoverRectProps {
  rect: TextRect;
  pageHeightPt: number;
  zoom: number;
  padding: number;
  state: 'hover' | 'selected';
  testId: string;
}

function HoverRect({ rect, pageHeightPt, zoom, padding, state, testId }: HoverRectProps) {
  const attrs = getChromeAttrs('text-block', state);
  if (!attrs) return null;

  const domRect = pdfRectToDom(rect, pageHeightPt, zoom);
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
