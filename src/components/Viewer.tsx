// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 PDFluent Contributors

import { useEffect, useRef, useState } from "react";
import { renderPage } from "../lib/tauri-api";
import type { DocumentInfo, RenderedPage } from "../lib/tauri-api";

interface ViewerProps {
  filePath: string | null;
  docInfo: DocumentInfo | null;
  currentPage: number;
  scale: number;
  loading: boolean;
  error: string | null;
  onPageChange: (page: number) => void;
}

export function Viewer({
  filePath,
  docInfo,
  currentPage,
  scale,
  loading,
  error,
  onPageChange,
}: ViewerProps) {
  const [renderedPage, setRenderedPage] = useState<RenderedPage | null>(null);
  const [renderError, setRenderError] = useState<string | null>(null);
  const [rendering, setRendering] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const requestRef = useRef(0);

  useEffect(() => {
    if (!filePath || !docInfo) {
      setRenderedPage(null);
      return;
    }

    const requestId = ++requestRef.current;
    setRendering(true);
    setRenderError(null);

    renderPage(currentPage, scale)
      .then((page) => {
        if (requestRef.current === requestId) {
          setRenderedPage(page);
          setRendering(false);
        }
      })
      .catch((err) => {
        if (requestRef.current === requestId) {
          setRenderError(String(err));
          setRendering(false);
        }
      });
  }, [filePath, docInfo, currentPage, scale]);

  // Scroll to top when page changes
  useEffect(() => {
    containerRef.current?.scrollTo(0, 0);
  }, [currentPage]);

  // Mouse wheel navigation when holding Ctrl/Cmd is handled by App (zoom)
  // Regular scroll navigates between pages when at scroll boundaries
  function handleWheel(e: React.WheelEvent) {
    if (e.ctrlKey || e.metaKey) return; // Let App handle zoom
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
      <main className="viewer viewer-empty">
        <div className="viewer-placeholder">
          <div className="viewer-spinner" />
          <p>Opening PDF...</p>
        </div>
      </main>
    );
  }

  if (error) {
    return (
      <main className="viewer viewer-empty">
        <div className="viewer-placeholder viewer-error">
          <h2>Failed to open PDF</h2>
          <p>{error}</p>
        </div>
      </main>
    );
  }

  if (!filePath || !docInfo) {
    return (
      <main className="viewer viewer-empty">
        <div className="viewer-placeholder">
          <h2>Open a PDF to get started</h2>
          <p>
            Drag and drop a file here, or click <strong>Open</strong> in the
            toolbar.
          </p>
          <p className="viewer-shortcut-hint">
            Keyboard shortcuts: Arrow keys to navigate, Cmd +/- to zoom
          </p>
        </div>
      </main>
    );
  }

  return (
    <main className="viewer" ref={containerRef} onWheel={handleWheel}>
      <div className="viewer-page-container">
        {rendering && !renderedPage && (
          <div className="viewer-page-loading">
            <div className="viewer-spinner" />
          </div>
        )}
        {renderedPage && (
          <img
            className={`viewer-page-image${rendering ? " viewer-page-stale" : ""}`}
            src={`data:image/png;base64,${renderedPage.data_base64}`}
            width={renderedPage.width}
            height={renderedPage.height}
            alt={`Page ${currentPage + 1}`}
            draggable={false}
          />
        )}
        {renderError && (
          <div className="viewer-placeholder viewer-error">
            <p>Failed to render page: {renderError}</p>
          </div>
        )}
      </div>
    </main>
  );
}
