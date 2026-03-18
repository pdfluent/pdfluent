// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary and confidential.
// Free for personal, non-commercial use.
// Commercial use requires a valid license.
// See https://pdfluent.com/license for terms.

// ---------------------------------------------------------------------------
// Document Engine Interface
// ---------------------------------------------------------------------------

import type { PdfDocument, DocumentState, OutlineNode } from '../document';
import type { DocumentMetadata } from '../document/metadata';
import type { DocumentLoadOptions, SaveOptions, EngineResult, AsyncEngineResult } from './types';

/**
 * Document Engine - Handles document loading, saving, and metadata operations
 */
export interface DocumentEngine {
  // -------------------------------------------------------------------------
  // Document Loading & Saving
  // -------------------------------------------------------------------------

  /**
   * Load a PDF document from a file path or URL
   */
  loadDocument(source: string | ArrayBuffer | Uint8Array, options?: DocumentLoadOptions): AsyncEngineResult<PdfDocument>;

  /**
   * Save a PDF document to a file path or return as bytes
   */
  saveDocument(document: PdfDocument, destination?: string, options?: SaveOptions): AsyncEngineResult<Uint8Array | void>;

  /**
   * Close a document and release resources
   */
  closeDocument(document: PdfDocument): EngineResult<void>;

  /**
   * Check if a document is currently loaded
   */
  isDocumentLoaded(document: PdfDocument): boolean;

  // -------------------------------------------------------------------------
  // Metadata Operations
  // -------------------------------------------------------------------------

  /**
   * Get document metadata
   */
  getMetadata(document: PdfDocument): EngineResult<DocumentMetadata>;

  /**
   * Update document metadata
   */
  updateMetadata(document: PdfDocument, metadata: Partial<DocumentMetadata>): EngineResult<PdfDocument>;

  /**
   * Extract metadata without loading the full document
   */
  extractMetadata(source: string | ArrayBuffer | Uint8Array): AsyncEngineResult<DocumentMetadata>;

  // -------------------------------------------------------------------------
  // Document State Management
  // -------------------------------------------------------------------------

  /**
   * Get current document state (view mode, zoom, current page, etc.)
   */
  getDocumentState(document: PdfDocument): EngineResult<DocumentState>;

  /**
   * Update document state
   */
  updateDocumentState(document: PdfDocument, state: Partial<DocumentState>): EngineResult<PdfDocument>;

  // -------------------------------------------------------------------------
  // Document Information
  // -------------------------------------------------------------------------

  /**
   * Get document file size in bytes
   */
  getFileSize(document: PdfDocument): EngineResult<number>;

  /**
   * Get document modification status
   */
  isModified(document: PdfDocument): boolean;

  /**
   * Get page count
   */
  getPageCount(document: PdfDocument): EngineResult<number>;

  /**
   * Get the document outline (table of contents / bookmarks).
   * Returns an empty array when the document has no outline.
   */
  getOutline(document: PdfDocument): AsyncEngineResult<OutlineNode[]>;

  /**
   * Get document permissions
   */
  getPermissions(document: PdfDocument): EngineResult<{
    canPrint: boolean;
    canModify: boolean;
    canCopy: boolean;
    canAnnotate: boolean;
    canFillForms: boolean;
    canExtractContent: boolean;
    canAssemble: boolean;
  }>;

  // -------------------------------------------------------------------------
  // Document Operations
  // -------------------------------------------------------------------------

  /**
   * Create a new empty document
   */
  createEmptyDocument(fileName: string): AsyncEngineResult<PdfDocument>;

  /**
   * Create a document from pages of existing documents
   */
  createDocumentFromPages(pages: Array<{ document: PdfDocument; pageIndex: number }>): AsyncEngineResult<PdfDocument>;

  /**
   * Compare two documents for equality
   */
  compareDocuments(a: PdfDocument, b: PdfDocument): EngineResult<boolean>;

  // -------------------------------------------------------------------------
  // Document Validation
  // -------------------------------------------------------------------------

  /**
   * Validate document structure and integrity
   */
  validateDocument(document: PdfDocument): EngineResult<boolean>;

  /**
   * Repair document if possible
   */
  repairDocument(document: PdfDocument): AsyncEngineResult<PdfDocument>;
}