// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary and confidential.
// Free for personal, non-commercial use.
// Commercial use requires a valid license.
// See https://pdfluent.com/license for terms.

import { invoke } from '@tauri-apps/api/core';
import type { PdfDocument, TextSpan } from '../../../core/document';
import type { EngineResult, AsyncEngineResult } from '../../../core/engine/types';
import type { QueryEngine } from '../../../core/engine/QueryEngine';

// Backend response type for get_page_text_spans (snake_case from serde)
interface TauriTextSpan {
  text: string;
  x: number;
  y: number;
  width: number;
  height: number;
  font_size: number;
}

function notImpl(msg: string): { success: false; error: { code: 'not-implemented'; message: string } } {
  return { success: false, error: { code: 'not-implemented', message: msg } };
}

/**
 * Tauri-backed query engine.
 *
 * Text extraction (extractAllText, extractTextFromPages) is backed by the
 * real Tauri `extract_page_text` command. All other async methods are
 * placeholders pending backend support.
 *
 * Metadata query operations are synchronous, backed by the in-memory model.
 */
export class TauriQueryEngine implements QueryEngine {
  // Async — require Tauri backend

  async searchText(): AsyncEngineResult<Array<{
    pageIndex: number;
    matchIndex: number;
    text: string;
    bounds: { x: number; y: number; width: number; height: number };
    context?: string;
  }>> {
    return notImpl('searchText requires Tauri backend');
  }

  async searchTextInPages(): AsyncEngineResult<Array<{
    pageIndex: number;
    matchIndex: number;
    text: string;
    bounds: { x: number; y: number; width: number; height: number };
    context?: string;
  }>> {
    return notImpl('searchTextInPages requires Tauri backend');
  }

  async searchTextPatterns(): AsyncEngineResult<Array<{
    patternIndex: number;
    matches: Array<{
      pageIndex: number;
      matchIndex: number;
      text: string;
      bounds: { x: number; y: number; width: number; height: number };
    }>;
  }>> {
    return notImpl('searchTextPatterns requires Tauri backend');
  }

  async getSearchStats(): AsyncEngineResult<{
    totalMatches: number;
    matchesByPage: Record<number, number>;
    timeSpent: number;
  }> {
    return notImpl('getSearchStats requires Tauri backend');
  }

  async extractAllText(document: PdfDocument): AsyncEngineResult<string> {
    try {
      const parts: string[] = [];
      for (let i = 0; i < document.pages.length; i++) {
        const text = await invoke<string>('extract_page_text', { pageIndex: i });
        parts.push(text);
      }
      return { success: true, value: parts.join('\n') };
    } catch (e) {
      return { success: false, error: { code: 'internal-error', message: String(e) } };
    }
  }

  async extractTextFromPages(
    document: PdfDocument,
    pageIndices: number[]
  ): AsyncEngineResult<Record<number, string>> {
    try {
      const result: Record<number, string> = {};
      for (const pageIndex of pageIndices) {
        if (pageIndex < 0 || pageIndex >= document.pages.length) {
          return { success: false, error: { code: 'page-not-found', message: `Page index ${pageIndex} out of range` } };
        }
        result[pageIndex] = await invoke<string>('extract_page_text', { pageIndex });
      }
      return { success: true, value: result };
    } catch (e) {
      return { success: false, error: { code: 'internal-error', message: String(e) } };
    }
  }

  async extractTextFromRegion(): AsyncEngineResult<string> {
    return notImpl('extractTextFromRegion requires Tauri backend');
  }

  async extractPageTextSpans(
    _document: PdfDocument,
    pageIndex: number
  ): AsyncEngineResult<TextSpan[]> {
    try {
      const spans = await invoke<TauriTextSpan[]>('get_page_text_spans', { pageIndex });
      return {
        success: true,
        value: spans.map(s => ({
          text: s.text,
          rect: { x: s.x, y: s.y, width: s.width, height: s.height },
          fontSize: s.font_size,
        })),
      };
    } catch (e) {
      return { success: false, error: { code: 'internal-error', message: String(e) } };
    }
  }

  async extractTextWithFormatting(): AsyncEngineResult<Array<{
    pageIndex: number;
    text: string;
    fontSize: number;
    fontFamily: string;
    isBold: boolean;
    isItalic: boolean;
    color?: string;
    bounds: { x: number; y: number; width: number; height: number };
  }>> {
    return notImpl('extractTextWithFormatting requires Tauri backend');
  }

  async getWordCount(): AsyncEngineResult<number> {
    return notImpl('getWordCount requires Tauri backend');
  }

  async getCharacterCount(): AsyncEngineResult<number> {
    return notImpl('getCharacterCount requires Tauri backend');
  }

  async getReadingTime(): AsyncEngineResult<number> {
    return notImpl('getReadingTime requires Tauri backend');
  }

  async getMostFrequentWords(): AsyncEngineResult<Array<{ word: string; count: number; frequency: number }>> {
    return notImpl('getMostFrequentWords requires Tauri backend');
  }

  async getTextStatistics(): AsyncEngineResult<{
    totalWords: number;
    totalCharacters: number;
    uniqueWords: number;
    averageWordLength: number;
    averageSentenceLength: number;
    readingLevel?: string;
  }> {
    return notImpl('getTextStatistics requires Tauri backend');
  }

  async getDocumentOutline(): AsyncEngineResult<Array<{
    title: string;
    pageIndex: number;
    level: number;
    children?: Array<{ title: string; pageIndex: number; level: number }>;
  }>> {
    return notImpl('getDocumentOutline requires Tauri backend');
  }

  async getDocumentHeadings(): AsyncEngineResult<Array<{
    text: string;
    pageIndex: number;
    level: 1 | 2 | 3 | 4 | 5 | 6;
    bounds: { x: number; y: number; width: number; height: number };
  }>> {
    return notImpl('getDocumentHeadings requires Tauri backend');
  }

  async getDocumentParagraphs(): AsyncEngineResult<Array<{
    text: string;
    pageIndex: number;
    bounds: { x: number; y: number; width: number; height: number };
  }>> {
    return notImpl('getDocumentParagraphs requires Tauri backend');
  }

  async getDocumentLists(): AsyncEngineResult<Array<{
    items: Array<{
      text: string;
      pageIndex: number;
      bounds: { x: number; y: number; width: number; height: number };
    }>;
    isNumbered: boolean;
    startNumber?: number;
  }>> {
    return notImpl('getDocumentLists requires Tauri backend');
  }

  async extractImages(): AsyncEngineResult<Array<{
    pageIndex: number;
    imageIndex: number;
    data: Uint8Array;
    format: string;
    width: number;
    height: number;
    dpi: number;
    bounds: { x: number; y: number; width: number; height: number };
  }>> {
    return notImpl('extractImages requires Tauri backend');
  }

  async getImageStatistics(): AsyncEngineResult<{
    totalImages: number;
    imagesByPage: Record<number, number>;
    totalSize: number;
    formats: Record<string, number>;
  }> {
    return notImpl('getImageStatistics requires Tauri backend');
  }

  async extractLinks(): AsyncEngineResult<Array<{
    pageIndex: number;
    text: string;
    url: string;
    bounds: { x: number; y: number; width: number; height: number };
  }>> {
    return notImpl('extractLinks requires Tauri backend');
  }

  async validateLinks(): AsyncEngineResult<Array<{
    url: string;
    isValid: boolean;
    statusCode?: number;
    error?: string;
  }>> {
    return notImpl('validateLinks requires Tauri backend');
  }

  async benchmarkQueries(): AsyncEngineResult<Array<{
    queryType: string;
    averageTime: number;
    memoryUsage: number;
    success: boolean;
  }>> {
    return notImpl('benchmarkQueries requires Tauri backend');
  }

  // Sync — backed by in-memory document model

  queryMetadata(
    document: PdfDocument,
    query: Record<string, unknown>
  ): EngineResult<Record<string, unknown>> {
    const meta = document.metadata as unknown as Record<string, unknown>;
    const result: Record<string, unknown> = {};
    for (const key of Object.keys(query)) {
      if (key in meta) {
        result[key] = meta[key];
      }
    }
    return { success: true, value: result };
  }

  getInformationSchema(
    document: PdfDocument
  ): EngineResult<Array<{ field: string; type: string; description?: string; value?: unknown }>> {
    const meta = document.metadata as unknown as Record<string, unknown>;
    const schema = Object.entries(meta).map(([field, value]) => ({
      field,
      type: typeof value,
      value,
    }));
    return { success: true, value: schema };
  }
}
