#!/usr/bin/env node
// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary. The PDFluent application is free to use,
// including for commercial purposes. Redistribution, or extraction or reuse
// of its components (including the embedded PDF engine), requires a licence.
// See https://pdfluent.com/license for terms.
//
// What the morning reads.
//
// A nightly that stops running is worse than no nightly. The reports it wrote
// last week are still on disk, still say PASS, and a summary that reads a file
// and repeats what it says will report a green morning for as long as nobody
// notices. So age is part of the judgement here, not a detail of the runner: a
// report older than the night it claims to describe is STALE, and STALE is not
// a pass.
//
//   node nightly_summary.mjs <reports-dir> [--platforms macos,windows]
//
// Exit 0 only on PASS, so the caller cannot mistake "wrote a summary" for
// "the night was clean".

import { readFileSync, readdirSync, existsSync } from "node:fs";
import path from "node:path";

/** Worst first: the summary of several platforms is the worst of them. */
const ORDER = ["FAIL", "COULD_NOT_RUN", "STALE", "MISSING", "INCOMPLETE", "PASS"];
const worst = (a, b) => (ORDER.indexOf(a) <= ORDER.indexOf(b) ? a : b);

/** A report describes tonight if it was written within this many hours. */
export const FRESH_HOURS = 24;

export function summarise(reports, { now = Date.now(), platforms = null, freshHours = FRESH_HOURS } = {}) {
  const wanted = platforms ?? [...new Set(reports.map((r) => r.platform))];
  const lines = [];
  let verdict = "PASS";

  for (const platform of wanted) {
    const found = reports.filter((r) => r.platform === platform);
    if (!found.length) {
      verdict = worst(verdict, "MISSING");
      lines.push(`- ${platform}: MISSING — no report was written for this platform`);
      continue;
    }
    // The newest report for the platform: an older one beside it is history,
    // not a second opinion.
    const r = found.slice().sort((a, b) => Date.parse(b.date ?? 0) - Date.parse(a.date ?? 0))[0];
    const ageH = (now - Date.parse(r.date ?? 0)) / 3600_000;
    if (!Number.isFinite(ageH) || ageH > freshHours) {
      verdict = worst(verdict, "STALE");
      lines.push(
        `- ${platform}: STALE — the newest report is ${Number.isFinite(ageH) ? `${Math.round(ageH)} h` : "of unknown age"}` +
        ` older than this run's window, so tonight measured nothing (it says ${r.verdict})`
      );
      continue;
    }
    verdict = worst(verdict, r.verdict ?? "MISSING");
    const failed = (r.steps ?? []).filter((s) => s.status === "FAIL");
    const skipped = (r.steps ?? []).filter((s) => s.status === "SKIPPED");
    lines.push(
      `- ${platform}: ${r.verdict} — ${r.version}, ${failed.length} failed and ${skipped.length} skipped of ${(r.steps ?? []).length} rows` +
      ` (quality/reports/${r.version}-${platform}.md)`
    );
    for (const s of failed.slice(0, 5)) lines.push(`    FAIL ${s.id}: ${s.reason}`);
    if (skipped.length) lines.push(`    first skip: ${skipped[0].id} — ${skipped[0].reason}`);
  }

  return {
    verdict,
    text: [`# Nightly release suite — ${new Date(now).toISOString().slice(0, 10)}`, "", `**${verdict}**`, "", ...lines, ""].join("\n"),
  };
}

export function readReports(dir) {
  if (!existsSync(dir)) return [];
  const out = [];
  for (const f of readdirSync(dir)) {
    if (!f.endsWith(".json") || f.endsWith(".override.json")) continue;
    try { out.push(JSON.parse(readFileSync(path.join(dir, f), "utf8"))); } catch { /* a report that will not parse is not a pass either */ }
  }
  return out;
}

// ── CLI ──────────────────────────────────────────────────────────────────────
if (import.meta.url === `file://${process.argv[1]}`) {
  const dir = process.argv[2] ?? "quality/reports";
  const arg = process.argv.indexOf("--platforms");
  const platforms = arg > 0 ? String(process.argv[arg + 1]).split(",").filter(Boolean) : null;
  const s = summarise(readReports(dir), { platforms });
  process.stdout.write(s.text);
  process.exit(s.verdict === "PASS" ? 0 : 1);
}
