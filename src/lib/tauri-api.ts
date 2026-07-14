// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary. The PDFluent application is free to use,
// including for commercial purposes. Redistribution, or extraction or reuse
// of its components (including the embedded PDF engine), requires a licence.
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
  active_content?: ActiveContentInfo | null;
}

export interface ActiveContentInfo {
  has_active_content: boolean;
  has_javascript: boolean;
  has_open_action: boolean;
  has_additional_actions: boolean;
  has_launch_actions: boolean;
  has_submit_form: boolean;
  has_uri_actions: boolean;
  has_xfa: boolean;
  flags: string[];
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
// First-class AcroForm model (mirrors pdf_engine::FormFieldModelDto / the SDK
// `build_form_model` contract). Wire shape is protected by the
// formModelWireContract drift-guard — keep these in sync with the Rust DTO.
// ---------------------------------------------------------------------------

export interface FormFieldOptionDto {
  export: string;
  display: string;
}

export type FormFieldKindDto =
  | { type: "text"; multiline: boolean; comb: boolean; password: boolean }
  | { type: "checkbox"; onState: string; checked: boolean }
  | { type: "radioGroup"; options: string[] }
  | { type: "comboBox"; editable: boolean; options: FormFieldOptionDto[] }
  | { type: "listBox"; multiSelect: boolean; options: FormFieldOptionDto[] }
  | { type: "pushButton" }
  | { type: "signature" };

export interface WidgetModelDto {
  pageIndex: number | null;
  /** [x0, y0, x1, y1] in PDF user space (origin bottom-left). */
  rect: [number, number, number, number];
  onState: string | null;
  appearanceState: string | null;
}

export interface DaInfoDto {
  fontName: string | null;
  /** Font size in points; 0 means auto-size. */
  fontSize: number;
  color: number[];
}

export interface FormFieldModelDto {
  name: string;
  kind: FormFieldKindDto;
  value: string | null;
  /** Array of selected export values; only set for multi-select list boxes. */
  selectedValues: string[] | null;
  defaultValue: string | null;
  tooltip: string | null;
  readOnly: boolean;
  required: boolean;
  maxLen: number | null;
  /** 0 = left, 1 = centered, 2 = right. */
  quadding: number;
  da: DaInfoDto;
  widgets: WidgetModelDto[];
}

/** Typed write request matching pdf_engine::FormWriteRequest (serde tag "kind"). */
export type FormWriteRequest =
  | { kind: "text"; name: string; value: string }
  | { kind: "checkbox"; name: string; checked: boolean }
  | { kind: "radio"; name: string; export: string }
  | { kind: "choice"; name: string; value: string }
  | { kind: "multiChoice"; name: string; values: string[] };

export async function getFormModel(): Promise<FormFieldModelDto[]> {
  return invoke<FormFieldModelDto[]>("get_form_model");
}

/** A /Link annotation carrying a /URI action (mirrors pdf_engine::LinkAnnotationDto). */
export interface LinkAnnotationDto {
  pageIndex: number;
  /** [x0, y0, x1, y1] in PDF user space (origin bottom-left). */
  rect: [number, number, number, number];
  uri: string;
}

export async function getLinkAnnotations(): Promise<LinkAnnotationDto[]> {
  return invoke<LinkAnnotationDto[]>("get_link_annotations");
}

/** Apply a typed value through the SDK writeback chain (/V + /AS + /AP). */
export async function setFormValue(request: FormWriteRequest): Promise<void> {
  return invoke<void>("set_form_value", { request });
}

// ---------------------------------------------------------------------------
// XFA form model (Phase 1 fill). Distinct from the AcroForm model above: XFA
// rects are in page space with a TOP-LEFT origin (y grows downward), so the
// XFA overlay maps them WITHOUT the y-flip the AcroForm overlay applies.
// Mirrors pdf_engine::Xfa*Dto (serde camelCase). Keep in sync with the Rust DTOs.
// ---------------------------------------------------------------------------

export type XfaFieldType =
  | "text"
  | "checkbox"
  | "radioGroup"
  | "button"
  | "dropdown"
  | "signature"
  | "dateTime"
  | "numeric"
  | "password"
  | "image"
  | "barcode";

/** Rectangle in XFA page space: points, top-left origin (y grows downward). */
export interface XfaRectDto {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface XfaFieldOptionDto {
  display: string;
  save: string;
}

/** One layouted widget occurrence of an XFA field. */
export interface XfaWidgetDto {
  /** 0-based page index in the XFA layout. */
  page: number;
  rect: XfaRectDto;
  /** For radio groups: the on-value this member widget asserts. */
  onValue: string | null;
}

/** One logical XFA form field. */
export interface XfaFieldDto {
  name: string;
  somPath: string;
  fieldType: XfaFieldType;
  value: string;
  readOnly: boolean;
  required: boolean;
  multiline: boolean;
  hidden: boolean;
  options: XfaFieldOptionDto[];
  onValue: string | null;
  offValue: string | null;
  /** First layout page (0-based); null when not in the current layout. */
  page: number | null;
  rect: XfaRectDto | null;
  widgets: XfaWidgetDto[];
  boundToData: boolean;
  bindNone: boolean;
}

export interface XfaFormModelDto {
  /** XFA layout page count. May exceed the rendered page count when the layout
   *  over-produces empty `occur` instance pages (flatten suppresses those), so
   *  the overlay bounds placement by the document's rendered page count. */
  pageCount: number;
  fields: XfaFieldDto[];
}

/** Typed XFA write request (mirrors pdf_engine::XfaWriteRequest, tag "kind"). */
export type XfaWriteRequest =
  | { kind: "text"; name: string; value: string }
  | { kind: "checkbox"; name: string; checked: boolean }
  | { kind: "radio"; name: string; export: string };

/** Enumerate the XFA form model (layout page count + fields). */
export async function xfaFormModel(): Promise<XfaFormModelDto> {
  return invoke<XfaFormModelDto>("xfa_form_model");
}

/** Set one XFA field value (persists into the datasets packet on save). */
export async function setXfaFieldValue(request: XfaWriteRequest): Promise<void> {
  return invoke<void>("set_xfa_field_value", { request });
}

/** One field/subform whose presence changed during a Phase 2 interactive commit. */
export interface XfaPresenceChangeDto {
  name: string;
  /** Presence before the commit: visible|hidden|invisible|inactive. */
  before: string;
  /** Presence after re-layout. */
  after: string;
}

/** Result of a Phase 2 interactive commit (commit_xfa_field_value). */
export interface XfaCommitResultDto {
  rawValue: string;
  persistedToDatasets: boolean;
  /** True when the SDK commit loop ran change/click+calculate scripts (Phase 2);
   *  false in the Phase 1 fallback (xfa-interactive feature off). */
  interactive: boolean;
  scriptsExecuted: number;
  pageCountBefore: number;
  pageCountAfter: number;
  presenceChanges: XfaPresenceChangeDto[];
  /** Refreshed field model after the commit (revealed/hidden fields, geometry). */
  model: XfaFormModelDto;
}

/**
 * Phase 2 interactive XFA commit: routes through the SDK commit loop
 * (change/click + calculate scripts → re-layout → presence changes) when the
 * backend `xfa-interactive` feature is compiled, else falls back to the Phase 1
 * value write. Returns the outcome plus the refreshed model.
 */
export async function commitXfaFieldValue(
  request: XfaWriteRequest,
): Promise<XfaCommitResultDto> {
  return invoke<XfaCommitResultDto>("commit_xfa_field_value", { request });
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
  strokeWidth?: number,
): Promise<void> {
  return invoke<void>("add_shape_annotation", {
    pageIndex,
    rect,
    shapeType,
    color,
    strokeWidth,
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

export interface OcrRuntimeStatus {
  available: boolean;
  python_path: string | null;
  python_source: string | null;
  bridge_path: string;
  bridge_available: boolean;
  missing_packages: string[];
  diagnostics: string[];
  remediation: string;
  package_versions: Record<string, string>;
}

export async function validateStorageProfile(
  _profile: StorageProfilePayload,
): Promise<StorageValidationResult> {
  throw new Error("Storage validation not yet implemented in XFA SDK backend");
}

export async function getOcrStatus(): Promise<OcrRuntimeStatus> {
  return invoke<OcrRuntimeStatus>("get_ocr_status");
}

export async function runPaddleOcr(
  payload: PaddleOcrRequestPayload,
): Promise<PaddleOcrResponse> {
  return invoke<PaddleOcrResponse>("run_paddle_ocr", { payload });
}

// ---------------------------------------------------------------------------
// TextSpanInfo — SDK canonical wire DTO
// ---------------------------------------------------------------------------

/**
 * Vertical font metrics from the embedded font (/1000 em units).
 * Mirrors `pdf_engine::text::FontMetrics`.
 */
export interface FontMetricsInfo {
  ascent: number;
  descent: number;
  /** Omitted when not present in the font. */
  capHeight?: number;
  /** Omitted when not present in the font. */
  xHeight?: number;
}

/**
 * Raw serde JSON of the SDK's `pdf_engine::TextSpanInfo` as returned by
 * `get_page_text_spans`.
 *
 * All field names and optionality mirror the Rust serde representation exactly.
 * Note: `font_size` uses snake_case (no serde rename); all other metadata keys
 * are camelCase via `#[serde(rename = ...)]`.
 *
 * Do NOT add fields here unless they are also present in the Rust struct.
 * The drift-guard test in `src/lib/__tests__/textSpanWireContract.test.ts`
 * asserts this list equals the SDK wire contract.
 */
export interface TextSpanInfo {
  text: string;
  x: number;
  y: number;
  width: number;
  height: number;
  /** Snake_case: no serde rename on the Rust side. */
  font_size: number;
  /** PostScript font name with subset prefix stripped. Absent when unknown. */
  fontName?: string;
  /** Bold flag derived from font descriptor or PostScript name. */
  isBold: boolean;
  /** Italic flag derived from font descriptor or PostScript name. */
  isItalic: boolean;
  /** RGB fill color [0.0–1.0]. Absent for pattern/shading paints. */
  color?: [number, number, number];
  /** Whether glyph widths came from real font metrics or an estimate. */
  widthSource: 'Metric' | 'Estimate';
  /** Per-glyph bounding boxes [x0, y0, x1, y1] (y up). Absent when empty. */
  charBounds?: [number, number, number, number][];
  /** Full affine transform [a,b,c,d,e,f] of the span's first glyph. Absent when not captured. */
  transform?: [number, number, number, number, number, number];
  /** Numeric font weight (~100–900) from embedded font data. Absent when unavailable. */
  fontWeight?: number;
  /** Serif flag from embedded font data. Absent when unavailable. */
  isSerif?: boolean;
  /** Monospace flag from embedded font data. Absent when unavailable. */
  isMonospace?: boolean;
  /** Coarse PDF text render mode: 0=fill, 1=stroke, 3=invisible. Absent when default. */
  renderMode?: number;
  /** Vertical font metrics from the embedded font. Absent when unavailable. */
  fontMetrics?: FontMetricsInfo;
}

/** Fetch positioned text spans for a single page (SDK extraction path). */
export async function getPageTextSpans(pageIndex: number): Promise<TextSpanInfo[]> {
  return invoke<TextSpanInfo[]>('get_page_text_spans', { pageIndex });
}
