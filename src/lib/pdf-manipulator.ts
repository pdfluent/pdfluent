// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 PDFluent Contributors

import { PDF } from "@libpdf/core";

export interface PageRange {
  start: number;
  end: number;
}

export async function loadPdf(bytes: Uint8Array): Promise<PDF> {
  return PDF.load(bytes);
}

export async function mergePdfs(pdfBuffers: Uint8Array[]): Promise<Uint8Array> {
  const merged = await PDF.merge(pdfBuffers);
  return merged.save();
}

export async function splitPdf(
  bytes: Uint8Array,
  ranges: PageRange[],
): Promise<Uint8Array[]> {
  const results: Uint8Array[] = [];

  for (const range of ranges) {
    const source = await PDF.load(bytes);
    const pages = source.getPages();
    const totalPages = pages.length;

    for (let i = totalPages - 1; i >= 0; i--) {
      if (i < range.start || i > range.end) {
        source.removePage(i);
      }
    }

    results.push(await source.save());
  }

  return results;
}

export async function rotatePage(
  bytes: Uint8Array,
  pageIndex: number,
  degrees: 0 | 90 | 180 | 270,
): Promise<Uint8Array> {
  const pdf = await PDF.load(bytes);
  const page = pdf.getPage(pageIndex);

  if (!page) {
    throw new Error(`Page index ${pageIndex} out of range`);
  }

  const current = page.rotation;
  page.setRotation(((current + degrees) % 360) as 0 | 90 | 180 | 270);

  return pdf.save();
}

export async function rotateAllPages(
  bytes: Uint8Array,
  degrees: 0 | 90 | 180 | 270,
): Promise<Uint8Array> {
  const pdf = await PDF.load(bytes);

  for (const page of pdf.getPages()) {
    const current = page.rotation;
    page.setRotation(((current + degrees) % 360) as 0 | 90 | 180 | 270);
  }

  return pdf.save();
}

export async function removePage(
  bytes: Uint8Array,
  pageIndex: number,
): Promise<Uint8Array> {
  const pdf = await PDF.load(bytes);
  const pages = pdf.getPages();

  if (pageIndex < 0 || pageIndex >= pages.length) {
    throw new Error(`Page index ${pageIndex} out of range (0-${pages.length - 1})`);
  }

  pdf.removePage(pageIndex);
  return pdf.save();
}

export async function getPageCount(bytes: Uint8Array): Promise<number> {
  const pdf = await PDF.load(bytes);
  return pdf.getPages().length;
}
