// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary. The PDFluent application is free to use,
// including for commercial purposes. Redistribution, or extraction or reuse
// of its components (including the embedded PDF engine), requires a licence.
// See https://pdfluent.com/license for terms.

//! J-43 (typeface): an edited line written in a font installed on this
//! computer is in the saved file as an embedded subset with a `/ToUnicode`, and
//! extracts as exactly the text that was typed. A face whose licence forbids
//! embedding is refused with the typed error and changes nothing.
//!
//! Drives the same `OpenDocument` methods the `list_system_fonts` and
//! `set_text_run_font` commands call. Runs in `cargo test` on macOS and
//! Windows (quality:macos, quality:windows) and on the Linux cargo-test job.

use lopdf::{Document, Object};
use pdfluent_lib::system_fonts::{list_system_fonts, FontRefusal, EmbeddingRefusal, SystemFontFace};
use pdfluent_lib::OpenDocument;
use std::fs;
use std::path::PathBuf;

const TEXT: &str = "tests/golden/fixture-sample-text-3p.pdf";
const HEADING: &str = "Lorem ipsum visual E2E page one";
const OTHER: &str = "Search target Lorem appears on this page.";
const EDITED: &str = "Edited heading, now in another typeface";

/// Faces that ship on both release platforms and permit embedding, in order of
/// preference. If none is present the first embeddable face found is used.
const PREFERRED: &[&str] = &["ArialMT", "Arial-BoldMT", "Georgia", "Verdana", "TimesNewRomanPSMT"];

fn manifest(rel: &str) -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR")).join(rel)
}

fn scratch(name: &str) -> PathBuf {
    let dir = std::env::temp_dir().join(format!("pdfluent-textfont-{}", std::process::id()));
    fs::create_dir_all(&dir).expect("scratch dir");
    dir.join(name)
}

fn release_platform() -> bool {
    cfg!(any(target_os = "macos", target_os = "windows"))
}

/// The face the test writes in, chosen deterministically.
fn pick_face() -> Option<&'static SystemFontFace> {
    let faces: Vec<&SystemFontFace> = list_system_fonts().iter().flat_map(|f| f.faces.iter()).collect();
    PREFERRED
        .iter()
        .find_map(|id| faces.iter().copied().find(|f| f.id == *id && f.embeddable))
        .or_else(|| {
            faces.iter().copied().find(|f| {
                f.embeddable
                    && fs::read(&f.path)
                        .ok()
                        .and_then(|d| pdfluent_lib::system_fonts::load_face_from_bytes(&d, f.index, &f.family).ok())
                        .and_then(|l| pdf_manip::unicode_font::UnicodeFont::from_bytes(l.program).ok())
                        .is_some_and(|u| u.covers(EDITED))
            })
        })
}

fn deref<'a>(doc: &'a Document, obj: &'a Object) -> &'a Object {
    match obj {
        Object::Reference(id) => doc.get_object(*id).expect("dangling reference"),
        other => other,
    }
}

#[test]
fn installed_fonts_are_listed_with_an_embedding_verdict() {
    let families = list_system_fonts();
    let faces = families.iter().map(|f| f.faces.len()).sum::<usize>();
    let embeddable = families.iter().flat_map(|f| f.faces.iter()).filter(|f| f.embeddable).count();
    eprintln!("system fonts: {} families, {faces} faces, {embeddable} embeddable", families.len());
    if !release_platform() && embeddable == 0 {
        eprintln!("SKIPPED (not a pass): no embeddable font installed on this non-release platform");
        return;
    }
    assert!(embeddable > 0, "a macOS or Windows machine has fonts that permit embedding");
    for face in families.iter().flat_map(|f| f.faces.iter()) {
        assert_eq!(face.embeddable, face.refusal.is_none(), "{face:?}");
    }
}

#[test]
fn a_line_written_in_a_system_font_is_embedded_subset_and_extracts() {
    let Some(face) = pick_face() else {
        if release_platform() {
            panic!("no embeddable system font that covers the test text was found");
        }
        eprintln!("SKIPPED (not a pass): no embeddable font installed on this non-release platform");
        return;
    };
    eprintln!("typeface under test: {} ({}) from {}", face.id, face.family, face.path.display());
    let source_len = fs::metadata(&face.path).expect("font file").len() as usize;

    let mut doc = OpenDocument::open(manifest(TEXT).to_str().unwrap()).expect("open");
    let r = doc.replace_text_span(0, HEADING, EDITED, None).expect("replace");
    assert!(r.replaced, "{:?}", r.reason);
    let resource = doc
        .set_text_run_font(0, EDITED, &face.id)
        .expect("no engine error")
        .unwrap_or_else(|refusal| panic!("refused: {refusal}"));
    assert!(doc.history_state().modified);

    let out = scratch("font-changed.pdf");
    doc.save_to(out.to_str().unwrap()).expect("save");

    // The app's own open path reads back exactly what was typed.
    let mut reopened = OpenDocument::open(out.to_str().unwrap()).expect("reopen");
    let spans = reopened.extract_page_text_spans(0).expect("spans");
    let edited: Vec<_> = spans.iter().filter(|s| s.text.contains("Edited heading")).collect();
    assert_eq!(edited.len(), 1, "one edited line: {spans:?}");
    assert_eq!(edited[0].text.trim(), EDITED, "the edited text extracts exactly");
    let other = spans.iter().find(|s| s.text.contains("Search target")).expect("the other line");
    assert_eq!(other.text.trim(), OTHER, "the rest of the page is untouched");
    let page_text = reopened.extract_page_text(0).expect("page text");
    assert!(page_text.contains(EDITED), "page text: {page_text}");

    // The page really selects that font for the edited line: the resource is
    // not just registered, a `Tf` in the saved content stream uses it.
    let content = saved_content(&out, 1);
    assert!(
        content.contains(&format!("/{resource} ")) && content.contains(" Tf"),
        "no `Tf` selecting /{resource} in the saved page content: {content}"
    );

    // The font program is in the file, subset, with a ToUnicode map.
    let saved = Document::load(&out).expect("lopdf load");
    let page_id = *saved.get_pages().get(&1).expect("page 1");
    let page = saved.get_dictionary(page_id).expect("page dict");
    let resources = deref(&saved, page.get(b"Resources").expect("resources")).as_dict().expect("dict");
    let fonts = deref(&saved, resources.get(b"Font").expect("fonts")).as_dict().expect("dict");
    let font = deref(&saved, fonts.get(resource.as_bytes()).expect("the chosen font is a page resource"))
        .as_dict()
        .expect("font dict");
    assert_eq!(font.get(b"Subtype").unwrap().as_name().unwrap(), b"Type0");
    let base = String::from_utf8_lossy(font.get(b"BaseFont").unwrap().as_name().unwrap()).to_string();
    let (tag, _) = base.split_once('+').unwrap_or_else(|| panic!("no subset tag on {base}"));
    assert!(tag.len() == 6 && tag.chars().all(|c| c.is_ascii_uppercase()), "subset tag of {base}");
    assert!(font.get(b"ToUnicode").is_ok(), "a ToUnicode map is written");
    let descendants = deref(&saved, font.get(b"DescendantFonts").unwrap()).as_array().unwrap();
    let cid = deref(&saved, &descendants[0]).as_dict().unwrap();
    let descriptor = deref(&saved, cid.get(b"FontDescriptor").unwrap()).as_dict().unwrap();
    let program = descriptor
        .get(b"FontFile2")
        .or_else(|_| descriptor.get(b"FontFile3"))
        .expect("the descriptor references an embedded font program");
    let stream = deref(&saved, program).as_stream().expect("font stream");
    let bytes = stream.decompressed_content().unwrap_or_else(|_| stream.content.clone());
    assert!(!bytes.is_empty(), "the embedded program has bytes");
    assert!(bytes.len() < source_len, "subset: {} bytes embedded from a {source_len}-byte file", bytes.len());
}

#[test]
fn a_font_whose_licence_forbids_embedding_is_refused() {
    let Some(face) = pick_face() else {
        if release_platform() {
            panic!("no embeddable system font was found to derive a restricted copy from");
        }
        eprintln!("SKIPPED (not a pass): no embeddable font installed on this non-release platform");
        return;
    };
    // A real font with its OS/2 fsType set to "restricted licence embedding".
    let program = pdfluent_lib::system_fonts::load_face_from_bytes(
        &fs::read(&face.path).expect("read font"),
        face.index,
        &face.family,
    )
    .expect("loads")
    .program;
    let mut restricted = program.clone();
    set_fs_type(&mut restricted, 0x0002);
    let path = scratch("restricted.ttf");
    fs::write(&path, &restricted).expect("write");

    let mut doc = OpenDocument::open(manifest(TEXT).to_str().unwrap()).expect("open");
    let refused = doc
        .set_text_run_font_from_path(0, HEADING, &path, 0, "Locked Family")
        .expect("no engine error");
    assert_eq!(
        refused,
        Err(FontRefusal::EmbeddingNotPermitted {
            family: "Locked Family".into(),
            reason: EmbeddingRefusal::Restricted
        })
    );
    assert!(!doc.history_state().modified, "a refused font change modifies nothing");

    // The same bytes with the editable bit are accepted: the refusal is the
    // licence bit and nothing else.
    let mut editable = program;
    set_fs_type(&mut editable, 0x0008);
    let path = scratch("editable.ttf");
    fs::write(&path, &editable).expect("write");
    let accepted = doc
        .set_text_run_font_from_path(0, HEADING, &path, 0, "Open Family")
        .expect("no engine error");
    assert!(accepted.is_ok(), "{accepted:?}");
}

#[test]
fn an_unknown_font_id_is_a_typed_refusal() {
    let mut doc = OpenDocument::open(manifest(TEXT).to_str().unwrap()).expect("open");
    let refused = doc.set_text_run_font(0, HEADING, "No-Such-Font-PS-Name").expect("no engine error");
    assert!(matches!(refused, Err(FontRefusal::FontNotFound { .. })), "{refused:?}");
    assert!(!doc.history_state().modified);
}

/// Overwrite `OS/2.fsType` in a single-font sfnt.
fn saved_content(path: &std::path::Path, page: u32) -> String {
    let doc = Document::load(path).expect("lopdf load");
    let id = *doc.get_pages().get(&page).expect("page");
    String::from_utf8_lossy(&doc.get_page_content(id)).to_string()
}

fn set_fs_type(font: &mut [u8], value: u16) {
    let tables = u16::from_be_bytes([font[4], font[5]]) as usize;
    for i in 0..tables {
        let rec = 12 + i * 16;
        if &font[rec..rec + 4] == b"OS/2" {
            let off = u32::from_be_bytes(font[rec + 8..rec + 12].try_into().unwrap()) as usize;
            font[off + 8..off + 10].copy_from_slice(&value.to_be_bytes());
            return;
        }
    }
    panic!("font has no OS/2 table");
}
