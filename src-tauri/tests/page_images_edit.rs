// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary. The PDFluent application is free to use,
// including for commercial purposes. Redistribution, or extraction or reuse
// of its components (including the embedded PDF engine), requires a licence.
// See https://pdfluent.com/license for terms.

//! #723: an image that is already in the page content can be moved, resized,
//! replaced and deleted, and the change is in the saved file.
//!
//! The fixture is a real PDF whose page carries two images placed by the
//! engine (`insert_image`): `A` the way the editor places one (`q cm Do Q`),
//! `B` rewritten into nested transforms so the matrix rewrite cannot rely on
//! that shape. Every case edits, saves, reopens the saved file and reads the
//! page content and the XObjects back from the raw objects.
//!
//! Runs in the `cargo-test` job on Linux, macOS and Windows.

use lopdf::content::Content;
use lopdf::{dictionary, Document, Object};
use pdf_manip::image_insert::{insert_image, ImageFormat, ImageInsert};
use pdfluent_lib::OpenDocument;
use std::fs;
use std::path::PathBuf;

const BASE: &str = "tests/fixtures/two_pages.pdf";
/// Pixel sizes nobody else in the fixture has, to tell the images apart in the file.
const A_PX: (u32, u32) = (8, 8);
const B_PX: (u32, u32) = (13, 7);
const C_PX: (u32, u32) = (21, 5);

fn png(w: u32, h: u32, rgb: [u8; 3]) -> Vec<u8> {
    let img = image::RgbImage::from_pixel(w, h, image::Rgb(rgb));
    let mut out = std::io::Cursor::new(Vec::new());
    img.write_to(&mut out, image::ImageFormat::Png).expect("encode png");
    out.into_inner()
}

fn scratch(name: &str) -> String {
    let dir = std::env::temp_dir().join(format!("pdfluent-page-images-{}", std::process::id()));
    fs::create_dir_all(&dir).expect("scratch dir");
    dir.join(name).to_str().expect("utf-8").to_string()
}

/// Page 1 with image A at (50,600) size 100x80 and image B inside nested
/// transforms: `q 2 0 0 2 0 0 cm q 1 0 0 1 100 150 cm 50 0 0 25 0 0 cm /B Do Q Q`
/// puts B at (200,300) with size 100x50 (translate inside the scale).
fn fixture(name: &str) -> OpenDocument {
    let mut doc = Document::load(PathBuf::from(env!("CARGO_MANIFEST_DIR")).join(BASE)).expect("base pdf");
    let place = |doc: &mut Document, px: (u32, u32), x, y, w, h| {
        insert_image(
            doc,
            &ImageInsert {
                image_data: png(px.0, px.1, [200, 30, 30]),
                format: ImageFormat::Png,
                x,
                y,
                width: w,
                height: h,
                page_index: 1,
                opacity: None,
            },
        )
        .expect("insert image")
    };
    place(&mut doc, A_PX, 50.0, 600.0, 100.0, 80.0);
    let b = place(&mut doc, B_PX, 0.0, 0.0, 10.0, 10.0);
    // Rewrite B's own content stream (the last one appended) into nested transforms.
    let page = *doc.get_pages().get(&1).expect("page 1");
    let ids = pdf_manip::content_editor::get_content_stream_ids(&doc, page);
    let last = *ids.last().expect("content streams");
    if let Ok(Object::Stream(s)) = doc.get_object_mut(last) {
        let text = format!("q 2 0 0 2 0 0 cm q 1 0 0 1 100 150 cm 50 0 0 25 0 0 cm /{} Do Q Q", b.resource_name);
        s.dict.remove(b"Filter");
        s.content = text.into_bytes();
    }
    let path = scratch(name);
    doc.save(&path).expect("save fixture");
    OpenDocument::open(&path).expect("open fixture")
}

fn save_and_reopen(doc: &mut OpenDocument, name: &str) -> (OpenDocument, Document) {
    let path = scratch(name);
    doc.save_to(&path).expect("save");
    (OpenDocument::open(&path).expect("reopen"), Document::load(&path).expect("raw reload"))
}

fn near(a: [f64; 4], b: [f64; 4]) {
    for (x, y) in a.iter().zip(b) {
        assert!((x - y).abs() < 0.05, "{a:?} != {b:?}");
    }
}

/// `(name, matrix of the enclosing cm's applied in order)` for every `Do` on page 1, read raw.
fn raw_dos(raw: &Document) -> Vec<String> {
    let page = *raw.get_pages().get(&1).expect("page 1");
    let ops = Content::decode(&raw.get_page_content(page)).expect("decode").operations;
    ops.iter()
        .filter(|o| o.operator == "Do")
        .map(|o| String::from_utf8_lossy(o.operands[0].as_name().expect("name")).into_owned())
        .collect()
}

/// Pixel sizes of every Image XObject in the file.
fn raw_image_sizes(raw: &Document) -> Vec<(i64, i64)> {
    let mut v: Vec<(i64, i64)> = raw
        .objects
        .values()
        .filter_map(|o| o.as_stream().ok())
        .filter(|s| s.dict.get(b"Subtype").ok().and_then(|o| o.as_name().ok()) == Some(b"Image".as_slice()))
        .filter_map(|s| Some((s.dict.get(b"Width").ok()?.as_i64().ok()?, s.dict.get(b"Height").ok()?.as_i64().ok()?)))
        .collect();
    v.sort_unstable();
    v
}

fn px(p: (u32, u32)) -> (i64, i64) {
    (i64::from(p.0), i64::from(p.1))
}

#[test]
fn lists_both_placements_with_their_boxes() {
    let doc = fixture("list.pdf");
    let images = doc.list_page_images(0).expect("list");
    assert_eq!(images.len(), 2, "{images:?}");
    near(images[0].rect, [50.0, 600.0, 150.0, 680.0]);
    assert_eq!((images[0].pixel_width, images[0].pixel_height), A_PX);
    // The nested transforms must compose in PDF order: translate inside scale.
    near(images[1].rect, [200.0, 300.0, 300.0, 350.0]);
    assert_eq!((images[1].pixel_width, images[1].pixel_height), B_PX);
}

#[test]
fn move_and_resize_survive_save_and_reopen() {
    let mut doc = fixture("move.pdf");
    let before = doc.list_page_images(0).expect("list");
    doc.move_page_image(0, before[0].index, [300.0, 100.0, 380.0, 140.0]).expect("move A");
    doc.move_page_image(0, before[1].index, [10.0, 20.0, 60.0, 120.0]).expect("resize nested B");

    let (reopened, raw) = save_and_reopen(&mut doc, "move-saved.pdf");
    let after = reopened.list_page_images(0).expect("list after reopen");
    assert_eq!(after.len(), 2);
    near(after[0].rect, [300.0, 100.0, 380.0, 140.0]);
    near(after[1].rect, [10.0, 20.0, 60.0, 120.0]);
    // Same pictures, same XObjects: only the placement moved.
    assert_eq!(after[0].name, before[0].name);
    assert_eq!(raw_dos(&raw).len(), 2, "no placement was added or lost");
    assert_eq!(raw_image_sizes(&raw), vec![px(A_PX), px(B_PX)]);
}

#[test]
fn moving_twice_does_not_pile_up_operators() {
    let mut doc = fixture("twice.pdf");
    let a = doc.list_page_images(0).expect("list")[0].index;
    doc.move_page_image(0, a, [100.0, 100.0, 200.0, 180.0]).expect("first");
    let ops_before = {
        let (_, raw) = save_and_reopen(&mut doc, "twice-1.pdf");
        let page = *raw.get_pages().get(&1).expect("page");
        Content::decode(&raw.get_page_content(page)).expect("decode").operations.len()
    };
    doc.move_page_image(0, a, [120.0, 120.0, 220.0, 200.0]).expect("second");
    let (_, raw) = save_and_reopen(&mut doc, "twice-2.pdf");
    let page = *raw.get_pages().get(&1).expect("page");
    let ops_after = Content::decode(&raw.get_page_content(page)).expect("decode").operations.len();
    assert_eq!(ops_before, ops_after, "the canonical placement is rewritten in place");
}

#[test]
fn replace_swaps_the_xobject_and_drops_the_old_bytes() {
    let mut doc = fixture("replace.pdf");
    let a = doc.list_page_images(0).expect("list")[0].clone();
    doc.replace_page_image(0, a.index, &png(C_PX.0, C_PX.1, [10, 10, 220])).expect("replace A");

    let (reopened, raw) = save_and_reopen(&mut doc, "replace-saved.pdf");
    let after = reopened.list_page_images(0).expect("list");
    assert_eq!(after.len(), 2);
    assert_eq!((after[0].pixel_width, after[0].pixel_height), C_PX, "the new picture is placed");
    assert_ne!(after[0].name, a.name, "the placement points at the new XObject");
    // 21x5 fitted inside the old 100x80 box, centred in it.
    near(after[0].rect, [50.0, 600.0 + (80.0 - 100.0 * 5.0 / 21.0) / 2.0, 150.0, 680.0 - (80.0 - 100.0 * 5.0 / 21.0) / 2.0]);
    assert_eq!(raw_image_sizes(&raw), vec![px(B_PX), px(C_PX)], "the old 8x8 image is gone from the file");
}

#[test]
fn delete_removes_the_placement_and_the_image_bytes() {
    let mut doc = fixture("delete.pdf");
    let images = doc.list_page_images(0).expect("list");
    doc.delete_page_image(0, images[1].index).expect("delete nested B");

    let (reopened, raw) = save_and_reopen(&mut doc, "delete-saved.pdf");
    let after = reopened.list_page_images(0).expect("list");
    assert_eq!(after.len(), 1);
    near(after[0].rect, [50.0, 600.0, 150.0, 680.0]);
    assert_eq!(raw_dos(&raw).len(), 1);
    assert_eq!(raw_image_sizes(&raw), vec![px(A_PX)], "a deleted picture does not stay in the file");
}

#[test]
fn delete_is_one_undo_step() {
    let mut doc = fixture("undo.pdf");
    let a = doc.list_page_images(0).expect("list")[0].index;
    doc.edit("delete-page-image", |d| d.delete_page_image(0, a)).expect("delete");
    assert_eq!(doc.list_page_images(0).expect("list").len(), 1);
    assert!(doc.undo().expect("undo"));
    assert_eq!(doc.list_page_images(0).expect("list").len(), 2);
}

#[test]
fn a_stale_index_is_refused_and_changes_nothing() {
    let mut doc = fixture("stale.pdf");
    let err = doc.move_page_image(0, 99, [0.0, 0.0, 50.0, 50.0]).expect_err("no such image");
    assert!(err.contains("no longer on the page"), "{err}");
    let first = doc.list_page_images(0).expect("list")[0].index;
    let err = doc.move_page_image(0, first, [0.0, 0.0, 0.001, 0.001]).expect_err("too small");
    assert!(err.contains("rectangle"), "{err}");
    assert_eq!(doc.list_page_images(0).expect("list").len(), 2);
}

/// Both pages draw the same Form XObject, `q 50 0 0 40 0 0 cm /Im Do Q` inside
/// `q 1 0 0 1 200 400 cm /Fm1 Do Q`: the image sits at (200,400) 50x40 and is
/// only reachable through the form.
fn form_fixture(name: &str) -> OpenDocument {
    let mut doc = Document::load(PathBuf::from(env!("CARGO_MANIFEST_DIR")).join(BASE)).expect("base pdf");
    let placed = insert_image(
        &mut doc,
        &ImageInsert {
            image_data: png(A_PX.0, A_PX.1, [200, 30, 30]),
            format: ImageFormat::Png,
            x: 0.0,
            y: 0.0,
            width: 10.0,
            height: 10.0,
            page_index: 1,
            opacity: None,
        },
    )
    .expect("insert image");
    let page1 = *doc.get_pages().get(&1).expect("page 1");
    let image_id = doc
        .get_page_resources(page1)
        .ok()
        .and_then(|(res, _)| res.cloned())
        .and_then(|r| r.get(b"XObject").ok().and_then(|x| x.as_dict().ok()).cloned())
        .and_then(|x| x.get(placed.resource_name.as_bytes()).ok().and_then(|o| o.as_reference().ok()))
        .expect("image object");
    // The image placement the engine wrote is replaced by the form's draw.
    let last = *pdf_manip::content_editor::get_content_stream_ids(&doc, page1).last().expect("content streams");
    if let Ok(Object::Stream(s)) = doc.get_object_mut(last) {
        s.dict.remove(b"Filter");
        s.content = b"q 1 0 0 1 200 400 cm /Fm1 Do Q".to_vec();
    }
    let form = lopdf::Stream::new(
        dictionary! {
            "Type" => "XObject",
            "Subtype" => "Form",
            "BBox" => vec![0.into(), 0.into(), 300.into(), 300.into()],
            "Resources" => dictionary! { "XObject" => dictionary! { "Im" => image_id } },
        },
        b"q 50 0 0 40 0 0 cm /Im Do Q".to_vec(),
    );
    let form_id = doc.add_object(form);
    for page_num in [1u32, 2] {
        let page = *doc.get_pages().get(&page_num).expect("page");
        let mut res = doc
            .get_page_resources(page)
            .ok()
            .and_then(|(res, _)| res.cloned())
            .unwrap_or_default();
        let mut xobjects = res.get(b"XObject").ok().and_then(|x| x.as_dict().ok()).cloned().unwrap_or_default();
        xobjects.set("Fm1", Object::Reference(form_id));
        res.set("XObject", Object::Dictionary(xobjects));
        if let Some(Object::Dictionary(p)) = doc.objects.get_mut(&page) {
            p.set("Resources", Object::Dictionary(res));
        }
        if page_num == 2 {
            let content = doc.add_object(lopdf::Stream::new(dictionary! {}, b"q 1 0 0 1 200 400 cm /Fm1 Do Q".to_vec()));
            if let Some(Object::Dictionary(p)) = doc.objects.get_mut(&page) {
                p.set("Contents", Object::Reference(content));
            }
        }
    }
    let path = scratch(name);
    doc.save(&path).expect("save fixture");
    OpenDocument::open(&path).expect("open fixture")
}

#[test]
fn an_image_inside_a_form_is_listed_moved_and_saved_without_touching_the_shared_form() {
    let mut doc = form_fixture("form.pdf");
    let images = doc.list_page_images(0).expect("list");
    assert_eq!(images.len(), 1, "{images:?}");
    assert!(images[0].in_form);
    near(images[0].rect, [200.0, 400.0, 250.0, 440.0]);

    doc.move_page_image(0, images[0].index, [10.0, 20.0, 90.0, 60.0]).expect("move the form image");

    let (reopened, raw) = save_and_reopen(&mut doc, "form-saved.pdf");
    let after = reopened.list_page_images(0).expect("list after reopen");
    assert_eq!(after.len(), 1);
    near(after[0].rect, [10.0, 20.0, 90.0, 60.0]);
    // Page 2 draws the same form and keeps the original position.
    let other = pdf_manip::image_edit::list_image_placements(&raw, 2).expect("page 2");
    assert_eq!(other.len(), 1);
    near(other[0].bbox, [200.0, 400.0, 250.0, 440.0]);
    assert_eq!(raw_image_sizes(&raw), vec![px(A_PX)], "one picture, shared by both pages");
}

#[test]
fn deleting_a_form_image_keeps_the_picture_the_other_page_still_draws() {
    let mut doc = form_fixture("form-delete.pdf");
    let index = doc.list_page_images(0).expect("list")[0].index;
    doc.delete_page_image(0, index).expect("delete the form image");

    let (reopened, raw) = save_and_reopen(&mut doc, "form-delete-saved.pdf");
    assert!(reopened.list_page_images(0).expect("list").is_empty());
    assert_eq!(reopened.list_page_images(1).expect("page 2").len(), 1);
    assert_eq!(raw_image_sizes(&raw), vec![px(A_PX)]);
}
