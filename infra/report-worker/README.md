# PDFluent report Worker

One Cloudflare Worker behind `https://report.pdfluent.com` for two things the
desktop app (and the website form) can send. Both are sent only by a deliberate
act of the user; with neither, the app makes no request to this host at all.

| Endpoint | What | When the app sends it |
|---|---|---|
| `POST /v1/report` | Crash report → D1 `reports`; answers `{ id, delete_token }` | Only with crash reporting switched on, after the review dialog |
| `DELETE /v1/report/<id>` | Erase a crash report (D1 row and any attachment) | When the sender asks, in Settings; needs the delete token the app kept |
| `POST /v1/feedback` | "Help us improve PDFluent" → D1 `feedback` (+ `contact`), private GitHub issue | Only when the user presses **Send** in Help → Help us improve PDFluent |
| `PUT /v1/feedback/<id>/attachment` | The open document → R2 | Only after the user ticked "share this document" **and** confirmed the second prompt |
| `DELETE /v1/feedback/<id>` | Erase a report (D1, R2, contact, neutral issue title and body) | When the reporter asks; needs the delete token the app kept |
| cron `*/15 * * * *` | Retry issues, expire documents (90 days after close, 365 max), crash reports (90 days) and feedback reports (365 days), delete R2 objects no row refers to | — |

## Retention and deletion

| Data | Kept | Removed by |
|---|---|---|
| Crash report (D1 `reports`) | 90 days from `created_at` | the cron, or `DELETE /v1/report/<id>` with `X-Delete-Token` |
| Feedback report (D1 `feedback`) and its address (D1 `contact`) | 365 days from `created_at` | the cron, or `DELETE /v1/feedback/<id>` with `X-Delete-Token` |
| Shared document (R2 `feedback/<id>`) | 90 days after its issue closes, 365 days at most (the bucket lifecycle rule is the backstop) | the cron, the feedback delete, or the orphan sweep |

- The cron removes at most 100 rows per table per run (96 runs a day), oldest
  first; a backlog drains over the following runs.
- **Orphan sweep.** Each run inspects one page (100) of the R2 bucket and deletes
  objects that no `feedback.attachment_key` or `reports.attachment_key` names,
  once they are an hour old (an upload sits between its R2 put and its D1
  update for a moment). The page cursor is kept in the `RATE_LIMIT` KV
  namespace so successive runs walk the whole bucket.
- **Delete token.** 32 random bytes, hex, returned once in the submit answer;
  only its SHA-256 is stored (`reports.delete_token_hash`). The app keeps it in
  local storage (`pdfluent.crash.sent`) and Settings → Crash & error reports →
  "Delete my crash reports" uses it. A wrong, missing or someone else's token
  answers 403 and removes nothing; an unknown or malformed id answers 404.
- Crash reports stored before this change have no token. Nobody can delete them
  early; they expire with the rest at 90 days.
- The periods live in `src/reports.js` (`REPORT_RETENTION`) and `src/feedback.js`
  (`RETENTION`). The app shows the crash period from
  `src/lib/telemetry/localCrashReports.ts`; a test keeps the two equal.
  Change code, app text, privacy statement and claim B64 together.

What is stored where, and why the issue never holds an address, a file or a
file name: see the header of `src/feedback.js`. Tests:
`tests/report-worker-feedback.test.ts` and `tests/report-worker-retention.test.ts`
(run by the vitest job in CI; the second also breaks a copy of the Worker in 21
ways and requires its scenarios to fail).

"Fixed" notices reach a reporter without e-mail: close the issue with the label
`fixed-in:<version>`, and the release step writes the report IDs of those issues
into `fixed_feedback` in the update feed (`scripts/release/fixed-feedback.mjs`).
The app compares that list with the IDs it sent and says so after the update.

## Owner steps (not done by any agent; in this order)

1. **GitHub App** — create it from the manifest, private, installed on the one
   tracker repository only:
   - GitHub → Settings → Developer settings → GitHub Apps → New GitHub App, or
     the manifest flow with `github-app-manifest.json` (permissions: Issues
     read & write, Metadata read; no webhook, no events).
   - Install it on `pdfluent/pdfluent-internal` only ("Only select repositories").
   - Note the App ID and the installation ID (the number in the installation URL).
   - Generate a private key, then convert it to PKCS#8 (WebCrypto cannot import
     GitHub's PKCS#1 file):
     `openssl pkcs8 -topk8 -nocrypt -in pdfluent-feedback.private-key.pem -out key.pk8.pem`
   - Create the labels `feedback` and `editor` in the tracker if they do not exist.
2. **Cloudflare resources** (EU jurisdiction). On a database that already exists
   (created from an earlier `schema.sql`), run the migration **before** deploying
   the Worker that writes `delete_token_hash`:
   ```sh
   wrangler d1 execute pdfluent-reports --remote --file=./migrations/0001_reports_delete_token.sql
   ```
   A fresh database gets the column from `schema.sql` below and needs no migration.
   ```sh
   cd infra/report-worker
   wrangler d1 create pdfluent-reports --location weur   # copy database_id into wrangler.toml
   wrangler d1 execute pdfluent-reports --remote --file=./schema.sql
   wrangler kv namespace create RATE_LIMIT               # copy id into wrangler.toml
   wrangler r2 bucket create pdfluent-feedback-attachments --jurisdiction eu
   wrangler r2 bucket lifecycle add pdfluent-feedback-attachments expire-365 feedback/ --expire-days 365 --jurisdiction eu
   ```
3. **Secrets** (never in the repository):
   ```sh
   wrangler secret put GITHUB_APP_ID
   wrangler secret put GITHUB_APP_INSTALLATION_ID
   wrangler secret put GITHUB_APP_PRIVATE_KEY      # contents of key.pk8.pem
   wrangler secret put RATE_SALT                   # any long random string
   wrangler secret put SITE_FORWARD_SECRET         # shared with the website's email Worker (it forwards
                                                   # site feedback it already checked with Turnstile)
   ```
4. **DNS**: none by hand. `wrangler.toml` binds `report.pdfluent.com` as a
   Workers custom domain, so `wrangler deploy` creates the proxied record and
   the certificate in the `pdfluent.com` zone.
5. **Deploy**: `wrangler deploy`.
6. **Verify** (one test report, then erase it with the returned token):
   ```sh
   curl -s -X POST https://report.pdfluent.com/v1/feedback -H 'Content-Type: application/json' \
     -d '{"source":"app","area":"other","what_happened":"test from the owner","context":{"app_version":"0.0.0"}}'
   curl -s -X DELETE https://report.pdfluent.com/v1/feedback/<id> -H 'X-Delete-Token: <delete_token>'
   ```
   Expect `201`, an issue labelled `feedback` in the tracker within a minute,
   then `204` and the issue title and body replaced with neutral text.
7. **Privacy statement and claim B08** are updated before the first release
   that contains the in-app form (texts proposed in the stream-D report).

Until steps 1–6 are done the app shows "could not send" with the option to try
again; nothing is lost silently and nothing is sent anywhere else.

## Daily review queries

```sh
# New feedback, last 24 h, by area.
wrangler d1 execute pdfluent-reports --remote --command \
  "SELECT area, COUNT(*) FROM feedback WHERE created_at > datetime('now','-1 day') GROUP BY area ORDER BY 2 DESC;"

# Reports whose issue could not be opened yet.
wrangler d1 execute pdfluent-reports --remote --command \
  "SELECT id, created_at, issue_attempts FROM feedback WHERE issue_state='pending';"

# New crashes per version, last 24 h.
wrangler d1 execute pdfluent-reports --remote --command \
  "SELECT app_version, COUNT(*) FROM reports WHERE type='crash' AND created_at > datetime('now','-1 day') GROUP BY app_version ORDER BY 2 DESC;"
```

## E-mail

This Worker sends no e-mail, and no sending provider is used or needed. The
in-app report ID is the confirmation of receipt and `fixed_feedback` in the
update feed is the "fixed" notice. Where a reporter ticked a follow-up box, the
address and consent are stored in D1 `contact` so the owner can reply by hand;
incoming mail to pdfluent.com reaches the owner's mailbox through Cloudflare
Email Routing, outside this Worker.
