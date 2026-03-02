// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 PDFluent Contributors

import { useEffect, useRef, useState } from "react";
import { renderPage } from "../lib/tauri-api";
import type { DocumentInfo } from "../lib/tauri-api";

interface SidebarProps {
  docInfo: DocumentInfo | null;
  currentPage: number;
  scale: number;
  onSelectPage: (page: number) => void;
}

interface ThumbnailData {
  index: number;
  dataUrl: string;
  width: number;
  height: number;
}

export function Sidebar({ docInfo, currentPage, scale, onSelectPage }: SidebarProps) {
  const [thumbnails, setThumbnails] = useState<Map<number, ThumbnailData>>(new Map());
  const [loadingPages, setLoadingPages] = useState<Set<number>>(new Set());
  const activeRef = useRef<HTMLButtonElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Load thumbnails progressively
  useEffect(() => {
    if (!docInfo) {
      setThumbnails(new Map());
      return;
    }

    let cancelled = false;

    async function loadThumbnails() {
      for (let i = 0; i < docInfo!.page_count; i++) {
        if (cancelled) break;

        setLoadingPages((prev) => new Set(prev).add(i));

        try {
          const page = await renderPage(i, scale);
          if (cancelled) break;

          setThumbnails((prev) => {
            const next = new Map(prev);
            next.set(i, {
              index: i,
              dataUrl: `data:image/png;base64,${page.data_base64}`,
              width: page.width,
              height: page.height,
            });
            return next;
          });
        } catch {
          // Skip failed thumbnails silently
        }

        setLoadingPages((prev) => {
          const next = new Set(prev);
          next.delete(i);
          return next;
        });
      }
    }

    loadThumbnails();
    return () => {
      cancelled = true;
    };
  }, [docInfo, scale]);

  // Scroll active thumbnail into view
  useEffect(() => {
    activeRef.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [currentPage]);

  if (!docInfo) {
    return <aside className="sidebar" />;
  }

  return (
    <aside className="sidebar">
      <div className="sidebar-header">
        Pages ({docInfo.page_count})
      </div>
      <div className="sidebar-content" ref={containerRef}>
        {Array.from({ length: docInfo.page_count }, (_, i) => {
          const thumb = thumbnails.get(i);
          const isActive = i === currentPage;
          const isLoading = loadingPages.has(i);

          return (
            <button
              key={i}
              ref={isActive ? activeRef : undefined}
              className={`sidebar-thumb${isActive ? " sidebar-thumb-active" : ""}`}
              onClick={() => onSelectPage(i)}
              title={`Page ${i + 1}`}
            >
              <div className="sidebar-thumb-img-wrap">
                {thumb ? (
                  <img
                    src={thumb.dataUrl}
                    alt={`Page ${i + 1}`}
                    className="sidebar-thumb-img"
                    draggable={false}
                  />
                ) : isLoading ? (
                  <div className="sidebar-thumb-placeholder">
                    <div className="viewer-spinner viewer-spinner-small" />
                  </div>
                ) : (
                  <div className="sidebar-thumb-placeholder" />
                )}
              </div>
              <span className="sidebar-thumb-label">{i + 1}</span>
            </button>
          );
        })}
      </div>
    </aside>
  );
}
