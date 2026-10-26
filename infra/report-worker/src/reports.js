// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary. The PDFluent application is free to use,
// including for commercial purposes. Redistribution, or extraction or reuse
// of its components (including the embedded PDF engine), requires a licence.
// See https://pdfluent.com/license for terms.

// Crash reports (`reports` table): deletion by the sender, retention, and the
// sweep for R2 objects no row points at any more.
//
//   DELETE /v1/report/<uuid>   the sender removes their report (X-Delete-Token)
//   cron   syncReports()       expire reports older than RETENTION.reportDays
//   cron   sweepOrphanedAttachments()   delete R2 objects no row refers to
//
// The token works exactly like the feedback one: 32 random bytes handed to the
// sender once on submit, only its SHA-256 stored. Rows written before this
// existed have no hash; nobody can delete them early, and they expire like
// every other row.

import { sha256Hex, sameHex } from './ids.js';

/** Retention, in days. Mirrors the privacy statement; change both together. */
export const REPORT_RETENTION = Object.freeze({
  reportDays: 90,
});

/** Most rows one scheduled run removes per table, so a run stays inside the CPU budget. */
export const BATCH = 100;

/** Most R2 objects one scheduled run inspects for orphans. */
export const ORPHAN_PAGE = 100;

/** An object younger than this may still be between its R2 put and its D1 update. */
export const ORPHAN_GRACE_MS = 3_600_000;

const SWEEP_CURSOR_KEY = 'sweep:cursor';

export const REPORT_ID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/** DELETE /v1/report/<id> */
export async function handleReportDelete(request, env, id) {
  if (!REPORT_ID_RE.test(id)) return { status: 404, body: { error: 'not found' } };
  const row = await env.DB.prepare(`SELECT id, attachment_key, delete_token_hash FROM reports WHERE id = ?`)
    .bind(id)
    .first();
  if (!row) return { status: 404, body: { error: 'not found' } };
  const token = request.headers.get('X-Delete-Token') ?? '';
  if (!row.delete_token_hash || !sameHex(await sha256Hex(token), row.delete_token_hash)) {
    return { status: 403, body: { error: 'forbidden' } };
  }
  if (row.attachment_key && env.ATTACHMENTS) await env.ATTACHMENTS.delete(row.attachment_key);
  await env.DB.prepare(`DELETE FROM reports WHERE id = ?`).bind(id).run();
  return { status: 204, body: null };
}

/** The scheduled pass for crash reports: one bounded batch. */
export async function syncReports(env, deps = {}) {
  const nowMs = deps.now ?? Date.now();
  const cutoff = new Date(nowMs - REPORT_RETENTION.reportDays * 86_400_000).toISOString();
  const old = await env.DB.prepare(
    `SELECT id, attachment_key FROM reports WHERE created_at <= ? ORDER BY created_at LIMIT ?`,
  )
    .bind(cutoff, BATCH)
    .all();
  const rows = old.results ?? [];
  if (rows.length === 0) return { reportsExpired: 0 };
  // The objects go first: a row whose object is already gone is harmless, an
  // object whose row is gone is an orphan until the sweep finds it.
  if (env.ATTACHMENTS) {
    for (const row of rows) if (row.attachment_key) await env.ATTACHMENTS.delete(row.attachment_key);
  }
  await env.DB.prepare(`DELETE FROM reports WHERE id IN (${rows.map(() => '?').join(', ')})`)
    .bind(...rows.map((r) => r.id))
    .run();
  return { reportsExpired: rows.length };
}

async function isReferenced(env, key) {
  if (key.startsWith('feedback/')) {
    return (await env.DB.prepare(`SELECT 1 AS hit FROM feedback WHERE attachment_key = ? LIMIT 1`).bind(key).first()) != null;
  }
  if (key.startsWith('report/')) {
    return (await env.DB.prepare(`SELECT 1 AS hit FROM reports WHERE attachment_key = ? LIMIT 1`).bind(key).first()) != null;
  }
  // A prefix this Worker does not write: not its to delete.
  return true;
}

/**
 * Delete R2 objects that no D1 row names (an upload whose row update failed, a
 * row removed while its object delete failed). One page per run; the cursor
 * lives in KV so successive runs walk the whole bucket. Without KV every run
 * looks at the first page, which is still correct, only slower to converge.
 */
export async function sweepOrphanedAttachments(env, deps = {}) {
  const result = { orphansDeleted: 0 };
  if (!env.ATTACHMENTS?.list) return result;
  const nowMs = deps.now ?? Date.now();
  const cursor = env.RATE_LIMIT ? await env.RATE_LIMIT.get(SWEEP_CURSOR_KEY) : null;
  const page = await env.ATTACHMENTS.list({ limit: ORPHAN_PAGE, ...(cursor ? { cursor } : {}) });
  for (const object of page.objects ?? []) {
    const uploadedMs = object.uploaded instanceof Date ? object.uploaded.getTime() : Date.parse(object.uploaded);
    if (!Number.isFinite(uploadedMs) || nowMs - uploadedMs < ORPHAN_GRACE_MS) continue;
    if (await isReferenced(env, object.key)) continue;
    await env.ATTACHMENTS.delete(object.key);
    result.orphansDeleted++;
  }
  if (env.RATE_LIMIT) {
    if (page.truncated && page.cursor) {
      await env.RATE_LIMIT.put(SWEEP_CURSOR_KEY, page.cursor, { expirationTtl: 86_400 });
    } else if (cursor) {
      await env.RATE_LIMIT.delete(SWEEP_CURSOR_KEY);
    }
  }
  return result;
}
