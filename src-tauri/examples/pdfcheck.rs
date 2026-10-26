// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary. The PDFluent application is free to use,
// including for commercial purposes. Redistribution, or extraction or reuse
// of its components (including the embedded PDF engine), requires a licence.
// See https://pdfluent.com/license for terms.

//! `pdfcheck`: what is in a PDF the editor wrote, as JSON.
//!
//! The journey suite (tests/journeys) drives the real app and then judges the
//! file the app saved, not the screen. This is the reader it judges with. It
//! reads the file two ways, so a fault in one reader cannot vouch for itself:
//!
//! * through the editor's own document type (`OpenDocument`, the same path the
//!   Rust integration tests in `src-tauri/tests` use): text per page,
//!   annotations, form fields, signature verification, document info;
//! * through `lopdf` directly: every object, every string and every
//!   decompressed stream, the trailer, `/Encrypt`, `/Annots` subtypes, and the
//!   number of revisions.
//!
//! An example rather than a `[[bin]]`: the Tauri bundler packs every binary
//! target of this package into the app, and this one must never ship.
//!
//! ```text
//! pdfcheck inspect <file.pdf> [--password <pw>] [--needle <text>]...
//! pdfcheck make-encrypted <in.pdf> <out.pdf> <user-pw> <owner-pw>
//! pdfcheck make-signed <in.pdf> <out.pdf> <cert.p12> <cert-pw>
//! pdfcheck make-form <out.pdf>
//! pdfcheck make-scan <in.pdf> <out.pdf>
//! ```
//!
//! `make-scan` renders the first page of `in.pdf` to an image and writes a
//! one-page PDF holding only that image: a "scan" with no text layer, for the
//! OCR journey.
//!
//! `make-form` writes the AcroForm fixture the form journey fills: one field
//! of every type the homepage promises (single-line and multi-line text,
//! checkbox, radio group, combo box, list box), made here so nothing of
//! unknown licence is involved.
//!
//! `inspect` always exits 0 when it could write a report, also for a file that
//! does not open: whether that is right is for the test to say, and the report
//! says why. Exit 2 is a usage error or an unreadable file.

use pdfluent_lib::OpenDocument;
use serde_json::{json, Value};
use std::path::Path;

fn usage() -> ! {
    eprintln!(
        "usage:\n  pdfcheck inspect <file.pdf> [--password <pw>] [--needle <text>]...\n  \
         pdfcheck make-encrypted <in.pdf> <out.pdf> <user-pw> <owner-pw>\n  \
         pdfcheck make-signed <in.pdf> <out.pdf> <cert.p12> <cert-pw>\n  \
         pdfcheck make-form <out.pdf>\n  \
         pdfcheck make-scan <in.pdf> <out.pdf>"
    );
    std::process::exit(2)
}

fn main() {
    let args: Vec<String> = std::env::args().skip(1).collect();
    match args.first().map(String::as_str) {
        Some("inspect") => inspect_cmd(&args[1..]),
        Some("make-encrypted") if args.len() == 5 => {
            let mut doc = open_or_exit(&args[1], None);
            if let Err(e) = doc.encrypt(&args[3], &args[4], &args[2]) {
                eprintln!("pdfcheck: encrypt failed: {e}");
                std::process::exit(1);
            }
        }
        Some("make-signed") if args.len() == 5 => {
            let mut doc = open_or_exit(&args[1], None);
            if let Err(e) = doc.sign(&args[3], &args[4], "pdfcheck fixture", &args[2]) {
                eprintln!("pdfcheck: sign failed: {e}");
                std::process::exit(1);
            }
        }
        Some("make-scan") if args.len() == 3 => {
            if let Err(e) = make_scan(&args[1], &args[2]) {
                eprintln!("pdfcheck: make-scan failed: {e}");
                std::process::exit(1);
            }
        }
        Some("make-form") if args.len() == 2 => {
            if let Err(e) = make_form(&args[1]) {
                eprintln!("pdfcheck: make-form failed: {e}");
                std::process::exit(1);
            }
        }
        _ => usage(),
    }
}

/// Page 1 of `input` as a page that is only an image.
fn make_scan(input: &str, out: &str) -> Result<(), String> {
    use lopdf::{dictionary, Document, Object, Stream};
    let doc = OpenDocument::open(input)?;
    let png = std::env::temp_dir().join(format!("pdfcheck-scan-{}.png", std::process::id()));
    let png_s = png.to_string_lossy().into_owned();
    doc.export_page_as_image(0, "png", &png_s)?;
    let img = image::open(&png).map_err(|e| e.to_string())?.to_rgb8();
    let _ = std::fs::remove_file(&png);
    let (w, h) = img.dimensions();
    let mut pdf = Document::with_version("1.7");
    let pages_id = pdf.new_object_id();
    let mut image = Stream::new(
        dictionary! {
            "Type" => "XObject", "Subtype" => "Image", "Width" => w as i64, "Height" => h as i64,
            "ColorSpace" => "DeviceRGB", "BitsPerComponent" => 8,
        },
        img.into_raw(),
    );
    image.compress().map_err(|e| e.to_string())?;
    let image_id = pdf.add_object(image);
    let content = b"q 612 0 0 792 0 0 cm /Im0 Do Q\n".to_vec();
    let content_id = pdf.add_object(Stream::new(dictionary! {}, content));
    let page_id = pdf.add_object(dictionary! {
        "Type" => "Page", "Parent" => pages_id,
        "MediaBox" => Object::Array(vec![0.into(), 0.into(), 612.into(), 792.into()]),
        "Contents" => content_id,
        "Resources" => dictionary! { "XObject" => dictionary! { "Im0" => image_id } },
    });
    pdf.objects.insert(pages_id, Object::Dictionary(dictionary! { "Type" => "Pages", "Kids" => vec![page_id.into()], "Count" => 1 }));
    let catalog = pdf.add_object(dictionary! { "Type" => "Catalog", "Pages" => pages_id });
    pdf.trailer.set("Root", catalog);
    pdf.save(out).map(|_| ()).map_err(|e| e.to_string())
}

/// One page, one field of each kind, with labels drawn on the page.
fn make_form(out: &str) -> Result<(), String> {
    use lopdf::{dictionary, Document, Object, Stream, StringFormat};
    let mut doc = Document::with_version("1.7");
    let pages_id = doc.new_object_id();
    let font_id = doc.add_object(dictionary! {
        "Type" => "Font", "Subtype" => "Type1", "BaseFont" => "Helvetica",
    });
    let labels = [
        (700, "Full name"), (640, "Notes"), (560, "I agree"), (520, "Size"),
        (480, "Country"), (400, "Colours"),
    ];
    let mut content = String::from("BT /F1 12 Tf\n");
    for (y, text) in labels {
        content.push_str(&format!("1 0 0 1 72 {y} Tm ({text}) Tj\n"));
    }
    content.push_str("ET\n");
    let content_id = doc.add_object(Stream::new(dictionary! {}, content.into_bytes()));
    let page_id = doc.new_object_id();
    let s = |v: &str| Object::String(v.as_bytes().to_vec(), StringFormat::Literal);
    let rect = |x1: i64, y1: i64, x2: i64, y2: i64| Object::Array(vec![x1.into(), y1.into(), x2.into(), y2.into()]);
    let da = || s("/Helv 11 Tf 0 g");
    let mut fields = Vec::new();
    let mut annots = Vec::new();
    let mut widget = |doc: &mut Document, dict: lopdf::Dictionary| -> lopdf::ObjectId {
        let id = doc.add_object(dict);
        annots.push(Object::Reference(id));
        id
    };
    let common = |page: lopdf::ObjectId| dictionary! { "Type" => "Annot", "Subtype" => "Widget", "P" => page, "F" => 4 };
    let mut name = common(page_id);
    name.extend(&dictionary! { "FT" => "Tx", "T" => s("full_name"), "Rect" => rect(180, 695, 420, 715), "DA" => da(), "V" => s("") });
    fields.push(Object::Reference(widget(&mut doc, name)));
    let mut notes = common(page_id);
    notes.extend(&dictionary! { "FT" => "Tx", "T" => s("notes"), "Ff" => 4096, "Rect" => rect(180, 600, 420, 655), "DA" => da(), "V" => s("") });
    fields.push(Object::Reference(widget(&mut doc, notes)));
    let mut agree = common(page_id);
    agree.extend(&dictionary! { "FT" => "Btn", "T" => s("agree"), "Rect" => rect(180, 555, 195, 570), "V" => "Off", "AS" => "Off",
        "MK" => dictionary! { "CA" => s("4") } });
    fields.push(Object::Reference(widget(&mut doc, agree)));
    // Radio group: a parent field with two kid widgets.
    let radio_id = doc.new_object_id();
    let mut kids = Vec::new();
    for (i, export) in ["S", "M"].iter().enumerate() {
        let mut kid = common(page_id);
        let x = 180 + (i as i64) * 60;
        kid.extend(&dictionary! { "Parent" => radio_id, "Rect" => rect(x, 515, x + 15, 530), "AS" => "Off",
            "AP" => dictionary! { "N" => dictionary! { *export => Object::Null, "Off" => Object::Null } } });
        kids.push(Object::Reference(widget(&mut doc, kid)));
    }
    doc.objects.insert(radio_id, Object::Dictionary(dictionary! {
        "FT" => "Btn", "T" => s("size"), "Ff" => 49152, "V" => "Off", "Kids" => kids,
    }));
    fields.push(Object::Reference(radio_id));
    let opts = |v: &[&str]| Object::Array(v.iter().map(|o| s(o)).collect());
    let mut country = common(page_id);
    country.extend(&dictionary! { "FT" => "Ch", "T" => s("country"), "Ff" => 131072, "Rect" => rect(180, 475, 420, 495), "DA" => da(),
        "Opt" => opts(&["Netherlands", "Belgium", "Germany"]), "V" => s("") });
    fields.push(Object::Reference(widget(&mut doc, country)));
    let mut colours = common(page_id);
    colours.extend(&dictionary! { "FT" => "Ch", "T" => s("colours"), "Rect" => rect(180, 380, 420, 460), "DA" => da(),
        "Opt" => opts(&["Red", "Green", "Blue"]), "V" => s("") });
    fields.push(Object::Reference(widget(&mut doc, colours)));

    doc.objects.insert(page_id, Object::Dictionary(dictionary! {
        "Type" => "Page", "Parent" => pages_id, "MediaBox" => rect(0, 0, 612, 792), "Contents" => content_id,
        "Resources" => dictionary! { "Font" => dictionary! { "F1" => font_id } }, "Annots" => annots,
    }));
    doc.objects.insert(pages_id, Object::Dictionary(dictionary! { "Type" => "Pages", "Kids" => vec![page_id.into()], "Count" => 1 }));
    let acro = doc.add_object(dictionary! {
        "Fields" => fields, "NeedAppearances" => true,
        "DR" => dictionary! { "Font" => dictionary! { "Helv" => font_id } }, "DA" => s("/Helv 11 Tf 0 g"),
    });
    let catalog = doc.add_object(dictionary! { "Type" => "Catalog", "Pages" => pages_id, "AcroForm" => acro });
    doc.trailer.set("Root", catalog);
    doc.compress();
    doc.save(out).map(|_| ()).map_err(|e| e.to_string())
}

fn open_or_exit(path: &str, password: Option<&str>) -> OpenDocument {
    OpenDocument::open_with_password(path, password).unwrap_or_else(|e| {
        eprintln!("pdfcheck: cannot open {path}: {e}");
        std::process::exit(1)
    })
}

fn inspect_cmd(args: &[String]) {
    let mut file: Option<&str> = None;
    let mut password: Option<&str> = None;
    let mut needles: Vec<&str> = Vec::new();
    let mut i = 0;
    while i < args.len() {
        match args[i].as_str() {
            "--password" => {
                password = Some(args.get(i + 1).map(String::as_str).unwrap_or_else(|| usage()));
                i += 2;
            }
            "--needle" => {
                needles.push(args.get(i + 1).map(String::as_str).unwrap_or_else(|| usage()));
                i += 2;
            }
            other if file.is_none() && !other.starts_with("--") => {
                file = Some(other);
                i += 1;
            }
            _ => usage(),
        }
    }
    let Some(file) = file else { usage() };
    let bytes = match std::fs::read(file) {
        Ok(b) => b,
        Err(e) => {
            eprintln!("pdfcheck: cannot read {file}: {e}");
            std::process::exit(2);
        }
    };
    let report = inspect(Path::new(file), &bytes, password, &needles);
    println!("{}", serde_json::to_string_pretty(&report).expect("report serialises"));
}

fn contains(hay: &[u8], needle: &[u8]) -> bool {
    !needle.is_empty() && hay.len() >= needle.len() && hay.windows(needle.len()).any(|w| w == needle)
}

/// The forms a word takes inside a PDF without a font-specific encoding.
fn needle_forms(word: &str) -> Vec<(&'static str, Vec<u8>)> {
    let utf16: Vec<u8> = word.encode_utf16().flat_map(|u| u.to_be_bytes()).collect();
    let hex: String = word.bytes().map(|b| format!("{b:02X}")).collect();
    vec![
        ("ascii", word.as_bytes().to_vec()),
        ("utf-16be", utf16),
        ("hex", hex.clone().into_bytes()),
        ("hex-lower", hex.to_lowercase().into_bytes()),
    ]
}

fn collect_strings(obj: &lopdf::Object, out: &mut Vec<Vec<u8>>) {
    match obj {
        lopdf::Object::String(bytes, _) | lopdf::Object::Name(bytes) => out.push(bytes.clone()),
        lopdf::Object::Array(items) => items.iter().for_each(|o| collect_strings(o, out)),
        lopdf::Object::Dictionary(d) => d.iter().for_each(|(_, v)| collect_strings(v, out)),
        lopdf::Object::Stream(stream) => {
            stream.dict.iter().for_each(|(_, v)| collect_strings(v, out));
            out.push(stream.decompressed_content().unwrap_or_else(|_| stream.content.clone()));
        }
        _ => {}
    }
}

fn name_of(obj: Option<&lopdf::Object>) -> Option<String> {
    match obj? {
        lopdf::Object::Name(n) => Some(String::from_utf8_lossy(n).into_owned()),
        _ => None,
    }
}

fn text_of(obj: &lopdf::Object) -> Option<String> {
    match obj {
        lopdf::Object::String(bytes, _) => {
            if bytes.starts_with(&[0xFE, 0xFF]) {
                let units: Vec<u16> = bytes[2..]
                    .chunks(2)
                    .filter(|c| c.len() == 2)
                    .map(|c| u16::from_be_bytes([c[0], c[1]]))
                    .collect();
                Some(String::from_utf16_lossy(&units))
            } else {
                Some(String::from_utf8_lossy(bytes).into_owned())
            }
        }
        lopdf::Object::Name(n) => Some(String::from_utf8_lossy(n).into_owned()),
        lopdf::Object::Integer(i) => Some(i.to_string()),
        lopdf::Object::Boolean(b) => Some(b.to_string()),
        _ => None,
    }
}

/// Every font dictionary in the file: its name, subtype, and whether the font
/// program is in the file (a `FontFile*` in its descriptor, or in the
/// descriptor of the CID font a Type0 font points at).
fn font_view(raw: &lopdf::Document) -> Vec<Value> {
    fn program_in(raw: &lopdf::Document, font: &lopdf::Dictionary) -> bool {
        let desc = match font.get(b"FontDescriptor") {
            Ok(lopdf::Object::Reference(r)) => raw.get_dictionary(*r).ok(),
            Ok(lopdf::Object::Dictionary(d)) => Some(d),
            _ => None,
        };
        desc.is_some_and(|d| {
            d.get(b"FontFile").is_ok() || d.get(b"FontFile2").is_ok() || d.get(b"FontFile3").is_ok()
        })
    }
    let mut out = Vec::new();
    for obj in raw.objects.values() {
        let lopdf::Object::Dictionary(d) = obj else { continue };
        if name_of(d.get(b"Type").ok()).as_deref() != Some("Font") {
            continue;
        }
        let subtype = name_of(d.get(b"Subtype").ok());
        let mut embedded = program_in(raw, d);
        if subtype.as_deref() == Some("Type0") {
            if let Ok(lopdf::Object::Array(a)) = d.get(b"DescendantFonts") {
                for item in a {
                    let desc = match item {
                        lopdf::Object::Reference(r) => raw.get_dictionary(*r).ok(),
                        lopdf::Object::Dictionary(x) => Some(x),
                        _ => None,
                    };
                    if desc.is_some_and(|x| program_in(raw, x)) {
                        embedded = true;
                    }
                }
            }
        }
        out.push(json!({ "base_font": name_of(d.get(b"BaseFont").ok()), "subtype": subtype, "embedded": embedded }));
    }
    out
}

/// What `lopdf` sees, independent of the editor's own reader.
fn raw_view(raw: &lopdf::Document) -> Value {
    let mut annots = Vec::new();
    for (page_no, page_id) in raw.get_pages() {
        let Ok(page) = raw.get_dictionary(page_id) else { continue };
        let rotate = page.get(b"Rotate").ok().and_then(|o| o.as_i64().ok()).unwrap_or(0);
        let list = match page.get(b"Annots") {
            Ok(lopdf::Object::Array(a)) => a.clone(),
            Ok(lopdf::Object::Reference(r)) => match raw.get_object(*r) {
                Ok(lopdf::Object::Array(a)) => a.clone(),
                _ => Vec::new(),
            },
            _ => Vec::new(),
        };
        let mut subtypes = Vec::new();
        for item in list {
            let dict = match &item {
                lopdf::Object::Reference(r) => raw.get_dictionary(*r).ok(),
                lopdf::Object::Dictionary(d) => Some(d),
                _ => None,
            };
            if let Some(d) = dict {
                subtypes.push(json!({
                    "subtype": name_of(d.get(b"Subtype").ok()),
                    "contents": d.get(b"Contents").ok().and_then(text_of),
                }));
            }
        }
        annots.push(json!({ "page": page_no - 1, "rotate": rotate, "annotations": subtypes }));
    }

    let mut info = serde_json::Map::new();
    if let Ok(obj) = raw.trailer.get(b"Info") {
        let dict = match obj {
            lopdf::Object::Reference(r) => raw.get_dictionary(*r).ok(),
            lopdf::Object::Dictionary(d) => Some(d),
            _ => None,
        };
        if let Some(d) = dict {
            for (k, v) in d.iter() {
                if let Some(t) = text_of(v) {
                    info.insert(String::from_utf8_lossy(k).into_owned(), Value::String(t));
                }
            }
        }
    }
    let has_xmp = raw
        .catalog()
        .ok()
        .is_some_and(|c| c.get(b"Metadata").is_ok());
    let acroform = raw.catalog().ok().and_then(|c| c.get(b"AcroForm").ok()).is_some();

    json!({
        "pages": annots,
        "fonts": font_view(raw),
        "images": raw
            .objects
            .values()
            .filter(|o| matches!(o, lopdf::Object::Stream(s) if name_of(s.dict.get(b"Subtype").ok()).as_deref() == Some("Image")))
            .count(),
        "info": info,
        "has_xmp": has_xmp,
        "has_acroform": acroform,
        "has_prev": raw.trailer.get(b"Prev").is_ok(),
        "object_count": raw.objects.len(),
    })
}

fn inspect(path: &Path, bytes: &[u8], password: Option<&str>, needles: &[&str]) -> Value {
    let p = path.to_string_lossy().into_owned();
    let eof_markers = bytes.windows(5).filter(|w| w == b"%%EOF").count();
    let header = bytes
        .iter()
        .take(16)
        .take_while(|b| **b != b'\n' && **b != b'\r')
        .map(|b| *b as char)
        .collect::<String>();
    let encrypt_in_bytes = contains(bytes, b"/Encrypt");

    // Without a password first: a file that opens without one is not
    // protected against opening, whatever its dictionary says.
    let without = OpenDocument::open(&p);
    let needs_password = matches!(&without, Err(e) if e.starts_with("password-required"));
    let opened = match (password, without) {
        (Some(pw), _) => OpenDocument::open_with_password(&p, Some(pw)),
        (None, r) => r,
    };

    let raw = lopdf::Document::load_mem(bytes);
    let raw_json = match &raw {
        Ok(doc) => raw_view(doc),
        Err(e) => json!({ "error": e.to_string() }),
    };

    let mut needle_reports = Vec::new();
    let mut strings: Vec<Vec<u8>> = Vec::new();
    if let Ok(doc) = &raw {
        for obj in doc.objects.values() {
            collect_strings(obj, &mut strings);
        }
    }

    let mut report = json!({
        "path": p,
        "bytes": bytes.len(),
        "header": header,
        "revisions": eof_markers,
        "encrypt_dictionary": encrypt_in_bytes,
        "needs_password": needs_password,
        "raw": raw_json,
    });

    match opened {
        Err(e) => {
            report["opens"] = json!(false);
            report["open_error"] = json!(e);
            for word in needles {
                needle_reports.push(json!({
                    "needle": word,
                    "raw_bytes": needle_forms(word).iter().any(|(_, n)| contains(bytes, n)),
                    "objects": needle_forms(word).iter().any(|(_, n)| strings.iter().any(|s| contains(s, n))),
                    "pages": Value::Null,
                }));
            }
        }
        Ok(mut doc) => {
            report["opens"] = json!(true);
            report["open_error"] = Value::Null;
            let count = doc.page_count();
            let mut pages = Vec::new();
            for i in 0..count as u32 {
                let text = doc.extract_page_text(i).unwrap_or_else(|e| format!("<text error: {e}>"));
                pages.push(json!({ "index": i, "text": text }));
            }
            for word in needles {
                let lower = word.to_lowercase();
                let on_pages: Vec<usize> = pages
                    .iter()
                    .enumerate()
                    .filter(|(_, pg)| pg["text"].as_str().unwrap_or("").to_lowercase().contains(&lower))
                    .map(|(i, _)| i)
                    .collect();
                needle_reports.push(json!({
                    "needle": word,
                    "raw_bytes": needle_forms(word).iter().any(|(_, n)| contains(bytes, n)),
                    "objects": needle_forms(word).iter().any(|(_, n)| strings.iter().any(|s| contains(s, n))),
                    "pages": on_pages,
                }));
            }
            report["page_count"] = json!(count);
            report["pages"] = json!(pages);
            report["info"] = serde_json::to_value(doc.document_info()).unwrap_or(Value::Null);
            report["annotations"] = serde_json::to_value(doc.get_all_annotations()).unwrap_or(Value::Null);
            report["form_fields"] = serde_json::to_value(doc.get_form_fields()).unwrap_or(Value::Null);
            report["is_signed"] = json!(doc.is_signed());
            report["signatures"] = serde_json::to_value(doc.verify_signatures()).unwrap_or(Value::Null);
            // Spans are read last: they may cache on the document.
            let spans = doc.extract_page_text_spans(0).map(|s| s.len()).unwrap_or(0);
            report["first_page_spans"] = json!(spans);
        }
    }
    report["needles"] = json!(needle_reports);
    report
}
