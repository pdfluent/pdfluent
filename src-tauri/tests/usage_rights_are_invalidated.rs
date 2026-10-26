// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary. The PDFluent application is free to use,
// including for commercial purposes. Redistribution, or extraction or reuse
// of its components (including the embedded PDF engine), requires a licence.
// See https://pdfluent.com/license for terms.

//! Editing a Reader-enabled document: what the save keeps, and what the edit
//! still costs.
//!
//! `xfa-bd870029_pdf_0007` carries a `/Perms /UR3` signature: Adobe Reader
//! enablement, which grants features rather than attesting to content. The
//! writer edits it on purpose — refusing would make every Reader-enabled form
//! read-only, which `signed_documents_are_refused.rs` pins from the other side.
//!
//! Since 1.0.1 a document that carries any signature is saved as an
//! incremental update (`signed_documents_keep_their_signatures.rs`), so the
//! bytes the `/UR3` signature was computed over are kept exactly. That keeps
//! the usage rights for the changes they grant — filling the form, adding
//! comments. It does not make a text edit acceptable to them: a content-stream
//! change is outside what `/UR3` permits, Reader withdraws the extended
//! features when it sees one, and so the writer still reports
//! `usage_rights_invalidated` for it and the app still warns.
//!
//! The fact is asserted on the bytes, not on `verify_signatures`. `pdf-sign`
//! cannot parse the CMS Adobe writes into a `/UR3` signature at the pinned
//! engine revision (pdfluent-internal#469): it answers "cannot parse CMS
//! SignedData" for this fixture untouched and the identical sentence after the
//! edit, so nothing it returns distinguishes the two. What does is the
//! `/ByteRange` the signature declares: those bytes were what the signature was
//! computed over.
//!
//! Red when: the edit stops being applied, the writer stops reporting what a
//! text edit costs, or a save rewrites the signed bytes again.
//!
//! Runs in the `cargo-test` job.

use pdfluent_lib::OpenDocument;
use std::path::PathBuf;

/// The first signed range a document's `/ByteRange` declares, as raw bytes.
///
/// `/ByteRange [a b c d]` names two spans of the file: `a..a+b` before the
/// signature's `/Contents` and `c..c+d` after it. The first is the one an edit
/// to page 1 moves, and reading it out of the file is what makes "the signature
/// no longer covers this document" checkable without a CMS parser.
fn signed_prefix(bytes: &[u8]) -> Vec<u8> {
    let at = bytes
        .windows(10)
        .position(|w| w == b"/ByteRange")
        .expect("the fixture declares a /ByteRange");
    let tail = &bytes[at + 10..];
    let open = tail.iter().position(|b| *b == b'[').expect("[ after /ByteRange");
    let close = tail.iter().position(|b| *b == b']').expect("] after /ByteRange");
    let numbers: Vec<usize> = String::from_utf8_lossy(&tail[open + 1..close])
        .split_whitespace()
        .map(|n| n.parse().expect("integer in /ByteRange"))
        .collect();
    assert_eq!(numbers.len(), 4, "a /ByteRange is four numbers: {numbers:?}");
    let (offset, length) = (numbers[0], numbers[1]);
    bytes[offset..offset + length].to_vec()
}

/// The Reader-enabled form, and the word its baseline row asks the round-trip
/// gate to replace — the same edit, not one invented here.
const READER_ENABLED: &str = "xfa-bd870029_pdf_0007";
const EDIT_WORD: &str = "Please";

/// A form whose signature is an author's attestation. It is here to keep the
/// classifier from answering "usage rights" to everything.
const AUTHOR_SIGNED: &str = "xfa-0bf81862_imm5709e";

fn golden(name: &str) -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR")).join(format!("tests/golden/{name}.pdf"))
}

#[test]
fn a_text_edit_of_a_reader_enabled_form_is_reported_and_saved_without_rewriting_the_signed_bytes() {
    let path = golden(READER_ENABLED);
    let mut doc = OpenDocument::open(path.to_str().expect("utf-8 path")).expect("open fixture");

    let before = doc.verify_signatures();
    assert_eq!(
        before.len(),
        1,
        "{READER_ENABLED}: the fixture must carry exactly the one /UR3 signature this test is about"
    );
    assert!(
        before[0].usage_rights,
        "{READER_ENABLED}: the /Perms /UR3 entry is what the Sign panel has to \
         name, and naming it is the difference between a warning and a lie: {:?}",
        before[0]
    );

    let result = doc
        .replace_text_span(0, EDIT_WORD, "Kindly", None)
        .expect("replace_text_span");
    assert!(
        result.replaced,
        "{READER_ENABLED}: a usage-rights signature is not an attestation about \
         content, so the edit goes through: {result:?}"
    );
    assert_eq!(
        result.usage_rights_invalidated,
        Some(true),
        "{READER_ENABLED}: the writer has to report the cost of the edit it just \
         made, or the app cannot warn about it: {result:?}"
    );

    let saved = std::env::temp_dir().join(format!(
        "{READER_ENABLED}-edited-{}.pdf",
        std::process::id()
    ));
    let saved_path = saved.to_str().expect("utf-8 path").to_string();
    doc.save_to(&saved_path).expect("save the edited document");

    let reopened = OpenDocument::open(&saved_path).expect("reopen the saved document");
    let after = reopened.verify_signatures();
    let signed_before = signed_prefix(&std::fs::read(&path).expect("read the fixture"));
    let signed_after = signed_prefix(&std::fs::read(&saved).expect("read the saved document"));
    let _ = std::fs::remove_file(&saved);

    assert_eq!(
        after.len(),
        1,
        "{READER_ENABLED}: the signature dictionary survives the save"
    );
    assert_eq!(
        signed_after,
        signed_before,
        "{READER_ENABLED}: the save must append the edit as an incremental \
         update and leave the bytes the /UR3 signature was computed over alone"
    );
    assert!(
        after[0].usage_rights,
        "{READER_ENABLED}: it is still the usage-rights entry afterwards, which \
         is why the panel can say the rights are gone rather than 'invalid \
         signature': {:?}",
        after[0]
    );
}

/// Without this the classifier could answer "usage rights" to every signature
/// and the test above would still pass.
#[test]
fn an_author_signature_is_not_reported_as_usage_rights() {
    let path = golden(AUTHOR_SIGNED);
    let doc = OpenDocument::open(path.to_str().expect("utf-8 path")).expect("open fixture");

    let signatures = doc.verify_signatures();
    assert!(
        !signatures.is_empty(),
        "{AUTHOR_SIGNED}: the fixture must carry the author signature this test is about"
    );
    for signature in &signatures {
        assert!(
            !signature.usage_rights,
            "{AUTHOR_SIGNED}: an author signature attests to the content; calling \
             it a usage right would send the wrong warning: {signature:?}"
        );
    }
}
