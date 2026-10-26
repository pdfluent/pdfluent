// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary. The PDFluent application is free to use,
// including for commercial purposes. Redistribution, or extraction or reuse
// of its components (including the embedded PDF engine), requires a licence.
// See https://pdfluent.com/license for terms.

// J-43: the edit panel's size stepper. The written size is proved by
// src-tauri/tests/text_format.rs; this pins what one click asks for.

import { describe, it, expect } from 'vitest';
import { nextFontSize, FONT_SIZE_BUTTONS } from '../fontSizeStep';

describe('nextFontSize', () => {
  it('steps by one point', () => {
    expect(nextFontSize(12, 1)).toBe(13);
    expect(nextFontSize(12, -1)).toBe(11);
  });
  it('a fractional size steps to the neighbouring whole point', () => {
    expect(nextFontSize(11.04, 1)).toBe(12);
    expect(nextFontSize(11.04, -1)).toBe(11);
  });
  it('stays within 6–72 pt', () => {
    expect(nextFontSize(6, -1)).toBe(6);
    expect(nextFontSize(72, 1)).toBe(72);
  });
});

describe('the edit panel size buttons', () => {
  it('smaller steps down and larger steps up', () => {
    expect(nextFontSize(12, FONT_SIZE_BUTTONS['edit-font-size-smaller'])).toBe(11);
    expect(nextFontSize(12, FONT_SIZE_BUTTONS['edit-font-size-larger'])).toBe(13);
  });
});
