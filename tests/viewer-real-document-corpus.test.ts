// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary and confidential.
// Free for personal, non-commercial use.
// Commercial use requires a valid license.
// See https://pdfluent.com/license for terms.

/**
 * Real Document Corpus — Phase 5 Batch 1
 *
 * Validates the corpus metadata and classification expectations:
 * - DOCUMENT_CORPUS covers all 10 required document categories
 * - Every corpus entry has the correct expectedClass from getMutationSupport()
 * - writable entries are truly writable (single-line, single-span, digital)
 * - blocked entries are correctly rejected
 * - OCR entries are classified as ocr_read_only
 * - Lookup helpers work correctly
 * - Corpus consistency: expectedWritable matches expectedClass
 */

import { describe, it, expect } from 'vitest';
import {
  DOCUMENT_CORPUS,
  getCorpusEntry,
  getWritableCorpusEntries,
  getBlockedCorpusEntries,
} from './real_documents/documentCorpus';
import type { CorpusCategory } from './real_documents/documentCorpus';
import { getMutationSupport } from '../src/viewer/text/textMutationSupport';

// ---------------------------------------------------------------------------
// Corpus structure
// ---------------------------------------------------------------------------

describe('corpus — structure and completeness', () => {
  it('has exactly 10 entries', () => {
    expect(DOCUMENT_CORPUS).toHaveLength(10);
  });

  it('covers all 10 required categories', () => {
    const required: CorpusCategory[] = [
      'simple_digital_text',
      'multi_line_paragraph',
      'embedded_fonts',
      'kerning_heavy',
      'forms_document',
      'mixed_content',
      'ocr_only',
      'mixed_ocr_digital',
      'protected_text',
      'complex_layout',
    ];
    const present = DOCUMENT_CORPUS.map(e => e.category);
    for (const cat of required) {
      expect(present).toContain(cat);
    }
  });

  it('all entries have non-empty descriptions', () => {
    for (const entry of DOCUMENT_CORPUS) {
      expect(entry.description.length).toBeGreaterThan(0);
    }
  });

  it('all entries have example file paths', () => {
    for (const entry of DOCUMENT_CORPUS) {
      expect(entry.exampleFile.length).toBeGreaterThan(0);
      expect(entry.exampleFile).toContain('.pdf');
    }
  });

  it('all entries have representative targets', () => {
    for (const entry of DOCUMENT_CORPUS) {
      expect(entry.representativeTarget).toBeDefined();
      expect(entry.representativeTarget.id.length).toBeGreaterThan(0);
    }
  });
});

// ---------------------------------------------------------------------------
// Classification validation — every entry matches getMutationSupport()
// ---------------------------------------------------------------------------

describe('corpus — classification matches getMutationSupport()', () => {
  it('all corpus entries classify as expected', () => {
    const failures: string[] = [];
    for (const entry of DOCUMENT_CORPUS) {
      const result = getMutationSupport(entry.representativeTarget);
      if (result.supportClass !== entry.expectedClass) {
        failures.push(
          `[${entry.category}] expected ${entry.expectedClass}, got ${result.supportClass}`,
        );
      }
      if (result.writable !== entry.expectedWritable) {
        failures.push(
          `[${entry.category}] expectedWritable=${entry.expectedWritable}, got ${result.writable}`,
        );
      }
    }
    if (failures.length > 0) {
      throw new Error(`Corpus classification failures:\n${failures.join('\n')}`);
    }
    expect(failures).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Category-by-category validation
// ---------------------------------------------------------------------------

describe('corpus — writable categories', () => {
  it('simple_digital_text → writable_digital_text', () => {
    const entry = getCorpusEntry('simple_digital_text')!;
    const result = getMutationSupport(entry.representativeTarget);
    expect(result.supportClass).toBe('writable_digital_text');
    expect(result.writable).toBe(true);
    expect(result.constraints).not.toBeNull();
  });

  it('embedded_fonts → writable_digital_text', () => {
    const entry = getCorpusEntry('embedded_fonts')!;
    const result = getMutationSupport(entry.representativeTarget);
    expect(result.supportClass).toBe('writable_digital_text');
    expect(result.writable).toBe(true);
  });

  it('forms_document → writable_digital_text for label text', () => {
    const entry = getCorpusEntry('forms_document')!;
    const result = getMutationSupport(entry.representativeTarget);
    expect(result.supportClass).toBe('writable_digital_text');
  });

  it('mixed_content → writable_digital_text for caption text', () => {
    const entry = getCorpusEntry('mixed_content')!;
    const result = getMutationSupport(entry.representativeTarget);
    expect(result.supportClass).toBe('writable_digital_text');
  });
});

describe('corpus — blocked categories', () => {
  it('multi_line_paragraph → non_writable_digital_text', () => {
    const entry = getCorpusEntry('multi_line_paragraph')!;
    const result = getMutationSupport(entry.representativeTarget);
    expect(result.supportClass).toBe('non_writable_digital_text');
    expect(result.writable).toBe(false);
  });

  it('kerning_heavy → non_writable_digital_text (multi-span)', () => {
    const entry = getCorpusEntry('kerning_heavy')!;
    const result = getMutationSupport(entry.representativeTarget);
    expect(result.supportClass).toBe('non_writable_digital_text');
    expect(result.writable).toBe(false);
  });

  it('complex_layout → non_writable_digital_text (multi-span)', () => {
    const entry = getCorpusEntry('complex_layout')!;
    const result = getMutationSupport(entry.representativeTarget);
    expect(result.supportClass).toBe('non_writable_digital_text');
    expect(result.writable).toBe(false);
  });

  it('protected_text → unknown_structure (empty lines)', () => {
    const entry = getCorpusEntry('protected_text')!;
    const result = getMutationSupport(entry.representativeTarget);
    expect(result.writable).toBe(false);
  });
});

describe('corpus — OCR categories', () => {
  it('ocr_only → ocr_read_only', () => {
    const entry = getCorpusEntry('ocr_only')!;
    const result = getMutationSupport(entry.representativeTarget);
    expect(result.supportClass).toBe('ocr_read_only');
    expect(result.writable).toBe(false);
  });

  it('mixed_ocr_digital OCR region → ocr_read_only', () => {
    const entry = getCorpusEntry('mixed_ocr_digital')!;
    const result = getMutationSupport(entry.representativeTarget);
    expect(result.supportClass).toBe('ocr_read_only');
    expect(result.writable).toBe(false);
  });

  it('OCR entries have null constraints', () => {
    const ocrEntries = DOCUMENT_CORPUS.filter(e =>
      e.expectedClass === 'ocr_read_only'
    );
    for (const entry of ocrEntries) {
      const result = getMutationSupport(entry.representativeTarget);
      expect(result.constraints).toBeNull();
    }
  });
});

// ---------------------------------------------------------------------------
// Lookup helpers
// ---------------------------------------------------------------------------

describe('corpus — lookup helpers', () => {
  it('getCorpusEntry returns correct entry for known category', () => {
    const entry = getCorpusEntry('simple_digital_text');
    expect(entry).toBeDefined();
    expect(entry!.category).toBe('simple_digital_text');
  });

  it('getCorpusEntry returns undefined for unknown category', () => {
    const entry = getCorpusEntry('nonexistent' as CorpusCategory);
    expect(entry).toBeUndefined();
  });

  it('getWritableCorpusEntries returns only writable entries', () => {
    const writable = getWritableCorpusEntries();
    for (const entry of writable) {
      expect(entry.expectedWritable).toBe(true);
      expect(entry.expectedClass).toBe('writable_digital_text');
    }
    expect(writable.length).toBeGreaterThan(0);
  });

  it('getBlockedCorpusEntries returns only non-writable entries', () => {
    const blocked = getBlockedCorpusEntries();
    for (const entry of blocked) {
      expect(entry.expectedWritable).toBe(false);
    }
    expect(blocked.length).toBeGreaterThan(0);
  });

  it('writable + blocked entries cover the full corpus', () => {
    const writable = getWritableCorpusEntries().length;
    const blocked = getBlockedCorpusEntries().length;
    expect(writable + blocked).toBe(DOCUMENT_CORPUS.length);
  });
});

// ---------------------------------------------------------------------------
// Corpus consistency
// ---------------------------------------------------------------------------

describe('corpus — consistency', () => {
  it('expectedWritable=true only for writable_digital_text', () => {
    for (const entry of DOCUMENT_CORPUS) {
      if (entry.expectedWritable) {
        expect(entry.expectedClass).toBe('writable_digital_text');
      }
    }
  });

  it('non-writable entries never have expectedWritable=true', () => {
    const nonWritableClasses = [
      'non_writable_digital_text',
      'ocr_read_only',
      'protected_or_locked',
      'unknown_structure',
    ];
    for (const entry of DOCUMENT_CORPUS) {
      if (nonWritableClasses.includes(entry.expectedClass)) {
        expect(entry.expectedWritable).toBe(false);
      }
    }
  });
});
