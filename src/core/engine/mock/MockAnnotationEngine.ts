// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary and confidential.
// Free for personal, non-commercial use.
// Commercial use requires a valid license.
// See https://pdfluent.com/license for terms.

import type { PdfDocument, Annotation, AnnotationType } from '../../document';
import type { EngineResult, AsyncEngineResult } from '../types';

function notImpl<T>(msg: string): AsyncEngineResult<T> {
  return Promise.resolve({ success: false, error: { code: 'not-implemented' as const, message: msg } });
}

export class MockAnnotationEngine {
  // Async mutations

  createAnnotation(
    document: PdfDocument,
    pageIndex: number,
    type: AnnotationType,
    bounds: { x: number; y: number; width: number; height: number },
    properties: Partial<Annotation>
  ): AsyncEngineResult<Annotation> {
    const annotation: Annotation = {
      id: `anno-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      type,
      pageIndex,
      rect: bounds,
      createdAt: new Date(),
      modifiedAt: new Date(),
      author: 'Mock User',
      visible: true,
      locked: false,
      color: '#000000',
      opacity: 1.0,
      ...properties
    };

    const mutableAnnotations = [...document.annotations];
    mutableAnnotations.push(annotation);
    (document as any).annotations = mutableAnnotations;
    (document as any).isModified = true;

    return Promise.resolve({ success: true, value: annotation });
  }

  updateAnnotation(
    document: PdfDocument,
    annotationId: string,
    updates: Partial<Annotation>
  ): AsyncEngineResult<Annotation> {
    const index = document.annotations.findIndex(a => a.id === annotationId);
    if (index >= 0) {
      const updated: Annotation = {
        ...document.annotations[index],
        ...updates,
        modifiedAt: new Date()
      } as any;
      const mutableAnnotations = [...document.annotations];
      mutableAnnotations[index] = updated;
      (document as any).annotations = mutableAnnotations;
      (document as any).isModified = true;
      return Promise.resolve({ success: true, value: updated });
    }
    return Promise.resolve({ success: false, error: { code: 'document-not-loaded', message: 'Annotation not found' } });
  }

  deleteAnnotation(document: PdfDocument, annotationId: string): AsyncEngineResult<void> {
    const index = document.annotations.findIndex(a => a.id === annotationId);
    if (index >= 0) {
      const mutableAnnotations = [...document.annotations];
      mutableAnnotations.splice(index, 1);
      (document as any).annotations = mutableAnnotations;
      (document as any).isModified = true;
      return Promise.resolve({ success: true, value: undefined });
    }
    return Promise.resolve({ success: false, error: { code: 'document-not-loaded', message: 'Annotation not found' } });
  }

  deleteAnnotations(document: PdfDocument, annotationIds: string[]): AsyncEngineResult<void> {
    const mutableAnnotations = [...document.annotations];
    let removed = false;

    for (const id of annotationIds) {
      const index = mutableAnnotations.findIndex(a => a.id === id);
      if (index >= 0) {
        mutableAnnotations.splice(index, 1);
        removed = true;
      }
    }

    if (removed) {
      (document as any).annotations = mutableAnnotations;
      (document as any).isModified = true;
    }

    return Promise.resolve({ success: true, value: undefined });
  }

  createAnnotations(): AsyncEngineResult<Annotation[]> {
    return notImpl('createAnnotations not implemented in MockAnnotationEngine');
  }

  updateAnnotations(): AsyncEngineResult<Annotation[]> {
    return notImpl('updateAnnotations not implemented in MockAnnotationEngine');
  }

  groupAnnotations(): AsyncEngineResult<void> {
    return notImpl('groupAnnotations not implemented in MockAnnotationEngine');
  }

  ungroupAnnotations(): AsyncEngineResult<void> {
    return notImpl('ungroupAnnotations not implemented in MockAnnotationEngine');
  }

  getAnnotationsInGroup(): AsyncEngineResult<Annotation[]> {
    return notImpl('getAnnotationsInGroup not implemented in MockAnnotationEngine');
  }

  importAnnotations(): AsyncEngineResult<Annotation[]> {
    return notImpl('importAnnotations not implemented in MockAnnotationEngine');
  }

  exportAnnotations(): AsyncEngineResult<Uint8Array | string> {
    return notImpl('exportAnnotations not implemented in MockAnnotationEngine');
  }

  getAnnotationHistory(): AsyncEngineResult<Array<{
    timestamp: Date;
    operation: 'create' | 'update' | 'delete';
    user?: string;
    changes: Partial<Annotation>;
  }>> {
    return notImpl('getAnnotationHistory not implemented in MockAnnotationEngine');
  }

  // Sync reads

  getAnnotation(document: PdfDocument, annotationId: string): EngineResult<Annotation> {
    const annotation = document.annotations.find(a => a.id === annotationId);
    if (annotation) {
      return { success: true, value: annotation };
    }
    return { success: false, error: { code: 'document-not-loaded', message: 'Annotation not found' } };
  }

  loadAnnotations(document: PdfDocument): AsyncEngineResult<Annotation[]> {
    return Promise.resolve({ success: true, value: [...document.annotations] });
  }

  getAllAnnotations(document: PdfDocument): EngineResult<Annotation[]> {
    return { success: true, value: [...document.annotations] };
  }

  getAnnotationsForPage(document: PdfDocument, pageIndex: number): EngineResult<Annotation[]> {
    const annotations = document.annotations.filter(a => a.pageIndex === pageIndex);
    return { success: true, value: annotations };
  }

  getAnnotationsByType(document: PdfDocument, type: AnnotationType): EngineResult<Annotation[]> {
    const annotations = document.annotations.filter(a => a.type === type);
    return { success: true, value: annotations };
  }

  findAnnotations(document: PdfDocument, query: Partial<Annotation>): EngineResult<Annotation[]> {
    const keys = Object.keys(query) as Array<keyof Annotation>;
    const annotations = document.annotations.filter(ann =>
      keys.every(key => (ann[key] as unknown) === (query[key] as unknown))
    );
    return { success: true, value: annotations };
  }

  searchAnnotations(document: PdfDocument, searchText: string, caseSensitive = false): EngineResult<Annotation[]> {
    const needle = caseSensitive ? searchText : searchText.toLowerCase();
    const compare = (s: string) => caseSensitive ? s : s.toLowerCase();
    const annotations = document.annotations.filter(ann =>
      ann.contents !== undefined && compare(ann.contents).includes(needle)
    );
    return { success: true, value: annotations };
  }

  getSupportedAnnotationTypes(): AnnotationType[] {
    return ['text', 'highlight', 'underline', 'strikeout', 'freehand'];
  }

  isAnnotationTypeSupported(type: AnnotationType): boolean {
    return ['text', 'highlight', 'underline', 'strikeout', 'freehand'].includes(type);
  }

  getDefaultProperties(type: AnnotationType): Partial<Annotation> {
    return {
      color: type === 'highlight' ? '#FFFF00' : '#000000',
      opacity: 1.0,
      author: 'Mock User'
    };
  }

  validateAnnotation(_annotation: Annotation): EngineResult<boolean> {
    return { success: true, value: true };
  }

  getAnnotationStats(document: PdfDocument): EngineResult<{
    total: number;
    byType: Record<AnnotationType, number>;
    byPage: Record<number, number>;
    modifiedCount: number;
  }> {
    const byType: Record<AnnotationType, number> = {
      text: 0, highlight: 0, underline: 0, strikeout: 0, freehand: 0,
      line: 0, square: 0, circle: 0, polygon: 0, polyline: 0, stamp: 0,
      ink: 0, 'file-attachment': 0, sound: 0, movie: 0, screen: 0,
      widget: 0, 'printer-mark': 0, 'trap-net': 0, watermark: 0,
      '3d': 0, 'rich-media': 0, redaction: 0,
    };
    const byPage: Record<number, number> = {};

    for (const anno of document.annotations) {
      byType[anno.type] = (byType[anno.type] || 0) + 1;
      byPage[anno.pageIndex] = (byPage[anno.pageIndex] || 0) + 1;
    }

    return {
      success: true,
      value: {
        total: document.annotations.length,
        byType,
        byPage,
        modifiedCount: document.isModified ? document.annotations.length : 0
      }
    };
  }
}
