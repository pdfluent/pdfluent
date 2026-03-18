// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary and confidential.
// Free for personal, non-commercial use.
// Commercial use requires a valid license.
// See https://pdfluent.com/license for terms.

import { describe, it, expect } from 'vitest';
import {
  getTextInteractionRule,
  isTextInteractionActive,
  isFullTextInteractionActive,
  isHoverOnlyTextInteractionActive,
} from '../src/viewer/text/textInteractionRules';

// ---------------------------------------------------------------------------
// Mode rules
// ---------------------------------------------------------------------------

describe('getTextInteractionRule — edit mode', () => {
  it('returns full level in edit mode with no tool', () => {
    const rule = getTextInteractionRule('edit', null);
    expect(rule.level).toBe('full');
  });

  it('includes a reason string', () => {
    const rule = getTextInteractionRule('edit', null);
    expect(rule.reason.length).toBeGreaterThan(0);
  });
});

describe('getTextInteractionRule — protect mode', () => {
  it('returns hover level in protect mode', () => {
    const rule = getTextInteractionRule('protect', null);
    expect(rule.level).toBe('hover');
  });
});

describe('getTextInteractionRule — suppressed modes', () => {
  const suppressedModes = ['read', 'review', 'forms', 'organize', 'convert'] as const;

  for (const mode of suppressedModes) {
    it(`returns none for mode "${mode}"`, () => {
      const rule = getTextInteractionRule(mode, null);
      expect(rule.level).toBe('none');
    });
  }
});

describe('getTextInteractionRule — active annotation tool suppresses all modes', () => {
  const tools = ['highlight', 'underline', 'strikeout', 'rectangle', 'redaction', 'freehand', 'stamp', 'comment'] as const;

  for (const tool of tools) {
    it(`suppresses edit mode when tool "${tool}" is active`, () => {
      const rule = getTextInteractionRule('edit', tool);
      expect(rule.level).toBe('none');
    });
  }

  it('suppresses protect mode when any tool is active', () => {
    const rule = getTextInteractionRule('protect', 'highlight');
    expect(rule.level).toBe('none');
  });
});

// ---------------------------------------------------------------------------
// Convenience predicates
// ---------------------------------------------------------------------------

describe('isTextInteractionActive', () => {
  it('returns true for edit mode, no tool', () => {
    expect(isTextInteractionActive('edit', null)).toBe(true);
  });

  it('returns true for protect mode, no tool', () => {
    expect(isTextInteractionActive('protect', null)).toBe(true);
  });

  it('returns false for read mode', () => {
    expect(isTextInteractionActive('read', null)).toBe(false);
  });

  it('returns false for review mode', () => {
    expect(isTextInteractionActive('review', null)).toBe(false);
  });

  it('returns false for forms mode', () => {
    expect(isTextInteractionActive('forms', null)).toBe(false);
  });

  it('returns false for edit mode with active tool', () => {
    expect(isTextInteractionActive('edit', 'rectangle')).toBe(false);
  });
});

describe('isFullTextInteractionActive', () => {
  it('returns true only for edit mode, no tool', () => {
    expect(isFullTextInteractionActive('edit', null)).toBe(true);
  });

  it('returns false for protect mode (hover only)', () => {
    expect(isFullTextInteractionActive('protect', null)).toBe(false);
  });

  it('returns false for read mode', () => {
    expect(isFullTextInteractionActive('read', null)).toBe(false);
  });
});

describe('isHoverOnlyTextInteractionActive', () => {
  it('returns true for protect mode, no tool', () => {
    expect(isHoverOnlyTextInteractionActive('protect', null)).toBe(true);
  });

  it('returns false for edit mode (full, not hover-only)', () => {
    expect(isHoverOnlyTextInteractionActive('edit', null)).toBe(false);
  });

  it('returns false for read mode', () => {
    expect(isHoverOnlyTextInteractionActive('read', null)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Source readiness
// ---------------------------------------------------------------------------

describe('textInteractionRules — source coverage', () => {
  it('covers all seven viewer modes', () => {
    const { readFileSync } = require('node:fs');
    const { join } = require('node:path');
    const src = readFileSync(
      join(import.meta.dirname, '../src/viewer/text/textInteractionRules.ts'),
      'utf8',
    );
    const modes = ['read', 'review', 'edit', 'forms', 'protect', 'organize', 'convert'];
    for (const m of modes) {
      expect(src).toContain(`'${m}'`);
    }
  });

  it('exports TextInteractionLevel type', () => {
    const { readFileSync } = require('node:fs');
    const { join } = require('node:path');
    const src = readFileSync(
      join(import.meta.dirname, '../src/viewer/text/textInteractionRules.ts'),
      'utf8',
    );
    expect(src).toContain('export type TextInteractionLevel');
    expect(src).toContain("'none'");
    expect(src).toContain("'hover'");
    expect(src).toContain("'full'");
  });
});
