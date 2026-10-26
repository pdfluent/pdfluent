// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary. The PDFluent application is free to use,
// including for commercial purposes. Redistribution, or extraction or reuse
// of its components (including the embedded PDF engine), requires a licence.
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

// A failed open is explained by viewer/state/openError.ts from the backend's
// code. The string-matching getDocumentLoadRecovery that sat here carried two
// hard-coded Dutch hints ("Versleuteld bestand — voer het wachtwoord in") and
// was imported by nothing; it is gone, and so is every literal description.
describe('no hard-coded user text', () => {
  it('has no getDocumentLoadRecovery left to drift from the open path', () => {
    expect(source).not.toContain('getDocumentLoadRecovery');
  });

  it('takes every description from i18n', () => {
    const literal = source.match(/description:\s*['"`]/g) ?? [];
    expect(literal).toEqual([]);
  });

  it('answers a retryable command failure in the active language', async () => {
    const { default: i18n } = await import('../src/i18n');
    const { getTauriInvokeRecovery } = await import('../src/viewer/recovery/errorRecoveryStrategies');
    await i18n.changeLanguage('en');
    const en = getTauriInvokeRecovery('render_page', 'network timeout');
    expect(en.strategy).toBe('retry');
    expect(en.description).toBe(i18n.t('errors.commandRetrying', { command: 'render_page' }));
    expect(en.description).toContain('render_page');
    expect(en.description).not.toMatch(/Tijdelijke|opnieuw/);
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
