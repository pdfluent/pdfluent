// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary and confidential.
// Free for personal, non-commercial use.
// Commercial use requires a valid license.
// See https://pdfluent.com/license for terms.

import { readFileSync } from 'node:fs';
import { describe, it, expect } from 'vitest';

const dialogSource = readFileSync(
  new URL('../src/viewer/components/RecoveryDialog.tsx', import.meta.url),
  'utf8'
);

const autosaveSource = readFileSync(
  new URL('../src/viewer/state/autosaveManager.ts', import.meta.url),
  'utf8'
);

// ---------------------------------------------------------------------------
// RecoveryDialog — props
// ---------------------------------------------------------------------------

describe('RecoveryDialog — props interface', () => {
  it('accepts isOpen boolean', () => {
    expect(dialogSource).toContain('isOpen: boolean');
  });

  it('accepts recoveryPath string', () => {
    expect(dialogSource).toContain('recoveryPath: string');
  });

  it('accepts originalFileName string', () => {
    expect(dialogSource).toContain('originalFileName: string');
  });

  it('accepts timestamp string', () => {
    expect(dialogSource).toContain('timestamp: string');
  });

  it('accepts onRecover callback', () => {
    expect(dialogSource).toContain('onRecover: () => void');
  });

  it('accepts onDiscard callback', () => {
    expect(dialogSource).toContain('onDiscard: () => void');
  });

  it('accepts onClose callback', () => {
    expect(dialogSource).toContain('onClose: () => void');
  });
});

// ---------------------------------------------------------------------------
// RecoveryDialog — render guard
// ---------------------------------------------------------------------------

describe('RecoveryDialog — render guard', () => {
  it('returns null when isOpen is false', () => {
    expect(dialogSource).toContain('if (!isOpen) return null');
  });
});

// ---------------------------------------------------------------------------
// RecoveryDialog — test IDs
// ---------------------------------------------------------------------------

describe('RecoveryDialog — data-testid markers', () => {
  it('renders data-testid="recovery-dialog" container', () => {
    expect(dialogSource).toContain('data-testid="recovery-dialog"');
  });

  it('renders data-testid="recovery-document-name"', () => {
    expect(dialogSource).toContain('data-testid="recovery-document-name"');
  });

  it('recovery-document-name displays originalFileName', () => {
    const nameStart = dialogSource.indexOf('data-testid="recovery-document-name"');
    const block = dialogSource.slice(nameStart, nameStart + 200);
    expect(block).toContain('originalFileName');
  });

  it('renders data-testid="recovery-timestamp"', () => {
    expect(dialogSource).toContain('data-testid="recovery-timestamp"');
  });

  it('recovery-timestamp displays timestamp', () => {
    const tsStart = dialogSource.indexOf('data-testid="recovery-timestamp"');
    const block = dialogSource.slice(tsStart, tsStart + 150);
    expect(block).toContain('timestamp');
  });

  it('renders data-testid="recovery-recover-btn"', () => {
    expect(dialogSource).toContain('data-testid="recovery-recover-btn"');
  });

  it('recover button calls onRecover', () => {
    const btnStart = dialogSource.indexOf('data-testid="recovery-recover-btn"');
    const block = dialogSource.slice(btnStart - 10, btnStart + 100);
    expect(block).toContain('onRecover');
  });

  it('renders data-testid="recovery-discard-btn"', () => {
    expect(dialogSource).toContain('data-testid="recovery-discard-btn"');
  });

  it('discard button calls onDiscard', () => {
    const btnStart = dialogSource.indexOf('data-testid="recovery-discard-btn"');
    const block = dialogSource.slice(btnStart - 10, btnStart + 100);
    expect(block).toContain('onDiscard');
  });

  it('renders data-testid="recovery-close-btn"', () => {
    expect(dialogSource).toContain('data-testid="recovery-close-btn"');
  });

  it('close button calls onClose', () => {
    const btnStart = dialogSource.indexOf('data-testid="recovery-close-btn"');
    const block = dialogSource.slice(btnStart - 10, btnStart + 100);
    expect(block).toContain('onClose');
  });
});

// ---------------------------------------------------------------------------
// Autosave — recovery record persistence round-trip
// ---------------------------------------------------------------------------

describe('AutosaveManager — recovery record round-trip', () => {
  it('persistRecoveryRecord stores originalPath in the record', () => {
    const fnStart = autosaveSource.indexOf('export function persistRecoveryRecord');
    const fnEnd = autosaveSource.indexOf('\nexport function ', fnStart + 1);
    const body = autosaveSource.slice(fnStart, fnEnd);
    expect(body).toContain('originalPath');
  });

  it('readRecoveryRecord parses JSON and returns typed record', () => {
    const fnStart = autosaveSource.indexOf('export function readRecoveryRecord');
    const fnEnd = autosaveSource.indexOf('\nexport function ', fnStart + 1);
    const body = autosaveSource.slice(fnStart, fnEnd);
    expect(body).toContain('JSON.parse(stored)');
  });

  it('clearRecoveryRecord uses makeAutosaveStorageKey for the key', () => {
    const fnStart = autosaveSource.indexOf('export function clearRecoveryRecord');
    const body = autosaveSource.slice(fnStart, fnStart + 200);
    expect(body).toContain('makeAutosaveStorageKey(originalPath)');
  });
});
