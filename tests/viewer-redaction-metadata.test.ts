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

// Helper: extract the redact_metadata method body.
function redactMetadataBody(): string {
  const fnStart = engineSource.indexOf('pub fn redact_metadata(');
  const fnEnd = engineSource.indexOf('\n    pub fn ', fnStart + 10);
  return engineSource.slice(fnStart, fnEnd);
}

// ---------------------------------------------------------------------------
// pdf_engine.rs — redact_metadata method
// ---------------------------------------------------------------------------

describe('pdf_engine.rs — redact_metadata method', () => {
  it('defines redact_metadata public method', () => {
    expect(engineSource).toContain('pub fn redact_metadata(');
  });

  it('strips Author from /Info dictionary', () => {
    expect(redactMetadataBody()).toContain('b"Author"');
  });

  it('strips Creator from /Info dictionary', () => {
    expect(redactMetadataBody()).toContain('b"Creator"');
  });

  it('strips Subject from /Info dictionary', () => {
    expect(redactMetadataBody()).toContain('b"Subject"');
  });

  it('strips Keywords from /Info dictionary', () => {
    expect(redactMetadataBody()).toContain('b"Keywords"');
  });

  it('accesses /Info via trailer', () => {
    expect(redactMetadataBody()).toContain('trailer');
    expect(redactMetadataBody()).toContain('b"Info"');
  });

  it('removes XMP metadata stream from catalog', () => {
    expect(redactMetadataBody()).toContain('b"Metadata"');
    expect(redactMetadataBody()).toContain('remove(b"Metadata")');
  });

  it('locates catalog via /Root in trailer', () => {
    expect(redactMetadataBody()).toContain('b"Root"');
  });

  it('calls sync_after_mutation', () => {
    expect(redactMetadataBody()).toContain('self.sync_after_mutation()');
  });

  it('returns Result<(), String>', () => {
    const sig = engineSource.slice(
      engineSource.indexOf('pub fn redact_metadata('),
      engineSource.indexOf('pub fn redact_metadata(') + 80
    );
    expect(sig).toContain('Result<(), String>');
  });
});

// ---------------------------------------------------------------------------
// lib.rs — redact_metadata Tauri command
// ---------------------------------------------------------------------------

describe('lib.rs — redact_metadata Tauri command', () => {
  it('declares redact_metadata as a tauri::command', () => {
    const idx = libSource.indexOf('fn redact_metadata(');
    const preceding = libSource.slice(idx - 40, idx);
    expect(preceding).toContain('#[tauri::command]');
  });

  it('redact_metadata command returns Result<(), String>', () => {
    const fnIdx = libSource.indexOf('fn redact_metadata(');
    const sig = libSource.slice(fnIdx, fnIdx + 80);
    expect(sig).toContain('Result<(), String>');
  });

  it('delegates to doc.redact_metadata()', () => {
    const fnIdx = libSource.indexOf('fn redact_metadata(');
    const body = libSource.slice(fnIdx, fnIdx + 150);
    expect(body).toContain('doc.redact_metadata()');
  });

  it('registers redact_metadata in invoke_handler', () => {
    expect(libSource).toContain('redact_metadata,');
  });
});
