// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary and confidential.
// Free for personal, non-commercial use.
// Commercial use requires a valid license.
// See https://pdfluent.com/license for terms.

import { readFileSync } from 'node:fs';
import { describe, it, expect } from 'vitest';

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

const rightPanelSource = readFileSync(
  new URL('../src/viewer/components/RightContextPanel.tsx', import.meta.url),
  'utf8'
);

// ---------------------------------------------------------------------------
// ViewerApp — formValidationErrors state
// ---------------------------------------------------------------------------

describe('ViewerApp — formValidationErrors state', () => {
  it('declares formValidationErrors as useState with the right type annotation', () => {
    expect(viewerAppSource).toContain(
      'const [formValidationErrors, setFormValidationErrors] = useState<Array<{ fieldId: string; errors: string[] }>>([])'
    );
  });

  it('passes formValidationErrors to RightContextPanel', () => {
    expect(viewerAppSource).toContain('formValidationErrors={formValidationErrors}');
  });
});

// ---------------------------------------------------------------------------
// ViewerApp — handleFormSubmit
// ---------------------------------------------------------------------------

describe('ViewerApp — handleFormSubmit', () => {
  it('is defined as an async useCallback', () => {
    expect(viewerAppSource).toContain('const handleFormSubmit = useCallback(async () =>');
  });

  it('calls engine.form.validateAllFormFields(pdfDoc)', () => {
    const fnStart = viewerAppSource.indexOf('const handleFormSubmit = useCallback');
    const fnEnd = viewerAppSource.indexOf('}, [pdfDoc, engine, currentFilePath, clearDirty, handleSaveAs])', fnStart) + 70;
    const fnBody = viewerAppSource.slice(fnStart, fnEnd);
    expect(fnBody).toContain('engine.form.validateAllFormFields(pdfDoc)');
  });

  it('sets formValidationErrors when invalid fields exist', () => {
    const fnStart = viewerAppSource.indexOf('const handleFormSubmit = useCallback');
    const fnEnd = viewerAppSource.indexOf('}, [pdfDoc, engine, currentFilePath, clearDirty, handleSaveAs])', fnStart) + 70;
    const fnBody = viewerAppSource.slice(fnStart, fnEnd);
    expect(fnBody).toContain('setFormValidationErrors(invalid)');
  });

  it('clears formValidationErrors on success before saving', () => {
    const fnStart = viewerAppSource.indexOf('const handleFormSubmit = useCallback');
    const fnEnd = viewerAppSource.indexOf('}, [pdfDoc, engine, currentFilePath, clearDirty, handleSaveAs])', fnStart) + 70;
    const fnBody = viewerAppSource.slice(fnStart, fnEnd);
    expect(fnBody).toContain('setFormValidationErrors([])');
  });

  it('returns early (does not save) when there are invalid fields', () => {
    const fnStart = viewerAppSource.indexOf('const handleFormSubmit = useCallback');
    const fnEnd = viewerAppSource.indexOf('}, [pdfDoc, engine, currentFilePath, clearDirty, handleSaveAs])', fnStart) + 70;
    const fnBody = viewerAppSource.slice(fnStart, fnEnd);
    // setFormValidationErrors(invalid) must come BEFORE save_pdf invocation
    const setErrorPos = fnBody.indexOf('setFormValidationErrors(invalid)');
    const savePos = fnBody.indexOf("invoke('save_pdf'");
    expect(setErrorPos).toBeGreaterThan(-1);
    expect(savePos).toBeGreaterThan(-1);
    expect(setErrorPos).toBeLessThan(savePos);
  });

  it('invokes save_pdf with currentFilePath on success', () => {
    const fnStart = viewerAppSource.indexOf('const handleFormSubmit = useCallback');
    const fnEnd = viewerAppSource.indexOf('}, [pdfDoc, engine, currentFilePath, clearDirty, handleSaveAs])', fnStart) + 70;
    const fnBody = viewerAppSource.slice(fnStart, fnEnd);
    expect(fnBody).toContain("invoke('save_pdf', { path: currentFilePath })");
  });

  it('calls clearDirty after successful save', () => {
    const fnStart = viewerAppSource.indexOf('const handleFormSubmit = useCallback');
    const fnEnd = viewerAppSource.indexOf('}, [pdfDoc, engine, currentFilePath, clearDirty, handleSaveAs])', fnStart) + 70;
    const fnBody = viewerAppSource.slice(fnStart, fnEnd);
    expect(fnBody).toContain('clearDirty()');
  });

  it('falls back to handleSaveAs when no currentFilePath', () => {
    const fnStart = viewerAppSource.indexOf('const handleFormSubmit = useCallback');
    const fnEnd = viewerAppSource.indexOf('}, [pdfDoc, engine, currentFilePath, clearDirty, handleSaveAs])', fnStart) + 70;
    const fnBody = viewerAppSource.slice(fnStart, fnEnd);
    expect(fnBody).toContain('await handleSaveAs()');
  });

  it('passes handleFormSubmit to RightContextPanel as onFormSubmit', () => {
    expect(viewerAppSource).toContain('onFormSubmit={handleFormSubmit}');
  });
});

// ---------------------------------------------------------------------------
// ViewerApp — handleSetFieldValue clears validation errors
// ---------------------------------------------------------------------------

describe('ViewerApp — handleSetFieldValue clears per-field validation error', () => {
  it('calls setFormValidationErrors filter inside handleSetFieldValue on success', () => {
    const fnStart = viewerAppSource.indexOf('const handleSetFieldValue = useCallback');
    const fnEnd = viewerAppSource.indexOf('\n  }, [', fnStart) + 4;
    const fnBody = viewerAppSource.slice(fnStart, fnEnd);
    expect(fnBody).toContain('setFormValidationErrors(prev => prev.filter(e => e.fieldId !== fieldId))');
  });

  it('clears error only after a successful result (inside result.success block)', () => {
    const fnStart = viewerAppSource.indexOf('const handleSetFieldValue = useCallback');
    const fnEnd = viewerAppSource.indexOf('\n  }, [', fnStart) + 4;
    const fnBody = viewerAppSource.slice(fnStart, fnEnd);
    // The clearError call must appear after the markDirty() call
    const markDirtyPos = fnBody.indexOf('markDirty()');
    const clearErrPos = fnBody.indexOf('setFormValidationErrors(prev => prev.filter');
    expect(markDirtyPos).toBeGreaterThan(-1);
    expect(clearErrPos).toBeGreaterThan(markDirtyPos);
  });
});

// ---------------------------------------------------------------------------
// RightContextPanel — formValidationErrors + onFormSubmit props
// ---------------------------------------------------------------------------

describe('RightContextPanel — new props contract', () => {
  it('formValidationErrors is in RightContextPanelProps', () => {
    const ifaceStart = rightPanelSource.indexOf('interface RightContextPanelProps');
    const ifaceEnd = rightPanelSource.indexOf('\n}', ifaceStart) + 2;
    const iface = rightPanelSource.slice(ifaceStart, ifaceEnd);
    expect(iface).toContain('formValidationErrors: Array<{ fieldId: string; errors: string[] }>');
  });

  it('onFormSubmit is in RightContextPanelProps', () => {
    const ifaceStart = rightPanelSource.indexOf('interface RightContextPanelProps');
    const ifaceEnd = rightPanelSource.indexOf('\n}', ifaceStart) + 2;
    const iface = rightPanelSource.slice(ifaceStart, ifaceEnd);
    expect(iface).toContain('onFormSubmit: () => void');
  });

  it('formValidationErrors is destructured in RightContextPanel function', () => {
    const fnStart = rightPanelSource.indexOf('export function RightContextPanel(');
    const fnEnd = rightPanelSource.indexOf('}: RightContextPanelProps)', fnStart) + 30;
    const signature = rightPanelSource.slice(fnStart, fnEnd);
    expect(signature).toContain('formValidationErrors');
  });

  it('onFormSubmit is destructured in RightContextPanel function', () => {
    const fnStart = rightPanelSource.indexOf('export function RightContextPanel(');
    const fnEnd = rightPanelSource.indexOf('}: RightContextPanelProps)', fnStart) + 30;
    const signature = rightPanelSource.slice(fnStart, fnEnd);
    expect(signature).toContain('onFormSubmit');
  });

  it('formValidationErrors is forwarded to FormsModeContent', () => {
    expect(rightPanelSource).toContain('formValidationErrors={formValidationErrors}');
  });

  it('onFormSubmit is forwarded to FormsModeContent', () => {
    expect(rightPanelSource).toContain('onFormSubmit={onFormSubmit}');
  });
});

// ---------------------------------------------------------------------------
// FormsModeContent — errorMap
// ---------------------------------------------------------------------------

describe('FormsModeContent — errorMap useMemo', () => {
  it('builds errorMap from formValidationErrors', () => {
    expect(rightPanelSource).toContain(
      'new Map(formValidationErrors.map(e => [e.fieldId, e.errors]))'
    );
  });

  it('depends on formValidationErrors', () => {
    expect(rightPanelSource).toContain('[formValidationErrors]');
  });
});

// ---------------------------------------------------------------------------
// FormsModeContent — per-field error indicators
// ---------------------------------------------------------------------------

describe('FormsModeContent — per-field error rendering', () => {
  it('renders a field-error-badge when errorMap has the field', () => {
    expect(rightPanelSource).toContain('data-testid="field-error-badge"');
  });

  it('shows the error badge only when errorMap.has(field.id)', () => {
    const badgeStart = rightPanelSource.indexOf('data-testid="field-error-badge"');
    // Look backward for the conditional
    const precedingSlice = rightPanelSource.slice(Math.max(0, badgeStart - 80), badgeStart);
    expect(precedingSlice).toContain('errorMap.has(field.id)');
  });

  it('renders a field-validation-error paragraph with error text', () => {
    expect(rightPanelSource).toContain('data-testid="field-validation-error"');
  });

  it('field-validation-error text is joined errors from errorMap', () => {
    const errStart = rightPanelSource.indexOf('data-testid="field-validation-error"');
    const errEnd = rightPanelSource.indexOf('</p>', errStart) + 4;
    const errBlock = rightPanelSource.slice(errStart, errEnd);
    expect(errBlock).toContain('errorMap.get(field.id)!.join(');
  });
});

// ---------------------------------------------------------------------------
// FormsModeContent — submit button
// ---------------------------------------------------------------------------

describe('FormsModeContent — submit button', () => {
  it('renders a form-submit-btn button', () => {
    expect(rightPanelSource).toContain('data-testid="form-submit-btn"');
  });

  it('calls onFormSubmit on click using void pattern', () => {
    const btnStart = rightPanelSource.indexOf('data-testid="form-submit-btn"');
    const btnEnd = rightPanelSource.indexOf('</button>', btnStart) + 9;
    const btnBlock = rightPanelSource.slice(btnStart, btnEnd);
    expect(btnBlock).toContain('void onFormSubmit()');
  });

  it('label is "Formulier opslaan"', () => {
    const btnStart = rightPanelSource.indexOf('data-testid="form-submit-btn"');
    const btnEnd = rightPanelSource.indexOf('</button>', btnStart) + 9;
    const btnBlock = rightPanelSource.slice(btnStart, btnEnd);
    expect(btnBlock).toContain("t('forms.saveForm')");
  });

  it('button appears after the field list (outside the map)', () => {
    // The submit button must appear after the closing })} of the formFields.map
    const mapClose = rightPanelSource.indexOf('      })}');
    const btnPos = rightPanelSource.indexOf('data-testid="form-submit-btn"', mapClose);
    expect(btnPos).toBeGreaterThan(mapClose);
  });
});

// ---------------------------------------------------------------------------
// No-regression: existing forms write paths
// ---------------------------------------------------------------------------

describe('No-regression — forms write paths still intact', () => {
  it('TEXT_LIKE_TYPES still defined', () => {
    expect(rightPanelSource).toContain("const TEXT_LIKE_TYPES: ReadonlySet<FormFieldType> = new Set(['text', 'number', 'date', 'time', 'combo', 'list'])");
  });

  it('field-value-input testid still present', () => {
    expect(rightPanelSource).toContain('data-testid="field-value-input"');
  });

  it('Enter → onSetFieldValue still wired', () => {
    expect(rightPanelSource).toContain('onSetFieldValue(field.id, editValue)');
  });

  it('forms-completion-summary still present', () => {
    expect(rightPanelSource).toContain('data-testid="forms-completion-summary"');
  });

  it('handleSetFieldValue still in ViewerApp', () => {
    expect(viewerAppSource).toContain('const handleSetFieldValue = useCallback');
  });

  it('onSetFieldValue still passed to RightContextPanel', () => {
    expect(viewerAppSource).toContain('onSetFieldValue={handleSetFieldValue}');
  });
});
