// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary and confidential.
// Free for personal, non-commercial use.
// Commercial use requires a valid license.
// See https://pdfluent.com/license for terms.

// ---------------------------------------------------------------------------
// Form Engine Interface
// ---------------------------------------------------------------------------

import type { PdfDocument, FormField, FormFieldType, FormFieldValue, FieldValidation, FieldFormatting } from '../document';
import type { FormFieldOptions, EngineResult, AsyncEngineResult } from './types';

/**
 * Form Engine - Handles form field operations and validation
 */
export interface FormEngine {
  // -------------------------------------------------------------------------
  // Form Field CRUD Operations
  // -------------------------------------------------------------------------

  /**
   * Create a new form field
   */
  createFormField(
    document: PdfDocument,
    pageIndex: number,
    type: FormFieldType,
    bounds: { x: number; y: number; width: number; height: number },
    properties: Partial<FormField>,
    options?: FormFieldOptions
  ): AsyncEngineResult<FormField>;

  /**
   * Get form field by ID
   */
  getFormField(document: PdfDocument, fieldId: string): EngineResult<FormField>;

  /**
   * Update a form field
   */
  updateFormField(
    document: PdfDocument,
    fieldId: string,
    updates: Partial<FormField>
  ): AsyncEngineResult<FormField>;

  /**
   * Delete a form field
   */
  deleteFormField(document: PdfDocument, fieldId: string): AsyncEngineResult<void>;

  /**
   * Delete multiple form fields
   */
  deleteFormFields(document: PdfDocument, fieldIds: string[]): AsyncEngineResult<void>;

  // -------------------------------------------------------------------------
  // Form Field Values
  // -------------------------------------------------------------------------

  /**
   * Get form field value
   */
  getFormFieldValue(document: PdfDocument, fieldId: string): EngineResult<FormFieldValue>;

  /**
   * Set form field value
   */
  setFormFieldValue(
    document: PdfDocument,
    fieldId: string,
    value: FormFieldValue,
    options?: FormFieldOptions
  ): AsyncEngineResult<FormField>;

  /**
   * Set multiple form field values
   */
  setFormFieldValues(
    document: PdfDocument,
    values: Record<string, FormFieldValue>,
    options?: FormFieldOptions
  ): AsyncEngineResult<FormField[]>;

  /**
   * Reset form field to default value
   */
  resetFormField(document: PdfDocument, fieldId: string): AsyncEngineResult<FormField>;

  /**
   * Reset all form fields
   */
  resetAllFormFields(document: PdfDocument): AsyncEngineResult<FormField[]>;

  // -------------------------------------------------------------------------
  // Form Field Validation
  // -------------------------------------------------------------------------

  /**
   * Validate form field value
   */
  validateFormField(
    document: PdfDocument,
    fieldId: string,
    value?: FormFieldValue
  ): EngineResult<{
    isValid: boolean;
    errors: string[];
    warnings: string[];
  }>;

  /**
   * Validate all form fields
   */
  validateAllFormFields(document: PdfDocument): EngineResult<{
    valid: string[];
    invalid: Array<{ fieldId: string; errors: string[] }>;
    warnings: Array<{ fieldId: string; warnings: string[] }>;
  }>;

  /**
   * Get form field validation rules
   */
  getFormFieldValidation(document: PdfDocument, fieldId: string): EngineResult<FieldValidation>;

  /**
   * Set form field validation rules
   */
  setFormFieldValidation(
    document: PdfDocument,
    fieldId: string,
    validation: Partial<FieldValidation>
  ): AsyncEngineResult<FieldValidation>;

  // -------------------------------------------------------------------------
  // Form Field Formatting
  // -------------------------------------------------------------------------

  /**
   * Get form field formatting
   */
  getFormFieldFormatting(document: PdfDocument, fieldId: string): EngineResult<FieldFormatting>;

  /**
   * Set form field formatting
   */
  setFormFieldFormatting(
    document: PdfDocument,
    fieldId: string,
    formatting: Partial<FieldFormatting>
  ): AsyncEngineResult<FieldFormatting>;

  /**
   * Format form field value according to formatting rules
   */
  formatFormFieldValue(
    document: PdfDocument,
    fieldId: string,
    value: FormFieldValue
  ): EngineResult<string>;

  // -------------------------------------------------------------------------
  // Query Operations
  // -------------------------------------------------------------------------

  /**
   * Get all form fields in a document
   */
  getAllFormFields(document: PdfDocument): EngineResult<FormField[]>;

  /**
   * Get form fields for a specific page
   */
  getFormFieldsForPage(document: PdfDocument, pageIndex: number): EngineResult<FormField[]>;

  /**
   * Get form fields by type
   */
  getFormFieldsByType(document: PdfDocument, type: FormFieldType): EngineResult<FormField[]>;

  /**
   * Find form fields by properties
   */
  findFormFields(
    document: PdfDocument,
    query: Partial<FormField>
  ): EngineResult<FormField[]>;

  /**
   * Search form fields by name or value
   */
  searchFormFields(
    document: PdfDocument,
    searchText: string,
    caseSensitive?: boolean
  ): EngineResult<FormField[]>;

  // -------------------------------------------------------------------------
  // Form Properties
  // -------------------------------------------------------------------------

  /**
   * Get supported form field types
   */
  getSupportedFormFieldTypes(): FormFieldType[];

  /**
   * Check if form field type is supported
   */
  isFormFieldTypeSupported(type: FormFieldType): boolean;

  /**
   * Get default properties for a form field type
   */
  getDefaultProperties(type: FormFieldType): Partial<FormField>;

  /**
   * Validate form field properties
   */
  validateFormFieldProperties(field: FormField): EngineResult<boolean>;

  // -------------------------------------------------------------------------
  // Form Calculations
  // -------------------------------------------------------------------------

  /**
   * Calculate form field values (for calculated fields)
   */
  calculateFormFields(document: PdfDocument): AsyncEngineResult<FormField[]>;

  /**
   * Get calculation dependencies
   */
  getCalculationDependencies(document: PdfDocument, fieldId: string): EngineResult<string[]>;

  // -------------------------------------------------------------------------
  // Import/Export
  // -------------------------------------------------------------------------

  /**
   * Import form data from external format
   */
  importFormData(
    document: PdfDocument,
    data: Uint8Array | string | Record<string, FormFieldValue>,
    format: 'xfdf' | 'fdf' | 'json' | 'xml'
  ): AsyncEngineResult<FormField[]>;

  /**
   * Export form data to external format
   */
  exportFormData(
    document: PdfDocument,
    fieldIds?: string[],
    format?: 'xfdf' | 'fdf' | 'json' | 'xml'
  ): AsyncEngineResult<Uint8Array | string | Record<string, FormFieldValue>>;

  // -------------------------------------------------------------------------
  // XFA Forms (if supported)
  // -------------------------------------------------------------------------

  /**
   * Check if document contains XFA forms
   */
  hasXfaForms(document: PdfDocument): EngineResult<boolean>;

  /**
   * Get XFA form data
   */
  getXfaFormData(document: PdfDocument): AsyncEngineResult<Record<string, unknown>>;

  /**
   * Set XFA form data
   */
  setXfaFormData(
    document: PdfDocument,
    data: Record<string, unknown>
  ): AsyncEngineResult<boolean>;

  /**
   * Convert XFA form to AcroForm
   */
  convertXfaToAcroForm(document: PdfDocument): AsyncEngineResult<PdfDocument>;
}
