// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary. The PDFluent application is free to use,
// including for commercial purposes. Redistribution, or extraction or reuse
// of its components (including the embedded PDF engine), requires a licence.
// See https://pdfluent.com/license for terms.

//! Rewrite one text run in a different, embedded typeface.
//!
//! The engine's `unicode_font` writer does the font work: it subsets the
//! program to the glyphs the text uses, writes a Type0 / `Identity-H` font with
//! `/FontFile2` (TrueType) or `/FontFile3` (CFF) and a `/ToUnicode` map, and
//! hands back the 2-byte codes to show. This module does the page work around
//! it:
//!
//! * the run's text-showing operator becomes `Tf /new size` + `Tj <codes>` +
//!   `Tf /old size`, so the text after the run keeps its own font;
//! * the font resource gets a name of its own, because the writer always
//!   registers under one fixed name and a second typeface on the same page
//!   would otherwise replace the first;
//! * a page that inherits its resources gets its own copy first, because the
//!   writer creates a fresh `/Resources` on a page without one and the page
//!   would lose its inherited fonts and images.

use crate::system_fonts::{FontRefusal, LoadedFace};
use lopdf::content::Operation;
use lopdf::{Dictionary, Document, Object, ObjectId, StringFormat};
use pdf_manip::content_editor::{editor_for_page, write_editor_to_page};
use pdf_manip::text_run::TextRun;
use pdf_manip::unicode_font::{UnicodeEncoder, UnicodeFont};

/// The engine's fixed resource name for its Unicode font.
const ENGINE_RESOURCE: &[u8] = b"F__Uni";

/// Resource-name prefix for typefaces chosen by the user.
const OUR_PREFIX: &str = "PFSys";

/// What [`apply_face_to_run`] wrote.
#[derive(Debug, Clone)]
pub struct FontChange {
    /// Page resource name of the embedded font.
    pub resource: String,
}

fn unusable(face: &LoadedFace, detail: impl Into<String>) -> FontRefusal {
    FontRefusal::FontUnusable { family: face.family.clone(), detail: detail.into() }
}

/// Write `run` (on 1-based `page_num`) in `face`. Every refusal the user can
/// meet (licence, missing glyphs, an operator this cannot rewrite) is decided
/// before the first write, so a refused change leaves the document as it was.
pub fn apply_face_to_run(
    doc: &mut Document,
    page_num: u32,
    run: &TextRun,
    face: &LoadedFace,
) -> Result<FontChange, FontRefusal> {
    let font = UnicodeFont::from_bytes(face.program.clone()).map_err(|e| unusable(face, e.to_string()))?;
    let missing = font.missing_chars(&run.text);
    if !missing.is_empty() {
        return Err(FontRefusal::MissingGlyphs {
            family: face.family.clone(),
            characters: missing.into_iter().collect(),
        });
    }

    let mut editor = editor_for_page(doc, page_num).map_err(|e| unusable(face, e.to_string()))?;
    let ops = editor.operations().to_vec();
    let at = run.ops_range.start;
    let show = ops.get(at).ok_or_else(|| unusable(face, "the run's operator is not on the page"))?;
    let (active_name, active_size) = ops[..at]
        .iter()
        .rev()
        .find(|op| op.operator == "Tf" && op.operands.len() == 2)
        .map(|op| (op.operands[0].clone(), op.operands[1].clone()))
        .ok_or_else(|| unusable(face, "no font is selected before the run"))?;

    let mut replacement = Vec::new();
    match show.operator.as_str() {
        "Tj" | "TJ" => {}
        "'" => replacement.push(Operation::new("T*", vec![])),
        "\"" if show.operands.len() == 3 => {
            replacement.push(Operation::new("Tw", vec![show.operands[0].clone()]));
            replacement.push(Operation::new("Tc", vec![show.operands[1].clone()]));
            replacement.push(Operation::new("T*", vec![]));
        }
        other => return Err(unusable(face, format!("unexpected text operator {other:?}"))),
    }
    let mut encoder = UnicodeEncoder::new(font);
    let codes = encoder.encode(&run.text).map_err(|e| unusable(face, e.to_string()))?;

    let page_id = *doc
        .get_pages()
        .get(&page_num)
        .ok_or_else(|| unusable(face, "page not found"))?;
    own_resources(doc, page_id);
    let previous_engine_font = font_entry(doc, page_id, ENGINE_RESOURCE);
    encoder.embed(doc, page_num).map_err(|e| unusable(face, e.to_string()))?;
    let embedded = font_entry(doc, page_id, ENGINE_RESOURCE)
        .ok_or_else(|| unusable(face, "the embedded font is not in the page resources"))?;
    let resource = {
        let fonts = font_dict_mut(doc, page_id)
            .ok_or_else(|| unusable(face, "the page has no font resources"))?;
        let mut n = 1;
        let name = loop {
            let candidate = format!("{OUR_PREFIX}{n}");
            if !fonts.has(candidate.as_bytes()) {
                break candidate;
            }
            n += 1;
        };
        fonts.set(name.as_bytes(), embedded);
        match previous_engine_font {
            Some(prev) => fonts.set(ENGINE_RESOURCE, prev),
            None => {
                fonts.remove(ENGINE_RESOURCE);
            }
        }
        name
    };

    replacement.push(Operation::new("Tf", vec![Object::Name(resource.as_bytes().to_vec()), active_size.clone()]));
    replacement.push(Operation::new("Tj", vec![Object::String(codes, StringFormat::Hexadecimal)]));
    replacement.push(Operation::new("Tf", vec![active_name, active_size]));
    editor.replace_operation(at, replacement);
    write_editor_to_page(doc, page_num, &editor).map_err(|e| unusable(face, e.to_string()))?;
    Ok(FontChange { resource })
}

/// A typed text embedded as a subset font for use in an appearance stream.
#[derive(Debug, Clone)]
pub struct EmbeddedText {
    /// The Type0 font object.
    pub font: ObjectId,
    /// The 2-byte codes to show with `Tj`.
    pub codes: Vec<u8>,
    /// Advance width of the text in em (multiply by the font size).
    pub width_em: f64,
}

/// Subset `face` to the glyphs of `text` and write the font, through the same
/// writer [`apply_face_to_run`] uses. The writer registers the font in the
/// resources of `page_num`; this takes the object and puts the page's
/// resources back as they were, because the caller uses the font from an
/// annotation's appearance stream, not from the page.
pub fn embed_text_for_appearance(
    doc: &mut Document,
    page_num: u32,
    text: &str,
    face: &LoadedFace,
) -> Result<EmbeddedText, FontRefusal> {
    let font = UnicodeFont::from_bytes(face.program.clone()).map_err(|e| unusable(face, e.to_string()))?;
    let missing = font.missing_chars(text);
    if !missing.is_empty() {
        return Err(FontRefusal::MissingGlyphs { family: face.family.clone(), characters: missing.into_iter().collect() });
    }
    let mut encoder = UnicodeEncoder::new(font);
    let codes = encoder.encode(text).map_err(|e| unusable(face, e.to_string()))?;
    let width_em = encoder.width_em(text);
    let page_id = *doc.get_pages().get(&page_num).ok_or_else(|| unusable(face, "page not found"))?;
    own_resources(doc, page_id);
    let previous = font_entry(doc, page_id, ENGINE_RESOURCE);
    encoder.embed(doc, page_num).map_err(|e| unusable(face, e.to_string()))?;
    let embedded = font_entry(doc, page_id, ENGINE_RESOURCE)
        .and_then(|o| o.as_reference().ok())
        .ok_or_else(|| unusable(face, "the embedded font is not in the page resources"))?;
    if let Some(fonts) = font_dict_mut(doc, page_id) {
        match previous {
            Some(prev) => fonts.set(ENGINE_RESOURCE, prev),
            None => {
                fonts.remove(ENGINE_RESOURCE);
            }
        }
    }
    Ok(EmbeddedText { font: embedded, codes, width_em })
}

/// Give a page that inherits `/Resources` from its page tree a copy of its own.
fn own_resources(doc: &mut Document, page_id: ObjectId) {
    let has_own = doc
        .get_dictionary(page_id)
        .map(|d| d.has(b"Resources"))
        .unwrap_or(true);
    if has_own {
        return;
    }
    let mut node = doc.get_dictionary(page_id).ok().and_then(|d| d.get(b"Parent").ok()).cloned();
    let mut inherited = None;
    for _ in 0..64 {
        let Some(Object::Reference(id)) = node else { break };
        let Ok(dict) = doc.get_dictionary(id) else { break };
        if let Ok(res) = dict.get(b"Resources") {
            inherited = Some(match res {
                Object::Reference(r) => doc.get_dictionary(*r).ok().cloned().map(Object::Dictionary),
                other => Some(other.clone()),
            });
            break;
        }
        node = dict.get(b"Parent").ok().cloned();
    }
    if let Some(Some(res)) = inherited {
        if let Ok(page) = doc.get_dictionary_mut(page_id) {
            page.set("Resources", res);
        }
    }
}

/// The page's own `/Resources /Font` dictionary, wherever it lives.
fn font_dict_mut(doc: &mut Document, page_id: ObjectId) -> Option<&mut Dictionary> {
    let resources = doc.get_dictionary(page_id).ok()?.get(b"Resources").ok()?.clone();
    let font_obj = match &resources {
        Object::Reference(id) => doc.get_dictionary(*id).ok()?.get(b"Font").ok()?.clone(),
        Object::Dictionary(d) => d.get(b"Font").ok()?.clone(),
        _ => return None,
    };
    match (resources, font_obj) {
        (_, Object::Reference(font_id)) => doc.get_dictionary_mut(font_id).ok(),
        (Object::Reference(res_id), Object::Dictionary(_)) => {
            doc.get_dictionary_mut(res_id).ok()?.get_mut(b"Font").ok()?.as_dict_mut().ok()
        }
        (Object::Dictionary(_), Object::Dictionary(_)) => doc
            .get_dictionary_mut(page_id)
            .ok()?
            .get_mut(b"Resources")
            .ok()?
            .as_dict_mut()
            .ok()?
            .get_mut(b"Font")
            .ok()?
            .as_dict_mut()
            .ok(),
        _ => None,
    }
}

fn font_entry(doc: &mut Document, page_id: ObjectId, name: &[u8]) -> Option<Object> {
    font_dict_mut(doc, page_id)?.get(name).ok().cloned()
}
