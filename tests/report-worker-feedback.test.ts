// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary. The PDFluent application is free to use,
// including for commercial purposes. Redistribution, or extraction or reuse
// of its components (including the embedded PDF engine), requires a licence.
// See https://pdfluent.com/license for terms.

// The feedback Worker, run against a real SQLite with the real schema.sql.
//
// D1 is SQLite; node:sqlite is SQLite. A hand-written fake that answers the
// queries this file happens to make would test the fake, so the adapter below
// does nothing but translate the D1 call shape (prepare/bind/run/first/all)
// onto a real database. R2 and KV are plain maps: they are key-value stores
// and a map is one. GitHub is a recorded fetch.

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createRequire } from 'node:module';
import { afterEach, describe, expect, it, vi } from 'vitest';

import worker from '../infra/report-worker/worker.js';
import {
  buildIssue,
  handleAttachmentPut,
  handleFeedbackDelete,
  handleFeedbackPost,
  syncFeedback,
  validateFeedback,
} from '../infra/report-worker/src/feedback.js';
import { createAppJwt } from '../infra/report-worker/src/github.js';
import { FEEDBACK_ID_RE, newFeedbackId } from '../infra/report-worker/src/ids.js';
import { containsPersonalData, scrub } from '../infra/report-worker/src/scrub.js';

// Loaded through require: Vite's resolver does not know `node:sqlite` as a
// builtin yet and would look for a package called "sqlite".
const { DatabaseSync } = createRequire(import.meta.url)('node:sqlite') as typeof import('node:sqlite');

const SCHEMA = readFileSync(resolve(__dirname, '../infra/report-worker/schema.sql'), 'utf8');

type Row = Record<string, unknown>;

function d1() {
  const db = new DatabaseSync(':memory:');
  db.exec(SCHEMA);
  const api = {
    raw: db,
    prepare(sql: string) {
      let params: unknown[] = [];
      const stmt = {
        bind(...p: unknown[]) {
          params = p.map((v) => (v === undefined ? null : v));
          return stmt;
        },
        async run() {
          db.prepare(sql).run(...(params as never[]));
          return { success: true };
        },
        async first() {
          return (db.prepare(sql).get(...(params as never[])) as Row | undefined) ?? null;
        },
        async all() {
          return { results: db.prepare(sql).all(...(params as never[])) as Row[] };
        },
      };
      return stmt;
    },
  };
  return api;
}

function kv() {
  const m = new Map<string, string>();
  return { map: m, async get(k: string) { return m.get(k) ?? null; }, async put(k: string, v: string) { m.set(k, v); } };
}

function r2() {
  const m = new Map<string, Uint8Array>();
  return {
    map: m,
    async put(k: string, v: Uint8Array) { m.set(k, v); },
    async delete(k: string) { m.delete(k); },
  };
}

async function pkcs8Pem(): Promise<string> {
  const pair = await crypto.subtle.generateKey(
    { name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' },
    true,
    ['sign', 'verify'],
  );
  const der = new Uint8Array(await crypto.subtle.exportKey('pkcs8', pair.privateKey));
  let bin = '';
  for (const b of der) bin += String.fromCharCode(b);
  return `-----BEGIN PRIVATE KEY-----\n${btoa(bin)}\n-----END PRIVATE KEY-----\n`;
}

interface Call { url: string; method: string; body: unknown }

function github(opts: { fail?: boolean; closedAt?: string } = {}) {
  const calls: Call[] = [];
  let next = 700;
  const fetchImpl = async (url: string, init: { method?: string; body?: unknown } = {}) => {
    const body = typeof init.body === 'string' ? JSON.parse(init.body) : init.body;
    calls.push({ url, method: init.method ?? 'GET', body });
    const ok = (data: unknown) => new Response(JSON.stringify(data), { status: 200 });
    if (url.endsWith('/access_tokens')) return ok({ token: 'inst-token' });
    if (opts.fail && url.endsWith('/issues')) return new Response('{}', { status: 502 });
    if (url.endsWith('/issues') && init.method === 'POST') return ok({ number: next++ });
    if (/\/issues\/\d+$/.test(url) && (init.method ?? 'GET') === 'GET') {
      return ok({ state: opts.closedAt ? 'closed' : 'open', closed_at: opts.closedAt ?? null });
    }
    if (/\/issues\/\d+$/.test(url) && init.method === 'PATCH') return ok({});
    return new Response('{}', { status: 404 });
  };
  return { calls, fetchImpl };
}

async function env(extra: Row = {}) {
  return {
    DB: d1(),
    RATE_LIMIT: kv(),
    ATTACHMENTS: r2(),
    GITHUB_APP_ID: '12345',
    GITHUB_APP_INSTALLATION_ID: '678',
    GITHUB_APP_PRIVATE_KEY: await pkcs8Pem(),
    GITHUB_REPO: 'example/tracker',
    RATE_SALT: 'salt',
    ...extra,
  };
}

const PERSONAL = {
  source: 'app',
  area: 'forms',
  trying_to: 'Fill the tax form C:\\Users\\anna\\Documents\\aangifte-2026.pdf for anna.devries@example.com',
  what_happened: 'It froze. Call me on +31 6 1234 5678, IBAN NL91ABNA0417164300, file loonstrook.pdf in /Users/anna/Desktop/x',
  expected: 'The field keeps my value',
  doc_type: 'form',
  page_count: 3,
  context: { app_version: '1.0.1', os: 'macOS', os_version: '15.1', arch: 'aarch64', locale: 'nl', error_code: 'open.corrupt', error_action: 'open' },
  attachment: { consent: true, consent_text_version: 'fb-attach-1', size: 4 },
  contact: { email: 'anna.devries@example.com', consent_contact: true, consent_fixed: true, consent_text_version: 'fb-contact-1' },
};

function req(body: unknown, headers: Record<string, string> = {}) {
  return new Request('https://report.pdfluent.com/v1/feedback', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'CF-Connecting-IP': '203.0.113.9', ...headers },
    body: JSON.stringify(body),
  });
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('report IDs', () => {
  it('are FB- plus eight Crockford characters and not sequential', () => {
    const ids = new Set(Array.from({ length: 200 }, () => newFeedbackId()));
    expect(ids.size).toBe(200);
    for (const id of ids) expect(id).toMatch(FEEDBACK_ID_RE);
  });
});

describe('scrub', () => {
  it('removes addresses, paths, file names, IBANs and phone numbers', () => {
    const out = scrub(`${PERSONAL.trying_to} ${PERSONAL.what_happened}`);
    expect(out).not.toContain('anna');
    expect(out).not.toContain('loonstrook');
    expect(out).not.toContain('NL91');
    expect(out).not.toContain('1234 5678');
    expect(containsPersonalData(out)).toBe(false);
  });

  it('keeps an ISO date and a version number', () => {
    expect(scrub('since 2026-10-18 on 1.0.1')).toBe('since 2026-10-18 on 1.0.1');
  });
});

describe('validateFeedback', () => {
  it('requires what happened, a known area and the app version', () => {
    expect(validateFeedback({ ...PERSONAL, what_happened: '  ' }).ok).toBe(false);
    expect(validateFeedback({ ...PERSONAL, area: 'nonsense' }).ok).toBe(false);
    expect(validateFeedback({ ...PERSONAL, context: {} }).ok).toBe(false);
  });

  it('refuses a document without the explicit consent and its text version', () => {
    expect(validateFeedback({ ...PERSONAL, attachment: { size: 4 } }).ok).toBe(false);
    expect(validateFeedback({ ...PERSONAL, attachment: { consent: true, consent_text_version: 'made-up', size: 4 } }).ok).toBe(false);
  });

  it('drops an e-mail address when neither follow-up box is ticked', () => {
    const r = validateFeedback({ ...PERSONAL, contact: { email: 'a@example.com', consent_contact: false, consent_fixed: false } });
    expect(r.ok && r.value.contact).toBe(null);
  });

  it('keeps only the app version when the reporter switched system details off', () => {
    const r = validateFeedback({ ...PERSONAL, context_included: false });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.context.appVersion).toBe('1.0.1');
      expect(r.value.context.os).toBe(null);
      expect(r.value.context.locale).toBe(null);
      expect(r.value.context.errorCode).toBe(null);
    }
  });
});

describe('POST /v1/feedback', () => {
  it('stores the report, keeps the address apart, and opens an issue with nothing personal in it', async () => {
    const e = await env();
    const gh = github();
    const res = await handleFeedbackPost(req(PERSONAL), e, undefined, { fetch: gh.fetchImpl });
    expect(res.status).toBe(201);
    const id = (res.body as { id: string }).id;
    expect(id).toMatch(FEEDBACK_ID_RE);
    expect((res.body as { delete_token: string }).delete_token).toMatch(/^[0-9a-f]{64}$/);
    expect((res.body as { upload_token: string }).upload_token).toMatch(/^[0-9a-f]{64}$/);

    const row = e.DB.raw.prepare('SELECT * FROM feedback WHERE id = ?').get(id) as Row;
    expect(row.issue_state).toBe('created');
    expect(row.issue_number).toBe(700);
    expect(JSON.stringify(row)).not.toContain('@example.com');
    const contact = e.DB.raw.prepare('SELECT * FROM contact WHERE feedback_id = ?').get(id) as Row;
    expect(contact.email).toBe('anna.devries@example.com');
    expect(contact.consent_fixed).toBe(1);
    expect(contact.consent_text_version).toBe('fb-contact-1');

    const issueCall = gh.calls.find((c) => c.url.endsWith('/repos/example/tracker/issues'));
    expect(issueCall).toBeDefined();
    const issue = issueCall?.body as { title: string; body: string; labels: string[] };
    const all = `${issue.title}\n${issue.body}`;
    expect(all).toContain(`fb:${id}`);
    for (const forbidden of ['anna', 'example.com', 'aangifte', 'loonstrook', '.pdf', 'NL91', '5678', 'Users']) {
      expect(all).not.toContain(forbidden);
    }
    expect(issue.labels).toEqual(['feedback', 'editor', 'forms']);
  });

  it('keeps the report when GitHub is down and opens the issue on the next scheduled run', async () => {
    const e = await env();
    const res = await handleFeedbackPost(req(PERSONAL), e, undefined, { fetch: github({ fail: true }).fetchImpl });
    expect(res.status).toBe(201);
    const id = (res.body as { id: string }).id;
    expect((e.DB.raw.prepare('SELECT issue_state FROM feedback WHERE id = ?').get(id) as Row).issue_state).toBe('pending');

    const sync = await syncFeedback(e, { fetch: github().fetchImpl });
    expect(sync.issuesOpened).toBe(1);
    expect((e.DB.raw.prepare('SELECT issue_state FROM feedback WHERE id = ?').get(id) as Row).issue_state).toBe('created');
  });

  it('logs why an issue could not be opened: status and path, nothing secret or personal', async () => {
    const e = await env();
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const res = await handleFeedbackPost(req(PERSONAL), e, undefined, { fetch: github({ fail: true }).fetchImpl });
    const id = (res.body as { id: string }).id;
    expect((e.DB.raw.prepare('SELECT issue_attempts FROM feedback WHERE id = ?').get(id) as Row).issue_attempts).toBe(1);

    const lines = warn.mock.calls.map((args) => args.map(String).join(' '));
    const line = lines.find((l) => l.includes(id));
    expect(line).toBeDefined();
    expect(line).toContain('HTTP 502');
    expect(line).toContain('POST /repos/example/tracker/issues');
    expect(line).toContain('attempt 1');
    for (const forbidden of ['inst-token', 'PRIVATE KEY', 'salt', 'froze', 'tax form', 'anna']) {
      expect(lines.join('\n')).not.toContain(forbidden);
    }
  });

  it('refuses a website submission without a valid Turnstile answer', async () => {
    const e = await env();
    const res = await handleFeedbackPost(req({ ...PERSONAL, source: 'site' }), e, undefined, { fetch: github().fetchImpl });
    expect(res.status).toBe(403);
  });

  it('accepts a website submission forwarded by the site Worker with the shared secret', async () => {
    const e = await env({ SITE_FORWARD_SECRET: 'site-secret' });
    const gh = github();
    const body = { ...PERSONAL, source: 'site', product: 'sdk', attachment: null };
    const wrong = await handleFeedbackPost(req(body, { 'X-Site-Forward-Token': 'guess' }), e, undefined, { fetch: gh.fetchImpl });
    expect(wrong.status).toBe(403);
    const ok = await handleFeedbackPost(req(body, { 'X-Site-Forward-Token': 'site-secret' }), e, undefined, { fetch: gh.fetchImpl });
    expect(ok.status).toBe(201);
    const issue = gh.calls.find((c) => c.url.endsWith('/issues'))?.body as { labels: string[] };
    expect(issue.labels).toEqual(['feedback', 'sdk', 'forms']);
  });

  it('refuses a product other than the editor from the app', async () => {
    const e = await env();
    const res = await handleFeedbackPost(req({ ...PERSONAL, product: 'sdk' }), e, undefined, { fetch: github().fetchImpl });
    expect(res.status).toBe(400);
  });

  it('rate-limits one address per day without storing the address', async () => {
    const e = await env();
    const gh = github();
    let last = 0;
    for (let i = 0; i < 21; i++) {
      last = (await handleFeedbackPost(req({ ...PERSONAL, attachment: null, contact: null }), e, undefined, { fetch: gh.fetchImpl })).status;
    }
    expect(last).toBe(429);
    for (const key of e.RATE_LIMIT.map.keys()) expect(key).not.toContain('203.0.113.9');
  });
});

describe('the shared document', () => {
  async function submitted() {
    const e = await env();
    const res = await handleFeedbackPost(req(PERSONAL), e, undefined, { fetch: github().fetchImpl, now: Date.parse('2026-10-18T10:00:00Z') });
    const body = res.body as { id: string; upload_token: string; delete_token: string };
    return { e, ...body };
  }

  function put(id: string, token: string, bytes: Uint8Array) {
    return new Request(`https://report.pdfluent.com/v1/feedback/${id}/attachment`, {
      method: 'PUT',
      headers: { 'X-Upload-Token': token },
      body: bytes,
    });
  }

  it('is accepted once, with the upload token, at the size that was consented to', async () => {
    const { e, id, upload_token } = await submitted();
    expect((await handleAttachmentPut(put(id, 'wrong'.padEnd(64, '0'), new Uint8Array(4)), e, id)).status).toBe(403);
    expect((await handleAttachmentPut(put(id, upload_token, new Uint8Array(5)), e, id)).status).toBe(400);
    expect((await handleAttachmentPut(put(id, upload_token, new Uint8Array([37, 80, 68, 70])), e, id)).status).toBe(204);
    expect(e.ATTACHMENTS.map.has(`feedback/${id}`)).toBe(true);
    // The token is spent.
    expect((await handleAttachmentPut(put(id, upload_token, new Uint8Array(4)), e, id)).status).toBe(404);
  });

  it('is gone 90 days after its issue closed', async () => {
    const { e, id, upload_token } = await submitted();
    await handleAttachmentPut(put(id, upload_token, new Uint8Array(4)), e, id);
    const closed = github({ closedAt: '2026-11-01T00:00:00Z' });

    await syncFeedback(e, { fetch: closed.fetchImpl, now: Date.parse('2027-01-29T00:00:00Z') });
    expect(e.ATTACHMENTS.map.has(`feedback/${id}`)).toBe(true);

    const after = await syncFeedback(e, { fetch: closed.fetchImpl, now: Date.parse('2027-01-31T00:00:00Z') });
    expect(after.attachmentsExpired).toBe(1);
    expect(e.ATTACHMENTS.map.has(`feedback/${id}`)).toBe(false);
  });

  it('is gone after 365 days even when its issue never closed', async () => {
    const { e, id, upload_token } = await submitted();
    await handleAttachmentPut(put(id, upload_token, new Uint8Array(4)), e, id);
    await syncFeedback(e, { fetch: github().fetchImpl, now: Date.parse('2027-10-19T10:00:01Z') });
    expect(e.ATTACHMENTS.map.has(`feedback/${id}`)).toBe(false);
  });
});

describe('the reporter erases their report', () => {
  it('needs the delete token and removes report, address, document and issue text', async () => {
    const e = await env();
    const gh = github();
    const res = await handleFeedbackPost(req(PERSONAL), e, undefined, { fetch: gh.fetchImpl });
    const { id, delete_token, upload_token } = res.body as { id: string; delete_token: string; upload_token: string };
    await handleAttachmentPut(
      new Request(`https://report.pdfluent.com/v1/feedback/${id}/attachment`, { method: 'PUT', headers: { 'X-Upload-Token': upload_token }, body: new Uint8Array(4) }),
      e,
      id,
    );
    const del = (token: string) =>
      new Request(`https://report.pdfluent.com/v1/feedback/${id}`, { method: 'DELETE', headers: { 'X-Delete-Token': token } });

    expect((await handleFeedbackDelete(del('0'.repeat(64)), e, id, { fetch: gh.fetchImpl })).status).toBe(403);
    expect((await handleFeedbackDelete(del(delete_token), e, id, { fetch: gh.fetchImpl })).status).toBe(204);
    expect(e.DB.raw.prepare('SELECT COUNT(*) AS n FROM feedback').get()).toEqual({ n: 0 });
    expect(e.DB.raw.prepare('SELECT COUNT(*) AS n FROM contact').get()).toEqual({ n: 0 });
    expect(e.ATTACHMENTS.map.size).toBe(0);
    const patch = gh.calls.find((c) => c.method === 'PATCH');
    expect((patch?.body as { body: string }).body).toContain('removed');
  });

  it('replaces the issue title as well as the body, leaving none of the reporter text', async () => {
    const e = await env();
    const gh = github();
    const res = await handleFeedbackPost(req(PERSONAL), e, undefined, { fetch: gh.fetchImpl });
    const { id, delete_token } = res.body as { id: string; delete_token: string };
    const opened = gh.calls.find((c) => c.method === 'POST' && c.url.endsWith('/issues'))?.body as { title: string };
    // The premise: the title was built from what the reporter wrote.
    expect(opened.title).toContain('tax form');

    const del = new Request(`https://report.pdfluent.com/v1/feedback/${id}`, { method: 'DELETE', headers: { 'X-Delete-Token': delete_token } });
    expect((await handleFeedbackDelete(del, e, id, { fetch: gh.fetchImpl })).status).toBe(204);
    const patch = gh.calls.find((c) => c.method === 'PATCH')?.body as { title?: string; body?: string };
    expect(patch.title).toBe(`Feedback ${id} (removed)`);
    expect(typeof patch.body).toBe('string');
    const reporterWords = ['Fill', 'tax form', 'froze', 'Call me', 'field keeps', 'my value', 'aangifte', 'loonstrook'];
    for (const part of [patch.title ?? '', patch.body ?? '']) {
      for (const word of reporterWords) expect(part).not.toContain(word);
    }
  });

  it('happens on its own after 12 months', async () => {
    const e = await env();
    await handleFeedbackPost(req(PERSONAL), e, undefined, { fetch: github().fetchImpl, now: Date.parse('2026-10-18T10:00:00Z') });
    const r = await syncFeedback(e, { fetch: github().fetchImpl, now: Date.parse('2027-10-18T10:00:00Z') });
    expect(r.reportsExpired).toBe(1);
    expect(e.DB.raw.prepare('SELECT COUNT(*) AS n FROM contact').get()).toEqual({ n: 0 });
  });
});

describe('buildIssue', () => {
  it('says the document exists without naming it, and that contact is held elsewhere', () => {
    const issue = buildIssue({
      id: 'FB-ABCDEFGH', area: 'sign', source: 'app', app_version: '1.0.1', context_included: 0,
      trying_to: null, what_happened: 'x', expected: null, doc_type: 'signed', page_count: 2,
      attachment_declared: 1, attachment_expires_at: '2027-10-18T00:00:00.000Z', has_contact: 1,
    });
    expect(issue.body).toContain('not attached here');
    expect(issue.body).toContain('not shared by the reporter');
    expect(issue.body).toContain('address held outside GitHub');
    expect(issue.labels).toContain('signing');
  });
});

describe('routing', () => {
  it('answers the app origin with CORS for the feedback methods', async () => {
    const res = await worker.fetch(
      new Request('https://report.pdfluent.com/v1/feedback', { method: 'OPTIONS', headers: { Origin: 'tauri://localhost' } }),
      {},
      { waitUntil() {} },
    );
    expect(res.status).toBe(204);
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe('tauri://localhost');
    expect(res.headers.get('Access-Control-Allow-Methods')).toContain('DELETE');
    expect(res.headers.get('Access-Control-Allow-Headers')).toContain('X-Upload-Token');
  });

  it('does not reflect a foreign origin', async () => {
    const res = await worker.fetch(
      new Request('https://report.pdfluent.com/v1/feedback', { method: 'OPTIONS', headers: { Origin: 'https://evil.example' } }),
      {},
      { waitUntil() {} },
    );
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe('null');
  });
});

describe('GitHub App JWT', () => {
  it('is RS256 with the app id as issuer and a short lifetime', async () => {
    const jwt = await createAppJwt('12345', await pkcs8Pem(), 1_000_000);
    const [h, p] = jwt.split('.');
    const dec = (s: string) => JSON.parse(Buffer.from(s.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8'));
    expect(dec(h ?? '')).toEqual({ alg: 'RS256', typ: 'JWT' });
    expect(dec(p ?? '')).toEqual({ iat: 999_940, exp: 1_000_540, iss: '12345' });
  });

  it('refuses a PKCS#1 key with the conversion step named', async () => {
    await expect(createAppJwt('1', '-----BEGIN RSA PRIVATE KEY-----\nAAAA\n-----END RSA PRIVATE KEY-----')).rejects.toThrow(/PKCS#8/);
  });
});
