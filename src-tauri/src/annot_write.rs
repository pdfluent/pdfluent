// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary. The PDFluent application is free to use,
// including for commercial purposes. Redistribution, or extraction or reuse
// of its components (including the embedded PDF engine), requires a licence.
// See https://pdfluent.com/license for terms.

//! Annotations whose appearance the editor writes itself.
//!
//! A text box (`/FreeText`), a rubber stamp and a placed image (`/Stamp` with
//! an image appearance) are only worth something if another viewer shows them
//! the way the editor did. Viewers draw `/AP /N` when it is there, so each of
//! these carries a complete appearance stream: the text set in Helvetica with
//! a WinAnsi encoding, the stamp label fitted to its box, the image drawn
//! through an Image XObject. Until J-44/J-45/J-53 these three only existed as
//! React overlays and were gone on save.
//!
//! Moving, resizing and recolouring an annotation goes through
//! [`refresh_after_edit`]: the geometry that lives outside `/Rect` (`/L`,
//! `/InkList`, `/QuadPoints`, `/Vertices`) follows the rectangle, and the
//! appearance is rebuilt so the colour the panel shows is the colour a viewer
//! draws.

use lopdf::{dictionary, Dictionary, Document, Object, ObjectId, Stream, StringFormat};
use pdf_annot::builder::{AnnotRect, AnnotationBuilder};
use pdf_annot::builder::TextIcon;

/// The `/Name` written on a stamp that carries a placed image.
pub const IMAGE_STAMP_NAME: &str = "Image";

/// Standard stamps the editor offers: `/Name`, printed label, colour.
pub const STAMPS: &[(&str, &str, [f32; 3])] = &[
    ("Approved", "APPROVED", [0.09, 0.50, 0.20]),
    ("NotApproved", "NOT APPROVED", [0.75, 0.10, 0.10]),
    ("Draft", "DRAFT", [0.10, 0.30, 0.75]),
    ("Confidential", "CONFIDENTIAL", [0.75, 0.10, 0.10]),
    ("Final", "FINAL", [0.09, 0.50, 0.20]),
    ("ForComment", "FOR COMMENT", [0.10, 0.30, 0.75]),
    ("Expired", "EXPIRED", [0.75, 0.10, 0.10]),
];

fn stamp_style(name: &str) -> Option<(&'static str, [f32; 3])> {
    STAMPS.iter().find(|(n, _, _)| *n == name).map(|(_, label, color)| (*label, *color))
}

/// A PDF text string: plain ASCII as is, anything else as UTF-16BE with a BOM,
/// so `/Contents` reads back the same in every viewer.
pub fn text_string(s: &str) -> Object {
    if s.is_ascii() {
        return Object::String(s.as_bytes().to_vec(), StringFormat::Literal);
    }
    let mut bytes = vec![0xFE, 0xFF];
    for unit in s.encode_utf16() {
        bytes.extend_from_slice(&unit.to_be_bytes());
    }
    Object::String(bytes, StringFormat::Hexadecimal)
}

/// Decode a PDF text string written by [`text_string`] (or PDFDocEncoding
/// close enough to Latin-1).
pub fn decode_text_string(bytes: &[u8]) -> String {
    if bytes.len() >= 2 && bytes[0] == 0xFE && bytes[1] == 0xFF {
        let units: Vec<u16> =
            bytes[2..].as_chunks::<2>().0.iter().map(|c| u16::from_be_bytes(*c)).collect();
        return String::from_utf16_lossy(&units);
    }
    match std::str::from_utf8(bytes) {
        Ok(s) => s.to_string(),
        Err(_) => bytes.iter().map(|&b| b as char).collect(),
    }
}

/// WinAnsi bytes for the appearance font. Characters the encoding cannot hold
/// become `?` rather than a wrong glyph.
fn win_ansi(s: &str) -> Vec<u8> {
    s.chars()
        .map(|c| match c as u32 {
            0x20..=0x7E | 0xA0..=0xFF => c as u32 as u8,
            0x20AC => 0x80,
            0x2026 => 0x85,
            0x2018 => 0x91,
            0x2019 => 0x92,
            0x201C => 0x93,
            0x201D => 0x94,
            0x2022 => 0x95,
            0x2013 => 0x96,
            0x2014 => 0x97,
            _ => b'?',
        })
        .collect()
}

/// Helvetica advance widths (1/1000 em) for ASCII 32..=126.
const HELVETICA_WIDTHS: [u16; 95] = [
    278, 278, 355, 556, 556, 889, 667, 191, 333, 333, 389, 584, 278, 333, 278, 278, 556, 556, 556,
    556, 556, 556, 556, 556, 556, 556, 278, 278, 584, 584, 584, 556, 1015, 667, 667, 722, 722, 667,
    611, 778, 722, 278, 500, 667, 556, 833, 722, 778, 667, 778, 722, 667, 611, 722, 667, 944, 667,
    667, 611, 278, 278, 278, 469, 556, 333, 556, 556, 500, 556, 556, 278, 556, 556, 222, 222, 500,
    222, 833, 556, 556, 556, 556, 333, 500, 278, 556, 500, 722, 500, 500, 500, 334, 260, 334, 584,
];

fn text_width(s: &str, size: f32) -> f32 {
    let units: u32 = s
        .chars()
        .map(|c| match c as u32 {
            32..=126 => HELVETICA_WIDTHS[(c as u32 - 32) as usize] as u32,
            _ => 556,
        })
        .sum();
    units as f32 * size / 1000.0
}

/// Break `text` into lines that fit `width` at `size`; explicit newlines stay.
fn wrap(text: &str, size: f32, width: f32) -> Vec<String> {
    let mut lines = Vec::new();
    for para in text.split('\n') {
        let mut line = String::new();
        for word in para.split(' ') {
            let candidate = if line.is_empty() { word.to_string() } else { format!("{line} {word}") };
            if !line.is_empty() && text_width(&candidate, size) > width {
                lines.push(std::mem::take(&mut line));
                line = word.to_string();
            } else {
                line = candidate;
            }
        }
        lines.push(line);
    }
    lines
}

fn helvetica(doc: &mut Document, base: &str) -> ObjectId {
    doc.add_object(dictionary! {
        "Type" => "Font",
        "Subtype" => "Type1",
        "BaseFont" => Object::Name(base.as_bytes().to_vec()),
        "Encoding" => "WinAnsiEncoding",
    })
}

fn real_array(values: &[f32]) -> Object {
    Object::Array(values.iter().map(|&v| Object::Real(v)).collect())
}

fn form_xobject(doc: &mut Document, w: f32, h: f32, resources: Dictionary, content: String) -> ObjectId {
    let dict = dictionary! {
        "Type" => "XObject",
        "Subtype" => "Form",
        "BBox" => real_array(&[0.0, 0.0, w, h]),
        "Resources" => Object::Dictionary(resources),
    };
    doc.add_object(Object::Stream(Stream::new(dict, content.into_bytes())))
}

/// PDF literal string syntax for raw bytes.
fn literal(bytes: &[u8]) -> String {
    let mut out = String::from("(");
    for &b in bytes {
        match b {
            b'(' | b')' | b'\\' => {
                out.push('\\');
                out.push(b as char);
            }
            0x20..=0x7E => out.push(b as char),
            _ => out.push_str(&format!("\\{b:03o}")),
        }
    }
    out.push(')');
    out
}

fn rgb(c: [f32; 3]) -> String {
    format!("{} {} {}", c[0], c[1], c[2])
}

/// The text box appearance: the text, wrapped to the box, no frame.
pub fn free_text_appearance(doc: &mut Document, w: f32, h: f32, text: &str, size: f32, color: [f32; 3]) -> ObjectId {
    let font = helvetica(doc, "Helvetica");
    let pad = 2.0_f32;
    let leading = size * 1.2;
    let mut body = format!("/Tx BMC q 0 0 {w} {h} re W n BT /Helv {size} Tf {} rg {leading} TL {pad} {} Td\n", rgb(color), h - pad - size * 0.8);
    for (i, line) in wrap(text, size, (w - 2.0 * pad).max(size)).iter().enumerate() {
        if i > 0 {
            body.push_str("T* ");
        }
        body.push_str(&literal(&win_ansi(line)));
        body.push_str(" Tj\n");
    }
    body.push_str("ET Q EMC\n");
    let resources = dictionary! { "Font" => dictionary! { "Helv" => Object::Reference(font) } };
    form_xobject(doc, w, h, resources, body)
}

/// The stamp appearance: a framed, centred label in the stamp's colour.
pub fn stamp_appearance(doc: &mut Document, w: f32, h: f32, label: &str, color: [f32; 3]) -> ObjectId {
    let font = helvetica(doc, "Helvetica-Bold");
    // Bold runs about 6% wider than the regular metrics above.
    let em = text_width(label, 1.0) * 1.06;
    let size = (h * 0.55).min((w - 12.0).max(1.0) / em.max(0.01)).max(1.0);
    let x = (w - em * size) / 2.0;
    let y = (h - size * 0.7) / 2.0;
    let body = format!(
        "q {c} RG 2 w 3 3 {} {} re S BT /HelvB {size} Tf {c} rg {x} {y} Td {} Tj ET Q\n",
        w - 6.0,
        h - 6.0,
        literal(&win_ansi(label)),
        c = rgb(color),
    );
    let resources = dictionary! { "Font" => dictionary! { "HelvB" => Object::Reference(font) } };
    form_xobject(doc, w, h, resources, body)
}

/// The placed-image appearance: the image stretched over the whole box.
fn image_appearance(doc: &mut Document, w: f32, h: f32, image: ObjectId) -> ObjectId {
    let body = format!("q {w} 0 0 {h} 0 0 cm /Im0 Do Q\n");
    let resources = dictionary! { "XObject" => dictionary! { "Im0" => Object::Reference(image) } };
    form_xobject(doc, w, h, resources, body)
}

/// Make an Image XObject from PNG or JPEG bytes with pdf-manip's decoder (its
/// size limits included), and return it with its pixel size.
///
/// pdf-manip only inserts images into page content, so the image is made in a
/// one-page scratch document and the stream (and its alpha `/SMask`) is
/// copied across.
pub fn image_xobject(doc: &mut Document, data: &[u8]) -> Result<(ObjectId, u32, u32), String> {
    use pdf_manip::image_insert::{detect_format, insert_image, ImageInsert};
    let format = detect_format(data).ok_or("Only PNG and JPEG images can be placed")?;
    let mut scratch = Document::with_version("1.7");
    let pages_id = scratch.new_object_id();
    let page_id = scratch.add_object(dictionary! {
        "Type" => "Page",
        "Parent" => Object::Reference(pages_id),
        "MediaBox" => real_array(&[0.0, 0.0, 10.0, 10.0]),
    });
    scratch.objects.insert(
        pages_id,
        Object::Dictionary(dictionary! {
            "Type" => "Pages",
            "Kids" => vec![Object::Reference(page_id)],
            "Count" => 1,
        }),
    );
    let catalog = scratch.add_object(dictionary! { "Type" => "Catalog", "Pages" => Object::Reference(pages_id) });
    scratch.trailer.set("Root", Object::Reference(catalog));
    let inserted = insert_image(
        &mut scratch,
        &ImageInsert { image_data: data.to_vec(), format, x: 0.0, y: 0.0, width: 10.0, height: 10.0, page_index: 1, opacity: None },
    )
    .map_err(|e| format!("Could not read the image: {e}"))?;
    let mut image = scratch
        .get_object(inserted.image_object_id)
        .and_then(Object::as_stream)
        .map_err(|e| format!("Image stream missing: {e}"))?
        .clone();
    if let Ok(Object::Reference(mask_id)) = image.dict.get(b"SMask") {
        let mask = scratch.get_object(*mask_id).map_err(|e| format!("Image mask missing: {e}"))?.clone();
        let new_mask = doc.add_object(mask);
        image.dict.set("SMask", Object::Reference(new_mask));
    }
    let id = doc.add_object(Object::Stream(image));
    Ok((id, inserted.pixel_width, inserted.pixel_height))
}

/// The largest rectangle with the image's aspect ratio inside `rect`, centred.
pub fn fit_rect(rect: [f32; 4], px_w: u32, px_h: u32) -> [f32; 4] {
    let (x0, y0) = (rect[0].min(rect[2]), rect[1].min(rect[3]));
    let (bw, bh) = ((rect[2] - rect[0]).abs(), (rect[3] - rect[1]).abs());
    let aspect = px_w.max(1) as f32 / px_h.max(1) as f32;
    let (w, h) = if bw / bh.max(0.01) > aspect { (bh * aspect, bh) } else { (bw, bw / aspect) };
    let x = x0 + (bw - w) / 2.0;
    let y = y0 + (bh - h) / 2.0;
    [x, y, x + w, y + h]
}

fn normalise(rect: [f32; 4]) -> Result<[f32; 4], String> {
    let r = [rect[0].min(rect[2]), rect[1].min(rect[3]), rect[0].max(rect[2]), rect[1].max(rect[3])];
    if !r.iter().all(|v| v.is_finite()) || r[2] - r[0] < 1.0 || r[3] - r[1] < 1.0 {
        return Err("The box is too small to hold an annotation".to_string());
    }
    Ok(r)
}

fn set_ap(dict: &mut Dictionary, ap: ObjectId) {
    dict.set("AP", dictionary! { "N" => Object::Reference(ap) });
}

/// A `/FreeText` text box with `/DA` and a full appearance stream.
pub fn free_text(doc: &mut Document, rect: [f32; 4], text: &str, size: f32, color: [f32; 3]) -> Result<ObjectId, String> {
    let r = normalise(rect)?;
    if text.trim().is_empty() {
        return Err("A text box needs text".to_string());
    }
    let size = size.clamp(4.0, 144.0);
    let ap = free_text_appearance(doc, r[2] - r[0], r[3] - r[1], text, size, color);
    let mut dict = dictionary! {
        "Type" => "Annot",
        "Subtype" => "FreeText",
        "Rect" => real_array(&r),
        "F" => 4,
        "Contents" => text_string(text),
        "DA" => Object::String(format!("/Helv {size} Tf {} rg", rgb(color)).into_bytes(), StringFormat::Literal),
        "Q" => 0,
        "BS" => dictionary! { "W" => 0 },
    };
    set_ap(&mut dict, ap);
    Ok(doc.add_object(Object::Dictionary(dict)))
}

/// A standard rubber stamp (`/Name` one of [`STAMPS`]).
pub fn stamp(doc: &mut Document, rect: [f32; 4], name: &str) -> Result<ObjectId, String> {
    let r = normalise(rect)?;
    let (label, color) = stamp_style(name).ok_or_else(|| format!("Unknown stamp: {name}"))?;
    let ap = stamp_appearance(doc, r[2] - r[0], r[3] - r[1], label, color);
    let mut dict = dictionary! {
        "Type" => "Annot",
        "Subtype" => "Stamp",
        "Rect" => real_array(&r),
        "F" => 4,
        "Name" => Object::Name(name.as_bytes().to_vec()),
        "C" => real_array(&color),
        "Contents" => text_string(label),
    };
    set_ap(&mut dict, ap);
    Ok(doc.add_object(Object::Dictionary(dict)))
}

/// A placed image: a `/Stamp` named [`IMAGE_STAMP_NAME`] whose appearance
/// draws the image, fitted into `rect` with its aspect ratio kept.
pub fn image_stamp(doc: &mut Document, rect: [f32; 4], data: &[u8]) -> Result<ObjectId, String> {
    let r = normalise(rect)?;
    let (image, pw, ph) = image_xobject(doc, data)?;
    let r = fit_rect(r, pw, ph);
    let ap = image_appearance(doc, r[2] - r[0], r[3] - r[1], image);
    let mut dict = dictionary! {
        "Type" => "Annot",
        "Subtype" => "Stamp",
        "Rect" => real_array(&r),
        "F" => 4,
        "Name" => Object::Name(IMAGE_STAMP_NAME.as_bytes().to_vec()),
    };
    set_ap(&mut dict, ap);
    Ok(doc.add_object(Object::Dictionary(dict)))
}

/// Height of the caption band under a placed signature.
const SIGNATURE_CAPTION_BAND: f32 = 14.0;

/// What a placed signature shows: the strokes drawn on the pad (PDF page
/// coordinates, already inside the box) or the typed name.
pub enum SignatureMark<'a> {
    Drawn(&'a [Vec<[f32; 2]>]),
    Typed(&'a str),
    /// The typed name in an embedded subset font (#725): the codes to show,
    /// the font object and the text's advance width in em.
    TypedEmbedded { text: &'a str, font: ObjectId, codes: &'a [u8], width_em: f64 },
}

/// The caption every placed signature carries.
pub fn signature_caption(signer: &str, date: &str) -> String {
    format!("Signed by {signer} \u{00B7} {date}")
}

/// A visible signature (J-62): a framed `/Stamp` named `Signature` whose
/// appearance holds the drawn strokes or the typed name, with a caption line
/// "Signed by <name> · <date>" under it. It is a picture of a signature, not
/// a cryptographic one; the Sign panel's certificate signing is that.
pub fn signature(doc: &mut Document, rect: [f32; 4], signer: &str, date: &str, mark: SignatureMark) -> Result<ObjectId, String> {
    let r = normalise(rect)?;
    let signer = signer.trim();
    if signer.is_empty() {
        return Err("A signature needs the signer's name".to_string());
    }
    if !is_iso_date(date) {
        return Err(format!("The signature date must be YYYY-MM-DD, not {date}"));
    }
    let (w, h) = (r[2] - r[0], r[3] - r[1]);
    if h < SIGNATURE_CAPTION_BAND + 8.0 || w < 24.0 {
        return Err("The box is too small to hold a signature".to_string());
    }
    let ink = rgb(SIGNATURE_INK);
    let caption = signature_caption(signer, date);
    let caption_size = 7.0_f32.min((w - 8.0) / text_width(&caption, 1.0).max(0.01));
    let mut body = format!(
        "q {ink} RG 0.75 w 0.5 0.5 {} {} re S 0.4 w 4 {band} m {} {band} l S Q\n\
         BT /Helv {caption_size} Tf 0.3 0.3 0.3 rg 4 4 Td {} Tj ET\n",
        w - 1.0,
        h - 1.0,
        w - 4.0,
        literal(&win_ansi(&caption)),
        band = SIGNATURE_CAPTION_BAND,
    );
    let mut embedded_font = None;
    match mark {
        SignatureMark::TypedEmbedded { text, font, codes, width_em } => {
            if text.trim().is_empty() || codes.is_empty() {
                return Err("Nothing was typed".to_string());
            }
            let area_h = h - SIGNATURE_CAPTION_BAND - 6.0;
            let size = (area_h * 0.7).min((w - 8.0) / (width_em as f32).max(0.01)).max(1.0);
            let x = (w - width_em as f32 * size) / 2.0;
            let y = SIGNATURE_CAPTION_BAND + (area_h - size * 0.7) / 2.0 + 2.0;
            let hex: String = codes.iter().map(|b| format!("{b:02X}")).collect();
            body.push_str(&format!("BT /SigFont {size} Tf {ink} rg {x} {y} Td <{hex}> Tj ET\n"));
            embedded_font = Some(font);
        }
        SignatureMark::Drawn(paths) => {
            if paths.iter().all(|p| p.is_empty()) {
                return Err("Nothing was drawn".to_string());
            }
            body.push_str(&format!("q {ink} RG 1.5 w 1 J 1 j\n"));
            for path in paths.iter().filter(|p| !p.is_empty()) {
                for (i, [x, y]) in path.iter().enumerate() {
                    let op = if i == 0 { "m" } else { "l" };
                    body.push_str(&format!("{} {} {op} ", x - r[0], y - r[1]));
                }
                if path.len() == 1 {
                    body.push_str(&format!("{} {} l ", path[0][0] - r[0] + 0.5, path[0][1] - r[1]));
                }
                body.push_str("S\n");
            }
            body.push_str("Q\n");
        }
        SignatureMark::Typed(text) => {
            let text = text.trim();
            if text.is_empty() {
                return Err("Nothing was typed".to_string());
            }
            let area_h = h - SIGNATURE_CAPTION_BAND - 6.0;
            let size = (area_h * 0.7).min((w - 8.0) / text_width(text, 1.0).max(0.01)).max(1.0);
            let x = (w - text_width(text, size)) / 2.0;
            let y = SIGNATURE_CAPTION_BAND + (area_h - size * 0.7) / 2.0 + 2.0;
            body.push_str(&format!("BT /HelvI {size} Tf {ink} rg {x} {y} Td {} Tj ET\n", literal(&win_ansi(text))));
        }
    }
    let regular = helvetica(doc, "Helvetica");
    let oblique = helvetica(doc, "Helvetica-Oblique");
    let mut fonts = dictionary! { "Helv" => Object::Reference(regular), "HelvI" => Object::Reference(oblique) };
    if let Some(font) = embedded_font {
        fonts.set("SigFont", Object::Reference(font));
    }
    let resources = dictionary! { "Font" => fonts };
    let ap = form_xobject(doc, w, h, resources, body);
    let mut dict = dictionary! {
        "Type" => "Annot",
        "Subtype" => "Stamp",
        "Rect" => real_array(&r),
        "F" => 4,
        "Name" => Object::Name(SIGNATURE_STAMP_NAME.as_bytes().to_vec()),
        "T" => text_string(signer),
        "Contents" => text_string(&caption),
    };
    set_ap(&mut dict, ap);
    Ok(doc.add_object(Object::Dictionary(dict)))
}

/// The `/Name` written on a placed signature.
pub const SIGNATURE_STAMP_NAME: &str = "Signature";

/// Signature ink: a dark blue that reads as pen.
const SIGNATURE_INK: [f32; 3] = [0.05, 0.15, 0.45];

fn is_iso_date(s: &str) -> bool {
    let b = s.as_bytes();
    b.len() == 10
        && b[4] == b'-'
        && b[7] == b'-'
        && b.iter().enumerate().all(|(i, c)| i == 4 || i == 7 || c.is_ascii_digit())
}

/// Swap the image of a placed-image stamp, refitting it inside its box.
pub fn replace_image(doc: &mut Document, annot: ObjectId, data: &[u8]) -> Result<(), String> {
    let dict = annot_dict(doc, annot)?;
    if name_of(&dict, b"Subtype").as_deref() != Some("Stamp") || name_of(&dict, b"Name").as_deref() != Some(IMAGE_STAMP_NAME) {
        return Err("Only a placed image can have its image replaced".to_string());
    }
    let r = rect_of(&dict).ok_or("The image has no rectangle")?;
    let (image, pw, ph) = image_xobject(doc, data)?;
    let r = fit_rect(r, pw, ph);
    let ap = image_appearance(doc, r[2] - r[0], r[3] - r[1], image);
    let target = annot_dict_mut(doc, annot)?;
    target.set("Rect", real_array(&r));
    set_ap(target, ap);
    Ok(())
}

fn annot_dict(doc: &Document, id: ObjectId) -> Result<Dictionary, String> {
    doc.get_object(id).and_then(Object::as_dict).cloned().map_err(|e| format!("Annotation not found: {e}"))
}

fn annot_dict_mut(doc: &mut Document, id: ObjectId) -> Result<&mut Dictionary, String> {
    doc.get_object_mut(id).and_then(Object::as_dict_mut).map_err(|e| format!("Annotation not found: {e}"))
}

fn name_of(dict: &Dictionary, key: &[u8]) -> Option<String> {
    match dict.get(key) {
        Ok(Object::Name(n)) => Some(String::from_utf8_lossy(n).into_owned()),
        _ => None,
    }
}

fn number(o: &Object) -> Option<f32> {
    match o {
        Object::Integer(i) => Some(*i as f32),
        Object::Real(r) => Some(*r),
        _ => None,
    }
}

fn numbers(o: &Object) -> Option<Vec<f32>> {
    o.as_array().ok().map(|a| a.iter().filter_map(number).collect())
}

fn rect_of(dict: &Dictionary) -> Option<[f32; 4]> {
    let v = numbers(dict.get(b"Rect").ok()?)?;
    (v.len() >= 4).then(|| [v[0].min(v[2]), v[1].min(v[3]), v[0].max(v[2]), v[1].max(v[3])])
}

fn color_of(dict: &Dictionary, key: &[u8]) -> Option<[f32; 3]> {
    let v = numbers(dict.get(key).ok()?)?;
    match v.as_slice() {
        [g] => Some([*g, *g, *g]),
        [r, g, b] => Some([*r, *g, *b]),
        _ => None,
    }
}

/// Font size and fill colour from a `/DA` string such as `/Helv 12 Tf 0 0 1 rg`.
pub fn parse_da(da: &str) -> (f32, [f32; 3]) {
    let tokens: Vec<&str> = da.split_whitespace().collect();
    let mut size = 12.0;
    let mut color = [0.0, 0.0, 0.0];
    for (i, t) in tokens.iter().enumerate() {
        let num = |k: usize| tokens.get(k).and_then(|s| s.parse::<f32>().ok());
        match *t {
            "Tf" if i >= 1 => size = num(i - 1).unwrap_or(size),
            "rg" if i >= 3 => {
                if let (Some(r), Some(g), Some(b)) = (num(i - 3), num(i - 2), num(i - 1)) {
                    color = [r, g, b];
                }
            }
            "g" if i >= 1 => {
                if let Some(v) = num(i - 1) {
                    color = [v, v, v];
                }
            }
            _ => {}
        }
    }
    (size, color)
}

/// Map points that lived in `from` into `to` (move and resize together).
fn remap(values: &[f32], from: [f32; 4], to: [f32; 4]) -> Vec<f32> {
    let sx = if from[2] - from[0] > f32::EPSILON { (to[2] - to[0]) / (from[2] - from[0]) } else { 1.0 };
    let sy = if from[3] - from[1] > f32::EPSILON { (to[3] - to[1]) / (from[3] - from[1]) } else { 1.0 };
    values
        .chunks(2)
        .flat_map(|p| match p {
            [x, y] => vec![to[0] + (x - from[0]) * sx, to[1] + (y - from[1]) * sy],
            other => other.to_vec(),
        })
        .collect()
}

/// After `/Rect` moved from `old_rect`: carry the annotation's own geometry
/// along, then rebuild its appearance (which also picks up a new `/C`).
pub fn refresh_after_edit(doc: &mut Document, annot: ObjectId, old_rect: Option<[f32; 4]>) -> Result<(), String> {
    let mut dict = annot_dict(doc, annot)?;
    let Some(rect) = rect_of(&dict) else { return Ok(()) };
    if let Some(old) = old_rect {
        for key in [&b"L"[..], b"QuadPoints", b"Vertices"] {
            if let Some(v) = dict.get(key).ok().and_then(numbers) {
                dict.set(key, real_array(&remap(&v, old, rect)));
            }
        }
        if let Ok(Object::Array(paths)) = dict.get(b"InkList") {
            let moved: Vec<Object> = paths
                .iter()
                .filter_map(numbers)
                .map(|p| real_array(&remap(&p, old, rect)))
                .collect();
            dict.set("InkList", Object::Array(moved));
        }
    }
    let (w, h) = (rect[2] - rect[0], rect[3] - rect[1]);
    let subtype = name_of(&dict, b"Subtype");
    let ap = match subtype.as_deref().unwrap_or("") {
        "FreeText" => {
            let da = match dict.get(b"DA") {
                Ok(Object::String(b, _)) => String::from_utf8_lossy(b).into_owned(),
                _ => String::new(),
            };
            let (size, mut color) = parse_da(&da);
            // The colour control writes /C; for a text box that is the text.
            if let Some(c) = color_of(&dict, b"C") {
                color = c;
                dict.remove(b"C");
                dict.set("DA", Object::String(format!("/Helv {size} Tf {} rg", rgb(color)).into_bytes(), StringFormat::Literal));
            }
            let text = match dict.get(b"Contents") {
                Ok(Object::String(b, _)) => decode_text_string(b),
                _ => String::new(),
            };
            Some(free_text_appearance(doc, w, h, &text, size, color))
        }
        "Stamp" => match name_of(&dict, b"Name") {
            Some(n) if n == IMAGE_STAMP_NAME => None, // the appearance scales with /Rect
            Some(n) => stamp_style(&n).map(|(label, default)| {
                let color = color_of(&dict, b"C").unwrap_or(default);
                stamp_appearance(doc, w, h, label, color)
            }),
            None => None,
        },
        _ => builtin_appearance(doc, &dict, rect)?,
    };
    if let Some(ap) = ap {
        set_ap(&mut dict, ap);
    }
    *annot_dict_mut(doc, annot)? = dict;
    Ok(())
}

/// Rebuild the appearance of the subtypes the annotation builder draws.
fn builtin_appearance(doc: &mut Document, dict: &Dictionary, rect: [f32; 4]) -> Result<Option<ObjectId>, String> {
    let r = AnnotRect::new(rect[0] as f64, rect[1] as f64, rect[2] as f64, rect[3] as f64);
    let subtype = name_of(dict, b"Subtype");
    let mut builder = match subtype.as_deref().unwrap_or("") {
        "Square" => AnnotationBuilder::square(r),
        "Circle" => AnnotationBuilder::circle(r),
        "Highlight" => AnnotationBuilder::highlight(r),
        "Underline" => AnnotationBuilder::underline(r),
        "StrikeOut" => AnnotationBuilder::strikeout(r),
        "Squiggly" => AnnotationBuilder::squiggly(r),
        "Text" => AnnotationBuilder::sticky_note(r, TextIcon::Comment),
        "Line" => match dict.get(b"L").ok().and_then(numbers) {
            Some(l) if l.len() >= 4 => AnnotationBuilder::line(l[0] as f64, l[1] as f64, l[2] as f64, l[3] as f64),
            _ => return Ok(None),
        },
        "Ink" => {
            let strokes: Vec<Vec<f64>> = match dict.get(b"InkList") {
                Ok(Object::Array(paths)) => paths
                    .iter()
                    .filter_map(numbers)
                    .map(|p| p.into_iter().map(f64::from).collect())
                    .collect(),
                _ => Vec::new(),
            };
            AnnotationBuilder::ink(r, strokes)
        }
        _ => return Ok(None),
    };
    if let Some(c) = color_of(dict, b"C") {
        builder = builder.color(c[0] as f64, c[1] as f64, c[2] as f64);
    }
    if let Some(c) = color_of(dict, b"IC") {
        builder = builder.interior_color(c[0] as f64, c[1] as f64, c[2] as f64);
    }
    if let Some(a) = dict.get(b"CA").ok().and_then(number) {
        builder = builder.opacity(a as f64);
    }
    let width = match dict.get(b"BS") {
        Ok(Object::Dictionary(bs)) => bs.get(b"W").ok().and_then(number),
        _ => None,
    };
    if let Some(w) = width {
        builder = builder.border_width(w as f64);
    }
    builder.appearance_stream(doc).map(Some).map_err(|e| format!("Could not redraw the annotation: {e}"))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn da_parses_size_and_colour() {
        assert_eq!(parse_da("/Helv 14 Tf 1 0 0.5 rg"), (14.0, [1.0, 0.0, 0.5]));
        assert_eq!(parse_da("/Helv 9 Tf 0 g"), (9.0, [0.0, 0.0, 0.0]));
    }

    #[test]
    fn text_wraps_inside_the_box() {
        let lines = wrap("one two three four five six", 12.0, 60.0);
        assert!(lines.len() > 1);
        assert!(lines.iter().all(|l| text_width(l, 12.0) <= 60.0 || !l.contains(' ')));
        assert_eq!(wrap("a\nb", 12.0, 500.0), vec!["a", "b"]);
    }

    #[test]
    fn non_ascii_contents_round_trip() {
        let Object::String(bytes, _) = text_string("Café ✓") else { panic!("string") };
        assert_eq!(decode_text_string(&bytes), "Café ✓");
        assert_eq!(win_ansi("é€✓"), vec![0xE9, 0x80, b'?']);
    }

    #[test]
    fn signature_caption_and_date_are_checked() {
        assert_eq!(signature_caption("Jane Doe", "2026-10-18"), "Signed by Jane Doe \u{00B7} 2026-10-18");
        assert!(is_iso_date("2026-10-18"));
        assert!(!is_iso_date("18-10-2026") && !is_iso_date("2026-1-18") && !is_iso_date("2026-10-1x"));
    }

    #[test]
    fn fitted_image_keeps_its_aspect_ratio() {
        let r = fit_rect([0.0, 0.0, 200.0, 100.0], 100, 100);
        assert_eq!(r, [50.0, 0.0, 150.0, 100.0]);
    }

    #[test]
    fn moved_geometry_follows_the_rectangle() {
        assert_eq!(remap(&[10.0, 10.0, 20.0, 20.0], [10.0, 10.0, 20.0, 20.0], [110.0, 10.0, 130.0, 30.0]), vec![110.0, 10.0, 130.0, 30.0]);
    }
}
