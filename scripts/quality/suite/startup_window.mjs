#!/usr/bin/env node
// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary. The PDFluent application is free to use,
// including for commercial purposes. Redistribution, or extraction or reuse
// of its components (including the embedded PDF engine), requires a licence.
// See https://pdfluent.com/license for terms.
//
// startup_window.mjs — how long a launch has to last before the offline
// observation has covered anything (#551).
//
// The app reaches out exactly once on its own: a silent update check, scheduled
// a fixed delay after the frontend loads. Everything else it does with the
// network is a button somebody pressed. So that delay is the bar the S2 launch
// has to clear — a launch that ends before the timer fires produces a row
// saying "no outbound socket seen", truthfully, about a window in which the app
// had not yet had the chance to open one. On the 10-09 rehearsal that was all
// seventeen launches: 43 samples over 45 s, none of them longer than 1.5 s.
//
// The number is READ OUT OF THE PRODUCT and never written down here. A second
// copy of a constant is a constant that drifts, and drift in this direction is
// silent: a suite still holding for five seconds after the product moved to ten
// keeps printing a covered window it no longer covers.
//
//   node startup_window.mjs [repoRoot]     # prints "<delay_ms> <hold_ms>"

import { readFileSync } from "node:fs";
import path from "node:path";
import { isMainModule } from "../../lib/main-module.mjs";

/** Where the product declares it. One place, named once. */
export const UPDATER_SOURCE = path.join("src", "lib", "updater.ts");

/**
 * Room on top of the delay, in milliseconds.
 *
 * The hold is wall-clock from the `open` call, and the delay is wall-clock from
 * the moment the frontend runs its effect. Between them sit process start,
 * window creation and the first render; after the check fires, a socket still
 * has to appear and be sampled. Holding for exactly the delay would make the
 * coverage a coin-flip on a loaded machine, and a coin-flip is the kind of green
 * nobody re-reads.
 */
export const STARTUP_HOLD_MARGIN_MS = 3_000;

/**
 * The delay the product waits before its startup update check, in milliseconds.
 *
 * Throws when the declaration is not where it was. That is the point: a default
 * would let the suite keep reporting a covered window for a check that has
 * moved, which is the failure this file exists to make impossible.
 */
export function startupCheckDelayMs(repoRoot) {
  const file = path.join(repoRoot, UPDATER_SOURCE);
  const src = readFileSync(file, "utf8");
  // TypeScript's numeric separators are part of the literal: `5_000` is five
  // thousand, and a reader that stopped at the underscore would hold for five
  // milliseconds and call the window covered.
  const m = /STARTUP_CHECK_DELAY_MS\s*=\s*([\d_]+)/.exec(src);
  if (!m) {
    throw new Error(
      `${UPDATER_SOURCE} no longer declares STARTUP_CHECK_DELAY_MS, so the suite cannot know how long a launch must last to cover the startup update check`,
    );
  }
  const ms = Number.parseInt(m[1].replace(/_/g, ""), 10);
  if (!Number.isFinite(ms) || ms <= 0) {
    throw new Error(`${UPDATER_SOURCE} declares STARTUP_CHECK_DELAY_MS as "${m[1]}", which is not a delay`);
  }
  return ms;
}

/** How long S2 holds the first document's launch open. */
export function s2HoldMs(repoRoot) {
  return startupCheckDelayMs(repoRoot) + STARTUP_HOLD_MARGIN_MS;
}

if (isMainModule(import.meta.url)) {
  const root = path.resolve(process.argv[2] || process.cwd());
  process.stdout.write(`${startupCheckDelayMs(root)} ${s2HoldMs(root)}\n`);
}
