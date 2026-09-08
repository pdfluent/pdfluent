// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary. The PDFluent application is free to use,
// including for commercial purposes. Redistribution, or extraction or reuse
// of its components (including the embedded PDF engine), requires a licence.
// See https://pdfluent.com/license for terms.

/**
 * Text Mutation Messaging — Phase 4 Batch 5
 *
 * Verifies the UX messaging layer for unsupported and rejected edits:
 * - getUnsupportedMessage returns a message for every support class
 * - getUnsupportedMessage uses reason-code-level message when available
 * - getBackendRejectionMessage covers all documented rejection codes
 * - getBackendRejectionMessage falls back gracefully for unknown codes
 * - getSupportClassTooltip returns a non-empty string for every support class
 * - isSupportClassWritable is true only for writable_digital_text
 * - All messages are non-empty strings (both tooltip and explanation)
 * - actionable flag is set correctly per message
 */

import { describe, it, expect } from 'vitest';
import {
  getUnsupportedMessage,
  getBackendRejectionMessage,
  getSupportClassTooltip,
  isSupportClassWritable,
} from '../src/viewer/text/textMutationMessaging';
import type { MutationMessage } from '../src/viewer/text/textMutationMessaging';
import type { TextMutationSupportResult } from '../src/viewer/text/textMutationSupport';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeSupportResult(
  supportClass: TextMutationSupportResult['supportClass'],
  reasonCode: TextMutationSupportResult['reasonCode'],
): TextMutationSupportResult {
  return {
    supportClass,
    reasonCode,
    label: 'test',
    writable: supportClass === 'writable_digital_text',
    constraints: null,
  };
}

function expectValidMessage(msg: MutationMessage) {
  expect(typeof msg.tooltip).toBe('string');
  expect(msg.tooltip.length).toBeGreaterThan(0);
  expect(typeof msg.explanation).toBe('string');
  expect(msg.explanation.length).toBeGreaterThan(0);
  expect(typeof msg.actionable).toBe('boolean');
}

// ---------------------------------------------------------------------------
// getUnsupportedMessage — support classes
// ---------------------------------------------------------------------------

describe('getUnsupportedMessage — support class coverage', () => {
  it('returns a valid message for writable_digital_text', () => {
    const msg = getUnsupportedMessage(makeSupportResult('writable_digital_text', 'single-span-digital'));
    expectValidMessage(msg);
  });

  it('returns a valid message for non_writable_digital_text', () => {
    const msg = getUnsupportedMessage(makeSupportResult('non_writable_digital_text', 'multi-span-unsupported'));
    expectValidMessage(msg);
  });

  it('returns a valid message for ocr_read_only', () => {
    const msg = getUnsupportedMessage(makeSupportResult('ocr_read_only', 'ocr-source'));
    expectValidMessage(msg);
  });

  it('returns a valid message for protected_or_locked', () => {
    const msg = getUnsupportedMessage(makeSupportResult('protected_or_locked', 'protected-content'));
    expectValidMessage(msg);
  });

  it('returns a valid message for unknown_structure', () => {
    const msg = getUnsupportedMessage(makeSupportResult('unknown_structure', 'unknown-source'));
    expectValidMessage(msg);
  });
});

// ---------------------------------------------------------------------------
// getUnsupportedMessage — reason code specificity
// ---------------------------------------------------------------------------

describe('getUnsupportedMessage — reason code specificity', () => {
  it('multi-span-unsupported returns a reason-specific message', () => {
    const msg = getUnsupportedMessage(makeSupportResult('non_writable_digital_text', 'multi-span-unsupported'));
    // Reason-code message is more specific than the class-level fallback
    expect(msg.tooltip).toContain('lettertype');
  });

  it('multi-line-unsupported returns a reason-specific message', () => {
    const msg = getUnsupportedMessage(makeSupportResult('non_writable_digital_text', 'multi-line-unsupported'));
    expect(msg.tooltip).toContain('regels');
  });

  it('ocr-source returns a reason-specific message mentioning OCR', () => {
    const msg = getUnsupportedMessage(makeSupportResult('ocr_read_only', 'ocr-source'));
    expect(msg.explanation).toContain('OCR');
  });

  it('unknown-source falls back to support class message', () => {
    const msg = getUnsupportedMessage(makeSupportResult('unknown_structure', 'unknown-source'));
    // No reason-code override for unknown-source → falls back to support class
    expectValidMessage(msg);
  });

  it('single-span-digital falls back to support class message', () => {
    const msg = getUnsupportedMessage(makeSupportResult('writable_digital_text', 'single-span-digital'));
    expectValidMessage(msg);
  });
});

// ---------------------------------------------------------------------------
// getBackendRejectionMessage — all documented rejection codes
// ---------------------------------------------------------------------------

describe('getBackendRejectionMessage — rejection code coverage', () => {
  it('returns valid message for replacement-too-long', () => {
    expectValidMessage(getBackendRejectionMessage('replacement-too-long'));
  });

  it('returns valid message for text-not-found-in-content-stream', () => {
    expectValidMessage(getBackendRejectionMessage('text-not-found-in-content-stream'));
  });

  it('returns valid message for no-content-stream', () => {
    expectValidMessage(getBackendRejectionMessage('no-content-stream'));
  });

  it('returns valid message for empty-original-text', () => {
    expectValidMessage(getBackendRejectionMessage('empty-original-text'));
  });

  it('returns valid message for page-not-found', () => {
    expectValidMessage(getBackendRejectionMessage('page-not-found'));
  });

  it('returns valid message for encoding-not-supported', () => {
    expectValidMessage(getBackendRejectionMessage('encoding-not-supported'));
  });

  it('returns valid message for internal-error', () => {
    expectValidMessage(getBackendRejectionMessage('internal-error'));
  });

  // The typed refusals the text_edit session added (#400). Each one must read
  // as its own reason; falling back to the internal-error text would tell the
  // user their PDF broke when in fact it is signed, protected or tagged.
  it.each([
    'document-signed',
    'permissions-denied',
    'tagged-text-conflict',
    'unsupported-container',
    'mixed-style-span',
  ])('%s is a reason of its own, not the internal-error text', (code) => {
    const message = getBackendRejectionMessage(code);
    expectValidMessage(message);
    expect(message.tooltip).not.toBe(getBackendRejectionMessage('internal-error').tooltip);
  });

  it('says a smaller selection is worth trying, and does not pretend the others are', () => {
    expect(getBackendRejectionMessage('mixed-style-span').actionable).toBe(true);
    expect(getBackendRejectionMessage('document-signed').actionable).toBe(false);
    expect(getBackendRejectionMessage('tagged-text-conflict').actionable).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// getBackendRejectionMessage — unknown code fallback
// ---------------------------------------------------------------------------

describe('getBackendRejectionMessage — unknown code fallback', () => {
  it('returns a message for an unknown rejection code', () => {
    const msg = getBackendRejectionMessage('completely-unknown-code');
    expectValidMessage(msg);
  });

  it('falls back to the internal-error headline for an unknown code', () => {
    const unknown = getBackendRejectionMessage('nonexistent-code');
    const internal = getBackendRejectionMessage('internal-error');
    expect(unknown.tooltip).toBe(internal.tooltip);
  });

  it('keeps the unknown code itself in the explanation', () => {
    // The generic message used to replace the one sentence that named the real
    // cause, so every rejection the writer had no code for read the same.
    expect(getBackendRejectionMessage('nonexistent-code').explanation)
      .toContain('nonexistent-code');
  });

  it('keeps a thrown engine message alongside a known code', () => {
    const message = getBackendRejectionMessage('page-not-found', 'page 12 of 8 requested');
    expect(message.explanation).toContain('page 12 of 8 requested');
  });
});

// ---------------------------------------------------------------------------
// getBackendRejectionMessage — actionable flag
// ---------------------------------------------------------------------------

describe('getBackendRejectionMessage — actionable flag', () => {
  it('replacement-too-long is actionable (user can shorten)', () => {
    expect(getBackendRejectionMessage('replacement-too-long').actionable).toBe(true);
  });

  it('text-not-found-in-content-stream is not actionable', () => {
    expect(getBackendRejectionMessage('text-not-found-in-content-stream').actionable).toBe(false);
  });

  it('encoding-not-supported is not actionable', () => {
    expect(getBackendRejectionMessage('encoding-not-supported').actionable).toBe(false);
  });

  it('internal-error is actionable (retry)', () => {
    expect(getBackendRejectionMessage('internal-error').actionable).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// getSupportClassTooltip
// ---------------------------------------------------------------------------

describe('getSupportClassTooltip', () => {
  it('returns non-empty string for writable_digital_text', () => {
    expect(getSupportClassTooltip('writable_digital_text').length).toBeGreaterThan(0);
  });

  it('returns non-empty string for non_writable_digital_text', () => {
    expect(getSupportClassTooltip('non_writable_digital_text').length).toBeGreaterThan(0);
  });

  it('returns non-empty string for ocr_read_only', () => {
    expect(getSupportClassTooltip('ocr_read_only').length).toBeGreaterThan(0);
  });

  it('returns non-empty string for protected_or_locked', () => {
    expect(getSupportClassTooltip('protected_or_locked').length).toBeGreaterThan(0);
  });

  it('returns non-empty string for unknown_structure', () => {
    expect(getSupportClassTooltip('unknown_structure').length).toBeGreaterThan(0);
  });

  it('writable_digital_text tooltip indicates editability', () => {
    expect(getSupportClassTooltip('writable_digital_text')).toContain('bewerken');
  });

  it('ocr_read_only tooltip indicates read-only', () => {
    const tooltip = getSupportClassTooltip('ocr_read_only');
    expect(tooltip.toLowerCase()).toContain('lezen');
  });
});

// ---------------------------------------------------------------------------
// isSupportClassWritable
// ---------------------------------------------------------------------------

describe('isSupportClassWritable', () => {
  it('returns true for writable_digital_text', () => {
    expect(isSupportClassWritable('writable_digital_text')).toBe(true);
  });

  it('returns false for non_writable_digital_text', () => {
    expect(isSupportClassWritable('non_writable_digital_text')).toBe(false);
  });

  it('returns false for ocr_read_only', () => {
    expect(isSupportClassWritable('ocr_read_only')).toBe(false);
  });

  it('returns false for protected_or_locked', () => {
    expect(isSupportClassWritable('protected_or_locked')).toBe(false);
  });

  it('returns false for unknown_structure', () => {
    expect(isSupportClassWritable('unknown_structure')).toBe(false);
  });
});
