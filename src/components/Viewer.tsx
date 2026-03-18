// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary and confidential.
// Free for personal, non-commercial use.
// Commercial use requires a valid license.
// See https://pdfluent.com/license for terms.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { convertFileSrc } from "@tauri-apps/api/core";
import { renderPage } from "../lib/tauri-api";
import type { DocumentInfo, RenderedPage } from "../lib/tauri-api";
import type {
  AnnotationPayload,
  AnnotationTool,
  EditableTextLine,
  HighlightColor,
  PdfPoint,
  PdfRect,
} from "../lib/pdf-manipulator";
import { appendDebugLog } from "../lib/debug-log";

interface ViewerProps {
  filePath: string | null;
  docInfo: DocumentInfo | null;
  currentPage: number;
  scale: number;
  viewMode: "single" | "continuous";
  annotationTool: AnnotationTool;
  highlightColor: HighlightColor;
  textEditorEnabled: boolean;
  editableTextLines: EditableTextLine[];
  searchLineIndexes: number[];
  activeSearchLineIndex: number | null;
  annotationSaving: boolean;
  loading: boolean;
  error: string | null;
  onPageChange: (page: number) => void;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onCreateAnnotation: (payload: AnnotationPayload) => Promise<void>;
  onEditTextLine: (
    line: EditableTextLine,
    replacementText: string,
  ) => Promise<void>;
}

interface ScreenPoint {
  x: number;
  y: number;
}

const CONTINUOUS_PAGE_BUFFER = 3;
const CONTINUOUS_MAX_RENDER_SCALE = 1;
const CONTINUOUS_LEADING_PAGE_COUNT = 3;
const CONTINUOUS_PAGE_MEMORY_BUDGET_BYTES = 72 * 1024 * 1024;
const SINGLE_PAGE_MAX_RENDER_RATIO = 3;
const SINGLE_PAGE_MAX_RENDER_SCALE = 8;
const SINGLE_PAGE_MAX_RENDER_PIXELS = 24_000_000;

export function getContinuousTargetPages(
  currentPage: number,
  pageCount: number,
): number[] {
  const start = Math.max(0, currentPage - CONTINUOUS_PAGE_BUFFER);
  const end = Math.min(pageCount - 1, currentPage + CONTINUOUS_PAGE_BUFFER);
  const aroundCurrent = Array.from(
    { length: end - start + 1 },
    (_, offset) => start + offset,
  );
  const leadingPages = Array.from(
    { length: Math.min(pageCount, CONTINUOUS_LEADING_PAGE_COUNT) },
    (_, index) => index,
  );

  return Array.from(new Set([...leadingPages, ...aroundCurrent])).sort(
    (left, right) => left - right,
  );
}

export function getContinuousLoadTargetPages(
  currentPage: number,
  viewportPage: number,
  pageCount: number,
  visiblePages: Set<number>,
): number[] {
  const targets = new Set<number>([
    ...getContinuousTargetPages(currentPage, pageCount),
    ...getContinuousTargetPages(viewportPage, pageCount),
  ]);

  for (const visiblePage of visiblePages) {
    const aroundVisible = getContinuousTargetPages(visiblePage, pageCount);
    for (const index of aroundVisible) {
      targets.add(index);
    }
  }

  return Array.from(targets).sort((left, right) => left - right);
}

export function shouldUseNativeContinuousViewer(
  viewMode: "single" | "continuous",
  _annotationTool: AnnotationTool,
  _textEditorEnabled: boolean,
): boolean {
  return viewMode === "continuous";
}

export function shouldUseNativeSingleViewer(
  viewMode: "single" | "continuous",
  _annotationTool: AnnotationTool,
  _textEditorEnabled: boolean,
  _hasSearchHighlights: boolean,
): boolean {
  return viewMode === "single";
}

export function getNativePdfViewFragment(
  currentPage: number,
  scale: number,
): string {
  const safePage = Math.max(1, currentPage + 1);
  const zoomPercent = Math.max(25, Math.round(scale * 100));
  return `#page=${safePage}&zoom=${zoomPercent}`;
}

export function isNativeViewerErrorPageContent(
  sourceText: string | null | undefined,
): boolean {
  const normalized = sourceText?.toLowerCase().replace(/\s+/g, " ").trim();
  if (!normalized) {
    return false;
  }

  return (
    normalized.includes("fs:allow-") &&
    (normalized.includes("permission") ||
      normalized.includes("denied") ||
      normalized.includes("capability") ||
      normalized.includes("scope"))
  );
}

export function shouldShowSelectableTextLayer(
  viewMode: "single" | "continuous",
  _annotationTool: AnnotationTool,
  _textEditorEnabled: boolean,
  textLineCount: number,
): boolean {
  return viewMode === "single" && textLineCount > 0;
}

export function getSinglePageRenderRatio(
  annotationTool: AnnotationTool,
  textEditorEnabled: boolean,
  devicePixelRatio: number,
): number {
  const normalizedRatio = Number.isFinite(devicePixelRatio)
    ? Math.max(1, Math.min(SINGLE_PAGE_MAX_RENDER_RATIO, devicePixelRatio))
    : 1;
  const isEditing = annotationTool !== "none" || textEditorEnabled;
  return isEditing ? normalizedRatio : 1;
}

export function getSinglePageRenderScale(
  scale: number,
  annotationTool: AnnotationTool,
  textEditorEnabled: boolean,
  devicePixelRatio: number,
  pageWidthPt?: number,
  pageHeightPt?: number,
): number {
  const renderRatio = getSinglePageRenderRatio(
    annotationTool,
    textEditorEnabled,
    devicePixelRatio,
  );
  const rawScale = scale * renderRatio;
  if (!Number.isFinite(rawScale) || rawScale <= 0) {
    return scale;
  }

  const cappedScale = Math.min(SINGLE_PAGE_MAX_RENDER_SCALE, rawScale);
  if (
    !Number.isFinite(pageWidthPt) ||
    !Number.isFinite(pageHeightPt) ||
    !pageWidthPt ||
    !pageHeightPt ||
    pageWidthPt <= 0 ||
    pageHeightPt <= 0
  ) {
    return cappedScale;
  }

  const renderedPixels = pageWidthPt * pageHeightPt * cappedScale * cappedScale;
  if (!Number.isFinite(renderedPixels) || renderedPixels <= SINGLE_PAGE_MAX_RENDER_PIXELS) {
    return cappedScale;
  }

  const pixelBudgetScale = Math.sqrt(
    SINGLE_PAGE_MAX_RENDER_PIXELS / (pageWidthPt * pageHeightPt),
  );
  if (!Number.isFinite(pixelBudgetScale) || pixelBudgetScale <= 0) {
    return Math.max(0.1, cappedScale);
  }

  return Math.max(0.1, pixelBudgetScale);
}

function retainMapEntries<K, V>(source: Map<K, V>, keepSet: Set<K>): Map<K, V> {
  let changed = false;
  const next = new Map<K, V>();

  for (const [key, value] of source) {
    if (keepSet.has(key)) {
      next.set(key, value);
      continue;
    }
    changed = true;
  }

  return changed ? next : source;
}

function retainSetEntries<T>(source: Set<T>, keepSet: Set<T>): Set<T> {
  let changed = false;
  const next = new Set<T>();

  for (const value of source) {
    if (keepSet.has(value)) {
      next.add(value);
      continue;
    }
    changed = true;
  }

  return changed ? next : source;
}

function areNumberSetsEqual(left: Set<number>, right: Set<number>): boolean {
  if (left.size !== right.size) {
    return false;
  }

  for (const value of left) {
    if (!right.has(value)) {
      return false;
    }
  }

  return true;
}

function estimateRenderedPageBytes(page: RenderedPage): number {
  const encodedBytes = Math.floor((page.data_base64.length * 3) / 4);
  const rasterBytes = Math.max(0, page.width * page.height * 4);
  return encodedBytes + rasterBytes;
}

function estimateRenderedPageMapBytes(pages: Map<number, RenderedPage>): number {
  let total = 0;
  for (const page of pages.values()) {
    total += estimateRenderedPageBytes(page);
  }
  return total;
}

function pruneContinuousPageCache(
  pages: Map<number, RenderedPage>,
  keepSet: Set<number>,
  focusPage: number,
  budgetBytes: number,
): Map<number, RenderedPage> {
  const retained = retainMapEntries(pages, keepSet);
  let totalBytes = estimateRenderedPageMapBytes(retained);
  if (totalBytes <= budgetBytes) {
    return retained;
  }

  const evictionOrder = Array.from(retained.keys()).sort((left, right) => {
    const leftDistance = Math.abs(left - focusPage);
    const rightDistance = Math.abs(right - focusPage);
    return rightDistance - leftDistance;
  });
  const next = new Map(retained);

  for (const pageIndex of evictionOrder) {
    if (totalBytes <= budgetBytes) {
      break;
    }
    const page = next.get(pageIndex);
    if (!page) continue;
    next.delete(pageIndex);
    totalBytes -= estimateRenderedPageBytes(page);
  }

  return next;
}

export function Viewer({
  filePath,
  docInfo,
  currentPage,
  scale,
  viewMode,
  annotationTool,
  highlightColor,
  textEditorEnabled,
  editableTextLines,
  searchLineIndexes,
  activeSearchLineIndex,
  annotationSaving,
  loading,
  error,
  onPageChange,
  onZoomIn,
  onZoomOut,
  onCreateAnnotation,
  onEditTextLine,
}: ViewerProps) {
  const [renderedPage, setRenderedPage] = useState<RenderedPage | null>(null);
  const [renderError, setRenderError] = useState<string | null>(null);
  const [rendering, setRendering] = useState(false);
  const [continuousPages, setContinuousPages] = useState<Map<number, RenderedPage>>(
    new Map(),
  );
  const [continuousViewportPage, setContinuousViewportPage] = useState(0);
  const [continuousVisiblePages, setContinuousVisiblePages] = useState<Set<number>>(
    new Set(),
  );
  const [nativePdfBaseUrl, setNativePdfBaseUrl] = useState<string | null>(null);
  const [nativeViewerError, setNativeViewerError] = useState<string | null>(null);
  const [continuousLoadingPages, setContinuousLoadingPages] = useState<Set<number>>(
    new Set(),
  );
  const [continuousErrorPages, setContinuousErrorPages] = useState<Map<number, string>>(
    new Map(),
  );
  const containerRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const nativeIframeRef = useRef<HTMLIFrameElement>(null);
  const requestRef = useRef(0);
  const continuousRequestRef = useRef(0);
  const visiblePageRef = useRef(-1);
  const suppressScrollSyncRef = useRef(false);
  const nativePageNavRef = useRef<number | null>(null);
  const inkDraftRef = useRef<ScreenPoint[]>([]);
  const [dragStart, setDragStart] = useState<ScreenPoint | null>(null);
  const [dragCurrent, setDragCurrent] = useState<ScreenPoint | null>(null);
  const [inkDraftPoints, setInkDraftPoints] = useState<ScreenPoint[]>([]);
  const [inlineEditLine, setInlineEditLine] = useState<EditableTextLine | null>(null);
  const [inlineEditValue, setInlineEditValue] = useState("");
  const inlineEditInputRef = useRef<HTMLInputElement>(null);
  const [nativeViewerUnavailable, setNativeViewerUnavailable] = useState(false);
  const currentPageInfo = useMemo(
    () => docInfo?.pages[currentPage] ?? null,
    [docInfo, currentPage],
  );
  const singlePageRenderRatio = useMemo(
    () =>
      getSinglePageRenderRatio(
        annotationTool,
        textEditorEnabled,
        typeof window !== "undefined" ? window.devicePixelRatio : 1,
      ),
    [annotationTool, textEditorEnabled],
  );
  const singlePageRenderScale = useMemo(
    () =>
      getSinglePageRenderScale(
        scale,
        annotationTool,
        textEditorEnabled,
        typeof window !== "undefined" ? window.devicePixelRatio : 1,
        currentPageInfo?.width_pt,
        currentPageInfo?.height_pt,
      ),
    [annotationTool, currentPageInfo?.height_pt, currentPageInfo?.width_pt, scale, textEditorEnabled],
  );
  const hasSearchHighlights = searchLineIndexes.length > 0;
  const prefersNativeContinuousViewer = shouldUseNativeContinuousViewer(
    viewMode,
    annotationTool,
    textEditorEnabled,
  );
  const prefersNativeSingleViewer = shouldUseNativeSingleViewer(
    viewMode,
    annotationTool,
    textEditorEnabled,
    hasSearchHighlights,
  );
  const isNativeContinuousViewer =
    prefersNativeContinuousViewer && !nativeViewerUnavailable;
  const isNativeSingleViewer = prefersNativeSingleViewer && !nativeViewerUnavailable;
  const isNativeViewer = isNativeContinuousViewer || isNativeSingleViewer;
  const nativePdfSrc = useMemo(() => {
    if (!nativePdfBaseUrl || !isNativeViewer) {
      return null;
    }

    // Continuous viewer: load the base URL without a page fragment; page
    // navigation happens via nativeIframeRef to avoid full iframe reloads.
    if (isNativeContinuousViewer) {
      return nativePdfBaseUrl;
    }

    // Single-page viewer: include the page/scale fragment for initial position.
    const fragment = getNativePdfViewFragment(currentPage, scale);
    return `${nativePdfBaseUrl}${fragment}`;
  }, [
    nativePdfBaseUrl,
    isNativeViewer,
    isNativeContinuousViewer,
    currentPage,
    scale,
  ]);
  const xfaUnsupportedWarning =
    docInfo?.xfa_detected && docInfo?.xfa_rendering_supported === false
      ? docInfo.xfa_notice ??
        "Dynamic XFA forms are not fully supported in this viewer. Open in Adobe Acrobat Reader for full rendering."
      : null;

  useEffect(() => {
    appendDebugLog("debug", "viewer_renderer_selected", {
      mode: viewMode,
      currentPage: currentPage + 1,
      scale,
      isNativeContinuousViewer,
      isNativeSingleViewer,
      nativeViewerUnavailable,
      hasNativeBaseUrl: Boolean(nativePdfBaseUrl),
      hasNativeSrc: Boolean(nativePdfSrc),
      nativeSrcPreview: nativePdfSrc?.slice(0, 160) ?? null,
    });
  }, [
    viewMode,
    currentPage,
    scale,
    isNativeContinuousViewer,
    isNativeSingleViewer,
    nativeViewerUnavailable,
    nativePdfBaseUrl,
    nativePdfSrc,
  ]);

  const handleNativeIframeLoad = useCallback((frame: HTMLIFrameElement): void => {
    let sourceText: string | null = null;
    let contentType: string | null = null;
    let title: string | null = null;
    let readyState: string | null = null;

    try {
      const frameDoc = frame.contentDocument;
      sourceText = frameDoc?.body?.innerText ?? frameDoc?.documentElement?.innerText ?? null;
      contentType = frameDoc?.contentType ?? null;
      title = frameDoc?.title ?? null;
      readyState = frameDoc?.readyState ?? null;
    } catch (error) {
      appendDebugLog("debug", "native_pdf_iframe_probe_skipped", {
        page: currentPage + 1,
        mode: viewMode,
        error: String(error),
      });
    }

    if (isNativeViewerErrorPageContent(sourceText)) {
      const snippet = sourceText
        ?.replace(/\s+/g, " ")
        .slice(0, 240);
      setNativeViewerError(
        "Native PDF viewer could not access this file. Switched to compatibility preview.",
      );
      setNativeViewerUnavailable(true);
      appendDebugLog("warn", "native_pdf_iframe_error_page_detected", {
        page: currentPage + 1,
        scale,
        mode: viewMode,
        snippet,
        contentType,
        title,
        readyState,
      });
      return;
    }

    setNativeViewerError(null);
    setNativeViewerUnavailable(false);
    appendDebugLog("info", "native_pdf_iframe_loaded", {
      page: currentPage + 1,
      scale,
      mode: viewMode,
      contentType,
      title,
      readyState,
      textLength: sourceText?.length ?? 0,
    });
  }, [currentPage, scale, viewMode]);

  function getRelativePoint(event: React.PointerEvent<SVGSVGElement>): ScreenPoint | null {
    const stage = stageRef.current;
    if (!stage) return null;

    const bounds = stage.getBoundingClientRect();
    const x = event.clientX - bounds.left;
    const y = event.clientY - bounds.top;

    return {
      x: Math.max(0, Math.min(x, bounds.width)),
      y: Math.max(0, Math.min(y, bounds.height)),
    };
  }

  const singlePageDisplayWidth = useMemo(() => {
    if (currentPageInfo) {
      return Math.max(1, currentPageInfo.width_pt * scale);
    }
    if (renderedPage) {
      return renderedPage.width / singlePageRenderRatio;
    }
    return 0;
  }, [currentPageInfo, renderedPage, scale, singlePageRenderRatio]);

  const singlePageDisplayHeight = useMemo(() => {
    if (currentPageInfo) {
      return Math.max(1, currentPageInfo.height_pt * scale);
    }
    if (renderedPage) {
      return renderedPage.height / singlePageRenderRatio;
    }
    return 0;
  }, [currentPageInfo, renderedPage, scale, singlePageRenderRatio]);

  function toPdfPoint(point: ScreenPoint): PdfPoint | null {
    if (singlePageDisplayHeight <= 0 || scale <= 0) return null;

    return {
      x: point.x / scale,
      y: (singlePageDisplayHeight - point.y) / scale,
    };
  }

  function toPdfRect(start: ScreenPoint, end: ScreenPoint): PdfRect | null {
    if (singlePageDisplayHeight <= 0 || scale <= 0) return null;

    const left = Math.min(start.x, end.x);
    const top = Math.min(start.y, end.y);
    const width = Math.abs(end.x - start.x);
    const height = Math.abs(end.y - start.y);

    if (width < 2 || height < 2) return null;

    return {
      x: left / scale,
      y: (singlePageDisplayHeight - (top + height)) / scale,
      width: width / scale,
      height: height / scale,
    };
  }

  function getDraftRect(): { x: number; y: number; width: number; height: number } | null {
    if (!dragStart || !dragCurrent) return null;

    return {
      x: Math.min(dragStart.x, dragCurrent.x),
      y: Math.min(dragStart.y, dragCurrent.y),
      width: Math.abs(dragCurrent.x - dragStart.x),
      height: Math.abs(dragCurrent.y - dragStart.y),
    };
  }

  function toScreenRect(rect: PdfRect): {
    x: number;
    y: number;
    width: number;
    height: number;
  } | null {
    if (singlePageDisplayHeight <= 0) return null;

    return {
      x: rect.x * scale,
      y: (singlePageDisplayHeight - (rect.y + rect.height)) * scale,
      width: rect.width * scale,
      height: rect.height * scale,
    };
  }

  function clearAnnotationDraft(): void {
    setDragStart(null);
    setDragCurrent(null);
    setInkDraftPoints([]);
    inkDraftRef.current = [];
  }

  function releasePointerCaptureSafely(
    event: React.PointerEvent<SVGSVGElement>,
  ): void {
    if (!event.currentTarget.hasPointerCapture(event.pointerId)) {
      return;
    }

    try {
      event.currentTarget.releasePointerCapture(event.pointerId);
    } catch (error) {
      appendDebugLog("warn", "annotation_pointer_release_failed", {
        page: currentPage + 1,
        pointerId: event.pointerId,
        error: String(error),
      });
    }
  }

  async function createAnnotation(payload: AnnotationPayload): Promise<void> {
    try {
      await onCreateAnnotation(payload);
    } finally {
      clearAnnotationDraft();
    }
  }

  function submitAnnotation(
    payload: AnnotationPayload,
    source: string,
  ): void {
    void createAnnotation(payload).catch((error) => {
      appendDebugLog("error", "annotation_create_failed", {
        page: currentPage + 1,
        source,
        error: String(error),
      });
    });
  }

  const cancelInlineTextEditor = useCallback(
    (reason: "user_cancel" | "mode_change"): void => {
      if (!inlineEditLine) return;

      appendDebugLog("debug", "text_inline_edit_cancelled", {
        page: currentPage + 1,
        lineIndex: inlineEditLine.lineIndex,
        reason,
      });

      setInlineEditLine(null);
      setInlineEditValue("");
    },
    [inlineEditLine, currentPage],
  );

  useEffect(() => {
    if (!filePath || !docInfo || viewMode !== "single") {
      setRenderedPage(null);
      setRenderError(null);
      setRendering(false);
      return;
    }

    const requestId = ++requestRef.current;
    setRendering(true);
    setRenderError(null);

    appendDebugLog("debug", "single_page_render_start", {
      page: currentPage + 1,
      scale,
      renderScale: singlePageRenderScale,
      renderRatio: singlePageRenderRatio,
      annotationTool,
      textEditorEnabled,
    });

    renderPage(currentPage, singlePageRenderScale)
      .then((page) => {
        if (requestRef.current === requestId) {
          setRenderedPage(page);
          setRendering(false);
          appendDebugLog("debug", "single_page_render_success", {
            page: currentPage + 1,
            scale,
            renderScale: singlePageRenderScale,
            renderRatio: singlePageRenderRatio,
            width: page.width,
            height: page.height,
          });
        }
      })
      .catch((err) => {
        if (requestRef.current === requestId) {
          setRenderError(String(err));
          setRendering(false);
          appendDebugLog("warn", "single_page_render_error", {
            page: currentPage + 1,
            scale,
            renderScale: singlePageRenderScale,
            renderRatio: singlePageRenderRatio,
            error: String(err),
          });
        }
      });
  }, [
    annotationTool,
    currentPage,
    docInfo,
    filePath,
    scale,
    singlePageRenderRatio,
    singlePageRenderScale,
    textEditorEnabled,
    viewMode,
  ]);

  useEffect(() => {
    continuousRequestRef.current += 1;
    setContinuousPages(new Map());
    setContinuousViewportPage(0);
    setContinuousVisiblePages(new Set());
    setContinuousLoadingPages(new Set());
    setContinuousErrorPages(new Map());
    visiblePageRef.current = -1;
    suppressScrollSyncRef.current = false;
  }, [filePath, docInfo, scale, viewMode]);

  useEffect(() => {
    if (!filePath) {
      setNativePdfBaseUrl(null);
      setNativeViewerError(null);
      setNativeViewerUnavailable(false);
      return;
    }

    setNativeViewerError(null);
    setNativeViewerUnavailable(false);

    appendDebugLog("debug", "native_pdf_source_prepare_start", {
      path: filePath,
    });

    try {
      const sourceUrl = convertFileSrc(filePath);
      setNativePdfBaseUrl(sourceUrl);
      setNativeViewerUnavailable(false);
      appendDebugLog("info", "native_pdf_source_prepare_success", {
        path: filePath,
        src: sourceUrl,
      });
    } catch (err) {
      const message = String(err);
      setNativePdfBaseUrl(null);
      setNativeViewerError(`Native PDF viewer source failed: ${message}`);
      setNativeViewerUnavailable(true);
      appendDebugLog("error", "native_pdf_source_prepare_failed", {
        error: message,
        path: filePath,
      });
    }
  }, [filePath]);

  useEffect(() => {
    if (!isNativeViewer || !nativePdfSrc) {
      return;
    }

    appendDebugLog("debug", "native_pdf_src_updated", {
      page: currentPage + 1,
      scale,
      mode: viewMode,
      src: nativePdfSrc,
    });
  }, [isNativeViewer, nativePdfSrc, currentPage, scale, viewMode]);

  useEffect(() => {
    if (!isNativeViewer || !nativePdfBaseUrl) {
      return;
    }

    appendDebugLog("debug", "native_pdf_base_source_active", {
      src: nativePdfBaseUrl,
      mode: viewMode,
    });
  }, [isNativeViewer, nativePdfBaseUrl, viewMode]);

  // Navigate native iframe to correct page when currentPage changes (e.g. sidebar click)
  useEffect(() => {
    if (!isNativeViewer || !nativePdfBaseUrl) return;

    const iframe = nativeIframeRef.current;
    if (!iframe) return;

    // Skip if this page change came from scrolling within the iframe itself
    if (nativePageNavRef.current === currentPage) {
      nativePageNavRef.current = null;
      return;
    }

    const pageNum = currentPage + 1;
    const fragment = `#page=${pageNum}`;

    try {
      // Try to update the iframe location hash directly for smooth navigation
      if (iframe.contentWindow) {
        iframe.contentWindow.location.hash = fragment;
      }
    } catch {
      // Cross-origin restriction — fall back to updating src
      iframe.src = `${nativePdfBaseUrl}${fragment}`;
    }
  }, [isNativeViewer, nativePdfBaseUrl, currentPage]);

  useEffect(() => {
    const visible = shouldShowSelectableTextLayer(
      viewMode,
      annotationTool,
      textEditorEnabled,
      editableTextLines.length,
    );
    if (!visible || !renderedPage) {
      return;
    }

    appendDebugLog("debug", "single_page_text_layer_ready", {
      page: currentPage + 1,
      lineCount: editableTextLines.length,
      scale,
      renderRatio: singlePageRenderRatio,
      renderedWidth: renderedPage.width,
      renderedHeight: renderedPage.height,
      displayWidth: renderedPage.width / singlePageRenderRatio,
      displayHeight: renderedPage.height / singlePageRenderRatio,
    });
  }, [
    viewMode,
    annotationTool,
    textEditorEnabled,
    editableTextLines.length,
    renderedPage,
    currentPage,
    scale,
    singlePageRenderRatio,
  ]);

  useEffect(() => {
    if (!filePath || !docInfo || viewMode !== "continuous" || isNativeContinuousViewer) {
      return;
    }

    const requestId = continuousRequestRef.current;
    const targetPages = getContinuousLoadTargetPages(
      currentPage,
      continuousViewportPage,
      docInfo.page_count,
      continuousVisiblePages,
    );
    const targetSet = new Set(targetPages);

    setContinuousPages((prev) => {
      const next = pruneContinuousPageCache(
        prev,
        targetSet,
        currentPage,
        CONTINUOUS_PAGE_MEMORY_BUDGET_BYTES,
      );
      if (next.size < prev.size) {
        appendDebugLog("debug", "continuous_cache_pruned", {
          requestId,
          previousCount: prev.size,
          nextCount: next.size,
          targetCount: targetSet.size,
          estimatedBytes: estimateRenderedPageMapBytes(next),
          budgetBytes: CONTINUOUS_PAGE_MEMORY_BUDGET_BYTES,
        });
      }
      return next;
    });
    setContinuousLoadingPages((prev) => retainSetEntries(prev, targetSet));
    setContinuousErrorPages((prev) => retainMapEntries(prev, targetSet));

    const missingPages = targetPages.filter(
      (index) =>
        !continuousPages.has(index) &&
        !continuousLoadingPages.has(index) &&
        !continuousErrorPages.has(index),
    );

    if (missingPages.length === 0) {
      return;
    }

    appendDebugLog("debug", "continuous_render_batch_start", {
      requestId,
      currentPage: currentPage + 1,
      viewportPage: continuousViewportPage + 1,
      visiblePages: [...continuousVisiblePages].map((page) => page + 1),
      missingPages: missingPages.map((page) => page + 1),
      scale: Math.min(scale, CONTINUOUS_MAX_RENDER_SCALE),
      estimatedCacheBytes: estimateRenderedPageMapBytes(continuousPages),
      budgetBytes: CONTINUOUS_PAGE_MEMORY_BUDGET_BYTES,
    });

    setContinuousLoadingPages((prev) => {
      const next = new Set(prev);
      for (const index of missingPages) {
        next.add(index);
      }
      return next;
    });

    void (async () => {
      for (const index of missingPages) {
        if (continuousRequestRef.current !== requestId) {
          return;
        }

        try {
          const page = await renderPage(index, Math.min(scale, CONTINUOUS_MAX_RENDER_SCALE));
          if (continuousRequestRef.current !== requestId) {
            return;
          }

          setContinuousPages((prev) => {
            const next = new Map(prev);
            next.set(index, page);
            const pruned = pruneContinuousPageCache(
              next,
              targetSet,
              currentPage,
              CONTINUOUS_PAGE_MEMORY_BUDGET_BYTES,
            );
            if (pruned.size < next.size) {
              appendDebugLog("debug", "continuous_cache_evicted_after_render", {
                requestId,
                renderedPage: index + 1,
                beforeCount: next.size,
                afterCount: pruned.size,
                estimatedBytes: estimateRenderedPageMapBytes(pruned),
                budgetBytes: CONTINUOUS_PAGE_MEMORY_BUDGET_BYTES,
              });
            }
            return pruned;
          });
          appendDebugLog("debug", "continuous_render_page_success", {
            requestId,
            page: index + 1,
            width: page.width,
            height: page.height,
          });
        } catch (err) {
          if (continuousRequestRef.current !== requestId) {
            return;
          }

          setContinuousErrorPages((prev) => {
            const next = new Map(prev);
            next.set(index, String(err));
            return next;
          });
          appendDebugLog("warn", "continuous_render_page_error", {
            requestId,
            page: index + 1,
            error: String(err),
          });
        } finally {
          if (continuousRequestRef.current === requestId) {
            setContinuousLoadingPages((prev) => {
              const next = new Set(prev);
              next.delete(index);
              return next;
            });
          }
        }
      }
    })();
  }, [
    filePath,
    docInfo,
    viewMode,
    isNativeContinuousViewer,
    currentPage,
    continuousViewportPage,
    continuousVisiblePages,
    scale,
    continuousPages,
    continuousLoadingPages,
    continuousErrorPages,
  ]);

  useEffect(() => {
    inkDraftRef.current = inkDraftPoints;
  }, [inkDraftPoints]);

  useEffect(() => {
    setDragStart(null);
    setDragCurrent(null);
    setInkDraftPoints([]);
    inkDraftRef.current = [];
  }, [annotationTool, currentPage, renderedPage, viewMode]);

  useEffect(() => {
    if (!inlineEditLine) {
      return;
    }

    const frame = requestAnimationFrame(() => {
      inlineEditInputRef.current?.focus();
      inlineEditInputRef.current?.select();
    });

    return () => {
      cancelAnimationFrame(frame);
    };
  }, [inlineEditLine]);

  useEffect(() => {
    if (
      viewMode !== "single" ||
      !textEditorEnabled ||
      annotationTool !== "none" ||
      !filePath ||
      !docInfo
    ) {
      cancelInlineTextEditor("mode_change");
      return;
    }

    if (inlineEditLine) {
      const exists = editableTextLines.some(
        (line) => line.lineIndex === inlineEditLine.lineIndex,
      );
      if (!exists) {
        cancelInlineTextEditor("mode_change");
      }
    }
  }, [
    viewMode,
    textEditorEnabled,
    annotationTool,
    filePath,
    docInfo,
    editableTextLines,
    inlineEditLine,
    cancelInlineTextEditor,
  ]);

  // Scroll to top when page changes
  useEffect(() => {
    if (viewMode !== "single") return;
    containerRef.current?.scrollTo({ top: 0, left: 0, behavior: "smooth" });
  }, [currentPage, viewMode]);

  useEffect(() => {
    if (viewMode !== "continuous" || isNativeContinuousViewer) return;
    const container = containerRef.current;
    if (!container) return;

    if (suppressScrollSyncRef.current) {
      suppressScrollSyncRef.current = false;
      return;
    }

    const target = container.querySelector<HTMLElement>(
      `[data-page-index="${currentPage}"]`,
    );
    if (!target) return;

    const frame = requestAnimationFrame(() => {
      container.scrollTo({ top: target.offsetTop, behavior: "auto" });
      visiblePageRef.current = currentPage;
      appendDebugLog("debug", "continuous_scroll_sync", {
        page: currentPage + 1,
      });
    });

    return () => {
      cancelAnimationFrame(frame);
    };
  }, [viewMode, currentPage, docInfo, filePath, isNativeContinuousViewer]);

  useEffect(() => {
    if (
      viewMode !== "continuous" ||
      isNativeContinuousViewer ||
      !docInfo ||
      !containerRef.current
    ) {
      return;
    }

    const visibleRatios = new Map<number, number>();
    const observer = new IntersectionObserver(
      (entries) => {
        let changed = false;

        let bestPage: number | null = null;
        let bestRatio = 0;

        for (const entry of entries) {
          const pageIndexAttr = (entry.target as HTMLElement).dataset.pageIndex;
          const pageIndex = Number.parseInt(pageIndexAttr ?? "", 10);
          if (Number.isNaN(pageIndex)) continue;

          if (entry.isIntersecting) {
            if (visibleRatios.get(pageIndex) !== entry.intersectionRatio) {
              visibleRatios.set(pageIndex, entry.intersectionRatio);
              changed = true;
            }
          } else if (visibleRatios.delete(pageIndex)) {
            changed = true;
          }
        }

        if (!changed) {
          return;
        }

        const visibleSet = new Set(visibleRatios.keys());
        setContinuousVisiblePages((previous) =>
          areNumberSetsEqual(previous, visibleSet) ? previous : visibleSet,
        );

        for (const [pageIndex, ratio] of visibleRatios.entries()) {
          if (ratio > bestRatio) {
            bestRatio = ratio;
            bestPage = pageIndex;
          }
        }

        if (bestPage !== null && bestPage !== visiblePageRef.current) {
          setContinuousViewportPage((previous) =>
            previous === bestPage ? previous : bestPage,
          );
          visiblePageRef.current = bestPage;
          suppressScrollSyncRef.current = true;
          appendDebugLog("debug", "continuous_visible_page_change", {
            page: bestPage + 1,
            ratio: Number(bestRatio.toFixed(3)),
          });
          onPageChange(bestPage);
        }
      },
      {
        root: containerRef.current,
        rootMargin: "220px 0px 220px 0px",
        threshold: [0, 0.05, 0.1, 0.2, 0.35, 0.5, 0.75, 1],
      },
    );

    const pageElements = containerRef.current.querySelectorAll<HTMLElement>("[data-page-index]");
    for (const element of pageElements) {
      observer.observe(element);
    }

    return () => {
      observer.disconnect();
    };
  }, [viewMode, docInfo, onPageChange, filePath, isNativeContinuousViewer]);

  const canAnnotate =
    viewMode === "single" &&
    annotationTool !== "none" &&
    singlePageDisplayWidth > 0 &&
    singlePageDisplayHeight > 0 &&
    !textEditorEnabled &&
    !annotationSaving;

  const canInlineEdit = textEditorEnabled && !annotationSaving;
  const searchLineIndexSet = useMemo(
    () => new Set(searchLineIndexes),
    [searchLineIndexes],
  );

  function openInlineTextEditor(line: EditableTextLine): void {
    if (!textEditorEnabled || annotationSaving) return;

    setInlineEditLine(line);
    setInlineEditValue(line.text);
    appendDebugLog("info", "text_inline_edit_started", {
      page: currentPage + 1,
      lineIndex: line.lineIndex,
      textLength: line.text.length,
    });
  }

  async function submitInlineTextEditor(): Promise<void> {
    if (!inlineEditLine || annotationSaving) {
      return;
    }

    const nextValue = inlineEditValue;
    if (nextValue === inlineEditLine.text) {
      appendDebugLog("debug", "text_inline_edit_no_change", {
        page: currentPage + 1,
        lineIndex: inlineEditLine.lineIndex,
      });
      setInlineEditLine(null);
      setInlineEditValue("");
      return;
    }

    appendDebugLog("info", "text_inline_edit_submit", {
      page: currentPage + 1,
      lineIndex: inlineEditLine.lineIndex,
      previousLength: inlineEditLine.text.length,
      nextLength: nextValue.length,
    });

    try {
      await onEditTextLine(inlineEditLine, nextValue);
      appendDebugLog("info", "text_inline_edit_success", {
        page: currentPage + 1,
        lineIndex: inlineEditLine.lineIndex,
      });
      setInlineEditLine(null);
      setInlineEditValue("");
    } catch (err) {
      appendDebugLog("error", "text_inline_edit_failure", {
        page: currentPage + 1,
        lineIndex: inlineEditLine.lineIndex,
        error: String(err),
      });
    }
  }

  function handleAnnotationPointerDown(event: React.PointerEvent<SVGSVGElement>) {
    if (!canAnnotate) return;

    const point = getRelativePoint(event);
    if (!point) return;

    try {
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch (error) {
      appendDebugLog("warn", "annotation_pointer_capture_failed", {
        page: currentPage + 1,
        pointerId: event.pointerId,
        error: String(error),
      });
    }

    if (
      annotationTool === "comment" ||
      annotationTool === "free_text" ||
      annotationTool === "stamp"
    ) {
      const noteRect = toPdfRect(
        point,
        {
          x: point.x + 24,
          y: point.y + 24,
        },
      );
      if (!noteRect) return;

      if (annotationTool === "comment") {
        submitAnnotation(
          {
            type: "comment",
            pageIndex: currentPage,
            rect: noteRect,
            contents: "Comment",
          },
          "comment",
        );
      } else if (annotationTool === "free_text") {
        submitAnnotation(
          {
            type: "free_text",
            pageIndex: currentPage,
            rect: noteRect,
            contents: "Free text note",
          },
          "free_text",
        );
      } else {
        submitAnnotation(
          {
            type: "stamp",
            pageIndex: currentPage,
            rect: noteRect,
            contents: "APPROVED",
          },
          "stamp",
        );
      }
      return;
    }

    if (annotationTool === "pen") {
      setInkDraftPoints([point]);
      inkDraftRef.current = [point];
      return;
    }

    setDragStart(point);
    setDragCurrent(point);
  }

  function handleAnnotationPointerMove(event: React.PointerEvent<SVGSVGElement>) {
    if (!canAnnotate) return;

    const point = getRelativePoint(event);
    if (!point) return;

    if (annotationTool === "pen" && inkDraftRef.current.length > 0) {
      const nextPath = [...inkDraftRef.current, point];
      inkDraftRef.current = nextPath;
      setInkDraftPoints(nextPath);
      return;
    }

    if (dragStart) {
      setDragCurrent(point);
    }
  }

  function handleAnnotationPointerUp(event: React.PointerEvent<SVGSVGElement>) {
    if (!canAnnotate) return;

    releasePointerCaptureSafely(event);

    if (annotationTool === "pen") {
      const path = inkDraftRef.current;
      if (path.length < 2) {
        clearAnnotationDraft();
        return;
      }

      const pdfPath: PdfPoint[] = [];
      for (const point of path) {
        const pdfPoint = toPdfPoint(point);
        if (pdfPoint) {
          pdfPath.push(pdfPoint);
        }
      }

      if (pdfPath.length < 2) {
        clearAnnotationDraft();
        return;
      }

      submitAnnotation({
        type: "pen",
        pageIndex: currentPage,
        paths: [pdfPath],
      }, "pen");
      return;
    }

    if (!dragStart || !dragCurrent) {
      clearAnnotationDraft();
      return;
    }

    if (
      annotationTool === "highlight" ||
      annotationTool === "underline" ||
      annotationTool === "strikeout"
    ) {
      const rect = toPdfRect(dragStart, dragCurrent);
      if (!rect) {
        clearAnnotationDraft();
        return;
      }

      if (annotationTool === "highlight") {
        submitAnnotation(
          {
            type: "highlight",
            pageIndex: currentPage,
            rect,
            color: highlightColor,
          },
          "highlight",
        );
      } else if (annotationTool === "underline") {
        submitAnnotation(
          {
            type: "underline",
            pageIndex: currentPage,
            rect,
            contents: "Underline",
          },
          "underline",
        );
      } else {
        submitAnnotation(
          {
            type: "strikeout",
            pageIndex: currentPage,
            rect,
            contents: "Strikeout",
          },
          "strikeout",
        );
      }
      return;
    }

    if (annotationTool === "rectangle" || annotationTool === "circle") {
      const rect = toPdfRect(dragStart, dragCurrent);
      if (!rect) {
        clearAnnotationDraft();
        return;
      }

      if (annotationTool === "rectangle") {
        submitAnnotation({
          type: "rectangle",
          pageIndex: currentPage,
          rect,
        }, "rectangle");
      } else {
        submitAnnotation({
          type: "circle",
          pageIndex: currentPage,
          rect,
        }, "circle");
      }
      return;
    }

    if (
      annotationTool === "line" ||
      annotationTool === "arrow" ||
      annotationTool === "callout" ||
      annotationTool === "measurement"
    ) {
      const start = toPdfPoint(dragStart);
      const end = toPdfPoint(dragCurrent);
      if (!start || !end) {
        clearAnnotationDraft();
        return;
      }

      if (annotationTool === "callout") {
        submitAnnotation(
          {
            type: "callout",
            pageIndex: currentPage,
            start,
            end,
            contents: "Callout",
          },
          "callout",
        );
      } else if (annotationTool === "measurement") {
        submitAnnotation(
          {
            type: "measurement",
            pageIndex: currentPage,
            start,
            end,
          },
          "measurement",
        );
      } else {
        submitAnnotation(
          {
            type: "line",
            pageIndex: currentPage,
            start,
            end,
            arrow: annotationTool === "arrow",
          },
          annotationTool,
        );
      }
      return;
    }

    clearAnnotationDraft();
  }

  function handleAnnotationPointerCancel(event: React.PointerEvent<SVGSVGElement>) {
    releasePointerCaptureSafely(event);
    clearAnnotationDraft();
    appendDebugLog("debug", "annotation_pointer_cancelled", {
      page: currentPage + 1,
      pointerId: event.pointerId,
      tool: annotationTool,
    });
  }

  function handleAnnotationLostPointerCapture(
    event: React.PointerEvent<SVGSVGElement>,
  ) {
    clearAnnotationDraft();
    appendDebugLog("debug", "annotation_pointer_lost_capture", {
      page: currentPage + 1,
      pointerId: event.pointerId,
      tool: annotationTool,
    });
  }

  function handleWheel(e: React.WheelEvent) {
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault();
      if (e.deltaY < 0) {
        onZoomIn();
      } else if (e.deltaY > 0) {
        onZoomOut();
      }
      return;
    }

    if (viewMode === "continuous") return;
    if (!docInfo || !containerRef.current) return;

    const el = containerRef.current;
    const atTop = el.scrollTop <= 0;
    const atBottom = el.scrollTop + el.clientHeight >= el.scrollHeight - 1;

    if (e.deltaY < 0 && atTop && currentPage > 0) {
      onPageChange(currentPage - 1);
    } else if (e.deltaY > 0 && atBottom && currentPage < docInfo.page_count - 1) {
      onPageChange(currentPage + 1);
    }
  }

  if (loading) {
    return (
      <main className="viewer">
        <div className="viewer-placeholder viewer-placeholder-card animate-fade-in">
          <div className="viewer-spinner" />
          <p>Opening PDF...</p>
        </div>
      </main>
    );
  }

  if (error) {
    return (
      <main className="viewer">
        <div className="viewer-placeholder viewer-placeholder-card viewer-error animate-fade-in">
          <h2>Failed to open PDF</h2>
          <p>{error}</p>
        </div>
      </main>
    );
  }

  if (!filePath || !docInfo) {
    return (
      <main className="viewer">
        <div className="viewer-placeholder viewer-placeholder-card">
          <h2>Open a PDF to get started</h2>
          <p>
            Drag and drop a file here, or click <strong>Open</strong> in the
            toolbar.
          </p>
          <p className="viewer-shortcut-hint">
            Arrow keys to navigate, Cmd/Ctrl +/- to zoom
          </p>
        </div>
      </main>
    );
  }

  if (isNativeViewer && !nativePdfSrc) {
    return (
      <main className="viewer">
        <div className="viewer-placeholder viewer-placeholder-card animate-fade-in">
          <div className="viewer-spinner" />
          <p>Preparing native viewer...</p>
        </div>
      </main>
    );
  }

  if (isNativeContinuousViewer) {
    if (isNativeContinuousViewer && nativePdfSrc) {
      return (
      <main
        className="viewer-native"
        ref={containerRef}
      >
        <div className="viewer-native-frame">
          <iframe
            ref={nativeIframeRef}
            key={nativePdfBaseUrl ?? "native-pdf"}
            src={nativePdfSrc}
            title="PDF document"
            className="w-full h-full border-0"
            onLoad={(event) => {
              handleNativeIframeLoad(event.currentTarget);
            }}
            onError={() => {
              setNativeViewerError("Native PDF viewer failed to render this page.");
              setNativeViewerUnavailable(true);
              appendDebugLog("error", "native_pdf_iframe_failed", {
                page: currentPage + 1,
                scale,
                mode: viewMode,
                src: nativePdfSrc,
              });
            }}
          />
        </div>
        {nativeViewerError && (
          <div className="viewer-native-error-banner">
            <p>{nativeViewerError}</p>
          </div>
        )}
        {xfaUnsupportedWarning && (
          <div className="viewer-xfa-warning-banner" role="status" aria-live="polite">
            <p>{xfaUnsupportedWarning}</p>
          </div>
        )}
      </main>
    );
    }
    // nativePdfSrc not yet loaded — return null while URL is being prepared
    return null;
  }

  if (viewMode === "continuous" && docInfo) {
    const targetPages = new Set(
      getContinuousLoadTargetPages(
        currentPage,
        continuousViewportPage,
        docInfo.page_count,
        continuousVisiblePages,
      ),
    );

    return (
      <main
        className="viewer-scroll"
        ref={containerRef}
        onWheel={handleWheel}
      >
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", padding: "32px 16px", gap: "24px" }}>
          {Array.from({ length: docInfo.page_count }, (_, index) => {
            const page = continuousPages.get(index);
            const isLoading = continuousLoadingPages.has(index);
            const pageError = continuousErrorPages.get(index);
            const isActive = index === currentPage;
            const pageInfo = docInfo.pages[index];
            const aspectRatio =
              pageInfo && pageInfo.height_pt > 0
                ? `${pageInfo.width_pt} / ${pageInfo.height_pt}`
                : "8.5 / 11";
            const isNearViewport =
              targetPages.has(index) || continuousVisiblePages.has(index);

            return (
              <section
                key={index}
                data-page-index={index}
                className={`viewer-page-block${isActive ? " viewer-page-block-active" : ""}`}
              >
                <div className="viewer-page-label">
                  Page {index + 1} of {docInfo.page_count}
                </div>
                <div
                  style={{ width: "100%", maxWidth: "1120px", aspectRatio }}
                >
                  {page ? (
                    <img
                      className="viewer-page-image viewer-page-shadow"
                      src={`data:image/png;base64,${page.data_base64}`}
                      width={page.width}
                      height={page.height}
                      alt={`Page ${index + 1}`}
                      draggable={false}
                      style={{ width: "100%", height: "100%", objectFit: "contain", background: "#fff" }}
                    />
                  ) : pageError ? (
                    <div className="viewer-placeholder viewer-error">
                      <p>Failed to render page {index + 1}: {pageError}</p>
                    </div>
                  ) : isLoading || isNearViewport ? (
                    <div className="viewer-page-loading w-full h-full">
                      <div className="viewer-spinner" />
                    </div>
                  ) : (
                    <div className="viewer-page-placeholder" />
                  )}
                </div>
              </section>
            );
          })}
        </div>
        {xfaUnsupportedWarning && (
          <div className="viewer-xfa-warning-banner" role="status" aria-live="polite">
            <p>{xfaUnsupportedWarning}</p>
          </div>
        )}
      </main>
    );
  }

  const draftRect = getDraftRect();
  const showDraftRect =
    draftRect &&
    (annotationTool === "highlight" ||
      annotationTool === "underline" ||
      annotationTool === "strikeout" ||
      annotationTool === "rectangle" ||
      annotationTool === "circle");
  const showDraftLine =
    dragStart &&
    dragCurrent &&
    (annotationTool === "line" ||
      annotationTool === "arrow" ||
      annotationTool === "callout" ||
      annotationTool === "measurement");
  const showSelectableTextLayer = shouldShowSelectableTextLayer(
    viewMode,
    annotationTool,
    textEditorEnabled,
    editableTextLines.length,
  );
  const showSinglePageStage =
    singlePageDisplayWidth > 0 &&
    singlePageDisplayHeight > 0 &&
    ((isNativeSingleViewer && Boolean(nativePdfSrc)) || renderedPage !== null);
  const showRasterPageImage = renderedPage && !isNativeSingleViewer;
  const showNativeSinglePage = isNativeSingleViewer && Boolean(nativePdfSrc);
  const showSinglePageLoading = rendering && !showSinglePageStage;
  const showSinglePageRenderError = !showSinglePageStage && renderError;

  return (
    <main
      className="viewer-scroll"
      ref={containerRef}
      onWheel={handleWheel}
    >
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", padding: "32px 16px", width: "100%" }}>
        {showSinglePageLoading && (
          <div className="viewer-page-loading">
            <div className="viewer-spinner" />
          </div>
        )}
        {showSinglePageStage && (
          <div
            className={`viewer-page-stage viewer-page-shadow${rendering ? " viewer-page-stale" : ""}`}
            ref={stageRef}
            style={{
              width: `${singlePageDisplayWidth}px`,
              height: `${singlePageDisplayHeight}px`,
              background: "#fff",
            }}
          >
            {showNativeSinglePage && nativePdfSrc && (
              <iframe
                ref={nativeIframeRef}
                key={nativePdfBaseUrl ?? "native-pdf"}
                src={nativePdfSrc}
                title="PDF document"
                className="viewer-page-native-iframe"
                onLoad={(event) => {
                  handleNativeIframeLoad(event.currentTarget);
                }}
                onError={() => {
                  setNativeViewerError("Native PDF viewer failed to render this page.");
                  setNativeViewerUnavailable(true);
                  appendDebugLog("error", "native_pdf_iframe_failed", {
                    page: currentPage + 1,
                    scale,
                    mode: viewMode,
                    src: nativePdfSrc,
                  });
                }}
              />
            )}
            {showRasterPageImage && renderedPage && (
              <img
                className="viewer-page-image w-full h-full object-contain"
                src={`data:image/png;base64,${renderedPage.data_base64}`}
                width={renderedPage.width}
                height={renderedPage.height}
                alt={`Page ${currentPage + 1}`}
                draggable={false}
              />
            )}

             {showSelectableTextLayer && (
               <div className="viewer-text-selection-layer" aria-label="Selectable text layer">
                 {editableTextLines.map((line) => {
                  const rect = toScreenRect(line.bbox);
                  if (!rect) return null;

                  const scaledFontSize = Math.max(
                    8,
                    Math.min(96, Number.isFinite(line.fontSize) ? line.fontSize * scale : rect.height),
                  );

                  return (
                    <span
                      key={`${line.lineIndex}-${line.bbox.x}-${line.bbox.y}-select`}
                      className="viewer-text-selection-line"
                      style={{
                        left: `${rect.x}px`,
                        top: `${rect.y}px`,
                        width: `${Math.max(6, rect.width)}px`,
                        height: `${Math.max(10, rect.height)}px`,
                        fontSize: `${scaledFontSize}px`,
                        lineHeight: `${Math.max(10, rect.height)}px`,
                      }}
                    >
                      {line.text}
                    </span>
                  );
                 })}
               </div>
             )}

             {searchLineIndexSet.size > 0 && (
               <div className="viewer-search-layer" aria-label="Search highlights">
                 {editableTextLines.map((line) => {
                   if (!searchLineIndexSet.has(line.lineIndex)) {
                     return null;
                   }

                   const rect = toScreenRect(line.bbox);
                   if (!rect) return null;

                   const isActiveMatch = line.lineIndex === activeSearchLineIndex;

                   return (
                     <div
                       key={`${line.lineIndex}-${line.bbox.x}-${line.bbox.y}-search`}
                       className={`viewer-search-highlight${isActiveMatch ? " viewer-search-highlight-active" : ""}`}
                       style={{
                         left: `${rect.x}px`,
                         top: `${rect.y}px`,
                         width: `${Math.max(6, rect.width)}px`,
                         height: `${Math.max(10, rect.height)}px`,
                       }}
                     />
                   );
                 })}
               </div>
             )}

             <svg
               className={`viewer-annotation-layer${canAnnotate ? " viewer-annotation-layer-active" : ""}`}
              width={singlePageDisplayWidth}
              height={singlePageDisplayHeight}
              onPointerDown={handleAnnotationPointerDown}
              onPointerMove={handleAnnotationPointerMove}
              onPointerUp={handleAnnotationPointerUp}
              onPointerCancel={handleAnnotationPointerCancel}
              onLostPointerCapture={handleAnnotationLostPointerCapture}
            >
              <defs>
                <marker
                  id="annotation-arrow-head"
                  markerWidth="10"
                  markerHeight="7"
                  refX="8"
                  refY="3.5"
                  orient="auto"
                >
                  <polygon points="0 0, 10 3.5, 0 7" fill="currentColor" />
                </marker>
              </defs>

              {inkDraftPoints.length > 1 && (
                <polyline
                  points={inkDraftPoints.map((point) => `${point.x},${point.y}`).join(" ")}
                  fill="none"
                  stroke="#ff7a45"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              )}

              {showDraftRect && draftRect && annotationTool === "circle" && (
                <ellipse
                  cx={draftRect.x + draftRect.width / 2}
                  cy={draftRect.y + draftRect.height / 2}
                  rx={draftRect.width / 2}
                  ry={draftRect.height / 2}
                  fill="rgba(98, 165, 255, 0.15)"
                  stroke="rgba(98, 165, 255, 0.9)"
                  strokeWidth="2"
                />
              )}

              {showDraftRect && draftRect && annotationTool !== "circle" && (
                <rect
                  x={draftRect.x}
                  y={draftRect.y}
                  width={draftRect.width}
                  height={draftRect.height}
                  fill={
                    annotationTool === "highlight"
                      ? "rgba(255, 238, 112, 0.35)"
                      : annotationTool === "underline"
                        ? "rgba(138, 187, 255, 0.24)"
                        : annotationTool === "strikeout"
                          ? "rgba(255, 141, 141, 0.22)"
                      : "rgba(255, 122, 69, 0.12)"
                  }
                  stroke={
                    annotationTool === "highlight"
                      ? "rgba(255, 219, 44, 0.8)"
                      : annotationTool === "underline"
                        ? "rgba(85, 144, 238, 0.92)"
                        : annotationTool === "strikeout"
                          ? "rgba(231, 88, 88, 0.92)"
                      : "rgba(255, 122, 69, 0.9)"
                  }
                  strokeWidth="2"
                />
              )}

              {showDraftLine && dragStart && dragCurrent && (
                <line
                  x1={dragStart.x}
                  y1={dragStart.y}
                  x2={dragCurrent.x}
                  y2={dragCurrent.y}
                  stroke="#35d390"
                  strokeWidth="2"
                  markerEnd={
                    annotationTool === "arrow" ||
                    annotationTool === "callout" ||
                    annotationTool === "measurement"
                      ? "url(#annotation-arrow-head)"
                      : undefined
                  }
                />
              )}
            </svg>

            {textEditorEnabled && editableTextLines.length > 0 && (
              <div className="viewer-text-edit-layer">
                {editableTextLines.map((line) => {
                  const rect = toScreenRect(line.bbox);
                  if (!rect) return null;

                  return (
                    <button
                      key={`${line.lineIndex}-${line.bbox.x}-${line.bbox.y}`}
                      type="button"
                      className="viewer-text-edit-hotspot"
                      style={{
                        left: `${rect.x}px`,
                        top: `${rect.y}px`,
                        width: `${Math.max(6, rect.width)}px`,
                        height: `${Math.max(10, rect.height)}px`,
                      }}
                      title={line.text}
                      onClick={() => {
                        openInlineTextEditor(line);
                      }}
                    />
                  );
                })}
              </div>
            )}

            {textEditorEnabled && inlineEditLine && (() => {
              const rect = toScreenRect(inlineEditLine.bbox);
              if (!rect) return null;

              return (
                <div
                  className="viewer-text-inline-editor"
                  style={{
                    left: `${rect.x}px`,
                    top: `${rect.y}px`,
                    width: `${Math.max(120, rect.width)}px`,
                    minHeight: `${Math.max(34, rect.height + 16)}px`,
                  }}
                >
                  <input
                    ref={inlineEditInputRef}
                    type="text"
                    value={inlineEditValue}
                    onChange={(event) => {
                      setInlineEditValue(event.target.value);
                    }}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") {
                        event.preventDefault();
                        void submitInlineTextEditor();
                      } else if (event.key === "Escape") {
                        event.preventDefault();
                        cancelInlineTextEditor("user_cancel");
                      }
                    }}
                    className="viewer-text-inline-input"
                    disabled={!canInlineEdit}
                  />
                  <div className="viewer-text-inline-actions">
                    <button
                      type="button"
                      className="viewer-text-inline-button"
                      onClick={() => {
                        void submitInlineTextEditor();
                      }}
                      disabled={!canInlineEdit}
                    >
                      Save
                    </button>
                    <button
                      type="button"
                      className="viewer-text-inline-button viewer-text-inline-button-secondary"
                      onClick={() => {
                        cancelInlineTextEditor("user_cancel");
                      }}
                      disabled={!canInlineEdit}
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              );
            })()}

            {annotationSaving && (
              <div className="viewer-annotation-saving">
                <div className="viewer-spinner viewer-spinner-small" />
                <span>Saving annotation...</span>
              </div>
            )}
          </div>
        )}
        {showSinglePageRenderError && (
          <div className="viewer-placeholder viewer-error">
            <p>Failed to render page: {renderError}</p>
          </div>
        )}
      </div>
      {xfaUnsupportedWarning && (
        <div className="viewer-xfa-warning-banner" role="status" aria-live="polite">
          <p>{xfaUnsupportedWarning}</p>
        </div>
      )}
    </main>
  );
}
