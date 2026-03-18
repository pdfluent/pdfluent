// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary and confidential.
// Free for personal, non-commercial use.
// Commercial use requires a valid license.
// See https://pdfluent.com/license for terms.

import { readFileSync } from 'node:fs';
import { describe, it, expect } from 'vitest';

const source = readFileSync(
  new URL('../src/viewer/recovery/sessionHealthMonitor.ts', import.meta.url),
  'utf8'
);

describe('SessionHealthStatus', () => {
  it('exports SessionHealthStatus with all values', () => {
    expect(source).toContain("export type SessionHealthStatus = 'healthy'");
    expect(source).toContain("'degraded'");
    expect(source).toContain("'critical'");
  });
});

describe('SessionHealthCheck', () => {
  it('declares name field', () => {
    const s = source.indexOf('interface SessionHealthCheck');
    expect(source.slice(s, source.indexOf('\n}', s) + 2)).toContain('name: string');
  });

  it('declares passed boolean', () => {
    const s = source.indexOf('interface SessionHealthCheck');
    expect(source.slice(s, source.indexOf('\n}', s) + 2)).toContain('passed: boolean');
  });

  it('declares severity field', () => {
    const s = source.indexOf('interface SessionHealthCheck');
    expect(source.slice(s, source.indexOf('\n}', s) + 2)).toContain("severity: 'warning' | 'error'");
  });
});

describe('SessionHealthReport', () => {
  it('declares status field', () => {
    const s = source.indexOf('interface SessionHealthReport');
    expect(source.slice(s, source.indexOf('\n}', s) + 2)).toContain('status: SessionHealthStatus');
  });

  it('declares checks array', () => {
    const s = source.indexOf('interface SessionHealthReport');
    expect(source.slice(s, source.indexOf('\n}', s) + 2)).toContain('checks: SessionHealthCheck[]');
  });

  it('declares issueCount field', () => {
    const s = source.indexOf('interface SessionHealthReport');
    expect(source.slice(s, source.indexOf('\n}', s) + 2)).toContain('issueCount: number');
  });

  it('declares timestamp field', () => {
    const s = source.indexOf('interface SessionHealthReport');
    expect(source.slice(s, source.indexOf('\n}', s) + 2)).toContain('timestamp: string');
  });
});

describe('HEALTH_REPORT_INTERVAL_MS', () => {
  it('exports HEALTH_REPORT_INTERVAL_MS = 30_000', () => {
    expect(source).toContain('export const HEALTH_REPORT_INTERVAL_MS = 30_000');
  });
});

describe('checkDocumentLoaded', () => {
  it('exports checkDocumentLoaded function', () => {
    expect(source).toContain('export function checkDocumentLoaded(pdfDoc: unknown)');
  });

  it('passes when pdfDoc is not null or undefined', () => {
    const fn = source.indexOf('export function checkDocumentLoaded');
    const body = source.slice(fn, source.indexOf('\n}', fn) + 2);
    expect(body).toContain('null');
    expect(body).toContain('undefined');
  });

  it('has error severity', () => {
    const fn = source.indexOf('export function checkDocumentLoaded');
    const body = source.slice(fn, source.indexOf('\n}', fn) + 2);
    expect(body).toContain("severity: 'error'");
  });
});

describe('checkPageBounds', () => {
  it('exports checkPageBounds function', () => {
    expect(source).toContain('export function checkPageBounds(page: number, pageCount: number)');
  });

  it('checks page >= 1 and page <= pageCount', () => {
    const fn = source.indexOf('export function checkPageBounds');
    const body = source.slice(fn, source.indexOf('\n}', fn) + 2);
    expect(body).toContain('page >= 1');
    expect(body).toContain('page <= pageCount');
  });

  it('has warning severity', () => {
    const fn = source.indexOf('export function checkPageBounds');
    const body = source.slice(fn, source.indexOf('\n}', fn) + 2);
    expect(body).toContain("severity: 'warning'");
  });
});

describe('checkAnnotationCount', () => {
  it('exports checkAnnotationCount function', () => {
    expect(source).toContain('export function checkAnnotationCount(count: number, threshold: number)');
  });

  it('passes when count <= threshold', () => {
    const fn = source.indexOf('export function checkAnnotationCount');
    const body = source.slice(fn, source.indexOf('\n}', fn) + 2);
    expect(body).toContain('count <= threshold');
  });
});

describe('buildHealthReport', () => {
  it('exports buildHealthReport function', () => {
    expect(source).toContain('export function buildHealthReport(checks: SessionHealthCheck[])');
  });

  it('sets critical when error checks fail', () => {
    const fn = source.indexOf('export function buildHealthReport');
    const body = source.slice(fn, source.indexOf('\nexport function ', fn + 1));
    expect(body).toContain("severity === 'error'");
    expect(body).toContain("status = 'critical'");
  });

  it('sets degraded when warning checks fail', () => {
    const fn = source.indexOf('export function buildHealthReport');
    const body = source.slice(fn, source.indexOf('\nexport function ', fn + 1));
    expect(body).toContain("severity === 'warning'");
    expect(body).toContain("status = 'degraded'");
  });

  it('sets healthy when all checks pass', () => {
    const fn = source.indexOf('export function buildHealthReport');
    const body = source.slice(fn, source.indexOf('\nexport function ', fn + 1));
    expect(body).toContain("status = 'healthy'");
  });

  it('counts failed checks as issueCount', () => {
    const fn = source.indexOf('export function buildHealthReport');
    const body = source.slice(fn, source.indexOf('\nexport function ', fn + 1));
    expect(body).toContain('failed.length');
    expect(body).toContain('issueCount');
  });
});

describe('isSessionHealthy', () => {
  it('exports isSessionHealthy function', () => {
    expect(source).toContain('export function isSessionHealthy(report: SessionHealthReport)');
  });

  it('returns true for healthy status', () => {
    const fn = source.indexOf('export function isSessionHealthy');
    const body = source.slice(fn, source.indexOf('\n}', fn) + 2);
    expect(body).toContain("report.status === 'healthy'");
  });
});
