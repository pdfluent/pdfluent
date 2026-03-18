// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary and confidential.
// Free for personal, non-commercial use.
// Commercial use requires a valid license.
// See https://pdfluent.com/license for terms.

import { useState, useEffect, type DragEvent } from 'react';

const isTauri = typeof window !== 'undefined' && '__TAURI__' in window;

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

  // Tauri mode: native OS drag-drop listener (no browser DragEvent fires for native drops)
  useEffect(() => {
    if (!isTauri) return;
    let unlisten: (() => void) | undefined;
    void (async () => {
      const { getCurrentWebviewWindow } = await import('@tauri-apps/api/webviewWindow');
      unlisten = await getCurrentWebviewWindow().onDragDropEvent((event) => {
        const payload = event.payload as { type: string; paths?: string[] };
        if (payload.type === 'over') {
          setIsDragging(true);
        } else if (payload.type === 'leave') {
          setIsDragging(false);
        } else if (payload.type === 'drop') {
          setIsDragging(false);
          const pathList = Array.isArray(payload.paths) ? payload.paths : [];
          const pdf = pathList.find(p => p.toLowerCase().endsWith('.pdf'));
          if (pdf) void handleLoadDocument(pdf);
        }
      });
    })();
    return () => { unlisten?.(); };
  }, [handleLoadDocument]);

  return { isDragging, setIsDragging, handleDragOver, handleDrop };
}
