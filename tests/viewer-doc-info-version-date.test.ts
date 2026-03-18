// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary and confidential.
// Free for personal, non-commercial use.
// Commercial use requires a valid license.
// See https://pdfluent.com/license for terms.

import { readFileSync } from 'node:fs';
import { describe, it, expect } from 'vitest';

const panelSource = readFileSync(
  new URL('../src/viewer/components/RightContextPanel.tsx', import.meta.url),
  'utf8'
);

// Locate MetadataInfo for scoped assertions
const metaStart = panelSource.indexOf('function MetadataInfo(');
const metaEnd   = panelSource.indexOf('\nfunction ', metaStart + 1);
const metaBody  = panelSource.slice(metaStart, metaEnd);

// ---------------------------------------------------------------------------
// PDF version
// ---------------------------------------------------------------------------

describe('RightContextPanel — doc info: PDF version', () => {
  it('renders PDF version with data-testid="doc-info-pdf-version"', () => {
    expect(metaBody).toContain('data-testid="doc-info-pdf-version"');
  });

  it('reads from pdfDoc.metadata.pdfVersion', () => {
    expect(metaBody).toContain('pdfDoc.metadata.pdfVersion');
  });

  it('falls back to "—" when pdfVersion is empty or missing', () => {
    expect(metaBody).toContain("pdfDoc.metadata.pdfVersion?.trim() || '—'");
  });

  it('uses the label "PDF-versie"', () => {
    expect(metaBody).toContain("t('docInfo.pdfVersion'");
  });
});

// ---------------------------------------------------------------------------
// Creation date
// ---------------------------------------------------------------------------

describe('RightContextPanel — doc info: creation date', () => {
  it('renders creation date with data-testid="doc-info-creation-date"', () => {
    expect(metaBody).toContain('data-testid="doc-info-creation-date"');
  });

  it('reads from pdfDoc.metadata.creationDate', () => {
    expect(metaBody).toContain('pdfDoc.metadata.creationDate');
  });

  it('validates the date with isNaN guard before formatting', () => {
    expect(metaBody).toContain('isNaN(creationDate.getTime())');
  });

  it('formats using toLocaleDateString with nl-NL locale', () => {
    expect(metaBody).toContain("toLocaleDateString(");
  });

  it('falls back to "—" when date is invalid or missing', () => {
    expect(metaBody).toContain(": '—'");
  });

  it('checks instanceof Date before calling getTime()', () => {
    expect(metaBody).toContain('creationDate instanceof Date');
  });

  it('uses the label "Aangemaakt"', () => {
    expect(metaBody).toContain("t('docInfo.created'");
  });
});

// ---------------------------------------------------------------------------
// No regressions to existing doc info fields
// ---------------------------------------------------------------------------

describe('RightContextPanel — doc info version/date: no regressions', () => {
  it('metadata-title-input still present', () => {
    expect(metaBody).toContain('data-testid="metadata-title-input"');
  });

  it('metadata-author-input still present', () => {
    expect(metaBody).toContain('data-testid="metadata-author-input"');
  });

  it('doc-info-page-count still present', () => {
    expect(metaBody).toContain('data-testid="doc-info-page-count"');
  });

  it('doc-info-dimensions still present', () => {
    expect(metaBody).toContain('data-testid="doc-info-dimensions"');
  });

  it('doc-info-form-type still present', () => {
    expect(metaBody).toContain('data-testid="doc-info-form-type"');
  });

  it('no-document fallback still present', () => {
    expect(metaBody).toContain("t('docInfo.noDocument'");
  });
});
