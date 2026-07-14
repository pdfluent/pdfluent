// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary. The PDFluent application is free to use,
// including for commercial purposes. Redistribution, or extraction or reuse
// of its components (including the embedded PDF engine), requires a licence.
// See https://pdfluent.com/license for terms.

// ---------------------------------------------------------------------------
// CrashReporter (plan §10 Fase 0)
//
// An always-mounted sibling of the app's ErrorBoundary. Because the boundary
// unmounts its children when it catches, the dialog can't live inside it —
// it lives here, fed through the module-level crash channel.
//
// Responsibilities:
//   - install global window.onerror + unhandledrejection capture handlers;
//   - drain any "unreported" crashes the Rust panic hook wrote on a previous
//     run (detect-on-next-launch);
//   - subscribe to the crash channel (React boundary publishes here);
//   - decide per the user's opt-in settings whether to silently auto-send or
//     show the review dialog;
//   - scrub + build + send via the report module.
//
// Privacy invariants: nothing is sent without an explicit user click unless
// the user previously opted into auto-send; the payload is always scrubbed in
// buildReport(); a failed send never escalates into another crash.
// ---------------------------------------------------------------------------

import { useCallback, useEffect, useRef, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import {
  buildReport,
  getEnvironment,
  sendReport,
  type ReportEnvironment,
  type ReportPayload,
  type SendResult,
} from '../../lib/telemetry/report';
import {
  emitCrash,
  onCrash,
  type CapturedCrash,
} from '../../lib/telemetry/crashChannel';
import {
  loadAppSettings,
  updateAppSetting,
} from '../../viewer/state/appSettings';
import { ReportDialog } from './ReportDialog';

/** snake_case crash record written locally by the Rust panic hook. */
interface RawPendingCrash {
  message: string;
  stack?: string | null;
}

export function CrashReporter() {
  // The crash currently awaiting review, and its preview payload.
  const [active, setActive] = useState<CapturedCrash | null>(null);
  const [preview, setPreview] = useState<ReportPayload | null>(null);

  // Environment is fetched once; held in a ref so handlers see the latest.
  const envRef = useRef<ReportEnvironment | null>(null);
  // Guard so a crash storm can't stack dozens of dialogs.
  const busyRef = useRef(false);

  /** Send a crash without UI (user previously opted into auto-send). */
  const autoSend = useCallback((crash: CapturedCrash) => {
    const env = envRef.current;
    if (!env) return;
    const payload = buildReport(
      { type: 'crash', message: crash.message, stack: crash.stack },
      env,
    );
    // Fire and forget; a failed auto-send must stay silent.
    void sendReport(payload).catch(() => undefined);
  }, []);

  /** Handle one captured crash: auto-send, or open the review dialog. */
  const handleCrash = useCallback(
    (crash: CapturedCrash) => {
      if (busyRef.current) return; // a dialog is already up
      const env = envRef.current;
      if (!env) return;

      const settings = loadAppSettings();
      if (settings.crashReportingEnabled && settings.crashReportAutoSend) {
        autoSend(crash);
        return;
      }

      busyRef.current = true;
      setActive(crash);
      setPreview(
        buildReport(
          { type: 'crash', message: crash.message, stack: crash.stack },
          env,
        ),
      );
    },
    [autoSend],
  );

  // ── One-time setup: env, global handlers, channel, pending crashes ──────
  useEffect(() => {
    let cancelled = false;

    void getEnvironment().then((env) => {
      if (!cancelled) envRef.current = env;
    });

    const prevOnError = window.onerror;
    window.onerror = (message, _source, _line, _col, error) => {
      emitCrash({
        message: error?.message ?? String(message),
        stack: error?.stack ?? null,
        source: 'window.onerror',
      });
      return false; // don't suppress default logging
    };

    const onRejection = (event: PromiseRejectionEvent) => {
      const reason = event.reason as unknown;
      emitCrash({
        message:
          reason instanceof Error ? reason.message : String(reason ?? 'unhandled rejection'),
        stack: reason instanceof Error ? reason.stack : null,
        source: 'unhandledrejection',
      });
    };
    window.addEventListener('unhandledrejection', onRejection);

    const unsubscribe = onCrash(handleCrash);

    // Detect-on-next-launch: drain crashes the Rust panic hook left behind.
    void invoke<RawPendingCrash[]>('take_pending_crashes')
      .then((crashes) => {
        for (const c of crashes ?? []) {
          emitCrash({ message: c.message, stack: c.stack, source: 'rust' });
        }
      })
      .catch(() => undefined); // command may not exist yet / no backend

    return () => {
      cancelled = true;
      window.onerror = prevOnError;
      window.removeEventListener('unhandledrejection', onRejection);
      unsubscribe();
    };
  }, [handleCrash]);

  const closeDialog = useCallback(() => {
    setActive(null);
    setPreview(null);
    busyRef.current = false;
  }, []);

  const submit = useCallback(
    async (note: string, autoSendChecked: boolean): Promise<SendResult> => {
      const env = envRef.current;
      if (!env || !active) return { ok: false, error: 'no environment' };

      // Persist consent decisions before sending.
      updateAppSetting('crashReportConsentAsked', true);
      if (autoSendChecked) {
        updateAppSetting('crashReportingEnabled', true);
        updateAppSetting('crashReportAutoSend', true);
      }

      const message = note.trim()
        ? `${active.message}\n\n--- user note ---\n${note.trim()}`
        : active.message;
      const payload = buildReport(
        { type: 'crash', message, stack: active.stack },
        env,
      );
      return sendReport(payload);
    },
    [active],
  );

  if (!active || !preview) return null;

  return (
    <ReportDialog payload={preview} onSubmit={submit} onClose={closeDialog} />
  );
}
