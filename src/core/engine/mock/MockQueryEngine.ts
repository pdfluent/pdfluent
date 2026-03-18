// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary and confidential.
// Free for personal, non-commercial use.
// Commercial use requires a valid license.
// See https://pdfluent.com/license for terms.

import type { PdfDocument, TextSpan } from '../../document';
import type { QueryOptions, EngineResult, AsyncEngineResult } from '../types';

function notImpl<T>(msg: string): AsyncEngineResult<T> {
  return Promise.resolve({ success: false, error: { code: 'not-implemented' as const, message: msg } });
}

export class MockQueryEngine {
  // Async — text extraction/search

  searchText(
    document: PdfDocument,
    searchText: string,
    _options?: QueryOptions
  ): AsyncEngineResult<Array<{
    pageIndex: number;
    matchIndex: number;
    text: string;
    bounds: { x: number; y: number; width: number; height: number };
    context?: string;
  }>> {
    const results: Array<{
      pageIndex: number; matchIndex: number; text: string;
      bounds: { x: number; y: number; width: number; height: number }; context?: string;
    }> = [];
    if (searchText.toLowerCase().includes('test')) {
      for (let i = 0; i < Math.min(3, document.pages.length); i++) {
        results.push({
          pageIndex: i,
          matchIndex: 0,
          text: searchText,
          bounds: { x: 50, y: 50, width: 100, height: 20 },
          context: `... ${searchText} ...`
        });
      }
    }
    return Promise.resolve({ success: true, value: results });
  }

  searchTextInPages(): AsyncEngineResult<Array<{
    pageIndex: number;
    matchIndex: number;
    text: string;
    bounds: { x: number; y: number; width: number; height: number };
    context?: string;
  }>> {
    return notImpl('searchTextInPages not implemented in MockQueryEngine');
  }

  searchTextPatterns(): AsyncEngineResult<Array<{
    patternIndex: number;
    matches: Array<{
      pageIndex: number;
      matchIndex: number;
      text: string;
      bounds: { x: number; y: number; width: number; height: number };
    }>;
  }>> {
    return notImpl('searchTextPatterns not implemented in MockQueryEngine');
  }

  getSearchStats(): AsyncEngineResult<{ totalMatches: number; matchesByPage: Record<number, number>; timeSpent: number }> {
    return Promise.resolve({ success: true, value: { totalMatches: 0, matchesByPage: {}, timeSpent: 0 } });
  }

  extractAllText(): AsyncEngineResult<string> {
    return Promise.resolve({ success: true, value: 'Mock document text content for testing purposes.' });
  }

  extractTextFromPages(): AsyncEngineResult<Record<number, string>> {
    return notImpl('extractTextFromPages not implemented in MockQueryEngine');
  }

  extractPageTextSpans(): AsyncEngineResult<TextSpan[]> {
    return Promise.resolve({ success: true, value: [] });
  }

  extractTextFromRegion(): AsyncEngineResult<string> {
    return notImpl('extractTextFromRegion not implemented in MockQueryEngine');
  }

  extractTextWithFormatting(): AsyncEngineResult<Array<{
    pageIndex: number;
    text: string;
    fontSize: number;
    fontFamily: string;
    isBold: boolean;
    isItalic: boolean;
    color?: string;
    bounds: { x: number; y: number; width: number; height: number };
  }>> {
    return notImpl('extractTextWithFormatting not implemented in MockQueryEngine');
  }

  getWordCount(): AsyncEngineResult<number> {
    return Promise.resolve({ success: true, value: 42 });
  }

  getCharacterCount(): AsyncEngineResult<number> {
    return Promise.resolve({ success: true, value: 250 });
  }

  getReadingTime(): AsyncEngineResult<number> {
    return Promise.resolve({ success: true, value: 1 });
  }

  getMostFrequentWords(): AsyncEngineResult<Array<{ word: string; count: number; frequency: number }>> {
    return Promise.resolve({
      success: true,
      value: [
        { word: 'test', count: 5, frequency: 0.2 },
        { word: 'document', count: 3, frequency: 0.12 },
        { word: 'mock', count: 2, frequency: 0.08 }
      ]
    });
  }

  getTextStatistics(): AsyncEngineResult<{
    totalWords: number;
    totalCharacters: number;
    uniqueWords: number;
    averageWordLength: number;
    averageSentenceLength: number;
    readingLevel?: string;
  }> {
    return Promise.resolve({
      success: true,
      value: {
        totalWords: 42,
        totalCharacters: 250,
        uniqueWords: 30,
        averageWordLength: 4.5,
        averageSentenceLength: 15,
        readingLevel: 'Basic'
      }
    });
  }

  getDocumentOutline(): AsyncEngineResult<Array<{
    title: string;
    pageIndex: number;
    level: number;
    children?: Array<{ title: string; pageIndex: number; level: number }>;
  }>> {
    return Promise.resolve({ success: true, value: [] });
  }

  getDocumentHeadings(): AsyncEngineResult<Array<{
    text: string;
    pageIndex: number;
    level: 1 | 2 | 3 | 4 | 5 | 6;
    bounds: { x: number; y: number; width: number; height: number };
  }>> {
    return notImpl('getDocumentHeadings not implemented in MockQueryEngine');
  }

  getDocumentParagraphs(): AsyncEngineResult<Array<{
    text: string;
    pageIndex: number;
    bounds: { x: number; y: number; width: number; height: number };
  }>> {
    return notImpl('getDocumentParagraphs not implemented in MockQueryEngine');
  }

  getDocumentLists(): AsyncEngineResult<Array<{
    items: Array<{
      text: string;
      pageIndex: number;
      bounds: { x: number; y: number; width: number; height: number };
    }>;
    isNumbered: boolean;
    startNumber?: number;
  }>> {
    return notImpl('getDocumentLists not implemented in MockQueryEngine');
  }

  extractImages(): AsyncEngineResult<Array<{
    pageIndex: number;
    imageIndex: number;
    data: Uint8Array;
    format: string;
    width: number;
    height: number;
    dpi: number;
    bounds: { x: number; y: number; width: number; height: number };
  }>> {
    return notImpl('extractImages not implemented in MockQueryEngine');
  }

  getImageStatistics(): AsyncEngineResult<{
    totalImages: number;
    imagesByPage: Record<number, number>;
    totalSize: number;
    formats: Record<string, number>;
  }> {
    return Promise.resolve({ success: true, value: { totalImages: 0, imagesByPage: {}, totalSize: 0, formats: {} } });
  }

  extractLinks(): AsyncEngineResult<Array<{
    pageIndex: number;
    text: string;
    url: string;
    bounds: { x: number; y: number; width: number; height: number };
  }>> {
    return Promise.resolve({ success: true, value: [] });
  }

  validateLinks(): AsyncEngineResult<Array<{
    url: string;
    isValid: boolean;
    statusCode?: number;
    error?: string;
  }>> {
    return notImpl('validateLinks not implemented in MockQueryEngine');
  }

  benchmarkQueries(): AsyncEngineResult<Array<{
    queryType: string;
    averageTime: number;
    memoryUsage: number;
    success: boolean;
  }>> {
    return notImpl('benchmarkQueries not implemented in MockQueryEngine');
  }

  // Sync reads

  queryMetadata(): EngineResult<Record<string, unknown>> {
    return { success: true, value: {} };
  }

  getInformationSchema(): EngineResult<Array<{
    field: string;
    type: string;
    description?: string;
    value?: unknown;
  }>> {
    return { success: true, value: [] };
  }
}
