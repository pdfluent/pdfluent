// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary. The PDFluent application is free to use,
// including for commercial purposes. Redistribution, or extraction or reuse
// of its components (including the embedded PDF engine), requires a licence.
// See https://pdfluent.com/license for terms.

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import type { MockedFunction } from 'vitest';

// Hoisted above imports — vitest moves vi.mock to the top.
vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(),
}));

import { invoke } from '@tauri-apps/api/core';
import {
  buildReport,
  sendReport,
  getEnvironment,
  REPORT_ENDPOINT,
  FEEDBACK_URL,
  type ReportEnvironment,
} from '../report';

const mockedInvoke = invoke as MockedFunction<typeof invoke>;

const ENV: ReportEnvironment = {
  appVersion: '1.4.0',
  os: 'macOS',
  osVersion: '14.5',
  locale: 'nl',
};

describe('constants', () => {
  it('bakes in only our own pdfluent.com addresses', () => {
    expect(REPORT_ENDPOINT).toBe('https://report.pdfluent.com/v1/report');
    expect(FEEDBACK_URL).toBe('https://feedback.pdfluent.com');
    // Never a raw third-party URL (plan §9).
    expect(REPORT_ENDPOINT).not.toMatch(/featurebase|sentry|vercel/i);
  });
});

describe('buildReport', () => {
  it('scrubs message and stack before they leave', () => {
    const out = buildReport(
      {
        type: 'crash',
        message: 'panic while saving /Users/jasper/Secret.pdf',
        stack: 'at /Users/jasper/app.rs:1 user jasper@x.com',
      },
      ENV,
    );
    expect(out.message).not.toContain('jasper');
    expect(out.message).toContain('<path>');
    expect(out.stack).not.toContain('jasper');
    expect(out.stack).toContain('<email>');
  });

  it('copies environment fields verbatim into snake_case payload', () => {
    const out = buildReport({ type: 'feedback', message: 'nice app' }, ENV);
    expect(out).toMatchObject({
      type: 'feedback',
      app_version: '1.4.0',
      os: 'macOS',
      os_version: '14.5',
      locale: 'nl',
      message: 'nice app',
    });
  });

  it('emits null stack when none supplied (feedback/bug)', () => {
    expect(buildReport({ type: 'bug', message: 'x' }, ENV).stack).toBeNull();
  });

  it('stamps a client timestamp in ISO-8601', () => {
    const out = buildReport({ type: 'feedback', message: 'x' }, ENV);
    expect(out.client_ts).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });
});

describe('getEnvironment', () => {
  beforeEach(() => vi.clearAllMocks());

  it('maps the snake_case backend response and derives locale on the frontend', async () => {
    mockedInvoke.mockResolvedValue({
      app_version: '2.0.0',
      os: 'Windows',
      os_version: '11',
    });
    const env = await getEnvironment();
    expect(env).toMatchObject({
      appVersion: '2.0.0',
      os: 'Windows',
      osVersion: '11',
    });
    // Locale is detected client-side; in the node test runner it falls to 'en'.
    expect(typeof env.locale).toBe('string');
    expect(env.locale.length).toBeGreaterThan(0);
  });

  it('falls back to a privacy-safe default if the backend is unavailable', async () => {
    mockedInvoke.mockRejectedValue(new Error('no backend'));
    const env = await getEnvironment();
    expect(env.appVersion).toBe('unknown');
    expect(typeof env.locale).toBe('string');
  });
});

describe('sendReport', () => {
  const payload = buildReport({ type: 'crash', message: 'boom' }, ENV);

  afterEach(() => vi.unstubAllGlobals());

  it('returns the id from a 202 Accepted', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        status: 202,
        json: () => Promise.resolve({ id: 'abc-123' }),
      }),
    );
    expect(await sendReport(payload)).toEqual({ ok: true, id: 'abc-123' });
  });

  it('does not retry a 4xx rejection', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: false, status: 400 });
    vi.stubGlobal('fetch', fetchMock);
    const res = await sendReport(payload);
    expect(res.ok).toBe(false);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('retries once on a 5xx then gives up', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: false, status: 503 });
    vi.stubGlobal('fetch', fetchMock);
    const res = await sendReport(payload);
    expect(res.ok).toBe(false);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('retries once on a network error, succeeding on the second try', async () => {
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new Error('network down'))
      .mockResolvedValueOnce({
        ok: true,
        status: 202,
        json: () => Promise.resolve({ id: 'second-try' }),
      });
    vi.stubGlobal('fetch', fetchMock);
    expect(await sendReport(payload)).toEqual({ ok: true, id: 'second-try' });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('never throws — a failed send returns a result, not an exception', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')));
    await expect(sendReport(payload)).resolves.toMatchObject({ ok: false });
  });
});
