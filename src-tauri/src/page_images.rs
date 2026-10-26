// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary. The PDFluent application is free to use,
// including for commercial purposes. Redistribution, or extraction or reuse
// of its components (including the embedded PDF engine), requires a licence.
// See https://pdfluent.com/license for terms.

//! Images that are already in the page content (#723): list their placements,
//! move or resize one, swap the picture, delete it.
//!
//! The editor does not read or rewrite page operators itself. The placement
//! API of the SDK (`pdfluent::image_edit`, #762) does it: it tracks the CTM,
//! finds images inside Form XObjects and inline images too, copies a shared
//! form before an edit so other pages keep theirs, and drops an image nothing
//! refers to any more. What is left here is the handle.
//!
//! The SDK addresses a placement by a [`PlacementRef`] that is only valid for
//! the content it was listed from. The editor's UI keeps a plain number, so the
//! handle used here is the position in the list that [`list_page_images`]
//! returns. Every edit lists the page again and resolves that position, and
//! returns the position of the placement afterwards. As before, a number is
//! only good until the next edit: list again after each one.

use lopdf::Document;
use pdfluent::image_edit::{self, ImagePlacement, PlacementKind, PlacementRef};
use serde::Serialize;

/// One placed image on a page.
#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PageImage {
    /// Position in the page's placement list; the handle every edit takes.
    /// It can shift after an edit: list again.
    pub index: usize,
    /// Resource name the `Do` uses, or `inline` for an inline image.
    pub name: String,
    /// Page-space bounding box `[x0, y0, x1, y1]` (lower-left origin).
    pub rect: [f64; 4],
    pub pixel_width: u32,
    pub pixel_height: u32,
    /// The image is drawn by a Form XObject, not by the page's own content.
    pub in_form: bool,
}

/// Why a placement edit was refused. Nothing is changed when one is returned.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum ImageEditError {
    PageOutOfRange,
    /// The index is not in the page's list (the content changed since the list
    /// was read).
    NoSuchPlacement,
    Engine(String),
}

impl std::fmt::Display for ImageEditError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::PageOutOfRange => write!(f, "That page does not exist"),
            Self::NoSuchPlacement => write!(f, "That image is no longer on the page"),
            Self::Engine(e) => write!(f, "{e}"),
        }
    }
}

fn engine(e: impl std::fmt::Display) -> ImageEditError {
    ImageEditError::Engine(e.to_string())
}

fn placements(doc: &Document, page_num: u32) -> Result<Vec<ImagePlacement>, ImageEditError> {
    if page_num == 0 || !doc.get_pages().contains_key(&page_num) {
        return Err(ImageEditError::PageOutOfRange);
    }
    image_edit::list_image_placements(doc, page_num).map_err(engine)
}

fn handle(list: &[ImagePlacement], index: usize) -> Result<PlacementRef, ImageEditError> {
    list.get(index).map(|p| p.at.clone()).ok_or(ImageEditError::NoSuchPlacement)
}

/// Where the placement `at` sits in the page's list now.
fn position_of(doc: &Document, page_num: u32, at: &PlacementRef) -> Result<usize, ImageEditError> {
    placements(doc, page_num)?
        .iter()
        .position(|p| &p.at == at)
        .ok_or(ImageEditError::NoSuchPlacement)
}

/// The image placements on the page, in drawing order.
pub fn list_page_images(doc: &Document, page_num: u32) -> Result<Vec<PageImage>, ImageEditError> {
    Ok(placements(doc, page_num)?
        .into_iter()
        .enumerate()
        .map(|(index, p)| PageImage {
            index,
            name: match p.kind {
                PlacementKind::XObject => p.resource_name.clone().unwrap_or_default(),
                PlacementKind::Inline => "inline".to_string(),
                // The engine marks the enum non-exhaustive: a kind added later is
                // listed under a generic name until it is handled.
                _ => "image".to_string(),
            },
            rect: p.bbox,
            pixel_width: p.pixel_width,
            pixel_height: p.pixel_height,
            in_form: !p.at.form_path.is_empty(),
        })
        .collect())
}

/// Move and/or resize one placement so its bounding box becomes `rect`.
/// Returns the placement's index afterwards.
pub fn set_image_rect(
    doc: &mut Document,
    page_num: u32,
    index: usize,
    rect: [f64; 4],
) -> Result<usize, ImageEditError> {
    let at = handle(&placements(doc, page_num)?, index)?;
    let new = image_edit::set_placement_rect(doc, page_num, &at, rect).map_err(engine)?;
    position_of(doc, page_num, &new)
}

/// Remove one placement. The image bytes leave the file with it when nothing
/// else uses them.
pub fn delete_image(doc: &mut Document, page_num: u32, index: usize) -> Result<(), ImageEditError> {
    let at = handle(&placements(doc, page_num)?, index)?;
    image_edit::remove_placement(doc, page_num, &at).map_err(engine)
}

/// Swap the picture of one placement for `data` (PNG or JPEG), fitted inside
/// the old box with its own aspect ratio and centred in it. Returns the
/// placement's index afterwards.
pub fn replace_image(
    doc: &mut Document,
    page_num: u32,
    index: usize,
    data: &[u8],
) -> Result<usize, ImageEditError> {
    let at = handle(&placements(doc, page_num)?, index)?;
    let new = image_edit::replace_placement_image(doc, page_num, &at, data).map_err(engine)?;
    position_of(doc, page_num, &new)
}
