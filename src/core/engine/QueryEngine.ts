// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary and confidential.
// Free for personal, non-commercial use.
// Commercial use requires a valid license.
// See https://pdfluent.com/license for terms.

// ---------------------------------------------------------------------------
// Query Engine Interface
// ---------------------------------------------------------------------------

import type { PdfDocument, TextSpan } from '../document';
import type { QueryOptions, EngineResult, AsyncEngineResult } from './types';

/**
 * Query Engine - Handles text search, extraction, and document analysis
 */
export interface QueryEngine {
  // -------------------------------------------------------------------------
  // Text Search
  // -------------------------------------------------------------------------

  /**
   * Search for text in document
   */
  searchText(
    document: PdfDocument,
    searchText: string,
    options?: QueryOptions
  ): AsyncEngineResult<Array<{
    pageIndex: number;
    matchIndex: number;
    text: string;
    bounds: { x: number; y: number; width: number; height: number };
    context?: string;
  }>>;

  /**
   * Search for text in specific pages
   */
  searchTextInPages(
    document: PdfDocument,
    searchText: string,
    pageIndices: number[],
    options?: QueryOptions
  ): AsyncEngineResult<Array<{
    pageIndex: number;
    matchIndex: number;
    text: string;
    bounds: { x: number; y: number; width: number; height: number };
    context?: string;
  }>>;

  /**
   * Search for multiple text patterns
   */
  searchTextPatterns(
    document: PdfDocument,
    patterns: Array<{
      text: string;
      options?: QueryOptions;
    }>
  ): AsyncEngineResult<Array<{
    patternIndex: number;
    matches: Array<{
      pageIndex: number;
      matchIndex: number;
      text: string;
      bounds: { x: number; y: number; width: number; height: number };
    }>;
  }>>;

  /**
   * Get search statistics
   */
  getSearchStats(
    document: PdfDocument,
    searchText: string
  ): AsyncEngineResult<{
    totalMatches: number;
    matchesByPage: Record<number, number>;
    timeSpent: number;
  }>;

  // -------------------------------------------------------------------------
  // Text Extraction
  // -------------------------------------------------------------------------

  /**
   * Extract all text from document
   */
  extractAllText(document: PdfDocument): AsyncEngineResult<string>;

  /**
   * Extract text from specific pages
   */
  extractTextFromPages(
    document: PdfDocument,
    pageIndices: number[]
  ): AsyncEngineResult<Record<number, string>>;

  /**
   * Extract text from specific region
   */
  extractTextFromRegion(
    document: PdfDocument,
    pageIndex: number,
    region: { x: number; y: number; width: number; height: number }
  ): AsyncEngineResult<string>;

  /**
   * Extract positioned text spans for a single page.
   *
   * Coordinates are in PDF user space (origin bottom-left, y up).
   * Suitable for rendering the transparent text selection layer.
   */
  extractPageTextSpans(
    document: PdfDocument,
    pageIndex: number
  ): AsyncEngineResult<TextSpan[]>;

  /**
   * Extract text with formatting information
   */
  extractTextWithFormatting(
    document: PdfDocument
  ): AsyncEngineResult<Array<{
    pageIndex: number;
    text: string;
    fontSize: number;
    fontFamily: string;
    isBold: boolean;
    isItalic: boolean;
    color?: string;
    bounds: { x: number; y: number; width: number; height: number };
  }>>;

  // -------------------------------------------------------------------------
  // Text Analysis
  // -------------------------------------------------------------------------

  /**
   * Get word count
   */
  getWordCount(document: PdfDocument): AsyncEngineResult<number>;

  /**
   * Get character count
   */
  getCharacterCount(document: PdfDocument): AsyncEngineResult<number>;

  /**
   * Get reading time estimate
   */
  getReadingTime(document: PdfDocument, wordsPerMinute?: number): AsyncEngineResult<number>;

  /**
   * Get most frequent words
   */
  getMostFrequentWords(
    document: PdfDocument,
    limit?: number,
    minLength?: number
  ): AsyncEngineResult<Array<{ word: string; count: number; frequency: number }>>;

  /**
   * Get text statistics
   */
  getTextStatistics(document: PdfDocument): AsyncEngineResult<{
    totalWords: number;
    totalCharacters: number;
    uniqueWords: number;
    averageWordLength: number;
    averageSentenceLength: number;
    readingLevel?: string;
  }>;

  // -------------------------------------------------------------------------
  // Document Structure Analysis
  // -------------------------------------------------------------------------

  /**
   * Get document outline (table of contents)
   */
  getDocumentOutline(document: PdfDocument): AsyncEngineResult<Array<{
    title: string;
    pageIndex: number;
    level: number;
    children?: Array<{
      title: string;
      pageIndex: number;
      level: number;
    }>;
  }>>;

  /**
   * Get document headings
   */
  getDocumentHeadings(document: PdfDocument): AsyncEngineResult<Array<{
    text: string;
    pageIndex: number;
    level: 1 | 2 | 3 | 4 | 5 | 6;
    bounds: { x: number; y: number; width: number; height: number };
  }>>;

  /**
   * Get document paragraphs
   */
  getDocumentParagraphs(document: PdfDocument): AsyncEngineResult<Array<{
    text: string;
    pageIndex: number;
    bounds: { x: number; y: number; width: number; height: number };
  }>>;

  /**
   * Get document lists (bulleted/numbered)
   */
  getDocumentLists(document: PdfDocument): AsyncEngineResult<Array<{
    items: Array<{
      text: string;
      pageIndex: number;
      bounds: { x: number; y: number; width: number; height: number };
    }>;
    isNumbered: boolean;
    startNumber?: number;
  }>>;

  // -------------------------------------------------------------------------
  // Image Analysis
  // -------------------------------------------------------------------------

  /**
   * Extract images from document
   */
  extractImages(
    document: PdfDocument,
    pageIndices?: number[]
  ): AsyncEngineResult<Array<{
    pageIndex: number;
    imageIndex: number;
    data: Uint8Array;
    format: string;
    width: number;
    height: number;
    dpi: number;
    bounds: { x: number; y: number; width: number; height: number };
  }>>;

  /**
   * Get image statistics
   */
  getImageStatistics(document: PdfDocument): AsyncEngineResult<{
    totalImages: number;
    imagesByPage: Record<number, number>;
    totalSize: number;
    formats: Record<string, number>;
  }>;

  // -------------------------------------------------------------------------
  // Link Analysis
  // -------------------------------------------------------------------------

  /**
   * Extract links from document
   */
  extractLinks(document: PdfDocument): AsyncEngineResult<Array<{
    pageIndex: number;
    text: string;
    url: string;
    bounds: { x: number; y: number; width: number; height: number };
  }>>;

  /**
   * Validate links in document
   */
  validateLinks(document: PdfDocument): AsyncEngineResult<Array<{
    url: string;
    isValid: boolean;
    statusCode?: number;
    error?: string;
  }>>;

  // -------------------------------------------------------------------------
  // Metadata Query
  // -------------------------------------------------------------------------

  /**
   * Query document metadata
   */
  queryMetadata(
    document: PdfDocument,
    query: Record<string, unknown>
  ): EngineResult<Record<string, unknown>>;

  /**
   * Get document information schema
   */
  getInformationSchema(document: PdfDocument): EngineResult<Array<{
    field: string;
    type: string;
    description?: string;
    value?: unknown;
  }>>;

  // -------------------------------------------------------------------------
  // Performance
  // -------------------------------------------------------------------------

  /**
   * Benchmark query operations
   */
  benchmarkQueries(
    document: PdfDocument,
    queries: Array<{
      type: 'search' | 'extract' | 'analyze';
      parameters: Record<string, unknown>;
    }>,
    iterations?: number
  ): AsyncEngineResult<Array<{
    queryType: string;
    averageTime: number;
    memoryUsage: number;
    success: boolean;
  }>>;
}
