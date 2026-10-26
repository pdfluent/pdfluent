// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary. The PDFluent application is free to use,
// including for commercial purposes. Redistribution, or extraction or reuse
// of its components (including the embedded PDF engine), requires a licence.
// See https://pdfluent.com/license for terms.

//! OCR: recognise scanned pages and write the text into the PDF.
//!
//! Until 1.0.1 OCR spawned the user's own Python with `paddleocr` and showed
//! the words in an overlay; nothing reached the document, so a saved file was
//! exactly as unsearchable as before, and on a machine without that Python it
//! did nothing at all (J-60).
//!
//! Now the words become an invisible text layer in the page (text rendering
//! mode 3, set by the SDK's `pdf_ocr::make_searchable`), so after Save the
//! document is searchable and selectable in any reader. Recognition runs the
//! Tesseract component bundled in the app (`ocr_component`) as a separate
//! process: nothing of Tesseract is linked into this binary, which stays pure
//! Rust (B31). The page image goes to the process over a pipe and the words
//! come back as TSV; no file and no network is involved.

use crate::ocr_component::Installed;
use pdf_engine::{PdfDocument, RenderOptions};
use pdf_ocr::{OcrEngine, OcrPageResult};
use serde::Serialize;
use std::io::{Cursor, Write as _};
use std::path::PathBuf;
use std::process::{Command, Stdio};
use std::sync::atomic::{AtomicU32, Ordering};

/// Resolution pages are rendered at for recognition. 300 dpi is what
/// Tesseract is tuned for; lower loses small print, higher costs time and
/// memory for no gain on ordinary scans.
pub const OCR_DPI: u32 = 300;

/// The document is signed: a text layer changes the page content the
/// signature covers.
pub const ERR_SIGNED: &str = "OCR_SIGNED_DOCUMENT";
/// The document's permissions do not allow changing its content.
pub const ERR_NOT_PERMITTED: &str = "OCR_NOT_PERMITTED";
/// The document changed while OCR ran; the result would overwrite that change.
pub const ERR_CHANGED: &str = "OCR_DOCUMENT_CHANGED";
/// Tesseract could not be started or failed on a page.
pub const ERR_ENGINE: &str = "OCR_ENGINE_FAILED";
/// A page number outside the document.
pub const ERR_PAGE: &str = "OCR_PAGE_OUT_OF_RANGE";

// ── Engine ───────────────────────────────────────────────────────────────

/// Tesseract from the installed component, run as a subprocess.
#[derive(Debug, Clone)]
pub struct ComponentTesseract {
    binary: PathBuf,
    tessdata: PathBuf,
    language: String,
}

impl ComponentTesseract {
    /// An engine for `languages` (Tesseract tags such as `eng`, `nld`),
    /// refused when one of them is not installed. The binary is asked for its
    /// version once here, so a broken component fails before any page is
    /// rendered.
    pub fn new(installed: &Installed, languages: &[String]) -> Result<Self, String> {
        installed.require_languages(languages)?;
        let engine = Self {
            binary: installed.binary.clone(),
            tessdata: installed.tessdata.clone(),
            language: languages.join("+"),
        };
        let output = engine
            .command()
            .arg("--version")
            .stdin(Stdio::null())
            .output()
            .map_err(|e| format!("{ERR_ENGINE}: could not start Tesseract: {e}"))?;
        if !output.status.success() {
            return Err(format!(
                "{ERR_ENGINE}: Tesseract --version exited with {}",
                output.status
            ));
        }
        Ok(engine)
    }

    pub fn language(&self) -> &str {
        &self.language
    }

    fn command(&self) -> Command {
        let mut command = Command::new(&self.binary);
        // The language data is the component's own, never a system copy.
        command.env("TESSDATA_PREFIX", &self.tessdata);
        // One thread per process: the app already keeps the machine busy
        // rendering, and an OpenMP build otherwise takes every core.
        command.env("OMP_THREAD_LIMIT", "1");
        #[cfg(windows)]
        {
            use std::os::windows::process::CommandExt as _;
            // CREATE_NO_WINDOW: no console window flashes up per page.
            command.creation_flags(0x0800_0000);
        }
        command
    }
}

impl OcrEngine for ComponentTesseract {
    fn recognize(
        &self,
        image_data: &[u8],
        width: u32,
        height: u32,
        dpi: u32,
    ) -> Result<OcrPageResult, String> {
        let png = encode_png(image_data, width, height)?;
        let mut child = self
            .command()
            .arg("stdin")
            .arg("stdout")
            .arg("--tessdata-dir")
            .arg(&self.tessdata)
            // `-c tessedit_create_tsv=1`, not the `tsv` config name: the
            // component ships no configs folder, and a missing config makes
            // Tesseract print a warning and an empty page with exit 0.
            .args(["--dpi", &dpi.to_string(), "-l", &self.language, "-c", "tessedit_create_tsv=1"])
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .spawn()
            .map_err(|e| format!("{ERR_ENGINE}: could not start Tesseract: {e}"))?;
        // Written from a thread: a page large enough to fill the pipe buffer
        // would otherwise deadlock against Tesseract writing its output.
        let mut stdin = child
            .stdin
            .take()
            .ok_or_else(|| format!("{ERR_ENGINE}: no pipe to Tesseract"))?;
        let writer = std::thread::spawn(move || stdin.write_all(&png));
        let output = child
            .wait_with_output()
            .map_err(|e| format!("{ERR_ENGINE}: Tesseract did not finish: {e}"))?;
        writer
            .join()
            .map_err(|_| format!("{ERR_ENGINE}: the page could not be handed to Tesseract"))?
            .map_err(|e| format!("{ERR_ENGINE}: the page could not be handed to Tesseract: {e}"))?;
        if !output.status.success() {
            let stderr = String::from_utf8_lossy(&output.stderr);
            return Err(format!(
                "{ERR_ENGINE}: Tesseract exited with {}: {}",
                output.status,
                stderr.trim()
            ));
        }
        let stdout = String::from_utf8_lossy(&output.stdout);
        // A run that produced no TSV at all is a failure, never "a page with
        // no words" (exit 0 with an unreadable config looked exactly so).
        if !stdout.starts_with("level\t") {
            return Err(format!(
                "{ERR_ENGINE}: Tesseract produced no recognition output: {}",
                String::from_utf8_lossy(&output.stderr).lines().find(|l| !l.starts_with("Error in")).unwrap_or("no message").trim()
            ));
        }
        let words = pdf_ocr::tesseract_cli::parse_tsv(&stdout);
        let confidence = if words.is_empty() {
            0.0
        } else {
            words.iter().map(|w| w.confidence).sum::<f32>() / words.len() as f32
        };
        Ok(OcrPageResult {
            words,
            confidence,
            image_width: width,
            image_height: height,
        })
    }

    fn supported_languages(&self) -> Vec<String> {
        self.language.split('+').map(str::to_string).collect()
    }
}

/// RGBA or RGB row-major pixels as a PNG.
fn encode_png(pixels: &[u8], width: u32, height: u32) -> Result<Vec<u8>, String> {
    let count = width as usize * height as usize;
    let rgb: Vec<u8> = if pixels.len() == count * 4 {
        pixels
            .as_chunks::<4>()
            .0
            .iter()
            .flat_map(|px| [px[0], px[1], px[2]])
            .collect()
    } else if pixels.len() == count * 3 {
        pixels.to_vec()
    } else {
        return Err(format!(
            "{ERR_ENGINE}: page image is {} bytes for {width}x{height}",
            pixels.len()
        ));
    };
    let image = image::RgbImage::from_raw(width, height, rgb)
        .ok_or_else(|| format!("{ERR_ENGINE}: page image has the wrong size"))?;
    let mut png = Vec::new();
    image
        .write_to(&mut Cursor::new(&mut png), image::ImageFormat::Png)
        .map_err(|e| format!("{ERR_ENGINE}: could not encode the page image: {e}"))?;
    Ok(png)
}

// ── Text layer ───────────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, PartialEq)]
pub struct OcrPageSummary {
    /// 1-based page number.
    pub page: u32,
    /// False when the page already had text and was left alone.
    pub recognised: bool,
    pub words: usize,
    pub confidence: f32,
}

/// What a run did, page by page.
#[derive(Debug, Clone, Serialize, PartialEq)]
pub struct OcrTextLayerReport {
    pub pages_considered: usize,
    pub pages_recognised: usize,
    pub pages_with_text_already: usize,
    pub words: usize,
    pub language: String,
    pub pages: Vec<OcrPageSummary>,
}

/// Counts pages through `recognize` so the caller can show progress; the SDK
/// pipeline has no progress hook of its own.
struct Counting<'a, E> {
    inner: &'a E,
    done: AtomicU32,
    total: u32,
    on_page: &'a (dyn Fn(u32, u32) + Sync),
}

impl<E: OcrEngine> OcrEngine for Counting<'_, E> {
    fn recognize(&self, image: &[u8], w: u32, h: u32, dpi: u32) -> Result<OcrPageResult, String> {
        let result = self.inner.recognize(image, w, h, dpi);
        let done = self.done.fetch_add(1, Ordering::SeqCst) + 1;
        (self.on_page)(done, self.total);
        result
    }

    fn supported_languages(&self) -> Vec<String> {
        self.inner.supported_languages()
    }
}

/// Recognise the scanned pages among `pages` (1-based; empty means all) and
/// add an invisible text layer to each. Pages that already carry text are
/// left as they are, so running OCR twice does not double the text.
///
/// `render` is the document to rasterise -- the same pages as `doc`; the
/// layer does not change how a page looks, so a render source from before the
/// run is the right one.
pub fn add_text_layer<E: OcrEngine>(
    doc: &mut lopdf::Document,
    render: &PdfDocument,
    engine: &E,
    pages: &[u32],
    language: &str,
    on_page: &(dyn Fn(u32, u32) + Sync),
) -> Result<OcrTextLayerReport, String> {
    let page_count = doc.get_pages().len() as u32;
    for &p in pages {
        if p == 0 || p > page_count {
            return Err(format!("{ERR_PAGE}:{p}"));
        }
    }
    let considered = if pages.is_empty() { page_count } else { pages.len() as u32 };
    let config = pdf_ocr::OcrConfig {
        dpi: OCR_DPI,
        pages: pages.to_vec(),
        ..Default::default()
    };
    let counting = Counting {
        inner: engine,
        done: AtomicU32::new(0),
        total: considered,
        on_page,
    };
    let render_fn = |_: &lopdf::Document, page: u32, dpi: u32| {
        let options = RenderOptions {
            dpi: dpi as f64,
            // The layer sits under what the page shows, annotations included;
            // recognising a sticky note's icon would only add noise.
            render_annotations: false,
            ..Default::default()
        };
        render
            .render_page((page - 1) as usize, &options)
            .map(|r| (r.pixels, r.width, r.height))
            .map_err(|e| format!("could not render page {page}: {e}"))
    };
    let report = pdf_ocr::make_searchable(doc, &counting, &config, render_fn).map_err(|e| {
        let message = e.to_string();
        if message.starts_with(ERR_ENGINE) {
            message
        } else {
            format!("{ERR_ENGINE}: {message}")
        }
    })?;
    let pages: Vec<OcrPageSummary> = report
        .pages
        .iter()
        .map(|p| OcrPageSummary {
            page: p.page,
            recognised: p.ocr_needed,
            words: p.words_recognized,
            confidence: p.confidence,
        })
        .collect();
    Ok(OcrTextLayerReport {
        pages_considered: pages.len(),
        pages_recognised: report.pages_processed,
        pages_with_text_already: pages.iter().filter(|p| !p.recognised).count(),
        words: report.total_words,
        language: language.to_string(),
        pages,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn png_encoding_takes_rgba_and_rgb_and_refuses_the_rest() {
        let rgba = vec![255u8; 2 * 2 * 4];
        let rgb = vec![0u8; 2 * 2 * 3];
        for pixels in [&rgba, &rgb] {
            let png = encode_png(pixels, 2, 2).unwrap();
            assert_eq!(&png[1..4], b"PNG");
        }
        let err = encode_png(&[0u8; 5], 2, 2).unwrap_err();
        assert!(err.starts_with(ERR_ENGINE), "{err}");
    }

    #[test]
    fn a_missing_language_is_refused_before_tesseract_starts() {
        let installed = Installed {
            binary: PathBuf::from("/nonexistent/tesseract"),
            tessdata: PathBuf::from("/nonexistent/tessdata"),
            languages: vec!["eng".into()],
        };
        let err = ComponentTesseract::new(&installed, &["nld".into()]).unwrap_err();
        assert!(err.starts_with(crate::ocr_component::ERR_LANGUAGE_MISSING), "{err}");
    }

    #[test]
    fn a_component_whose_binary_will_not_start_fails_by_name() {
        let dir = std::env::temp_dir().join(format!("pdfluent-ocr-nobin-{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        std::fs::write(dir.join("eng.traineddata"), b"x").unwrap();
        let installed = Installed {
            binary: dir.join("no-such-binary"),
            tessdata: dir.clone(),
            languages: vec!["eng".into()],
        };
        let err = ComponentTesseract::new(&installed, &["eng".into()]).unwrap_err();
        assert!(err.starts_with(ERR_ENGINE), "{err}");
    }
}
