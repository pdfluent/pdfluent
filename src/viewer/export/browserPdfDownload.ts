// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary. The PDFluent application is free to use,
// including for commercial purposes. Redistribution, or extraction or reuse
// of its components (including the embedded PDF engine), requires a licence.
// See https://pdfluent.com/license for terms.

export interface BrowserPdfDownloadOptions {
  fileName?: string | null;
  document?: Pick<Document, 'createElement' | 'body'>;
  url?: Pick<typeof URL, 'createObjectURL' | 'revokeObjectURL'>;
}

export function downloadPdfBytesInBrowser(
  bytes: Uint8Array,
  options: BrowserPdfDownloadOptions = {}
): void {
  if (!(bytes instanceof Uint8Array) || bytes.byteLength === 0) {
    throw new Error('Cannot download empty PDF bytes');
  }

  const doc = options.document ?? globalThis.document;
  const urlApi = options.url ?? globalThis.URL;
  if (!doc || !urlApi?.createObjectURL || !urlApi?.revokeObjectURL) {
    throw new Error('Browser download APIs are unavailable');
  }

  const blobPart = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
  const blob = new Blob([blobPart], { type: 'application/pdf' });
  const objectUrl = urlApi.createObjectURL(blob);
  const anchor = doc.createElement('a');
  anchor.href = objectUrl;
  anchor.download = normalizePdfFileName(options.fileName);
  anchor.style.display = 'none';

  try {
    doc.body.appendChild(anchor);
    anchor.click();
  } finally {
    anchor.remove();
    urlApi.revokeObjectURL(objectUrl);
  }
}

export function normalizePdfFileName(fileName?: string | null): string {
  const fallback = 'document.pdf';
  const raw = (fileName ?? fallback).trim() || fallback;
  const lastSegment = raw.split(/[\\/]/).pop() ?? fallback;
  const withoutQuery = lastSegment.split(/[?#]/)[0] || fallback;
  const safe = withoutQuery.replace(/[<>:"|*]/g, '_');
  return safe.toLowerCase().endsWith('.pdf') ? safe : `${safe}.pdf`;
}
