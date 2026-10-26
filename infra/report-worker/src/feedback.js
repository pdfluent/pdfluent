// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary. The PDFluent application is free to use,
// including for commercial purposes. Redistribution, or extraction or reuse
// of its components (including the embedded PDF engine), requires a licence.
// See https://pdfluent.com/license for terms.

// "Help us improve PDFluent": the feedback ingest.
//
//   POST   /v1/feedback                  store a report, answer { id, delete_token, upload_token? }
//   PUT    /v1/feedback/<id>/attachment  the shared document, only when the report declared consent
//   DELETE /v1/feedback/<id>             remove a report (X-Delete-Token), the reporter's own right
//   cron   syncFeedback()                open missing issues, expire attachments and old rows
//
// What goes where, and why it is split:
//   D1 `feedback`  the report: structured answers, the context the form showed,
//                  consent flags with the time and the text version agreed to.
//   D1 `contact`   the e-mail address, only when one of the two follow-up
//                  boxes was ticked. Its own table so it can be deleted on its
//                  own the moment its purpose is met, and so no query that
//                  reads reports reads addresses by accident.
//   R2             the shared document, keyed by the report ID, never by name.
//   GitHub issue   the report minus everything personal: no address, no file,
//                  no file name, scrubbed free text. Issues are quoted and
//                  copied into commits; that is why they get nothing a person
//                  can be found by, even in a private repository.

import { scrub, containsPersonalData } from './scrub.js';
import { FEEDBACK_ID_RE, newFeedbackId, newToken, sha256Hex, sameHex } from './ids.js';
import { GitHubHttpError, createIssue, getIssue, githubConfigured, replaceIssueText } from './github.js';

export const AREAS = Object.freeze({
  'open-view': 'core-viewer',
  'search-copy': 'core-viewer',
  print: 'core-viewer',
  'edit-text': 'manipulation',
  annotate: 'annotations',
  forms: 'forms',
  sign: 'signing',
  redact: 'manipulation',
  'pages-organize': 'manipulation',
  'convert-export': 'manipulation',
  ocr: 'intelligence',
  'pdfa-compliance': 'compliance',
  protect: 'manipulation',
  save: 'core-viewer',
  'install-update': 'distribution',
  other: 'ui',
});

/** Which product a report is about. The app always sends 'editor'; the website form may send any. */
export const PRODUCTS = Object.freeze(['editor', 'sdk', 'website']);

export const DOC_TYPES = Object.freeze([
  'form',
  'scanned',
  'signed',
  'protected',
  'large',
  'xfa',
  'other',
  'none',
]);

/** The consent texts the app and site show, by version. A new wording is a new version. */
export const CONSENT_TEXT_VERSIONS = Object.freeze({
  attachment: ['fb-attach-1'],
  // site-contact-1: the website form's "Your email (optional) — we'll only use it to reply".
  contact: ['fb-contact-1', 'site-contact-1'],
});

export const LIMITS = Object.freeze({
  tryingTo: 2000,
  whatHappened: 8000,
  expected: 4000,
  field: 128,
  attachmentBytes: 20 * 1024 * 1024,
  perHashPerDay: 20,
});

/** Retention, in days. Mirrors the privacy statement; change both together. */
export const RETENTION = Object.freeze({
  feedbackDays: 365,
  attachmentAfterCloseDays: 90,
  attachmentMaxDays: 365,
});

const EMAIL_RE = /^[^\s@]{1,64}@[^\s@]{1,255}\.[A-Za-z]{2,}$/;

// Free text is scrubbed on arrival, not only on the way into an issue: the
// app scrubs before it sends, but the website form and any other client might
// not, and "never stored" is easier to keep than "never shown".
function text(value, max) {
  if (typeof value !== 'string') return null;
  const t = scrub(value).trim();
  return t.length === 0 ? null : t.slice(0, max);
}

function field(value) {
  return text(value, LIMITS.field);
}

/**
 * Validate a submission. Returns `{ ok: true, value }` with only the fields
 * this Worker knows (anything else in the body is dropped, not stored), or
 * `{ ok: false, error }`.
 */
export function validateFeedback(body) {
  if (!body || typeof body !== 'object') return { ok: false, error: 'invalid body' };
  const source = body.source === 'site' ? 'site' : body.source === 'app' ? 'app' : null;
  if (!source) return { ok: false, error: 'invalid source' };
  const product = body.product == null ? 'editor' : PRODUCTS.includes(body.product) ? body.product : null;
  if (!product) return { ok: false, error: 'invalid product' };
  if (source === 'app' && product !== 'editor') return { ok: false, error: 'invalid product' };
  const area = typeof body.area === 'string' && Object.hasOwn(AREAS, body.area) ? body.area : null;
  if (!area) return { ok: false, error: 'invalid area' };
  const whatHappened = text(body.what_happened, LIMITS.whatHappened);
  if (!whatHappened) return { ok: false, error: 'what_happened is required' };
  const docType = body.doc_type == null ? null : DOC_TYPES.includes(body.doc_type) ? body.doc_type : undefined;
  if (docType === undefined) return { ok: false, error: 'invalid doc_type' };
  const pageCount =
    body.page_count == null
      ? null
      : Number.isInteger(body.page_count) && body.page_count >= 0 && body.page_count < 1_000_000
        ? body.page_count
        : undefined;
  if (pageCount === undefined) return { ok: false, error: 'invalid page_count' };

  const ctx = body.context && typeof body.context === 'object' ? body.context : {};
  const appVersion = field(ctx.app_version);
  if (!appVersion) return { ok: false, error: 'context.app_version is required' };
  const contextIncluded = body.context_included !== false;

  let attachment = null;
  if (body.attachment != null) {
    const a = body.attachment;
    if (a.consent !== true || !CONSENT_TEXT_VERSIONS.attachment.includes(a.consent_text_version)) {
      return { ok: false, error: 'attachment needs explicit consent' };
    }
    if (!Number.isInteger(a.size) || a.size <= 0 || a.size > LIMITS.attachmentBytes) {
      return { ok: false, error: 'attachment size out of range' };
    }
    attachment = { size: a.size, consentTextVersion: a.consent_text_version };
  }

  let contact = null;
  if (body.contact != null) {
    const c = body.contact;
    const consentContact = c.consent_contact === true;
    const consentFixed = c.consent_fixed === true;
    const email = typeof c.email === 'string' ? c.email.trim() : '';
    if (consentContact || consentFixed) {
      if (!EMAIL_RE.test(email) || email.length > 320) return { ok: false, error: 'invalid email' };
      if (!CONSENT_TEXT_VERSIONS.contact.includes(c.consent_text_version)) {
        return { ok: false, error: 'contact needs explicit consent' };
      }
      contact = { email, consentContact, consentFixed, consentTextVersion: c.consent_text_version };
    }
    // An address with neither box ticked has no purpose, so it is not kept.
  }

  return {
    ok: true,
    value: {
      source,
      product,
      area,
      tryingTo: text(body.trying_to, LIMITS.tryingTo),
      whatHappened,
      expected: text(body.expected, LIMITS.expected),
      docType,
      pageCount,
      contextIncluded,
      context: {
        appVersion,
        os: contextIncluded ? field(ctx.os) : null,
        osVersion: contextIncluded ? field(ctx.os_version) : null,
        arch: contextIncluded ? field(ctx.arch) : null,
        locale: contextIncluded ? field(ctx.locale) : null,
        errorCode: contextIncluded ? field(ctx.error_code) : null,
        errorAction: contextIncluded ? field(ctx.error_action) : null,
        sessionsNote: contextIncluded ? text(ctx.sessions_note, 512) : null,
      },
      attachment,
      contact,
      turnstileToken: typeof body.turnstile_token === 'string' ? body.turnstile_token : null,
    },
  };
}

function isoDay(ms) {
  return new Date(ms).toISOString().slice(0, 10);
}

/**
 * The issue for a stored report. Pure, and the only place an issue body is
 * written: everything that reaches GitHub passes through here and through the
 * containsPersonalData() check in openIssue().
 */
export function buildIssue(row) {
  const summarySource = row.trying_to || row.what_happened || '';
  const summary = scrub(summarySource).replace(/\s+/g, ' ').trim().slice(0, 70);
  const title = `[feedback] ${row.area}: ${summary || 'no summary'}`;
  const lines = [
    `fb:${row.id}`,
    '',
    `**Area:** ${row.area}`,
    `**Source:** ${row.source}`,
    `**Product:** ${row.product ?? 'editor'}`,
    `**App version:** ${row.app_version}`,
  ];
  if (row.context_included) {
    if (row.os) lines.push(`**System:** ${[row.os, row.os_version, row.arch].filter(Boolean).join(' ')}`);
    if (row.locale) lines.push(`**UI language:** ${row.locale}`);
    if (row.error_code) lines.push(`**Last error:** ${row.error_code}${row.error_action ? ` (during ${row.error_action})` : ''}`);
    if (row.sessions_note) lines.push(`**Sessions:** ${scrub(row.sessions_note)}`);
  } else {
    lines.push('**System details:** not shared by the reporter');
  }
  if (row.doc_type) lines.push(`**Document type:** ${row.doc_type}`);
  if (row.page_count != null) lines.push(`**Pages:** ${row.page_count}`);
  lines.push('', '### What were you trying to do?', scrub(row.trying_to) || '_not answered_');
  lines.push('', '### What happened?', scrub(row.what_happened));
  lines.push('', '### What did you expect?', scrub(row.expected) || '_not answered_');
  lines.push('');
  if (row.attachment_declared) {
    lines.push(
      `**Document:** shared with consent, held in private storage, not attached here; deleted by ${row.attachment_expires_at.slice(0, 10)} at the latest.`,
    );
  } else {
    lines.push('**Document:** not shared');
  }
  lines.push(`**Follow-up:** ${row.has_contact ? 'the reporter agreed to be contacted (address held outside GitHub)' : 'none requested'}`);
  lines.push('', '_Opened by the feedback Worker. Close with label `fixed-in:<version>` to tell the reporter in the next update feed._');
  return {
    title,
    body: lines.join('\n'),
    labels: ['feedback', row.product ?? 'editor', AREAS[row.area] ?? 'ui'],
  };
}

class PersonalDataRefusal extends Error {
  constructor() {
    super('issue body failed the personal-data check');
    this.name = 'PersonalDataRefusal';
  }
}

async function openIssue(env, row, fetchImpl) {
  const issue = buildIssue(row);
  if (containsPersonalData(issue.title) || containsPersonalData(issue.body)) {
    // Should be impossible after scrub(); refusing is the safe failure.
    throw new PersonalDataRefusal();
  }
  return createIssue(env, issue, fetchImpl);
}

async function rateLimitKey(request, env, nowMs) {
  // The address is hashed with a secret salt that changes every day and is
  // never stored, so the counter cannot be turned back into an address.
  const ip = request.headers.get('CF-Connecting-IP') ?? 'unknown';
  const salt = `${env.RATE_SALT ?? 'local-dev'}:${isoDay(nowMs)}`;
  return `fb:${isoDay(nowMs)}:${await sha256Hex(`${salt}:${ip}`)}`;
}

async function withinFeedbackRateLimit(request, env, nowMs) {
  if (!env.RATE_LIMIT) return true;
  const key = await rateLimitKey(request, env, nowMs);
  const current = parseInt((await env.RATE_LIMIT.get(key)) ?? '0', 10);
  if (current >= LIMITS.perHashPerDay) return false;
  await env.RATE_LIMIT.put(key, String(current + 1), { expirationTtl: 2 * 24 * 3600 });
  return true;
}

async function verifyTurnstile(env, token, fetchImpl) {
  if (!env.TURNSTILE_SECRET) return false;
  if (!token) return false;
  const res = await fetchImpl('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ secret: env.TURNSTILE_SECRET, response: token }),
  });
  if (!res.ok) return false;
  const data = await res.json();
  return data?.success === true;
}

async function siteForwardAllowed(request, env) {
  if (!env.SITE_FORWARD_SECRET) return false;
  const given = request.headers.get('X-Site-Forward-Token') ?? '';
  return sameHex(await sha256Hex(given), await sha256Hex(env.SITE_FORWARD_SECRET));
}

function rowFromValue(id, v, nowMs, deleteTokenHash, uploadTokenHash) {
  const created = new Date(nowMs).toISOString();
  return {
    id,
    created_at: created,
    source: v.source,
    product: v.product,
    area: v.area,
    trying_to: v.tryingTo,
    what_happened: v.whatHappened,
    expected: v.expected,
    doc_type: v.docType,
    page_count: v.pageCount,
    context_included: v.contextIncluded ? 1 : 0,
    app_version: v.context.appVersion,
    os: v.context.os,
    os_version: v.context.osVersion,
    arch: v.context.arch,
    locale: v.context.locale,
    error_code: v.context.errorCode,
    error_action: v.context.errorAction,
    sessions_note: v.context.sessionsNote,
    attachment_declared: v.attachment ? 1 : 0,
    attachment_size: v.attachment ? v.attachment.size : null,
    attachment_consent_at: v.attachment ? created : null,
    attachment_consent_version: v.attachment ? v.attachment.consentTextVersion : null,
    attachment_key: null,
    attachment_expires_at: v.attachment
      ? new Date(nowMs + RETENTION.attachmentMaxDays * 86_400_000).toISOString()
      : null,
    upload_token_hash: uploadTokenHash,
    delete_token_hash: deleteTokenHash,
    has_contact: v.contact ? 1 : 0,
    issue_number: null,
    issue_state: 'pending',
    issue_attempts: 0,
    issue_closed_at: null,
  };
}

const FEEDBACK_COLUMNS = [
  'id', 'created_at', 'source', 'product', 'area', 'trying_to', 'what_happened', 'expected', 'doc_type',
  'page_count', 'context_included', 'app_version', 'os', 'os_version', 'arch', 'locale',
  'error_code', 'error_action', 'sessions_note', 'attachment_declared', 'attachment_size',
  'attachment_consent_at', 'attachment_consent_version', 'attachment_key', 'attachment_expires_at',
  'upload_token_hash', 'delete_token_hash', 'has_contact', 'issue_number', 'issue_state',
  'issue_attempts', 'issue_closed_at',
];

async function insertRow(env, row) {
  await env.DB.prepare(
    `INSERT INTO feedback (${FEEDBACK_COLUMNS.join(', ')}) VALUES (${FEEDBACK_COLUMNS.map(() => '?').join(', ')})`,
  )
    .bind(...FEEDBACK_COLUMNS.map((c) => row[c]))
    .run();
}

/**
 * The cause of a failed GitHub step, safe to log: the HTTP status and request
 * path for an API answer, otherwise only the error's class name. Never the
 * message of an unknown error (it could quote a request), never a token, key or
 * reporter text.
 */
export function failureCause(err) {
  if (err instanceof GitHubHttpError) return `HTTP ${err.status} on ${err.method} ${err.path}`;
  if (err instanceof PersonalDataRefusal) return 'refused: issue text failed the personal-data check';
  return `error ${err?.name ?? typeof err}`;
}

async function tryOpenIssue(env, row, fetchImpl) {
  if (!githubConfigured(env)) return;
  try {
    const number = await openIssue(env, row, fetchImpl);
    await env.DB.prepare(
      `UPDATE feedback SET issue_number = ?, issue_state = 'created', issue_attempts = issue_attempts + 1 WHERE id = ?`,
    )
      .bind(number, row.id)
      .run();
  } catch (err) {
    // Stored is what matters to the reporter; the cron retries the issue.
    console.warn(`feedback ${row.id}: issue not opened (attempt ${(row.issue_attempts ?? 0) + 1}): ${failureCause(err)}`);
    await env.DB.prepare(`UPDATE feedback SET issue_attempts = issue_attempts + 1 WHERE id = ?`)
      .bind(row.id)
      .run();
  }
}

/** POST /v1/feedback */
export async function handleFeedbackPost(request, env, ctx, deps = {}) {
  const fetchImpl = deps.fetch ?? fetch;
  const nowMs = deps.now ?? Date.now();
  let body;
  try {
    body = await request.json();
  } catch {
    return { status: 400, body: { error: 'invalid JSON' } };
  }
  const parsed = validateFeedback(body);
  if (!parsed.ok) return { status: 400, body: { error: parsed.error } };
  const v = parsed.value;

  // The website form can carry a Turnstile challenge; the app cannot (it has
  // to work without a browser session and mostly offline), so it is held to
  // the per-address daily limit instead.
  // The website's own Worker may forward a submission it already verified
  // with Turnstile (a token is single-use, so it cannot be checked twice);
  // it proves itself with a shared secret instead.
  if (v.source === 'site') {
    const forwarded = await siteForwardAllowed(request, env);
    if (!forwarded && !(await verifyTurnstile(env, v.turnstileToken, fetchImpl))) {
      return { status: 403, body: { error: 'verification failed' } };
    }
  }
  if (!(await withinFeedbackRateLimit(request, env, nowMs))) {
    return { status: 429, body: { error: 'rate limited' } };
  }

  const id = newFeedbackId(deps.randomBytes);
  const deleteToken = newToken(deps.randomBytes);
  const uploadToken = v.attachment ? newToken(deps.randomBytes) : null;
  const row = rowFromValue(
    id,
    v,
    nowMs,
    await sha256Hex(deleteToken),
    uploadToken ? await sha256Hex(uploadToken) : null,
  );
  await insertRow(env, row);

  if (v.contact) {
    await env.DB.prepare(
      `INSERT INTO contact (feedback_id, email, consent_contact, consent_fixed, consent_at, consent_text_version)
       VALUES (?, ?, ?, ?, ?, ?)`,
    )
      .bind(id, v.contact.email, v.contact.consentContact ? 1 : 0, v.contact.consentFixed ? 1 : 0, row.created_at, v.contact.consentTextVersion)
      .run();
  }

  const work = tryOpenIssue(env, row, fetchImpl);
  if (ctx?.waitUntil) ctx.waitUntil(work);
  else await work;

  return {
    status: 201,
    body: { id, delete_token: deleteToken, ...(uploadToken ? { upload_token: uploadToken } : {}) },
  };
}

async function loadRow(env, id) {
  return env.DB.prepare(`SELECT * FROM feedback WHERE id = ?`).bind(id).first();
}

/** PUT /v1/feedback/<id>/attachment */
export async function handleAttachmentPut(request, env, id) {
  if (!FEEDBACK_ID_RE.test(id)) return { status: 404, body: { error: 'not found' } };
  if (!env.ATTACHMENTS) return { status: 503, body: { error: 'attachments unavailable' } };
  const row = await loadRow(env, id);
  if (!row || !row.attachment_declared || !row.upload_token_hash) return { status: 404, body: { error: 'not found' } };
  const token = request.headers.get('X-Upload-Token') ?? '';
  if (!sameHex(await sha256Hex(token), row.upload_token_hash)) return { status: 403, body: { error: 'forbidden' } };
  const bytes = new Uint8Array(await request.arrayBuffer());
  if (bytes.byteLength === 0 || bytes.byteLength > LIMITS.attachmentBytes || bytes.byteLength !== row.attachment_size) {
    return { status: 400, body: { error: 'attachment size does not match the consent' } };
  }
  const key = `feedback/${id}`;
  await env.ATTACHMENTS.put(key, bytes, {
    httpMetadata: { contentType: 'application/octet-stream' },
    customMetadata: { expires_at: row.attachment_expires_at },
  });
  // One upload per consent: the token is spent.
  await env.DB.prepare(`UPDATE feedback SET attachment_key = ?, upload_token_hash = NULL WHERE id = ?`)
    .bind(key, id)
    .run();
  return { status: 204, body: null };
}

/** DELETE /v1/feedback/<id> — the reporter removes their report. */
export async function handleFeedbackDelete(request, env, id, deps = {}) {
  if (!FEEDBACK_ID_RE.test(id)) return { status: 404, body: { error: 'not found' } };
  const row = await loadRow(env, id);
  if (!row) return { status: 404, body: { error: 'not found' } };
  const token = request.headers.get('X-Delete-Token') ?? '';
  if (!sameHex(await sha256Hex(token), row.delete_token_hash)) return { status: 403, body: { error: 'forbidden' } };
  await eraseReport(env, row, deps.fetch ?? fetch);
  return { status: 204, body: null };
}

async function eraseReport(env, row, fetchImpl) {
  if (row.attachment_key && env.ATTACHMENTS) await env.ATTACHMENTS.delete(row.attachment_key);
  await env.DB.prepare(`DELETE FROM contact WHERE feedback_id = ?`).bind(row.id).run();
  await env.DB.prepare(`DELETE FROM feedback WHERE id = ?`).bind(row.id).run();
  if (row.issue_number != null && githubConfigured(env)) {
    try {
      // The title was built from the reporter's own words, so it goes with the body.
      await replaceIssueText(
        env,
        row.issue_number,
        {
          title: `Feedback ${row.id} (removed)`,
          body: `fb:${row.id}\n\n_Report removed at the reporter's request._`,
        },
        fetchImpl,
      );
    } catch (err) {
      // The stored report is gone either way; the issue text needs a hand.
      console.warn(`feedback ${row.id}: issue #${row.issue_number} not blanked: ${failureCause(err)}`);
    }
  }
}

/**
 * The scheduled pass. Every step is bounded so one run stays inside the
 * Worker's CPU budget; whatever is left waits for the next run.
 */
export async function syncFeedback(env, deps = {}) {
  const fetchImpl = deps.fetch ?? fetch;
  const nowMs = deps.now ?? Date.now();
  const nowIso = new Date(nowMs).toISOString();
  const result = { issuesOpened: 0, attachmentsExpired: 0, reportsExpired: 0, closedSeen: 0 };

  // 1. Issues that could not be opened at submit time.
  if (githubConfigured(env)) {
    const pending = await env.DB.prepare(
      `SELECT * FROM feedback WHERE issue_state = 'pending' AND issue_attempts < 10 ORDER BY created_at LIMIT 20`,
    ).all();
    for (const row of pending.results ?? []) {
      await tryOpenIssue(env, row, fetchImpl);
      const after = await loadRow(env, row.id);
      if (after?.issue_state === 'created') result.issuesOpened++;
    }

    // 2. A shared document lives 90 days past the close of its issue.
    const open = await env.DB.prepare(
      `SELECT id, issue_number, attachment_expires_at FROM feedback
       WHERE attachment_key IS NOT NULL AND issue_number IS NOT NULL AND issue_closed_at IS NULL
       ORDER BY created_at LIMIT 20`,
    ).all();
    for (const row of open.results ?? []) {
      try {
        const issue = await getIssue(env, row.issue_number, fetchImpl);
        if (issue.state === 'closed' && issue.closedAt) {
          const after90 = new Date(Date.parse(issue.closedAt) + RETENTION.attachmentAfterCloseDays * 86_400_000).toISOString();
          const expires = after90 < row.attachment_expires_at ? after90 : row.attachment_expires_at;
          await env.DB.prepare(`UPDATE feedback SET issue_closed_at = ?, attachment_expires_at = ? WHERE id = ?`)
            .bind(issue.closedAt, expires, row.id)
            .run();
          result.closedSeen++;
        }
      } catch {
        // Next run.
      }
    }
  }

  // 3. Expired documents.
  const expired = await env.DB.prepare(
    `SELECT id, attachment_key FROM feedback WHERE attachment_key IS NOT NULL AND attachment_expires_at <= ? LIMIT 100`,
  )
    .bind(nowIso)
    .all();
  for (const row of expired.results ?? []) {
    if (env.ATTACHMENTS) await env.ATTACHMENTS.delete(row.attachment_key);
    await env.DB.prepare(`UPDATE feedback SET attachment_key = NULL WHERE id = ?`).bind(row.id).run();
    result.attachmentsExpired++;
  }

  // 4. Reports past their retention, with their contact rows.
  const cutoff = new Date(nowMs - RETENTION.feedbackDays * 86_400_000).toISOString();
  const old = await env.DB.prepare(`SELECT * FROM feedback WHERE created_at <= ? LIMIT 100`).bind(cutoff).all();
  for (const row of old.results ?? []) {
    await eraseReport(env, row, fetchImpl);
    result.reportsExpired++;
  }
  return result;
}
