// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary and confidential.
// Free for personal, non-commercial use.
// Commercial use requires a valid license.
// See https://pdfluent.com/license for terms.

// ---------------------------------------------------------------------------
// Annotation Engine Interface
// ---------------------------------------------------------------------------

import type { PdfDocument, Annotation, AnnotationType } from '../document';
import type { AnnotationCreateOptions, EngineResult, AsyncEngineResult } from './types';

/**
 * Annotation Engine - Handles annotation creation, modification, and deletion
 */
export interface AnnotationEngine {
  // -------------------------------------------------------------------------
  // Annotation CRUD Operations
  // -------------------------------------------------------------------------

  /**
   * Create a new annotation
   */
  createAnnotation(
    document: PdfDocument,
    pageIndex: number,
    type: AnnotationType,
    bounds: { x: number; y: number; width: number; height: number },
    properties: Partial<Annotation>,
    options?: AnnotationCreateOptions
  ): AsyncEngineResult<Annotation>;

  /**
   * Get annotation by ID
   */
  getAnnotation(document: PdfDocument, annotationId: string): EngineResult<Annotation>;

  /**
   * Update an annotation
   */
  updateAnnotation(
    document: PdfDocument,
    annotationId: string,
    updates: Partial<Annotation>
  ): AsyncEngineResult<Annotation>;

  /**
   * Delete an annotation
   */
  deleteAnnotation(document: PdfDocument, annotationId: string): AsyncEngineResult<void>;

  /**
   * Delete multiple annotations
   */
  deleteAnnotations(document: PdfDocument, annotationIds: string[]): AsyncEngineResult<void>;

  // -------------------------------------------------------------------------
  // Batch Operations
  // -------------------------------------------------------------------------

  /**
   * Create multiple annotations
   */
  createAnnotations(
    document: PdfDocument,
    annotations: Array<{
      pageIndex: number;
      type: AnnotationType;
      bounds: { x: number; y: number; width: number; height: number };
      properties: Partial<Annotation>;
    }>
  ): AsyncEngineResult<Annotation[]>;

  /**
   * Update multiple annotations
   */
  updateAnnotations(
    document: PdfDocument,
    updates: Array<{
      annotationId: string;
      updates: Partial<Annotation>;
    }>
  ): AsyncEngineResult<Annotation[]>;

  // -------------------------------------------------------------------------
  // Query Operations
  // -------------------------------------------------------------------------

  /**
   * Load annotations from the PDF backend for a page or the whole document.
   *
   * This is the async counterpart to getAllAnnotations — it fetches real
   * annotation data from the file via the Tauri command, whereas getAllAnnotations
   * reads the in-memory model (which starts empty).
   *
   * @param pageIndex  If provided, fetch only that page's annotations (0-based).
   *                   If omitted, fetch all pages.
   */
  loadAnnotations(document: PdfDocument, pageIndex?: number): AsyncEngineResult<Annotation[]>;

  /**
   * Get all annotations in a document
   */
  getAllAnnotations(document: PdfDocument): EngineResult<Annotation[]>;

  /**
   * Get annotations for a specific page
   */
  getAnnotationsForPage(document: PdfDocument, pageIndex: number): EngineResult<Annotation[]>;

  /**
   * Get annotations of a specific type
   */
  getAnnotationsByType(document: PdfDocument, type: AnnotationType): EngineResult<Annotation[]>;

  /**
   * Find annotations by properties
   */
  findAnnotations(
    document: PdfDocument,
    query: Partial<Annotation>
  ): EngineResult<Annotation[]>;

  /**
   * Search annotations by text content
   */
  searchAnnotations(
    document: PdfDocument,
    searchText: string,
    caseSensitive?: boolean
  ): EngineResult<Annotation[]>;

  // -------------------------------------------------------------------------
  // Annotation Properties
  // -------------------------------------------------------------------------

  /**
   * Get supported annotation types
   */
  getSupportedAnnotationTypes(): AnnotationType[];

  /**
   * Check if annotation type is supported
   */
  isAnnotationTypeSupported(type: AnnotationType): boolean;

  /**
   * Get default properties for an annotation type
   */
  getDefaultProperties(type: AnnotationType): Partial<Annotation>;

  /**
   * Validate annotation properties
   */
  validateAnnotation(annotation: Annotation): EngineResult<boolean>;

  // -------------------------------------------------------------------------
  // Grouping and Relations
  // -------------------------------------------------------------------------

  /**
   * Group annotations together
   */
  groupAnnotations(
    document: PdfDocument,
    annotationIds: string[],
    groupId?: string
  ): AsyncEngineResult<void>;

  /**
   * Ungroup annotations
   */
  ungroupAnnotations(document: PdfDocument, annotationIds: string[]): AsyncEngineResult<void>;

  /**
   * Get annotations in a group
   */
  getAnnotationsInGroup(document: PdfDocument, groupId: string): AsyncEngineResult<Annotation[]>;

  // -------------------------------------------------------------------------
  // Import/Export
  // -------------------------------------------------------------------------

  /**
   * Import annotations from external format
   */
  importAnnotations(
    document: PdfDocument,
    data: Uint8Array | string,
    format: 'xfdf' | 'json' | 'pdf'
  ): AsyncEngineResult<Annotation[]>;

  /**
   * Export annotations to external format
   */
  exportAnnotations(
    document: PdfDocument,
    annotationIds: string[],
    format: 'xfdf' | 'json' | 'pdf'
  ): AsyncEngineResult<Uint8Array | string>;

  // -------------------------------------------------------------------------
  // Statistics
  // -------------------------------------------------------------------------

  /**
   * Get annotation statistics
   */
  getAnnotationStats(document: PdfDocument): EngineResult<{
    total: number;
    byType: Record<AnnotationType, number>;
    byPage: Record<number, number>;
    modifiedCount: number;
  }>;

  /**
   * Get annotation creation history
   */
  getAnnotationHistory(
    document: PdfDocument,
    annotationId: string
  ): AsyncEngineResult<Array<{
    timestamp: Date;
    operation: 'create' | 'update' | 'delete';
    user?: string;
    changes: Partial<Annotation>;
  }>>;
}
