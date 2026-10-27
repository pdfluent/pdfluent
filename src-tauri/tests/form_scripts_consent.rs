// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary. The PDFluent application is free to use,
// including for commercial purposes. Redistribution, or extraction or reuse
// of its components (including the embedded PDF engine), requires a licence.
// See https://pdfluent.com/license for terms.

//! Form scripts run only with the user's permission.
//!
//! The fixture `tests/fixtures/form_scripts.pdf` (make_form_scripts.py) has
//! three text fields and two AcroForm scripts: a format action on `price` and
//! a calculate action on `total` (quantity times price). A document that
//! carries scripts opens and can be filled, and nothing is calculated, on
//! open, on fill, on print and on save, until permission is given.
//!
//! Runs in the `cargo-test` job on Linux, macOS and Windows.

use pdfluent_lib::{FormWriteRequest, OpenDocument};
use std::path::{Path, PathBuf};

const FIXTURE: &str = "tests/fixtures/form_scripts.pdf";

fn manifest(rel: &str) -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR")).join(rel)
}

fn path_str(p: &Path) -> &str {
    p.to_str().expect("utf-8 path")
}

fn open() -> OpenDocument {
    OpenDocument::open(path_str(&manifest(FIXTURE))).expect("open fixture")
}

fn type_into(doc: &mut OpenDocument, name: &str, value: &str) {
    doc.edit("fill-field", |d| {
        d.apply_form_value(&FormWriteRequest::Text { name: name.into(), value: value.into() })
            .map(|_| ())
    })
    .unwrap_or_else(|e| panic!("fill {name}: {e}"));
}

fn value_of(doc: &OpenDocument, name: &str) -> String {
    doc.get_form_model()
        .into_iter()
        .find(|f| f.name == name)
        .unwrap_or_else(|| panic!("field {name}"))
        .value
        .unwrap_or_default()
}

#[test]
fn a_document_with_scripts_opens_with_them_blocked_and_counted() {
    let doc = open();
    let status = doc.form_scripts_status();
    assert_eq!(status.acroform, 2, "the format and the calculate action");
    assert_eq!((status.javascript, status.formcalc), (0, 0));
    assert_eq!(status.total, 2);
    assert!(!status.allowed, "closed until the user agrees");
}

#[test]
fn nothing_is_calculated_without_permission() {
    let mut doc = open();
    assert_eq!(value_of(&doc, "total"), "", "open runs no script");
    type_into(&mut doc, "qty", "3");
    type_into(&mut doc, "price", "4");
    assert_eq!(value_of(&doc, "qty"), "3", "the form can be filled");
    assert_eq!(value_of(&doc, "price"), "4", "the typed value is kept as typed");
    assert_eq!(value_of(&doc, "total"), "", "total is not calculated");
}

#[test]
fn print_and_save_run_no_script() {
    let mut doc = open();
    type_into(&mut doc, "qty", "3");
    type_into(&mut doc, "price", "4");
    doc.print_copy().expect("print copy");
    let out = std::env::temp_dir().join(format!("pdfluent-script-consent-{}.pdf", std::process::id()));
    doc.save_to(path_str(&out)).expect("save");
    assert_eq!(value_of(&doc, "total"), "", "save did not calculate");
    let reopened = OpenDocument::open(path_str(&out)).expect("reopen");
    assert_eq!(value_of(&reopened, "total"), "", "the saved file has no calculated total");
    assert!(!reopened.form_scripts_status().allowed, "permission does not travel in the file");
    let _ = std::fs::remove_file(out);
}

#[test]
fn permission_is_per_document_and_withdrawable() {
    let mut doc = open();
    let other = open();
    doc.set_scripts_allowed(true).expect("grant");
    assert!(doc.form_scripts_status().allowed);
    assert!(!other.form_scripts_status().allowed, "another open copy is not affected");
    doc.set_scripts_allowed(false).expect("withdraw");
    assert!(!doc.form_scripts_status().allowed);
}

#[test]
fn the_same_file_has_the_same_hash_and_a_different_file_does_not() {
    let a = open().form_scripts_status().content_hash;
    let b = open().form_scripts_status().content_hash;
    let other = OpenDocument::open(path_str(&manifest("tests/fixtures/two_pages.pdf")))
        .expect("open")
        .form_scripts_status()
        .content_hash;
    assert_eq!(a, b);
    assert_ne!(a, other);
}

// ── What the run reports (GOV-011) ───────────────────────────────────────
//
// Granting permission used to answer `ran: true` and nothing else, whether the
// calculations worked or every one of them failed. The failures are now in the
// report, so the form bar can say so and a user can tell a working form from a
// failing one.

use lopdf::{Document, Object, StringFormat};

/// The fixture with the total's calculate script replaced, scripts not yet allowed.
fn with_total_script(script: &str) -> OpenDocument {
    let mut raw = Document::load(path_str(&manifest(FIXTURE))).expect("lopdf load");
    let id = raw
        .objects
        .iter()
        .find(|(_, o)| o.as_dict().is_ok_and(|d| matches!(d.get(b"T"), Ok(Object::String(t, _)) if t == b"total")))
        .map(|(id, _)| *id)
        .expect("total field");
    let Ok(Object::Dictionary(field)) = raw.get_object_mut(id) else { panic!("field dict") };
    let Ok(Object::Dictionary(aa)) = field.get_mut(b"AA") else { panic!("AA") };
    let Ok(Object::Dictionary(c)) = aa.get_mut(b"C") else { panic!("C") };
    c.set("JS", Object::String(script.as_bytes().to_vec(), StringFormat::Literal));
    let mut bytes = Vec::new();
    raw.save_to(&mut bytes).expect("serialise");
    OpenDocument::open_bytes(bytes).expect("open modified fixture")
}

#[test]
fn granting_permission_on_a_form_whose_calculation_fails_says_so() {
    let mut doc = with_total_script("AFSimple_Calculate(\"PRD\", new Array(\"qty\", \"missing\"));");
    let report = doc.set_scripts_allowed(true).expect("grant");
    assert!(report.ran);
    assert_eq!(report.failed.len(), 1, "the failed calculation is in the report: {report:?}");
    assert_eq!(report.failed[0].name, "total");
    assert!(report.failed[0].message.contains("missing"), "{}", report.failed[0].message);
}

#[test]
fn granting_permission_on_a_working_form_reports_no_failure() {
    let mut doc = open();
    let report = doc.set_scripts_allowed(true).expect("grant");
    assert!(report.ran);
    assert!(report.failed.is_empty(), "{report:?}");
}

#[test]
fn a_form_with_a_failing_calculation_still_saves_and_reopens_with_what_was_typed() {
    let mut doc = with_total_script("AFSimple_Calculate(\"PRD\", new Array(\"qty\", \"missing\"));");
    let report = doc.set_scripts_allowed(true).expect("grant");
    assert_eq!(report.failed.len(), 1);
    type_into(&mut doc, "qty", "3");
    type_into(&mut doc, "price", "4");
    let out = std::env::temp_dir().join(format!("pdfluent-failing-calc-{}.pdf", std::process::id()));
    doc.save_to(path_str(&out)).expect("save");
    let reopened = OpenDocument::open(path_str(&out)).expect("reopen");
    assert_eq!(value_of(&reopened, "qty"), "3");
    assert_eq!(value_of(&reopened, "price"), "4");
    assert_eq!(value_of(&reopened, "total"), "", "a failed calculation leaves no invented total");
    let _ = std::fs::remove_file(out);
}
