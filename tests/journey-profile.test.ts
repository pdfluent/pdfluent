// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary. The PDFluent application is free to use,
// including for commercial purposes. Redistribution, or extraction or reuse
// of its components (including the embedded PDF engine), requires a licence.
// See https://pdfluent.com/license for terms.

// J-37 (dark mode survives a restart) failed on Windows for two reasons that
// had nothing to do with the theme code: msedgedriver starts WebView2 with a
// throw-away profile per WebDriver session, and the harness killed the app the
// moment the session was deleted, before the web view had written its
// localStorage. These tests hold the three pieces of the fix.

import { readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { staleDevToolsPortFile, waitUntilGone, webdriverCapabilities } from './journeys/lib/driver';
import { watchdogEnv } from './journeys/lib/env';

describe('the web view profile of a journey', () => {
  it('is handed to WebView2 itself, as a browser argument, not to the app', () => {
    const caps = webdriverCapabilities({ app: 'E:\\t\\app.exe', profileDir: 'E:\\tmp\\pdfluent-J-37-x\\webview2' });
    expect(caps['tauri:options'].webviewOptions).toEqual({
      additionalBrowserArguments: ['--user-data-dir=E:\\tmp\\pdfluent-J-37-x\\webview2'],
    });
    // msedgedriver turns `args` into app switches; the profile must not travel there.
    expect(JSON.stringify(caps)).not.toContain('"args"');
  });

  it('leaves the capabilities alone when there is no profile (macOS, Linux, a launch without one)', () => {
    expect(webdriverCapabilities({ app: 'E:\\t\\app.exe' })).toEqual({ 'tauri:options': { application: 'E:\\t\\app.exe' } });
  });

  it('names the port file a killed session leaves behind in a reused profile', () => {
    const file = staleDevToolsPortFile('/p/webview2');
    expect(file.replace(/\\/g, '/')).toBe('/p/webview2/EBWebView/DevToolsActivePort');
  });
});

describe('closing a session', () => {
  it('waits for the app to leave by itself, and says so when it does not', async () => {
    let alive = 3;
    const polls: number[] = [];
    const gone = await waitUntilGone(() => { polls.push(alive); alive -= 1; return alive > 0 ? [1] : []; }, 2_000, 1);
    expect(gone).toBe(true);
    expect(polls.length).toBeGreaterThan(1);
    expect(await waitUntilGone(() => [42], 30, 5)).toBe(false);
  });

  it('gives the app time before the kill, in the close path and not after it', () => {
    const src = readFileSync('tests/journeys/lib/driver.ts', 'utf8');
    const close = src.slice(src.indexOf('  async close(): Promise<void> {\n    if (!this.ended)'));
    expect(close.indexOf('deleteSession')).toBeGreaterThan(-1);
    expect(close.indexOf('waitUntilGone')).toBeGreaterThan(close.indexOf('deleteSession'));
    expect(close.indexOf('killPid(pid)')).toBeGreaterThan(close.indexOf('waitUntilGone'));
  });

  it('gives every journey its own profile on Windows, kept across its restarts', () => {
    const src = readFileSync('tests/journeys/lib/journey.ts', 'utf8');
    expect(src).toMatch(/profileDir\s*=\s*process\.platform === 'win32' \? path\.join\(work, 'webview2'\)/);
  });
});

describe('the startup watchdog under WebDriver', () => {
  it('is far above the 25 s the product waits, so a slow start is not turned into a swapped window', () => {
    expect(Number(watchdogEnv('webdriver').PDFLUENT_READY_TIMEOUT_SECS)).toBeGreaterThanOrEqual(120);
  });

  it('is left at the product value on macOS, where the watchdog guards a WKWebView freeze', () => {
    expect(watchdogEnv('bridge')).toEqual({});
  });
});

describe('journey specs that click', () => {
  it('never swallow the failure of a click on a panel or tool (J-74 clicked the wrong element for months this way)', () => {
    for (const f of readdirSync('tests/journeys').filter((n) => n.endsWith('.e2e.ts'))) {
      const src = readFileSync(`tests/journeys/${f}`, 'utf8');
      expect(src, f).not.toMatch(/clickText\([^\n]*\)\.catch\(/);
    }
  });
});
