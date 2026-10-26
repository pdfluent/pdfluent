-- Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
--
-- This software is proprietary. The PDFluent application is free to use,
-- including for commercial purposes. Redistribution, or extraction or reuse
-- of its components (including the embedded PDF engine), requires a licence.
-- See https://pdfluent.com/license for terms.

-- PDFluent crash/feedback store (plan §6).
-- One flat table: query it with `wrangler d1 execute` or the dashboard.
-- Daily AI-clustering fills cluster_id / status by hand — no auto-dedup.

CREATE TABLE IF NOT EXISTS reports (
  id              TEXT PRIMARY KEY,        -- uuid v4 (server-generated)
  created_at      TEXT NOT NULL,           -- server-side ISO8601 (authoritative)
  type            TEXT NOT NULL CHECK (type IN ('crash','bug','feedback')),
  app_version     TEXT NOT NULL,
  os              TEXT NOT NULL,
  os_version      TEXT,
  locale          TEXT,
  message         TEXT,                    -- user text or scrubbed error
  stack           TEXT,                    -- scrubbed, nullable
  attachment_key  TEXT,                    -- R2 key, nullable (data stored elsewhere)
  client_ts       TEXT,                    -- client-reported, informational only
  cluster_id      TEXT,                    -- your/AI triage field, nullable
  status          TEXT DEFAULT 'new',      -- 'new' | 'triaged' | 'resolved' | 'ignored'
  delete_token_hash TEXT                   -- SHA-256 of the sender's delete token; NULL on rows from before it existed
);

CREATE INDEX IF NOT EXISTS idx_reports_created ON reports(created_at);
CREATE INDEX IF NOT EXISTS idx_reports_type    ON reports(type);
CREATE INDEX IF NOT EXISTS idx_reports_version ON reports(app_version);
CREATE INDEX IF NOT EXISTS idx_reports_cluster ON reports(cluster_id);

-- ── "Help us improve PDFluent" (src/feedback.js) ──────────────────────────
-- The report. No e-mail address and no file name ever live in this table.
CREATE TABLE IF NOT EXISTS feedback (
  id                          TEXT PRIMARY KEY,   -- FB-XXXXXXXX, 40 random bits
  created_at                  TEXT NOT NULL,
  source                      TEXT NOT NULL CHECK (source IN ('app','site')),
  product                     TEXT NOT NULL DEFAULT 'editor' CHECK (product IN ('editor','sdk','website')),
  area                        TEXT NOT NULL,      -- what the reporter was doing (fixed list)
  trying_to                   TEXT,
  what_happened               TEXT NOT NULL,
  expected                    TEXT,
  doc_type                    TEXT,
  page_count                  INTEGER,
  context_included            INTEGER NOT NULL,   -- 0 when the reporter switched system details off
  app_version                 TEXT NOT NULL,
  os                          TEXT,
  os_version                  TEXT,
  arch                        TEXT,
  locale                      TEXT,
  error_code                  TEXT,
  error_action                TEXT,
  sessions_note               TEXT,
  attachment_declared         INTEGER NOT NULL,
  attachment_size             INTEGER,
  attachment_consent_at       TEXT,               -- when the reporter agreed to share the document
  attachment_consent_version  TEXT,               -- which consent wording they agreed to
  attachment_key              TEXT,               -- R2 key once uploaded; NULL after expiry
  attachment_expires_at       TEXT,
  upload_token_hash           TEXT,               -- spent (NULL) after the one upload
  delete_token_hash           TEXT NOT NULL,      -- the reporter's own right to erase
  has_contact                 INTEGER NOT NULL,
  issue_number                INTEGER,
  issue_state                 TEXT NOT NULL DEFAULT 'pending' CHECK (issue_state IN ('pending','created')),
  issue_attempts              INTEGER NOT NULL DEFAULT 0,
  issue_closed_at             TEXT
);

CREATE INDEX IF NOT EXISTS idx_feedback_created ON feedback(created_at);
CREATE INDEX IF NOT EXISTS idx_feedback_issue   ON feedback(issue_state);
CREATE INDEX IF NOT EXISTS idx_feedback_attach  ON feedback(attachment_expires_at);

-- The address, only when the reporter ticked a follow-up box, with what they
-- agreed to and when. Deleted with its report, or as soon as its purpose is met.
CREATE TABLE IF NOT EXISTS contact (
  feedback_id           TEXT PRIMARY KEY REFERENCES feedback(id),
  email                 TEXT NOT NULL,
  consent_contact       INTEGER NOT NULL,   -- may we e-mail questions about this report
  consent_fixed         INTEGER NOT NULL,   -- tell me when it is fixed
  consent_at            TEXT NOT NULL,
  consent_text_version  TEXT NOT NULL
);
