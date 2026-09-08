// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary. The PDFluent application is free to use,
// including for commercial purposes. Redistribution, or extraction or reuse
// of its components (including the embedded PDF engine), requires a licence.
// See https://pdfluent.com/license for terms.

import type {
  PdfAConvertResult,
  PdfAConvertReport,
  PdfAValidationResult,
  PdfAIssue,
} from './tauri-api';

/**
 * Canonical wire-key lists for what `convert_to_pdfa` returns.
 *
 * The command used to answer with a bare validation verdict. It now answers
 * with the SDK's conversion report as well — what was repaired, what it cost in
 * bytes, how long it took — and the panel shows it. A field renamed on the Rust
 * side and not here would render as `undefined` in that card: a report that
 * quietly says nothing, which is the failure mode this whole story is about.
 *
 * The compile-time assertions at the bottom bind these lists to the interfaces
 * in `tauri-api.ts`, so `npm run typecheck` fails on TS drift. The drift-guard
 * test (`src/lib/__tests__/pdfaWireContract.test.ts`) pins the lists to the
 * Rust serde keys, whose half is asserted by
 * `pdfa_convert_result_wire_contract_is_stable` in `src-tauri/src/pdf_engine.rs`.
 */
export const PDFA_CONVERT_RESULT_WIRE_KEYS = [
  'validation',
  'report',
  'output_path',
  'input_bytes',
  'output_bytes',
  'size_ratio',
  'elapsed_ms',
] as const;

export const PDFA_CONVERT_REPORT_WIRE_KEYS = [
  'page_count',
  'text_streams_repositioned',
  'output_intent_added',
  'page_tree_repaired',
  'fonts_inspected',
  'fonts_non_embedded',
  'fonts_embedded',
  'fonts_failed',
  'encryption_removed',
  'js_actions_removed',
  'embedded_files_removed',
  'file_attachment_annotations_removed',
  'long_string_fixes',
  'programs_subsetted',
  'subset_bytes_saved',
  'warnings',
] as const;

export const PDFA_VALIDATION_WIRE_KEYS = [
  'compliant',
  'conformance_level',
  'error_count',
  'warning_count',
  'issues',
] as const;

export const PDFA_ISSUE_WIRE_KEYS = ['rule', 'severity', 'message', 'location'] as const;

// ---------------------------------------------------------------------------
// Compile-time drift guards — verified by `tsc --noEmit` (npm run typecheck).
// ---------------------------------------------------------------------------

/** True only when the two key unions are exactly equal (bidirectional). */
type KeysEqual<A extends PropertyKey, B extends PropertyKey> = [A] extends [B]
  ? [B] extends [A]
    ? true
    : never
  : never;

const _resultKeysMatch: KeysEqual<
  (typeof PDFA_CONVERT_RESULT_WIRE_KEYS)[number],
  keyof PdfAConvertResult
> = true;
void _resultKeysMatch;

const _reportKeysMatch: KeysEqual<
  (typeof PDFA_CONVERT_REPORT_WIRE_KEYS)[number],
  keyof PdfAConvertReport
> = true;
void _reportKeysMatch;

const _validationKeysMatch: KeysEqual<
  (typeof PDFA_VALIDATION_WIRE_KEYS)[number],
  keyof PdfAValidationResult
> = true;
void _validationKeysMatch;

const _issueKeysMatch: KeysEqual<(typeof PDFA_ISSUE_WIRE_KEYS)[number], keyof PdfAIssue> = true;
void _issueKeysMatch;
