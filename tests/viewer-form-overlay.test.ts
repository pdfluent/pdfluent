// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary. The PDFluent application is free to use,
// including for commercial purposes. Redistribution, or extraction or reuse
// of its components (including the embedded PDF engine), requires a licence.
// See https://pdfluent.com/license for terms.

import { readFileSync } from 'node:fs';
import { describe, it, expect } from 'vitest';

// First-class AcroForm overlay (read-mode fillable; no Form Mode required).
const overlaySource = readFileSync(
  new URL('../src/viewer/components/FormOverlay.tsx', import.meta.url),
  'utf8',
);
const hookSource = readFileSync(
  new URL('../src/viewer/hooks/useFormModel.ts', import.meta.url),
  'utf8',
);
const barSource = readFileSync(
  new URL('../src/viewer/components/FormBar.tsx', import.meta.url),
  'utf8',
);
const apiSource = readFileSync(
  new URL('../src/lib/tauri-api.ts', import.meta.url),
  'utf8',
);
const viewerAppSource = readFileSync(
  new URL('../src/viewer/ViewerApp.tsx', import.meta.url),
  'utf8',
);

// ---------------------------------------------------------------------------
// FormOverlay — field-type coverage
// ---------------------------------------------------------------------------

describe('FormOverlay — field-type coverage', () => {
  it('renders a container with data-testid="form-overlay"', () => {
    expect(overlaySource).toContain('data-testid="form-overlay"');
  });

  it('handles every model kind: text, checkbox, radioGroup, comboBox, listBox', () => {
    for (const kind of ["'text'", "'checkbox'", "'radioGroup'", "'comboBox'", "'listBox'"]) {
      expect(overlaySource).toContain(`case ${kind}:`);
    }
  });

  it('renders text, checkbox, radio and select inputs with stable testids', () => {
    expect(overlaySource).toContain('data-testid="form-field-input"');
    expect(overlaySource).toContain('data-testid="form-field-checkbox"');
    expect(overlaySource).toContain('data-testid="form-field-radio"');
    expect(overlaySource).toContain('data-testid="form-field-select"');
  });

  it('renders multiline text fields as a textarea', () => {
    expect(overlaySource).toContain('field.kind.multiline');
    expect(overlaySource).toContain('<textarea');
  });

  it('renders comb fields with per-cell letter-spacing and a maxLength cap', () => {
    expect(overlaySource).toContain('field.kind.comb');
    expect(overlaySource).toContain('letterSpacing');
    expect(overlaySource).toContain('maxLength={field.maxLen}');
  });

  it('groups radio widgets by field name so the browser enforces exclusivity', () => {
    expect(overlaySource).toContain('type="radio"');
    expect(overlaySource).toContain('name={field.name}');
  });
});

// ---------------------------------------------------------------------------
// FormOverlay — coordinate transform & pointer model
// ---------------------------------------------------------------------------

describe('FormOverlay — coordinate transform & pointer model', () => {
  it('applies the PDF y-up → DOM y-down flip via pageHeightPt - y1', () => {
    expect(overlaySource).toContain('pageHeightPt - y1');
    expect(overlaySource).toContain('* zoom');
  });

  it('is pointer-transparent except on the inputs (clicks fall through)', () => {
    expect(overlaySource).toContain("pointerEvents: 'none'");
    expect(overlaySource).toContain("pointerEvents: 'auto'");
  });

  it('sits above the page-canvas overlay stack so a click focuses a field', () => {
    // PageCanvas layers go up to z=20 (TextLayer); the form overlay must be
    // higher or clicks hit the text layer and fields cannot be focused.
    expect(overlaySource).toContain('zIndex: 30');
  });

  it('paints a near-opaque fill so a baked /AP never double-draws', () => {
    expect(overlaySource).toContain('rgba(255,255,255,0.96)');
  });

  it('honours read-only fields (no edit, dimmed)', () => {
    expect(overlaySource).toContain('field.readOnly');
    expect(overlaySource).toContain('readOnly={field.readOnly}');
  });
});

// ---------------------------------------------------------------------------
// FormOverlay — document-wide tab navigation
// ---------------------------------------------------------------------------

describe('FormOverlay — Tab navigation', () => {
  it('intercepts Tab/Shift+Tab and delegates to onTab with a direction', () => {
    expect(overlaySource).toContain("e.key === 'Tab'");
    expect(overlaySource).toContain('e.shiftKey ? -1 : 1');
    expect(overlaySource).toContain('e.preventDefault()');
  });

  it('Escape blurs the field back to the document', () => {
    expect(overlaySource).toContain("e.key === 'Escape'");
    expect(overlaySource).toContain('.blur()');
  });

  it('Enter commits a single-line text field and advances', () => {
    expect(overlaySource).toContain("e.key === 'Enter'");
    expect(overlaySource).toContain('onTab(field.name, 1)');
  });
});

// ---------------------------------------------------------------------------
// useFormModel — contract & write-through
// ---------------------------------------------------------------------------

describe('useFormModel — contract & write-through', () => {
  it('loads the SDK model via getFormModel', () => {
    expect(hookSource).toContain('getFormModel');
    expect(apiSource).toContain('invoke<FormFieldModelDto[]>("get_form_model")');
  });

  it('writes every commit through the SDK writeback (setFormValue)', () => {
    expect(hookSource).toContain('setFormValue');
    expect(apiSource).toContain('set_form_value');
  });

  it('exposes a document-wide tab order sorted by page, then top-down, then left', () => {
    expect(hookSource).toContain('tabOrder');
    expect(hookSource).toContain('orderKey');
  });

  it('commits text/checkbox/radio/choice through typed requests', () => {
    expect(hookSource).toContain("kind: 'text'");
    expect(hookSource).toContain("kind: 'checkbox'");
    expect(hookSource).toContain("kind: 'radio'");
    expect(hookSource).toContain("kind: 'choice'");
  });

  it('does not bump the render revision on a fill (overlay is the visual truth)', () => {
    // The hook never calls setDocumentVersion; the overlay input shows the
    // value, so the freshly-baked /AP underneath cannot double-draw.
    expect(hookSource).not.toContain('setDocumentVersion');
  });

  it('records an undo entry (prev → new) on every commit', () => {
    expect(hookSource).toContain('pushUndo');
    expect(hookSource).toContain('makeCommand');
    // undo restores the captured previous value.
    expect(hookSource).toContain('applyValue(name, kind, prev)');
  });
});

// ---------------------------------------------------------------------------
// Clickable URI links + capability trust (task 4)
// ---------------------------------------------------------------------------

describe('Link overlay + capability trust', () => {
  const linkOverlay = readFileSync(
    new URL('../src/viewer/components/LinkOverlay.tsx', import.meta.url),
    'utf8',
  );

  it('exposes a clickable /Link → /URI layer', () => {
    expect(linkOverlay).toContain('data-testid="link-overlay"');
    expect(linkOverlay).toContain('data-testid="pdf-link"');
    expect(linkOverlay).toContain('onActivate');
    expect(apiSource).toContain('get_link_annotations');
  });

  it('routes activation through ask-on-first-use with Allow once / Always', () => {
    expect(viewerAppSource).toContain('handleLinkActivate');
    expect(viewerAppSource).toContain('autoOpenLinks === true'); // skip prompt when auto-allow
    expect(viewerAppSource).toContain('data-testid="link-choice-once-btn"');
    expect(viewerAppSource).toContain('data-testid="link-choice-always-btn"');
    // "Always" flips the persistent (visible, reversible) Form Bar toggle.
    expect(viewerAppSource).toContain('persistAutoOpenLinks(true)');
  });
});

// ---------------------------------------------------------------------------
// Form model wire contract (TS ↔ Rust DTO drift-guard)
// ---------------------------------------------------------------------------

describe('Form model wire contract', () => {
  it('TS DTO mirrors the serde-tagged kinds from the Rust FormFieldKindDto', () => {
    for (const t of [
      'type: "text"',
      'type: "checkbox"',
      'type: "radioGroup"',
      'type: "comboBox"',
      'type: "listBox"',
      'type: "pushButton"',
      'type: "signature"',
    ]) {
      expect(apiSource).toContain(t);
    }
  });

  it('the typed write request matches the Rust FormWriteRequest tag', () => {
    expect(apiSource).toContain('kind: "text"');
    expect(apiSource).toContain('kind: "radio"; name: string; export: string');
  });

  it('multi-select: DTO exposes selectedValues and FormWriteRequest has multiChoice', () => {
    expect(apiSource).toContain('selectedValues');
    expect(apiSource).toContain('kind: "multiChoice"');
    expect(apiSource).toContain('values: string[]');
  });

  it('multi-select: overlay renders a <select multiple> for multi-select list boxes', () => {
    expect(overlaySource).toContain('multiple');
    expect(overlaySource).toContain('data-testid="form-field-multiselect"');
    expect(overlaySource).toContain('onMultiChoice');
  });

  it('multi-select: hook exposes commitMultiChoice', () => {
    expect(hookSource).toContain('commitMultiChoice');
    expect(hookSource).toContain("'multiChoice'");
  });
});

// ---------------------------------------------------------------------------
// FormBar — calm, form-focused (no security theater)
// ---------------------------------------------------------------------------

describe('FormBar', () => {
  it('shows a field count, highlight toggle and jump-to-first action', () => {
    expect(barSource).toContain('data-testid="form-bar"');
    expect(barSource).toContain('data-testid="form-bar-highlight-toggle"');
    expect(barSource).toContain('data-testid="form-bar-jump-first"');
    expect(barSource).toContain('fieldCount');
  });

  it('contains no security-theater wording', () => {
    expect(barSource).not.toContain('Geblokkeerd');
    expect(barSource).not.toContain('actieve inhoud');
    expect(barSource).not.toContain('vertrouwen');
  });

  it('exposes a visible, reversible auto-open-links toggle when enabled', () => {
    expect(barSource).toContain('autoOpenLinks');
    expect(barSource).toContain('data-testid="form-bar-autolinks-toggle"');
  });
});

// ---------------------------------------------------------------------------
// ViewerApp — first-class wiring
// ---------------------------------------------------------------------------

describe('ViewerApp — first-class form wiring', () => {
  it('imports the new form overlay, bar and model hook', () => {
    expect(viewerAppSource).toContain('import { FormOverlay }');
    expect(viewerAppSource).toContain('import { FormBar }');
    expect(viewerAppSource).toContain('import { useFormModel }');
  });

  it('no longer imports or renders the legacy FormFieldOverlay', () => {
    expect(viewerAppSource).not.toContain('FormFieldOverlay');
  });

  it('renders the overlay in normal read mode (not only forms mode)', () => {
    const start = viewerAppSource.indexOf('<FormOverlay');
    expect(start).toBeGreaterThan(-1);
    const preceding = viewerAppSource.slice(Math.max(0, start - 260), start);
    expect(preceding).toContain("mode === 'read'");
    expect(preceding).toContain('formModel.hasForm');
  });

  it('renders the overlay on every page in the window (pageIndex={i})', () => {
    const start = viewerAppSource.indexOf('<FormOverlay');
    const end = viewerAppSource.indexOf('/>', start) + 2;
    const el = viewerAppSource.slice(start, end);
    expect(el).toContain('pageIndex={i}');
    expect(el).toContain('values={formModel.values}');
    expect(el).toContain('highlight={highlightFields}');
  });

  it('replaces the active-content banner with a FormBar gated on hasForm', () => {
    expect(viewerAppSource).toContain('<FormBar');
    expect(viewerAppSource).toContain('formModel.hasForm');
    expect(viewerAppSource).not.toContain('active-content-warning');
  });
});

// ---------------------------------------------------------------------------
// XFA Phase 0 — banner parity (dynamic XFA suppresses AcroForm UI)
// ---------------------------------------------------------------------------

describe('ViewerApp — XFA banner parity', () => {
  it('FormBar is suppressed when xfaDetected (avoids AcroForm UI on XFA docs)', () => {
    // Dynamic XFA docs like IMM 5257E embed an AcroForm compat dict, making
    // hasForm = true. The !pdfDoc.xfaDetected guard keeps FormBar hidden.
    expect(viewerAppSource).toContain('formModel.hasForm && !pdfDoc.xfaDetected');
  });

  it('XFA banner renders without requiring !formModel.hasForm (compat layer fix)', () => {
    // Old: pdfDoc.xfaDetected && !formModel.hasForm && !xfaBannerDismissed
    // New: pdfDoc.xfaDetected && !xfaBannerDismissed
    // The hasForm gate suppressed the banner for any XFA doc with an AcroForm compat layer.
    const bannerStart = viewerAppSource.indexOf('xfa-experimental-badge');
    expect(bannerStart).toBeGreaterThan(-1);
    const preceding = viewerAppSource.slice(Math.max(0, bannerStart - 250), bannerStart);
    expect(preceding).toContain('xfaDetected && !xfaBannerDismissed');
    expect(preceding).not.toContain('!formModel.hasForm');
  });

  it('FormOverlay is suppressed when xfaDetected (no double-render for XFA pages)', () => {
    // XFA pages are already rendered as images; the AcroForm overlay must not
    // render on top of them. The !pdfDoc?.xfaDetected guard prevents this.
    expect(viewerAppSource).toContain('!pdfDoc?.xfaDetected && !activeAnnotationTool');
  });
});

// ---------------------------------------------------------------------------
// XFA Phase 1 — editable fill overlay
// ---------------------------------------------------------------------------

const xfaOverlaySource = readFileSync(
  new URL('../src/viewer/components/XfaFormOverlay.tsx', import.meta.url),
  'utf8',
);
const xfaHookSource = readFileSync(
  new URL('../src/viewer/hooks/useXfaFormModel.ts', import.meta.url),
  'utf8',
);

describe('XfaFormOverlay — field-type coverage', () => {
  it('renders a container with data-testid="xfa-form-overlay"', () => {
    expect(xfaOverlaySource).toContain('data-testid="xfa-form-overlay"');
  });

  it('renders text, checkbox, radio and select inputs with stable testids', () => {
    expect(xfaOverlaySource).toContain('data-testid="xfa-field-input"');
    expect(xfaOverlaySource).toContain('data-testid="xfa-field-checkbox"');
    expect(xfaOverlaySource).toContain('data-testid="xfa-field-radio"');
    expect(xfaOverlaySource).toContain('data-testid="xfa-field-select"');
  });

  it('renders multiline text fields as a textarea', () => {
    expect(xfaOverlaySource).toContain('field.multiline');
    expect(xfaOverlaySource).toContain('<textarea');
  });

  it('handles the fillable XFA field families (text-like, dropdown, checkbox, radioGroup)', () => {
    expect(xfaOverlaySource).toContain('isTextLike');
    expect(xfaOverlaySource).toContain("field.fieldType === 'dropdown'");
    expect(xfaOverlaySource).toContain("field.fieldType === 'checkbox'");
    expect(xfaOverlaySource).toContain("field.fieldType === 'radioGroup'");
  });

  it('groups radio widgets by field name and selects by widget on-value', () => {
    expect(xfaOverlaySource).toContain('type="radio"');
    expect(xfaOverlaySource).toContain('name={field.name}');
    expect(xfaOverlaySource).toContain('widget.onValue');
  });
});

describe('XfaFormOverlay — coordinate transform (top-left origin, NO y-flip)', () => {
  it('maps XFA rects directly (rect.y * zoom) without the AcroForm pageHeight flip', () => {
    expect(xfaOverlaySource).toContain('rect.y * zoom');
    expect(xfaOverlaySource).toContain('rect.x * zoom');
    // The AcroForm y-up→y-down flip must NOT appear here: XFA is already y-down.
    expect(xfaOverlaySource).not.toContain('pageHeightPt - y1');
    expect(xfaOverlaySource).not.toContain('pageHeightPt');
  });

  it('is pointer-transparent except on the inputs, above the canvas stack', () => {
    expect(xfaOverlaySource).toContain("pointerEvents: 'none'");
    expect(xfaOverlaySource).toContain("pointerEvents: 'auto'");
    expect(xfaOverlaySource).toContain('zIndex: 30');
  });

  it('only shows widgets on the current rendered page (w.page === pageIndex)', () => {
    expect(xfaOverlaySource).toContain('w.page === pageIndex');
  });

  it('honours read-only XFA fields', () => {
    expect(xfaOverlaySource).toContain('field.readOnly');
  });
});

describe('useXfaFormModel — contract & write-through (Phase 2 commit loop)', () => {
  it('loads the SDK model via xfaFormModel / xfa_form_model', () => {
    expect(xfaHookSource).toContain('xfaFormModel');
    expect(apiSource).toContain('invoke<XfaFormModelDto>("xfa_form_model")');
  });

  it('prefers the Phase 2 commit loop (commitXfaFieldValue / commit_xfa_field_value)', () => {
    expect(xfaHookSource).toContain('commitXfaFieldValue');
    expect(apiSource).toContain('commit_xfa_field_value');
    // Phase 1 plain value-write is no longer the hook's commit path.
    expect(xfaHookSource).not.toContain('setXfaFieldValue');
  });

  it('commits text/checkbox/radio through typed requests', () => {
    expect(xfaHookSource).toContain("kind: 'text'");
    expect(xfaHookSource).toContain("kind: 'checkbox'");
    expect(xfaHookSource).toContain("kind: 'radio'");
  });

  it('bounds tab order / placement to RENDERED pages (suppressed layout pages excluded)', () => {
    // The XFA layout over-produces empty occur-instance pages that flatten drops;
    // the overlay must use the rendered page count, not session.pageCount.
    expect(xfaHookSource).toContain('renderedPages');
    expect(xfaHookSource).toContain('pdfDoc?.pages.length');
    expect(xfaHookSource).toContain('f.page < renderedPages');
  });

  it('folds the refreshed model from the commit result back into the overlay', () => {
    // The commit RESULT carries the post-commit model (script-driven presence
    // changes); the hook must apply result.model, NOT re-fetch statically.
    expect(xfaHookSource).toContain('result.model.fields');
    expect(xfaHookSource).toContain('setModel(result.model.fields)');
    expect(xfaHookSource).toContain('setPageCount(result.model.pageCount)');
  });

  it('repaints after a commit re-layouts (requestRepaint), and does not re-fetch on documentVersion', () => {
    expect(xfaHookSource).toContain('requestRepaint()');
    // The model-load effect deps must be exactly [pdfDoc?.id, isXfa, reloadNonce]
    // — NOT keyed on documentVersion, which would discard the commit result's
    // presence reveals via a static re-read.
    expect(xfaHookSource).toContain('[pdfDoc?.id, isXfa, reloadNonce]');
  });

  it('surfaces presence changes + page-count delta (debug output)', () => {
    expect(xfaHookSource).toContain('presenceChanges');
    expect(xfaHookSource).toContain('pageCountBefore');
    expect(xfaHookSource).toContain('pageCountAfter');
  });

  it('records an undo entry (prev → new) on every commit', () => {
    expect(xfaHookSource).toContain('pushUndo');
    expect(xfaHookSource).toContain('makeCommand');
    expect(xfaHookSource).toContain('applyValue(name, kind, prev)');
  });
});

describe('XFA Phase 2 wire contract (commit result DTO)', () => {
  it('exposes commitXfaFieldValue returning the commit-result DTO', () => {
    expect(apiSource).toContain('export interface XfaCommitResultDto');
    expect(apiSource).toContain('export interface XfaPresenceChangeDto');
    expect(apiSource).toContain('function commitXfaFieldValue');
  });

  it('the commit-result DTO mirrors the Rust XfaCommitResultDto fields', () => {
    for (const f of [
      'interactive',
      'scriptsExecuted',
      'pageCountBefore',
      'pageCountAfter',
      'presenceChanges',
      'model',
    ]) {
      expect(apiSource).toContain(f);
    }
  });

  it('ViewerApp wires a repaint callback into the XFA model hook', () => {
    const start = viewerAppSource.indexOf('useXfaFormModel(');
    expect(start).toBeGreaterThan(-1);
    const el = viewerAppSource.slice(start, start + 200);
    expect(el).toContain('bumpDocument');
  });
});

describe('XFA wire contract (TS ↔ Rust DTO drift-guard)', () => {
  it('TS XfaFieldType mirrors the Rust field-type tags', () => {
    for (const t of [
      '"text"',
      '"checkbox"',
      '"radioGroup"',
      '"dropdown"',
      '"dateTime"',
      '"numeric"',
      '"password"',
      '"signature"',
    ]) {
      expect(apiSource).toContain(t);
    }
  });

  it('the typed XFA write request matches the Rust XfaWriteRequest tag', () => {
    expect(apiSource).toContain('kind: "text"; name: string; value: string');
    expect(apiSource).toContain('kind: "checkbox"; name: string; checked: boolean');
    expect(apiSource).toContain('kind: "radio"; name: string; export: string');
  });

  it('XfaFieldDto exposes geometry + flags the overlay needs', () => {
    for (const f of ['somPath', 'fieldType', 'readOnly', 'multiline', 'onValue', 'widgets', 'pageCount']) {
      expect(apiSource).toContain(f);
    }
  });
});

describe('ViewerApp — XFA wiring', () => {
  it('imports the XFA overlay and model hook', () => {
    expect(viewerAppSource).toContain('import { XfaFormOverlay }');
    expect(viewerAppSource).toContain('import { useXfaFormModel }');
  });

  it('gates the interactive XFA fill overlay to dev builds (experimental, parked for RC)', () => {
    // The product ships XFA as view + convert-to-PDF only; interactive fill is
    // experimental and hidden in release builds.
    expect(viewerAppSource).toContain('const XFA_INTERACTIVE_FILL = import.meta.env.DEV');
    const start = viewerAppSource.indexOf('<XfaFormOverlay');
    expect(start).toBeGreaterThan(-1);
    const preceding = viewerAppSource.slice(Math.max(0, start - 260), start);
    expect(preceding).toContain('XFA_INTERACTIVE_FILL');
    expect(preceding).toContain('pdfDoc?.xfaDetected');
    expect(preceding).toContain('xfaForm.hasXfaForm');
  });
});

describe('ViewerApp — XFA claim discipline (no dynamic-XFA fill overclaim)', () => {
  it('XFA banner does NOT claim direct/in-place fill as the product behavior', () => {
    // No dynamic-XFA Acrobat-like fill claims in the shipped UI.
    expect(viewerAppSource).not.toContain('Vul de velden direct in op de pagina');
    expect(viewerAppSource).not.toContain('— invulbaar');
  });

  it('XFA banner leads with view + convert-to-PDF (acceptable wording)', () => {
    expect(viewerAppSource).toContain('Dit XFA-formulier wordt weergegeven');
    expect(viewerAppSource).toContain('Zet het om naar een standaard PDF');
    expect(viewerAppSource).toContain("i18n.t('xfa.convertToStandard')");
  });

  it('any experimental fill mention is gated behind the dev flag', () => {
    // The only "experimenteel" fill copy lives in the XFA_INTERACTIVE_FILL branch.
    const idx = viewerAppSource.indexOf('experimenteel');
    if (idx !== -1) {
      const ctx = viewerAppSource.slice(Math.max(0, idx - 400), idx);
      expect(ctx).toContain('XFA_INTERACTIVE_FILL ?');
    }
  });
});
