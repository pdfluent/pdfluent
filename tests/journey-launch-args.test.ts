// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary. The PDFluent application is free to use,
// including for commercial purposes. Redistribution, or extraction or reuse
// of its components (including the embedded PDF engine), requires a licence.
// See https://pdfluent.com/license for terms.

// On Windows the journey harness reaches the app through tauri-driver and
// msedgedriver, which turns every entry of `tauri:options.args` into a switch:
// "C:\Docs\a.pdf" arrived as "--c:\docs\a.pdf". The app opened nothing and
// every journey that starts with a file waited 60 s for a document. The file
// now travels in PDFLUENT_E2E_ARGS.

import { describe, expect, it } from 'vitest';
import { webdriverCapabilities, webdriverEnv } from './journeys/lib/driver';

describe('how the WebDriver session hands the app its file', () => {
  it('puts no launch argument in the capabilities, where msedgedriver would turn it into a switch', () => {
    const caps = webdriverCapabilities({ app: 'E:\\target\\release\\pdfluent-desktop.exe' });
    expect(caps).toEqual({ 'tauri:options': { application: 'E:\\target\\release\\pdfluent-desktop.exe' } });
    expect(JSON.stringify(caps)).not.toContain('args');
  });

  it('carries the arguments to the app unchanged in PDFLUENT_E2E_ARGS', () => {
    const file = 'C:\\Temp\\pdfluent-J-10-x\\Quarterly Report.pdf';
    const env = webdriverEnv({ args: [file], env: { PDFLUENT_E2E_LANG: 'en' } });
    expect(env.PDFLUENT_E2E_LANG).toBe('en');
    expect(JSON.parse(env.PDFLUENT_E2E_ARGS as string)).toEqual([file]);
  });

  it('sets nothing when the journey starts the app without a file', () => {
    expect(webdriverEnv({ args: [], env: { A: 'b' } })).toEqual({ A: 'b' });
  });
});
