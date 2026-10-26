// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary. The PDFluent application is free to use,
// including for commercial purposes. Redistribution, or extraction or reuse
// of its components (including the embedded PDF engine), requires a licence.
// See https://pdfluent.com/license for terms.

// The offline promise covers the WebView2 process tree: on Windows the
// frontend's networking is WebView2's, and left alone it talks to Microsoft
// (component updates, SmartScreen, sync, telemetry) before the user does
// anything. The S3 offline:observe gate in the Windows smoke caught it.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const config = JSON.parse(
  readFileSync(new URL('../src-tauri/tauri.conf.json', import.meta.url), 'utf8'),
) as { app: { windows: Array<{ additionalBrowserArgs?: string }> } };

describe('WebView2 background networking is switched off', () => {
  const args = config.app.windows.map((w) => w.additionalBrowserArgs ?? '');

  it('every window passes the flags that stop the unprompted traffic', () => {
    for (const a of args) {
      for (const flag of ['--disable-background-networking', '--disable-component-update', '--disable-sync', '--no-pings']) {
        expect(a, flag).toContain(flag);
      }
      expect(a).toMatch(/--disable-features=[^ ]*msSmartScreenProtection/);
    }
  });

  it('keeps the features Tauri switches off by default', () => {
    // Setting additionalBrowserArgs replaces Tauri's default list.
    for (const a of args) expect(a).toMatch(/--disable-features=[^ ]*msWebOOUI[^ ]*msPdfOOUI/);
  });
});
