// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary and confidential.
// Free for personal, non-commercial use.
// Commercial use requires a valid license.
// See https://pdfluent.com/license for terms.

import type { Size, Rect, Rotation } from '../types';
import type { DocumentMetadata } from './metadata';
import { createDefaultMetadata } from './metadata';

// ---------------------------------------------------------------------------
// Page Model
// ---------------------------------------------------------------------------

/**
 * Represents a single page in a PDF document.
 *
 * This is an engine-agnostic representation that can be used by UI components
 * without needing to know the underlying PDF engine implementation.
 */
export interface Page {
  /** Zero-based page index */
  readonly index: number;

  /** Page size in points (1/72 inch) */
  readonly size: Size;

  /** Page rotation (0, 90, 180, or 270 degrees) */
  readonly rotation: Rotation;

  /** Page content hash for caching purposes */
  readonly contentHash: string;

  /** Whether the page has been rendered */
  readonly isRendered: boolean;

  /** Optional render data (base64 encoded image) */
  readonly renderData?: string;

  /** Render dimensions in pixels (if rendered) */
  readonly renderSize?: Size;

  /** Page metadata */
  readonly metadata: PageMetadata;
}

/**
 * Page-specific metadata
 */
export interface PageMetadata {
  /** Page label (e.g., "i", "ii", "1", "2") */
  readonly label: string;

  /** Whether this page is part of a page range (e.g., in a booklet) */
  readonly inRange: boolean;

  /** Optional thumbnail data (smaller than full render) */
  readonly thumbnailData?: string;

  /** Whether annotations are present on this page */
  readonly hasAnnotations: boolean;

  /** Whether forms are present on this page */
  readonly hasForms: boolean;
}

// ---------------------------------------------------------------------------
// Outline Model (PDF Table of Contents)
// ---------------------------------------------------------------------------

/**
 * A single node in the PDF document outline (table of contents / bookmarks).
 *
 * Mirrors the PDF /Outline structure defined in ISO 32000-2 §12.3.3.
 */
export interface OutlineNode {
  /** Bookmark title as it appears in the outline */
  readonly title: string;

  /** Zero-based index of the destination page */
  readonly pageIndex: number;

  /** Child nodes (nested sections) */
  readonly children: OutlineNode[];
}

// ---------------------------------------------------------------------------
// Annotation Model
// ---------------------------------------------------------------------------

/**
 * Base interface for all PDF annotations.
 *
 * Follows ISO 32000-2 specification for annotation types.
 */
export interface Annotation {
  /** Unique annotation ID */
  readonly id: string;

  /** Page index where annotation appears */
  readonly pageIndex: number;

  /** Annotation bounding box in page coordinates */
  readonly rect: Rect;

  /** Annotation type */
  readonly type: AnnotationType;

  /** Annotation creation timestamp */
  readonly createdAt: Date;

  /** Last modification timestamp */
  readonly modifiedAt: Date;

  /** Author of the annotation */
  readonly author: string;

  /** Annotation contents (text content) */
  readonly contents?: string;

  /** Whether the annotation is visible */
  readonly visible: boolean;

  /** Whether the annotation is locked */
  readonly locked: boolean;

  /** Annotation color (CSS color string) */
  readonly color: string;

  /** Optional opacity (0.0 to 1.0) */
  readonly opacity?: number;

  /** Review workflow status — 'open' until explicitly resolved */
  readonly status?: 'open' | 'resolved';

  /** Reply annotations nested under this comment */
  readonly replies?: readonly Reply[];

  /** Custom properties */
  readonly customData?: Record<string, unknown>;
}

/** A reply nested under an annotation comment. */
export interface Reply {
  readonly id: string;
  readonly author: string;
  readonly contents: string;
  readonly createdAt: Date;
}

/**
 * Supported annotation types
 */
export type AnnotationType =
  | 'text'           // Text annotation (sticky note)
  | 'highlight'      // Text highlight
  | 'underline'      // Text underline
  | 'strikeout'      // Text strikeout
  | 'freehand'       // Freehand drawing
  | 'line'           // Line
  | 'square'         // Square/rectangle
  | 'circle'         // Circle/ellipse
  | 'polygon'        // Polygon
  | 'polyline'       // Polyline
  | 'stamp'          // Rubber stamp
  | 'ink'            // Ink annotation (handwriting)
  | 'file-attachment' // File attachment
  | 'sound'          // Sound annotation
  | 'movie'          // Movie annotation
  | 'screen'         // Screen annotation
  | 'widget'         // Widget annotation (form field)
  | 'printer-mark'   // Printer's mark
  | 'trap-net'       // Trap network annotation
  | 'watermark'      // Watermark annotation
  | '3d'             // 3D annotation
  | 'rich-media'     // Rich media annotation
  | 'redaction';     // Redaction annotation (marks content for permanent removal)

// ---------------------------------------------------------------------------
// Form Field Model
// ---------------------------------------------------------------------------

/**
 * Base interface for PDF form fields.
 *
 * Supports both AcroForms and XFA forms.
 */
export interface FormField {
  /** Unique field ID */
  readonly id: string;

  /** Page index where field appears */
  readonly pageIndex: number;

  /** Field bounding box in page coordinates */
  readonly rect: Rect;

  /** Field type */
  readonly type: FormFieldType;

  /** Field name (fully qualified name for hierarchical forms) */
  readonly name: string;

  /** Field value */
  readonly value: FormFieldValue;

  /** Default value */
  readonly defaultValue: FormFieldValue;

  /** Whether the field is required */
  readonly required: boolean;

  /** Whether the field is read-only */
  readonly readOnly: boolean;

  /** Whether the field is visible */
  readonly visible: boolean;

  /** Field label (display name) */
  readonly label: string;

  /** Tooltip text */
  readonly tooltip?: string;

  /** Field validation rules */
  readonly validation?: FieldValidation;

  /** Field formatting rules */
  readonly formatting?: FieldFormatting;

  /** Custom properties */
  readonly customData?: Record<string, unknown>;
}

/**
 * Form field types
 */
export type FormFieldType =
  | 'text'           // Text field
  | 'checkbox'       // Checkbox
  | 'radio'         // Radio button
  | 'list'          // List box
  | 'combo'         // Combo box (dropdown)
  | 'signature'     // Signature field
  | 'button'        // Push button
  | 'date'          // Date field
  | 'time'          // Time field
  | 'number'        // Number field
  | 'password'      // Password field
  | 'file'          // File selection field
  | 'barcode'       // Barcode field
  | 'rich-text';    // Rich text field

/**
 * Form field value type (can be string, boolean, number, or array for multi-select)
 */
export type FormFieldValue = string | boolean | number | string[] | number[];

/**
 * Field validation rules
 */
export interface FieldValidation {
  /** Regular expression pattern for text validation */
  readonly pattern?: string;

  /** Minimum value for numeric fields */
  readonly min?: number;

  /** Maximum value for numeric fields */
  readonly max?: number;

  /** Minimum length for text fields */
  readonly minLength?: number;

  /** Maximum length for text fields */
  readonly maxLength?: number;

  /** Custom validation function (as string to be evaluated) */
  readonly customScript?: string;

  /** Error message when validation fails */
  readonly errorMessage?: string;
}

/**
 * Field formatting rules
 */
export interface FieldFormatting {
  /** Number format (for numeric fields) */
  readonly numberFormat?: string;

  /** Date format (for date fields) */
  readonly dateFormat?: string;

  /** Time format (for time fields) */
  readonly timeFormat?: string;

  /** Text alignment */
  readonly alignment?: 'left' | 'center' | 'right';

  /** Font information */
  readonly font?: {
    family: string;
    size: number;
    bold?: boolean;
    italic?: boolean;
  };

  /** Background color */
  readonly backgroundColor?: string;

  /** Text color */
  readonly textColor?: string;

  /** Border style */
  readonly border?: {
    width: number;
    color: string;
    style: 'solid' | 'dashed' | 'dotted';
  };
}

// ---------------------------------------------------------------------------
// Text Span Model
// ---------------------------------------------------------------------------

/**
 * A single span of text extracted from a PDF page, with positional information.
 */
export interface TextSpan {
  /** Text content of the span */
  text: string;

  /** Bounding rectangle in page coordinate space (points, origin at bottom-left) */
  rect: { x: number; y: number; width: number; height: number };

  /** Font size in points */
  fontSize: number;
}

// ---------------------------------------------------------------------------
// Document Model
// ---------------------------------------------------------------------------

/**
 * Engine-agnostic PDF document representation.
 *
 * This is the central document model that UI components interact with.
 * All operations return new document instances (immutable design).
 */
export interface PdfDocument {
  /** Unique document ID */
  readonly id: string;

  /** Document file name */
  readonly fileName: string;

  /** Document file size in bytes */
  readonly fileSize: number;

  /** Document metadata (title, author, etc.) */
  readonly metadata: DocumentMetadata;

  /** Document pages */
  readonly pages: readonly Page[];

  /** Document annotations */
  readonly annotations: readonly Annotation[];

  /** Document form fields */
  readonly formFields: readonly FormField[];

  /** Document state */
  readonly state: DocumentState;

  /** Whether the document has been modified */
  readonly isModified: boolean;

  /** Document hash for change detection */
  readonly contentHash: string;

  /** Document creation timestamp */
  readonly createdAt: Date;

  /** Last modification timestamp */
  readonly modifiedAt: Date;
}

/**
 * Document state information
 */
export interface DocumentState {
  /** Current page index (for navigation) */
  readonly currentPage: number;

  /** Zoom level (as multiplier, e.g., 1.0 = 100%) */
  readonly zoom: number;

  /** View mode (single page, continuous scroll, etc.) */
  readonly viewMode: ViewMode;

  /** Rotation for all pages (applied during viewing) */
  readonly viewRotation: Rotation;

  /** Whether the document is locked for editing */
  readonly locked: boolean;

  /** Document permissions */
  readonly permissions: DocumentPermissions;

  /** Custom view state */
  readonly customViewState?: Record<string, unknown>;
}

/**
 * Document view modes
 */
export type ViewMode =
  | 'single'        // Single page view
  | 'continuous'    // Continuous scroll
  | 'two-page'      // Two-page spread
  | 'two-continuous' // Continuous two-page spread
  | 'thumbnail';    // Thumbnail view

/**
 * Document permissions
 */
export interface DocumentPermissions {
  /** Whether printing is allowed */
  readonly canPrint: boolean;

  /** Whether modifying the document is allowed */
  readonly canModify: boolean;

  /** Whether copying text is allowed */
  readonly canCopy: boolean;

  /** Whether adding annotations is allowed */
  readonly canAnnotate: boolean;

  /** Whether filling forms is allowed */
  readonly canFillForms: boolean;

  /** Whether extracting content is allowed */
  readonly canExtractContent: boolean;

  /** Whether assembling the document is allowed (insert/delete/rotate pages) */
  readonly canAssemble: boolean;

  /** Whether printing in high quality is allowed */
  readonly canPrintHighQuality: boolean;
}

// ---------------------------------------------------------------------------
// Document Operations (Immutable Updates)
// ---------------------------------------------------------------------------

/**
 * Update document metadata
 */
export function updateMetadata(
  document: PdfDocument,
  metadata: Partial<DocumentMetadata>
): PdfDocument {
  return {
    ...document,
    metadata: { ...document.metadata, ...metadata },
    isModified: true,
    modifiedAt: new Date(),
  };
}

/**
 * Update page information
 */
export function updatePage(
  document: PdfDocument,
  pageIndex: number,
  updates: Partial<Page>
): PdfDocument {
  const newPages = [...document.pages];
  newPages[pageIndex] = { ...newPages[pageIndex], ...updates } as Page;

  return {
    ...document,
    pages: newPages,
    isModified: true,
    modifiedAt: new Date(),
  };
}

/**
 * Add annotation to document
 */
export function addAnnotation(
  document: PdfDocument,
  annotation: Annotation
): PdfDocument {
  return {
    ...document,
    annotations: [...document.annotations, annotation],
    isModified: true,
    modifiedAt: new Date(),
  };
}

/**
 * Update annotation in document
 */
export function updateAnnotation(
  document: PdfDocument,
  annotationId: string,
  updates: Partial<Annotation>
): PdfDocument {
  const newAnnotations = document.annotations.map(ann =>
    ann.id === annotationId ? { ...ann, ...updates, modifiedAt: new Date() } : ann
  );

  return {
    ...document,
    annotations: newAnnotations,
    isModified: true,
    modifiedAt: new Date(),
  };
}

/**
 * Remove annotation from document
 */
export function removeAnnotation(
  document: PdfDocument,
  annotationId: string
): PdfDocument {
  const newAnnotations = document.annotations.filter(ann => ann.id !== annotationId);

  return {
    ...document,
    annotations: newAnnotations,
    isModified: true,
    modifiedAt: new Date(),
  };
}

/**
 * Update form field value
 */
export function updateFormField(
  document: PdfDocument,
  fieldId: string,
  value: FormFieldValue
): PdfDocument {
  const newFields = document.formFields.map(field =>
    field.id === fieldId ? { ...field, value, modifiedAt: new Date() } : field
  );

  return {
    ...document,
    formFields: newFields,
    isModified: true,
    modifiedAt: new Date(),
  };
}

/**
 * Update document state (navigation, zoom, etc.)
 */
export function updateDocumentState(
  document: PdfDocument,
  state: Partial<DocumentState>
): PdfDocument {
  return {
    ...document,
    state: { ...document.state, ...state },
    modifiedAt: new Date(),
  };
}

/**
 * Create a new empty document
 */
export function createEmptyDocument(fileName: string): PdfDocument {
  const now = new Date();

  return {
    id: generateDocumentId(),
    fileName,
    fileSize: 0,
    metadata: {
      ...createDefaultMetadata(),
      title: fileName,
      creationDate: now,
      modificationDate: now,
    },
    pages: [],
    annotations: [],
    formFields: [],
    state: {
      currentPage: 0,
      zoom: 1.0,
      viewMode: 'single',
      viewRotation: 0,
      locked: false,
      permissions: {
        canPrint: true,
        canModify: true,
        canCopy: true,
        canAnnotate: true,
        canFillForms: true,
        canExtractContent: true,
        canAssemble: true,
        canPrintHighQuality: true,
      },
    },
    isModified: false,
    contentHash: '',
    createdAt: now,
    modifiedAt: now,
  };
}

// ---------------------------------------------------------------------------
// Utility Functions
// ---------------------------------------------------------------------------

function generateDocumentId(): string {
  return `doc_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}