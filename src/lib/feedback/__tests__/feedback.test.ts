// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary. The PDFluent application is free to use,
// including for commercial purposes. Redistribution, or extraction or reuse
// of its components (including the embedded PDF engine), requires a licence.
// See https://pdfluent.com/license for terms.

import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it, vi } from 'vitest';

import {
  CONSENT_VERSIONS,
  FEEDBACK_AREAS,
  FEEDBACK_DOC_TYPES,
  FEEDBACK_ENDPOINT,
  buildFeedbackPayload,
  emptyFeedbackForm,
  feedbackFormProblem,
  FEEDBACK_RETENTION_DAYS,
  removeAllFeedback,
  removeFeedback,
  submitFeedback,
  uploadFeedbackDocument,
  type FeedbackFormState,
} from '../feedback';
import { LOCAL_REPORTS_KEY, readLocalReports, rememberReport, type KeyValueStore } from '../localReports';
import { RETENTION } from '../../../../infra/report-worker/src/feedback.js';
import { AREAS, CONSENT_TEXT_VERSIONS, DOC_TYPES, validateFeedback } from '../../../../infra/report-worker/src/feedback.js';

const ENV = { appVersion: '1.0.1', os: 'Windows', osVersion: '11', arch: 'x86_64', locale: 'de' };
const ROOT = resolve(__dirname, '../../../..');
const en = JSON.parse(readFileSync(resolve(ROOT, 'src/i18n/locales/en.json'), 'utf8')) as {
  feedback: Record<string, unknown> & { area: Record<string, string>; docType: Record<string, string> };
};

function form(over: Partial<FeedbackFormState> = {}): FeedbackFormState {
  return { ...emptyFeedbackForm(), area: 'forms', whatHappened: 'The checkbox did not stay ticked', ...over };
}

describe('buildFeedbackPayload', () => {
  it('sends what the form shows, and the Worker accepts it', () => {
    const p = buildFeedbackPayload(form({ docType: 'form', pageCount: 2 }), ENV, { action: 'open', errorCode: 'open.corrupt' }, 'sessions: 3 finished');
    expect(p.context).toEqual({
      app_version: '1.0.1', os: 'Windows', os_version: '11', arch: 'x86_64', locale: 'de',
      error_code: 'open.corrupt', error_action: 'open', sessions_note: 'sessions: 3 finished',
    });
    expect(p.attachment).toBe(null);
    expect(p.contact).toBe(null);
    expect(validateFeedback(JSON.parse(JSON.stringify(p))).ok).toBe(true);
  });

  it('leaves the system details out entirely when they are switched off', () => {
    const p = buildFeedbackPayload(form({ includeContext: false }), ENV, { errorCode: 'open.corrupt' }, 'sessions: 3');
    expect(p.context).toEqual({ app_version: '1.0.1' });
    expect(p.context_included).toBe(false);
  });

  it('scrubs paths, addresses and file names out of the free text', () => {
    const p = buildFeedbackPayload(
      form({ tryingTo: 'open C:\\Users\\jan\\salaris.pdf', whatHappened: 'mail jan@example.com about /home/jan/x/y', expected: 'see rapport.docx' }),
      ENV, {}, null,
    );
    const text = JSON.stringify(p);
    expect(text).not.toContain('jan');
    expect(text).not.toContain('salaris');
    expect(text).not.toContain('rapport');
  });

  it('carries the document only after the confirmation set shareDocument', () => {
    expect(buildFeedbackPayload(form({ documentSize: 1000 }), ENV, {}, null).attachment).toBe(null);
    expect(buildFeedbackPayload(form({ documentSize: 1000, shareDocument: true }), ENV, {}, null).attachment).toEqual({
      consent: true, consent_text_version: CONSENT_VERSIONS.attachment, size: 1000,
    });
    expect(buildFeedbackPayload(form({ documentSize: 21 * 1024 * 1024, shareDocument: true }), ENV, {}, null).attachment).toBe(null);
  });

  it('carries an e-mail address only with a follow-up box ticked', () => {
    expect(buildFeedbackPayload(form({ email: 'a@example.com' }), ENV, {}, null).contact).toBe(null);
    expect(buildFeedbackPayload(form({ email: 'a@example.com', consentFixed: true }), ENV, {}, null).contact).toEqual({
      email: 'a@example.com', consent_contact: false, consent_fixed: true, consent_text_version: CONSENT_VERSIONS.contact,
    });
  });
});

describe('feedbackFormProblem', () => {
  it('needs what happened, and a valid address once a box is ticked', () => {
    expect(feedbackFormProblem(form({ whatHappened: ' ' }))).toBe('whatHappened');
    expect(feedbackFormProblem(form({ consentContact: true, email: 'nope' }))).toBe('email');
    expect(feedbackFormProblem(form({ consentContact: true, email: 'a@example.com' }))).toBe(null);
    expect(feedbackFormProblem(form())).toBe(null);
  });
});

describe('submitFeedback', () => {
  it('refuses, without a request, unless the user pressed Send', async () => {
    const fetchImpl = vi.fn();
    const p = buildFeedbackPayload(form(), ENV, {}, null);
    await expect(submitFeedback(p, { userPressedSend: false, fetchImpl: fetchImpl as unknown as typeof fetch })).rejects.toThrow(/Send button/);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('posts to the declared endpoint and returns the receipt', async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ id: 'FB-ABCDEFGH', delete_token: 'd', upload_token: 'u' }), { status: 201 }));
    const r = await submitFeedback(buildFeedbackPayload(form(), ENV, {}, null), { userPressedSend: true, fetchImpl: fetchImpl as unknown as typeof fetch });
    expect(r).toEqual({ ok: true, receipt: { id: 'FB-ABCDEFGH', deleteToken: 'd', uploadToken: 'u' } });
    expect(fetchImpl).toHaveBeenCalledWith(FEEDBACK_ENDPOINT, expect.objectContaining({ method: 'POST' }));
  });

  it('retries once on a network error, then says it could not reach the server', async () => {
    const fetchImpl = vi.fn(async () => { throw new TypeError('offline'); });
    const r = await submitFeedback(buildFeedbackPayload(form(), ENV, {}, null), { userPressedSend: true, fetchImpl: fetchImpl as unknown as typeof fetch });
    expect(r).toEqual({ ok: false, reason: 'network', status: null });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it('does not retry a rejection or a rate limit', async () => {
    for (const [status, reason] of [[400, 'rejected'], [429, 'rate-limited']] as const) {
      const fetchImpl = vi.fn(async () => new Response('{}', { status }));
      const r = await submitFeedback(buildFeedbackPayload(form(), ENV, {}, null), { userPressedSend: true, fetchImpl: fetchImpl as unknown as typeof fetch });
      expect(r).toEqual({ ok: false, reason, status });
      expect(fetchImpl).toHaveBeenCalledTimes(1);
    }
  });

  it('uploads the document and removes a report only on request', async () => {
    const fetchImpl = vi.fn(async () => new Response(null, { status: 204 }));
    const receipt = { id: 'FB-ABCDEFGH', deleteToken: 'd', uploadToken: 'u' };
    expect(await uploadFeedbackDocument(receipt, new ArrayBuffer(1), { userPressedSend: false, fetchImpl: fetchImpl as unknown as typeof fetch })).toBe(false);
    expect(await removeFeedback(receipt, { userRequested: false, fetchImpl: fetchImpl as unknown as typeof fetch })).toBe(false);
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(await uploadFeedbackDocument(receipt, new ArrayBuffer(1), { userPressedSend: true, fetchImpl: fetchImpl as unknown as typeof fetch })).toBe(true);
    expect(await removeFeedback(receipt, { userRequested: true, fetchImpl: fetchImpl as unknown as typeof fetch })).toBe(true);
    expect(fetchImpl).toHaveBeenNthCalledWith(1, `${FEEDBACK_ENDPOINT}/FB-ABCDEFGH/attachment`, expect.objectContaining({ method: 'PUT' }));
    expect(fetchImpl).toHaveBeenNthCalledWith(2, `${FEEDBACK_ENDPOINT}/FB-ABCDEFGH`, expect.objectContaining({ method: 'DELETE' }));
  });
});

describe('the app and the Worker agree', () => {
  it('on the areas and document types', () => {
    expect([...FEEDBACK_AREAS].sort()).toEqual(Object.keys(AREAS).sort());
    expect([...FEEDBACK_DOC_TYPES].sort()).toEqual([...DOC_TYPES].sort());
  });

  it('on the consent text versions', () => {
    expect(CONSENT_TEXT_VERSIONS.attachment).toContain(CONSENT_VERSIONS.attachment);
    expect(CONSENT_TEXT_VERSIONS.contact).toContain(CONSENT_VERSIONS.contact);
  });

  it('every area and document type has an English label', () => {
    for (const a of FEEDBACK_AREAS) expect(typeof en.feedback.area[a]).toBe('string');
    for (const d of FEEDBACK_DOC_TYPES) expect(typeof en.feedback.docType[d]).toBe('string');
  });
});

describe('consent wording is versioned', () => {
  // The stored consent says which sentence the person agreed to. If the
  // English sentence changes, the version must change with it, or the record
  // would claim agreement to words nobody saw. Update the hash only together
  // with a new version in CONSENT_VERSIONS and the Worker.
  const sha = (s: unknown) => createHash('sha256').update(String(s)).digest('hex').slice(0, 16);
  it('pins the document consent to fb-attach-1', () => {
    expect(CONSENT_VERSIONS.attachment).toBe('fb-attach-1');
    expect(sha(en.feedback.documentConfirmText)).toBe(ATTACH_SHA);
  });
  it('pins the contact consent to fb-contact-1', () => {
    expect(CONSENT_VERSIONS.contact).toBe('fb-contact-1');
    expect(sha([en.feedback.consentContact, en.feedback.consentFixed, en.feedback.contactHint].join('|'))).toBe(CONTACT_SHA);
  });
});

const ATTACH_SHA = 'caa298ce9f25cbec';
const CONTACT_SHA = '7149afb58747d33f';

describe('deleting every remembered feedback report from Settings', () => {
  function memoryStore(): KeyValueStore {
    const data = new Map<string, string>();
    return { getItem: (k) => data.get(k) ?? null, setItem: (k, v) => void data.set(k, v) };
  }
  function stored(): KeyValueStore {
    const store = memoryStore();
    for (const n of ['A', 'B', 'C']) {
      rememberReport({ id: `FB-0000000${n}`, deleteToken: `tok-${n}`, sentAt: '2026-10-01T00:00:00Z', appVersion: '1.1.0' }, store);
    }
    return store;
  }

  it('sends each stored token to its own report, forgets what went and keeps what failed', async () => {
    const store = stored();
    const fetchImpl = vi.fn(async (url: string) => new Response(null, { status: url.endsWith('FB-0000000B') ? 500 : url.endsWith('FB-0000000C') ? 404 : 204 }));
    const result = await removeAllFeedback({ userRequested: true, fetchImpl: fetchImpl as unknown as typeof fetch, store });
    expect(result).toEqual({ removed: 2, failed: 1 });
    expect(fetchImpl).toHaveBeenCalledWith(`${FEEDBACK_ENDPOINT}/FB-0000000A`, {
      method: 'DELETE',
      headers: { 'X-Delete-Token': 'tok-A' },
    });
    expect(readLocalReports(store).map((r) => r.id)).toEqual(['FB-0000000B']);
    expect(LOCAL_REPORTS_KEY).toBe('pdfluent.feedback.sent');
  });

  it('deletes nothing unless the user asked', async () => {
    const store = stored();
    const fetchImpl = vi.fn();
    expect(await removeAllFeedback({ userRequested: false, fetchImpl: fetchImpl as unknown as typeof fetch, store })).toEqual({ removed: 0, failed: 0 });
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(readLocalReports(store)).toHaveLength(3);
  });

  it('shows the same retention period the Worker applies', () => {
    expect(FEEDBACK_RETENTION_DAYS).toBe(RETENTION.feedbackDays);
  });
});
