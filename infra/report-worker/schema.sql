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
  status          TEXT DEFAULT 'new'       -- 'new' | 'triaged' | 'resolved' | 'ignored'
);

CREATE INDEX IF NOT EXISTS idx_reports_created ON reports(created_at);
CREATE INDEX IF NOT EXISTS idx_reports_type    ON reports(type);
CREATE INDEX IF NOT EXISTS idx_reports_version ON reports(app_version);
CREATE INDEX IF NOT EXISTS idx_reports_cluster ON reports(cluster_id);
