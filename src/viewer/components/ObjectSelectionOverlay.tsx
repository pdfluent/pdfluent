// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary and confidential.
// Free for personal, non-commercial use.
// Commercial use requires a valid license.
// See https://pdfluent.com/license for terms.

/**
 * Object Selection Overlay — OBJECT_AND_LAYOUT_EDITING_EXCELLENCE_BLOCK Batch 2
 *
 * Renders visual selection and hover affordances for layout objects.
 * Works in PDF page coordinate space; receives a zoom factor and page height
 * to flip Y for DOM rendering (PDF origin is bottom-left, DOM is top-left).
 *
 * Visual elements:
 *   - Hover ring: subtle outline when the pointer is over an object
 *   - Selection box: solid outline + resize handles when an object is selected
 *   - Resize handles: 8 corner/edge handles for resizable objects
 *   - Object type badge: small label indicating the object type
 *
 * Cursor mapping:
 *   - Hovering movable objects: 'grab' / 'move'
 *   - Hovering resize handles: appropriate resize cursors (nwse, nesw, ns, ew)
 *   - Hovering non-movable objects: 'default'
 */

import React from 'react';
import type { LayoutObject, LayoutRect } from '../layout/objectDetection';

// ---------------------------------------------------------------------------
// Handle positions
// ---------------------------------------------------------------------------

export type ResizeHandle =
  | 'nw' | 'n' | 'ne'
  | 'w'  |       'e'
  | 'sw' | 's' | 'se';

export const RESIZE_HANDLES: ResizeHandle[] = ['nw', 'n', 'ne', 'w', 'e', 'sw', 's', 'se'];

export const HANDLE_SIZE = 8; // px

/** CSS cursor for each resize handle direction. */
export const HANDLE_CURSORS: Record<ResizeHandle, string> = {
  nw: 'nwse-resize', n: 'ns-resize',  ne: 'nesw-resize',
  w:  'ew-resize',                     e: 'ew-resize',
  sw: 'nesw-resize', s: 'ns-resize', se: 'nwse-resize',
};

// ---------------------------------------------------------------------------
// Coordinate helpers
// ---------------------------------------------------------------------------

/**
 * Convert a PDF-space rect to DOM pixel coordinates.
 *
 * PDF space: origin bottom-left, y increases upward.
 * DOM space: origin top-left, y increases downward.
 *
 * domX = rect.x * zoom
 * domY = (pageHeightPt - rect.y - rect.height) * zoom
 */
export function pdfRectToDom(
  rect: LayoutRect,
  pageHeightPt: number,
  zoom: number,
): { left: number; top: number; width: number; height: number } {
  return {
    left: rect.x * zoom,
    top: (pageHeightPt - rect.y - rect.height) * zoom,
    width: rect.width * zoom,
    height: rect.height * zoom,
  };
}

/**
 * Compute the DOM position of a resize handle relative to the selection box.
 * Returns left/top offsets within the selection box container.
 */
export function handlePosition(
  handle: ResizeHandle,
  boxWidth: number,
  boxHeight: number,
): { left: number; top: number } {
  const half = HANDLE_SIZE / 2;
  const positions: Record<ResizeHandle, { left: number; top: number }> = {
    nw: { left: -half, top: -half },
    n:  { left: boxWidth / 2 - half, top: -half },
    ne: { left: boxWidth - half, top: -half },
    w:  { left: -half, top: boxHeight / 2 - half },
    e:  { left: boxWidth - half, top: boxHeight / 2 - half },
    sw: { left: -half, top: boxHeight - half },
    s:  { left: boxWidth / 2 - half, top: boxHeight - half },
    se: { left: boxWidth - half, top: boxHeight - half },
  };
  return positions[handle];
}

// ---------------------------------------------------------------------------
// Object type badge labels
// ---------------------------------------------------------------------------

export const OBJECT_TYPE_LABELS: Record<LayoutObject['type'], string> = {
  text_block:      'Tekst',
  image:           'Afbeelding',
  vector_graphics: 'Vectorafbeelding',
  shape:           'Vorm',
  form_widget:     'Formulierveld',
};

/** CSS cursor for a layout object based on its capabilities. */
export function objectCursor(obj: LayoutObject): string {
  if (!obj.movable && !obj.resizable) return 'default';
  return obj.movable ? 'grab' : 'default';
}

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface ObjectSelectionOverlayProps {
  /** All detected objects on this page. */
  objects: readonly LayoutObject[];
  /** Currently hovered object id, or null. */
  hoveredId: string | null;
  /** Currently selected object id, or null. */
  selectedId: string | null;
  /** Active resize handle being dragged, or null. */
  activeHandle: ResizeHandle | null;
  /** Page height in PDF points (for Y-flip). */
  pageHeightPt: number;
  /** Current zoom level. */
  zoom: number;
  /** Called when user hovers over an object. */
  onHover: (id: string | null) => void;
  /** Called when user clicks an object to select it. */
  onSelect: (id: string) => void;
  /** Called when user starts dragging a resize handle. */
  onResizeStart: (id: string, handle: ResizeHandle) => void;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function ObjectSelectionOverlay({
  objects,
  hoveredId,
  selectedId,
  activeHandle: _activeHandle,
  pageHeightPt,
  zoom,
  onHover,
  onSelect,
  onResizeStart,
}: ObjectSelectionOverlayProps): React.ReactElement {
  return (
    <div
      data-testid="object-selection-overlay"
      style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}
    >
      {objects.map(obj => {
        const domRect = pdfRectToDom(obj.rect, pageHeightPt, zoom);
        const isHovered = obj.id === hoveredId;
        const isSelected = obj.id === selectedId;

        return (
          <div
            key={obj.id}
            data-testid={`object-overlay-${obj.id}`}
            data-object-type={obj.type}
            data-selected={isSelected}
            data-hovered={isHovered}
            style={{
              position: 'absolute',
              left: domRect.left,
              top: domRect.top,
              width: domRect.width,
              height: domRect.height,
              pointerEvents: 'all',
              cursor: objectCursor(obj),
              outline: isSelected
                ? '2px solid #2563eb'
                : isHovered
                  ? '1px dashed #94a3b8'
                  : 'none',
              boxSizing: 'border-box',
            }}
            onMouseEnter={() => onHover(obj.id)}
            onMouseLeave={() => onHover(null)}
            onClick={() => onSelect(obj.id)}
          >
            {/* Resize handles — only for selected resizable objects */}
            {isSelected && obj.resizable && RESIZE_HANDLES.map(handle => {
              const pos = handlePosition(handle, domRect.width, domRect.height);
              return (
                <div
                  key={handle}
                  data-testid={`resize-handle-${obj.id}-${handle}`}
                  data-handle={handle}
                  style={{
                    position: 'absolute',
                    left: pos.left,
                    top: pos.top,
                    width: HANDLE_SIZE,
                    height: HANDLE_SIZE,
                    background: '#ffffff',
                    border: '1.5px solid #2563eb',
                    borderRadius: 2,
                    cursor: HANDLE_CURSORS[handle],
                    boxSizing: 'border-box',
                  }}
                  onMouseDown={e => {
                    e.stopPropagation();
                    onResizeStart(obj.id, handle);
                  }}
                />
              );
            })}

            {/* Type badge — only when hovered or selected */}
            {(isHovered || isSelected) && (
              <div
                data-testid={`object-badge-${obj.id}`}
                style={{
                  position: 'absolute',
                  top: -20,
                  left: 0,
                  fontSize: 10,
                  background: '#2563eb',
                  color: '#fff',
                  padding: '1px 4px',
                  borderRadius: 3,
                  whiteSpace: 'nowrap',
                  pointerEvents: 'none',
                }}
              >
                {OBJECT_TYPE_LABELS[obj.type]}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
