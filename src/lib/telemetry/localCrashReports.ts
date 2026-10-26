// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary. The PDFluent application is free to use,
// including for commercial purposes. Redistribution, or extraction or reuse
// of its components (including the embedded PDF engine), requires a licence.
// See https://pdfluent.com/license for terms.

// The crash reports this installation sent, kept on this machine only: the
// same arrangement as src/lib/feedback/localReports.ts. The delete token is
// the sender's way to have a report erased; it never goes anywhere except to
// the one endpoint that erases the report it belongs to.

export const LOCAL_CRASH_REPORTS_KEY = 'pdfluent.crash.sent';
const MAX_KEPT = 50;

/** How long the server keeps a crash report (infra/report-worker/src/reports.js, REPORT_RETENTION). */
export const CRASH_REPORT_RETENTION_DAYS = 90;

export interface LocalCrashReport {
  id: string;
  deleteToken: string;
  sentAt: string;
}

export interface KeyValueStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

function defaultStore(): KeyValueStore | null {
  try {
    return globalThis.localStorage ?? null;
  } catch (error) {
    console.warn('[telemetry] local storage unavailable', error);
    return null;
  }
}

/** Reports the server has certainly dropped by now; keeping their tokens only clutters the list. */
function stillKept(report: LocalCrashReport, nowMs: number): boolean {
  const sent = Date.parse(report.sentAt);
  return !Number.isFinite(sent) || nowMs - sent < CRASH_REPORT_RETENTION_DAYS * 86_400_000;
}

export function readLocalCrashReports(
  store: KeyValueStore | null = defaultStore(),
  nowMs: number = Date.now(),
): LocalCrashReport[] {
  if (!store) return [];
  try {
    const raw = store.getItem(LOCAL_CRASH_REPORTS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (r): r is LocalCrashReport =>
        typeof r === 'object' &&
        r !== null &&
        typeof (r as LocalCrashReport).id === 'string' &&
        typeof (r as LocalCrashReport).deleteToken === 'string' &&
        stillKept(r as LocalCrashReport, nowMs),
    );
  } catch (error) {
    console.warn('[telemetry] local storage unavailable', error);
    return [];
  }
}

function write(reports: LocalCrashReport[], store: KeyValueStore | null): boolean {
  if (!store) return false;
  try {
    store.setItem(LOCAL_CRASH_REPORTS_KEY, JSON.stringify(reports.slice(-MAX_KEPT)));
    return true;
  } catch (error) {
    console.warn('[telemetry] local storage unavailable', error);
    return false;
  }
}

/** Remember a sent report. Returns false when the store is unavailable. */
export function rememberCrashReport(
  report: LocalCrashReport,
  store: KeyValueStore | null = defaultStore(),
): boolean {
  const others = readLocalCrashReports(store).filter((r) => r.id !== report.id);
  return write([...others, report], store);
}

/** Forget reports the server no longer has. */
export function forgetCrashReports(ids: string[], store: KeyValueStore | null = defaultStore()): void {
  const gone = new Set(ids);
  write(readLocalCrashReports(store).filter((r) => !gone.has(r.id)), store);
}
