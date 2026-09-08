// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary. The PDFluent application is free to use,
// including for commercial purposes. Redistribution, or extraction or reuse
// of its components (including the embedded PDF engine), requires a licence.
// See https://pdfluent.com/license for terms.

import type { TextSpanInfo, FontMetricsInfo, TextReplaceResultWire } from './tauri-api';

/**
 * Canonical wire-key lists for the text-span DTO returned by `get_page_text_spans`.
 *
 * This module is the single source of truth, on the TypeScript side, for the
 * serde wire shape of the SDK's `pdf_engine::TextSpanInfo` (and its nested
 * `FontMetrics`). The compile-time assertions at the bottom bind these lists to
 * the `TextSpanInfo` / `FontMetricsInfo` interfaces: if a field is added to or
 * removed from either interface, `keyof` diverges from the corresponding list
 * and `tsc --noEmit` (`npm run typecheck`) fails until both are reconciled.
 *
 * The drift-guard test (`src/lib/__tests__/textSpanWireContract.test.ts`) asserts
 * these lists equal the SDK wire contract, whose Rust half is pinned by
 * `text_span_info_wire_contract_is_stable` in `src-tauri/src/pdf_engine.rs`.
 * Keep the TS interfaces, these lists, and the Rust test in sync.
 */
export const TEXT_SPAN_WIRE_KEYS = [
  'text',
  'x',
  'y',
  'width',
  'height',
  'font_size',
  'fontName',
  'isBold',
  'isItalic',
  'color',
  'widthSource',
  'charBounds',
  'transform',
  'fontWeight',
  'isSerif',
  'isMonospace',
  'renderMode',
  'fontMetrics',
] as const;

/**
 * Canonical wire-key list for the result of `replace_text_span`.
 *
 * Same contract, same reason: the writer's report is only useful if both sides
 * agree on what it is called. Rust half:
 * `text_replace_result_wire_contract_is_stable` in `src-tauri/src/pdf_engine.rs`.
 */
export const TEXT_REPLACE_RESULT_WIRE_KEYS = [
  'replaced',
  'reason',
  'detail',
  'occurrence_index',
  'occurrence_count',
  'font_used',
  'font_substituted',
  'fit_applied',
  'signatures_present',
  'usage_rights_invalidated',
  'tags_affected',
  'diagnostics',
] as const;

export const FONT_METRICS_WIRE_KEYS = [
  'ascent',
  'descent',
  'capHeight',
  'xHeight',
] as const;

// ---------------------------------------------------------------------------
// Compile-time drift guards — verified by `tsc --noEmit` (npm run typecheck).
// ---------------------------------------------------------------------------

/** True only when the two key unions are exactly equal (bidirectional). */
type KeysEqual<A extends PropertyKey, B extends PropertyKey> = [A] extends [B]
  ? [B] extends [A]
    ? true
    : never
  : never;

// Fails to compile if TEXT_SPAN_WIRE_KEYS and keyof TextSpanInfo diverge.
const _textSpanKeysMatch: KeysEqual<
  (typeof TEXT_SPAN_WIRE_KEYS)[number],
  keyof TextSpanInfo
> = true;
void _textSpanKeysMatch;

// Fails to compile if TEXT_REPLACE_RESULT_WIRE_KEYS and keyof TextReplaceResultWire diverge.
const _textReplaceResultKeysMatch: KeysEqual<
  (typeof TEXT_REPLACE_RESULT_WIRE_KEYS)[number],
  keyof TextReplaceResultWire
> = true;
void _textReplaceResultKeysMatch;

// Fails to compile if FONT_METRICS_WIRE_KEYS and keyof FontMetricsInfo diverge.
const _fontMetricsKeysMatch: KeysEqual<
  (typeof FONT_METRICS_WIRE_KEYS)[number],
  keyof FontMetricsInfo
> = true;
void _fontMetricsKeysMatch;
