// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 PDFluent Contributors

import { useCallback, useEffect, useState } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import { Toolbar } from "./components/Toolbar";
import { Sidebar } from "./components/Sidebar";
import { Viewer } from "./components/Viewer";
import { openPdf, closePdf } from "./lib/tauri-api";
import type { DocumentInfo } from "./lib/tauri-api";

const MIN_SCALE = 0.25;
const MAX_SCALE = 5.0;
const SCALE_STEP = 0.25;
const DEFAULT_SCALE = 1.5;

export function App() {
  const [filePath, setFilePath] = useState<string | null>(null);
  const [docInfo, setDocInfo] = useState<DocumentInfo | null>(null);
  const [currentPage, setCurrentPage] = useState(0);
  const [scale, setScale] = useState(DEFAULT_SCALE);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleOpenFile() {
    const selected = await open({
      multiple: false,
      filters: [{ name: "PDF", extensions: ["pdf"] }],
    });
    if (typeof selected === "string") {
      setLoading(true);
      setError(null);
      try {
        const info = await openPdf(selected);
        setFilePath(selected);
        setDocInfo(info);
        setCurrentPage(0);
        setScale(DEFAULT_SCALE);
      } catch (err) {
        setError(String(err));
      } finally {
        setLoading(false);
      }
    }
  }

  async function handleCloseFile() {
    await closePdf();
    setFilePath(null);
    setDocInfo(null);
    setCurrentPage(0);
    setError(null);
  }

  const goToPage = useCallback(
    (page: number) => {
      if (!docInfo) return;
      const clamped = Math.max(0, Math.min(page, docInfo.page_count - 1));
      setCurrentPage(clamped);
    },
    [docInfo],
  );

  const zoomIn = useCallback(() => {
    setScale((s) => Math.min(s + SCALE_STEP, MAX_SCALE));
  }, []);

  const zoomOut = useCallback(() => {
    setScale((s) => Math.max(s - SCALE_STEP, MIN_SCALE));
  }, []);

  const zoomReset = useCallback(() => {
    setScale(DEFAULT_SCALE);
  }, []);

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (!docInfo) return;

      const isCmd = e.metaKey || e.ctrlKey;

      if (isCmd && e.key === "=") {
        e.preventDefault();
        zoomIn();
      } else if (isCmd && e.key === "-") {
        e.preventDefault();
        zoomOut();
      } else if (isCmd && e.key === "0") {
        e.preventDefault();
        zoomReset();
      } else if (e.key === "ArrowLeft" || e.key === "PageUp") {
        e.preventDefault();
        goToPage(currentPage - 1);
      } else if (e.key === "ArrowRight" || e.key === "PageDown") {
        e.preventDefault();
        goToPage(currentPage + 1);
      } else if (e.key === "Home") {
        e.preventDefault();
        goToPage(0);
      } else if (e.key === "End") {
        e.preventDefault();
        goToPage(docInfo.page_count - 1);
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [docInfo, currentPage, goToPage, zoomIn, zoomOut, zoomReset]);

  return (
    <div className="app">
      <Toolbar
        onOpenFile={handleOpenFile}
        onCloseFile={handleCloseFile}
        filePath={filePath}
        currentPage={currentPage}
        pageCount={docInfo?.page_count ?? 0}
        scale={scale}
        onGoToPage={goToPage}
        onZoomIn={zoomIn}
        onZoomOut={zoomOut}
        onZoomReset={zoomReset}
      />
      <div className="app-body">
        <Sidebar
          docInfo={docInfo}
          currentPage={currentPage}
          scale={0.3}
          onSelectPage={goToPage}
        />
        <Viewer
          filePath={filePath}
          docInfo={docInfo}
          currentPage={currentPage}
          scale={scale}
          loading={loading}
          error={error}
          onPageChange={goToPage}
        />
      </div>
    </div>
  );
}
