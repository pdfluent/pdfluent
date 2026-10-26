// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary. The PDFluent application is free to use,
// including for commercial purposes. Redistribution, or extraction or reuse
// of its components (including the embedded PDF engine), requires a licence.
// See https://pdfluent.com/license for terms.

// #724: Compress writes a copy by default and says what it did. The backend
// half (copy leaves the document alone, replace is one undo step) is tested in
// src-tauri/tests/document_operations.rs.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  compressToastKey,
  compressToastParams,
  formatBytes,
  replacesOpenDocument,
} from '../src/viewer/state/compressReport';

const read = (rel: string): string => readFileSync(new URL(rel, import.meta.url), 'utf8');

describe('compress result (#724)', () => {
  it('only the explicit replace mode replaces the open document', () => {
    expect(replacesOpenDocument('copy')).toBe(false);
    expect(replacesOpenDocument('replace')).toBe(true);
  });

  it('formats sizes', () => {
    expect(formatBytes(512)).toBe('512 B');
    expect(formatBytes(1536)).toBe('1.5 KB');
    expect(formatBytes(5 * 1024 * 1024)).toBe('5.0 MB');
    expect(formatBytes(-1)).toBe('0 B');
  });

  it('the toast names before and after sizes and the file', () => {
    expect(compressToastParams({ bytes_before: 2048, bytes_after: 1024 }, 'a.pdf')).toEqual({
      name: 'a.pdf', before: '2.0 KB', after: '1.0 KB',
    });
  });

  it('the copy toast says the open document is unchanged; the replace toast says Undo', () => {
    const en = JSON.parse(read('../src/i18n/locales/en.json')) as {
      editorV3: { toasts: Record<string, string> };
    };
    const copy = en.editorV3.toasts[compressToastKey('copy').replace('editorV3.toasts.', '')];
    const replaced = en.editorV3.toasts[compressToastKey('replace').replace('editorV3.toasts.', '')];
    expect(copy).toMatch(/unchanged/);
    expect(copy).toContain('{{before}}');
    expect(copy).toContain('{{after}}');
    expect(replaced).toMatch(/Undo/);
  });

  it('the primary button saves a copy; replacing is a separate, explicit button', () => {
    const shell = read('../src/viewer/v3/EditorV3Shell.tsx');
    expect(shell).toContain("handleCompress('copy')");
    expect(shell).toContain("handleCompress('replace')");
    expect(shell).toContain("replaceOpen: replacesOpenDocument(mode)");
    expect(shell).toMatch(/if \(replacesOpenDocument\(mode\)\) onDocumentMutated/);
  });

  it('the backend command copies unless asked to replace', () => {
    const lib = read('../src-tauri/src/lib.rs');
    expect(lib).toContain('replace_open: Option<bool>');
    expect(lib).toContain('replace_open.unwrap_or(false)');
    expect(lib).toContain('doc.compress_copy(&output_path)');
  });
});
