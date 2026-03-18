// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary and confidential.
// Free for personal, non-commercial use.
// Commercial use requires a valid license.
// See https://pdfluent.com/license for terms.

import { readFileSync } from 'node:fs';
import { describe, it, expect } from 'vitest';

const mockFormEngineSource = readFileSync(
  new URL('../src/core/engine/mock/MockFormEngine.ts', import.meta.url),
  'utf8'
);

const tauriFormEngineSource = readFileSync(
  new URL('../src/platform/engine/tauri/TauriFormEngine.ts', import.meta.url),
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

const rightPanelSource = readFileSync(
  new URL('../src/viewer/components/RightContextPanel.tsx', import.meta.url),
  'utf8'
);

// ---------------------------------------------------------------------------
// MockFormEngine — setFormFieldValue
// ---------------------------------------------------------------------------

describe('MockFormEngine — setFormFieldValue', () => {
  it('is defined with the correct signature', () => {
    expect(mockFormEngineSource).toContain(
      'setFormFieldValue(document: PdfDocument, fieldId: string, value: FormFieldValue): AsyncEngineResult<FormField>'
    );
  });

  it('looks up the field by id', () => {
    const fnStart = mockFormEngineSource.indexOf('setFormFieldValue(document');
    const fnEnd = mockFormEngineSource.indexOf('\n  }', fnStart) + 4;
    const fnBody = mockFormEngineSource.slice(fnStart, fnEnd);
    expect(fnBody).toContain('document.formFields.find(f => f.id === fieldId)');
  });

  it('returns not-found error when field is missing', () => {
    const fnStart = mockFormEngineSource.indexOf('setFormFieldValue(document');
    const fnEnd = mockFormEngineSource.indexOf('\n  }', fnStart) + 4;
    const fnBody = mockFormEngineSource.slice(fnStart, fnEnd);
    expect(fnBody).toContain("code: 'document-not-loaded'");
    expect(fnBody).toContain('Field not found');
  });

  it('returns success with spread field and new value', () => {
    const fnStart = mockFormEngineSource.indexOf('setFormFieldValue(document');
    const fnEnd = mockFormEngineSource.indexOf('\n  }', fnStart) + 4;
    const fnBody = mockFormEngineSource.slice(fnStart, fnEnd);
    expect(fnBody).toContain('{ success: true, value: { ...field, value } }');
  });
});

// ---------------------------------------------------------------------------
// TauriFormEngine — setFormFieldValue
// ---------------------------------------------------------------------------

describe('TauriFormEngine — setFormFieldValue', () => {
  it('is an async method', () => {
    expect(tauriFormEngineSource).toContain('async setFormFieldValue(');
  });

  it('looks up the field by id in the document', () => {
    const fnStart = tauriFormEngineSource.indexOf('async setFormFieldValue(');
    const fnEnd = tauriFormEngineSource.indexOf('\n  }', fnStart) + 4;
    const fnBody = tauriFormEngineSource.slice(fnStart, fnEnd);
    expect(fnBody).toContain("document.formFields.find(f => f.id === fieldId)");
  });

  it('invokes the set_form_field_value Tauri command', () => {
    const fnStart = tauriFormEngineSource.indexOf('async setFormFieldValue(');
    const fnEnd = tauriFormEngineSource.indexOf('\n  }', fnStart) + 4;
    const fnBody = tauriFormEngineSource.slice(fnStart, fnEnd);
    expect(fnBody).toContain("invoke('set_form_field_value'");
  });

  it('sends field.name (not fieldId) to the backend', () => {
    const fnStart = tauriFormEngineSource.indexOf('async setFormFieldValue(');
    const fnEnd = tauriFormEngineSource.indexOf('\n  }', fnStart) + 4;
    const fnBody = tauriFormEngineSource.slice(fnStart, fnEnd);
    expect(fnBody).toContain('name: field.name');
  });

  it('sends value stringified via String(value)', () => {
    const fnStart = tauriFormEngineSource.indexOf('async setFormFieldValue(');
    const fnEnd = tauriFormEngineSource.indexOf('\n  }', fnStart) + 4;
    const fnBody = tauriFormEngineSource.slice(fnStart, fnEnd);
    expect(fnBody).toContain('value: String(value)');
  });

  it('returns optimistic success with spread field and new value', () => {
    const fnStart = tauriFormEngineSource.indexOf('async setFormFieldValue(');
    const fnEnd = tauriFormEngineSource.indexOf('\n  }', fnStart) + 4;
    const fnBody = tauriFormEngineSource.slice(fnStart, fnEnd);
    expect(fnBody).toContain('{ success: true, value: { ...field, value } }');
  });

  it('returns internal-error on Tauri invoke failure', () => {
    const fnStart = tauriFormEngineSource.indexOf('async setFormFieldValue(');
    const fnEnd = tauriFormEngineSource.indexOf('\n  }', fnStart) + 4;
    const fnBody = tauriFormEngineSource.slice(fnStart, fnEnd);
    expect(fnBody).toContain("code: 'internal-error'");
  });
});

// ---------------------------------------------------------------------------
// ViewerApp — handleSetFieldValue
// ---------------------------------------------------------------------------

describe('ViewerApp — handleSetFieldValue', () => {
  it('imports FormFieldValue from core/document', () => {
    expect(viewerAppSource).toContain('FormFieldValue');
    expect(viewerAppSource).toContain("from '../core/document'");
  });

  it('destructures markDirty from useDocument', () => {
    expect(viewerAppSource).toContain('markDirty,');
  });

  it('defines handleSetFieldValue as a useCallback', () => {
    expect(viewerAppSource).toContain(
      'const handleSetFieldValue = useCallback((fieldId: string, value: FormFieldValue) =>'
    );
  });

  it('calls engine.form.setFormFieldValue', () => {
    const fnStart = viewerAppSource.indexOf('const handleSetFieldValue = useCallback');
    const fnEnd = viewerAppSource.indexOf('\n  }, [', fnStart) + 4;
    const fnBody = viewerAppSource.slice(fnStart, fnEnd);
    expect(fnBody).toContain('engine.form.setFormFieldValue(pdfDoc, fieldId, value)');
  });

  it('uses void pattern (fire-and-forget)', () => {
    const fnStart = viewerAppSource.indexOf('const handleSetFieldValue = useCallback');
    const fnEnd = viewerAppSource.indexOf('\n  }, [', fnStart) + 4;
    const fnBody = viewerAppSource.slice(fnStart, fnEnd);
    expect(fnBody).toContain('void engine.form.setFormFieldValue');
  });

  it('optimistically updates formFields state on success', () => {
    const fnStart = viewerAppSource.indexOf('const handleSetFieldValue = useCallback');
    const fnEnd = viewerAppSource.indexOf('\n  }, [', fnStart) + 4;
    const fnBody = viewerAppSource.slice(fnStart, fnEnd);
    expect(fnBody).toContain('setFormFields(prev => prev.map(f => f.id === result.value.id ? result.value : f))');
  });

  it('calls markDirty() after successful save', () => {
    const fnStart = viewerAppSource.indexOf('const handleSetFieldValue = useCallback');
    const fnEnd = viewerAppSource.indexOf('\n  }, [', fnStart) + 4;
    const fnBody = viewerAppSource.slice(fnStart, fnEnd);
    expect(fnBody).toContain('markDirty()');
  });

  it('only updates state when result.success is true', () => {
    const fnStart = viewerAppSource.indexOf('const handleSetFieldValue = useCallback');
    const fnEnd = viewerAppSource.indexOf('\n  }, [', fnStart) + 4;
    const fnBody = viewerAppSource.slice(fnStart, fnEnd);
    expect(fnBody).toContain('if (result.success)');
  });

  it('passes handleSetFieldValue to RightContextPanel as onSetFieldValue', () => {
    expect(viewerAppSource).toContain('onSetFieldValue={handleSetFieldValue}');
  });
});

// ---------------------------------------------------------------------------
// RightContextPanel — props contract
// ---------------------------------------------------------------------------

describe('RightContextPanel — onSetFieldValue prop', () => {
  it('is declared in RightContextPanelProps interface', () => {
    const ifaceStart = rightPanelSource.indexOf('interface RightContextPanelProps');
    const ifaceEnd = rightPanelSource.indexOf('\n}', ifaceStart) + 2;
    const iface = rightPanelSource.slice(ifaceStart, ifaceEnd);
    expect(iface).toContain('onSetFieldValue: (fieldId: string, value: FormFieldValue) => void');
  });

  it('is destructured in RightContextPanel function signature', () => {
    const fnStart = rightPanelSource.indexOf('export function RightContextPanel(');
    const fnEnd = rightPanelSource.indexOf('}: RightContextPanelProps)', fnStart) + 30;
    const signature = rightPanelSource.slice(fnStart, fnEnd);
    expect(signature).toContain('onSetFieldValue');
  });

  it('is forwarded to FormsModeContent in JSX', () => {
    expect(rightPanelSource).toContain('onSetFieldValue={onSetFieldValue}');
  });

  it('imports FormFieldValue from core/document', () => {
    expect(rightPanelSource).toContain('FormFieldValue');
    expect(rightPanelSource).toContain("from '../../core/document'");
  });
});

// ---------------------------------------------------------------------------
// FormsModeContent — TEXT_LIKE_TYPES
// ---------------------------------------------------------------------------

describe('FormsModeContent — TEXT_LIKE_TYPES constant', () => {
  it('is defined as a ReadonlySet of FormFieldType', () => {
    expect(rightPanelSource).toContain(
      "const TEXT_LIKE_TYPES: ReadonlySet<FormFieldType> = new Set(['text', 'number', 'date', 'time', 'combo', 'list'])"
    );
  });

  it('includes text', () => {
    const setStart = rightPanelSource.indexOf('TEXT_LIKE_TYPES');
    const setEnd = rightPanelSource.indexOf(')', setStart) + 1;
    const setDef = rightPanelSource.slice(setStart, setEnd);
    expect(setDef).toContain("'text'");
  });

  it('includes number', () => {
    const setStart = rightPanelSource.indexOf('TEXT_LIKE_TYPES');
    const setEnd = rightPanelSource.indexOf(')', setStart) + 1;
    const setDef = rightPanelSource.slice(setStart, setEnd);
    expect(setDef).toContain("'number'");
  });

  it('includes date', () => {
    const setStart = rightPanelSource.indexOf('TEXT_LIKE_TYPES');
    const setEnd = rightPanelSource.indexOf(')', setStart) + 1;
    const setDef = rightPanelSource.slice(setStart, setEnd);
    expect(setDef).toContain("'date'");
  });

  it('includes time', () => {
    const setStart = rightPanelSource.indexOf('TEXT_LIKE_TYPES');
    const setEnd = rightPanelSource.indexOf(')', setStart) + 1;
    const setDef = rightPanelSource.slice(setStart, setEnd);
    expect(setDef).toContain("'time'");
  });

  it('does NOT include checkbox', () => {
    const setStart = rightPanelSource.indexOf('TEXT_LIKE_TYPES');
    const setEnd = rightPanelSource.indexOf(')', setStart) + 1;
    const setDef = rightPanelSource.slice(setStart, setEnd);
    expect(setDef).not.toContain("'checkbox'");
  });

  it('does NOT include radio', () => {
    const setStart = rightPanelSource.indexOf('TEXT_LIKE_TYPES');
    const setEnd = rightPanelSource.indexOf(')', setStart) + 1;
    const setDef = rightPanelSource.slice(setStart, setEnd);
    expect(setDef).not.toContain("'radio'");
  });
});

// ---------------------------------------------------------------------------
// FormsModeContent — canEdit guard
// ---------------------------------------------------------------------------

describe('FormsModeContent — canEdit guard', () => {
  it('checks isActive', () => {
    expect(rightPanelSource).toContain('const canEdit = isActive');
  });

  it('checks TEXT_LIKE_TYPES membership', () => {
    expect(rightPanelSource).toContain('TEXT_LIKE_TYPES.has(field.type)');
  });

  it('checks !field.readOnly', () => {
    expect(rightPanelSource).toContain('!field.readOnly');
  });

  it('renders the input only when canEdit is true', () => {
    expect(rightPanelSource).toContain('{canEdit && (');
  });
});

// ---------------------------------------------------------------------------
// FormsModeContent — inline input
// ---------------------------------------------------------------------------

describe('FormsModeContent — inline input element', () => {
  it('has data-testid=field-value-input', () => {
    expect(rightPanelSource).toContain('data-testid="field-value-input"');
  });

  it('uses generic type="text" (not type-specific)', () => {
    const inputStart = rightPanelSource.indexOf('data-testid="field-value-input"');
    const inputEnd = rightPanelSource.indexOf('/>', inputStart) + 2;
    const inputEl = rightPanelSource.slice(inputStart, inputEnd);
    expect(inputEl).toContain('type="text"');
  });

  it('binds value to editValue state', () => {
    const inputStart = rightPanelSource.indexOf('data-testid="field-value-input"');
    const inputEnd = rightPanelSource.indexOf('/>', inputStart) + 2;
    const inputEl = rightPanelSource.slice(inputStart, inputEnd);
    expect(inputEl).toContain('value={editValue}');
  });

  it('updates editValue via onChange', () => {
    const inputStart = rightPanelSource.indexOf('data-testid="field-value-input"');
    const inputEnd = rightPanelSource.indexOf('/>', inputStart) + 2;
    const inputEl = rightPanelSource.slice(inputStart, inputEnd);
    expect(inputEl).toContain('onChange={e => { setEditValue(e.target.value); }}');
  });

  it('stops propagation on click (prevent parent onClick from deselecting)', () => {
    const inputStart = rightPanelSource.indexOf('data-testid="field-value-input"');
    const inputEnd = rightPanelSource.indexOf('/>', inputStart) + 2;
    const inputEl = rightPanelSource.slice(inputStart, inputEnd);
    expect(inputEl).toContain('e.stopPropagation()');
  });
});

// ---------------------------------------------------------------------------
// FormsModeContent — Enter saves, Escape cancels
// ---------------------------------------------------------------------------

describe('FormsModeContent — keyboard contract', () => {
  it('calls onSetFieldValue on Enter key', () => {
    expect(rightPanelSource).toContain("if (e.key === 'Enter')");
    expect(rightPanelSource).toContain('onSetFieldValue(field.id, editValue)');
  });

  it('prevents default on Enter (avoid form submission)', () => {
    const enterStart = rightPanelSource.indexOf("if (e.key === 'Enter')");
    const enterEnd = rightPanelSource.indexOf("} else if (e.key === 'Escape')", enterStart);
    const enterBlock = rightPanelSource.slice(enterStart, enterEnd);
    expect(enterBlock).toContain('e.preventDefault()');
  });

  it('stops propagation on Enter', () => {
    const enterStart = rightPanelSource.indexOf("if (e.key === 'Enter')");
    const enterEnd = rightPanelSource.indexOf("} else if (e.key === 'Escape')", enterStart);
    const enterBlock = rightPanelSource.slice(enterStart, enterEnd);
    expect(enterBlock).toContain('e.stopPropagation()');
  });

  it('resets editValue to saved field value on Escape (does NOT call onSetFieldValue)', () => {
    expect(rightPanelSource).toContain("else if (e.key === 'Escape')");
    const escStart = rightPanelSource.indexOf("else if (e.key === 'Escape')");
    const escEnd = rightPanelSource.indexOf('\n                }', escStart) + 10;
    const escBlock = rightPanelSource.slice(escStart, escEnd);
    expect(escBlock).toContain("setEditValue(Array.isArray(field.value) ? field.value.join(', ') : String(field.value ?? ''))");
    // Must NOT call onSetFieldValue() on Escape (comment text is allowed, function call is not)
    expect(escBlock).not.toContain('onSetFieldValue(');
  });
});

// ---------------------------------------------------------------------------
// FormsModeContent — edit buffer reset
// ---------------------------------------------------------------------------

describe('FormsModeContent — edit buffer state', () => {
  it('declares editValue state', () => {
    expect(rightPanelSource).toContain("const [editValue, setEditValue] = useState('')");
  });

  it('resets edit buffer via useEffect on [activeFieldIdx, formFields]', () => {
    expect(rightPanelSource).toContain('}, [activeFieldIdx, formFields]);');
  });

  it('sets editValue to the current field value in the useEffect', () => {
    const effectStart = rightPanelSource.indexOf('const [editValue, setEditValue]');
    const effectEnd = rightPanelSource.indexOf('}, [activeFieldIdx, formFields]);', effectStart) + 32;
    const effectBlock = rightPanelSource.slice(effectStart, effectEnd);
    expect(effectBlock).toContain("setEditValue(f ? (Array.isArray(f.value) ? f.value.join(', ') : String(f.value ?? '')) : '')");
  });
});

// ---------------------------------------------------------------------------
// FormsModeContent — items are divs (not buttons), to allow nested input
// ---------------------------------------------------------------------------

describe('FormsModeContent — item element type', () => {
  it('uses <div> for field items (not <button>, to allow nested input)', () => {
    expect(rightPanelSource).toContain('data-testid="forms-field-item"');
    // The forms-field-item must be a div, not a button
    const itemStart = rightPanelSource.indexOf('data-testid="forms-field-item"');
    // Look backward to find the opening tag
    const precedingSlice = rightPanelSource.slice(Math.max(0, itemStart - 5), itemStart);
    expect(precedingSlice).not.toContain('<button');
  });

  it('has activeItemRef typed as HTMLDivElement in FormsModeContent', () => {
    expect(rightPanelSource).toContain('useRef<HTMLDivElement | null>(null)');
  });
});

// ---------------------------------------------------------------------------
// No-regression: annotation write still present
// ---------------------------------------------------------------------------

describe('No-regression — annotation write paths', () => {
  it('handleDeleteComment is still in ViewerApp', () => {
    expect(viewerAppSource).toContain('const handleDeleteComment = useCallback');
  });

  it('handleUpdateComment is still in ViewerApp', () => {
    expect(viewerAppSource).toContain('const handleUpdateComment = useCallback');
  });

  it('refetchComments is still defined in ViewerApp', () => {
    expect(viewerAppSource).toContain('const refetchComments = useCallback');
  });

  it('RightContextPanel still receives onDeleteComment', () => {
    expect(viewerAppSource).toContain('onDeleteComment={handleDeleteComment}');
  });

  it('RightContextPanel still receives onUpdateComment', () => {
    expect(viewerAppSource).toContain('onUpdateComment={handleUpdateComment}');
  });

  it('ReviewModeContent still has delete-comment-btn', () => {
    expect(rightPanelSource).toContain('data-testid="delete-comment-btn"');
  });

  it('ReviewModeContent still has edit-comment-btn', () => {
    expect(rightPanelSource).toContain('data-testid="edit-comment-btn"');
  });
});

// ---------------------------------------------------------------------------
// No-regression: forms navigation still present
// ---------------------------------------------------------------------------

describe('No-regression — forms navigation paths', () => {
  it('activeFieldIdx prop still in RightContextPanelProps', () => {
    const ifaceStart = rightPanelSource.indexOf('interface RightContextPanelProps');
    const ifaceEnd = rightPanelSource.indexOf('\n}', ifaceStart) + 2;
    const iface = rightPanelSource.slice(ifaceStart, ifaceEnd);
    expect(iface).toContain('activeFieldIdx: number');
  });

  it('onFieldSelect prop still in RightContextPanelProps', () => {
    const ifaceStart = rightPanelSource.indexOf('interface RightContextPanelProps');
    const ifaceEnd = rightPanelSource.indexOf('\n}', ifaceStart) + 2;
    const iface = rightPanelSource.slice(ifaceStart, ifaceEnd);
    expect(iface).toContain('onFieldSelect: (idx: number) => void');
  });

  it('forms-completion-summary testid still present', () => {
    expect(rightPanelSource).toContain('data-testid="forms-completion-summary"');
  });

  it('field-filled-indicator testid still present', () => {
    expect(rightPanelSource).toContain('data-testid="field-filled-indicator"');
  });
});
