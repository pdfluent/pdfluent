// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary. The PDFluent application is free to use,
// including for commercial purposes. Redistribution, or extraction or reuse
// of its components (including the embedded PDF engine), requires a licence.
// See https://pdfluent.com/license for terms.

import { describe, expect, it } from 'vitest';
import { repairPdfTextArtifacts, detectTextLanguage } from '../textIntelligence';

describe('repairPdfTextArtifacts', () => {
  it('fixes ti-ligature encoded as punctuation, mid-word / word-start / after hyphen', () => {
    expect(repairPdfTextArtifacts('nego>a>on')).toBe('negotiation');
    expect(repairPdfTextArtifacts('with >cket & hotel')).toBe('with ticket & hotel');
    expect(repairPdfTextArtifacts('real->me targeting')).toBe('real-time targeting');
    expect(repairPdfTextArtifacts('mul>-layered')).toBe('multi-layered');
    expect(repairPdfTextArtifacts('organisa;onal')).toBe('organisational');
    expect(repairPdfTextArtifacts('innova=ve')).toBe('innovative');
  });

  it('fixes ti-ligature encoded as the digit 7, only between letters', () => {
    expect(repairPdfTextArtifacts('Educa7on')).toBe('Education');
    expect(repairPdfTextArtifacts('Learning & Cer7fica7on')).toBe('Learning & Certification');
    expect(repairPdfTextArtifacts('7th place, a 7-day trip, Windows 7')).toBe('7th place, a 7-day trip, Windows 7');
  });

  it('fixes tf-ligature encoded as capital O between lowercase letters', () => {
    expect(repairPdfTextArtifacts('plaOorm')).toBe('platform');
  });

  it('leaves legitimate punctuation and numbers alone', () => {
    expect(repairPdfTextArtifacts('managing > €1 MM')).toBe('managing > €1 MM');
    expect(repairPdfTextArtifacts('GPA: 3.7/4.0')).toBe('GPA: 3.7/4.0');
    expect(repairPdfTextArtifacts('a == b; c?')).toBe('a == b; c?');
  });

  it('decomposes Unicode ligatures', () => {
    expect(repairPdfTextArtifacts('eﬃcient oﬀer')).toBe('efficient offer');
  });
});

describe('detectTextLanguage', () => {
  it('detects Dutch', () => {
    const guess = detectTextLanguage('Dit is een document over de samenvatting van het project en de pagina.');
    expect(guess.language).toBe('nl');
  });

  it('detects English', () => {
    const guess = detectTextLanguage('This document describes the work and the technical decisions that were made for the product.');
    expect(guess.language).toBe('en');
  });
});
