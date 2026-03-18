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

// Locate the MetadataInfo function for scoped assertions
const metaStart = panelSource.indexOf('function MetadataInfo(');
const metaEnd   = panelSource.indexOf('\nfunction ', metaStart + 1);
const metaBody  = panelSource.slice(metaStart, metaEnd);

// Locate the XFA label map
const xfaMapStart = panelSource.indexOf('XFA_TYPE_LABELS');
const xfaMapEnd   = panelSource.indexOf('};', xfaMapStart) + 2;
const xfaMapBody  = panelSource.slice(xfaMapStart, xfaMapEnd);

// ---------------------------------------------------------------------------
// Title rendering
// ---------------------------------------------------------------------------

describe('RightContextPanel — doc info: title', () => {
  it('renders the title as an editable input with data-testid="metadata-title-input"', () => {
    expect(metaBody).toContain('data-testid="metadata-title-input"');
  });

  it('falls back to pdfDoc.fileName when title is empty', () => {
    expect(metaBody).toContain('pdfDoc.fileName');
  });

  it('uses defaultValue to populate the title input', () => {
    const titleLineIdx = metaBody.indexOf('data-testid="metadata-title-input"');
    const inputEnd = metaBody.indexOf('/>', titleLineIdx) + 2;
    const inputEl = metaBody.slice(titleLineIdx, inputEnd);
    expect(inputEl).toContain('defaultValue={title}');
  });

  it('calls onMetadataChange with title key on blur', () => {
    const titleLineIdx = metaBody.indexOf('data-testid="metadata-title-input"');
    const inputEnd = metaBody.indexOf('/>', titleLineIdx) + 2;
    const inputEl = metaBody.slice(titleLineIdx, inputEnd);
    expect(inputEl).toContain("onMetadataChange('title'");
  });
});

// ---------------------------------------------------------------------------
// Author rendering
// ---------------------------------------------------------------------------

describe('RightContextPanel — doc info: author', () => {
  it('renders the author as an editable input with data-testid="metadata-author-input"', () => {
    expect(metaBody).toContain('data-testid="metadata-author-input"');
  });

  it('reads author from pdfDoc.metadata.author', () => {
    expect(metaBody).toContain("pdfDoc.metadata.author?.trim()");
  });

  it('calls onMetadataChange with author key on blur', () => {
    const authorLineIdx = metaBody.indexOf('data-testid="metadata-author-input"');
    const inputEnd = metaBody.indexOf('/>', authorLineIdx) + 2;
    const inputEl = metaBody.slice(authorLineIdx, inputEnd);
    expect(inputEl).toContain("onMetadataChange('author'");
  });
});

// ---------------------------------------------------------------------------
// Page count rendering
// ---------------------------------------------------------------------------

describe('RightContextPanel — doc info: page count', () => {
  it('renders the page count with data-testid="doc-info-page-count"', () => {
    expect(metaBody).toContain('data-testid="doc-info-page-count"');
  });

  it('displays the pageCount prop directly', () => {
    expect(metaBody).toContain('{pageCount}');
  });
});

// ---------------------------------------------------------------------------
// Page dimensions rendering
// ---------------------------------------------------------------------------

describe('RightContextPanel — doc info: page dimensions', () => {
  it('renders dimensions with data-testid="doc-info-dimensions"', () => {
    expect(metaBody).toContain('data-testid="doc-info-dimensions"');
  });

  it('reads size from pdfDoc.pages[0]', () => {
    expect(metaBody).toContain('pdfDoc.pages[0]');
  });

  it('converts points to millimetres using the 25.4/72 factor', () => {
    expect(metaBody).toContain('25.4 / 72');
  });

  it('rounds the mm value with Math.round', () => {
    expect(metaBody).toContain('Math.round(');
  });

  it('formats as "W × H mm"', () => {
    expect(metaBody).toContain('mm`');
  });

  it('falls back to "—" when pages array is empty', () => {
    // page0 is undefined when pages is empty → ternary returns '—'
    expect(metaBody).toContain("? `");
    expect(metaBody).toContain(": '—'");
  });
});

// ---------------------------------------------------------------------------
// Form type rendering
// ---------------------------------------------------------------------------

describe('RightContextPanel — doc info: form type', () => {
  it('renders form type with data-testid="doc-info-form-type"', () => {
    expect(metaBody).toContain('data-testid="doc-info-form-type"');
  });

  it('checks pdfDoc.metadata.hasXfa to detect XFA documents', () => {
    expect(metaBody).toContain('pdfDoc.metadata.hasXfa');
  });

  it('maps XFA form types via XFA_TYPE_LABELS', () => {
    expect(xfaMapBody).toContain("static:  'XFA statisch'");
    expect(xfaMapBody).toContain("dynamic: 'XFA dynamisch'");
    expect(xfaMapBody).toContain("hybrid:  'XFA hybride'");
  });

  it('falls back to "XFA" when xfaFormType is not in the map', () => {
    expect(metaBody).toContain("?? 'XFA'");
  });

  it('shows "AcroForm" when not XFA but formFields are present', () => {
    expect(metaBody).toContain("'AcroForm'");
    expect(metaBody).toContain('formFields.length > 0');
  });

  it('shows "Geen formulieren" when no XFA and no AcroForm fields', () => {
    expect(metaBody).toContain("'Geen formulieren'");
  });
});

// ---------------------------------------------------------------------------
// Empty / fallback behaviour when document is null
// ---------------------------------------------------------------------------

describe('RightContextPanel — doc info: no-document fallback', () => {
  it('returns a placeholder when pdfDoc is null', () => {
    expect(metaBody).toContain('if (!pdfDoc)');
    expect(metaBody).toContain('Geen document geopend');
  });
});

// ---------------------------------------------------------------------------
// formFields is threaded correctly
// ---------------------------------------------------------------------------

describe('RightContextPanel — doc info: formFields prop threading', () => {
  it('MetadataInfo accepts formFields as a prop', () => {
    expect(metaBody).toContain('formFields: FormField[]');
  });

  it('CollapsibleSection call site passes formFields={formFields}', () => {
    expect(panelSource).toContain('formFields={formFields}');
  });
});

// ---------------------------------------------------------------------------
// No regressions to existing right-panel content
// ---------------------------------------------------------------------------

describe('RightContextPanel — doc info: no regressions', () => {
  it('CollapsibleSection component still present', () => {
    expect(panelSource).toContain('function CollapsibleSection(');
  });

  it('Protect mode EncryptDecryptControls still present', () => {
    expect(panelSource).toContain('EncryptDecryptControls');
  });

  it('PermissionsDisplay still present', () => {
    expect(panelSource).toContain('PermissionsDisplay');
  });

  it('FormsModeContent still present', () => {
    expect(panelSource).toContain('FormsModeContent');
  });

  it('ReviewModeContent still present', () => {
    expect(panelSource).toContain('ReviewModeContent');
  });

  it('Documentinfo CollapsibleSection still wraps MetadataInfo', () => {
    expect(panelSource).toContain('<CollapsibleSection title="Documentinfo">');
    expect(panelSource).toContain('<MetadataInfo');
  });
});
