// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary. The PDFluent application is free to use,
// including for commercial purposes. Redistribution, or extraction or reuse
// of its components (including the embedded PDF engine), requires a licence.
// See https://pdfluent.com/license for terms.

// ---------------------------------------------------------------------------
// "Help us improve PDFluent": the report the in-app form sends.
//
// The rules this module keeps, each with a test in
// src/lib/feedback/__tests__/feedback.test.ts:
//   - Nothing leaves without the user pressing Send. submitFeedback() refuses
//     to run without `userPressedSend: true`; the only caller is the dialog's
//     Send handler. The offline allow-list declares this endpoint as opt-in.
//   - What the form shows is what is sent. buildFeedbackPayload() is pure, and
//     the dialog renders its result in the "What gets sent" block.
//   - Free text is scrubbed here (paths, addresses, file names) and again on
//     the server.
//   - The document travels only after two separate confirmations, and an
//     e-mail address only with one of the two follow-up boxes ticked.
// ---------------------------------------------------------------------------

import { scrub, scrubOptional } from '../telemetry/scrub';
import { forgetReports, readLocalReports, type KeyValueStore } from './localReports';

/** How long the server keeps a feedback report (infra/report-worker/src/feedback.js, RETENTION). */
export const FEEDBACK_RETENTION_DAYS = 365;

/** Our own address; the Worker behind it is infra/report-worker. */
export const FEEDBACK_ENDPOINT = 'https://report.pdfluent.com/v1/feedback';

/** What the reporter was doing. Same keys as AREAS in infra/report-worker/src/feedback.js. */
export const FEEDBACK_AREAS = [
  'open-view',
  'search-copy',
  'print',
  'edit-text',
  'annotate',
  'forms',
  'sign',
  'redact',
  'pages-organize',
  'convert-export',
  'ocr',
  'pdfa-compliance',
  'protect',
  'save',
  'install-update',
  'other',
] as const;
export type FeedbackArea = (typeof FEEDBACK_AREAS)[number];

export const FEEDBACK_DOC_TYPES = [
  'form',
  'scanned',
  'signed',
  'protected',
  'large',
  'xfa',
  'other',
  'none',
] as const;
export type FeedbackDocType = (typeof FEEDBACK_DOC_TYPES)[number];

/**
 * The version of each consent wording, sent with the consent so the stored
 * record says which sentence the person agreed to. Change the English text in
 * en.json and this version must change with it; a test pins the pair.
 */
export const CONSENT_VERSIONS = {
  attachment: 'fb-attach-1',
  contact: 'fb-contact-1',
} as const;

/** Mirrors the Worker's limit (and the Rust command's). */
export const MAX_ATTACHMENT_BYTES = 20 * 1024 * 1024;

/** Where the form was opened from, when it was opened from an error. */
export interface FeedbackOrigin {
  action?: string;
  errorCode?: string;
}

export interface FeedbackEnvironment {
  appVersion: string;
  os: string;
  osVersion: string | null;
  arch: string | null;
  locale: string;
}

export interface FeedbackFormState {
  area: FeedbackArea;
  tryingTo: string;
  whatHappened: string;
  expected: string;
  docType: FeedbackDocType | null;
  pageCount: number | null;
  includeContext: boolean;
  /** True only after the second, explicit confirmation of the document share. */
  shareDocument: boolean;
  documentSize: number | null;
  email: string;
  consentContact: boolean;
  consentFixed: boolean;
}

export interface FeedbackPayload {
  source: 'app';
  area: FeedbackArea;
  trying_to: string | null;
  what_happened: string;
  expected: string | null;
  doc_type: FeedbackDocType | null;
  page_count: number | null;
  context_included: boolean;
  context: {
    app_version: string;
    os?: string;
    os_version?: string | null;
    arch?: string | null;
    locale?: string;
    error_code?: string | null;
    error_action?: string | null;
    sessions_note?: string | null;
  };
  attachment: { consent: true; consent_text_version: string; size: number } | null;
  contact: {
    email: string;
    consent_contact: boolean;
    consent_fixed: boolean;
    consent_text_version: string;
  } | null;
}

export function emptyFeedbackForm(): FeedbackFormState {
  return {
    area: 'other',
    tryingTo: '',
    whatHappened: '',
    expected: '',
    docType: null,
    pageCount: null,
    includeContext: true,
    shareDocument: false,
    documentSize: null,
    email: '',
    consentContact: false,
    consentFixed: false,
  };
}

/** Best guess at the area from the action the error happened in. */
export function areaForAction(action: string | undefined): FeedbackArea {
  switch (action) {
    case 'open':
      return 'open-view';
    case 'save':
    case 'save-as':
      return 'save';
    case 'print':
      return 'print';
    case 'ocr':
      return 'ocr';
    case 'export':
    case 'convert':
      return 'convert-export';
    case 'sign':
      return 'sign';
    case 'edit-text':
      return 'edit-text';
    default:
      return 'other';
  }
}

const EMAIL_RE = /^[^\s@]{1,64}@[^\s@]{1,255}\.[A-Za-z]{2,}$/;

export function isPlausibleEmail(value: string): boolean {
  return EMAIL_RE.test(value.trim());
}

/** Why the form cannot be sent yet, or null when it can. */
export function feedbackFormProblem(form: FeedbackFormState): 'whatHappened' | 'email' | null {
  if (form.whatHappened.trim().length === 0) return 'whatHappened';
  if ((form.consentContact || form.consentFixed) && !isPlausibleEmail(form.email)) return 'email';
  return null;
}

/**
 * The exact JSON the Send button posts. Pure. Context fields are left out,
 * not blanked, when the reporter switched them off: what is not in the
 * preview is not in the request.
 */
export function buildFeedbackPayload(
  form: FeedbackFormState,
  env: FeedbackEnvironment,
  origin: FeedbackOrigin,
  sessionsNote: string | null,
): FeedbackPayload {
  const wantsContact = form.consentContact || form.consentFixed;
  const context: FeedbackPayload['context'] = { app_version: env.appVersion };
  if (form.includeContext) {
    context.os = env.os;
    context.os_version = env.osVersion;
    context.arch = env.arch;
    context.locale = env.locale;
    context.error_code = origin.errorCode ?? null;
    context.error_action = origin.action ?? null;
    context.sessions_note = sessionsNote;
  }
  return {
    source: 'app',
    area: form.area,
    trying_to: scrubOptional(form.tryingTo.trim()),
    what_happened: scrub(form.whatHappened.trim()),
    expected: scrubOptional(form.expected.trim()),
    doc_type: form.docType,
    page_count: form.pageCount,
    context_included: form.includeContext,
    context,
    attachment:
      form.shareDocument && form.documentSize != null && form.documentSize > 0 && form.documentSize <= MAX_ATTACHMENT_BYTES
        ? { consent: true, consent_text_version: CONSENT_VERSIONS.attachment, size: form.documentSize }
        : null,
    contact: wantsContact
      ? {
          email: form.email.trim(),
          consent_contact: form.consentContact,
          consent_fixed: form.consentFixed,
          consent_text_version: CONSENT_VERSIONS.contact,
        }
      : null,
  };
}

export interface FeedbackReceipt {
  id: string;
  deleteToken: string;
  uploadToken: string | null;
}

export type FeedbackSendResult =
  | { ok: true; receipt: FeedbackReceipt }
  | { ok: false; reason: 'rejected' | 'rate-limited' | 'network' | 'server'; status: number | null };

export interface SubmitOptions {
  /** Set by the dialog's Send handler, and only there. */
  userPressedSend: boolean;
  fetchImpl?: typeof fetch;
}

/**
 * POST the report. Retries once on a network error or a 5xx; never throws.
 * Refuses outright unless the user pressed Send: the endpoint is an opt-in
 * exception to "the app makes no request", and this is the switch.
 */
export async function submitFeedback(
  payload: FeedbackPayload,
  options: SubmitOptions,
): Promise<FeedbackSendResult> {
  if (options.userPressedSend !== true) {
    throw new Error('submitFeedback: only the Send button may send a report');
  }
  const doFetch = options.fetchImpl ?? fetch;
  let last: FeedbackSendResult = { ok: false, reason: 'network', status: null };
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await doFetch(FEEDBACK_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (res.status === 201) {
        const data = (await res.json().catch((error: unknown) => {
          console.warn('[feedback] unreadable answer from the server', error);
          return null;
        })) as
          | { id?: string; delete_token?: string; upload_token?: string }
          | null;
        if (data?.id && data.delete_token) {
          return {
            ok: true,
            receipt: { id: data.id, deleteToken: data.delete_token, uploadToken: data.upload_token ?? null },
          };
        }
        return { ok: false, reason: 'server', status: res.status };
      }
      if (res.status === 429) return { ok: false, reason: 'rate-limited', status: 429 };
      if (res.status >= 400 && res.status < 500) return { ok: false, reason: 'rejected', status: res.status };
      last = { ok: false, reason: 'server', status: res.status };
    } catch (error) {
      console.warn('[feedback] request failed', error);
      last = { ok: false, reason: 'network', status: null };
    }
  }
  return last;
}

/** PUT the shared document with the one-time upload token. */
export async function uploadFeedbackDocument(
  receipt: FeedbackReceipt,
  bytes: ArrayBuffer,
  options: SubmitOptions,
): Promise<boolean> {
  if (options.userPressedSend !== true || !receipt.uploadToken) return false;
  const doFetch = options.fetchImpl ?? fetch;
  try {
    const res = await doFetch(`${FEEDBACK_ENDPOINT}/${receipt.id}/attachment`, {
      method: 'PUT',
      headers: { 'X-Upload-Token': receipt.uploadToken, 'Content-Type': 'application/octet-stream' },
      body: bytes,
    });
    return res.status === 204;
  } catch (error) {
    console.warn('[feedback] request failed', error);
    return false;
  }
}

/**
 * Erase a report: the reporter's own right, exercised with the token only
 * this machine holds. Removes the stored report, the address, the document
 * and the issue text on the server.
 */
export async function removeFeedback(
  receipt: Pick<FeedbackReceipt, 'id' | 'deleteToken'>,
  options: { userRequested: boolean; fetchImpl?: typeof fetch },
): Promise<boolean> {
  if (options.userRequested !== true) return false;
  const doFetch = options.fetchImpl ?? fetch;
  try {
    const res = await doFetch(`${FEEDBACK_ENDPOINT}/${receipt.id}`, {
      method: 'DELETE',
      headers: { 'X-Delete-Token': receipt.deleteToken },
    });
    return res.status === 204 || res.status === 404;
  } catch (error) {
    console.warn('[feedback] request failed', error);
    return false;
  }
}

/** Delete every remembered feedback report; the ones that failed stay listed for another try. */
export async function removeAllFeedback(options: {
  userRequested: boolean;
  fetchImpl?: typeof fetch;
  store?: KeyValueStore | null;
}): Promise<{ removed: number; failed: number }> {
  if (options.userRequested !== true) return { removed: 0, failed: 0 };
  const reports = readLocalReports(options.store);
  const gone: string[] = [];
  for (const report of reports) {
    if (await removeFeedback(report, { userRequested: true, fetchImpl: options.fetchImpl })) gone.push(report.id);
  }
  forgetReports(gone, options.store);
  return { removed: gone.length, failed: reports.length - gone.length };
}
