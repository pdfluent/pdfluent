// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary. The PDFluent application is free to use,
// including for commercial purposes. Redistribution, or extraction or reuse
// of its components (including the embedded PDF engine), requires a licence.
// See https://pdfluent.com/license for terms.

import type { PdfDocument, DocumentState, OutlineNode } from '../../document';
import type { DocumentMetadata } from '../../document/metadata';
import type { DocumentLoadOptions, SaveOptions, EngineResult, AsyncEngineResult } from '../types';
import { createEmptyDocument } from '../../document';

/** Prefix of a source that makes the mock open fail; see loadDocument. */
export const MOCK_OPEN_FAILURE_PREFIX = 'mock-open-failure:';
/** What the engine says about a damaged file; must never reach the screen. */
export const MOCK_RAW_ENGINE_TEXT = 'Failed to parse PDF: invalid PDF: Invalid';

export class MockDocumentEngine {
  private documents = new Map<string, PdfDocument>();

  async loadDocument(source: string | ArrayBuffer | Uint8Array, _options?: DocumentLoadOptions): AsyncEngineResult<PdfDocument> {
    // `mock-open-failure:<code>` fails the open the way open_pdf rejects
    // (src-tauri/src/open_error.rs): a code, and the engine's raw text as the
    // detail, so a browser test can check that only the code's message shows.
    if (typeof source === 'string' && source.startsWith(MOCK_OPEN_FAILURE_PREFIX)) {
      const code = source.slice(MOCK_OPEN_FAILURE_PREFIX.length);
      return {
        success: false,
        error: { code: 'internal-error', message: code, openFailure: { code, detail: MOCK_RAW_ENGINE_TEXT } },
      };
    }
    const fileName = typeof source === 'string' ? source : 'mock.pdf';
    const base = createEmptyDocument(fileName);

    const pages = Array.from({ length: 3 }, (_, i) => ({
      index: i,
      size: { width: 612, height: 792 },
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

    const document: PdfDocument = { ...base, pages };
    this.documents.set(document.id, document);
    return { success: true, value: document };
  }

  async saveDocument(_document: PdfDocument, _destination?: string, _options?: SaveOptions): AsyncEngineResult<Uint8Array | void> {
    return { success: true, value: undefined };
  }

  closeDocument(document: PdfDocument): EngineResult<void> {
    this.documents.delete(document.id);
    return { success: true, value: undefined };
  }

  isDocumentLoaded(document: PdfDocument): boolean {
    return this.documents.has(document.id);
  }

  getMetadata(document: PdfDocument): EngineResult<DocumentMetadata> {
    return { success: true, value: document.metadata };
  }

  updateMetadata(document: PdfDocument, metadata: Partial<DocumentMetadata>): EngineResult<PdfDocument> {
    const updated = { ...document, metadata: { ...document.metadata, ...metadata } };
    this.documents.set(document.id, updated);
    return { success: true, value: updated };
  }

  async extractMetadata(_source: string | ArrayBuffer | Uint8Array): AsyncEngineResult<DocumentMetadata> {
    const base = createEmptyDocument('mock.pdf');
    return { success: true, value: base.metadata };
  }

  getDocumentState(document: PdfDocument): EngineResult<DocumentState> {
    return { success: true, value: document.state };
  }

  updateDocumentState(document: PdfDocument, state: Partial<DocumentState>): EngineResult<PdfDocument> {
    const updated = { ...document, state: { ...document.state, ...state } };
    this.documents.set(document.id, updated);
    return { success: true, value: updated };
  }

  getFileSize(_document: PdfDocument): EngineResult<number> {
    return { success: true, value: 1024 * 1024 }; // 1MB
  }

  isModified(document: PdfDocument): boolean {
    return document.isModified;
  }

  getPageCount(document: PdfDocument): EngineResult<number> {
    return { success: true, value: document.pages.length };
  }

  getPermissions(): EngineResult<{
    canPrint: boolean;
    canModify: boolean;
    canCopy: boolean;
    canAnnotate: boolean;
    canFillForms: boolean;
    canExtractContent: boolean;
    canAssemble: boolean;
  }> {
    return {
      success: true,
      value: {
        canPrint: true,
        canModify: true,
        canCopy: true,
        canAnnotate: true,
        canFillForms: true,
        canExtractContent: true,
        canAssemble: true,
      }
    };
  }

  async createEmptyDocument(fileName: string): AsyncEngineResult<PdfDocument> {
    const document = createEmptyDocument(fileName);
    this.documents.set(document.id, document);
    return { success: true, value: document };
  }

  async createDocumentFromPages(): AsyncEngineResult<PdfDocument> {
    return { success: false, error: { code: 'not-implemented', message: 'createDocumentFromPages not implemented in MockDocumentEngine' } };
  }

  compareDocuments(a: PdfDocument, b: PdfDocument): EngineResult<boolean> {
    return { success: true, value: a.id === b.id && a.contentHash === b.contentHash };
  }

  validateDocument(_document: PdfDocument): EngineResult<boolean> {
    return { success: true, value: true };
  }

  async repairDocument(): AsyncEngineResult<PdfDocument> {
    return { success: false, error: { code: 'not-implemented', message: 'repairDocument not implemented in MockDocumentEngine' } };
  }

  async getOutline(_document: PdfDocument): AsyncEngineResult<OutlineNode[]> {
    return { success: true, value: [] };
  }
}
