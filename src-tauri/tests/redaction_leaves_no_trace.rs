// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary. The PDFluent application is free to use,
// including for commercial purposes. Redistribution, or extraction or reuse
// of its components (including the embedded PDF engine), requires a licence.
// See https://pdfluent.com/license for terms.

//! J-65: a redaction removes the text from the saved file, everywhere.
//!
//! "Redact text so it is actually removed" is on the site and in both stores,
//! and until 1.0.1 nothing proved it: the engine's redactor has its own tests,
//! but nothing looked at the file the editor writes. That file is where a
//! redaction leaks, and in more places than the page:
//!
//! * the content stream the redactor replaced, which lopdf keeps as an object
//!   and writes out unless it is pruned;
//! * an earlier revision, if the save appends instead of rewriting;
//! * annotation `/Contents`, the `/Info` dictionary and the XMP packet;
//! * the `/ToUnicode` CMap of the fonts on the page, which the engine replaces
//!   with a stub — and whose original is again an object nobody refers to;
//! * an XFA packet, which carries its own copy of every caption and value.
//!
//! So the check is on the saved bytes: every object, every string, every
//! stream decompressed, the raw file, and text extraction from a fresh open —
//! for the redacted word as ASCII, as UTF-16BE and as hex. And on the rest of
//! the page, which must survive: a redaction that deletes everything would
//! pass every other assertion here.
//!
//! Runs in the `cargo-test` job.

use pdfluent_lib::OpenDocument;
use std::fs;
use std::path::{Path, PathBuf};

fn manifest(rel: &str) -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR")).join(rel)
}

fn scratch(name: &str) -> PathBuf {
    let dir = std::env::temp_dir().join(format!("pdfluent-redact-{}", std::process::id()));
    fs::create_dir_all(&dir).expect("scratch dir");
    dir.join(name)
}

fn s(p: &Path) -> &str {
    p.to_str().expect("utf-8 path")
}

/// The forms the word can take inside a PDF without a font-specific encoding.
fn needles(word: &str) -> Vec<(String, Vec<u8>)> {
    let utf16: Vec<u8> = word.encode_utf16().flat_map(|u| u.to_be_bytes()).collect();
    let hex_upper: String = word.bytes().map(|b| format!("{b:02X}")).collect();
    let hex_lower = hex_upper.to_lowercase();
    vec![
        ("ascii".into(), word.as_bytes().to_vec()),
        ("utf-16be".into(), utf16),
        ("hex".into(), hex_upper.into_bytes()),
        ("hex-lower".into(), hex_lower.into_bytes()),
    ]
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
            out.push(
                stream
                    .decompressed_content()
                    .unwrap_or_else(|_| stream.content.clone()),
            );
        }
        _ => {}
    }
}

/// Every place in the saved file where `word` still appears, named.
fn traces(path: &Path, word: &str) -> Vec<String> {
    let bytes = fs::read(path).expect("read saved file");
    let mut found = Vec::new();
    for (form, needle) in needles(word) {
        if contains(&bytes, &needle) {
            found.push(format!("raw file bytes ({form})"));
        }
    }
    let doc = lopdf::Document::load_mem(&bytes).expect("the saved file parses");
    for (id, obj) in &doc.objects {
        let mut strings = Vec::new();
        collect_strings(obj, &mut strings);
        for (form, needle) in needles(word) {
            if strings.iter().any(|s| contains(s, &needle)) {
                found.push(format!("object {} {} ({form})", id.0, id.1));
            }
        }
    }
    let reopened = OpenDocument::open(s(path)).expect("reopen");
    for page in 0..reopened.page_count() as u32 {
        let text = reopened.extract_page_text(page).expect("text");
        if text.to_lowercase().contains(&word.to_lowercase()) {
            found.push(format!("extracted text of page {}", page + 1));
        }
    }
    found
}

/// A full rewrite has one cross-reference section and no `/Prev`: no earlier
/// revision for the redacted text to survive in.
fn assert_single_revision(path: &Path) {
    let bytes = fs::read(path).unwrap();
    let eofs = bytes.windows(5).filter(|w| w == b"%%EOF").count();
    assert_eq!(eofs, 1, "{}: the saved file has {eofs} revisions", path.display());
    let doc = lopdf::Document::load_mem(&bytes).unwrap();
    assert!(doc.trailer.get(b"Prev").is_err(), "{}: the trailer points at an earlier revision", path.display());
}

fn copy_of(rel: &str, name: &str) -> PathBuf {
    let path = scratch(name);
    fs::copy(manifest(rel), &path).expect("copy fixture");
    path
}

fn page_text(doc: &OpenDocument) -> String {
    (0..doc.page_count() as u32)
        .map(|p| doc.extract_page_text(p).expect("text"))
        .collect::<Vec<_>>()
        .join("\n")
}

/// Search redaction: every occurrence, across pages, and nothing else.
fn search_redaction_case(rel: &str, word: &str, survivor: &str) {
    let path = copy_of(rel, &format!("search-{word}.pdf"));
    let mut doc = OpenDocument::open(s(&path)).expect("open");
    let before = page_text(&doc);
    assert!(before.contains(word), "{rel}: the fixture must contain {word:?}, or this proves nothing");
    assert!(before.contains(survivor), "{rel}: the fixture must contain {survivor:?}");

    let report = doc.redact_search(word).expect("redact_search");
    assert!(report.matches_found > 0, "{rel}: the search found nothing to redact");
    let out = scratch(&format!("search-{word}-saved.pdf"));
    doc.save_to(s(&out)).expect("save");

    let left = traces(&out, word);
    assert!(left.is_empty(), "{rel}: {word:?} survives the redaction in: {left:#?}");
    assert_single_revision(&out);
    let after = page_text(&OpenDocument::open(s(&out)).expect("reopen"));
    assert!(
        after.contains(survivor),
        "{rel}: the redaction took {survivor:?} with it, so it removed more than it was asked to"
    );
}

#[test]
fn search_redaction_leaves_no_trace_in_the_text_fixture() {
    search_redaction_case("tests/golden/fixture-sample-text-3p.pdf", "Lorem", "checkpoint");
}

#[test]
fn search_redaction_leaves_no_trace_in_the_two_page_fixture() {
    search_redaction_case("tests/fixtures/two_pages.pdf", "operation", "Hello");
}

/// Area redaction, the drawn box: either the text under it is gone from the
/// saved file, or the redaction is refused and the document left as it was.
/// What may never happen is the third outcome, which is what the pinned
/// engine does on this page: a black box drawn, nothing removed, success
/// reported. Its area filter positions text without the page's `cm`, and this
/// fixture draws its text under `1 0 0 1 16.6 0 cm`.
#[test]
fn area_redaction_removes_the_text_under_the_box_or_refuses() {
    let path = copy_of("tests/fixtures/two_pages.pdf", "area.pdf");
    let mut doc = OpenDocument::open(s(&path)).expect("open");
    let spans = doc.extract_page_text_spans(0).expect("spans");
    let span = spans
        .iter()
        .find(|sp| sp.text.contains("operation"))
        .expect("a span with the word")
        .clone();
    // The whole span: the box a user draws over a line.
    let rect = [
        span.x as f32 - 1.0,
        span.y as f32 - 3.0,
        (span.x + span.width) as f32 + 1.0,
        (span.y + span.height) as f32 + 1.0,
    ];
    let text_before = page_text(&doc);
    match doc.redact_text(0, &[rect]) {
        Ok(_) => {
            let out = scratch("area-saved.pdf");
            doc.save_to(s(&out)).expect("save");
            let left = traces(&out, "operation");
            assert!(left.is_empty(), "reported redacted, but the text survives in: {left:#?}");
            assert_single_revision(&out);
            let after = page_text(&OpenDocument::open(s(&out)).expect("reopen"));
            assert!(after.contains("second page"), "page two must be untouched: {after:?}");
        }
        Err(e) => {
            assert!(e.starts_with("redaction-incomplete"), "{e}");
            assert!(!doc.modified, "a refused redaction must leave the document unmodified");
            assert_eq!(page_text(&doc), text_before, "a refused redaction must change nothing");
        }
    }
}

/// Where the engine's area filter does work — text placed by its own text
/// matrix, no `cm` — the box removes the line under it and nothing else.
#[test]
fn area_redaction_on_a_plain_page_removes_exactly_the_line_under_the_box() {
    let path = copy_of("tests/golden/fixture-sample-text-3p.pdf", "area-plain.pdf");
    let mut doc = OpenDocument::open(s(&path)).expect("open");
    let spans = doc.extract_page_text_spans(0).expect("spans");
    let span = spans
        .iter()
        .find(|sp| sp.text.contains("appears"))
        .expect("the second line")
        .clone();
    let rect = [
        span.x as f32 - 1.0,
        span.y as f32 - 2.0,
        (span.x + span.width) as f32 + 1.0,
        (span.y + span.height) as f32,
    ];
    doc.redact_text(0, &[rect]).expect("this page redacts");
    let out = scratch("area-plain-saved.pdf");
    doc.save_to(s(&out)).expect("save");
    let left = traces(&out, "appears");
    assert!(left.is_empty(), "the line under the box survives in: {left:#?}");
    assert_single_revision(&out);
    let after = page_text(&OpenDocument::open(s(&out)).expect("reopen"));
    assert!(after.contains("visual E2E page one"), "the line above the box must stay: {after:?}");
}

/// A Redact annotation applied later goes through the same check.
#[test]
fn applying_redaction_marks_never_reports_success_while_the_text_survives() {
    for (rel, word) in [
        ("tests/fixtures/two_pages.pdf", "operation"),
        ("tests/golden/fixture-sample-text-3p.pdf", "appears"),
    ] {
        let path = copy_of(rel, &format!("marks-{word}.pdf"));
        let mut doc = OpenDocument::open(s(&path)).expect("open");
        let span = doc
            .extract_page_text_spans(0)
            .expect("spans")
            .into_iter()
            .find(|sp| sp.text.contains(word))
            .expect("span");
        doc.add_redaction_annotation(
            0,
            [
                span.x as f32 - 1.0,
                span.y as f32 - 2.0,
                (span.x + span.width) as f32 + 1.0,
                (span.y + span.height) as f32,
            ],
        )
        .expect("mark");
        match doc.apply_redactions() {
            Ok(_) => {
                let out = scratch(&format!("marks-{word}-saved.pdf"));
                doc.save_to(s(&out)).expect("save");
                let left = traces(&out, word);
                assert!(left.is_empty(), "{rel}: applied, but {word:?} survives in: {left:#?}");
            }
            Err(e) => assert!(e.starts_with("redaction-incomplete"), "{rel}: {e}"),
        }
    }
}

/// The text a user annotated, and wrote into the note, goes too.
#[test]
fn a_note_on_the_redacted_text_does_not_keep_it() {
    let path = copy_of("tests/fixtures/two_pages.pdf", "note.pdf");
    let mut doc = OpenDocument::open(s(&path)).expect("open");
    let spans = doc.extract_page_text_spans(0).expect("spans");
    let span = spans.iter().find(|sp| sp.text.contains("operation")).expect("span").clone();
    doc.add_comment_annotation(0, span.x as f32, span.y as f32, "see operation here")
        .expect("note");
    doc.redact_search("operation").expect("redact");
    let out = scratch("note-saved.pdf");
    doc.save_to(s(&out)).expect("save");
    let left = traces(&out, "operation");
    assert!(left.is_empty(), "the note keeps the redacted word: {left:#?}");
}

/// Metadata that names the redacted term goes with it.
#[test]
fn metadata_naming_the_redacted_word_does_not_keep_it() {
    let path = copy_of("tests/golden/fixture-sample-text-3p.pdf", "meta.pdf");
    let mut doc = OpenDocument::open(s(&path)).expect("open");
    doc.set_document_info(Some("Lorem report".into()), Some("Lorem Author".into()))
        .expect("metadata");
    doc.redact_search("Lorem").expect("redact");
    let out = scratch("meta-saved.pdf");
    doc.save_to(s(&out)).expect("save");
    let left = traces(&out, "Lorem");
    assert!(left.is_empty(), "the metadata keeps the redacted word: {left:#?}");
}

/// An XFA form keeps a second copy of its text in the XFA packet, out of reach
/// of a page redaction. Redacting the page and leaving the packet would ship
/// the text; the redaction is refused until the form is flattened.
#[test]
fn an_xfa_form_is_not_redacted_behind_its_xfa_packet() {
    let path = copy_of("tests/golden/xfa-13a7b224_xfa_issue14315.pdf", "xfa.pdf");
    let mut doc = OpenDocument::open(s(&path)).expect("open");
    let err = doc.redact_search("document").expect_err("redaction of an XFA form must be refused");
    assert!(err.starts_with("xfa-redaction-needs-flatten"), "{err}");
    let err = doc
        .redact_text(0, &[[0.0, 0.0, 612.0, 792.0]])
        .expect_err("area redaction of an XFA form must be refused");
    assert!(err.starts_with("xfa-redaction-needs-flatten"), "{err}");
    assert!(!doc.modified, "a refused redaction must not touch the document");
}

/// A one-page PDF whose page draws `form` through a Form XObject, built here so
/// the test owns its fixture.
fn pdf_with_form(page_content: &str, form_content: &str) -> Vec<u8> {
    let objs = [
        "<< /Type /Catalog /Pages 2 0 R >>".to_string(),
        "<< /Type /Pages /Kids [3 0 R] /Count 1 >>".to_string(),
        "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R \
         /Resources << /Font << /F1 5 0 R >> /XObject << /Fm1 6 0 R >> >> >>"
            .to_string(),
        format!("<< /Length {} >>\nstream\n{}\nendstream", page_content.len(), page_content),
        "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>".to_string(),
        format!(
            "<< /Type /XObject /Subtype /Form /BBox [0 0 612 792] \
             /Resources << /Font << /F1 5 0 R >> >> /Length {} >>\nstream\n{}\nendstream",
            form_content.len(),
            form_content
        ),
    ];
    let mut out = b"%PDF-1.4\n".to_vec();
    let mut offsets = Vec::new();
    for (i, o) in objs.iter().enumerate() {
        offsets.push(out.len());
        out.extend(format!("{} 0 obj\n{}\nendobj\n", i + 1, o).bytes());
    }
    let xref = out.len();
    out.extend(format!("xref\n0 {}\n0000000000 65535 f \n", objs.len() + 1).bytes());
    for o in offsets {
        out.extend(format!("{o:010} 00000 n \n").bytes());
    }
    out.extend(
        format!("trailer\n<< /Size {} /Root 1 0 R >>\nstartxref\n{}\n%%EOF\n", objs.len() + 1, xref)
            .bytes(),
    );
    out
}

/// The search redaction finds text in the page's own content. Text drawn
/// through a Form XObject is extracted but not found, so the engine reports
/// no match and leaves it. The redaction must then refuse and change nothing,
/// never report success while the term is still in the page text.
#[test]
fn search_redaction_refuses_when_the_term_survives_in_a_form_xobject() {
    let path = scratch("form-xobject.pdf");
    fs::write(
        &path,
        pdf_with_form("/Fm1 Do", "BT /F1 12 Tf 72 700 Td (Confidential memo) Tj ET"),
    )
    .expect("write fixture");
    let mut doc = OpenDocument::open(s(&path)).expect("open");
    let before = page_text(&doc);
    assert!(before.contains("Confidential"), "the fixture must show the term: {before:?}");
    assert!(!doc.modified);

    let err = doc.redact_search("Confidential").expect_err("the term survives, so it must refuse");
    assert!(err.starts_with("redaction-incomplete"), "{err}");
    assert!(!doc.modified, "a refused redaction must leave the document unmodified");
    assert_eq!(page_text(&doc), before, "a refused redaction must change nothing");
}

/// The same check must not refuse a redaction that worked.
#[test]
fn search_redaction_still_succeeds_when_the_term_is_split_across_operators() {
    let path = scratch("split-operators.pdf");
    fs::write(
        &path,
        pdf_with_form("BT /F1 12 Tf 72 700 Td [(Conf) -10 (idential)] TJ ET", ""),
    )
    .expect("write fixture");
    let mut doc = OpenDocument::open(s(&path)).expect("open");
    let report = doc.redact_search("Confidential").expect("this one is removable");
    assert!(report.matches_found > 0);
    assert!(!page_text(&doc).contains("Confidential"));
}
