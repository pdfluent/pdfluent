// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary. The PDFluent application is free to use,
// including for commercial purposes. Redistribution, or extraction or reuse
// of its components (including the embedded PDF engine), requires a licence.
// See https://pdfluent.com/license for terms.

/**
 * Editor feature flags — records which SDK capabilities have landed.
 *
 * All flags are `true` as of enterprise/ga-hardening (SHA ab66d2857, 2026-05-20).
 * The UI reads these at runtime alongside native Tauri capability checks to
 * enable formatting controls and write paths.
 *
 * Note: G3 (replaceTextSpan) does not have a flag here because it is gated
 * by the native text mutation engine selector — no feature flag needed.
 */
export const EDITOR_FEATURE_FLAGS = {
  /** SDK delivers fontName, isBold, isItalic, color per text span. G1 wired. */
  sdkTextMetadata: true,
  /** SDK delivers per-character bounding boxes (charBounds) per text span. G2 wired. */
  sdkTextCharBounds: true,
  /**
   * SDK supports formatTextSpan (font size + color writes to PDF content stream).
   * Active on Tauri via TauriTextMutationEngine. Requires this flag and the
   * runtime capability check.
   */
  sdkTextFormatWrites: true,
  /**
   * SDK supports setFontStyle (bold/italic via font substitution).
   * Active on Tauri via TauriTextMutationEngine. Returns typed error when the
   * font variant is not embedded.
   */
  sdkTextFontStyleWrites: true,
} as const satisfies Record<string, boolean>;

export type EditorFeatureFlag = keyof typeof EDITOR_FEATURE_FLAGS;

export function isEditorFeatureEnabled(flag: EditorFeatureFlag): boolean {
  return EDITOR_FEATURE_FLAGS[flag];
}
