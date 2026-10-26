// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary. The PDFluent application is free to use,
// including for commercial purposes. Redistribution, or extraction or reuse
// of its components (including the embedded PDF engine), requires a licence.
// See https://pdfluent.com/license for terms.

//! J-73 (insert), J-74 (merge, split, extract), J-75 (compress), J-76
//! (encrypt, decrypt), J-77 (watermark), J-78 (document properties).
//!
//! Until now these operations were covered by tests that searched the source
//! for a function name. Each test here performs the operation the way the
//! Tauri command does and then opens the file it produced, reading the pages
//! back by their text, so a wrong page order, a missing page, a watermark that
//! is not in the file or a password that does not hold makes it fail.
//!
//! Runs in the `cargo-test` job on Linux, macOS and Windows.

use lopdf::{dictionary, Document, Object, Stream};
use pdfluent_lib::document_ops::{merge_pdfs, split_into_pages, split_pdf};
use pdfluent_lib::OpenDocument;
use std::fs;
use std::path::{Path, PathBuf};

const THREE: &str = "tests/golden/fixture-sample-text-3p.pdf";
const TWO: &str = "tests/fixtures/two_pages.pdf";

fn manifest(rel: &str) -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR")).join(rel)
}

fn s(p: &Path) -> &str {
    p.to_str().expect("utf-8 path")
}

fn scratch_dir(name: &str) -> PathBuf {
    let dir = std::env::temp_dir()
        .join(format!("pdfluent-docops-{}", std::process::id()))
        .join(name);
    fs::create_dir_all(&dir).expect("scratch dir");
    dir
}

fn scratch(name: &str) -> PathBuf {
    scratch_dir("files").join(name)
}

fn open(path: &Path) -> OpenDocument {
    OpenDocument::open(s(path)).unwrap_or_else(|e| panic!("open {}: {e}", path.display()))
}

fn page_texts(doc: &OpenDocument) -> Vec<String> {
    (0..doc.document_info().page_count)
        .map(|i| doc.extract_page_text(i).expect("text").trim().to_string())
        .collect()
}

fn texts_of(path: &Path) -> Vec<String> {
    page_texts(&open(path))
}

/// The pages of the three-page fixture and of the two-page fixture, by text.
fn three() -> Vec<String> {
    let t = texts_of(&manifest(THREE));
    assert_eq!(t.len(), 3);
    assert!(t[0] != t[1] && t[1] != t[2] && t[0] != t[2], "the fixture's pages are distinguishable");
    t
}

fn two() -> Vec<String> {
    let t = texts_of(&manifest(TWO));
    assert_eq!(t.len(), 2);
    assert!(t[0] != t[1]);
    for page in &t {
        assert!(!three().contains(page), "the two fixtures' pages are told apart");
    }
    t
}

// ── J-73: insert pages from another file ─────────────────────────────

#[test]
fn insert_puts_the_other_files_pages_at_the_position_and_the_save_keeps_them() {
    let (a, b) = (three(), two());
    let mut doc = open(&manifest(THREE));
    doc.insert_pdf_at(s(&manifest(TWO)), 1).expect("insert");
    let expected = vec![a[0].clone(), b[0].clone(), b[1].clone(), a[1].clone(), a[2].clone()];
    assert_eq!(page_texts(&doc), expected, "the open document shows the inserted pages");

    let out = scratch("inserted.pdf");
    doc.save_to(s(&out)).expect("save");
    assert_eq!(texts_of(&out), expected, "the saved file keeps them");
}

#[test]
fn insert_at_the_start_and_append_at_the_end() {
    let (a, b) = (three(), two());
    let mut doc = open(&manifest(THREE));
    doc.insert_pdf_at(s(&manifest(TWO)), 0).expect("insert at 0");
    doc.append_pdf(s(&manifest(TWO))).expect("append");
    let expected = vec![
        b[0].clone(),
        b[1].clone(),
        a[0].clone(),
        a[1].clone(),
        a[2].clone(),
        b[0].clone(),
        b[1].clone(),
    ];
    assert_eq!(page_texts(&doc), expected);
    let out = scratch("appended.pdf");
    doc.save_to(s(&out)).expect("save");
    assert_eq!(texts_of(&out), expected);
}

#[test]
fn insert_from_a_file_that_is_not_a_pdf_changes_nothing() {
    let junk = scratch("not-a-pdf.pdf");
    fs::write(&junk, b"this is not a PDF").expect("write");
    let mut doc = open(&manifest(THREE));
    assert!(doc.insert_pdf_at(s(&junk), 1).is_err());
    assert_eq!(page_texts(&doc), three(), "a failed insert loses and adds no page");
}

// ── J-74: merge, split, extract ──────────────────────────────────────

#[test]
fn merge_writes_every_page_of_every_file_in_the_order_given() {
    let (a, b) = (three(), two());
    let out = scratch("merged.pdf");
    merge_pdfs(&[s(&manifest(TWO)).to_string(), s(&manifest(THREE)).to_string()], s(&out))
        .expect("merge");
    let mut expected = b.clone();
    expected.extend(a.iter().cloned());
    assert_eq!(texts_of(&out), expected);
}

#[test]
fn split_into_pages_writes_one_file_per_page_in_order() {
    let a = three();
    let doc = open(&manifest(THREE));
    let dir = scratch_dir("split-pages");
    let files = split_into_pages(&doc.lopdf_doc, s(&dir)).expect("split");
    assert_eq!(files.len(), 3);
    for (i, file) in files.iter().enumerate() {
        assert_eq!(texts_of(Path::new(file)), vec![a[i].clone()], "file {file}");
    }
}

#[test]
fn split_by_ranges_writes_each_range_with_its_own_pages() {
    let a = three();
    let doc = open(&manifest(THREE));
    let dir = scratch_dir("split-ranges");
    let files = split_pdf(&doc.lopdf_doc, &["1-2".to_string(), "3".to_string()], s(&dir))
        .expect("split");
    assert_eq!(files.len(), 2);
    assert_eq!(texts_of(Path::new(&files[0])), vec![a[0].clone(), a[1].clone()]);
    assert_eq!(texts_of(Path::new(&files[1])), vec![a[2].clone()]);

    let bad = split_pdf(&doc.lopdf_doc, &["2-9".to_string()], s(&dir));
    assert!(bad.is_err(), "a range past the last page is refused");
}

#[test]
fn extract_writes_the_chosen_pages_and_leaves_the_open_document_alone() {
    let a = three();
    let doc = open(&manifest(THREE));
    let out = scratch("extracted.pdf");
    doc.extract_pages_to_file(&[0, 2], s(&out)).expect("extract");
    assert_eq!(texts_of(&out), vec![a[0].clone(), a[2].clone()]);
    assert_eq!(page_texts(&doc), a, "the open document is unchanged");
    assert!(doc.extract_pages_to_file(&[], s(&scratch("none.pdf"))).is_err());
}

// ── J-75: compress ───────────────────────────────────────────────────

/// Three pages, each with its own copy of the same font and an uncompressed
/// content stream padded with no-op operators: a file with room to shrink.
fn bloated_fixture() -> PathBuf {
    let mut doc = Document::with_version("1.7");
    let pages_id = doc.new_object_id();
    let mut kids = Vec::new();
    for page in 0..3 {
        let font_id = doc.add_object(Object::Dictionary(dictionary! {
            "Type" => "Font",
            "Subtype" => "Type1",
            "BaseFont" => "Helvetica",
        }));
        let mut content = format!("BT /F1 12 Tf 72 720 Td (Bloated page {page}) Tj ET\n");
        content.push_str(&"q Q\n".repeat(4000));
        let content_id = doc.add_object(Stream::new(dictionary! {}, content.into_bytes()));
        let page_id = doc.add_object(Object::Dictionary(dictionary! {
            "Type" => "Page",
            "Parent" => Object::Reference(pages_id),
            "Contents" => Object::Reference(content_id),
            "Resources" => dictionary! { "Font" => dictionary! { "F1" => Object::Reference(font_id) } },
            "MediaBox" => vec![0.into(), 0.into(), 612.into(), 792.into()],
        }));
        kids.push(Object::Reference(page_id));
    }
    doc.objects.insert(
        pages_id,
        Object::Dictionary(dictionary! { "Type" => "Pages", "Kids" => kids, "Count" => 3 }),
    );
    let catalog_id = doc.add_object(Object::Dictionary(dictionary! {
        "Type" => "Catalog",
        "Pages" => Object::Reference(pages_id),
    }));
    doc.trailer.set("Root", Object::Reference(catalog_id));
    let path = scratch("bloated.pdf");
    doc.save(&path).expect("write bloated fixture");
    path
}

#[test]
fn compress_writes_a_smaller_file_with_the_same_pages() {
    let input = bloated_fixture();
    let before = texts_of(&input);
    assert_eq!(before.len(), 3);
    let in_size = fs::metadata(&input).unwrap().len();

    let mut doc = open(&input);
    let out = scratch("compressed.pdf");
    doc.compress(s(&out)).expect("compress");

    let out_size = fs::metadata(&out).unwrap().len();
    assert!(out_size < in_size, "compressed {out_size} bytes is not smaller than {in_size}");
    assert_eq!(texts_of(&out), before, "the compressed file has the same pages and text");

    // The open document is still sound: it reads and it saves.
    assert_eq!(page_texts(&doc), before);
    let again = scratch("compressed-then-saved.pdf");
    doc.save_to(s(&again)).expect("save after compress");
    assert_eq!(texts_of(&again), before);
}

#[test]
fn compress_to_an_unwritable_place_leaves_the_target_and_the_document_intact() {
    let input = bloated_fixture();
    let before = texts_of(&input);
    let mut doc = open(&input);
    // Serialising is not idempotent (each save adds an xref stream object),
    // so the document is compared by its objects, not by saved bytes.
    let objects_before = doc.lopdf_doc.objects.clone();
    // A directory where the file should go: the write must fail.
    let target = scratch_dir("compress-target-is-a-dir");
    assert!(doc.compress(s(&target)).is_err());
    assert!(target.is_dir(), "the failed write did not replace what was there");
    assert!(
        doc.lopdf_doc.objects == objects_before,
        "a failed compress leaves the open document exactly as it was"
    );
    assert!(!doc.history_state().modified, "and does not mark it changed");
    assert_eq!(page_texts(&doc), before, "the open document is not broken");
    let out = scratch("after-failed-compress.pdf");
    doc.save_to(s(&out)).expect("the document still saves");
    assert_eq!(texts_of(&out), before);
}

// #724: "make a smaller file" writes a copy and leaves the session alone;
// replacing the open document is a separate, undoable choice.
#[test]
fn compress_copy_leaves_the_open_document_and_its_file_untouched() {
    let input = bloated_fixture();
    let before = texts_of(&input);
    let file_before = fs::read(&input).unwrap();
    let doc = open(&input);
    let objects_before = doc.lopdf_doc.objects.clone();

    let out = scratch("compressed-copy.pdf");
    let result = doc.compress_copy(s(&out)).expect("compress a copy");

    assert!(fs::metadata(&out).unwrap().len() < file_before.len() as u64, "the copy is smaller");
    assert_eq!(texts_of(&out), before);
    assert_eq!(result.bytes_after as u64, fs::metadata(&out).unwrap().len());
    assert_eq!(result.bytes_before, file_before.len());
    assert!(doc.lopdf_doc.objects == objects_before, "the open document did not change");
    assert!(!doc.history_state().modified, "and is not marked changed");
    assert!(doc.history_state().undo_label.is_none(), "and gained no undo step");
    assert_eq!(fs::read(&input).unwrap(), file_before, "the file it came from did not change");
}

#[test]
fn compress_in_place_is_one_undo_step_back_to_the_uncompressed_document() {
    let input = bloated_fixture();
    let mut doc = open(&input);
    let objects_before = doc.lopdf_doc.objects.clone();
    let out = scratch("compressed-in-place.pdf");

    doc.edit("compress", |d| d.compress(s(&out))).expect("compress in place");
    assert!(doc.lopdf_doc.objects != objects_before, "the open document took the compressed version");
    assert_eq!(doc.history_state().undo_label.as_deref(), Some("compress"));

    assert!(doc.undo().expect("undo"));
    assert!(doc.lopdf_doc.objects == objects_before, "undo restores the uncompressed document");
}

// ── J-76: encrypt and decrypt ────────────────────────────────────────

const USER: &str = "user-secret";
const OWNER: &str = "owner-secret";

#[test]
fn encrypt_writes_an_aes_256_copy_that_needs_its_password() {
    let a = three();
    let mut doc = open(&manifest(THREE));
    let out = scratch("encrypted.pdf");
    doc.encrypt(USER, OWNER, s(&out)).expect("encrypt");

    let err = OpenDocument::open(s(&out)).err().expect("no password must not open");
    assert!(err.starts_with("password-required"), "{err}");
    let opened = OpenDocument::open_with_password(s(&out), Some(USER)).expect("user password");
    assert_eq!(page_texts(&opened), a, "the content is intact");

    // lopdf decrypts on load, so the /Encrypt dictionary is read from the
    // bytes; the spec keeps it out of object streams, so it is plain there.
    let bytes = fs::read(&out).unwrap();
    let text = String::from_utf8_lossy(&bytes);
    let at = text.find("/Filter /Standard").or_else(|| text.find("/Filter/Standard"));
    assert!(at.is_some(), "the file has a standard security handler");
    let declared = |key: &str, value: &str| {
        text.contains(&format!("/{key} {value}")) || text.contains(&format!("/{key}{value}"))
    };
    assert!(declared("V", "5") && declared("R", "6"), "the file declares AES-256 (/V 5 /R 6)");
}

#[test]
fn decrypt_then_save_writes_a_file_that_opens_without_a_password() {
    let a = three();
    let protected = scratch("to-decrypt.pdf");
    open(&manifest(THREE)).encrypt(USER, OWNER, s(&protected)).expect("encrypt");

    // Opened with the user password only, the owner password is still needed (#726).
    let mut doc = OpenDocument::open_with_password(s(&protected), Some(USER)).expect("user opens");
    assert!(doc.decrypt("wrong").is_err(), "a wrong password removes nothing");
    doc.decrypt(OWNER).expect("decrypt");
    let out = scratch("decrypted.pdf");
    doc.save_to(s(&out)).expect("save");
    let reopened = OpenDocument::open(s(&out)).expect("opens without a password");
    assert!(!reopened.access.encrypted);
    assert_eq!(page_texts(&reopened), a);
}

// ── J-77: watermark ──────────────────────────────────────────────────

#[test]
fn the_watermark_is_on_every_page_of_the_saved_file() {
    let mut doc = open(&manifest(THREE));
    doc.add_watermark("CONFIDENTIAL", 0.3).expect("watermark");
    let out = scratch("watermarked.pdf");
    doc.save_to(s(&out)).expect("save");
    let texts = texts_of(&out);
    assert_eq!(texts.len(), 3);
    for (i, t) in texts.iter().enumerate() {
        assert!(t.contains("CONFIDENTIAL"), "page {i} has no watermark: {t:?}");
    }
}

// ── J-78: document properties ────────────────────────────────────────

#[test]
fn title_and_author_survive_save_and_reopen() {
    let mut doc = open(&manifest(THREE));
    doc.set_document_info(Some("Quarterly report".into()), Some("Ada Lovelace".into()))
        .expect("set info");
    let info = doc.document_info();
    assert_eq!(info.title.as_deref(), Some("Quarterly report"));
    assert_eq!(info.author.as_deref(), Some("Ada Lovelace"));

    let out = scratch("properties.pdf");
    doc.save_to(s(&out)).expect("save");
    let info = open(&out).document_info();
    assert_eq!(info.title.as_deref(), Some("Quarterly report"));
    assert_eq!(info.author.as_deref(), Some("Ada Lovelace"));

    // None leaves a field as it is.
    let mut doc = open(&out);
    doc.set_document_info(Some("Second title".into()), None).expect("set title only");
    let out2 = scratch("properties-2.pdf");
    doc.save_to(s(&out2)).expect("save");
    let info = open(&out2).document_info();
    assert_eq!(info.title.as_deref(), Some("Second title"));
    assert_eq!(info.author.as_deref(), Some("Ada Lovelace"));
}

#[test]
fn compressing_a_protected_document_keeps_its_password() {
    let a = three();
    let protected = scratch("compress-protected-in.pdf");
    open(&manifest(THREE)).encrypt(USER, OWNER, s(&protected)).expect("encrypt");
    let mut doc = OpenDocument::open_with_password(s(&protected), Some(USER)).expect("open");
    let out = scratch("compress-protected-out.pdf");
    doc.compress(s(&out)).expect("compress");
    let err = OpenDocument::open(s(&out)).err().expect("the compressed copy must need its password");
    assert!(err.starts_with("password-required"), "{err}");
    let reopened = OpenDocument::open_with_password(s(&out), Some(USER)).expect("reopen");
    assert_eq!(page_texts(&reopened), a);
}

// The document the S5 UI walk opens: the golden sample plus a text box and a placed
// image on page one (scripts/quality/suite/make_ui_walk_doc.py).
#[test]
fn ui_walk_document_carries_a_text_box_and_a_placed_image() {
    let doc = open(&manifest("tests/fixtures/ui-walk-doc.pdf"));
    assert_eq!(doc.page_count(), 3);
    let kinds: Vec<String> = doc.get_page_annotations(0).into_iter().map(|a| a.annotation_type).collect();
    assert!(kinds.iter().any(|k| k == "freetext"), "no text box: {kinds:?}");
    assert!(kinds.iter().any(|k| k == "stamp"), "no placed image: {kinds:?}");
}
