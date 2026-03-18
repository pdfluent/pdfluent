// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary and confidential.
// Free for personal, non-commercial use.
// Commercial use requires a valid license.
// See https://pdfluent.com/license for terms.

// ---------------------------------------------------------------------------
// Document Model
// ---------------------------------------------------------------------------

import type {
  PdfDocument,
  Page,
  PageMetadata,
  OutlineNode,
  Annotation,
  AnnotationType,
  Reply,
  FormField,
  FormFieldType,
  FormFieldValue,
  FieldValidation,
  FieldFormatting,
  DocumentState,
  ViewMode,
  DocumentPermissions,
  TextSpan,
} from './model';

export type {
  PdfDocument,
  Page,
  PageMetadata,
  OutlineNode,
  Annotation,
  AnnotationType,
  Reply,
  FormField,
  FormFieldType,
  FormFieldValue,
  FieldValidation,
  FieldFormatting,
  DocumentState,
  ViewMode,
  DocumentPermissions,
  TextSpan,
};

export {
  updateMetadata,
  updatePage,
  addAnnotation,
  updateAnnotation,
  removeAnnotation,
  updateFormField,
  updateDocumentState,
  createEmptyDocument,
} from './model';

// ---------------------------------------------------------------------------
// Metadata
// ---------------------------------------------------------------------------

export type {
  DocumentMetadata,
  XmpMetadata,
  XmpLangAlt,
  PdfaMetadata,
  PdfaComplianceLevel,
  PdfaValidationResult,
  PdfuaMetadata,
  PdfuaValidationResult,
  PdfxMetadata,
  PdfxVersion,
  PdfxComplianceLevel,
  XfaFormType,
  EncryptionMethod,
} from './metadata';

export {
  createDefaultMetadata,
  extractFromInfoDict,
  mergeMetadata,
} from './metadata';

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

export type {
  ValidationErrorCode,
  ValidationError,
  ValidationResult,
} from './validation';

export {
  validateDocument,
  validatePage,
  validateAnnotation,
  validateFormField,
} from './validation';

// ---------------------------------------------------------------------------
// Utility Functions
// ---------------------------------------------------------------------------

/**
 * Get the number of pages in a document.
 *
 * @param document PDF document
 * @returns Number of pages
 */
export function getPageCount(document: PdfDocument): number {
  return document.pages.length;
}

/**
 * Get the current page of a document.
 *
 * @param document PDF document
 * @returns Current page object, or undefined if no pages
 */
export function getCurrentPage(document: PdfDocument): Page | undefined {
  const { currentPage } = document.state;
  return document.pages[currentPage];
}

/**
 * Get annotations for a specific page.
 *
 * @param document PDF document
 * @param pageIndex Page index
 * @returns Array of annotations on the page
 */
export function getAnnotationsForPage(
  document: PdfDocument,
  pageIndex: number
): Annotation[] {
  return document.annotations.filter((ann: Annotation) => ann.pageIndex === pageIndex);
}

/**
 * Get form fields for a specific page.
 *
 * @param document PDF document
 * @param pageIndex Page index
 * @returns Array of form fields on the page
 */
export function getFormFieldsForPage(
  document: PdfDocument,
  pageIndex: number
): FormField[] {
  return document.formFields.filter((field: FormField) => field.pageIndex === pageIndex);
}

/**
 * Check if a document has any annotations.
 *
 * @param document PDF document
 * @returns true if document has annotations, false otherwise
 */
export function hasAnnotations(document: PdfDocument): boolean {
  return document.annotations.length > 0;
}

/**
 * Check if a document has any form fields.
 *
 * @param document PDF document
 * @returns true if document has form fields, false otherwise
 */
export function hasFormFields(document: PdfDocument): boolean {
  return document.formFields.length > 0;
}

/**
 * Check if a document is encrypted.
 *
 * @param document PDF document
 * @returns true if document is encrypted, false otherwise
 */
export function isEncrypted(document: PdfDocument): boolean {
  return document.metadata.encrypted;
}

/**
 * Check if a document is PDF/A compliant.
 *
 * @param document PDF document
 * @returns true if document is PDF/A compliant, false otherwise
 */
export function isPdfaCompliant(document: PdfDocument): boolean {
  return document.metadata.pdfaCompliance !== undefined;
}

/**
 * Get document title, falling back to file name if title is empty.
 *
 * @param document PDF document
 * @returns Document title or file name
 */
export function getDisplayTitle(document: PdfDocument): string {
  return document.metadata.title?.trim() || document.fileName;
}

/**
 * Create a document snapshot (shallow copy).
 *
 * Useful for undo/redo implementations.
 *
 * @param document PDF document to snapshot
 * @returns Snapshot of the document
 */
export function createSnapshot(document: PdfDocument): PdfDocument {
  return { ...document };
}

/**
 * Compare two documents for equality (by content hash).
 *
 * @param doc1 First document
 * @param doc2 Second document
 * @returns true if documents have the same content hash, false otherwise
 */
export function areDocumentsEqual(doc1: PdfDocument, doc2: PdfDocument): boolean {
  return doc1.contentHash === doc2.contentHash && doc1.id === doc2.id;
}