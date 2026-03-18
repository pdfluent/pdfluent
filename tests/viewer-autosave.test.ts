// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary and confidential.
// Free for personal, non-commercial use.
// Commercial use requires a valid license.
// See https://pdfluent.com/license for terms.

import { readFileSync } from 'node:fs';
import { describe, it, expect } from 'vitest';

const source = readFileSync(
  new URL('../src/viewer/state/autosaveManager.ts', import.meta.url),
  'utf8'
);

// ---------------------------------------------------------------------------
// AutosaveConfig interface
// ---------------------------------------------------------------------------

describe('AutosaveConfig', () => {
  it('declares enabled field', () => {
    expect(source).toContain('enabled: boolean');
  });

  it('declares dirtyDebounceMs field', () => {
    expect(source).toContain('dirtyDebounceMs: number');
  });

  it('declares inactivityMs field', () => {
    expect(source).toContain('inactivityMs: number');
  });
});

// ---------------------------------------------------------------------------
// DEFAULT_AUTOSAVE_CONFIG
// ---------------------------------------------------------------------------

describe('DEFAULT_AUTOSAVE_CONFIG', () => {
  it('exports DEFAULT_AUTOSAVE_CONFIG', () => {
    expect(source).toContain('export const DEFAULT_AUTOSAVE_CONFIG');
  });

  it('dirtyDebounceMs is 30 000 ms', () => {
    const block = source.slice(source.indexOf('DEFAULT_AUTOSAVE_CONFIG'), source.indexOf('DEFAULT_AUTOSAVE_CONFIG') + 200);
    expect(block).toContain('30_000');
  });

  it('inactivityMs is 10 000 ms', () => {
    const block = source.slice(source.indexOf('DEFAULT_AUTOSAVE_CONFIG'), source.indexOf('DEFAULT_AUTOSAVE_CONFIG') + 200);
    expect(block).toContain('10_000');
  });
});

// ---------------------------------------------------------------------------
// AutosaveState interface
// ---------------------------------------------------------------------------

describe('AutosaveState', () => {
  it('declares lastSavedAt field', () => {
    expect(source).toContain('lastSavedAt: Date | null');
  });

  it('declares pendingRecoveryPath field', () => {
    expect(source).toContain('pendingRecoveryPath: string | null');
  });

  it('declares isWriting field', () => {
    expect(source).toContain('isWriting: boolean');
  });

  it('exports INITIAL_AUTOSAVE_STATE', () => {
    expect(source).toContain('export const INITIAL_AUTOSAVE_STATE');
  });
});

// ---------------------------------------------------------------------------
// makeRecoveryPath
// ---------------------------------------------------------------------------

describe('makeRecoveryPath', () => {
  it('exports makeRecoveryPath function', () => {
    expect(source).toContain('export function makeRecoveryPath(originalPath: string)');
  });

  it('strips .pdf suffix before appending .autosave.pdf', () => {
    const fnStart = source.indexOf('export function makeRecoveryPath');
    const fnEnd = source.indexOf('\nexport function ', fnStart + 1);
    const body = source.slice(fnStart, fnEnd);
    expect(body).toContain('.replace(/\\.pdf$/i, \'\')');
    expect(body).toContain('.autosave.pdf');
  });
});

// ---------------------------------------------------------------------------
// makeAutosaveStorageKey
// ---------------------------------------------------------------------------

describe('makeAutosaveStorageKey', () => {
  it('exports makeAutosaveStorageKey function', () => {
    expect(source).toContain('export function makeAutosaveStorageKey(originalPath: string)');
  });

  it('key is prefixed with pdfluent.autosave.', () => {
    const fnStart = source.indexOf('export function makeAutosaveStorageKey');
    const fnEnd = source.indexOf('\nexport function ', fnStart + 1);
    const body = source.slice(fnStart, fnEnd);
    expect(body).toContain('pdfluent.autosave.');
  });
});

// ---------------------------------------------------------------------------
// shouldTriggerAutosave
// ---------------------------------------------------------------------------

describe('shouldTriggerAutosave', () => {
  it('exports shouldTriggerAutosave function', () => {
    expect(source).toContain('export function shouldTriggerAutosave(');
  });

  it('returns false when config.enabled is false', () => {
    const fnStart = source.indexOf('export function shouldTriggerAutosave');
    const fnEnd = source.indexOf('\nexport function ', fnStart + 1);
    const body = source.slice(fnStart, fnEnd);
    expect(body).toContain('!config.enabled');
  });

  it('returns false when isDirty is false', () => {
    const fnStart = source.indexOf('export function shouldTriggerAutosave');
    const fnEnd = source.indexOf('\nexport function ', fnStart + 1);
    const body = source.slice(fnStart, fnEnd);
    expect(body).toContain('!isDirty');
  });

  it('triggers on dirty duration exceeding dirtyDebounceMs', () => {
    const fnStart = source.indexOf('export function shouldTriggerAutosave');
    const fnEnd = source.indexOf('\nexport function ', fnStart + 1);
    const body = source.slice(fnStart, fnEnd);
    expect(body).toContain('dirtyDurationMs > config.dirtyDebounceMs');
  });

  it('triggers on inactivity exceeding inactivityMs', () => {
    const fnStart = source.indexOf('export function shouldTriggerAutosave');
    const fnEnd = source.indexOf('\nexport function ', fnStart + 1);
    const body = source.slice(fnStart, fnEnd);
    expect(body).toContain('lastActivityMs > config.inactivityMs');
  });
});

// ---------------------------------------------------------------------------
// Recovery record persistence
// ---------------------------------------------------------------------------

describe('Recovery record helpers', () => {
  it('exports persistRecoveryRecord function', () => {
    expect(source).toContain('export function persistRecoveryRecord(');
  });

  it('persistRecoveryRecord writes to localStorage', () => {
    const fnStart = source.indexOf('export function persistRecoveryRecord');
    const fnEnd = source.indexOf('\nexport function ', fnStart + 1);
    const body = source.slice(fnStart, fnEnd);
    expect(body).toContain('localStorage.setItem(');
    expect(body).toContain('recoveryPath');
    expect(body).toContain('timestamp.toISOString()');
  });

  it('exports readRecoveryRecord function', () => {
    expect(source).toContain('export function readRecoveryRecord(');
  });

  it('readRecoveryRecord reads from localStorage and returns null on failure', () => {
    const fnStart = source.indexOf('export function readRecoveryRecord');
    const fnEnd = source.indexOf('\nexport function ', fnStart + 1);
    const body = source.slice(fnStart, fnEnd);
    expect(body).toContain('localStorage.getItem(');
    expect(body).toContain('return null');
  });

  it('exports clearRecoveryRecord function', () => {
    expect(source).toContain('export function clearRecoveryRecord(');
  });

  it('clearRecoveryRecord calls localStorage.removeItem', () => {
    const fnStart = source.indexOf('export function clearRecoveryRecord');
    const body = source.slice(fnStart, fnStart + 200);
    expect(body).toContain('localStorage.removeItem(');
  });
});
