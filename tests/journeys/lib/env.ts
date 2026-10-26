// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary. The PDFluent application is free to use,
// including for commercial purposes. Redistribution, or extraction or reuse
// of its components (including the embedded PDF engine), requires a licence.
// See https://pdfluent.com/license for terms.

// Where the journey suite finds what it needs, and what it does when
// something is missing.
//
// PDFLUENT_E2E_APP      the e2e build of the app (`--features e2e`), the binary
// PDFLUENT_PDFCHECK     the pdfcheck example binary from the same target dir
// PDFLUENT_E2E_DRIVER   "webdriver" (tauri-driver; Windows, Linux) or
//                       "bridge" (the file bridge; macOS). Default per OS.
// PDFLUENT_TAURI_DRIVER tauri-driver binary (webdriver only)
// PDFLUENT_NATIVE_DRIVER msedgedriver / WebKitWebDriver (webdriver only)
// PDFLUENT_JOURNEYS_REQUIRED=1  in CI: a missing prerequisite is a failure,
//                       never a skip. Locally it is a SKIPPED line.
// PDFLUENT_JOURNEY_RESULTS  directory for one result file per journey.

import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');

export type Platform = 'macos-arm64' | 'macos-x64' | 'windows-x64' | 'linux-x64';

export function platform(): Platform {
  if (process.platform === 'darwin') return process.arch === 'arm64' ? 'macos-arm64' : 'macos-x64';
  if (process.platform === 'win32') return 'windows-x64';
  return 'linux-x64';
}

export type DriverKind = 'webdriver' | 'bridge';

export function driverKind(): DriverKind {
  const v = process.env.PDFLUENT_E2E_DRIVER;
  if (v === 'webdriver' || v === 'bridge') return v;
  if (v) throw new Error(`PDFLUENT_E2E_DRIVER=${v}: expected "webdriver" or "bridge"`);
  return process.platform === 'darwin' ? 'bridge' : 'webdriver';
}

export const REQUIRED = process.env.PDFLUENT_JOURNEYS_REQUIRED === '1';

/** Absolute path of a file in the repository. */
export function repoFile(rel: string): string {
  return path.join(REPO, rel);
}

/**
 * The prerequisites a launch needs. Returns a reason when one is missing; the
 * caller turns it into a SKIPPED line or, under REQUIRED, a failure.
 */
export function missingPrerequisite(): string | null {
  const need: Array<[string, string | undefined]> = [
    ['PDFLUENT_E2E_APP', process.env.PDFLUENT_E2E_APP],
    ['PDFLUENT_PDFCHECK', process.env.PDFLUENT_PDFCHECK],
  ];
  if (driverKind() === 'webdriver') {
    need.push(['PDFLUENT_TAURI_DRIVER', process.env.PDFLUENT_TAURI_DRIVER]);
  }
  for (const [name, value] of need) {
    if (!value) return `${name} is not set`;
    if (!existsSync(value)) return `${name}=${value} does not exist`;
  }
  return null;
}

/**
 * How long the app waits for its page to report in before it swaps the window
 * for a new one (src-tauri/src/lib.rs, spawn_startup_watchdog; the product's
 * default is 25 s). The product default is right for a person, wrong for this
 * suite on a WebDriver desktop: the runner scans every new binary and profile,
 * a start then takes 50 s or more now and then, and at 25 s the app replaced
 * the window under the driver ("target window already closed", J-66, J-76,
 * J-90) while the page was merely slow. The launch itself waits 60 s for the
 * page, so this stays above that; a page that never comes still fails there,
 * with its own message. macOS keeps the product's value: its bridge does not
 * have this problem and the watchdog exists for a WKWebView freeze.
 */
export const WATCHDOG_SECS_UNDER_WEBDRIVER = 150;

export function watchdogEnv(kind: DriverKind): Record<string, string> {
  return kind === 'webdriver' ? { PDFLUENT_READY_TIMEOUT_SECS: String(WATCHDOG_SECS_UNDER_WEBDRIVER) } : {};
}
