// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary and confidential.
// Free for personal, non-commercial use.
// Commercial use requires a valid license.
// See https://pdfluent.com/license for terms.

import { useEffect, useRef } from 'react';
import type { UndoStack } from '../undoEngine';
import type { ViewerMode } from '../types';
import type { TextParagraphTarget } from '../text/textInteractionModel';
import type { FormField } from '../../core/document';

interface UseKeyboardShortcutsProps {
  pageCount: number;
  setPageIndex: (idx: number | ((prev: number) => number)) => void;
  isSearchOpen: boolean;
  searchResults: { pageIndex: number }[];
  nextSearchResult: () => void;
  prevSearchResult: () => void;
  selectedTextTarget: TextParagraphTarget | null;
  editingTextTargetId: string | null;
  handleEditEntry: (target: TextParagraphTarget) => void;
  mode: ViewerMode;
  formFields: FormField[];
  activeFieldIdx: number;
  handleFieldNav: (idx: number) => void;
  setZoom: (z: number | ((prev: number) => number)) => void;
  undoStackRef: React.MutableRefObject<UndoStack>;
  syncUndoState: () => void;
  handleSaveAs: () => Promise<void>;
  setExportOpen: (v: boolean | ((prev: boolean) => boolean)) => void;
  setCommandPaletteOpen: (v: boolean | ((prev: boolean) => boolean)) => void;
  setIsSearchOpen: (v: boolean | ((prev: boolean) => boolean)) => void;
  setShortcutSheetOpen: (v: boolean | ((prev: boolean) => boolean)) => void;
  setMode: (mode: ViewerMode) => void;
  setLeftRailOpen: (v: boolean | ((prev: boolean) => boolean)) => void;
  setGoToPageOpen: (v: boolean | ((prev: boolean) => boolean)) => void;
  isSavingRef: React.MutableRefObject<boolean>;
  handleNextComment: () => void;
  handlePrevComment: () => void;
}

/**
 * Registers all global keyboard shortcuts for the viewer.
 * Returns canvasContainerRef to be attached to the document canvas div (scroll-to-zoom).
 */
export function useKeyboardShortcuts({
  pageCount,
  setPageIndex,
  isSearchOpen,
  searchResults,
  nextSearchResult,
  prevSearchResult,
  selectedTextTarget,
  editingTextTargetId,
  handleEditEntry,
  mode,
  formFields,
  activeFieldIdx,
  handleFieldNav,
  setZoom,
  undoStackRef,
  syncUndoState,
  handleSaveAs,
  setExportOpen,
  setCommandPaletteOpen,
  setIsSearchOpen,
  setShortcutSheetOpen,
  setMode,
  setLeftRailOpen,
  setGoToPageOpen,
  isSavingRef,
  handleNextComment,
  handlePrevComment,
}: UseKeyboardShortcutsProps): React.RefObject<HTMLDivElement | null> {

  // ⌘C / Ctrl+C copy handler — copies selected text to clipboard
  useEffect(() => {
    function handleCopy(e: KeyboardEvent): void {
      if (!(e.metaKey || e.ctrlKey) || e.key !== 'c') return;
      const sel = window.getSelection()?.toString();
      if (!sel) return;
      void navigator.clipboard.writeText(sel);
    }
    window.addEventListener('keydown', handleCopy);
    return () => { window.removeEventListener('keydown', handleCopy); };
  }, []);

  // Fullscreen keyboard shortcut — F11 or ⌘Shift+F / Ctrl+Shift+F
  useEffect(() => {
    function handleFullscreenKey(e: KeyboardEvent): void {
      if (pageCount === 0) return;
      const isF11 = e.key === 'F11';
      const isShiftF = (e.metaKey || e.ctrlKey) && e.shiftKey && e.key === 'F';
      if (!isF11 && !isShiftF) return;
      e.preventDefault();
      if (document.fullscreenElement) {
        void document.exitFullscreen();
      } else {
        void document.documentElement.requestFullscreen();
      }
    }
    window.addEventListener('keydown', handleFullscreenKey);
    return () => { window.removeEventListener('keydown', handleFullscreenKey); };
  }, [pageCount]);

  // Export dialog keyboard shortcut — ⌘E / Ctrl+E
  useEffect(() => {
    function handleExportKey(e: KeyboardEvent): void {
      if (!(e.metaKey || e.ctrlKey)) return;
      if (e.key !== 'e') return;
      if (pageCount === 0) return;
      e.preventDefault();
      setExportOpen(true);
    }
    window.addEventListener('keydown', handleExportKey);
    return () => { window.removeEventListener('keydown', handleExportKey); };
  }, [pageCount]); // eslint-disable-line react-hooks/exhaustive-deps

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
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Search shortcut — ⌘F / Ctrl+F → open SearchPanel and focus input
  useEffect(() => {
    function handleSearchKey(e: KeyboardEvent): void {
      if (!(e.metaKey || e.ctrlKey) || e.key !== 'f') return;
      e.preventDefault();
      setIsSearchOpen(true);
    }
    window.addEventListener('keydown', handleSearchKey);
    return () => { window.removeEventListener('keydown', handleSearchKey); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Search result navigation — Enter → next result, Shift+Enter → previous result
  useEffect(() => {
    function handleSearchNav(e: KeyboardEvent): void {
      if (!isSearchOpen || searchResults.length === 0) return;
      if (e.key !== 'Enter') return;
      e.preventDefault();
      if (e.shiftKey) {
        prevSearchResult();
      } else {
        nextSearchResult();
      }
    }
    window.addEventListener('keydown', handleSearchNav);
    return () => { window.removeEventListener('keydown', handleSearchNav); };
  }, [isSearchOpen, searchResults, nextSearchResult, prevSearchResult]);

  // Enter key on selected text target — triggers inline edit entry
  useEffect(() => {
    function handleTextEditKey(e: KeyboardEvent): void {
      // Only when a text target is selected and not already editing
      if (!selectedTextTarget || editingTextTargetId !== null) return;
      // Guard: ignore if focus is inside an input / editable area
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || (e.target as HTMLElement)?.isContentEditable) return;
      if (e.key !== 'Enter') return;
      e.preventDefault();
      handleEditEntry(selectedTextTarget);
    }
    window.addEventListener('keydown', handleTextEditKey);
    return () => { window.removeEventListener('keydown', handleTextEditKey); };
  }, [selectedTextTarget, editingTextTargetId, handleEditEntry]);

  // Shortcut sheet — ⌘? / Ctrl+?
  useEffect(() => {
    function handleShortcutSheetKey(e: KeyboardEvent): void {
      if (!(e.metaKey || e.ctrlKey)) return;
      if (e.key !== '?') return;
      e.preventDefault();
      setShortcutSheetOpen(o => !o);
    }
    window.addEventListener('keydown', handleShortcutSheetKey);
    return () => { window.removeEventListener('keydown', handleShortcutSheetKey); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Page navigation keyboard shortcuts — Arrow / PageUp / PageDown / Home / End
  useEffect(() => {
    function handlePageNav(e: KeyboardEvent) {
      if (pageCount === 0) return;
      // Guard: block navigation while a save is in progress
      if (isSavingRef.current) return;

      // Do not steal keys when focus is inside a text input, textarea, or select
      const tag = (e.target as HTMLElement | null)?.tagName ?? '';
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;

      switch (e.key) {
        case 'ArrowRight':
        case 'ArrowDown':
        case 'PageDown':
          e.preventDefault();
          setPageIndex(i => Math.min(pageCount - 1, i + 1));
          break;
        case 'ArrowLeft':
        case 'ArrowUp':
        case 'PageUp':
          e.preventDefault();
          setPageIndex(i => Math.max(0, i - 1));
          break;
        case 'Home':
          e.preventDefault();
          setPageIndex(0);
          break;
        case 'End':
          e.preventDefault();
          setPageIndex(pageCount - 1);
          break;
      }
    }
    window.addEventListener('keydown', handlePageNav);
    return () => { window.removeEventListener('keydown', handlePageNav); };
  }, [pageCount]); // eslint-disable-line react-hooks/exhaustive-deps

  // Alt+ArrowDown / Alt+ArrowUp — jump between comments
  useEffect(() => {
    function handleCommentJumpKey(e: KeyboardEvent) {
      if (!e.altKey) return;
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        handleNextComment();
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        handlePrevComment();
      }
    }
    window.addEventListener('keydown', handleCommentJumpKey);
    return () => { window.removeEventListener('keydown', handleCommentJumpKey); };
  }, [handleNextComment, handlePrevComment]);

  // Mode switching keyboard shortcuts — 1–7 map to viewer modes
  useEffect(() => {
    const MODE_KEYS: Record<string, ViewerMode> = {
      '1': 'read',
      '2': 'review',
      '3': 'edit',
      '4': 'organize',
      '5': 'forms',
      '6': 'protect',
      '7': 'convert',
    };

    function handleModeKey(e: KeyboardEvent): void {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const tag = (e.target as HTMLElement | null)?.tagName ?? '';
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      const mode = MODE_KEYS[e.key];
      if (mode) setMode(mode);
    }

    window.addEventListener('keydown', handleModeKey);
    return () => { window.removeEventListener('keydown', handleModeKey); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Zoom keyboard shortcuts — ⌘=/⌘+ zoom in, ⌘- zoom out, ⌘0 reset to 100%
  useEffect(() => {
    function handleZoomKey(e: KeyboardEvent): void {
      if (!(e.metaKey || e.ctrlKey)) return;
      if (pageCount === 0) return;
      if (e.key === '=' || e.key === '+') {
        e.preventDefault();
        setZoom(z => Math.min(4, parseFloat((z + 0.25).toFixed(2))));
      } else if (e.key === '-') {
        e.preventDefault();
        setZoom(z => Math.max(0.25, parseFloat((z - 0.25).toFixed(2))));
      } else if (e.key === '0') {
        e.preventDefault();
        setZoom(1.0);
      }
    }
    window.addEventListener('keydown', handleZoomKey);
    return () => { window.removeEventListener('keydown', handleZoomKey); };
  }, [pageCount]); // eslint-disable-line react-hooks/exhaustive-deps

  // Undo/Redo keyboard shortcuts — ⌘Z / Ctrl+Z (undo), ⌘⇧Z / Ctrl+Shift+Z (redo)
  useEffect(() => {
    function handleUndoKey(e: KeyboardEvent): void {
      if (!(e.metaKey || e.ctrlKey) || e.key !== 'z') return;
      e.preventDefault();
      if (e.shiftKey) {
        void undoStackRef.current.redo().then(syncUndoState);
      } else {
        void undoStackRef.current.undo().then(syncUndoState);
      }
    }
    window.addEventListener('keydown', handleUndoKey);
    return () => { window.removeEventListener('keydown', handleUndoKey); };
  }, [syncUndoState]); // eslint-disable-line react-hooks/exhaustive-deps

  // Save As keyboard shortcut — ⌘⇧S / Ctrl+Shift+S
  useEffect(() => {
    function handleSaveAsKey(e: KeyboardEvent): void {
      if (!(e.metaKey || e.ctrlKey) || !e.shiftKey) return;
      if (e.key !== 'S') return;
      if (pageCount === 0) return;
      e.preventDefault();
      void handleSaveAs();
    }
    window.addEventListener('keydown', handleSaveAsKey);
    return () => { window.removeEventListener('keydown', handleSaveAsKey); };
  }, [pageCount, handleSaveAs]);

  // Print keyboard shortcut — ⌘P / Ctrl+P
  useEffect(() => {
    function handlePrintKey(e: KeyboardEvent): void {
      if (!(e.metaKey || e.ctrlKey) || e.key !== 'p') return;
      if (pageCount === 0) return;
      e.preventDefault();
      window.print();
    }
    window.addEventListener('keydown', handlePrintKey);
    return () => { window.removeEventListener('keydown', handlePrintKey); };
  }, [pageCount]);

  // Left rail toggle — ⌘B / Ctrl+B shows/hides the left navigation rail
  useEffect(() => {
    function handleRailKey(e: KeyboardEvent): void {
      if (!(e.metaKey || e.ctrlKey)) return;
      if (e.key !== 'b') return;
      e.preventDefault();
      setLeftRailOpen(o => !o);
    }
    window.addEventListener('keydown', handleRailKey);
    return () => { window.removeEventListener('keydown', handleRailKey); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Go-to-page keyboard shortcut — ⌘G / Ctrl+G opens the go-to-page dialog
  useEffect(() => {
    function handleGoToPage(e: KeyboardEvent): void {
      if (!(e.metaKey || e.ctrlKey)) return;
      if (e.key !== 'g') return;
      if (pageCount === 0) return;
      e.preventDefault();
      setGoToPageOpen(true);
    }
    window.addEventListener('keydown', handleGoToPage);
    return () => { window.removeEventListener('keydown', handleGoToPage); };
  }, [pageCount]); // eslint-disable-line react-hooks/exhaustive-deps

  // Tab / Shift+Tab field navigation — advances through form fields in forms mode.
  useEffect(() => {
    function handleFieldTabKey(e: KeyboardEvent): void {
      if (e.key !== 'Tab') return;
      if (mode !== 'forms' || formFields.length === 0) return;
      e.preventDefault();
      if (e.shiftKey) {
        handleFieldNav(Math.max(0, activeFieldIdx - 1));
      } else {
        handleFieldNav(activeFieldIdx < 0 ? 0 : Math.min(formFields.length - 1, activeFieldIdx + 1));
      }
    }
    window.addEventListener('keydown', handleFieldTabKey);
    return () => { window.removeEventListener('keydown', handleFieldTabKey); };
  }, [mode, formFields, activeFieldIdx, handleFieldNav]);

  // Scroll-to-zoom — ⌘/Ctrl + wheel adjusts zoom on the document canvas
  const canvasContainerRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const container = canvasContainerRef.current;
    if (!container) return;
    function handleWheel(e: WheelEvent): void {
      if (!(e.ctrlKey || e.metaKey)) return;
      e.preventDefault();
      const step = e.deltaY > 0 ? -0.1 : 0.1;
      setZoom(z => parseFloat(Math.min(4, Math.max(0.25, z + step)).toFixed(2)));
    }
    container.addEventListener('wheel', handleWheel, { passive: false });
    return () => { container.removeEventListener('wheel', handleWheel); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return canvasContainerRef;
}
