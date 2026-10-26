// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary. The PDFluent application is free to use,
// including for commercial purposes. Redistribution, or extraction or reuse
// of its components (including the embedded PDF engine), requires a licence.
// See https://pdfluent.com/license for terms.

import { invokeCommand as invoke, reportFallback, describeError } from '../../../lib/commandBridge';
import { openWithPasswordPrompt, OPEN_CANCELLED } from '../../../viewer/state/passwordPrompt';
import { openFailureFromRejection } from '../../../viewer/state/openError';
import i18n from '../../../i18n';
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
  xfa_detected: boolean;
  xfa_notice: string | null;
  active_content?: TauriActiveContentInfo | null;
  /** Permissions of an encrypted document (pdf_engine::DocumentAccess). */
  access?: { encrypted: boolean; owner: boolean; can_print: boolean; read_only: boolean } | null;
  /** The session the backend holds the document in (J-90). */
  session_id?: number;
}

/** What `activate_session` answers: the document's shape and its unsaved state. */
interface TauriSessionActivation extends TauriDocumentInfo {
  modified: boolean;
  path: string | null;
}

interface TauriActiveContentInfo {
  has_active_content: boolean;
  has_javascript: boolean;
  has_open_action: boolean;
  has_additional_actions: boolean;
  has_launch_actions: boolean;
  has_submit_form: boolean;
  has_uri_actions: boolean;
  has_xfa: boolean;
  flags: string[];
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

function documentInfoToPdfDocument(info: TauriDocumentInfo, fileName: string, modified = false): PdfDocument {
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
    isModified: modified,
    ...(info.session_id !== undefined ? { backendSession: info.session_id } : {}),
    ...(info.access?.encrypted ? { encrypted: true } : {}),
    xfaDetected: info.xfa_detected,
    xfaNotice: info.xfa_notice,
    activeContent: info.active_content
      ? {
          hasActiveContent: info.active_content.has_active_content,
          hasJavascript: info.active_content.has_javascript,
          hasOpenAction: info.active_content.has_open_action,
          hasAdditionalActions: info.active_content.has_additional_actions,
          hasLaunchActions: info.active_content.has_launch_actions,
          hasSubmitForm: info.active_content.has_submit_form,
          hasUriActions: info.active_content.has_uri_actions,
          hasXfa: info.active_content.has_xfa,
          flags: info.active_content.flags,
        }
      : null,
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
    options?: DocumentLoadOptions
  ): AsyncEngineResult<PdfDocument> {
    if (typeof source !== 'string') {
      return { success: false, error: { code: 'not-implemented', message: 'loadDocument from binary data not supported' } };
    }
    const segments = source.replace(/\\/g, '/').split('/');
    const fileName = segments[segments.length - 1] ?? source;
    if (options?.attachSession !== undefined) {
      // A document that is already open (J-90): switch the backend to it. No
      // file is read, no password asked; unsaved changes come with it.
      try {
        const activation = await invoke<TauriSessionActivation>('activate_session', { sessionId: options.attachSession });
        return { success: true, value: documentInfoToPdfDocument(activation, fileName, activation.modified) };
      } catch (e) {
        return { success: false, error: { code: 'internal-error', message: describeError(e) } };
      }
    }
    try {
      const info = await openWithPasswordPrompt(
        (password) => invoke<TauriDocumentInfo>('open_pdf', password === undefined ? { path: source } : { path: source, password }),
        fileName,
      );
      if (info === OPEN_CANCELLED) {
        return { success: false, error: { code: 'cancelled', message: 'Opening was cancelled at the password prompt' } };
      }
      if (info.access?.read_only) {
        reportFallback({
          source: 'open_pdf',
          title: i18n.t('passwordPrompt.readOnlyTitle'),
          message: i18n.t('passwordPrompt.readOnlyMessage'),
          code: 'DOCUMENT_READ_ONLY',
          taxonomy: 'tauri_runtime_failure.fs_permission',
        });
      }
      return { success: true, value: documentInfoToPdfDocument(info, fileName) };
    } catch (e) {
      // open_pdf rejects with { code, detail }. The message carries the code,
      // not the engine text, so nothing that prints it shows raw parser output.
      const openFailure = openFailureFromRejection(e);
      return { success: false, error: { code: 'internal-error', message: openFailure.code, openFailure } };
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
