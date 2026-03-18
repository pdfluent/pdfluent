// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary and confidential.
// Free for personal, non-commercial use.
// Commercial use requires a valid license.
// See https://pdfluent.com/license for terms.

import { useState, useCallback, useMemo, useEffect, type Dispatch, type SetStateAction } from 'react';
import type { PdfDocument, Annotation, Reply, FormField, OutlineNode } from '../../core/document';
import type { PdfEngine } from '../../core/engine/PdfEngine';
import type { DocumentMetadata } from '../../core/document/metadata';
import type { ViewerMode } from '../types';
import type { AnnotationTool } from '../components/ModeToolbar';
import type { DocumentEvent } from '../state/documentEvents';
import { makeDocumentEvent, appendEvent } from '../state/documentEvents';
import { extractDocumentIssues } from '../documentIssues';
import {
  buildReviewSummaryData,
  buildReviewSummaryJson,
  buildReviewSummaryMarkdown,
  buildReviewSummaryHtml,
} from '../export/reviewSummary';
import { buildAuditReportData, buildAuditReportMarkdown } from '../export/auditReport';
import { captureRevisionSnapshot } from '../revisionSnapshot';
import type { RevisionSnapshot } from '../revisionSnapshot';
import { compareSnapshots, formatSnapshotDiffMarkdown } from '../revisionCompare';

const isTauri = typeof window !== 'undefined' && '__TAURI__' in window;

export function useAnnotations(
  pdfDoc: PdfDocument | null,
  engine: PdfEngine | null,
  pageIndex: number,
  pageCount: number,
  mode: ViewerMode,
  setMode: (mode: ViewerMode) => void,
  authorName: string,
  markDirty: () => void,
  docLoadingRef: React.MutableRefObject<boolean>,
  metadata: DocumentMetadata | null,
  currentFilePath: string | null,
  setPageIndex: (idx: number | ((prev: number) => number)) => void,
  setDocumentEventLog: Dispatch<SetStateAction<DocumentEvent[]>>,
  setOutline: Dispatch<SetStateAction<OutlineNode[]>>,
  setFormFields: Dispatch<SetStateAction<FormField[]>>,
  setActiveFieldIdx: Dispatch<SetStateAction<number>>,
  documentEventLog: DocumentEvent[],
) {
  const [allAnnotations, setAllAnnotations] = useState<Annotation[]>([]);
  const [reviewStatuses, setReviewStatuses] = useState<Map<string, 'open' | 'resolved'>>(new Map());
  const [commentReplies, setCommentReplies] = useState<Map<string, Reply[]>>(new Map());
  const [activeCommentIdx, setActiveCommentIdx] = useState(-1);
  const [scannedPageIndices, setScannedPageIndices] = useState<Set<number>>(new Set());
  const [ocrRunning, setOcrRunning] = useState(false);
  // Per-page OCR word boxes — used by OcrOverlay to render bounding boxes
  const [ocrPageWords, setOcrPageWords] = useState<Map<number, Array<{ text: string; confidence: number; x0: number; y0: number; x1: number; y1: number; renderedWidth: number; renderedHeight: number }>>>(new Map());
  const [_ocrProgress, setOcrProgress] = useState<{ processed: number; total: number }>({ processed: 0, total: 0 });
  // Active annotation tool — drives canvas cursor and annotation creation
  const [activeAnnotationTool, setActiveAnnotationTool] = useState<AnnotationTool>(null);
  // Selected non-text annotation (markup type) — rendered with distinct outline in overlay
  const [selectedAnnotationId, setSelectedAnnotationId] = useState<string | null>(null);
  // Revision snapshots — list of captured review-state snapshots for comparison
  const [revisionSnapshots, setRevisionSnapshots] = useState<RevisionSnapshot[]>([]);

  // Text-only annotations (useMemo over allAnnotations) — used by the comment sidebar.
  const comments = useMemo(
    () => allAnnotations
      .filter(a => a.type === 'text')
      .sort((a, b) => a.pageIndex - b.pageIndex)
      .map(a => ({ ...a, status: reviewStatuses.get(a.id) ?? 'open' as const, replies: commentReplies.get(a.id) ?? [] })),
    [allAnnotations, reviewStatuses, commentReplies]
  );

  // Derived document issues — extracted from annotations and review state
  const documentIssues = useMemo(
    () => extractDocumentIssues(allAnnotations, reviewStatuses),
    [allAnnotations, reviewStatuses]
  );

  // Derived: all redaction annotations across all pages.
  const redactions = useMemo(
    () => allAnnotations.filter(a => a.type === 'redaction').sort((a, b) => a.pageIndex - b.pageIndex),
    [allAnnotations]
  );

  // The selected markup annotation object (for RightContextPanel).
  const selectedAnnotation = useMemo(() => {
    if (!selectedAnnotationId) return null;
    return allAnnotations.find(a => a.id === selectedAnnotationId) ?? null;
  }, [selectedAnnotationId, allAnnotations]);

  // All annotation rects on the current page — rendered as clickable markers on the canvas.
  const pageAnnotationMarks = useMemo(() =>
    allAnnotations
      .filter(a => a.pageIndex === pageIndex && a.rect)
      .map(a => ({ id: a.id, rect: a.rect!, color: a.color, type: a.type })),
    [allAnnotations, pageIndex]
  );

  // Compute highlight rects for the active comment (if on current page and has rect)
  const activeHighlights = useMemo(() => {
    if (activeCommentIdx < 0 || activeCommentIdx >= comments.length) return [];
    const c = comments[activeCommentIdx];
    if (!c || c.pageIndex !== pageIndex) return [];
    if (!c.rect) return [];
    return [c.rect];
  }, [activeCommentIdx, comments, pageIndex]);

  // Helper: refetch ALL annotations from backend and update allAnnotations state.
  const refetchComments = useCallback(async () => {
    if (!pdfDoc || !engine) return;
    const annotResult = await engine.annotation.loadAnnotations(pdfDoc);
    if (annotResult.success) {
      setAllAnnotations(annotResult.value);
    }
  }, [pdfDoc, engine]); // eslint-disable-line react-hooks/exhaustive-deps

  // Reset to page 0 and populate derived document data when a new document is loaded.
  useEffect(() => {
    // Restore the saved page for this file path; fall back to 0 for anonymous sources
    let restoredPage = 0;
    if (currentFilePath) {
      try {
        const raw = localStorage.getItem('pdfluent.viewer.pages');
        if (raw) {
          const map = JSON.parse(raw) as Record<string, number>;
          const saved = map[currentFilePath];
          if (typeof saved === 'number' && saved >= 0) {
            restoredPage = pageCount > 0 ? Math.min(saved, pageCount - 1) : saved;
          }
        }
      } catch { /* ignore read errors */ }
    }
    setPageIndex(restoredPage);
    setOutline([]);
    setFormFields([]);
    setAllAnnotations([]);
    setActiveCommentIdx(-1);
    setActiveFieldIdx(-1);
    setSelectedAnnotationId(null);
    setActiveAnnotationTool(null);

    if (!pdfDoc || !engine) return;

    void engine.document.getOutline(pdfDoc).then(result => {
      if (result.success) setOutline(result.value);
    });

    if (isTauri) {
      void import('@tauri-apps/api/core').then(({ invoke }) => {
        void invoke<string[]>('get_page_labels').then(labels => {
          // page labels are consumed by LeftNavRail; we expose them via onPageLabels callback
          // Currently ViewerApp holds pageLabels state and calls setPageLabels — see below.
          void labels; // consumed by caller via effect
        }).catch(() => { /* ignore — labels are optional */ });
      });
    }

    const fieldsResult = engine.form.getAllFormFields(pdfDoc);
    if (fieldsResult.success) setFormFields(fieldsResult.value);

    // Load all annotation types from the PDF file (async).
    void engine.annotation.loadAnnotations(pdfDoc).then(annotResult => {
      if (annotResult.success) {
        setAllAnnotations(annotResult.value);
      }
    });

    // Detect scanned pages: probe each page's extractable text length.
    // Pages with fewer than SCANNED_PAGE_TEXT_THRESHOLD characters are
    // considered scanned (no native text layer) and added to scannedPageIndices.
    const SCANNED_PAGE_TEXT_THRESHOLD = 12;
    void (async () => {
      const scanned = new Set<number>();
      for (let p = 0; p < pdfDoc.pages.length; p++) {
        const result = await engine.query.extractPageTextSpans(pdfDoc, p);
        const totalChars = result.success
          ? result.value.reduce((acc, span) => acc + span.text.length, 0)
          : 0;
        if (totalChars < SCANNED_PAGE_TEXT_THRESHOLD) {
          scanned.add(p);
        }
      }
      setScannedPageIndices(scanned);
    })();
  }, [pdfDoc?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Reset activeAnnotationTool when switching away from review mode
  useEffect(() => {
    if (mode !== 'review') {
      setActiveAnnotationTool(null);
      setSelectedAnnotationId(null);
    }
  }, [mode]);

  // Navigate to a comment by index: jump to its page and record it as active.
  const handleCommentNav = useCallback((idx: number) => {
    setActiveCommentIdx(idx);
    if (idx >= 0 && idx < comments.length) {
      const comment = comments[idx];
      if (comment) setPageIndex(comment.pageIndex);
    }
  }, [comments]); // eslint-disable-line react-hooks/exhaustive-deps

  // Jump to the next comment in the list (wraps around).
  const handleNextComment = useCallback(() => {
    if (comments.length === 0) return;
    const next = activeCommentIdx < comments.length - 1 ? activeCommentIdx + 1 : 0;
    handleCommentNav(next);
  }, [activeCommentIdx, comments, handleCommentNav]);

  // Jump to the previous comment in the list (wraps around).
  const handlePrevComment = useCallback(() => {
    if (comments.length === 0) return;
    const prev = activeCommentIdx > 0 ? activeCommentIdx - 1 : comments.length - 1;
    handleCommentNav(prev);
  }, [activeCommentIdx, comments, handleCommentNav]);

  // Write title/author into the PDF Info dictionary via the Tauri backend, then mark dirty.
  const handleMetadataChange = useCallback((key: 'title' | 'author' | 'subject' | 'keywords', value: string) => {
    if (!pdfDoc || !isTauri) return;
    if (key === 'title' || key === 'author') {
      void import('@tauri-apps/api/core').then(({ invoke }) => {
        void invoke('set_metadata', {
          title: key === 'title' ? value : null,
          author: key === 'author' ? value : null,
        });
      });
    }
    markDirty();
    setDocumentEventLog(prev => appendEvent(prev, makeDocumentEvent(
      'metadata_changed', authorName, -1, key, `Metadata gewijzigd: ${key}`
    )));
  }, [pdfDoc, authorName, markDirty]); // eslint-disable-line react-hooks/exhaustive-deps

  // Create a new empty text annotation at the center of the current page.
  const handleAddComment = useCallback(() => {
    if (!pdfDoc || !engine) return;
    const page = pdfDoc.pages[pageIndex];
    if (!page) return;
    const x = page.size.width / 2;
    const y = page.size.height / 2;
    void engine.annotation.createAnnotation(
      pdfDoc, pageIndex, 'text',
      { x, y, width: 24, height: 24 },
      { contents: '', author: authorName || 'User' }
    ).then(async result => {
      if (result.success) {
        const annotResult = await engine.annotation.loadAnnotations(pdfDoc);
        if (annotResult.success) {
          setAllAnnotations(annotResult.value);
        }
        setDocumentEventLog(prev => appendEvent(prev, makeDocumentEvent(
          'annotation_created', authorName || 'User', pageIndex, result.value?.id ?? '', 'Annotatie aangemaakt'
        )));
      }
    });
  }, [pdfDoc, engine, pageIndex]); // eslint-disable-line react-hooks/exhaustive-deps

  // Delete a comment annotation.
  const handleDeleteComment = useCallback((annotationId: string) => {
    if (!pdfDoc || !engine) return;
    const deletedIdx = comments.findIndex(c => c.id === annotationId);
    const deletedPage = comments[deletedIdx]?.pageIndex ?? -1;
    void engine.annotation.deleteAnnotation(pdfDoc, annotationId).then(async result => {
      if (result.success) {
        await refetchComments();
        setActiveCommentIdx(prev => {
          if (prev < 0) return prev;
          if (deletedIdx === prev) return -1;
          if (deletedIdx < prev) return prev - 1;
          return prev;
        });
        setDocumentEventLog(prev => appendEvent(prev, makeDocumentEvent(
          'annotation_deleted', authorName, deletedPage, annotationId, 'Annotatie verwijderd'
        )));
      }
    });
  }, [pdfDoc, engine, comments, refetchComments]); // eslint-disable-line react-hooks/exhaustive-deps

  // Update a comment's text contents, then refetch.
  const handleUpdateComment = useCallback((annotationId: string, newContents: string) => {
    if (!pdfDoc || !engine) return;
    const annotPage = comments.find(c => c.id === annotationId)?.pageIndex ?? -1;
    void engine.annotation.updateAnnotation(pdfDoc, annotationId, { contents: newContents })
      .then(async result => {
        if (result.success) {
          await refetchComments();
          setDocumentEventLog(prev => appendEvent(prev, makeDocumentEvent(
            'annotation_updated', authorName, annotPage, annotationId, 'Annotatie bijgewerkt'
          )));
        }
      });
  }, [pdfDoc, engine, comments, authorName, refetchComments]); // eslint-disable-line react-hooks/exhaustive-deps

  // Toggle resolved/open status for a comment (stored in frontend review state).
  const handleToggleResolvedStatus = useCallback((annotationId: string) => {
    setReviewStatuses(prev => {
      const next = new Map(prev);
      const current = next.get(annotationId) ?? 'open';
      next.set(annotationId, current === 'open' ? 'resolved' : 'open');
      return next;
    });
  }, []);

  // Add a reply to a comment thread (stored in frontend state).
  const handleAddReply = useCallback((annotationId: string, contents: string, author: string) => {
    const reply: Reply = {
      id: `reply-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      author,
      contents,
      createdAt: new Date(),
    };
    setCommentReplies(prev => {
      const next = new Map(prev);
      const existing = next.get(annotationId) ?? [];
      next.set(annotationId, [...existing, reply]);
      return next;
    });
  }, []);

  // Delete a reply from a comment thread.
  const handleDeleteReply = useCallback((annotationId: string, replyId: string) => {
    setCommentReplies(prev => {
      const next = new Map(prev);
      const existing = next.get(annotationId) ?? [];
      next.set(annotationId, existing.filter(r => r.id !== replyId));
      return next;
    });
  }, []);

  const handleResolveAll = useCallback(() => {
    setReviewStatuses(prev => {
      const next = new Map(prev);
      for (const c of allAnnotations) {
        next.set(c.id, 'resolved');
      }
      return next;
    });
  }, [allAnnotations]);

  const handleDeleteAllResolved = useCallback(() => {
    setReviewStatuses(prev => {
      const next = new Map(prev);
      for (const [id, status] of prev) {
        if (status === 'resolved') next.delete(id);
      }
      return next;
    });
    setAllAnnotations(prev => prev.filter(a => (reviewStatuses.get(a.id) ?? 'open') !== 'resolved'));
  }, [reviewStatuses]);

  // Export the full review summary to a downloadable file.
  const handleExportReviewSummary = useCallback((format: 'json' | 'markdown' | 'html') => {
    if (allAnnotations.length === 0 && documentIssues.length === 0 && documentEventLog.length === 0) return;
    const data = buildReviewSummaryData(
      metadata?.title?.trim() || pdfDoc?.fileName || 'Document',
      allAnnotations,
      reviewStatuses,
      commentReplies,
      documentIssues,
      documentEventLog,
    );
    let content: string;
    let mime: string;
    let ext: string;
    if (format === 'json') {
      content = buildReviewSummaryJson(data);
      mime = 'application/json';
      ext = 'json';
    } else if (format === 'html') {
      content = buildReviewSummaryHtml(data);
      mime = 'text/html';
      ext = 'html';
    } else {
      content = buildReviewSummaryMarkdown(data);
      mime = 'text/markdown';
      ext = 'md';
    }
    const blob = new Blob([content], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `review-summary.${ext}`;
    a.click();
    URL.revokeObjectURL(url);
  }, [allAnnotations, reviewStatuses, commentReplies, documentIssues, metadata, pdfDoc]); // eslint-disable-line react-hooks/exhaustive-deps
  void handleExportReviewSummary; // will be wired to RightContextPanel export button

  // Capture a new revision snapshot of the current review state.
  const handleCaptureSnapshot = useCallback((label: string) => {
    const snapshot = captureRevisionSnapshot(
      label,
      allAnnotations,
      reviewStatuses,
      commentReplies,
      documentIssues,
    );
    setRevisionSnapshots(prev => [...prev, snapshot]);
  }, [allAnnotations, reviewStatuses, commentReplies, documentIssues]); // eslint-disable-line react-hooks/exhaustive-deps
  void handleCaptureSnapshot; // will be wired to revision snapshot UI

  // Compare two snapshots and download the diff as Markdown.
  const handleCompareSnapshots = useCallback((beforeIdx: number, afterIdx: number) => {
    const before = revisionSnapshots[beforeIdx];
    const after = revisionSnapshots[afterIdx];
    if (!before || !after) return;
    const diff = compareSnapshots(before, after);
    const md = formatSnapshotDiffMarkdown(before, after, diff);
    const blob = new Blob([md], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'revision-diff.md';
    a.click();
    URL.revokeObjectURL(url);
  }, [revisionSnapshots]); // eslint-disable-line react-hooks/exhaustive-deps
  void handleCompareSnapshots; // will be wired to revision compare UI

  // Export a formal audit report to a downloadable Markdown file.
  const handleExportAuditReport = useCallback((format: 'markdown') => {
    if (documentEventLog.length === 0 && allAnnotations.length === 0) return;
    const data = buildAuditReportData(
      metadata?.title?.trim() || pdfDoc?.fileName || 'Document',
      allAnnotations,
      documentEventLog,
      documentIssues,
    );
    const content = buildAuditReportMarkdown(data);
    const blob = new Blob([content], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `audit-report.${format === 'markdown' ? 'md' : format}`;
    a.click();
    URL.revokeObjectURL(url);
  }, [allAnnotations, documentIssues, metadata, pdfDoc]); // eslint-disable-line react-hooks/exhaustive-deps
  void handleExportAuditReport; // will be wired to audit report export button

  // Run OCR on selected pages (scanned | all) and store word results for the overlay.
  const handleRunOcr = useCallback(async (options: {
    language: string;
    scope: 'scanned' | 'all';
    preprocessMode: 'off' | 'auto' | 'manual';
  }) => {
    if (!pdfDoc || !isTauri || ocrRunning) return;
    const pagesToProcess: number[] = options.scope === 'scanned'
      ? Array.from(scannedPageIndices)
      : Array.from({ length: pdfDoc.pages.length }, (_, i) => i);
    if (pagesToProcess.length === 0) return;
    setOcrRunning(true);
    setOcrProgress({ processed: 0, total: pagesToProcess.length });
    try {
      const { invoke } = await import('@tauri-apps/api/core');
      const results = new Map(ocrPageWords);
      for (const idx of pagesToProcess) {
        const rendered = await invoke<{ data_base64: string; width: number; height: number }>(
          'render_page', { pageIndex: idx, zoom: 2 }
        );
        const ocrResult = await invoke<{
          words: Array<{ text: string; confidence: number; x0: number; y0: number; x1: number; y1: number }>;
        }>('run_paddle_ocr', {
          payload: {
            image_base64: rendered.data_base64,
            language: options.language,
            include_structure: false,
            preprocess_mode: options.preprocessMode,
          },
        });
        results.set(idx, ocrResult.words.map(w => ({
          ...w,
          renderedWidth: rendered.width,
          renderedHeight: rendered.height,
        })));
        setOcrProgress(prev => ({ ...prev, processed: prev.processed + 1 }));
      }
      setOcrPageWords(results);
    } finally {
      setOcrRunning(false);
    }
  }, [pdfDoc, ocrRunning, scannedPageIndices, ocrPageWords]);

  // Create a text-markup annotation (highlight / underline / strikeout) from text selection rects.
  const handleTextSelection = useCallback(async (
    rects: Array<{ x: number; y: number; width: number; height: number }>
  ) => {
    if (!pdfDoc || !isTauri || !activeAnnotationTool) return;
    if (docLoadingRef.current) return;
    if (activeAnnotationTool !== 'highlight' && activeAnnotationTool !== 'underline' && activeAnnotationTool !== 'strikeout' && activeAnnotationTool !== 'redaction') return;
    if (rects.length === 0) return;
    const validRects = rects.filter(r => r.width > 0 && r.height > 0);
    if (validRects.length === 0) return;
    const color: [number, number, number] = [1.0, 1.0, 0.0];
    const backendRects = validRects.map(r => [r.x, r.y, r.x + r.width, r.y + r.height] as [number, number, number, number]);
    try {
      const { invoke } = await import('@tauri-apps/api/core');
      if (activeAnnotationTool === 'highlight') {
        await invoke('add_highlight_annotation', { pageIndex, rects: backendRects, color });
      } else if (activeAnnotationTool === 'underline') {
        await invoke('add_underline_annotation', { pageIndex, rects: backendRects, color });
      } else if (activeAnnotationTool === 'strikeout') {
        await invoke('add_strikeout_annotation', { pageIndex, rects: backendRects, color });
      } else if (activeAnnotationTool === 'redaction') {
        const minX = Math.min(...validRects.map(r => r.x));
        const minY = Math.min(...validRects.map(r => r.y));
        const maxX = Math.max(...validRects.map(r => r.x + r.width));
        const maxY = Math.max(...validRects.map(r => r.y + r.height));
        const redactionBackendRect: [number, number, number, number] = [minX, minY, maxX, maxY];
        await invoke('add_redaction_annotation', { pageIndex, rect: redactionBackendRect });
      }
      await refetchComments();
      markDirty();
      setActiveAnnotationTool(null);
    } catch { /* silent — task queue surfaces errors */ }
  }, [pdfDoc, pageIndex, activeAnnotationTool, refetchComments, markDirty]); // eslint-disable-line react-hooks/exhaustive-deps

  // Create a rectangle annotation from a drag on the canvas.
  const handleRectDraw = useCallback(async (
    rect: { x: number; y: number; width: number; height: number }
  ) => {
    if (!pdfDoc || !isTauri) return;
    if (docLoadingRef.current) return;
    const color: [number, number, number] = [0.2, 0.4, 0.9];
    const backendRect: [number, number, number, number] = [rect.x, rect.y, rect.x + rect.width, rect.y + rect.height];
    try {
      const { invoke } = await import('@tauri-apps/api/core');
      await invoke('add_shape_annotation', { pageIndex, rect: backendRect, shapeType: 'rectangle', color });
      await refetchComments();
      markDirty();
      setActiveAnnotationTool(null);
    } catch { /* silent */ }
  }, [pdfDoc, pageIndex, refetchComments, markDirty]); // eslint-disable-line react-hooks/exhaustive-deps

  // Create a redaction annotation from a rect.
  const handleRedactionDraw = useCallback(async (
    rect: { x: number; y: number; width: number; height: number }
  ) => {
    if (!pdfDoc || !isTauri) return;
    if (docLoadingRef.current) return;
    const backendRect: [number, number, number, number] = [rect.x, rect.y, rect.x + rect.width, rect.y + rect.height];
    try {
      const { invoke } = await import('@tauri-apps/api/core');
      await invoke('add_redaction_annotation', { pageIndex, rect: backendRect });
      await refetchComments();
      markDirty();
      setActiveAnnotationTool(null);
      setDocumentEventLog(prev => appendEvent(prev, makeDocumentEvent(
        'redaction_created', authorName, pageIndex, '', 'Redactie aangemaakt'
      )));
    } catch { /* silent */ }
  }, [pdfDoc, pageIndex, authorName, refetchComments, markDirty]); // eslint-disable-line react-hooks/exhaustive-deps

  // Delete a selected markup annotation (highlight/underline/strikeout/rectangle).
  const handleDeleteSelectedAnnotation = useCallback((annotationId: string) => {
    if (!pdfDoc || !engine) return;
    void engine.annotation.deleteAnnotation(pdfDoc, annotationId).then(async result => {
      if (result.success) {
        setSelectedAnnotationId(null);
        await refetchComments();
      }
    });
  }, [pdfDoc, engine, refetchComments]); // eslint-disable-line react-hooks/exhaustive-deps

  // Keyboard shortcut: Delete / Backspace → delete the selected markup annotation.
  useEffect(() => {
    function handleDeleteKey(e: KeyboardEvent): void {
      if (e.key !== 'Delete' && e.key !== 'Backspace') return;
      const tag = (e.target as HTMLElement).tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      if (!selectedAnnotationId) return;
      handleDeleteSelectedAnnotation(selectedAnnotationId);
    }
    window.addEventListener('keydown', handleDeleteKey);
    return () => window.removeEventListener('keydown', handleDeleteKey);
  }, [selectedAnnotationId, handleDeleteSelectedAnnotation]);

  // Update the color of a selected markup annotation.
  const handleUpdateAnnotationColor = useCallback(async (annotationId: string, color: [number, number, number]) => {
    if (!pdfDoc) return;
    try {
      const { invoke } = await import('@tauri-apps/api/core');
      await invoke('update_annotation_color', { annotationId, color });
      await refetchComments();
      markDirty();
    } catch { /* silent */ }
  }, [pdfDoc, refetchComments, markDirty]); // eslint-disable-line react-hooks/exhaustive-deps

  // Permanently apply all pending redaction annotations.
  const handleApplyRedactions = useCallback(async () => {
    if (!pdfDoc || !isTauri) return;
    try {
      const { invoke } = await import('@tauri-apps/api/core');
      await invoke('apply_redactions');
      await refetchComments();
      markDirty();
      setDocumentEventLog(prev => appendEvent(prev, makeDocumentEvent(
        'redaction_applied', authorName, -1, '', 'Redacties toegepast'
      )));
    } catch { /* silent */ }
  }, [pdfDoc, authorName, refetchComments, markDirty]); // eslint-disable-line react-hooks/exhaustive-deps

  // Click an annotation marker on the canvas → select it.
  const handleAnnotationClick = useCallback((annotationId: string) => {
    const ann = allAnnotations.find(a => a.id === annotationId);
    if (!ann) return;
    if (ann.type === 'text') {
      const idx = comments.findIndex(c => c.id === annotationId);
      if (idx >= 0) setActiveCommentIdx(idx);
    } else {
      setSelectedAnnotationId(prev => prev === annotationId ? null : annotationId);
    }
    if (mode !== 'review') setMode('review');
  }, [allAnnotations, comments, mode]); // eslint-disable-line react-hooks/exhaustive-deps

  // Reorder pages by invoking the Rust reorder_pages command.
  const handleReorderPages = useCallback(async (newOrder: number[]) => {
    if (!pdfDoc || !isTauri) return;
    try {
      const { invoke } = await import('@tauri-apps/api/core');
      await invoke('reorder_pages', { newOrder });
      markDirty();
    } catch { /* silent */ }
  }, [pdfDoc, markDirty]); // eslint-disable-line react-hooks/exhaustive-deps

  return {
    allAnnotations,
    setAllAnnotations,
    reviewStatuses,
    commentReplies,
    comments,
    activeCommentIdx,
    setActiveCommentIdx,
    scannedPageIndices,
    ocrRunning,
    ocrPageWords,
    activeAnnotationTool,
    setActiveAnnotationTool,
    selectedAnnotationId,
    setSelectedAnnotationId,
    revisionSnapshots,
    documentIssues,
    redactions,
    selectedAnnotation,
    pageAnnotationMarks,
    activeHighlights,
    handleCommentNav,
    handleNextComment,
    handlePrevComment,
    handleMetadataChange,
    handleAddComment,
    handleDeleteComment,
    handleUpdateComment,
    handleToggleResolvedStatus,
    handleAddReply,
    handleDeleteReply,
    handleResolveAll,
    handleDeleteAllResolved,
    handleRunOcr,
    handleTextSelection,
    handleRectDraw,
    handleRedactionDraw,
    handleDeleteSelectedAnnotation,
    handleUpdateAnnotationColor,
    handleApplyRedactions,
    handleAnnotationClick,
    handleReorderPages,
  };
}
