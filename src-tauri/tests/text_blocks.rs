// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary. The PDFluent application is free to use,
// including for commercial purposes. Redistribution, or extraction or reuse
// of its components (including the embedded PDF engine), requires a licence.
// See https://pdfluent.com/license for terms.

//! #640: the editor's paragraph grouping reads the extraction engine's blocks.
//! The heading and the three-line paragraph of the fixture are two blocks, and
//! the paragraph's box holds all three lines, so the editor selects (and the
//! paragraph edit replaces) exactly those lines.
//!
//! Runs in the `cargo-test` job on Linux, macOS and Windows.

use pdfluent_lib::OpenDocument;
use std::path::PathBuf;

#[test]
fn the_engine_separates_the_heading_from_the_paragraph_and_boxes_every_line() {
    let path = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("tests/fixtures/paragraph_3_lines.pdf");
    let mut doc = OpenDocument::open(path.to_str().unwrap()).expect("open");
    let blocks = doc.page_text_blocks(0).expect("blocks");
    assert!(blocks.len() >= 2, "heading and paragraph are separate blocks: {blocks:?}");

    let spans = doc.extract_page_text_spans(0).expect("spans");
    let body: Vec<_> = spans.iter().filter(|s| !s.text.contains("Heading")).collect();
    let heading = spans.iter().find(|s| s.text.contains("Heading")).expect("heading");
    let inside = |b: &[f64; 4], x: f64, y: f64| x >= b[0] - 1.0 && x <= b[2] + 1.0 && y >= b[1] - 1.0 && y <= b[3] + 1.0;
    let para = blocks
        .iter()
        .find(|b| body.iter().all(|s| inside(&b.bbox, s.x + s.width / 2.0, s.y + s.height / 3.0)))
        .expect("one block holds all three paragraph lines");
    assert!(
        !inside(&para.bbox, heading.x + heading.width / 2.0, heading.y + heading.height / 3.0),
        "the heading is not inside the paragraph's block"
    );
}
