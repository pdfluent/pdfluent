// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary. The PDFluent application is free to use,
// including for commercial purposes. Redistribution, or extraction or reuse
// of its components (including the embedded PDF engine), requires a licence.
// See https://pdfluent.com/license for terms.

// The reports this installation sent, kept on this machine only.
//
// The ID is what lets the app say "your report FB-… is fixed" without anyone
// knowing an address: the update feed lists fixed IDs, and the match happens
// here. The delete token is the reporter's way to have the report erased.
// Nothing in this store is ever sent anywhere except the token, to the one
// endpoint that erases the report it belongs to.

export const LOCAL_REPORTS_KEY = 'pdfluent.feedback.sent';
const MAX_KEPT = 50;

export interface LocalReport {
  id: string;
  deleteToken: string;
  sentAt: string;
  appVersion: string;
  /** Set once the app has told the user this report was fixed. */
  fixedNoticeShownFor?: string;
}

export interface KeyValueStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

function defaultStore(): KeyValueStore | null {
  try {
    return globalThis.localStorage ?? null;
  } catch (error) {
    console.warn('[feedback] local storage unavailable', error);
    return null;
  }
}

export function readLocalReports(store: KeyValueStore | null = defaultStore()): LocalReport[] {
  if (!store) return [];
  try {
    const raw = store.getItem(LOCAL_REPORTS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (r): r is LocalReport =>
        typeof r === 'object' && r !== null && typeof (r as LocalReport).id === 'string' && typeof (r as LocalReport).deleteToken === 'string',
    );
  } catch (error) {
    console.warn('[feedback] local storage unavailable', error);
    return [];
  }
}

function write(reports: LocalReport[], store: KeyValueStore | null): boolean {
  if (!store) return false;
  try {
    store.setItem(LOCAL_REPORTS_KEY, JSON.stringify(reports.slice(-MAX_KEPT)));
    return true;
  } catch (error) {
    console.warn('[feedback] local storage unavailable', error);
    return false;
  }
}

/** Remember a sent report. Returns false when the store is unavailable, so the dialog can say so. */
export function rememberReport(report: LocalReport, store: KeyValueStore | null = defaultStore()): boolean {
  const others = readLocalReports(store).filter((r) => r.id !== report.id);
  return write([...others, report], store);
}

/** Forget reports the server no longer has. */
export function forgetReports(ids: string[], store: KeyValueStore | null = defaultStore()): void {
  const gone = new Set(ids);
  write(readLocalReports(store).filter((r) => !gone.has(r.id)), store);
}

export function markFixedNoticeShown(ids: string[], version: string, store: KeyValueStore | null = defaultStore()): void {
  const set = new Set(ids);
  write(
    readLocalReports(store).map((r) => (set.has(r.id) ? { ...r, fixedNoticeShownFor: version } : r)),
    store,
  );
}
