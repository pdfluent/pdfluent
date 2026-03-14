// Copyright (c) 2026 PDFluent B.V. All rights reserved.
//
// This software is proprietary and confidential.
// Free for personal, non-commercial use.
// Commercial use requires a valid license.
// See https://pdfluent.com/license for terms.

import { useState, useCallback } from 'react';
import type { PdfEngine } from '../../core/engine/PdfEngine';
import type { PdfDocument } from '../../core/document';
import type { DocumentMetadata } from '../../core/document/metadata';

interface UseDocumentResult {
  document: PdfDocument | null;
  metadata: DocumentMetadata | null;
  pageCount: number;
  loading: boolean;
  error: string | null;
  isDirty: boolean;
  markDirty: () => void;
  loadDocument: (source: string | ArrayBuffer) => Promise<void>;
  closeDocument: () => void;
}

export function useDocument(engine: PdfEngine | null): UseDocumentResult {
  const [doc, setDoc] = useState<PdfDocument | null>(null);
  const [metadata, setMetadata] = useState<DocumentMetadata | null>(null);
  const [pageCount, setPageCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isDirty, setIsDirty] = useState(false);

  const markDirty = useCallback(() => { setIsDirty(true); }, []);

  const loadDocument = useCallback(async (source: string | ArrayBuffer): Promise<void> => {
    if (!engine) return;

    // Close the current document before opening a replacement so both
    // MockDocumentEngine and TauriDocumentEngine follow the same lifecycle.
    if (doc) {
      engine.document.closeDocument(doc);
    }

    setLoading(true);
    setError(null);

    const result = await engine.document.loadDocument(source);
    if (!result.success) {
      setError(result.error.message);
      setLoading(false);
      return;
    }

    const loaded = result.value;
    const metaResult = engine.document.getMetadata(loaded);
    const countResult = engine.document.getPageCount(loaded);

    setDoc(loaded);
    setMetadata(metaResult.success ? metaResult.value : null);
    setPageCount(countResult.success ? countResult.value : loaded.pages.length);
    setIsDirty(false);
    setLoading(false);
  }, [engine]);

  const closeDocument = useCallback((): void => {
    if (!engine || !doc) return;
    engine.document.closeDocument(doc);
    setDoc(null);
    setMetadata(null);
    setPageCount(0);
    setError(null);
    setIsDirty(false);
  }, [engine, doc]);

  return { document: doc, metadata, pageCount, loading, error, isDirty, markDirty, loadDocument, closeDocument };
}
