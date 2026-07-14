// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary. The PDFluent application is free to use,
// including for commercial purposes. Redistribution, or extraction or reuse
// of its components (including the embedded PDF engine), requires a licence.
// See https://pdfluent.com/license for terms.

import { useEffect, useRef } from 'react';
import type { PdfDocument } from '../../core/document';

type RenderTelemetryState = 'native-tauri' | 'browser-test-main-thread';

export interface RenderFallbackHandle {
  preregisterDocument(doc: PdfDocument, openPipeline: Promise<void>): void;
  openDocument(doc: PdfDocument, bytes: Uint8Array): Promise<void>;
  renderPage(doc: PdfDocument, pageIndex: number, scale: number): Promise<ImageBitmap>;
  closeDocument(doc: PdfDocument): void;
  terminate(): void;
}

function syncRenderNamespace(state: RenderTelemetryState, fallbackReasons: string[] = []): void {
  if (typeof window === 'undefined') return;
  (window as unknown as Record<string, unknown>).__PDFLUENT_RENDER__ = {
    state,
    nativeCommandRenderCount: state === 'native-tauri' ? null : 0,
    mainThreadRenderCount: fallbackReasons.length,
    fallbackReasons: [...fallbackReasons],
  };
}

const fallbackReasons: string[] = [];

export function recordFallback(reason: string): void {
  fallbackReasons.push(reason);
  syncRenderNamespace('browser-test-main-thread', fallbackReasons);
}

export function useRenderTelemetry(): RenderFallbackHandle | null {
  const handleRef = useRef<RenderFallbackHandle | null>(null);

  useEffect(() => {
    handleRef.current = null;
    syncRenderNamespace('native-tauri');
    return undefined;
  }, []);

  return handleRef.current;
}
