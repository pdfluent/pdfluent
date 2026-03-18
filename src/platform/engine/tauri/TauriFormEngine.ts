// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary and confidential.
// Free for personal, non-commercial use.
// Commercial use requires a valid license.
// See https://pdfluent.com/license for terms.

import { invoke } from '@tauri-apps/api/core';
import type { PdfDocument, FormField, FormFieldType, FormFieldValue, FieldValidation, FieldFormatting } from '../../../core/document';
import type { EngineResult, AsyncEngineResult } from '../../../core/engine/types';
import type { FormEngine } from '../../../core/engine/FormEngine';

const SUPPORTED_TYPES: FormFieldType[] = ['text', 'checkbox', 'radio', 'combo', 'list'];

function notImpl(msg: string): { success: false; error: { code: 'not-implemented'; message: string } } {
  return { success: false, error: { code: 'not-implemented', message: msg } };
}

/**
 * Tauri-backed form engine.
 *
 * Mutation operations are async. setFormFieldValue is backed by the real
 * Tauri `set_form_field_value` command. All other mutations are placeholders
 * pending backend command support.
 *
 * Read operations against the in-memory PdfDocument model are synchronous.
 */
export class TauriFormEngine implements FormEngine {
  // Async — require Tauri backend

  async createFormField(): AsyncEngineResult<FormField> {
    return notImpl('createFormField requires Tauri backend');
  }

  async updateFormField(): AsyncEngineResult<FormField> {
    return notImpl('updateFormField requires Tauri backend');
  }

  async deleteFormField(): AsyncEngineResult<void> {
    return notImpl('deleteFormField requires Tauri backend');
  }

  async deleteFormFields(): AsyncEngineResult<void> {
    return notImpl('deleteFormFields requires Tauri backend');
  }

  async setFormFieldValue(
    document: PdfDocument,
    fieldId: string,
    value: FormFieldValue
  ): AsyncEngineResult<FormField> {
    const field = document.formFields.find(f => f.id === fieldId);
    if (!field) {
      return { success: false, error: { code: 'internal-error', message: `Form field '${fieldId}' not found` } };
    }
    try {
      await invoke('set_form_field_value', { request: { name: field.name, value: String(value) } });
      return { success: true, value: { ...field, value } };
    } catch (e) {
      return { success: false, error: { code: 'internal-error', message: String(e) } };
    }
  }

  async setFormFieldValues(): AsyncEngineResult<FormField[]> {
    return notImpl('setFormFieldValues requires Tauri backend');
  }

  async resetFormField(): AsyncEngineResult<FormField> {
    return notImpl('resetFormField requires Tauri backend');
  }

  async resetAllFormFields(): AsyncEngineResult<FormField[]> {
    return notImpl('resetAllFormFields requires Tauri backend');
  }

  async setFormFieldValidation(): AsyncEngineResult<FieldValidation> {
    return notImpl('setFormFieldValidation requires Tauri backend');
  }

  async setFormFieldFormatting(): AsyncEngineResult<FieldFormatting> {
    return notImpl('setFormFieldFormatting requires Tauri backend');
  }

  async calculateFormFields(): AsyncEngineResult<FormField[]> {
    return notImpl('calculateFormFields requires Tauri backend');
  }

  async importFormData(): AsyncEngineResult<FormField[]> {
    return notImpl('importFormData requires Tauri backend');
  }

  async exportFormData(): AsyncEngineResult<Uint8Array | string | Record<string, FormFieldValue>> {
    return notImpl('exportFormData requires Tauri backend');
  }

  async getXfaFormData(): AsyncEngineResult<Record<string, unknown>> {
    return notImpl('getXfaFormData requires Tauri backend');
  }

  async setXfaFormData(): AsyncEngineResult<boolean> {
    return notImpl('setXfaFormData requires Tauri backend');
  }

  async convertXfaToAcroForm(): AsyncEngineResult<PdfDocument> {
    return notImpl('convertXfaToAcroForm requires Tauri backend');
  }

  // Sync — backed by in-memory document model

  getFormField(document: PdfDocument, fieldId: string): EngineResult<FormField> {
    const field = document.formFields.find(f => f.id === fieldId);
    if (!field) {
      return { success: false, error: { code: 'internal-error', message: `Form field '${fieldId}' not found` } };
    }
    return { success: true, value: field };
  }

  getFormFieldValue(document: PdfDocument, fieldId: string): EngineResult<FormFieldValue> {
    const field = document.formFields.find(f => f.id === fieldId);
    if (!field) {
      return { success: false, error: { code: 'internal-error', message: `Form field '${fieldId}' not found` } };
    }
    return { success: true, value: field.value };
  }

  validateFormField(
    document: PdfDocument,
    fieldId: string,
    value?: FormFieldValue
  ): EngineResult<{ isValid: boolean; errors: string[]; warnings: string[] }> {
    const field = document.formFields.find(f => f.id === fieldId);
    if (!field) {
      return { success: false, error: { code: 'internal-error', message: `Form field '${fieldId}' not found` } };
    }

    const errors: string[] = [];
    const warnings: string[] = [];
    const fieldValue = value ?? field.value;

    if (field.required && (fieldValue === '' || fieldValue === null || fieldValue === undefined)) {
      errors.push(`${field.label || field.name} is required`);
    }

    if (field.validation?.maxLength !== undefined && typeof fieldValue === 'string') {
      if (fieldValue.length > field.validation.maxLength) {
        errors.push(`Exceeds maximum length of ${field.validation.maxLength}`);
      }
    }

    return { success: true, value: { isValid: errors.length === 0, errors, warnings } };
  }

  validateAllFormFields(document: PdfDocument): EngineResult<{
    valid: string[];
    invalid: Array<{ fieldId: string; errors: string[] }>;
    warnings: Array<{ fieldId: string; warnings: string[] }>;
  }> {
    const valid: string[] = [];
    const invalid: Array<{ fieldId: string; errors: string[] }> = [];
    const warnings: Array<{ fieldId: string; warnings: string[] }> = [];

    for (const field of document.formFields) {
      const result = this.validateFormField(document, field.id);
      if (!result.success) continue;
      if (result.value.isValid) {
        valid.push(field.id);
      } else {
        invalid.push({ fieldId: field.id, errors: result.value.errors });
      }
    }

    return { success: true, value: { valid, invalid, warnings } };
  }

  getFormFieldValidation(document: PdfDocument, fieldId: string): EngineResult<FieldValidation> {
    const field = document.formFields.find(f => f.id === fieldId);
    if (!field) {
      return { success: false, error: { code: 'internal-error', message: `Form field '${fieldId}' not found` } };
    }
    return { success: true, value: field.validation as FieldValidation };
  }

  getFormFieldFormatting(document: PdfDocument, fieldId: string): EngineResult<FieldFormatting> {
    const field = document.formFields.find(f => f.id === fieldId);
    if (!field) {
      return { success: false, error: { code: 'internal-error', message: `Form field '${fieldId}' not found` } };
    }
    return { success: true, value: field.formatting as FieldFormatting };
  }

  formatFormFieldValue(): EngineResult<string> {
    return notImpl('formatFormFieldValue requires Tauri backend');
  }

  getAllFormFields(document: PdfDocument): EngineResult<FormField[]> {
    return { success: true, value: [...document.formFields] };
  }

  getFormFieldsForPage(document: PdfDocument, pageIndex: number): EngineResult<FormField[]> {
    return { success: true, value: document.formFields.filter(f => f.pageIndex === pageIndex) };
  }

  getFormFieldsByType(document: PdfDocument, type: FormFieldType): EngineResult<FormField[]> {
    return { success: true, value: document.formFields.filter(f => f.type === type) };
  }

  findFormFields(document: PdfDocument, query: Partial<FormField>): EngineResult<FormField[]> {
    const keys = Object.keys(query) as Array<keyof FormField>;
    const fields = document.formFields.filter(field =>
      keys.every(key => (field[key] as unknown) === (query[key] as unknown))
    );
    return { success: true, value: fields };
  }

  searchFormFields(
    document: PdfDocument,
    searchText: string,
    caseSensitive = false
  ): EngineResult<FormField[]> {
    const needle = caseSensitive ? searchText : searchText.toLowerCase();
    const compare = (s: string) => caseSensitive ? s : s.toLowerCase();
    const fields = document.formFields.filter(field => {
      const nameMatch = compare(field.name).includes(needle);
      const valueMatch = typeof field.value === 'string' && compare(field.value).includes(needle);
      return nameMatch || valueMatch;
    });
    return { success: true, value: fields };
  }

  getSupportedFormFieldTypes(): FormFieldType[] {
    return [...SUPPORTED_TYPES];
  }

  isFormFieldTypeSupported(type: FormFieldType): boolean {
    return SUPPORTED_TYPES.includes(type);
  }

  getDefaultProperties(type: FormFieldType): Partial<FormField> {
    return { type, required: false, readOnly: false, visible: true, label: '' };
  }

  validateFormFieldProperties(field: FormField): EngineResult<boolean> {
    const isValid = field.id.length > 0 && field.name.length > 0;
    return { success: true, value: isValid };
  }

  getCalculationDependencies(): EngineResult<string[]> {
    return notImpl('getCalculationDependencies requires Tauri backend');
  }

  hasXfaForms(document: PdfDocument): EngineResult<boolean> {
    return { success: true, value: document.metadata.hasXfa };
  }
}
