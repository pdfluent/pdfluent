// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary and confidential.
// Free for personal, non-commercial use.
// Commercial use requires a valid license.
// See https://pdfluent.com/license for terms.

import { useState, useCallback, type Dispatch, type SetStateAction } from 'react';
import type { PdfDocument, FormField, FormFieldValue } from '../../core/document';
import type { PdfEngine } from '../../core/engine/PdfEngine';
import { makeDocumentEvent, appendEvent } from '../state/documentEvents';
import type { DocumentEvent } from '../state/documentEvents';
import { makeCommand } from '../undoEngine';
import type { UndoCommand } from '../undoEngine';

const isTauri = typeof window !== 'undefined' && '__TAURI__' in window;

export function useFormFields(
  pdfDoc: PdfDocument | null,
  engine: PdfEngine | null,
  authorName: string,
  currentFilePath: string | null,
  markDirty: () => void,
  clearDirty: () => void,
  handleSaveAs: () => Promise<void>,
  pushUndo: (cmd: UndoCommand) => void,
  setDocumentEventLog: Dispatch<SetStateAction<DocumentEvent[]>>,
  setPageIndex: (idx: number | ((prev: number) => number)) => void,
) {
  const [formFields, setFormFields] = useState<FormField[]>([]);
  const [activeFieldIdx, setActiveFieldIdx] = useState(-1);
  const [formValidationErrors, setFormValidationErrors] = useState<Array<{ fieldId: string; errors: string[] }>>([]);

  // Set a form field's value via the Tauri bridge, then optimistically update
  // the formFields state with the returned field.
  // Marks the document dirty so the save button activates.
  const handleSetFieldValue = useCallback((fieldId: string, value: FormFieldValue) => {
    if (!pdfDoc || !engine) return;
    const field = formFields.find(f => f.id === fieldId);
    const fieldPage = field?.pageIndex ?? -1;
    const previousValue = field?.value ?? '';
    void engine.form.setFormFieldValue(pdfDoc, fieldId, value).then(result => {
      if (result.success) {
        setFormFields(prev => prev.map(f => f.id === result.value.id ? result.value : f));
        markDirty();
        // Clear any outstanding validation error for this field as the user corrects it
        setFormValidationErrors(prev => prev.filter(e => e.fieldId !== fieldId));
        setDocumentEventLog(prev => appendEvent(prev, makeDocumentEvent(
          'form_field_updated', authorName, fieldPage, fieldId, 'Formulierveld bijgewerkt'
        )));
        // Push undo command: restoring the previous field value reverses this edit
        pushUndo(makeCommand(
          `Formulierveld wijzigen`,
          async () => { if (pdfDoc && engine) await engine.form.setFormFieldValue(pdfDoc, fieldId, value).then(r => { if (r.success) setFormFields(p => p.map(f => f.id === r.value.id ? r.value : f)); }); },
          async () => { if (pdfDoc && engine) await engine.form.setFormFieldValue(pdfDoc, fieldId, previousValue).then(r => { if (r.success) setFormFields(p => p.map(f => f.id === r.value.id ? r.value : f)); }); },
        ));
      }
    });
  }, [pdfDoc, engine, formFields, authorName, markDirty, pushUndo]); // eslint-disable-line react-hooks/exhaustive-deps

  // Validate all form fields, surface per-field errors, then save on success.
  // Uses validateAllFormFields (sync) — no Rust bridge needed for validation itself.
  const handleFormSubmit = useCallback(async () => {
    if (!pdfDoc || !engine) return;
    const result = engine.form.validateAllFormFields(pdfDoc);
    if (!result.success) return;
    const { invalid } = result.value;
    if (invalid.length > 0) {
      setFormValidationErrors(invalid);
      return;
    }
    setFormValidationErrors([]);
    // Save to current path if known; otherwise open Save As dialog
    if (currentFilePath && isTauri) {
      try {
        const { invoke } = await import('@tauri-apps/api/core');
        await invoke('save_pdf', { path: currentFilePath });
        clearDirty();
      } catch { /* silent — TopBar task queue surfaces errors */ }
    } else {
      await handleSaveAs();
    }
  }, [pdfDoc, engine, currentFilePath, clearDirty, handleSaveAs]); // eslint-disable-line react-hooks/exhaustive-deps

  // Navigate to a form field by index: jump to its page and record it as active.
  const handleFieldNav = useCallback((idx: number) => {
    setActiveFieldIdx(idx);
    if (idx >= 0 && idx < formFields.length) {
      const field = formFields[idx];
      if (field) setPageIndex(field.pageIndex);
    }
  }, [formFields]); // eslint-disable-line react-hooks/exhaustive-deps

  return {
    formFields, setFormFields,
    activeFieldIdx, setActiveFieldIdx,
    formValidationErrors, setFormValidationErrors,
    handleSetFieldValue,
    handleFormSubmit,
    handleFieldNav,
  };
}
