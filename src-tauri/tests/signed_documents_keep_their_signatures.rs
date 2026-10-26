// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary. The PDFluent application is free to use,
// including for commercial purposes. Redistribution, or extraction or reuse
// of its components (including the embedded PDF engine), requires a licence.
// See https://pdfluent.com/license for terms.

//! J-19 / J-64: saving a signed document keeps its signatures.
//!
//! Until 1.0.1 every save was a full rewrite. The signature's `/ByteRange`
//! names byte offsets in the file it was computed over; a rewrite moves every
//! byte, so sign → annotate → save produced a file whose signature no longer
//! verified, and nothing said so. A signed document is now saved as an
//! incremental update appended to the signed revision, so the signed bytes are
//! untouched and the signature still verifies.
//!
//! What cannot be appended is refused: a redaction has to remove content from
//! the file, history included, and that cannot be done without breaking the
//! signature. The save over the signed original is refused with a typed
//! reason, and the way out — a copy without the signature — is checked too.
//!
//! Runs in the `cargo-test` job.

use pdfluent_lib::OpenDocument;
use std::fs;
use std::path::{Path, PathBuf};

const P12_PASSWORD: &str = "pdfluent-test";

fn manifest(rel: &str) -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR")).join(rel)
}

fn scratch(name: &str) -> PathBuf {
    let dir = std::env::temp_dir().join(format!("pdfluent-signed-{}", std::process::id()));
    fs::create_dir_all(&dir).expect("scratch dir");
    dir.join(name)
}

fn path_str(p: &Path) -> &str {
    p.to_str().expect("utf-8 path")
}

/// The first span a `/ByteRange` declares, read straight from the file: the
/// bytes before the signature's `/Contents`. What an edit must not move.
fn first_signed_span(bytes: &[u8]) -> Vec<u8> {
    let at = bytes
        .windows(10)
        .position(|w| w == b"/ByteRange")
        .expect("a /ByteRange");
    let tail = &bytes[at + 10..];
    let open = tail.iter().position(|b| *b == b'[').expect("[");
    let close = tail.iter().position(|b| *b == b']').expect("]");
    let n: Vec<usize> = String::from_utf8_lossy(&tail[open + 1..close])
        .split_whitespace()
        .map(|v| v.parse().expect("integer"))
        .collect();
    bytes[n[0]..n[0] + n[1]].to_vec()
}

/// Sign the two-page fixture with the test certificate; returns the open,
/// signed document and the path of the signed file.
fn signed_document(name: &str) -> (OpenDocument, PathBuf) {
    let mut doc = OpenDocument::open(path_str(&manifest("tests/fixtures/two_pages.pdf"))).expect("open");
    let cert = scratch(&format!("{name}.p12"));
    fs::copy(manifest("tests/fixtures/signer-test.p12"), &cert).expect("certificate");
    let out = scratch(&format!("{name}.pdf"));
    doc.sign(path_str(&cert), P12_PASSWORD, "approved", path_str(&out))
        .expect("sign");
    assert!(doc.is_signed());
    (doc, out)
}

fn all_valid(doc: &OpenDocument) -> bool {
    let sigs = doc.verify_signatures();
    !sigs.is_empty() && sigs.iter().all(|s| s.valid)
}

#[test]
fn sign_then_annotate_then_save_keeps_the_signature_valid() {
    let (mut doc, signed_path) = signed_document("annotate");
    let signed_bytes = fs::read(&signed_path).unwrap();

    doc.add_highlight_annotation(0, &[[72.0, 700.0, 300.0, 720.0]], [1.0, 1.0, 0.0])
        .expect("annotate");
    doc.save_to(path_str(&signed_path)).expect("save");

    let saved = fs::read(&signed_path).unwrap();
    assert!(
        saved.starts_with(&signed_bytes),
        "the signed revision must be kept byte for byte and the edit appended after it"
    );
    let reopened = OpenDocument::open(path_str(&signed_path)).expect("reopen");
    let sigs = reopened.verify_signatures();
    assert_eq!(sigs.len(), 1);
    assert!(sigs[0].valid, "the signature no longer verifies after the save: {}", sigs[0].status);
    assert_eq!(
        reopened.get_page_annotations(0).len(),
        doc.get_page_annotations(0).len(),
        "the annotation made after signing is in the saved file"
    );
}

#[test]
fn a_second_edit_and_save_appends_again_and_still_verifies() {
    let (mut doc, signed_path) = signed_document("twice");
    doc.add_highlight_annotation(0, &[[72.0, 700.0, 300.0, 720.0]], [1.0, 1.0, 0.0])
        .expect("first edit");
    doc.save_to(path_str(&signed_path)).expect("first save");
    let after_first = fs::read(&signed_path).unwrap();

    doc.rotate_page_right(1).expect("second edit");
    doc.save_to(path_str(&signed_path)).expect("second save");

    let after_second = fs::read(&signed_path).unwrap();
    assert!(after_second.starts_with(&after_first), "the second save appends to the first");
    let reopened = OpenDocument::open(path_str(&signed_path)).expect("reopen");
    assert!(all_valid(&reopened), "{:?}", reopened.verify_signatures());
}

/// A golden form with a real-world author signature. Whatever `pdf-sign`
/// says about it before the edit, it must say after the save — and the bytes
/// the signature covers must be the same bytes.
#[test]
fn an_author_signed_golden_form_keeps_its_signed_bytes_across_an_annotation() {
    let src = manifest("tests/golden/xfa-0bf81862_imm5709e.pdf");
    let path = scratch("golden-author-signed.pdf");
    fs::copy(&src, &path).expect("copy");
    let mut doc = OpenDocument::open(path_str(&path)).expect("open");
    assert!(doc.is_signed(), "the fixture must carry its signature");
    let before: Vec<(String, bool)> = doc
        .verify_signatures()
        .into_iter()
        .map(|s| (s.field_name, s.valid))
        .collect();
    let original = fs::read(&path).unwrap();

    doc.add_comment_annotation(0, 100.0, 100.0, "reviewed")
        .expect("comment");
    doc.save_to(path_str(&path)).expect("save");

    let saved = fs::read(&path).unwrap();
    assert!(saved.starts_with(&original), "the signed original must be a prefix of the saved file");
    assert_eq!(first_signed_span(&saved), first_signed_span(&original));
    let after: Vec<(String, bool)> = OpenDocument::open(path_str(&path))
        .expect("reopen")
        .verify_signatures()
        .into_iter()
        .map(|s| (s.field_name, s.valid))
        .collect();
    assert_eq!(after, before, "the save must not change what the signatures verify to");
}

#[test]
fn a_redaction_of_a_signed_document_is_refused_over_the_original_and_offered_as_an_unsigned_copy() {
    let (mut doc, signed_path) = signed_document("redact");
    let signed_bytes = fs::read(&signed_path).unwrap();

    doc.redact_text(0, &[[0.0, 0.0, 612.0, 792.0]]).expect("redact");
    let err = doc
        .save_to(path_str(&signed_path))
        .expect_err("the signed original must not be rewritten under its signature");
    assert!(err.starts_with("signed-document-needs-full-rewrite"), "{err}");
    assert_eq!(fs::read(&signed_path).unwrap(), signed_bytes, "the refused save wrote nothing");
    assert!(doc.modified, "the redaction is still unsaved");

    let copy = scratch("redact-unsigned-copy.pdf");
    doc.save_unsigned_copy(path_str(&copy)).expect("unsigned copy");
    let reopened = OpenDocument::open(path_str(&copy)).expect("reopen copy");
    assert!(
        reopened.verify_signatures().is_empty(),
        "the copy must not carry a signature that no longer verifies"
    );
    assert!(!reopened.is_signed());
    assert!(!doc.modified);
}

/// The unsigned path is unchanged: a full rewrite, no growth by appending.
#[test]
fn an_unsigned_document_is_still_rewritten_whole() {
    let src = manifest("tests/fixtures/two_pages.pdf");
    let path = scratch("unsigned.pdf");
    fs::copy(&src, &path).expect("copy");
    let original = fs::read(&path).unwrap();
    let mut doc = OpenDocument::open(path_str(&path)).expect("open");
    assert!(!doc.is_signed());
    doc.rotate_page_right(0).expect("edit");
    doc.save_to(path_str(&path)).expect("save");
    let saved = fs::read(&path).unwrap();
    assert!(!saved.starts_with(&original), "an unsigned document is not saved incrementally");
}
