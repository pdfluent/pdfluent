// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary and confidential.
// Free for personal, non-commercial use.
// Commercial use requires a valid license.
// See https://pdfluent.com/license for terms.

import { readFileSync } from 'node:fs';
import { describe, it, expect } from 'vitest';

const leftNavSource = readFileSync(
  new URL('../src/viewer/components/LeftNavRail.tsx', import.meta.url),
  'utf8'
);

const viewerAppSource = [
  '../src/viewer/hooks/usePageNavigation.ts',
  '../src/viewer/hooks/useZoomControls.ts',
  '../src/viewer/hooks/useSidebarState.ts',
  '../src/viewer/hooks/useUndoRedo.ts',
  '../src/viewer/hooks/useSearch.ts',
  '../src/viewer/hooks/useFormFields.ts',
  '../src/viewer/hooks/useModeManager.ts',
  '../src/viewer/hooks/useDocumentLifecycle.ts',
  '../src/viewer/hooks/useCommands.ts',
  '../src/viewer/hooks/useDragDrop.ts',
  '../src/viewer/ViewerSidePanels.tsx',
  '../src/viewer/hooks/useAnnotations.ts',
  '../src/viewer/hooks/useTextInteraction.ts',
  '../src/viewer/hooks/useKeyboardShortcuts.ts',
  '../src/viewer/ViewerApp.tsx',
  '../src/viewer/WelcomeSection.tsx',
].map(p => readFileSync(new URL(p, import.meta.url), 'utf8')).join('\n\n');

describe('viewer FieldsPanel — v2 left rail', () => {
  it('renders empty state when no form fields are present', () => {
    expect(leftNavSource).toContain("t('leftNav.noFormFields'");
    expect(leftNavSource).toContain('FileInputIcon');
  });

  it('renders a field row with name/label, type badge, and page number', () => {
    // Label or name displayed in truncated span
    expect(leftNavSource).toContain('field.label || field.name');
    // Type badge using FIELD_TYPE_LABELS lookup
    expect(leftNavSource).toContain('FIELD_TYPE_LABEL_KEYS[field.type]');
    // Page number (1-based)
    expect(leftNavSource).toContain('field.pageIndex + 1');
  });

  it('exposes all FormFieldType labels in FIELD_TYPE_LABELS', () => {
    // All 14 FormFieldType values must have an i18n key in the map
    const expectedKeys = [
      'leftNav.fieldTypeText', 'leftNav.fieldTypeCheckbox', 'leftNav.fieldTypeRadio',
      'leftNav.fieldTypeList', 'leftNav.fieldTypeCombo', 'leftNav.fieldTypeSignature',
      'leftNav.fieldTypeButton', 'leftNav.fieldTypeDate', 'leftNav.fieldTypeTime',
      'leftNav.fieldTypeNumber', 'leftNav.fieldTypePassword', 'leftNav.fieldTypeFile',
      'leftNav.fieldTypeBarcode', 'leftNav.fieldTypeRichText',
    ];
    for (const key of expectedKeys) {
      expect(leftNavSource).toContain(key);
    }
  });

  it('accepts formFields prop in LeftNavRailProps', () => {
    expect(leftNavSource).toContain('formFields: FormField[]');
  });

  it('passes formFields to FieldsPanel via PanelContent', () => {
    expect(leftNavSource).toContain('formFields={formFields}');
  });

  it('no longer has the TODO(pdfluent-viewer) marker for FieldsPanel', () => {
    expect(leftNavSource).not.toContain('TODO(pdfluent-viewer): implement form fields panel');
  });
});

describe('viewer ViewerApp — formFields state wiring', () => {
  it('declares formFields state', () => {
    expect(viewerAppSource).toContain('useState<FormField[]>([])');
  });

  it('resets formFields when document changes', () => {
    expect(viewerAppSource).toContain('setFormFields([])');
  });

  it('populates formFields from engine.form.getAllFormFields after load', () => {
    expect(viewerAppSource).toContain('engine.form.getAllFormFields(pdfDoc)');
  });

  it('passes formFields into LeftNavRail', () => {
    expect(viewerAppSource).toContain('formFields={formFields}');
  });
});
