// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary. The PDFluent application is free to use,
// including for commercial purposes. Redistribution, or extraction or reuse
// of its components (including the embedded PDF engine), requires a licence.
// See https://pdfluent.com/license for terms.

//! J-66: personal data (IBAN, e-mail, phone) is found on a real document,
//! the user picks which of it to redact, and the saved file no longer holds
//! it, at byte level.
//!
//! The fixture (`tests/fixtures/pii_sample.pdf`, built by `make_pii_sample.py`)
//! carries each pattern, one value that appears on two pages, and near-misses
//! that must not be offered: an IBAN with a wrong check digit, an old Dutch
//! account number, an invoice number and date. The file is deliberately not
//! compressed, so the "before" assertion proves the raw bytes did hold the
//! values and the "after" assertion is not satisfied by an encoding.
//!
//! Runs in the `cargo-test` job and on quality:macos / quality:windows.

use pdfluent_lib::pii::PiiKind;
use pdfluent_lib::OpenDocument;
use std::fs;
use std::path::{Path, PathBuf};

fn manifest(rel: &str) -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR")).join(rel)
}

fn scratch(name: &str) -> PathBuf {
    let dir = std::env::temp_dir().join(format!("pdfluent-pii-{}", std::process::id()));
    fs::create_dir_all(&dir).expect("scratch dir");
    dir.join(name)
}

fn s(p: &Path) -> &str {
    p.to_str().expect("utf-8 path")
}

fn open_fixture(name: &str) -> (OpenDocument, PathBuf) {
    let path = scratch(name);
    fs::copy(manifest("tests/fixtures/pii_sample.pdf"), &path).expect("copy fixture");
    (OpenDocument::open(s(&path)).expect("open"), path)
}

fn page_text(doc: &OpenDocument) -> String {
    (0..doc.page_count() as u32)
        .map(|p| doc.extract_page_text(p).expect("text"))
        .collect::<Vec<_>>()
        .join("\n")
}

/// The forms a string can take inside a PDF without a font-specific encoding.
fn needles(word: &str) -> Vec<Vec<u8>> {
    let utf16: Vec<u8> = word.encode_utf16().flat_map(|u| u.to_be_bytes()).collect();
    let hex: String = word.bytes().map(|b| format!("{b:02X}")).collect();
    vec![word.as_bytes().to_vec(), utf16, hex.clone().into_bytes(), hex.to_lowercase().into_bytes()]
}

fn contains(hay: &[u8], needle: &[u8]) -> bool {
    !needle.is_empty() && hay.windows(needle.len()).any(|w| w == needle)
}

fn collect_strings(obj: &lopdf::Object, out: &mut Vec<Vec<u8>>) {
    match obj {
        lopdf::Object::String(bytes, _) | lopdf::Object::Name(bytes) => out.push(bytes.clone()),
        lopdf::Object::Array(items) => items.iter().for_each(|o| collect_strings(o, out)),
        lopdf::Object::Dictionary(d) => d.iter().for_each(|(_, v)| collect_strings(v, out)),
        lopdf::Object::Stream(stream) => {
            stream.dict.iter().for_each(|(_, v)| collect_strings(v, out));
            out.push(stream.decompressed_content().unwrap_or_else(|_| stream.content.clone()));
        }
        _ => {}
    }
}

/// Every place in the file at `path` where `text` (or, for spaced values, its
/// compact form) still appears: raw bytes, any object's strings and decoded
/// streams, and text extraction from a fresh open.
fn traces(path: &Path, text: &str) -> Vec<String> {
    let bytes = fs::read(path).expect("read file");
    let compact: String = text.chars().filter(|c| !c.is_whitespace()).collect();
    let variants = [text.to_string(), compact];
    let mut found = Vec::new();
    for v in &variants {
        for n in needles(v) {
            if contains(&bytes, &n) {
                found.push(format!("raw file bytes ({v:?})"));
            }
        }
    }
    let doc = lopdf::Document::load_mem(&bytes).expect("the file parses");
    for (id, obj) in &doc.objects {
        let mut strings = Vec::new();
        collect_strings(obj, &mut strings);
        for v in &variants {
            if needles(v).iter().any(|n| strings.iter().any(|st| contains(st, n))) {
                found.push(format!("object {} {} ({v:?})", id.0, id.1));
            }
        }
    }
    let reopened = OpenDocument::open(s(path)).expect("reopen");
    if page_text(&reopened).contains(text) {
        found.push("extracted text after reopening".to_string());
    }
    found
}

fn kinds_and_texts(doc: &OpenDocument) -> Vec<(PiiKind, String)> {
    doc.detect_pii().expect("detect").into_iter().map(|c| (c.kind, c.text)).collect()
}

/// Exactly the personal data, nothing from the near-misses.
#[test]
fn detection_finds_every_pattern_and_none_of_the_near_misses() {
    let (doc, _) = open_fixture("detect.pdf");
    assert_eq!(
        kinds_and_texts(&doc),
        [
            (PiiKind::Iban, "NL91 ABNA 0417 1643 00".to_string()),
            (PiiKind::Email, "jan.jansen@example.com".to_string()),
            (PiiKind::Phone, "+31 6 12345678".to_string()),
            (PiiKind::Phone, "020 1234567".to_string()),
            (PiiKind::Phone, "+44 20 7946 0958".to_string()),
            (PiiKind::Iban, "DE89 3704 0044 0532 0130 00".to_string()),
        ]
    );
    let email = doc.detect_pii().unwrap().into_iter().find(|c| c.kind == PiiKind::Email).unwrap();
    assert_eq!((email.pages.as_slice(), email.occurrences), ([0u32, 1].as_slice(), 2), "the e-mail is on both pages");
}

/// Detect, choose, redact, save, reopen: the chosen values are gone from the
/// bytes, the unchosen one and the rest of the page are still there.
#[test]
fn chosen_personal_data_is_gone_from_the_saved_file_and_the_rest_stays() {
    let (mut doc, original) = open_fixture("e2e.pdf");
    let candidates = doc.detect_pii().expect("detect");
    let kept = "020 1234567"; // the user unticks this one in the review list
    let chosen: Vec<String> = candidates.iter().map(|c| c.text.clone()).filter(|t| t != kept).collect();
    assert_eq!(chosen.len(), candidates.len() - 1);

    for t in &chosen {
        assert!(!traces(&original, t).is_empty(), "the fixture must hold {t:?} first, or this proves nothing");
    }

    let report = doc.redact_pii(&chosen).expect("redact_pii");
    assert_eq!(report.texts_redacted, chosen.len());
    assert!(report.matches_found > chosen.len(), "the e-mail on two pages counts twice: {report:?}");

    let saved = scratch("e2e-saved.pdf");
    doc.save_to(s(&saved)).expect("save");

    for t in &chosen {
        let left = traces(&saved, t);
        assert!(left.is_empty(), "{t:?} survives the redaction in: {left:#?}");
    }
    let reopened = OpenDocument::open(s(&saved)).expect("reopen");
    let text = page_text(&reopened);
    for survivor in [kept, "Customer record", "NL92 ABNA 0417 1643 00", "0417164300", "Invoice 2024-0042", "Reminder"] {
        assert!(text.contains(survivor), "the redaction removed {survivor:?} too: {text:?}");
    }
    assert_eq!(kinds_and_texts(&reopened), [(PiiKind::Phone, kept.to_string())], "only the unchosen item is still detectable");
}

/// Not a free-form search: only text the detector itself reports can be
/// redacted through this path, and a refusal leaves the document untouched.
#[test]
fn only_detected_items_are_accepted_and_a_refusal_changes_nothing() {
    let (mut doc, _) = open_fixture("refuse.pdf");
    for bad in ["Customer", "NL92 ABNA 0417 1643 00", "0417164300", ""] {
        let err = doc.redact_pii(&[bad.to_string()]).expect_err(bad);
        assert!(err.starts_with("Not a detected item"), "{bad:?}: {err}");
    }
    assert!(doc.redact_pii(&[]).is_err());
    assert!(!doc.modified, "a refused redaction must not touch the document");
    assert_eq!(page_text(&doc).matches("jan.jansen@example.com").count(), 2);
}

/// The all-or-nothing rule: one item the page content does not hold (here a
/// well-formed IBAN the document never mentions) fails the batch and puts the
/// document back, instead of redacting half.
#[test]
fn a_batch_with_one_missing_item_is_rolled_back() {
    let (mut doc, _) = open_fixture("rollback.pdf");
    let before = page_text(&doc);
    let err = doc
        .redact_pii(&["jan.jansen@example.com".to_string(), "GB82 WEST 1234 5698 7654 32".to_string()])
        .expect_err("the second item is not in the document");
    assert!(err.starts_with("redaction-incomplete"), "{err}");
    assert_eq!(page_text(&doc), before, "the first item must not stay redacted");
    assert!(!doc.modified);
}
