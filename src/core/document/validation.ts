// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary and confidential.
// Free for personal, non-commercial use.
// Commercial use requires a valid license.
// See https://pdfluent.com/license for terms.

import type { PdfDocument, Page, Annotation, FormField } from './model';
import type { Result } from '../types';

// ---------------------------------------------------------------------------
// Validation Error Types
// ---------------------------------------------------------------------------

export type ValidationErrorCode =
  | 'invalid-document'
  | 'page-out-of-range'
  | 'invalid-rect'
  | 'annotation-out-of-bounds'
  | 'form-field-out-of-bounds'
  | 'duplicate-id'
  | 'invalid-date'
  | 'missing-required-field'
  | 'invalid-field-value'
  | 'inconsistent-state';

export interface ValidationError {
  code: ValidationErrorCode;
  message: string;
  details?: {
    documentId?: string;
    pageIndex?: number;
    annotationId?: string;
    fieldId?: string;
    expected?: unknown;
    actual?: unknown;
    [key: string]: unknown;
  };
}

export type ValidationResult<T> = Result<T, ValidationError>;

// ---------------------------------------------------------------------------
// Document Validation
// ---------------------------------------------------------------------------

/**
 * Validate a PDF document for internal consistency.
 *
 * Checks:
 * - Document ID is present
 * - Page count matches pages array length
 * - All annotations reference valid pages
 * - All form fields reference valid pages
 * - No duplicate IDs
 * - Dates are valid
 */
export function validateDocument(document: PdfDocument): ValidationResult<PdfDocument> {
  const errors: ValidationError[] = [];

  // Check document ID
  if (!document.id || document.id.trim() === '') {
    errors.push({
      code: 'invalid-document',
      message: 'Document ID is missing or empty',
      details: { documentId: document.id },
    });
  }

  // Check file name
  if (!document.fileName || document.fileName.trim() === '') {
    errors.push({
      code: 'invalid-document',
      message: 'Document file name is missing or empty',
    });
  }

  // Check file size
  if (document.fileSize < 0) {
    errors.push({
      code: 'invalid-document',
      message: 'Document file size cannot be negative',
      details: { fileSize: document.fileSize },
    });
  }

  // Check page count consistency
  const pageCount = document.pages.length;
  if (document.state.currentPage >= pageCount && pageCount > 0) {
    errors.push({
      code: 'inconsistent-state',
      message: `Current page index ${document.state.currentPage} is out of range for document with ${pageCount} pages`,
      details: { currentPage: document.state.currentPage, pageCount },
    });
  }

  // Validate all pages
  document.pages.forEach((page, index) => {
    const pageResult = validatePage(page, index, pageCount);
    if (!pageResult.success && pageResult.error) {
      errors.push(pageResult.error);
    }
  });

  // Validate all annotations
  const annotationIds = new Set<string>();
  document.annotations.forEach(annotation => {
    // Check for duplicate IDs
    if (annotationIds.has(annotation.id)) {
      errors.push({
        code: 'duplicate-id',
        message: `Duplicate annotation ID: ${annotation.id}`,
        details: { annotationId: annotation.id },
      });
    }
    annotationIds.add(annotation.id);

    // Validate annotation
    const annotationResult = validateAnnotation(annotation, pageCount);
    if (!annotationResult.success && annotationResult.error) {
      errors.push(annotationResult.error);
    }
  });

  // Validate all form fields
  const fieldIds = new Set<string>();
  document.formFields.forEach(field => {
    // Check for duplicate IDs
    if (fieldIds.has(field.id)) {
      errors.push({
        code: 'duplicate-id',
        message: `Duplicate form field ID: ${field.id}`,
        details: { fieldId: field.id },
      });
    }
    fieldIds.add(field.id);

    // Validate form field
    const fieldResult = validateFormField(field, pageCount);
    if (!fieldResult.success && fieldResult.error) {
      errors.push(fieldResult.error);
    }
  });

  // Check dates
  if (document.createdAt > document.modifiedAt) {
    errors.push({
      code: 'invalid-date',
      message: 'Creation date cannot be after modification date',
      details: {
        createdAt: document.createdAt.toISOString(),
        modifiedAt: document.modifiedAt.toISOString(),
      },
    });
  }

  // Check metadata dates
  if (document.metadata.creationDate > document.metadata.modificationDate) {
    errors.push({
      code: 'invalid-date',
      message: 'Metadata creation date cannot be after modification date',
      details: {
        creationDate: document.metadata.creationDate.toISOString(),
        modificationDate: document.metadata.modificationDate.toISOString(),
      },
    });
  }

  if (errors.length > 0 && errors[0]) {
    return {
      success: false,
      error: errors[0], // Return first error
    };
  }

  return { success: true, value: document };
}

// ---------------------------------------------------------------------------
// Page Validation
// ---------------------------------------------------------------------------

/**
 * Validate a page for internal consistency.
 */
export function validatePage(
  page: Page,
  pageIndex: number,
  totalPages: number
): ValidationResult<Page> {
  const errors: ValidationError[] = [];

  // Check page index is within bounds
  if (pageIndex < 0 || pageIndex >= totalPages) {
    errors.push({
      code: 'page-out-of-range',
      message: `Page index ${pageIndex} is out of range (0-${totalPages - 1})`,
      details: { pageIndex, totalPages },
    });
  }

  // Check page index matches position
  if (page.index !== pageIndex) {
    errors.push({
      code: 'inconsistent-state',
      message: `Page index mismatch: expected ${pageIndex}, got ${page.index}`,
      details: { expected: pageIndex, actual: page.index },
    });
  }

  // Check page size
  if (page.size.width <= 0 || page.size.height <= 0) {
    errors.push({
      code: 'invalid-rect',
      message: `Page ${pageIndex} has invalid size: ${page.size.width}x${page.size.height}`,
      details: { pageIndex, width: page.size.width, height: page.size.height },
    });
  }

  // Check rotation is valid (0, 90, 180, 270)
  if (![0, 90, 180, 270].includes(page.rotation)) {
    errors.push({
      code: 'inconsistent-state',
      message: `Page ${pageIndex} has invalid rotation: ${page.rotation}`,
      details: { pageIndex, rotation: page.rotation },
    });
  }

  // Check content hash if present
  if (page.contentHash && page.contentHash.trim() === '') {
    errors.push({
      code: 'inconsistent-state',
      message: `Page ${pageIndex} has empty content hash`,
      details: { pageIndex },
    });
  }

  // Check render data consistency
  if (page.isRendered && !page.renderData) {
    errors.push({
      code: 'inconsistent-state',
      message: `Page ${pageIndex} is marked as rendered but has no render data`,
      details: { pageIndex },
    });
  }

  if (page.renderData && !page.isRendered) {
    errors.push({
      code: 'inconsistent-state',
      message: `Page ${pageIndex} has render data but is not marked as rendered`,
      details: { pageIndex },
    });
  }

  if (page.renderSize && (page.renderSize.width <= 0 || page.renderSize.height <= 0)) {
    errors.push({
      code: 'invalid-rect',
      message: `Page ${pageIndex} has invalid render size`,
      details: { pageIndex, renderSize: page.renderSize },
    });
  }

  if (errors.length > 0 && errors[0]) {
    return {
      success: false,
      error: errors[0],
    };
  }

  return { success: true, value: page };
}

// ---------------------------------------------------------------------------
// Annotation Validation
// ---------------------------------------------------------------------------

/**
 * Validate an annotation for internal consistency.
 */
export function validateAnnotation(
  annotation: Annotation,
  totalPages: number
): ValidationResult<Annotation> {
  const errors: ValidationError[] = [];

  // Check annotation ID
  if (!annotation.id || annotation.id.trim() === '') {
    errors.push({
      code: 'invalid-document',
      message: 'Annotation has empty ID',
    });
  }

  // Check page index is valid
  if (annotation.pageIndex < 0 || annotation.pageIndex >= totalPages) {
    errors.push({
      code: 'annotation-out-of-bounds',
      message: `Annotation ${annotation.id} references invalid page ${annotation.pageIndex} (total pages: ${totalPages})`,
      details: { annotationId: annotation.id, pageIndex: annotation.pageIndex, totalPages },
    });
  }

  // Check rectangle is valid
  if (
    annotation.rect.x < 0 ||
    annotation.rect.y < 0 ||
    annotation.rect.width <= 0 ||
    annotation.rect.height <= 0
  ) {
    errors.push({
      code: 'invalid-rect',
      message: `Annotation ${annotation.id} has invalid rectangle`,
      details: {
        annotationId: annotation.id,
        rect: annotation.rect,
      },
    });
  }

  // Check dates
  if (annotation.createdAt > annotation.modifiedAt) {
    errors.push({
      code: 'invalid-date',
      message: `Annotation ${annotation.id} creation date cannot be after modification date`,
      details: {
        annotationId: annotation.id,
        createdAt: annotation.createdAt.toISOString(),
        modifiedAt: annotation.modifiedAt.toISOString(),
      },
    });
  }

  // Check author
  if (!annotation.author || annotation.author.trim() === '') {
    errors.push({
      code: 'missing-required-field',
      message: `Annotation ${annotation.id} has empty author`,
      details: { annotationId: annotation.id },
    });
  }

  // Check color is valid CSS color
  if (!isValidColor(annotation.color)) {
    errors.push({
      code: 'invalid-field-value',
      message: `Annotation ${annotation.id} has invalid color: ${annotation.color}`,
      details: { annotationId: annotation.id, color: annotation.color },
    });
  }

  // Check opacity is valid
  if (annotation.opacity !== undefined) {
    if (annotation.opacity < 0 || annotation.opacity > 1) {
      errors.push({
        code: 'invalid-field-value',
        message: `Annotation ${annotation.id} has invalid opacity: ${annotation.opacity}`,
        details: { annotationId: annotation.id, opacity: annotation.opacity },
      });
    }
  }

  if (errors.length > 0 && errors[0]) {
    return {
      success: false,
      error: errors[0],
    };
  }

  return { success: true, value: annotation };
}

// ---------------------------------------------------------------------------
// Form Field Validation
// ---------------------------------------------------------------------------

/**
 * Validate a form field for internal consistency.
 */
export function validateFormField(
  field: FormField,
  totalPages: number
): ValidationResult<FormField> {
  const errors: ValidationError[] = [];

  // Check field ID
  if (!field.id || field.id.trim() === '') {
    errors.push({
      code: 'invalid-document',
      message: 'Form field has empty ID',
    });
  }

  // Check field name
  if (!field.name || field.name.trim() === '') {
    errors.push({
      code: 'missing-required-field',
      message: `Form field ${field.id} has empty name`,
      details: { fieldId: field.id },
    });
  }

  // Check page index is valid
  if (field.pageIndex < 0 || field.pageIndex >= totalPages) {
    errors.push({
      code: 'form-field-out-of-bounds',
      message: `Form field ${field.id} references invalid page ${field.pageIndex} (total pages: ${totalPages})`,
      details: { fieldId: field.id, pageIndex: field.pageIndex, totalPages },
    });
  }

  // Check rectangle is valid
  if (
    field.rect.x < 0 ||
    field.rect.y < 0 ||
    field.rect.width <= 0 ||
    field.rect.height <= 0
  ) {
    errors.push({
      code: 'invalid-rect',
      message: `Form field ${field.id} has invalid rectangle`,
      details: {
        fieldId: field.id,
        rect: field.rect,
      },
    });
  }

  // Check label
  if (!field.label || field.label.trim() === '') {
    errors.push({
      code: 'missing-required-field',
      message: `Form field ${field.id} has empty label`,
      details: { fieldId: field.id },
    });
  }

  // Validate field value based on type
  const valueResult = validateFieldValue(field.type, field.value);
  if (!valueResult.success) {
    errors.push({
      ...valueResult.error,
      details: { ...valueResult.error.details, fieldId: field.id },
    });
  }

  // Validate default value
  const defaultValueResult = validateFieldValue(field.type, field.defaultValue);
  if (!defaultValueResult.success) {
    errors.push({
      ...defaultValueResult.error,
      message: `Form field ${field.id} has invalid default value: ${defaultValueResult.error.message}`,
      details: { ...defaultValueResult.error.details, fieldId: field.id },
    });
  }

  // Validate validation rules if present
  if (field.validation) {
    const validationResult = validateFieldValidation(field.type, field.validation);
    if (!validationResult.success) {
      errors.push({
        ...validationResult.error,
        details: { ...validationResult.error.details, fieldId: field.id },
      });
    }
  }

  if (errors.length > 0 && errors[0]) {
    return {
      success: false,
      error: errors[0],
    };
  }

  return { success: true, value: field };
}

// ---------------------------------------------------------------------------
// Field Value Validation
// ---------------------------------------------------------------------------

function validateFieldValue(
  type: FormField['type'],
  value: FormField['value']
): ValidationResult<FormField['value']> {
  // Null/undefined is allowed for optional fields
  if (value === null || value === undefined) {
    return { success: true, value };
  }

  switch (type) {
    case 'text':
    case 'password':
    case 'rich-text':
    case 'date':
    case 'time':
    case 'file':
    case 'barcode':
      if (typeof value !== 'string') {
        return {
          success: false,
          error: {
            code: 'invalid-field-value',
            message: `Expected string value for ${type} field, got ${typeof value}`,
            details: { type, value },
          },
        };
      }
      break;

    case 'checkbox':
      if (typeof value !== 'boolean') {
        return {
          success: false,
          error: {
            code: 'invalid-field-value',
            message: `Expected boolean value for checkbox field, got ${typeof value}`,
            details: { type, value },
          },
        };
      }
      break;

    case 'number':
      if (typeof value !== 'number') {
        return {
          success: false,
          error: {
            code: 'invalid-field-value',
            message: `Expected number value for number field, got ${typeof value}`,
            details: { type, value },
          },
        };
      }
      break;

    case 'radio':
    case 'list':
    case 'combo':
      if (!Array.isArray(value) && typeof value !== 'string') {
        return {
          success: false,
          error: {
            code: 'invalid-field-value',
            message: `Expected string or array value for ${type} field, got ${typeof value}`,
            details: { type, value },
          },
        };
      }
      break;

    case 'button':
    case 'signature':
      // Buttons and signatures can have various value types
      break;
  }

  return { success: true, value };
}

// ---------------------------------------------------------------------------
// Field Validation Rules Validation
// ---------------------------------------------------------------------------

function validateFieldValidation(
  type: FormField['type'],
  validation: FormField['validation']
): ValidationResult<FormField['validation']> {
  const errors: ValidationError[] = [];

  if (!validation) {
    return { success: true, value: validation };
  }

  // Check pattern is valid regex if present
  if (validation.pattern) {
    try {
      new RegExp(validation.pattern);
    } catch (error) {
      errors.push({
        code: 'invalid-field-value',
        message: `Invalid regular expression pattern: ${validation.pattern}`,
        details: { pattern: validation.pattern, error: String(error) },
      });
    }
  }

  // Check min/max for numeric fields
  if (type === 'number' || type === 'date' || type === 'time') {
    if (validation.min !== undefined && validation.max !== undefined) {
      if (validation.min > validation.max) {
        errors.push({
          code: 'invalid-field-value',
          message: `Minimum value (${validation.min}) cannot be greater than maximum value (${validation.max})`,
          details: { min: validation.min, max: validation.max },
        });
      }
    }
  }

  // Check minLength/maxLength for text fields
  if (type === 'text' || type === 'password' || type === 'rich-text') {
    if (validation.minLength !== undefined && validation.maxLength !== undefined) {
      if (validation.minLength > validation.maxLength) {
        errors.push({
          code: 'invalid-field-value',
          message: `Minimum length (${validation.minLength}) cannot be greater than maximum length (${validation.maxLength})`,
          details: { minLength: validation.minLength, maxLength: validation.maxLength },
        });
      }
      if (validation.minLength < 0) {
        errors.push({
          code: 'invalid-field-value',
          message: `Minimum length cannot be negative: ${validation.minLength}`,
          details: { minLength: validation.minLength },
        });
      }
    }
  }

  if (errors.length > 0 && errors[0]) {
    return {
      success: false,
      error: errors[0],
    };
  }

  return { success: true, value: validation };
}

// ---------------------------------------------------------------------------
// Utility Functions
// ---------------------------------------------------------------------------

function isValidColor(color: string): boolean {
  // Basic CSS color validation
  const s = new Option().style;
  s.color = color;
  return s.color !== '';
}