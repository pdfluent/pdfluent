#!/usr/bin/env node
// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary. The PDFluent application is free to use,
// including for commercial purposes. Redistribution, or extraction or reuse
// of its components (including the embedded PDF engine), requires a licence.
// See https://pdfluent.com/license for terms.
//
// The `fixed_feedback` list for a release's update feed.
//
// A feedback issue carries `fb:FB-XXXXXXXX` in its body (the Worker writes it).
// Closing it with the label `fixed-in:<version>` is how its reporter learns,
// without e-mail, that the update fixes it: this script collects the IDs of
// those issues and ci-generate-latest-json.mjs puts them in latest.json.
//
// usage:
//   gh issue list -R <tracker> --state all --label "fixed-in:1.0.1" --limit 500 \
//     --json number,body,labels,stateReason > issues.json
//   node scripts/release/fixed-feedback.mjs --version 1.0.1 --issues issues.json > fixed-feedback.json
//
// An issue closed as a duplicate carries no fix of its own; give it the
// canonical issue's fixed-in label and its reporter is included too. Issues
// with an fb: marker but closed as duplicate WITHOUT that label are listed on
// stderr so they are not forgotten.

import { readFileSync } from 'node:fs';
import { isMainModule } from '../lib/main-module.mjs';

export const FEEDBACK_ID_RE = /^FB-[0-9A-HJKMNP-TV-Z]{8}$/;
const MARKER_RE = /(?:^|\s)fb:(FB-[0-9A-HJKMNP-TV-Z]{8})(?=\s|$)/g;

/** Report IDs named in an issue body. */
export function idsInBody(body) {
  return [...String(body ?? '').matchAll(MARKER_RE)].map((m) => m[1]);
}

function labelNames(issue) {
  return (issue.labels ?? []).map((l) => (typeof l === 'string' ? l : l?.name)).filter(Boolean);
}

/** Sorted, de-duplicated IDs of every issue labelled fixed-in:<version>. */
export function fixedFeedbackIds(issues, version) {
  if (!/^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/.test(String(version))) {
    throw new Error(`not a release version: ${version}`);
  }
  const label = `fixed-in:${version}`;
  const ids = new Set();
  for (const issue of issues) {
    if (!labelNames(issue).includes(label)) continue;
    for (const id of idsInBody(issue.body)) ids.add(id);
  }
  return [...ids].sort();
}

/** Issues with a report ID, closed as duplicate, that no fixed-in label covers. */
export function forgottenDuplicates(issues) {
  return issues
    .filter((i) => String(i.stateReason ?? i.state_reason ?? '').toLowerCase() === 'duplicate')
    .filter((i) => idsInBody(i.body).length > 0)
    .filter((i) => !labelNames(i).some((l) => l.startsWith('fixed-in:')))
    .map((i) => i.number);
}

function main(argv) {
  const at = (flag) => {
    const i = argv.indexOf(flag);
    return i === -1 ? null : argv[i + 1];
  };
  const version = at('--version');
  const file = at('--issues');
  if (!version || !file) {
    console.error('usage: fixed-feedback.mjs --version <x.y.z> --issues <issues.json>');
    return 2;
  }
  const issues = JSON.parse(readFileSync(file, 'utf8'));
  if (!Array.isArray(issues)) {
    console.error('fixed-feedback: --issues must hold a JSON array (gh issue list --json …)');
    return 2;
  }
  const ids = fixedFeedbackIds(issues, version);
  const forgotten = forgottenDuplicates(issues);
  if (forgotten.length) {
    console.error(`fixed-feedback: duplicates without a fixed-in label (their reporters are not told): #${forgotten.join(', #')}`);
  }
  process.stdout.write(`${JSON.stringify(ids)}\n`);
  console.error(`fixed-feedback: ${ids.length} report(s) fixed in ${version}`);
  return 0;
}

if (isMainModule(import.meta.url)) {
  process.exitCode = main(process.argv.slice(2));
}
