// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary and confidential.
// Free for personal, non-commercial use.
// Commercial use requires a valid license.
// See https://pdfluent.com/license for terms.

import type { PdfDocument, FormField, FormFieldType, FormFieldValue, FieldValidation, FieldFormatting } from '../../document';
import type { EngineResult, AsyncEngineResult } from '../types';

function notImpl<T>(msg: string): AsyncEngineResult<T> {
  return Promise.resolve({ success: false, error: { code: 'not-implemented' as const, message: msg } });
}

export class MockFormEngine {
  // Async mutations

  createFormField(): AsyncEngineResult<FormField> {
    return notImpl('createFormField not implemented in MockFormEngine');
  }

  updateFormField(): AsyncEngineResult<FormField> {
    return notImpl('updateFormField not implemented in MockFormEngine');
  }

  deleteFormField(): AsyncEngineResult<void> {
    return notImpl('deleteFormField not implemented in MockFormEngine');
  }

  deleteFormFields(): AsyncEngineResult<void> {
    return notImpl('deleteFormFields not implemented in MockFormEngine');
  }

  setFormFieldValue(document: PdfDocument, fieldId: string, value: FormFieldValue): AsyncEngineResult<FormField> {
    const field = document.formFields.find(f => f.id === fieldId);
    if (!field) {
      return Promise.resolve({ success: false, error: { code: 'document-not-loaded', message: `Field not found: ${fieldId}` } });
    }
    return Promise.resolve({ success: true, value: { ...field, value } });
  }

  setFormFieldValues(): AsyncEngineResult<FormField[]> {
    return notImpl('setFormFieldValues not implemented in MockFormEngine');
  }

  resetFormField(): AsyncEngineResult<FormField> {
    return notImpl('resetFormField not implemented in MockFormEngine');
  }

  resetAllFormFields(): AsyncEngineResult<FormField[]> {
    return notImpl('resetAllFormFields not implemented in MockFormEngine');
  }

  setFormFieldValidation(): AsyncEngineResult<FieldValidation> {
    return notImpl('setFormFieldValidation not implemented in MockFormEngine');
  }

  setFormFieldFormatting(): AsyncEngineResult<FieldFormatting> {
    return notImpl('setFormFieldFormatting not implemented in MockFormEngine');
  }

  calculateFormFields(): AsyncEngineResult<FormField[]> {
    return notImpl('calculateFormFields not implemented in MockFormEngine');
  }

  importFormData(): AsyncEngineResult<FormField[]> {
    return notImpl('importFormData not implemented in MockFormEngine');
  }

  exportFormData(): AsyncEngineResult<Uint8Array | string | Record<string, FormFieldValue>> {
    return notImpl('exportFormData not implemented in MockFormEngine');
  }

  getXfaFormData(): AsyncEngineResult<Record<string, unknown>> {
    return notImpl('getXfaFormData not implemented in MockFormEngine');
  }

  setXfaFormData(): AsyncEngineResult<boolean> {
    return notImpl('setXfaFormData not implemented in MockFormEngine');
  }

  convertXfaToAcroForm(): AsyncEngineResult<PdfDocument> {
    return notImpl('convertXfaToAcroForm not implemented in MockFormEngine');
  }

  // Sync reads

  getFormField(): EngineResult<FormField> {
    return { success: false, error: { code: 'document-not-loaded', message: 'Not implemented in MockFormEngine' } };
  }

  getFormFieldValue(): EngineResult<FormFieldValue> {
    return { success: true, value: '' };
  }

  validateFormField(): EngineResult<{ isValid: boolean; errors: string[]; warnings: string[] }> {
    return { success: true, value: { isValid: true, errors: [], warnings: [] } };
  }

  validateAllFormFields(): EngineResult<{
    valid: string[];
    invalid: Array<{ fieldId: string; errors: string[] }>;
    warnings: Array<{ fieldId: string; warnings: string[] }>;
  }> {
    return { success: true, value: { valid: [], invalid: [], warnings: [] } };
  }

  getFormFieldValidation(): EngineResult<FieldValidation> {
    return { success: false, error: { code: 'not-implemented', message: 'getFormFieldValidation not implemented in MockFormEngine' } };
  }

  getFormFieldFormatting(): EngineResult<FieldFormatting> {
    return { success: false, error: { code: 'not-implemented', message: 'getFormFieldFormatting not implemented in MockFormEngine' } };
  }

  formatFormFieldValue(): EngineResult<string> {
    return { success: false, error: { code: 'not-implemented', message: 'formatFormFieldValue not implemented in MockFormEngine' } };
  }

  getAllFormFields(): EngineResult<FormField[]> {
    return { success: true, value: [] };
  }

  getFormFieldsForPage(): EngineResult<FormField[]> {
    return { success: true, value: [] };
  }

  getFormFieldsByType(): EngineResult<FormField[]> {
    return { success: true, value: [] };
  }

  findFormFields(): EngineResult<FormField[]> {
    return { success: true, value: [] };
  }

  searchFormFields(): EngineResult<FormField[]> {
    return { success: true, value: [] };
  }

  getSupportedFormFieldTypes(): FormFieldType[] {
    return ['text', 'checkbox', 'radio', 'combo', 'list'];
  }

  isFormFieldTypeSupported(type: FormFieldType): boolean {
    return ['text', 'checkbox', 'radio', 'combo', 'list'].includes(type);
  }

  getDefaultProperties(type: FormFieldType): Partial<FormField> {
    return { type, value: '', required: false };
  }

  validateFormFieldProperties(): EngineResult<boolean> {
    return { success: true, value: true };
  }

  getCalculationDependencies(): EngineResult<string[]> {
    return { success: true, value: [] };
  }

  hasXfaForms(): EngineResult<boolean> {
    return { success: true, value: false };
  }
}
