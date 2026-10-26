// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary. The PDFluent application is free to use,
// including for commercial purposes. Redistribution, or extraction or reuse
// of its components (including the embedded PDF engine), requires a licence.
// See https://pdfluent.com/license for terms.

//! The handwriting-style fonts that ship with the editor for typed
//! signatures (#725).
//!
//! `resources/fonts/signature/manifest.json` is the list: one entry per font
//! with the file and the licence text that travels with it. Every font here is
//! under the SIL Open Font License, which allows bundling and embedding a
//! subset in a PDF; the licence file is the one the foundry published and is
//! listed in `THIRD_PARTY.md`. A font is embedded through the same writer the
//! system font picker uses (`text_font`), so it is subset to the glyphs of the
//! typed name on save.

use crate::system_fonts::{load_face, FontRefusal, LoadedFace};
use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use std::sync::OnceLock;

static RESOURCE_DIR: OnceLock<PathBuf> = OnceLock::new();

/// Where the bundled fonts live in the installed app. Called once at start-up
/// with the app's resource directory.
pub fn set_resource_dir(dir: PathBuf) {
    if RESOURCE_DIR.set(dir).is_err() {
        eprintln!("signature fonts: the resource directory was already set; keeping the first");
    }
}

/// The directory the manifest is read from: the installed app's, else (tests,
/// `cargo run`) the source tree's.
pub fn font_dir() -> PathBuf {
    RESOURCE_DIR
        .get()
        .cloned()
        .unwrap_or_else(|| PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("resources").join("fonts").join("signature"))
}

#[derive(Debug, Clone, Deserialize)]
pub struct ManifestEntry {
    pub id: String,
    pub family: String,
    /// Font file, relative to the manifest.
    pub file: String,
    /// Licence text file, relative to the manifest.
    pub licence: String,
    /// SHA-256 of the font file (hex), recorded when the file was added.
    pub sha256: String,
}

/// What the UI needs to offer a font.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SignatureFont {
    pub id: String,
    pub family: String,
}

/// The manifest as written. An unreadable manifest is an empty list, and the
/// UI then offers the plain typed signature.
pub fn manifest() -> Vec<ManifestEntry> {
    let path = font_dir().join("manifest.json");
    let parsed = std::fs::read(&path)
        .map_err(|e| e.to_string())
        .and_then(|b| serde_json::from_slice(&b).map_err(|e| e.to_string()));
    match parsed {
        Ok(entries) => entries,
        Err(e) => {
            eprintln!("signature fonts: {} is not usable: {e}", path.display());
            Vec::new()
        }
    }
}

/// The fonts the UI may offer: those whose file is actually in the install.
pub fn list() -> Vec<SignatureFont> {
    let dir = font_dir();
    manifest()
        .into_iter()
        .filter(|e| dir.join(&e.file).is_file())
        .map(|e| SignatureFont { id: e.id, family: e.family })
        .collect()
}

/// The font `id`, read from disk and checked against its embedding licence.
pub fn load(id: &str) -> Result<LoadedFace, FontRefusal> {
    let entry = manifest()
        .into_iter()
        .find(|e| e.id == id)
        .ok_or_else(|| FontRefusal::FontNotFound { font_id: id.to_string() })?;
    load_face(&font_dir().join(&entry.file), 0, &entry.family)
}

/// The font file as base64, for the signature dialog's preview in the same
/// face the PDF gets.
pub fn file_base64(id: &str) -> Result<String, String> {
    use base64::Engine as _;
    let entry = manifest().into_iter().find(|e| e.id == id).ok_or_else(|| format!("Unknown signature font: {id}"))?;
    let bytes = std::fs::read(font_dir().join(entry.file)).map_err(|e| format!("The signature font could not be read: {e}"))?;
    Ok(base64::engine::general_purpose::STANDARD.encode(bytes))
}
