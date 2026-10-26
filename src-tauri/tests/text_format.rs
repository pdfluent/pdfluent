// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary. The PDFluent application is free to use,
// including for commercial purposes. Redistribution, or extraction or reuse
// of its components (including the embedded PDF engine), requires a licence.
// See https://pdfluent.com/license for terms.

//! J-40 / J-43: a text edit, a size change and a colour change are written into
//! the file and are still there after save and reopen; the rest of the page is
//! untouched; and nothing the engine writes carries a trial or free-tier mark.
//!
//! `format_text_span` had no test at all; the line edit had one only through
//! the golden round-trip. These read the reopened file's own spans.
//!
//! Runs in the `cargo-test` job on Linux, macOS and Windows.

use pdfluent_lib::OpenDocument;
use std::fs;
use std::path::PathBuf;

fn manifest(rel: &str) -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR")).join(rel)
}

fn scratch(name: &str) -> PathBuf {
    let dir = std::env::temp_dir().join(format!("pdfluent-textfmt-{}", std::process::id()));
    fs::create_dir_all(&dir).expect("scratch dir");
    dir.join(name)
}

const TEXT: &str = "tests/golden/fixture-sample-text-3p.pdf";
const HEADING: &str = "Lorem ipsum visual E2E page one";
const OTHER: &str = "Search target Lorem appears on this page.";

fn reopen_after(doc: &mut OpenDocument, name: &str) -> (OpenDocument, Vec<u8>) {
    let out = scratch(name);
    doc.save_to(out.to_str().unwrap()).expect("save");
    let bytes = fs::read(&out).expect("read");
    (OpenDocument::open(out.to_str().unwrap()).expect("reopen"), bytes)
}

#[test]
fn a_line_edit_with_a_new_size_and_colour_survives_save_and_reopen() {
    let mut doc = OpenDocument::open(manifest(TEXT).to_str().unwrap()).expect("open");
    let r = doc.replace_text_span(0, HEADING, "Edited heading on page one", None).expect("replace");
    assert!(r.replaced, "{:?}", r.reason);
    assert!(doc
        .format_text_span(0, "Edited heading on page one", Some(30.0), Some([1.0, 0.0, 0.0]))
        .expect("format"));

    let (mut reopened, bytes) = reopen_after(&mut doc, "formatted.pdf");
    let spans = reopened.extract_page_text_spans(0).expect("spans");
    let edited = spans.iter().find(|s| s.text.contains("Edited heading")).expect("the edited line is in the file");
    assert!((edited.font_size - 30.0).abs() < 0.5, "size written: {edited:?}");
    let c = edited.color.expect("a fill colour");
    assert!(c[0] > 0.9 && c[1] < 0.1 && c[2] < 0.1, "colour written: {c:?}");

    let other = spans.iter().find(|s| s.text.contains("Search target")).expect("the other line");
    assert_eq!(other.text.trim(), OTHER, "the rest of the page is untouched");
    assert!((other.font_size - 12.0).abs() < 0.5, "the other line keeps its size: {other:?}");
    assert!(!spans.iter().any(|s| s.text.contains(HEADING)), "the old text is gone");

    let text = String::from_utf8_lossy(&bytes).to_lowercase();
    for mark in ["trial", "free tier", "evaluation"] {
        assert!(!text.contains(mark), "the saved file carries a {mark:?} mark");
    }
    for page in 0..3 {
        let t = reopened.extract_page_text(page).expect("text").to_lowercase();
        assert!(!t.contains("trial") && !t.contains("free tier"), "page {page} shows a trial mark: {t}");
    }
}

#[test]
fn formatting_text_that_is_not_on_the_page_changes_nothing() {
    let mut doc = OpenDocument::open(manifest(TEXT).to_str().unwrap()).expect("open");
    let formatted = doc.format_text_span(0, "words that are not there", Some(20.0), None);
    assert!(!matches!(formatted, Ok(true)), "a missing run must not report success");
    assert!(!doc.history_state().modified);
}
