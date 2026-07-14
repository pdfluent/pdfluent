// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary. The PDFluent application is free to use,
// including for commercial purposes. Redistribution, or extraction or reuse
// of its components (including the embedded PDF engine), requires a licence.
// See https://pdfluent.com/license for terms.

// ---------------------------------------------------------------------------
// PDFluent crash ingest Worker (plan §5)
//
// Fase 0 scope: this Worker ingests *crash* reports only. General
// feedback/contact is NOT handled here — it goes to the website form at
// pdfluent.com/feedback (reached via feedback.pdfluent.com). There is no
// in-app feedback ingest in this phase. The 'bug'/'feedback' report types are
// accepted by the validator/schema as forward-looking (Fase 1), but the app
// does not send them yet.
//
// Stateless, single responsibility: validate a report, scrub it again as
// defence-in-depth, and write exactly one row to D1. No dedup, no queue, no
// auth token, no IP logging — the endpoint is low-risk and carries no PII.
//
//   POST https://report.pdfluent.com/v1/report   (JSON, see plan §3)
//   → 202 { "id": "<uuid>" }   on success
//   → 400 { "error": "…" }     on validation failure
//   → 429 { "error": "…" }     when the coarse rate limit trips
//
// Bindings (wrangler.toml):
//   DB           D1 database (table `reports`, see schema.sql)
//   RATE_LIMIT   KV namespace (ephemeral fixed-window counter, no IP stored)
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
]);

// ── Server-side scrub (mirrors src/lib/telemetry/scrub.ts) ────────────────
const WINDOWS_PATH = /[A-Za-z]:\\[^\s"'<>|)\]}]*/g;
const UNIX_PATH = /(?:\/[\w.\-@+]+){2,}\/?/g;
const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
const DOC_FILE =
  /\b[\w.-]+\.(?:pdf|docx?|xlsx?|pptx?|csv|txt|log|rtf|odt|ods|odp|png|jpe?g|gif|tiff?|bmp|webp|heic)\b/gi;
const BASE64_BLOB = /[A-Za-z0-9+/]{40,}={0,2}/g;
const HEX_BLOB = /\b(?:0x)?[0-9a-fA-F]{32,}\b/g;

function scrub(input) {
  if (input == null) return '';
  let out = String(input);
  out = out.replace(WINDOWS_PATH, '<path>');
  out = out.replace(UNIX_PATH, '<path>');
  out = out.replace(EMAIL, '<email>');
  out = out.replace(DOC_FILE, '<file>');
  out = out.replace(BASE64_BLOB, '<redacted>');
  out = out.replace(HEX_BLOB, '<redacted>');
  return out;
}

function corsHeaders(origin) {
  const allow = ALLOWED_ORIGINS.has(origin) ? origin : 'null';
  return {
    'Access-Control-Allow-Origin': allow,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
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
  const createdAt = new Date().toISOString();

  await env.DB.prepare(
    `INSERT INTO reports
       (id, created_at, type, app_version, os, os_version, locale,
        message, stack, attachment_key, client_ts, cluster_id, status)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, NULL, 'new')`,
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
    )
    .run();

  return json({ id }, 202, origin);
}

export default {
  async fetch(request, env) {
    const origin = request.headers.get('Origin') ?? '';
    const url = new URL(request.url);

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders(origin) });
    }

    if (request.method !== 'POST' || url.pathname !== '/v1/report') {
      return json({ error: 'not found' }, 404, origin);
    }

    try {
      return await handleReport(request, env, origin);
    } catch (err) {
      // Never leak internals; the app retries once then drops silently.
      return json({ error: 'internal error' }, 500, origin);
    }
  },
};
