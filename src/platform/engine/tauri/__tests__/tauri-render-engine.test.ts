// Copyright (c) 2026 PDFluent B.V. All rights reserved.
//
// This software is proprietary and confidential.
// Free for personal, non-commercial use.
// Commercial use requires a valid license.
// See https://pdfluent.com/license for terms.

import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { MockedFunction } from 'vitest';

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(),
}));

import { invoke } from '@tauri-apps/api/core';
import { TauriRenderEngine } from '../TauriRenderEngine';
import { createEmptyDocument } from '../../../../core/document';
import type { Page } from '../../../../core/document';

const mockedInvoke = invoke as MockedFunction<typeof invoke>;

// Minimal PdfDocument with N pages, each 595×842pt (A4).
function makeDoc(pageCount: number) {
  const base = createEmptyDocument('test.pdf');
  const pages: Page[] = Array.from({ length: pageCount }, (_, i) => ({
    index: i,
    size: { width: 595, height: 842 },
    rotation: 0 as const,
    contentHash: '',
    isRendered: false,
    metadata: {
      label: String(i + 1),
      inRange: true,
      hasAnnotations: false,
      hasForms: false,
    },
  }));
  return { ...base, pages };
}

// Known base64 string and its expected decoded bytes.
const TEST_BASE64 = 'AQID'; // bytes: [1, 2, 3]
const EXPECTED_BYTES = new Uint8Array([1, 2, 3]);

const MOCK_RENDERED_PAGE = {
  index: 0,
  width: 595,
  height: 842,
  data_base64: TEST_BASE64,
};

describe('TauriRenderEngine — renderPage mapping', () => {
  let engine: TauriRenderEngine;

  beforeEach(() => {
    engine = new TauriRenderEngine();
    vi.clearAllMocks();
  });

  describe('successful path', () => {
    it('decodes data_base64 to Uint8Array with correct bytes', async () => {
      mockedInvoke.mockResolvedValue(MOCK_RENDERED_PAGE);
      const doc = makeDoc(1);

      const result = await engine.renderPage(doc, 0, 595, 842);

      expect(result.success).toBe(true);
      if (!result.success) return;
      expect(result.value).toEqual(EXPECTED_BYTES);
    });

    it('calls invoke with render_page command and correct args', async () => {
      mockedInvoke.mockResolvedValue(MOCK_RENDERED_PAGE);
      const doc = makeDoc(1);

      await engine.renderPage(doc, 0, 595, 842);

      expect(mockedInvoke).toHaveBeenCalledOnce();
      const [cmd, args] = mockedInvoke.mock.calls[0] as [string, Record<string, unknown>];
      expect(cmd).toBe('render_page');
      expect(typeof args['pageIndex']).toBe('number');
      expect(args['scale']).toBeCloseTo(1.0);
    });
  });

  describe('error path', () => {
    it('returns internal-error when invoke rejects', async () => {
      mockedInvoke.mockRejectedValue(new Error('render failed'));
      const doc = makeDoc(1);

      const result = await engine.renderPage(doc, 0, 595, 842);

      expect(result.success).toBe(false);
      if (result.success) return;
      expect(result.error.code).toBe('internal-error');
      expect(result.error.message).toContain('render failed');
    });

    it('returns page-not-found for out-of-range pageIndex without calling invoke', async () => {
      const doc = makeDoc(1);

      const result = await engine.renderPage(doc, 5, 595, 842);

      expect(result.success).toBe(false);
      if (result.success) return;
      expect(result.error.code).toBe('page-not-found');
      expect(mockedInvoke).not.toHaveBeenCalled();
    });
  });
});

describe('TauriRenderEngine — getThumbnail mapping', () => {
  let engine: TauriRenderEngine;

  beforeEach(() => {
    engine = new TauriRenderEngine();
    vi.clearAllMocks();
  });

  describe('successful path', () => {
    it('decodes data_base64 thumbnail to Uint8Array with correct bytes', async () => {
      mockedInvoke.mockResolvedValue(MOCK_RENDERED_PAGE);
      const doc = makeDoc(2);

      const result = await engine.getThumbnail(doc, 1, 120, 170);

      expect(result.success).toBe(true);
      if (!result.success) return;
      expect(result.value).toEqual(EXPECTED_BYTES);
    });

    it('calls invoke with render_thumbnail command', async () => {
      mockedInvoke.mockResolvedValue(MOCK_RENDERED_PAGE);
      const doc = makeDoc(1);

      await engine.getThumbnail(doc, 0, 120, 170);

      expect(mockedInvoke).toHaveBeenCalledOnce();
      const [cmd] = mockedInvoke.mock.calls[0] as [string, unknown];
      expect(cmd).toBe('render_thumbnail');
    });
  });

  describe('error path', () => {
    it('returns page-not-found for out-of-range pageIndex without calling invoke', async () => {
      const doc = makeDoc(1);

      const result = await engine.getThumbnail(doc, 9, 120, 170);

      expect(result.success).toBe(false);
      if (result.success) return;
      expect(result.error.code).toBe('page-not-found');
      expect(mockedInvoke).not.toHaveBeenCalled();
    });

    it('returns internal-error when invoke rejects', async () => {
      mockedInvoke.mockRejectedValue(new Error('thumbnail failed'));
      const doc = makeDoc(1);

      const result = await engine.getThumbnail(doc, 0, 120, 170);

      expect(result.success).toBe(false);
      if (result.success) return;
      expect(result.error.code).toBe('internal-error');
    });
  });
});

describe('TauriRenderEngine — sync helpers', () => {
  let engine: TauriRenderEngine;

  beforeEach(() => {
    engine = new TauriRenderEngine();
    vi.clearAllMocks();
  });

  it('getPageDimensions returns correct size from document model', () => {
    const doc = makeDoc(1);
    const result = engine.getPageDimensions(doc, 0);

    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.value).toEqual({ width: 595, height: 842 });
  });

  it('getPageDimensions returns page-not-found for missing page', () => {
    const doc = makeDoc(1);
    const result = engine.getPageDimensions(doc, 5);

    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.error.code).toBe('page-not-found');
  });
});
