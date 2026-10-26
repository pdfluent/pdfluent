// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary. The PDFluent application is free to use,
// including for commercial purposes. Redistribution, or extraction or reuse
// of its components (including the embedded PDF engine), requires a licence.
// See https://pdfluent.com/license for terms.

//! J-80: Save replaces the document in one step, or not at all.
//!
//! `OpenDocument::save_to` used to let lopdf truncate the file and write into
//! it. The failure-injection half of this lives next to the code
//! (`atomic_file::tests`), because a full disk cannot be produced on demand
//! from out here; what this file pins is the path the app actually calls:
//!
//! * a save over the user's file leaves that one file and nothing beside it;
//! * a save that cannot happen leaves the file as it was and the document
//!   still marked modified, so the unsaved-changes guard keeps protecting it;
//! * a read-only document is refused instead of being swapped out by a rename.
//!
//! Runs in the `cargo-test` job.

use pdfluent_lib::OpenDocument;
use std::fs;
use std::path::{Path, PathBuf};

fn fixture() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("tests/fixtures/two_pages.pdf")
}

fn scratch(name: &str) -> PathBuf {
    let dir = std::env::temp_dir().join(format!("pdfluent-save-atomic-{name}-{}", std::process::id()));
    // A previous run of this test may have left the directory; reuse it rather
    // than delete it, and start from a known file.
    fs::create_dir_all(&dir).expect("scratch dir");
    dir
}

fn names(dir: &Path) -> Vec<String> {
    let mut v: Vec<String> = fs::read_dir(dir)
        .expect("read dir")
        .map(|e| e.expect("entry").file_name().to_string_lossy().into_owned())
        .collect();
    v.sort();
    v
}

fn open_copy(dir: &Path) -> (OpenDocument, PathBuf) {
    let target = dir.join("doc.pdf");
    fs::copy(fixture(), &target).expect("copy fixture");
    let doc = OpenDocument::open(target.to_str().expect("utf-8")).expect("open");
    (doc, target)
}

#[test]
fn saving_over_the_document_replaces_it_and_leaves_nothing_beside_it() {
    let dir = scratch("over");
    let (mut doc, target) = open_copy(&dir);
    doc.delete_pages(&[1]).expect("delete the second page");
    assert!(doc.modified);

    doc.save_to(target.to_str().unwrap()).expect("save");

    assert!(!doc.modified, "a completed save marks the document clean");
    assert_eq!(names(&dir), vec!["doc.pdf".to_string()], "no temporary file may survive a save");
    let on_disk = fs::read(&target).unwrap();
    assert_eq!(on_disk, doc.raw_bytes, "what is on disk is what the document holds");
    let reopened = OpenDocument::open(target.to_str().unwrap()).expect("reopen");
    assert_eq!(reopened.page_count(), 1, "the edit is in the saved file");
}

#[test]
fn a_save_that_cannot_happen_leaves_the_original_and_keeps_the_document_dirty() {
    let dir = scratch("fails");
    let (mut doc, target) = open_copy(&dir);
    let before = fs::read(&target).unwrap();
    doc.rotate_page_right(0).expect("rotate");

    let missing = dir.join("gone").join("doc.pdf");
    let err = doc.save_to(missing.to_str().unwrap()).expect_err("no such folder");
    assert!(err.starts_with("Failed to save PDF"), "{err}");

    assert!(doc.modified, "a failed save must not mark the document clean");
    assert_eq!(fs::read(&target).unwrap(), before);
    assert_eq!(names(&dir), vec!["doc.pdf".to_string()]);
}

#[test]
fn a_read_only_document_is_refused_not_replaced() {
    let dir = scratch("readonly");
    let (mut doc, target) = open_copy(&dir);
    let before = fs::read(&target).unwrap();
    let mut perms = fs::metadata(&target).unwrap().permissions();
    perms.set_readonly(true);
    fs::set_permissions(&target, perms).unwrap();
    doc.rotate_page_right(0).expect("rotate");

    let result = doc.save_to(target.to_str().unwrap());

    // Make the copy writable again so the next run can overwrite it.
    let mut perms = fs::metadata(&target).unwrap().permissions();
    #[allow(clippy::permissions_set_readonly_false)]
    perms.set_readonly(false);
    fs::set_permissions(&target, perms).unwrap();

    let err = result.expect_err("a read-only file must not be swapped out");
    assert!(err.contains("read-only"), "{err}");
    assert!(doc.modified);
    assert_eq!(fs::read(&target).unwrap(), before);
}

/// The observable difference between "write into the file" and "write a new
/// file and rename it": a second hard link to the old file. A rename moves the
/// name to new data and leaves the old data, still reachable through the link,
/// untouched; a truncate-and-write changes what both names see. If the old
/// data is never written to, a write that fails halfway cannot damage it —
/// which is the property this whole change exists for.
#[test]
fn the_save_writes_a_new_file_instead_of_rewriting_the_old_one() {
    let dir = scratch("hardlink");
    let (mut doc, target) = open_copy(&dir);
    let before = fs::read(&target).unwrap();
    let link = dir.join("doc-link.pdf");
    if link.exists() {
        // Left by an earlier run; a stale link would point at stale data.
        fs::rename(&link, dir.join(format!("doc-link-old-{}.pdf", std::process::id()))).unwrap();
    }
    fs::hard_link(&target, &link).expect("hard link");
    doc.delete_pages(&[1]).expect("edit");

    doc.save_to(target.to_str().unwrap()).expect("save");

    assert_ne!(fs::read(&target).unwrap(), before, "the save landed");
    assert_eq!(
        fs::read(&link).unwrap(),
        before,
        "the previous version's bytes were written over in place: a failure \
         halfway through that write would have destroyed the user's document"
    );
}
