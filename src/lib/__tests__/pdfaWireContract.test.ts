// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary. The PDFluent application is free to use,
// including for commercial purposes. Redistribution, or extraction or reuse
// of its components (including the embedded PDF engine), requires a licence.
// See https://pdfluent.com/license for terms.

import { describe, it, expect } from 'vitest';
import {
  PDFA_CONVERT_RESULT_WIRE_KEYS,
  PDFA_CONVERT_REPORT_WIRE_KEYS,
  PDFA_VALIDATION_WIRE_KEYS,
  PDFA_ISSUE_WIRE_KEYS,
} from '../pdfaWireContract';

/**
 * Drift guard (TypeScript half) for the `convert_to_pdfa` reply.
 *
 * The lists in `pdfaWireContract.ts` are bound to the TS interfaces by
 * compile-time assertions, so `npm run typecheck` catches a change on this
 * side. This test pins them to the serde keys of the Rust DTOs
 * (`PdfAConvertResult`, `PdfAConvertReportDto`, `PdfAValidationResult`,
 * `PdfAIssue` in `src-tauri/src/pdf_engine.rs`), whose half is asserted by
 * `pdfa_convert_result_wire_contract_is_stable`. A rename on the Rust side
 * fails there first; reconcile the RUST_* lists below, the TS interfaces and
 * the contract lists together.
 */

const RUST_CONVERT_RESULT_WIRE_KEYS = [
  'validation',
  'report',
  'output_path',
  'input_bytes',
  'output_bytes',
  'size_ratio',
  'elapsed_ms',
];

const RUST_CONVERT_REPORT_WIRE_KEYS = [
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
];

const RUST_VALIDATION_WIRE_KEYS = [
  'compliant',
  'conformance_level',
  'error_count',
  'warning_count',
  'issues',
];

const RUST_ISSUE_WIRE_KEYS = ['rule', 'severity', 'message', 'location'];

describe('PDF/A conversion wire contract', () => {
  it('TS PdfAConvertResult matches the Rust wire keys', () => {
    expect([...PDFA_CONVERT_RESULT_WIRE_KEYS].sort()).toEqual(
      [...RUST_CONVERT_RESULT_WIRE_KEYS].sort(),
    );
  });

  it('TS PdfAConvertReport matches the Rust wire keys', () => {
    expect([...PDFA_CONVERT_REPORT_WIRE_KEYS].sort()).toEqual(
      [...RUST_CONVERT_REPORT_WIRE_KEYS].sort(),
    );
  });

  it('TS PdfAValidationResult matches the Rust wire keys', () => {
    expect([...PDFA_VALIDATION_WIRE_KEYS].sort()).toEqual([...RUST_VALIDATION_WIRE_KEYS].sort());
  });

  it('TS PdfAIssue matches the Rust wire keys', () => {
    expect([...PDFA_ISSUE_WIRE_KEYS].sort()).toEqual([...RUST_ISSUE_WIRE_KEYS].sort());
  });

  it('has no duplicate wire keys', () => {
    for (const list of [
      PDFA_CONVERT_RESULT_WIRE_KEYS,
      PDFA_CONVERT_REPORT_WIRE_KEYS,
      PDFA_VALIDATION_WIRE_KEYS,
      PDFA_ISSUE_WIRE_KEYS,
    ]) {
      expect(new Set(list).size).toBe(list.length);
    }
  });
});
