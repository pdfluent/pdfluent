// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary and confidential.
// Free for personal, non-commercial use.
// Commercial use requires a valid license.
// See https://pdfluent.com/license for terms.

import { invoke } from '@tauri-apps/api/core';
import type { PdfDocument, Annotation, AnnotationType } from '../../../core/document';
import type { EngineResult, AsyncEngineResult } from '../../../core/engine/types';
import type { AnnotationEngine } from '../../../core/engine/AnnotationEngine';

// Backend response types (snake_case from serde)
interface TauriAnnotationRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface TauriAnnotation {
  id: string;
  page_index: number;
  annotation_type: string;
  rect: TauriAnnotationRect;
  contents: string | null;
  author: string | null;
  color: [number, number, number] | null;
}

function mapTauriAnnotation(raw: TauriAnnotation): Annotation {
  return {
    id: raw.id,
    pageIndex: raw.page_index,
    type: raw.annotation_type as AnnotationType,
    rect: raw.rect,
    contents: raw.contents ?? undefined,
    author: raw.author ?? '',
    color: raw.color
      ? `rgb(${Math.round(raw.color[0] * 255)},${Math.round(raw.color[1] * 255)},${Math.round(raw.color[2] * 255)})`
      : '#FFD700',
    visible: true,
    locked: false,
    createdAt: new Date(0),
    modifiedAt: new Date(0),
    opacity: 1.0,
    status: 'open',
  };
}

const SUPPORTED_TYPES: AnnotationType[] = [
  'text', 'highlight', 'underline', 'strikeout', 'freehand', 'stamp', 'ink', 'redaction',
];

const ALL_TYPES: AnnotationType[] = [
  'text', 'highlight', 'underline', 'strikeout', 'freehand', 'line',
  'square', 'circle', 'polygon', 'polyline', 'stamp', 'ink', 'file-attachment',
  'sound', 'movie', 'screen', 'widget', 'printer-mark', 'trap-net', 'watermark',
  '3d', 'rich-media', 'redaction',
];

function notImpl(msg: string): { success: false; error: { code: 'not-implemented'; message: string } } {
  return { success: false, error: { code: 'not-implemented', message: msg } };
}

/**
 * Tauri-backed annotation engine.
 *
 * Mutation operations (create, update, delete, group, import/export, history)
 * are async — they require Tauri backend I/O or are placeholders pending backend
 * command support.
 *
 * Read operations against the in-memory document model are synchronous.
 */
export class TauriAnnotationEngine implements AnnotationEngine {
  // Async — require Tauri backend

  async createAnnotation(
    _document: PdfDocument,
    pageIndex: number,
    type: AnnotationType,
    bounds: { x: number; y: number; width: number; height: number },
    properties: Partial<Annotation>
  ): AsyncEngineResult<Annotation> {
    if (type !== 'text') {
      return notImpl('Only text annotations are supported in Phase 2');
    }
    try {
      await invoke('add_comment_annotation', {
        pageIndex,
        x: bounds.x,
        y: bounds.y,
        text: properties.contents ?? '',
      });
      // add_comment_annotation returns (). Callers must call loadAnnotations
      // after this to get the real annotation ID from the backend.
      return {
        success: true,
        value: {
          id: 'pending-refetch',
          pageIndex,
          type: 'text',
          rect: bounds,
          contents: properties.contents,
          author: properties.author ?? '',
          color: '#FFD700',
          visible: true,
          locked: false,
          createdAt: new Date(),
          modifiedAt: new Date(),
          opacity: 1.0,
        },
      };
    } catch (e) {
      return { success: false, error: { code: 'internal-error', message: String(e) } };
    }
  }

  async updateAnnotation(
    _document: PdfDocument,
    annotationId: string,
    updates: Partial<Annotation>
  ): AsyncEngineResult<Annotation> {
    try {
      if (updates.contents !== undefined) {
        await invoke('update_annotation_contents', {
          annotationId,
          contents: updates.contents,
        });
      }
      // Callers must re-fetch via loadAnnotations to get ground-truth state.
      return {
        success: true,
        value: { id: annotationId } as Annotation,
      };
    } catch (e) {
      return { success: false, error: { code: 'internal-error', message: String(e) } };
    }
  }

  async deleteAnnotation(
    _document: PdfDocument,
    annotationId: string
  ): AsyncEngineResult<void> {
    try {
      await invoke('delete_annotation', { annotationId });
      return { success: true, value: undefined };
    } catch (e) {
      return { success: false, error: { code: 'internal-error', message: String(e) } };
    }
  }

  async deleteAnnotations(): AsyncEngineResult<void> {
    return notImpl('deleteAnnotations requires Tauri backend');
  }

  async createAnnotations(): AsyncEngineResult<Annotation[]> {
    return notImpl('createAnnotations requires Tauri backend');
  }

  async updateAnnotations(): AsyncEngineResult<Annotation[]> {
    return notImpl('updateAnnotations requires Tauri backend');
  }

  async groupAnnotations(): AsyncEngineResult<void> {
    return notImpl('groupAnnotations requires Tauri backend');
  }

  async ungroupAnnotations(): AsyncEngineResult<void> {
    return notImpl('ungroupAnnotations requires Tauri backend');
  }

  async getAnnotationsInGroup(): AsyncEngineResult<Annotation[]> {
    return notImpl('getAnnotationsInGroup requires Tauri backend');
  }

  async importAnnotations(): AsyncEngineResult<Annotation[]> {
    return notImpl('importAnnotations requires Tauri backend');
  }

  async exportAnnotations(): AsyncEngineResult<Uint8Array | string> {
    return notImpl('exportAnnotations requires Tauri backend');
  }

  async getAnnotationHistory(): AsyncEngineResult<Array<{
    timestamp: Date;
    operation: 'create' | 'update' | 'delete';
    user?: string;
    changes: Partial<Annotation>;
  }>> {
    return notImpl('getAnnotationHistory requires Tauri backend');
  }

  // Async — backed by Tauri backend (real annotation data from PDF file)

  async loadAnnotations(
    _document: PdfDocument,
    pageIndex?: number
  ): AsyncEngineResult<Annotation[]> {
    try {
      const raw = await invoke<TauriAnnotation[]>('get_annotations', {
        pageIndex: pageIndex ?? null,
      });
      return { success: true, value: raw.map(mapTauriAnnotation) };
    } catch (e) {
      return { success: false, error: { code: 'internal-error', message: String(e) } };
    }
  }

  // Sync — backed by in-memory document model

  getAnnotation(document: PdfDocument, annotationId: string): EngineResult<Annotation> {
    const ann = document.annotations.find(a => a.id === annotationId);
    if (!ann) {
      return { success: false, error: { code: 'internal-error', message: `Annotation '${annotationId}' not found` } };
    }
    return { success: true, value: ann };
  }

  getAllAnnotations(document: PdfDocument): EngineResult<Annotation[]> {
    return { success: true, value: [...document.annotations] };
  }

  getAnnotationsForPage(document: PdfDocument, pageIndex: number): EngineResult<Annotation[]> {
    return { success: true, value: document.annotations.filter(a => a.pageIndex === pageIndex) };
  }

  getAnnotationsByType(document: PdfDocument, type: AnnotationType): EngineResult<Annotation[]> {
    return { success: true, value: document.annotations.filter(a => a.type === type) };
  }

  findAnnotations(document: PdfDocument, query: Partial<Annotation>): EngineResult<Annotation[]> {
    const keys = Object.keys(query) as Array<keyof Annotation>;
    const annotations = document.annotations.filter(ann =>
      keys.every(key => (ann[key] as unknown) === (query[key] as unknown))
    );
    return { success: true, value: annotations };
  }

  searchAnnotations(
    document: PdfDocument,
    searchText: string,
    caseSensitive = false
  ): EngineResult<Annotation[]> {
    const needle = caseSensitive ? searchText : searchText.toLowerCase();
    const compare = (s: string) => caseSensitive ? s : s.toLowerCase();
    const annotations = document.annotations.filter(ann =>
      ann.contents !== undefined && compare(ann.contents).includes(needle)
    );
    return { success: true, value: annotations };
  }

  getSupportedAnnotationTypes(): AnnotationType[] {
    return [...SUPPORTED_TYPES];
  }

  isAnnotationTypeSupported(type: AnnotationType): boolean {
    return SUPPORTED_TYPES.includes(type);
  }

  getDefaultProperties(type: AnnotationType): Partial<Annotation> {
    return { type, visible: true, locked: false, color: '#ffff00' };
  }

  validateAnnotation(annotation: Annotation): EngineResult<boolean> {
    const isValid = annotation.id.length > 0 && annotation.author !== undefined;
    return { success: true, value: isValid };
  }

  getAnnotationStats(document: PdfDocument): EngineResult<{
    total: number;
    byType: Record<AnnotationType, number>;
    byPage: Record<number, number>;
    modifiedCount: number;
  }> {
    const byType = Object.fromEntries(ALL_TYPES.map(t => [t, 0])) as Record<AnnotationType, number>;
    const byPage: Record<number, number> = {};

    for (const ann of document.annotations) {
      byType[ann.type] = (byType[ann.type] ?? 0) + 1;
      byPage[ann.pageIndex] = (byPage[ann.pageIndex] ?? 0) + 1;
    }

    return {
      success: true,
      value: {
        total: document.annotations.length,
        byType,
        byPage,
        modifiedCount: 0,
      },
    };
  }
}
