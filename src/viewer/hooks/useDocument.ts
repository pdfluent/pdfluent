// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary. The PDFluent application is free to use,
// including for commercial purposes. Redistribution, or extraction or reuse
// of its components (including the embedded PDF engine), requires a licence.
// See https://pdfluent.com/license for terms.

import { useState, useCallback } from 'react';
import type { PdfEngine } from '../../core/engine/PdfEngine';
import type { PdfDocument } from '../../core/document';
import { perfMark } from '../performance/perfMarks';
import type { DocumentMetadata } from '../../core/document/metadata';
import { isOpenErrorCode, type OpenFailure } from '../state/openError';
import { logToApp } from '../../lib/commandBridge';

export interface LoadDocumentOptions {
  attachSession?: number;
  quiet?: boolean;
}

interface UseDocumentResult {
  document: PdfDocument | null;
  metadata: DocumentMetadata | null;
  pageCount: number;
  loading: boolean;
  /** Why the last open failed; the screen shows the code's message, never the detail. */
  error: OpenFailure | null;
  isDirty: boolean;
  markDirty: () => void;
  clearDirty: () => void;
  updatePageCount: (n: number) => void;
  replaceDocument: (document: PdfDocument, dirty?: boolean) => void;
  /**
   * Open a file, or with `attachSession` show a document the backend already
   * holds (J-90). Resolves with the document, or null when nothing was loaded
   * (failed, or cancelled at the password prompt). `quiet` keeps a failure off
   * the screen: the caller has a fallback.
   */
  loadDocument: (source: string | ArrayBuffer, options?: LoadDocumentOptions) => Promise<PdfDocument | null>;
  closeDocument: () => void;
  dismissError: () => void;
}

export function useDocument(engine: PdfEngine | null): UseDocumentResult {
  const [doc, setDoc] = useState<PdfDocument | null>(null);
  const [metadata, setMetadata] = useState<DocumentMetadata | null>(null);
  const [pageCount, setPageCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<OpenFailure | null>(null);
  const [isDirty, setIsDirty] = useState(false);

  const markDirty = useCallback(() => { setIsDirty(true); }, []);
  const clearDirty = useCallback(() => { setIsDirty(false); }, []);

  const updatePageCount = useCallback((n: number): void => {
    setPageCount(n);
    setIsDirty(true);
  }, []);

  const replaceDocument = useCallback((document: PdfDocument, dirty = true): void => {
    setDoc(document);
    setMetadata(document.metadata);
    setPageCount(document.pages.length);
    setIsDirty(dirty);
    setError(null);
  }, []);

  const loadDocument = useCallback(async (source: string | ArrayBuffer, options?: LoadDocumentOptions): Promise<PdfDocument | null> => {
    if (!engine) return null;
    perfMark('load_start', { source: typeof source === 'string' ? 'path' : 'bytes' });

    // Close the current document before opening a replacement so both
    // MockDocumentEngine and TauriDocumentEngine follow the same lifecycle.
    // A document shown from a tab (attachSession) stays open: it is parked in
    // the backend, not closed.
    if (doc && options?.attachSession === undefined) {
      engine.document.closeDocument(doc);
    }

    setLoading(true);
    setError(null);

    const result = await engine.document.loadDocument(
      source,
      options?.attachSession === undefined ? undefined : { attachSession: options.attachSession },
    );
    if (!result.success) {
      if (result.error.code !== 'cancelled' && !options?.quiet) {
        const reported = result.error.openFailure;
        const failure: OpenFailure = reported && isOpenErrorCode(reported.code)
          ? { code: reported.code, detail: reported.detail }
          : { code: 'open.unknown', detail: reported ? `${reported.code}: ${reported.detail}` : result.error.message };
        setError(failure);
        void logToApp(`open failed: ${failure.code}: ${failure.detail}`);
      }
      setLoading(false);
      return null;
    }

    const loaded = result.value;
    const metaResult = engine.document.getMetadata(loaded);
    const countResult = engine.document.getPageCount(loaded);

    perfMark('doc_ready');
    setDoc(loaded);
    setMetadata(metaResult.success ? metaResult.value : null);
    setPageCount(countResult.success ? countResult.value : loaded.pages.length);
    setIsDirty(loaded.isModified);
    setLoading(false);
    return loaded;
  }, [engine, doc]);

  const closeDocument = useCallback((): void => {
    if (!engine || !doc) return;
    engine.document.closeDocument(doc);
    setDoc(null);
    setMetadata(null);
    setPageCount(0);
    setError(null);
    setIsDirty(false);
  }, [engine, doc]);

  const dismissError = useCallback((): void => { setError(null); }, []);

  return { document: doc, metadata, pageCount, loading, error, isDirty, markDirty, clearDirty, updatePageCount, replaceDocument, loadDocument, closeDocument, dismissError };
}
