// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary. The PDFluent application is free to use,
// including for commercial purposes. Redistribution, or extraction or reuse
// of its components (including the embedded PDF engine), requires a licence.
// See https://pdfluent.com/license for terms.

//! J-42: a paragraph of several lines is edited as one text, and the new text
//! reflows inside the paragraph's width at the same font size.
//!
//! The editor refused every multi-line target (`multi-line-unsupported`). The
//! paragraph edit stages one edit per line in a single SDK transaction: the
//! first line takes the new text with `ReflowInBounds`, the others are
//! emptied. These tests check the saved file: every new word is there, the old
//! words are gone, nothing runs past the paragraph's right edge, and the font
//! size did not shrink.
//!
//! Runs in the `cargo-test` job on Linux, macOS and Windows.

use pdfluent_lib::{OpenDocument, ParagraphLine};
use std::fs;
use std::path::PathBuf;

const LINES: [&str; 3] = [
    "The quick brown fox jumps over",
    "the lazy dog and keeps running",
    "until the end of the paragraph.",
];
const LEFT: f32 = 72.0;
const SIZE: f32 = 12.0;

fn scratch(name: &str) -> PathBuf {
    let dir = std::env::temp_dir().join(format!("pdfluent-paragraph-{}", std::process::id()));
    fs::create_dir_all(&dir).expect("scratch dir");
    dir.join(name)
}

/// One page: a heading and a three-line Helvetica paragraph, one run per line.
/// Written by scripts/fixtures/make-paragraph-pdf.mjs (the real-app spec J-42
/// uses the same file).
fn paragraph_pdf() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("tests/fixtures/paragraph_3_lines.pdf")
}

/// What the page shows: each text span with its position. (The text-edit
/// session normalises content streams it reads, so the bytes are not a fair
/// comparison; what is on the page is.)
fn shown(doc: &mut OpenDocument) -> Vec<(String, i64, i64)> {
    doc.extract_page_text_spans(0)
        .expect("spans")
        .iter()
        .map(|s| (s.text.clone(), s.x.round() as i64, s.y.round() as i64))
        .collect()
}

fn lines() -> Vec<ParagraphLine> {
    LINES.iter().map(|t| ParagraphLine { text: (*t).to_string(), anchor: None }).collect()
}

#[test]
fn a_paragraph_edit_reflows_inside_the_paragraph_and_survives_save() {
    let src = paragraph_pdf();
    let mut doc = OpenDocument::open(src.to_str().unwrap()).expect("open");
    let before = doc.extract_page_text_spans(0).expect("spans");
    let right_edge = before
        .iter()
        .filter(|s| LINES.iter().any(|l| s.text.contains(l.split(' ').next().unwrap())))
        .map(|s| s.x + s.width)
        .fold(0.0_f64, f64::max);

    let replacement = "A completely new paragraph that is noticeably longer than the old one, \
                       so the reflow has to break it over more lines than before.";
    let r = doc.replace_paragraph(0, &lines(), replacement).expect("call");
    assert!(r.replaced, "the paragraph edit applies: {:?} {:?}", r.reason, r.detail);

    let out = scratch("paragraph-edited.pdf");
    doc.save_to(out.to_str().unwrap()).expect("save");
    let mut reopened = OpenDocument::open(out.to_str().unwrap()).expect("reopen");
    let text = reopened.extract_page_text(0).expect("text");
    let flat: String = text.split_whitespace().collect::<Vec<_>>().join(" ");
    for word in replacement.split_whitespace() {
        assert!(flat.contains(word.trim_matches(|c: char| c == ',' || c == '.')), "missing {word:?} in {flat:?}");
    }
    for gone in ["quick", "lazy", "running"] {
        assert!(!flat.contains(gone), "the old word {gone:?} is still in the file: {flat:?}");
    }
    assert!(flat.contains("Heading stays"), "content outside the paragraph is untouched");

    let after = reopened.extract_page_text_spans(0).expect("spans");
    let body: Vec<_> = after.iter().filter(|s| !s.text.contains("Heading")).filter(|s| !s.text.trim().is_empty()).collect();
    assert!(body.len() >= 3, "the longer text takes more lines: {body:?}");
    for s in &body {
        assert!(s.x + 0.5 >= LEFT as f64, "a line starts left of the paragraph: {s:?}");
        assert!(s.x + s.width <= right_edge + SIZE as f64, "a line runs past the paragraph's right edge {right_edge}: {s:?}");
        assert!((s.font_size - SIZE as f64).abs() < 0.6, "the font size is kept: {s:?}");
    }
}

#[test]
fn a_paragraph_whose_line_is_missing_changes_nothing() {
    let src = paragraph_pdf();
    let mut doc = OpenDocument::open(src.to_str().unwrap()).expect("open");
    let before = shown(&mut doc);
    let mut ls = lines();
    ls[1].text = "a line that is not on the page".into();
    let r = doc.replace_paragraph(0, &ls, "anything").expect("call");
    assert!(!r.replaced);
    assert_eq!(shown(&mut doc), before, "all or nothing");
    assert!(!doc.history_state().modified);
}

#[test]
fn a_paragraph_edit_is_one_undo_step() {
    let src = paragraph_pdf();
    let mut doc = OpenDocument::open(src.to_str().unwrap()).expect("open");
    let before = shown(&mut doc);
    let r = doc.edit("edit-text", |d| d.replace_paragraph(0, &lines(), "Short new text.")).expect("edit");
    assert!(r.replaced, "{:?}", r.reason);
    assert_ne!(shown(&mut doc), before);
    doc.undo().expect("undo");
    assert_eq!(shown(&mut doc), before, "one undo brings the whole paragraph back");
}

/// Body lines of the page (everything but the heading), top to bottom, as
/// `(distance below the heading, text)`; the distance does not depend on which
/// way the span coordinates run.
fn body_below_heading(doc: &mut OpenDocument) -> Vec<(f64, String)> {
    let spans = doc.extract_page_text_spans(0).expect("spans");
    let heading_y = spans.iter().find(|s| s.text.contains("Heading")).expect("heading").y;
    let mut body: Vec<(f64, String)> = spans
        .iter()
        .filter(|s| !s.text.contains("Heading") && !s.text.trim().is_empty())
        .map(|s| ((s.y - heading_y).abs(), s.text.trim().to_string()))
        .collect();
    body.sort_by(|a, b| a.0.partial_cmp(&b.0).expect("finite"));
    body
}

fn flat(text: &str) -> String {
    text.split_whitespace().collect::<Vec<_>>().join(" ")
}

/// The fixture is set at 12 pt on a 14 pt grid. The SDK's own reflow advances
/// by 1.2 x the size (14.4), so a paragraph that still fits its three lines has
/// to come out on the grid it was in, not drift 0.4 pt per line.
#[test]
fn an_edit_that_fits_the_old_lines_keeps_the_line_spacing_and_the_reading_order() {
    let src = paragraph_pdf();
    let mut doc = OpenDocument::open(src.to_str().unwrap()).expect("open");
    let original = body_below_heading(&mut doc);
    assert_eq!(original.len(), 3);
    let leading = original[1].0 - original[0].0;
    assert!((leading - 14.0).abs() < 0.3, "the fixture is on a 14 pt grid: {original:?}");

    let replacement = "A shorter text that still needs two lines in this narrow column.";
    let r = doc.replace_paragraph(0, &lines(), replacement).expect("call");
    assert!(r.replaced, "{:?} {:?}", r.reason, r.detail);

    let out = scratch("paragraph-grid.pdf");
    doc.save_to(out.to_str().unwrap()).expect("save");
    let mut reopened = OpenDocument::open(out.to_str().unwrap()).expect("reopen");

    let page_text = flat(&reopened.extract_page_text(0).expect("text"));
    assert!(page_text.contains(&flat(replacement)), "the new text reads in order: {page_text:?}");
    assert!(page_text.find("Heading stays") < page_text.find("A shorter"), "the heading stays above");

    let body = body_below_heading(&mut reopened);
    assert!((2..=3).contains(&body.len()), "the text takes two or three lines: {body:?}");
    assert!((body[0].0 - original[0].0).abs() < 0.3, "the first line stays where it was: {body:?}");
    for pair in body.windows(2) {
        let gap = pair[1].0 - pair[0].0;
        assert!((gap - 14.0).abs() < 0.3, "line spacing is the paragraph's own, not the SDK's 14.4: {body:?}");
    }
}

/// A text that needs more lines than the paragraph had: the lines that have a
/// place stay on the grid, the extra ones follow below at the same spacing (the
/// SDK measures the block's leading since the reflow-leading change), and the
/// page still reads heading, then the new text, in order.
#[test]
fn an_edit_that_needs_more_lines_reads_in_order_and_nothing_overlaps() {
    let src = paragraph_pdf();
    let mut doc = OpenDocument::open(src.to_str().unwrap()).expect("open");
    let replacement = "One two three four five six seven eight nine ten eleven twelve thirteen fourteen \
                       fifteen sixteen seventeen eighteen nineteen twenty twenty-one twenty-two \
                       twenty-three twenty-four twenty-five twenty-six twenty-seven twenty-eight.";
    let r = doc.replace_paragraph(0, &lines(), replacement).expect("call");
    assert!(r.replaced, "{:?} {:?}", r.reason, r.detail);

    let out = scratch("paragraph-long.pdf");
    doc.save_to(out.to_str().unwrap()).expect("save");
    let mut reopened = OpenDocument::open(out.to_str().unwrap()).expect("reopen");

    let page_text = flat(&reopened.extract_page_text(0).expect("text"));
    assert!(page_text.contains(&flat(replacement)), "the new text reads in order: {page_text:?}");
    assert!(page_text.find("Heading stays") < page_text.find("One two"), "the heading stays above");

    let body = body_below_heading(&mut reopened);
    assert!(body.len() > 3, "more lines than the paragraph had: {body:?}");
    for pair in body.windows(2) {
        assert!((pair[1].0 - pair[0].0 - 14.0).abs() < 0.3, "every line, added ones too, keeps the 14 pt grid: {body:?}");
    }
}
