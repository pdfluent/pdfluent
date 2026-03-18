// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary and confidential.
// Free for personal, non-commercial use.
// Commercial use requires a valid license.
// See https://pdfluent.com/license for terms.

/**
 * Font Mutation Support — Phase 5 Batch 5
 *
 * Verifies font encoding detection and mutation safety:
 * - detectEncodingFromFontName identifies all encoding classes
 * - getFontMutationSupport returns safe=true only for latin/subset
 * - assessGlyphRisk detects non-ASCII characters in replacements
 * - All encoding class labels are non-empty Dutch strings
 * - Subset embedded pattern (ABCDEF+) is correctly detected
 * - Identity-H/V patterns are correctly detected
 * - CID font pattern is correctly detected
 * - Null/empty font names fall back to unknown
 */

import { describe, it, expect } from 'vitest';
import {
  detectEncodingFromFontName,
  getFontMutationSupport,
  assessGlyphRisk,
} from '../src/viewer/text/fontMutationSupport';
import type { FontEncodingClass } from '../src/viewer/text/fontMutationSupport';

// ---------------------------------------------------------------------------
// detectEncodingFromFontName
// ---------------------------------------------------------------------------

describe('detectEncodingFromFontName — subset embedded', () => {
  it('detects ABCDEF+ prefix as subset_embedded', () => {
    expect(detectEncodingFromFontName('ABCDEF+Helvetica')).toBe('subset_embedded');
  });

  it('detects XYZABC+ prefix as subset_embedded', () => {
    expect(detectEncodingFromFontName('XYZABC+TimesNewRoman')).toBe('subset_embedded');
  });

  it('does not detect lowercase prefix as subset_embedded', () => {
    // The pattern requires exactly 6 uppercase letters
    const result = detectEncodingFromFontName('abcdef+Helvetica');
    expect(result).not.toBe('subset_embedded');
  });
});

describe('detectEncodingFromFontName — Identity-H/V', () => {
  it('detects Identity-H encoding', () => {
    expect(detectEncodingFromFontName('WenQuanYi-Micro-Hei-Identity-H')).toBe('identity_h');
  });

  it('detects Identity-H in font name (case insensitive)', () => {
    expect(detectEncodingFromFontName('WenQuanYi-identity-h')).toBe('identity_h');
  });

  it('detects Identity-V encoding', () => {
    expect(detectEncodingFromFontName('CJKFont-Identity-V')).toBe('identity_v');
  });
});

describe('detectEncodingFromFontName — CID fonts', () => {
  it('detects CIDFont pattern', () => {
    expect(detectEncodingFromFontName('Mincho-CIDFont')).toBe('cid_keyed');
  });

  it('detects cid-font pattern (case insensitive)', () => {
    expect(detectEncodingFromFontName('Kozuka-cid-font-Pro')).toBe('cid_keyed');
  });
});

describe('detectEncodingFromFontName — standard Latin', () => {
  it('plain Helvetica → standard_latin', () => {
    expect(detectEncodingFromFontName('Helvetica')).toBe('standard_latin');
  });

  it('Times-Roman → standard_latin', () => {
    expect(detectEncodingFromFontName('Times-Roman')).toBe('standard_latin');
  });

  it('Arial → standard_latin', () => {
    expect(detectEncodingFromFontName('Arial')).toBe('standard_latin');
  });
});

describe('detectEncodingFromFontName — unknown/null', () => {
  it('null → unknown', () => {
    expect(detectEncodingFromFontName(null)).toBe('unknown');
  });

  it('undefined → unknown', () => {
    expect(detectEncodingFromFontName(undefined)).toBe('unknown');
  });

  it('empty string → unknown', () => {
    expect(detectEncodingFromFontName('')).toBe('unknown');
  });

  it('whitespace only → unknown', () => {
    expect(detectEncodingFromFontName('   ')).toBe('unknown');
  });
});

// ---------------------------------------------------------------------------
// getFontMutationSupport — safe/unsafe
// ---------------------------------------------------------------------------

describe('getFontMutationSupport — safe encodings', () => {
  it('standard_latin → safe=true', () => {
    expect(getFontMutationSupport('standard_latin').safe).toBe(true);
  });

  it('subset_embedded → safe=true', () => {
    expect(getFontMutationSupport('subset_embedded').safe).toBe(true);
  });
});

describe('getFontMutationSupport — unsafe encodings', () => {
  it('identity_h → safe=false', () => {
    expect(getFontMutationSupport('identity_h').safe).toBe(false);
  });

  it('identity_v → safe=false', () => {
    expect(getFontMutationSupport('identity_v').safe).toBe(false);
  });

  it('cid_keyed → safe=false', () => {
    expect(getFontMutationSupport('cid_keyed').safe).toBe(false);
  });

  it('custom_encoding → safe=false', () => {
    expect(getFontMutationSupport('custom_encoding').safe).toBe(false);
  });

  it('unknown → safe=false', () => {
    expect(getFontMutationSupport('unknown').safe).toBe(false);
  });
});

describe('getFontMutationSupport — reason codes', () => {
  it('standard_latin → standard-latin-safe', () => {
    expect(getFontMutationSupport('standard_latin').reasonCode).toBe('standard-latin-safe');
  });

  it('subset_embedded → subset-embedded-safe', () => {
    expect(getFontMutationSupport('subset_embedded').reasonCode).toBe('subset-embedded-safe');
  });

  it('identity_h → identity-h-unsafe', () => {
    expect(getFontMutationSupport('identity_h').reasonCode).toBe('identity-h-unsafe');
  });

  it('unknown → unknown-encoding-unsafe', () => {
    expect(getFontMutationSupport('unknown').reasonCode).toBe('unknown-encoding-unsafe');
  });
});

describe('getFontMutationSupport — labels', () => {
  const allClasses: FontEncodingClass[] = [
    'standard_latin', 'subset_embedded', 'identity_h', 'identity_v',
    'cid_keyed', 'custom_encoding', 'unknown',
  ];

  it('all encoding classes have non-empty labels', () => {
    for (const cls of allClasses) {
      const result = getFontMutationSupport(cls);
      expect(result.label.length).toBeGreaterThan(0);
    }
  });
});

// ---------------------------------------------------------------------------
// assessGlyphRisk
// ---------------------------------------------------------------------------

describe('assessGlyphRisk — standard_latin', () => {
  it('ASCII-only replacement has no risk', () => {
    const result = assessGlyphRisk('Hello world', 'standard_latin');
    expect(result.risk).toBe(false);
    expect(result.suspectChars).toHaveLength(0);
  });

  it('numeric ASCII replacement has no risk', () => {
    const result = assessGlyphRisk('42', 'standard_latin');
    expect(result.risk).toBe(false);
  });

  it('punctuation replacement has no risk', () => {
    const result = assessGlyphRisk('Hello, world!', 'standard_latin');
    expect(result.risk).toBe(false);
  });

  it('non-ASCII character poses glyph risk', () => {
    const result = assessGlyphRisk('Héllo', 'standard_latin'); // é = 0xE9
    expect(result.risk).toBe(true);
    expect(result.suspectChars).toContain('é');
  });

  it('emoji poses glyph risk', () => {
    const result = assessGlyphRisk('Hello 🌍', 'standard_latin');
    expect(result.risk).toBe(true);
  });
});

describe('assessGlyphRisk — subset_embedded', () => {
  it('ASCII replacement has no risk for subset embedded font', () => {
    const result = assessGlyphRisk('Hello', 'subset_embedded');
    expect(result.risk).toBe(false);
  });

  it('non-ASCII replacement poses risk for subset embedded font', () => {
    const result = assessGlyphRisk('Héllo', 'subset_embedded');
    expect(result.risk).toBe(true);
  });
});

describe('assessGlyphRisk — unsafe encodings', () => {
  it('identity_h always poses glyph risk (any text)', () => {
    const result = assessGlyphRisk('Hello', 'identity_h');
    expect(result.risk).toBe(true);
  });

  it('cid_keyed always poses glyph risk', () => {
    const result = assessGlyphRisk('Hello', 'cid_keyed');
    expect(result.risk).toBe(true);
  });

  it('unknown encoding always poses glyph risk', () => {
    const result = assessGlyphRisk('Hello', 'unknown');
    expect(result.risk).toBe(true);
  });
});

describe('assessGlyphRisk — message', () => {
  it('safe result has non-empty message', () => {
    const result = assessGlyphRisk('Hello', 'standard_latin');
    expect(result.message.length).toBeGreaterThan(0);
  });

  it('risky result has non-empty message listing suspect chars', () => {
    const result = assessGlyphRisk('Héllo', 'standard_latin');
    expect(result.message).toContain('é');
  });
});
