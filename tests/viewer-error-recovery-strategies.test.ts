// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary and confidential.
// Free for personal, non-commercial use.
// Commercial use requires a valid license.
// See https://pdfluent.com/license for terms.

import { readFileSync } from 'node:fs';
import { describe, it, expect } from 'vitest';

const source = readFileSync(
  new URL('../src/viewer/recovery/errorRecoveryStrategies.ts', import.meta.url),
  'utf8'
);

describe('RecoveryStrategy', () => {
  it('exports RecoveryStrategy type with all values', () => {
    expect(source).toContain("export type RecoveryStrategy = 'retry'");
    expect(source).toContain("'fallback'");
    expect(source).toContain("'reset'");
    expect(source).toContain("'ignore'");
  });
});

describe('RecoveryAction', () => {
  it('declares strategy field', () => {
    const s = source.indexOf('interface RecoveryAction');
    expect(source.slice(s, source.indexOf('\n}', s) + 2)).toContain('strategy: RecoveryStrategy');
  });

  it('declares description field', () => {
    const s = source.indexOf('interface RecoveryAction');
    expect(source.slice(s, source.indexOf('\n}', s) + 2)).toContain('description: string');
  });

  it('declares canAutoRecover boolean', () => {
    const s = source.indexOf('interface RecoveryAction');
    expect(source.slice(s, source.indexOf('\n}', s) + 2)).toContain('canAutoRecover: boolean');
  });
});

describe('isRetryableError', () => {
  it('exports isRetryableError function', () => {
    expect(source).toContain('export function isRetryableError(error: string)');
  });

  it('detects timeout errors', () => {
    const fn = source.indexOf('export function isRetryableError');
    const body = source.slice(fn, source.indexOf('\n}', fn) + 2);
    expect(body).toContain("'timeout'");
  });

  it('detects network errors', () => {
    const fn = source.indexOf('export function isRetryableError');
    const body = source.slice(fn, source.indexOf('\n}', fn) + 2);
    expect(body).toContain("'network'");
  });

  it('detects connection errors', () => {
    const fn = source.indexOf('export function isRetryableError');
    const body = source.slice(fn, source.indexOf('\n}', fn) + 2);
    expect(body).toContain("'connection'");
  });
});

describe('getDocumentLoadRecovery', () => {
  it('exports getDocumentLoadRecovery function', () => {
    expect(source).toContain('export function getDocumentLoadRecovery(error: string)');
  });

  it('handles not found error with fallback', () => {
    const fn = source.indexOf('export function getDocumentLoadRecovery');
    const body = source.slice(fn, source.indexOf('\nexport function ', fn + 1));
    expect(body).toContain('not found');
    expect(body).toContain("strategy: 'fallback'");
  });

  it('handles permission error', () => {
    const fn = source.indexOf('export function getDocumentLoadRecovery');
    const body = source.slice(fn, source.indexOf('\nexport function ', fn + 1));
    expect(body).toContain('permission');
  });

  it('handles encrypted error', () => {
    const fn = source.indexOf('export function getDocumentLoadRecovery');
    const body = source.slice(fn, source.indexOf('\nexport function ', fn + 1));
    expect(body).toContain('encrypted');
  });

  it('defaults to reset', () => {
    const fn = source.indexOf('export function getDocumentLoadRecovery');
    const body = source.slice(fn, source.indexOf('\nexport function ', fn + 1));
    expect(body).toContain("strategy: 'reset'");
  });
});

describe('getAnnotationLoadRecovery', () => {
  it('exports getAnnotationLoadRecovery function', () => {
    expect(source).toContain('export function getAnnotationLoadRecovery(');
  });

  it('always returns fallback strategy', () => {
    const fn = source.indexOf('export function getAnnotationLoadRecovery');
    const body = source.slice(fn, source.indexOf('\nexport function ', fn + 1));
    expect(body).toContain("strategy: 'fallback'");
  });

  it('sets canAutoRecover: true', () => {
    const fn = source.indexOf('export function getAnnotationLoadRecovery');
    const body = source.slice(fn, source.indexOf('\nexport function ', fn + 1));
    expect(body).toContain('canAutoRecover: true');
  });
});

describe('getTauriInvokeRecovery', () => {
  it('exports getTauriInvokeRecovery function', () => {
    expect(source).toContain('export function getTauriInvokeRecovery(command: string, error: string)');
  });

  it('retries retryable errors with canAutoRecover: true', () => {
    const fn = source.indexOf('export function getTauriInvokeRecovery');
    const body = source.slice(fn, source.indexOf('\nexport function ', fn + 1));
    expect(body).toContain('isRetryableError(error)');
    expect(body).toContain("strategy: 'retry'");
    expect(body).toContain('canAutoRecover: true');
  });

  it('defaults to reset', () => {
    const fn = source.indexOf('export function getTauriInvokeRecovery');
    const body = source.slice(fn, source.indexOf('\nexport function ', fn + 1));
    expect(body).toContain("strategy: 'reset'");
  });
});

describe('getAiRequestRecovery', () => {
  it('exports getAiRequestRecovery function', () => {
    expect(source).toContain('export function getAiRequestRecovery(');
  });

  it('always returns ignore strategy', () => {
    const fn = source.indexOf('export function getAiRequestRecovery');
    const body = source.slice(fn, source.indexOf('\n}', fn) + 2);
    expect(body).toContain("strategy: 'ignore'");
  });

  it('sets canAutoRecover: false', () => {
    const fn = source.indexOf('export function getAiRequestRecovery');
    const body = source.slice(fn, source.indexOf('\n}', fn) + 2);
    expect(body).toContain('canAutoRecover: false');
  });
});
