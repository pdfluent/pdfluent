// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 PDFluent Contributors

import { invoke } from "@tauri-apps/api/core";

export interface PageInfo {
  index: number;
  width_pt: number;
  height_pt: number;
}

export interface DocumentInfo {
  page_count: number;
  pages: PageInfo[];
}

export interface RenderedPage {
  index: number;
  width: number;
  height: number;
  data_base64: string;
}

export async function openPdf(path: string): Promise<DocumentInfo> {
  return invoke<DocumentInfo>("open_pdf", { path });
}

export async function renderPage(
  pageIndex: number,
  scale?: number,
): Promise<RenderedPage> {
  return invoke<RenderedPage>("render_page", {
    pageIndex,
    scale: scale ?? null,
  });
}

export async function getDocumentInfo(): Promise<DocumentInfo> {
  return invoke<DocumentInfo>("get_document_info");
}

export async function closePdf(): Promise<void> {
  return invoke<void>("close_pdf");
}
