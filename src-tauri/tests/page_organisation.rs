// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary. The PDFluent application is free to use,
// including for commercial purposes. Redistribution, or extraction or reuse
// of its components (including the embedded PDF engine), requires a licence.
// See https://pdfluent.com/license for terms.

//! J-73: reordering pages puts them in the order asked for, and the saved file
//! keeps it.
//!
//! The reorder command used `pdf_manip::pages::rearrange_pages`, which keeps
//! the pages in the document's own order: every reorder came back unchanged.
//! These tests read the text of each page before and after, through a save
//! and a reopen, so they fail if the order is not what was asked.
//!
//! Runs in the `cargo-test` job on Linux, macOS and Windows.

use pdfluent_lib::OpenDocument;
use std::fs;
use std::path::PathBuf;

fn manifest(rel: &str) -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR")).join(rel)
}

fn scratch(name: &str) -> PathBuf {
    let dir = std::env::temp_dir().join(format!("pdfluent-pages-{}", std::process::id()));
    fs::create_dir_all(&dir).expect("scratch dir");
    dir.join(name)
}

fn page_texts(doc: &OpenDocument) -> Vec<String> {
    (0..doc.document_info().page_count)
        .map(|i| doc.extract_page_text(i).expect("text").trim().to_string())
        .collect()
}

const THREE: &str = "tests/golden/fixture-sample-text-3p.pdf";

#[test]
fn reorder_puts_the_pages_in_the_new_order_and_the_save_keeps_it() {
    let mut doc = OpenDocument::open(manifest(THREE).to_str().unwrap()).expect("open");
    let before = page_texts(&doc);
    assert_eq!(before.len(), 3);
    assert!(before[0] != before[1] && before[1] != before[2], "the fixture's pages are distinguishable");

    doc.reorder_pages(&[2, 0, 1]).expect("reorder");
    let expected = vec![before[2].clone(), before[0].clone(), before[1].clone()];
    assert_eq!(page_texts(&doc), expected, "the open document shows the new order");

    let out = scratch("reordered.pdf");
    doc.save_to(out.to_str().unwrap()).expect("save");
    let reopened = OpenDocument::open(out.to_str().unwrap()).expect("reopen");
    assert_eq!(page_texts(&reopened), expected, "the saved file keeps the new order");
}

#[test]
fn reorder_refuses_an_order_that_is_not_a_permutation() {
    let mut doc = OpenDocument::open(manifest(THREE).to_str().unwrap()).expect("open");
    for bad in [vec![0, 1], vec![0, 0, 1], vec![0, 1, 3]] {
        assert!(doc.reorder_pages(&bad).is_err(), "{bad:?} must be refused");
    }
    assert_eq!(doc.document_info().page_count, 3, "a refused reorder loses no page");
}

#[test]
fn rotate_and_delete_survive_save_and_reopen() {
    let mut doc = OpenDocument::open(manifest(THREE).to_str().unwrap()).expect("open");
    let before = page_texts(&doc);
    doc.delete_pages(&[1]).expect("delete");
    doc.rotate_pages(&[0], 90).expect("rotate");
    let out = scratch("rotated-deleted.pdf");
    doc.save_to(out.to_str().unwrap()).expect("save");

    let reopened = OpenDocument::open(out.to_str().unwrap()).expect("reopen");
    assert_eq!(page_texts(&reopened), vec![before[0].clone(), before[2].clone()]);
    let bytes = fs::read(&out).expect("read");
    let text = String::from_utf8_lossy(&bytes);
    assert!(text.contains("/Rotate 90"), "the rotation is written into the file");
}
