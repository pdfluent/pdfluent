// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary and confidential.
// Free for personal, non-commercial use.
// Commercial use requires a valid license.
// See https://pdfluent.com/license for terms.

// ---------------------------------------------------------------------------
// OCR Overlay — renders word bounding boxes from OCR results as an SVG layer.
//
// Coordinate space: OCR words are in image-pixel coordinates (origin top-left).
// The rendered image has dimensions renderedWidth × renderedHeight pixels.
// We map to DOM space by scaling: domX = (word.x0 / renderedWidth) * (pageWidthPt * zoom)
// The y-axis is NOT flipped — OCR coordinates already have top-left origin.
// ---------------------------------------------------------------------------

interface OcrWord {
  text: string;
  confidence: number;
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

interface OcrOverlayProps {
  words: OcrWord[];
  /** Width of the rendered page image in pixels (used for coordinate scaling). */
  renderedWidth: number;
  /** Height of the rendered page image in pixels (used for coordinate scaling). */
  renderedHeight: number;
  /** Page width in PDF points. */
  pageWidthPt: number;
  /** Page height in PDF points. */
  pageHeightPt: number;
  /** Current zoom level. */
  zoom: number;
  /** Confidence threshold below which words are shown in orange (low-confidence). */
  lowConfidenceThreshold?: number;
  /** Whether to render OCR word boxes at all. */
  visible?: boolean;
}

export function OcrOverlay({
  words,
  renderedWidth,
  renderedHeight,
  pageWidthPt,
  pageHeightPt,
  zoom,
  lowConfidenceThreshold = 0.6,
  visible = true,
}: OcrOverlayProps) {
  if (!visible || words.length === 0) return null;

  const scaleX = (pageWidthPt * zoom) / renderedWidth;
  const scaleY = (pageHeightPt * zoom) / renderedHeight;

  return (
    <svg
      data-testid="ocr-overlay"
      style={{
        position: 'absolute',
        inset: 0,
        width: '100%',
        height: '100%',
        pointerEvents: 'none',
        overflow: 'visible',
      }}
    >
      {words.map((word, idx) => {
        const domX = word.x0 * scaleX;
        const domY = word.y0 * scaleY;
        const domW = (word.x1 - word.x0) * scaleX;
        const domH = (word.y1 - word.y0) * scaleY;
        const isLowConfidence = word.confidence < lowConfidenceThreshold;

        return (
          <rect
            key={idx}
            data-testid="ocr-word-box"
            data-confidence={word.confidence.toFixed(2)}
            x={domX}
            y={domY}
            width={domW}
            height={domH}
            fill="none"
            stroke={isLowConfidence ? 'rgba(255, 120, 0, 0.6)' : 'rgba(0, 180, 100, 0.45)'}
            strokeWidth="1"
            rx="1"
          />
        );
      })}
    </svg>
  );
}
