// Copyright (c) 2026 PDFluent B.V. All rights reserved.
//
// This software is proprietary and confidential.
// Free for personal, non-commercial use.
// Commercial use requires a valid license.
// See https://pdfluent.com/license for terms.

import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { MockedFunction } from 'vitest';

// Must be declared before module imports — vitest hoists vi.mock to the top.
vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(),
}));

import { invoke } from '@tauri-apps/api/core';
import { TauriDocumentEngine } from '../TauriDocumentEngine';

const mockedInvoke = invoke as MockedFunction<typeof invoke>;

// Mirrors the backend serde response shape (snake_case).
const MOCK_DOCUMENT_INFO = {
  page_count: 2,
  pages: [
    { index: 0, width_pt: 595, height_pt: 842 },
    { index: 1, width_pt: 595, height_pt: 842 },
  ],
  title: 'Test Document',
  author: 'Test Author',
  form_type: 'None',
};

describe('TauriDocumentEngine — loadDocument mapping', () => {
  let engine: TauriDocumentEngine;

  beforeEach(() => {
    engine = new TauriDocumentEngine();
    vi.clearAllMocks();
  });

  describe('successful path', () => {
    it('maps page_count to pages array length', async () => {
      mockedInvoke.mockResolvedValue(MOCK_DOCUMENT_INFO);

      const result = await engine.loadDocument('/docs/test.pdf');

      expect(result.success).toBe(true);
      if (!result.success) return;
      expect(result.value.pages).toHaveLength(2);
    });

    it('maps width_pt / height_pt to page size', async () => {
      mockedInvoke.mockResolvedValue(MOCK_DOCUMENT_INFO);

      const result = await engine.loadDocument('/docs/test.pdf');

      expect(result.success).toBe(true);
      if (!result.success) return;
      expect(result.value.pages[0]?.size).toEqual({ width: 595, height: 842 });
      expect(result.value.pages[1]?.size).toEqual({ width: 595, height: 842 });
    });

    it('maps title from TauriDocumentInfo', async () => {
      mockedInvoke.mockResolvedValue(MOCK_DOCUMENT_INFO);

      const result = await engine.loadDocument('/docs/test.pdf');

      expect(result.success).toBe(true);
      if (!result.success) return;
      expect(result.value.metadata.title).toBe('Test Document');
    });

    it('falls back to fileName when title is null', async () => {
      mockedInvoke.mockResolvedValue({ ...MOCK_DOCUMENT_INFO, title: null });

      const result = await engine.loadDocument('/docs/test.pdf');

      expect(result.success).toBe(true);
      if (!result.success) return;
      expect(result.value.metadata.title).toBe('test.pdf');
    });

    it('maps author when present', async () => {
      mockedInvoke.mockResolvedValue(MOCK_DOCUMENT_INFO);

      const result = await engine.loadDocument('/docs/test.pdf');

      expect(result.success).toBe(true);
      if (!result.success) return;
      expect(result.value.metadata.author).toBe('Test Author');
    });

    it('extracts fileName from path (unix separators)', async () => {
      mockedInvoke.mockResolvedValue(MOCK_DOCUMENT_INFO);

      const result = await engine.loadDocument('/long/path/to/document.pdf');

      expect(result.success).toBe(true);
      if (!result.success) return;
      expect(result.value.fileName).toBe('document.pdf');
    });

    it('extracts fileName from path (windows separators)', async () => {
      mockedInvoke.mockResolvedValue(MOCK_DOCUMENT_INFO);

      const result = await engine.loadDocument('C:\\Users\\user\\document.pdf');

      expect(result.success).toBe(true);
      if (!result.success) return;
      expect(result.value.fileName).toBe('document.pdf');
    });

    it('calls invoke with open_pdf command and correct path', async () => {
      mockedInvoke.mockResolvedValue(MOCK_DOCUMENT_INFO);

      await engine.loadDocument('/docs/test.pdf');

      expect(mockedInvoke).toHaveBeenCalledOnce();
      expect(mockedInvoke).toHaveBeenCalledWith('open_pdf', { path: '/docs/test.pdf' });
    });
  });

  describe('error path', () => {
    it('returns internal-error when invoke rejects', async () => {
      mockedInvoke.mockRejectedValue(new Error('file not found'));

      const result = await engine.loadDocument('/no/such/file.pdf');

      expect(result.success).toBe(false);
      if (result.success) return;
      expect(result.error.code).toBe('internal-error');
      expect(result.error.message).toContain('file not found');
    });

    it('returns not-implemented for ArrayBuffer input', async () => {
      const result = await engine.loadDocument(new ArrayBuffer(8));

      expect(result.success).toBe(false);
      if (result.success) return;
      expect(result.error.code).toBe('not-implemented');
      // invoke must not be called — binary loading is unsupported in Tauri mode
      expect(mockedInvoke).not.toHaveBeenCalled();
    });

    it('returns not-implemented for Uint8Array input', async () => {
      const result = await engine.loadDocument(new Uint8Array([0x25, 0x50, 0x44, 0x46]));

      expect(result.success).toBe(false);
      if (result.success) return;
      expect(result.error.code).toBe('not-implemented');
      expect(mockedInvoke).not.toHaveBeenCalled();
    });
  });
});
