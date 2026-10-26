// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary. The PDFluent application is free to use,
// including for commercial purposes. Redistribution, or extraction or reuse
// of its components (including the embedded PDF engine), requires a licence.
// See https://pdfluent.com/license for terms.

import { isTauriRuntime } from '../../lib/tauri-detection';
import { useState, useEffect, useRef, type DragEvent } from 'react';
import { releaseListener } from '../../lib/releaseListener';

const isTauri = isTauriRuntime();

export function useDragDrop(
  handleLoadDocument: (source: string | ArrayBuffer) => Promise<void>,
) {
  const [isDragging, setIsDragging] = useState(false);

  function handleDragOver(e: DragEvent<HTMLDivElement>): void {
    if (isTauri) return;
    e.preventDefault();
    setIsDragging(true);
  }

  function handleDrop(e: DragEvent<HTMLDivElement>): void {
    if (isTauri) return;
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (!file?.name.toLowerCase().endsWith('.pdf')) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const buf = ev.target?.result;
      if (buf instanceof ArrayBuffer) void handleLoadDocument(buf);
    };
    reader.readAsArrayBuffer(file);
  }

  // One listener for the life of the hook; it reads the latest loader.
  const loadRef = useRef(handleLoadDocument);
  loadRef.current = handleLoadDocument;

  // Tauri mode: native OS drag-drop listener (no browser DragEvent fires for native drops)
  useEffect(() => {
    if (!isTauri) return;
    let cancelled = false;
    let unlisten: (() => void) | undefined;
    void (async () => {
      const { getCurrentWebviewWindow } = await import('@tauri-apps/api/webviewWindow');
      if (cancelled) return;
      const stop = await getCurrentWebviewWindow().onDragDropEvent((event) => {
        const payload = event.payload as { type: string; paths?: string[] };
        if (payload.type === 'over') {
          setIsDragging(true);
        } else if (payload.type === 'leave') {
          setIsDragging(false);
        } else if (payload.type === 'drop') {
          setIsDragging(false);
          const pathList = Array.isArray(payload.paths) ? payload.paths : [];
          // Every dropped PDF gets a tab (J-90), in the order dropped, one
          // after the other.
          const pdfs = pathList.filter(p => p.toLowerCase().endsWith('.pdf'));
          if (pdfs.length > 0) {
            void (async () => {
              for (const pdf of pdfs) await loadRef.current(pdf);
            })();
          }
        }
      });
      if (cancelled) releaseListener(stop);
      else unlisten = stop;
    })();
    return () => { cancelled = true; releaseListener(unlisten); };
  }, []);

  return { isDragging, setIsDragging, handleDragOver, handleDrop };
}
