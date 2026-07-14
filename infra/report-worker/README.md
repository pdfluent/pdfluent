# PDFluent report Worker

Cloudflare Worker that ingests **crash** reports from the desktop app and
writes them to D1. Stateless, privacy-first, free-tier. See
`CRASH_REPORTING_FEEDBACK_PLAN.md` (§5, §6) for the design.

Fase 0 is crash-only. General feedback/contact is **not** handled here — it
goes to the website form at `pdfluent.com/feedback` (reached via
`feedback.pdfluent.com`). There is no in-app feedback ingest in this phase.

- **Endpoint:** `POST https://report.pdfluent.com/v1/report`
- **Body:** JSON (plan §3). Returns `202 { "id": "<uuid>" }`.
- **No secrets, no auth token, no IP logging.** Validation + a coarse KV rate
  limit are the only guards.

## Files

| File | Purpose |
|---|---|
| `worker.js` | Validate → scrub (defence-in-depth) → one D1 insert → `202 {id}`. |
| `schema.sql` | The `reports` table + indexes. |
| `wrangler.toml` | Worker config, route, D1 + KV bindings (fill in the IDs). |

## One-time setup

Requires the Cloudflare CLI: `npm i -g wrangler` and `wrangler login`.

```sh
cd infra/report-worker

# 1. Create the D1 database, then copy the printed database_id into wrangler.toml.
wrangler d1 create pdfluent-reports

# 2. Apply the schema (remote = the live D1, not the local emulator).
wrangler d1 execute pdfluent-reports --remote --file=./schema.sql

# 3. Create the KV namespace for the rate-limit counter, copy its id into wrangler.toml.
wrangler kv namespace create RATE_LIMIT

# 4. Deploy.
wrangler deploy
```

## DNS / route

`report.pdfluent.com` must exist as a (proxied) DNS record in the `pdfluent.com`
zone so the route in `wrangler.toml` can attach. A proxied `AAAA ::` or
`CNAME` placeholder is enough — the Worker route takes over the response.

The desktop app bakes in **only** `https://report.pdfluent.com` (see plan §9),
so the destination is always re-routable without an app update.

## Verify

```sh
# Should return 202 with a JSON id.
curl -i -X POST https://report.pdfluent.com/v1/report \
  -H 'Content-Type: application/json' \
  -d '{"type":"feedback","app_version":"1.0.0","os":"macOS","locale":"en","message":"hello"}'
```

## Daily review queries (plan §6)

```sh
# New crashes per version, last 24h.
wrangler d1 execute pdfluent-reports --remote --command \
  "SELECT app_version, COUNT(*) FROM reports WHERE type='crash' AND created_at > datetime('now','-1 day') GROUP BY app_version ORDER BY 2 DESC;"

# Untriaged reports to cluster.
wrangler d1 execute pdfluent-reports --remote --command \
  "SELECT id, type, app_version, os, message FROM reports WHERE status='new' ORDER BY created_at;"
```

## Local dev

```sh
wrangler dev          # runs the Worker locally
# D1/KV use local emulators; the rate limiter no-ops without a KV binding.
```

## Out of scope here (later phases)

- R2 attachments (plan §7) and the daily Cron export (plan §8) are **not** in
  this Worker yet — Fase 0 is crashes-only, JSON-only, no in-app attachments.
- `feedback.pdfluent.com` is a separate Cloudflare Redirect Rule to the website
  feedback form (plan §9, `BRIEFING_WEBSITE_FEEDBACK_FORM.md`), not this Worker.
