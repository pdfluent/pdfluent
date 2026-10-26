// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary. The PDFluent application is free to use,
// including for commercial purposes. Redistribution, or extraction or reuse
// of its components (including the embedded PDF engine), requires a licence.
// See https://pdfluent.com/license for terms.

import { describe, expect, it } from 'vitest';
import { refusalMessage } from '../typeface';

describe('refusalMessage', () => {
  it('names the family when the licence forbids embedding', () => {
    expect(refusalMessage({ code: 'embedding-not-permitted', family: 'Fancy Sans', reason: 'restricted' }))
      .toEqual({ key: 'edit.typeface.refusedLicence', params: { family: 'Fancy Sans' } });
  });
  it('lists the missing characters', () => {
    expect(refusalMessage({ code: 'missing-glyphs', family: 'Fancy Sans', characters: 'é' }))
      .toEqual({ key: 'edit.typeface.refusedGlyphs', params: { family: 'Fancy Sans', characters: 'é' } });
  });
  it('has a sentence for every other refusal', () => {
    expect(refusalMessage({ code: 'font-not-found' }).key).toBe('edit.typeface.refusedGone');
    expect(refusalMessage({ code: 'text-not-found' }).key).toBe('edit.typeface.refusedText');
    expect(refusalMessage({ code: 'font-unusable', family: 'X' }).key).toBe('edit.typeface.refusedUnusable');
  });
});
