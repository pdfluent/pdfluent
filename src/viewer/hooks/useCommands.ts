// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary and confidential.
// Free for personal, non-commercial use.
// Commercial use requires a valid license.
// See https://pdfluent.com/license for terms.

import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import type { Command } from '../components/CommandPalette';
import type { ViewerMode } from '../types';

interface UseCommandsProps {
  pageCount: number;
  isDirty: boolean;
  setPageIndex: (idx: number | ((prev: number) => number)) => void;
  setZoom: (z: number | ((prev: number) => number)) => void;
  handleSaveAs: () => Promise<void>;
  setExportOpen: (v: boolean | ((prev: boolean) => boolean)) => void;
  setLeftRailOpen: (v: boolean | ((prev: boolean) => boolean)) => void;
  setShortcutSheetOpen: (v: boolean | ((prev: boolean) => boolean)) => void;
  setMode: (mode: ViewerMode) => void;
  closeDocument: () => void;
  setCurrentFilePath: (path: string | null) => void;
  setUnsavedDialogOpen: (open: boolean) => void;
  pendingActionRef: React.MutableRefObject<(() => void) | null>;
  recentFiles: string[];
  handleLoadDocument: (source: string | ArrayBuffer) => Promise<void>;
  onCheckForUpdates: () => void;
}

export function useCommands({
  pageCount,
  isDirty,
  setPageIndex,
  setZoom,
  handleSaveAs,
  setExportOpen,
  setLeftRailOpen,
  setShortcutSheetOpen,
  setMode,
  closeDocument,
  setCurrentFilePath,
  setUnsavedDialogOpen,
  pendingActionRef,
  recentFiles,
  handleLoadDocument,
  onCheckForUpdates,
}: UseCommandsProps): Command[] {
  const { t } = useTranslation();
  return useMemo(() => {
    const commands: Command[] = [
      // ── Page navigation ───────────────────────────────────────────────────
      { id: 'prev-page', label: t('commands.prevPage'), keywords: ['page', 'previous', 'back'],
        action: () => { setPageIndex(i => Math.max(0, i - 1)); } },
      { id: 'next-page', label: t('commands.nextPage'), keywords: ['page', 'next'],
        action: () => { setPageIndex(i => Math.min(pageCount - 1, i + 1)); } },
      { id: 'first-page', label: t('commands.firstPage'), keywords: ['first', 'begin', 'page', 'home'],
        action: () => { setPageIndex(0); } },
      { id: 'last-page', label: t('commands.lastPage'), keywords: ['last', 'end', 'page'],
        action: () => { setPageIndex(pageCount - 1); } },
      // ── Zoom ──────────────────────────────────────────────────────────────
      { id: 'zoom-in', label: t('commands.zoomIn'), keywords: ['zoom', 'in', 'larger'],
        action: () => { setZoom(z => Math.min(4, parseFloat((z + 0.25).toFixed(2)))); } },
      { id: 'zoom-out', label: t('commands.zoomOut'), keywords: ['zoom', 'out', 'smaller'],
        action: () => { setZoom(z => Math.max(0.25, parseFloat((z - 0.25).toFixed(2)))); } },
      { id: 'zoom-100', label: t('commands.zoom100'), keywords: ['zoom', 'original', 'normal', '100'],
        action: () => { setZoom(1.0); } },
      { id: 'zoom-200', label: t('commands.zoom200'), keywords: ['zoom', '200'],
        action: () => { setZoom(2.0); } },
      // ── Document actions ──────────────────────────────────────────────────
      { id: 'save-as', label: t('commands.saveAs'), keywords: ['save', 'as', 'new', 'file', 'copy'],
        action: () => { void handleSaveAs(); } },
      { id: 'export', label: t('commands.export'), keywords: ['export', 'save as', 'download', 'pdf', 'png', 'docx'],
        action: () => { setExportOpen(true); } },
      { id: 'toggle-rail', label: t('commands.togglePanel'), keywords: ['panel', 'sidebar', 'hide', 'show', 'rail'],
        action: () => { setLeftRailOpen(o => !o); } },
      { id: 'fullscreen', label: t('commands.fullscreen'), keywords: ['full', 'screen', 'fullscreen', 'f11'],
        action: () => {
          if (pageCount === 0) return;
          if (document.fullscreenElement) { void document.exitFullscreen(); }
          else { void document.documentElement.requestFullscreen(); }
        } },
      { id: 'shortcut-sheet', label: t('commands.shortcuts'), keywords: ['shortcuts', 'keys', 'help', '?'],
        action: () => { setShortcutSheetOpen(true); } },
      { id: 'print', label: t('commands.print'), keywords: ['print', 'p'],
        action: () => { if (pageCount > 0) window.print(); } },
      { id: 'close-document', label: t('commands.closeDocument'), keywords: ['close', 'document'],
        action: () => {
          if (isDirty) {
            pendingActionRef.current = () => { closeDocument(); setCurrentFilePath(null); };
            setUnsavedDialogOpen(true);
            return;
          }
          closeDocument();
          setCurrentFilePath(null);
        } },
      // ── Viewer modes ──────────────────────────────────────────────────────
      { id: 'mode-read', label: t('commands.modeRead'), keywords: ['read', 'mode'],
        action: () => { setMode('read'); } },
      { id: 'mode-review', label: t('commands.modeReview'), keywords: ['review', 'annotations'],
        action: () => { setMode('review'); } },
      { id: 'mode-edit', label: t('commands.modeEdit'), keywords: ['edit'],
        action: () => { setMode('edit'); } },
      { id: 'mode-organize', label: t('commands.modeOrganize'), keywords: ['organize', 'pages'],
        action: () => { setMode('organize'); } },
      { id: 'mode-forms', label: t('commands.modeForms'), keywords: ['forms', 'fill'],
        action: () => { setMode('forms'); } },
      { id: 'mode-protect', label: t('commands.modeProtect'), keywords: ['protect', 'encrypt'],
        action: () => { setMode('protect'); } },
      { id: 'mode-convert', label: t('commands.modeConvert'), keywords: ['convert'],
        action: () => { setMode('convert'); } },
      // ── App ───────────────────────────────────────────────────────────────
      { id: 'check-for-updates', label: t('commands.checkForUpdates'), keywords: ['update', 'check', 'version', 'upgrade'],
        action: () => { onCheckForUpdates(); } },
      // ── Recent files ──────────────────────────────────────────────────────
      ...recentFiles.map((path, i) => {
        const name = path.split(/[/\\]/).pop() ?? path;
        return {
          id: `recent-${i}`,
          label: t('commands.openRecent', { name }),
          keywords: ['recent', 'open', name.toLowerCase()],
          action: () => { void handleLoadDocument(path); },
        };
      }),
    ];
    return commands;
  }, [t, pageCount, isDirty, setPageIndex, setZoom, handleSaveAs, setExportOpen, setLeftRailOpen, setShortcutSheetOpen, setMode, closeDocument, setCurrentFilePath, setUnsavedDialogOpen, pendingActionRef, recentFiles, handleLoadDocument, onCheckForUpdates]); // eslint-disable-line react-hooks/exhaustive-deps
}
