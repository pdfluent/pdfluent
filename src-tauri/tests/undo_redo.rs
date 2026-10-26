// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary. The PDFluent application is free to use,
// including for commercial purposes. Redistribution, or extraction or reuse
// of its components (including the embedded PDF engine), requires a licence.
// See https://pdfluent.com/license for terms.

//! J-85: every action that changes the document can be undone and redone,
//! and undo stays right across a save.
//!
//! Until 1.1.0 only form fields could be undone; text, annotations, page
//! operations and redaction marks could not. Each case below performs one
//! action through `OpenDocument::edit` — the one path every mutating command
//! in lib.rs takes — and checks that undo puts back the document exactly as
//! it was (the bytes a save would write) and that redo brings the change back.
//!
//! Runs in the `cargo-test` job on Linux, macOS and Windows.

use pdfluent_lib::{FormWriteRequest, OpenDocument};
use std::fs;
use std::path::{Path, PathBuf};

fn manifest(rel: &str) -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR")).join(rel)
}

fn open(rel: &str) -> OpenDocument {
    OpenDocument::open(manifest(rel).to_str().expect("utf-8")).expect("open fixture")
}

fn scratch(name: &str) -> PathBuf {
    let dir = std::env::temp_dir().join(format!("pdfluent-undo-{}", std::process::id()));
    fs::create_dir_all(&dir).expect("scratch dir");
    dir.join(name)
}

fn path_str(p: &Path) -> &str {
    p.to_str().expect("utf-8 path")
}

/// The document as a save would write it now.
fn bytes(doc: &mut OpenDocument) -> Vec<u8> {
    doc.recovery_bytes().expect("serialise")
}

/// Do `action` as one edit, then prove undo restores the exact bytes and redo
/// brings the change back.
fn assert_undoable(fixture: &str, label: &str, action: impl FnOnce(&mut OpenDocument)) {
    let mut doc = open(fixture);
    let before = bytes(&mut doc);
    assert!(!doc.history_state().can_undo, "{label}: a fresh document has nothing to undo");

    doc.edit(label, |d| {
        action(d);
        Ok(())
    })
    .expect("edit");
    let after = bytes(&mut doc);
    assert_ne!(before, after, "{label}: the action must change the document");
    let h = doc.history_state();
    assert!(h.can_undo, "{label}: the action is an undo step");
    assert_eq!(h.undo_label.as_deref(), Some(label));
    assert!(h.modified);

    assert!(doc.undo().expect("undo"), "{label}: undo applies");
    assert_eq!(bytes(&mut doc), before, "{label}: undo restores the document exactly");
    let h = doc.history_state();
    assert!(!h.can_undo && h.can_redo, "{label}: after undo only redo is left");
    assert!(!h.modified, "{label}: back at the opened state, nothing is unsaved");

    assert!(doc.redo().expect("redo"), "{label}: redo applies");
    assert_eq!(bytes(&mut doc), after, "{label}: redo restores the change exactly");
    assert!(doc.history_state().modified);
}

const TEXT: &str = "tests/golden/fixture-sample-text-3p.pdf";
const TWO: &str = "tests/fixtures/two_pages.pdf";
const FORM: &str = "tests/fixtures/sample_acroform.pdf";

#[test]
fn text_replacement_is_undoable() {
    assert_undoable(TEXT, "edit-text", |d| {
        let r = d.replace_text_span(0, "Lorem", "Fixed", None).expect("replace");
        assert!(r.replaced, "fixture text is editable: {:?}", r.reason);
    });
}

#[test]
fn text_format_is_undoable() {
    assert_undoable(TEXT, "format-text", |d| {
        let spans = d.extract_page_text_spans(0).expect("spans");
        let first = spans.iter().find(|s| !s.text.trim().is_empty()).expect("a span").text.clone();
        assert!(d.format_text_span(0, &first, Some(20.0), Some([1.0, 0.0, 0.0])).expect("format"));
    });
}

#[test]
fn page_rotation_is_undoable() {
    assert_undoable(TWO, "rotate-pages", |d| d.rotate_pages(&[0], 90).expect("rotate"));
}

#[test]
fn page_delete_is_undoable() {
    let mut doc = open(TWO);
    doc.edit("delete-pages", |d| d.delete_pages(&[0])).expect("delete");
    assert_eq!(doc.document_info().page_count, 1);
    doc.undo().expect("undo");
    assert_eq!(doc.document_info().page_count, 2, "the page is back, and the view knows it");
    assert_undoable(TWO, "delete-pages", |d| d.delete_pages(&[1]).expect("delete"));
}

#[test]
fn page_reorder_is_undoable() {
    assert_undoable(TWO, "reorder-pages", |d| d.reorder_pages(&[1, 0]).expect("reorder"));
}

#[test]
fn every_annotation_kind_is_undoable() {
    let rect = [[72.0_f32, 700.0, 200.0, 712.0]];
    assert_undoable(TEXT, "add-highlight", |d| d.add_highlight_annotation(0, &rect, [1.0, 1.0, 0.0]).expect("hl"));
    assert_undoable(TEXT, "add-underline", |d| d.add_underline_annotation(0, &rect, [0.0, 0.0, 1.0]).expect("ul"));
    assert_undoable(TEXT, "add-strikeout", |d| d.add_strikeout_annotation(0, &rect, [1.0, 0.0, 0.0]).expect("so"));
    assert_undoable(TEXT, "add-comment", |d| d.add_comment_annotation(0, 100.0, 600.0, "check this").expect("note"));
    assert_undoable(TEXT, "add-shape", |d| {
        d.add_shape_annotation(0, [100.0, 100.0, 200.0, 200.0], "rectangle", [1.0, 0.0, 0.0], 2.0).expect("shape")
    });
    assert_undoable(TEXT, "draw-ink", |d| {
        d.add_ink_annotation(0, &[vec![[100.0, 100.0], [150.0, 160.0], [200.0, 120.0]]], [0.0, 0.0, 0.0], 2.0)
            .expect("ink")
    });
    assert_undoable(TEXT, "mark-redaction", |d| d.add_redaction_annotation(0, [72.0, 700.0, 200.0, 712.0]).expect("mark"));
}

/// A small PNG made here, so the case needs no binary fixture.
fn png() -> Vec<u8> {
    let img = image::RgbaImage::from_pixel(4, 2, image::Rgba([200, 30, 30, 255]));
    let mut out = std::io::Cursor::new(Vec::new());
    img.write_to(&mut out, image::ImageFormat::Png).expect("png");
    out.into_inner()
}

#[test]
fn text_boxes_stamps_and_images_are_undoable() {
    assert_undoable(TEXT, "add-text-box", |d| {
        d.add_free_text_annotation(0, [100.0, 500.0, 300.0, 560.0], "Undo me", 12.0, [0.0, 0.0, 0.0]).expect("text box")
    });
    assert_undoable(TEXT, "add-stamp", |d| d.add_stamp_annotation(0, [100.0, 400.0, 260.0, 450.0], "Draft").expect("stamp"));
    assert_undoable(TEXT, "add-image", |d| d.add_image_annotation(0, [100.0, 300.0, 300.0, 400.0], &png()).expect("image"));
    assert_undoable(TEXT, "add-signature", |d| {
        d.add_signature_annotation(0, [100.0, 300.0, 300.0, 370.0], "Jane Doe", "2026-10-18", None, Some("Jane Doe")).expect("signature")
    });
}

#[test]
fn moving_recolouring_and_replacing_are_undoable() {
    let mut doc = open(TEXT);
    doc.add_shape_annotation(0, [100.0, 100.0, 200.0, 150.0], "rectangle", [1.0, 0.0, 0.0], 2.0).expect("square");
    doc.add_image_annotation(0, [100.0, 300.0, 300.0, 400.0], &png()).expect("image");
    let annots = doc.get_page_annotations(0);
    let square = annots[annots.len() - 2].id.clone();
    let image = annots[annots.len() - 1].id.clone();

    for (label, step) in [
        ("move-annotation", Box::new(|d: &mut OpenDocument| d.update_annotation_rect(&square, [150.0, 150.0, 250.0, 200.0])) as Box<dyn Fn(&mut OpenDocument) -> Result<(), String>>),
        ("change-annotation-colour", Box::new(|d: &mut OpenDocument| d.update_annotation_color(&square, [0.0, 0.0, 1.0]))),
        ("replace-image", Box::new(|d: &mut OpenDocument| d.replace_annotation_image(&image, &png()))),
    ] {
        let before = bytes(&mut doc);
        doc.edit(label, |d| step(d)).expect(label);
        assert_ne!(bytes(&mut doc), before, "{label}: changes the document");
        assert_eq!(doc.history_state().undo_label.as_deref(), Some(label));
        assert!(doc.undo().expect("undo"), "{label}: undo applies");
        assert_eq!(bytes(&mut doc), before, "{label}: undo restores the document exactly");
    }
}

#[test]
fn annotation_delete_and_edit_are_undoable() {
    let mut doc = open(TEXT);
    doc.add_comment_annotation(0, 100.0, 600.0, "first").expect("note");
    doc.save_to(path_str(&scratch("annot-base.pdf"))).expect("save");
    let id = doc.get_page_annotations(0).last().expect("annotation").id.clone();

    doc.edit("edit-comment", |d| d.update_annotation_contents(&id, "second")).expect("edit");
    doc.undo().expect("undo");
    assert_eq!(doc.get_page_annotations(0).last().unwrap().contents.as_deref(), Some("first"));

    let n = doc.get_page_annotations(0).len();
    doc.edit("delete-annotation", |d| d.delete_annotation(&id)).expect("delete");
    assert_eq!(doc.get_page_annotations(0).len(), n - 1);
    doc.undo().expect("undo");
    assert_eq!(doc.get_page_annotations(0).len(), n, "the deleted annotation is back");
}

#[test]
fn watermark_metadata_and_attachments_are_undoable() {
    assert_undoable(TWO, "add-watermark", |d| d.add_watermark("DRAFT", 0.3).expect("watermark"));
    assert_undoable(TWO, "edit-properties", |d| {
        d.set_document_info(Some("Undo title".into()), Some("Undo author".into())).expect("info")
    });
    assert_undoable(TWO, "add-attachment", |d| d.add_attachment("notes.txt", b"hello", "text/plain").expect("attach"));
}

#[test]
fn form_fill_is_undoable() {
    let doc = open(FORM);
    let name = doc.get_form_model().first().expect("a field").name.clone();
    assert_undoable(FORM, "fill-field", |d| {
        d.apply_form_value(&FormWriteRequest::Text { name: name.clone(), value: "Undo me".into() }).expect("fill");
    });
}

#[test]
fn a_text_commit_is_one_step() {
    let mut doc = open(TEXT);
    let before = bytes(&mut doc);
    doc.begin_edit_group("edit-text");
    doc.edit("edit-text", |d| d.replace_text_span(0, "Lorem", "Fixed", None)).expect("replace");
    let run = doc
        .extract_page_text_spans(0)
        .expect("spans")
        .iter()
        .find(|s| s.text.contains("Fixed"))
        .expect("the edited run")
        .text
        .clone();
    assert!(doc.edit("format-text", |d| d.format_text_span(0, &run, Some(18.0), None)).expect("format"));
    doc.end_edit_group();
    assert_eq!(doc.history_state().undo_label.as_deref(), Some("edit-text"));
    doc.undo().expect("undo");
    assert_eq!(bytes(&mut doc), before, "one undo takes back the replacement and its formatting");
    assert!(!doc.history_state().can_undo);
}

#[test]
fn an_edit_that_changes_nothing_or_fails_is_not_a_step() {
    let mut doc = open(TEXT);
    let r = doc.edit("edit-text", |d| d.replace_text_span(0, "no such words here", "x", None)).expect("call");
    assert!(!r.replaced);
    assert!(doc.edit("delete-pages", |d| d.delete_pages(&[99])).is_err());
    assert!(!doc.history_state().can_undo, "nothing changed, nothing to undo");
    assert!(!doc.history_state().modified);
}

#[test]
fn undo_is_consistent_across_save() {
    let mut doc = open(TWO);
    let path = scratch("across-save.pdf");
    let opened = bytes(&mut doc);

    doc.edit("rotate-pages", |d| d.rotate_pages(&[0], 90)).expect("rotate");
    doc.save_to(path_str(&path)).expect("save");
    assert!(!doc.history_state().modified, "saved");
    assert!(doc.history_state().can_undo, "a save does not end the history");

    doc.undo().expect("undo");
    assert!(doc.history_state().modified, "undoing past the save is an unsaved change");
    assert_eq!(bytes(&mut doc), opened);
    doc.save_to(path_str(&path)).expect("save again");
    let reopened = OpenDocument::open(path_str(&path)).expect("reopen");
    let mut reopened = reopened;
    assert_eq!(bytes(&mut reopened), opened, "the file on disk has the undone state");

    doc.redo().expect("redo");
    assert!(doc.history_state().modified);
    doc.undo().expect("undo");
    assert!(!doc.history_state().modified, "back at the state that was saved last: clean");
}

#[test]
fn a_new_edit_after_undo_ends_the_redo_branch() {
    let mut doc = open(TWO);
    doc.edit("rotate-pages", |d| d.rotate_pages(&[0], 90)).expect("rotate");
    doc.undo().expect("undo");
    doc.edit("add-watermark", |d| d.add_watermark("X", 0.5)).expect("watermark");
    assert!(!doc.history_state().can_redo);
    assert!(!doc.redo().expect("redo"), "nothing to redo");
}
