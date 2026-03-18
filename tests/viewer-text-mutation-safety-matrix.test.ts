// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary and confidential.
// Free for personal, non-commercial use.
// Commercial use requires a valid license.
// See https://pdfluent.com/license for terms.

/**
 * Text Mutation Safety Matrix — Phase 4 Batch 9
 *
 * Verifies the canonical safety matrix for Phase 4 text mutation:
 * - Every matrix entry passes (expectedClass === actualClass)
 * - writable flag is correct for every entry
 * - The matrix covers all expected support classes
 * - validateSafetyMatrix() returns no failures
 * - Individual target shape outcomes are as expected
 */

import { describe, it, expect } from 'vitest';
import {
  TEXT_MUTATION_SAFETY_MATRIX,
  validateSafetyMatrix,
} from '../src/viewer/text/textMutationMatrix';
import { getMutationSupport } from '../src/viewer/text/textMutationSupport';

// ---------------------------------------------------------------------------
// Full matrix validation
// ---------------------------------------------------------------------------

describe('safety matrix — full matrix validation', () => {
  it('validateSafetyMatrix returns no failures', () => {
    const results = validateSafetyMatrix();
    const failures = results.filter(r => !r.pass);
    if (failures.length > 0) {
      const msgs = failures.map(f =>
        `"${f.description}": expected ${f.expectedClass} (writable=${f.expectedWritable}), got ${f.actualClass} (writable=${f.actualWritable})`,
      );
      throw new Error(`Safety matrix failures:\n${msgs.join('\n')}`);
    }
    expect(failures).toHaveLength(0);
  });

  it('matrix has at least 5 entries', () => {
    expect(TEXT_MUTATION_SAFETY_MATRIX.length).toBeGreaterThanOrEqual(5);
  });

  it('all matrix entries have non-empty descriptions', () => {
    for (const entry of TEXT_MUTATION_SAFETY_MATRIX) {
      expect(entry.description.length).toBeGreaterThan(0);
    }
  });

  it('all matrix entries have non-empty target ids', () => {
    for (const entry of TEXT_MUTATION_SAFETY_MATRIX) {
      expect(entry.target.id.length).toBeGreaterThan(0);
    }
  });
});

// ---------------------------------------------------------------------------
// Support class coverage
// ---------------------------------------------------------------------------

describe('safety matrix — support class coverage', () => {
  it('matrix contains a writable_digital_text entry', () => {
    const entry = TEXT_MUTATION_SAFETY_MATRIX.find(e => e.expectedClass === 'writable_digital_text');
    expect(entry).toBeDefined();
    expect(entry!.expectedWritable).toBe(true);
  });

  it('matrix contains a non_writable_digital_text entry', () => {
    const entry = TEXT_MUTATION_SAFETY_MATRIX.find(e => e.expectedClass === 'non_writable_digital_text');
    expect(entry).toBeDefined();
    expect(entry!.expectedWritable).toBe(false);
  });

  it('matrix contains an ocr_read_only entry', () => {
    const entry = TEXT_MUTATION_SAFETY_MATRIX.find(e => e.expectedClass === 'ocr_read_only');
    expect(entry).toBeDefined();
    expect(entry!.expectedWritable).toBe(false);
  });

  it('matrix contains an unknown_structure entry', () => {
    const entry = TEXT_MUTATION_SAFETY_MATRIX.find(e => e.expectedClass === 'unknown_structure');
    expect(entry).toBeDefined();
    expect(entry!.expectedWritable).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Individual target shapes
// ---------------------------------------------------------------------------

describe('safety matrix — individual target shapes', () => {
  it('single-line single-span digital → writable_digital_text', () => {
    const entry = TEXT_MUTATION_SAFETY_MATRIX.find(e =>
      e.expectedClass === 'writable_digital_text'
    )!;
    const result = getMutationSupport(entry.target);
    expect(result.supportClass).toBe('writable_digital_text');
    expect(result.writable).toBe(true);
  });

  it('single-line single-span digital → has constraints', () => {
    const entry = TEXT_MUTATION_SAFETY_MATRIX.find(e =>
      e.expectedClass === 'writable_digital_text'
    )!;
    const result = getMutationSupport(entry.target);
    expect(result.constraints).not.toBeNull();
    expect(result.constraints!.maxLength).toBeGreaterThan(0);
  });

  it('multi-line paragraph → non_writable_digital_text', () => {
    const entry = TEXT_MUTATION_SAFETY_MATRIX.find(e =>
      e.description.includes('Multi-line')
    )!;
    const result = getMutationSupport(entry.target);
    expect(result.supportClass).toBe('non_writable_digital_text');
    expect(result.writable).toBe(false);
  });

  it('multi-span line → non_writable_digital_text', () => {
    const entry = TEXT_MUTATION_SAFETY_MATRIX.find(e =>
      e.description.includes('multiple spans')
    )!;
    const result = getMutationSupport(entry.target);
    expect(result.supportClass).toBe('non_writable_digital_text');
    expect(result.writable).toBe(false);
  });

  it('OCR text → ocr_read_only', () => {
    const entry = TEXT_MUTATION_SAFETY_MATRIX.find(e =>
      e.expectedClass === 'ocr_read_only'
    )!;
    const result = getMutationSupport(entry.target);
    expect(result.supportClass).toBe('ocr_read_only');
    expect(result.writable).toBe(false);
  });

  it('empty lines array → unknown_structure', () => {
    const entry = TEXT_MUTATION_SAFETY_MATRIX.find(e =>
      e.expectedClass === 'unknown_structure'
    )!;
    const result = getMutationSupport(entry.target);
    expect(result.supportClass).toBe('unknown_structure');
    expect(result.writable).toBe(false);
  });

  it('non-writable targets have null constraints', () => {
    const nonWritable = TEXT_MUTATION_SAFETY_MATRIX.filter(e => !e.expectedWritable);
    for (const entry of nonWritable) {
      const result = getMutationSupport(entry.target);
      expect(result.constraints).toBeNull();
    }
  });
});

// ---------------------------------------------------------------------------
// Matrix consistency — expectedWritable matches expectedClass
// ---------------------------------------------------------------------------

describe('safety matrix — consistency', () => {
  it('only writable_digital_text entries have expectedWritable=true', () => {
    for (const entry of TEXT_MUTATION_SAFETY_MATRIX) {
      if (entry.expectedWritable) {
        expect(entry.expectedClass).toBe('writable_digital_text');
      }
    }
  });

  it('all non-writable entries have expectedWritable=false', () => {
    const nonWritableClasses = [
      'non_writable_digital_text',
      'ocr_read_only',
      'protected_or_locked',
      'unknown_structure',
    ];
    for (const entry of TEXT_MUTATION_SAFETY_MATRIX) {
      if (nonWritableClasses.includes(entry.expectedClass)) {
        expect(entry.expectedWritable).toBe(false);
      }
    }
  });
});
