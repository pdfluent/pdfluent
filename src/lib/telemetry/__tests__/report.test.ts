// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary. The PDFluent application is free to use,
// including for commercial purposes. Redistribution, or extraction or reuse
// of its components (including the embedded PDF engine), requires a licence.
// See https://pdfluent.com/license for terms.

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import type { MockedFunction } from 'vitest';
import {
  CRASH_REPORT_RETENTION_DAYS,
  LOCAL_CRASH_REPORTS_KEY,
  readLocalCrashReports,
  type KeyValueStore,
} from '../localCrashReports';

// Hoisted above imports — vitest moves vi.mock to the top.
vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(),
}));

import { invoke } from '@tauri-apps/api/core';
import {
  buildReport,
  sendReport,
  removeAllCrashReports,
  removeCrashReport,
  getEnvironment,
  REPORT_ENDPOINT,
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

function memoryStore(): KeyValueStore & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return {
    data,
    getItem: (k) => data.get(k) ?? null,
    setItem: (k, v) => void data.set(k, v),
  };
}

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
    expect(await sendReport(payload, memoryStore())).toEqual({ ok: true, id: 'abc-123', deleteToken: null });
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
    expect(await sendReport(payload, memoryStore())).toEqual({ ok: true, id: 'second-try', deleteToken: null });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('never throws — a failed send returns a result, not an exception', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')));
    await expect(sendReport(payload)).resolves.toMatchObject({ ok: false });
  });
});

describe('deleting a crash report', () => {
  const payload = buildReport({ type: 'crash', message: 'boom' }, ENV);
  const accepted = (id: string, token: string) =>
    vi.fn().mockResolvedValue({ ok: true, status: 202, json: () => Promise.resolve({ id, delete_token: token }) });

  afterEach(() => vi.unstubAllGlobals());

  it('keeps the id and delete token of a sent report on this machine', async () => {
    const store = memoryStore();
    vi.stubGlobal('fetch', accepted('r-1', 'tok-1'));
    expect(await sendReport(payload, store)).toEqual({ ok: true, id: 'r-1', deleteToken: 'tok-1' });
    expect(readLocalCrashReports(store)).toEqual([
      { id: 'r-1', deleteToken: 'tok-1', sentAt: expect.any(String) },
    ]);
  });

  it('keeps nothing when the send failed', async () => {
    const store = memoryStore();
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 400 }));
    await sendReport(payload, store);
    expect(store.data.has(LOCAL_CRASH_REPORTS_KEY)).toBe(false);
  });

  it('sends the token to the one report it belongs to, and only when the user asked', async () => {
    const fetchImpl = vi.fn(async () => new Response(null, { status: 204 }));
    const receipt = { id: 'r-1', deleteToken: 'tok-1' };
    expect(await removeCrashReport(receipt, { userRequested: false, fetchImpl: fetchImpl as unknown as typeof fetch })).toBe(false);
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(await removeCrashReport(receipt, { userRequested: true, fetchImpl: fetchImpl as unknown as typeof fetch })).toBe(true);
    expect(fetchImpl).toHaveBeenCalledWith(`${REPORT_ENDPOINT}/r-1`, {
      method: 'DELETE',
      headers: { 'X-Delete-Token': 'tok-1' },
    });
  });

  it('treats a report the server no longer has as deleted, and a refusal as not deleted', async () => {
    const answer = (status: number) => vi.fn(async () => new Response(null, { status })) as unknown as typeof fetch;
    const receipt = { id: 'r-1', deleteToken: 'tok-1' };
    expect(await removeCrashReport(receipt, { userRequested: true, fetchImpl: answer(404) })).toBe(true);
    expect(await removeCrashReport(receipt, { userRequested: true, fetchImpl: answer(403) })).toBe(false);
    expect(await removeCrashReport(receipt, { userRequested: true, fetchImpl: answer(500) })).toBe(false);
  });

  it('forgets what was deleted and keeps what failed', async () => {
    const store = memoryStore();
    for (const n of ['a', 'b', 'c']) {
      vi.stubGlobal('fetch', accepted(`r-${n}`, `tok-${n}`));
      await sendReport(payload, store);
    }
    const fetchImpl = vi.fn(async (url: string) =>
      new Response(null, { status: url.endsWith('/r-b') ? 500 : 204 }),
    );
    const result = await removeAllCrashReports({ userRequested: true, fetchImpl: fetchImpl as unknown as typeof fetch, store });
    expect(result).toEqual({ removed: 2, failed: 1 });
    expect(readLocalCrashReports(store).map((r) => r.id)).toEqual(['r-b']);
  });

  it('deletes nothing without a request from the user', async () => {
    const store = memoryStore();
    vi.stubGlobal('fetch', accepted('r-1', 'tok-1'));
    await sendReport(payload, store);
    const fetchImpl = vi.fn();
    expect(await removeAllCrashReports({ userRequested: false, fetchImpl: fetchImpl as unknown as typeof fetch, store })).toEqual({ removed: 0, failed: 0 });
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(readLocalCrashReports(store)).toHaveLength(1);
  });

  it('stops listing a report once the server has dropped it by retention', () => {
    const store = memoryStore();
    const day = 86_400_000;
    const now = Date.parse('2027-01-20T12:00:00Z');
    store.setItem(
      LOCAL_CRASH_REPORTS_KEY,
      JSON.stringify([
        { id: 'young', deleteToken: 't', sentAt: new Date(now - (CRASH_REPORT_RETENTION_DAYS - 1) * day).toISOString() },
        { id: 'old', deleteToken: 't', sentAt: new Date(now - CRASH_REPORT_RETENTION_DAYS * day).toISOString() },
      ]),
    );
    expect(readLocalCrashReports(store, now).map((r) => r.id)).toEqual(['young']);
  });

  it('agrees with the Worker on how long a crash report lives', async () => {
    const worker = (await import('../../../../infra/report-worker/src/reports.js')) as { REPORT_RETENTION: { reportDays: number } };
    expect(CRASH_REPORT_RETENTION_DAYS).toBe(worker.REPORT_RETENTION.reportDays);
  });
});
