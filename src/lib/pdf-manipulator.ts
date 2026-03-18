// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary and confidential.
// Free for personal, non-commercial use.
// Commercial use requires a valid license.
// See https://pdfluent.com/license for terms.
import {
  P12Signer,
  PDF,
  StandardFonts,
  degrees,
  layoutText,
  rgb,
  white,
} from "@libpdf/core";
import type { Point, Rect } from "@libpdf/core";
import type { FieldValue } from "@libpdf/core";

export interface PageRange {
  start: number;
  end: number;
}

export interface FormFieldDefinition {
  name: string;
  type: string;
  value: string | boolean | string[] | null;
  options: string[];
}

export interface SignPdfPayload {
  pageIndex: number;
  rect: PdfRect;
  p12Bytes: Uint8Array;
  password: string;
  signerName: string;
  reason?: string;
  location?: string;
  contactInfo?: string;
}

export type AnnotationTool =
  | "none"
  | "highlight"
  | "comment"
  | "free_text"
  | "stamp"
  | "pen"
  | "underline"
  | "strikeout"
  | "callout"
  | "measurement"
  | "rectangle"
  | "circle"
  | "line"
  | "arrow";

export type HighlightColor = "yellow" | "green" | "blue" | "pink";

export interface PdfPoint {
  x: number;
  y: number;
}

export interface PdfRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface EditableTextLine {
  lineIndex: number;
  text: string;
  bbox: PdfRect;
  fontName: string;
  fontSize: number;
}

export interface RedactionRegion extends PdfRect {
  label?: string;
}

export interface RedactionOptions {
  sanitizeMetadata?: boolean;
}

export interface WatermarkOptions {
  text: string;
  opacity?: number;
  rotationDegrees?: number;
  fontSize?: number;
}

export interface HeaderFooterOptions {
  headerText?: string;
  footerText?: string;
  showPageNumbers?: boolean;
  pageNumberTemplate?: string;
  batesPrefix?: string;
  batesStart?: number;
  fontSize?: number;
  marginX?: number;
  marginTop?: number;
  marginBottom?: number;
}

export interface SignatureFieldReport {
  fieldName: string;
  signed: boolean;
}

export interface SignatureByteRangeReport {
  raw: [number, number, number, number];
  intact: boolean;
  reason: string;
}

export interface SignatureDssReport {
  present: boolean;
  certificateCount: number;
  ocspCount: number;
  crlCount: number;
  vriEntryCount: number;
}

export interface SignatureVerificationReport {
  fields: SignatureFieldReport[];
  byteRanges: SignatureByteRangeReport[];
  signedFieldCount: number;
  intactByteRangeCount: number;
  detectedSubFilters: string[];
  signingTimeHints: string[];
  timestampTokenCount: number;
  documentTimestampCount: number;
  estimatedCertificateCount: number;
  dss: SignatureDssReport;
  hasRevocationData: boolean;
  hasLtvData: boolean;
  warnings: Array<{
    code:
      | "no_signatures"
      | "unsigned_fields_present"
      | "invalid_byte_ranges"
      | "partial_byte_ranges"
      | "orphaned_byte_ranges"
      | "missing_subfilter"
      | "legacy_subfilter"
      | "missing_timestamp"
      | "missing_certificate_chain"
      | "missing_revocation_data"
      | "missing_ltv_data";
    severity: "info" | "warning" | "critical";
    detail: string;
  }>;
  enterpriseReady: boolean;
  allSignedFieldsHaveContents: boolean;
}

export type FormFieldKind =
  | "text"
  | "checkbox"
  | "radio"
  | "dropdown"
  | "listbox";

export interface CreateFormFieldPayload {
  pageIndex: number;
  name: string;
  kind: FormFieldKind;
  rect: PdfRect;
  options?: string[];
  defaultValue?: string | string[] | boolean | null;
  multiline?: boolean;
}

export interface ImagePlacementOptions {
  opacity?: number;
  rotationDegrees?: number;
  layerOrder?: "front" | "back";
}

export interface OcrWordBox {
  text: string;
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  confidence?: number;
}

export interface OcrPageLayerInput {
  pageIndex: number;
  words: OcrWordBox[];
  renderedWidth: number;
  renderedHeight: number;
}

export interface ReplaceTextMatchesOptions {
  caseSensitive?: boolean;
}

export interface ReplaceTextMatchesResult {
  bytes: Uint8Array;
  replacedLines: number;
}

export interface ExtractedDocumentTextPage {
  pageIndex: number;
  text: string;
  lines: string[];
}

export interface PdfAValidationReport {
  compliant: boolean;
  checks: Array<{
    rule: string;
    pass: boolean;
    detail: string;
  }>;
}

export interface PdfXValidationReport {
  compliant: boolean;
  checks: Array<{
    rule: string;
    pass: boolean;
    detail: string;
  }>;
}

export interface PdfUaValidationReport {
  compliant: boolean;
  checks: Array<{
    rule: string;
    pass: boolean;
    detail: string;
  }>;
}

export type PdfOptimizationProfile = "screen" | "print" | "high_quality" | "custom";

export interface PdfOptimizationCustomOptions {
  subsetFonts: boolean;
  compressStreams: boolean;
  compressionThreshold: number;
}

export interface PdfPageVisualMetrics {
  widthPt: number;
  heightPt: number;
  rotation: number;
}

export interface PdfOptimizationReport {
  profile: PdfOptimizationProfile;
  beforeBytes: number;
  afterBytes: number;
  changedBytes: number;
  options: PdfOptimizationCustomOptions;
}

export interface PdfComparePageDifference {
  page: number;
  kind: "missing_in_base" | "missing_in_target" | "text_changed" | "visual_changed";
  baseTextLength: number;
  targetTextLength: number;
  baseVisual: PdfPageVisualMetrics | null;
  targetVisual: PdfPageVisualMetrics | null;
  baseSnippet: string;
  targetSnippet: string;
}

export interface PdfCompareReport {
  basePageCount: number;
  targetPageCount: number;
  equalTextPages: number;
  changedTextPages: number;
  equalVisualPages: number;
  changedVisualPages: number;
  differences: PdfComparePageDifference[];
}

export type AnnotationPayload =
  | {
      type: "highlight";
      pageIndex: number;
      rect: PdfRect;
      color: HighlightColor;
      contents?: string;
    }
  | {
      type: "comment";
      pageIndex: number;
      rect: PdfRect;
      contents: string;
    }
  | {
      type: "free_text";
      pageIndex: number;
      rect: PdfRect;
      contents: string;
    }
  | {
      type: "stamp";
      pageIndex: number;
      rect: PdfRect;
      contents: string;
    }
  | {
      type: "pen";
      pageIndex: number;
      paths: PdfPoint[][];
      contents?: string;
    }
  | {
      type: "underline";
      pageIndex: number;
      rect: PdfRect;
      contents?: string;
    }
  | {
      type: "strikeout";
      pageIndex: number;
      rect: PdfRect;
      contents?: string;
    }
  | {
      type: "callout";
      pageIndex: number;
      start: PdfPoint;
      end: PdfPoint;
      contents?: string;
    }
  | {
      type: "measurement";
      pageIndex: number;
      start: PdfPoint;
      end: PdfPoint;
      contents?: string;
    }
  | {
      type: "rectangle";
      pageIndex: number;
      rect: PdfRect;
      contents?: string;
    }
  | {
      type: "circle";
      pageIndex: number;
      rect: PdfRect;
      contents?: string;
    }
  | {
      type: "line";
      pageIndex: number;
      start: PdfPoint;
      end: PdfPoint;
      arrow: boolean;
      contents?: string;
    };

const highlightColors = {
  yellow: rgb(1, 0.94, 0.35),
  green: rgb(0.63, 0.89, 0.52),
  blue: rgb(0.62, 0.76, 1),
  pink: rgb(1, 0.72, 0.86),
} satisfies Record<HighlightColor, ReturnType<typeof rgb>>;

interface ExtractedLineShape {
  text: string;
  bbox: PdfRect;
  spans: Array<{
    fontSize: number;
    fontName: string;
  }>;
}

interface ExtractedPageShape {
  lines: ExtractedLineShape[];
}

type StandardFontValue = (typeof StandardFonts)[keyof typeof StandardFonts];

function toRect(rect: PdfRect): Rect {
  return {
    x: rect.x,
    y: rect.y,
    width: rect.width,
    height: rect.height,
  };
}

function toPoint(point: PdfPoint): Point {
  return {
    x: point.x,
    y: point.y,
  };
}

function getPageOrThrow(pdf: PDF, pageIndex: number) {
  const page = pdf.getPage(pageIndex);
  if (!page) {
    throw new Error(`Page index ${pageIndex} out of range`);
  }
  return page;
}

function resolveTextFont(fontName: string): StandardFontValue {
  const normalized = fontName.toLowerCase();

  if (normalized.includes("times")) {
    if (normalized.includes("bold") && normalized.includes("italic")) {
      return StandardFonts.TimesBoldItalic;
    }
    if (normalized.includes("bold")) {
      return StandardFonts.TimesBold;
    }
    if (normalized.includes("italic") || normalized.includes("oblique")) {
      return StandardFonts.TimesItalic;
    }
    return StandardFonts.TimesRoman;
  }

  if (normalized.includes("courier")) {
    if (normalized.includes("bold") && normalized.includes("oblique")) {
      return StandardFonts.CourierBoldOblique;
    }
    if (normalized.includes("bold")) {
      return StandardFonts.CourierBold;
    }
    if (normalized.includes("italic") || normalized.includes("oblique")) {
      return StandardFonts.CourierOblique;
    }
    return StandardFonts.Courier;
  }

  if (normalized.includes("bold") && normalized.includes("italic")) {
    return StandardFonts.HelveticaBoldOblique;
  }
  if (normalized.includes("bold")) {
    return StandardFonts.HelveticaBold;
  }
  if (normalized.includes("italic") || normalized.includes("oblique")) {
    return StandardFonts.HelveticaOblique;
  }

  return StandardFonts.Helvetica;
}

function resolveTextFontSafe(fontName: string): StandardFontValue {
  try {
    return resolveTextFont(fontName);
  } catch {
    return StandardFonts.Helvetica;
  }
}

function clampOpacity(
  value: number | undefined,
  fallback: number = 0.2,
  max: number = 0.95,
): number {
  if (value === undefined || Number.isNaN(value)) return fallback;
  return Math.max(0, Math.min(max, value));
}

function normalizeLayerOrder(
  layerOrder?: "front" | "back",
): "front" | "back" {
  return layerOrder === "back" ? "back" : "front";
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function replaceTextOccurrences(
  source: string,
  query: string,
  replacement: string,
  caseSensitive: boolean,
): string {
  if (query.length === 0) {
    return source;
  }

  const pattern = new RegExp(escapeRegex(query), caseSensitive ? "g" : "gi");
  return source.replace(pattern, replacement);
}

function extractLeadingOrderNumber(title: string): number | null {
  const match = /^\s*(\d+)\./.exec(title);
  if (!match) return null;
  const numericText = match[1];
  if (!numericText) return null;
  return Number.parseInt(numericText, 10);
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

export async function duplicatePdfPage(
  bytes: Uint8Array,
  pageIndex: number,
): Promise<Uint8Array> {
  const source = await PDF.load(bytes);
  const totalPages = source.getPages().length;

  if (pageIndex < 0 || pageIndex >= totalPages) {
    throw new Error(`Page index ${pageIndex} out of range (0-${totalPages - 1})`);
  }

  const orderedPages = Array.from({ length: totalPages }, (_, index) => index);
  orderedPages.splice(pageIndex + 1, 0, pageIndex);

  const duplicated = PDF.create();
  await duplicated.copyPagesFrom(source, orderedPages);
  return duplicated.save();
}

export async function insertBlankPageAfter(
  bytes: Uint8Array,
  pageIndex: number,
): Promise<Uint8Array> {
  const source = await PDF.load(bytes);
  const sourcePages = source.getPages();
  const totalPages = sourcePages.length;

  if (totalPages === 0) {
    const empty = PDF.create();
    empty.addPage({ size: "letter" });
    return empty.save();
  }

  if (pageIndex < 0 || pageIndex >= totalPages) {
    throw new Error(`Page index ${pageIndex} out of range (0-${totalPages - 1})`);
  }

  const insertIndex = Math.min(totalPages, pageIndex + 1);
  const referencePage = sourcePages[Math.min(pageIndex, totalPages - 1)];
  if (!referencePage) {
    throw new Error("Reference page for blank insert is missing.");
  }

  const inserted = PDF.create();
  const addBlankPage = () => {
    const blank = inserted.addPage({
      width: Math.max(36, referencePage.width),
      height: Math.max(36, referencePage.height),
    });
    blank.setRotation(referencePage.rotation);
  };

  for (let index = 0; index < totalPages; index += 1) {
    if (index === insertIndex) {
      addBlankPage();
    }
    await inserted.copyPagesFrom(source, [index]);
  }

  if (insertIndex === totalPages) {
    addBlankPage();
  }

  return inserted.save();
}

export async function replacePageWithExternalPage(
  bytes: Uint8Array,
  pageIndex: number,
  replacementBytes: Uint8Array,
  replacementPageIndex: number,
): Promise<Uint8Array> {
  const source = await PDF.load(bytes);
  const sourcePages = source.getPages();
  const sourcePageCount = sourcePages.length;

  if (sourcePageCount === 0) {
    throw new Error("Source PDF has no pages to replace.");
  }

  if (pageIndex < 0 || pageIndex >= sourcePageCount) {
    throw new Error(`Page index ${pageIndex} out of range (0-${sourcePageCount - 1})`);
  }

  const replacement = await PDF.load(replacementBytes);
  const replacementPages = replacement.getPages();
  const replacementPageCount = replacementPages.length;

  if (replacementPageCount === 0) {
    throw new Error("Replacement PDF has no pages.");
  }

  if (replacementPageIndex < 0 || replacementPageIndex >= replacementPageCount) {
    throw new Error(
      `Replacement page index ${replacementPageIndex} out of range (0-${replacementPageCount - 1})`,
    );
  }

  const merged = PDF.create();

  for (let index = 0; index < sourcePageCount; index += 1) {
    if (index === pageIndex) {
      await merged.copyPagesFrom(replacement, [replacementPageIndex]);
      continue;
    }
    await merged.copyPagesFrom(source, [index]);
  }

  return merged.save();
}

export async function getPageCount(bytes: Uint8Array): Promise<number> {
  const pdf = await PDF.load(bytes);
  return pdf.getPages().length;
}

export async function addAnnotation(
  bytes: Uint8Array,
  payload: AnnotationPayload,
): Promise<Uint8Array> {
  const pdf = await PDF.load(bytes);
  const page = getPageOrThrow(pdf, payload.pageIndex);

  if (payload.type === "highlight") {
    page.addHighlightAnnotation({
      rect: toRect(payload.rect),
      color: highlightColors[payload.color],
      contents: payload.contents,
    });
  } else if (payload.type === "comment") {
    page.addTextAnnotation({
      rect: toRect(payload.rect),
      contents: payload.contents,
      color: rgb(1, 0.92, 0.3),
      icon: "Comment",
      open: false,
    });
  } else if (payload.type === "free_text") {
    page.addTextAnnotation({
      rect: toRect(payload.rect),
      contents: payload.contents,
      color: rgb(0.19, 0.42, 0.99),
      icon: "Note",
      open: false,
    });
  } else if (payload.type === "stamp") {
    page.addSquareAnnotation({
      rect: toRect(payload.rect),
      color: rgb(0.15, 0.42, 0.88),
      borderWidth: 2,
      contents: `[STAMP] ${payload.contents}`,
    });
  } else if (payload.type === "pen") {
    page.addInkAnnotation({
      paths: payload.paths.map((path) => path.map((point) => toPoint(point))),
      color: rgb(0.95, 0.45, 0.2),
      width: 2,
      contents: payload.contents,
    });
  } else if (payload.type === "underline") {
    page.addHighlightAnnotation({
      rect: toRect(payload.rect),
      color: rgb(0.36, 0.67, 0.98),
      contents: payload.contents || "Underline annotation",
    });
  } else if (payload.type === "strikeout") {
    page.addHighlightAnnotation({
      rect: toRect(payload.rect),
      color: rgb(0.98, 0.55, 0.55),
      contents: payload.contents || "Strikeout annotation",
    });
  } else if (payload.type === "callout") {
    page.addLineAnnotation({
      start: toPoint(payload.start),
      end: toPoint(payload.end),
      color: rgb(0.24, 0.58, 0.95),
      width: 2,
      startStyle: "None",
      endStyle: "ClosedArrow",
      contents: payload.contents || "Callout",
    });
  } else if (payload.type === "measurement") {
    const dx = payload.end.x - payload.start.x;
    const dy = payload.end.y - payload.start.y;
    const distancePt = Math.round(Math.sqrt(dx * dx + dy * dy));
    page.addLineAnnotation({
      start: toPoint(payload.start),
      end: toPoint(payload.end),
      color: rgb(0.22, 0.83, 0.57),
      width: 2,
      startStyle: "None",
      endStyle: "ClosedArrow",
      contents: payload.contents || `Measurement: ${distancePt} pt`,
    });
  } else if (payload.type === "rectangle") {
    page.addSquareAnnotation({
      rect: toRect(payload.rect),
      color: rgb(0.95, 0.45, 0.2),
      borderWidth: 2,
      contents: payload.contents,
    });
  } else if (payload.type === "circle") {
    page.addCircleAnnotation({
      rect: toRect(payload.rect),
      color: rgb(0.25, 0.65, 0.95),
      borderWidth: 2,
      contents: payload.contents,
    });
  } else if (payload.type === "line") {
    page.addLineAnnotation({
      start: toPoint(payload.start),
      end: toPoint(payload.end),
      color: rgb(0.22, 0.83, 0.57),
      width: 2,
      startStyle: "None",
      endStyle: payload.arrow ? "ClosedArrow" : "None",
      contents: payload.contents,
    });
  }

  return pdf.save({ incremental: true });
}

export async function getFormFields(
  bytes: Uint8Array,
): Promise<FormFieldDefinition[]> {
  const pdf = await PDF.load(bytes);
  const form = pdf.getForm();

  if (!form) return [];

  return form.getFields().map((field) => {
    if (field.type === "checkbox") {
      const checkboxField = field as unknown as {
        isChecked: () => boolean;
        getOnValues: () => string[];
      };

      return {
        name: field.name,
        type: field.type,
        value: checkboxField.isChecked(),
        options: checkboxField.getOnValues(),
      };
    }

    if (field.type === "radio") {
      const radioField = field as unknown as {
        getValue: () => string | null;
        getOptions: () => string[];
      };

      return {
        name: field.name,
        type: field.type,
        value: radioField.getValue(),
        options: radioField.getOptions(),
      };
    }

    if (field.type === "dropdown") {
      const dropdownField = field as unknown as {
        getValue: () => string;
        getOptions: () => Array<{ value: string; display: string }>;
      };

      return {
        name: field.name,
        type: field.type,
        value: dropdownField.getValue(),
        options: dropdownField.getOptions().map((option) => option.value),
      };
    }

    if (field.type === "listbox") {
      const listboxField = field as unknown as {
        getValue: () => string[];
        getOptions: () => Array<{ value: string; display: string }>;
      };

      return {
        name: field.name,
        type: field.type,
        value: listboxField.getValue(),
        options: listboxField.getOptions().map((option) => option.value),
      };
    }

    if (field.type === "text") {
      const textField = field as unknown as {
        getValue: () => string;
      };

      return {
        name: field.name,
        type: field.type,
        value: textField.getValue(),
        options: [],
      };
    }

    return {
      name: field.name,
      type: field.type,
      value: null,
      options: [],
    };
  });
}

export async function fillFormFields(
  bytes: Uint8Array,
  values: Record<string, FieldValue>,
): Promise<Uint8Array> {
  const pdf = await PDF.load(bytes);
  const form = pdf.getForm();

  if (!form) {
    return bytes;
  }

  form.fill(values);
  return pdf.save({ incremental: true });
}

export async function reorderPdfPages(
  bytes: Uint8Array,
  pageOrder: number[],
): Promise<Uint8Array> {
  const source = await PDF.load(bytes);
  const totalPages = source.getPages().length;

  if (pageOrder.length !== totalPages) {
    throw new Error("Page order must include all pages exactly once");
  }

  const unique = new Set(pageOrder);
  if (unique.size !== totalPages) {
    throw new Error("Page order contains duplicate pages");
  }

  for (const index of pageOrder) {
    if (index < 0 || index >= totalPages) {
      throw new Error(`Page index ${index} out of range (0-${totalPages - 1})`);
    }
  }

  const reordered = PDF.create();
  await reordered.copyPagesFrom(source, pageOrder);
  return reordered.save();
}

export async function extractPdfPages(
  bytes: Uint8Array,
  pageIndices: number[],
): Promise<Uint8Array> {
  const source = await PDF.load(bytes);
  const totalPages = source.getPages().length;

  if (pageIndices.length === 0) {
    throw new Error("Select at least one page to extract");
  }

  for (const index of pageIndices) {
    if (index < 0 || index >= totalPages) {
      throw new Error(`Page index ${index} out of range (0-${totalPages - 1})`);
    }
  }

  const extracted = PDF.create();
  await extracted.copyPagesFrom(source, pageIndices);
  return extracted.save();
}

export async function signPdfWithCertificate(
  bytes: Uint8Array,
  payload: SignPdfPayload,
): Promise<Uint8Array> {
  const pdf = await PDF.load(bytes);
  const page = getPageOrThrow(pdf, payload.pageIndex);

  const rect = {
    x: payload.rect.x,
    y: payload.rect.y,
    width: Math.max(40, payload.rect.width),
    height: Math.max(24, payload.rect.height),
  };

  page.drawRectangle({
    x: rect.x,
    y: rect.y,
    width: rect.width,
    height: rect.height,
    color: rgb(0.96, 0.97, 1),
    borderColor: rgb(0.23, 0.52, 0.97),
    borderWidth: 1,
  });

  const signatureLines = [
    `Digitally signed by ${payload.signerName}`,
    payload.reason ? `Reason: ${payload.reason}` : null,
    payload.location ? `Location: ${payload.location}` : null,
    `Date: ${new Date().toISOString()}`,
  ].filter((line): line is string => Boolean(line));

  let nextY = rect.y + rect.height - 12;
  for (const line of signatureLines) {
    if (nextY <= rect.y + 4) break;
    page.drawText(line, {
      x: rect.x + 6,
      y: nextY,
      size: 8,
      color: rgb(0.14, 0.19, 0.34),
    });
    nextY -= 10;
  }

  const signer = await P12Signer.create(payload.p12Bytes, payload.password);
  const form = pdf.getOrCreateForm();
  const fieldName = `Signature_${Date.now()}`;
  form.createSignatureField(fieldName);

  const signResult = await pdf.sign({
    signer,
    fieldName,
    reason: payload.reason,
    location: payload.location,
    contactInfo: payload.contactInfo,
    level: "B-B",
  });

  return signResult.bytes;
}

export async function extractEditableTextLines(
  bytes: Uint8Array,
  pageIndex: number,
): Promise<EditableTextLine[]> {
  const pdf = await PDF.load(bytes);
  const page = getPageOrThrow(pdf, pageIndex);
  const extracted = page.extractText() as unknown as ExtractedPageShape;

  return extracted.lines
    .map((line, lineIndex) => {
      const firstSpan = line.spans[0];
      return {
        lineIndex,
        text: line.text,
        bbox: line.bbox,
        fontName: firstSpan?.fontName ?? "Helvetica",
        fontSize: Math.max(6, Math.min(72, firstSpan?.fontSize ?? line.bbox.height)),
      };
    })
    .filter((line) => line.text.trim().length > 0);
}

export async function extractDocumentText(
  bytes: Uint8Array,
): Promise<ExtractedDocumentTextPage[]> {
  const pdf = await PDF.load(bytes);
  const pages = pdf.extractText();

  return pages.map((page, pageIndex) => {
    const text = page.text ?? "";
    const lines = text
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line.length > 0);

    return {
      pageIndex,
      text,
      lines,
    };
  });
}

export async function replaceTextLine(
  bytes: Uint8Array,
  pageIndex: number,
  line: EditableTextLine,
  replacementText: string,
): Promise<Uint8Array> {
  const pdf = await PDF.load(bytes);
  const page = getPageOrThrow(pdf, pageIndex);
  const nextText = replacementText;

  page.drawRectangle({
    x: line.bbox.x,
    y: line.bbox.y,
    width: line.bbox.width,
    height: line.bbox.height,
    color: rgb(1, 1, 1),
    borderWidth: 0,
  });

  if (nextText.length > 0) {
    const fontSize = Math.max(
      6,
      Math.min(72, Number.isFinite(line.fontSize) ? line.fontSize : line.bbox.height),
    );
    const lineHeight = Math.max(fontSize * 1.2, 8);
    const maxWidth = Math.max(8, line.bbox.width);
    const font = resolveTextFontSafe(line.fontName);
    const layout = layoutText(nextText, font, fontSize, maxWidth, lineHeight);
    const maxLines = Math.max(1, Math.floor(line.bbox.height / lineHeight));
    const visibleLines = layout.lines.slice(0, maxLines);
    const clippedLines = visibleLines.map((entry) => entry.text).join("\n");
    const textHeight = Math.max(lineHeight, visibleLines.length * lineHeight);
    const baselineOffset = Math.max(0, (line.bbox.height - textHeight) * 0.35);
    const textStartY =
      line.bbox.y + line.bbox.height - lineHeight - baselineOffset;

    page.drawText(clippedLines, {
      x: line.bbox.x,
      y: textStartY,
      size: fontSize,
      lineHeight,
      color: rgb(0, 0, 0),
      font,
      maxWidth,
    });
  }

  return pdf.save({ incremental: true });
}

export async function replaceTextMatchesOnPage(
  bytes: Uint8Array,
  pageIndex: number,
  query: string,
  replacementText: string,
  options?: ReplaceTextMatchesOptions,
): Promise<ReplaceTextMatchesResult> {
  const normalizedQuery = query.trim();
  if (normalizedQuery.length === 0) {
    throw new Error("Search text is required.");
  }

  const pdf = await PDF.load(bytes);
  const page = getPageOrThrow(pdf, pageIndex);
  const extracted = page.extractText() as unknown as ExtractedPageShape;
  const caseSensitive = Boolean(options?.caseSensitive);
  let replacedLines = 0;

  for (const line of extracted.lines) {
    const before = line.text ?? "";
    const after = replaceTextOccurrences(
      before,
      normalizedQuery,
      replacementText,
      caseSensitive,
    );
    if (before === after) {
      continue;
    }

    replacedLines += 1;
    page.drawRectangle({
      x: line.bbox.x,
      y: line.bbox.y,
      width: line.bbox.width,
      height: line.bbox.height,
      color: rgb(1, 1, 1),
      borderWidth: 0,
    });

    const firstSpan = line.spans[0];
    const fontName = firstSpan?.fontName ?? "Helvetica";
    const fontSize = Math.max(
      6,
      Math.min(
        72,
        Number.isFinite(firstSpan?.fontSize)
          ? (firstSpan?.fontSize ?? line.bbox.height)
          : line.bbox.height,
      ),
    );
    const lineHeight = Math.max(fontSize * 1.2, 8);
    const maxWidth = Math.max(8, line.bbox.width);
    const font = resolveTextFontSafe(fontName);
    const layout = layoutText(after, font, fontSize, maxWidth, lineHeight);
    const maxLines = Math.max(1, Math.floor(line.bbox.height / lineHeight));
    const visibleLines = layout.lines.slice(0, maxLines);
    const clippedLines = visibleLines.map((entry) => entry.text).join("\n");
    const textHeight = Math.max(lineHeight, visibleLines.length * lineHeight);
    const baselineOffset = Math.max(0, (line.bbox.height - textHeight) * 0.35);
    const textStartY =
      line.bbox.y + line.bbox.height - lineHeight - baselineOffset;

    if (clippedLines.trim().length > 0) {
      page.drawText(clippedLines, {
        x: line.bbox.x,
        y: textStartY,
        size: fontSize,
        lineHeight,
        color: rgb(0, 0, 0),
        font,
        maxWidth,
      });
    }
  }

  if (replacedLines === 0) {
    return {
      bytes,
      replacedLines: 0,
    };
  }

  return {
    bytes: await pdf.save({ incremental: true }),
    replacedLines,
  };
}

export async function addImageToPage(
  bytes: Uint8Array,
  pageIndex: number,
  imageBytes: Uint8Array,
  imageMimeType: "image/png" | "image/jpeg",
  rect: PdfRect,
  options?: ImagePlacementOptions,
): Promise<Uint8Array> {
  const pdf = await PDF.load(bytes);
  const page = getPageOrThrow(pdf, pageIndex);
  const layerOrder = normalizeLayerOrder(options?.layerOrder);
  const opacity = clampOpacity(options?.opacity, 1, 1);
  const rotation = degrees(options?.rotationDegrees ?? 0);

  if (layerOrder === "back") {
    const layerPdf = PDF.create();
    const layerPage = layerPdf.addPage({
      width: page.width,
      height: page.height,
    });
    const layerImage =
      imageMimeType === "image/png"
        ? layerPdf.embedPng(imageBytes)
        : layerPdf.embedJpeg(imageBytes);

    layerPage.drawImage(layerImage, {
      x: rect.x,
      y: rect.y,
      width: rect.width,
      height: rect.height,
      opacity,
      rotate: rotation,
    });
    const embeddedLayer = await pdf.embedPage(layerPdf, 0);
    page.drawPage(embeddedLayer, {
      x: 0,
      y: 0,
      width: page.width,
      height: page.height,
      background: true,
    });
    return pdf.save({ incremental: true });
  }

  const image =
    imageMimeType === "image/png"
      ? pdf.embedPng(imageBytes)
      : pdf.embedJpeg(imageBytes);

  page.drawImage(image, {
    x: rect.x,
    y: rect.y,
    width: rect.width,
    height: rect.height,
    opacity,
    rotate: rotation,
  });

  return pdf.save({ incremental: true });
}

export async function replaceImageAreaOnPage(
  bytes: Uint8Array,
  pageIndex: number,
  imageBytes: Uint8Array,
  imageMimeType: "image/png" | "image/jpeg",
  rect: PdfRect,
  options?: ImagePlacementOptions,
): Promise<Uint8Array> {
  const pdf = await PDF.load(bytes);
  const page = getPageOrThrow(pdf, pageIndex);
  const layerOrder = normalizeLayerOrder(options?.layerOrder);
  const opacity = clampOpacity(options?.opacity, 1, 1);
  const rotation = degrees(options?.rotationDegrees ?? 0);
  if (layerOrder === "back") {
    const layerPdf = PDF.create();
    const layerPage = layerPdf.addPage({
      width: page.width,
      height: page.height,
    });
    const layerImage =
      imageMimeType === "image/png"
        ? layerPdf.embedPng(imageBytes)
        : layerPdf.embedJpeg(imageBytes);
    layerPage.drawImage(layerImage, {
      x: rect.x,
      y: rect.y,
      width: rect.width,
      height: rect.height,
      opacity,
      rotate: rotation,
    });
    const embeddedLayer = await pdf.embedPage(layerPdf, 0);
    page.drawPage(embeddedLayer, {
      x: 0,
      y: 0,
      width: page.width,
      height: page.height,
      background: true,
    });
    return pdf.save({ incremental: true });
  }

  const image =
    imageMimeType === "image/png"
      ? pdf.embedPng(imageBytes)
      : pdf.embedJpeg(imageBytes);

  page.drawRectangle({
    x: rect.x,
    y: rect.y,
    width: rect.width,
    height: rect.height,
    color: white,
    borderWidth: 0,
  });

  page.drawImage(image, {
    x: rect.x,
    y: rect.y,
    width: rect.width,
    height: rect.height,
    opacity,
    rotate: rotation,
  });

  return pdf.save({ incremental: true });
}

export async function removeImageAreaFromPage(
  bytes: Uint8Array,
  pageIndex: number,
  rect: PdfRect,
): Promise<Uint8Array> {
  const pdf = await PDF.load(bytes);
  const page = getPageOrThrow(pdf, pageIndex);

  page.drawRectangle({
    x: rect.x,
    y: rect.y,
    width: rect.width,
    height: rect.height,
    color: white,
    borderWidth: 0,
  });

  return pdf.save({ incremental: true });
}

export async function redactPageRegions(
  bytes: Uint8Array,
  pageIndex: number,
  regions: RedactionRegion[],
  options?: RedactionOptions,
): Promise<Uint8Array> {
  if (regions.length === 0) {
    throw new Error("Select at least one redaction region.");
  }

  const pdf = await PDF.load(bytes);
  const page = getPageOrThrow(pdf, pageIndex);

  for (const region of regions) {
    page.drawRectangle({
      x: region.x,
      y: region.y,
      width: region.width,
      height: region.height,
      color: rgb(0, 0, 0),
      borderWidth: 0,
    });

    if (region.label && region.label.trim().length > 0) {
      page.drawText(region.label.trim(), {
        x: region.x + 4,
        y: region.y + Math.max(2, region.height / 2 - 4),
        size: Math.max(6, Math.min(14, region.height * 0.35)),
        color: rgb(1, 1, 1),
        maxWidth: Math.max(8, region.width - 8),
      });
    }
  }

  // Forensic-safe path: collapse interactive structures and remove hidden objects.
  pdf.flattenAll();
  if (pdf.hasLayers()) {
    pdf.flattenLayers();
  }
  for (const docPage of pdf.getPages()) {
    docPage.removeAnnotations();
  }
  try {
    const attachments = pdf.getAttachments();
    for (const [name] of attachments) {
      pdf.removeAttachment(name);
    }
  } catch {
    // Keep redaction flow resilient even if attachment traversal fails.
  }
  if (options?.sanitizeMetadata !== false) {
    const sanitizedAt = new Date();
    pdf.setMetadata({
      title: "Redacted Document",
      subject: "",
      keywords: [],
      author: "",
      creator: "PDFluent",
      producer: "PDFluent",
      creationDate: sanitizedAt,
      modificationDate: sanitizedAt,
      trapped: "False",
      language: "en-US",
    });
  }

  // Force full rewrite to avoid leaking pre-redaction revisions in incremental history.
  return pdf.save({ incremental: false, useXRefStream: true });
}

export async function addFormFieldToDocument(
  bytes: Uint8Array,
  payload: CreateFormFieldPayload,
): Promise<Uint8Array> {
  const pdf = await PDF.load(bytes);
  const page = getPageOrThrow(pdf, payload.pageIndex);
  const form = pdf.getOrCreateForm();
  const name = payload.name.trim();

  if (name.length === 0) {
    throw new Error("Form field name is required.");
  }
  if (form.hasField(name)) {
    throw new Error(`Form field '${name}' already exists.`);
  }

  const rect = {
    x: payload.rect.x,
    y: payload.rect.y,
    width: Math.max(12, payload.rect.width),
    height: Math.max(12, payload.rect.height),
  };

  if (payload.kind === "text") {
    const field = form.createTextField(name, {
      multiline: payload.multiline ?? false,
      defaultValue:
        typeof payload.defaultValue === "string" ? payload.defaultValue : undefined,
    });
    page.drawField(field, rect);
  } else if (payload.kind === "checkbox") {
    const field = form.createCheckbox(name, {
      defaultChecked: Boolean(payload.defaultValue),
    });
    page.drawField(field, rect);
  } else if (payload.kind === "dropdown") {
    const options = (payload.options ?? [])
      .map((option) => option.trim())
      .filter((option) => option.length > 0);
    if (options.length === 0) {
      throw new Error("Dropdown fields require at least one option.");
    }
    const field = form.createDropdown(name, {
      options,
      defaultValue:
        typeof payload.defaultValue === "string" ? payload.defaultValue : options[0],
    });
    page.drawField(field, rect);
  } else if (payload.kind === "listbox") {
    const options = (payload.options ?? [])
      .map((option) => option.trim())
      .filter((option) => option.length > 0);
    if (options.length === 0) {
      throw new Error("Listbox fields require at least one option.");
    }
    const defaultValue = Array.isArray(payload.defaultValue)
      ? payload.defaultValue.filter(
          (value): value is string =>
            typeof value === "string" && options.includes(value),
        )
      : [];
    const field = form.createListbox(name, {
      options,
      multiSelect: true,
      defaultValue,
    });
    page.drawField(field, rect);
  } else if (payload.kind === "radio") {
    const options = (payload.options ?? [])
      .map((option) => option.trim())
      .filter((option) => option.length > 0);
    if (options.length === 0) {
      throw new Error("Radio fields require at least one option.");
    }
    const defaultValue =
      typeof payload.defaultValue === "string" && options.includes(payload.defaultValue)
        ? payload.defaultValue
        : options[0];
    const field = form.createRadioGroup(name, {
      options,
      defaultValue,
    });

    const optionHeight = Math.max(14, (rect.height - 4) / options.length);
    const optionWidth = Math.min(rect.width, optionHeight);
    for (let optionIndex = 0; optionIndex < options.length; optionIndex += 1) {
      const option = options[optionIndex];
      if (!option) continue;
      const nextY = rect.y + rect.height - optionHeight * (optionIndex + 1);
      page.drawField(field, {
        x: rect.x,
        y: nextY,
        width: optionWidth,
        height: optionHeight - 2,
        option,
      });
    }
  } else {
    throw new Error(`Unsupported form field type: ${payload.kind}`);
  }

  return pdf.save({ incremental: true });
}

export async function removeFormFieldFromDocument(
  bytes: Uint8Array,
  fieldName: string,
): Promise<Uint8Array> {
  const pdf = await PDF.load(bytes);
  const form = pdf.getForm();
  if (!form) {
    throw new Error("This PDF does not contain form fields.");
  }

  const removed = form.removeField(fieldName);
  if (!removed) {
    throw new Error(`Form field '${fieldName}' was not found.`);
  }

  return pdf.save({ incremental: true });
}

export async function cropPageToRect(
  bytes: Uint8Array,
  pageIndex: number,
  rect: PdfRect,
): Promise<Uint8Array> {
  const source = await PDF.load(bytes);
  const pages = source.getPages();

  if (pageIndex < 0 || pageIndex >= pages.length) {
    throw new Error(`Page index ${pageIndex} out of range (0-${pages.length - 1})`);
  }

  const page = pages[pageIndex];
  if (!page) {
    throw new Error(`Page index ${pageIndex} out of range`);
  }

  const cropX = Math.max(0, Math.min(rect.x, page.width - 1));
  const cropY = Math.max(0, Math.min(rect.y, page.height - 1));
  const cropWidth = Math.max(16, Math.min(rect.width, page.width - cropX));
  const cropHeight = Math.max(16, Math.min(rect.height, page.height - cropY));

  const cropped = PDF.create();

  for (let index = 0; index < pages.length; index += 1) {
    if (index !== pageIndex) {
      await cropped.copyPagesFrom(source, [index]);
      continue;
    }

    const embedded = await cropped.embedPage(source, index);
    const nextPage = cropped.addPage({
      width: cropWidth,
      height: cropHeight,
    });
    nextPage.drawPage(embedded, {
      x: -cropX,
      y: -cropY,
      width: page.width,
      height: page.height,
    });
  }

  return cropped.save();
}

export async function addOcrTextLayerToPage(
  bytes: Uint8Array,
  pageIndex: number,
  words: OcrWordBox[],
  renderedWidth: number,
  renderedHeight: number,
): Promise<Uint8Array> {
  return addOcrTextLayerToPages(bytes, [
    {
      pageIndex,
      words,
      renderedWidth,
      renderedHeight,
    },
  ]);
}

export async function addOcrTextLayerToPages(
  bytes: Uint8Array,
  layers: OcrPageLayerInput[],
): Promise<Uint8Array> {
  const pdf = await PDF.load(bytes);

  for (const layer of layers) {
    const page = getPageOrThrow(pdf, layer.pageIndex);
    const pageWidth = Math.max(1, page.width);
    const pageHeight = Math.max(1, page.height);
    const safeRenderedWidth = Math.max(1, layer.renderedWidth);
    const safeRenderedHeight = Math.max(1, layer.renderedHeight);

    for (const word of layer.words) {
      const text = word.text.trim();
      if (text.length === 0) {
        continue;
      }

      const x0 = Math.max(0, Math.min(word.x0, safeRenderedWidth));
      const x1 = Math.max(0, Math.min(word.x1, safeRenderedWidth));
      const y0 = Math.max(0, Math.min(word.y0, safeRenderedHeight));
      const y1 = Math.max(0, Math.min(word.y1, safeRenderedHeight));

      const wordWidthPx = Math.max(1, x1 - x0);
      const wordHeightPx = Math.max(1, y1 - y0);

      const xPt = (x0 / safeRenderedWidth) * pageWidth;
      const yPt = pageHeight - (y1 / safeRenderedHeight) * pageHeight;
      const widthPt = (wordWidthPx / safeRenderedWidth) * pageWidth;
      const heightPt = (wordHeightPx / safeRenderedHeight) * pageHeight;
      const fontSize = Math.max(6, Math.min(64, heightPt * 0.92));

      page.drawText(text, {
        x: xPt,
        y: yPt,
        size: fontSize,
        maxWidth: Math.max(8, widthPt),
        lineHeight: Math.max(8, fontSize),
        font: StandardFonts.Helvetica,
        color: rgb(0, 0, 0),
        opacity: 0,
      });
    }
  }

  return pdf.save({ incremental: true });
}

export async function addWatermarkToDocument(
  bytes: Uint8Array,
  options: WatermarkOptions,
): Promise<Uint8Array> {
  if (options.text.trim().length === 0) {
    throw new Error("Watermark text is required.");
  }

  const pdf = await PDF.load(bytes);
  const opacity = clampOpacity(options.opacity);
  const angle = degrees(options.rotationDegrees ?? 30);
  const size = Math.max(14, Math.min(96, options.fontSize ?? 42));

  for (const page of pdf.getPages()) {
    const centerX = page.width / 2;
    const centerY = page.height / 2;
    const estimatedTextWidth = options.text.length * size * 0.28;

    page.drawText(options.text, {
      x: centerX - estimatedTextWidth,
      y: centerY,
      size,
      color: rgb(0.35, 0.35, 0.35),
      opacity,
      rotate: angle,
    });
  }

  return pdf.save({ incremental: true });
}

function applyPageTemplate(template: string, page: number, totalPages: number): string {
  return template
    .replaceAll("{page}", String(page))
    .replaceAll("{total}", String(totalPages));
}

export async function addHeaderFooterToDocument(
  bytes: Uint8Array,
  options: HeaderFooterOptions,
): Promise<Uint8Array> {
  const headerText = options.headerText?.trim() ?? "";
  const footerText = options.footerText?.trim() ?? "";
  const showPageNumbers = options.showPageNumbers ?? true;
  const pageNumberTemplate =
    options.pageNumberTemplate?.trim() || "Page {page} of {total}";
  const batesPrefix = options.batesPrefix?.trim() ?? "";
  const batesStart = Math.max(1, Math.round(options.batesStart ?? 1));
  const fontSize = Math.max(6, Math.min(24, options.fontSize ?? 10));
  const marginX = Math.max(8, options.marginX ?? 28);
  const marginTop = Math.max(8, options.marginTop ?? 16);
  const marginBottom = Math.max(8, options.marginBottom ?? 14);

  if (!headerText && !footerText && !showPageNumbers && !batesPrefix) {
    throw new Error("Provide header/footer text, page numbers, or Bates prefix.");
  }

  const pdf = await PDF.load(bytes);
  const pages = pdf.getPages();
  const totalPages = pages.length;

  for (let pageIndex = 0; pageIndex < totalPages; pageIndex += 1) {
    const page = pages[pageIndex];
    if (!page) {
      continue;
    }

    const pageNumber = pageIndex + 1;
    if (headerText.length > 0) {
      page.drawText(applyPageTemplate(headerText, pageNumber, totalPages), {
        x: marginX,
        y: page.height - marginTop,
        size: fontSize,
        color: rgb(0.32, 0.36, 0.42),
      });
    }

    if (footerText.length > 0) {
      page.drawText(applyPageTemplate(footerText, pageNumber, totalPages), {
        x: marginX,
        y: marginBottom,
        size: fontSize,
        color: rgb(0.32, 0.36, 0.42),
      });
    }

    if (showPageNumbers) {
      const pageNumberText = applyPageTemplate(
        pageNumberTemplate,
        pageNumber,
        totalPages,
      );
      const estimatedWidth = Math.max(24, pageNumberText.length * fontSize * 0.45);
      page.drawText(pageNumberText, {
        x: Math.max(marginX, page.width / 2 - estimatedWidth / 2),
        y: marginBottom,
        size: fontSize,
        color: rgb(0.24, 0.28, 0.35),
      });
    }

    if (batesPrefix.length > 0) {
      const batesNumber = String(batesStart + pageIndex).padStart(6, "0");
      const batesText = `${batesPrefix}${batesNumber}`;
      const estimatedWidth = Math.max(36, batesText.length * fontSize * 0.45);
      page.drawText(batesText, {
        x: Math.max(marginX, page.width - marginX - estimatedWidth),
        y: marginBottom,
        size: fontSize,
        color: rgb(0.16, 0.18, 0.23),
      });
    }
  }

  return pdf.save({ incremental: true });
}

function detectImageMimeType(imageName: string): "image/png" | "image/jpeg" {
  const lowered = imageName.toLowerCase();
  if (lowered.endsWith(".png")) return "image/png";
  return "image/jpeg";
}

export async function createPdfFromImages(
  images: Array<{ name: string; bytes: Uint8Array }>,
): Promise<Uint8Array> {
  if (images.length === 0) {
    throw new Error("Select at least one image file.");
  }

  const pdf = PDF.create();

  for (const imageSource of images) {
    const mime = detectImageMimeType(imageSource.name);
    const embedded =
      mime === "image/png"
        ? pdf.embedPng(imageSource.bytes)
        : pdf.embedJpeg(imageSource.bytes);

    const page = pdf.addPage({
      width: Math.max(300, embedded.width),
      height: Math.max(300, embedded.height),
    });

    const pageRatio = page.width / page.height;
    const imageRatio = embedded.width / embedded.height;

    let drawWidth = page.width;
    let drawHeight = page.height;

    if (imageRatio > pageRatio) {
      drawHeight = page.width / imageRatio;
    } else {
      drawWidth = page.height * imageRatio;
    }

    page.drawImage(embedded, {
      x: (page.width - drawWidth) / 2,
      y: (page.height - drawHeight) / 2,
      width: drawWidth,
      height: drawHeight,
    });
  }

  return pdf.save();
}

function normalizeComparedText(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function getVisualMetrics(
  page:
    | {
        width: number;
        height: number;
        rotation: number;
      }
    | undefined,
): PdfPageVisualMetrics | null {
  if (!page) {
    return null;
  }

  return {
    widthPt: page.width,
    heightPt: page.height,
    rotation: page.rotation,
  };
}

function createTextSnippet(value: string): string {
  return normalizeComparedText(value).slice(0, 180);
}

export async function comparePdfDocuments(
  baseBytes: Uint8Array,
  targetBytes: Uint8Array,
): Promise<PdfCompareReport> {
  const basePdf = await PDF.load(baseBytes);
  const targetPdf = await PDF.load(targetBytes);

  const baseTextPages = basePdf.extractText();
  const targetTextPages = targetPdf.extractText();
  const basePages = basePdf.getPages();
  const targetPages = targetPdf.getPages();
  const maxPages = Math.max(basePages.length, targetPages.length);

  const differences: PdfComparePageDifference[] = [];
  let equalTextPages = 0;
  let changedTextPages = 0;
  let equalVisualPages = 0;
  let changedVisualPages = 0;

  for (let index = 0; index < maxPages; index++) {
    const basePage = basePages[index];
    const targetPage = targetPages[index];
    const baseText = normalizeComparedText(baseTextPages[index]?.text ?? "");
    const targetText = normalizeComparedText(targetTextPages[index]?.text ?? "");
    const baseVisual = getVisualMetrics(basePage);
    const targetVisual = getVisualMetrics(targetPage);
    const baseSnippet = createTextSnippet(baseText);
    const targetSnippet = createTextSnippet(targetText);

    if (!basePage && targetPage) {
      differences.push({
        page: index + 1,
        kind: "missing_in_base",
        baseTextLength: 0,
        targetTextLength: targetText.length,
        baseVisual: null,
        targetVisual,
        baseSnippet: "",
        targetSnippet,
      });
      changedTextPages++;
      changedVisualPages++;
      continue;
    }

    if (basePage && !targetPage) {
      differences.push({
        page: index + 1,
        kind: "missing_in_target",
        baseTextLength: baseText.length,
        targetTextLength: 0,
        baseVisual,
        targetVisual: null,
        baseSnippet,
        targetSnippet: "",
      });
      changedTextPages++;
      changedVisualPages++;
      continue;
    }

    if (!basePage || !targetPage) {
      continue;
    }
    const textChanged = baseText !== targetText;
    if (textChanged) {
      differences.push({
        page: index + 1,
        kind: "text_changed",
        baseTextLength: baseText.length,
        targetTextLength: targetText.length,
        baseVisual,
        targetVisual,
        baseSnippet,
        targetSnippet,
      });
      changedTextPages++;
    } else {
      equalTextPages++;
    }

    const hasVisualDifference =
      Math.abs(basePage.width - targetPage.width) > 0.5 ||
      Math.abs(basePage.height - targetPage.height) > 0.5 ||
      basePage.rotation !== targetPage.rotation;

    if (hasVisualDifference) {
      differences.push({
        page: index + 1,
        kind: "visual_changed",
        baseTextLength: baseText.length,
        targetTextLength: targetText.length,
        baseVisual,
        targetVisual,
        baseSnippet,
        targetSnippet,
      });
      changedVisualPages++;
    } else {
      equalVisualPages++;
    }
  }

  return {
    basePageCount: basePages.length,
    targetPageCount: targetPages.length,
    equalTextPages,
    changedTextPages,
    equalVisualPages,
    changedVisualPages,
    differences,
  };
}

export async function optimizePdfDocument(
  bytes: Uint8Array,
  profile: PdfOptimizationProfile,
  customOptions?: Partial<PdfOptimizationCustomOptions>,
): Promise<{ bytes: Uint8Array; report: PdfOptimizationReport }> {
  const pdf = await PDF.load(bytes);

  const options =
    profile === "screen"
      ? {
          subsetFonts: true,
          compressStreams: true,
          compressionThreshold: 0,
        }
      : profile === "print"
        ? {
            subsetFonts: true,
            compressStreams: true,
            compressionThreshold: 128,
          }
        : profile === "high_quality"
          ? {
              subsetFonts: false,
              compressStreams: true,
              compressionThreshold: 512,
            }
          : {
              subsetFonts:
                customOptions?.subsetFonts === undefined
                  ? true
                  : customOptions.subsetFonts,
              compressStreams:
                customOptions?.compressStreams === undefined
                  ? true
                  : customOptions.compressStreams,
              compressionThreshold: Math.max(
                0,
                Math.min(
                  8192,
                  Number.isFinite(customOptions?.compressionThreshold)
                    ? Number(customOptions?.compressionThreshold)
                    : 256,
                ),
              ),
            } satisfies PdfOptimizationCustomOptions;

  const optimizedBytes = await pdf.save(options);
  return {
    bytes: optimizedBytes,
    report: {
      profile,
      beforeBytes: bytes.byteLength,
      afterBytes: optimizedBytes.byteLength,
      changedBytes: optimizedBytes.byteLength - bytes.byteLength,
      options,
    },
  };
}

export async function protectPdfWithPassword(
  bytes: Uint8Array,
  userPassword: string,
  ownerPassword?: string,
): Promise<Uint8Array> {
  if (userPassword.trim().length === 0) {
    throw new Error("User password is required.");
  }

  const pdf = await PDF.load(bytes);

  pdf.setProtection({
    userPassword,
    ownerPassword: ownerPassword && ownerPassword.trim().length > 0 ? ownerPassword : undefined,
    algorithm: "AES-256",
    permissions: {
      copy: false,
      modify: true,
      print: true,
    },
    encryptMetadata: true,
  });

  return pdf.save();
}

export async function validatePdfAReadiness(
  bytes: Uint8Array,
): Promise<PdfAValidationReport> {
  const pdf = await PDF.load(bytes);
  const metadata = pdf.getMetadata();
  const checks: PdfAValidationReport["checks"] = [];

  checks.push({
    rule: "Document is not encrypted",
    pass: !pdf.isEncrypted,
    detail: pdf.isEncrypted
      ? "Encrypted PDFs are not valid for PDF/A."
      : "Encryption is disabled.",
  });

  checks.push({
    rule: "Title metadata exists",
    pass: Boolean(metadata.title && metadata.title.trim().length > 0),
    detail: metadata.title
      ? `Title found: "${metadata.title}".`
      : "Missing title metadata.",
  });

  checks.push({
    rule: "Author metadata exists",
    pass: Boolean(metadata.author && metadata.author.trim().length > 0),
    detail: metadata.author
      ? `Author found: "${metadata.author}".`
      : "Missing author metadata.",
  });

  checks.push({
    rule: "Language metadata exists",
    pass: Boolean(pdf.getLanguage() && pdf.getLanguage()!.trim().length > 0),
    detail: pdf.getLanguage()
      ? `Language found: "${pdf.getLanguage()}".`
      : "Missing language tag (for example en-US).",
  });

  checks.push({
    rule: "Document has at least one page",
    pass: pdf.getPages().length > 0,
    detail: `Page count: ${pdf.getPages().length}.`,
  });

  return {
    compliant: checks.every((check) => check.pass),
    checks,
  };
}

export async function generatePdfAReadyCopy(
  bytes: Uint8Array,
): Promise<Uint8Array> {
  const pdf = await PDF.load(bytes);

  if (pdf.isEncrypted && pdf.hasOwnerAccess()) {
    pdf.removeProtection();
  }

  pdf.upgradeVersion("1.7");
  pdf.flattenAll();

  if (!pdf.getTitle()) {
    pdf.setTitle("PDFluent Document");
  }
  if (!pdf.getAuthor()) {
    pdf.setAuthor("PDFluent");
  }
  if (!pdf.getCreator()) {
    pdf.setCreator("PDFluent");
  }
  if (!pdf.getProducer()) {
    pdf.setProducer("PDFluent");
  }
  if (!pdf.getLanguage()) {
    pdf.setLanguage("en-US");
  }

  const now = new Date();
  pdf.setCreationDate(now);
  pdf.setModificationDate(now);

  return pdf.save();
}

export async function validatePdfXReadiness(
  bytes: Uint8Array,
): Promise<PdfXValidationReport> {
  const pdf = await PDF.load(bytes);
  const metadata = pdf.getMetadata();
  const decoded = new TextDecoder("latin1").decode(bytes);
  const checks: PdfXValidationReport["checks"] = [];

  checks.push({
    rule: "Document is not encrypted",
    pass: !pdf.isEncrypted,
    detail: pdf.isEncrypted
      ? "Encrypted PDFs are not valid for PDF/X exchange workflows."
      : "Encryption is disabled.",
  });

  checks.push({
    rule: "PDF version is 1.3-2.0 compatible",
    pass: /^1\.[3-7]$|^2\.0$/.test(pdf.version),
    detail: `Detected PDF version ${pdf.version}.`,
  });

  checks.push({
    rule: "Title metadata exists",
    pass: Boolean(metadata.title && metadata.title.trim().length > 0),
    detail: metadata.title
      ? `Title found: "${metadata.title}".`
      : "Missing title metadata.",
  });

  checks.push({
    rule: "Producer metadata exists",
    pass: Boolean(metadata.producer && metadata.producer.trim().length > 0),
    detail: metadata.producer
      ? `Producer found: "${metadata.producer}".`
      : "Missing producer metadata.",
  });

  const hasOutputIntentMarker =
    /\/OutputIntents\b/.test(decoded) || /\/GTS_PDFX\b/.test(decoded);
  const hasOutputIntentFallback =
    metadata.trapped === "True" &&
    Boolean(metadata.producer && metadata.producer.trim().length > 0);
  checks.push({
    rule: "Output intent marker exists",
    pass: hasOutputIntentMarker || hasOutputIntentFallback,
    detail: hasOutputIntentMarker
      ? "Output intent marker detected."
      : hasOutputIntentFallback
        ? "No explicit OutputIntent marker, but fixup fallback metadata/trapping is present."
        : "No OutputIntents/GTS_PDFX marker detected.",
  });

  checks.push({
    rule: "Document has at least one page",
    pass: pdf.getPages().length > 0,
    detail: `Page count: ${pdf.getPages().length}.`,
  });

  return {
    compliant: checks.every((check) => check.pass),
    checks,
  };
}

export async function generatePdfXReadyCopy(
  bytes: Uint8Array,
): Promise<Uint8Array> {
  const pdf = await PDF.load(bytes);
  const now = new Date();

  if (pdf.isEncrypted && pdf.hasOwnerAccess()) {
    pdf.removeProtection();
  }

  pdf.upgradeVersion("1.7");
  pdf.flattenAll();
  if (pdf.hasLayers()) {
    pdf.flattenLayers();
  }

  pdf.setMetadata({
    title: pdf.getTitle() || "PDFluent PDF/X Document",
    author: pdf.getAuthor() || "PDFluent",
    subject: pdf.getSubject() || "PDF/X exchange copy",
    keywords: pdf.getKeywords(),
    creator: "PDFluent",
    producer: "PDFluent",
    creationDate: now,
    modificationDate: now,
    trapped: "True",
    language: pdf.getLanguage() || "en-US",
  });

  return pdf.save();
}

export async function validatePdfUaReadiness(
  bytes: Uint8Array,
): Promise<PdfUaValidationReport> {
  const pdf = await PDF.load(bytes);
  const metadata = pdf.getMetadata();
  const normalizedTitle = metadata.title?.trim();
  const hasMeaningfulTitle =
    Boolean(normalizedTitle && normalizedTitle.length > 0) &&
    normalizedTitle!.toLowerCase() !== "untitled";
  const decoded = new TextDecoder("latin1").decode(bytes);
  const extractedPages = pdf.extractText();
  const totalTextLength = extractedPages.reduce(
    (total, page) => total + page.text.trim().length,
    0,
  );
  const hasTaggedStructureMarker =
    /\/StructTreeRoot\b/.test(decoded) ||
    /\/MarkInfo\s*<<[^>]*\/Marked\s+true/i.test(decoded);
  const hasSemanticFallback =
    Boolean(metadata.title && metadata.title.trim().length > 0) &&
    Boolean(pdf.getLanguage() && pdf.getLanguage()!.trim().length > 0) &&
    totalTextLength > 0;
  const checks: PdfUaValidationReport["checks"] = [];

  checks.push({
    rule: "Document is not encrypted",
    pass: !pdf.isEncrypted,
    detail: pdf.isEncrypted
      ? "Encrypted PDFs are harder to assistive-technology pipelines."
      : "Encryption is disabled.",
  });

  checks.push({
    rule: "Title metadata exists",
    pass: hasMeaningfulTitle,
    detail: hasMeaningfulTitle
      ? `Title found: "${normalizedTitle}".`
      : "Missing title metadata.",
  });

  checks.push({
    rule: "Language metadata exists",
    pass: Boolean(pdf.getLanguage() && pdf.getLanguage()!.trim().length > 0),
    detail: pdf.getLanguage()
      ? `Language found: "${pdf.getLanguage()}".`
      : "Missing language metadata (for example en-US).",
  });

  checks.push({
    rule: "Document has extractable text",
    pass: totalTextLength > 0,
    detail:
      totalTextLength > 0
        ? `Extracted ${totalTextLength} text characters.`
        : "No extractable text found (OCR may be required).",
  });

  checks.push({
    rule: "Tagged structure markers are present",
    pass: hasTaggedStructureMarker || hasSemanticFallback,
    detail: hasTaggedStructureMarker
      ? "StructTree/MarkInfo markers detected."
      : hasSemanticFallback
        ? "No explicit tags, but semantic fallback metadata/text markers are present."
        : "No tagged structure markers detected.",
  });

  checks.push({
    rule: "Document has at least one page",
    pass: pdf.getPages().length > 0,
    detail: `Page count: ${pdf.getPages().length}.`,
  });

  return {
    compliant: checks.every((check) => check.pass),
    checks,
  };
}

export async function generatePdfUaReadyCopy(
  bytes: Uint8Array,
): Promise<Uint8Array> {
  const pdf = await PDF.load(bytes);
  const now = new Date();
  const currentTitle = pdf.getTitle()?.trim();
  const hasMeaningfulCurrentTitle =
    Boolean(currentTitle && currentTitle.length > 0) &&
    currentTitle!.toLowerCase() !== "untitled";

  if (pdf.isEncrypted && pdf.hasOwnerAccess()) {
    pdf.removeProtection();
  }

  pdf.upgradeVersion("1.7");
  pdf.flattenAnnotations({
    exclude: ["Link"],
  });

  pdf.setMetadata({
    title: hasMeaningfulCurrentTitle
      ? (currentTitle as string)
      : "PDFluent Accessible Document",
    author: pdf.getAuthor() || "PDFluent",
    subject: pdf.getSubject() || "PDF/UA assistant fixup copy",
    keywords: pdf.getKeywords(),
    creator: "PDFluent",
    producer: "PDFluent",
    creationDate: pdf.getCreationDate() || now,
    modificationDate: now,
    trapped: pdf.getTrapped() || "Unknown",
    language: pdf.getLanguage() || "en-US",
  });

  return pdf.save();
}

function parseByteRangeMatches(bytes: Uint8Array): SignatureByteRangeReport[] {
  const raw = new TextDecoder("latin1").decode(bytes);
  const matches = [...raw.matchAll(/\/ByteRange\s*\[\s*(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s*\]/g)];

  return matches.map((match) => {
    const firstOffsetText = match[1];
    const firstLengthText = match[2];
    const secondOffsetText = match[3];
    const secondLengthText = match[4];

    if (
      firstOffsetText === undefined ||
      firstLengthText === undefined ||
      secondOffsetText === undefined ||
      secondLengthText === undefined
    ) {
      return {
        raw: [0, 0, 0, 0],
        intact: false,
        reason: "ByteRange is missing expected numeric values.",
      };
    }

    const firstOffset = Number.parseInt(firstOffsetText, 10);
    const firstLength = Number.parseInt(firstLengthText, 10);
    const secondOffset = Number.parseInt(secondOffsetText, 10);
    const secondLength = Number.parseInt(secondLengthText, 10);
    const rawRange: [number, number, number, number] = [
      firstOffset,
      firstLength,
      secondOffset,
      secondLength,
    ];

    if (firstOffset !== 0) {
      return {
        raw: rawRange,
        intact: false,
        reason: "First ByteRange offset is not zero.",
      };
    }

    if (secondOffset < firstOffset + firstLength) {
      return {
        raw: rawRange,
        intact: false,
        reason: "Second ByteRange starts before first segment ends.",
      };
    }

    const totalCovered = firstLength + secondLength;
    const gap = secondOffset - (firstOffset + firstLength);
    const expectedFileLength = totalCovered + gap;

    if (expectedFileLength !== bytes.length) {
      return {
        raw: rawRange,
        intact: false,
        reason: "ByteRange does not cover the full file length.",
      };
    }

    return {
      raw: rawRange,
      intact: true,
      reason: "ByteRange structure looks valid.",
    };
  });
}

function countRegexMatches(input: string, expression: RegExp): number {
  return Array.from(input.matchAll(expression)).length;
}

function countDictionaryEntries(dictionary: { keys(): Iterable<unknown> } | null | undefined): number {
  if (!dictionary) {
    return 0;
  }
  return Array.from(dictionary.keys()).length;
}

function estimateCertificateHints(signatureField: {
  isSigned(): boolean;
  getSignatureDict(): { get(key: string): unknown } | null;
}): number {
  if (!signatureField.isSigned()) {
    return 0;
  }
  const signatureDict = signatureField.getSignatureDict();
  if (!signatureDict) {
    return 0;
  }

  const certEntry = signatureDict.get("Cert");
  if (!certEntry || typeof certEntry !== "object") {
    return 0;
  }

  const entryType = (certEntry as { type?: unknown }).type;
  if (entryType === "array") {
    const length = (certEntry as { length?: unknown }).length;
    return typeof length === "number" ? Math.max(0, length) : 0;
  }
  if (entryType === "string" || entryType === "stream") {
    return 1;
  }

  return 0;
}

function inspectDss(
  pdf: PDF,
  decodedBytes: string,
): SignatureDssReport {
  const markerPresent = /\/DSS\b/.test(decodedBytes);

  try {
    const catalog = pdf.getCatalog();
    const dssDictionary = catalog.getDict("DSS");
    const certificateCount = dssDictionary?.getArray("Certs")?.length ?? 0;
    const ocspCount = dssDictionary?.getArray("OCSPs")?.length ?? 0;
    const crlCount = dssDictionary?.getArray("CRLs")?.length ?? 0;
    const vriEntryCount = countDictionaryEntries(dssDictionary?.getDict("VRI"));

    return {
      present: Boolean(dssDictionary) || markerPresent,
      certificateCount,
      ocspCount,
      crlCount,
      vriEntryCount,
    };
  } catch {
    return {
      present: markerPresent,
      certificateCount: 0,
      ocspCount: 0,
      crlCount: 0,
      vriEntryCount: 0,
    };
  }
}

export async function verifyPdfSignatures(
  bytes: Uint8Array,
): Promise<SignatureVerificationReport> {
  const pdf = await PDF.load(bytes);
  const form = pdf.getForm();
  const signatureFields = form ? form.getSignatureFields() : [];
  const fields = signatureFields.map((field) => ({
    fieldName: field.name,
    signed: field.isSigned(),
  }));
  const byteRanges = parseByteRangeMatches(bytes);
  const decoded = new TextDecoder("latin1").decode(bytes);
  const subFilterPattern = /\/SubFilter\s*\/([A-Za-z0-9.-]+)/g;
  const signingTimePattern = /\/M\s*\((D:[^)]+)\)/g;
  const detectedSubFilters = Array.from(
    decoded.matchAll(subFilterPattern),
    (match) => match[1],
  ).filter((value): value is string => typeof value === "string");
  const signingTimeHints = Array.from(
    decoded.matchAll(signingTimePattern),
    (match) => match[1],
  ).filter((value): value is string => typeof value === "string");
  const timestampTokenCount = countRegexMatches(
    decoded,
    /\/SubFilter\s*\/ETSI\.RFC3161\b/g,
  );
  const documentTimestampCount = countRegexMatches(
    decoded,
    /\/Type\s*\/DocTimeStamp\b/g,
  );
  const dss = inspectDss(pdf, decoded);
  const certificateHintsFromFields = signatureFields.reduce(
    (total, field) => total + estimateCertificateHints(field),
    0,
  );
  const inferredCertificateHints =
    fields.some((field) => field.signed) &&
    detectedSubFilters.some(
      (value) =>
        value === "adbe.pkcs7.detached" ||
        value === "ETSI.CAdES.detached",
    )
      ? 1
      : 0;
  const estimatedCertificateCount = Math.max(
    certificateHintsFromFields,
    dss.certificateCount,
    inferredCertificateHints,
  );
  const hasTimestampEvidence = timestampTokenCount > 0 || documentTimestampCount > 0;
  const hasRevocationData = dss.ocspCount > 0 || dss.crlCount > 0;
  const hasLtvData = dss.present && hasRevocationData && dss.vriEntryCount > 0;
  const signedFieldCount = fields.filter((field) => field.signed).length;
  const intactByteRangeCount = byteRanges.filter((range) => range.intact).length;
  const allSignedFieldsHaveContents =
    signedFieldCount === 0 || intactByteRangeCount >= signedFieldCount;
  const warnings: SignatureVerificationReport["warnings"] = [];

  if (signedFieldCount === 0) {
    warnings.push({
      code: "no_signatures",
      severity: "warning",
      detail: "No signed signature fields detected.",
    });
  }
  if (fields.some((field) => !field.signed)) {
    warnings.push({
      code: "unsigned_fields_present",
      severity: "info",
      detail: "One or more signature fields are present but not signed.",
    });
  }
  if (byteRanges.length > 0 && fields.length === 0) {
    warnings.push({
      code: "orphaned_byte_ranges",
      severity: "warning",
      detail: "ByteRange entries exist but no signature fields were found.",
    });
  }
  if (signedFieldCount > 0 && intactByteRangeCount === 0) {
    warnings.push({
      code: "invalid_byte_ranges",
      severity: "critical",
      detail: "Signed fields exist but no intact ByteRange was detected.",
    });
  } else if (intactByteRangeCount < signedFieldCount) {
    warnings.push({
      code: "partial_byte_ranges",
      severity: "warning",
      detail:
        "Some signatures do not have a matching intact ByteRange segment.",
    });
  }
  if (byteRanges.some((range) => !range.intact)) {
    warnings.push({
      code: "invalid_byte_ranges",
      severity: "warning",
      detail: "At least one ByteRange entry failed structural validation.",
    });
  }
  if (signedFieldCount > 0 && detectedSubFilters.length === 0) {
    warnings.push({
      code: "missing_subfilter",
      severity: "critical",
      detail: "Signature entries do not expose a SubFilter marker.",
    });
  }
  if (
    detectedSubFilters.some(
      (value) =>
        value !== "adbe.pkcs7.detached" &&
        value !== "ETSI.CAdES.detached" &&
        value !== "ETSI.RFC3161",
    )
  ) {
    warnings.push({
      code: "legacy_subfilter",
      severity: "warning",
      detail:
        "One or more signatures use a non-standard or legacy SubFilter.",
    });
  }
  if (signedFieldCount > 0 && !hasTimestampEvidence) {
    warnings.push({
      code: "missing_timestamp",
      severity: "warning",
      detail:
        "No RFC3161 timestamp token or document timestamp was detected.",
    });
  }
  if (signedFieldCount > 0 && estimatedCertificateCount === 0) {
    warnings.push({
      code: "missing_certificate_chain",
      severity: "critical",
      detail:
        "Certificate chain material could not be detected in signature/DSS data.",
    });
  }
  if (signedFieldCount > 0 && !hasRevocationData) {
    warnings.push({
      code: "missing_revocation_data",
      severity: "warning",
      detail:
        "No OCSP or CRL validation material was detected for revocation checking.",
    });
  }
  if (signedFieldCount > 0 && !hasLtvData) {
    warnings.push({
      code: "missing_ltv_data",
      severity: "warning",
      detail:
        "LTV evidence is incomplete (missing DSS/VRI linkage or revocation evidence).",
    });
  }

  return {
    fields,
    byteRanges,
    signedFieldCount,
    intactByteRangeCount,
    detectedSubFilters,
    signingTimeHints,
    timestampTokenCount,
    documentTimestampCount,
    estimatedCertificateCount,
    dss,
    hasRevocationData,
    hasLtvData,
    warnings,
    enterpriseReady:
      signedFieldCount > 0 &&
      allSignedFieldsHaveContents &&
      hasTimestampEvidence &&
      hasRevocationData &&
      hasLtvData &&
      estimatedCertificateCount > 0 &&
      warnings.every((warning) => warning.severity !== "critical"),
    allSignedFieldsHaveContents,
  };
}

export function sortIssuesByNumberPrefix(
  titles: string[],
): Array<{ title: string; order: number | null }> {
  return titles
    .map((title) => ({
      title,
      order: extractLeadingOrderNumber(title),
    }))
    .sort((left, right) => {
      if (left.order === null && right.order === null) return 0;
      if (left.order === null) return 1;
      if (right.order === null) return -1;
      return left.order - right.order;
    });
}
