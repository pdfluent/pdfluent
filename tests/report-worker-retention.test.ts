// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary. The PDFluent application is free to use,
// including for commercial purposes. Redistribution, or extraction or reuse
// of its components (including the embedded PDF engine), requires a licence.
// See https://pdfluent.com/license for terms.

// Retention and deletion in the report Worker, run against a real SQLite with
// the real schema.sql (same approach as report-worker-feedback.test.ts).
//
//   - crash reports expire after 90 days, feedback after 365, at the boundary;
//   - a crash report is deleted by its sender with the token returned on
//     submit, and by nobody else;
//   - R2 objects no row refers to are swept;
//   - the cron actually calls all of it.
//
// Each behaviour is a scenario that takes the Worker modules as a parameter.
// The first block runs every scenario against the real source. The second
// block copies the source, breaks one thing in the copy, and requires the
// scenarios that cover that thing to fail: a scenario that stays green on a
// broken Worker tests nothing (definition of done, rule 3).

import { cpSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterAll, afterEach, describe, expect, it, vi } from 'vitest';

const { DatabaseSync } = createRequire(import.meta.url)('node:sqlite') as typeof import('node:sqlite');

const WORKER_DIR = resolve(__dirname, '../infra/report-worker');
const SCHEMA = readFileSync(join(WORKER_DIR, 'schema.sql'), 'utf8');
const MIGRATION = readFileSync(join(WORKER_DIR, 'migrations/0001_reports_delete_token.sql'), 'utf8');

const DAY = 86_400_000;
const NOW = Date.parse('2027-01-20T12:00:00.000Z');

type Row = Record<string, unknown>;

// ── Fakes: D1 is SQLite, R2 and KV are maps ────────────────────────────────

function d1() {
  const db = new DatabaseSync(':memory:');
  db.exec(SCHEMA);
  return {
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
}

function kv() {
  const m = new Map<string, string>();
  return {
    map: m,
    async get(k: string) { return m.get(k) ?? null; },
    async put(k: string, v: string) { m.set(k, v); },
    async delete(k: string) { m.delete(k); },
  };
}

function r2() {
  const objects = new Map<string, { bytes: Uint8Array; uploaded: Date }>();
  return {
    objects,
    /** Put an object as if it had been uploaded `ageMs` before NOW. */
    seed(key: string, ageMs: number) {
      objects.set(key, { bytes: new Uint8Array([1]), uploaded: new Date(NOW - ageMs) });
    },
    async put(k: string, v: Uint8Array) { objects.set(k, { bytes: v, uploaded: new Date() }); },
    async delete(k: string) { objects.delete(k); },
    async list(opts: { prefix?: string; limit?: number; cursor?: string } = {}) {
      const after = opts.cursor ?? '';
      const keys = [...objects.keys()].filter((k) => k > after && k.startsWith(opts.prefix ?? '')).sort();
      const limit = opts.limit ?? 1000;
      const page = keys.slice(0, limit);
      const truncated = keys.length > limit;
      return {
        objects: page.map((key) => ({ key, uploaded: (objects.get(key) as { uploaded: Date }).uploaded })),
        truncated,
        cursor: truncated ? page[page.length - 1] : undefined,
      };
    },
  };
}

function makeEnv() {
  return { DB: d1(), RATE_LIMIT: kv(), ATTACHMENTS: r2(), RATE_SALT: 'salt' };
}
type Env = ReturnType<typeof makeEnv>;

// ── The Worker modules under test (real source, or a broken copy) ──────────

interface Mods {
  worker: {
    default: {
      fetch(request: Request, env: Env, ctx?: unknown): Promise<Response>;
      scheduled(event: unknown, env: Env, ctx: { waitUntil(p: Promise<unknown>): void }): Promise<void>;
    };
  };
  reports: {
    syncReports(env: Env, deps?: { now?: number }): Promise<{ reportsExpired: number }>;
    sweepOrphanedAttachments(env: Env, deps?: { now?: number }): Promise<{ orphansDeleted: number }>;
    REPORT_RETENTION: { reportDays: number };
  };
  feedback: {
    handleFeedbackPost(request: Request, env: Env, ctx: undefined, deps: { now: number }): Promise<{ status: number; body: { id: string } }>;
    handleAttachmentPut(request: Request, env: Env, id: string): Promise<{ status: number }>;
    syncFeedback(env: Env, deps: { now: number }): Promise<{ reportsExpired: number }>;
    RETENTION: { feedbackDays: number };
  };
}

async function loadMods(dir: string): Promise<Mods> {
  return {
    worker: await import(/* @vite-ignore */ join(dir, 'worker.js')),
    reports: await import(/* @vite-ignore */ join(dir, 'src/reports.js')),
    feedback: await import(/* @vite-ignore */ join(dir, 'src/feedback.js')),
  };
}

// ── Helpers ────────────────────────────────────────────────────────────────

function insertReport(env: Env, createdMs: number, extra: Row = {}): string {
  const id = (extra.id as string | undefined) ?? crypto.randomUUID();
  env.DB.raw
    .prepare(`INSERT INTO reports (id, created_at, type, app_version, os, attachment_key, delete_token_hash) VALUES (?, ?, 'crash', '1.1.0', 'macOS', ?, ?)`)
    .run(id, new Date(createdMs).toISOString(), (extra.attachment_key as string | null | undefined) ?? null, (extra.delete_token_hash as string | null | undefined) ?? null);
  return id;
}

function reportIds(env: Env): string[] {
  return (env.DB.raw.prepare('SELECT id FROM reports').all() as { id: string }[]).map((r) => r.id);
}

function postJson(url: string, body: unknown, headers: Record<string, string> = {}): Request {
  return new Request(url, { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: 'tauri://localhost', ...headers }, body: JSON.stringify(body) });
}

function del(path: string, token?: string): Request {
  return new Request(`https://report.pdfluent.com${path}`, {
    method: 'DELETE',
    headers: { Origin: 'tauri://localhost', ...(token === undefined ? {} : { 'X-Delete-Token': token }) },
  });
}

const CRASH = { type: 'crash', app_version: '1.1.0', os: 'macOS', os_version: '15.1', locale: 'en', message: 'boom', stack: 'at x', client_ts: '2027-01-20T12:00:00Z' };

async function submitCrash(m: Mods, env: Env): Promise<{ id: string; delete_token: string }> {
  const res = await m.worker.default.fetch(postJson('https://report.pdfluent.com/v1/report', CRASH), env);
  expect(res.status).toBe(202);
  return (await res.json()) as { id: string; delete_token: string };
}

const FEEDBACK = {
  source: 'app',
  area: 'forms',
  what_happened: 'it froze',
  context: { app_version: '1.1.0' },
  contact: { email: 'reporter@example.com', consent_contact: true, consent_fixed: false, consent_text_version: 'fb-contact-1' },
};

async function submitFeedback(m: Mods, env: Env, atMs: number, extra: Row = {}): Promise<string> {
  const res = await m.feedback.handleFeedbackPost(postJson('https://report.pdfluent.com/v1/feedback', { ...FEEDBACK, ...extra }), env, undefined, { now: atMs });
  expect(res.status).toBe(201);
  return res.body.id;
}

// ── Scenarios ──────────────────────────────────────────────────────────────

type Scenario = (m: Mods) => Promise<void>;

const scenarios: Record<string, Scenario> = {
  /** 89 and 90 days: the last day kept and the first day gone. */
  async crashExpiresAtNinetyDays(m) {
    const env = makeEnv();
    const at89 = insertReport(env, NOW - 89 * DAY);
    const justUnder90 = insertReport(env, NOW - 90 * DAY + 1000);
    const at90 = insertReport(env, NOW - 90 * DAY);
    const at91 = insertReport(env, NOW - 91 * DAY);
    const result = await m.reports.syncReports(env, { now: NOW });
    expect(result.reportsExpired).toBe(2);
    expect(reportIds(env).sort()).toEqual([at89, justUnder90].sort());
    expect(reportIds(env)).not.toContain(at90);
    expect(reportIds(env)).not.toContain(at91);
  },

  /** 364 and 365 days, with the contact row following its report. */
  async feedbackExpiresAtThreeHundredSixtyFiveDays(m) {
    const env = makeEnv();
    const at364 = await submitFeedback(m, env, NOW - 364 * DAY);
    const justUnder365 = await submitFeedback(m, env, NOW - 365 * DAY + 1000);
    const at365 = await submitFeedback(m, env, NOW - 365 * DAY);
    const result = await m.feedback.syncFeedback(env, { now: NOW });
    expect(result.reportsExpired).toBe(1);
    const left = (env.DB.raw.prepare('SELECT id FROM feedback').all() as { id: string }[]).map((r) => r.id).sort();
    expect(left).toEqual([at364, justUnder365].sort());
    expect(left).not.toContain(at365);
    const contacts = (env.DB.raw.prepare('SELECT feedback_id FROM contact').all() as { feedback_id: string }[]).map((r) => r.feedback_id).sort();
    expect(contacts).toEqual([at364, justUnder365].sort());
  },

  /** One run removes at most a batch; the rest waits for the next run. */
  async expiryIsBounded(m) {
    const env = makeEnv();
    for (let i = 0; i < 150; i++) insertReport(env, NOW - 100 * DAY - i * 1000);
    expect((await m.reports.syncReports(env, { now: NOW })).reportsExpired).toBe(100);
    expect(reportIds(env)).toHaveLength(50);
    expect((await m.reports.syncReports(env, { now: NOW })).reportsExpired).toBe(50);
    expect(reportIds(env)).toHaveLength(0);
  },

  /** An expiring report takes its attachment with it. */
  async expiryRemovesAttachments(m) {
    const env = makeEnv();
    const key = 'report/gone';
    env.ATTACHMENTS.seed(key, 100 * DAY);
    insertReport(env, NOW - 100 * DAY, { attachment_key: key });
    env.ATTACHMENTS.seed('report/kept', 10 * DAY);
    insertReport(env, NOW - 10 * DAY, { attachment_key: 'report/kept' });
    await m.reports.syncReports(env, { now: NOW });
    expect([...env.ATTACHMENTS.objects.keys()]).toEqual(['report/kept']);
  },

  /** The submit answer carries a token, and only its hash is stored. */
  async submitReturnsADeleteTokenAndStoresOnlyItsHash(m) {
    const env = makeEnv();
    const { id, delete_token: token } = await submitCrash(m, env);
    expect(id).toMatch(/^[0-9a-f-]{36}$/);
    expect(token).toMatch(/^[0-9a-f]{64}$/);
    const row = env.DB.raw.prepare('SELECT * FROM reports WHERE id = ?').get(id) as Row;
    const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token)));
    expect(row.delete_token_hash).toBe([...digest].map((b) => b.toString(16).padStart(2, '0')).join(''));
    expect(JSON.stringify(row)).not.toContain(token);
  },

  /** The right token removes the row and the attachment, once. */
  async deleteWithValidToken(m) {
    const env = makeEnv();
    const mine = await submitCrash(m, env);
    const other = await submitCrash(m, env);
    env.ATTACHMENTS.seed('report/mine', DAY);
    env.DB.raw.prepare('UPDATE reports SET attachment_key = ? WHERE id = ?').run('report/mine', mine.id);
    const res = await m.worker.default.fetch(del(`/v1/report/${mine.id}`, mine.delete_token), env);
    expect(res.status).toBe(204);
    expect(reportIds(env)).toEqual([other.id]);
    expect(env.ATTACHMENTS.objects.has('report/mine')).toBe(false);
    const again = await m.worker.default.fetch(del(`/v1/report/${mine.id}`, mine.delete_token), env);
    expect(again.status).toBe(404);
  },

  /** A wrong, missing, or someone else's token removes nothing. */
  async deleteWithWrongToken(m) {
    const env = makeEnv();
    const mine = await submitCrash(m, env);
    const other = await submitCrash(m, env);
    env.ATTACHMENTS.seed('report/mine', DAY);
    env.DB.raw.prepare('UPDATE reports SET attachment_key = ? WHERE id = ?').run('report/mine', mine.id);
    for (const token of ['0'.repeat(64), 'nope', '', other.delete_token, undefined]) {
      const res = await m.worker.default.fetch(del(`/v1/report/${mine.id}`, token), env);
      expect(res.status).toBe(403);
    }
    expect(reportIds(env).sort()).toEqual([mine.id, other.id].sort());
    expect(env.ATTACHMENTS.objects.has('report/mine')).toBe(true);
  },

  /** A row from before tokens existed cannot be deleted early, not even with an empty token. */
  async deleteRefusesRowsWithoutAToken(m) {
    const env = makeEnv();
    const legacy = insertReport(env, NOW - DAY);
    for (const token of ['', 'x', undefined]) {
      expect((await m.worker.default.fetch(del(`/v1/report/${legacy}`, token), env)).status).toBe(403);
    }
    expect(reportIds(env)).toEqual([legacy]);
  },

  /** Unknown and malformed IDs are 404, and reach no query result. */
  async deleteUnknownOrMalformedId(m) {
    const env = makeEnv();
    const { delete_token: token } = await submitCrash(m, env);
    for (const id of [crypto.randomUUID(), 'not-a-uuid', '1%3B--', 'FB-ABCDEFGH']) {
      expect((await m.worker.default.fetch(del(`/v1/report/${id}`, token), env)).status).toBe(404);
    }
    expect(reportIds(env)).toHaveLength(1);
  },

  /** Objects no row names are deleted; referenced, young and foreign ones stay. */
  async orphansAreSweptAndOnlyOrphans(m) {
    const env = makeEnv();
    const kept = await submitFeedback(m, env, NOW - 2 * DAY, { attachment: { consent: true, consent_text_version: 'fb-attach-1', size: 3 } });
    const crashKey = `report/${crypto.randomUUID()}`;
    insertReport(env, NOW - DAY, { attachment_key: crashKey });
    env.DB.raw.prepare('UPDATE feedback SET attachment_key = ? WHERE id = ?').run(`feedback/${kept}`, kept);
    env.ATTACHMENTS.seed(`feedback/${kept}`, 2 * DAY);
    env.ATTACHMENTS.seed(crashKey, DAY);
    env.ATTACHMENTS.seed('feedback/FB-ORPHAN01', 2 * 3_600_000);
    env.ATTACHMENTS.seed('report/orphan-old', 2 * 3_600_000);
    env.ATTACHMENTS.seed('feedback/FB-YOUNG001', 10 * 60_000);
    env.ATTACHMENTS.seed('other/not-ours', 30 * DAY);
    const result = await m.reports.sweepOrphanedAttachments(env, { now: NOW });
    expect(result.orphansDeleted).toBe(2);
    expect([...env.ATTACHMENTS.objects.keys()].sort()).toEqual(
      [`feedback/${kept}`, crashKey, 'feedback/FB-YOUNG001', 'other/not-ours'].sort(),
    );
  },

  /** Runs continue where the last one stopped, so referenced objects at the head cannot hide orphans behind them. */
  async orphanSweepWalksTheWholeBucket(m) {
    const env = makeEnv();
    for (let i = 0; i < 100; i++) {
      const key = `report/a-${String(i).padStart(3, '0')}`;
      env.ATTACHMENTS.seed(key, DAY);
      insertReport(env, NOW - DAY, { attachment_key: key });
    }
    for (let i = 0; i < 50; i++) env.ATTACHMENTS.seed(`report/z-${String(i).padStart(3, '0')}`, DAY);
    expect((await m.reports.sweepOrphanedAttachments(env, { now: NOW })).orphansDeleted).toBe(0);
    expect((await m.reports.sweepOrphanedAttachments(env, { now: NOW })).orphansDeleted).toBe(50);
    expect(env.ATTACHMENTS.objects.size).toBe(100);
  },

  /** The scheduled handler is what calls all of it. */
  async cronExpiresReportsFeedbackAndOrphans(m) {
    const env = makeEnv();
    const real = Date.now();
    const oldCrash = insertReport(env, real - 91 * DAY);
    const freshCrash = insertReport(env, real - 89 * DAY);
    const oldFeedback = await submitFeedback(m, env, real - 366 * DAY);
    const freshFeedback = await submitFeedback(m, env, real - 364 * DAY);
    env.ATTACHMENTS.seed('feedback/FB-ORPHAN01', 2 * 3_600_000);
    // seed() ages from NOW (a fixed date); make this one old against the real clock too.
    env.ATTACHMENTS.objects.set('feedback/FB-ORPHAN01', { bytes: new Uint8Array([1]), uploaded: new Date(real - 2 * 3_600_000) });
    let pending: Promise<unknown> = Promise.resolve();
    await m.worker.default.scheduled({}, env, { waitUntil: (p) => { pending = p; } });
    await pending;
    expect(reportIds(env)).toEqual([freshCrash]);
    expect(reportIds(env)).not.toContain(oldCrash);
    expect((env.DB.raw.prepare('SELECT id FROM feedback').all() as { id: string }[]).map((r) => r.id)).toEqual([freshFeedback]);
    expect(oldFeedback).not.toBe(freshFeedback);
    expect(env.ATTACHMENTS.objects.has('feedback/FB-ORPHAN01')).toBe(false);
  },

  /** A failing step is logged by class name and does not stop the others. */
  async cronStepsFailIndependently(m) {
    const env = makeEnv();
    const old = insertReport(env, Date.now() - 91 * DAY);
    env.ATTACHMENTS.list = async () => { throw new TypeError('secret-bucket-detail'); };
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    let pending: Promise<unknown> = Promise.resolve();
    await m.worker.default.scheduled({}, env, { waitUntil: (p) => { pending = p; } });
    await pending;
    expect(reportIds(env)).not.toContain(old);
    const logged = warn.mock.calls.map((c) => String(c[0])).join('\n');
    expect(logged).toContain('scheduled orphans failed: error TypeError');
    expect(logged).not.toContain('secret-bucket-detail');
  },
};

// ── 1. The real Worker ─────────────────────────────────────────────────────

afterEach(() => vi.restoreAllMocks());

describe('report Worker retention and deletion (real source)', () => {
  it('states the periods the privacy statement states', async () => {
    const m = await loadMods(WORKER_DIR);
    expect(m.reports.REPORT_RETENTION.reportDays).toBe(90);
    expect(m.feedback.RETENTION.feedbackDays).toBe(365);
  });

  for (const [name, scenario] of Object.entries(scenarios)) {
    it(name, async () => {
      await scenario(await loadMods(WORKER_DIR));
    });
  }
});

describe('the database schema', () => {
  function columns(db: InstanceType<typeof DatabaseSync>): string[] {
    return (db.prepare(`PRAGMA table_info(reports)`).all() as { name: string }[]).map((c) => c.name).sort();
  }

  it('is what the migration produces from the schema before it', () => {
    const before = SCHEMA.replace(/\n\s*delete_token_hash TEXT[^\n]*/, '').replace("DEFAULT 'new',", "DEFAULT 'new' ");
    expect(before).not.toBe(SCHEMA);
    const old = new DatabaseSync(':memory:');
    old.exec(before);
    expect(columns(old)).not.toContain('delete_token_hash');
    old.exec(MIGRATION);
    const fresh = new DatabaseSync(':memory:');
    fresh.exec(SCHEMA);
    expect(columns(old)).toEqual(columns(fresh));
  });
});

// ── 2. The same scenarios against deliberately broken copies ───────────────

interface Mutant {
  name: string;
  file: string;
  from: string;
  to: string;
  /** Scenarios that must notice. */
  caughtBy: string[];
}

const MUTANTS: Mutant[] = [
  { name: 'crash retention one day too long', file: 'src/reports.js', from: 'reportDays: 90', to: 'reportDays: 91', caughtBy: ['crashExpiresAtNinetyDays'] },
  { name: 'crash retention one day too short', file: 'src/reports.js', from: 'reportDays: 90', to: 'reportDays: 89', caughtBy: ['crashExpiresAtNinetyDays'] },
  { name: 'crash expiry excludes the boundary', file: 'src/reports.js', from: 'created_at <= ?', to: 'created_at < ?', caughtBy: ['crashExpiresAtNinetyDays'] },
  { name: 'expiry has no batch bound', file: 'src/reports.js', from: 'export const BATCH = 100;', to: 'export const BATCH = 100000;', caughtBy: ['expiryIsBounded'] },
  { name: 'expiry leaves attachments behind', file: 'src/reports.js', from: 'for (const row of rows) if (row.attachment_key) await env.ATTACHMENTS.delete(row.attachment_key);', to: 'void rows;', caughtBy: ['expiryRemovesAttachments'] },
  { name: 'feedback retention one day too long', file: 'src/feedback.js', from: 'feedbackDays: 365', to: 'feedbackDays: 366', caughtBy: ['feedbackExpiresAtThreeHundredSixtyFiveDays'] },
  { name: 'feedback retention back at 730 days', file: 'src/feedback.js', from: 'feedbackDays: 365', to: 'feedbackDays: 730', caughtBy: ['feedbackExpiresAtThreeHundredSixtyFiveDays'] },
  { name: 'submit returns no token', file: 'worker.js', from: 'return json({ id, delete_token: deleteToken }, 202, origin);', to: 'return json({ id }, 202, origin);', caughtBy: ['submitReturnsADeleteTokenAndStoresOnlyItsHash', 'deleteWithValidToken'] },
  { name: 'submit stores the token itself', file: 'worker.js', from: 'await sha256Hex(deleteToken),', to: 'deleteToken,', caughtBy: ['submitReturnsADeleteTokenAndStoresOnlyItsHash', 'deleteWithValidToken'] },
  { name: 'delete route is not wired', file: 'worker.js', from: "if (reportItem && request.method === 'DELETE') {", to: "if (reportItem && request.method === 'PATCH') {", caughtBy: ['deleteWithValidToken'] },
  { name: 'delete accepts any token', file: 'src/reports.js', from: '!row.delete_token_hash || !sameHex(await sha256Hex(token), row.delete_token_hash)', to: 'false', caughtBy: ['deleteWithWrongToken', 'deleteRefusesRowsWithoutAToken'] },
  { name: 'delete leaves the attachment', file: 'src/reports.js', from: 'if (row.attachment_key && env.ATTACHMENTS) await env.ATTACHMENTS.delete(row.attachment_key);\n  await env.DB.prepare(`DELETE FROM reports WHERE id = ?`)', to: 'await env.DB.prepare(`DELETE FROM reports WHERE id = ?`)', caughtBy: ['deleteWithValidToken'] },
  { name: 'delete answers 403 for an unknown report', file: 'src/reports.js', from: "if (!row) return { status: 404, body: { error: 'not found' } };", to: "if (!row) return { status: 403, body: { error: 'forbidden' } };", caughtBy: ['deleteUnknownOrMalformedId', 'deleteWithValidToken'] },
  { name: 'sweep deletes every object', file: 'src/reports.js', from: 'if (await isReferenced(env, object.key)) continue;', to: '', caughtBy: ['orphansAreSweptAndOnlyOrphans', 'orphanSweepWalksTheWholeBucket'] },
  { name: 'sweep deletes nothing', file: 'src/reports.js', from: 'await env.ATTACHMENTS.delete(object.key);\n    result.orphansDeleted++;', to: 'result.orphansDeleted++;', caughtBy: ['orphansAreSweptAndOnlyOrphans', 'cronExpiresReportsFeedbackAndOrphans'] },
  { name: 'sweep ignores the upload grace', file: 'src/reports.js', from: 'nowMs - uploadedMs < ORPHAN_GRACE_MS', to: 'false', caughtBy: ['orphansAreSweptAndOnlyOrphans'] },
  { name: 'sweep forgets where it stopped', file: 'src/reports.js', from: 'await env.RATE_LIMIT.put(SWEEP_CURSOR_KEY, page.cursor, { expirationTtl: 86_400 });', to: '', caughtBy: ['orphanSweepWalksTheWholeBucket'] },
  { name: 'cron does not expire crash reports', file: 'worker.js', from: "['reports', () => syncReports(env, deps)],", to: '', caughtBy: ['cronExpiresReportsFeedbackAndOrphans', 'cronStepsFailIndependently'] },
  { name: 'cron does not sweep orphans', file: 'worker.js', from: "['orphans', () => sweepOrphanedAttachments(env, deps)],", to: '', caughtBy: ['cronExpiresReportsFeedbackAndOrphans'] },
  { name: 'cron does not expire feedback', file: 'worker.js', from: "['feedback', () => syncFeedback(env, deps)],", to: '', caughtBy: ['cronExpiresReportsFeedbackAndOrphans'] },
  { name: 'one failing step stops the others', file: 'worker.js', from: 'Promise.allSettled(steps.map(([, run]) => run()))', to: 'Promise.all(steps.map(([, run]) => run())).then((v) => v.map((value) => ({ status: \'fulfilled\', value })))', caughtBy: ['cronStepsFailIndependently'] },
];

describe('the scenarios fail when the Worker is broken', () => {
  const copies: string[] = [];
  afterAll(() => {
    for (const dir of copies) rmSync(dir, { recursive: true, force: true });
  });

  async function broken(m: Mutant): Promise<Mods> {
    const dir = mkdtempSync(join(tmpdir(), 'report-worker-mutant-'));
    copies.push(dir);
    cpSync(join(WORKER_DIR, 'worker.js'), join(dir, 'worker.js'));
    cpSync(join(WORKER_DIR, 'src'), join(dir, 'src'), { recursive: true });
    const target = join(dir, m.file);
    const source = readFileSync(target, 'utf8');
    expect(source.split(m.from).length - 1, `"${m.from}" must occur exactly once in ${m.file}`).toBe(1);
    writeFileSync(target, source.replace(m.from, () => m.to));
    expect(readdirSync(dir)).toContain('worker.js');
    return loadMods(dir);
  }

  it('every scenario is claimed by at least one mutant', () => {
    const claimed = new Set(MUTANTS.flatMap((m) => m.caughtBy));
    for (const name of Object.keys(scenarios)) expect(claimed, `no mutant is caught by "${name}"`).toContain(name);
    for (const name of claimed) expect(Object.keys(scenarios)).toContain(name);
  });

  for (const mutant of MUTANTS) {
    it(`${mutant.name}`, async () => {
      const mods = await broken(mutant);
      for (const name of mutant.caughtBy) {
        const scenario = scenarios[name] as Scenario;
        await expect(scenario(mods), `scenario "${name}" stayed green on: ${mutant.name}`).rejects.toThrow();
      }
    });
  }
});
