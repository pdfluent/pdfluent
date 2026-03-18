// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary and confidential.
// Free for personal, non-commercial use.
// Commercial use requires a valid license.
// See https://pdfluent.com/license for terms.

/**
 * Extended Mutation Messaging — Phase 5 Batch 7
 *
 * Verifies the Phase 5 additions to textMutationMessaging:
 * - protected-content and unknown-source reason code mappings
 * - getFontEncodingMessage() for all FontEncodingClass values
 * - getOverflowRiskMessage() for various overflow counts
 * - Extended BackendRejectionCode: font-encoding-unsafe, glyph-risk-detected
 * - All messages have non-empty tooltip and explanation
 * - actionable flag is correct per scenario
 */

import { describe, it, expect } from 'vitest';
import {
  getUnsupportedMessage,
  getBackendRejectionMessage,
  getSupportClassTooltip,
  isSupportClassWritable,
  getFontEncodingMessage,
  getOverflowRiskMessage,
} from '../src/viewer/text/textMutationMessaging';
import { getMutationSupport } from '../src/viewer/text/textMutationSupport';
import type { FontEncodingClass } from '../src/viewer/text/fontMutationSupport';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeTarget(source: 'digital' | 'ocr', lines: number, spans: number) {
  const makeSpan = (id: string) => ({
    id,
    pageIndex: 0,
    source,
    rect: { x: 0, y: 0, width: 200, height: 14 },
    text: 'Hello world',
    fontSize: 12,
  });

  const makeLine = (lineId: string, spanCount: number) => ({
    id: lineId,
    pageIndex: 0,
    source,
    rect: { x: 0, y: 0, width: 200, height: 14 },
    spans: Array.from({ length: spanCount }, (_, i) => makeSpan(`${lineId}:s${i}`)),
  });

  return {
    id: 'test:p0',
    pageIndex: 0,
    source,
    rect: { x: 0, y: 0, width: 200, height: 14 * lines },
    lines: Array.from({ length: lines }, (_, i) => makeLine(`test:l${i}`, spans)),
  };
}

// ---------------------------------------------------------------------------
// protected-content reason mapping
// ---------------------------------------------------------------------------

describe('messaging — protected-content reason', () => {
  it('returns non-empty tooltip', () => {
    // protected_or_locked support class triggers protected-content reason
    const support = getMutationSupport({
      id: 'x',
      pageIndex: 0,
      source: 'digital',
      rect: { x: 0, y: 0, width: 100, height: 14 },
      lines: [
        {
          id: 'x:l0',
          pageIndex: 0,
          source: 'digital',
          rect: { x: 0, y: 0, width: 100, height: 14 },
          spans: [
            {
              id: 'x:s0',
              pageIndex: 0,
              source: 'digital',
              rect: { x: 0, y: 0, width: 100, height: 14 },
              text: 'Protected',
              fontSize: 12,
              protected: true,
            },
          ],
        },
      ],
    });
    // If protected is not in the model, fall back to reason code message directly
    const msg = getUnsupportedMessage({ ...support, reasonCode: 'protected-content' });
    expect(msg.tooltip.length).toBeGreaterThan(0);
  });

  it('protected-content message is not actionable false (should be true — user can remove protection)', () => {
    const msg = getUnsupportedMessage({ supportClass: 'protected_or_locked', writable: false, reasonCode: 'protected-content', constraints: null });
    expect(msg.actionable).toBe(true);
  });

  it('protected-content explanation mentions beveiliging', () => {
    const msg = getUnsupportedMessage({ supportClass: 'protected_or_locked', writable: false, reasonCode: 'protected-content', constraints: null });
    expect(msg.explanation.toLowerCase()).toContain('beveiligd');
  });
});

// ---------------------------------------------------------------------------
// unknown-source reason mapping
// ---------------------------------------------------------------------------

describe('messaging — unknown-source reason', () => {
  it('returns non-empty tooltip', () => {
    const msg = getUnsupportedMessage({ supportClass: 'unknown_structure', writable: false, reasonCode: 'unknown-source', constraints: null });
    expect(msg.tooltip.length).toBeGreaterThan(0);
  });

  it('unknown-source actionable=false', () => {
    const msg = getUnsupportedMessage({ supportClass: 'unknown_structure', writable: false, reasonCode: 'unknown-source', constraints: null });
    expect(msg.actionable).toBe(false);
  });

  it('unknown-source explanation mentions vastgesteld (cannot be determined)', () => {
    const msg = getUnsupportedMessage({ supportClass: 'unknown_structure', writable: false, reasonCode: 'unknown-source', constraints: null });
    expect(msg.explanation.toLowerCase()).toContain('vastgesteld');
  });
});

// ---------------------------------------------------------------------------
// getFontEncodingMessage — all encoding classes
// ---------------------------------------------------------------------------

const ALL_ENCODING_CLASSES: FontEncodingClass[] = [
  'standard_latin', 'subset_embedded', 'identity_h', 'identity_v',
  'cid_keyed', 'custom_encoding', 'unknown',
];

describe('getFontEncodingMessage — completeness', () => {
  it('returns a result for every encoding class', () => {
    for (const cls of ALL_ENCODING_CLASSES) {
      const msg = getFontEncodingMessage(cls);
      expect(msg).toBeDefined();
    }
  });

  it('all encoding messages have non-empty tooltip', () => {
    for (const cls of ALL_ENCODING_CLASSES) {
      expect(getFontEncodingMessage(cls).tooltip.length).toBeGreaterThan(0);
    }
  });

  it('all encoding messages have non-empty explanation', () => {
    for (const cls of ALL_ENCODING_CLASSES) {
      expect(getFontEncodingMessage(cls).explanation.length).toBeGreaterThan(0);
    }
  });
});

describe('getFontEncodingMessage — safe encodings', () => {
  it('standard_latin message is not actionable (no issue to fix)', () => {
    expect(getFontEncodingMessage('standard_latin').actionable).toBe(false);
  });

  it('subset_embedded message is not actionable', () => {
    expect(getFontEncodingMessage('subset_embedded').actionable).toBe(false);
  });

  it('standard_latin tooltip mentions veilig', () => {
    expect(getFontEncodingMessage('standard_latin').tooltip.toLowerCase()).toContain('veilig');
  });
});

describe('getFontEncodingMessage — unsafe encodings', () => {
  it('identity_h message is not actionable (no fix available for user)', () => {
    expect(getFontEncodingMessage('identity_h').actionable).toBe(false);
  });

  it('identity_v message is not actionable', () => {
    expect(getFontEncodingMessage('identity_v').actionable).toBe(false);
  });

  it('cid_keyed message is not actionable', () => {
    expect(getFontEncodingMessage('cid_keyed').actionable).toBe(false);
  });

  it('unknown encoding message is not actionable', () => {
    expect(getFontEncodingMessage('unknown').actionable).toBe(false);
  });

  it('identity_h explanation mentions CID or Identity', () => {
    const msg = getFontEncodingMessage('identity_h');
    const lower = msg.explanation.toLowerCase();
    expect(lower.includes('cid') || lower.includes('identity')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// getOverflowRiskMessage — character overflow warnings
// ---------------------------------------------------------------------------

describe('getOverflowRiskMessage — structure', () => {
  it('returns non-empty tooltip for overflow=1', () => {
    const msg = getOverflowRiskMessage(1);
    expect(msg.tooltip.length).toBeGreaterThan(0);
  });

  it('returns non-empty explanation for overflow=5', () => {
    const msg = getOverflowRiskMessage(5);
    expect(msg.explanation.length).toBeGreaterThan(0);
  });

  it('is actionable (user must shorten the text)', () => {
    expect(getOverflowRiskMessage(3).actionable).toBe(true);
  });
});

describe('getOverflowRiskMessage — content accuracy', () => {
  it('overflow=1 tooltip mentions 1 teken', () => {
    expect(getOverflowRiskMessage(1).tooltip).toContain('1 teken');
  });

  it('overflow=5 tooltip mentions 5 tekens (plural)', () => {
    expect(getOverflowRiskMessage(5).tooltip).toContain('5 tekens');
  });

  it('overflow=1 explanation uses singular form', () => {
    const msg = getOverflowRiskMessage(1);
    expect(msg.explanation).toContain('1 teken');
  });

  it('overflow=10 explanation mentions the count', () => {
    const msg = getOverflowRiskMessage(10);
    expect(msg.explanation).toContain('10');
  });

  it('overflow=0 returns non-empty message (edge case)', () => {
    const msg = getOverflowRiskMessage(0);
    expect(msg.tooltip.length).toBeGreaterThan(0);
  });

  it('negative overflow treated as 0 (no crash)', () => {
    expect(() => getOverflowRiskMessage(-5)).not.toThrow();
    const msg = getOverflowRiskMessage(-5);
    expect(msg.tooltip.length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// Extended BackendRejectionCode
// ---------------------------------------------------------------------------

describe('backend rejection — font-encoding-unsafe', () => {
  it('returns non-empty tooltip', () => {
    expect(getBackendRejectionMessage('font-encoding-unsafe').tooltip.length).toBeGreaterThan(0);
  });

  it('explanation mentions lettertype or codering', () => {
    const msg = getBackendRejectionMessage('font-encoding-unsafe');
    const lower = msg.explanation.toLowerCase();
    expect(lower.includes('lettertype') || lower.includes('codering')).toBe(true);
  });

  it('is not actionable (user cannot change font encoding)', () => {
    expect(getBackendRejectionMessage('font-encoding-unsafe').actionable).toBe(false);
  });
});

describe('backend rejection — glyph-risk-detected', () => {
  it('returns non-empty tooltip', () => {
    expect(getBackendRejectionMessage('glyph-risk-detected').tooltip.length).toBeGreaterThan(0);
  });

  it('is actionable (user can use safer characters)', () => {
    expect(getBackendRejectionMessage('glyph-risk-detected').actionable).toBe(true);
  });

  it('explanation mentions tekens or lettertype', () => {
    const msg = getBackendRejectionMessage('glyph-risk-detected');
    const lower = msg.explanation.toLowerCase();
    expect(lower.includes('tekens') || lower.includes('lettertype')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Regression: previously tested codes still work
// ---------------------------------------------------------------------------

describe('messaging — regression: existing codes unchanged', () => {
  it('replacement-too-long still has actionable=true', () => {
    expect(getBackendRejectionMessage('replacement-too-long').actionable).toBe(true);
  });

  it('encoding-not-supported still has actionable=false', () => {
    expect(getBackendRejectionMessage('encoding-not-supported').actionable).toBe(false);
  });

  it('non_writable_digital_text tooltip still mentions complexe', () => {
    expect(getSupportClassTooltip('non_writable_digital_text').toLowerCase()).toContain('complex');
  });

  it('isSupportClassWritable still returns true only for writable_digital_text', () => {
    expect(isSupportClassWritable('writable_digital_text')).toBe(true);
    expect(isSupportClassWritable('non_writable_digital_text')).toBe(false);
    expect(isSupportClassWritable('ocr_read_only')).toBe(false);
  });
});
