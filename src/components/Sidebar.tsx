// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary and confidential.
// Free for personal, non-commercial use.
// Commercial use requires a valid license.
// See https://pdfluent.com/license for terms.
import { useEffect, useRef, useState } from "react";
import { MinusIcon, PlusIcon } from "lucide-react";
import { renderThumbnail } from "../lib/tauri-api";
import type { DocumentInfo } from "../lib/tauri-api";

interface SidebarProps {
  docInfo: DocumentInfo | null;
  fileName: string | null;
  currentPage: number;
  scale: number;
  width: number;
  disabled?: boolean;
  canIncreaseWidth: boolean;
  canDecreaseWidth: boolean;
  onIncreaseWidth: () => void;
  onDecreaseWidth: () => void;
  onSelectPage: (page: number) => void;
  onReorderPages: (newOrder: number[]) => Promise<void>;
}

interface ThumbnailData {
  index: number;
  dataUrl: string;
  width: number;
  height: number;
}

const THUMBNAIL_PAGE_BUFFER = 4;
const THUMBNAIL_CACHE_LIMIT = 42;

export function getThumbnailTargetPages(
  currentPage: number,
  pageCount: number,
): number[] {
  const start = Math.max(0, currentPage - THUMBNAIL_PAGE_BUFFER);
  const end = Math.min(pageCount - 1, currentPage + THUMBNAIL_PAGE_BUFFER);
  return Array.from({ length: end - start + 1 }, (_, offset) => start + offset);
}

export function getThumbnailLoadTargets(
  currentPage: number,
  pageCount: number,
  visiblePages: Set<number>,
): number[] {
  const targets = new Set(getThumbnailTargetPages(currentPage, pageCount));

  for (const page of visiblePages) {
    for (const target of getThumbnailTargetPages(page, pageCount)) {
      targets.add(target);
    }
  }

  if (visiblePages.size === 0) {
    for (let page = 0; page < Math.min(pageCount, THUMBNAIL_PAGE_BUFFER + 1); page++) {
      targets.add(page);
    }
  }

  return Array.from(targets).sort((left, right) => left - right);
}

function trimThumbnailCache(
  cache: Map<number, ThumbnailData>,
  currentPage: number,
): Map<number, ThumbnailData> {
  if (cache.size <= THUMBNAIL_CACHE_LIMIT) {
    return cache;
  }

  const nearestEntries = [...cache.entries()]
    .sort(
      ([pageA], [pageB]) =>
        Math.abs(pageA - currentPage) - Math.abs(pageB - currentPage),
    )
    .slice(0, THUMBNAIL_CACHE_LIMIT);

  return new Map(nearestEntries);
}

export function Sidebar({
  docInfo,
  fileName,
  currentPage,
  scale,
  width,
  disabled = false,
  canIncreaseWidth,
  canDecreaseWidth,
  onIncreaseWidth,
  onDecreaseWidth,
  onSelectPage,
  onReorderPages,
}: SidebarProps) {
  const [thumbnails, setThumbnails] = useState<Map<number, ThumbnailData>>(new Map());
  const [loadingPages, setLoadingPages] = useState<Set<number>>(new Set());
  const [visiblePages, setVisiblePages] = useState<Set<number>>(new Set());
  const [draggedPage, setDraggedPage] = useState<number | null>(null);
  const viewportRef = useRef<HTMLDivElement>(null);
  const thumbRefs = useRef<Map<number, HTMLButtonElement>>(new Map());
  const loadingRef = useRef<Set<number>>(new Set());
  const currentPageRef = useRef(currentPage);

  function setThumbRef(index: number, node: HTMLButtonElement | null): void {
    if (node) {
      thumbRefs.current.set(index, node);
      return;
    }

    thumbRefs.current.delete(index);
  }

  useEffect(() => {
    currentPageRef.current = currentPage;
  }, [currentPage]);

  useEffect(() => {
    if (!docInfo) {
      setThumbnails(new Map());
      setLoadingPages(new Set());
      loadingRef.current.clear();
      return;
    }

    loadingRef.current.clear();
    setThumbnails(new Map());
    setLoadingPages(new Set());
    setVisiblePages(new Set());
  }, [docInfo, scale]);

  useEffect(() => {
    if (!docInfo) {
      setVisiblePages(new Set());
      return;
    }

    const root = viewportRef.current;
    if (!root) {
      return;
    }

    const visible = new Set<number>();

    const observer = new IntersectionObserver(
      (entries) => {
        let changed = false;

        for (const entry of entries) {
          const pageIndexAttr = (entry.target as HTMLElement).dataset.pageIndex;
          const pageIndex = Number.parseInt(pageIndexAttr ?? "", 10);
          if (Number.isNaN(pageIndex)) continue;

          if (entry.isIntersecting) {
            if (!visible.has(pageIndex)) {
              visible.add(pageIndex);
              changed = true;
            }
          } else if (visible.delete(pageIndex)) {
            changed = true;
          }
        }

        if (!changed) return;
        setVisiblePages(new Set(visible));
      },
      {
        root,
        rootMargin: "120px 0px 120px 0px",
        threshold: [0, 0.01, 0.1],
      },
    );

    for (const button of thumbRefs.current.values()) {
      observer.observe(button);
    }

    return () => {
      observer.disconnect();
    };
  }, [docInfo]);

  useEffect(() => {
    if (!docInfo) return;

    const targetPages = getThumbnailLoadTargets(
      currentPage,
      docInfo.page_count,
      visiblePages,
    );
    const missingPages = targetPages.filter(
      (pageIndex) =>
        !thumbnails.has(pageIndex) && !loadingRef.current.has(pageIndex),
    );

    if (missingPages.length === 0) {
      return;
    }

    for (const pageIndex of missingPages) {
      loadingRef.current.add(pageIndex);
    }
    setLoadingPages((prev) => {
      const next = new Set(prev);
      for (const pageIndex of missingPages) {
        next.add(pageIndex);
      }
      return next;
    });

    void (async () => {
      for (const pageIndex of missingPages) {
        try {
          const page = await renderThumbnail(pageIndex);
          setThumbnails((prev) => {
            if (prev.has(pageIndex)) {
              return prev;
            }

            const next = new Map(prev);
            next.set(pageIndex, {
              index: pageIndex,
              dataUrl: `data:image/png;base64,${page.data_base64}`,
              width: page.width,
              height: page.height,
            });
            return trimThumbnailCache(next, currentPageRef.current);
          });
        } catch {
          // Skip failed thumbnails silently
        } finally {
          loadingRef.current.delete(pageIndex);
          setLoadingPages((prev) => {
            const next = new Set(prev);
            next.delete(pageIndex);
            return next;
          });
        }
      }
    })();
  }, [docInfo, currentPage, scale, thumbnails, visiblePages]);

  useEffect(() => {
    if (!docInfo) {
      setDraggedPage(null);
    }
  }, [docInfo]);

  async function handleDrop(targetPage: number) {
    if (!docInfo || draggedPage === null || draggedPage === targetPage) {
      setDraggedPage(null);
      return;
    }

    const newOrder = Array.from(
      { length: docInfo.page_count },
      (_, index) => index,
    );
    const movedPages = newOrder.splice(draggedPage, 1);
    const movedPage = movedPages[0];
    if (movedPage === undefined) {
      setDraggedPage(null);
      return;
    }

    newOrder.splice(targetPage, 0, movedPage);

    try {
      await onReorderPages(newOrder);
    } finally {
      setDraggedPage(null);
    }
  }

  const hasDocument = Boolean(docInfo);
  const pageCount = docInfo?.page_count ?? 0;

  return (
    <aside
      className="sidebar"
      style={{ width: `${width}px` }}
    >
      <div className="sidebar-document-row">
        <span className="sidebar-document-name">
          {hasDocument ? fileName ?? "Document" : "No document"}
        </span>
      </div>

      <div className="sidebar-header">
        <span className="sidebar-header-title">
          PAGES ({pageCount})
        </span>
        <div className="sidebar-size-controls">
          <button
            type="button"
            aria-label="Decrease thumbnail sidebar width"
            title="Smaller thumbnails"
            onClick={onDecreaseWidth}
            disabled={!canDecreaseWidth}
            className="sidebar-size-btn"
          >
            <MinusIcon style={{ width: 14, height: 14 }} />
          </button>
          <button
            type="button"
            aria-label="Increase thumbnail sidebar width"
            title="Larger thumbnails"
            onClick={onIncreaseWidth}
            disabled={!canIncreaseWidth}
            className="sidebar-size-btn"
          >
            <PlusIcon style={{ width: 14, height: 14 }} />
          </button>
        </div>
      </div>

      <div
        ref={viewportRef}
        className="sidebar-content"
        style={disabled ? { opacity: 0.5 } : undefined}
      >
        {hasDocument ? (
          <>
            {Array.from({ length: pageCount }, (_, i) => i + 1).map((page) => {
              const pageIndex = page - 1;
              const thumb = thumbnails.get(pageIndex);
              const isActive = pageIndex === currentPage;
              const isLoading = loadingPages.has(pageIndex);
              const pageInfo = docInfo?.pages[pageIndex];
              const aspectRatio =
                pageInfo && pageInfo.height_pt > 0
                  ? `${pageInfo.width_pt} / ${pageInfo.height_pt}`
                  : "8.5 / 11";

              return (
                <button
                  key={page}
                  type="button"
                  onClick={() => onSelectPage(pageIndex)}
                  disabled={disabled}
                  data-page-index={pageIndex}
                  ref={(node) => setThumbRef(pageIndex, node)}
                  className={`sidebar-thumb${isActive ? " sidebar-thumb-active" : ""}${draggedPage === pageIndex ? " sidebar-thumb-dragging" : ""}`}
                  draggable={!disabled}
                  onDragStart={() => {
                    if (!disabled) {
                      setDraggedPage(pageIndex);
                    }
                  }}
                  onDragOver={(event) => {
                    if (!disabled) {
                      event.preventDefault();
                    }
                  }}
                  onDrop={(event) => {
                    event.preventDefault();
                    if (!disabled) {
                      void handleDrop(pageIndex);
                    }
                  }}
                  onDragEnd={() => {
                    setDraggedPage(null);
                  }}
                >
                  <div
                    className="sidebar-thumb-img-wrap"
                    style={{ aspectRatio }}
                  >
                    {thumb ? (
                      <img
                        src={thumb.dataUrl}
                        alt={`Page ${page}`}
                        className="sidebar-thumb-img"
                        draggable={false}
                      />
                    ) : isLoading || visiblePages.has(pageIndex) ? (
                      <div className="sidebar-thumb-placeholder">
                        <div className="viewer-spinner viewer-spinner-small" />
                      </div>
                    ) : (
                      <div className="sidebar-thumb-placeholder" />
                    )}
                  </div>

                  <span className="sidebar-thumb-label">{page}</span>
                </button>
              );
            })}
          </>
        ) : (
          <div className="sidebar-empty-state">
            <p>No pages</p>
          </div>
        )}
      </div>
    </aside>
  );
}
