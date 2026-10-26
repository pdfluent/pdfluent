// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary. The PDFluent application is free to use,
// including for commercial purposes. Redistribution, or extraction or reuse
// of its components (including the embedded PDF engine), requires a licence.
// See https://pdfluent.com/license for terms.

// ---------------------------------------------------------------------------
// "Help us improve PDFluent" — the in-app feedback form.
//
// Four questions, then what travels with them, shown before anything is sent:
//   1. what were you trying to do (fixed list + own words)
//   2. what happened (required)
//   3. what did you expect
//   4. what kind of document
// Then the system details (visible, switchable off), the open document (off;
// on only after a second prompt that names the file and says what happens to
// it), and an e-mail address with two separate follow-up boxes. Nothing is
// sent until Send; see src/lib/feedback/feedback.ts for the rules.
// ---------------------------------------------------------------------------

import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  FEEDBACK_AREAS,
  FEEDBACK_DOC_TYPES,
  areaForAction,
  buildFeedbackPayload,
  emptyFeedbackForm,
  feedbackFormProblem,
  type FeedbackDocType,
  type FeedbackEnvironment,
  type FeedbackFormState,
  type FeedbackOrigin,
  type FeedbackReceipt,
  type FeedbackSendResult,
} from '../../lib/feedback/feedback';

export interface FeedbackDocumentInfo {
  name: string;
  size: number;
  shareable: boolean;
}

export interface FeedbackDialogProps {
  env: FeedbackEnvironment;
  origin: FeedbackOrigin;
  sessionsNote: string | null;
  document: FeedbackDocumentInfo | null;
  initialPageCount: number | null;
  /** Sends the payload (and the document, when shared). Called from Send only. */
  onSend: (form: FeedbackFormState) => Promise<{ result: FeedbackSendResult; documentUploaded: boolean | null; remembered: boolean }>;
  onRemove: (receipt: FeedbackReceipt) => Promise<boolean>;
  onOpenPrivacy: () => void;
  onClose: () => void;
}

type Phase = 'form' | 'confirm-document' | 'sending' | 'sent' | 'failed';

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

export function FeedbackDialog(props: FeedbackDialogProps) {
  const { env, origin, sessionsNote, document, initialPageCount, onSend, onRemove, onOpenPrivacy, onClose } = props;
  const { t } = useTranslation();
  const ids = useId();
  const [form, setForm] = useState<FeedbackFormState>(() => ({
    ...emptyFeedbackForm(),
    area: areaForAction(origin.action),
    pageCount: initialPageCount,
    documentSize: document?.shareable ? document.size : null,
  }));
  const [phase, setPhase] = useState<Phase>('form');
  const [showProblems, setShowProblems] = useState(false);
  const [failure, setFailure] = useState<FeedbackSendResult | null>(null);
  const [receipt, setReceipt] = useState<FeedbackReceipt | null>(null);
  const [documentUploaded, setDocumentUploaded] = useState<boolean | null>(null);
  const [remembered, setRemembered] = useState(true);
  const [removeState, setRemoveState] = useState<'idle' | 'busy' | 'done' | 'failed'>('idle');
  const firstFieldRef = useRef<HTMLSelectElement>(null);
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  });

  useEffect(() => {
    firstFieldRef.current?.focus();
  }, []);

  useEffect(() => {
    function onKey(e: KeyboardEvent): void {
      if (e.key === 'Escape' && phase !== 'sending') onCloseRef.current();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [phase]);

  const preview = useMemo(
    () => buildFeedbackPayload(form, env, origin, sessionsNote),
    [form, env, origin, sessionsNote],
  );
  const problem = feedbackFormProblem(form);
  const update = <K extends keyof FeedbackFormState>(key: K, value: FeedbackFormState[K]): void =>
    setForm((f) => ({ ...f, [key]: value }));

  async function send(): Promise<void> {
    if (problem) {
      setShowProblems(true);
      return;
    }
    setPhase('sending');
    const out = await onSend(form);
    if (out.result.ok) {
      setReceipt(out.result.receipt);
      setDocumentUploaded(out.documentUploaded);
      setRemembered(out.remembered);
      setPhase('sent');
    } else {
      setFailure(out.result);
      setPhase('failed');
    }
  }

  async function remove(): Promise<void> {
    if (!receipt) return;
    setRemoveState('busy');
    setRemoveState((await onRemove(receipt)) ? 'done' : 'failed');
  }

  const system = [env.os, env.osVersion, env.arch].filter(Boolean).join(' ');
  const notIncluded = t('feedback.notIncluded');

  return (
    <>
      <div className="fixed inset-0 bg-black/40 z-40" aria-hidden="true" />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={`${ids}-title`}
        data-testid="feedback-dialog"
        className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-lg bg-background border border-border rounded-xl shadow-2xl z-50 overflow-hidden max-h-[90vh] flex flex-col"
      >
        {phase === 'sent' && receipt ? (
          <div className="px-5 py-5" data-testid="feedback-sent">
            <h2 id={`${ids}-title`} className="text-base font-semibold text-foreground">
              {t('feedback.sentTitle')}
            </h2>
            <p className="mt-2 text-sm text-muted-foreground">{t('feedback.sentBody')}</p>
            <p className="mt-2">
              <code className="px-2 py-1 rounded bg-muted text-foreground text-base" data-testid="feedback-sent-id">
                {receipt.id}
              </code>
            </p>
            <p className="mt-2 text-xs text-muted-foreground">{t('feedback.sentIdHint')}</p>
            {!remembered && <p className="mt-2 text-xs text-foreground" role="status">{t('feedback.sentNoLocalCopy')}</p>}
            {documentUploaded === false && (
              <p className="mt-2 text-xs text-destructive" role="status" data-testid="feedback-document-failed">
                {t('feedback.sentDocumentFailed')}
              </p>
            )}
            {!form.consentFixed && <p className="mt-2 text-xs text-muted-foreground">{t('feedback.noEmailHint')}</p>}
            {removeState === 'done' && <p className="mt-2 text-sm text-foreground" role="status">{t('feedback.removed')}</p>}
            {removeState === 'failed' && <p className="mt-2 text-sm text-destructive" role="alert">{t('feedback.removeFailed')}</p>}
            <div className="mt-5 flex justify-between gap-2">
              <button
                type="button"
                onClick={() => void remove()}
                disabled={removeState === 'busy' || removeState === 'done'}
                data-testid="feedback-remove-btn"
                className="px-3 py-1.5 text-sm text-muted-foreground hover:text-foreground hover:bg-muted rounded-md disabled:opacity-40"
              >
                {removeState === 'busy' ? t('feedback.removing') : t('feedback.removeReport')}
              </button>
              <button
                type="button"
                onClick={onClose}
                data-testid="feedback-close-btn"
                className="px-3 py-1.5 text-sm font-medium rounded-md bg-primary text-primary-foreground hover:bg-primary/90"
              >
                {t('common.close')}
              </button>
            </div>
          </div>
        ) : phase === 'confirm-document' && document ? (
          <div className="px-5 py-5" data-testid="feedback-document-confirm">
            <h2 id={`${ids}-title`} className="text-base font-semibold text-foreground">
              {t('feedback.documentConfirmTitle')}
            </h2>
            <p className="mt-2 text-sm text-foreground font-medium" data-testid="feedback-document-name">
              {t('feedback.documentConfirmFile', { name: document.name, size: formatBytes(document.size) })}
            </p>
            <p className="mt-2 text-sm text-muted-foreground">{t('feedback.documentConfirmText')}</p>
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  update('shareDocument', false);
                  setPhase('form');
                }}
                data-testid="feedback-document-decline"
                className="px-3 py-1.5 text-sm text-muted-foreground hover:text-foreground hover:bg-muted rounded-md"
              >
                {t('feedback.documentConfirmNo')}
              </button>
              <button
                type="button"
                onClick={() => {
                  update('shareDocument', true);
                  setPhase('form');
                }}
                data-testid="feedback-document-accept"
                className="px-3 py-1.5 text-sm font-medium rounded-md bg-primary text-primary-foreground hover:bg-primary/90"
              >
                {t('feedback.documentConfirmYes')}
              </button>
            </div>
          </div>
        ) : (
          <>
            <div className="px-5 py-4 overflow-y-auto">
              <h2 id={`${ids}-title`} className="text-base font-semibold text-foreground">
                {t('feedback.title')}
              </h2>
              <p className="mt-1 text-sm text-muted-foreground">
                {origin.errorCode ? t('feedback.fromError') : t('feedback.intro')}
              </p>

              <label htmlFor={`${ids}-area`} className="block mt-4 text-sm font-medium text-foreground">
                {t('feedback.areaLabel')}
              </label>
              <select
                id={`${ids}-area`}
                ref={firstFieldRef}
                data-testid="feedback-area"
                value={form.area}
                onChange={(e) => update('area', e.target.value as FeedbackFormState['area'])}
                className="mt-1 w-full text-sm rounded-md border border-border bg-background px-2 py-1.5"
              >
                {FEEDBACK_AREAS.map((a) => (
                  <option key={a} value={a}>
                    {t(`feedback.area.${a}`)}
                  </option>
                ))}
              </select>
              <input
                type="text"
                aria-label={t('feedback.tryingToPlaceholder')}
                data-testid="feedback-trying-to"
                value={form.tryingTo}
                onChange={(e) => update('tryingTo', e.target.value)}
                placeholder={t('feedback.tryingToPlaceholder')}
                className="mt-2 w-full text-sm rounded-md border border-border bg-background px-2.5 py-1.5"
              />

              <label htmlFor={`${ids}-happened`} className="block mt-4 text-sm font-medium text-foreground">
                {t('feedback.whatHappenedLabel')}
              </label>
              <textarea
                id={`${ids}-happened`}
                data-testid="feedback-what-happened"
                required
                aria-invalid={showProblems && problem === 'whatHappened'}
                aria-describedby={showProblems && problem === 'whatHappened' ? `${ids}-happened-err` : undefined}
                value={form.whatHappened}
                onChange={(e) => update('whatHappened', e.target.value)}
                rows={3}
                placeholder={t('feedback.whatHappenedPlaceholder')}
                className="mt-1 w-full text-sm rounded-md border border-border bg-background px-2.5 py-1.5 resize-y"
              />
              {showProblems && problem === 'whatHappened' && (
                <p id={`${ids}-happened-err`} className="mt-1 text-xs text-destructive" role="alert">
                  {t('feedback.whatHappenedRequired')}
                </p>
              )}

              <label htmlFor={`${ids}-expected`} className="block mt-4 text-sm font-medium text-foreground">
                {t('feedback.expectedLabel')}
              </label>
              <textarea
                id={`${ids}-expected`}
                data-testid="feedback-expected"
                value={form.expected}
                onChange={(e) => update('expected', e.target.value)}
                rows={2}
                placeholder={t('feedback.expectedPlaceholder')}
                className="mt-1 w-full text-sm rounded-md border border-border bg-background px-2.5 py-1.5 resize-y"
              />

              <div className="mt-4 flex gap-3">
                <div className="flex-1">
                  <label htmlFor={`${ids}-doctype`} className="block text-sm font-medium text-foreground">
                    {t('feedback.docTypeLabel')}
                  </label>
                  <select
                    id={`${ids}-doctype`}
                    data-testid="feedback-doc-type"
                    value={form.docType ?? ''}
                    onChange={(e) => update('docType', e.target.value === '' ? null : (e.target.value as FeedbackDocType))}
                    className="mt-1 w-full text-sm rounded-md border border-border bg-background px-2 py-1.5"
                  >
                    <option value="">{t('feedback.docTypeUnset')}</option>
                    {FEEDBACK_DOC_TYPES.map((d) => (
                      <option key={d} value={d}>
                        {t(`feedback.docType.${d}`)}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="w-32">
                  <label htmlFor={`${ids}-pages`} className="block text-sm font-medium text-foreground">
                    {t('feedback.pageCountLabel')}
                  </label>
                  <input
                    id={`${ids}-pages`}
                    type="number"
                    min={0}
                    data-testid="feedback-page-count"
                    value={form.pageCount ?? ''}
                    onChange={(e) => {
                      const n = parseInt(e.target.value, 10);
                      update('pageCount', Number.isFinite(n) && n >= 0 ? n : null);
                    }}
                    className="mt-1 w-full text-sm rounded-md border border-border bg-background px-2 py-1.5"
                  />
                </div>
              </div>

              {/* What travels with the report: shown, and switchable off. */}
              <fieldset className="mt-5 rounded-md border border-border px-3 py-2" data-testid="feedback-context">
                <legend className="px-1 text-xs font-medium text-muted-foreground uppercase tracking-wide">
                  {t('feedback.contextTitle')}
                </legend>
                <label className="flex items-center gap-2 text-sm text-foreground">
                  <input
                    type="checkbox"
                    data-testid="feedback-context-toggle"
                    checked={form.includeContext}
                    onChange={(e) => update('includeContext', e.target.checked)}
                    className="w-4 h-4"
                  />
                  <span>{t('feedback.contextToggle')}</span>
                </label>
                <dl className="mt-2 text-xs grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
                  <dt className="text-muted-foreground">{t('feedback.fieldVersion')}</dt>
                  <dd data-testid="feedback-ctx-version">{preview.context.app_version}</dd>
                  <dt className="text-muted-foreground">{t('feedback.fieldSystem')}</dt>
                  <dd data-testid="feedback-ctx-system">{form.includeContext ? system : notIncluded}</dd>
                  <dt className="text-muted-foreground">{t('feedback.fieldLanguage')}</dt>
                  <dd data-testid="feedback-ctx-locale">{preview.context.locale ?? notIncluded}</dd>
                  <dt className="text-muted-foreground">{t('feedback.fieldLastError')}</dt>
                  <dd data-testid="feedback-ctx-error">
                    {form.includeContext
                      ? [preview.context.error_code, preview.context.error_action].filter(Boolean).join(' · ') || t('common.none')
                      : notIncluded}
                  </dd>
                  {sessionsNote && (
                    <>
                      <dt className="text-muted-foreground">{t('feedback.fieldSessions')}</dt>
                      <dd>{form.includeContext ? sessionsNote : notIncluded}</dd>
                    </>
                  )}
                </dl>
                <p className="mt-2 text-xs text-muted-foreground">{t('feedback.contextHint')}</p>
              </fieldset>

              {/* The document: off unless confirmed in a second, explicit prompt. */}
              <fieldset className="mt-4 rounded-md border border-border px-3 py-2">
                <legend className="px-1 text-xs font-medium text-muted-foreground uppercase tracking-wide">
                  {t('feedback.documentTitle')}
                </legend>
                {document === null ? (
                  <p className="text-sm text-muted-foreground">{t('feedback.documentNone')}</p>
                ) : !document.shareable ? (
                  <p className="text-sm text-muted-foreground">{t('feedback.documentTooLarge')}</p>
                ) : (
                  <label className="flex items-center gap-2 text-sm text-foreground">
                    <input
                      type="checkbox"
                      data-testid="feedback-document-toggle"
                      checked={form.shareDocument}
                      onChange={(e) => {
                        if (e.target.checked) setPhase('confirm-document');
                        else update('shareDocument', false);
                      }}
                      className="w-4 h-4"
                    />
                    <span>{form.shareDocument ? t('feedback.documentShared') : t('feedback.documentToggle')}</span>
                  </label>
                )}
              </fieldset>

              <fieldset className="mt-4 rounded-md border border-border px-3 py-2">
                <legend className="px-1 text-xs font-medium text-muted-foreground uppercase tracking-wide">
                  {t('feedback.contactTitle')}
                </legend>
                <label htmlFor={`${ids}-email`} className="block text-sm text-foreground">
                  {t('feedback.emailLabel')}
                </label>
                <input
                  id={`${ids}-email`}
                  type="email"
                  autoComplete="email"
                  data-testid="feedback-email"
                  aria-invalid={showProblems && problem === 'email'}
                  aria-describedby={showProblems && problem === 'email' ? `${ids}-email-err` : undefined}
                  value={form.email}
                  onChange={(e) => update('email', e.target.value)}
                  className="mt-1 w-full text-sm rounded-md border border-border bg-background px-2.5 py-1.5"
                />
                {showProblems && problem === 'email' && (
                  <p id={`${ids}-email-err`} className="mt-1 text-xs text-destructive" role="alert">
                    {t('feedback.emailInvalid')}
                  </p>
                )}
                <label className="flex items-start gap-2 mt-2 text-sm text-foreground">
                  <input
                    type="checkbox"
                    data-testid="feedback-consent-contact"
                    checked={form.consentContact}
                    onChange={(e) => update('consentContact', e.target.checked)}
                    className="w-4 h-4 mt-0.5"
                  />
                  <span>{t('feedback.consentContact')}</span>
                </label>
                <label className="flex items-start gap-2 mt-1 text-sm text-foreground">
                  <input
                    type="checkbox"
                    data-testid="feedback-consent-fixed"
                    checked={form.consentFixed}
                    onChange={(e) => update('consentFixed', e.target.checked)}
                    className="w-4 h-4 mt-0.5"
                  />
                  <span>{t('feedback.consentFixed')}</span>
                </label>
                <p className="mt-2 text-xs text-muted-foreground">{t('feedback.contactHint')}</p>
              </fieldset>

              {phase === 'failed' && failure && !failure.ok && (
                <div className="mt-4" role="alert" data-testid="feedback-failed">
                  <p className="text-sm font-medium text-destructive">{t('feedback.failedTitle')}</p>
                  <p className="text-sm text-destructive">
                    {failure.reason === 'network'
                      ? t('feedback.failedNetwork')
                      : failure.reason === 'rate-limited'
                        ? t('feedback.failedRateLimited')
                        : failure.reason === 'rejected'
                          ? t('feedback.failedRejected')
                          : t('feedback.failedServer')}
                  </p>
                </div>
              )}
            </div>

            <div className="px-5 py-3 border-t border-border bg-muted/20">
              <p className="text-xs text-muted-foreground mb-2">
                {t('feedback.privacyNotice')}{' '}
                <button type="button" onClick={onOpenPrivacy} className="underline hover:text-foreground">
                  {t('feedback.privacyLink')}
                </button>
              </p>
              <div className="flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={onClose}
                  disabled={phase === 'sending'}
                  data-testid="feedback-cancel-btn"
                  className="px-3 py-1.5 text-sm text-muted-foreground hover:text-foreground hover:bg-muted rounded-md disabled:opacity-40"
                >
                  {t('feedback.cancel')}
                </button>
                <button
                  type="button"
                  onClick={() => void send()}
                  disabled={phase === 'sending'}
                  data-testid="feedback-send-btn"
                  className="px-3 py-1.5 text-sm font-medium rounded-md bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-40"
                >
                  {phase === 'sending' ? t('feedback.sending') : phase === 'failed' ? t('feedback.tryAgain') : t('feedback.send')}
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </>
  );
}
