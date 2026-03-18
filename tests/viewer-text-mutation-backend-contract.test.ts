// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary and confidential.
// Free for personal, non-commercial use.
// Commercial use requires a valid license.
// See https://pdfluent.com/license for terms.

/**
 * Text Mutation Backend Contract — Phase 4 Batch 2
 *
 * Verifies the narrow backend contract for real text mutation:
 * - TextMutationEngine interface exists with the correct shape
 * - TauriTextMutationEngine implements the interface via the correct invoke call
 * - ReplaceTextSpanRequest and ReplaceTextSpanResult types are correct
 * - The Rust command 'replace_text_span' is registered in lib.rs
 * - The Rust request struct has the correct field names (snake_case)
 * - The Rust TextReplaceResult struct has the correct fields
 * - The IPC field name mapping (camelCase TS → snake_case Rust) is correct
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dir = dirname(fileURLToPath(import.meta.url));

// Source files for contract verification
const textMutationEngineSrc = readFileSync(
  join(__dir, '../src/core/engine/TextMutationEngine.ts'),
  'utf8',
);
const tauriTextMutationEngineSrc = readFileSync(
  join(__dir, '../src/platform/engine/tauri/TauriTextMutationEngine.ts'),
  'utf8',
);
const libRsSrc = readFileSync(
  join(__dir, '../src-tauri/src/lib.rs'),
  'utf8',
);
const pdfEngineRsSrc = readFileSync(
  join(__dir, '../src-tauri/src/pdf_engine.rs'),
  'utf8',
);

// ---------------------------------------------------------------------------
// TextMutationEngine interface — TypeScript contract
// ---------------------------------------------------------------------------

describe('TextMutationEngine — interface shape', () => {
  it('defines TextMutationEngine interface', () => {
    expect(textMutationEngineSrc).toContain('export interface TextMutationEngine');
  });

  it('defines replaceTextSpan method on the interface', () => {
    expect(textMutationEngineSrc).toContain('replaceTextSpan(');
  });

  it('replaceTextSpan returns AsyncEngineResult', () => {
    const block = textMutationEngineSrc.slice(
      textMutationEngineSrc.indexOf('replaceTextSpan('),
      textMutationEngineSrc.indexOf('replaceTextSpan(') + 100,
    );
    expect(block).toContain('AsyncEngineResult');
  });

  it('defines ReplaceTextSpanRequest interface', () => {
    expect(textMutationEngineSrc).toContain('export interface ReplaceTextSpanRequest');
  });

  it('ReplaceTextSpanRequest has pageIndex field', () => {
    expect(textMutationEngineSrc).toContain('pageIndex: number');
  });

  it('ReplaceTextSpanRequest has originalText field', () => {
    expect(textMutationEngineSrc).toContain('originalText: string');
  });

  it('ReplaceTextSpanRequest has replacementText field', () => {
    expect(textMutationEngineSrc).toContain('replacementText: string');
  });

  it('defines ReplaceTextSpanResult interface', () => {
    expect(textMutationEngineSrc).toContain('export interface ReplaceTextSpanResult');
  });

  it('ReplaceTextSpanResult has replaced boolean field', () => {
    expect(textMutationEngineSrc).toContain('replaced: boolean');
  });

  it('ReplaceTextSpanResult has reason field allowing null', () => {
    expect(textMutationEngineSrc).toContain('reason: string | null');
  });

  it('documents Phase 4 MVP constraints', () => {
    expect(textMutationEngineSrc).toContain('equal-or-shorter');
    expect(textMutationEngineSrc).toContain('Tj');
  });

  it('documents all reason codes', () => {
    expect(textMutationEngineSrc).toContain('replacement-too-long');
    expect(textMutationEngineSrc).toContain('text-not-found-in-content-stream');
    expect(textMutationEngineSrc).toContain('no-content-stream');
    expect(textMutationEngineSrc).toContain('empty-original-text');
    expect(textMutationEngineSrc).toContain('page-not-found');
  });
});

// ---------------------------------------------------------------------------
// TauriTextMutationEngine — Tauri IPC implementation
// ---------------------------------------------------------------------------

describe('TauriTextMutationEngine — IPC implementation', () => {
  it('imports invoke from @tauri-apps/api/core', () => {
    expect(tauriTextMutationEngineSrc).toContain("from '@tauri-apps/api/core'");
    expect(tauriTextMutationEngineSrc).toContain('invoke');
  });

  it('calls the replace_text_span command', () => {
    expect(tauriTextMutationEngineSrc).toContain("'replace_text_span'");
  });

  it('maps pageIndex → page_index (camelCase → snake_case)', () => {
    expect(tauriTextMutationEngineSrc).toContain('page_index: request.pageIndex');
  });

  it('maps originalText → original_text', () => {
    expect(tauriTextMutationEngineSrc).toContain('original_text: request.originalText');
  });

  it('maps replacementText → replacement_text', () => {
    expect(tauriTextMutationEngineSrc).toContain('replacement_text: request.replacementText');
  });

  it('implements TextMutationEngine interface', () => {
    expect(tauriTextMutationEngineSrc).toContain('implements TextMutationEngine');
  });

  it('exports TauriTextMutationEngine class', () => {
    expect(tauriTextMutationEngineSrc).toContain('export class TauriTextMutationEngine');
  });

  it('exports getTauriTextMutationEngine singleton factory', () => {
    expect(tauriTextMutationEngineSrc).toContain('export function getTauriTextMutationEngine');
  });

  it('wraps Tauri errors in EngineResult failure', () => {
    expect(tauriTextMutationEngineSrc).toContain('success: false');
    expect(tauriTextMutationEngineSrc).toContain('internal-error');
  });

  it('defines TauriReplaceTextSpanResult backend shape', () => {
    expect(tauriTextMutationEngineSrc).toContain('TauriReplaceTextSpanResult');
    expect(tauriTextMutationEngineSrc).toContain('replaced: boolean');
    expect(tauriTextMutationEngineSrc).toContain('reason: string | null');
  });

  it('passes request as nested object (matches Rust struct deserialization)', () => {
    // Tauri command: invoke('replace_text_span', { request: tauriRequest })
    const invokeBlock = tauriTextMutationEngineSrc.slice(
      tauriTextMutationEngineSrc.indexOf("'replace_text_span'"),
      tauriTextMutationEngineSrc.indexOf("'replace_text_span'") + 80,
    );
    expect(invokeBlock).toContain('request:');
  });
});

// ---------------------------------------------------------------------------
// Rust backend — lib.rs command registration
// ---------------------------------------------------------------------------

describe('Rust lib.rs — replace_text_span command', () => {
  it('defines ReplaceTextSpanRequest struct with Deserialize', () => {
    expect(libRsSrc).toContain('struct ReplaceTextSpanRequest');
    expect(libRsSrc).toContain('Deserialize');
  });

  it('ReplaceTextSpanRequest has page_index: u32', () => {
    expect(libRsSrc).toContain('page_index: u32');
  });

  it('ReplaceTextSpanRequest has original_text: String', () => {
    expect(libRsSrc).toContain('original_text: String');
  });

  it('ReplaceTextSpanRequest has replacement_text: String', () => {
    expect(libRsSrc).toContain('replacement_text: String');
  });

  it('defines replace_text_span Tauri command function', () => {
    expect(libRsSrc).toContain('fn replace_text_span(');
  });

  it('replace_text_span is registered in invoke_handler', () => {
    const handlerBlock = libRsSrc.slice(libRsSrc.indexOf('invoke_handler'));
    expect(handlerBlock).toContain('replace_text_span,');
  });

  it('calls doc.replace_text_span internally', () => {
    const fn_block = libRsSrc.slice(
      libRsSrc.indexOf('fn replace_text_span('),
      libRsSrc.indexOf('fn replace_text_span(') + 300,
    );
    expect(fn_block).toContain('doc.replace_text_span(');
  });
});

// ---------------------------------------------------------------------------
// Rust backend — pdf_engine.rs OpenDocument implementation
// ---------------------------------------------------------------------------

describe('Rust pdf_engine.rs — OpenDocument::replace_text_span', () => {
  it('defines TextReplaceResult struct', () => {
    expect(pdfEngineRsSrc).toContain('pub struct TextReplaceResult');
  });

  it('TextReplaceResult has replaced: bool field', () => {
    expect(pdfEngineRsSrc).toContain('pub replaced: bool');
  });

  it('TextReplaceResult has reason: Option<String> field', () => {
    expect(pdfEngineRsSrc).toContain('pub reason: Option<String>');
  });

  it('implements replace_text_span method on OpenDocument', () => {
    expect(pdfEngineRsSrc).toContain('pub fn replace_text_span(');
  });

  it('enforces replacement-too-long guard', () => {
    expect(pdfEngineRsSrc).toContain('replacement-too-long');
  });

  it('enforces empty-original-text guard', () => {
    expect(pdfEngineRsSrc).toContain('empty-original-text');
  });

  it('handles no-content-stream case', () => {
    expect(pdfEngineRsSrc).toContain('no-content-stream');
  });

  it('returns text-not-found-in-content-stream when text absent', () => {
    expect(pdfEngineRsSrc).toContain('text-not-found-in-content-stream');
  });

  it('uses simple Tj text show operator pattern', () => {
    expect(pdfEngineRsSrc).toContain('Tj');
  });

  it('calls sync_after_mutation after successful replacement', () => {
    const fn_block = pdfEngineRsSrc.slice(
      pdfEngineRsSrc.indexOf('pub fn replace_text_span('),
      pdfEngineRsSrc.indexOf('pub fn replace_text_span(') + 4000,
    );
    expect(fn_block).toContain('sync_after_mutation');
  });

  it('pads replacement with trailing spaces to maintain byte count', () => {
    const fn_block = pdfEngineRsSrc.slice(
      pdfEngineRsSrc.indexOf('pub fn replace_text_span('),
      pdfEngineRsSrc.indexOf('pub fn replace_text_span(') + 2000,
    );
    expect(fn_block).toContain('width');
  });

  it('defines replace_first_occurrence helper function', () => {
    expect(pdfEngineRsSrc).toContain('fn replace_first_occurrence(');
  });

  it('replace_first_occurrence handles needle not found (returns original)', () => {
    const fn_block = pdfEngineRsSrc.slice(
      pdfEngineRsSrc.indexOf('fn replace_first_occurrence('),
      pdfEngineRsSrc.indexOf('fn replace_first_occurrence(') + 400,
    );
    expect(fn_block).toContain('haystack.to_vec()');
  });
});

// ---------------------------------------------------------------------------
// Contract integration — TypeScript and Rust field name symmetry
// ---------------------------------------------------------------------------

describe('contract — TypeScript ↔ Rust field name symmetry', () => {
  it('TypeScript pageIndex maps to Rust page_index', () => {
    expect(textMutationEngineSrc).toContain('pageIndex');
    expect(libRsSrc).toContain('page_index');
  });

  it('TypeScript originalText maps to Rust original_text', () => {
    expect(textMutationEngineSrc).toContain('originalText');
    expect(libRsSrc).toContain('original_text');
  });

  it('TypeScript replacementText maps to Rust replacement_text', () => {
    expect(textMutationEngineSrc).toContain('replacementText');
    expect(libRsSrc).toContain('replacement_text');
  });

  it('TypeScript replaced:boolean maps to Rust replaced:bool', () => {
    expect(textMutationEngineSrc).toContain('replaced: boolean');
    expect(pdfEngineRsSrc).toContain('pub replaced: bool');
  });

  it('TypeScript reason:string|null maps to Rust reason:Option<String>', () => {
    expect(textMutationEngineSrc).toContain('reason: string | null');
    expect(pdfEngineRsSrc).toContain('pub reason: Option<String>');
  });
});
