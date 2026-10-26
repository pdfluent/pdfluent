// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary. The PDFluent application is free to use,
// including for commercial purposes. Redistribution, or extraction or reuse
// of its components (including the embedded PDF engine), requires a licence.
// See https://pdfluent.com/license for terms.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

/** The page-side fault watch (fault-watch.js) as text, to send into a web view. */
export const FAULT_WATCH_SOURCE = readFileSync(fileURLToPath(new URL('./fault-watch.js', import.meta.url)), 'utf8');
