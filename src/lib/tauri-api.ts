// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary and confidential.
// Free for personal, non-commercial use.
// Commercial use requires a valid license.
// See https://pdfluent.com/license for terms.
import { invoke } from "@tauri-apps/api/core";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface PageInfo {
  index: number;
  width_pt: number;
  height_pt: number;
}

export interface DocumentInfo {
  page_count: number;
  pages: PageInfo[];
  title: string | null;
  author: string | null;
  form_type: string;
  xfa_detected?: boolean;
  xfa_rendering_supported?: boolean;
  xfa_notice?: string | null;
}

export interface RenderedPage {
  index: number;
  width: number;
  height: number;
  data_base64: string;
}

// ---------------------------------------------------------------------------
// Commands
// ---------------------------------------------------------------------------

/** Open a PDF file and return its document info. */
export async function openPdf(path: string): Promise<DocumentInfo> {
  return invoke<DocumentInfo>("open_pdf", { path });
}

/** Close the currently open PDF. */
export async function closePdf(): Promise<void> {
  return invoke<void>("close_pdf");
}

/** Get metadata and page list for the currently open PDF. */
export async function getDocumentInfo(): Promise<DocumentInfo> {
  return invoke<DocumentInfo>("get_document_info");
}

/** Render a single page at the given scale (default determined by backend). */
export async function renderPage(
  pageIndex: number,
  scale?: number,
): Promise<RenderedPage> {
  return invoke<RenderedPage>("render_page", {
    pageIndex,
    scale: scale ?? null,
  });
}

/** Render a small thumbnail for a page. */
export async function renderThumbnail(
  pageIndex: number,
): Promise<RenderedPage> {
  return invoke<RenderedPage>("render_thumbnail", { pageIndex });
}

/** Extract the text content of a single page. */
export async function extractPageText(pageIndex: number): Promise<string> {
  return invoke<string>("extract_page_text", { pageIndex });
}

/** Search for a query string across the document; returns matching page indices. */
export async function searchText(query: string): Promise<number[]> {
  return invoke<number[]>("search_text", { query });
}

/** Save the (possibly modified) PDF to the given path. */
export async function savePdf(path: string): Promise<void> {
  return invoke<void>("save_pdf", { path });
}

/** Check whether the document has unsaved modifications. */
export async function hasUnsavedChanges(): Promise<boolean> {
  return invoke<boolean>("has_unsaved_changes");
}

/** Get the file-system path of the currently open PDF, or null if none is open. */
export async function getCurrentPath(): Promise<string | null> {
  return invoke<string | null>("get_current_path");
}

/**
 * Open the current PDF in the system default viewer for printing.
 * Saves a temporary copy first to reflect any in-memory edits.
 */
export async function printDocument(): Promise<void> {
  return invoke<void>("print_document");
}

// ---------------------------------------------------------------------------
// Form fields
// ---------------------------------------------------------------------------

export interface FormFieldInfo {
  name: string;
  field_type: string;
  value: string;
  read_only: boolean;
  required: boolean;
  options: { export: string; display: string }[];
  page_index: number | null;
  rect: [number, number, number, number] | null;
}

export async function getFormFields(): Promise<FormFieldInfo[]> {
  return invoke<FormFieldInfo[]>("get_form_fields");
}

export async function setFormFieldValue(
  name: string,
  value: string,
): Promise<void> {
  return invoke<void>("set_form_field_value", { request: { name, value } });
}

// ---------------------------------------------------------------------------
// PDF manipulation
// ---------------------------------------------------------------------------

export async function mergePdfs(
  paths: string[],
  outputPath: string,
): Promise<void> {
  return invoke<void>("merge_pdfs", { paths, outputPath });
}

export async function splitPdf(
  ranges: string[],
  outputDir: string,
): Promise<string[]> {
  return invoke<string[]>("split_pdf", { ranges, outputDir });
}

export async function rotatePages(
  pageIndices: number[],
  rotation: number,
): Promise<DocumentInfo> {
  return invoke<DocumentInfo>("rotate_pages", { pageIndices, rotation });
}

export async function deletePages(
  pageIndices: number[],
): Promise<DocumentInfo> {
  return invoke<DocumentInfo>("delete_pages", { pageIndices });
}

export async function reorderPages(
  newOrder: number[],
): Promise<DocumentInfo> {
  return invoke<DocumentInfo>("reorder_pages", { newOrder });
}

export interface CompressResult {
  objects_before: number;
  objects_after: number;
  streams_compressed: number;
  duplicates_merged: number;
  unused_removed: number;
}

export async function compressPdf(
  outputPath: string,
): Promise<CompressResult> {
  return invoke<CompressResult>("compress_pdf", { outputPath });
}

export async function addWatermark(
  text: string,
  opacity: number,
): Promise<DocumentInfo> {
  return invoke<DocumentInfo>("add_watermark", { text, opacity });
}

// ---------------------------------------------------------------------------
// Annotations
// ---------------------------------------------------------------------------

export async function addHighlightAnnotation(
  pageIndex: number,
  rects: [number, number, number, number][],
  color: [number, number, number],
): Promise<void> {
  return invoke<void>("add_highlight_annotation", { pageIndex, rects, color });
}

export async function addUnderlineAnnotation(
  pageIndex: number,
  rects: [number, number, number, number][],
  color: [number, number, number],
): Promise<void> {
  return invoke<void>("add_underline_annotation", { pageIndex, rects, color });
}

export async function addCommentAnnotation(
  pageIndex: number,
  x: number,
  y: number,
  text: string,
): Promise<void> {
  return invoke<void>("add_comment_annotation", { pageIndex, x, y, text });
}

export async function addShapeAnnotation(
  pageIndex: number,
  rect: [number, number, number, number],
  shapeType: string,
  color: [number, number, number],
): Promise<void> {
  return invoke<void>("add_shape_annotation", {
    pageIndex,
    rect,
    shapeType,
    color,
  });
}

export async function addInkAnnotation(
  pageIndex: number,
  paths: [number, number][][],
  color: [number, number, number],
  width: number,
): Promise<void> {
  return invoke<void>("add_ink_annotation", {
    pageIndex,
    paths,
    color,
    width,
  });
}

// ---------------------------------------------------------------------------
// Digital signatures
// ---------------------------------------------------------------------------

export interface SignatureVerifyResult {
  field_name: string;
  signer: string | null;
  timestamp: string | null;
  status: string;
  valid: boolean;
}

export async function signPdf(
  certPath: string,
  password: string,
  reason: string,
  outputPath: string,
): Promise<void> {
  return invoke<void>("sign_pdf", { certPath, password, reason, outputPath });
}

export async function verifySignatures(): Promise<SignatureVerifyResult[]> {
  return invoke<SignatureVerifyResult[]>("verify_signatures");
}

// ---------------------------------------------------------------------------
// PDF/A compliance
// ---------------------------------------------------------------------------

export interface PdfAIssue {
  rule: string;
  severity: string;
  message: string;
  location: string | null;
}

export interface PdfAValidationResult {
  compliant: boolean;
  conformance_level: string | null;
  error_count: number;
  warning_count: number;
  issues: PdfAIssue[];
}

export async function validatePdfa(): Promise<PdfAValidationResult> {
  return invoke<PdfAValidationResult>("validate_pdfa");
}

export async function convertToPdfa(
  level: string,
  outputPath: string,
): Promise<PdfAValidationResult> {
  return invoke<PdfAValidationResult>("convert_to_pdfa", {
    level,
    outputPath,
  });
}

// ---------------------------------------------------------------------------
// Encryption
// ---------------------------------------------------------------------------

export async function encryptPdf(
  userPassword: string,
  ownerPassword: string,
  outputPath: string,
): Promise<void> {
  return invoke<void>("encrypt_pdf", { userPassword, ownerPassword, outputPath });
}

export async function decryptPdf(password: string): Promise<void> {
  return invoke<void>("decrypt_pdf", { password });
}

// ---------------------------------------------------------------------------
// Redaction
// ---------------------------------------------------------------------------

export interface RedactReport {
  areas_redacted: number;
  operations_removed: number;
  pages_affected: number;
  metadata_cleaned: boolean;
}

export interface SearchRedactReport {
  matches_found: number;
  areas_redacted: number;
  operations_removed: number;
  pages_affected: number;
  metadata_cleaned: boolean;
}

/** Permanently redact rectangular areas on a page. */
export async function redactText(
  pageIndex: number,
  rects: [number, number, number, number][],
): Promise<RedactReport> {
  return invoke<RedactReport>("redact_text", { pageIndex, rects });
}

/** Search for text and redact all occurrences across the document. */
export async function redactSearch(
  query: string,
): Promise<SearchRedactReport> {
  return invoke<SearchRedactReport>("redact_search", { query });
}

// ---------------------------------------------------------------------------
// OCR
// ---------------------------------------------------------------------------

/**
 * OCR a single page (stub — requires system OCR engine).
 * Returns an error string indicating OCR is not yet available.
 */
export async function ocrPage(pageIndex: number): Promise<string> {
  return invoke<string>("ocr_page", { pageIndex });
}

// ---------------------------------------------------------------------------
// Image extraction
// ---------------------------------------------------------------------------

export interface ExtractedImageInfo {
  page: number;
  width: number;
  height: number;
  color_space: string;
  path: string;
}

/** Extract all images from the PDF and save them to the output directory. */
export async function extractImages(
  outputDir: string,
): Promise<ExtractedImageInfo[]> {
  return invoke<ExtractedImageInfo[]>("extract_images", { outputDir });
}

// ---------------------------------------------------------------------------
// Page export as image
// ---------------------------------------------------------------------------

/** Export a single page as an image file (PNG or JPEG). */
export async function exportPageAsImage(
  pageIndex: number,
  format: string,
  outputPath: string,
): Promise<void> {
  return invoke<void>("export_page_as_image", {
    pageIndex,
    format,
    outputPath,
  });
}

// ---------------------------------------------------------------------------
// PDF to DOCX conversion
// ---------------------------------------------------------------------------

/** Convert the current PDF to DOCX format and save to the output path. */
export async function convertToDocx(outputPath: string): Promise<void> {
  return invoke<void>("convert_to_docx", { outputPath });
}

// ---------------------------------------------------------------------------
// E-invoicing
// ---------------------------------------------------------------------------

export interface InvoiceLineItem {
  id: string;
  description: string;
  quantity: number;
  unit_code: string;
  unit_price: number;
  line_total: number;
  tax_rate: number;
  tax_category: string;
}

export interface InvoiceParty {
  name: string;
  street: string | null;
  city: string | null;
  postal_code: string | null;
  country_code: string;
  tax_id: string | null;
  registration_id: string | null;
  email: string | null;
}

export interface InvoiceData {
  profile: string;
  invoice_number: string;
  type_code: string;
  issue_date: string;
  seller_name: string;
  buyer_name: string;
  currency: string;
  tax_basis_total: number;
  tax_total: number;
  grand_total: number;
  due_payable: number;
  line_items: InvoiceLineItem[];
  seller: InvoiceParty;
  buyer: InvoiceParty;
  payment_terms: string | null;
  buyer_reference: string | null;
}

/** Extract ZUGFeRD/Factur-X invoice data from the document, if present. */
export async function extractInvoiceData(): Promise<InvoiceData | null> {
  return invoke<InvoiceData | null>("extract_invoice_data");
}

export interface InvoiceValidationIssue {
  rule: string;
  severity: string;
  message: string;
}

export interface InvoiceValidationResult {
  valid: boolean;
  profile: string;
  error_count: number;
  warning_count: number;
  issues: InvoiceValidationIssue[];
}

/** Validate the embedded ZUGFeRD/Factur-X invoice XML against EN 16931 rules. */
export async function validateInvoice(): Promise<InvoiceValidationResult | null> {
  return invoke<InvoiceValidationResult | null>("validate_invoice");
}

// ---------------------------------------------------------------------------
// Legacy stubs (kept for frontend compatibility, will be removed)
// ---------------------------------------------------------------------------

export type StorageProviderKind =
  | "local"
  | "s3"
  | "azblob"
  | "gcs"
  | "onedrive"
  | "managed_s3";

export interface StorageProfilePayload {
  id: string;
  name: string;
  kind: StorageProviderKind;
  root?: string;
  endpoint?: string;
  region?: string;
  bucket?: string;
  container?: string;
  access_key_id?: string;
  secret_access_key?: string;
  account_name?: string;
  account_key?: string;
  service_account_json?: string;
}

export interface StorageValidationResult {
  ok: boolean;
  provider: string;
  message: string;
}

export interface PaddleOcrRequestPayload {
  image_base64: string;
  language: string;
  include_structure: boolean;
  preprocess_mode: "off" | "auto" | "manual";
  preprocess_steps?: Array<"deskew" | "denoise" | "contrast">;
  auto_confidence_threshold?: number;
}

export interface PaddleOcrWord {
  text: string;
  confidence: number;
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

export interface PaddleOcrStructureBlock {
  kind: string;
  text: string;
  confidence: number;
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

export interface PaddleOcrResponse {
  engine: string;
  language: string;
  words: PaddleOcrWord[];
  text: string;
  structure_blocks: PaddleOcrStructureBlock[];
  average_confidence: number;
  preprocessing_applied: boolean;
  preprocessing_mode: "off" | "auto" | "manual";
  preprocessing_steps: Array<"deskew" | "denoise" | "contrast">;
  preprocessing_reason: string;
  quality_metrics: {
    contrast_stddev: number;
    sharpness_laplacian_var: number;
    skew_degrees: number;
  };
}

export async function validateStorageProfile(
  _profile: StorageProfilePayload,
): Promise<StorageValidationResult> {
  throw new Error("Storage validation not yet implemented in XFA SDK backend");
}

export async function runPaddleOcr(
  payload: PaddleOcrRequestPayload,
): Promise<PaddleOcrResponse> {
  return invoke<PaddleOcrResponse>("run_paddle_ocr", { payload });
}
