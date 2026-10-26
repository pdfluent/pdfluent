// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary. The PDFluent application is free to use,
// including for commercial purposes. Redistribution, or extraction or reuse
// of its components (including the embedded PDF engine), requires a licence.
// See https://pdfluent.com/license for terms.

// ---------------------------------------------------------------------------
// OCR in the editor (J-60): Tesseract and the language packs ship inside the
// app, so a run starts at once, offline; a run writes an invisible text layer
// into the open document, which Save keeps.
//
// Failures reach the screen through invokeCommand (lib/commandBridge.ts),
// which turns the backend's OCR_* codes into a sentence in the UI language.
// This hook only adds what the bridge cannot know: that a build whose bundle
// is incomplete says so instead of failing.
// ---------------------------------------------------------------------------

import { useCallback, useEffect, useRef, useState } from 'react';
import type {
  OcrComponentStatus,
  OcrTextLayerReport,
} from '../../lib/tauri-api';
import {
  getOcrComponentStatus,
  runOcr,
} from '../../lib/tauri-api';
import { describeError, logToApp, reportFallback } from '../../lib/commandBridge';
import { announceOcrUnavailable } from '../state/fallbackNotices';
import { ocrLanguagesFor, ocrReadiness } from '../../lib/ocrComponent';
import i18n from '../../i18n';

export type OcrScope = 'scanned' | 'all';

export interface UseOcrOptions {
  isTauri: boolean;
  hasDocument: boolean;
  scannedPageIndices: ReadonlySet<number>;
  pageCount: number;
  /** Settings value: Tesseract codes such as "nld" or "eng+nld". */
  languageSetting: string;
  /** The run changed the document: re-render and mark it unsaved. */
  onDocumentChanged: () => void;
}

export interface UseOcrResult {
  status: OcrComponentStatus | null;
  running: boolean;
  runProgress: { done: number; total: number } | null;
  lastReport: OcrTextLayerReport | null;
  refreshStatus: () => Promise<OcrComponentStatus | null>;
  requestRun: (scope?: OcrScope) => Promise<void>;
}

/** Listen to one backend event for as long as `active` holds. */
function useBackendEvent<T>(name: string, active: boolean, handler: (payload: T) => void): void {
  const handlerRef = useRef(handler);
  handlerRef.current = handler;
  useEffect(() => {
    if (!active) return;
    let cancelled = false;
    let unlisten: (() => void) | undefined;
    void (async () => {
      const { listen } = await import('@tauri-apps/api/event');
      if (cancelled) return;
      unlisten = await listen<T>(name, (event) => { handlerRef.current(event.payload); });
      if (cancelled) unlisten();
    })();
    return () => {
      cancelled = true;
      unlisten?.();
    };
  }, [name, active]);
}

/**
 * A rejection invokeCommand already put on screen: record that the caller saw
 * it, so the log shows the call site and nothing is swallowed.
 */
function alreadyReported(what: string, error: unknown): void {
  void logToApp(`ocr: ${what} failed (already reported): ${describeError(error)}`);
}

export function useOcr(options: UseOcrOptions): UseOcrResult {
  const { isTauri, hasDocument, scannedPageIndices, pageCount, languageSetting, onDocumentChanged } = options;
  const [status, setStatus] = useState<OcrComponentStatus | null>(null);
  const [running, setRunning] = useState(false);
  const [runProgress, setRunProgress] = useState<{ done: number; total: number } | null>(null);
  const [lastReport, setLastReport] = useState<OcrTextLayerReport | null>(null);

  useBackendEvent<{ done: number; total: number }>('ocr-progress', isTauri && running, setRunProgress);

  const refreshStatus = useCallback(async (): Promise<OcrComponentStatus | null> => {
    if (!isTauri) return null;
    try {
      const next = await getOcrComponentStatus();
      setStatus(next);
      return next;
    } catch (error) {
      // A background probe: logged, never toasted. The OCR UI reads the
      // missing status as "not available in this build".
      void logToApp(`ocr: status probe failed (not shown as a toast): ${describeError(error)}`);
      return null;
    }
  }, [isTauri]);

  useEffect(() => { void refreshStatus(); }, [refreshStatus]);

  const wantedLanguages = useCallback((current: OcrComponentStatus): string[] => (
    ocrLanguagesFor(languageSetting, i18n.language || 'en', current.languages.map((l) => l.code))
  ), [languageSetting]);

  const startRun = useCallback(async (languages: string[], scope: OcrScope): Promise<void> => {
    const pages = scope === 'scanned'
      ? Array.from(scannedPageIndices).sort((a, b) => a - b)
      : Array.from({ length: pageCount }, (_, i) => i);
    if (pages.length === 0) {
      reportFallback({
        source: 'ocr',
        title: i18n.t('ocr.noScannedPagesTitle'),
        message: i18n.t('ocr.noScannedPages'),
        code: 'OCR_NO_SCANNED_PAGES',
        severity: 'info',
      });
      return;
    }
    setRunning(true);
    setRunProgress({ done: 0, total: pages.length });
    try {
      const report = await runOcr(languages, pages);
      setLastReport(report);
      if (report.pages_recognised > 0) onDocumentChanged();
    } catch (error) {
      alreadyReported('run', error);
    } finally {
      setRunning(false);
      setRunProgress(null);
    }
  }, [scannedPageIndices, pageCount, onDocumentChanged]);

  const requestRun = useCallback(async (scope: OcrScope = 'scanned'): Promise<void> => {
    if (!isTauri || !hasDocument || running) return;
    const current = await refreshStatus();
    if (!current) return;
    const languages = wantedLanguages(current);
    const readiness = ocrReadiness(current, languages);
    if (readiness.kind === 'ready') {
      await startRun(readiness.languages, scope);
      return;
    }
    announceOcrUnavailable(i18n.t(`ocr.unavailable.${readiness.reason}`));
  }, [isTauri, hasDocument, running, refreshStatus, wantedLanguages, startRun]);

  return { status, running, runProgress, lastReport, refreshStatus, requestRun };
}
