// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary. The PDFluent application is free to use,
// including for commercial purposes. Redistribution, or extraction or reuse
// of its components (including the embedded PDF engine), requires a licence.
// See https://pdfluent.com/license for terms.

//! J-34: Print prints the document as it is on screen, unsaved changes
//! included.
//!
//! `print_document` hands the system print dialog a temporary PDF made by
//! `OpenDocument::print_copy`. The dialog itself is the operating system's and
//! is driven in the real-app suite; what can be proven headless is that the
//! file it is handed *is* the current document: the edit made a moment ago
//! and not yet saved is in it, nothing else changed, and a protected document
//! that forbids printing is refused. Runs in `cargo-test`.

use pdf_manip::encrypt::{encrypt_and_save, EncryptConfig, EncryptionAlgorithm, Permissions};
use pdfluent_lib::OpenDocument;
use std::path::PathBuf;

fn manifest(rel: &str) -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR")).join(rel)
}

fn text_of(doc: &OpenDocument) -> Vec<String> {
    (0..doc.page_count() as u32).map(|p| doc.extract_page_text(p).expect("text")).collect()
}

#[test]
fn the_print_copy_carries_the_unsaved_edits_and_nothing_else() {
    let path = manifest("tests/fixtures/two_pages.pdf");
    let mut doc = OpenDocument::open(path.to_str().unwrap()).expect("open");
    doc.add_highlight_annotation(0, &[[72.0, 700.0, 300.0, 720.0]], [1.0, 1.0, 0.0]).expect("annotate");
    doc.add_comment_annotation(1, 100.0, 100.0, "printed note").expect("note");
    assert!(doc.modified, "the edits are unsaved");

    let printed = OpenDocument::open_bytes(doc.print_copy().expect("print copy")).expect("the copy parses");

    assert_eq!(printed.page_count(), doc.page_count());
    assert_eq!(text_of(&printed), text_of(&doc), "the text is the document's");
    assert_eq!(printed.get_page_annotations(0).len(), doc.get_page_annotations(0).len());
    assert_eq!(printed.get_page_annotations(1).len(), doc.get_page_annotations(1).len());
    assert!(
        !printed.get_page_annotations(0).is_empty() && !printed.get_page_annotations(1).is_empty(),
        "the unsaved annotations are in what gets printed"
    );
    let on_disk = OpenDocument::open(path.to_str().unwrap()).expect("reopen the file on disk");
    assert!(
        on_disk.get_page_annotations(0).len() < printed.get_page_annotations(0).len(),
        "printing the file on disk would have lost the edit"
    );
}

#[test]
fn an_xfa_form_prints_as_it_is_shown_not_as_its_placeholder_page() {
    // A dynamic XFA form: its PDF page is only the "requires Adobe Reader"
    // notice; what the viewer shows is the flattened form.
    let path = manifest("tests/golden/xfa-13a7b224_xfa_issue14315.pdf");
    let doc = OpenDocument::open(path.to_str().unwrap()).expect("open");
    let placeholder = text_of(&doc).join("\n");
    assert!(
        placeholder.contains("requires Adobe Reader"),
        "the fixture must carry the placeholder page, or this proves nothing"
    );
    let printed = OpenDocument::open_bytes(doc.print_copy().expect("print copy")).expect("parses");
    assert_eq!(printed.page_count(), doc.document_info().page_count as usize);
    assert!(
        !text_of(&printed).join("\n").contains("requires Adobe Reader"),
        "the print copy is the placeholder page, not the form the user sees"
    );
}

#[test]
fn a_protected_document_that_forbids_printing_is_refused() {
    let mut raw = lopdf::Document::load(manifest("tests/fixtures/two_pages.pdf")).expect("load");
    let config = EncryptConfig {
        user_password: Vec::new(),
        owner_password: b"owner-key".to_vec(),
        algorithm: EncryptionAlgorithm::Aes256,
        permissions: Permissions { print: false, print_high_quality: false, ..Permissions::allow_all() },
    };
    let mut bytes = Vec::new();
    encrypt_and_save(&mut raw, &config, &mut bytes).expect("encrypt");
    let doc = OpenDocument::open_bytes(bytes).expect("opens without a user password");
    let err = doc.print_copy().expect_err("printing is not permitted");
    assert!(err.starts_with("print-not-permitted"), "{err}");
}
