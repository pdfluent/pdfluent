// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary. The PDFluent application is free to use,
// including for commercial purposes. Redistribution, or extraction or reuse
// of its components (including the embedded PDF engine), requires a licence.
// See https://pdfluent.com/license for terms.

//! #725: a typed signature is set in an embedded, subset font, and the typed
//! name still extracts from the saved file.
//!
//! The pipeline cases run on a bundled OFL face (Liberation Serif Italic) so
//! they exercise the same embedding path whatever handwriting fonts the
//! manifest lists; `every_bundled_signature_font_embeds` then runs the same
//! check on each font the app actually offers, and fails when there are none
//! (a missing font must not read as a pass).
//!
//! Runs in the `cargo-test` job on Linux, macOS and Windows.

use lopdf::content::Content;
use lopdf::{Dictionary, Document, Object, ObjectId};
use pdf_manip::text_run::FontMap;
use pdfluent_lib::signature_fonts;
use pdfluent_lib::system_fonts::{load_face, LoadedFace};
use pdfluent_lib::OpenDocument;
use std::path::PathBuf;

const TEXT: &str = "tests/golden/fixture-sample-text-3p.pdf";
const NAME: &str = "Jasper de Winter";

fn manifest_dir() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR"))
}

fn fixture() -> OpenDocument {
    OpenDocument::open(manifest_dir().join(TEXT).to_str().expect("utf-8")).expect("open fixture")
}

fn stand_in_face() -> (LoadedFace, usize) {
    let path = manifest_dir().join("resources/fonts/liberation-2.1.5/LiberationSerif-Italic.ttf");
    let size = std::fs::metadata(&path).expect("bundled font").len() as usize;
    (load_face(&path, 0, "Liberation Serif").expect("licence allows embedding"), size)
}

fn save_and_reload(doc: &mut OpenDocument, name: &str) -> Document {
    let dir = std::env::temp_dir().join(format!("pdfluent-sigfont-{}", std::process::id()));
    std::fs::create_dir_all(&dir).expect("scratch");
    let path = dir.join(name);
    doc.save_to(path.to_str().expect("utf-8")).expect("save");
    Document::load(&path).expect("raw reload")
}

fn dict_of(doc: &Document, o: &Object) -> Dictionary {
    match o {
        Object::Reference(id) => doc.get_object(*id).and_then(Object::as_dict).expect("dict").clone(),
        Object::Dictionary(d) => d.clone(),
        other => panic!("not a dictionary: {other:?}"),
    }
}

/// The signature stamp's normal appearance stream id on page 1.
fn signature_appearance(raw: &Document) -> ObjectId {
    let page = *raw.get_pages().get(&1).expect("page 1");
    let page_dict = raw.get_object(page).and_then(Object::as_dict).expect("page");
    let annots = match page_dict.get(b"Annots").expect("/Annots") {
        Object::Reference(id) => raw.get_object(*id).and_then(Object::as_array).expect("array").clone(),
        Object::Array(a) => a.clone(),
        other => panic!("{other:?}"),
    };
    for a in annots {
        let d = dict_of(raw, &a);
        if d.get(b"Name").ok().and_then(|n| n.as_name().ok()) == Some(b"Signature".as_slice()) {
            let ap = dict_of(raw, d.get(b"AP").expect("/AP"));
            return ap.get(b"N").expect("/N").as_reference().expect("ref");
        }
    }
    panic!("no signature stamp on page 1");
}

/// Check a saved typed signature: the name decodes from the appearance, and
/// the font in it is a real embedded subset of a program `full_size` bytes long.
fn assert_embedded_and_extracts(raw: &Document, full_size: usize) {
    let ap_id = signature_appearance(raw);
    let stream = raw.get_object(ap_id).and_then(Object::as_stream).expect("appearance stream");
    let ops = Content::decode(&stream.decompressed_content().expect("decode")).expect("ops").operations;

    // The typed name is shown with the embedded font, not a standard one.
    let tf = ops.iter().position(|o| o.operator == "Tf" && o.operands[0].as_name().ok() == Some(b"SigFont".as_slice()));
    let tf = tf.expect("a Tf with the embedded signature font");
    let tj = ops[tf..].iter().find(|o| o.operator == "Tj").expect("Tj after it");
    let bytes = match &tj.operands[0] {
        Object::String(b, _) => b.clone(),
        other => panic!("{other:?}"),
    };

    // It extracts: ToUnicode maps the codes back to the typed text.
    let map = FontMap::from_xobject_stream(raw, ap_id, &FontMap::empty());
    assert_eq!(map.decode_string("SigFont", &bytes), NAME);

    // The font is embedded, tagged as a subset, and much smaller than the program.
    let res = dict_of(raw, stream.dict.get(b"Resources").expect("/Resources"));
    let fonts = dict_of(raw, res.get(b"Font").expect("/Font"));
    let type0 = dict_of(raw, fonts.get(b"SigFont").expect("SigFont entry"));
    let base = String::from_utf8_lossy(type0.get(b"BaseFont").expect("BaseFont").as_name().expect("name")).into_owned();
    assert!(base.len() > 7 && base.as_bytes()[6] == b'+', "subset tag missing: {base}");
    let cid = dict_of(raw, &type0.get(b"DescendantFonts").expect("descendants").as_array().expect("array")[0]);
    let desc = dict_of(raw, cid.get(b"FontDescriptor").expect("descriptor"));
    let file = desc.get(b"FontFile2").or_else(|_| desc.get(b"FontFile3")).expect("an embedded font program");
    let program = raw.get_object(file.as_reference().expect("ref")).and_then(Object::as_stream).expect("stream");
    let embedded = program.decompressed_content().map(|b| b.len()).unwrap_or(program.content.len());
    assert!(embedded * 3 < full_size, "not a subset: {embedded} of {full_size} bytes");
}

#[test]
fn typed_signature_embeds_a_subset_and_extracts() {
    let (face, size) = stand_in_face();
    let mut doc = fixture();
    doc.add_signature_annotation_with_face(0, [100.0, 100.0, 300.0, 160.0], NAME, "2026-10-18", None, Some(NAME), Some(&face))
        .expect("place");
    let raw = save_and_reload(&mut doc, "typed.pdf");
    assert_embedded_and_extracts(&raw, size);
}

#[test]
fn a_letter_the_font_lacks_is_refused_and_nothing_is_placed() {
    let (face, _) = stand_in_face();
    let mut doc = fixture();
    let before = doc.get_page_annotations(0).len();
    let err = doc
        .add_signature_annotation_with_face(0, [100.0, 100.0, 300.0, 160.0], "Jasper", "2026-10-18", None, Some("日本"), Some(&face))
        .expect_err("no glyphs");
    assert!(err.contains("font-missing-glyphs"), "{err}");
    assert_eq!(doc.get_page_annotations(0).len(), before);
}

#[test]
fn without_a_font_the_typed_signature_is_unchanged() {
    let mut doc = fixture();
    doc.add_signature_annotation(0, [100.0, 100.0, 300.0, 160.0], NAME, "2026-10-18", None, Some(NAME)).expect("place");
    let raw = save_and_reload(&mut doc, "plain.pdf");
    let ap = signature_appearance(&raw);
    let stream = raw.get_object(ap).and_then(Object::as_stream).expect("stream");
    let text = String::from_utf8_lossy(&stream.decompressed_content().expect("decode")).into_owned();
    assert!(!text.contains("SigFont") && text.contains("HelvI"));
}

#[test]
fn every_bundled_signature_font_embeds() {
    let entries = signature_fonts::manifest();
    assert!(!entries.is_empty(), "resources/fonts/signature/manifest.json lists no font (#725)");
    let dir = signature_fonts::font_dir();
    for entry in entries {
        let id = &entry.id;
        assert!(
            entry.sha256.len() == 64 && entry.sha256.bytes().all(|b| b.is_ascii_hexdigit()),
            "{id}: sha256 is still a placeholder; record the hash of the font file"
        );
        let size = std::fs::metadata(dir.join(&entry.file))
            .unwrap_or_else(|e| panic!("{id}: font file {} is not in the repo: {e}", entry.file))
            .len() as usize;
        let licence = std::fs::read_to_string(dir.join(&entry.licence)).expect("licence file in the repo");
        assert!(licence.to_uppercase().contains("SIL OPEN FONT LICENSE"), "{id}: not an OFL text");

        let mut doc = fixture();
        doc.add_signature_annotation_with_font(0, [100.0, 100.0, 300.0, 160.0], NAME, "2026-10-18", None, Some(NAME), Some(id))
            .unwrap_or_else(|e| panic!("{id}: {e}"));
        let raw = save_and_reload(&mut doc, &format!("bundled-{id}.pdf"));
        assert_embedded_and_extracts(&raw, size);
    }
}
