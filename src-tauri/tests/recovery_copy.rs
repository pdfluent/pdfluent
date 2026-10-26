// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary. The PDFluent application is free to use,
// including for commercial purposes. Redistribution, or extraction or reuse
// of its components (including the embedded PDF engine), requires a licence.
// See https://pdfluent.com/license for terms.

//! J-84: the recovery copy holds the unsaved work, and is no weaker than a
//! save would have been.
//!
//! The slot itself (write, offer, take, clear) is tested in `recovery.rs`.
//! This file pins what goes into it: the edit not yet saved; a protected
//! document still protected; a signed document still verifying. Runs in
//! `cargo-test`.

use pdf_manip::encrypt::{encrypt_and_save, EncryptConfig, EncryptionAlgorithm, Permissions};
use pdfluent_lib::OpenDocument;
use std::path::PathBuf;

fn manifest(rel: &str) -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR")).join(rel)
}

#[test]
fn the_recovery_copy_holds_the_unsaved_edit() {
    let mut doc = OpenDocument::open(manifest("tests/fixtures/two_pages.pdf").to_str().unwrap()).expect("open");
    doc.delete_pages(&[1]).expect("edit");
    let copy = OpenDocument::open_bytes(doc.recovery_bytes().expect("copy")).expect("the copy parses");
    assert_eq!(copy.page_count(), 1, "the unsaved edit is in the copy");
    assert!(doc.modified, "writing a recovery copy is not a save");
}

#[test]
fn a_protected_document_is_not_copied_out_in_plaintext() {
    let mut raw = lopdf::Document::load(manifest("tests/fixtures/two_pages.pdf")).expect("load");
    let config = EncryptConfig {
        user_password: b"open-sesame".to_vec(),
        owner_password: b"owner-key".to_vec(),
        algorithm: EncryptionAlgorithm::Aes256,
        permissions: Permissions::allow_all(),
    };
    let mut bytes = Vec::new();
    encrypt_and_save(&mut raw, &config, &mut bytes).expect("encrypt");
    let mut doc = OpenDocument::open_bytes_with_password(bytes, Some("open-sesame")).expect("open");
    doc.delete_pages(&[1]).expect("edit");

    let copy = doc.recovery_bytes().expect("copy");
    let err = OpenDocument::open_bytes(copy.clone()).err().expect("the copy must need the password");
    assert!(err.starts_with("password-required"), "{err}");
    let restored = OpenDocument::open_bytes_with_password(copy, Some("open-sesame")).expect("restores");
    assert_eq!(restored.page_count(), 1);
}

#[test]
fn a_signed_documents_copy_keeps_the_signature_verifying() {
    let mut doc = OpenDocument::open(manifest("tests/fixtures/two_pages.pdf").to_str().unwrap()).expect("open");
    let dir = std::env::temp_dir().join(format!("pdfluent-recovery-signed-{}", std::process::id()));
    std::fs::create_dir_all(&dir).unwrap();
    let cert = dir.join("signer.p12");
    std::fs::copy(manifest("tests/fixtures/signer-test.p12"), &cert).unwrap();
    let signed = dir.join("signed.pdf");
    doc.sign(cert.to_str().unwrap(), "pdfluent-test", "ok", signed.to_str().unwrap()).expect("sign");
    doc.add_highlight_annotation(0, &[[72.0, 700.0, 300.0, 720.0]], [1.0, 1.0, 0.0]).expect("edit");

    let copy = OpenDocument::open_bytes(doc.recovery_bytes().expect("copy")).expect("parses");
    let sigs = copy.verify_signatures();
    assert_eq!(sigs.len(), 1);
    assert!(sigs[0].valid, "{}", sigs[0].status);
}
