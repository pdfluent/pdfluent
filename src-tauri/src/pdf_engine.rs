// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 PDFluent Contributors

use base64::{engine::general_purpose, Engine as _};
use pdfium_render::prelude::*;
use serde::Serialize;
use std::io::Cursor;

#[derive(Debug, Serialize, Clone)]
pub struct DocumentInfo {
    pub page_count: u32,
    pub pages: Vec<PageInfo>,
}

#[derive(Debug, Serialize, Clone)]
pub struct PageInfo {
    pub index: u32,
    pub width_pt: f32,
    pub height_pt: f32,
}

#[derive(Debug, Serialize, Clone)]
pub struct RenderedPage {
    pub index: u32,
    pub width: u32,
    pub height: u32,
    pub data_base64: String,
}

pub struct PdfEngine {
    pdfium: Pdfium,
}

// Safety: All access to PdfEngine is serialized through Mutex in AppState.
// Pdfium's C API is safe to use from any single thread at a time.
unsafe impl Send for PdfEngine {}
unsafe impl Sync for PdfEngine {}

impl PdfEngine {
    pub fn init() -> Result<Self, String> {
        let manifest_dir = env!("CARGO_MANIFEST_DIR");
        let lib_path = format!("{}/lib/lib", manifest_dir);

        let candidate_paths = [
            lib_path.as_str(),
            "lib/lib",
            "lib",
            ".",
        ];

        for path in &candidate_paths {
            let lib_name = Pdfium::pdfium_platform_library_name_at_path(path);
            if let Ok(bindings) = Pdfium::bind_to_library(&lib_name) {
                return Ok(Self {
                    pdfium: Pdfium::new(bindings),
                });
            }
        }

        // Fall back to system library
        let bindings = Pdfium::bind_to_system_library()
            .map_err(|e| format!("Pdfium library not found: {e}"))?;

        Ok(Self {
            pdfium: Pdfium::new(bindings),
        })
    }

    pub fn get_document_info(&self, path: &str) -> Result<DocumentInfo, String> {
        let document = self
            .pdfium
            .load_pdf_from_file(path, None)
            .map_err(|e| format!("Failed to open PDF: {e}"))?;

        let pages_collection = document.pages();
        let page_count = pages_collection.len();
        let mut pages = Vec::with_capacity(page_count as usize);

        for i in 0..page_count {
            if let Ok(page) = pages_collection.get(i) {
                pages.push(PageInfo {
                    index: i as u32,
                    width_pt: page.width().value,
                    height_pt: page.height().value,
                });
            }
        }

        Ok(DocumentInfo {
            page_count: page_count as u32,
            pages,
        })
    }

    pub fn render_page(
        &self,
        path: &str,
        page_index: u16,
        scale: f32,
    ) -> Result<RenderedPage, String> {
        let document = self
            .pdfium
            .load_pdf_from_file(path, None)
            .map_err(|e| format!("Failed to open PDF: {e}"))?;

        let page = document
            .pages()
            .get(page_index)
            .map_err(|e| format!("Failed to get page {page_index}: {e}"))?;

        let width_pt = page.width().value;
        let height_pt = page.height().value;

        let target_width = (width_pt * scale) as i32;
        let target_height = (height_pt * scale) as i32;

        let render_config = PdfRenderConfig::new()
            .set_target_width(target_width)
            .set_maximum_height(target_height)
            .render_form_data(true)
            .render_annotations(true);

        let bitmap = page
            .render_with_config(&render_config)
            .map_err(|e| format!("Failed to render page {page_index}: {e}"))?;

        let image = bitmap.as_image();
        let (w, h) = (image.width(), image.height());

        let mut png_bytes: Vec<u8> = Vec::new();
        image
            .write_to(&mut Cursor::new(&mut png_bytes), image::ImageFormat::Png)
            .map_err(|e| format!("Failed to encode PNG: {e}"))?;

        let data_base64 = general_purpose::STANDARD.encode(&png_bytes);

        Ok(RenderedPage {
            index: page_index as u32,
            width: w,
            height: h,
            data_base64,
        })
    }
}
