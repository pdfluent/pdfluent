// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary. The PDFluent application is free to use,
// including for commercial purposes. Redistribution, or extraction or reuse
// of its components (including the embedded PDF engine), requires a licence.
// See https://pdfluent.com/license for terms.

import { describe, expect, it, vi } from 'vitest';
import { downloadPdfBytesInBrowser, normalizePdfFileName } from '../src/viewer/export/browserPdfDownload';

describe('browser PDF download helper', () => {
  it('creates a PDF Blob URL, clicks an anchor, and revokes the object URL', () => {
    const clicked = vi.fn();
    const removed = vi.fn();
    const appended: unknown[] = [];
    let createdBlob: Blob | null = null;
    const anchor = {
      href: '',
      download: '',
      style: { display: '' },
      click: clicked,
      remove: removed,
    } as unknown as HTMLAnchorElement;
    const document = {
      createElement: vi.fn(() => anchor),
      body: {
        appendChild: vi.fn((node: unknown) => {
          appended.push(node);
          return node;
        }),
      },
    } as unknown as Pick<Document, 'createElement' | 'body'>;
    const url = {
      createObjectURL: vi.fn((blob: Blob) => {
        createdBlob = blob;
        return 'blob:pdfluent-export';
      }),
      revokeObjectURL: vi.fn(),
    };

    downloadPdfBytesInBrowser(new Uint8Array([1, 2, 3]), {
      fileName: 'mutated.pdf',
      document,
      url,
    });

    expect(url.createObjectURL).toHaveBeenCalledOnce();
    expect(createdBlob?.type).toBe('application/pdf');
    expect(document.body.appendChild).toHaveBeenCalledWith(anchor);
    expect(appended).toEqual([anchor]);
    expect(anchor.href).toBe('blob:pdfluent-export');
    expect(anchor.download).toBe('mutated.pdf');
    expect(clicked).toHaveBeenCalledOnce();
    expect(removed).toHaveBeenCalledOnce();
    expect(url.revokeObjectURL).toHaveBeenCalledWith('blob:pdfluent-export');
  });

  it('revokes the object URL even when clicking fails', () => {
    const anchor = {
      href: '',
      download: '',
      style: { display: '' },
      click: vi.fn(() => {
        throw new Error('blocked click');
      }),
      remove: vi.fn(),
    } as unknown as HTMLAnchorElement;
    const document = {
      createElement: vi.fn(() => anchor),
      body: { appendChild: vi.fn() },
    } as unknown as Pick<Document, 'createElement' | 'body'>;
    const url = {
      createObjectURL: vi.fn(() => 'blob:pdfluent-export'),
      revokeObjectURL: vi.fn(),
    };

    expect(() => {
      downloadPdfBytesInBrowser(new Uint8Array([4]), { document, url });
    }).toThrow('blocked click');

    expect(anchor.remove).toHaveBeenCalledOnce();
    expect(url.revokeObjectURL).toHaveBeenCalledWith('blob:pdfluent-export');
  });

  it('normalizes download names to PDF filenames', () => {
    expect(normalizePdfFileName('/tmp/My Report')).toBe('My Report.pdf');
    expect(normalizePdfFileName('bad:name?.pdf#preview')).toBe('bad_name.pdf');
    expect(normalizePdfFileName('')).toBe('document.pdf');
  });
});
