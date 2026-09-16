// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary. The PDFluent application is free to use,
// including for commercial purposes. Redistribution, or extraction or reuse
// of its components (including the embedded PDF engine), requires a licence.
// See https://pdfluent.com/license for terms.
//
// How long S2 has to hold the app open, and where that number comes from (#551).
//
// The app checks for an update once, a fixed delay after the frontend loads.
// That check is the one moment the product is known to reach out, so it is the
// moment the offline observation exists to cover — and until #551 S2 quit each
// document roughly a second after it opened, which is comfortably before the
// timer that schedules the check has fired. The row then said "no outbound
// socket seen", truthfully, about a window in which the app had not yet had the
// chance to open one.
//
// The number is read out of the product rather than written down beside it. A
// second copy of a constant is a constant that drifts, and a suite holding for
// five seconds because somebody typed five once is a suite that silently stops
// covering the check the day the product waits ten.

import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  STARTUP_HOLD_MARGIN_MS,
  startupCheckDelayMs,
  s2HoldMs,
} from "../../scripts/quality/suite/startup_window.mjs";

const REPO_ROOT = process.cwd();
const UPDATER = path.join("src", "lib", "updater.ts");

const made: string[] = [];
afterEach(() => {
  for (const d of made.splice(0)) rmSync(d, { recursive: true, force: true });
});

/** A checkout with one file in it: the product source this module reads. */
function fakeRepo(updaterSource: string): string {
  const d = mkdtempSync(path.join(tmpdir(), "pdfluent-startup-window-"));
  made.push(d);
  mkdirSync(path.join(d, "src", "lib"), { recursive: true });
  writeFileSync(path.join(d, UPDATER), updaterSource, "utf8");
  return d;
}

describe("the startup update-check delay", () => {
  it("is read out of the product source, not written down twice", () => {
    // The assertion is deliberately against the file, not against a literal:
    // this case has to keep holding when the product changes its mind about
    // how long to wait, and fail only when the suite stops noticing.
    const src = readFileSync(path.join(REPO_ROOT, UPDATER), "utf8");
    const declared = /STARTUP_CHECK_DELAY_MS\s*=\s*([\d_]+)/.exec(src);
    expect(declared, `${UPDATER} no longer declares STARTUP_CHECK_DELAY_MS`).not.toBeNull();
    const want = Number.parseInt(declared![1].replace(/_/g, ""), 10);

    expect(startupCheckDelayMs(REPO_ROOT)).toBe(want);
    expect(startupCheckDelayMs(REPO_ROOT)).toBeGreaterThan(0);
  });

  it("reads a numeric separator the way TypeScript does", () => {
    // `5_000` is five thousand. A reader that stopped at the underscore would
    // hold for five milliseconds and report a covered window of five.
    expect(startupCheckDelayMs(fakeRepo("const STARTUP_CHECK_DELAY_MS = 12_500;\n"))).toBe(12_500);
  });

  it("refuses to guess when the product stops declaring it", () => {
    // The tempting alternative is a default. A default here is a suite that
    // keeps reporting a covered window after the thing it covers has moved.
    expect(() => startupCheckDelayMs(fakeRepo("const SOMETHING_ELSE = 5_000;\n"))).toThrow(
      /STARTUP_CHECK_DELAY_MS/,
    );
  });

  it("refuses to guess when the file is gone altogether", () => {
    const d = mkdtempSync(path.join(tmpdir(), "pdfluent-startup-window-"));
    made.push(d);
    expect(() => startupCheckDelayMs(d)).toThrow();
  });
});

describe("the hold S2 takes", () => {
  it("outlives the check by a margin, because a launch is not a stopwatch", () => {
    // Between the `open` call and the first sample there is process start, and
    // between the check firing and the quit there has to be room for a socket
    // to appear. Holding for exactly the delay would make the coverage a
    // coin-flip on a loaded machine.
    const hold = s2HoldMs(REPO_ROOT);
    const delay = startupCheckDelayMs(REPO_ROOT);
    expect(hold).toBe(delay + STARTUP_HOLD_MARGIN_MS);
    expect(hold).toBeGreaterThan(delay);
    expect(STARTUP_HOLD_MARGIN_MS).toBeGreaterThan(0);
  });

  it("stays a number a release evening can afford", () => {
    // One hold, on the first document, is the whole cost: the other sixteen
    // launches are as fast as they were. This bound is what keeps somebody
    // from "fixing" thin evidence by holding every document.
    expect(s2HoldMs(REPO_ROOT)).toBeLessThanOrEqual(30_000);
  });
});
