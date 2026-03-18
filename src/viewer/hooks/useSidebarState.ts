// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary and confidential.
// Free for personal, non-commercial use.
// Commercial use requires a valid license.
// See https://pdfluent.com/license for terms.

import { useState, useEffect, useCallback } from 'react';

export function useSidebarState() {
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);
  const [allToolsOpen, setAllToolsOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [shortcutSheetOpen, setShortcutSheetOpen] = useState(false);
  const [goToPageOpen, setGoToPageOpen] = useState(false);
  const [unsavedDialogOpen, setUnsavedDialogOpen] = useState(false);
  const [showTimeline, setShowTimeline] = useState(false);
  const [showIssuePanel, setShowIssuePanel] = useState(false);

  const [leftRailOpen, setLeftRailOpen] = useState(() => {
    try {
      return localStorage.getItem('pdfluent.viewer.rail') !== 'false';
    } catch { /* localStorage unavailable */ }
    return true;
  });

  const [recentCmdIds, setRecentCmdIds] = useState<string[]>(() => {
    try {
      const stored = localStorage.getItem('pdfluent.viewer.commands.recent');
      if (stored) {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed)) return parsed as string[];
      }
    } catch { /* localStorage unavailable or corrupt */ }
    return [];
  });

  // Persist left rail visibility to localStorage
  useEffect(() => {
    try {
      localStorage.setItem('pdfluent.viewer.rail', String(leftRailOpen));
    } catch { /* ignore write errors */ }
  }, [leftRailOpen]);

  // Persist recent command history to localStorage
  useEffect(() => {
    try {
      localStorage.setItem('pdfluent.viewer.commands.recent', JSON.stringify(recentCmdIds));
    } catch { /* ignore write errors */ }
  }, [recentCmdIds]);

  // Called when a command palette entry is run — prepends id, dedupes, caps at 5
  const handleCommandRun = useCallback((id: string) => {
    setRecentCmdIds(prev => {
      const deduped = [id, ...prev.filter(x => x !== id)];
      return deduped.slice(0, 5);
    });
  }, []);

  return {
    commandPaletteOpen, setCommandPaletteOpen,
    allToolsOpen, setAllToolsOpen,
    exportOpen, setExportOpen,
    shortcutSheetOpen, setShortcutSheetOpen,
    goToPageOpen, setGoToPageOpen,
    unsavedDialogOpen, setUnsavedDialogOpen,
    showTimeline, setShowTimeline,
    showIssuePanel, setShowIssuePanel,
    leftRailOpen, setLeftRailOpen,
    recentCmdIds,
    handleCommandRun,
  };
}
