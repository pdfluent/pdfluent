// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary. The PDFluent application is free to use,
// including for commercial purposes. Redistribution, or extraction or reuse
// of its components (including the embedded PDF engine), requires a licence.
// See https://pdfluent.com/license for terms.

//! The fonts installed on this computer, and whether each one may be embedded
//! in a PDF.
//!
//! Changing the typeface of edited text writes the chosen font program into
//! the saved file. That is redistribution of the font, so the font's own
//! licence flags decide, not the user's wish: a face that forbids embedding is
//! refused with a [`FontRefusal`] the UI shows, never swapped for something
//! else behind the user's back.
//!
//! # The embedding decision (OpenType `OS/2.fsType`)
//!
//! See [`embedding_decision`]. In short, following the OpenType specification
//! (OS/2 table, `fsType`):
//!
//! | bits            | meaning                         | here      |
//! |-----------------|---------------------------------|-----------|
//! | `0x0000`        | installable embedding           | allowed   |
//! | `0x0002`        | restricted licence embedding    | refused   |
//! | `0x0004`        | preview & print embedding       | allowed   |
//! | `0x0008`        | editable embedding              | allowed   |
//! | `0x0100`        | no subsetting                   | refused   |
//! | `0x0200`        | bitmap embedding only           | refused   |
//!
//! When more than one of bits 0-3 is set (fonts older than OS/2 version 3 do
//! this), the specification says the least restrictive one applies, so
//! `0x0006` is preview & print, not restricted.
//!
//! Preview & print is accepted on purpose: it permits embedding in a document
//! that is distributed for viewing and printing, which is what a saved PDF is.
//! The writer only ever embeds a *subset*, so a face that says "no subsetting"
//! is refused rather than embedded whole against our own size policy, and a
//! face that only permits bitmap embedding is refused because the writer
//! embeds outlines. A face without an `OS/2` table states no licence at all and
//! is refused too: silence is not permission.

use serde::Serialize;
use std::collections::BTreeMap;
use std::io::{Read, Seek, SeekFrom};
use std::path::{Path, PathBuf};
use std::sync::OnceLock;

/// `fsType` bit: restricted licence embedding.
pub const FS_RESTRICTED: u16 = 0x0002;
/// `fsType` bit: preview & print embedding.
pub const FS_PREVIEW_PRINT: u16 = 0x0004;
/// `fsType` bit: editable embedding.
pub const FS_EDITABLE: u16 = 0x0008;
/// `fsType` bit: the font may not be subsetted before embedding.
pub const FS_NO_SUBSETTING: u16 = 0x0100;
/// `fsType` bit: only bitmaps contained in the font may be embedded.
pub const FS_BITMAP_ONLY: u16 = 0x0200;

/// What a font's licence lets the writer do, when it lets it embed at all.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "kebab-case")]
pub enum EmbeddingRights {
    Installable,
    Editable,
    PreviewAndPrint,
}

/// Why a face may not be embedded.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "kebab-case")]
pub enum EmbeddingRefusal {
    /// `fsType` 0x0002 without a less restrictive bit: the licence forbids it.
    Restricted,
    /// `fsType` 0x0200: only bitmaps may be embedded; the writer embeds outlines.
    BitmapOnly,
    /// `fsType` 0x0100: the writer always subsets, the font forbids that.
    NoSubsetting,
    /// No `OS/2` table, so the font states no embedding licence.
    NoLicenceInformation,
}

/// The fsType decision. Pure, so it is tested on crafted values.
pub fn embedding_decision(fs_type: u16) -> Result<EmbeddingRights, EmbeddingRefusal> {
    let usage = fs_type & 0x000F;
    // Least restrictive usage bit wins (OpenType spec, fsType, bits 0-3).
    let rights = if usage & FS_EDITABLE != 0 {
        EmbeddingRights::Editable
    } else if usage & FS_PREVIEW_PRINT != 0 {
        EmbeddingRights::PreviewAndPrint
    } else if usage & FS_RESTRICTED != 0 {
        return Err(EmbeddingRefusal::Restricted);
    } else {
        // 0, or only the reserved bit 0: installable.
        EmbeddingRights::Installable
    };
    if fs_type & FS_BITMAP_ONLY != 0 {
        return Err(EmbeddingRefusal::BitmapOnly);
    }
    if fs_type & FS_NO_SUBSETTING != 0 {
        return Err(EmbeddingRefusal::NoSubsetting);
    }
    Ok(rights)
}

/// A typed refusal to change the typeface of a text run. Serialised with a
/// `code` tag so the UI can pick its sentence by code.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(tag = "code", rename_all = "kebab-case")]
pub enum FontRefusal {
    /// The font's licence does not permit what the writer has to do.
    #[serde(rename_all = "camelCase")]
    EmbeddingNotPermitted { family: String, reason: EmbeddingRefusal },
    /// No installed face has this id (uninstalled since the list was read).
    #[serde(rename_all = "camelCase")]
    FontNotFound { font_id: String },
    /// The font file could not be read or is not a usable outline font.
    #[serde(rename_all = "camelCase")]
    FontUnusable { family: String, detail: String },
    /// The font has no glyph for some of the characters of the text.
    #[serde(rename_all = "camelCase")]
    MissingGlyphs { family: String, characters: String },
    /// The text to restyle is not a run on that page.
    #[serde(rename_all = "camelCase")]
    TextNotFound { page_index: u32 },
}

impl std::fmt::Display for FontRefusal {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::EmbeddingNotPermitted { family, reason } => {
                write!(f, "font-embedding-not-permitted: {family} ({reason:?})")
            }
            Self::FontNotFound { font_id } => write!(f, "font-not-found: {font_id}"),
            Self::FontUnusable { family, detail } => write!(f, "font-unusable: {family}: {detail}"),
            Self::MissingGlyphs { family, characters } => {
                write!(f, "font-missing-glyphs: {family} lacks {characters:?}")
            }
            Self::TextNotFound { page_index } => write!(f, "text-not-found on page {page_index}"),
        }
    }
}

/// One installed face.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SystemFontFace {
    /// Stable id: the PostScript name.
    pub id: String,
    pub family: String,
    /// "Regular", "Bold", "Italic", "Bold Italic", "Light", ...
    pub style: String,
    pub weight: u16,
    pub italic: bool,
    pub embeddable: bool,
    /// Why not, when `embeddable` is false.
    pub refusal: Option<EmbeddingRefusal>,
    #[serde(skip)]
    pub path: PathBuf,
    #[serde(skip)]
    pub index: u32,
}

/// One family and its faces, regular first.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SystemFontFamily {
    pub family: String,
    pub faces: Vec<SystemFontFace>,
}

fn style_name(weight: u16, italic: bool) -> String {
    let w = match weight {
        0..=150 => "Thin",
        151..=250 => "Extra Light",
        251..=350 => "Light",
        351..=450 => "Regular",
        451..=550 => "Medium",
        551..=650 => "Semibold",
        651..=750 => "Bold",
        751..=850 => "Extra Bold",
        _ => "Black",
    };
    match (w, italic) {
        ("Regular", true) => "Italic".to_string(),
        (w, true) => format!("{w} Italic"),
        (w, false) => w.to_string(),
    }
}

/// Every installed outline face the OS font directories hold, grouped by
/// family and sorted by name. Read once per process: a font installed while
/// the app runs shows up after a restart.
pub fn list_system_fonts() -> &'static [SystemFontFamily] {
    static FAMILIES: OnceLock<Vec<SystemFontFamily>> = OnceLock::new();
    FAMILIES.get_or_init(scan_system_fonts)
}

fn scan_system_fonts() -> Vec<SystemFontFamily> {
    let mut db = fontdb::Database::new();
    db.load_system_fonts();
    let mut by_family: BTreeMap<String, Vec<SystemFontFace>> = BTreeMap::new();
    let mut seen_ids = std::collections::HashSet::new();
    for face in db.faces() {
        let fontdb::Source::File(path) = &face.source else { continue };
        let Some((family, _)) = face.families.first() else { continue };
        // Hidden system faces (".SF NS", ".Helvetica Neue DeskInterface") are
        // the OS's own UI fonts and not meant to be picked.
        if family.starts_with('.') || face.post_script_name.is_empty() {
            continue;
        }
        if !seen_ids.insert(face.post_script_name.clone()) {
            continue;
        }
        let decision = match read_fs_type_from_path(path, face.index) {
            Ok(Some(fs_type)) => embedding_decision(fs_type),
            Ok(None) => Err(EmbeddingRefusal::NoLicenceInformation),
            Err(_) => continue,
        };
        let italic = !matches!(face.style, fontdb::Style::Normal);
        by_family.entry(family.clone()).or_default().push(SystemFontFace {
            id: face.post_script_name.clone(),
            family: family.clone(),
            style: style_name(face.weight.0, italic),
            weight: face.weight.0,
            italic,
            embeddable: decision.is_ok(),
            refusal: decision.err(),
            path: path.clone(),
            index: face.index,
        });
    }
    by_family
        .into_iter()
        .map(|(family, mut faces)| {
            faces.sort_by_key(|f| (f.italic, f.weight.abs_diff(400), f.weight));
            SystemFontFamily { family, faces }
        })
        .collect()
}

/// The installed face with this id.
pub fn find_face(font_id: &str) -> Option<&'static SystemFontFace> {
    list_system_fonts().iter().flat_map(|f| f.faces.iter()).find(|f| f.id == font_id)
}

/// A face ready for the writer: its bytes as a standalone font program, after
/// the licence check.
pub struct LoadedFace {
    pub family: String,
    pub program: Vec<u8>,
    pub rights: EmbeddingRights,
}

/// Read a face from disk and check its licence. A collection member (`.ttc`)
/// is cut out into a standalone program, because the writer reads face 0.
pub fn load_face(path: &Path, index: u32, family: &str) -> Result<LoadedFace, FontRefusal> {
    let unusable = |detail: String| FontRefusal::FontUnusable { family: family.to_string(), detail };
    let data = std::fs::read(path).map_err(|e| unusable(format!("cannot read {}: {e}", path.display())))?;
    load_face_from_bytes(&data, index, family).map_err(|e| match e {
        FontRefusal::FontUnusable { detail, .. } => unusable(detail),
        other => other,
    })
}

/// [`load_face`] on bytes already in memory.
pub fn load_face_from_bytes(data: &[u8], index: u32, family: &str) -> Result<LoadedFace, FontRefusal> {
    let fs_type = read_fs_type(&mut std::io::Cursor::new(data), index).map_err(|e| {
        FontRefusal::FontUnusable { family: family.to_string(), detail: format!("not a font program: {e}") }
    })?;
    let rights = match fs_type {
        Some(v) => embedding_decision(v),
        None => Err(EmbeddingRefusal::NoLicenceInformation),
    }
    .map_err(|reason| FontRefusal::EmbeddingNotPermitted { family: family.to_string(), reason })?;
    let program = standalone_face(data, index).ok_or_else(|| FontRefusal::FontUnusable {
        family: family.to_string(),
        detail: format!("face {index} of the collection cannot be read"),
    })?;
    Ok(LoadedFace { family: family.to_string(), program, rights })
}

fn read_fs_type_from_path(path: &Path, index: u32) -> std::io::Result<Option<u16>> {
    let mut file = std::fs::File::open(path)?;
    read_fs_type(&mut file, index)
}

fn be_u16(b: &[u8], at: usize) -> Option<u16> {
    Some(u16::from_be_bytes([*b.get(at)?, *b.get(at + 1)?]))
}

fn be_u32(b: &[u8], at: usize) -> Option<u32> {
    Some(u32::from_be_bytes([*b.get(at)?, *b.get(at + 1)?, *b.get(at + 2)?, *b.get(at + 3)?]))
}

fn invalid(msg: &str) -> std::io::Error {
    std::io::Error::new(std::io::ErrorKind::InvalidData, msg.to_string())
}

fn read_exact_at<R: Read + Seek>(r: &mut R, at: u64, len: usize) -> std::io::Result<Vec<u8>> {
    r.seek(SeekFrom::Start(at))?;
    let mut buf = vec![0u8; len];
    r.read_exact(&mut buf)?;
    Ok(buf)
}

/// Offset of face `index`'s table directory: 0 for a single font, from the
/// header for a `ttcf` collection.
fn face_offset<R: Read + Seek>(r: &mut R, index: u32) -> std::io::Result<u64> {
    let head = read_exact_at(r, 0, 12)?;
    if &head[0..4] != b"ttcf" {
        return if index == 0 { Ok(0) } else { Err(invalid("face index past a single font")) };
    }
    let count = be_u32(&head, 8).ok_or_else(|| invalid("short ttc header"))?;
    if index >= count {
        return Err(invalid("face index past the collection"));
    }
    let off = read_exact_at(r, 12 + 4 * u64::from(index), 4)?;
    Ok(u64::from(be_u32(&off, 0).ok_or_else(|| invalid("short ttc offsets"))?))
}

/// `OS/2.fsType` of face `index`, reading only the directory and that table.
/// `Ok(None)` when the face has no `OS/2` table.
pub fn read_fs_type<R: Read + Seek>(r: &mut R, index: u32) -> std::io::Result<Option<u16>> {
    let base = face_offset(r, index)?;
    let dir = read_exact_at(r, base, 12)?;
    let version = be_u32(&dir, 0).ok_or_else(|| invalid("short directory"))?;
    if !matches!(version, 0x0001_0000 | 0x4F54_544F /* OTTO */ | 0x7472_7565 /* true */) {
        return Err(invalid("unknown sfnt version"));
    }
    let tables = be_u16(&dir, 4).ok_or_else(|| invalid("short directory"))?;
    let records = read_exact_at(r, base + 12, usize::from(tables) * 16)?;
    for rec in records.as_chunks::<16>().0 {
        if &rec[0..4] == b"OS/2" {
            let offset = be_u32(rec, 8).ok_or_else(|| invalid("short record"))?;
            let length = be_u32(rec, 12).ok_or_else(|| invalid("short record"))?;
            if length < 10 {
                return Err(invalid("OS/2 table too short for fsType"));
            }
            let table = read_exact_at(r, u64::from(offset), 10)?;
            return Ok(be_u16(&table, 8));
        }
    }
    Ok(None)
}

/// Face `index` as a standalone sfnt. A single font is returned as is; a
/// collection member gets its own header and a copy of the tables it uses.
pub fn standalone_face(data: &[u8], index: u32) -> Option<Vec<u8>> {
    if data.get(0..4)? != b"ttcf" {
        return (index == 0).then(|| data.to_vec());
    }
    let count = be_u32(data, 8)?;
    if index >= count {
        return None;
    }
    let base = be_u32(data, 12 + 4 * index as usize)? as usize;
    let version = be_u32(data, base)?;
    let tables = usize::from(be_u16(data, base + 4)?);
    let mut entries = Vec::with_capacity(tables);
    for i in 0..tables {
        let rec = base + 12 + i * 16;
        let tag = data.get(rec..rec + 4)?;
        let checksum = be_u32(data, rec + 4)?;
        let offset = be_u32(data, rec + 8)? as usize;
        let length = be_u32(data, rec + 12)? as usize;
        let body = data.get(offset..offset.checked_add(length)?)?;
        entries.push((tag, checksum, body));
    }
    let mut out = Vec::new();
    out.extend_from_slice(&version.to_be_bytes());
    let n = tables as u16;
    let mut power = 1u16;
    let mut log2 = 0u16;
    while power.saturating_mul(2) <= n {
        power *= 2;
        log2 += 1;
    }
    let search_range = power.saturating_mul(16);
    out.extend_from_slice(&n.to_be_bytes());
    out.extend_from_slice(&search_range.to_be_bytes());
    out.extend_from_slice(&log2.to_be_bytes());
    out.extend_from_slice(&(n.saturating_mul(16).saturating_sub(search_range)).to_be_bytes());
    let mut offset = 12 + tables * 16;
    let mut bodies = Vec::new();
    for (tag, checksum, body) in &entries {
        out.extend_from_slice(tag);
        out.extend_from_slice(&checksum.to_be_bytes());
        out.extend_from_slice(&u32::try_from(offset).ok()?.to_be_bytes());
        out.extend_from_slice(&u32::try_from(body.len()).ok()?.to_be_bytes());
        bodies.push(*body);
        offset += body.len().div_ceil(4) * 4;
    }
    for body in bodies {
        out.extend_from_slice(body);
        while out.len() % 4 != 0 {
            out.push(0);
        }
    }
    Some(out)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Cursor;

    /// A minimal sfnt: one `OS/2` table of 10 bytes with `fs_type` at offset 8.
    fn sfnt_with_fs_type(fs_type: u16) -> Vec<u8> {
        let mut b = Vec::new();
        b.extend_from_slice(&0x0001_0000u32.to_be_bytes());
        b.extend_from_slice(&1u16.to_be_bytes());
        b.extend_from_slice(&[0, 16, 0, 0, 0, 0]);
        b.extend_from_slice(b"OS/2");
        b.extend_from_slice(&0u32.to_be_bytes());
        b.extend_from_slice(&28u32.to_be_bytes());
        b.extend_from_slice(&10u32.to_be_bytes());
        b.extend_from_slice(&[0; 8]);
        b.extend_from_slice(&fs_type.to_be_bytes());
        b
    }

    fn sfnt_without_os2() -> Vec<u8> {
        let mut b = Vec::new();
        b.extend_from_slice(&0x0001_0000u32.to_be_bytes());
        b.extend_from_slice(&1u16.to_be_bytes());
        b.extend_from_slice(&[0, 16, 0, 0, 0, 0]);
        b.extend_from_slice(b"head");
        b.extend_from_slice(&0u32.to_be_bytes());
        b.extend_from_slice(&28u32.to_be_bytes());
        b.extend_from_slice(&4u32.to_be_bytes());
        b.extend_from_slice(&[0; 4]);
        b
    }

    /// A collection of the given members, each an sfnt from `sfnt_with_fs_type`.
    fn ttc(members: &[Vec<u8>]) -> Vec<u8> {
        let header = 12 + 4 * members.len();
        let mut out = Vec::new();
        out.extend_from_slice(b"ttcf");
        out.extend_from_slice(&0x0001_0000u32.to_be_bytes());
        out.extend_from_slice(&(members.len() as u32).to_be_bytes());
        let mut at = header;
        for m in members {
            out.extend_from_slice(&(at as u32).to_be_bytes());
            at += m.len();
        }
        for m in members {
            // Table offsets inside a collection are from the file start.
            let start = out.len() as u32;
            let mut m = m.clone();
            let off = be_u32(&m, 12 + 8).unwrap() + start;
            m[20..24].copy_from_slice(&off.to_be_bytes());
            out.extend_from_slice(&m);
        }
        out
    }

    #[test]
    fn the_fs_type_decision_follows_the_opentype_spec() {
        assert_eq!(embedding_decision(0x0000), Ok(EmbeddingRights::Installable));
        assert_eq!(embedding_decision(0x0008), Ok(EmbeddingRights::Editable));
        assert_eq!(embedding_decision(0x0004), Ok(EmbeddingRights::PreviewAndPrint));
        assert_eq!(embedding_decision(0x0002), Err(EmbeddingRefusal::Restricted));
        // Least restrictive of bits 0-3 wins.
        assert_eq!(embedding_decision(0x0006), Ok(EmbeddingRights::PreviewAndPrint));
        assert_eq!(embedding_decision(0x000A), Ok(EmbeddingRights::Editable));
        assert_eq!(embedding_decision(0x0200), Err(EmbeddingRefusal::BitmapOnly));
        assert_eq!(embedding_decision(0x0208), Err(EmbeddingRefusal::BitmapOnly));
        assert_eq!(embedding_decision(0x0100), Err(EmbeddingRefusal::NoSubsetting));
        assert_eq!(embedding_decision(0x0302), Err(EmbeddingRefusal::Restricted));
        // The reserved bit 0 alone grants nothing and forbids nothing.
        assert_eq!(embedding_decision(0x0001), Ok(EmbeddingRights::Installable));
    }

    #[test]
    fn fs_type_is_read_from_the_os2_table_of_crafted_bytes() {
        for v in [0x0000, 0x0002, 0x0004, 0x0008, 0x0200, 0x0108] {
            let bytes = sfnt_with_fs_type(v);
            assert_eq!(read_fs_type(&mut Cursor::new(&bytes), 0).unwrap(), Some(v));
        }
        assert_eq!(read_fs_type(&mut Cursor::new(sfnt_without_os2()), 0).unwrap(), None);
        assert!(read_fs_type(&mut Cursor::new(b"not a font at all".to_vec()), 0).is_err());
    }

    #[test]
    fn a_collection_member_is_read_by_its_own_index() {
        let collection = ttc(&[sfnt_with_fs_type(0x0008), sfnt_with_fs_type(0x0002)]);
        assert_eq!(read_fs_type(&mut Cursor::new(&collection), 0).unwrap(), Some(0x0008));
        assert_eq!(read_fs_type(&mut Cursor::new(&collection), 1).unwrap(), Some(0x0002));
        assert!(read_fs_type(&mut Cursor::new(&collection), 2).is_err());
        let second = standalone_face(&collection, 1).expect("standalone");
        assert_eq!(read_fs_type(&mut Cursor::new(&second), 0).unwrap(), Some(0x0002));
    }

    #[test]
    fn a_restricted_face_is_refused_with_the_typed_error() {
        let refused = load_face_from_bytes(&sfnt_with_fs_type(0x0002), 0, "Locked Sans");
        assert_eq!(
            refused.err(),
            Some(FontRefusal::EmbeddingNotPermitted {
                family: "Locked Sans".into(),
                reason: EmbeddingRefusal::Restricted
            })
        );
        let bitmap = load_face_from_bytes(&sfnt_with_fs_type(0x0200), 0, "Pixel");
        assert!(matches!(
            bitmap.err(),
            Some(FontRefusal::EmbeddingNotPermitted { reason: EmbeddingRefusal::BitmapOnly, .. })
        ));
        let silent = load_face_from_bytes(&sfnt_without_os2(), 0, "Quiet");
        assert!(matches!(
            silent.err(),
            Some(FontRefusal::EmbeddingNotPermitted { reason: EmbeddingRefusal::NoLicenceInformation, .. })
        ));
    }

    #[test]
    fn the_refusal_serialises_with_a_code_the_ui_switches_on() {
        let json = serde_json::to_value(FontRefusal::EmbeddingNotPermitted {
            family: "Locked Sans".into(),
            reason: EmbeddingRefusal::Restricted,
        })
        .unwrap();
        assert_eq!(json["code"], "embedding-not-permitted");
        assert_eq!(json["reason"], "restricted");
        assert_eq!(json["family"], "Locked Sans");
    }
}
