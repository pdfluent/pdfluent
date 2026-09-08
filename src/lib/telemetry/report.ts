// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary. The PDFluent application is free to use,
// including for commercial purposes. Redistribution, or extraction or reuse
// of its components (including the embedded PDF engine), requires a licence.
// See https://pdfluent.com/license for terms.

// ---------------------------------------------------------------------------
// Telemetry report module
//
// Builds and sends the single JSON payload shared by all report types
// (crash | bug | feedback). The golden rules of PDFluent telemetry apply:
//   - opt-in, default OFF (consent lives in appSettings, not here);
//   - scrubbed at the source (message + stack run through scrub() before they
//     ever leave buildReport());
//   - minimal — no IP, no user-ID, no tracking; only what a crash needs;
//   - self-owned — POSTs only to our own pdfluent.com address, never a raw
//     third-party URL (see plan §9).
//
// The functions here are deliberately small and side-effect-light so they are
// easy to unit-test. Network failures are surfaced to the caller (the review
// dialog) rather than swallowed — but never escalate into a crash-on-crash.
// ---------------------------------------------------------------------------

import { invokeCommand as invoke } from '../commandBridge';
import { scrub, scrubOptional } from './scrub';

/**
 * Our own stable addresses. The app bakes in ONLY pdfluent.com URLs; the
 * destination behind them is controlled by Cloudflare (Worker / Redirect
 * Rule), so released versions are always re-routable. Never inline a raw
 * third-party URL here.
 */
export const REPORT_ENDPOINT = 'https://report.pdfluent.com/v1/report';
export const FEEDBACK_URL = 'https://feedback.pdfluent.com';

/** The three kinds of report; one shared payload shape (plan §3). */
export type ReportType = 'crash' | 'bug' | 'feedback';

/**
 * Runtime environment, gathered once from the Rust backend. Contains nothing
 * personal: app version, OS name + version, and the active UI locale.
 */
export interface ReportEnvironment {
  appVersion: string;
  os: string;
  osVersion: string | null;
  locale: string;
}

/** snake_case shape returned by the `get_environment` Tauri command (serde). */
interface RawEnvironment {
  app_version: string;
  os: string;
  os_version: string | null;
}

/**
 * The active UI locale. Preferred from the persisted language choice, then the
 * browser language, then English. Read defensively so it works in any host
 * (Tauri webview, plain browser, or a non-DOM test runner).
 */
function detectLocale(): string {
  try {
    const stored = globalThis.localStorage?.getItem('pdfluent-lang');
    if (stored) return stored;
  } catch {
    /* localStorage unavailable */
  }
  try {
    const nav = globalThis.navigator?.language;
    if (nav) return nav.split('-')[0] ?? nav;
  } catch {
    /* navigator unavailable */
  }
  return 'en';
}

/**
 * The exact JSON sent to the Worker. Field names are snake_case to match the
 * D1 schema (plan §6) and the server contract (plan §5) one-to-one — what the
 * user sees in the review dialog is what lands in the database.
 */
export interface ReportPayload {
  type: ReportType;
  app_version: string;
  os: string;
  os_version: string | null;
  locale: string;
  /** User text OR a scrubbed error message. */
  message: string;
  /** Scrubbed stack trace; null when absent (feedback/bug). */
  stack: string | null;
  /** Client-reported timestamp; the server stamps its own authoritative one. */
  client_ts: string;
}

/** Inputs to buildReport — the raw, un-scrubbed material from a capture site. */
export interface ReportDraft {
  type: ReportType;
  /** Raw user note and/or error message. Scrubbed before it leaves. */
  message: string;
  /** Raw stack trace, if any. Scrubbed before it leaves. */
  stack?: string | null;
}

/** Outcome of a send attempt, surfaced to the dialog (never thrown upward). */
export type SendResult =
  | { ok: true; id: string }
  | { ok: false; error: string };

/**
 * Fetch the runtime environment from Rust. Falls back to a best-effort,
 * privacy-safe default if the backend is unavailable (e.g. running in a plain
 * browser during tests) — telemetry must never crash the host.
 */
export async function getEnvironment(): Promise<ReportEnvironment> {
  try {
    const raw = await invoke<RawEnvironment>('get_environment');
    return {
      appVersion: raw.app_version,
      os: raw.os,
      osVersion: raw.os_version,
      locale: detectLocale(),
    };
  } catch {
    return {
      appVersion: 'unknown',
      os: 'unknown',
      osVersion: null,
      locale: detectLocale(),
    };
  }
}

/**
 * Assemble the payload. PURE except for reading the clock: the same draft +
 * environment always produces the same scrubbed result. Scrubbing happens
 * HERE so it is impossible to construct a payload that skipped it.
 */
export function buildReport(
  draft: ReportDraft,
  env: ReportEnvironment,
): ReportPayload {
  return {
    type: draft.type,
    app_version: env.appVersion,
    os: env.os,
    os_version: env.osVersion,
    locale: env.locale,
    message: scrub(draft.message),
    stack: scrubOptional(draft.stack),
    client_ts: new Date().toISOString(),
  };
}

/**
 * POST a payload to our Worker. Retries exactly once on a network error or a
 * 5xx (transient) response; a 4xx is a permanent rejection and is not retried.
 * Never throws — returns a SendResult so a failed crash report can't itself
 * become a crash.
 */
export async function sendReport(payload: ReportPayload): Promise<SendResult> {
  let lastError = 'unknown error';

  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await fetch(REPORT_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (res.ok) {
        // Worker answers 202 Accepted with { id }.
        const data = (await res.json().catch(() => null)) as
          | { id?: string }
          | null;
        if (data?.id) return { ok: true, id: data.id };
        return { ok: true, id: '' };
      }

      // 4xx = permanent (bad payload); don't retry.
      if (res.status >= 400 && res.status < 500) {
        return { ok: false, error: `rejected (${res.status})` };
      }

      // 5xx = transient; fall through to retry.
      lastError = `server error (${res.status})`;
    } catch (err) {
      lastError = err instanceof Error ? err.message : 'network error';
    }
  }

  return { ok: false, error: lastError };
}

/** Convenience: build + send in one call, used by the review dialog. */
export async function buildAndSend(
  draft: ReportDraft,
  env: ReportEnvironment,
): Promise<SendResult> {
  return sendReport(buildReport(draft, env));
}
