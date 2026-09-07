// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary. The PDFluent application is free to use,
// including for commercial purposes. Redistribution, or extraction or reuse
// of its components (including the embedded PDF engine), requires a licence.
// See https://pdfluent.com/license for terms.

use base64::{engine::general_purpose, Engine as _};
use flate2::write::ZlibEncoder;
use flate2::Compression;
use image::ImageFormat;
use lopdf::dictionary;
use lopdf::{Dictionary, Object, ObjectId, Stream, StringFormat};
use pdf_annot::builder::{add_annotation_to_page, AnnotRect, AnnotationBuilder};
use pdf_annot::{
    Annotation as PdfAnnotation, AnnotationType as PdfAnnotationType, Color as AnnotColor,
};
use pdf_compliance::{ComplianceReport, PdfALevel, Severity};
use pdf_engine::{PdfDocument, RenderOptions, ThumbnailOptions};

// Re-export the SDK's canonical TextSpanInfo so the rest of the backend (and
// lib.rs's `use crate::pdf_engine::TextSpanInfo`) consumes the SDK's SSOT
// instead of a locally duplicated struct. The `serde` feature must be enabled
// on the `pdf-engine` crate for Tauri serialisation to work.
pub use pdf_engine::TextSpanInfo;

// Re-export the SDK document type so lib.rs (where `pdf_engine` names this
// module, shadowing the SDK crate) can reference render snapshots.
pub use pdf_engine::PdfDocument as SdkDocument;
use pdf_extract::ImageFilter;
use pdf_forms::{
    apply_choice_multi, apply_field_value, build_form_model, parse_acroform, FormAccess,
    WriteValue,
};
use pdf_manip::encrypt::{self, EncryptConfig, EncryptionAlgorithm, Permissions};
use pdf_manip::optimize::OptimizeConfig;
use pdf_manip::pages;
use pdf_manip::watermark::{self, PageSelection, TextWatermark};
use pdf_redact::{RedactionArea, Redactor};
use pdf_sign::signer::Pkcs12Signer;
use pdf_sign::ValidationStatus;
use pdf_sign::{sign_pdf, validate_signatures, SignOptions};
use serde::{Deserialize, Serialize};
use std::collections::HashSet;
use std::io::{Cursor, Write};
use std::path::Path;
use std::sync::Arc;

#[derive(Debug, Serialize, Clone)]
pub struct DocumentInfo {
    pub page_count: u32,
    pub pages: Vec<PageInfo>,
    pub title: Option<String>,
    pub author: Option<String>,
    pub form_type: String,
    pub xfa_detected: bool,
    pub xfa_notice: Option<String>,
    pub active_content: ActiveContentInfo,
}

#[derive(Debug, Serialize, Clone, Default)]
pub struct ActiveContentInfo {
    pub has_active_content: bool,
    pub has_javascript: bool,
    pub has_open_action: bool,
    pub has_additional_actions: bool,
    pub has_launch_actions: bool,
    pub has_submit_form: bool,
    pub has_uri_actions: bool,
    pub has_xfa: bool,
    pub flags: Vec<String>,
}

impl ActiveContentInfo {
    fn mark(&mut self, flag: &str) {
        self.has_active_content = true;
        if !self.flags.iter().any(|existing| existing == flag) {
            self.flags.push(flag.to_string());
        }
    }
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

// ── First-class AcroForm model (SDK `build_form_model` contract) ──────────
//
// These DTOs mirror `pdf_forms::FormFieldModel` 1:1 for the editor wire. The
// shape is protected by the `form_model_wire_contract_is_stable` drift-guard
// test below; if the SDK model changes, update both sides together.

/// One widget (visual occurrence) of a logical form field.
#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct WidgetModelDto {
    pub page_index: Option<usize>,
    /// `[x0, y0, x1, y1]` in PDF user space (origin bottom-left).
    pub rect: [f32; 4],
    /// Button widgets: this widget's on-state name from `/AP /N`.
    pub on_state: Option<String>,
    /// Current `/AS` appearance state, when present.
    pub appearance_state: Option<String>,
}

/// Resolved default-appearance info (`/DA`, inherited).
#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct DaInfoDto {
    pub font_name: Option<String>,
    /// Font size in points; `0` means auto-size.
    pub font_size: f32,
    pub color: Vec<f32>,
}

/// Typed field kind with kind-specific data inline (serde-tagged).
#[derive(Debug, Serialize, Clone)]
#[serde(tag = "type", rename_all = "camelCase")]
pub enum FormFieldKindDto {
    Text {
        multiline: bool,
        comb: bool,
        password: bool,
    },
    Checkbox {
        on_state: String,
        checked: bool,
    },
    RadioGroup {
        /// Export (on-state) value per option, in widget order.
        options: Vec<String>,
    },
    ComboBox {
        editable: bool,
        options: Vec<FormFieldOption>,
    },
    ListBox {
        multi_select: bool,
        options: Vec<FormFieldOption>,
    },
    PushButton,
    Signature,
}

/// A logical AcroForm field with everything the overlay UI needs.
#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct FormFieldModelDto {
    pub name: String,
    pub kind: FormFieldKindDto,
    pub value: Option<String>,
    /// Array of selected export values for multi-select list boxes; `None` for
    /// all other field types.
    pub selected_values: Option<Vec<String>>,
    pub default_value: Option<String>,
    pub tooltip: Option<String>,
    pub read_only: bool,
    pub required: bool,
    pub max_len: Option<u32>,
    /// Text alignment: 0 = left, 1 = centered, 2 = right.
    pub quadding: u8,
    pub da: DaInfoDto,
    pub widgets: Vec<WidgetModelDto>,
}

impl From<&pdf_forms::FormFieldModel> for FormFieldModelDto {
    fn from(m: &pdf_forms::FormFieldModel) -> Self {
        use pdf_forms::FormFieldKind as K;
        let kind = match &m.kind {
            K::Text {
                multiline,
                comb,
                password,
            } => FormFieldKindDto::Text {
                multiline: *multiline,
                comb: *comb,
                password: *password,
            },
            K::Checkbox { on_state, checked } => FormFieldKindDto::Checkbox {
                on_state: on_state.clone(),
                checked: *checked,
            },
            K::RadioGroup { options } => FormFieldKindDto::RadioGroup {
                options: options.clone(),
            },
            K::ComboBox { editable, options } => FormFieldKindDto::ComboBox {
                editable: *editable,
                options: options.iter().map(form_field_option).collect(),
            },
            K::ListBox {
                multi_select,
                options,
            } => FormFieldKindDto::ListBox {
                multi_select: *multi_select,
                options: options.iter().map(form_field_option).collect(),
            },
            K::PushButton => FormFieldKindDto::PushButton,
            K::Signature => FormFieldKindDto::Signature,
        };
        let quadding = match m.quadding {
            pdf_forms::Quadding::Left => 0,
            pdf_forms::Quadding::Center => 1,
            pdf_forms::Quadding::Right => 2,
        };
        FormFieldModelDto {
            name: m.name.clone(),
            kind,
            value: m.value.clone(),
            selected_values: m.selected_values.clone(),
            default_value: m.default_value.clone(),
            tooltip: m.tooltip.clone(),
            read_only: m.read_only,
            required: m.required,
            max_len: m.max_len,
            quadding,
            da: DaInfoDto {
                font_name: m.da.font_name.clone(),
                font_size: m.da.font_size,
                color: m.da.color.clone(),
            },
            widgets: m
                .widgets
                .iter()
                .map(|w| WidgetModelDto {
                    page_index: w.page_index,
                    rect: w.rect,
                    on_state: w.on_state.clone(),
                    appearance_state: w.appearance_state.clone(),
                })
                .collect(),
        }
    }
}

fn form_field_option(o: &pdf_forms::tree::ChoiceOption) -> FormFieldOption {
    FormFieldOption {
        export: o.export.clone(),
        display: o.display.clone(),
    }
}

/// Parse a dictionary's `/Rect` into a normalized `[x0, y0, x1, y1]` (f32).
fn parse_rect_f32(dict: &lopdf::Dictionary) -> Option<[f32; 4]> {
    let lopdf::Object::Array(arr) = dict.get(b"Rect").ok()? else {
        return None;
    };
    if arr.len() != 4 {
        return None;
    }
    let mut r = [0f32; 4];
    for (i, o) in arr.iter().enumerate() {
        r[i] = match o {
            lopdf::Object::Integer(n) => *n as f32,
            lopdf::Object::Real(f) => *f,
            _ => return None,
        };
    }
    Some([r[0].min(r[2]), r[1].min(r[3]), r[0].max(r[2]), r[1].max(r[3])])
}

/// A typed write request from the editor: the field family decides which
/// `pdf_forms::WriteValue` is applied.
#[derive(Debug, Deserialize)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum FormWriteRequest {
    /// Text / comb / multiline field.
    Text { name: String, value: String },
    /// Checkbox on/off.
    Checkbox { name: String, checked: bool },
    /// Radio group selection by export (on-state) name.
    Radio { name: String, export: String },
    /// Choice field selection (export or display value).
    Choice { name: String, value: String },
    /// Multi-select list box: zero or more selected export values.
    MultiChoice { name: String, values: Vec<String> },
}

/// A `/Link` annotation with a URI action — the clickable-link layer's data.
#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct LinkAnnotationDto {
    pub page_index: usize,
    /// `[x0, y0, x1, y1]` in PDF user space (origin bottom-left).
    pub rect: [f32; 4],
    pub uri: String,
}

#[derive(Debug, Deserialize)]
pub struct SetFieldValueRequest {
    pub name: String,
    pub value: String,
}

// ── XFA form model (Phase 1 fill) ─────────────────────────────────────
//
// Mirrors `pdf_engine::xfa::XfaFieldModel` for the frontend. Distinct from the
// AcroForm `FormFieldModelDto`: XFA rects are in page space with a TOP-LEFT
// origin (y grows downward), so the overlay maps them without the y-flip the
// AcroForm overlay applies.

/// Rectangle in XFA page space: points, top-left origin (y grows downward).
#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct XfaRectDto {
    pub x: f64,
    pub y: f64,
    pub width: f64,
    pub height: f64,
}

/// A selectable option of a dropdown / choice field.
#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct XfaFieldOptionDto {
    pub display: String,
    pub save: String,
}

/// One layouted widget occurrence of an XFA field.
#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct XfaWidgetDto {
    /// 0-based page index in the XFA layout.
    pub page: usize,
    pub rect: XfaRectDto,
    /// For radio groups: the on-value this member widget asserts.
    pub on_value: Option<String>,
}

/// One logical XFA form field, flattened for the overlay UI.
#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct XfaFieldDto {
    pub name: String,
    pub som_path: String,
    /// Lowercase-ish kind tag: text|checkbox|radioGroup|button|dropdown|
    /// signature|dateTime|numeric|password|image|barcode.
    pub field_type: String,
    pub value: String,
    pub read_only: bool,
    pub required: bool,
    pub multiline: bool,
    pub hidden: bool,
    pub options: Vec<XfaFieldOptionDto>,
    pub on_value: Option<String>,
    pub off_value: Option<String>,
    /// First layout page (0-based); `None` when not in the current layout.
    pub page: Option<usize>,
    pub rect: Option<XfaRectDto>,
    pub widgets: Vec<XfaWidgetDto>,
    pub bound_to_data: bool,
    pub bind_none: bool,
}

/// The XFA form model: layout page count plus enumerated fields.
#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct XfaFormModelDto {
    pub page_count: usize,
    pub fields: Vec<XfaFieldDto>,
}

/// Stable string tag for an XFA field type (matches the frontend union).
fn xfa_field_type_tag(t: pdf_engine::xfa::XfaFieldType) -> &'static str {
    use pdf_engine::xfa::XfaFieldType as T;
    match t {
        T::Text => "text",
        T::Checkbox => "checkbox",
        T::RadioGroup => "radioGroup",
        T::Button => "button",
        T::Dropdown => "dropdown",
        T::Signature => "signature",
        T::DateTime => "dateTime",
        T::Numeric => "numeric",
        T::Password => "password",
        T::Image => "image",
        T::Barcode => "barcode",
    }
}

impl From<&pdf_engine::xfa::XfaFieldModel> for XfaFieldDto {
    fn from(f: &pdf_engine::xfa::XfaFieldModel) -> Self {
        let rect = |r: &pdf_engine::xfa::XfaRect| XfaRectDto {
            x: r.x,
            y: r.y,
            width: r.width,
            height: r.height,
        };
        XfaFieldDto {
            name: f.name.clone(),
            som_path: f.som_path.clone(),
            field_type: xfa_field_type_tag(f.field_type).to_string(),
            value: f.value.clone(),
            read_only: f.read_only,
            required: f.required,
            multiline: f.multiline,
            hidden: f.hidden,
            options: f
                .options
                .iter()
                .map(|o| XfaFieldOptionDto {
                    display: o.display.clone(),
                    save: o.save.clone(),
                })
                .collect(),
            on_value: f.on_value.clone(),
            off_value: f.off_value.clone(),
            page: f.page,
            rect: f.rect.as_ref().map(rect),
            widgets: f
                .widgets
                .iter()
                .map(|w| XfaWidgetDto {
                    page: w.page,
                    rect: rect(&w.rect),
                    on_value: w.on_value.clone(),
                })
                .collect(),
            bound_to_data: f.bound_to_data,
            bind_none: f.bind_none,
        }
    }
}

/// A typed XFA write request from the editor (serde-tagged on `kind`).
#[derive(Debug, Deserialize)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum XfaWriteRequest {
    /// Text / multiline / numeric / date-time / password / dropdown field.
    Text { name: String, value: String },
    /// Checkbox on/off.
    Checkbox { name: String, checked: bool },
    /// Radio group selection by member on-value.
    Radio { name: String, export: String },
}

/// One field/subform whose presence changed during a Phase 2 interactive commit
/// (revealed or hidden by a change/click/calculate script).
#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct XfaPresenceChangeDto {
    pub name: String,
    /// Lowercased presence before the commit: visible|hidden|invisible|inactive.
    pub before: String,
    /// Lowercased presence after re-layout.
    pub after: String,
}

/// Result of a Phase 2 interactive commit (`commit_xfa_field_value`): the value
/// write outcome, what the commit-loop scripts revealed/hid, the page-count
/// delta, and the refreshed field model so the overlay can update in one round
/// trip. When the `xfa-interactive` feature is off this carries the Phase 1
/// fallback shape (`interactive=false`, no scripts, no presence changes, equal
/// page counts).
#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct XfaCommitResultDto {
    /// Normalized written value (e.g. dropdown display → save value).
    pub raw_value: String,
    /// Whether the value reached the datasets packet (persists across reopen).
    pub persisted_to_datasets: bool,
    /// Whether interactive scripts ran (false in the Phase 1 fallback / when the
    /// `xfa-js-sandboxed` runtime is not compiled in).
    pub interactive: bool,
    /// Number of event scripts executed during the commit.
    pub scripts_executed: usize,
    /// XFA layout page count before the commit.
    pub page_count_before: usize,
    /// XFA layout page count after re-layout.
    pub page_count_after: usize,
    /// Fields/subforms revealed or hidden by the commit.
    pub presence_changes: Vec<XfaPresenceChangeDto>,
    /// Refreshed model after the commit (revealed/hidden fields, new geometry).
    pub model: XfaFormModelDto,
}

/// Resolve a write request into the SDK `(name, value)` pair.
fn xfa_request_parts(request: &XfaWriteRequest) -> (&str, pdf_engine::xfa::XfaWriteValue<'_>) {
    match request {
        XfaWriteRequest::Text { name, value } => {
            (name, pdf_engine::xfa::XfaWriteValue::Text(value))
        }
        XfaWriteRequest::Checkbox { name, checked } => {
            (name, pdf_engine::xfa::XfaWriteValue::Checkbox(*checked))
        }
        XfaWriteRequest::Radio { name, export } => {
            (name, pdf_engine::xfa::XfaWriteValue::Radio(export))
        }
    }
}

/// One node in the document outline (table of contents).
/// Serialises to `{ title, page_index, children }` matching the TypeScript
/// `TauriOutlineItem` interface consumed by `TauriDocumentEngine.getOutline`.
#[derive(Debug, Serialize, Clone)]
pub struct OutlineItemInfo {
    pub title: String,
    /// Zero-based page index.
    pub page_index: u32,
    pub children: Vec<OutlineItemInfo>,
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

/// Result of a parser-backed text span replacement attempt.
#[derive(Debug, Serialize, Clone)]
pub struct TextReplaceResult {
    /// True when the content stream was mutated.
    pub replaced: bool,
    /// Machine-readable reason when replaced is false.  Null when replaced is true.
    pub reason: Option<String>,
}

fn classify_text_replace_error(message: &str) -> &'static str {
    let lower = message.to_ascii_lowercase();
    if lower.contains("page")
        && (lower.contains("range") || lower.contains("out of bounds") || lower.contains("not found"))
    {
        return "page-not-found";
    }
    if lower.contains("font")
        || lower.contains("encoding")
        || lower.contains("cmap")
        || lower.contains("unicode")
        || lower.contains("glyph")
        || lower.contains("character")
    {
        return "encoding-not-supported";
    }
    "internal-error"
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

/// Wraps a `pdf_engine::PdfDocument` and a `lopdf::Document` for mutation operations.
pub struct OpenDocument {
    /// Read-only PDF handle for rendering, text extraction, compliance checking.
    pub pdf_doc: Arc<PdfDocument>,
    /// Render source. The SDK re-flattens XFA documents on *every* render call
    /// (`open_flattened_xfa_for_render`), which costs ~100ms+ per render on real
    /// XFA forms. We pay that flatten once here instead; non-XFA documents share
    /// the same Arc as `pdf_doc`.
    render_doc: Arc<PdfDocument>,
    /// Mutable PDF handle for forms, annotations, manipulation, signing.
    pub lopdf_doc: lopdf::Document,
    /// Raw PDF bytes (kept for re-parsing after mutation).
    pub raw_bytes: Vec<u8>,
    /// Whether the document has unsaved changes.
    pub modified: bool,
}

// Render snapshots cross thread boundaries (renders run off the state mutex).
const _: () = {
    const fn assert_send_sync<T: Send + Sync>() {}
    assert_send_sync::<PdfDocument>();
};

/// Convert a (cloned) lopdf document to DOCX and write it to `output_path`.
///
/// A free function (not an `OpenDocument` method) so a heavy export can run on a
/// worker thread with just a cloned `lopdf::Document` — never holding the
/// document mutex or blocking the UI. See the async `convert_to_docx` command.
pub fn convert_doc_to_docx(doc: &lopdf::Document, output_path: &str) -> Result<(), String> {
    let bytes = pdf_docx::pdf_to_docx(doc).map_err(|e| format!("Failed to convert to DOCX: {e}"))?;
    write_export_bytes(
        &bytes,
        output_path,
        "DOCX",
        "The document may not contain extractable content.",
    )
}

/// Convert a (cloned) lopdf document to XLSX and write it to `output_path`.
pub fn convert_doc_to_xlsx(doc: &lopdf::Document, output_path: &str) -> Result<(), String> {
    let bytes = pdf_xlsx::pdf_to_xlsx(doc).map_err(|e| format!("Failed to convert to XLSX: {e}"))?;
    write_export_bytes(
        &bytes,
        output_path,
        "XLSX",
        "The document may not contain structured tables.",
    )
}

/// Convert a (cloned) lopdf document to PPTX and write it to `output_path`.
pub fn convert_doc_to_pptx(doc: &lopdf::Document, output_path: &str) -> Result<(), String> {
    let bytes = pdf_pptx::pdf_to_pptx(doc).map_err(|e| format!("Failed to convert to PPTX: {e}"))?;
    write_export_bytes(
        &bytes,
        output_path,
        "PPTX",
        "The document may not contain extractable content.",
    )
}

/// Validate non-empty conversion bytes and write them to `output_path`.
fn write_export_bytes(
    bytes: &[u8],
    output_path: &str,
    kind: &str,
    empty_hint: &str,
) -> Result<(), String> {
    if bytes.is_empty() {
        return Err(format!(
            "Conversion produced an empty {kind} file. {empty_hint}"
        ));
    }
    std::fs::write(output_path, bytes).map_err(|e| format!("Failed to save {kind} file: {e}"))?;
    let written =
        std::fs::metadata(output_path).map_err(|e| format!("Failed to verify {kind} output: {e}"))?;
    if written.len() == 0 {
        return Err(format!("Written {kind} file is empty (0 bytes)."));
    }
    Ok(())
}

impl OpenDocument {
    pub fn open(path: &str) -> Result<Self, String> {
        let raw_bytes = std::fs::read(path).map_err(|e| format!("Failed to read file: {e}"))?;
        Self::open_bytes(raw_bytes)
    }

    pub fn open_bytes(bytes: Vec<u8>) -> Result<Self, String> {
        let pdf_doc = Arc::new(
            PdfDocument::open(bytes.clone()).map_err(|e| format!("Failed to parse PDF: {e}"))?,
        );

        let lopdf_doc = lopdf::Document::load_mem(&bytes)
            .map_err(|e| format!("Failed to load PDF for editing: {e}"))?;

        let render_doc = Self::make_render_doc(&pdf_doc);

        Ok(Self {
            pdf_doc,
            render_doc,
            lopdf_doc,
            raw_bytes: bytes,
            modified: false,
        })
    }

    /// Build the render source for a freshly parsed document: XFA documents are
    /// flattened once so per-render flattening inside the SDK is skipped; any
    /// flatten failure falls back to the canonical document (the SDK then keeps
    /// its own per-render fallback behaviour).
    fn make_render_doc(pdf_doc: &Arc<PdfDocument>) -> Arc<PdfDocument> {
        if !pdf_engine::xfa::has_xfa(pdf_doc) {
            return Arc::clone(pdf_doc);
        }
        let flattened = match pdf_engine::xfa::flatten(pdf_doc) {
            Ok(bytes) => bytes,
            Err(_) => return Arc::clone(pdf_doc),
        };
        match PdfDocument::open(flattened) {
            Ok(flat) => Arc::new(flat),
            Err(_) => Arc::clone(pdf_doc),
        }
    }

    /// Cheap clone of the render source for lock-free rendering on another thread.
    pub fn render_snapshot(&self) -> Arc<PdfDocument> {
        Arc::clone(&self.render_doc)
    }

    #[cfg(test)]
    fn render_doc_page_count(&self) -> usize {
        self.render_doc.page_count()
    }

    pub fn flatten_xfa(&mut self) -> Result<(), String> {
        if !pdf_engine::xfa::has_xfa(&self.pdf_doc) {
            return Err("Dit document bevat geen actieve XFA-template om om te zetten.".to_string());
        }

        let flattened = pdf_engine::xfa::flatten(&self.pdf_doc)
            .map_err(|e| format!("XFA omzetten naar statische PDF is mislukt: {e}"))?;
        let mut replacement = Self::open_bytes(flattened)?;
        replacement.modified = true;
        *self = replacement;
        Ok(())
    }

    // ── XFA form fill (Phase 1) ───────────────────────────────────────
    //
    // The editor drives `pdf_engine::xfa::XfaSession` directly — the same engine
    // layer the flatten path uses — rather than the higher-level
    // `pdfluent::PdfDocument` wrapper, because `OpenDocument` already holds the
    // `lopdf::Document` that `write_into_document` needs. No reflow, no event
    // scripts: geometry stays that of the opened document (Phase 0 layout).
    //
    // The session is built fresh per call and never stored on `OpenDocument`:
    // `XfaSession` holds a `dyn XfaJsRuntime` and is therefore `!Send`, while
    // `OpenDocument` lives behind the `AppState` mutex and must stay `Send`. The
    // transient session is cheap relative to a fill round-trip, and rebuilding
    // from the current `lopdf_doc` keeps accumulated edits (each write persists
    // into that document's datasets packet before the session is dropped).

    /// Open a transient XFA session over the current document state. Serializing
    /// the live `lopdf_doc` (the same non-destructive `save_to` `sync_after_mutation`
    /// uses) means accumulated datasets edits are included, so sequential fills
    /// build on each other without storing the `!Send` session.
    fn xfa_session(&mut self) -> Result<pdf_engine::xfa::XfaSession, String> {
        let mut buf = Vec::new();
        self.lopdf_doc
            .save_to(&mut buf)
            .map_err(|e| format!("Kon XFA-document niet serialiseren: {e}"))?;
        pdf_engine::xfa::XfaSession::open(&buf)
            .map_err(|e| format!("XFA-formulier kon niet worden geopend: {e}"))
    }

    /// The XFA form model: layout page count plus one entry per logical field
    /// (radio groups fold their member widgets into a single field), with values,
    /// flags, options and per-widget geometry, read from the current document.
    pub fn xfa_form_model(&mut self) -> Result<XfaFormModelDto, String> {
        let session = self.xfa_session()?;
        Ok(XfaFormModelDto {
            page_count: session.page_count(),
            fields: session.fields().iter().map(XfaFieldDto::from).collect(),
        })
    }

    /// Set one XFA field value. Writes through to the bound `datasets` node in
    /// `lopdf_doc` so a subsequent `save_to` produces a PDF Adobe reopens with
    /// the value. The rendered (flattened) layout is intentionally NOT recomputed
    /// — Phase 1 has no reflow — so the page bitmaps stay as opened and the
    /// overlay inputs remain the visual truth for edited values.
    pub fn set_xfa_field_value(&mut self, request: &XfaWriteRequest) -> Result<(), String> {
        let mut session = self.xfa_session()?;
        let (name, value) = xfa_request_parts(request);
        session
            .set_value(name, value)
            .map_err(|e| format!("Kon XFA-veld '{name}' niet invullen: {e}"))?;
        session
            .write_into_document(&mut self.lopdf_doc)
            .map_err(|e| format!("Kon XFA-waarde niet wegschrijven: {e}"))?;
        self.modified = true;
        Ok(())
    }

    /// Phase 2 interactive commit. Prefers the SDK commit loop
    /// (`XfaSession::commit_value`: change/click + calculate scripts → re-layout
    /// → presence changes) over the static Phase 1 value write, and returns the
    /// commit outcome together with the refreshed field model so the overlay can
    /// update revealed/hidden fields in a single round trip. The re-layout is
    /// mirrored into the rendered pages via `sync_after_mutation`.
    ///
    /// When the `xfa-interactive` feature is not compiled in (e.g. an SDK build
    /// without the Phase 2 commit loop), this degrades to the Phase 1 static
    /// value write and reports `interactive=false` with no presence changes.
    pub fn commit_xfa_field_value(
        &mut self,
        request: &XfaWriteRequest,
    ) -> Result<XfaCommitResultDto, String> {
        #[cfg(feature = "xfa-interactive")]
        {
            let mut session = self.xfa_session()?;
            let (name, value) = xfa_request_parts(request);
            let outcome = session
                .commit_value(name, value)
                .map_err(|e| format!("Kon XFA-veld '{name}' niet interactief vastleggen: {e}"))?;
            session
                .write_into_document(&mut self.lopdf_doc)
                .map_err(|e| format!("Kon XFA-waarde niet wegschrijven: {e}"))?;
            // Snapshot the post-commit model (revealed/hidden fields, new
            // geometry) before the session is dropped.
            let model = XfaFormModelDto {
                page_count: session.page_count(),
                fields: session.fields().iter().map(XfaFieldDto::from).collect(),
            };
            let presence_changes = outcome
                .presence_changes
                .iter()
                .map(|pc| XfaPresenceChangeDto {
                    name: pc.name.clone(),
                    before: format!("{:?}", pc.before).to_lowercase(),
                    after: format!("{:?}", pc.after).to_lowercase(),
                })
                .collect();
            // Re-layout changed the document: re-parse + re-flatten so the
            // rendered pages reflect the new datasets and page count.
            self.sync_after_mutation()?;
            Ok(XfaCommitResultDto {
                raw_value: outcome.set.raw_value,
                persisted_to_datasets: outcome.set.persisted_to_datasets,
                interactive: outcome.interactive,
                scripts_executed: outcome.scripts_executed,
                page_count_before: outcome.page_count_before,
                page_count_after: outcome.page_count_after,
                presence_changes,
                model,
            })
        }
        #[cfg(not(feature = "xfa-interactive"))]
        {
            // Phase 1 fallback: static value write, no scripts, no reflow.
            let mut session = self.xfa_session()?;
            let (name, value) = xfa_request_parts(request);
            let outcome = session
                .set_value(name, value)
                .map_err(|e| format!("Kon XFA-veld '{name}' niet invullen: {e}"))?;
            session
                .write_into_document(&mut self.lopdf_doc)
                .map_err(|e| format!("Kon XFA-waarde niet wegschrijven: {e}"))?;
            let page_count = session.page_count();
            let model = XfaFormModelDto {
                page_count,
                fields: session.fields().iter().map(XfaFieldDto::from).collect(),
            };
            self.modified = true;
            Ok(XfaCommitResultDto {
                raw_value: outcome.raw_value,
                persisted_to_datasets: outcome.persisted_to_datasets,
                interactive: false,
                scripts_executed: 0,
                page_count_before: page_count,
                page_count_after: page_count,
                presence_changes: Vec::new(),
                model,
            })
        }
    }

    pub fn document_info(&self) -> DocumentInfo {
        let info = self.pdf_doc.info();

        // Detect XFA before reading page count: dynamic XFA shell PDFs have only
        // 1 page in pdf_doc but render_doc (the pre-flattened layout) contains the
        // full rendered page set.  We must pick the right source first.
        let xfa_detected = (|| -> Option<bool> {
            let root_ref = self
                .lopdf_doc
                .trailer
                .get(b"Root")
                .ok()?
                .as_reference()
                .ok()?;
            let catalog = self.lopdf_doc.get_object(root_ref).ok()?.as_dict().ok()?;
            let acro_obj = catalog.get(b"AcroForm").ok()?;
            let acro_form = if let Ok(r) = acro_obj.as_reference() {
                self.lopdf_doc.get_object(r).ok()?.as_dict().ok()?
            } else {
                acro_obj.as_dict().ok()?
            };
            Some(acro_form.has(b"XFA"))
        })()
        .unwrap_or(false);

        // For XFA documents use the pre-flattened render_doc as the authoritative
        // page source.  For normal PDFs and AcroForms, render_doc == pdf_doc.
        let page_src: &PdfDocument = if xfa_detected {
            &self.render_doc
        } else {
            &self.pdf_doc
        };

        let page_count = page_src.page_count();
        let mut pages = Vec::with_capacity(page_count);

        for i in 0..page_count {
            if let Ok(geom) = page_src.page_geometry(i) {
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

        let mut active_content = self.scan_active_content();
        if xfa_detected {
            active_content.has_xfa = true;
            active_content.mark("xfa");
        }

        let xfa_notice = if xfa_detected {
            Some(
                "XFA-document: alle pagina's worden alleen-lezen weergegeven. \
                 Zet om naar standaard PDF om te bewerken en te zoeken."
                    .to_string(),
            )
        } else {
            None
        };

        DocumentInfo {
            page_count: page_count as u32,
            pages,
            title: info.title,
            author: info.author,
            form_type,
            xfa_detected,
            xfa_notice,
            active_content,
        }
    }

    fn scan_active_content(&self) -> ActiveContentInfo {
        let mut info = ActiveContentInfo::default();
        let mut visited = HashSet::<ObjectId>::new();

        self.scan_active_dictionary(&self.lopdf_doc.trailer, &mut info, &mut visited, 0);
        for (id, object) in &self.lopdf_doc.objects {
            visited.insert(*id);
            self.scan_active_object(object, &mut info, &mut visited, 0);
        }

        info
    }

    fn scan_active_object(
        &self,
        object: &Object,
        info: &mut ActiveContentInfo,
        visited: &mut HashSet<ObjectId>,
        depth: usize,
    ) {
        if depth > 64 {
            return;
        }

        match object {
            Object::Array(items) => {
                for item in items {
                    self.scan_active_object(item, info, visited, depth + 1);
                }
            }
            Object::Dictionary(dict) => {
                self.scan_active_dictionary(dict, info, visited, depth + 1);
            }
            Object::Stream(stream) => {
                self.scan_active_dictionary(&stream.dict, info, visited, depth + 1);
            }
            Object::Reference(id) if visited.insert(*id) => {
                if let Ok(referenced) = self.lopdf_doc.get_object(*id) {
                    self.scan_active_object(referenced, info, visited, depth + 1);
                }
            }
            _ => {}
        }
    }

    fn scan_active_dictionary(
        &self,
        dict: &Dictionary,
        info: &mut ActiveContentInfo,
        visited: &mut HashSet<ObjectId>,
        depth: usize,
    ) {
        if depth > 64 {
            return;
        }

        for (key, value) in dict.iter() {
            match key.as_slice() {
                b"JavaScript" | b"JS" => {
                    info.has_javascript = true;
                    info.mark("javascript");
                }
                b"OpenAction" => {
                    info.has_open_action = true;
                    info.mark("open-action");
                }
                b"AA" => {
                    info.has_additional_actions = true;
                    info.mark("additional-actions");
                }
                b"Launch" => {
                    info.has_launch_actions = true;
                    info.mark("launch");
                }
                b"SubmitForm" => {
                    info.has_submit_form = true;
                    info.mark("submit-form");
                }
                b"URI" => {
                    info.has_uri_actions = true;
                    info.mark("uri");
                }
                b"XFA" => {
                    info.has_xfa = true;
                    info.mark("xfa");
                }
                b"S" => {
                    if let Object::Name(name) = value {
                        self.scan_action_name(name, info);
                    }
                }
                _ => {}
            }

            self.scan_active_object(value, info, visited, depth + 1);
        }
    }

    fn scan_action_name(&self, name: &[u8], info: &mut ActiveContentInfo) {
        match name {
            b"JavaScript" => {
                info.has_javascript = true;
                info.mark("javascript");
            }
            b"Launch" => {
                info.has_launch_actions = true;
                info.mark("launch");
            }
            b"SubmitForm" => {
                info.has_submit_form = true;
                info.mark("submit-form");
            }
            b"URI" => {
                info.has_uri_actions = true;
                info.mark("uri");
            }
            _ => {}
        }
    }

    pub fn render_page(&self, page_index: u32, scale: f32) -> Result<RenderedPage, String> {
        let dpi = (scale * 72.0) as f64;
        let options = RenderOptions {
            dpi,
            render_annotations: true,
            ..Default::default()
        };

        let rendered = self
            .render_doc
            .render_page(page_index as usize, &options)
            .map_err(|e| format!("Failed to render page {page_index}: {e}"))?;

        encode_rendered_page(page_index, &rendered)
    }

    pub fn render_thumbnail(&self, page_index: u32) -> Result<RenderedPage, String> {
        let options = ThumbnailOptions { max_dimension: 280 };

        let rendered = self
            .render_doc
            .thumbnail(page_index as usize, &options)
            .map_err(|e| format!("Failed to render thumbnail {page_index}: {e}"))?;

        encode_rendered_page(page_index, &rendered)
    }

    #[allow(dead_code)]
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
                let rect = annot
                    .rect()
                    .map(|r| AnnotationRectInfo {
                        x: r.x0,
                        y: r.y0,
                        width: (r.x1 - r.x0).abs(),
                        height: (r.y1 - r.y0).abs(),
                    })
                    .unwrap_or(AnnotationRectInfo {
                        x: 0.0,
                        y: 0.0,
                        width: 0.0,
                        height: 0.0,
                    });

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
    /// Width comes from real glyph advance data (WidthSource::Metric) when the
    /// font exposes hmtx/CFF metrics; falls back to `font_size * 0.5 * char_count`
    /// (WidthSource::Estimate) otherwise.  G1/G2 metadata fields are populated
    /// from the same extraction pass — no extra SDK call required.
    pub fn extract_page_text_spans(&self, page_index: u32) -> Result<Vec<TextSpanInfo>, String> {
        let blocks = self
            .pdf_doc
            .extract_text_blocks(page_index as usize)
            .map_err(|e| format!("Failed to extract text spans from page {page_index}: {e}"))?;

        let spans = blocks
            .into_iter()
            .flat_map(|block| block.spans.into_iter())
            .filter(|span| !span.text.trim().is_empty())
            .map(TextSpanInfo::from)
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

    /// Returns the document outline (table of contents) as a flat list.
    /// Returns an empty Vec when the document has no `/Outlines` entry.
    pub fn outline(&self) -> Vec<OutlineItemInfo> {
        match self.lopdf_doc.get_toc() {
            Ok(toc) => toc
                .toc
                .into_iter()
                .map(|item| OutlineItemInfo {
                    title: item.title,
                    page_index: item.page.saturating_sub(1) as u32,
                    children: Vec::new(),
                })
                .collect(),
            Err(_) => Vec::new(),
        }
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
        let mut tree = parse_acroform(self.pdf_doc.pdf()).ok_or("Document has no form fields")?;

        tree.set_value(name, value)
            .map_err(|e| format!("Failed to set field value: {e}"))?;

        // Write the value back to the lopdf document
        let id = tree
            .find_by_name(name)
            .ok_or_else(|| format!("Field not found: {name}"))?;
        let node = tree.get(id);

        if let Some((obj_num, gen_num)) = node.object_id {
            let obj_id = (obj_num as u32, gen_num as u16);
            if let Ok(lopdf::Object::Dictionary(ref mut dict)) =
                self.lopdf_doc.get_object_mut(obj_id)
            {
                dict.set(
                    b"V",
                    lopdf::Object::String(value.as_bytes().to_vec(), lopdf::StringFormat::Literal),
                );
            }
            self.sync_after_mutation()?;
        }
        Ok(())
    }

    /// The complete first-class AcroForm model: one entry per logical field,
    /// with typed kind, per-page widget rects, on-states, options, comb/maxlen
    /// and resolved `/DA`. Empty when the document has no AcroForm.
    pub fn get_form_model(&self) -> Vec<FormFieldModelDto> {
        match parse_acroform(self.pdf_doc.pdf()) {
            Some(tree) => build_form_model(&tree)
                .iter()
                .map(FormFieldModelDto::from)
                .collect(),
            None => Vec::new(),
        }
    }

    /// Apply a typed form value through the SDK writeback chain (`/V` + `/AS` +
    /// `/AP` + `NeedAppearances` fallback), then re-sync so our own renderer
    /// shows the filled value. This is the single save-pariteit write path.
    pub fn apply_form_value(&mut self, request: &FormWriteRequest) -> Result<(), String> {
        match request {
            FormWriteRequest::MultiChoice { name, values } => {
                apply_choice_multi(&mut self.lopdf_doc, name, values)
                    .map_err(|e| format!("Kon veld '{name}' niet invullen: {e}"))?;
            }
            _ => {
                let (name, write): (&str, WriteValue<'_>) = match request {
                    FormWriteRequest::Text { name, value } => (name, WriteValue::Text(value)),
                    FormWriteRequest::Checkbox { name, checked } => {
                        (name, WriteValue::Checkbox(*checked))
                    }
                    FormWriteRequest::Radio { name, export } => (name, WriteValue::Radio(export)),
                    FormWriteRequest::Choice { name, value } => (name, WriteValue::Choice(value)),
                    FormWriteRequest::MultiChoice { .. } => unreachable!(),
                };
                apply_field_value(&mut self.lopdf_doc, name, write)
                    .map_err(|e| format!("Kon veld '{name}' niet invullen: {e}"))?;
            }
        }
        self.sync_after_mutation()
    }

    /// All `/Link` annotations carrying a `/URI` action, with page + rect, for
    /// the clickable-link layer. URI-opening is gated by the UI's capability
    /// trust (ask-on-first-use); this only surfaces where the links are.
    pub fn get_link_annotations(&self) -> Vec<LinkAnnotationDto> {
        let mut out = Vec::new();
        let pages = self.lopdf_doc.get_pages();
        for (&page_num, &page_id) in &pages {
            let annots_arr: Vec<lopdf::Object> = {
                let Ok(page_obj) = self.lopdf_doc.get_object(page_id) else {
                    continue;
                };
                let Ok(dict) = page_obj.as_dict() else { continue };
                match dict.get(b"Annots") {
                    Ok(lopdf::Object::Reference(id)) => match self.lopdf_doc.get_object(*id) {
                        Ok(lopdf::Object::Array(arr)) => arr.clone(),
                        _ => continue,
                    },
                    Ok(lopdf::Object::Array(arr)) => arr.clone(),
                    _ => continue,
                }
            };
            for ann_obj in &annots_arr {
                let lopdf::Object::Reference(ann_id) = ann_obj else {
                    continue;
                };
                let Ok(obj) = self.lopdf_doc.get_object(*ann_id) else {
                    continue;
                };
                let Ok(dict) = obj.as_dict() else { continue };
                // Only /Subtype /Link.
                if !matches!(dict.get(b"Subtype"), Ok(lopdf::Object::Name(n)) if n == b"Link") {
                    continue;
                }
                let Some(rect) = parse_rect_f32(dict) else { continue };
                let Some(uri) = self.resolve_link_uri(dict) else {
                    continue;
                };
                out.push(LinkAnnotationDto {
                    page_index: page_num.saturating_sub(1) as usize,
                    rect,
                    uri,
                });
            }
        }
        out
    }

    /// Resolve a link annotation's `/A /S /URI /URI` string (following one ref).
    fn resolve_link_uri(&self, annot: &lopdf::Dictionary) -> Option<String> {
        let action = match annot.get(b"A").ok()? {
            lopdf::Object::Reference(id) => self.lopdf_doc.get_object(*id).ok()?.as_dict().ok()?,
            lopdf::Object::Dictionary(d) => d,
            _ => return None,
        };
        if !matches!(action.get(b"S"), Ok(lopdf::Object::Name(n)) if n == b"URI") {
            return None;
        }
        match action.get(b"URI").ok()? {
            lopdf::Object::String(bytes, _) => Some(String::from_utf8_lossy(bytes).into_owned()),
            _ => None,
        }
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
    #[allow(dead_code)]
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
            Some(lopdf::Object::Reference(id)) => match self.lopdf_doc.get_object(id).ok() {
                Some(lopdf::Object::Dictionary(d)) => match d.get(b"Nums").ok().cloned() {
                    Some(lopdf::Object::Array(a)) => a,
                    _ => return (1..=page_count).map(|i| i.to_string()).collect(),
                },
                _ => return (1..=page_count).map(|i| i.to_string()).collect(),
            },
            _ => return (1..=page_count).map(|i| i.to_string()).collect(),
        };

        // Parse pairs: (start_page_index, label_dict).
        struct Range {
            start: usize,
            style: u8,
            val: i64,
            prefix: String,
        }
        let mut ranges: Vec<Range> = Vec::new();
        let mut i = 0;
        while i + 1 < nums.len() {
            let start = match &nums[i] {
                lopdf::Object::Integer(n) => *n as usize,
                _ => {
                    i += 2;
                    continue;
                }
            };
            let dict = match &nums[i + 1] {
                lopdf::Object::Dictionary(d) => d.clone(),
                lopdf::Object::Reference(id) => match self.lopdf_doc.get_object(*id).ok() {
                    Some(lopdf::Object::Dictionary(d)) => d.clone(),
                    _ => {
                        i += 2;
                        continue;
                    }
                },
                _ => {
                    i += 2;
                    continue;
                }
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
            ranges.push(Range {
                start,
                style,
                val,
                prefix,
            });
            i += 2;
        }

        // Build one label per page.
        (0..page_count)
            .map(|page| {
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
                            0 => r.prefix.clone(),
                            _ => format!("{}{}", r.prefix, n),
                        }
                    }
                }
            })
            .collect()
    }

    #[allow(dead_code)]
    fn to_roman(mut n: u32, upper: bool) -> String {
        const VALS: &[(u32, &str, &str)] = &[
            (1000, "M", "m"),
            (900, "CM", "cm"),
            (500, "D", "d"),
            (400, "CD", "cd"),
            (100, "C", "c"),
            (90, "XC", "xc"),
            (50, "L", "l"),
            (40, "XL", "xl"),
            (10, "X", "x"),
            (9, "IX", "ix"),
            (5, "V", "v"),
            (4, "IV", "iv"),
            (1, "I", "i"),
        ];
        if n == 0 {
            return String::new();
        }
        let mut s = String::new();
        for &(v, up, lo) in VALS {
            while n >= v {
                s.push_str(if upper { up } else { lo });
                n -= v;
            }
        }
        s
    }

    #[allow(dead_code)]
    fn to_alpha(n: u32, upper: bool) -> String {
        if n == 0 {
            return String::new();
        }
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
                if let Ok(lopdf::Object::Array(ref mut arr)) = self.lopdf_doc.get_object_mut(arr_id)
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
                        format!(
                            "Annotation index {annot_idx} out of bounds (len {})",
                            arr.len()
                        )
                    })?
                    .as_reference()
                    .map_err(|_| "Annotation entry is not an indirect reference".to_string())?
            }
            lopdf::Object::Array(arr) => arr
                .get(annot_idx)
                .ok_or_else(|| {
                    format!(
                        "Annotation index {annot_idx} out of bounds (len {})",
                        arr.len()
                    )
                })?
                .as_reference()
                .map_err(|_| "Annotation entry is not an indirect reference".to_string())?,
            _ => return Err("Unexpected /Annots value type".to_string()),
        };

        // Modify the /Contents field in the annotation dictionary
        if let Ok(lopdf::Object::Dictionary(ref mut dict)) =
            self.lopdf_doc.get_object_mut(annot_obj_id)
        {
            dict.set(
                b"Contents",
                lopdf::Object::String(contents.as_bytes().to_vec(), lopdf::StringFormat::Literal),
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
                        format!(
                            "Annotation index {annot_idx} out of bounds (len {})",
                            arr.len()
                        )
                    })?
                    .as_reference()
                    .map_err(|_| "Annotation entry is not an indirect reference".to_string())?
            }
            lopdf::Object::Array(arr) => arr
                .get(annot_idx)
                .ok_or_else(|| {
                    format!(
                        "Annotation index {annot_idx} out of bounds (len {})",
                        arr.len()
                    )
                })?
                .as_reference()
                .map_err(|_| "Annotation entry is not an indirect reference".to_string())?,
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
        border_width: f32,
    ) -> Result<(), String> {
        let r = color[0] as f64;
        let g = color[1] as f64;
        let b = color[2] as f64;
        let border_width = border_width.clamp(0.5, 12.0) as f64;

        let annot_id = match shape_type {
            "rect" | "rectangle" => {
                let ar = AnnotRect::new(
                    rect[0] as f64,
                    rect[1] as f64,
                    rect[2] as f64,
                    rect[3] as f64,
                );
                AnnotationBuilder::square(ar)
                    .color(r, g, b)
                    .border_width(border_width)
                    .build(&mut self.lopdf_doc)
                    .map_err(|e| format!("Failed to build rect annotation: {e}"))?
            }
            "circle" => {
                let ar = AnnotRect::new(
                    rect[0] as f64,
                    rect[1] as f64,
                    rect[2] as f64,
                    rect[3] as f64,
                );
                AnnotationBuilder::circle(ar)
                    .color(r, g, b)
                    .border_width(border_width)
                    .build(&mut self.lopdf_doc)
                    .map_err(|e| format!("Failed to build circle annotation: {e}"))?
            }
            "line" => {
                // rect = [x1, y1, x2, y2] treated as line endpoints.
                AnnotationBuilder::line(
                    rect[0] as f64,
                    rect[1] as f64,
                    rect[2] as f64,
                    rect[3] as f64,
                )
                .color(r, g, b)
                .border_width(border_width)
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
        let annot_id = self
            .lopdf_doc
            .add_object(lopdf::Object::Dictionary(annot_dict));
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
    ///
    /// This produces PAdES B-B: the certificate over the whole file, with no
    /// timestamp token. The Sign panel names that level rather than the word
    /// "compliant", which is what it used to say over nothing at all.
    ///
    /// B-T and the profiles above it need `SignOptions::timestamp_token` (a
    /// DER-encoded RFC 3161 token) and a TSA the engine does not fetch itself:
    /// there is no HTTP client in the signing path, by design (CLAIMS B09).
    /// Until those profiles are reachable from the pinned engine revision the
    /// options stay at their defaults on purpose -- the SDK refuses a profile
    /// it cannot produce instead of quietly downgrading to B-B, and the UI
    /// must not offer one either. See pdfluent-internal#362, #405.
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
        self.pdf_doc = Arc::new(
            PdfDocument::open(signed_bytes.clone())
                .map_err(|e| format!("Failed to re-parse signed PDF: {e}"))?,
        );
        self.render_doc = Self::make_render_doc(&self.pdf_doc);
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
                    ValidationStatus::Invalid(reason) => (format!("invalid: {reason}"), false),
                    ValidationStatus::Unknown(reason) => (format!("unknown: {reason}"), false),
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
        let level = pdf_compliance::detect_pdfa_level(pdf).unwrap_or(PdfALevel::A2b);

        let report: ComplianceReport = pdf_compliance::validate_pdfa(pdf, level);

        let conformance_level = report
            .pdfa_level
            .map(|l| format!("PDF/A-{}{}", l.part(), l.conformance()));

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
        let _color_report = pdf_manip::pdfa_colorspace::normalize_colorspaces(&mut self.lopdf_doc)
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
        let _xmp_report =
            pdf_manip::pdfa_xmp::repair_xmp_metadata(&mut self.lopdf_doc, conformance, None)
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
        let pages: std::collections::BTreeMap<u32, lopdf::ObjectId> = self.lopdf_doc.get_pages();

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
                entries.push(Entry {
                    page_num,
                    rect: r,
                    annot_obj_id: ann_id,
                });
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
                            if let Some(rgb_img) =
                                image::RgbImage::from_raw(img.width, img.height, img.data.clone())
                            {
                                rgb_img
                                    .save_with_format(&file_path, ImageFormat::Png)
                                    .map_err(|e| format!("Failed to save image {filename}: {e}"))?;
                            } else {
                                std::fs::write(&file_path, &img.data).map_err(|e| {
                                    format!("Failed to write raw image {filename}: {e}")
                                })?;
                            }
                        } else if channels == 1 {
                            if let Some(gray_img) =
                                image::GrayImage::from_raw(img.width, img.height, img.data.clone())
                            {
                                gray_img
                                    .save_with_format(&file_path, ImageFormat::Png)
                                    .map_err(|e| format!("Failed to save image {filename}: {e}"))?;
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
            _ => {
                return Err(format!(
                    "Unsupported image format: {format}. Use png or jpeg."
                ))
            }
        };

        img.save_with_format(output_path, image_format)
            .map_err(|e| format!("Failed to save image: {e}"))?;

        Ok(())
    }

    // ── Conversion operations ─────────────────────────────────────────

    /// Clone the underlying lopdf document so a heavy export (DOCX/XLSX/PPTX)
    /// can run on a worker thread without holding the document mutex or blocking
    /// the UI. The clone is a one-time in-memory copy; the conversion itself
    /// (image extraction + zip) is what must stay off the main thread.
    pub fn clone_lopdf(&self) -> lopdf::Document {
        self.lopdf_doc.clone()
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

        let xml_str =
            String::from_utf8(data).map_err(|e| format!("Invoice XML is not valid UTF-8: {e}"))?;

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

        let xml_str =
            String::from_utf8(data).map_err(|e| format!("Invoice XML is not valid UTF-8: {e}"))?;

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

        if let Ok(lopdf::Object::Dictionary(ref mut dict)) = self.lopdf_doc.get_object_mut(info_id)
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

    /// Replace text on a PDF page using the parser-backed pdf-manip writer.
    ///
    /// The writer parses page content streams, decodes text runs through the
    /// page font map, handles Tj/TJ operators, and re-encodes replacement text
    /// into the matched font or a safe fallback font where possible. Logical
    /// no-op/rejection cases are returned as `replaced=false` with a stable
    /// reason string; the document is synced only after a successful mutation.
    pub fn replace_text_span(
        &mut self,
        page_index: u32,
        original_text: &str,
        replacement_text: &str,
    ) -> Result<TextReplaceResult, String> {
        use pdf_manip::text_replace;
        use pdf_manip::text_run::FontMap;

        if original_text.is_empty() {
            return Ok(TextReplaceResult {
                replaced: false,
                reason: Some("empty-original-text".to_string()),
            });
        }

        // pdf-manip pages are 1-based while TypeScript page indexes are 0-based.
        let page_num = page_index + 1;
        let pages = self.lopdf_doc.get_pages();
        let Some(&page_id) = pages.get(&page_num) else {
            return Ok(TextReplaceResult {
                replaced: false,
                reason: Some("page-not-found".to_string()),
            });
        };

        let content_ids = self.lopdf_doc.get_page_contents(page_id);
        if content_ids.is_empty() {
            return Ok(TextReplaceResult {
                replaced: false,
                reason: Some("no-content-stream".to_string()),
            });
        }

        let fonts = match FontMap::from_page(&self.lopdf_doc, page_num) {
            Ok(fonts) => fonts,
            Err(e) => {
                return Ok(TextReplaceResult {
                    replaced: false,
                    reason: Some(classify_text_replace_error(&e.to_string()).to_string()),
                });
            }
        };

        match text_replace::replace_text(
            &mut self.lopdf_doc,
            page_num,
            original_text,
            replacement_text,
            &fonts,
        ) {
            Ok(0) => Ok(TextReplaceResult {
                replaced: false,
                reason: Some("text-not-found-in-content-stream".to_string()),
            }),
            Ok(_) => {
                self.sync_after_mutation()?;
                Ok(TextReplaceResult {
                    replaced: true,
                    reason: None,
                })
            }
            Err(e) => Ok(TextReplaceResult {
                replaced: false,
                reason: Some(classify_text_replace_error(&e.to_string()).to_string()),
            }),
        }
    }

    // ── Text formatting (G5) ─────────────────────────────────────────

    /// Change the font size and/or fill color of the first content-stream
    /// text run whose text matches `original_text` on `page_index` (0-based).
    ///
    /// Uses `extract_page_text_runs` from `pdf-manip` to locate the text-showing
    /// operator, then delegates to `pdf_text_format::format_text_run` which
    /// injects isolated `Tf`/`rg` operators with full state-isolation.
    ///
    /// Returns `Err` only on I/O or content-stream decode failures.
    /// If the text is not found, returns `Ok(false)`.
    pub fn format_text_span(
        &mut self,
        page_index: u32,
        original_text: &str,
        font_size: Option<f32>,
        color: Option<[f32; 3]>,
    ) -> Result<bool, String> {
        use pdf_manip::text_run::extract_page_text_runs;
        use pdf_text_format::{format_text_run, TextRunLocator};

        // pdf-manip pages are 1-based.
        let page_num = page_index + 1;

        let runs = extract_page_text_runs(&self.lopdf_doc, page_num)
            .map_err(|e| format!("Failed to extract text runs for page {page_index}: {e}"))?;

        let run = runs
            .into_iter()
            .find(|r| r.text == original_text)
            .ok_or_else(|| format!("Text run not found on page {page_index}: '{original_text}'"))?;

        let locator = TextRunLocator::new(run.ops_range.start);

        format_text_run(&mut self.lopdf_doc, page_num, locator, font_size, color)
            .map_err(|e| format!("format_text_run failed: {e}"))?;

        self.sync_after_mutation()?;
        Ok(true)
    }

    // ── Text style (G6) ──────────────────────────────────────────────

    /// Apply bold and/or italic style to the first content-stream text run
    /// matching `original_text` on `page_index` (0-based).
    ///
    /// Swaps the `Tf` font reference to a bold/italic variant of the same
    /// typeface.  The variant must already be embedded in the document xref.
    /// Returns `Err("font-variant-not-embedded: …")` when the variant is
    /// absent — the document is left unmodified in that case.
    ///
    /// Returns `Ok(false)` when the text run is not found.
    pub fn set_text_run_style(
        &mut self,
        page_index: u32,
        original_text: &str,
        bold: Option<bool>,
        italic: Option<bool>,
    ) -> Result<bool, String> {
        use pdf_manip::text_run::extract_page_text_runs;
        use pdf_manip::text_style::set_text_run_style;

        let page_num = page_index + 1;

        let runs = extract_page_text_runs(&self.lopdf_doc, page_num)
            .map_err(|e| format!("Failed to extract text runs for page {page_index}: {e}"))?;

        let run = runs
            .into_iter()
            .find(|r| r.text == original_text)
            .ok_or_else(|| format!("Text run not found on page {page_index}: '{original_text}'"))?;

        set_text_run_style(&mut self.lopdf_doc, page_num, &run, bold, italic)
            .map_err(|e| format!("{e}"))?;

        self.sync_after_mutation()?;
        Ok(true)
    }

    // ── File operations ───────────────────────────────────────────────

    pub fn save_to(&mut self, path: &str) -> Result<(), String> {
        self.lopdf_doc
            .save(path)
            .map_err(|e| format!("Failed to save PDF: {e}"))?;
        self.modified = false;
        // Re-read saved bytes for consistency
        self.raw_bytes =
            std::fs::read(path).map_err(|e| format!("Failed to re-read saved PDF: {e}"))?;
        Ok(())
    }

    /// Re-parse the pdf-syntax document from the current lopdf state.
    /// Call this after mutations to keep the rendering view in sync.
    pub fn sync_after_mutation(&mut self) -> Result<(), String> {
        let mut buf = Vec::new();
        self.lopdf_doc
            .save_to(&mut buf)
            .map_err(|e| format!("Failed to serialize document: {e}"))?;
        self.pdf_doc = Arc::new(
            PdfDocument::open(buf.clone())
                .map_err(|e| format!("Failed to re-parse after mutation: {e}"))?,
        );
        self.render_doc = Self::make_render_doc(&self.pdf_doc);
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
    pub fn extract_pages_to_file(
        &self,
        page_indices: &[u32],
        output_path: &str,
    ) -> Result<(), String> {
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
    let mut merged = pages::merge(&path_refs).map_err(|e| format!("Failed to merge PDFs: {e}"))?;
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
pub fn split_into_pages(
    source_doc: &lopdf::Document,
    output_dir: &str,
) -> Result<Vec<String>, String> {
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

// ── Attachment types ─────────────────────────────────────────────────────────

/// Metadata for a single embedded file (PDF/A-3 §7.11.4).
#[derive(Debug, Clone, Serialize)]
pub struct AttachmentInfo {
    /// Filename from /F or /UF in the filespec dictionary.
    pub name: String,
    /// Uncompressed byte size from /Params/Size (0 if not present).
    pub size_bytes: u64,
    /// Description from /Desc (empty string if not present).
    pub description: String,
    /// MIME type from /Subtype on the embedded file stream.
    pub mime_type: String,
    /// Creation date string from /Params/CreationDate (empty if not present).
    pub creation_date: String,
}

// ── Layer types ───────────────────────────────────────────────────────────────

/// Metadata for a single PDF Optional Content Group (OCG / layer).
#[derive(Debug, Clone, Serialize)]
pub struct LayerInfo {
    /// Unique identifier derived from the lopdf object ID ("gen:num").
    pub id: String,
    /// Layer name from the /Name entry of the OCG dictionary.
    pub name: String,
    /// Default visibility computed from BaseState + /D/ON and /D/OFF arrays.
    pub visible: bool,
    /// Whether this layer appears in the /D/Locked array.
    pub locked: bool,
}

// ── Attachment helpers ────────────────────────────────────────────────────────

/// Compress `data` with zlib (FlateDecode).
fn zlib_compress(data: &[u8]) -> Vec<u8> {
    let mut encoder = ZlibEncoder::new(Vec::new(), Compression::default());
    encoder.write_all(data).expect("zlib write");
    encoder.finish().expect("zlib finish")
}

/// Resolve an Object::Reference to the underlying object (or return the object
/// directly if it is already a non-reference).
fn resolve_obj<'a>(doc: &'a lopdf::Document, obj: &'a Object) -> Option<&'a Object> {
    match obj {
        Object::Reference(id) => doc.get_object(*id).ok(),
        other => Some(other),
    }
}

/// Resolve an object to a &Dictionary, following one level of indirection.
fn resolve_dict<'a>(doc: &'a lopdf::Document, obj: &'a Object) -> Option<&'a Dictionary> {
    match resolve_obj(doc, obj)? {
        Object::Dictionary(d) => Some(d),
        _ => None,
    }
}

/// Walk the /Names/EmbeddedFiles name tree and collect (name, filespec_id) pairs.
/// Handles both flat /Names arrays and multi-level /Kids trees.
fn collect_embedded_file_entries(
    doc: &lopdf::Document,
    node: &Dictionary,
) -> Vec<(String, ObjectId)> {
    let mut result = Vec::new();

    // Flat name array: [name1, ref1, name2, ref2, …]
    if let Ok(Object::Array(arr)) = node.get(b"Names") {
        for pair in arr.chunks(2) {
            if pair.len() < 2 {
                break;
            }
            let name = match &pair[0] {
                Object::String(s, _) => String::from_utf8_lossy(s).into_owned(),
                _ => continue,
            };
            if let Ok(id) = pair[1].as_reference() {
                result.push((name, id));
            }
        }
        return result;
    }

    // Intermediate node with /Kids array.
    if let Ok(Object::Array(kids)) = node.get(b"Kids") {
        for kid in kids {
            if let Some(kid_dict) = resolve_dict(doc, kid) {
                result.extend(collect_embedded_file_entries(doc, kid_dict));
            }
        }
    }

    result
}

impl OpenDocument {
    // ── Attachment methods ─────────────────────────────────────────────────

    /// Return metadata for all embedded files in the /Names/EmbeddedFiles name tree.
    pub fn list_attachments(&self) -> Vec<AttachmentInfo> {
        let doc = &self.lopdf_doc;

        // Get the catalog.
        let catalog_id = match doc
            .trailer
            .get(b"Root")
            .ok()
            .and_then(|o| o.as_reference().ok())
        {
            Some(id) => id,
            None => return Vec::new(),
        };
        let catalog = match doc
            .get_object(catalog_id)
            .ok()
            .and_then(|o| o.as_dict().ok())
        {
            Some(d) => d,
            None => return Vec::new(),
        };

        // Navigate /Names/EmbeddedFiles.
        let names_dict = match catalog
            .get(b"Names")
            .ok()
            .and_then(|o| resolve_dict(doc, o))
        {
            Some(d) => d,
            None => return Vec::new(),
        };
        let ef_tree = match names_dict
            .get(b"EmbeddedFiles")
            .ok()
            .and_then(|o| resolve_dict(doc, o))
        {
            Some(d) => d,
            None => return Vec::new(),
        };

        let entries = collect_embedded_file_entries(doc, ef_tree);
        let mut attachments = Vec::with_capacity(entries.len());

        for (name, filespec_id) in entries {
            let filespec = match doc
                .get_object(filespec_id)
                .ok()
                .and_then(|o| o.as_dict().ok())
            {
                Some(d) => d,
                None => continue,
            };

            // Description (/Desc).
            let description = filespec
                .get(b"Desc")
                .ok()
                .and_then(|o| match o {
                    Object::String(s, _) => Some(String::from_utf8_lossy(s).into_owned()),
                    _ => None,
                })
                .unwrap_or_default();

            // Locate the embedded file stream via /EF/F.
            let ef_dict = match filespec.get(b"EF").ok().and_then(|o| resolve_dict(doc, o)) {
                Some(d) => d,
                None => {
                    attachments.push(AttachmentInfo {
                        name,
                        size_bytes: 0,
                        description,
                        mime_type: "application/octet-stream".to_owned(),
                        creation_date: String::new(),
                    });
                    continue;
                }
            };

            let stream_id = match ef_dict.get(b"F").ok().and_then(|o| o.as_reference().ok()) {
                Some(id) => id,
                None => {
                    attachments.push(AttachmentInfo {
                        name,
                        size_bytes: 0,
                        description,
                        mime_type: "application/octet-stream".to_owned(),
                        creation_date: String::new(),
                    });
                    continue;
                }
            };

            let stream = match doc
                .get_object(stream_id)
                .ok()
                .and_then(|o| o.as_stream().ok())
            {
                Some(s) => s,
                None => {
                    attachments.push(AttachmentInfo {
                        name,
                        size_bytes: 0,
                        description,
                        mime_type: "application/octet-stream".to_owned(),
                        creation_date: String::new(),
                    });
                    continue;
                }
            };

            // MIME type from /Subtype.
            let mime_type = stream
                .dict
                .get(b"Subtype")
                .ok()
                .and_then(|o| match o {
                    Object::Name(n) => Some(String::from_utf8_lossy(n).into_owned()),
                    Object::String(s, _) => Some(String::from_utf8_lossy(s).into_owned()),
                    _ => None,
                })
                .unwrap_or_else(|| "application/octet-stream".to_owned());

            // Size and creation date from /Params.
            let (size_bytes, creation_date) = stream
                .dict
                .get(b"Params")
                .ok()
                .and_then(|o| resolve_dict(doc, o))
                .map(|params| {
                    let size = params
                        .get(b"Size")
                        .ok()
                        .and_then(|o| o.as_i64().ok())
                        .unwrap_or(0) as u64;
                    let date = params
                        .get(b"CreationDate")
                        .ok()
                        .and_then(|o| match o {
                            Object::String(s, _) => Some(String::from_utf8_lossy(s).into_owned()),
                            _ => None,
                        })
                        .unwrap_or_default();
                    (size, date)
                })
                .unwrap_or((0, String::new()));

            attachments.push(AttachmentInfo {
                name,
                size_bytes,
                description,
                mime_type,
                creation_date,
            });
        }

        attachments
    }

    /// Extract the decompressed bytes of an embedded file by filename.
    pub fn extract_attachment(&self, name: &str) -> Result<Vec<u8>, String> {
        let doc = &self.lopdf_doc;

        let catalog_id = doc
            .trailer
            .get(b"Root")
            .ok()
            .and_then(|o| o.as_reference().ok())
            .ok_or("No /Root in trailer")?;
        let catalog = doc
            .get_object(catalog_id)
            .map_err(|e| e.to_string())?
            .as_dict()
            .map_err(|_| "catalog not a dict")?;

        let names_dict = catalog
            .get(b"Names")
            .ok()
            .and_then(|o| resolve_dict(doc, o))
            .ok_or("No /Names in catalog")?;
        let ef_tree = names_dict
            .get(b"EmbeddedFiles")
            .ok()
            .and_then(|o| resolve_dict(doc, o))
            .ok_or("No /EmbeddedFiles name tree")?;

        let entries = collect_embedded_file_entries(doc, ef_tree);
        let filespec_id = entries
            .into_iter()
            .find(|(n, _)| n == name)
            .map(|(_, id)| id)
            .ok_or_else(|| format!("Attachment '{}' not found", name))?;

        let filespec = doc
            .get_object(filespec_id)
            .map_err(|e| e.to_string())?
            .as_dict()
            .map_err(|_| "filespec not a dict")?;

        let ef_dict = filespec
            .get(b"EF")
            .ok()
            .and_then(|o| resolve_dict(doc, o))
            .ok_or("No /EF in filespec")?;

        let stream_id = ef_dict
            .get(b"F")
            .map_err(|_| "No /F in /EF")?
            .as_reference()
            .map_err(|_| "/EF/F is not a reference")?;

        let stream = doc
            .get_object(stream_id)
            .map_err(|e| e.to_string())?
            .as_stream()
            .map_err(|_| "embedded file object is not a stream")?;

        stream.decompressed_content().map_err(|e| e.to_string())
    }

    /// Add a new embedded file to the PDF's /Names/EmbeddedFiles name tree.
    pub fn add_attachment(
        &mut self,
        name: &str,
        data: &[u8],
        mime_type: &str,
    ) -> Result<(), String> {
        let doc = &mut self.lopdf_doc;

        // Create the embedded file stream with FlateDecode compression.
        let compressed = zlib_compress(data);
        let mut ef_stream_dict = Dictionary::new();
        ef_stream_dict.set("Type", Object::Name(b"EmbeddedFile".to_vec()));
        ef_stream_dict.set("Subtype", Object::Name(mime_type.as_bytes().to_vec()));
        ef_stream_dict.set("Filter", Object::Name(b"FlateDecode".to_vec()));
        ef_stream_dict.set(
            "Params",
            Object::Dictionary({
                let mut p = Dictionary::new();
                p.set("Size", Object::Integer(data.len() as i64));
                p
            }),
        );
        let ef_stream = Stream::new(ef_stream_dict, compressed);
        let ef_stream_id = doc.add_object(ef_stream);

        // Create the filespec dictionary.
        let mut filespec = Dictionary::new();
        filespec.set("Type", Object::Name(b"Filespec".to_vec()));
        filespec.set(
            "F",
            Object::String(name.as_bytes().to_vec(), StringFormat::Literal),
        );
        filespec.set(
            "UF",
            Object::String(name.as_bytes().to_vec(), StringFormat::Hexadecimal),
        );
        let mut ef_ref_dict = Dictionary::new();
        ef_ref_dict.set("F", Object::Reference(ef_stream_id));
        ef_ref_dict.set("UF", Object::Reference(ef_stream_id));
        filespec.set("EF", Object::Dictionary(ef_ref_dict));
        let filespec_id = doc.add_object(filespec);

        // Get the catalog object ID.
        let catalog_id = doc
            .trailer
            .get(b"Root")
            .ok()
            .and_then(|o| o.as_reference().ok())
            .ok_or("No /Root in trailer")?;

        // Get or create the /Names indirect object.
        let names_id: ObjectId = {
            let catalog = doc
                .get_object(catalog_id)
                .map_err(|e| e.to_string())?
                .as_dict()
                .map_err(|_| "catalog not a dict")?;

            match catalog.get(b"Names") {
                Ok(Object::Reference(id)) => *id,
                Ok(Object::Dictionary(_)) => {
                    // Externalize the inline dict.
                    let d = catalog.get(b"Names").unwrap().as_dict().unwrap().clone();
                    let id = doc.add_object(d);
                    let cat = doc
                        .get_object_mut(catalog_id)
                        .map_err(|e| e.to_string())?
                        .as_dict_mut()
                        .map_err(|_| "catalog not a dict")?;
                    cat.set("Names", Object::Reference(id));
                    id
                }
                _ => {
                    let id = doc.add_object(Dictionary::new());
                    let cat = doc
                        .get_object_mut(catalog_id)
                        .map_err(|e| e.to_string())?
                        .as_dict_mut()
                        .map_err(|_| "catalog not a dict")?;
                    cat.set("Names", Object::Reference(id));
                    id
                }
            }
        };

        // Get or create the /EmbeddedFiles name tree node under /Names.
        let ef_node_id: Option<ObjectId> = {
            let names_dict = doc
                .get_object(names_id)
                .map_err(|e| e.to_string())?
                .as_dict()
                .map_err(|_| "names not a dict")?;
            match names_dict.get(b"EmbeddedFiles").ok() {
                Some(Object::Reference(id)) => Some(*id),
                _ => None,
            }
        };

        if let Some(ef_id) = ef_node_id {
            // Append to existing /Names array inside the EmbeddedFiles node.
            let ef_dict = doc
                .get_object_mut(ef_id)
                .map_err(|e| e.to_string())?
                .as_dict_mut()
                .map_err(|_| "EmbeddedFiles node not a dict")?;
            match ef_dict.get_mut(b"Names") {
                Ok(Object::Array(ref mut arr)) => {
                    arr.push(Object::String(
                        name.as_bytes().to_vec(),
                        StringFormat::Literal,
                    ));
                    arr.push(Object::Reference(filespec_id));
                }
                _ => {
                    ef_dict.set(
                        "Names",
                        Object::Array(vec![
                            Object::String(name.as_bytes().to_vec(), StringFormat::Literal),
                            Object::Reference(filespec_id),
                        ]),
                    );
                }
            }
        } else {
            // Create new EmbeddedFiles node and add to /Names.
            let new_ef_node = Dictionary::from_iter(vec![(
                "Names",
                Object::Array(vec![
                    Object::String(name.as_bytes().to_vec(), StringFormat::Literal),
                    Object::Reference(filespec_id),
                ]),
            )]);
            let new_ef_id = doc.add_object(new_ef_node);
            let names_dict = doc
                .get_object_mut(names_id)
                .map_err(|e| e.to_string())?
                .as_dict_mut()
                .map_err(|_| "names not a dict")?;
            names_dict.set("EmbeddedFiles", Object::Reference(new_ef_id));
        }

        self.modified = true;
        Ok(())
    }

    /// Remove an embedded file from the /Names/EmbeddedFiles name tree by filename.
    pub fn remove_attachment(&mut self, name: &str) -> Result<(), String> {
        let doc = &mut self.lopdf_doc;

        let catalog_id = doc
            .trailer
            .get(b"Root")
            .ok()
            .and_then(|o| o.as_reference().ok())
            .ok_or("No /Root in trailer")?;

        let names_id: ObjectId = {
            let catalog = doc
                .get_object(catalog_id)
                .map_err(|e| e.to_string())?
                .as_dict()
                .map_err(|_| "catalog not a dict")?;
            match catalog.get(b"Names") {
                Ok(Object::Reference(id)) => *id,
                _ => return Err("No /Names in catalog".to_owned()),
            }
        };

        let ef_id: ObjectId = {
            let names_dict = doc
                .get_object(names_id)
                .map_err(|e| e.to_string())?
                .as_dict()
                .map_err(|_| "names not a dict")?;
            match names_dict.get(b"EmbeddedFiles") {
                Ok(Object::Reference(id)) => *id,
                _ => return Err("No /EmbeddedFiles in names".to_owned()),
            }
        };

        let ef_dict = doc
            .get_object_mut(ef_id)
            .map_err(|e| e.to_string())?
            .as_dict_mut()
            .map_err(|_| "EmbeddedFiles not a dict")?;

        match ef_dict.get_mut(b"Names") {
            Ok(Object::Array(ref mut arr)) => {
                // Find and remove the pair [name_str, filespec_ref].
                let pos = arr.chunks(2).enumerate().find_map(|(i, pair)| {
                    if let Object::String(s, _) = &pair[0] {
                        if String::from_utf8_lossy(s) == name {
                            return Some(i * 2);
                        }
                    }
                    None
                });
                match pos {
                    Some(idx) if idx + 1 < arr.len() => {
                        arr.remove(idx + 1);
                        arr.remove(idx);
                    }
                    Some(idx) => {
                        arr.remove(idx);
                    }
                    None => return Err(format!("Attachment '{}' not found", name)),
                }
            }
            _ => return Err("EmbeddedFiles /Names is not an array".to_owned()),
        }

        self.modified = true;
        Ok(())
    }

    // ── Layer methods ──────────────────────────────────────────────────────

    /// Return all Optional Content Groups (OCGs) with their default visibility.
    #[allow(dead_code)]
    pub fn list_layers(&self) -> Vec<LayerInfo> {
        let doc = &self.lopdf_doc;

        // Navigate to /Root/OCProperties.
        let catalog_id = match doc
            .trailer
            .get(b"Root")
            .ok()
            .and_then(|o| o.as_reference().ok())
        {
            Some(id) => id,
            None => return Vec::new(),
        };
        let catalog = match doc
            .get_object(catalog_id)
            .ok()
            .and_then(|o| o.as_dict().ok())
        {
            Some(d) => d,
            None => return Vec::new(),
        };
        let oc_props = match catalog
            .get(b"OCProperties")
            .ok()
            .and_then(|o| resolve_dict(doc, o))
        {
            Some(d) => d,
            None => return Vec::new(), // No optional content groups.
        };

        // Collect OCG object IDs from /OCGs array.
        let ocg_ids: Vec<ObjectId> = match oc_props.get(b"OCGs").ok() {
            Some(Object::Array(arr)) => arr.iter().filter_map(|o| o.as_reference().ok()).collect(),
            _ => return Vec::new(),
        };

        // Read default display dict /D.
        let default_dict = oc_props.get(b"D").ok().and_then(|o| resolve_dict(doc, o));

        // Determine BaseState (default ON).
        let base_on = default_dict
            .and_then(|d| d.get(b"BaseState").ok())
            .and_then(|o| match o {
                Object::Name(n) => Some(n.as_slice()),
                _ => None,
            })
            .is_none_or(|n| n != b"OFF");

        // Build sets of IDs in /ON, /OFF, /Locked arrays.
        let on_ids: std::collections::HashSet<ObjectId> = default_dict
            .and_then(|d| d.get(b"ON").ok())
            .and_then(|o| o.as_array().ok())
            .map(|arr| arr.iter().filter_map(|o| o.as_reference().ok()).collect())
            .unwrap_or_default();

        let off_ids: std::collections::HashSet<ObjectId> = default_dict
            .and_then(|d| d.get(b"OFF").ok())
            .and_then(|o| o.as_array().ok())
            .map(|arr| arr.iter().filter_map(|o| o.as_reference().ok()).collect())
            .unwrap_or_default();

        let locked_ids: std::collections::HashSet<ObjectId> = default_dict
            .and_then(|d| d.get(b"Locked").ok())
            .and_then(|o| o.as_array().ok())
            .map(|arr| arr.iter().filter_map(|o| o.as_reference().ok()).collect())
            .unwrap_or_default();

        ocg_ids
            .into_iter()
            .filter_map(|id| {
                let ocg_dict = doc.get_object(id).ok()?.as_dict().ok()?;
                let name = ocg_dict
                    .get(b"Name")
                    .ok()
                    .and_then(|o| match o {
                        Object::String(s, _) => Some(String::from_utf8_lossy(s).into_owned()),
                        Object::Name(n) => Some(String::from_utf8_lossy(n).into_owned()),
                        _ => None,
                    })
                    .unwrap_or_else(|| format!("Layer {}", id.0));

                // Visibility: BaseState, then override with /ON / /OFF arrays.
                let visible = if on_ids.contains(&id) {
                    true
                } else if off_ids.contains(&id) {
                    false
                } else {
                    base_on
                };

                Some(LayerInfo {
                    id: format!("{}:{}", id.0, id.1),
                    name,
                    visible,
                    locked: locked_ids.contains(&id),
                })
            })
            .collect()
    }
}

/// Render a page to raw RGBA bytes prefixed with an 8-byte header
/// (`width: u32 LE`, `height: u32 LE`). Used by the binary IPC path: no PNG
/// encode, no base64, no JSON — the frontend reads the header and feeds the
/// pixels straight into an `ImageData`.
pub fn render_page_raw_bytes(
    doc: &PdfDocument,
    page_index: u32,
    scale: f32,
) -> Result<Vec<u8>, String> {
    let dpi = (scale * 72.0) as f64;
    let options = RenderOptions {
        dpi,
        render_annotations: true,
        ..Default::default()
    };

    let rendered = doc
        .render_page(page_index as usize, &options)
        .map_err(|e| format!("Failed to render page {page_index}: {e}"))?;

    let mut body = Vec::with_capacity(8 + rendered.pixels.len());
    body.extend_from_slice(&rendered.width.to_le_bytes());
    body.extend_from_slice(&rendered.height.to_le_bytes());
    body.extend_from_slice(&rendered.pixels);
    Ok(body)
}

/// Render a thumbnail to PNG bytes (no base64/JSON wrapper). Thumbnails are
/// small enough that PNG keeps the payload tiny and the frontend can feed the
/// bytes straight into a `Blob` object URL for `<img>` tags.
pub fn render_thumbnail_png_bytes(doc: &PdfDocument, page_index: u32) -> Result<Vec<u8>, String> {
    let options = ThumbnailOptions { max_dimension: 280 };

    let rendered = doc
        .thumbnail(page_index as usize, &options)
        .map_err(|e| format!("Failed to render thumbnail {page_index}: {e}"))?;

    let img = image::RgbaImage::from_raw(rendered.width, rendered.height, rendered.pixels)
        .ok_or("Failed to create image from rendered pixels")?;
    let mut png_bytes: Vec<u8> = Vec::new();
    img.write_to(&mut Cursor::new(&mut png_bytes), ImageFormat::Png)
        .map_err(|e| format!("Failed to encode PNG: {e}"))?;
    Ok(png_bytes)
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

    /// Release gate for the post-commit render corruption reported on
    /// 2026-06-11. It uses the bundled digital-text fixture and exercises the
    /// complete edit → render → save-as → reopen route in one process.
    #[test]
    fn post_commit_render_pollution_repro() {
        let needle = "Hello";
        // H and N have the same advance in the fixture font. This makes every
        // subsequent glyph an explicitly unmodified render region.
        let replacement = "Nello";

        // 1. Establish a clean baseline.
        let clean1 = sample_doc();
        let base = clean1.render_page(0, 2.0).expect("render clean #1");
        let untouched_page_base = clean1
            .render_page(1, 2.0)
            .expect("render untouched page #2");
        drop(clean1);

        // 2. Commit and render the in-memory document, then save-as.
        let mut edited = sample_doc();
        let result = edited
            .replace_text_span(0, needle, replacement)
            .expect("replace_text_span");
        assert!(
            result.replaced,
            "fixture text must be replaced: {:?}",
            result.reason
        );
        let edited_live = edited.render_page(0, 2.0).expect("render edited copy");
        let tmp = op_tmp("render_pollution_edited.pdf");
        let _ = std::fs::remove_file(&tmp);
        edited
            .save_to(tmp.to_str().unwrap())
            .expect("save edited copy");
        drop(edited);

        // 3. Reopen the save-as result. The live and reopened render must be
        // exactly the same, and the replacement must remain extractable.
        let reopened = OpenDocument::open(tmp.to_str().unwrap()).expect("reopen edited copy");
        let edited_reopened = reopened
            .render_page(0, 2.0)
            .expect("render reopened edited copy");
        let untouched_page_after = reopened
            .render_page(1, 2.0)
            .expect("render untouched page #2 after edit");
        assert_eq!(
            edited_live.data_base64, edited_reopened.data_base64,
            "live edited render differs from save/reopen render"
        );
        assert!(
            reopened
                .extract_page_text(0)
                .expect("extract reopened text")
                .contains(replacement),
            "replacement disappeared after save/reopen"
        );
        assert_eq!(
            untouched_page_base.data_base64, untouched_page_after.data_base64,
            "an untouched page changed after editing page 1"
        );

        // The fixture stores the complete top line in one text-showing
        // operator, so that operator is the edited canvas region. Every pixel
        // outside its deliberately generous 325×50pt mask must stay identical.
        let base_png = general_purpose::STANDARD
            .decode(&base.data_base64)
            .expect("decode clean render");
        let edited_png = general_purpose::STANDARD
            .decode(&edited_reopened.data_base64)
            .expect("decode edited render");
        let base_pixels = image::load_from_memory(&base_png)
            .expect("decode clean PNG")
            .to_rgba8();
        let edited_pixels = image::load_from_memory(&edited_png)
            .expect("decode edited PNG")
            .to_rgba8();
        assert_eq!(base_pixels.dimensions(), edited_pixels.dimensions());

        let mut changed_inside_mask = 0_u32;
        let mut changed_outside_mask = 0_u32;
        let mut changed_bounds = (u32::MAX, u32::MAX, 0_u32, 0_u32);
        for (x, y, clean_pixel) in base_pixels.enumerate_pixels() {
            let edited_pixel = edited_pixels.get_pixel(x, y);
            if clean_pixel != edited_pixel {
                changed_bounds.0 = changed_bounds.0.min(x);
                changed_bounds.1 = changed_bounds.1.min(y);
                changed_bounds.2 = changed_bounds.2.max(x);
                changed_bounds.3 = changed_bounds.3.max(y);
                if x <= 650 && y <= 100 {
                    changed_inside_mask += 1;
                } else {
                    changed_outside_mask += 1;
                }
            }
        }
        assert_eq!(
            changed_outside_mask, 0,
            "unmodified pixels changed; full diff bounds: {changed_bounds:?}"
        );
        assert!(
            changed_inside_mask > 0,
            "edit did not change any rendered pixels"
        );

        // 4. Reopen the untouched fixture after the unrelated commit. This
        // catches process-wide font/glyph/display-list/resource pollution.
        let clean2 = sample_doc();
        let after = clean2.render_page(0, 2.0).expect("render clean #2");

        assert_eq!((base.width, base.height), (after.width, after.height));
        assert_eq!(
            base.data_base64, after.data_base64,
            "render of the CLEAN file changed after an edit in another document \
             — render-state pollution reproduced without any frontend involvement"
        );

        let _ = std::fs::remove_file(&tmp);
    }

    #[test]
    fn parse_pdfa_level_variants() {
        assert_eq!(parse_pdfa_level("2b").unwrap(), PdfALevel::A2b);
        assert_eq!(parse_pdfa_level("PDF/A-1b").unwrap(), PdfALevel::A1b);
        assert_eq!(parse_pdfa_level("3u").unwrap(), PdfALevel::A3u);
        assert!(parse_pdfa_level("5z").is_err());
    }

    // === Toolbar operation backends ===
    // Drives the exact engine entry points the desktop toolbar buttons invoke,
    // on a real 2-page PDF, and verifies real output. The engine code is the
    // same on macOS, Windows, and Linux, so this exercises all three platforms.
    const SAMPLE_PDF: &[u8] = include_bytes!("../tests/fixtures/two_pages.pdf");

    fn sample_doc() -> OpenDocument {
        OpenDocument::open_bytes(SAMPLE_PDF.to_vec()).expect("open sample pdf")
    }

    fn op_tmp(name: &str) -> std::path::PathBuf {
        let dir = std::env::temp_dir().join("pdfluent_op_tests");
        std::fs::create_dir_all(&dir).expect("mk tmp dir");
        dir.join(name)
    }

    #[test]
    fn op_open_reports_page_count() {
        let info = sample_doc().document_info();
        assert!(info.page_count >= 2, "expected >=2 pages, got {}", info.page_count);
    }

    #[test]
    fn op_render_page_and_thumbnail_produce_image_bytes() {
        let doc = sample_doc();
        let page = doc.render_page(0, 1.5).expect("render_page");
        assert!(page.width > 0 && page.height > 0, "zero-size render");
        assert!(page.data_base64.len() > 1000, "render too small: {} b64 chars", page.data_base64.len());
        let thumb = doc.render_thumbnail(0).expect("render_thumbnail");
        assert!(thumb.width > 0 && thumb.data_base64.len() > 200, "thumbnail too small");
    }

    #[test]
    fn op_extract_text_returns_content() {
        let text = sample_doc().extract_page_text(0).expect("extract_page_text");
        assert!(!text.trim().is_empty(), "no text extracted from page 0");
    }

    #[test]
    fn op_save_writes_reopenable_pdf() {
        let mut doc = sample_doc();
        let out = op_tmp("saved.pdf");
        doc.save_to(out.to_str().unwrap()).expect("save_to");
        let bytes = std::fs::read(&out).expect("read saved");
        assert!(bytes.starts_with(b"%PDF"), "saved file is not a PDF");
        let reopened = OpenDocument::open(out.to_str().unwrap()).expect("reopen saved");
        assert!(reopened.document_info().page_count >= 2);
    }

    #[test]
    fn op_extract_pages_to_file_yields_single_page() {
        let out = op_tmp("extracted.pdf");
        sample_doc()
            .extract_pages_to_file(&[0_u32], out.to_str().unwrap())
            .expect("extract_pages_to_file");
        let reopened = OpenDocument::open(out.to_str().unwrap()).expect("reopen extracted");
        assert_eq!(reopened.document_info().page_count, 1, "extract should yield 1 page");
    }

    #[test]
    fn op_merge_pdfs_combines_page_counts() {
        let a = op_tmp("merge_a.pdf");
        let b = op_tmp("merge_b.pdf");
        let out = op_tmp("merged.pdf");
        std::fs::write(&a, SAMPLE_PDF).unwrap();
        std::fs::write(&b, SAMPLE_PDF).unwrap();
        merge_pdfs(
            &[a.to_string_lossy().into_owned(), b.to_string_lossy().into_owned()],
            out.to_str().unwrap(),
        )
        .expect("merge_pdfs");
        let reopened = OpenDocument::open(out.to_str().unwrap()).expect("reopen merged");
        assert!(
            reopened.document_info().page_count >= 4,
            "merged should have >=4 pages, got {}",
            reopened.document_info().page_count
        );
    }

    #[test]
    fn op_split_into_pages_yields_one_pdf_per_page() {
        let doc = sample_doc();
        let dir = op_tmp("split_out");
        std::fs::create_dir_all(&dir).unwrap();
        let files = split_into_pages(&doc.lopdf_doc, dir.to_str().unwrap()).expect("split_into_pages");
        assert!(files.len() >= 2, "expected >=2 split files, got {}", files.len());
        for f in &files {
            assert!(OpenDocument::open(f).is_ok(), "split output not a valid PDF: {f}");
        }
    }

    #[test]
    fn op_rotate_pages_keeps_document_valid() {
        let mut doc = sample_doc();
        doc.rotate_pages(&[0_u32], 90).expect("rotate_pages");
        let out = op_tmp("rotated.pdf");
        doc.save_to(out.to_str().unwrap()).expect("save rotated");
        assert!(OpenDocument::open(out.to_str().unwrap()).is_ok(), "rotated doc not reopenable");
    }

    #[test]
    fn op_search_text_finds_known_word() {
        let pages = sample_doc().search_text("Hello");
        assert!(!pages.is_empty(), "search for 'Hello' found nothing");
    }

    #[test]
    fn op_replace_text_span_writes_parser_backed_content_stream() {
        let mut doc = sample_doc();
        let before = doc.extract_page_text(0).expect("extract text before replacement");
        assert!(before.contains("Hello"), "fixture should contain text to replace: {before:?}");

        let result = doc
            .replace_text_span(0, "Hello", "Hello native vector editor")
            .expect("replace_text_span");
        assert!(result.replaced, "replacement failed: {:?}", result.reason);

        let after = doc.extract_page_text(0).expect("extract text after replacement");
        assert!(
            after.contains("Hello native vector editor"),
            "replacement was not visible through the synced render/extract document: {after:?}"
        );
    }

    /// In-memory PDF with one text block of three lines (separate Td-positioned
    /// Tj ops, same font), where the middle line is split across two Tj
    /// operators — the shape that forces replace_text through the cross-run path.
    fn multiline_fixture_bytes() -> Vec<u8> {
        use lopdf::{dictionary, Document, Object, Stream};

        let mut doc = Document::with_version("1.7");
        let font_id = doc.add_object(Object::Dictionary(dictionary! {
            "Type" => "Font",
            "Subtype" => "Type1",
            "BaseFont" => "Helvetica",
        }));
        let resources = dictionary! {
            "Font" => Object::Dictionary(dictionary! { "F1" => Object::Reference(font_id) }),
        };
        let content: &[u8] = b"BT /F1 12 Tf 72 700 Td (First line here.) Tj 0 -14 Td (Some words to ) Tj (edit now.) Tj 0 -14 Td (Third line stays.) Tj ET";
        let content_id = doc.add_object(Object::Stream(Stream::new(dictionary! {}, content.to_vec())));
        let page_id = doc.add_object(Object::Dictionary(dictionary! {
            "Type" => "Page",
            "MediaBox" => vec![0.into(), 0.into(), 612.into(), 792.into()],
            "Contents" => Object::Reference(content_id),
            "Resources" => Object::Dictionary(resources),
        }));
        let pages_id = doc.add_object(Object::Dictionary(dictionary! {
            "Type" => "Pages",
            "Kids" => vec![Object::Reference(page_id)],
            "Count" => 1_i64,
        }));
        if let Ok(Object::Dictionary(ref mut d)) = doc.get_object_mut(page_id) {
            d.set("Parent", Object::Reference(pages_id));
        }
        let catalog_id = doc.add_object(Object::Dictionary(dictionary! {
            "Type" => "Catalog",
            "Pages" => Object::Reference(pages_id),
        }));
        doc.trailer.set("Root", Object::Reference(catalog_id));

        let mut bytes = Vec::new();
        doc.save_to(&mut bytes).expect("serialize multiline fixture");
        bytes
    }

    #[test]
    fn op_replace_text_span_preserves_multiline_layout() {
        // Regression for the release-blocking multiline collapse: editing one
        // line of a multi-line block must not concatenate the whole block into
        // the first line's operator.
        let mut doc =
            OpenDocument::open_bytes(multiline_fixture_bytes()).expect("open multiline fixture");

        let result = doc
            .replace_text_span(0, "Some words to edit now.", "Some words to edit.")
            .expect("replace_text_span");
        assert!(result.replaced, "replacement failed: {:?}", result.reason);

        let expected = "First line here.Some words to edit.Third line stays.";
        let runs = pdf_manip::text_run::extract_page_text_runs(&doc.lopdf_doc, 1)
            .expect("extract runs after edit");
        assert_eq!(
            runs.first().map(|r| r.text.as_str()),
            Some("First line here."),
            "first line must keep only its own text"
        );
        assert_eq!(
            runs.last().map(|r| r.text.as_str()),
            Some("Third line stays."),
            "third line must not be emptied"
        );
        let combined: String = runs.iter().map(|r| r.text.as_str()).collect();
        assert_eq!(combined, expected);

        // Save → reopen: the layout-preserving edit must survive a round-trip.
        let out = op_tmp("multiline_edited.pdf");
        doc.save_to(out.to_str().unwrap()).expect("save multiline");
        let reopened = OpenDocument::open(out.to_str().unwrap()).expect("reopen multiline");
        let reopened_runs = pdf_manip::text_run::extract_page_text_runs(&reopened.lopdf_doc, 1)
            .expect("extract runs after reopen");
        let reopened_combined: String = reopened_runs.iter().map(|r| r.text.as_str()).collect();
        assert_eq!(reopened_combined, expected);
        assert_eq!(
            reopened_runs.first().map(|r| r.text.as_str()),
            Some("First line here.")
        );
        assert_eq!(
            reopened_runs.last().map(|r| r.text.as_str()),
            Some("Third line stays.")
        );
    }

    #[test]
    fn op_delete_pages_reduces_count() {
        let mut doc = sample_doc();
        doc.delete_pages(&[0_u32]).expect("delete_pages");
        assert_eq!(doc.document_info().page_count, 1, "delete should leave 1 page");
    }

    #[test]
    fn op_reorder_pages_keeps_document_valid() {
        let mut doc = sample_doc();
        doc.reorder_pages(&[1_u32, 0_u32]).expect("reorder_pages");
        assert_eq!(doc.document_info().page_count, 2);
        let out = op_tmp("reordered.pdf");
        doc.save_to(out.to_str().unwrap()).expect("save reordered");
        assert!(OpenDocument::open(out.to_str().unwrap()).is_ok());
    }

    #[test]
    fn op_compress_produces_valid_pdf() {
        let mut doc = sample_doc();
        let out = op_tmp("compressed.pdf");
        doc.compress(out.to_str().unwrap()).expect("compress");
        let reopened = OpenDocument::open(out.to_str().unwrap()).expect("reopen compressed");
        assert!(reopened.document_info().page_count >= 2);
    }

    #[test]
    fn op_watermark_keeps_document_valid() {
        let mut doc = sample_doc();
        doc.add_watermark("DRAFT", 0.3).expect("add_watermark");
        let out = op_tmp("watermarked.pdf");
        doc.save_to(out.to_str().unwrap()).expect("save watermarked");
        assert!(OpenDocument::open(out.to_str().unwrap()).is_ok());
    }

    #[test]
    fn op_add_highlight_annotation_persists() {
        let mut doc = sample_doc();
        let before = doc.get_all_annotations().len();
        doc.add_highlight_annotation(0, &[[100.0, 100.0, 220.0, 120.0]], [1.0, 1.0, 0.0])
            .expect("add_highlight_annotation");
        let after = doc.get_all_annotations().len();
        assert!(after > before, "highlight annotation not added ({before} -> {after})");
    }

    #[test]
    fn op_convert_to_docx_produces_non_empty_output() {
        let doc = sample_doc();
        let tmp = op_tmp("converted.docx");
        convert_doc_to_docx(&doc.clone_lopdf(), tmp.to_str().unwrap()).expect("Conversion failed");
        let meta = std::fs::metadata(&tmp).expect("Failed to read output");
        assert!(meta.len() > 0, "DOCX output is 0 bytes!");
        let header = std::fs::read(&tmp).expect("Failed to read back");
        assert!(header.len() > 100, "DOCX output too small: {} bytes", header.len());
        assert_eq!(&header[0..2], b"PK", "DOCX must start with ZIP PK header");
    }

    #[test]
    fn op_convert_to_xlsx_produces_non_empty_output() {
        let doc = sample_doc();
        let tmp = op_tmp("converted.xlsx");
        convert_doc_to_xlsx(&doc.clone_lopdf(), tmp.to_str().unwrap()).expect("Conversion failed");
        let meta = std::fs::metadata(&tmp).expect("Failed to read output");
        assert!(meta.len() > 0, "XLSX output is 0 bytes!");
        let header = std::fs::read(&tmp).expect("Failed to read back");
        assert!(header.len() > 100, "XLSX output too small: {} bytes", header.len());
        assert_eq!(&header[0..2], b"PK", "XLSX must start with ZIP PK header");
    }

    #[test]
    fn op_convert_to_pptx_produces_non_empty_output() {
        let doc = sample_doc();
        let tmp = op_tmp("converted.pptx");
        convert_doc_to_pptx(&doc.clone_lopdf(), tmp.to_str().unwrap()).expect("Conversion failed");
        let meta = std::fs::metadata(&tmp).expect("Failed to read output");
        assert!(meta.len() > 0, "PPTX output is 0 bytes!");
        let header = std::fs::read(&tmp).expect("Failed to read back");
        assert!(header.len() > 100, "PPTX output too small: {} bytes", header.len());
        assert_eq!(&header[0..2], b"PK", "PPTX must start with ZIP PK header");
    }

    #[test]
    fn test_user_file_conversion() {
        let path = "/Users/jasperdewinter/Downloads/CV_Jasper_de_Winter_AnalyticsEngineer (1).pdf";
        if std::path::Path::new(path).exists() {
            let bytes = std::fs::read(path).unwrap();
            let doc = OpenDocument::open_bytes(bytes).expect("Failed to load PDF");
            let tmp_docx = op_tmp("user_converted.docx");
            let tmp_xlsx = op_tmp("user_converted.xlsx");
            let tmp_pptx = op_tmp("user_converted.pptx");

            convert_doc_to_docx(&doc.clone_lopdf(), tmp_docx.to_str().unwrap()).expect("Conversion to DOCX failed");
            let meta_docx = std::fs::metadata(&tmp_docx).unwrap();
            assert!(meta_docx.len() > 0);

            convert_doc_to_xlsx(&doc.clone_lopdf(), tmp_xlsx.to_str().unwrap()).expect("Conversion to XLSX failed");
            let meta_xlsx = std::fs::metadata(&tmp_xlsx).unwrap();
            assert!(meta_xlsx.len() > 0);

            convert_doc_to_pptx(&doc.clone_lopdf(), tmp_pptx.to_str().unwrap()).expect("Conversion to PPTX failed");
            let meta_pptx = std::fs::metadata(&tmp_pptx).unwrap();
            assert!(meta_pptx.len() > 0);
        }
    }

    /// Drift guard (Rust half): the SDK's canonical `TextSpanInfo` must serialise
    /// to exactly the JSON keys listed here. If this test fails, update the TS
    /// interfaces and contract lists in `src/lib/tauri-api.ts` and
    /// `src/lib/textSpanWireContract.ts` together.
    #[test]
    fn text_span_info_wire_contract_is_stable() {
        use pdf_engine::{FontMetrics, WidthSource};

        let span = TextSpanInfo {
            text: "x".to_string(),
            x: 1.0,
            y: 2.0,
            width: 3.0,
            height: 4.0,
            font_size: 5.0,
            font_name: Some("Helvetica".to_string()),
            is_bold: true,
            is_italic: true,
            color: Some([0.1, 0.2, 0.3]),
            width_source: WidthSource::Metric,
            char_bounds: vec![[0.0, 0.0, 1.0, 1.0]],
            transform: Some([1.0, 0.0, 0.0, 1.0, 0.0, 0.0]),
            font_weight: Some(700),
            is_serif: Some(false),
            is_monospace: Some(false),
            render_mode: Some(0),
            font_metrics: Some(FontMetrics {
                ascent: 750.0,
                descent: -250.0,
                cap_height: Some(700.0),
                x_height: Some(500.0),
            }),
        };

        let value = serde_json::to_value(&span).expect("serialize TextSpanInfo");
        let mut keys: Vec<String> = value
            .as_object()
            .expect("TextSpanInfo serialises to a JSON object")
            .keys()
            .cloned()
            .collect();
        keys.sort();

        let mut expected = vec![
            "charBounds",
            "color",
            "font_size",
            "fontMetrics",
            "fontName",
            "fontWeight",
            "height",
            "isBold",
            "isItalic",
            "isMonospace",
            "isSerif",
            "renderMode",
            "text",
            "transform",
            "width",
            "widthSource",
            "x",
            "y",
        ];
        expected.sort_unstable();

        assert_eq!(
            keys, expected,
            "TextSpanInfo wire keys drifted from the editor/TS contract; update \
             src/lib/tauri-api.ts and src/lib/textSpanWireContract.ts together."
        );
    }

    #[test]
    fn form_model_wire_contract_is_stable() {
        // A representative text field plus one widget exercises every level of
        // the wire shape (field, tagged kind, widget, DA).
        let dto = FormFieldModelDto {
            name: "1.1".to_string(),
            kind: FormFieldKindDto::Text {
                multiline: false,
                comb: true,
                password: false,
            },
            value: Some("x".to_string()),
            selected_values: None,
            default_value: None,
            tooltip: Some("Bedrijfsnaam".to_string()),
            read_only: false,
            required: false,
            max_len: Some(9),
            quadding: 1,
            da: DaInfoDto {
                font_name: Some("Helv".to_string()),
                font_size: 0.0,
                color: vec![0.0],
            },
            widgets: vec![WidgetModelDto {
                page_index: Some(1),
                rect: [0.0, 0.0, 90.0, 12.0],
                on_state: None,
                appearance_state: None,
            }],
        };

        let value = serde_json::to_value(&dto).expect("serialize FormFieldModelDto");
        let obj = value.as_object().expect("serialises to a JSON object");
        let mut keys: Vec<String> = obj.keys().cloned().collect();
        keys.sort();
        let mut expected = vec![
            "da",
            "defaultValue",
            "kind",
            "maxLen",
            "name",
            "quadding",
            "readOnly",
            "required",
            "selectedValues",
            "tooltip",
            "value",
            "widgets",
        ];
        expected.sort_unstable();
        assert_eq!(
            keys, expected,
            "FormFieldModelDto wire keys drifted; update src/lib/tauri-api.ts \
             (FormFieldModelDto) and tests/viewer-form-overlay.test.ts together."
        );

        // The tagged kind must expose the `type` discriminant + kind data.
        let kind = obj["kind"].as_object().expect("kind is an object");
        assert_eq!(kind["type"], "text");
        assert!(kind.contains_key("multiline") && kind.contains_key("comb"));

        // Widget + DA camelCase keys are part of the contract.
        let widget = obj["widgets"][0].as_object().expect("widget object");
        for k in ["pageIndex", "rect", "onState", "appearanceState"] {
            assert!(widget.contains_key(k), "widget missing wire key {k}");
        }
        let da = obj["da"].as_object().expect("da object");
        for k in ["fontName", "fontSize", "color"] {
            assert!(da.contains_key(k), "da missing wire key {k}");
        }
    }

    // === AcroForm Save-As roundtrip proof ===
    // Proves that apply_form_value writes a value to the in-memory lopdf document,
    // that save_to serialises it correctly, and that reopening the saved file reads
    // back the same value.  This is the definitive closure for the "Save As"
    // question: NSSavePanel cannot be driven by automation, but the underlying
    // ⌘S code path (save_to on the lopdf Document) is exercised here end-to-end.

    const SAMPLE_ACROFORM_PDF: &[u8] =
        include_bytes!("../tests/fixtures/sample_acroform.pdf");

    #[test]
    fn acroform_fill_save_reopens_with_value() {
        // 1. Load a real AcroForm PDF (I-551 immigration form — multiple text fields).
        let mut doc =
            OpenDocument::open_bytes(SAMPLE_ACROFORM_PDF.to_vec()).expect("open acroform pdf");

        // 2. Discover the first writable text field via the form model.
        let model = doc.get_form_model();
        let text_field = model.iter().find(|f| {
            !f.read_only
                && matches!(
                    f.kind,
                    FormFieldKindDto::Text { .. }
                )
        });
        let field = match text_field {
            Some(f) => f.clone(),
            None => {
                // The PDF has AcroForm but no writable text fields in the model —
                // possibly all read-only or unsupported.  Treat as a known skip.
                eprintln!("acroform_fill_save_reopens_with_value: no writable text field found — skipped");
                return;
            }
        };

        // 3. Fill the field with a sentinel value.
        let sentinel = "PDFLUENT_SAVE_PROOF_2026";
        doc.apply_form_value(&FormWriteRequest::Text {
            name: field.name.clone(),
            value: sentinel.to_string(),
        })
        .expect("apply_form_value should succeed on a writable text field");

        // 4. Save to a temp file (equivalent to ⌘S Save-As path).
        let out = op_tmp("acroform_roundtrip.pdf");
        doc.save_to(out.to_str().unwrap()).expect("save_to");

        // 5. Reopen the saved file — completely fresh parse from disk.
        let reopened =
            OpenDocument::open(out.to_str().unwrap()).expect("reopen saved acroform");

        // 6. Verify the sentinel value is present in the reopened form model.
        let reopened_model = reopened.get_form_model();
        let reopened_field = reopened_model.iter().find(|f| f.name == field.name);
        let persisted_value = reopened_field
            .and_then(|f| f.value.as_deref())
            .unwrap_or("");
        assert_eq!(
            persisted_value, sentinel,
            "form field '{}' value did not persist through save/reopen: got {:?}",
            field.name, persisted_value
        );
    }

    // === Render-path performance baseline ===
    // Not a regression gate — a measurement harness for the render path work.
    // Run: PDFLUENT_BENCH_PDF=/path/to.pdf cargo test --release perf_render_baseline -- --ignored --nocapture
    #[test]
    #[ignore]
    fn perf_render_baseline() {
        use std::time::Instant;

        let path = std::env::var("PDFLUENT_BENCH_PDF")
            .unwrap_or_else(|_| "tests/fixtures/two_pages.pdf".to_string());
        let file_len = std::fs::metadata(&path).expect("bench pdf exists").len();
        println!("\n=== perf_render_baseline: {path} ({file_len} bytes) ===");

        fn median_ms(mut runs: Vec<f64>) -> f64 {
            runs.sort_by(|a, b| a.partial_cmp(b).unwrap());
            runs[runs.len() / 2]
        }
        fn time_ms<R>(f: impl FnOnce() -> R) -> (f64, R) {
            let t = Instant::now();
            let r = f();
            (t.elapsed().as_secs_f64() * 1000.0, r)
        }

        // -- Open path, current shape: fs::read + PdfDocument::open(clone) + lopdf load(path)
        let mut open_runs = Vec::new();
        for _ in 0..5 {
            let (ms, doc) = time_ms(|| OpenDocument::open(&path).expect("open"));
            open_runs.push(ms);
            drop(doc);
        }
        println!("open (current: 2 disk reads + byte clone): {:.2} ms", median_ms(open_runs));

        // -- Open path, stage split
        let (read_ms, bytes) = time_ms(|| std::fs::read(&path).expect("read"));
        let (sdk_open_ms, _pdf_doc) =
            time_ms(|| PdfDocument::open(bytes.clone()).expect("sdk open"));
        let (lopdf_disk_ms, _l1) =
            time_ms(|| lopdf::Document::load(&path).expect("lopdf load disk"));
        let (lopdf_mem_ms, _l2) =
            time_ms(|| lopdf::Document::load_mem(&bytes).expect("lopdf load mem"));
        println!("  fs::read: {read_ms:.2} ms | sdk open(+clone): {sdk_open_ms:.2} ms | lopdf load(path): {lopdf_disk_ms:.2} ms | lopdf load_mem: {lopdf_mem_ms:.2} ms");

        let doc = OpenDocument::open(&path).expect("open");

        // -- document_info split: full vs scan_active_content alone
        let mut info_runs = Vec::new();
        for _ in 0..5 {
            let (ms, _) = time_ms(|| doc.document_info());
            info_runs.push(ms);
        }
        let mut scan_runs = Vec::new();
        for _ in 0..5 {
            let (ms, _) = time_ms(|| doc.scan_active_content());
            scan_runs.push(ms);
        }
        println!(
            "document_info (geometry+acroform+scan): {:.2} ms | scan_active_content alone: {:.2} ms",
            median_ms(info_runs),
            median_ms(scan_runs)
        );

        // -- Render path stage split at viewer scale 2.0 (≈ 144 dpi)
        let options = RenderOptions { dpi: 144.0, render_annotations: true, ..Default::default() };

        // OLD path: raw (possibly XFA) doc — SDK re-flattens per render call.
        let mut old_render_runs = Vec::new();
        for _ in 0..5 {
            let (ms, _) = time_ms(|| doc.pdf_doc.render_page(0, &options).expect("sdk render"));
            old_render_runs.push(ms);
        }
        println!("render page0 @scale2 OLD (raw doc, per-render XFA flatten): {:.2} ms", median_ms(old_render_runs));

        // NEW path: render snapshot (XFA flattened once at open).
        let snapshot = doc.render_snapshot();
        let mut sdk_render_runs = Vec::new();
        let mut rendered_holder = None;
        for _ in 0..5 {
            let (ms, r) = time_ms(|| snapshot.render_page(0, &options).expect("sdk render"));
            sdk_render_runs.push(ms);
            rendered_holder = Some(r);
        }
        let rendered = rendered_holder.unwrap();

        // NEW transport: raw RGBA bytes (header + pixels), no PNG/base64.
        let mut raw_runs = Vec::new();
        for _ in 0..5 {
            let (ms, _) = time_ms(|| render_page_raw_bytes(&snapshot, 0, 2.0).expect("raw render"));
            raw_runs.push(ms);
        }
        println!("render page0 @scale2 NEW (snapshot, raw bytes incl. render): {:.2} ms", median_ms(raw_runs));
        let raw_len = rendered.pixels.len();

        let mut png_runs = Vec::new();
        let mut png_len = 0usize;
        for _ in 0..5 {
            let (ms, png) = time_ms(|| {
                let img = image::RgbaImage::from_raw(
                    rendered.width,
                    rendered.height,
                    rendered.pixels.clone(),
                )
                .unwrap();
                let mut out: Vec<u8> = Vec::new();
                img.write_to(&mut Cursor::new(&mut out), ImageFormat::Png).unwrap();
                out
            });
            png_runs.push(ms);
            png_len = png.len();
        }

        let img = image::RgbaImage::from_raw(rendered.width, rendered.height, rendered.pixels.clone()).unwrap();
        let mut png_bytes: Vec<u8> = Vec::new();
        img.write_to(&mut Cursor::new(&mut png_bytes), ImageFormat::Png).unwrap();
        let mut b64_runs = Vec::new();
        let mut b64_len = 0usize;
        for _ in 0..5 {
            let (ms, s) = time_ms(|| general_purpose::STANDARD.encode(&png_bytes));
            b64_runs.push(ms);
            b64_len = s.len();
        }

        println!(
            "render page0 @scale2: sdk {:.2} ms | png encode(+clone) {:.2} ms | base64 {:.2} ms",
            median_ms(sdk_render_runs),
            median_ms(png_runs),
            median_ms(b64_runs)
        );
        println!(
            "payload {}x{}: raw RGBA {} KB | png {} KB | base64 {} KB",
            rendered.width,
            rendered.height,
            raw_len / 1024,
            png_len / 1024,
            b64_len / 1024
        );

        // -- Thumbnail stage split
        let mut thumb_runs = Vec::new();
        for _ in 0..5 {
            let (ms, _) = time_ms(|| doc.render_thumbnail(0).expect("thumb"));
            thumb_runs.push(ms);
        }
        println!("render_thumbnail (sdk+png+b64): {:.2} ms", median_ms(thumb_runs));
    }

    // === XFA Phase 0 — page-count regression tests ===
    // Invariants: normal PDFs and AcroForms are unchanged; dynamic XFA now
    // reports the rendered (flattened) page count instead of the 1-page shell.

    // A fixture we generate ourselves (#259). It replaced a third-party
    // immigration form whose redistribution terms were never established; that
    // file is gone, and `include_bytes!` resolves at build time, so these four
    // tests went with it. The replacement is built by
    // `crates/xfa-test-runner/examples/generate_xfa_layout_fixtures.rs` in the
    // engine repository, which also asserts there that the shell stays one page
    // and the layout keeps flattening to three -- the property this file
    // depends on and cannot see.
    const DYNAMIC_XFA_PDF: &[u8] =
        include_bytes!("../tests/fixtures/xl_31_dynamic_multipage_overflow.pdf");

    /// The fixture's field count. Pinned rather than `!is_empty()`: a model that
    /// enumerated one field of fifty would satisfy "not empty" while leaving the
    /// overlay with nothing to place on pages two and three.
    const XFA_FIELD_COUNT: usize = 50;

    #[test]
    fn document_info_page_count_normal_pdf() {
        let info = sample_doc().document_info();
        assert_eq!(info.page_count, 2, "two_pages.pdf must still report 2 pages");
        assert!(!info.xfa_detected, "two_pages.pdf must not be flagged as XFA");
    }

    #[test]
    fn document_info_page_count_acroform() {
        let doc = OpenDocument::open_bytes(SAMPLE_ACROFORM_PDF.to_vec())
            .expect("open acroform");
        let info = doc.document_info();
        assert_eq!(info.page_count, 1, "sample AcroForm is 1 page");
        assert!(!info.xfa_detected, "AcroForm must not be flagged as XFA");
    }

    #[test]
    fn dynamic_xfa_document_info_uses_render_page_count() {
        let doc = OpenDocument::open_bytes(DYNAMIC_XFA_PDF.to_vec())
            .expect("open dynamic XFA");

        let shell_pages = doc.pdf_doc.page_count();
        let render_pages = doc.render_doc_page_count();
        let info = doc.document_info();

        // The fixture is a 1-page shell whose 50 fields lay out over 3 pages.
        assert_eq!(shell_pages, 1, "shell PDF is 1 page");
        assert_eq!(render_pages, 3, "flattened layout produces 3 pages");
        assert!(info.xfa_detected, "must be detected as XFA");
        assert_eq!(
            info.page_count, render_pages as u32,
            "document_info must report the render page count ({render_pages}), not the shell count ({shell_pages})"
        );
        assert_eq!(
            info.pages.len(),
            render_pages,
            "pages vec must have one entry per rendered page"
        );
        // Every rendered page must report a non-zero size.
        for (i, p) in info.pages.iter().enumerate() {
            assert!(p.width_pt > 0.0, "page {i} width must be > 0");
            assert!(p.height_pt > 0.0, "page {i} height must be > 0");
        }
    }

    // ── XFA Phase 1 fill ──────────────────────────────────────────────

    #[test]
    fn xfa_form_model_enumerates_fields() {
        let mut doc = OpenDocument::open_bytes(DYNAMIC_XFA_PDF.to_vec())
            .expect("open dynamic XFA");
        let render_pages = doc.render_doc_page_count();
        let model = doc.xfa_form_model().expect("build XFA form model");

        assert_eq!(
            model.fields.len(),
            XFA_FIELD_COUNT,
            "the fixture declares {XFA_FIELD_COUNT} data-bound fields; the model \
             must enumerate all of them"
        );

        // The session lays out the RAW (pre-suppression) page set: the XFA layout
        // engine over-produces empty repeated `occur` instance pages for some
        // dynamic forms, which the flatten path's Sec. 4.3 suppression drops. So
        // the session's page_count is >= the rendered/flattened page count, and
        // the overlay bounds field placement by the RENDERED count rather than
        // session.page_count. On this fixture the two agree (3 and 3, measured):
        // nothing is suppressed, so it pins the bound and not the gap. A form
        // that does over-produce is what the inequality is there for.
        assert!(
            model.page_count >= render_pages,
            "session layout pages ({}) must be >= rendered pages ({})",
            model.page_count,
            render_pages
        );

        // The overlay only shows fields on rendered pages ("fill visible fields").
        // At least one fillable text field must land within the rendered range,
        // otherwise the overlay would have nothing to offer.
        let visible_fillable_text = model.fields.iter().find(|f| {
            f.field_type == "text"
                && !f.read_only
                && f.page.is_some_and(|p| p < render_pages)
                && f.rect.is_some()
        });
        assert!(
            visible_fillable_text.is_some(),
            "expected a fillable text field on a rendered page"
        );
        let f = visible_fillable_text.unwrap();
        assert!(!f.name.is_empty(), "field must have a name");
        assert!(
            f.widgets.iter().any(|w| w.page < render_pages),
            "field must have a widget on a rendered page"
        );
    }

    #[test]
    fn xfa_fill_persists_across_save_reopen() {
        let mut doc = OpenDocument::open_bytes(DYNAMIC_XFA_PDF.to_vec())
            .expect("open dynamic XFA");
        let model = doc.xfa_form_model().expect("build XFA form model");

        // Choose a fillable, data-bound text field so the value lands in datasets.
        let target = model
            .fields
            .iter()
            .find(|f| f.field_type == "text" && !f.read_only && !f.bind_none)
            .expect("a fillable, datasets-bound text field")
            .name
            .clone();

        let sentinel = "PDFLUENT_XFA_PHASE1";
        doc.set_xfa_field_value(&XfaWriteRequest::Text {
            name: target.clone(),
            value: sentinel.to_string(),
        })
        .expect("set XFA field value");
        assert!(doc.modified, "fill must mark the document dirty");

        // Save and reopen from disk — the round-trip an end user performs.
        let mut out = std::env::temp_dir();
        out.push("pdfluent_xfa_fill_roundtrip.pdf");
        let out_str = out.to_string_lossy().to_string();
        doc.save_to(&out_str).expect("save filled XFA");

        let mut reopened = OpenDocument::open_bytes(
            std::fs::read(&out_str).expect("re-read saved XFA"),
        )
        .expect("reopen saved XFA");
        let model2 = reopened.xfa_form_model().expect("re-read XFA model");
        let again = model2
            .fields
            .iter()
            .find(|f| f.name == target)
            .expect("field still present after reopen");
        assert_eq!(
            again.value, sentinel,
            "filled XFA value must persist across save/reopen"
        );

        let _ = std::fs::remove_file(&out_str);
    }

    // The UEA dynamic-XFA fixture (a Dutch procurement form) lives in the SDK
    // checkout's test-data, not in the editor repo. Its radio control
    // `Type_aanbesteding` carries a `change` script that reveals a conditional
    // section (`Erkenningsregeling…`) and repaginates when set to "3" — the
    // canonical Phase 2 commit-loop demonstration. Feature-gated (the commit loop
    // + QuickJS runtime) and skipped when the fixture is absent (e.g. CI without
    // the test-data, or a non-local checkout layout).
    #[cfg(feature = "xfa-interactive")]
    #[test]
    fn xfa_commit_reveals_conditional_section_on_uea() {
        let uea = concat!(
            env!("CARGO_MANIFEST_DIR"),
            "/../../../XFA/test-data/xfa-golden/xfa_test_input.pdf"
        );
        let Ok(bytes) = std::fs::read(uea) else {
            eprintln!("SKIP xfa_commit_reveals_conditional_section_on_uea: UEA fixture not at {uea}");
            return;
        };
        let mut doc = OpenDocument::open_bytes(bytes).expect("open UEA");

        let result = doc
            .commit_xfa_field_value(&XfaWriteRequest::Radio {
                name: "formulier1.H1.Heading.Type_aanbesteding".to_string(),
                export: "3".to_string(),
            })
            .expect("commit reveal control");

        eprintln!(
            "=UEA-REVEAL= interactive={} scripts={} pages {}->{} presence_changes={}",
            result.interactive,
            result.scripts_executed,
            result.page_count_before,
            result.page_count_after,
            result.presence_changes.len()
        );

        assert!(result.interactive, "commit ran the interactive change script");
        assert!(result.scripts_executed > 0, "change/calculate scripts executed");
        assert!(
            result.page_count_after > result.page_count_before,
            "revealing a section repaginates: {} -> {}",
            result.page_count_before,
            result.page_count_after
        );
        assert!(
            result
                .presence_changes
                .iter()
                .any(|c| c.name.contains("Erkenningsregeling") && c.after == "visible"),
            "the conditional section must be revealed; changes={:?}",
            result
                .presence_changes
                .iter()
                .map(|c| (c.name.as_str(), c.before.as_str(), c.after.as_str()))
                .collect::<Vec<_>>()
        );
    }

    #[test]
    fn xfa_commit_returns_refreshed_model_and_persists() {
        let mut doc = OpenDocument::open_bytes(DYNAMIC_XFA_PDF.to_vec())
            .expect("open dynamic XFA");
        let model = doc.xfa_form_model().expect("build XFA form model");
        let target = model
            .fields
            .iter()
            .find(|f| f.field_type == "text" && !f.read_only && !f.bind_none)
            .expect("a fillable, datasets-bound text field")
            .name
            .clone();

        let result = doc
            .commit_xfa_field_value(&XfaWriteRequest::Text {
                name: target.clone(),
                value: "PHASE2_COMMIT".to_string(),
            })
            .expect("commit XFA field value");

        // The commit always returns a refreshed model + a sane page-count delta,
        // and surfaces presence changes (possibly empty for a non-triggering field).
        assert!(!result.model.fields.is_empty(), "commit returns a refreshed model");
        assert!(result.page_count_after >= 1, "page_count_after is sane");
        assert_eq!(result.raw_value, "PHASE2_COMMIT");
        assert!(doc.modified, "commit marks the document dirty");

        // Feature-aware: with the commit loop compiled, the edit runs interactively
        // (change/click + calculate scripts); without it, it degrades to a static
        // value write.
        #[cfg(feature = "xfa-interactive")]
        assert!(
            result.interactive,
            "commit must run interactively when xfa-interactive is enabled"
        );
        #[cfg(not(feature = "xfa-interactive"))]
        {
            assert!(!result.interactive, "fallback must report interactive=false");
            assert_eq!(result.scripts_executed, 0);
            assert!(result.presence_changes.is_empty());
            assert_eq!(result.page_count_before, result.page_count_after);
        }

        // Value persists across save/reopen.
        let mut out = std::env::temp_dir();
        out.push("pdfluent_xfa_commit_roundtrip.pdf");
        let out_str = out.to_string_lossy().to_string();
        doc.save_to(&out_str).expect("save committed XFA");
        let mut reopened =
            OpenDocument::open_bytes(std::fs::read(&out_str).expect("re-read")).expect("reopen");
        let m2 = reopened.xfa_form_model().expect("re-read model");
        assert_eq!(
            m2.fields.iter().find(|f| f.name == target).expect("field present").value,
            "PHASE2_COMMIT",
            "committed XFA value persists across save/reopen"
        );
        let _ = std::fs::remove_file(&out_str);
    }

    // === Digital signature: the Sign panel's backend, end to end ===
    //
    // The v3 Sign panel calls `sign_pdf` with a PKCS#12 file, a password, a
    // reason and an output path; the panel showed "PAdES-compliant digital
    // signature" for months over a control that drew a picture instead. These
    // two tests are what that claim rests on: a real certificate signs a real
    // document, the signed file is read back from disk, and the signature in
    // it verifies.
    //
    // The certificate is a throwaway self-signed RSA-2048 pair generated for
    // this repository, valid to 2126, and it signs nothing outside the test:
    //
    //   openssl req -x509 -newkey rsa:2048 -keyout k.pem -out c.pem \
    //     -days 36500 -nodes -subj "/CN=PDFluent Test Signer/O=PDFluent Test"
    //   openssl pkcs12 -export -inkey k.pem -in c.pem -out signer-test.p12 \
    //     -passout pass:pdfluent-test -name "PDFluent Test Signer" \
    //     -keypbe PBE-SHA1-3DES -certpbe PBE-SHA1-3DES -macalg sha1
    //
    // The three legacy algorithm flags are not decoration: the `p12` crate the
    // SDK parses with does not read OpenSSL 3's AES-256-CBC/PBKDF2 default.

    const TEST_P12: &[u8] = include_bytes!("../tests/fixtures/signer-test.p12");
    const TEST_P12_PASSWORD: &str = "pdfluent-test";

    fn test_certificate_path() -> std::path::PathBuf {
        let path = op_tmp("signer-test.p12");
        std::fs::write(&path, TEST_P12).expect("write test certificate");
        path
    }

    #[test]
    fn op_sign_with_certificate_verifies_after_reopen() {
        let mut doc = sample_doc();
        let pages_before = doc.document_info().page_count;
        assert!(
            doc.verify_signatures().is_empty(),
            "the fixture must start out unsigned, or this test proves nothing"
        );

        let cert = test_certificate_path();
        let out = op_tmp("op_sign_two_pages.pdf");
        let _ = std::fs::remove_file(&out);

        doc.sign(
            cert.to_str().unwrap(),
            TEST_P12_PASSWORD,
            "I approve this document",
            out.to_str().unwrap(),
        )
        .expect("sign the document");

        // 1. The live document is the signed one: the panel re-checks straight
        //    after signing and must not show the pre-signature state.
        let live = doc.verify_signatures();
        assert_eq!(live.len(), 1, "signing must add exactly one signature");
        assert!(
            live[0].valid,
            "the signature just made does not verify: {}",
            live[0].status
        );

        // 2. So is the file the user keeps.
        let reopened = OpenDocument::open(out.to_str().unwrap()).expect("reopen the signed file");
        let after = reopened.verify_signatures();
        assert_eq!(after.len(), 1, "the saved file must carry the signature");
        assert!(
            after[0].valid,
            "the signature in the saved file does not verify: {}",
            after[0].status
        );
        assert_eq!(
            after[0].signer.as_deref(),
            Some("PDFluent Test Signer"),
            "the panel shows this string as the signer"
        );
        assert_eq!(
            reopened.document_info().page_count,
            pages_before,
            "signing must not change the document it signs"
        );

        let _ = std::fs::remove_file(&out);
    }

    #[test]
    fn op_sign_with_the_wrong_password_fails_and_writes_nothing() {
        let mut doc = sample_doc();
        let cert = test_certificate_path();
        let out = op_tmp("op_sign_wrong_password.pdf");
        let _ = std::fs::remove_file(&out);

        let err = doc
            .sign(
                cert.to_str().unwrap(),
                "not-the-password",
                "",
                out.to_str().unwrap(),
            )
            .expect_err("a wrong certificate password must fail");
        assert!(
            err.contains("PKCS#12"),
            "the message must name the certificate as the problem, got: {err}"
        );
        assert!(
            !out.exists(),
            "a failed signature must not leave a file the user could mistake for a signed one"
        );
        assert!(
            doc.verify_signatures().is_empty(),
            "a failed signature must leave the open document alone"
        );
    }
}
