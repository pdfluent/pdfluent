// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary. The PDFluent application is free to use,
// including for commercial purposes. Redistribution, or extraction or reuse
// of its components (including the embedded PDF engine), requires a licence.
// See https://pdfluent.com/license for terms.

// ---------------------------------------------------------------------------
// PDFluent report Worker: crash reports and "Help us improve PDFluent".
//
//   POST   /v1/report                    crash report (opt-in consent in the app)
//          → 202 { "id": "<uuid>", "delete_token" } | 400 | 429
//   DELETE /v1/report/<id>               the sender removes their crash report (X-Delete-Token)
//          → 204 | 403 | 404
//   POST   /v1/feedback                  feedback report (sent only when the user presses Send)
//          → 201 { "id": "FB-…", "delete_token", "upload_token"? } | 400 | 403 | 429
//   PUT    /v1/feedback/<id>/attachment  the document the reporter agreed to share
//   DELETE /v1/feedback/<id>             the reporter removes their report
//   cron                                 open missing issues, expire documents and old rows
//                                        (crash reports after 90 days, feedback after 365),
//                                        delete R2 objects no row refers to
//
// Crash reports carry no personal data and are written as one D1 row; src/reports.js
// holds their deletion and retention. The feedback flow is in src/feedback.js; its own header says what is stored
// where and why the GitHub issue never carries anything personal.
//
// Bindings (wrangler.toml):
//   DB           D1 database (tables `reports`, `feedback`, `contact`; schema.sql)
//   RATE_LIMIT   KV namespace (ephemeral counters; feedback keys are a salted daily hash, no IP stored)
//   ATTACHMENTS  R2 bucket (shared documents, keyed by report ID, lifecycle-expired)
// ---------------------------------------------------------------------------

// Field length caps (plan §5).
const MAX_MESSAGE = 8 * 1024; // 8 KB
const MAX_STACK = 32 * 1024; // 32 KB
const MAX_FIELD = 256; // version / os / locale etc.

// Coarse global rate limit: total accepted reports per fixed 60s window.
// Deliberately IP-free — a blunt instrument against floods, not per-user.
const RATE_WINDOW_SECONDS = 60;
const RATE_MAX_PER_WINDOW = 600;

const ALLOWED_TYPES = new Set(['crash', 'bug', 'feedback']);

// Tauri webview + dev origins. The desktop app posts from these.
const ALLOWED_ORIGINS = new Set([
  'tauri://localhost',
  'https://tauri.localhost',
  'http://tauri.localhost',
  'http://localhost:1420',
  'http://127.0.0.1:1420',
  // The website feedback form posts the same report shape (source: 'site').
  'https://pdfluent.com',
  'https://www.pdfluent.com',
]);

import { scrub } from './src/scrub.js';
import {
  handleAttachmentPut,
  handleFeedbackDelete,
  handleFeedbackPost,
  syncFeedback,
} from './src/feedback.js';
import { handleReportDelete, sweepOrphanedAttachments, syncReports } from './src/reports.js';
import { newToken, sha256Hex } from './src/ids.js';

function corsHeaders(origin) {
  const allow = ALLOWED_ORIGINS.has(origin) ? origin : 'null';
  return {
    'Access-Control-Allow-Origin': allow,
    'Access-Control-Allow-Methods': 'POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, X-Upload-Token, X-Delete-Token',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  };
}

function json(body, status, origin) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...corsHeaders(origin) },
  });
}

function clampField(value) {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length === 0 ? null : trimmed.slice(0, MAX_FIELD);
}

/** Fixed-window counter in KV. Returns true if the request is within budget. */
async function withinRateLimit(env) {
  if (!env.RATE_LIMIT) return true; // KV optional in local dev
  const windowId = Math.floor(Date.now() / 1000 / RATE_WINDOW_SECONDS);
  const key = `rl:${windowId}`;
  const current = parseInt((await env.RATE_LIMIT.get(key)) ?? '0', 10);
  if (current >= RATE_MAX_PER_WINDOW) return false;
  // TTL a little beyond the window so stale keys self-expire.
  await env.RATE_LIMIT.put(key, String(current + 1), {
    expirationTtl: RATE_WINDOW_SECONDS * 2,
  });
  return true;
}

async function handleReport(request, env, origin) {
  let payload;
  try {
    payload = await request.json();
  } catch {
    return json({ error: 'invalid JSON' }, 400, origin);
  }

  const type = payload.type;
  if (!ALLOWED_TYPES.has(type)) {
    return json({ error: 'invalid type' }, 400, origin);
  }

  const appVersion = clampField(payload.app_version);
  const os = clampField(payload.os);
  if (!appVersion || !os) {
    return json({ error: 'missing app_version or os' }, 400, origin);
  }

  const osVersion = clampField(payload.os_version);
  const locale = clampField(payload.locale);
  const clientTs = clampField(payload.client_ts);

  // Defence-in-depth: scrub again, then cap length.
  const message =
    typeof payload.message === 'string'
      ? scrub(payload.message).slice(0, MAX_MESSAGE)
      : null;
  const stack =
    typeof payload.stack === 'string'
      ? scrub(payload.stack).slice(0, MAX_STACK)
      : null;

  if (!(await withinRateLimit(env))) {
    return json({ error: 'rate limited' }, 429, origin);
  }

  const id = crypto.randomUUID();
  const deleteToken = newToken();
  const createdAt = new Date().toISOString();

  await env.DB.prepare(
    `INSERT INTO reports
       (id, created_at, type, app_version, os, os_version, locale,
        message, stack, attachment_key, client_ts, cluster_id, status, delete_token_hash)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, NULL, 'new', ?)`,
  )
    .bind(
      id,
      createdAt,
      type,
      appVersion,
      os,
      osVersion,
      locale,
      message,
      stack,
      clientTs,
      await sha256Hex(deleteToken),
    )
    .run();

  return json({ id, delete_token: deleteToken }, 202, origin);
}

const REPORT_ITEM = /^\/v1\/report\/([^/]+)$/;
const FEEDBACK_ITEM = /^\/v1\/feedback\/(FB-[0-9A-Z]{8})(\/attachment)?$/;

async function route(request, env, ctx, origin) {
  const url = new URL(request.url);
  if (request.method === 'POST' && url.pathname === '/v1/report') {
    return handleReport(request, env, origin);
  }
  if (request.method === 'POST' && url.pathname === '/v1/feedback') {
    const r = await handleFeedbackPost(request, env, ctx);
    return json(r.body, r.status, origin);
  }
  const reportItem = REPORT_ITEM.exec(url.pathname);
  if (reportItem && request.method === 'DELETE') {
    const r = await handleReportDelete(request, env, reportItem[1]);
    return r.body === null ? new Response(null, { status: r.status, headers: corsHeaders(origin) }) : json(r.body, r.status, origin);
  }
  const item = FEEDBACK_ITEM.exec(url.pathname);
  if (item && item[2] && request.method === 'PUT') {
    const r = await handleAttachmentPut(request, env, item[1]);
    return r.body === null ? new Response(null, { status: r.status, headers: corsHeaders(origin) }) : json(r.body, r.status, origin);
  }
  if (item && !item[2] && request.method === 'DELETE') {
    const r = await handleFeedbackDelete(request, env, item[1]);
    return r.body === null ? new Response(null, { status: r.status, headers: corsHeaders(origin) }) : json(r.body, r.status, origin);
  }
  return json({ error: 'not found' }, 404, origin);
}

/**
 * The cron pass. Each step is independent: one failing must not stop the
 * others, because a stuck issue retry is no reason to keep expired reports.
 * Only the error's class name is logged, never its message.
 */
export async function runScheduled(env, deps = {}) {
  const steps = [
    ['feedback', () => syncFeedback(env, deps)],
    ['reports', () => syncReports(env, deps)],
    ['orphans', () => sweepOrphanedAttachments(env, deps)],
  ];
  const settled = await Promise.allSettled(steps.map(([, run]) => run()));
  settled.forEach((outcome, i) => {
    if (outcome.status === 'rejected') {
      console.warn(`scheduled ${steps[i][0]} failed: error ${outcome.reason?.name ?? typeof outcome.reason}`);
    }
  });
  return Object.fromEntries(settled.map((o, i) => [steps[i][0], o.status === 'fulfilled' ? o.value : null]));
}

export default {
  async fetch(request, env, ctx) {
    const origin = request.headers.get('Origin') ?? '';

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders(origin) });
    }

    try {
      return await route(request, env, ctx, origin);
    } catch {
      // Never leak internals. The app shows its own localized failure text.
      return json({ error: 'internal error' }, 500, origin);
    }
  },

  async scheduled(_event, env, ctx) {
    ctx.waitUntil(runScheduled(env));
  },
};
