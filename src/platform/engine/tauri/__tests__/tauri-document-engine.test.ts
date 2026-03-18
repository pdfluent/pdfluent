// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
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

describe('TauriDocumentEngine — getOutline mapping', () => {
  let engine: TauriDocumentEngine;

  beforeEach(() => {
    engine = new TauriDocumentEngine();
    vi.clearAllMocks();
  });

  it('returns empty array when backend returns []', async () => {
    mockedInvoke.mockResolvedValue([]);
    const doc = { id: 'doc_test' } as Parameters<typeof engine.getOutline>[0];

    const result = await engine.getOutline(doc);

    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.value).toEqual([]);
  });

  it('maps flat outline items from snake_case to OutlineNode', async () => {
    mockedInvoke.mockResolvedValue([
      { title: 'Chapter 1', page_index: 0, children: [] },
      { title: 'Chapter 2', page_index: 5, children: [] },
    ]);
    const doc = { id: 'doc_test' } as Parameters<typeof engine.getOutline>[0];

    const result = await engine.getOutline(doc);

    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.value).toEqual([
      { title: 'Chapter 1', pageIndex: 0, children: [] },
      { title: 'Chapter 2', pageIndex: 5, children: [] },
    ]);
  });

  it('maps nested children recursively', async () => {
    mockedInvoke.mockResolvedValue([
      {
        title: 'Part I', page_index: 0, children: [
          { title: 'Section 1.1', page_index: 1, children: [] },
          {
            title: 'Section 1.2', page_index: 3, children: [
              { title: 'Subsection 1.2.1', page_index: 4, children: [] },
            ],
          },
        ],
      },
    ]);
    const doc = { id: 'doc_test' } as Parameters<typeof engine.getOutline>[0];

    const result = await engine.getOutline(doc);

    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.value[0]?.title).toBe('Part I');
    expect(result.value[0]?.children).toHaveLength(2);
    expect(result.value[0]?.children[1]?.children[0]?.title).toBe('Subsection 1.2.1');
    expect(result.value[0]?.children[1]?.children[0]?.pageIndex).toBe(4);
  });

  it('calls invoke with get_outline command and documentId', async () => {
    mockedInvoke.mockResolvedValue([]);
    const doc = { id: 'doc_abc123' } as Parameters<typeof engine.getOutline>[0];

    await engine.getOutline(doc);

    expect(mockedInvoke).toHaveBeenCalledWith('get_outline', { documentId: 'doc_abc123' });
  });

  it('returns internal-error when invoke rejects', async () => {
    mockedInvoke.mockRejectedValue(new Error('outline parse failed'));
    const doc = { id: 'doc_test' } as Parameters<typeof engine.getOutline>[0];

    const result = await engine.getOutline(doc);

    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.error.code).toBe('internal-error');
    expect(result.error.message).toContain('outline parse failed');
  });
});
