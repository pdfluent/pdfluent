-- Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
--
-- This software is proprietary. The PDFluent application is free to use,
-- including for commercial purposes. Redistribution, or extraction or reuse
-- of its components (including the embedded PDF engine), requires a licence.
-- See https://pdfluent.com/license for terms.

-- Crash reports become deletable by their sender (DELETE /v1/report/<id>).
-- Run once against a database created from the earlier schema.sql, BEFORE the
-- Worker that writes this column is deployed. A fresh database already has it.
ALTER TABLE reports ADD COLUMN delete_token_hash TEXT;
