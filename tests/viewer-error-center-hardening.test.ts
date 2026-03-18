// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary and confidential.
// Free for personal, non-commercial use.
// Commercial use requires a valid license.
// See https://pdfluent.com/license for terms.

/**
 * Error Center Hardening Tests — ACROBAT_CLASS_RELIABILITY_AND_UX_HARDENING_BLOCK Batch 4
 *
 * Verified:
 * - appendError: evicts oldest on capacity overflow
 * - clearError: removes by id, leaves others intact
 * - clearAllErrors: returns empty array
 * - getErrorsBySeverity: filters correctly
 * - getErrorsBySource: filters correctly
 * - hasErrors / hasWarnings: boolean helpers
 * - getErrorSummary: correct counts and source list
 * - getLatestError / getLatestErrorBySeverity: last entry helpers
 * - deduplicateErrors: skips consecutive duplicates, keeps non-consecutive
 * - isAtCapacity: capacity detection
 * - makeAppError: unique ids, timestamp set
 * - Factory helpers produce correct severity/source
 * - ERROR_CENTER_MAX is respected
 */

import { describe, it, expect } from 'vitest';
import {
  makeAppError,
  appendError,
  clearError,
  clearAllErrors,
  getErrorsBySeverity,
  getErrorsBySource,
  hasErrors,
  hasWarnings,
  getErrorSummary,
  getLatestError,
  getLatestErrorBySeverity,
  deduplicateErrors,
  isAtCapacity,
  makeOcrError,
  makeExportError,
  makeRedactionError,
  makeDocumentLoadError,
  makeTextMutationError,
  makeLayoutEditError,
  makeSaveError,
  makeAnnotationError,
  ERROR_CENTER_MAX,
} from '../src/viewer/state/errorCenter';
import type { AppError } from '../src/viewer/state/errorCenter';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeErr(
  severity: AppError['severity'] = 'error',
  source = 'test',
  title = 'Test Error',
): AppError {
  return makeAppError(severity, title, 'detail', source);
}

function makeErrors(count: number): AppError[] {
  return Array.from({ length: count }, (_, i) => makeErr('error', `source${i}`, `Error ${i}`));
}

// ---------------------------------------------------------------------------
// makeAppError
// ---------------------------------------------------------------------------

describe('errorCenter — makeAppError', () => {
  it('generates unique ids', () => {
    const a = makeAppError('error', 'T', 'M', 's');
    const b = makeAppError('error', 'T', 'M', 's');
    expect(a.id).not.toBe(b.id);
  });

  it('sets timestamp to a Date', () => {
    const e = makeAppError('error', 'T', 'M', 's');
    expect(e.timestamp).toBeInstanceOf(Date);
  });

  it('stores all fields', () => {
    const e = makeAppError('warning', 'Title', 'Message', 'my_source');
    expect(e.severity).toBe('warning');
    expect(e.title).toBe('Title');
    expect(e.message).toBe('Message');
    expect(e.source).toBe('my_source');
  });
});

// ---------------------------------------------------------------------------
// appendError
// ---------------------------------------------------------------------------

describe('errorCenter — appendError', () => {
  it('adds error to empty registry', () => {
    const result = appendError([], makeErr());
    expect(result).toHaveLength(1);
  });

  it('appends to existing errors', () => {
    const existing = [makeErr(), makeErr()];
    const result = appendError(existing, makeErr());
    expect(result).toHaveLength(3);
  });

  it('evicts oldest when exceeding ERROR_CENTER_MAX', () => {
    const full = makeErrors(ERROR_CENTER_MAX);
    const newError = makeErr('error', 'new_source', 'New Error');
    const result = appendError(full, newError);
    expect(result).toHaveLength(ERROR_CENTER_MAX);
    expect(result[result.length - 1]).toBe(newError);
    expect(result[0]).not.toBe(full[0]); // oldest was evicted
  });

  it('does not mutate original array', () => {
    const original: AppError[] = [];
    appendError(original, makeErr());
    expect(original).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// clearError
// ---------------------------------------------------------------------------

describe('errorCenter — clearError', () => {
  it('removes the error with matching id', () => {
    const err = makeErr();
    const registry = appendError([], err);
    const result = clearError(registry, err.id);
    expect(result).toHaveLength(0);
  });

  it('leaves other errors intact', () => {
    const a = makeErr('error', 'a');
    const b = makeErr('error', 'b');
    const registry = [a, b];
    const result = clearError(registry, a.id);
    expect(result).toHaveLength(1);
    expect(result[0]).toBe(b);
  });

  it('no-op when id not found', () => {
    const registry = [makeErr()];
    const result = clearError(registry, 'nonexistent');
    expect(result).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// clearAllErrors
// ---------------------------------------------------------------------------

describe('errorCenter — clearAllErrors', () => {
  it('returns empty array', () => {
    const registry = makeErrors(10);
    expect(clearAllErrors(registry)).toHaveLength(0);
  });

  it('returns empty array for already empty registry', () => {
    expect(clearAllErrors([])).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// getErrorsBySeverity
// ---------------------------------------------------------------------------

describe('errorCenter — getErrorsBySeverity', () => {
  const registry: AppError[] = [
    makeErr('error', 's1'),
    makeErr('warning', 's2'),
    makeErr('info', 's3'),
    makeErr('error', 's4'),
  ];

  it('returns only error-severity entries', () => {
    const result = getErrorsBySeverity(registry, 'error');
    expect(result).toHaveLength(2);
    result.forEach(e => expect(e.severity).toBe('error'));
  });

  it('returns only warning-severity entries', () => {
    const result = getErrorsBySeverity(registry, 'warning');
    expect(result).toHaveLength(1);
  });

  it('returns empty array when no matching severity', () => {
    expect(getErrorsBySeverity([], 'error')).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// getErrorsBySource
// ---------------------------------------------------------------------------

describe('errorCenter — getErrorsBySource', () => {
  const registry: AppError[] = [
    makeErr('error', 'ocr'),
    makeErr('error', 'export'),
    makeErr('warning', 'ocr'),
  ];

  it('returns only entries from given source', () => {
    const result = getErrorsBySource(registry, 'ocr');
    expect(result).toHaveLength(2);
    result.forEach(e => expect(e.source).toBe('ocr'));
  });

  it('returns empty array for unknown source', () => {
    expect(getErrorsBySource(registry, 'unknown_source')).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// hasErrors / hasWarnings
// ---------------------------------------------------------------------------

describe('errorCenter — hasErrors / hasWarnings', () => {
  it('hasErrors returns true when any error present', () => {
    expect(hasErrors([makeErr('error')])).toBe(true);
  });

  it('hasErrors returns false when only warnings', () => {
    expect(hasErrors([makeErr('warning')])).toBe(false);
  });

  it('hasErrors returns false for empty registry', () => {
    expect(hasErrors([])).toBe(false);
  });

  it('hasWarnings returns true when warning present', () => {
    expect(hasWarnings([makeErr('warning')])).toBe(true);
  });

  it('hasWarnings returns false when only errors', () => {
    expect(hasWarnings([makeErr('error')])).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// getErrorSummary
// ---------------------------------------------------------------------------

describe('errorCenter — getErrorSummary', () => {
  it('returns correct counts for mixed registry', () => {
    const registry: AppError[] = [
      makeErr('error', 'ocr'),
      makeErr('error', 'export'),
      makeErr('warning', 'ocr'),
      makeErr('info', 'system'),
    ];
    const summary = getErrorSummary(registry);
    expect(summary.total).toBe(4);
    expect(summary.errorCount).toBe(2);
    expect(summary.warningCount).toBe(1);
    expect(summary.infoCount).toBe(1);
  });

  it('returns unique sources', () => {
    const registry: AppError[] = [
      makeErr('error', 'ocr'),
      makeErr('warning', 'ocr'),
      makeErr('error', 'export'),
    ];
    const summary = getErrorSummary(registry);
    expect(summary.sources).toHaveLength(2);
    expect(summary.sources).toContain('ocr');
    expect(summary.sources).toContain('export');
  });

  it('returns zeroes for empty registry', () => {
    const summary = getErrorSummary([]);
    expect(summary.total).toBe(0);
    expect(summary.errorCount).toBe(0);
    expect(summary.sources).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// getLatestError / getLatestErrorBySeverity
// ---------------------------------------------------------------------------

describe('errorCenter — getLatestError', () => {
  it('returns last error in registry', () => {
    const a = makeErr('error', 'a');
    const b = makeErr('warning', 'b');
    expect(getLatestError([a, b])).toBe(b);
  });

  it('returns null for empty registry', () => {
    expect(getLatestError([])).toBeNull();
  });
});

describe('errorCenter — getLatestErrorBySeverity', () => {
  it('returns last error with matching severity', () => {
    const a = makeErr('error', 'a');
    const b = makeErr('warning', 'b');
    const c = makeErr('error', 'c');
    expect(getLatestErrorBySeverity([a, b, c], 'error')).toBe(c);
  });

  it('returns null when no matching severity', () => {
    expect(getLatestErrorBySeverity([makeErr('error')], 'warning')).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// deduplicateErrors
// ---------------------------------------------------------------------------

describe('errorCenter — deduplicateErrors', () => {
  it('removes consecutive duplicates (same title+source)', () => {
    const a = makeAppError('error', 'Same Title', 'M', 'same_source');
    const b = makeAppError('error', 'Same Title', 'M', 'same_source');
    const result = deduplicateErrors([a, b]);
    expect(result).toHaveLength(1);
    expect(result[0]).toBe(a);
  });

  it('keeps non-consecutive duplicates', () => {
    const a = makeAppError('error', 'Same Title', 'M', 'same_source');
    const mid = makeErr('info', 'other');
    const b = makeAppError('error', 'Same Title', 'M', 'same_source');
    const result = deduplicateErrors([a, mid, b]);
    expect(result).toHaveLength(3);
  });

  it('keeps entries with different source', () => {
    const a = makeAppError('error', 'Same Title', 'M', 'source_a');
    const b = makeAppError('error', 'Same Title', 'M', 'source_b');
    const result = deduplicateErrors([a, b]);
    expect(result).toHaveLength(2);
  });

  it('empty input returns empty output', () => {
    expect(deduplicateErrors([])).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// isAtCapacity
// ---------------------------------------------------------------------------

describe('errorCenter — isAtCapacity', () => {
  it('returns false when below capacity', () => {
    expect(isAtCapacity(makeErrors(ERROR_CENTER_MAX - 1))).toBe(false);
  });

  it('returns true when at capacity', () => {
    expect(isAtCapacity(makeErrors(ERROR_CENTER_MAX))).toBe(true);
  });

  it('returns false for empty registry', () => {
    expect(isAtCapacity([])).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Factory helpers
// ---------------------------------------------------------------------------

describe('errorCenter — factory helpers', () => {
  const factories = [
    { name: 'makeOcrError', fn: makeOcrError, source: 'ocr' },
    { name: 'makeExportError', fn: makeExportError, source: 'export' },
    { name: 'makeRedactionError', fn: makeRedactionError, source: 'redaction' },
    { name: 'makeDocumentLoadError', fn: makeDocumentLoadError, source: 'document_load' },
    { name: 'makeTextMutationError', fn: makeTextMutationError, source: 'text_edit' },
    { name: 'makeLayoutEditError', fn: makeLayoutEditError, source: 'layout_edit' },
    { name: 'makeSaveError', fn: makeSaveError, source: 'save' },
    { name: 'makeAnnotationError', fn: makeAnnotationError, source: 'annotation' },
  ];

  for (const { name, fn, source } of factories) {
    it(`${name} produces error severity with correct source`, () => {
      const err = fn('detail');
      expect(err.severity).toBe('error');
      expect(err.source).toBe(source);
      expect(err.message).toBe('detail');
    });
  }
});
