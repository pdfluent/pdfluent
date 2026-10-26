// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary. The PDFluent application is free to use,
// including for commercial purposes. Redistribution, or extraction or reuse
// of its components (including the embedded PDF engine), requires a licence.
// See https://pdfluent.com/license for terms.

// ---------------------------------------------------------------------------
// Always mounted beside the CrashReporter. Opens the feedback form from:
//   - Help → "Help Us Improve PDFluent…" (menu-event `help_improve`);
//   - any error message's feedback button, which dispatches
//     FEEDBACK_REQUEST_EVENT with the action and error code (pre-filled);
// and shows the "your report is fixed" notice from the update feed.
// ---------------------------------------------------------------------------

import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { describeError, invokeCommand, logToApp } from '../../lib/commandBridge';
import {
  buildFeedbackPayload,
  removeFeedback,
  submitFeedback,
  uploadFeedbackDocument,
  type FeedbackEnvironment,
  type FeedbackFormState,
  type FeedbackOrigin,
  type FeedbackReceipt,
} from '../../lib/feedback/feedback';
import { rememberReport } from '../../lib/feedback/localReports';
import { takeFixedNoticeForStart } from '../../lib/feedback/fixedFeedback';
import { getEnvironment } from '../../lib/telemetry/report';
import { describeReliability, readSessionReliability } from '../../lib/telemetry/sessions';
import { FIXED_FEEDBACK_EVENT, isTauriRuntime, type FixedFeedbackDetail } from '../../lib/updater';
import { FeedbackDialog, type FeedbackDocumentInfo } from './FeedbackDialog';

/** Window event any error surface dispatches to open the form pre-filled. */
export const FEEDBACK_REQUEST_EVENT = 'pdfluent:open-feedback';
export const PRIVACY_URL = 'https://pdfluent.com/privacy';

interface FeedbackRequestDetail {
  action?: string;
  errorCode?: string;
  pageCount?: number;
}

interface OpenState {
  env: FeedbackEnvironment;
  origin: FeedbackOrigin;
  sessionsNote: string | null;
  document: FeedbackDocumentInfo | null;
  pageCount: number | null;
}

type Notice = { kind: 'offered' | 'after-update'; version: string; ids: string[] };

async function documentInfo(): Promise<FeedbackDocumentInfo | null> {
  if (!isTauriRuntime()) return null;
  try {
    return await invokeCommand<FeedbackDocumentInfo | null>('feedback_document_info');
  } catch (error) {
    // The form still works without the share option; the bridge showed the error.
    void logToApp(`feedback: document info unavailable: ${describeError(error)}`);
    return null;
  }
}

export function FeedbackHost() {
  const { t } = useTranslation();
  const [open, setOpen] = useState<OpenState | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);

  const openForm = useCallback(async (detail: FeedbackRequestDetail) => {
    const [base, stats, document] = await Promise.all([getEnvironment(), readSessionReliability(), documentInfo()]);
    setOpen({
      env: { appVersion: base.appVersion, os: base.os, osVersion: base.osVersion, arch: base.arch, locale: base.locale },
      origin: { action: detail.action, errorCode: detail.errorCode },
      sessionsNote: describeReliability(stats),
      document,
      pageCount: typeof detail.pageCount === 'number' ? detail.pageCount : null,
    });
  }, []);

  // Error surfaces and the menu.
  useEffect(() => {
    function onRequest(e: Event): void {
      const detail = (e as CustomEvent<FeedbackRequestDetail>).detail ?? {};
      void openForm(detail);
    }
    window.addEventListener(FEEDBACK_REQUEST_EVENT, onRequest);

    let unlisten: (() => void) | undefined;
    let cancelled = false;
    if (isTauriRuntime()) {
      void (async () => {
        const { listen } = await import('@tauri-apps/api/event');
        if (cancelled) return;
        unlisten = await listen<string>('menu-event', (event) => {
          if (event.payload === 'help_improve') void openForm({});
        });
      })();
    }
    return () => {
      cancelled = true;
      window.removeEventListener(FEEDBACK_REQUEST_EVENT, onRequest);
      unlisten?.();
    };
  }, [openForm]);

  // "Fixed" notices: with an update offer, and once after the update.
  useEffect(() => {
    function onFixed(e: Event): void {
      const d = (e as CustomEvent<FixedFeedbackDetail>).detail;
      if (d?.ids?.length) setNotice({ kind: 'offered', version: d.version, ids: d.ids });
    }
    window.addEventListener(FIXED_FEEDBACK_EVENT, onFixed);
    void getEnvironment().then((env) => {
      const pending = takeFixedNoticeForStart(env.appVersion);
      if (pending) setNotice({ kind: 'after-update', version: pending.version, ids: pending.ids });
    });
    return () => window.removeEventListener(FIXED_FEEDBACK_EVENT, onFixed);
  }, []);

  const onSend = useCallback(
    async (form: FeedbackFormState) => {
      if (!open) throw new Error('feedback form is not open');
      const payload = buildFeedbackPayload(form, open.env, open.origin, open.sessionsNote);
      const result = await submitFeedback(payload, { userPressedSend: true });
      if (!result.ok) return { result, documentUploaded: null, remembered: false };
      const remembered = rememberReport({
        id: result.receipt.id,
        deleteToken: result.receipt.deleteToken,
        sentAt: new Date().toISOString(),
        appVersion: open.env.appVersion,
      });
      let documentUploaded: boolean | null = null;
      if (payload.attachment && result.receipt.uploadToken) {
        try {
          const buffer = await invokeCommand<ArrayBuffer>('feedback_document_bytes');
          documentUploaded = await uploadFeedbackDocument(result.receipt, buffer, { userPressedSend: true });
        } catch (error) {
          void logToApp(`feedback: document upload failed: ${describeError(error)}`);
          documentUploaded = false;
        }
      }
      return { result, documentUploaded, remembered };
    },
    [open],
  );

  const onRemove = useCallback(
    (receipt: FeedbackReceipt) => removeFeedback(receipt, { userRequested: true }),
    [],
  );

  const onOpenPrivacy = useCallback(() => {
    void invokeCommand('open_external_url', { url: PRIVACY_URL }).catch((error: unknown) => {
      // The bridge already put the failure on screen; this keeps it in the log.
      console.warn('[feedback] privacy link failed', error);
      void logToApp(`feedback: privacy link failed: ${describeError(error)}`);
    });
  }, []);

  return (
    <>
      {open && (
        <FeedbackDialog
          env={open.env}
          origin={open.origin}
          sessionsNote={open.sessionsNote}
          document={open.document}
          initialPageCount={open.pageCount}
          onSend={onSend}
          onRemove={onRemove}
          onOpenPrivacy={onOpenPrivacy}
          onClose={() => setOpen(null)}
        />
      )}
      {notice && (
        <div
          role="status"
          data-testid="feedback-fixed-notice"
          className="fixed bottom-4 right-4 z-50 max-w-sm rounded-lg border border-border bg-background shadow-xl px-4 py-3"
        >
          <p className="text-sm font-semibold text-foreground">{t('feedback.fixedTitle')}</p>
          <p className="mt-1 text-sm text-muted-foreground">
            {notice.kind === 'offered'
              ? t('feedback.fixedOffered', { version: notice.version, ids: notice.ids.join(', ') })
              : t('feedback.fixedAfterUpdate', { ids: notice.ids.join(', ') })}
          </p>
          <div className="mt-2 flex justify-end">
            <button
              type="button"
              onClick={() => setNotice(null)}
              className="px-2.5 py-1 text-sm rounded-md hover:bg-muted"
            >
              {t('feedback.dismiss')}
            </button>
          </div>
        </div>
      )}
    </>
  );
}
