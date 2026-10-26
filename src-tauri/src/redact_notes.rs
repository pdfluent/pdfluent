// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary. The PDFluent application is free to use,
// including for commercial purposes. Redistribution, or extraction or reuse
// of its components (including the embedded PDF engine), requires a licence.
// See https://pdfluent.com/license for terms.

//! Notes that quote redacted text go with it.
//!
//! The engine removes the text from page content. A comment someone wrote on
//! that text ("see operation here") is an annotation, and its words live in the
//! annotation dictionary, not in the content. Left alone, the redacted word is
//! still in the saved file.

use lopdf::{Document, Object, ObjectId};

/// The text of a PDF text string: UTF-16BE with a byte order mark, or one byte
/// per character (PDFDocEncoding agrees with Latin-1 for the letters a search
/// term is made of).
fn text_of(bytes: &[u8]) -> String {
    if let Some(rest) = bytes.strip_prefix(&[0xFE, 0xFF]) {
        let units: Vec<u16> = rest.as_chunks::<2>().0.iter().map(|c| u16::from_be_bytes(*c)).collect();
        String::from_utf16_lossy(&units)
    } else {
        bytes.iter().map(|&b| b as char).collect()
    }
}

fn quotes(doc: &Document, annot: &Object, needle: &str) -> bool {
    let Ok(dict) = annot.as_dict() else { return false };
    [&b"Contents"[..], b"RC", b"Subj", b"T"].iter().any(|key| {
        let Ok(value) = dict.get(key) else { return false };
        let value = match value {
            Object::Reference(id) => match doc.get_object(*id) {
                Ok(o) => o,
                Err(_) => return false,
            },
            other => other,
        };
        match value {
            Object::String(bytes, _) => text_of(bytes).to_lowercase().contains(needle),
            _ => false,
        }
    })
}

/// Remove every annotation whose text, rich text, subject or author contains
/// `query` (case-insensitive), from its page and from the file. Returns how many.
pub fn drop_notes_quoting(doc: &mut Document, query: &str) -> usize {
    let needle = query.trim().to_lowercase();
    if needle.is_empty() {
        return 0;
    }
    let mut dropped = 0;
    let pages: Vec<ObjectId> = doc.get_pages().values().copied().collect();
    for page_id in pages {
        let annots = match doc.get_object(page_id).and_then(|p| p.as_dict()).and_then(|d| d.get(b"Annots")) {
            Ok(o) => o.clone(),
            Err(_) => continue,
        };
        let (list_id, items) = match annots {
            Object::Reference(id) => match doc.get_object(id).and_then(|o| o.as_array()) {
                Ok(a) => (Some(id), a.clone()),
                Err(_) => continue,
            },
            Object::Array(a) => (None, a),
            _ => continue,
        };
        let mut keep = Vec::with_capacity(items.len());
        for item in items {
            let hit = match &item {
                Object::Reference(id) => doc.get_object(*id).map(|o| quotes(doc, o, &needle)).unwrap_or(false),
                other => quotes(doc, other, &needle),
            };
            if hit {
                dropped += 1;
                if let Object::Reference(id) = item {
                    doc.delete_object(id);
                }
            } else {
                keep.push(item);
            }
        }
        match list_id {
            Some(id) => {
                if let Ok(Object::Array(a)) = doc.get_object_mut(id) {
                    *a = keep;
                }
            }
            None => {
                if let Ok(Object::Dictionary(d)) = doc.get_object_mut(page_id) {
                    d.set("Annots", Object::Array(keep));
                }
            }
        }
    }
    dropped
}
