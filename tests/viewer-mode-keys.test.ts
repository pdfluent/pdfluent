// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary. The PDFluent application is free to use,
// including for commercial purposes. Redistribution, or extraction or reuse
// of its components (including the embedded PDF engine), requires a licence.
// See https://pdfluent.com/license for terms.

// Mode switching keys 1–8. This file used to slice the handler's source and
// look for strings; it now calls the decision the handler makes
// (modeForKeyEvent). The wiring into the real hook is proved by
// src/viewer/hooks/__tests__/useKeyboardShortcuts.typing.test.ts.

import { describe, it, expect } from 'vitest';
import { modeForKeyEvent, MODE_KEYS } from '../src/viewer/hooks/keyTargets';

function key(k: string, init: Partial<{ metaKey: boolean; ctrlKey: boolean; altKey: boolean; target: unknown }> = {}) {
  return {
    key: k,
    metaKey: false,
    ctrlKey: false,
    altKey: false,
    shiftKey: false,
    target: { tagName: 'BODY', isContentEditable: false },
    ...init,
  } as Parameters<typeof modeForKeyEvent>[0];
}

describe('mode switching key mappings', () => {
  const expected = { '1': 'read', '2': 'review', '3': 'edit', '4': 'sign', '5': 'organize', '6': 'forms', '7': 'protect', '8': 'convert' } as const;
  for (const [k, mode] of Object.entries(expected)) {
    it(`maps '${k}' to ${mode}`, () => {
      expect(modeForKeyEvent(key(k), null)).toBe(mode);
    });
  }
  it('covers exactly the eight viewer modes', () => {
    expect(Object.keys(MODE_KEYS).sort()).toEqual(Object.keys(expected).sort());
  });
});

describe('mode key guard', () => {
  for (const mod of ['metaKey', 'ctrlKey', 'altKey'] as const) {
    it(`ignores the key when ${mod} is held`, () => {
      expect(modeForKeyEvent(key('2', { [mod]: true }), null)).toBeNull();
    });
  }
  for (const tagName of ['INPUT', 'TEXTAREA', 'SELECT']) {
    it(`ignores the key inside a ${tagName}`, () => {
      expect(modeForKeyEvent(key('2', { target: { tagName } }), null)).toBeNull();
    });
  }
  it('ignores the key inside the contentEditable inline editor (#642)', () => {
    expect(modeForKeyEvent(key('2', { target: { tagName: 'DIV', isContentEditable: true } }), null)).toBeNull();
  });
  it('ignores the key while a text edit is open', () => {
    expect(modeForKeyEvent(key('2'), 'p0:par1')).toBeNull();
  });
});
