// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary and confidential.
// Free for personal, non-commercial use.
// Commercial use requires a valid license.
// See https://pdfluent.com/license for terms.

import { readFileSync } from 'node:fs';
import { describe, it, expect } from 'vitest';

const engineSource = readFileSync(
  new URL('../src-tauri/src/pdf_engine.rs', import.meta.url),
  'utf8'
);

const libSource = readFileSync(
  new URL('../src-tauri/src/lib.rs', import.meta.url),
  'utf8'
);

// ---------------------------------------------------------------------------
// pdf_engine.rs — apply_redactions method
// ---------------------------------------------------------------------------

describe('pdf_engine.rs — apply_redactions method', () => {
  it('defines apply_redactions public method', () => {
    expect(engineSource).toContain('pub fn apply_redactions(');
  });

  it('apply_redactions returns Result<RedactReport, String>', () => {
    const fnIdx = engineSource.indexOf('pub fn apply_redactions(');
    const sig = engineSource.slice(fnIdx, fnIdx + 80);
    expect(sig).toContain('Result<RedactReport, String>');
  });

  it('iterates all pages via get_pages()', () => {
    const fnStart = engineSource.indexOf('pub fn apply_redactions(');
    const fnEnd = engineSource.indexOf('\n    pub fn ', fnStart + 10) ;
    const fnBody = engineSource.slice(fnStart, fnEnd);
    expect(fnBody).toContain('get_pages()');
  });

  it('checks /Subtype == Redact for each annotation', () => {
    const fnStart = engineSource.indexOf('pub fn apply_redactions(');
    const fnEnd = engineSource.indexOf('\n    pub fn ', fnStart + 10);
    const fnBody = engineSource.slice(fnStart, fnEnd);
    expect(fnBody).toContain('b"Redact"');
    expect(fnBody).toContain('b"Subtype"');
  });

  it('extracts /Rect from Redact annotations', () => {
    const fnStart = engineSource.indexOf('pub fn apply_redactions(');
    const fnEnd = engineSource.indexOf('\n    pub fn ', fnStart + 10);
    const fnBody = engineSource.slice(fnStart, fnEnd);
    expect(fnBody).toContain('b"Rect"');
  });

  it('creates RedactionArea for each collected rect', () => {
    const fnStart = engineSource.indexOf('pub fn apply_redactions(');
    const fnEnd = engineSource.indexOf('\n    pub fn ', fnStart + 10);
    const fnBody = engineSource.slice(fnStart, fnEnd);
    expect(fnBody).toContain('RedactionArea::new(');
  });

  it('uses Redactor to apply permanently', () => {
    const fnStart = engineSource.indexOf('pub fn apply_redactions(');
    const fnEnd = engineSource.indexOf('\n    pub fn ', fnStart + 10);
    const fnBody = engineSource.slice(fnStart, fnEnd);
    expect(fnBody).toContain('Redactor::new()');
    expect(fnBody).toContain('.apply(&mut self.lopdf_doc)');
  });

  it('removes Redact annotations from /Annots after applying', () => {
    const fnStart = engineSource.indexOf('pub fn apply_redactions(');
    const fnEnd = engineSource.indexOf('\n    pub fn ', fnStart + 10);
    const fnBody = engineSource.slice(fnStart, fnEnd);
    // Redact annotation objects are retained/removed by filtering
    expect(fnBody).toContain('retain(');
    expect(fnBody).toContain('redact_ids');
  });

  it('returns RedactReport with areas_redacted', () => {
    const fnStart = engineSource.indexOf('pub fn apply_redactions(');
    const fnEnd = engineSource.indexOf('\n    pub fn ', fnStart + 10);
    const fnBody = engineSource.slice(fnStart, fnEnd);
    expect(fnBody).toContain('areas_redacted');
    expect(fnBody).toContain('operations_removed');
    expect(fnBody).toContain('pages_affected');
  });

  it('returns empty RedactReport when no redaction annotations exist', () => {
    const fnStart = engineSource.indexOf('pub fn apply_redactions(');
    const fnEnd = engineSource.indexOf('\n    pub fn ', fnStart + 10);
    const fnBody = engineSource.slice(fnStart, fnEnd);
    expect(fnBody).toContain('is_empty()');
    // Returns early with zero counts
    expect(fnBody).toContain('areas_redacted: 0');
  });

  it('calls sync_after_mutation after cleanup', () => {
    const fnStart = engineSource.indexOf('pub fn apply_redactions(');
    const fnEnd = engineSource.indexOf('\n    pub fn ', fnStart + 10);
    const fnBody = engineSource.slice(fnStart, fnEnd);
    expect(fnBody).toContain('self.sync_after_mutation()');
  });
});

// ---------------------------------------------------------------------------
// lib.rs — apply_redactions Tauri command
// ---------------------------------------------------------------------------

describe('lib.rs — apply_redactions Tauri command', () => {
  it('declares apply_redactions as a tauri::command', () => {
    expect(libSource).toContain('#[tauri::command]');
    expect(libSource).toContain('fn apply_redactions(');
  });

  it('apply_redactions command takes AppState and returns Result<RedactReport>', () => {
    const fnIdx = libSource.indexOf('fn apply_redactions(');
    const sig = libSource.slice(fnIdx, fnIdx + 100);
    expect(sig).toContain('State<AppState>');
    expect(sig).toContain('Result<RedactReport, String>');
  });

  it('apply_redactions command delegates to doc.apply_redactions()', () => {
    const fnIdx = libSource.indexOf('fn apply_redactions(');
    const body = libSource.slice(fnIdx, fnIdx + 150);
    expect(body).toContain('doc.apply_redactions()');
  });

  it('registers apply_redactions in invoke_handler', () => {
    expect(libSource).toContain('apply_redactions,');
  });
});
