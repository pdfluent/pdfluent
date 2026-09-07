// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary. The PDFluent application is free to use,
// including for commercial purposes. Redistribution, or extraction or reuse
// of its components (including the embedded PDF engine), requires a licence.
// See https://pdfluent.com/license for terms.
//
//! PDFluent SDK facade adapter — Phase 2 migration boundary.
//!
//! This module provides a thin adapter layer between the desktop app's
//! existing Tauri backend and the `pdfluent` public SDK facade.
//!
//! # Design constraints
//!
//! - **Read-only only**: Mutations remain in `pdf_engine.rs` to avoid
//!   lifecycle conflicts.
//! - **Temporary documents**: Each adapter call constructs a short-lived
//!   `pdfluent::PdfDocument` from `raw_bytes`. This is intentionally
//!   redundant (the bytes are already parsed elsewhere) but keeps the
//!   boundary stateless and safe.
//! - **Type mapping only**: No new document lifecycle model, no background
//!   threads, no caching.
//!
//! # Scope
//!
//! - `has_xfa_form` — XFA detection via lopdf catalog inspection
//! - `get_page_labels` — page label read via facade (numeric fallback)
//! - `get_layers` — optional content group read (stub; OCG API not yet in
//!   `enterprise/ga-hardening`)
//!
//! # Non-scope
//!
//! - Annotations, attachments, mutations, save, render, PDF/A, redaction,
//!   signing, licensing — these remain in `pdf_engine.rs`.

use pdfluent::PdfDocument;

// Re-use existing Tauri response types so the frontend contract is unchanged.
use crate::pdf_engine::{ExtractedImageInfo, LayerInfo};

// ---------------------------------------------------------------------------
// XFA detection
// ---------------------------------------------------------------------------

/// Detect whether the document contains an XFA form (`/AcroForm/XFA`).
///
/// Implemented via direct lopdf catalog inspection rather than the pdfluent
/// facade method, which is not yet available in the current SDK branch.
pub fn has_xfa_form(raw_bytes: &[u8]) -> std::result::Result<bool, String> {
    let lop =
        lopdf::Document::load_mem(raw_bytes).map_err(|e| format!("facade lopdf parse: {e}"))?;
    let catalog = lop.catalog().map_err(|e| format!("facade catalog: {e}"))?;
    // XFA presence: /AcroForm dictionary must contain an /XFA key.
    let has_xfa = catalog
        .get(b"AcroForm")
        .ok()
        .and_then(|obj| lop.dereference(obj).ok())
        .and_then(|(_, obj)| obj.as_dict().ok())
        .map(|acroform| acroform.has(b"XFA"))
        .unwrap_or(false);
    Ok(has_xfa)
}

// ---------------------------------------------------------------------------
// Page labels
// ---------------------------------------------------------------------------

/// Return a human-readable label for each page.
///
/// Uses the pdfluent facade's `page_count()` and generates numeric labels
/// `"1"`, `"2"`, … as the fallback. Full `/PageLabels` number-tree parsing
/// will be added once the SDK exposes it on `PdfDocument`.
pub fn get_page_labels(raw_bytes: &[u8]) -> std::result::Result<Vec<String>, String> {
    let doc = PdfDocument::from_bytes(raw_bytes).map_err(|e| format!("facade parse: {e}"))?;
    let count = doc.page_count();
    Ok((1..=count).map(|n| n.to_string()).collect())
}

// ---------------------------------------------------------------------------
// Layers (Optional Content Groups)
// ---------------------------------------------------------------------------

/// List optional content groups (layers) in the document.
///
/// Returns an empty vector — the OCG API is not yet exposed on `PdfDocument`
/// in the current SDK branch. Documents will appear without a layer panel.
pub fn get_layers(_raw_bytes: &[u8]) -> std::result::Result<Vec<LayerInfo>, String> {
    Ok(Vec::new())
}

// ---------------------------------------------------------------------------
// Metadata (read-only)
// ---------------------------------------------------------------------------

/// Read document title and author via the facade metadata surface.
pub fn document_metadata(
    raw_bytes: &[u8],
) -> std::result::Result<(Option<String>, Option<String>), String> {
    let doc = PdfDocument::from_bytes(raw_bytes).map_err(|e| format!("facade parse: {e}"))?;
    let meta = doc.metadata();
    Ok((meta.title, meta.author))
}

// ---------------------------------------------------------------------------
// Text extraction (read-only)
// ---------------------------------------------------------------------------

/// Extract plain text from a single page via the facade.
pub fn extract_page_text(raw_bytes: &[u8], page_index: u32) -> std::result::Result<String, String> {
    let doc = PdfDocument::from_bytes(raw_bytes).map_err(|e| format!("facade parse: {e}"))?;
    let page = doc
        .page(page_index as usize + 1)
        .map_err(|e| format!("facade page: {e}"))?;
    page.text().map_err(|e| format!("facade text: {e}"))
}

// ---------------------------------------------------------------------------
// Image extraction (facade read-only, file writing stays in pdf_engine.rs)
// ---------------------------------------------------------------------------

/// Extract embedded image metadata without writing files.
///
/// Returns an empty vector — `extract_images()` is not yet exposed on
/// `PdfDocument` in the current SDK branch. The actual file-export path in
/// `pdf_engine.rs` (which uses the lower-level crates directly) is unaffected.
#[allow(dead_code)]
pub fn extract_image_metadata(
    _raw_bytes: &[u8],
) -> std::result::Result<Vec<ExtractedImageInfo>, String> {
    Ok(Vec::new())
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;

    /// Minimal valid PDF (1 page, no content) for adapter tests.
    fn minimal_pdf_bytes() -> Vec<u8> {
        use lopdf::{dictionary, Document, Object};
        let mut doc = Document::with_version("1.4");
        let pages_id = doc.add_object(Object::Dictionary(dictionary! {
            "Type" => "Pages",
            "Kids" => vec![Object::Reference((2u32, 0u16))],
            "Count" => 1,
        }));
        let page_id = doc.add_object(Object::Dictionary(dictionary! {
            "Type" => "Page",
            "Parent" => Object::Reference(pages_id),
            "MediaBox" => vec![0.into(), 0.into(), 612.into(), 792.into()],
        }));
        if let Ok(Object::Dictionary(pages_dict)) = doc.get_object_mut(pages_id) {
            pages_dict.set("Kids", Object::Array(vec![Object::Reference(page_id)]));
        }
        let catalog_id = doc.add_object(Object::Dictionary(dictionary! {
            "Type" => "Catalog",
            "Pages" => Object::Reference(pages_id),
        }));
        doc.trailer.set("Root", Object::Reference(catalog_id));
        let mut buf = Vec::new();
        doc.save_to(&mut buf).unwrap();
        buf
    }

    #[test]
    fn adapter_has_xfa_form_false_for_minimal_pdf() {
        let bytes = minimal_pdf_bytes();
        assert!(!has_xfa_form(&bytes).unwrap());
    }

    #[test]
    fn adapter_page_labels_fallback_for_minimal_pdf() {
        let bytes = minimal_pdf_bytes();
        let labels = get_page_labels(&bytes).unwrap();
        assert_eq!(labels, vec!["1"]);
    }

    #[test]
    fn adapter_layers_empty_for_minimal_pdf() {
        let bytes = minimal_pdf_bytes();
        let layers = get_layers(&bytes).unwrap();
        assert!(layers.is_empty());
    }

    #[test]
    fn adapter_image_metadata_empty_for_minimal_pdf() {
        let bytes = minimal_pdf_bytes();
        let images = extract_image_metadata(&bytes).unwrap();
        assert!(images.is_empty());
    }

    #[test]
    fn adapter_document_metadata_for_minimal_pdf() {
        let bytes = minimal_pdf_bytes();
        let (title, author) = document_metadata(&bytes).unwrap();
        assert_eq!(title, None);
        assert_eq!(author, None);
    }

    #[test]
    fn adapter_extract_page_text_empty_for_minimal_pdf() {
        let bytes = minimal_pdf_bytes();
        let text = extract_page_text(&bytes, 0).unwrap();
        assert!(text.trim().is_empty());
    }
}
