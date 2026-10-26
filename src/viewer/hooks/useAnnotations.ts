// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary. The PDFluent application is free to use,
// including for commercial purposes. Redistribution, or extraction or reuse
// of its components (including the embedded PDF engine), requires a licence.
// See https://pdfluent.com/license for terms.

import { isTauriRuntime } from '../../lib/tauri-detection';
import { useState, useCallback, useMemo, useEffect, useRef, type Dispatch, type SetStateAction } from 'react';
import type { PdfDocument, Annotation, Reply, FormField, OutlineNode } from '../../core/document';
import type { PdfEngine } from '../../core/engine/PdfEngine';
import type { DocumentMetadata } from '../../core/document/metadata';
import type { AnnotationAppearance, ViewerMode } from '../types';
import { DEFAULT_ANNOTATION_APPEARANCE } from '../types';
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
import i18n from '../../i18n';
import { reportCommandFailure } from '../../lib/commandBridge';
import { markerTarget, newlyPlacedImage, pageImageAnnotations, pageImageId, parsePageImageId, type PageImageInfo } from '../pageImages';
import { runWhenIdle, whenFirstPainted } from '../performance/perfMarks';
import { isMovableAnnotation, moveRect, nudgeForKey, toBackendRect, type PdfRect } from '../interaction/annotationGeometry';
import { commitPlacement, type Placement, type PageSize } from '../v3/placement';

const isTauri = isTauriRuntime();

function annotationColorToHex(color: [number, number, number]): string {
  const channels = color.map((channel) => {
    const value = Math.round(Math.max(0, Math.min(1, channel)) * 255);
    return value.toString(16).padStart(2, '0');
  });
  return `#${channels.join('')}`;
}

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
  /** The pages whose rendering an annotation edit changed (appearance streams
   *  are drawn into the page bitmap, so a moved stamp must be re-rendered). */
  onAnnotationsChanged?: (pages: number[]) => void,
) {
  const [allAnnotations, setAllAnnotations] = useState<Annotation[]>([]);
  const [reviewStatuses, setReviewStatuses] = useState<Map<string, 'open' | 'resolved'>>(new Map());
  const [commentReplies, setCommentReplies] = useState<Map<string, Reply[]>>(new Map());
  const [activeCommentIdx, setActiveCommentIdx] = useState(-1);
  const [scannedPageIndices, setScannedPageIndices] = useState<Set<number>>(new Set());
  // Active annotation tool — drives canvas cursor and annotation creation
  const [activeAnnotationTool, setActiveAnnotationTool] = useState<AnnotationTool>(null);
  const [annotationAppearance, setAnnotationAppearance] = useState<AnnotationAppearance>(DEFAULT_ANNOTATION_APPEARANCE);
  // Selected non-text annotation (markup type) — rendered with distinct outline in overlay
  const [selectedAnnotationId, setSelectedAnnotationId] = useState<string | null>(null);
  // Images already in the page content of the current page (#723), shown to
  // the selection code as placed-image stamps.
  const [pageImages, setPageImages] = useState<Annotation[]>([]);
  const pageIndexRef = useRef(pageIndex);
  pageIndexRef.current = pageIndex;
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
    return allAnnotations.find(a => a.id === selectedAnnotationId)
      ?? pageImages.find(a => a.id === selectedAnnotationId)
      ?? null;
  }, [selectedAnnotationId, allAnnotations, pageImages]);

  // All annotation rects on the current page — rendered as clickable markers on the canvas.
  const pageAnnotationMarks = useMemo(() =>
    [...allAnnotations, ...pageImages]
      .filter(a => a.pageIndex === pageIndex && a.rect)
      .map(a => ({ id: a.id, rect: a.rect!, color: a.color, type: a.type })),
    [allAnnotations, pageImages, pageIndex]
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
  const loadPageImages = useCallback(async (page: number) => {
    if (!pdfDoc || !isTauri) {
      setPageImages([]);
      return;
    }
    try {
      const { invokeCommand: invoke } = await import('../../lib/commandBridge');
      const images = await invoke<PageImageInfo[]>('list_page_images', { pageIndex: page });
      // A late answer for a page the user has left is not this page's.
      if (pageIndexRef.current === page) setPageImages(pageImageAnnotations(page, images));
    } catch (err) {
      setPageImages([]);
      if (err instanceof Error) reportCommandFailure('list_page_images', err);
    }
  }, [pdfDoc]);

  const allAnnotationsRef = useRef(allAnnotations);
  allAnnotationsRef.current = allAnnotations;

  /** Reload the annotations; resolves with what was loaded, or null when nothing was. */
  const refetchComments = useCallback(async (): Promise<Annotation[] | null> => {
    if (!pdfDoc || !engine) return null;
    const annotResult = await engine.annotation.loadAnnotations(pdfDoc);
    if (annotResult.success) {
      setAllAnnotations(annotResult.value);
    }
    await loadPageImages(pageIndexRef.current);
    return annotResult.success ? annotResult.value : null;
  }, [pdfDoc, engine, loadPageImages]);

  useEffect(() => {
    void loadPageImages(pageIndex);
  }, [pageIndex, loadPageImages]);

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
    //
    // This walks EVERY page. On a 209-page document it is 209 backend calls,
    // and it used to start in the same React commit as the first page render,
    // so it queued ahead of the one render the user is actually waiting for.
    // Nothing on screen needs it before the first page is visible: it feeds the
    // OCR offer and the scanned-page badge.
    //
    // So: wait for the first paint, then walk in idle time. The document stays
    // fully usable while it runs, and a document whose first page never paints
    // still gets probed (whenFirstPainted has a timeout) rather than silently
    // losing the feature.
    const SCANNED_PAGE_TEXT_THRESHOLD = 12;
    const SCAN_BATCH_SIZE = 8;
    let probeCancelled = false;
    void (async () => {
      await whenFirstPainted(pdfDoc.id);
      if (probeCancelled) return;
      const scanned = new Set<number>();
      const totalPages = pdfDoc.pages.length;
      for (let batch = 0; batch < totalPages; batch += SCAN_BATCH_SIZE) {
        if (probeCancelled) return;
        await new Promise<void>(resolve => { runWhenIdle(resolve); });
        if (probeCancelled) return;
        const batchEnd = Math.min(batch + SCAN_BATCH_SIZE, totalPages);
        const promises = [];
        for (let p = batch; p < batchEnd; p++) {
          promises.push(
            engine.query.extractPageTextSpans(pdfDoc, p).then(result => {
              const totalChars = result.success
                ? result.value.reduce((acc, span) => acc + span.text.length, 0)
                : 0;
              if (totalChars < SCANNED_PAGE_TEXT_THRESHOLD) scanned.add(p);
            })
          );
        }
        await Promise.all(promises);
      }
      if (!probeCancelled) setScannedPageIndices(scanned);
    })();

    return () => { probeCancelled = true; };
  }, [pdfDoc?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Reset activeAnnotationTool when switching away from review mode. A
  // selection survives the edit mode: that is where its panel lives (J-46).
  useEffect(() => {
    if (mode !== 'review') setActiveAnnotationTool(null);
    if (mode !== 'review' && mode !== 'edit') setSelectedAnnotationId(null);
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
      void import('../../lib/commandBridge').then(({ invokeCommand: invoke }) => {
        void invoke('set_metadata', {
          title: key === 'title' ? value : null,
          author: key === 'author' ? value : null,
        });
      });
    }
    markDirty();
    setDocumentEventLog(prev => appendEvent(prev, makeDocumentEvent(
      'metadata_changed', authorName, -1, key, i18n.t('events.metadataChanged', { key })
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
        markDirty();
        const annotResult = await engine.annotation.loadAnnotations(pdfDoc);
        if (annotResult.success) {
          setAllAnnotations(annotResult.value);
        }
        setDocumentEventLog(prev => appendEvent(prev, makeDocumentEvent(
          'annotation_created', authorName || 'User', pageIndex, result.value?.id ?? '', i18n.t('events.annotationCreated')
        )));
      }
    });
  }, [pdfDoc, engine, pageIndex, markDirty]); // eslint-disable-line react-hooks/exhaustive-deps

  // A sticky note with its comment at a point the person clicked (J-51).
  const handleAddNote = useCallback(async (
    targetPage: number,
    point: { x: number; y: number },
    text: string,
  ): Promise<boolean> => {
    if (!pdfDoc || !engine) return false;
    const result = await engine.annotation.createAnnotation(
      pdfDoc, targetPage, 'text',
      { x: point.x, y: point.y, width: 24, height: 24 },
      { contents: text, author: authorName || 'User' },
    );
    if (!result.success) return false;
    markDirty();
    await refetchComments();
    setDocumentEventLog(prev => appendEvent(prev, makeDocumentEvent(
      'annotation_created', authorName || 'User', targetPage, result.value?.id ?? '', i18n.t('events.annotationCreated')
    )));
    return true;
  }, [pdfDoc, engine, authorName, markDirty, refetchComments]); // eslint-disable-line react-hooks/exhaustive-deps

  // Delete a comment annotation.
  const handleDeleteComment = useCallback((annotationId: string) => {
    if (!pdfDoc || !engine) return;
    const deletedIdx = comments.findIndex(c => c.id === annotationId);
    const deletedPage = comments[deletedIdx]?.pageIndex ?? -1;
    void engine.annotation.deleteAnnotation(pdfDoc, annotationId).then(async result => {
      if (result.success) {
        markDirty();
        await refetchComments();
        setActiveCommentIdx(prev => {
          if (prev < 0) return prev;
          if (deletedIdx === prev) return -1;
          if (deletedIdx < prev) return prev - 1;
          return prev;
        });
        setDocumentEventLog(prev => appendEvent(prev, makeDocumentEvent(
          'annotation_deleted', authorName, deletedPage, annotationId, i18n.t('events.annotationDeleted')
        )));
      }
    });
  }, [pdfDoc, engine, comments, refetchComments, markDirty]); // eslint-disable-line react-hooks/exhaustive-deps

  // Update a comment's text contents, then refetch.
  const handleUpdateComment = useCallback((annotationId: string, newContents: string) => {
    if (!pdfDoc || !engine) return;
    const annotPage = comments.find(c => c.id === annotationId)?.pageIndex ?? -1;
    void engine.annotation.updateAnnotation(pdfDoc, annotationId, { contents: newContents })
      .then(async result => {
        if (result.success) {
          markDirty();
          await refetchComments();
          setDocumentEventLog(prev => appendEvent(prev, makeDocumentEvent(
            'annotation_updated', authorName, annotPage, annotationId, i18n.t('events.annotationUpdated')
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
  }, [allAnnotations, reviewStatuses, commentReplies, documentIssues]);
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
  }, [revisionSnapshots]);
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

  // Create a text-markup annotation (highlight / underline / strikeout) from text selection rects.
  const handleTextSelection = useCallback(async (
    rects: Array<{ x: number; y: number; width: number; height: number }>
  ) => {
    if (!pdfDoc || !engine || !activeAnnotationTool) return;
    if (docLoadingRef.current) return;
    if (activeAnnotationTool !== 'highlight' && activeAnnotationTool !== 'underline' && activeAnnotationTool !== 'strikeout' && activeAnnotationTool !== 'redaction') return;
    if (rects.length === 0) return;
    const validRects = rects.filter(r => r.width > 0 && r.height > 0);
    if (validRects.length === 0) return;
    if (!isTauri) {
      if (activeAnnotationTool !== 'highlight') return;
      for (const rect of validRects) {
        const result = await engine.annotation.createAnnotation(
          pdfDoc, pageIndex, 'highlight', rect,
          { contents: '', author: authorName || 'User', color: annotationColorToHex(annotationAppearance.color) }
        );
        if (!result.success) return;
      }
      await refetchComments();
      markDirty();
      setActiveAnnotationTool(null);
      return;
    }
    const color = annotationAppearance.color;
    const backendRects = validRects.map(r => [r.x, r.y, r.x + r.width, r.y + r.height] as [number, number, number, number]);
    try {
      const { invokeCommand: invoke } = await import('../../lib/commandBridge');
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
  }, [pdfDoc, pageIndex, activeAnnotationTool, annotationAppearance, refetchComments, markDirty, authorName]); // eslint-disable-line react-hooks/exhaustive-deps

  // Create a text-markup annotation directly (from floating selection toolbar, no active tool required).
  const createTextMarkupFromSelection = useCallback(async (
    type: 'highlight' | 'underline' | 'strikeout',
    rects: Array<{ x: number; y: number; width: number; height: number }>
  ) => {
    if (!pdfDoc || !engine) return;
    if (docLoadingRef.current) return;
    if (rects.length === 0) return;
    const validRects = rects.filter(r => r.width > 0 && r.height > 0);
    if (validRects.length === 0) return;
    if (!isTauri) {
      if (type !== 'highlight') return;
      for (const rect of validRects) {
        const result = await engine.annotation.createAnnotation(
          pdfDoc, pageIndex, 'highlight', rect,
          { contents: '', author: authorName || 'User', color: annotationColorToHex(annotationAppearance.color) }
        );
        if (!result.success) return;
      }
      await refetchComments();
      markDirty();
      return;
    }
    const color = annotationAppearance.color;
    const backendRects = validRects.map(r => [r.x, r.y, r.x + r.width, r.y + r.height] as [number, number, number, number]);
    try {
      const { invokeCommand: invoke } = await import('../../lib/commandBridge');
      if (type === 'highlight') {
        await invoke('add_highlight_annotation', { pageIndex, rects: backendRects, color });
      } else if (type === 'underline') {
        await invoke('add_underline_annotation', { pageIndex, rects: backendRects, color });
      } else if (type === 'strikeout') {
        await invoke('add_strikeout_annotation', { pageIndex, rects: backendRects, color });
      }
      await refetchComments();
      markDirty();
    } catch { /* silent — task queue surfaces errors */ }
  }, [pdfDoc, pageIndex, annotationAppearance, refetchComments, markDirty, authorName]); // eslint-disable-line react-hooks/exhaustive-deps

  // Create a rectangle annotation from a drag on the canvas.
  const handleRectDraw = useCallback(async (
    rect: { x: number; y: number; width: number; height: number }
  ) => {
    if (!pdfDoc || !isTauri) return;
    if (docLoadingRef.current) return;
    const color = annotationAppearance.color;
    const backendRect: [number, number, number, number] = [rect.x, rect.y, rect.x + rect.width, rect.y + rect.height];
    try {
      const { invokeCommand: invoke } = await import('../../lib/commandBridge');
      await invoke('add_shape_annotation', { pageIndex, rect: backendRect, shapeType: 'rectangle', color, strokeWidth: annotationAppearance.strokeWidth });
      await refetchComments();
      markDirty();
      setActiveAnnotationTool(null);
    } catch { /* silent */ }
  }, [pdfDoc, pageIndex, refetchComments, markDirty, annotationAppearance]); // eslint-disable-line react-hooks/exhaustive-deps

  // Create a freehand ink annotation from a stroke drawn on the canvas.
  //
  // The backend takes a list of paths so one annotation can hold several
  // strokes; the canvas commits one stroke at a time, which is what makes each
  // stroke individually undoable.
  const handleInkDraw = useCallback(async (path: Array<[number, number]>) => {
    if (!pdfDoc || !isTauri) return;
    if (docLoadingRef.current) return;
    try {
      const { invokeCommand: invoke } = await import('../../lib/commandBridge');
      await invoke('add_ink_annotation', {
        pageIndex,
        paths: [path],
        color: annotationAppearance.color,
        width: annotationAppearance.strokeWidth,
      });
      await refetchComments();
      markDirty();
    } catch { /* silent — task queue surfaces errors */ }
  }, [pdfDoc, pageIndex, refetchComments, markDirty, annotationAppearance]); // eslint-disable-line react-hooks/exhaustive-deps

  // Create a redaction annotation from a rect.
  const handleRedactionDraw = useCallback(async (
    rect: { x: number; y: number; width: number; height: number }
  ) => {
    if (!pdfDoc || !isTauri) return;
    if (docLoadingRef.current) return;
    const backendRect: [number, number, number, number] = [rect.x, rect.y, rect.x + rect.width, rect.y + rect.height];
    try {
      const { invokeCommand: invoke } = await import('../../lib/commandBridge');
      await invoke('add_redaction_annotation', { pageIndex, rect: backendRect });
      await refetchComments();
      markDirty();
      setActiveAnnotationTool(null);
      setDocumentEventLog(prev => appendEvent(prev, makeDocumentEvent(
        'redaction_created', authorName, pageIndex, '', 'Redactie aangemaakt'
      )));
    } catch { /* silent */ }
  }, [pdfDoc, pageIndex, authorName, refetchComments, markDirty]); // eslint-disable-line react-hooks/exhaustive-deps

  const pageOfAnnotation = useCallback(
    (annotationId: string) =>
      parsePageImageId(annotationId)?.pageIndex
      ?? allAnnotations.find(a => a.id === annotationId)?.pageIndex
      ?? pageIndex,
    [allAnnotations, pageIndex],
  );

  // Delete a selected markup annotation (highlight/underline/strikeout/rectangle).
  const handleDeleteSelectedAnnotation = useCallback((annotationId: string) => {
    if (!pdfDoc || !engine) return;
    const page = pageOfAnnotation(annotationId);
    const placed = parsePageImageId(annotationId);
    if (placed) {
      void (async () => {
        try {
          const { invokeCommand: invoke } = await import('../../lib/commandBridge');
          await invoke('delete_page_image', { pageIndex: placed.pageIndex, imageIndex: placed.index });
          markDirty();
          setSelectedAnnotationId(null);
          await refetchComments();
          onAnnotationsChanged?.([page]);
        } catch (err) {
          if (err instanceof Error) reportCommandFailure('delete_page_image', err);
        }
      })();
      return;
    }
    void engine.annotation.deleteAnnotation(pdfDoc, annotationId).then(async result => {
      if (result.success) {
        markDirty();
        setSelectedAnnotationId(null);
        await refetchComments();
        onAnnotationsChanged?.([page]);
      }
    });
  }, [pdfDoc, engine, refetchComments, markDirty, onAnnotationsChanged, pageOfAnnotation]);

  // Move or resize an annotation (J-46). The backend carries the shape's own
  // geometry along and redraws its appearance; the ids stay the same.
  const handleUpdateAnnotationRect = useCallback(async (annotationId: string, rect: PdfRect) => {
    if (!pdfDoc || !isTauri) return;
    try {
      const { invokeCommand: invoke } = await import('../../lib/commandBridge');
      const placed = parsePageImageId(annotationId);
      if (placed) {
        // The placement may have been wrapped in `q cm … Q`: it keeps its
        // selection under the index the backend reports.
        const index = await invoke<number>('move_page_image', {
          pageIndex: placed.pageIndex,
          imageIndex: placed.index,
          rect: toBackendRect(rect),
        });
        setSelectedAnnotationId(pageImageId(placed.pageIndex, index));
      } else {
        await invoke('update_annotation_rect', { annotationId, rect: toBackendRect(rect) });
      }
      await refetchComments();
      markDirty();
      onAnnotationsChanged?.([pageOfAnnotation(annotationId)]);
    } catch (err) {
      // A backend refusal arrives as a string and invokeCommand has already
      // shown it; an Error never reached the backend and is reported here.
      if (err instanceof Error) reportCommandFailure('update_annotation_rect', err);
    }
  }, [pdfDoc, refetchComments, markDirty, onAnnotationsChanged, pageOfAnnotation]);

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

  // Arrow keys nudge a selected shape, stamp or text box (1 pt, 10 with Shift).
  useEffect(() => {
    function handleNudgeKey(e: KeyboardEvent): void {
      const target = e.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT' || target.isContentEditable) return;
      if (!selectedAnnotationId) return;
      const nudge = nudgeForKey(e.key, e.shiftKey);
      const ann = allAnnotations.find(a => a.id === selectedAnnotationId)
        ?? pageImages.find(a => a.id === selectedAnnotationId);
      if (!nudge || !ann?.rect || !isMovableAnnotation(ann.type)) return;
      e.preventDefault();
      void handleUpdateAnnotationRect(ann.id, moveRect(ann.rect, nudge.dx, nudge.dy));
    }
    window.addEventListener('keydown', handleNudgeKey);
    return () => window.removeEventListener('keydown', handleNudgeKey);
  }, [selectedAnnotationId, allAnnotations, pageImages, handleUpdateAnnotationRect]);

  // Update the color of a selected annotation. The backend redraws its
  // appearance, so the page shows the new colour too, not only the panel.
  const handleUpdateAnnotationColor = useCallback(async (annotationId: string, color: [number, number, number]) => {
    if (!pdfDoc) return;
    try {
      const { invokeCommand: invoke } = await import('../../lib/commandBridge');
      await invoke('update_annotation_color', { annotationId, color });
      await refetchComments();
      markDirty();
      onAnnotationsChanged?.([pageOfAnnotation(annotationId)]);
    } catch (err) {
      // A backend refusal arrives as a string and invokeCommand has already
      // shown it; an Error never reached the backend and is reported here.
      if (err instanceof Error) reportCommandFailure('update_annotation_color', err);
    }
  }, [pdfDoc, refetchComments, markDirty, onAnnotationsChanged, pageOfAnnotation]);

  // Rewrite the text of a text box; its appearance follows (J-44).
  const handleUpdateAnnotationText = useCallback(async (annotationId: string, text: string) => {
    if (!pdfDoc || !isTauri) return;
    try {
      const { invokeCommand: invoke } = await import('../../lib/commandBridge');
      await invoke('update_annotation_contents', { annotationId, contents: text });
      await refetchComments();
      markDirty();
      onAnnotationsChanged?.([pageOfAnnotation(annotationId)]);
    } catch (err) {
      // A backend refusal arrives as a string and invokeCommand has already
      // shown it; an Error never reached the backend and is reported here.
      if (err instanceof Error) reportCommandFailure('update_annotation_contents', err);
    }
  }, [pdfDoc, refetchComments, markDirty, onAnnotationsChanged, pageOfAnnotation]);

  // Swap the picture of a placed image (J-45).
  const handleReplaceAnnotationImage = useCallback(async (annotationId: string, dataUrl: string) => {
    if (!pdfDoc || !isTauri) return;
    try {
      const { invokeCommand: invoke } = await import('../../lib/commandBridge');
      const placed = parsePageImageId(annotationId);
      if (placed) {
        const index = await invoke<number>('replace_page_image', {
          pageIndex: placed.pageIndex,
          imageIndex: placed.index,
          imageBase64: dataUrl,
        });
        setSelectedAnnotationId(pageImageId(placed.pageIndex, index));
      } else {
        await invoke('replace_annotation_image', { annotationId, imageBase64: dataUrl });
      }
      await refetchComments();
      markDirty();
      onAnnotationsChanged?.([pageOfAnnotation(annotationId)]);
    } catch (err) {
      // A backend refusal arrives as a string and invokeCommand has already
      // shown it; an Error never reached the backend and is reported here.
      if (err instanceof Error) reportCommandFailure('replace_annotation_image', err);
    }
  }, [pdfDoc, refetchComments, markDirty, onAnnotationsChanged, pageOfAnnotation]);

  // Write an armed placement (text box, image, stamp, signature) into the PDF.
  // Resolves true when it landed, so the shell can say so.
  const handlePlaceAnnotation = useCallback(async (
    placement: Placement,
    targetPage: number,
    point: { x: number; y: number },
    pageSize: PageSize,
  ): Promise<boolean> => {
    if (!pdfDoc || !isTauri) return false;
    if (docLoadingRef.current) return false;
    try {
      const { invokeCommand: invoke } = await import('../../lib/commandBridge');
      const idsBefore = new Set(allAnnotationsRef.current.map(a => a.id));
      await commitPlacement(
        (command, args) => invoke(command, args),
        placement,
        targetPage,
        point,
        pageSize,
      );
      const loaded = await refetchComments();
      markDirty();
      onAnnotationsChanged?.([targetPage]);
      // A placed picture is selected, ready to move, replace or delete (J-45).
      if (placement.kind === 'image' && loaded) {
        const placed = newlyPlacedImage(idsBefore, loaded, targetPage);
        if (placed) setSelectedAnnotationId(placed.id);
      }
      return true;
    } catch (err) {
      // A backend refusal arrives as a string and invokeCommand has already
      // shown it; an Error (nothing drawn, nothing typed) is reported here.
      if (err instanceof Error) reportCommandFailure(`place_${placement.kind}`, err);
      return false;
    }
  }, [pdfDoc, refetchComments, markDirty, onAnnotationsChanged]); // eslint-disable-line react-hooks/exhaustive-deps

  // Permanently apply all pending redaction annotations.
  //
  // Applying rewrites page content on any page. The page bitmaps are cached by
  // revision, so every page is re-rendered: `[]` means "no page named, so all"
  // (see handleDocumentMutated). Without it the old text stayed on screen until
  // the zoom changed, though the document was already redacted.
  // A refusal (redaction-incomplete, a signed or XFA document) is rethrown so
  // the panel reports it instead of claiming the redactions were applied.
  const handleApplyRedactions = useCallback(async () => {
    if (!pdfDoc || !isTauri) return;
    const { invokeCommand: invoke } = await import('../../lib/commandBridge');
    await invoke('apply_redactions');
    await refetchComments();
    markDirty();
    onAnnotationsChanged?.([]);
    setDocumentEventLog(prev => appendEvent(prev, makeDocumentEvent(
      'redaction_applied', authorName, -1, '', 'Redacties toegepast'
    )));
  }, [pdfDoc, authorName, refetchComments, markDirty, onAnnotationsChanged]); // eslint-disable-line react-hooks/exhaustive-deps

  // Search for text and redact every match. The backend removes the text from
  // the page content at once (there are no draft marks to review), so the pages
  // must be re-rendered like after an apply. A backend error is rethrown: the
  // old `return null` made a refusal read as "no matches".
  const handleRedactSearch = useCallback(async (query: string): Promise<{ matchesFound: number; areasRedacted: number } | null> => {
    if (!pdfDoc || !isTauri || !query.trim()) return null;
    const { invokeCommand: invoke } = await import('../../lib/commandBridge');
    const result = await invoke<{ matches_found: number; areas_redacted: number }>('redact_search', { query });
    await refetchComments();
    markDirty();
    onAnnotationsChanged?.([]);
    return { matchesFound: result.matches_found, areasRedacted: result.areas_redacted };
  }, [pdfDoc, refetchComments, markDirty, onAnnotationsChanged]);

  // Strip document metadata (author, title, etc.) permanently.
  const handleRedactMetadata = useCallback(async (): Promise<boolean> => {
    if (!pdfDoc || !isTauri) return false;
    try {
      const { invokeCommand: invoke } = await import('../../lib/commandBridge');
      await invoke('redact_metadata');
      markDirty();
      return true;
    } catch { return false; }
  }, [pdfDoc, markDirty]);

  // Click an annotation marker on the canvas → select it.
  const handleAnnotationClick = useCallback((annotationId: string) => {
    const ann = markerTarget(annotationId, allAnnotations, pageImages);
    if (!ann) return;
    if (ann.type === 'text') {
      const idx = comments.findIndex(c => c.id === annotationId);
      if (idx >= 0) setActiveCommentIdx(idx);
    } else {
      setSelectedAnnotationId(prev => prev === annotationId ? null : annotationId);
    }
    if (mode !== 'review' && mode !== 'edit') setMode('review');
  }, [allAnnotations, pageImages, comments, mode]); // eslint-disable-line react-hooks/exhaustive-deps

  // Reorder pages by invoking the Rust reorder_pages command.
  const handleReorderPages = useCallback(async (newOrder: number[]) => {
    if (!pdfDoc || !isTauri) return;
    try {
      const { invokeCommand: invoke } = await import('../../lib/commandBridge');
      await invoke('reorder_pages', { newOrder });
      markDirty();
    } catch { /* silent */ }
  }, [pdfDoc, markDirty]);

  // Delete a single page by index; returns the new page count or null on failure.
  const handleDeletePage = useCallback(async (pageIndex: number): Promise<number | null> => {
    if (!pdfDoc || !isTauri) return null;
    try {
      const { invokeCommand: invoke } = await import('../../lib/commandBridge');
      const result = await invoke<{ page_count: number }>('delete_pages', { pageIndices: [pageIndex] });
      return result.page_count;
    } catch { return null; }
  }, [pdfDoc]);

  return {
    refetchAnnotations: refetchComments,
    allAnnotations,
    setAllAnnotations,
    reviewStatuses,
    commentReplies,
    comments,
    activeCommentIdx,
    setActiveCommentIdx,
    scannedPageIndices,
    activeAnnotationTool,
    setActiveAnnotationTool,
    annotationAppearance,
    setAnnotationAppearance,
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
    handleAddNote,
    handleDeleteComment,
    handleUpdateComment,
    handleToggleResolvedStatus,
    handleAddReply,
    handleDeleteReply,
    handleResolveAll,
    handleDeleteAllResolved,
    handleTextSelection,
    createTextMarkupFromSelection,
    handleRectDraw,
    handleInkDraw,
    handleRedactionDraw,
    handleDeleteSelectedAnnotation,
    handleUpdateAnnotationColor,
    handleUpdateAnnotationRect,
    handleUpdateAnnotationText,
    handleReplaceAnnotationImage,
    handlePlaceAnnotation,
    handleApplyRedactions,
    handleRedactSearch,
    handleRedactMetadata,
    handleAnnotationClick,
    handleReorderPages,
    handleDeletePage,
  };
}
