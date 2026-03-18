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

const viewerAppSource = readFileSync(
  new URL('../src/viewer/ViewerApp.tsx', import.meta.url),
  'utf8'
);

// ---------------------------------------------------------------------------
// Props wiring — ViewerApp → RightContextPanel
// ---------------------------------------------------------------------------

describe('ViewerApp — RightContextPanel forms/review wiring', () => {
  it('passes formFields to RightContextPanel', () => {
    expect(viewerAppSource).toContain('formFields={formFields}');
  });

  it('passes comments to RightContextPanel', () => {
    expect(viewerAppSource).toContain('comments={comments}');
  });
});

// ---------------------------------------------------------------------------
// RightContextPanel props interface
// ---------------------------------------------------------------------------

describe('RightContextPanel — props interface', () => {
  it('declares formFields prop as FormField array', () => {
    expect(panelSource).toContain('formFields: FormField[]');
  });

  it('declares comments prop as Annotation array', () => {
    expect(panelSource).toContain('comments: Annotation[]');
  });

  it('imports FormField from core/document', () => {
    expect(panelSource).toContain('FormField');
    expect(panelSource).toContain('core/document');
  });

  it('imports Annotation from core/document', () => {
    expect(panelSource).toContain('Annotation');
  });

  it('imports FormFieldType for the label map', () => {
    expect(panelSource).toContain('FormFieldType');
  });
});

// ---------------------------------------------------------------------------
// Forms mode rendering
// ---------------------------------------------------------------------------

describe('RightContextPanel — forms mode content', () => {
  it('defines FormsModeContent component', () => {
    expect(panelSource).toContain('function FormsModeContent');
  });

  it('renders forms mode section with title Formuliervelden', () => {
    expect(panelSource).toContain('Formuliervelden');
  });

  it('activates FormsModeContent when mode is forms', () => {
    expect(panelSource).toContain("mode === 'forms'");
    const formsBlock = panelSource.indexOf("mode === 'forms'");
    const formsModeContent = panelSource.indexOf('FormsModeContent', formsBlock);
    expect(formsModeContent).toBeGreaterThan(formsBlock);
  });

  it('passes formFields to FormsModeContent', () => {
    expect(panelSource).toContain('formFields={formFields}');
  });

  it('shows field count label', () => {
    expect(panelSource).toContain('veld');
  });

  it('shows type label from FIELD_TYPE_LABELS', () => {
    expect(panelSource).toContain('FIELD_TYPE_LABELS');
  });

  it('shows page number for each field', () => {
    // p.{field.pageIndex + 1}
    const formsContent = panelSource.indexOf('function FormsModeContent');
    const pageRef = panelSource.indexOf('field.pageIndex + 1', formsContent);
    expect(pageRef).toBeGreaterThan(formsContent);
  });

  it('shows field name or label', () => {
    expect(panelSource).toContain('field.label || field.name');
  });
});

// ---------------------------------------------------------------------------
// Forms mode empty state
// ---------------------------------------------------------------------------

describe('RightContextPanel — forms mode empty state', () => {
  it('renders empty state when formFields is empty', () => {
    const formsContent = panelSource.indexOf('function FormsModeContent');
    const emptyText = panelSource.indexOf('Geen formuliervelden gevonden', formsContent);
    expect(emptyText).toBeGreaterThan(formsContent);
  });

  it('empty state is inside FormsModeContent (not a generic placeholder)', () => {
    const formsContent = panelSource.indexOf('function FormsModeContent');
    const nextFunction = panelSource.indexOf('\nfunction ', formsContent + 1);
    const emptyText = panelSource.indexOf('Geen formuliervelden gevonden', formsContent);
    expect(emptyText).toBeLessThan(nextFunction);
  });
});

// ---------------------------------------------------------------------------
// Review mode rendering
// ---------------------------------------------------------------------------

describe('RightContextPanel — review mode content', () => {
  it('defines ReviewModeContent component', () => {
    expect(panelSource).toContain('function ReviewModeContent');
  });

  it('renders review mode section with title Opmerkingen', () => {
    expect(panelSource).toContain('Opmerkingen');
  });

  it('activates ReviewModeContent when mode is review', () => {
    expect(panelSource).toContain("mode === 'review'");
    const reviewBlock = panelSource.indexOf("mode === 'review'");
    const reviewContent = panelSource.indexOf('ReviewModeContent', reviewBlock);
    expect(reviewContent).toBeGreaterThan(reviewBlock);
  });

  it('passes comments to ReviewModeContent', () => {
    expect(panelSource).toContain('comments={comments}');
  });

  it('shows comment count label', () => {
    expect(panelSource).toContain('opmerking');
  });

  it('shows author for each comment', () => {
    const reviewContent = panelSource.indexOf('function ReviewModeContent');
    const authorRef = panelSource.indexOf('comment.author', reviewContent);
    expect(authorRef).toBeGreaterThan(reviewContent);
  });

  it('shows page number in group headings', () => {
    // Page numbers now appear in group headings (Pagina {pageIndex + 1}), not per-row
    const reviewContent = panelSource.indexOf('function ReviewModeContent');
    const pageRef = panelSource.indexOf('pageIndex + 1', reviewContent);
    expect(pageRef).toBeGreaterThan(reviewContent);
  });

  it('shows comment contents when present', () => {
    const reviewContent = panelSource.indexOf('function ReviewModeContent');
    const contentsRef = panelSource.indexOf('comment.contents', reviewContent);
    expect(contentsRef).toBeGreaterThan(reviewContent);
  });

  it('falls back to Onbekend when author is missing', () => {
    expect(panelSource).toContain('comment.author || \'Onbekend\'');
  });
});

// ---------------------------------------------------------------------------
// Review mode empty state
// ---------------------------------------------------------------------------

describe('RightContextPanel — review mode empty state', () => {
  it('renders empty state when comments is empty', () => {
    const reviewContent = panelSource.indexOf('function ReviewModeContent');
    const emptyText = panelSource.indexOf('Geen opmerkingen gevonden', reviewContent);
    expect(emptyText).toBeGreaterThan(reviewContent);
  });

  it('empty state is inside ReviewModeContent (not a generic placeholder)', () => {
    const reviewContent = panelSource.indexOf('function ReviewModeContent');
    // ReviewModeContent may be the last plain function; fall back to source length as upper bound
    const nextFunction = panelSource.indexOf('\nfunction ', reviewContent + 1);
    const bound = nextFunction === -1 ? panelSource.length : nextFunction;
    const emptyText = panelSource.indexOf('Geen opmerkingen gevonden', reviewContent);
    expect(emptyText).toBeGreaterThan(reviewContent);
    expect(emptyText).toBeLessThan(bound);
  });
});

// ---------------------------------------------------------------------------
// Placeholder removal — forms and review no longer in PLACEHOLDER_SECTIONS
// ---------------------------------------------------------------------------

describe('RightContextPanel — placeholder sections cleanup', () => {
  it('forms mode is no longer a key in PLACEHOLDER_SECTIONS', () => {
    // The old placeholder had 'Veldeigenschappen' as a forms section title
    expect(panelSource).not.toContain('Veldeigenschappen');
  });

  it('review mode filter/color placeholders are removed', () => {
    // The old placeholder had 'Markeerkleur' and 'Opmerkingen filteren'
    expect(panelSource).not.toContain('Markeerkleur');
    expect(panelSource).not.toContain('Opmerkingen filteren');
  });

  it('PLACEHOLDER_SECTIONS uses Partial<Record> type', () => {
    expect(panelSource).toContain('Partial<Record<ViewerMode');
  });

  it('fallback block excludes forms and review modes', () => {
    expect(panelSource).toContain("mode !== 'forms'");
    expect(panelSource).toContain("mode !== 'review'");
  });
});
