// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary and confidential.
// Free for personal, non-commercial use.
// Commercial use requires a valid license.
// See https://pdfluent.com/license for terms.

import { invoke } from '@tauri-apps/api/core';
import type { PdfDocument, DocumentState, Page, OutlineNode } from '../../../core/document';
import type { DocumentMetadata } from '../../../core/document/metadata';
import type { EngineResult, AsyncEngineResult, DocumentLoadOptions, SaveOptions } from '../../../core/engine/types';
import type { DocumentEngine } from '../../../core/engine/DocumentEngine';
import { createEmptyDocument } from '../../../core/document';

// ---- Backend response types (snake_case from serde) ----

interface TauriPageInfo {
  index: number;
  width_pt: number;
  height_pt: number;
}

interface TauriDocumentInfo {
  page_count: number;
  pages: TauriPageInfo[];
  title: string | null;
  author: string | null;
  form_type: string;
}

interface TauriOutlineItem {
  title: string;
  page_index: number;
  children: TauriOutlineItem[];
}

function mapOutlineItems(items: TauriOutlineItem[]): OutlineNode[] {
  return items.map(item => ({
    title: item.title,
    pageIndex: item.page_index,
    children: mapOutlineItems(item.children),
  }));
}

// ---- Helpers ----

function notImpl(msg: string): { success: false; error: { code: 'not-implemented'; message: string } } {
  return { success: false, error: { code: 'not-implemented', message: msg } };
}

function documentInfoToPdfDocument(info: TauriDocumentInfo, fileName: string): PdfDocument {
  const base = createEmptyDocument(fileName);
  const pages: Page[] = info.pages.map(p => ({
    index: p.index,
    size: { width: p.width_pt, height: p.height_pt },
    rotation: 0 as const,
    contentHash: '',
    isRendered: false,
    metadata: {
      label: String(p.index + 1),
      inRange: true,
      hasAnnotations: false,
      hasForms: false,
    },
  }));

  return {
    ...base,
    fileName,
    pages,
    metadata: {
      ...base.metadata,
      title: info.title ?? fileName,
      ...(info.author != null ? { author: info.author } : {}),
    },
  };
}

/**
 * Tauri-backed document engine.
 *
 * Async methods call the Tauri backend via invoke().
 * Sync methods operate on the in-memory PdfDocument model.
 */
export class TauriDocumentEngine implements DocumentEngine {
  // ---- Async: backed by Tauri backend ----

  async loadDocument(
    source: string | ArrayBuffer | Uint8Array,
    _options?: DocumentLoadOptions
  ): AsyncEngineResult<PdfDocument> {
    if (typeof source !== 'string') {
      return { success: false, error: { code: 'not-implemented', message: 'loadDocument from binary data not supported' } };
    }
    try {
      const info = await invoke<TauriDocumentInfo>('open_pdf', { path: source });
      const segments = source.replace(/\\/g, '/').split('/');
      const fileName = segments[segments.length - 1] ?? source;
      return { success: true, value: documentInfoToPdfDocument(info, fileName) };
    } catch (e) {
      return { success: false, error: { code: 'internal-error', message: String(e) } };
    }
  }

  async saveDocument(
    _document: PdfDocument,
    destination?: string,
    _options?: SaveOptions
  ): AsyncEngineResult<Uint8Array | void> {
    if (!destination) {
      return { success: false, error: { code: 'not-implemented', message: 'saveDocument without destination path not supported' } };
    }
    try {
      await invoke('save_pdf', { path: destination });
      return { success: true, value: undefined };
    } catch (e) {
      return { success: false, error: { code: 'internal-error', message: String(e) } };
    }
  }

  async extractMetadata(
    _source: string | ArrayBuffer | Uint8Array
  ): AsyncEngineResult<DocumentMetadata> {
    return notImpl('extractMetadata requires Tauri backend');
  }

  async createEmptyDocument(_fileName: string): AsyncEngineResult<PdfDocument> {
    return notImpl('createEmptyDocument requires Tauri backend');
  }

  async createDocumentFromPages(
    _pages: Array<{ document: PdfDocument; pageIndex: number }>
  ): AsyncEngineResult<PdfDocument> {
    return notImpl('createDocumentFromPages requires Tauri backend');
  }

  async repairDocument(_document: PdfDocument): AsyncEngineResult<PdfDocument> {
    return notImpl('repairDocument requires Tauri backend');
  }

  async getOutline(document: PdfDocument): AsyncEngineResult<OutlineNode[]> {
    try {
      const items = await invoke<TauriOutlineItem[]>('get_outline', { documentId: document.id });
      return { success: true, value: mapOutlineItems(items) };
    } catch (e) {
      return { success: false, error: { code: 'internal-error', message: String(e) } };
    }
  }

  // ---- Sync: backed by in-memory model ----

  closeDocument(): EngineResult<void> {
    return { success: true, value: undefined };
  }

  isDocumentLoaded(_document: PdfDocument): boolean {
    return true;
  }

  getMetadata(document: PdfDocument): EngineResult<DocumentMetadata> {
    return { success: true, value: document.metadata };
  }

  updateMetadata(document: PdfDocument, metadata: Partial<DocumentMetadata>): EngineResult<PdfDocument> {
    return { success: true, value: { ...document, metadata: { ...document.metadata, ...metadata } } };
  }

  getDocumentState(document: PdfDocument): EngineResult<DocumentState> {
    return { success: true, value: document.state };
  }

  updateDocumentState(document: PdfDocument, state: Partial<DocumentState>): EngineResult<PdfDocument> {
    return { success: true, value: { ...document, state: { ...document.state, ...state } } };
  }

  getFileSize(document: PdfDocument): EngineResult<number> {
    return { success: true, value: document.fileSize };
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
    return notImpl('getPermissions requires Tauri backend');
  }

  compareDocuments(a: PdfDocument, b: PdfDocument): EngineResult<boolean> {
    return { success: true, value: a.id === b.id && a.contentHash === b.contentHash };
  }

  validateDocument(document: PdfDocument): EngineResult<boolean> {
    return { success: true, value: document.pages.length > 0 && document.id.length > 0 };
  }
}
