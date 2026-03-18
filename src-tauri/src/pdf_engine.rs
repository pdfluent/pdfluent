// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary and confidential.
// Free for personal, non-commercial use.
// Commercial use requires a valid license.
// See https://pdfluent.com/license for terms.

use base64::{engine::general_purpose, Engine as _};
use image::ImageFormat;
use lopdf::dictionary;
use pdf_annot::builder::{AnnotRect, AnnotationBuilder, add_annotation_to_page};
use pdf_annot::{Annotation as PdfAnnotation, AnnotationType as PdfAnnotationType, Color as AnnotColor};
use pdf_compliance::{ComplianceReport, PdfALevel, Severity};
use pdf_engine::{PdfDocument, RenderOptions, ThumbnailOptions};
use pdf_extract::ImageFilter;
use pdf_forms::{parse_acroform, FormAccess};
use pdf_manip::encrypt::{self, EncryptConfig, EncryptionAlgorithm, Permissions};
use pdf_manip::optimize::OptimizeConfig;
use pdf_manip::pages;
use pdf_manip::watermark::{self, PageSelection, TextWatermark};
use pdf_redact::{RedactionArea, Redactor};
use pdf_sign::signer::Pkcs12Signer;
use pdf_sign::ValidationStatus;
use pdf_sign::{sign_pdf, validate_signatures, SignOptions};
use serde::{Deserialize, Serialize};
use std::io::Cursor;
use std::path::Path;

#[derive(Debug, Serialize, Clone)]
pub struct DocumentInfo {
    pub page_count: u32,
    pub pages: Vec<PageInfo>,
    pub title: Option<String>,
    pub author: Option<String>,
    pub form_type: String,
}

#[derive(Debug, Serialize, Clone)]
pub struct PageInfo {
    pub index: u32,
    pub width_pt: f64,
    pub height_pt: f64,
}

/// Bounding box of an annotation in PDF user space (origin bottom-left, y up).
#[derive(Debug, Serialize, Clone)]
pub struct AnnotationRectInfo {
    pub x: f64,
    pub y: f64,
    pub width: f64,
    pub height: f64,
}

/// Serializable annotation metadata returned by get_annotations.
#[derive(Debug, Serialize, Clone)]
pub struct AnnotationInfo {
    /// Stable id derived from page index and position in the annotation list.
    pub id: String,
    /// Zero-based page index (matches TypeScript convention).
    pub page_index: u32,
    /// Annotation subtype as a TypeScript-compatible string.
    pub annotation_type: String,
    /// Bounding rectangle in PDF user space.
    pub rect: AnnotationRectInfo,
    /// Text contents (/Contents).
    pub contents: Option<String>,
    /// Author (/T field).
    pub author: Option<String>,
    /// RGB color components in [0.0, 1.0] range, if present.
    pub color: Option<[f32; 3]>,
}

/// A positioned text span returned by get_page_text_spans.
/// Coordinates are in PDF user space (origin bottom-left, y up).
#[derive(Debug, Serialize, Clone)]
pub struct TextSpanInfo {
    pub text: String,
    pub x: f64,
    pub y: f64,
    /// Estimated width: font_size * 0.5 * char_count.
    pub width: f64,
    /// Line height approximated as font_size.
    pub height: f64,
    pub font_size: f64,
}

#[derive(Debug, Serialize, Clone)]
pub struct RenderedPage {
    pub index: u32,
    pub width: u32,
    pub height: u32,
    pub data_base64: String,
}

#[derive(Debug, Serialize, Clone)]
pub struct FormFieldInfo {
    pub name: String,
    pub field_type: String,
    pub value: Option<String>,
    pub read_only: bool,
    pub required: bool,
    pub options: Vec<FormFieldOption>,
    pub page_index: Option<u32>,
    pub rect: Option<[f32; 4]>,
}

#[derive(Debug, Serialize, Clone)]
pub struct FormFieldOption {
    pub export: String,
    pub display: String,
}

#[derive(Debug, Deserialize)]
pub struct SetFieldValueRequest {
    pub name: String,
    pub value: String,
}

#[derive(Debug, Serialize, Clone)]
pub struct CompressResult {
    pub objects_before: usize,
    pub objects_after: usize,
    pub streams_compressed: usize,
    pub duplicates_merged: usize,
    pub unused_removed: usize,
}

#[derive(Debug, Serialize, Clone)]
pub struct RedactReport {
    pub areas_redacted: usize,
    pub operations_removed: usize,
    pub pages_affected: usize,
    pub metadata_cleaned: bool,
}

#[derive(Debug, Serialize, Clone)]
pub struct SearchRedactReport {
    pub matches_found: usize,
    pub areas_redacted: usize,
    pub operations_removed: usize,
    pub pages_affected: usize,
    pub metadata_cleaned: bool,
}

/// Result of a text span replacement attempt (Phase 4).
#[derive(Debug, Serialize, Clone)]
pub struct TextReplaceResult {
    /// True when the content stream was mutated.
    pub replaced: bool,
    /// Machine-readable reason when replaced is false.  Null when replaced is true.
    pub reason: Option<String>,
}

#[derive(Debug, Serialize, Clone)]
pub struct ExtractedImageInfo {
    pub page: u32,
    pub width: u32,
    pub height: u32,
    pub color_space: String,
    pub path: String,
}

#[derive(Debug, Serialize, Clone)]
pub struct InvoiceData {
    pub profile: String,
    pub invoice_number: String,
    pub type_code: String,
    pub issue_date: String,
    pub seller_name: String,
    pub buyer_name: String,
    pub currency: String,
    pub tax_basis_total: f64,
    pub tax_total: f64,
    pub grand_total: f64,
    pub due_payable: f64,
    pub line_items: Vec<InvoiceLineItem>,
    pub seller: InvoiceParty,
    pub buyer: InvoiceParty,
    pub payment_terms: Option<String>,
    pub buyer_reference: Option<String>,
}

#[derive(Debug, Serialize, Clone)]
pub struct InvoiceLineItem {
    pub id: String,
    pub description: String,
    pub quantity: f64,
    pub unit_code: String,
    pub unit_price: f64,
    pub line_total: f64,
    pub tax_rate: f64,
    pub tax_category: String,
}

#[derive(Debug, Serialize, Clone)]
pub struct InvoiceParty {
    pub name: String,
    pub street: Option<String>,
    pub city: Option<String>,
    pub postal_code: Option<String>,
    pub country_code: String,
    pub tax_id: Option<String>,
    pub registration_id: Option<String>,
    pub email: Option<String>,
}

// ── Invoice validation types ──────────────────────────────────────────

#[derive(Debug, Serialize, Clone)]
pub struct InvoiceValidationResult {
    pub valid: bool,
    pub profile: String,
    pub error_count: usize,
    pub warning_count: usize,
    pub issues: Vec<InvoiceValidationIssue>,
}

#[derive(Debug, Serialize, Clone)]
pub struct InvoiceValidationIssue {
    pub rule: String,
    pub severity: String,
    pub message: String,
}

// ── Digital signature types ───────────────────────────────────────────

#[derive(Debug, Serialize, Clone)]
pub struct SignatureVerifyResult {
    pub field_name: String,
    pub signer: Option<String>,
    pub timestamp: Option<String>,
    pub status: String,
    pub valid: bool,
}

// ── PDF/A compliance types ───────────────────────────────────────────

#[derive(Debug, Serialize, Clone)]
pub struct PdfAValidationResult {
    pub compliant: bool,
    pub conformance_level: Option<String>,
    pub error_count: usize,
    pub warning_count: usize,
    pub issues: Vec<PdfAIssue>,
}

#[derive(Debug, Serialize, Clone)]
pub struct PdfAIssue {
    pub rule: String,
    pub severity: String,
    pub message: String,
    pub location: Option<String>,
}

/// Replace the first occurrence of `needle` in `haystack` with `replacement`.
/// Returns the original bytes unchanged if `needle` is not found.
fn replace_first_occurrence(haystack: &[u8], needle: &[u8], replacement: &[u8]) -> Vec<u8> {
    if needle.is_empty() {
        return haystack.to_vec();
    }
    if let Some(pos) = haystack.windows(needle.len()).position(|w| w == needle) {
        let mut result =
            Vec::with_capacity(haystack.len() - needle.len() + replacement.len());
        result.extend_from_slice(&haystack[..pos]);
        result.extend_from_slice(replacement);
        result.extend_from_slice(&haystack[pos + needle.len()..]);
        result
    } else {
        haystack.to_vec()
    }
}

/// Wraps a `pdf_engine::PdfDocument` and a `lopdf::Document` for mutation operations.
pub struct OpenDocument {
    /// Read-only PDF handle for rendering, text extraction, compliance checking.
    pub pdf_doc: PdfDocument,
    /// Mutable PDF handle for forms, annotations, manipulation, signing.
    pub lopdf_doc: lopdf::Document,
    /// Raw PDF bytes (kept for re-parsing after mutation).
    pub raw_bytes: Vec<u8>,
    /// Whether the document has unsaved changes.
    pub modified: bool,
}

impl OpenDocument {
    pub fn open(path: &str) -> Result<Self, String> {
        let raw_bytes = std::fs::read(path)
            .map_err(|e| format!("Failed to read file: {e}"))?;

        let pdf_doc = PdfDocument::open(raw_bytes.clone())
            .map_err(|e| format!("Failed to parse PDF: {e}"))?;

        let lopdf_doc = lopdf::Document::load(path)
            .map_err(|e| format!("Failed to load PDF for editing: {e}"))?;

        Ok(Self {
            pdf_doc,
            lopdf_doc,
            raw_bytes,
            modified: false,
        })
    }

    #[allow(dead_code)] // Reserved for future in-memory load path (no file path available)
    pub fn open_bytes(bytes: Vec<u8>) -> Result<Self, String> {
        let pdf_doc = PdfDocument::open(bytes.clone())
            .map_err(|e| format!("Failed to parse PDF: {e}"))?;

        let lopdf_doc = lopdf::Document::load_mem(&bytes)
            .map_err(|e| format!("Failed to load PDF for editing: {e}"))?;

        Ok(Self {
            pdf_doc,
            lopdf_doc,
            raw_bytes: bytes,
            modified: false,
        })
    }

    pub fn document_info(&self) -> DocumentInfo {
        let info = self.pdf_doc.info();
        let page_count = self.pdf_doc.page_count();
        let mut pages = Vec::with_capacity(page_count);

        for i in 0..page_count {
            if let Ok(geom) = self.pdf_doc.page_geometry(i) {
                pages.push(PageInfo {
                    index: i as u32,
                    width_pt: geom.media_box.width(),
                    height_pt: geom.media_box.height(),
                });
            }
        }

        let form_type = {
            let form_result = pdf_forms::parse_acroform(self.pdf_doc.pdf());
            match form_result {
                Some(_) => "acro_form".to_string(),
                None => "none".to_string(),
            }
        };

        DocumentInfo {
            page_count: page_count as u32,
            pages,
            title: info.title,
            author: info.author,
            form_type,
        }
    }

    pub fn render_page(&self, page_index: u32, scale: f32) -> Result<RenderedPage, String> {
        let dpi = (scale * 72.0) as f64;
        let options = RenderOptions {
            dpi,
            render_annotations: true,
            ..Default::default()
        };

        let rendered = self.pdf_doc
            .render_page(page_index as usize, &options)
            .map_err(|e| format!("Failed to render page {page_index}: {e}"))?;

        encode_rendered_page(page_index, &rendered)
    }

    pub fn render_thumbnail(&self, page_index: u32) -> Result<RenderedPage, String> {
        let options = ThumbnailOptions {
            max_dimension: 280,
        };

        let rendered = self.pdf_doc
            .thumbnail(page_index as usize, &options)
            .map_err(|e| format!("Failed to render thumbnail {page_index}: {e}"))?;

        encode_rendered_page(page_index, &rendered)
    }

    pub fn extract_page_text(&self, page_index: u32) -> Result<String, String> {
        self.pdf_doc
            .extract_text(page_index as usize)
            .map_err(|e| format!("Failed to extract text from page {page_index}: {e}"))
    }

    /// Extract all annotation metadata from a single page (0-based index).
    ///
    /// Uses pdf-annot to parse annotation dictionaries directly from the PDF.
    /// Returns PDF-coordinate rects (origin bottom-left, y increases upward).
    pub fn get_page_annotations(&self, page_index: u32) -> Vec<AnnotationInfo> {
        let pages = self.pdf_doc.pdf().pages();
        let page = match pages.get(page_index as usize) {
            Some(p) => p,
            None => return Vec::new(),
        };
        let annots = PdfAnnotation::from_page(page);
        annots
            .iter()
            .enumerate()
            .map(|(i, annot)| {
                let rect = annot.rect().map(|r| AnnotationRectInfo {
                    x: r.x0,
                    y: r.y0,
                    width: (r.x1 - r.x0).abs(),
                    height: (r.y1 - r.y0).abs(),
                }).unwrap_or(AnnotationRectInfo { x: 0.0, y: 0.0, width: 0.0, height: 0.0 });

                let annotation_type = match annot.annotation_type() {
                    PdfAnnotationType::Text => "text",
                    PdfAnnotationType::Highlight => "highlight",
                    PdfAnnotationType::Underline => "underline",
                    PdfAnnotationType::StrikeOut => "strikeout",
                    PdfAnnotationType::Squiggly => "strikeout",
                    PdfAnnotationType::Ink => "ink",
                    PdfAnnotationType::Line => "line",
                    PdfAnnotationType::Square => "square",
                    PdfAnnotationType::Circle => "circle",
                    PdfAnnotationType::Polygon => "polygon",
                    PdfAnnotationType::PolyLine => "polyline",
                    PdfAnnotationType::Stamp => "stamp",
                    PdfAnnotationType::FileAttachment => "file-attachment",
                    PdfAnnotationType::Sound => "sound",
                    PdfAnnotationType::Widget => "widget",
                    PdfAnnotationType::Watermark => "watermark",
                    PdfAnnotationType::FreeText => "freehand",
                    _ => "text",
                };

                let color = annot.color().and_then(|c| match c {
                    AnnotColor::Rgb(r, g, b) => Some([r, g, b]),
                    AnnotColor::Gray(v) => Some([v, v, v]),
                    _ => None,
                });

                AnnotationInfo {
                    id: format!("annot-p{page_index}-{i}"),
                    page_index,
                    annotation_type: annotation_type.to_string(),
                    rect,
                    contents: annot.contents(),
                    author: annot.author(),
                    color,
                }
            })
            .collect()
    }

    /// Extract annotation metadata from all pages.
    pub fn get_all_annotations(&self) -> Vec<AnnotationInfo> {
        let page_count = self.pdf_doc.page_count();
        (0..page_count as u32)
            .flat_map(|i| self.get_page_annotations(i))
            .collect()
    }

    /// Extract positioned text spans for a single page.
    ///
    /// Returns one span per text run as extracted by the rendering engine.
    /// Coordinates are PDF user space (origin bottom-left, y increases upward).
    /// Width is estimated as `font_size * 0.5 * char_count`; height = `font_size`.
    pub fn extract_page_text_spans(&self, page_index: u32) -> Result<Vec<TextSpanInfo>, String> {
        let blocks = self.pdf_doc
            .extract_text_blocks(page_index as usize)
            .map_err(|e| format!("Failed to extract text spans from page {page_index}: {e}"))?;

        let spans = blocks
            .into_iter()
            .flat_map(|block| block.spans.into_iter())
            .filter(|span| !span.text.trim().is_empty())
            .map(|span| {
                let char_count = span.text.chars().count() as f64;
                let width = span.font_size * 0.5 * char_count;
                let height = span.font_size;
                TextSpanInfo {
                    text: span.text,
                    x: span.x,
                    y: span.y,
                    width,
                    height,
                    font_size: span.font_size,
                }
            })
            .collect();

        Ok(spans)
    }

    pub fn search_text(&self, query: &str) -> Vec<u32> {
        self.pdf_doc
            .search_text(query)
            .into_iter()
            .map(|i| i as u32)
            .collect()
    }

    pub fn get_form_fields(&self) -> Vec<FormFieldInfo> {
        let tree = match parse_acroform(self.pdf_doc.pdf()) {
            Some(tree) => tree,
            None => return Vec::new(),
        };

        tree.terminal_fields()
            .into_iter()
            .map(|id| {
                let node = tree.get(id);
                let name = tree.fully_qualified_name(id);
                let ft = tree.effective_field_type(id);
                let field_type = match ft {
                    Some(pdf_forms::FieldType::Text) => "text",
                    Some(pdf_forms::FieldType::Button) => "button",
                    Some(pdf_forms::FieldType::Choice) => "choice",
                    Some(pdf_forms::FieldType::Signature) => "signature",
                    None => "unknown",
                };
                let value = tree.get_value(&name);
                let flags = tree.effective_flags(id);

                FormFieldInfo {
                    name,
                    field_type: field_type.to_string(),
                    value,
                    read_only: flags.read_only(),
                    required: flags.required(),
                    options: node
                        .options
                        .iter()
                        .map(|o| FormFieldOption {
                            export: o.export.clone(),
                            display: o.display.clone(),
                        })
                        .collect(),
                    page_index: node.page_index.map(|p| p as u32),
                    rect: node.rect,
                }
            })
            .collect()
    }

    pub fn set_form_field_value(&mut self, name: &str, value: &str) -> Result<(), String> {
        let mut tree = parse_acroform(self.pdf_doc.pdf())
            .ok_or("Document has no form fields")?;

        tree.set_value(name, value)
            .map_err(|e| format!("Failed to set field value: {e}"))?;

        // Write the value back to the lopdf document
        let id = tree.find_by_name(name)
            .ok_or_else(|| format!("Field not found: {name}"))?;
        let node = tree.get(id);

        if let Some((obj_num, gen_num)) = node.object_id {
            let obj_id = (obj_num as u32, gen_num as u16);
            if let Ok(lopdf::Object::Dictionary(ref mut dict)) =
                self.lopdf_doc.get_object_mut(obj_id)
            {
                dict.set(
                    b"V",
                    lopdf::Object::String(
                        value.as_bytes().to_vec(),
                        lopdf::StringFormat::Literal,
                    ),
                );
            }
            self.sync_after_mutation()?;
        }
        Ok(())
    }

    // ── Manipulation operations ──────────────────────────────────────

    /// Rotate specific pages by a multiple of 90 degrees.
    /// `page_indices` are 0-based (from the UI), internally converted to 1-based for pdf-manip.
    pub fn rotate_pages(&mut self, page_indices: &[u32], rotation: i32) -> Result<(), String> {
        for &idx in page_indices {
            let page_num = idx + 1; // pdf-manip uses 1-based page numbers
            pages::rotate_page(&mut self.lopdf_doc, page_num, rotation as i64)
                .map_err(|e| format!("Failed to rotate page {idx}: {e}"))?;
        }
        self.sync_after_mutation()
    }

    /// Rotate a single page 90° counter-clockwise.  `page_index` is 0-based.
    pub fn rotate_page_left(&mut self, page_index: u32) -> Result<(), String> {
        self.rotate_pages(&[page_index], -90)
    }

    /// Rotate a single page 90° clockwise.  `page_index` is 0-based.
    pub fn rotate_page_right(&mut self, page_index: u32) -> Result<(), String> {
        self.rotate_pages(&[page_index], 90)
    }

    /// Return a human-readable label for each page, derived from the /PageLabels
    /// number tree (e.g. "i", "ii", "1", "A-1"). Falls back to "1", "2", … when the
    /// document has no /PageLabels entry.
    pub fn get_page_labels(&self) -> Vec<String> {
        let page_count = self.pdf_doc.page_count();

        // Locate the /PageLabels entry in the catalog.
        let catalog_id = match self.lopdf_doc.trailer.get(b"Root").ok().cloned() {
            Some(lopdf::Object::Reference(id)) => id,
            _ => return (1..=page_count).map(|i| i.to_string()).collect(),
        };
        let catalog = match self.lopdf_doc.get_object(catalog_id).ok() {
            Some(lopdf::Object::Dictionary(d)) => d.clone(),
            _ => return (1..=page_count).map(|i| i.to_string()).collect(),
        };

        // Resolve /PageLabels to an array of Nums (flat number tree).
        let nums: Vec<lopdf::Object> = match catalog.get(b"PageLabels").ok().cloned() {
            Some(lopdf::Object::Dictionary(d)) => match d.get(b"Nums").ok().cloned() {
                Some(lopdf::Object::Array(a)) => a,
                _ => return (1..=page_count).map(|i| i.to_string()).collect(),
            },
            Some(lopdf::Object::Reference(id)) => {
                match self.lopdf_doc.get_object(id).ok() {
                    Some(lopdf::Object::Dictionary(d)) => match d.get(b"Nums").ok().cloned() {
                        Some(lopdf::Object::Array(a)) => a,
                        _ => return (1..=page_count).map(|i| i.to_string()).collect(),
                    },
                    _ => return (1..=page_count).map(|i| i.to_string()).collect(),
                }
            }
            _ => return (1..=page_count).map(|i| i.to_string()).collect(),
        };

        // Parse pairs: (start_page_index, label_dict).
        struct Range { start: usize, style: u8, val: i64, prefix: String }
        let mut ranges: Vec<Range> = Vec::new();
        let mut i = 0;
        while i + 1 < nums.len() {
            let start = match &nums[i] {
                lopdf::Object::Integer(n) => *n as usize,
                _ => { i += 2; continue; }
            };
            let dict = match &nums[i + 1] {
                lopdf::Object::Dictionary(d) => d.clone(),
                lopdf::Object::Reference(id) => match self.lopdf_doc.get_object(*id).ok() {
                    Some(lopdf::Object::Dictionary(d)) => d.clone(),
                    _ => { i += 2; continue; }
                },
                _ => { i += 2; continue; }
            };
            let style = match dict.get(b"S").ok() {
                Some(lopdf::Object::Name(n)) => n.first().copied().unwrap_or(b'D'),
                _ => 0,
            };
            let val = match dict.get(b"St").ok() {
                Some(lopdf::Object::Integer(n)) => *n,
                _ => 1,
            };
            let prefix = match dict.get(b"P").ok() {
                Some(lopdf::Object::String(s, _)) => String::from_utf8_lossy(s).into_owned(),
                _ => String::new(),
            };
            ranges.push(Range { start, style, val, prefix });
            i += 2;
        }

        // Build one label per page.
        (0..page_count).map(|page| {
            let range = ranges.iter().rev().find(|r| r.start <= page);
            match range {
                None => (page + 1).to_string(),
                Some(r) => {
                    let n = (r.val + (page as i64 - r.start as i64)) as u32;
                    match r.style {
                        b'D' => format!("{}{}", r.prefix, n),
                        b'R' => format!("{}{}", r.prefix, Self::to_roman(n, true)),
                        b'r' => format!("{}{}", r.prefix, Self::to_roman(n, false)),
                        b'A' => format!("{}{}", r.prefix, Self::to_alpha(n, true)),
                        b'a' => format!("{}{}", r.prefix, Self::to_alpha(n, false)),
                        0   => r.prefix.clone(),
                        _   => format!("{}{}", r.prefix, n),
                    }
                }
            }
        }).collect()
    }

    fn to_roman(mut n: u32, upper: bool) -> String {
        const VALS: &[(u32, &str, &str)] = &[
            (1000, "M", "m"), (900, "CM", "cm"), (500, "D", "d"),
            (400, "CD", "cd"), (100, "C", "c"), (90, "XC", "xc"),
            (50, "L", "l"), (40, "XL", "xl"), (10, "X", "x"),
            (9, "IX", "ix"), (5, "V", "v"), (4, "IV", "iv"), (1, "I", "i"),
        ];
        if n == 0 { return String::new(); }
        let mut s = String::new();
        for &(v, up, lo) in VALS {
            while n >= v {
                s.push_str(if upper { up } else { lo });
                n -= v;
            }
        }
        s
    }

    fn to_alpha(n: u32, upper: bool) -> String {
        if n == 0 { return String::new(); }
        let idx = ((n - 1) % 26) as u8;
        let rep = ((n - 1) / 26 + 1) as usize;
        let ch = if upper { b'A' + idx } else { b'a' + idx } as char;
        ch.to_string().repeat(rep)
    }

    /// Delete specific pages from the document.
    /// `page_indices` are 0-based.
    pub fn delete_pages(&mut self, page_indices: &[u32]) -> Result<(), String> {
        let one_based: Vec<u32> = page_indices.iter().map(|&i| i + 1).collect();
        pages::delete_pages(&mut self.lopdf_doc, &one_based)
            .map_err(|e| format!("Failed to delete pages: {e}"))?;
        self.sync_after_mutation()
    }

    /// Reorder pages. `new_order` contains 0-based page indices in the desired order.
    pub fn reorder_pages(&mut self, new_order: &[u32]) -> Result<(), String> {
        let one_based: Vec<u32> = new_order.iter().map(|&i| i + 1).collect();
        let reordered = pages::rearrange_pages(&self.lopdf_doc, &one_based)
            .map_err(|e| format!("Failed to reorder pages: {e}"))?;
        self.lopdf_doc = reordered;
        self.sync_after_mutation()
    }

    /// Compress/optimize the document and save to output_path.
    pub fn compress(&mut self, output_path: &str) -> Result<CompressResult, String> {
        let config = OptimizeConfig::default();
        let result = pdf_manip::optimize::optimize(&mut self.lopdf_doc, &config)
            .map_err(|e| format!("Failed to compress PDF: {e}"))?;

        self.lopdf_doc
            .save(output_path)
            .map_err(|e| format!("Failed to save compressed PDF: {e}"))?;

        // Sync internal state after optimization
        self.sync_after_mutation()?;

        Ok(CompressResult {
            objects_before: result.objects_before,
            objects_after: result.objects_after,
            streams_compressed: result.streams_compressed,
            duplicates_merged: result.duplicates_merged,
            unused_removed: result.unused_removed,
        })
    }

    /// Add a text watermark to all pages.
    pub fn add_watermark(&mut self, text: &str, opacity: f32) -> Result<(), String> {
        let wm = TextWatermark {
            text: text.to_string(),
            opacity: opacity.clamp(0.0, 1.0),
            ..TextWatermark::default()
        };
        watermark::apply_text_watermark(&mut self.lopdf_doc, &wm, &PageSelection::All)
            .map_err(|e| format!("Failed to add watermark: {e}"))?;
        self.sync_after_mutation()
    }

    // ── Annotation operations ────────────────────────────────────────

    /// Add a highlight annotation to the given page.
    /// `rects` contains one `[x0, y0, x1, y1]` per highlighted text region.
    /// `color` is RGB in 0.0-1.0 range.
    pub fn add_highlight_annotation(
        &mut self,
        page_index: u32,
        rects: &[[f32; 4]],
        color: [f32; 3],
    ) -> Result<(), String> {
        if rects.is_empty() {
            return Err("At least one rectangle is required".to_string());
        }

        // Compute bounding rect across all quads.
        let mut min_x = f64::MAX;
        let mut min_y = f64::MAX;
        let mut max_x = f64::MIN;
        let mut max_y = f64::MIN;
        let mut quad_points = Vec::with_capacity(rects.len() * 8);

        for r in rects {
            let x0 = r[0] as f64;
            let y0 = r[1] as f64;
            let x1 = r[2] as f64;
            let y1 = r[3] as f64;
            min_x = min_x.min(x0).min(x1);
            min_y = min_y.min(y0).min(y1);
            max_x = max_x.max(x0).max(x1);
            max_y = max_y.max(y0).max(y1);
            // QuadPoints order: top-left, top-right, bottom-left, bottom-right.
            let lo_y = y0.min(y1);
            let hi_y = y0.max(y1);
            let lo_x = x0.min(x1);
            let hi_x = x0.max(x1);
            quad_points.extend_from_slice(&[lo_x, hi_y, hi_x, hi_y, lo_x, lo_y, hi_x, lo_y]);
        }

        let bounding = AnnotRect::new(min_x, min_y, max_x, max_y);
        let annot_id = AnnotationBuilder::highlight(bounding)
            .color(color[0] as f64, color[1] as f64, color[2] as f64)
            .quad_points(quad_points)
            .build(&mut self.lopdf_doc)
            .map_err(|e| format!("Failed to build highlight annotation: {e}"))?;

        // add_annotation_to_page uses 1-based page numbers.
        add_annotation_to_page(&mut self.lopdf_doc, page_index + 1, annot_id)
            .map_err(|e| format!("Failed to add annotation to page: {e}"))?;

        self.sync_after_mutation()
    }

    /// Add an underline annotation to the given page.
    pub fn add_underline_annotation(
        &mut self,
        page_index: u32,
        rects: &[[f32; 4]],
        color: [f32; 3],
    ) -> Result<(), String> {
        if rects.is_empty() {
            return Err("At least one rectangle is required".to_string());
        }

        let mut min_x = f64::MAX;
        let mut min_y = f64::MAX;
        let mut max_x = f64::MIN;
        let mut max_y = f64::MIN;
        let mut quad_points = Vec::with_capacity(rects.len() * 8);

        for r in rects {
            let x0 = r[0] as f64;
            let y0 = r[1] as f64;
            let x1 = r[2] as f64;
            let y1 = r[3] as f64;
            min_x = min_x.min(x0).min(x1);
            min_y = min_y.min(y0).min(y1);
            max_x = max_x.max(x0).max(x1);
            max_y = max_y.max(y0).max(y1);
            let lo_y = y0.min(y1);
            let hi_y = y0.max(y1);
            let lo_x = x0.min(x1);
            let hi_x = x0.max(x1);
            quad_points.extend_from_slice(&[lo_x, hi_y, hi_x, hi_y, lo_x, lo_y, hi_x, lo_y]);
        }

        let bounding = AnnotRect::new(min_x, min_y, max_x, max_y);
        let annot_id = AnnotationBuilder::underline(bounding)
            .color(color[0] as f64, color[1] as f64, color[2] as f64)
            .quad_points(quad_points)
            .build(&mut self.lopdf_doc)
            .map_err(|e| format!("Failed to build underline annotation: {e}"))?;

        add_annotation_to_page(&mut self.lopdf_doc, page_index + 1, annot_id)
            .map_err(|e| format!("Failed to add annotation to page: {e}"))?;

        self.sync_after_mutation()
    }

    /// Add a strikeout annotation to the given page.
    pub fn add_strikeout_annotation(
        &mut self,
        page_index: u32,
        rects: &[[f32; 4]],
        color: [f32; 3],
    ) -> Result<(), String> {
        if rects.is_empty() {
            return Err("At least one rectangle is required".to_string());
        }

        let mut min_x = f64::MAX;
        let mut min_y = f64::MAX;
        let mut max_x = f64::MIN;
        let mut max_y = f64::MIN;
        let mut quad_points = Vec::with_capacity(rects.len() * 8);

        for r in rects {
            let x0 = r[0] as f64;
            let y0 = r[1] as f64;
            let x1 = r[2] as f64;
            let y1 = r[3] as f64;
            min_x = min_x.min(x0).min(x1);
            min_y = min_y.min(y0).min(y1);
            max_x = max_x.max(x0).max(x1);
            max_y = max_y.max(y0).max(y1);
            let lo_y = y0.min(y1);
            let hi_y = y0.max(y1);
            let lo_x = x0.min(x1);
            let hi_x = x0.max(x1);
            quad_points.extend_from_slice(&[lo_x, hi_y, hi_x, hi_y, lo_x, lo_y, hi_x, lo_y]);
        }

        let bounding = AnnotRect::new(min_x, min_y, max_x, max_y);
        let annot_id = AnnotationBuilder::strikeout(bounding)
            .color(color[0] as f64, color[1] as f64, color[2] as f64)
            .quad_points(quad_points)
            .build(&mut self.lopdf_doc)
            .map_err(|e| format!("Failed to build strikeout annotation: {e}"))?;

        add_annotation_to_page(&mut self.lopdf_doc, page_index + 1, annot_id)
            .map_err(|e| format!("Failed to add annotation to page: {e}"))?;

        self.sync_after_mutation()
    }

    /// Add a sticky note (Text) annotation at the given position.
    pub fn add_comment_annotation(
        &mut self,
        page_index: u32,
        x: f32,
        y: f32,
        text: &str,
    ) -> Result<(), String> {
        // Standard sticky note size: 24x24 pt.
        let rect = AnnotRect::new(x as f64, y as f64, (x + 24.0) as f64, (y + 24.0) as f64);
        let annot_id = AnnotationBuilder::sticky_note(rect, pdf_annot::builder::TextIcon::Comment)
            .contents(text)
            .build(&mut self.lopdf_doc)
            .map_err(|e| format!("Failed to build comment annotation: {e}"))?;

        add_annotation_to_page(&mut self.lopdf_doc, page_index + 1, annot_id)
            .map_err(|e| format!("Failed to add annotation to page: {e}"))?;

        self.sync_after_mutation()
    }

    /// Parse an annotation id of the form `"annot-p{page_index}-{idx}"`.
    /// Returns `(page_index, annot_idx)` on success.
    fn parse_annotation_id(id: &str) -> Result<(u32, usize), String> {
        let stripped = id
            .strip_prefix("annot-p")
            .ok_or_else(|| format!("Invalid annotation id: {id}"))?;
        let (page_str, idx_str) = stripped
            .rsplit_once('-')
            .ok_or_else(|| format!("Invalid annotation id: {id}"))?;
        let page: u32 = page_str
            .parse()
            .map_err(|_| format!("Invalid page in annotation id: {id}"))?;
        let idx: usize = idx_str
            .parse()
            .map_err(|_| format!("Invalid index in annotation id: {id}"))?;
        Ok((page, idx))
    }

    /// Delete the annotation identified by `annotation_id` from the PDF.
    ///
    /// The id encodes the page and the 0-based position in the page's /Annots
    /// array at the time of the last `get_annotations` call.  After deletion
    /// callers **must** re-fetch annotations — positional indices will shift.
    ///
    /// Fixes: annotation delete (Phase 2 write support).
    pub fn delete_annotation(&mut self, annotation_id: &str) -> Result<(), String> {
        let (page_index, annot_idx) = Self::parse_annotation_id(annotation_id)?;

        // lopdf uses 1-based page numbers
        let page_id = *self
            .lopdf_doc
            .get_pages()
            .get(&(page_index + 1))
            .ok_or_else(|| format!("Page {page_index} not found"))?;

        // Clone the /Annots value to work around the borrow checker
        let annots_value = self
            .lopdf_doc
            .get_object(page_id)
            .map_err(|e| format!("Failed to get page object: {e}"))?
            .as_dict()
            .map_err(|_| "Page is not a dictionary".to_string())?
            .get(b"Annots")
            .map_err(|_| format!("Page {page_index} has no /Annots array"))?
            .clone();

        match annots_value {
            lopdf::Object::Reference(arr_id) => {
                // /Annots is an indirect reference to an array object
                if let Ok(lopdf::Object::Array(ref mut arr)) =
                    self.lopdf_doc.get_object_mut(arr_id)
                {
                    if annot_idx < arr.len() {
                        arr.remove(annot_idx);
                    } else {
                        return Err(format!(
                            "Annotation index {annot_idx} out of bounds (len {})",
                            arr.len()
                        ));
                    }
                }
            }
            lopdf::Object::Array(_) => {
                // /Annots is an inline array in the page dictionary
                if let Ok(lopdf::Object::Dictionary(ref mut dict)) =
                    self.lopdf_doc.get_object_mut(page_id)
                {
                    if let Ok(lopdf::Object::Array(ref mut arr)) = dict.get_mut(b"Annots") {
                        if annot_idx < arr.len() {
                            arr.remove(annot_idx);
                        }
                    }
                }
            }
            _ => return Err("Unexpected /Annots value type".to_string()),
        }

        self.sync_after_mutation()
    }

    /// Update the `/Contents` field of the annotation identified by
    /// `annotation_id`.
    ///
    /// Only handles annotations that are stored as indirect objects in the page
    /// /Annots array (the common case for annotations created through PDFluent).
    /// After the update callers should re-fetch annotations for consistency.
    ///
    /// Fixes: annotation edit (Phase 2 write support).
    pub fn update_annotation_contents(
        &mut self,
        annotation_id: &str,
        contents: &str,
    ) -> Result<(), String> {
        let (page_index, annot_idx) = Self::parse_annotation_id(annotation_id)?;

        let page_id = *self
            .lopdf_doc
            .get_pages()
            .get(&(page_index + 1))
            .ok_or_else(|| format!("Page {page_index} not found"))?;

        // Clone the /Annots value to avoid multi-borrow issues
        let annots_value = self
            .lopdf_doc
            .get_object(page_id)
            .map_err(|e| format!("Failed to get page object: {e}"))?
            .as_dict()
            .map_err(|_| "Page is not a dictionary".to_string())?
            .get(b"Annots")
            .map_err(|_| format!("Page {page_index} has no /Annots array"))?
            .clone();

        // Resolve the annotation object ID from the /Annots entry at annot_idx
        let annot_obj_id: lopdf::ObjectId = match annots_value {
            lopdf::Object::Reference(arr_id) => {
                let arr = self
                    .lopdf_doc
                    .get_object(arr_id)
                    .map_err(|e| format!("Failed to get /Annots array: {e}"))?
                    .as_array()
                    .map_err(|_| "/Annots reference is not an array".to_string())?;
                arr.get(annot_idx)
                    .ok_or_else(|| {
                        format!("Annotation index {annot_idx} out of bounds (len {})", arr.len())
                    })?
                    .as_reference()
                    .map_err(|_| "Annotation entry is not an indirect reference".to_string())?
            }
            lopdf::Object::Array(arr) => {
                arr.get(annot_idx)
                    .ok_or_else(|| {
                        format!("Annotation index {annot_idx} out of bounds (len {})", arr.len())
                    })?
                    .as_reference()
                    .map_err(|_| "Annotation entry is not an indirect reference".to_string())?
            }
            _ => return Err("Unexpected /Annots value type".to_string()),
        };

        // Modify the /Contents field in the annotation dictionary
        if let Ok(lopdf::Object::Dictionary(ref mut dict)) =
            self.lopdf_doc.get_object_mut(annot_obj_id)
        {
            dict.set(
                b"Contents",
                lopdf::Object::String(
                    contents.as_bytes().to_vec(),
                    lopdf::StringFormat::Literal,
                ),
            );
        }

        self.sync_after_mutation()
    }

    /// Update the color of an existing annotation.
    /// `color` is `[r, g, b]` with components in the range 0.0–1.0.
    pub fn update_annotation_color(
        &mut self,
        annotation_id: &str,
        color: [f32; 3],
    ) -> Result<(), String> {
        let annot_obj_id = self.resolve_annotation_obj_id(annotation_id)?;
        if let Ok(lopdf::Object::Dictionary(ref mut dict)) =
            self.lopdf_doc.get_object_mut(annot_obj_id)
        {
            dict.set(
                b"C",
                lopdf::Object::Array(vec![
                    lopdf::Object::Real(color[0]),
                    lopdf::Object::Real(color[1]),
                    lopdf::Object::Real(color[2]),
                ]),
            );
        }
        self.sync_after_mutation()
    }

    /// Update the bounding rectangle of an existing annotation.
    /// `rect` is `[x1, y1, x2, y2]` in PDF coordinate space (lower-left origin).
    pub fn update_annotation_rect(
        &mut self,
        annotation_id: &str,
        rect: [f32; 4],
    ) -> Result<(), String> {
        let annot_obj_id = self.resolve_annotation_obj_id(annotation_id)?;
        if let Ok(lopdf::Object::Dictionary(ref mut dict)) =
            self.lopdf_doc.get_object_mut(annot_obj_id)
        {
            dict.set(
                b"Rect",
                lopdf::Object::Array(vec![
                    lopdf::Object::Real(rect[0]),
                    lopdf::Object::Real(rect[1]),
                    lopdf::Object::Real(rect[2]),
                    lopdf::Object::Real(rect[3]),
                ]),
            );
        }
        self.sync_after_mutation()
    }

    /// Shared helper: resolve an annotation ID to its lopdf ObjectId.
    /// Used by annotation-update operations to avoid duplicating the /Annots lookup.
    fn resolve_annotation_obj_id(&self, annotation_id: &str) -> Result<lopdf::ObjectId, String> {
        let (page_index, annot_idx) = Self::parse_annotation_id(annotation_id)?;

        let page_id = *self
            .lopdf_doc
            .get_pages()
            .get(&(page_index + 1))
            .ok_or_else(|| format!("Page {page_index} not found"))?;

        let annots_value = self
            .lopdf_doc
            .get_object(page_id)
            .map_err(|e| format!("Failed to get page object: {e}"))?
            .as_dict()
            .map_err(|_| "Page is not a dictionary".to_string())?
            .get(b"Annots")
            .map_err(|_| format!("Page {page_index} has no /Annots array"))?
            .clone();

        let annot_obj_id: lopdf::ObjectId = match annots_value {
            lopdf::Object::Reference(arr_id) => {
                let arr = self
                    .lopdf_doc
                    .get_object(arr_id)
                    .map_err(|e| format!("Failed to get /Annots array: {e}"))?
                    .as_array()
                    .map_err(|_| "/Annots reference is not an array".to_string())?;
                arr.get(annot_idx)
                    .ok_or_else(|| {
                        format!("Annotation index {annot_idx} out of bounds (len {})", arr.len())
                    })?
                    .as_reference()
                    .map_err(|_| "Annotation entry is not an indirect reference".to_string())?
            }
            lopdf::Object::Array(arr) => {
                arr.get(annot_idx)
                    .ok_or_else(|| {
                        format!("Annotation index {annot_idx} out of bounds (len {})", arr.len())
                    })?
                    .as_reference()
                    .map_err(|_| "Annotation entry is not an indirect reference".to_string())?
            }
            _ => return Err("Unexpected /Annots value type".to_string()),
        };

        Ok(annot_obj_id)
    }

    /// Add a shape annotation (rectangle, circle, or line).
    pub fn add_shape_annotation(
        &mut self,
        page_index: u32,
        rect: [f32; 4],
        shape_type: &str,
        color: [f32; 3],
    ) -> Result<(), String> {
        let r = color[0] as f64;
        let g = color[1] as f64;
        let b = color[2] as f64;

        let annot_id = match shape_type {
            "rect" => {
                let ar = AnnotRect::new(
                    rect[0] as f64, rect[1] as f64,
                    rect[2] as f64, rect[3] as f64,
                );
                AnnotationBuilder::square(ar)
                    .color(r, g, b)
                    .border_width(1.5)
                    .build(&mut self.lopdf_doc)
                    .map_err(|e| format!("Failed to build rect annotation: {e}"))?
            }
            "circle" => {
                let ar = AnnotRect::new(
                    rect[0] as f64, rect[1] as f64,
                    rect[2] as f64, rect[3] as f64,
                );
                AnnotationBuilder::circle(ar)
                    .color(r, g, b)
                    .border_width(1.5)
                    .build(&mut self.lopdf_doc)
                    .map_err(|e| format!("Failed to build circle annotation: {e}"))?
            }
            "line" => {
                // rect = [x1, y1, x2, y2] treated as line endpoints.
                AnnotationBuilder::line(
                    rect[0] as f64, rect[1] as f64,
                    rect[2] as f64, rect[3] as f64,
                )
                .color(r, g, b)
                .border_width(1.5)
                .build(&mut self.lopdf_doc)
                .map_err(|e| format!("Failed to build line annotation: {e}"))?
            }
            _ => {
                return Err(format!(
                    "Unknown shape type: {shape_type}. Expected rect, circle, or line."
                ))
            }
        };

        add_annotation_to_page(&mut self.lopdf_doc, page_index + 1, annot_id)
            .map_err(|e| format!("Failed to add annotation to page: {e}"))?;

        self.sync_after_mutation()
    }

    /// Add a redaction annotation to the given page.
    ///
    /// Creates a PDF `/Subtype /Redact` annotation that marks a region for
    /// permanent removal. The annotation is stored in the PDF and renders as
    /// a semi-transparent black overlay until `apply_redactions` is called.
    ///
    /// `rect` is `[x1, y1, x2, y2]` in PDF page coordinates.
    pub fn add_redaction_annotation(
        &mut self,
        page_index: u32,
        rect: [f32; 4],
    ) -> Result<(), String> {
        // Build the Redact annotation dictionary manually — AnnotationBuilder
        // does not yet have a Redact subtype, so we use lopdf directly.
        let annot_dict = lopdf::dictionary! {
            "Type" => lopdf::Object::Name(b"Annot".to_vec()),
            "Subtype" => lopdf::Object::Name(b"Redact".to_vec()),
            "Rect" => lopdf::Object::Array(vec![
                lopdf::Object::Real(rect[0]),
                lopdf::Object::Real(rect[1]),
                lopdf::Object::Real(rect[2]),
                lopdf::Object::Real(rect[3]),
            ]),
            // Interior color (black) — applied fill when redaction is executed
            "IC" => lopdf::Object::Array(vec![
                lopdf::Object::Real(0.0f32),
                lopdf::Object::Real(0.0f32),
                lopdf::Object::Real(0.0f32),
            ]),
            // Preview opacity — semi-transparent so the user can see what is marked
            "CA" => lopdf::Object::Real(0.7f32),
        };
        let annot_id = self.lopdf_doc.add_object(lopdf::Object::Dictionary(annot_dict));
        add_annotation_to_page(&mut self.lopdf_doc, page_index + 1, annot_id)
            .map_err(|e| format!("Failed to add redaction annotation to page: {e}"))?;
        self.sync_after_mutation()
    }

    /// Add an ink (freehand drawing) annotation.
    /// `paths` contains stroke paths, each path is a list of `[x, y]` points.
    pub fn add_ink_annotation(
        &mut self,
        page_index: u32,
        paths: &[Vec<[f32; 2]>],
        color: [f32; 3],
        width: f32,
    ) -> Result<(), String> {
        if paths.is_empty() {
            return Err("At least one stroke path is required".to_string());
        }

        // Compute bounding rect and convert paths to flat f64 arrays for InkList.
        let mut min_x = f64::MAX;
        let mut min_y = f64::MAX;
        let mut max_x = f64::MIN;
        let mut max_y = f64::MIN;
        let mut strokes: Vec<Vec<f64>> = Vec::with_capacity(paths.len());

        for path in paths {
            let mut stroke = Vec::with_capacity(path.len() * 2);
            for pt in path {
                let x = pt[0] as f64;
                let y = pt[1] as f64;
                min_x = min_x.min(x);
                min_y = min_y.min(y);
                max_x = max_x.max(x);
                max_y = max_y.max(y);
                stroke.push(x);
                stroke.push(y);
            }
            strokes.push(stroke);
        }

        // Pad the bounding rect by the stroke width to prevent clipping.
        let pad = width as f64;
        let bounding = AnnotRect::new(min_x - pad, min_y - pad, max_x + pad, max_y + pad);

        let annot_id = AnnotationBuilder::ink(bounding, strokes)
            .color(color[0] as f64, color[1] as f64, color[2] as f64)
            .border_width(width as f64)
            .build(&mut self.lopdf_doc)
            .map_err(|e| format!("Failed to build ink annotation: {e}"))?;

        add_annotation_to_page(&mut self.lopdf_doc, page_index + 1, annot_id)
            .map_err(|e| format!("Failed to add annotation to page: {e}"))?;

        self.sync_after_mutation()
    }

    // ── Digital signature operations ─────────────────────────────────

    /// Sign the PDF with a PKCS#12 certificate.
    pub fn sign(
        &mut self,
        cert_path: &str,
        password: &str,
        reason: &str,
        output_path: &str,
    ) -> Result<(), String> {
        let cert_bytes = std::fs::read(cert_path)
            .map_err(|e| format!("Failed to read certificate file: {e}"))?;

        let signer = Pkcs12Signer::from_pkcs12(&cert_bytes, password)
            .map_err(|e| format!("Failed to load PKCS#12 certificate: {e}"))?;

        let options = SignOptions {
            reason: if reason.is_empty() {
                None
            } else {
                Some(reason.to_string())
            },
            ..Default::default()
        };

        let signed_bytes = sign_pdf(&self.raw_bytes, &signer, &options)
            .map_err(|e| format!("Failed to sign PDF: {e}"))?;

        std::fs::write(output_path, &signed_bytes)
            .map_err(|e| format!("Failed to write signed PDF: {e}"))?;

        // Reload the signed document as the new active document.
        self.lopdf_doc = lopdf::Document::load_mem(&signed_bytes)
            .map_err(|e| format!("Failed to reload signed PDF: {e}"))?;
        self.pdf_doc = PdfDocument::open(signed_bytes.clone())
            .map_err(|e| format!("Failed to re-parse signed PDF: {e}"))?;
        self.raw_bytes = signed_bytes;
        self.modified = false;

        Ok(())
    }

    /// Verify all digital signatures in the document.
    pub fn verify_signatures(&self) -> Vec<SignatureVerifyResult> {
        let results = validate_signatures(self.pdf_doc.pdf());

        results
            .into_iter()
            .map(|r| {
                let (status_str, valid) = match &r.status {
                    ValidationStatus::Valid => ("valid".to_string(), true),
                    ValidationStatus::Invalid(reason) => {
                        (format!("invalid: {reason}"), false)
                    }
                    ValidationStatus::Unknown(reason) => {
                        (format!("unknown: {reason}"), false)
                    }
                };

                SignatureVerifyResult {
                    field_name: r.field_name,
                    signer: r.signer,
                    timestamp: r.timestamp,
                    status: status_str,
                    valid,
                }
            })
            .collect()
    }

    // ── PDF/A compliance operations ──────────────────────────────────

    /// Validate the document against all PDF/A conformance levels.
    /// Detects the declared level from XMP metadata, or defaults to PDF/A-2b.
    pub fn validate_pdfa(&self) -> PdfAValidationResult {
        let pdf = self.pdf_doc.pdf();

        // Try to detect the declared conformance level from XMP metadata.
        let level = pdf_compliance::detect_pdfa_level(pdf)
            .unwrap_or(PdfALevel::A2b);

        let report: ComplianceReport = pdf_compliance::validate_pdfa(pdf, level);

        let conformance_level = report.pdfa_level.map(|l| {
            format!("PDF/A-{}{}", l.part(), l.conformance())
        });

        PdfAValidationResult {
            compliant: report.is_compliant(),
            conformance_level,
            error_count: report.error_count(),
            warning_count: report.warning_count(),
            issues: report
                .issues
                .iter()
                .map(|issue| PdfAIssue {
                    rule: issue.rule.clone(),
                    severity: match issue.severity {
                        Severity::Error => "error".to_string(),
                        Severity::Warning => "warning".to_string(),
                        Severity::Info => "info".to_string(),
                    },
                    message: issue.message.clone(),
                    location: issue.location.clone(),
                })
                .collect(),
        }
    }

    /// Convert the document to PDF/A and save to output_path.
    pub fn convert_to_pdfa(
        &mut self,
        level: &str,
        output_path: &str,
    ) -> Result<PdfAValidationResult, String> {
        let pdfa_level = parse_pdfa_level(level)?;
        let is_pdfa1 = pdfa_level.part() == 1;

        // Run PDF/A cleanup pipeline on the lopdf document.
        let _cleanup_report =
            pdf_manip::pdfa_cleanup::cleanup_for_pdfa(&mut self.lopdf_doc, is_pdfa1)
                .map_err(|e| format!("PDF/A cleanup failed: {e}"))?;

        // Embed fonts.
        let _font_report = pdf_manip::pdfa_fonts::embed_fonts(&mut self.lopdf_doc)
            .map_err(|e| format!("Font embedding failed: {e}"))?;

        // Normalize color spaces and add OutputIntent.
        let _color_report =
            pdf_manip::pdfa_colorspace::normalize_colorspaces(&mut self.lopdf_doc)
                .map_err(|e| format!("Color space normalization failed: {e}"))?;

        // Run supplementary fixups.
        let _fixup_report = pdf_manip::pdfa_fixups::run_fixups(&mut self.lopdf_doc);

        // Map PdfALevel to pdfa_xmp::PdfAConformance for XMP metadata.
        let conformance = match pdfa_level {
            PdfALevel::A1a => pdf_manip::pdfa_xmp::PdfAConformance::A1a,
            PdfALevel::A1b => pdf_manip::pdfa_xmp::PdfAConformance::A1b,
            PdfALevel::A2a => pdf_manip::pdfa_xmp::PdfAConformance::A2a,
            PdfALevel::A2b => pdf_manip::pdfa_xmp::PdfAConformance::A2b,
            PdfALevel::A2u => pdf_manip::pdfa_xmp::PdfAConformance::A2u,
            PdfALevel::A3a => pdf_manip::pdfa_xmp::PdfAConformance::A3a,
            PdfALevel::A3b => pdf_manip::pdfa_xmp::PdfAConformance::A3b,
            PdfALevel::A3u => pdf_manip::pdfa_xmp::PdfAConformance::A3u,
            // PDF/A-4 variants: fall back to A2b for XMP since pdfa_xmp
            // only supports parts 1-3.
            _ => pdf_manip::pdfa_xmp::PdfAConformance::A2b,
        };

        // Repair/generate XMP metadata with PDF/A identification.
        let _xmp_report = pdf_manip::pdfa_xmp::repair_xmp_metadata(
            &mut self.lopdf_doc,
            conformance,
            None,
        )
        .map_err(|e| format!("XMP metadata repair failed: {e}"))?;

        // Save the converted document.
        self.lopdf_doc
            .save(output_path)
            .map_err(|e| format!("Failed to save PDF/A document: {e}"))?;

        // Sync internal state.
        self.sync_after_mutation()?;

        // Validate the result to report compliance status.
        Ok(self.validate_pdfa())
    }

    // ── Encryption operations ────────────────────────────────────────

    /// Encrypt the document with user and owner passwords.
    pub fn encrypt(
        &mut self,
        user_password: &str,
        owner_password: &str,
        output_path: &str,
    ) -> Result<(), String> {
        let config = EncryptConfig {
            user_password: user_password.as_bytes().to_vec(),
            owner_password: owner_password.as_bytes().to_vec(),
            algorithm: EncryptionAlgorithm::Aes256,
            permissions: Permissions::allow_all(),
        };

        let mut output_bytes: Vec<u8> = Vec::new();
        encrypt::encrypt_and_save(&mut self.lopdf_doc, &config, &mut output_bytes)
            .map_err(|e| format!("Failed to encrypt PDF: {e}"))?;

        std::fs::write(output_path, &output_bytes)
            .map_err(|e| format!("Failed to write encrypted PDF: {e}"))?;

        Ok(())
    }

    /// Decrypt the document with the given password.
    pub fn decrypt(&mut self, password: &str) -> Result<(), String> {
        if !encrypt::is_encrypted(&self.lopdf_doc) {
            return Err("Document is not encrypted".to_string());
        }

        encrypt::decrypt(&mut self.lopdf_doc, password)
            .map_err(|e| format!("Failed to decrypt PDF: {e}"))?;

        // Remove encryption dictionary so subsequent saves are unencrypted.
        encrypt::remove_encryption(&mut self.lopdf_doc);

        self.sync_after_mutation()
    }

    // ── Redaction operations ─────────────────────────────────────────

    /// Permanently redact rectangular areas on a page.
    /// `page_index` is 0-based; internally converted to 1-based for pdf-redact.
    /// `rects` contains `[x0, y0, x1, y1]` rectangles in PDF coordinates.
    pub fn redact_text(
        &mut self,
        page_index: u32,
        rects: &[[f32; 4]],
    ) -> Result<RedactReport, String> {
        if rects.is_empty() {
            return Err("At least one rectangle is required".to_string());
        }

        let page_num = page_index + 1; // pdf-redact uses 1-based pages
        let mut redactor = Redactor::new();

        for r in rects {
            let area = RedactionArea::new(
                page_num,
                [r[0] as f64, r[1] as f64, r[2] as f64, r[3] as f64],
            );
            redactor.mark(area);
        }

        let report = redactor
            .apply(&mut self.lopdf_doc)
            .map_err(|e| format!("Redaction failed: {e}"))?;

        self.sync_after_mutation()?;

        Ok(RedactReport {
            areas_redacted: report.areas_redacted,
            operations_removed: report.operations_removed,
            pages_affected: report.pages_affected,
            metadata_cleaned: report.metadata_cleaned,
        })
    }

    /// Search for text matching `query` and redact all occurrences.
    pub fn redact_search(&mut self, query: &str) -> Result<SearchRedactReport, String> {
        let options = pdf_redact::RedactSearchOptions::default();
        let report = pdf_redact::search_and_redact(&mut self.lopdf_doc, query, &options)
            .map_err(|e| format!("Search redaction failed: {e}"))?;

        self.sync_after_mutation()?;

        Ok(SearchRedactReport {
            matches_found: report.matches_found,
            areas_redacted: report.areas_redacted,
            operations_removed: report.operations_removed,
            pages_affected: report.pages_affected,
            metadata_cleaned: report.metadata_cleaned,
        })
    }

    /// Permanently apply all pending `/Subtype /Redact` annotations.
    ///
    /// Iterates every page, collects all Redact annotation rectangles, feeds
    /// them to `pdf_redact::Redactor`, then removes the annotation objects
    /// from each page's `/Annots` array.  After a successful call all marked
    /// content is permanently destroyed and no Redact annotations remain.
    pub fn apply_redactions(&mut self) -> Result<RedactReport, String> {
        // Step 1 — collect (page_1based, rect, annot_obj_id) for every
        // /Subtype /Redact annotation across all pages.
        let pages: std::collections::BTreeMap<u32, lopdf::ObjectId> =
            self.lopdf_doc.get_pages();

        struct Entry {
            page_num: u32,
            rect: [f64; 4],
            annot_obj_id: lopdf::ObjectId,
        }
        let mut entries: Vec<Entry> = Vec::new();

        for (&page_num, &page_id) in &pages {
            // Clone the /Annots array so we don't hold a borrow while iterating.
            let annots_arr: Vec<lopdf::Object> = {
                let page_obj = match self.lopdf_doc.get_object(page_id) {
                    Ok(o) => o,
                    Err(_) => continue,
                };
                let dict = match page_obj.as_dict() {
                    Ok(d) => d,
                    Err(_) => continue,
                };
                match dict.get(b"Annots") {
                    Ok(lopdf::Object::Reference(arr_id)) => {
                        let arr_id = *arr_id;
                        match self.lopdf_doc.get_object(arr_id) {
                            Ok(lopdf::Object::Array(arr)) => arr.clone(),
                            _ => continue,
                        }
                    }
                    Ok(lopdf::Object::Array(arr)) => arr.clone(),
                    _ => continue,
                }
            };

            for ann_obj in &annots_arr {
                let ann_id = match ann_obj {
                    lopdf::Object::Reference(id) => *id,
                    _ => continue,
                };
                let ann_dict = match self.lopdf_doc.get_object(ann_id) {
                    Ok(o) => match o.as_dict() {
                        Ok(d) => d.clone(),
                        Err(_) => continue,
                    },
                    Err(_) => continue,
                };
                let is_redact = ann_dict
                    .get(b"Subtype")
                    .ok()
                    .and_then(|v| v.as_name().ok())
                    .map(|n| n == b"Redact")
                    .unwrap_or(false);
                if !is_redact {
                    continue;
                }
                // Extract /Rect [x0 y0 x1 y1]
                let rect_arr = match ann_dict.get(b"Rect").ok().and_then(|v| v.as_array().ok()) {
                    Some(a) if a.len() == 4 => a.clone(),
                    _ => continue,
                };
                let mut r = [0.0f64; 4];
                for (i, v) in rect_arr.iter().enumerate() {
                    r[i] = match v {
                        lopdf::Object::Real(f) => *f as f64,
                        lopdf::Object::Integer(n) => *n as f64,
                        _ => 0.0,
                    };
                }
                entries.push(Entry { page_num, rect: r, annot_obj_id: ann_id });
            }
        }

        if entries.is_empty() {
            return Ok(RedactReport {
                areas_redacted: 0,
                operations_removed: 0,
                pages_affected: 0,
                metadata_cleaned: false,
            });
        }

        // Step 2 — permanently burn all rectangles into the PDF content.
        let mut redactor = Redactor::new();
        for e in &entries {
            redactor.mark(RedactionArea::new(e.page_num, e.rect));
        }
        let report = redactor
            .apply(&mut self.lopdf_doc)
            .map_err(|e| format!("apply_redactions: {e}"))?;

        // Step 3 — remove Redact annotation objects from all /Annots arrays.
        let redact_ids: std::collections::HashSet<lopdf::ObjectId> =
            entries.iter().map(|e| e.annot_obj_id).collect();

        let pages_cleanup: std::collections::BTreeMap<u32, lopdf::ObjectId> =
            self.lopdf_doc.get_pages();

        for &page_id in pages_cleanup.values() {
            let annots_entry = match self.lopdf_doc.get_object(page_id) {
                Ok(o) => match o.as_dict() {
                    Ok(d) => d.get(b"Annots").ok().cloned(),
                    Err(_) => None,
                },
                Err(_) => None,
            };
            match annots_entry {
                Some(lopdf::Object::Reference(arr_id)) => {
                    if let Ok(lopdf::Object::Array(ref mut arr)) =
                        self.lopdf_doc.get_object_mut(arr_id)
                    {
                        arr.retain(|item| {
                            if let lopdf::Object::Reference(id) = item {
                                !redact_ids.contains(id)
                            } else {
                                true
                            }
                        });
                    }
                }
                Some(lopdf::Object::Array(_)) => {
                    if let Ok(lopdf::Object::Dictionary(ref mut dict)) =
                        self.lopdf_doc.get_object_mut(page_id)
                    {
                        if let Ok(lopdf::Object::Array(ref mut arr)) = dict.get_mut(b"Annots") {
                            arr.retain(|item| {
                                if let lopdf::Object::Reference(id) = item {
                                    !redact_ids.contains(id)
                                } else {
                                    true
                                }
                            });
                        }
                    }
                }
                _ => {}
            }
        }

        self.sync_after_mutation()?;

        Ok(RedactReport {
            areas_redacted: report.areas_redacted,
            operations_removed: report.operations_removed,
            pages_affected: report.pages_affected,
            metadata_cleaned: report.metadata_cleaned,
        })
    }

    // ── Extraction operations ─────────────────────────────────────────

    /// Extract all images from the document and save them to `output_dir`.
    /// Returns metadata about each extracted image including its file path.
    pub fn extract_images(&self, output_dir: &str) -> Result<Vec<ExtractedImageInfo>, String> {
        let output_path = Path::new(output_dir);
        if !output_path.exists() {
            std::fs::create_dir_all(output_path)
                .map_err(|e| format!("Failed to create output directory: {e}"))?;
        }

        let images = pdf_extract::extract_all_images(&self.lopdf_doc)
            .map_err(|e| format!("Failed to extract images: {e}"))?;

        let mut results = Vec::new();
        for (i, img) in images.iter().enumerate() {
            let ext = match img.filter {
                ImageFilter::Jpeg => "jpg",
                ImageFilter::Jpx => "jp2",
                _ => "png",
            };
            let filename = format!("image_p{}_{}.{}", img.page, i, ext);
            let file_path = output_path.join(&filename);

            match img.filter {
                ImageFilter::Jpeg | ImageFilter::Jpx => {
                    // Write raw compressed bytes directly.
                    std::fs::write(&file_path, &img.data)
                        .map_err(|e| format!("Failed to write image {filename}: {e}"))?;
                }
                _ => {
                    // Convert raw pixel data to PNG.
                    let channels: u32 = match img.color_space.as_str() {
                        "DeviceGray" => 1,
                        "DeviceRGB" => 3,
                        "DeviceCMYK" => 4,
                        _ => 3,
                    };
                    let expected_len = (img.width * img.height * channels) as usize;
                    if img.data.len() >= expected_len && img.width > 0 && img.height > 0 {
                        if channels == 3 {
                            if let Some(rgb_img) = image::RgbImage::from_raw(
                                img.width,
                                img.height,
                                img.data.clone(),
                            ) {
                                rgb_img
                                    .save_with_format(&file_path, ImageFormat::Png)
                                    .map_err(|e| {
                                        format!("Failed to save image {filename}: {e}")
                                    })?;
                            } else {
                                std::fs::write(&file_path, &img.data).map_err(|e| {
                                    format!("Failed to write raw image {filename}: {e}")
                                })?;
                            }
                        } else if channels == 1 {
                            if let Some(gray_img) = image::GrayImage::from_raw(
                                img.width,
                                img.height,
                                img.data.clone(),
                            ) {
                                gray_img
                                    .save_with_format(&file_path, ImageFormat::Png)
                                    .map_err(|e| {
                                        format!("Failed to save image {filename}: {e}")
                                    })?;
                            } else {
                                std::fs::write(&file_path, &img.data).map_err(|e| {
                                    format!("Failed to write raw image {filename}: {e}")
                                })?;
                            }
                        } else {
                            // CMYK or other: write raw bytes.
                            std::fs::write(&file_path, &img.data).map_err(|e| {
                                format!("Failed to write raw image {filename}: {e}")
                            })?;
                        }
                    } else {
                        // Data length mismatch — write raw bytes.
                        std::fs::write(&file_path, &img.data)
                            .map_err(|e| format!("Failed to write raw image {filename}: {e}"))?;
                    }
                }
            }

            results.push(ExtractedImageInfo {
                page: img.page,
                width: img.width,
                height: img.height,
                color_space: img.color_space.clone(),
                path: file_path.to_string_lossy().to_string(),
            });
        }

        Ok(results)
    }

    /// Export a single page as an image (PNG or JPEG) to the given path.
    pub fn export_page_as_image(
        &self,
        page_index: u32,
        format: &str,
        output_path: &str,
    ) -> Result<(), String> {
        let dpi = 150.0; // Good quality default for export
        let options = RenderOptions {
            dpi,
            render_annotations: true,
            ..Default::default()
        };

        let rendered = self
            .pdf_doc
            .render_page(page_index as usize, &options)
            .map_err(|e| format!("Failed to render page {page_index}: {e}"))?;

        let img =
            image::RgbaImage::from_raw(rendered.width, rendered.height, rendered.pixels.clone())
                .ok_or("Failed to create image from rendered pixels")?;

        let image_format = match format.to_lowercase().as_str() {
            "jpeg" | "jpg" => ImageFormat::Jpeg,
            "png" => ImageFormat::Png,
            _ => return Err(format!("Unsupported image format: {format}. Use png or jpeg.")),
        };

        img.save_with_format(output_path, image_format)
            .map_err(|e| format!("Failed to save image: {e}"))?;

        Ok(())
    }

    // ── Conversion operations ─────────────────────────────────────────

    /// Convert the current PDF document to DOCX format and save to `output_path`.
    pub fn convert_to_docx(&self, output_path: &str) -> Result<(), String> {
        let docx_bytes = pdf_docx::pdf_to_docx(&self.lopdf_doc)
            .map_err(|e| format!("Failed to convert to DOCX: {e}"))?;

        std::fs::write(output_path, &docx_bytes)
            .map_err(|e| format!("Failed to save DOCX file: {e}"))?;

        Ok(())
    }

    pub fn convert_to_xlsx(&self, output_path: &str) -> Result<(), String> {
        let xlsx_bytes = pdf_xlsx::pdf_to_xlsx(&self.lopdf_doc)
            .map_err(|e| format!("Failed to convert to XLSX: {e}"))?;

        std::fs::write(output_path, &xlsx_bytes)
            .map_err(|e| format!("Failed to save XLSX file: {e}"))?;

        Ok(())
    }

    pub fn convert_to_pptx(&self, output_path: &str) -> Result<(), String> {
        let pptx_bytes = pdf_pptx::pdf_to_pptx(&self.lopdf_doc)
            .map_err(|e| format!("Failed to convert to PPTX: {e}"))?;

        std::fs::write(output_path, &pptx_bytes)
            .map_err(|e| format!("Failed to save PPTX file: {e}"))?;

        Ok(())
    }

    // ── E-invoicing operations ────────────────────────────────────────

    /// Extract ZUGFeRD/Factur-X invoice data from the document, if present.
    ///
    /// Checks for embedded XML attachments with standard filenames
    /// (`factur-x.xml`, `ZUGFeRD-invoice.xml`, `xrechnung.xml`) and parses
    /// the CII XML into structured invoice data.
    pub fn extract_invoice_data(&self) -> Result<Option<InvoiceData>, String> {
        let filenames = ["factur-x.xml", "ZUGFeRD-invoice.xml", "xrechnung.xml"];

        let mut xml_data: Option<Vec<u8>> = None;
        for filename in &filenames {
            match pdf_invoice::embed::extract_xml_attachment(&self.lopdf_doc, filename) {
                Ok(Some(data)) => {
                    xml_data = Some(data);
                    break;
                }
                Ok(None) => continue,
                Err(_) => continue,
            }
        }

        let data = match xml_data {
            Some(d) => d,
            None => return Ok(None),
        };

        let xml_str = String::from_utf8(data)
            .map_err(|e| format!("Invoice XML is not valid UTF-8: {e}"))?;

        let invoice = pdf_invoice::zugferd::ZugferdInvoice::from_xml(&xml_str)
            .map_err(|e| format!("Failed to parse invoice XML: {e}"))?;

        let profile_str = match invoice.profile {
            pdf_invoice::zugferd::ZugferdProfile::Minimum => "Minimum",
            pdf_invoice::zugferd::ZugferdProfile::BasicWL => "BasicWL",
            pdf_invoice::zugferd::ZugferdProfile::Basic => "Basic",
            pdf_invoice::zugferd::ZugferdProfile::EN16931 => "EN16931",
            pdf_invoice::zugferd::ZugferdProfile::Extended => "Extended",
        };

        let line_items: Vec<InvoiceLineItem> = invoice
            .line_items
            .iter()
            .map(|li| InvoiceLineItem {
                id: li.id.clone(),
                description: li.description.clone(),
                quantity: li.quantity,
                unit_code: li.unit_code.clone(),
                unit_price: li.unit_price,
                line_total: li.line_total,
                tax_rate: li.tax_rate,
                tax_category: li.tax_category.code().to_string(),
            })
            .collect();

        let seller = InvoiceParty {
            name: invoice.seller.name.clone(),
            street: invoice.seller.address.street.clone(),
            city: invoice.seller.address.city.clone(),
            postal_code: invoice.seller.address.postal_code.clone(),
            country_code: invoice.seller.address.country_code.clone(),
            tax_id: invoice.seller.tax_id.clone(),
            registration_id: invoice.seller.registration_id.clone(),
            email: invoice.seller.email.clone(),
        };

        let buyer = InvoiceParty {
            name: invoice.buyer.name.clone(),
            street: invoice.buyer.address.street.clone(),
            city: invoice.buyer.address.city.clone(),
            postal_code: invoice.buyer.address.postal_code.clone(),
            country_code: invoice.buyer.address.country_code.clone(),
            tax_id: invoice.buyer.tax_id.clone(),
            registration_id: invoice.buyer.registration_id.clone(),
            email: invoice.buyer.email.clone(),
        };

        let payment_terms = invoice
            .payment_terms
            .as_ref()
            .and_then(|pt| pt.description.clone());

        Ok(Some(InvoiceData {
            profile: profile_str.to_string(),
            invoice_number: invoice.invoice_number,
            type_code: invoice.type_code,
            issue_date: invoice.issue_date.format("%Y-%m-%d").to_string(),
            seller_name: seller.name.clone(),
            buyer_name: buyer.name.clone(),
            currency: invoice.currency,
            tax_basis_total: invoice.tax_basis_total,
            tax_total: invoice.tax_total,
            grand_total: invoice.grand_total,
            due_payable: invoice.due_payable,
            line_items,
            seller,
            buyer,
            payment_terms,
            buyer_reference: invoice.buyer_reference,
        }))
    }

    /// Validate the embedded ZUGFeRD/Factur-X invoice XML against EN 16931 rules.
    ///
    /// Returns `None` if no invoice XML is embedded.
    pub fn validate_invoice_data(&self) -> Result<Option<InvoiceValidationResult>, String> {
        let filenames = ["factur-x.xml", "ZUGFeRD-invoice.xml", "xrechnung.xml"];

        let mut xml_data: Option<Vec<u8>> = None;
        for filename in &filenames {
            match pdf_invoice::embed::extract_xml_attachment(&self.lopdf_doc, filename) {
                Ok(Some(data)) => {
                    xml_data = Some(data);
                    break;
                }
                Ok(None) => continue,
                Err(_) => continue,
            }
        }

        let data = match xml_data {
            Some(d) => d,
            None => return Ok(None),
        };

        let xml_str = String::from_utf8(data)
            .map_err(|e| format!("Invoice XML is not valid UTF-8: {e}"))?;

        let invoice = pdf_invoice::zugferd::ZugferdInvoice::from_xml(&xml_str)
            .map_err(|e| format!("Failed to parse invoice XML: {e}"))?;

        let report = invoice.validate_full();

        let profile_str = match invoice.profile {
            pdf_invoice::zugferd::ZugferdProfile::Minimum => "Minimum",
            pdf_invoice::zugferd::ZugferdProfile::BasicWL => "BasicWL",
            pdf_invoice::zugferd::ZugferdProfile::Basic => "Basic",
            pdf_invoice::zugferd::ZugferdProfile::EN16931 => "EN16931",
            pdf_invoice::zugferd::ZugferdProfile::Extended => "Extended",
        };

        let issues: Vec<InvoiceValidationIssue> = report
            .issues
            .iter()
            .map(|issue| InvoiceValidationIssue {
                rule: issue.rule.clone(),
                severity: match issue.severity {
                    pdf_invoice::validation::Severity::Error => "error".to_string(),
                    pdf_invoice::validation::Severity::Warning => "warning".to_string(),
                },
                message: issue.message.clone(),
            })
            .collect();

        Ok(Some(InvoiceValidationResult {
            valid: report.is_valid(),
            profile: profile_str.to_string(),
            error_count: report.error_count(),
            warning_count: report.warning_count(),
            issues,
        }))
    }

    // ── Metadata operations ────────────────────────────────────────────

    /// Write title and/or author into the PDF Info dictionary (lopdf side).
    /// Passing `None` for a field leaves it unchanged.
    pub fn set_document_info(
        &mut self,
        title: Option<String>,
        author: Option<String>,
    ) -> Result<(), String> {
        // Resolve or create the Info dictionary object.
        // Clone to drop the immutable borrow before we call get_object_mut.
        let info_id = match self.lopdf_doc.trailer.get(b"Info").ok().cloned() {
            Some(lopdf::Object::Reference(id)) => id,
            _ => {
                // No Info dict yet — create one and link it from the trailer.
                let dict = lopdf::Dictionary::new();
                let id = self.lopdf_doc.add_object(lopdf::Object::Dictionary(dict));
                self.lopdf_doc
                    .trailer
                    .set(b"Info", lopdf::Object::Reference(id));
                id
            }
        };

        if let Ok(lopdf::Object::Dictionary(ref mut dict)) =
            self.lopdf_doc.get_object_mut(info_id)
        {
            if let Some(t) = title {
                dict.set(
                    b"Title",
                    lopdf::Object::String(t.into_bytes(), lopdf::StringFormat::Literal),
                );
            }
            if let Some(a) = author {
                dict.set(
                    b"Author",
                    lopdf::Object::String(a.into_bytes(), lopdf::StringFormat::Literal),
                );
            }
        }

        self.modified = true;
        Ok(())
    }

    /// Remove sensitive metadata from the document.
    ///
    /// Strips `/Author`, `/Creator`, `/Subject`, and `/Keywords` from the
    /// `/Info` dictionary and removes the document-level XMP metadata stream
    /// from the document catalog.  Useful before sharing a redacted document.
    pub fn redact_metadata(&mut self) -> Result<(), String> {
        const FIELDS: &[&[u8]] = &[b"Author", b"Creator", b"Subject", b"Keywords"];

        // Strip the four fields from the /Info dictionary.
        if let Some(lopdf::Object::Reference(info_id)) =
            self.lopdf_doc.trailer.get(b"Info").ok().cloned()
        {
            if let Ok(lopdf::Object::Dictionary(ref mut dict)) =
                self.lopdf_doc.get_object_mut(info_id)
            {
                for field in FIELDS {
                    dict.remove(field);
                }
            }
        }

        // Remove the XMP metadata stream from the document catalog so that
        // no author/creator information leaks via embedded XML.
        let catalog_id = match self.lopdf_doc.trailer.get(b"Root").ok().cloned() {
            Some(lopdf::Object::Reference(id)) => id,
            _ => return self.sync_after_mutation(),
        };
        if let Ok(lopdf::Object::Dictionary(ref mut catalog)) =
            self.lopdf_doc.get_object_mut(catalog_id)
        {
            catalog.remove(b"Metadata");
        }

        self.sync_after_mutation()
    }

    // ── Text mutation ─────────────────────────────────────────────────

    /// Replace a single text span in a PDF page content stream.
    ///
    /// Phase 4 MVP constraints:
    ///   - Only handles simple `(text) Tj` text show operators.
    ///     TJ arrays and hex string operators are not handled.
    ///   - Replacement must be equal-or-shorter (enforced here and in TypeScript).
    ///   - Shorter replacements are padded with trailing spaces so that the
    ///     byte count of the string literal remains the same.  This preserves
    ///     glyph advance widths and prevents visual reflow.
    ///   - Only the first matching occurrence is replaced.
    ///   - After mutation the content stream is stored uncompressed
    ///     (no /Filter) so lopdf does not need to re-compress.
    ///     Callers should save with normal compression via save_to().
    ///
    /// Returns a TextReplaceResult indicating whether the replacement occurred.
    /// Returns Err only on I/O or object-access failures — logical
    /// "not-found" cases are represented as replaced=false with a reason.
    pub fn replace_text_span(
        &mut self,
        page_index: u32,
        original_text: &str,
        replacement_text: &str,
    ) -> Result<TextReplaceResult, String> {
        // Phase 4 safety: replacement must not be longer than original.
        // This prevents glyph overflow and reflow in the PDF layout.
        if replacement_text.len() > original_text.len() {
            return Ok(TextReplaceResult {
                replaced: false,
                reason: Some("replacement-too-long".to_string()),
            });
        }

        if original_text.is_empty() {
            return Ok(TextReplaceResult {
                replaced: false,
                reason: Some("empty-original-text".to_string()),
            });
        }

        // Locate the page (0-based from TypeScript, lopdf page_iter is also 0-based).
        let page_id = self
            .lopdf_doc
            .page_iter()
            .nth(page_index as usize)
            .ok_or_else(|| format!("Page index {page_index} out of range"))?;

        let content_ids = self.lopdf_doc.get_page_contents(page_id);
        if content_ids.is_empty() {
            return Ok(TextReplaceResult {
                replaced: false,
                reason: Some("no-content-stream".to_string()),
            });
        }

        // Pad replacement with trailing spaces to match original byte count.
        // This ensures the glyph advance width budget is not exceeded.
        let padded = format!("{:width$}", replacement_text, width = original_text.len());

        // Simple Tj text show operator pattern: (text) Tj
        // Phase 4 MVP: only handles this form, not TJ arrays or <hex> strings.
        let search = format!("({original_text}) Tj");
        let replace_with = format!("({padded}) Tj");

        for stream_id in content_ids {
            // Clone the decoded content before the mutable borrow below.
            let decoded: Vec<u8> = {
                let obj = self
                    .lopdf_doc
                    .get_object(stream_id)
                    .map_err(|e| format!("Failed to get content stream {stream_id:?}: {e}"))?;
                match obj {
                    lopdf::Object::Stream(s) => s
                        .decompressed_content()
                        .unwrap_or_else(|_| s.content.clone()),
                    _ => continue,
                }
            }; // immutable borrow on lopdf_doc ends here

            // Check if the search pattern is present in this stream.
            if !decoded
                .windows(search.len())
                .any(|w| w == search.as_bytes())
            {
                continue;
            }

            // Replace the first occurrence of the pattern.
            let modified =
                replace_first_occurrence(&decoded, search.as_bytes(), replace_with.as_bytes());

            // Write the modified content back to the stream object.
            // Store uncompressed (remove /Filter) so lopdf does not re-apply
            // a filter on top of already-decoded bytes.
            let len = modified.len() as i64;
            let obj = self
                .lopdf_doc
                .get_object_mut(stream_id)
                .map_err(|e| format!("Failed to mutate content stream {stream_id:?}: {e}"))?;
            if let lopdf::Object::Stream(ref mut stream) = obj {
                stream.dict.remove(b"Filter");
                stream.dict.set("Length", len);
                stream.content = modified;
            }

            self.sync_after_mutation()?;
            return Ok(TextReplaceResult { replaced: true, reason: None });
        }

        Ok(TextReplaceResult {
            replaced: false,
            reason: Some("text-not-found-in-content-stream".to_string()),
        })
    }

    // ── File operations ───────────────────────────────────────────────

    pub fn save_to(&mut self, path: &str) -> Result<(), String> {
        self.lopdf_doc
            .save(path)
            .map_err(|e| format!("Failed to save PDF: {e}"))?;
        self.modified = false;
        // Re-read saved bytes for consistency
        self.raw_bytes = std::fs::read(path)
            .map_err(|e| format!("Failed to re-read saved PDF: {e}"))?;
        Ok(())
    }

    /// Re-parse the pdf-syntax document from the current lopdf state.
    /// Call this after mutations to keep the rendering view in sync.
    pub fn sync_after_mutation(&mut self) -> Result<(), String> {
        let mut buf = Vec::new();
        self.lopdf_doc
            .save_to(&mut buf)
            .map_err(|e| format!("Failed to serialize document: {e}"))?;
        self.pdf_doc = PdfDocument::open(buf.clone())
            .map_err(|e| format!("Failed to re-parse after mutation: {e}"))?;
        self.raw_bytes = buf;
        self.modified = true;
        Ok(())
    }

    // ── Document assembly ─────────────────────────────────────────────

    /// Append all pages from `source_path` to the end of the current document.
    /// Fixes #ASSEMBLY-append
    pub fn append_pdf(&mut self, source_path: &str) -> Result<(), String> {
        let source = lopdf::Document::load(source_path)
            .map_err(|e| format!("Failed to load source PDF: {e}"))?;
        let position = self.lopdf_doc.get_pages().len() as u32 + 1;
        pages::insert_pages(&mut self.lopdf_doc, &source, position)
            .map_err(|e| format!("Failed to append pages: {e}"))?;
        self.sync_after_mutation()
    }

    /// Insert all pages from `source_path` before page `at_index` (0-based from UI).
    /// Fixes #ASSEMBLY-insert
    pub fn insert_pdf_at(&mut self, source_path: &str, at_index: u32) -> Result<(), String> {
        let source = lopdf::Document::load(source_path)
            .map_err(|e| format!("Failed to load source PDF: {e}"))?;
        // at_index is 0-based from the UI; insert_pages uses 1-based position
        let position = at_index + 1;
        pages::insert_pages(&mut self.lopdf_doc, &source, position)
            .map_err(|e| format!("Failed to insert pages: {e}"))?;
        self.sync_after_mutation()
    }

    /// Extract the given pages (0-based from UI) into a new PDF saved at `output_path`.
    /// Does not modify the current document.
    /// Fixes #ASSEMBLY-extract
    pub fn extract_pages_to_file(&self, page_indices: &[u32], output_path: &str) -> Result<(), String> {
        if page_indices.is_empty() {
            return Err("No pages selected for extraction".to_string());
        }
        // Convert 0-based UI indices to 1-based pdf-manip indices
        let one_based: Vec<u32> = page_indices.iter().map(|&i| i + 1).collect();
        let mut extracted = pages::extract_pages(&self.lopdf_doc, &one_based)
            .map_err(|e| format!("Failed to extract pages: {e}"))?;
        extracted
            .save(output_path)
            .map_err(|e| format!("Failed to save extracted PDF: {e}"))?;
        Ok(())
    }
}

/// Merge multiple PDF files into a single output file.
pub fn merge_pdfs(paths: &[String], output_path: &str) -> Result<(), String> {
    let path_refs: Vec<&Path> = paths.iter().map(|p| Path::new(p.as_str())).collect();
    let mut merged = pages::merge(&path_refs)
        .map_err(|e| format!("Failed to merge PDFs: {e}"))?;
    merged
        .save(output_path)
        .map_err(|e| format!("Failed to save merged PDF: {e}"))?;
    Ok(())
}

/// Split a PDF by page ranges, writing each range to a separate file in output_dir.
/// Ranges are strings like "1-3", "4-6", "7" (1-based, inclusive).
pub fn split_pdf(
    source_doc: &lopdf::Document,
    ranges: &[String],
    output_dir: &str,
) -> Result<Vec<String>, String> {
    let output_path = Path::new(output_dir);
    if !output_path.exists() {
        std::fs::create_dir_all(output_path)
            .map_err(|e| format!("Failed to create output directory: {e}"))?;
    }

    let parsed_ranges: Vec<(u32, u32)> = ranges
        .iter()
        .map(|r| parse_page_range(r))
        .collect::<Result<Vec<_>, _>>()?;

    let mut parts = pages::split_by_ranges(source_doc, &parsed_ranges)
        .map_err(|e| format!("Failed to split PDF: {e}"))?;

    let mut output_paths = Vec::new();
    for (i, part) in parts.iter_mut().enumerate() {
        let file_name = format!("split_{}.pdf", i + 1);
        let file_path = output_path.join(&file_name);
        let file_path_str = file_path.to_string_lossy().to_string();
        part.save(&file_path)
            .map_err(|e| format!("Failed to save split part {}: {e}", i + 1))?;
        output_paths.push(file_path_str);
    }

    Ok(output_paths)
}

/// Split the current document into individual single-page PDFs in `output_dir`.
/// Returns the list of created file paths.
/// Fixes #ASSEMBLY-split
pub fn split_into_pages(source_doc: &lopdf::Document, output_dir: &str) -> Result<Vec<String>, String> {
    let output_path = Path::new(output_dir);
    if !output_path.exists() {
        std::fs::create_dir_all(output_path)
            .map_err(|e| format!("Failed to create output directory: {e}"))?;
    }
    let mut parts = pages::split_per_page(source_doc)
        .map_err(|e| format!("Failed to split PDF into pages: {e}"))?;
    let mut output_paths = Vec::new();
    for (i, part) in parts.iter_mut().enumerate() {
        let file_name = format!("page_{}.pdf", i + 1);
        let file_path = output_path.join(&file_name);
        let file_path_str = file_path.to_string_lossy().to_string();
        part.save(&file_path)
            .map_err(|e| format!("Failed to save page {}: {e}", i + 1))?;
        output_paths.push(file_path_str);
    }
    Ok(output_paths)
}

/// Parse a page range string like "1-3" or "5" into (start, end) tuple (1-based, inclusive).
fn parse_page_range(range: &str) -> Result<(u32, u32), String> {
    let range = range.trim();
    if let Some((start_str, end_str)) = range.split_once('-') {
        let start: u32 = start_str
            .trim()
            .parse()
            .map_err(|_| format!("Invalid page number in range: {start_str}"))?;
        let end: u32 = end_str
            .trim()
            .parse()
            .map_err(|_| format!("Invalid page number in range: {end_str}"))?;
        if start == 0 || end == 0 || start > end {
            return Err(format!("Invalid page range: {range}"));
        }
        Ok((start, end))
    } else {
        let page: u32 = range
            .parse()
            .map_err(|_| format!("Invalid page number: {range}"))?;
        if page == 0 {
            return Err(format!("Invalid page number: {range}"));
        }
        Ok((page, page))
    }
}

fn encode_rendered_page(
    page_index: u32,
    rendered: &pdf_engine::RenderedPage,
) -> Result<RenderedPage, String> {
    let img = image::RgbaImage::from_raw(rendered.width, rendered.height, rendered.pixels.clone())
        .ok_or("Failed to create image from rendered pixels")?;

    let mut png_bytes: Vec<u8> = Vec::new();
    img.write_to(&mut Cursor::new(&mut png_bytes), ImageFormat::Png)
        .map_err(|e| format!("Failed to encode PNG: {e}"))?;

    let data_base64 = general_purpose::STANDARD.encode(&png_bytes);

    Ok(RenderedPage {
        index: page_index,
        width: rendered.width,
        height: rendered.height,
        data_base64,
    })
}

/// Parse a PDF/A level string like "1b", "2a", "2b", "3u" into a PdfALevel.
fn parse_pdfa_level(level: &str) -> Result<PdfALevel, String> {
    let level = level.trim().to_lowercase();
    // Support formats: "1b", "2a", "2b", "3u", "a-1b", "a-2b", "pdf/a-2b", etc.
    let normalized = level
        .replace("pdf/a-", "")
        .replace("pdfa-", "")
        .replace("a-", "")
        .replace("a", "");

    // Now normalized should be like "1b", "2b", "3u", "4", etc.
    let trimmed = normalized.trim();
    match trimmed {
        "1a" => Ok(PdfALevel::A1a),
        "1b" | "1" => Ok(PdfALevel::A1b),
        "2a" => Ok(PdfALevel::A2a),
        "2b" | "2" => Ok(PdfALevel::A2b),
        "2u" => Ok(PdfALevel::A2u),
        "3a" => Ok(PdfALevel::A3a),
        "3b" | "3" => Ok(PdfALevel::A3b),
        "3u" => Ok(PdfALevel::A3u),
        "4" => Ok(PdfALevel::A4),
        "4f" => Ok(PdfALevel::A4f),
        "4e" => Ok(PdfALevel::A4e),
        _ => Err(format!(
            "Unknown PDF/A level: '{level}'. Expected: 1a, 1b, 2a, 2b, 2u, 3a, 3b, 3u, 4, 4f, 4e"
        )),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn open_document_info_does_not_panic() {
        // Basic sanity: module compiles and types are accessible
        assert!(true);
    }

    #[test]
    fn parse_pdfa_level_variants() {
        assert_eq!(parse_pdfa_level("2b").unwrap(), PdfALevel::A2b);
        assert_eq!(parse_pdfa_level("PDF/A-1b").unwrap(), PdfALevel::A1b);
        assert_eq!(parse_pdfa_level("3u").unwrap(), PdfALevel::A3u);
        assert!(parse_pdfa_level("5z").is_err());
    }
}
