// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary and confidential.
// Free for personal, non-commercial use.
// Commercial use requires a valid license.
// See https://pdfluent.com/license for terms.

import { useState } from 'react';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface AnnotationMark {
  id: string;
  rect: { x: number; y: number; width: number; height: number };
  /** CSS color string from the PDF annotation (e.g. 'rgb(r,g,b)' or '#FFD700'). */
  color: string;
  /** PDF annotation type — drives type-specific visual rendering. */
  type?: string;
}

interface AnnotationOverlayProps {
  highlights: Array<{ x: number; y: number; width: number; height: number }>;
  pageWidthPt: number;
  pageHeightPt: number;
  zoom: number;
  /** All annotations on this page — rendered as clickable markers behind the active highlight. */
  clickableAnnotations?: AnnotationMark[];
  /** Called when the user clicks an annotation marker. */
  onAnnotationClick?: (annotationId: string) => void;
  /** Search result rectangles for the current page — rendered as semi-transparent yellow highlights. */
  searchHighlights?: Array<{ x: number; y: number; width: number; height: number }>;
  /** Index within searchHighlights that is the active result (orange highlight). */
  activeSearchHighlightIdx?: number;
  /** ID of the currently selected annotation — rendered with a distinct outline. */
  selectedAnnotationId?: string | null;
  /** Draft rectangle for the rectangle annotation tool — in PDF coords, shown as a preview outline. */
  draftRect?: { x: number; y: number; width: number; height: number } | null;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function AnnotationOverlay({
  highlights,
  pageWidthPt: _pageWidthPt,
  pageHeightPt,
  zoom,
  clickableAnnotations = [],
  onAnnotationClick,
  searchHighlights = [],
  activeSearchHighlightIdx = -1,
  selectedAnnotationId = null,
  draftRect = null,
}: AnnotationOverlayProps) {
  const [hoveredMarkId, setHoveredMarkId] = useState<string | null>(null);

  return (
    <svg
      data-testid="annotation-overlay"
      style={{
        position: 'absolute',
        inset: 0,
        width: '100%',
        height: '100%',
        pointerEvents: 'none',
        overflow: 'visible',
      }}
    >
      {/* Search highlights — rendered at the bottom so other overlays stay dominant */}
      {searchHighlights.map((h, idx) => {
        const isActive = idx === activeSearchHighlightIdx;
        const domX = h.x * zoom;
        const domY = (pageHeightPt - h.y - h.height) * zoom;
        const domW = h.width * zoom;
        const domH = h.height * zoom;
        return (
          <rect
            key={`search-${idx}`}
            className="search-highlight"
            x={domX}
            y={domY}
            width={domW}
            height={domH}
            fill={isActive ? 'orange' : 'yellow'}
            fillOpacity={isActive ? '1' : '0.2'}
            stroke={isActive ? 'orange' : 'none'}
            rx="2"
          />
        );
      })}

      {/* Clickable annotation markers — type-specific rendering */}
      {clickableAnnotations.map((mark) => {
        const domX = mark.rect.x * zoom;
        const domY = (pageHeightPt - mark.rect.y - mark.rect.height) * zoom;
        const domW = mark.rect.width * zoom;
        const domH = mark.rect.height * zoom;
        const isSelected = mark.id === selectedAnnotationId;
        const isHovered = mark.id === hoveredMarkId;
        const t = mark.type ?? 'text';
        const hoverHandlers = {
          onMouseEnter: () => setHoveredMarkId(mark.id),
          onMouseLeave: () => setHoveredMarkId(null),
        };

        if (t === 'underline') {
          // Underline: thin colored line at the bottom of the rect
          const lineY = domY + domH;
          return (
            <line
              key={mark.id}
              data-testid="annotation-marker"
              x1={domX}
              y1={lineY}
              x2={domX + domW}
              y2={lineY}
              stroke={mark.color}
              strokeWidth={isSelected ? 2.5 : isHovered ? 2 : 1.5}
              strokeOpacity={isHovered ? '1' : '0.9'}
              style={{ pointerEvents: 'auto', cursor: 'pointer' }}
              onClick={() => { onAnnotationClick?.(mark.id); }}
              {...hoverHandlers}
            />
          );
        }

        if (t === 'strikeout') {
          // Strikeout: thin colored line through the middle of the rect
          const midY = domY + domH / 2;
          return (
            <line
              key={mark.id}
              data-testid="annotation-marker"
              x1={domX}
              y1={midY}
              x2={domX + domW}
              y2={midY}
              stroke={mark.color}
              strokeWidth={isSelected ? 2.5 : isHovered ? 2 : 1.5}
              strokeOpacity={isHovered ? '1' : '0.9'}
              style={{ pointerEvents: 'auto', cursor: 'pointer' }}
              onClick={() => { onAnnotationClick?.(mark.id); }}
              {...hoverHandlers}
            />
          );
        }

        if (t === 'square' || t === 'rectangle') {
          // Rectangle: outline with light fill
          return (
            <rect
              key={mark.id}
              data-testid="annotation-marker"
              x={domX}
              y={domY}
              width={domW}
              height={domH}
              fill={mark.color}
              fillOpacity={isHovered ? '0.15' : '0.08'}
              stroke={mark.color}
              strokeOpacity={isSelected ? '1' : isHovered ? '0.9' : '0.75'}
              strokeWidth={isSelected ? 2 : 1.5}
              rx="1"
              style={{ pointerEvents: 'auto', cursor: 'pointer' }}
              onClick={() => { onAnnotationClick?.(mark.id); }}
              {...hoverHandlers}
            />
          );
        }

        if (t === 'redaction') {
          // Redaction: solid black preview rectangle with dashed border
          return (
            <rect
              key={mark.id}
              data-testid="annotation-marker"
              data-redaction="true"
              x={domX}
              y={domY}
              width={domW}
              height={domH}
              fill="black"
              fillOpacity={isHovered ? '0.85' : '0.7'}
              stroke="black"
              strokeOpacity={isSelected ? '1' : '0.9'}
              strokeWidth={isSelected ? 2 : 1}
              strokeDasharray={isSelected ? 'none' : '4 2'}
              rx="0"
              style={{ pointerEvents: 'auto', cursor: 'pointer' }}
              onClick={() => { onAnnotationClick?.(mark.id); }}
              {...hoverHandlers}
            />
          );
        }

        if (t === 'highlight') {
          // Highlight: filled rect with annotation color at 40% opacity
          return (
            <rect
              key={mark.id}
              data-testid="annotation-marker"
              x={domX}
              y={domY}
              width={domW}
              height={domH}
              fill={mark.color}
              fillOpacity={isHovered ? '0.55' : '0.40'}
              stroke={isSelected ? mark.color : 'none'}
              strokeOpacity={isSelected ? '0.9' : '0'}
              strokeWidth={isSelected ? 1.5 : 0}
              rx="1"
              style={{ pointerEvents: 'auto', cursor: 'pointer' }}
              onClick={() => { onAnnotationClick?.(mark.id); }}
              {...hoverHandlers}
            />
          );
        }

        // Default (text / other): filled rect with color
        return (
          <rect
            key={mark.id}
            data-testid="annotation-marker"
            x={domX}
            y={domY}
            width={domW}
            height={domH}
            fill={mark.color}
            fillOpacity={isHovered ? '0.35' : '0.25'}
            stroke={mark.color}
            strokeOpacity={isSelected ? '1' : isHovered ? '0.85' : '0.70'}
            strokeWidth={isSelected ? 2 : 1}
            rx="2"
            style={{ pointerEvents: 'auto', cursor: 'pointer' }}
            onClick={() => { onAnnotationClick?.(mark.id); }}
            {...hoverHandlers}
          />
        );
      })}

      {/* Active annotation highlight — on top of markers */}
      {highlights.map((h, idx) => {
        const domX = h.x * zoom;
        const domY = (pageHeightPt - h.y - h.height) * zoom;
        const domW = h.width * zoom;
        const domH = h.height * zoom;
        return (
          <rect
            key={idx}
            data-testid="annotation-highlight"
            x={domX}
            y={domY}
            width={domW}
            height={domH}
            fill="rgba(255, 220, 0, 0.35)"
            rx="2"
          />
        );
      })}

      {/* Draft rectangle preview — shown while the user is dragging the rectangle tool */}
      {draftRect && (
        <rect
          data-testid="annotation-draft-rect"
          x={draftRect.x * zoom}
          y={(pageHeightPt - draftRect.y - draftRect.height) * zoom}
          width={draftRect.width * zoom}
          height={draftRect.height * zoom}
          fill="rgba(59, 130, 246, 0.08)"
          stroke="rgba(59, 130, 246, 0.8)"
          strokeWidth="1.5"
          strokeDasharray="4 3"
          rx="2"
        />
      )}
    </svg>
  );
}
