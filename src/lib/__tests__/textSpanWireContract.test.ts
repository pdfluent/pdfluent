// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary. The PDFluent application is free to use,
// including for commercial purposes. Redistribution, or extraction or reuse
// of its components (including the embedded PDF engine), requires a licence.
// See https://pdfluent.com/license for terms.

import { describe, it, expect } from 'vitest';
import {
  TEXT_SPAN_WIRE_KEYS,
  FONT_METRICS_WIRE_KEYS,
  TEXT_REPLACE_RESULT_WIRE_KEYS,
} from '../textSpanWireContract';

/**
 * Drift guard (TypeScript half).
 *
 * The editor's wire model (`TextSpanInfo` / `FontMetricsInfo`) is bound to
 * `TEXT_SPAN_WIRE_KEYS` / `FONT_METRICS_WIRE_KEYS` by compile-time assertions in
 * `textSpanWireContract.ts`, so `npm run typecheck` fails if the TS interfaces
 * drift. This test pins those lists to the SDK's canonical serde wire keys
 * (`pdf_engine::TextSpanInfo` / `FontMetrics`), whose Rust half is asserted by
 * `text_span_info_wire_contract_is_stable` in `src-tauri/src/pdf_engine.rs`.
 *
 * If the SDK wire shape changes, the Rust test fails first; then reconcile the
 * SDK_* lists below, the TS interfaces, and the contract lists together.
 */

// Mirrors the serde keys of `pdf_engine::TextSpanInfo` (text_info.rs). `font_size`
// is intentionally snake_case (no serde rename); all other metadata keys are
// camelCase via `#[serde(rename = ...)]`.
const SDK_TEXT_SPAN_WIRE_KEYS = [
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
];

// Mirrors the serde keys of `pdf_engine::text::FontMetrics`.
const SDK_FONT_METRICS_WIRE_KEYS = ['ascent', 'descent', 'capHeight', 'xHeight'];

// Mirrors the serde keys of `pdf_engine::TextReplaceResult`. Rust half:
// `text_replace_result_wire_contract_is_stable`.
const SDK_TEXT_REPLACE_RESULT_WIRE_KEYS = [
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
];

describe('text-span wire contract', () => {
  it('TS TextSpanInfo model matches the SDK TextSpanInfo wire keys', () => {
    expect([...TEXT_SPAN_WIRE_KEYS].sort()).toEqual(
      [...SDK_TEXT_SPAN_WIRE_KEYS].sort(),
    );
  });

  it('TS FontMetricsInfo model matches the SDK FontMetrics wire keys', () => {
    expect([...FONT_METRICS_WIRE_KEYS].sort()).toEqual(
      [...SDK_FONT_METRICS_WIRE_KEYS].sort(),
    );
  });

  it('TS TextReplaceResultWire model matches the backend wire keys', () => {
    expect([...TEXT_REPLACE_RESULT_WIRE_KEYS].sort()).toEqual(
      [...SDK_TEXT_REPLACE_RESULT_WIRE_KEYS].sort(),
    );
  });

  it('has no duplicate wire keys', () => {
    expect(new Set(TEXT_SPAN_WIRE_KEYS).size).toBe(TEXT_SPAN_WIRE_KEYS.length);
    expect(new Set(FONT_METRICS_WIRE_KEYS).size).toBe(FONT_METRICS_WIRE_KEYS.length);
    expect(new Set(TEXT_REPLACE_RESULT_WIRE_KEYS).size).toBe(
      TEXT_REPLACE_RESULT_WIRE_KEYS.length,
    );
  });
});
