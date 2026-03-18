// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary and confidential.
// Free for personal, non-commercial use.
// Commercial use requires a valid license.
// See https://pdfluent.com/license for terms.

/**
 * BusyStateOverlay Tests — ACROBAT_CLASS_RELIABILITY_AND_UX_HARDENING_BLOCK Batch 5
 *
 * Verified:
 * - clampProgress: clamps to [0, 100], null for null/undefined
 * - severityClass: produces correct CSS class suffix
 * - buildAriaLabel: with and without progress
 * - isProgressComplete: threshold at 100
 * - Component exports are present (source readiness)
 * - All BusySeverity values have CSS classes
 */

import { describe, it, expect } from 'vitest';
import {
  clampProgress,
  severityClass,
  buildAriaLabel,
  isProgressComplete,
  BusyStateOverlay,
} from '../src/viewer/components/BusyStateOverlay';
import type { BusySeverity } from '../src/viewer/components/BusyStateOverlay';

// ---------------------------------------------------------------------------
// clampProgress
// ---------------------------------------------------------------------------

describe('BusyStateOverlay — clampProgress', () => {
  it('returns null for null input', () => {
    expect(clampProgress(null)).toBeNull();
  });

  it('returns null for undefined input', () => {
    expect(clampProgress(undefined)).toBeNull();
  });

  it('returns 0 for negative values', () => {
    expect(clampProgress(-10)).toBe(0);
  });

  it('returns 100 for values above 100', () => {
    expect(clampProgress(150)).toBe(100);
  });

  it('returns value unchanged for values in range', () => {
    expect(clampProgress(0)).toBe(0);
    expect(clampProgress(50)).toBe(50);
    expect(clampProgress(100)).toBe(100);
  });

  it('clamps fractional values correctly', () => {
    expect(clampProgress(-0.1)).toBe(0);
    expect(clampProgress(100.1)).toBe(100);
  });
});

// ---------------------------------------------------------------------------
// severityClass
// ---------------------------------------------------------------------------

describe('BusyStateOverlay — severityClass', () => {
  const severities: BusySeverity[] = ['neutral', 'warning', 'error'];

  for (const sev of severities) {
    it(`${sev} produces correct CSS class`, () => {
      expect(severityClass(sev)).toBe(`busy-overlay--${sev}`);
    });
  }
});

// ---------------------------------------------------------------------------
// buildAriaLabel
// ---------------------------------------------------------------------------

describe('BusyStateOverlay — buildAriaLabel', () => {
  it('returns just the label when progress is null', () => {
    expect(buildAriaLabel('Saving...', null)).toBe('Saving...');
  });

  it('appends progress percentage when provided', () => {
    expect(buildAriaLabel('Exporting', 75)).toBe('Exporting (75%)');
  });

  it('rounds fractional progress', () => {
    expect(buildAriaLabel('Loading', 33.7)).toBe('Loading (34%)');
  });

  it('handles 0% progress', () => {
    expect(buildAriaLabel('Starting', 0)).toBe('Starting (0%)');
  });

  it('handles 100% progress', () => {
    expect(buildAriaLabel('Done', 100)).toBe('Done (100%)');
  });
});

// ---------------------------------------------------------------------------
// isProgressComplete
// ---------------------------------------------------------------------------

describe('BusyStateOverlay — isProgressComplete', () => {
  it('returns false for null', () => {
    expect(isProgressComplete(null)).toBe(false);
  });

  it('returns false for values below 100', () => {
    expect(isProgressComplete(99)).toBe(false);
    expect(isProgressComplete(0)).toBe(false);
  });

  it('returns true for 100', () => {
    expect(isProgressComplete(100)).toBe(true);
  });

  it('returns true for values above 100', () => {
    expect(isProgressComplete(101)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Source readiness
// ---------------------------------------------------------------------------

describe('BusyStateOverlay — source readiness', () => {
  it('BusyStateOverlay is a function (component)', () => {
    expect(typeof BusyStateOverlay).toBe('function');
  });

  it('clampProgress is exported and callable', () => {
    expect(typeof clampProgress).toBe('function');
  });

  it('severityClass is exported and callable', () => {
    expect(typeof severityClass).toBe('function');
  });

  it('buildAriaLabel is exported and callable', () => {
    expect(typeof buildAriaLabel).toBe('function');
  });

  it('isProgressComplete is exported and callable', () => {
    expect(typeof isProgressComplete).toBe('function');
  });
});

// ---------------------------------------------------------------------------
// BusyStateOverlay renders null when not busy
// ---------------------------------------------------------------------------

describe('BusyStateOverlay — renders null when not busy', () => {
  it('returns null when busy=false', () => {
    // Component returns null — invoking it as a function in unit test
    const result = BusyStateOverlay({ busy: false, label: 'Test' });
    expect(result).toBeNull();
  });

  it('returns non-null when busy=true', () => {
    const result = BusyStateOverlay({ busy: true, label: 'Loading' });
    expect(result).not.toBeNull();
  });
});
