// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary. The PDFluent application is free to use,
// including for commercial purposes. Redistribution, or extraction or reuse
// of its components (including the embedded PDF engine), requires a licence.
// See https://pdfluent.com/license for terms.

//! J-90: two documents open at once do not share anything.
//!
//! The editor keeps one document on screen and the others parked beside it
//! (`sessions::SessionBook`, the same code the app's `open_pdf`,
//! `activate_session` and `close_session` commands run). The things that must
//! stay separate are the ones a shared slot would leak: the undo and redo
//! steps, the unsaved flag, the path Save writes to. Each case below drives two
//! real documents through the book and checks that what happens to one is
//! invisible in the other.
//!
//! Runs in the `cargo-test` job on Linux, macOS and Windows.

use pdfluent_lib::sessions::{SessionBook, SessionError, SessionId};
use pdfluent_lib::OpenDocument;
use std::fs;
use std::path::PathBuf;

const TWO: &str = "tests/fixtures/two_pages.pdf";
const THREE: &str = "tests/golden/fixture-sample-text-3p.pdf";

fn manifest(rel: &str) -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR")).join(rel)
}

fn open(rel: &str) -> OpenDocument {
    OpenDocument::open(manifest(rel).to_str().expect("utf-8")).expect("open fixture")
}

fn scratch(name: &str) -> PathBuf {
    let dir = std::env::temp_dir().join(format!("pdfluent-sessions-{}", std::process::id()));
    fs::create_dir_all(&dir).expect("scratch dir");
    dir.join(name)
}

/// The app's slot (the document on screen and the path Save writes to) next to
/// the book that parks the rest.
struct Slot {
    book: SessionBook<OpenDocument>,
    doc: Option<OpenDocument>,
    path: Option<String>,
}

impl Slot {
    fn new() -> Self {
        Slot { book: SessionBook::default(), doc: None, path: None }
    }

    fn open(&mut self, rel: &str) -> SessionId {
        let p = manifest(rel).to_string_lossy().into_owned();
        self.book.open(&mut self.doc, &mut self.path, open(rel), Some(p))
    }

    fn activate(&mut self, id: SessionId) {
        self.book.activate(&mut self.doc, &mut self.path, id).expect("activate");
    }

    fn doc(&mut self) -> &mut OpenDocument {
        self.doc.as_mut().expect("a document is on screen")
    }
}

fn bytes(doc: &mut OpenDocument) -> Vec<u8> {
    doc.recovery_bytes().expect("serialise")
}

#[test]
fn undo_in_one_document_does_not_touch_the_other() {
    let mut app = Slot::new();
    let a = app.open(TWO);
    let b = app.open(THREE);

    // An edit in B.
    app.doc().edit("rotate-pages", |d| d.rotate_pages(&[0], 90)).expect("edit b");
    let b_after_edit = bytes(app.doc());

    // An edit in A, then undo it.
    app.activate(a);
    let a_before = bytes(app.doc());
    app.doc().edit("delete-pages", |d| d.delete_pages(&[1])).expect("edit a");
    assert_eq!(app.doc().document_info().page_count, 1);
    assert!(app.doc().undo().expect("undo a"));
    assert_eq!(bytes(app.doc()), a_before, "undo put A back exactly");
    assert_eq!(app.doc().document_info().page_count, 2);

    // B kept its change and its own undo step.
    app.activate(b);
    assert_eq!(bytes(app.doc()), b_after_edit, "A's undo did not reach B");
    let h = app.doc().history_state();
    assert!(h.can_undo && !h.can_redo, "B still has its step, and no redo from A's undo");
    assert_eq!(h.undo_label.as_deref(), Some("rotate-pages"));
    assert!(h.modified);
}

#[test]
fn each_document_has_its_own_undo_and_redo_stack() {
    let mut app = Slot::new();
    let a = app.open(TWO);
    let b = app.open(THREE);

    assert!(!app.doc().history_state().can_undo, "a fresh document has nothing to undo");
    app.activate(a);
    app.doc().edit("rotate-pages", |d| d.rotate_pages(&[0], 90)).expect("edit a");
    app.doc().edit("rotate-pages", |d| d.rotate_pages(&[1], 90)).expect("edit a again");

    app.activate(b);
    assert!(!app.doc().history_state().can_undo, "A's two steps are not B's");
    assert!(!app.doc().undo().expect("nothing to undo in b"), "undo in B has nothing to do");

    app.activate(a);
    assert!(app.doc().undo().expect("undo a"));
    assert!(app.doc().undo().expect("undo a again"));
    assert!(!app.doc().undo().expect("a is back at the start"));
    assert!(app.doc().history_state().can_redo);

    app.activate(b);
    assert!(!app.doc().history_state().can_redo, "A's redo steps do not show in B");
}

#[test]
fn the_unsaved_flag_belongs_to_its_document() {
    let mut app = Slot::new();
    let a = app.open(TWO);
    let b = app.open(THREE);
    app.activate(a);
    app.doc().edit("rotate-pages", |d| d.rotate_pages(&[0], 90)).expect("edit a");
    assert!(app.doc().modified);

    app.activate(b);
    assert!(!app.doc().modified, "B is clean while A has unsaved changes");
    assert!(
        app.book.parked().iter().any(|p| p.doc.modified),
        "the close guard can still see A's unsaved changes while B is on screen"
    );

    // Saving B must not clear A's flag.
    let out = scratch("saved-b.pdf");
    app.doc().edit("rotate-pages", |d| d.rotate_pages(&[0], 90)).expect("edit b");
    app.doc().save_to(out.to_str().expect("utf-8")).expect("save b");
    assert!(!app.doc().modified);
    app.activate(a);
    assert!(app.doc().modified, "A is still unsaved after B was saved");
}

#[test]
fn save_goes_to_the_path_of_the_document_on_screen() {
    let mut app = Slot::new();
    let a = app.open(TWO);
    let b = app.open(THREE);
    assert!(app.path.as_deref().is_some_and(|p| p.ends_with("fixture-sample-text-3p.pdf")));
    // "Save As" on B points only B's path somewhere new.
    app.path = Some("/elsewhere/b.pdf".into());
    app.activate(a);
    assert!(app.path.as_deref().is_some_and(|p| p.ends_with("two_pages.pdf")), "A kept its own path");
    app.activate(b);
    assert_eq!(app.path.as_deref(), Some("/elsewhere/b.pdf"));
}

#[test]
fn closing_one_document_leaves_the_other_with_its_edits_and_undo() {
    let mut app = Slot::new();
    let a = app.open(TWO);
    let b = app.open(THREE);
    app.activate(a);
    app.doc().edit("rotate-pages", |d| d.rotate_pages(&[0], 90)).expect("edit a");
    let a_edited = bytes(app.doc());

    app.activate(b);
    app.doc().edit("rotate-pages", |d| d.rotate_pages(&[0], 90)).expect("edit b");
    app.book.close(&mut app.doc, &mut app.path, b).expect("close b");
    assert!(app.doc.is_none(), "closing the document on screen empties the slot");

    app.activate(a);
    assert_eq!(bytes(app.doc()), a_edited, "A is as it was");
    let h = app.doc().history_state();
    assert!(h.can_undo && h.modified);
    assert!(app.doc().undo().expect("undo a"), "A's undo still works after B closed");
    assert!(
        matches!(app.book.activate(&mut app.doc, &mut app.path, b), Err(SessionError::NotFound(id)) if id == b),
        "a closed document cannot be switched back to"
    );
}

#[test]
fn the_same_file_opened_twice_gives_two_independent_documents() {
    let mut app = Slot::new();
    let first = app.open(TWO);
    let second = app.open(TWO);
    assert_ne!(first, second);
    app.doc().edit("rotate-pages", |d| d.rotate_pages(&[0], 90)).expect("edit the second");
    app.activate(first);
    assert!(!app.doc().modified, "an edit in one copy is not an edit in the other");
    assert!(!app.doc().history_state().can_undo);
    assert_eq!(app.doc().document_info().page_count, 2);
}
