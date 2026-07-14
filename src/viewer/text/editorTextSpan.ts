// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary. The PDFluent application is free to use,
// including for commercial purposes. Redistribution, or extraction or reuse
// of its components (including the embedded PDF engine), requires a licence.
// See https://pdfluent.com/license for terms.

import type { TextSpan } from '../../core/document';
import { isTauriEnvironment } from '../../core/index';
import { isEditorFeatureEnabled } from './editorFeatureFlags';

/**
 * Editor-internal text span.
 *
 * Extends the core TextSpan with optional font metadata fields that
 * will be populated once SDK Track G delivers them. All optional fields
 * are undefined until `sdkTextMetadata = true`.
 *
 * The `sdkCapabilities` object documents which operations are available
 * for this span, allowing the UI to gate formatting controls correctly.
 */
export interface EditorTextSpan {
  /** Stable span ID: "p{pageIndex}:s{spanIndex}" */
  id: string;
  text: string;
  rect: { x: number; y: number; width: number; height: number };
  fontSize: number;

  // SDK Track G — undefined until sdkTextMetadata=true
  /** Full PDF font name, e.g. "Helvetica-Bold", "Times-Roman". */
  fontName?: string;
  /** Whether the font is bold (derived from name or FontDescriptor). */
  isBold?: boolean;
  /** Whether the font is italic (derived from name or FontDescriptor). */
  isItalic?: boolean;
  /** RGB fill color in [0.0, 1.0] range, at the time of text rendering. */
  color?: [number, number, number];
  /** Per-character advance widths in PDF user space points. */
  charBounds?: Array<{ x: number; width: number }>;

  /** What operations are currently available for this span. */
  sdkCapabilities: EditorSpanCapabilities;
}

export interface EditorSpanCapabilities {
  /**
   * Quality level of text replacement for this span.
   *
   * - `'basic-provisional'`: legacy byte-level string search fallback. Kept in
   *   the type for older runtimes and tests, but not used by the desktop V3
   *   editor path.
   *
   * - `'parser-backed'`: full content-stream parser with width recalculation,
   *   TJ array handling, CMap/ToUnicode decoding, and safe font fallback through
   *   the native pdf-manip writer.
   */
  replaceTextMode: 'basic-provisional' | 'parser-backed';
  /** True when font size / color can be written back to PDF. Requires sdkTextFormatWrites. */
  canFormatText: boolean;
  /** True when bold/italic can be set via font substitution. Requires sdkTextFontStyleWrites. */
  canSetFontStyle: boolean;
  /** True when fontName, isBold, isItalic, color are available. Requires sdkTextMetadata. */
  hasAccurateMetrics: boolean;
}

/**
 * Convert a core TextSpan to an EditorTextSpan.
 *
 * The adapter layer: whatever the SDK gives us is mapped through here.
 * When the SDK delivers new fields (fontName, isBold, etc.), they will be
 * present on the input and passed through. Until then they are undefined.
 */
export function toEditorTextSpan(
  span: TextSpan,
  pageIndex: number,
  spanIndex: number,
): EditorTextSpan {
  // Future SDK fields will be present on `span` once Track G lands.
  // The cast here acknowledges they may arrive before this adapter is updated.
  const extSpan = span as TextSpan & {
    fontName?: string;
    isBold?: boolean;
    isItalic?: boolean;
    color?: [number, number, number];
    charBounds?: Array<{ x: number; width: number }>;
  };

  const hasMetadata = isEditorFeatureEnabled('sdkTextMetadata');
  const hasCharBounds = isEditorFeatureEnabled('sdkTextCharBounds');

  return {
    id: `p${pageIndex}:s${spanIndex}`,
    text: span.text,
    rect: span.rect,
    fontSize: span.fontSize,
    fontName: hasMetadata ? extSpan.fontName : undefined,
    isBold: hasMetadata ? extSpan.isBold : undefined,
    isItalic: hasMetadata ? extSpan.isItalic : undefined,
    color: hasMetadata ? extSpan.color : undefined,
    charBounds: hasCharBounds ? extSpan.charBounds : undefined,
    sdkCapabilities: {
      // Desktop text writes use src-tauri::replace_text_span, backed by
      // pdf_manip::text_replace. Non-Tauri runtimes still return a typed
      // unsupported result at commit time through the canonical engine.
      replaceTextMode: 'parser-backed' as const,
      // Format/style writes are desktop-native only. The Rust backend resolves
      // embedded fonts first, then bundled Liberation substitutes, then system fonts.
      canFormatText: isEditorFeatureEnabled('sdkTextFormatWrites') && isTauriEnvironment(),
      canSetFontStyle: isEditorFeatureEnabled('sdkTextFontStyleWrites') && isTauriEnvironment(),
      hasAccurateMetrics: hasMetadata && extSpan.fontName !== undefined,
    },
  };
}

/**
 * Convert an array of TextSpans for a given page.
 */
export function toEditorTextSpans(
  spans: readonly TextSpan[],
  pageIndex: number,
): EditorTextSpan[] {
  return spans.map((span, i) => toEditorTextSpan(span, pageIndex, i));
}

export function getEditorFontFamily(span: EditorTextSpan | null | undefined): string {
  if (!span?.fontName) return 'system-ui, -apple-system, sans-serif';
  // Strip PDF subset prefix (e.g. "ABCDEF+Helvetica" → "Helvetica")
  const clean = span.fontName.replace(/^[A-Z]{6}\+/, '');
  // Map known PDF standard fonts to CSS equivalents
  const cssMap: Record<string, string> = {
    'Helvetica': 'Helvetica, Arial, sans-serif',
    'Helvetica-Bold': 'Helvetica, Arial, sans-serif',
    'Helvetica-Oblique': 'Helvetica, Arial, sans-serif',
    'Helvetica-BoldOblique': 'Helvetica, Arial, sans-serif',
    'Times-Roman': 'Times New Roman, Times, serif',
    'Times-Bold': 'Times New Roman, Times, serif',
    'Times-Italic': 'Times New Roman, Times, serif',
    'Times-BoldItalic': 'Times New Roman, Times, serif',
    'Courier': 'Courier New, Courier, monospace',
    'Courier-Bold': 'Courier New, Courier, monospace',
    'Courier-Oblique': 'Courier New, Courier, monospace',
    'Courier-BoldOblique': 'Courier New, Courier, monospace',
  };

  if (cssMap[clean]) {
    return cssMap[clean]!;
  }

  // Heuristic classification for font fallback
  const lower = clean.toLowerCase();
  let fallback = 'sans-serif';
  if (lower.includes('serif') || lower.includes('times') || lower.includes('roman') || lower.includes('georgia') || lower.includes('minion') || lower.includes('garamond') || lower.includes('cambria') || lower.includes('baskerville') || lower.includes('playfair')) {
    fallback = 'Times New Roman, Times, serif';
  } else if (lower.includes('courier') || lower.includes('mono') || lower.includes('consolas') || lower.includes('code')) {
    fallback = 'Courier New, Courier, monospace';
  } else if (lower.includes('calibri') || lower.includes('arial') || lower.includes('helvetica') || lower.includes('sans')) {
    fallback = 'Arial, Helvetica, sans-serif';
  }
  
  return `"${clean}", ${fallback}`;
}
