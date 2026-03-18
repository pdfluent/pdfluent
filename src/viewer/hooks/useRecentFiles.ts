// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary and confidential.
// Free for personal, non-commercial use.
// Commercial use requires a valid license.
// See https://pdfluent.com/license for terms.

import { useState, useCallback } from 'react';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

export const RECENT_FILES_KEY = 'pdfluent.recent-files';
export const MAX_RECENT_FILES = 8;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function readFromStorage(): string[] {
  try {
    const raw = localStorage.getItem(RECENT_FILES_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return (parsed as unknown[])
      .filter((v): v is string => typeof v === 'string')
      .slice(0, MAX_RECENT_FILES);
  } catch {
    return [];
  }
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

interface UseRecentFilesResult {
  recentFiles: string[];
  addRecentFile: (path: string) => void;
  removeRecentFile: (path: string) => void;
  clearRecentFiles: () => void;
}

export function useRecentFiles(): UseRecentFilesResult {
  const [recentFiles, setRecentFiles] = useState<string[]>(() => readFromStorage());

  const addRecentFile = useCallback((path: string): void => {
    setRecentFiles(prev => {
      // Remove existing occurrence to deduplicate, then prepend for recency order
      const deduped = prev.filter(p => p !== path);
      const updated = [path, ...deduped].slice(0, MAX_RECENT_FILES);
      try {
        localStorage.setItem(RECENT_FILES_KEY, JSON.stringify(updated));
      } catch { /* ignore write errors (e.g. private browsing quota) */ }
      return updated;
    });
  }, []);

  const removeRecentFile = useCallback((path: string): void => {
    setRecentFiles(prev => {
      const updated = prev.filter(p => p !== path);
      try {
        localStorage.setItem(RECENT_FILES_KEY, JSON.stringify(updated));
      } catch { /* ignore write errors */ }
      return updated;
    });
  }, []);

  const clearRecentFiles = useCallback((): void => {
    setRecentFiles([]);
    try {
      localStorage.removeItem(RECENT_FILES_KEY);
    } catch { /* ignore write errors */ }
  }, []);

  return { recentFiles, addRecentFile, removeRecentFile, clearRecentFiles };
}
