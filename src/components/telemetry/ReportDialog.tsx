// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary. The PDFluent application is free to use,
// including for commercial purposes. Redistribution, or extraction or reuse
// of its components (including the embedded PDF engine), requires a licence.
// See https://pdfluent.com/license for terms.

// ---------------------------------------------------------------------------
// Report review dialog (plan §4 + §4b)
//
// The heart of "transparent": shown before every send, never silent. Renders
// the EXACT scrubbed payload the user is about to send, lets them add optional
// context, and repeats the privacy promise at every contact moment. All copy
// is i18n-driven (telemetry.* keys) and runs through the Humanizer skill
// before release.
// ---------------------------------------------------------------------------

import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { ReportPayload, SendResult } from '../../lib/telemetry/report';

interface ReportDialogProps {
  /** Scrubbed payload, shown verbatim as the preview. */
  payload: ReportPayload;
  /**
   * Build the final report from the optional note + auto-send choice, send it,
   * and resolve with the outcome. The dialog stays mounted to show the result.
   */
  onSubmit: (note: string, autoSend: boolean) => Promise<SendResult>;
  /** Dismiss the dialog (also used for "Don't send"). */
  onClose: () => void;
}

type Phase = 'review' | 'sending' | 'sent' | 'error';

export function ReportDialog({ payload, onSubmit, onClose }: ReportDialogProps) {
  const { t } = useTranslation();
  const [note, setNote] = useState('');
  const [autoSend, setAutoSend] = useState(false);
  const [showStack, setShowStack] = useState(false);
  const [phase, setPhase] = useState<Phase>('review');
  const [sentId, setSentId] = useState('');

  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  });

  // Escape closes while reviewing (not mid-send).
  useEffect(() => {
    function handleKey(e: KeyboardEvent): void {
      if (e.key === 'Escape') onCloseRef.current();
    }
    window.addEventListener('keydown', handleKey);
    return () => {
      window.removeEventListener('keydown', handleKey);
    };
  }, []);

  const isCrash = payload.type === 'crash';
  // Fase 0: the only in-app path that opens this dialog is a real crash, so
  // `payload.type` is always 'crash' here. General feedback/contact is NOT an
  // in-app form — it goes to the website (pdfluent.com/feedback via
  // feedback.pdfluent.com). The 'bug'/'feedback' branches below are kept for a
  // Fase 1 in-app feedback flow and are intentionally unreachable for now.
  const typeLabel =
    payload.type === 'crash'
      ? t('telemetry.typeCrash')
      : payload.type === 'bug'
        ? t('telemetry.typeBug') // Fase 1 (no in-app bug form yet)
        : t('telemetry.typeFeedback'); // Fase 1 (no in-app feedback form yet)
  const system = payload.os_version
    ? `${payload.os} ${payload.os_version}`
    : payload.os;

  async function handleSend(): Promise<void> {
    setPhase('sending');
    const result = await onSubmit(note, autoSend);
    if (result.ok) {
      setSentId(result.id);
      setPhase('sent');
    } else {
      setPhase('error');
    }
  }

  return (
    <>
      <div
        className="fixed inset-0 bg-black/40 z-40"
        onClick={() => {
          if (phase !== 'sending') onClose();
        }}
        aria-hidden="true"
      />
      <div
        role="dialog"
        aria-labelledby="report-dialog-title"
        aria-modal="true"
        data-testid="report-dialog"
        className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-md bg-background border border-border rounded-xl shadow-2xl z-50 overflow-hidden max-h-[85vh] flex flex-col"
      >
        {phase === 'sent' ? (
          // ── Moment 4: confirmation, no PII reassurance + report id ───────
          <div className="px-5 py-5">
            <h2
              id="report-dialog-title"
              className="text-base font-semibold text-foreground"
            >
              {t('telemetry.sentTitle')}
            </h2>
            <p className="mt-2 text-sm text-muted-foreground">
              {t('telemetry.sentBody')}
            </p>
            {sentId && (
              <div className="mt-3 text-sm">
                <code
                  className="px-1.5 py-0.5 rounded bg-muted text-foreground"
                  data-testid="report-sent-id"
                >
                  {t('telemetry.sentReportId', { id: sentId })}
                </code>
                <p className="mt-1 text-xs text-muted-foreground">
                  {t('telemetry.sentReportIdHint')}
                </p>
              </div>
            )}
            <div className="mt-5 flex justify-end">
              <button
                type="button"
                onClick={onClose}
                data-testid="report-close-btn"
                className="px-3 py-1.5 text-sm font-medium rounded-md bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
              >
                {t('common.close')}
              </button>
            </div>
          </div>
        ) : (
          <>
            <div className="px-5 py-4 overflow-y-auto">
              <h2
                id="report-dialog-title"
                className="text-base font-semibold text-foreground"
              >
                {/* Fase 0: always the crash title; feedback* is Fase 1 only. */}
                {isCrash ? t('telemetry.crashTitle') : t('telemetry.feedbackTitle')}
              </h2>
              <p className="mt-1 text-sm text-muted-foreground">
                {isCrash ? t('telemetry.crashIntro') : t('telemetry.feedbackIntro')}
              </p>

              {/* ── Moment 2: privacy promise, prominent ──────────────────── */}
              <p
                className="mt-3 text-xs leading-relaxed text-foreground bg-muted/40 border border-border rounded-md px-3 py-2"
                data-testid="report-privacy-headline"
              >
                {t('telemetry.privacyHeadline')}
              </p>

              {/* ── The exact payload preview ─────────────────────────────── */}
              <div className="mt-3">
                <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                  {t('telemetry.whatGetsSent')}
                </div>
                <dl className="mt-2 text-sm rounded-md border border-border divide-y divide-border">
                  <PreviewRow label={t('telemetry.fieldType')} value={typeLabel} />
                  <PreviewRow
                    label={t('telemetry.fieldVersion')}
                    value={payload.app_version}
                  />
                  <PreviewRow label={t('telemetry.fieldSystem')} value={system} />
                  <PreviewRow
                    label={t('telemetry.fieldLanguage')}
                    value={payload.locale}
                  />
                  {payload.message && (
                    <PreviewRow
                      label={t('telemetry.fieldMessage')}
                      value={payload.message}
                    />
                  )}
                  {payload.stack && (
                    <div className="px-3 py-2">
                      <button
                        type="button"
                        onClick={() => {
                          setShowStack((s) => !s);
                        }}
                        data-testid="report-toggle-stack"
                        className="text-sm text-primary hover:underline"
                      >
                        {showStack
                          ? t('telemetry.hideStack')
                          : t('telemetry.showStack')}
                      </button>
                      {showStack && (
                        <pre className="mt-2 text-xs whitespace-pre-wrap break-words max-h-40 overflow-y-auto text-muted-foreground">
                          {payload.stack}
                        </pre>
                      )}
                    </div>
                  )}
                </dl>
              </div>

              {/* ── Optional user note ────────────────────────────────────── */}
              <label
                htmlFor="report-note"
                className="block mt-4 text-sm text-foreground"
              >
                {t('telemetry.addNoteLabel')}
              </label>
              <textarea
                id="report-note"
                data-testid="report-note"
                value={note}
                onChange={(e) => {
                  setNote(e.target.value);
                }}
                rows={3}
                placeholder={t('telemetry.addNotePlaceholder')}
                className="mt-1 w-full text-sm rounded-md border border-border bg-background px-2.5 py-1.5 resize-y focus:outline-none focus:border-primary"
              />

              {/* ── Auto-send opt-in ──────────────────────────────────────── */}
              <label className="flex items-center gap-2 mt-3 text-sm text-foreground cursor-pointer select-none">
                <input
                  type="checkbox"
                  data-testid="report-autosend"
                  checked={autoSend}
                  onChange={(e) => {
                    setAutoSend(e.target.checked);
                  }}
                  className="w-4 h-4"
                />
                <span>{t('telemetry.autoSendLabel')}</span>
              </label>

              {phase === 'error' && (
                <p
                  className="mt-3 text-sm text-destructive"
                  data-testid="report-error"
                  role="alert"
                >
                  {t('telemetry.sendFailed')}
                </p>
              )}
            </div>

            <div className="px-5 py-3 border-t border-border bg-muted/20">
              {/* ── Moment 3: quiet reassurance next to the send button ───── */}
              <p className="text-xs text-muted-foreground mb-2">
                {t('telemetry.sendOnlyShown')}
              </p>
              <div className="flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={onClose}
                  disabled={phase === 'sending'}
                  data-testid="report-cancel-btn"
                  className="px-3 py-1.5 text-sm text-muted-foreground hover:text-foreground hover:bg-muted rounded-md transition-colors disabled:opacity-40"
                >
                  {t('telemetry.cancel')}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    void handleSend();
                  }}
                  disabled={phase === 'sending'}
                  data-testid="report-send-btn"
                  className="px-3 py-1.5 text-sm font-medium rounded-md bg-primary text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  {phase === 'sending'
                    ? t('telemetry.sending')
                    : t('telemetry.send')}
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </>
  );
}

function PreviewRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex gap-3 px-3 py-2">
      <dt className="shrink-0 w-24 text-muted-foreground">{label}</dt>
      <dd className="flex-1 text-foreground break-words whitespace-pre-wrap">
        {value}
      </dd>
    </div>
  );
}
