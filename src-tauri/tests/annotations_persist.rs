// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary. The PDFluent application is free to use,
// including for commercial purposes. Redistribution, or extraction or reuse
// of its components (including the embedded PDF engine), requires a licence.
// See https://pdfluent.com/license for terms.

//! J-44, J-45, J-46, J-50..J-55: an annotation made in the editor is in the
//! file after save, and reads back the way it was made.
//!
//! Each case adds one kind, saves, reopens the saved file and checks two
//! things: the raw `/Annots` entry in the file (subtype, and an appearance
//! stream where other viewers need one to show anything), and what the
//! editor's own `get_page_annotations` reports (type, rect, colour, contents).
//! The kinds that used to be React overlays — text box, stamp, placed image —
//! are the reason this file exists: they looked placed and were gone on save.
//!
//! Runs in the `cargo-test` job on Linux, macOS and Windows.

use lopdf::{Dictionary, Document, Object};
use pdfluent_lib::OpenDocument;
use std::fs;
use std::path::PathBuf;

const TEXT: &str = "tests/golden/fixture-sample-text-3p.pdf";

fn fixture() -> OpenDocument {
    let p = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join(TEXT);
    OpenDocument::open(p.to_str().expect("utf-8")).expect("open fixture")
}

fn scratch(name: &str) -> String {
    let dir = std::env::temp_dir().join(format!("pdfluent-annot-persist-{}", std::process::id()));
    fs::create_dir_all(&dir).expect("scratch dir");
    dir.join(name).to_str().expect("utf-8").to_string()
}

/// Save, then reopen the saved file both ways: as the editor and as raw objects.
fn save_and_reopen(doc: &mut OpenDocument, name: &str) -> (OpenDocument, Document) {
    let path = scratch(name);
    doc.save_to(&path).expect("save");
    (OpenDocument::open(&path).expect("reopen"), Document::load(&path).expect("raw reload"))
}

/// The annotation dictionaries of the first page, in /Annots order.
fn raw_annots(raw: &Document) -> Vec<Dictionary> {
    let page_id = *raw.get_pages().get(&1).expect("page 1");
    let page = raw.get_object(page_id).and_then(Object::as_dict).expect("page dict");
    let annots = match page.get(b"Annots").expect("/Annots") {
        Object::Reference(id) => raw.get_object(*id).and_then(Object::as_array).expect("array").clone(),
        Object::Array(a) => a.clone(),
        other => panic!("unexpected /Annots {other:?}"),
    };
    annots
        .iter()
        .map(|o| match o {
            Object::Reference(id) => raw.get_object(*id).and_then(Object::as_dict).expect("annot").clone(),
            Object::Dictionary(d) => d.clone(),
            other => panic!("unexpected annot {other:?}"),
        })
        .collect()
}

fn name(d: &Dictionary, key: &[u8]) -> Option<String> {
    d.get(key).ok().and_then(|o| o.as_name().ok()).map(|n| String::from_utf8_lossy(n).into_owned())
}

/// The normal appearance stream, decoded.
fn appearance<'a>(raw: &'a Document, d: &Dictionary) -> Option<(&'a lopdf::Stream, Vec<u8>)> {
    let ap = match d.get(b"AP").ok()? {
        Object::Dictionary(ap) => ap.clone(),
        Object::Reference(id) => raw.get_object(*id).ok()?.as_dict().ok()?.clone(),
        _ => return None,
    };
    let id = ap.get(b"N").ok()?.as_reference().ok()?;
    let stream = raw.get_object(id).ok()?.as_stream().ok()?;
    let bytes = stream.decompressed_content().unwrap_or_else(|_| stream.content.clone());
    Some((stream, bytes))
}

fn contains(hay: &[u8], needle: &str) -> bool {
    hay.windows(needle.len()).any(|w| w == needle.as_bytes())
}

fn close(a: f64, b: f64) -> bool {
    (a - b).abs() < 0.6
}

struct Expect<'a> {
    subtype: &'a str,
    kind: &'a str,
    rect: [f64; 4],
    color: Option<[f32; 3]>,
    contents: Option<&'a str>,
    needs_appearance: bool,
}

/// Add with `add`, save, reopen, and check the last annotation on page 1.
fn assert_persists(file: &str, add: impl FnOnce(&mut OpenDocument), e: Expect) -> (Dictionary, Document) {
    let mut doc = fixture();
    let before = doc.get_page_annotations(0).len();
    add(&mut doc);
    let (reopened, raw) = save_and_reopen(&mut doc, file);

    let annots = reopened.get_page_annotations(0);
    assert_eq!(annots.len(), before + 1, "{}: one annotation more after save and reopen", e.kind);
    let info = annots.last().expect("annotation");
    assert_eq!(info.annotation_type, e.kind, "{}: type as the editor reports it", e.subtype);
    let [x0, y0, x1, y1] = e.rect;
    assert!(
        close(info.rect.x, x0) && close(info.rect.y, y0) && close(info.rect.width, x1 - x0) && close(info.rect.height, y1 - y0),
        "{}: rect {:?} is not {:?}",
        e.kind,
        info.rect,
        e.rect
    );
    if let Some(c) = e.color {
        let got = info.color.unwrap_or_else(|| panic!("{}: colour lost", e.kind));
        assert!(got.iter().zip(c).all(|(g, w)| (g - w).abs() < 0.01), "{}: colour {got:?} is not {c:?}", e.kind);
    }
    if let Some(text) = e.contents {
        assert_eq!(info.contents.as_deref(), Some(text), "{}: contents", e.kind);
    }

    let dict = raw_annots(&raw).last().expect("raw annotation").clone();
    assert_eq!(name(&dict, b"Subtype").as_deref(), Some(e.subtype), "{}: /Subtype in the file", e.kind);
    if e.needs_appearance {
        assert!(appearance(&raw, &dict).is_some(), "{}: an appearance stream, or other viewers show nothing", e.kind);
    }
    (dict, raw)
}

const QUAD: [[f32; 4]; 1] = [[72.0, 700.0, 200.0, 712.0]];

#[test]
fn highlight_persists() {
    assert_persists(
        "highlight.pdf",
        |d| d.add_highlight_annotation(0, &QUAD, [1.0, 1.0, 0.0]).expect("add"),
        Expect { subtype: "Highlight", kind: "highlight", rect: [72.0, 700.0, 200.0, 712.0], color: Some([1.0, 1.0, 0.0]), contents: None, needs_appearance: true },
    );
}

#[test]
fn underline_persists() {
    assert_persists(
        "underline.pdf",
        |d| d.add_underline_annotation(0, &QUAD, [0.0, 0.0, 1.0]).expect("add"),
        Expect { subtype: "Underline", kind: "underline", rect: [72.0, 700.0, 200.0, 712.0], color: Some([0.0, 0.0, 1.0]), contents: None, needs_appearance: true },
    );
}

#[test]
fn strikeout_persists() {
    assert_persists(
        "strikeout.pdf",
        |d| d.add_strikeout_annotation(0, &QUAD, [1.0, 0.0, 0.0]).expect("add"),
        Expect { subtype: "StrikeOut", kind: "strikeout", rect: [72.0, 700.0, 200.0, 712.0], color: Some([1.0, 0.0, 0.0]), contents: None, needs_appearance: true },
    );
}

#[test]
fn comment_persists_with_its_text() {
    assert_persists(
        "comment.pdf",
        |d| d.add_comment_annotation(0, 100.0, 600.0, "Check this — café").expect("add"),
        Expect { subtype: "Text", kind: "text", rect: [100.0, 600.0, 124.0, 624.0], color: None, contents: Some("Check this — café"), needs_appearance: true },
    );
}

#[test]
fn ink_persists() {
    let (dict, _) = assert_persists(
        "ink.pdf",
        |d| d.add_ink_annotation(0, &[vec![[100.0, 100.0], [150.0, 160.0], [200.0, 120.0]]], [0.0, 0.5, 0.0], 2.0).expect("add"),
        Expect { subtype: "Ink", kind: "ink", rect: [98.0, 98.0, 202.0, 162.0], color: Some([0.0, 0.5, 0.0]), contents: None, needs_appearance: true },
    );
    assert!(dict.get(b"InkList").is_ok(), "the strokes themselves are in the file");
}

#[test]
fn square_circle_and_line_persist() {
    for (shape, subtype, kind) in [("rectangle", "Square", "square"), ("circle", "Circle", "circle"), ("line", "Line", "line")] {
        assert_persists(
            &format!("{kind}.pdf"),
            |d| d.add_shape_annotation(0, [100.0, 100.0, 200.0, 150.0], shape, [1.0, 0.0, 0.0], 2.0).expect("add"),
            Expect { subtype, kind, rect: [100.0, 100.0, 200.0, 150.0], color: Some([1.0, 0.0, 0.0]), contents: None, needs_appearance: true },
        );
    }
}

#[test]
fn redaction_mark_persists_as_a_redaction() {
    // It used to read back as "text" and land in the comment list.
    assert_persists(
        "redact.pdf",
        |d| d.add_redaction_annotation(0, [72.0, 700.0, 200.0, 712.0]).expect("add"),
        Expect { subtype: "Redact", kind: "redaction", rect: [72.0, 700.0, 200.0, 712.0], color: None, contents: None, needs_appearance: false },
    );
}

#[test]
fn text_box_is_written_into_the_pdf_and_drawn() {
    let (dict, raw) = assert_persists(
        "freetext.pdf",
        |d| d.add_free_text_annotation(0, [100.0, 500.0, 300.0, 560.0], "Hello box (1)\nsecond line", 14.0, [0.0, 0.0, 1.0]).expect("add"),
        Expect { subtype: "FreeText", kind: "freetext", rect: [100.0, 500.0, 300.0, 560.0], color: None, contents: Some("Hello box (1)\nsecond line"), needs_appearance: true },
    );
    let da = match dict.get(b"DA") {
        Ok(Object::String(b, _)) => String::from_utf8_lossy(b).into_owned(),
        other => panic!("a text box needs /DA, got {other:?}"),
    };
    assert!(da.contains("14 Tf") && da.contains("0 0 1 rg"), "/DA carries size and colour: {da}");
    let (stream, content) = appearance(&raw, &dict).expect("appearance");
    assert!(contains(&content, "Hello box \\(1\\)") && contains(&content, "second line"), "the appearance draws the text");
    let font = stream.dict.get(b"Resources").and_then(Object::as_dict).and_then(|r| r.get(b"Font")).is_ok();
    assert!(font, "the appearance names its font");
}

#[test]
fn text_box_follows_an_edit_of_its_text() {
    let mut doc = fixture();
    doc.add_free_text_annotation(0, [100.0, 500.0, 300.0, 560.0], "first", 12.0, [0.0, 0.0, 0.0]).expect("add");
    let id = doc.get_page_annotations(0).last().expect("box").id.clone();
    doc.update_annotation_contents(&id, "rewritten").expect("edit");
    let (_, raw) = save_and_reopen(&mut doc, "freetext-edit.pdf");
    let dict = raw_annots(&raw).last().expect("box").clone();
    let (_, content) = appearance(&raw, &dict).expect("appearance");
    assert!(contains(&content, "rewritten") && !contains(&content, "first"), "the drawn text is the new text");
}

#[test]
fn stamp_is_written_with_a_name_and_a_visible_label() {
    let (dict, raw) = assert_persists(
        "stamp.pdf",
        |d| d.add_stamp_annotation(0, [100.0, 400.0, 260.0, 450.0], "Approved").expect("add"),
        Expect { subtype: "Stamp", kind: "stamp", rect: [100.0, 400.0, 260.0, 450.0], color: None, contents: Some("APPROVED"), needs_appearance: true },
    );
    assert_eq!(name(&dict, b"Name").as_deref(), Some("Approved"));
    let (_, content) = appearance(&raw, &dict).expect("appearance");
    assert!(contains(&content, "(APPROVED) Tj"), "the label is drawn");
    let mut doc = fixture();
    assert!(doc.add_stamp_annotation(0, [100.0, 400.0, 260.0, 450.0], "NoSuchStamp").is_err(), "unknown stamps are refused");
    assert_eq!(fixture().get_page_annotations(0).len(), doc.get_page_annotations(0).len());
}

/// A 4x2 PNG and a 3x1 JPEG, made here so the test needs no binary fixture.
fn png(w: u32, h: u32) -> Vec<u8> {
    let img = image::RgbaImage::from_pixel(w, h, image::Rgba([200, 30, 30, 255]));
    let mut out = std::io::Cursor::new(Vec::new());
    img.write_to(&mut out, image::ImageFormat::Png).expect("png");
    out.into_inner()
}

fn jpeg(w: u32, h: u32) -> Vec<u8> {
    let img = image::RgbImage::from_pixel(w, h, image::Rgb([30, 30, 200]));
    let mut out = std::io::Cursor::new(Vec::new());
    img.write_to(&mut out, image::ImageFormat::Jpeg).expect("jpeg");
    out.into_inner()
}

/// The image the placed-image stamp draws, and its pixel width.
fn placed_image_width(raw: &Document, dict: &Dictionary) -> i64 {
    let (stream, content) = appearance(raw, dict).expect("appearance");
    assert!(contains(&content, "/Im0 Do"), "the appearance draws the image");
    let xobjects = stream.dict.get(b"Resources").and_then(Object::as_dict).and_then(|r| r.get(b"XObject")).and_then(Object::as_dict).expect("XObject resources");
    let image_id = xobjects.get(b"Im0").and_then(Object::as_reference).expect("Im0");
    let image = raw.get_object(image_id).and_then(Object::as_stream).expect("image stream");
    assert_eq!(image.dict.get(b"Subtype").and_then(Object::as_name).ok(), Some(&b"Image"[..]));
    image.dict.get(b"Width").and_then(Object::as_i64).expect("width")
}

#[test]
fn placed_image_is_an_image_xobject_in_the_file() {
    // A 200x200 box and a 4x2 image: 200 wide, 100 high, centred, aspect kept.
    let (dict, raw) = assert_persists(
        "image.pdf",
        |d| d.add_image_annotation(0, [100.0, 300.0, 300.0, 500.0], &png(4, 2)).expect("add"),
        Expect { subtype: "Stamp", kind: "stamp", rect: [100.0, 350.0, 300.0, 450.0], color: None, contents: None, needs_appearance: true },
    );
    assert_eq!(name(&dict, b"Name").as_deref(), Some("Image"));
    assert_eq!(placed_image_width(&raw, &dict), 4);
    assert!(fixture().add_image_annotation(0, [0.0, 0.0, 50.0, 50.0], b"not an image").is_err());
}

#[test]
fn placed_image_moves_and_is_replaced() {
    let mut doc = fixture();
    doc.add_image_annotation(0, [100.0, 300.0, 300.0, 400.0], &png(4, 2)).expect("add");
    let id = doc.get_page_annotations(0).last().expect("image").id.clone();

    doc.update_annotation_rect(&id, [150.0, 350.0, 350.0, 450.0]).expect("move");
    doc.replace_annotation_image(&id, &jpeg(3, 1)).expect("replace");
    let (reopened, raw) = save_and_reopen(&mut doc, "image-moved.pdf");

    let info = reopened.get_page_annotations(0).last().expect("image").clone();
    // Replaced by a 3:1 image inside the moved 200x100 box: 200 wide, 66.7 high, centred.
    assert!(close(info.rect.x, 150.0) && close(info.rect.width, 200.0), "moved: {:?}", info.rect);
    assert!(close(info.rect.height, 200.0 / 3.0) && close(info.rect.y, 350.0 + (100.0 - 200.0 / 3.0) / 2.0), "refitted: {:?}", info.rect);
    let dict = raw_annots(&raw).last().expect("image").clone();
    assert_eq!(placed_image_width(&raw, &dict), 3, "the new image is the one drawn");

    let stamp = {
        let mut d = fixture();
        d.add_stamp_annotation(0, [100.0, 400.0, 260.0, 450.0], "Draft").expect("stamp");
        let sid = d.get_page_annotations(0).last().expect("stamp").id.clone();
        d.replace_annotation_image(&sid, &png(2, 2))
    };
    assert!(stamp.is_err(), "only a placed image takes a new image");
}

/// Image streams in the saved file, orphans included: what a reader of the
/// file would find, not what the page draws.
fn image_streams(raw: &Document) -> usize {
    raw.objects
        .values()
        .filter(|o| matches!(o, Object::Stream(s) if name(&s.dict, b"Subtype").as_deref() == Some("Image")))
        .count()
}

#[test]
fn a_replaced_placed_image_leaves_only_the_new_picture_in_the_file() {
    let mut doc = fixture();
    let before = image_streams(&save_and_reopen(&mut doc, "image-count-base.pdf").1);
    doc.add_image_annotation(0, [100.0, 300.0, 300.0, 400.0], &png(4, 2)).expect("add");
    let id = doc.get_page_annotations(0).last().expect("image").id.clone();
    doc.replace_annotation_image(&id, &jpeg(3, 1)).expect("replace");
    let (_, raw) = save_and_reopen(&mut doc, "image-replaced-count.pdf");
    assert_eq!(image_streams(&raw), before + 1, "the replaced picture must not stay in the file");
}

#[test]
fn a_deleted_placed_image_leaves_no_picture_in_the_file() {
    let mut doc = fixture();
    let before = image_streams(&save_and_reopen(&mut doc, "image-del-base.pdf").1);
    doc.add_image_annotation(0, [100.0, 300.0, 300.0, 400.0], &png(4, 2)).expect("add");
    let id = doc.get_page_annotations(0).last().expect("image").id.clone();
    doc.delete_annotation(&id).expect("delete");
    let (_, raw) = save_and_reopen(&mut doc, "image-deleted-count.pdf");
    assert_eq!(image_streams(&raw), before, "a deleted picture must not stay in the file");
}

#[test]
fn moving_a_shape_moves_its_geometry_and_recolouring_redraws_it() {
    let mut doc = fixture();
    doc.add_ink_annotation(0, &[vec![[100.0, 100.0], [200.0, 200.0]]], [0.0, 0.0, 0.0], 2.0).expect("ink");
    doc.add_shape_annotation(0, [100.0, 100.0, 200.0, 150.0], "rectangle", [1.0, 0.0, 0.0], 2.0).expect("square");
    let annots = doc.get_page_annotations(0);
    let ink = annots[annots.len() - 2].clone();
    let square = annots[annots.len() - 1].clone();

    let r = ink.rect.clone();
    let ink_rect = [r.x as f32 + 100.0, r.y as f32, (r.x + r.width) as f32 + 100.0, (r.y + r.height) as f32];
    doc.update_annotation_rect(&ink.id, ink_rect).expect("move ink");

    let (_, raw_before) = save_and_reopen(&mut doc, "shape-before-colour.pdf");
    let before = appearance(&raw_before, raw_annots(&raw_before).last().unwrap()).unwrap().1;
    doc.update_annotation_color(&square.id, [0.0, 0.0, 1.0]).expect("recolour");
    let (reopened, raw) = save_and_reopen(&mut doc, "shape-moved.pdf");

    let raw_annots = raw_annots(&raw);
    let ink_dict = &raw_annots[raw_annots.len() - 2];
    let first_stroke = match ink_dict.get(b"InkList") {
        Ok(Object::Array(paths)) => paths[0].as_array().unwrap().iter().map(|o| o.as_float().unwrap()).collect::<Vec<_>>(),
        other => panic!("InkList {other:?}"),
    };
    assert!(close(first_stroke[0] as f64, 200.0) && close(first_stroke[2] as f64, 300.0), "the strokes moved with the box: {first_stroke:?}");

    let after = appearance(&raw, raw_annots.last().unwrap()).unwrap().1;
    assert_ne!(before, after, "a new colour is a new appearance, not only a new /C");
    let info = reopened.get_page_annotations(0).last().unwrap().clone();
    assert_eq!(info.color, Some([0.0, 0.0, 1.0]));
    assert!(doc.update_annotation_rect(&square.id, [10.0, 10.0, 10.2, 10.2]).is_err(), "a box too small to grab is refused");
}

#[test]
fn attachment_persists() {
    let mut doc = fixture();
    doc.add_attachment("notes.txt", b"hello", "text/plain").expect("attach");
    let (reopened, _) = save_and_reopen(&mut doc, "attachment.pdf");
    let names: Vec<String> = reopened.list_attachments().into_iter().map(|a| a.name).collect();
    assert!(names.iter().any(|n| n == "notes.txt"), "the attachment is in the saved file: {names:?}");
}

#[test]
fn drawn_signature_is_framed_with_name_and_date() {
    let strokes = vec![vec![[110.0_f32, 330.0], [150.0, 360.0], [200.0, 335.0]]];
    let (dict, raw) = assert_persists(
        "signature-drawn.pdf",
        |d| d.add_signature_annotation(0, [100.0, 300.0, 300.0, 370.0], "Jane Doe", "2026-10-18", Some(strokes.as_slice()), None).expect("add"),
        Expect { subtype: "Stamp", kind: "stamp", rect: [100.0, 300.0, 300.0, 370.0], color: None, contents: Some("Signed by Jane Doe · 2026-10-18"), needs_appearance: true },
    );
    assert_eq!(name(&dict, b"Name").as_deref(), Some("Signature"));
    let (_, content) = appearance(&raw, &dict).expect("appearance");
    assert!(contains(&content, "Signed by Jane Doe") && contains(&content, "2026-10-18"), "the caption is drawn");
    assert!(contains(&content, " re S"), "the frame is drawn");
    // The stroke, in box coordinates: (110, 330) on the page is (10, 30) in the box.
    assert!(contains(&content, "10 30 m") && contains(&content, " l "), "the strokes are drawn");
}

#[test]
fn typed_signature_is_framed_with_name_and_date() {
    let (dict, raw) = assert_persists(
        "signature-typed.pdf",
        |d| d.add_signature_annotation(0, [100.0, 300.0, 300.0, 370.0], "Jane Doe", "2026-10-18", None, Some("Jane Doe")).expect("add"),
        Expect { subtype: "Stamp", kind: "stamp", rect: [100.0, 300.0, 300.0, 370.0], color: None, contents: Some("Signed by Jane Doe · 2026-10-18"), needs_appearance: true },
    );
    let (_, content) = appearance(&raw, &dict).expect("appearance");
    assert!(contains(&content, "/HelvI") && contains(&content, "(Jane Doe) Tj"), "the typed name is drawn");
    assert!(contains(&content, "2026-10-18"));

    let mut doc = fixture();
    assert!(doc.add_signature_annotation(0, [100.0, 300.0, 300.0, 370.0], " ", "2026-10-18", None, Some("x")).is_err(), "no signer, no signature");
    assert!(doc.add_signature_annotation(0, [100.0, 300.0, 300.0, 370.0], "Jane", "18/10/2026", None, Some("x")).is_err(), "the date is YYYY-MM-DD");
    assert!(doc.add_signature_annotation(0, [100.0, 300.0, 300.0, 370.0], "Jane", "2026-10-18", None, None).is_err(), "nothing drawn or typed");
}
