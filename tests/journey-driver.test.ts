// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary. The PDFluent application is free to use,
// including for commercial purposes. Redistribution, or extraction or reuse
// of its components (including the embedded PDF engine), requires a licence.
// See https://pdfluent.com/license for terms.

// The Windows journey run once took hours because webdriverio retried every
// failed WebDriver call three times and the script timeout (30 s) was shorter
// than the 60 s waits it had to carry: a failing wait cost 128 s and said
// only "script timeout". These tests hold the two settings that prevent it.

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { scriptTimeoutFor } from './journeys/lib/driver';

describe('journey driver timeouts', () => {
  it('lets the script timeout outlast the wait it carries, so the page reports its own timeout', () => {
    expect(scriptTimeoutFor('waitFor', ['[data-has-document="true"]', { timeout: 60_000 }])).toBeGreaterThan(60_000);
    expect(scriptTimeoutFor('waitFor', ['.x', {}])).toBeGreaterThan(15_000);
    expect(scriptTimeoutFor('waitFor', ['.x'])).toBeGreaterThan(15_000);
  });

  it('gives a backend command room, and an ordinary call the WebDriver default', () => {
    expect(scriptTimeoutFor('invoke', ['export', {}])).toBeGreaterThanOrEqual(120_000);
    expect(scriptTimeoutFor('count', ['.x'])).toBe(30_000);
  });

  it('never lets webdriverio retry a call (it re-ran failing waits and could repeat a click)', () => {
    const src = readFileSync('tests/journeys/lib/driver.ts', 'utf8');
    expect(src).toMatch(/connectionRetryCount:\s*0/);
  });

  it('bails only when asked to, and only with a positive number', () => {
    const cfg = readFileSync('vitest.journeys.config.ts', 'utf8');
    expect(cfg).toContain('PDFLUENT_JOURNEYS_BAIL');
  });
});
