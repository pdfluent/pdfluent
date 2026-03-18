// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary and confidential.
// Free for personal, non-commercial use.
// Commercial use requires a valid license.
// See https://pdfluent.com/license for terms.

/**
 * Font Mutation Support — Phase 5 Batch 5
 *
 * Detects font encoding class from span metadata and determines whether
 * safe text mutation is possible given the encoding.
 *
 * Phase 4 assumption: all single-span digital text is treated as standard
 * Latin encoding (WinAnsi or MacRoman). This module makes that assumption
 * explicit and testable, and prepares for future encoding-aware mutation.
 *
 * Encoding classes:
 *   standard_latin    — WinAnsi / MacRoman: safe for Phase 4 MVP mutation
 *   identity_h        — CID/Identity-H: not safe (glyph indices, not Unicode)
 *   identity_v        — CID/Identity-V: not safe (vertical variant)
 *   cid_keyed         — CID-keyed font with arbitrary CMap: not safe
 *   custom_encoding   — non-standard encoding object: not safe
 *   subset_embedded   — subset embedded font (ABCDEF+Name pattern): safe for MVP
 *   unknown           — encoding cannot be determined: treat as unsafe
 *
 * Detection strategy (Phase 5):
 *   - Heuristic based on available span metadata
 *   - Font name patterns (ABCDEF+ = subset embedded)
 *   - Characters outside ASCII range → hints at non-Latin encoding
 *   - Full encoding detection requires Rust-side font inspection
 *     (deferred to Phase 6+)
 *
 * Missing glyph risk:
 *   If a replacement character is not in the font's encoding, the PDF
 *   renderer will show a .notdef glyph (empty box). This module flags
 *   high-risk replacements containing non-ASCII characters for Latin fonts.
 */

// ---------------------------------------------------------------------------
// Encoding class
// ---------------------------------------------------------------------------

export type FontEncodingClass =
  /** Standard Latin (WinAnsi or MacRoman) — safe for Phase 4/5 MVP. */
  | 'standard_latin'
  /** Subset-embedded font (ABCDEF+ prefix) — safe for Phase 4/5 MVP. */
  | 'subset_embedded'
  /** Identity-H CID encoding — not safe for direct byte mutation. */
  | 'identity_h'
  /** Identity-V CID encoding — not safe for direct byte mutation. */
  | 'identity_v'
  /** CID-keyed font with arbitrary CMap — not safe. */
  | 'cid_keyed'
  /** Non-standard custom encoding object — not safe. */
  | 'custom_encoding'
  /** Encoding cannot be determined from available metadata. */
  | 'unknown';

// ---------------------------------------------------------------------------
// Font mutation support result
// ---------------------------------------------------------------------------

export interface FontMutationSupportResult {
  /** Detected encoding class. */
  readonly encodingClass: FontEncodingClass;
  /** Whether mutation is considered safe for this encoding. */
  readonly safe: boolean;
  /** Machine-readable reason code. */
  readonly reasonCode: FontEncodingReasonCode;
  /** Human-readable label (Dutch). */
  readonly label: string;
}

export type FontEncodingReasonCode =
  | 'standard-latin-safe'
  | 'subset-embedded-safe'
  | 'identity-h-unsafe'
  | 'identity-v-unsafe'
  | 'cid-keyed-unsafe'
  | 'custom-encoding-unsafe'
  | 'unknown-encoding-unsafe';

// ---------------------------------------------------------------------------
// Missing glyph risk
// ---------------------------------------------------------------------------

export interface GlyphRiskResult {
  /** Whether the replacement text poses a missing-glyph risk. */
  readonly risk: boolean;
  /** Specific characters that may be missing from the font encoding. */
  readonly suspectChars: string[];
  /** Human-readable description (Dutch). */
  readonly message: string;
}

// ---------------------------------------------------------------------------
// Dutch labels
// ---------------------------------------------------------------------------

const ENCODING_LABELS: Record<FontEncodingClass, string> = {
  standard_latin: 'Standaard Latin-codering — veilig voor bewerking',
  subset_embedded: 'Ingesloten subset-lettertype — veilig voor bewerking',
  identity_h: 'Identity-H codering — niet veilig voor directe bewerking',
  identity_v: 'Identity-V codering — niet veilig voor directe bewerking',
  cid_keyed: 'CID-lettertype met aangepaste CMap — niet veilig voor bewerking',
  custom_encoding: 'Aangepaste codering — niet veilig voor bewerking',
  unknown: 'Codering onbekend — bewerking niet beschikbaar',
};

// ---------------------------------------------------------------------------
// Detection from font name
// ---------------------------------------------------------------------------

/**
 * Detect encoding class from font name metadata.
 *
 * Phase 5 heuristics:
 * - "ABCDEF+FontName" pattern → subset_embedded
 * - Names containing "Identity-H" or "Identity-V" → identity_h/v
 * - Names containing "CIDFont" or "CID" → cid_keyed
 * - Null / empty / undefined → unknown
 * - All other names → standard_latin (safe assumption for Latin fonts)
 */
export function detectEncodingFromFontName(fontName: string | null | undefined): FontEncodingClass {
  if (!fontName || fontName.trim() === '') return 'unknown';

  const lower = fontName.toLowerCase();

  // Subset embedded: ABCDEF+FontName (6 uppercase letters + plus sign)
  if (/^[A-Z]{6}\+/.test(fontName)) return 'subset_embedded';

  // Identity-H / Identity-V
  if (lower.includes('identity-h')) return 'identity_h';
  if (lower.includes('identity-v')) return 'identity_v';

  // CID fonts
  if (lower.includes('cidfont') || lower.includes('cid-font')) return 'cid_keyed';

  // Default: assume standard Latin for named fonts without red flags
  return 'standard_latin';
}

// ---------------------------------------------------------------------------
// Mutation safety from encoding class
// ---------------------------------------------------------------------------

/**
 * Determine font mutation safety from a detected encoding class.
 */
export function getFontMutationSupport(encodingClass: FontEncodingClass): FontMutationSupportResult {
  const safe = encodingClass === 'standard_latin' || encodingClass === 'subset_embedded';
  const reasonCode: FontEncodingReasonCode = (() => {
    switch (encodingClass) {
      case 'standard_latin': return 'standard-latin-safe';
      case 'subset_embedded': return 'subset-embedded-safe';
      case 'identity_h': return 'identity-h-unsafe';
      case 'identity_v': return 'identity-v-unsafe';
      case 'cid_keyed': return 'cid-keyed-unsafe';
      case 'custom_encoding': return 'custom-encoding-unsafe';
      case 'unknown': return 'unknown-encoding-unsafe';
    }
  })();
  return {
    encodingClass,
    safe,
    reasonCode,
    label: ENCODING_LABELS[encodingClass],
  };
}

// ---------------------------------------------------------------------------
// Missing glyph risk detection
// ---------------------------------------------------------------------------

/**
 * Assess whether a replacement string poses a missing-glyph risk for the
 * given encoding class.
 *
 * For standard_latin and subset_embedded encodings:
 *   - ASCII printable (0x20–0x7E) → safe
 *   - Extended Latin (0x80–0xFF) → moderate risk (font-dependent)
 *   - Non-Latin Unicode → high risk (likely missing)
 *
 * For other encodings: all replacements are risky by default.
 */
export function assessGlyphRisk(
  replacement: string,
  encodingClass: FontEncodingClass,
): GlyphRiskResult {
  if (encodingClass !== 'standard_latin' && encodingClass !== 'subset_embedded') {
    return {
      risk: true,
      suspectChars: [],
      message: 'Codering ondersteunt geen directe glyfvervanging.',
    };
  }

  const suspectChars: string[] = [];
  for (const ch of replacement) {
    const code = ch.charCodeAt(0);
    // Non-ASCII (outside 0x20–0x7E range) may be missing from Latin encodings
    if (code < 0x20 || code > 0x7e) {
      suspectChars.push(ch);
    }
  }

  if (suspectChars.length === 0) {
    return {
      risk: false,
      suspectChars: [],
      message: 'Alle vervangingstekens zijn aanwezig in de standaard Latin-codering.',
    };
  }

  return {
    risk: true,
    suspectChars: [...new Set(suspectChars)],
    message: `Vervangingstekens buiten standaard Latin bereik: ${[...new Set(suspectChars)].map(c => `'${c}'`).join(', ')}.`,
  };
}
