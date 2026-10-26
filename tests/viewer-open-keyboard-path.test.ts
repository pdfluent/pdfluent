// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary. The PDFluent application is free to use,
// including for commercial purposes. Redistribution, or extraction or reuse
// of its components (including the embedded PDF engine), requires a licence.
// See https://pdfluent.com/license for terms.

// The open button on the welcome screen is reached and activated by keyboard
// (Enter on the focused button is a click). In the desktop app that click has to
// open the native dialog, not the hidden file input of the browser build; the
// Playwright spec for J-91 can only see the browser build (a11y-core-journeys).

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const viewerApp = readFileSync(new URL('../src/viewer/ViewerApp.tsx', import.meta.url), 'utf8');
const fileDialogs = readFileSync(new URL('../src/platform/native/fileDialogs.ts', import.meta.url), 'utf8');

describe('the open button, by keyboard', () => {
  const start = viewerApp.indexOf('const handleOpenFile = useCallback(');
  const body = viewerApp.slice(start, viewerApp.indexOf('}, [handleLoadDocument]);', start));

  it('is a real button whose click is the open action', () => {
    expect(viewerApp).toMatch(/<button className="share-btn" type="button" onClick=\{\(\) => \{ void handleOpenFile\(\); \}\}>/);
  });

  it('opens the native dialog in the desktop app and the hidden input only in the browser build', () => {
    expect(start).toBeGreaterThan(0);
    const tauriBranch = body.slice(body.indexOf('if (isTauri)'), body.indexOf('} else {'));
    expect(tauriBranch).toContain('pickPdfPath()');
    expect(tauriBranch).not.toContain('welcomeFileInputRef');
    const browserBranch = body.slice(body.indexOf('} else {'));
    expect(browserBranch).toContain('welcomeFileInputRef.current?.click()');
  });

  it('pickPdfPath is the Tauri dialog plugin', () => {
    expect(fileDialogs).toContain("import('@tauri-apps/plugin-dialog')");
    expect(fileDialogs).toMatch(/export async function pickPdfPath/);
  });
});
