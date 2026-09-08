// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary. The PDFluent application is free to use,
// including for commercial purposes. Redistribution, or extraction or reuse
// of its components (including the embedded PDF engine), requires a licence.
// See https://pdfluent.com/license for terms.

//! An author-signed document is not edited behind the signer's back — and a
//! Reader-enabled one still is.
//!
//! Two kinds of signature turn up in the golden set and they are not the same
//! promise:
//!
//! * **Author signatures.** Four forms carry one: a `/Sig` field with a value,
//!   someone attesting to this document. Until #400 the writer replaced text in
//!   them and said nothing — the signature was invalidated, the extracted text
//!   was identical either way, and so the round-trip gate recorded "1
//!   replacement, 1 survived" as the correct outcome. The gate could not see the
//!   damage because a broken signature does not change the words on the page.
//!   These are now refused with the typed reason `document-signed`.
//!
//! * **Reader-enablement signatures** (`/Perms /UR3`). Seven more forms carry
//!   one and no author signature at all: their `/AcroForm /Fields` is empty and
//!   the signature grants features rather than attesting to content. Refusing
//!   those would make every Reader-enabled form read-only, which is not what the
//!   policy is for. `verify_signatures()` reports them all the same, which is
//!   why "the app calls it signed" is not the test here — what the writer does
//!   is.
//!
//! Both halves are asserted, because a policy is only as good as the edits it
//! still allows. Runs in the `cargo-test` job.

use pdfluent_lib::OpenDocument;
use std::collections::BTreeMap;
use std::fs;
use std::path::{Path, PathBuf};

/// The golden forms carrying an author signature. Named rather than detected:
/// `verify_signatures()` cannot tell an author signature from a usage-rights
/// one, and that difference is the whole point of this file.
const AUTHOR_SIGNED: [&str; 4] = [
    "xfa-0bf81862_imm5709e",
    "xfa-5d6e30ad_imm5257e",
    "xfa-e2bb8995_eimm5669e.2",
    "xfa-ff2723ed_imm5710e",
];

/// A form with a `/UR3` usage-rights signature and no author signature. Its
/// `/AcroForm /Fields` is empty, so the writer sees nothing to protect.
const READER_ENABLED: &str = "xfa-bd870029_pdf_0007";

fn golden_dir() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("tests/golden")
}

/// The word each document's baseline row asks the round-trip gate to replace,
/// so this test exercises the same edit rather than one of its own.
fn baseline_edit_words() -> BTreeMap<String, String> {
    let text = fs::read_to_string(golden_dir().join("baseline.tsv")).expect("read baseline.tsv");
    text.lines()
        .skip(1)
        .filter_map(|line| {
            let cols: Vec<&str> = line.split('\t').collect();
            match (cols.first(), cols.get(6)) {
                (Some(name), Some(word)) if *word != "-" => {
                    Some(((*name).to_string(), (*word).to_string()))
                }
                _ => None,
            }
        })
        .collect()
}

fn open(path: &Path) -> OpenDocument {
    OpenDocument::open(path.to_str().expect("utf-8 path"))
        .unwrap_or_else(|e| panic!("{}: open: {e}", path.display()))
}

fn document(name: &str) -> (OpenDocument, String) {
    let word = baseline_edit_words()
        .remove(name)
        .unwrap_or_else(|| panic!("{name}: no baseline row with an edit word"));
    (open(&golden_dir().join(format!("{name}.pdf"))), word)
}

#[test]
fn an_author_signed_form_is_refused_by_name_and_left_alone() {
    for name in AUTHOR_SIGNED {
        let (mut doc, word) = document(name);
        assert!(
            !doc.verify_signatures().is_empty(),
            "{name}: the fixture must carry a signature, or this proves nothing"
        );

        let before = doc.extract_page_text(0).expect("text before");
        let result = doc
            .replace_text_span(0, &word, "Kindly", None)
            .unwrap_or_else(|e| panic!("{name}: replace_text_span: {e}"));

        assert!(
            !result.replaced,
            "{name} is signed, so its content must not be rewritten"
        );
        assert_eq!(
            result.reason.as_deref(),
            Some("document-signed"),
            "{name}: the refusal must name the signature, not arrive by accident"
        );
        assert_eq!(result.signatures_present, Some(true), "{name}");
        // The word was there to replace. Without this the test would also pass
        // on a writer that simply stopped finding anything.
        assert_eq!(
            result.occurrence_count,
            Some(1),
            "{name}: the search still finds the word it declines to replace"
        );
        assert_eq!(
            doc.extract_page_text(0).expect("text after"),
            before,
            "{name}: a refused edit must leave the document alone"
        );
    }
}

#[test]
fn a_reader_enabled_form_without_an_author_signature_is_still_editable() {
    let name = READER_ENABLED;
    let (mut doc, word) = document(name);
    // The app reports this document's usage-rights signature in the Sign panel.
    assert!(
        !doc.verify_signatures().is_empty(),
        "{name}: the fixture must carry the /UR3 signature this test is about"
    );

    let result = doc
        .replace_text_span(0, &word, "Kindly", None)
        .unwrap_or_else(|e| panic!("{name}: replace_text_span: {e}"));

    assert!(
        result.replaced,
        "{name}: a usage-rights signature is not an attestation about content, \
         and refusing it would make every Reader-enabled form read-only: {result:?}"
    );
    assert_eq!(
        doc.extract_page_text(0)
            .expect("text after")
            .matches("Kindly")
            .count(),
        1,
        "{name}: exactly the one occurrence should have changed"
    );
}
