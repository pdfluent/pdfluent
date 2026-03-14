// Copyright (c) 2026 PDFluent B.V. All rights reserved.
//
// This software is proprietary and confidential.
// Free for personal, non-commercial use.
// Commercial use requires a valid license.
// See https://pdfluent.com/license for terms.

import { useState, useEffect, useRef, useCallback } from 'react';
import { Loader2Icon } from 'lucide-react';

import type { ViewerMode } from './types';
import { useEngine } from './hooks/useEngine';
import { useDocument } from './hooks/useDocument';
import { useThumbnails } from './hooks/useThumbnails';
import { TopBar } from './components/TopBar';
import { ModeSwitcher } from './components/ModeSwitcher';
import { ModeToolbar } from './components/ModeToolbar';
import { LeftNavRail } from './components/LeftNavRail';
import { PageCanvas } from './components/PageCanvas';
import { RightContextPanel } from './components/RightContextPanel';
import { BottomTaskBar } from './components/BottomTaskBar';
import { CommandPalette } from './components/CommandPalette';

// Dev-only test hook — never present in production builds
declare global {
  interface Window {
    __pdfluent_test__?: {
      loadDocument: (source: string | ArrayBuffer) => Promise<void>;
    };
  }
}

// Modes that show the RightContextPanel
const MODES_WITH_RIGHT_PANEL: ReadonlySet<ViewerMode> = new Set([
  'read', 'review', 'edit', 'forms', 'protect',
]);

export function ViewerApp() {
  const { engine, loading: engineLoading, error: engineError } = useEngine();
  const {
    document: pdfDoc,
    metadata,
    pageCount,
    loading: docLoading,
    error: docError,
    loadDocument,
  } = useDocument(engine);
  const { thumbnails } = useThumbnails(engine, pdfDoc);

  const [pageIndex, setPageIndex] = useState(0);
  const [zoom, setZoom] = useState(1.0);
  const [mode, setMode] = useState<ViewerMode>('read');
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);

  // TODO(pdfluent-viewer): wire allToolsOpen to an AllToolsPanel overlay component
  // Status: design integrated, functionality not implemented yet
  const [allToolsOpen, setAllToolsOpen] = useState(false);

  // Reset to page 0 when a new document is loaded
  useEffect(() => {
    setPageIndex(0);
    setZoom(1.0);
  }, [pdfDoc?.id]);

  // Global keyboard shortcut: ⌘K / Ctrl+K → command palette
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setCommandPaletteOpen(o => !o);
      }
    }
    window.addEventListener('keydown', handleKey);
    return () => { window.removeEventListener('keydown', handleKey); };
  }, []);

  const fileName = metadata?.title?.trim() || pdfDoc?.fileName || null;

  // Keep a ref so the window helper always calls the latest loadDocument
  const loadDocumentRef = useRef(loadDocument);
  useEffect(() => { loadDocumentRef.current = loadDocument; }, [loadDocument]);

  // Dev-only: expose test helper so Playwright can drive the engine directly
  useEffect(() => {
    if (!import.meta.env.DEV || !engine) return;
    window.__pdfluent_test__ = {
      loadDocument: (source) => loadDocumentRef.current(source),
    };
    return () => { delete window.__pdfluent_test__; };
  }, [engine]);

  const handleOpenAllTools = useCallback(() => {
    // TODO(pdfluent-viewer): open AllToolsPanel overlay
    // Status: design integrated, functionality not implemented yet
    setAllToolsOpen(o => !o);
  }, []);

  const showRightPanel = MODES_WITH_RIGHT_PANEL.has(mode);

  // Suppress unused-variable warning for allToolsOpen until AllToolsPanel is wired
  void allToolsOpen;

  // ── Loading / error states ────────────────────────────────────────────────

  if (engineLoading) {
    return (
      <div className="h-screen w-screen flex items-center justify-center bg-background text-muted-foreground text-sm gap-2">
        <Loader2Icon className="w-4 h-4 animate-spin" />
        Initializing engine…
      </div>
    );
  }

  if (engineError || !engine) {
    return (
      <div className="h-screen w-screen flex items-center justify-center bg-background text-destructive text-sm px-8 text-center">
        Engine error: {engineError ?? 'No runtime adapter available'}
      </div>
    );
  }

  // ── Full design shell ─────────────────────────────────────────────────────

  return (
    <div className="h-screen w-screen flex flex-col bg-background text-foreground overflow-hidden">

      {/* ── TopBar (h-12) ──────────────────────────────────────────────────── */}
      <TopBar
        fileName={fileName}
        pageIndex={pageIndex}
        pageCount={pageCount}
        onOpenFile={loadDocument}
        onPrevPage={() => { setPageIndex(i => Math.max(0, i - 1)); }}
        onNextPage={() => { setPageIndex(i => Math.min(pageCount - 1, i + 1)); }}
        onPageInput={setPageIndex}
        onOpenCommandPalette={() => { setCommandPaletteOpen(true); }}
      />

      {/* ── ModeSwitcher ───────────────────────────────────────────────────── */}
      <ModeSwitcher
        mode={mode}
        onChange={setMode}
        onOpenAllTools={handleOpenAllTools}
      />

      {/* ── ModeToolbar ────────────────────────────────────────────────────── */}
      <ModeToolbar mode={mode} />

      {/* ── Main content area ──────────────────────────────────────────────── */}
      <div className="flex-1 flex overflow-hidden">

        {/* ── Left navigation rail + panels ──────────────────────────────── */}
        <LeftNavRail
          thumbnails={thumbnails}
          pageCount={pageCount}
          currentPage={pageIndex}
          onPageSelect={setPageIndex}
        />

        {/* ── Document canvas ────────────────────────────────────────────── */}
        <div className="flex-1 relative overflow-auto bg-muted/30">

          {/* Document loading */}
          {docLoading && (
            <div className="absolute inset-0 flex items-center justify-center text-muted-foreground text-sm gap-2">
              <Loader2Icon className="w-4 h-4 animate-spin" />
              Loading document…
            </div>
          )}

          {/* Document error */}
          {docError && !docLoading && (
            <div className="absolute inset-0 flex items-center justify-center text-destructive text-sm px-8 text-center">
              {docError}
            </div>
          )}

          {/* Empty state */}
          {!pdfDoc && !docLoading && !docError && (
            <div
              data-testid="viewer-empty-state"
              className="absolute inset-0 flex flex-col items-center justify-center gap-4"
            >
              <div className="w-16 h-16 rounded-2xl bg-card border border-border shadow-sm flex items-center justify-center">
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  className="w-8 h-8 text-muted-foreground"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z"
                  />
                </svg>
              </div>
              <div className="text-center">
                <p className="text-sm font-medium text-foreground">Open a PDF to get started</p>
                <p className="text-xs text-muted-foreground mt-1">
                  Click <span className="font-medium">Open PDF</span> in the toolbar above
                </p>
              </div>
            </div>
          )}

          {/* Rendered page */}
          {pdfDoc && !docLoading && (
            <div className="flex justify-center items-start p-8 min-h-full">
              <div className="w-full max-w-3xl">
                <PageCanvas
                  engine={engine}
                  document={pdfDoc}
                  pageIndex={pageIndex}
                  zoom={zoom}
                />
              </div>
            </div>
          )}

          {/* Floating zoom controls — bottom-right */}
          {pdfDoc && !docLoading && (
            <div className="fixed bottom-10 right-6 flex items-center bg-background border border-border rounded-lg shadow-sm p-1 z-30">
              <button
                onClick={() => { setZoom(z => Math.max(0.25, parseFloat((z - 0.25).toFixed(2)))); }}
                disabled={zoom <= 0.25}
                className="p-1.5 text-muted-foreground hover:text-foreground hover:bg-muted rounded transition-colors disabled:opacity-30 disabled:cursor-not-allowed text-sm font-medium leading-none"
                title="Zoom out"
              >
                −
              </button>
              <span className="text-xs font-medium px-3 text-foreground w-14 text-center tabular-nums">
                {Math.round(zoom * 100)}%
              </span>
              <button
                onClick={() => { setZoom(z => Math.min(4, parseFloat((z + 0.25).toFixed(2)))); }}
                disabled={zoom >= 4}
                className="p-1.5 text-muted-foreground hover:text-foreground hover:bg-muted rounded transition-colors disabled:opacity-30 disabled:cursor-not-allowed text-sm font-medium leading-none"
                title="Zoom in"
              >
                +
              </button>
            </div>
          )}
        </div>

        {/* ── Right context panel ─────────────────────────────────────────── */}
        {showRightPanel && (
          <RightContextPanel mode={mode} />
        )}
      </div>

      {/* ── Bottom task bar ────────────────────────────────────────────────── */}
      <BottomTaskBar />

      {/* ── Command palette overlay ────────────────────────────────────────── */}
      <CommandPalette
        isOpen={commandPaletteOpen}
        onClose={() => { setCommandPaletteOpen(false); }}
      />
    </div>
  );
}
