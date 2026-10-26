// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary. The PDFluent application is free to use,
// including for commercial purposes. Redistribution, or extraction or reuse
// of its components (including the embedded PDF engine), requires a licence.
// See https://pdfluent.com/license for terms.

//! J-60: OCR on a scan, then search and copy -- after Save, in the file.
//!
//! Until 1.0.1 the recognised words lived in an overlay and never reached the
//! document, so these assertions would have failed on a saved file. What this
//! pins, on a scan the test builds itself (a page that is nothing but an image
//! of text, so there is no text to find before OCR):
//!
//! * before OCR the scan has no text: search finds nothing, extraction is empty;
//! * OCR adds an invisible text layer (rendering mode 3) and marks the document
//!   modified;
//! * after Save and a fresh open, search finds the words and extraction returns
//!   them -- through the same open/search/extract path the app uses;
//! * a page that already has text is left alone, so a second run adds nothing.
//!
//! Two engines. A fixed-word engine runs everywhere and proves the editor's
//! path (render, layer, save, reopen) without depending on recognition
//! quality. The real Tesseract run proves the component path end to end; it
//! needs a Tesseract on the machine (`PDFLUENT_OCR_COMPONENT_DIR` with
//! `bin/` and `tessdata/`, or `tesseract` on PATH) and says
//! `SKIPPED (not a pass)` when there is none -- unless
//! `PDFLUENT_REQUIRE_OCR_ENGINE=1`, which CI sets where the runner has one, so
//! there a missing engine is red.
//!
//! Runs in the `cargo-test` job and in `quality:macos` / `quality:windows`,
//! where `PDFLUENT_REQUIRE_OCR_BUNDLE=1` makes the bundled component's run
//! mandatory.

use base64::Engine as _;
use lopdf::content::{Content, Operation};
use lopdf::{dictionary, Document, Object, Stream};
use pdf_ocr::{OcrEngine, OcrPageResult, OcrWord};
use pdfluent_lib::{ComponentTesseract, InstalledOcrComponent, OpenDocument};
use std::path::{Path, PathBuf};
use std::process::Command;

/// The words on the scan. Large, plain and well apart so recognition on any
/// Tesseract build reads them; the assertions only ask for whole words.
const LINES: [&str; 3] = ["PDFLUENT SCANNED INVOICE", "TOTAL AMOUNT 1234", "SEARCHABLE AFTER SAVE"];
const KEY_WORDS: [&str; 5] = ["PDFLUENT", "INVOICE", "TOTAL", "SEARCHABLE", "SAVE"];

fn scratch(name: &str) -> PathBuf {
    let dir = std::env::temp_dir().join(format!("pdfluent-ocr-{name}-{}", std::process::id()));
    std::fs::create_dir_all(&dir).expect("scratch dir");
    dir
}

/// A one-page PDF with real text in Helvetica, the source of the scan.
fn text_pdf() -> Vec<u8> {
    let mut doc = Document::with_version("1.7");
    let pages_id = doc.new_object_id();
    let font_id = doc.add_object(dictionary! {
        "Type" => "Font", "Subtype" => "Type1", "BaseFont" => "Helvetica",
    });
    let mut ops = vec![Operation::new("BT", vec![]), Operation::new("Tf", vec!["F1".into(), 30.into()])];
    for (i, line) in LINES.iter().enumerate() {
        ops.push(Operation::new("Tm", vec![1.into(), 0.into(), 0.into(), 1.into(), 60.into(), (650 - 90 * i as i64).into()]));
        ops.push(Operation::new("Tj", vec![Object::string_literal(*line)]));
    }
    ops.push(Operation::new("ET", vec![]));
    let content_id = doc.add_object(Stream::new(dictionary! {}, Content { operations: ops }.encode().unwrap()));
    let page_id = doc.add_object(dictionary! {
        "Type" => "Page", "Parent" => pages_id, "Contents" => content_id,
        "MediaBox" => vec![0.into(), 0.into(), 612.into(), 792.into()],
        "Resources" => dictionary! { "Font" => dictionary! { "F1" => font_id } },
    });
    doc.objects.insert(pages_id, Object::Dictionary(dictionary! {
        "Type" => "Pages", "Kids" => vec![page_id.into()], "Count" => 1,
    }));
    let catalog = doc.add_object(dictionary! { "Type" => "Catalog", "Pages" => pages_id });
    doc.trailer.set("Root", catalog);
    let mut out = Vec::new();
    doc.save_to(&mut out).unwrap();
    out
}

/// The "scan": the text page rendered at 200 dpi and put back as a page that
/// holds only that image -- no text operator anywhere, like a scanner's PDF.
fn scanned_pdf() -> Vec<u8> {
    let source = OpenDocument::open_bytes(text_pdf()).expect("open text source");
    let rendered = source.render_page(0, 200.0 / 72.0).expect("render source");
    let png = base64::engine::general_purpose::STANDARD.decode(&rendered.data_base64).unwrap();
    let rgb = image::load_from_memory(&png).unwrap().to_rgb8();
    let (w, h) = rgb.dimensions();

    let mut doc = Document::with_version("1.7");
    let pages_id = doc.new_object_id();
    let mut image = Stream::new(
        dictionary! {
            "Type" => "XObject", "Subtype" => "Image", "Width" => w as i64, "Height" => h as i64,
            "ColorSpace" => "DeviceRGB", "BitsPerComponent" => 8,
        },
        rgb.into_raw(),
    );
    image.compress().unwrap();
    let image_id = doc.add_object(image);
    let ops = vec![
        Operation::new("q", vec![]),
        Operation::new("cm", vec![612.into(), 0.into(), 0.into(), 792.into(), 0.into(), 0.into()]),
        Operation::new("Do", vec!["Im0".into()]),
        Operation::new("Q", vec![]),
    ];
    let content_id = doc.add_object(Stream::new(dictionary! {}, Content { operations: ops }.encode().unwrap()));
    let page_id = doc.add_object(dictionary! {
        "Type" => "Page", "Parent" => pages_id, "Contents" => content_id,
        "MediaBox" => vec![0.into(), 0.into(), 612.into(), 792.into()],
        "Resources" => dictionary! { "XObject" => dictionary! { "Im0" => image_id } },
    });
    doc.objects.insert(pages_id, Object::Dictionary(dictionary! {
        "Type" => "Pages", "Kids" => vec![page_id.into()], "Count" => 1,
    }));
    let catalog = doc.add_object(dictionary! { "Type" => "Catalog", "Pages" => pages_id });
    doc.trailer.set("Root", catalog);
    let mut out = Vec::new();
    doc.save_to(&mut out).unwrap();
    out
}

fn found_words(doc: &OpenDocument) -> Vec<&'static str> {
    KEY_WORDS
        .iter()
        .copied()
        .filter(|w| !doc.search_text(w).is_empty())
        .collect()
}

/// The scan has nothing to find before OCR. Without this the assertions
/// after OCR would prove nothing.
fn assert_unsearchable(doc: &OpenDocument) {
    assert!(found_words(doc).is_empty(), "the scan already has text: {:?}", found_words(doc));
    let text = doc.extract_page_text(0).unwrap();
    assert!(text.trim().is_empty(), "the scan already has text: {text:?}");
}

/// Save, open the file fresh, and return it.
fn save_and_reopen(doc: &mut OpenDocument, name: &str) -> OpenDocument {
    let path = scratch(name).join("scan.pdf");
    std::fs::write(&path, b"placeholder").unwrap();
    doc.save_to(path.to_str().unwrap()).expect("save");
    OpenDocument::open(path.to_str().unwrap()).expect("reopen")
}

/// An engine that "recognises" LINES at the place the source page drew them:
/// deterministic, so the editor's half of the journey is tested on every
/// runner whatever Tesseract does.
struct FixedWords;

impl OcrEngine for FixedWords {
    fn recognize(&self, _image: &[u8], width: u32, height: u32, _dpi: u32) -> Result<OcrPageResult, String> {
        let sx = width as f64 / 612.0;
        let sy = height as f64 / 792.0;
        let mut words = Vec::new();
        for (i, line) in LINES.iter().enumerate() {
            let baseline = 792.0 - (650.0 - 90.0 * i as f64);
            let mut x = 60.0;
            for word in line.split(' ') {
                let w = word.len() as f64 * 20.0;
                words.push(OcrWord {
                    text: word.to_string(),
                    bbox_px: [(x * sx) as u32, ((baseline - 28.0) * sy) as u32, ((x + w) * sx) as u32, (baseline * sy) as u32],
                    confidence: 0.99,
                });
                x += w + 10.0;
            }
        }
        Ok(OcrPageResult { words, confidence: 0.99, image_width: width, image_height: height })
    }

    fn supported_languages(&self) -> Vec<String> {
        vec!["eng".into()]
    }
}

#[test]
fn ocr_writes_a_text_layer_that_survives_save_and_reopen() {
    let mut doc = OpenDocument::open_bytes(scanned_pdf()).expect("open scan");
    assert_unsearchable(&doc);

    let report = doc.add_ocr_text_layer(&FixedWords, &[], "eng").expect("ocr");
    assert_eq!(report.pages_recognised, 1, "{report:?}");
    assert_eq!(report.words, LINES.iter().map(|l| l.split(' ').count()).sum::<usize>());
    assert!(doc.modified, "OCR must mark the document modified so Save writes it");

    let reopened = save_and_reopen(&mut doc, "fixed");
    assert_eq!(found_words(&reopened), KEY_WORDS.to_vec(), "search after save");
    let text = reopened.extract_page_text(0).unwrap();
    for w in KEY_WORDS {
        assert!(text.contains(w), "extraction after save lacks {w}: {text:?}");
    }

    // The layer is invisible: set in rendering mode 3, so the page looks as
    // scanned and only search, selection and copy see the words.
    let saved = std::fs::read(scratch("fixed").join("scan.pdf")).unwrap();
    let lopdf_doc = Document::load_mem(&saved).unwrap();
    let page = *lopdf_doc.get_pages().get(&1).unwrap();
    let content = Content::decode(&lopdf_doc.get_page_content(page)).unwrap();
    let modes: Vec<i64> = content
        .operations
        .iter()
        .filter(|op| op.operator == "Tr")
        .filter_map(|op| op.operands.first().and_then(|o| o.as_i64().ok()))
        .collect();
    assert_eq!(modes, vec![3], "the text layer must be invisible (3 Tr)");
}

#[test]
fn a_page_with_text_is_left_alone() {
    let mut doc = OpenDocument::open_bytes(scanned_pdf()).unwrap();
    doc.add_ocr_text_layer(&FixedWords, &[], "eng").unwrap();
    let mut reopened = save_and_reopen(&mut doc, "twice");
    let before = reopened.extract_page_text(0).unwrap();
    let report = reopened.add_ocr_text_layer(&FixedWords, &[], "eng").unwrap();
    assert_eq!(report.pages_recognised, 0, "{report:?}");
    assert_eq!(report.pages_with_text_already, 1);
    assert!(!reopened.modified, "nothing recognised, nothing changed");
    assert_eq!(reopened.extract_page_text(0).unwrap(), before);
}

#[test]
fn a_page_outside_the_document_is_refused() {
    let mut doc = OpenDocument::open_bytes(scanned_pdf()).unwrap();
    let err = doc.add_ocr_text_layer(&FixedWords, &[2], "eng").unwrap_err();
    assert!(err.starts_with("OCR_PAGE_OUT_OF_RANGE"), "{err}");
    assert!(!doc.modified);
}

/// A Tesseract to run: the component folder CI or a developer points at, or
/// the one on PATH with the language data it reports.
fn find_tesseract() -> Option<InstalledOcrComponent> {
    if let Some(dir) = std::env::var_os("PDFLUENT_OCR_COMPONENT_DIR") {
        let dir = PathBuf::from(dir);
        let binary = dir.join("bin").join(if cfg!(windows) { "tesseract.exe" } else { "tesseract" });
        let tessdata = dir.join("tessdata");
        return binary.is_file().then(|| InstalledOcrComponent { binary, tessdata, languages: vec!["eng".into()] });
    }
    let output = Command::new("tesseract").arg("--list-langs").output().ok()?;
    let listing = format!("{}{}", String::from_utf8_lossy(&output.stdout), String::from_utf8_lossy(&output.stderr));
    if !listing.lines().any(|l| l.trim() == "eng") {
        return None;
    }
    // `List of available languages in "/usr/local/share/tessdata/" (3):`
    let tessdata = listing.lines().find_map(|l| {
        let start = l.find('"')? + 1;
        let end = l[start..].find('"')? + start;
        Some(PathBuf::from(&l[start..end]))
    })?;
    let binary = which("tesseract")?;
    Some(InstalledOcrComponent { binary, tessdata, languages: vec!["eng".into()] })
}

fn which(name: &str) -> Option<PathBuf> {
    let file = if cfg!(windows) { format!("{name}.exe") } else { name.to_string() };
    std::env::split_paths(&std::env::var_os("PATH")?)
        .map(|d| d.join(&file))
        .find(|p: &PathBuf| Path::is_file(p))
}

#[test]
fn tesseract_makes_the_scan_searchable_after_save() {
    let Some(component) = find_tesseract() else {
        if std::env::var("PDFLUENT_REQUIRE_OCR_ENGINE").as_deref() == Ok("1") {
            panic!("PDFLUENT_REQUIRE_OCR_ENGINE=1 but no Tesseract with English data was found (PDFLUENT_OCR_COMPONENT_DIR or PATH)");
        }
        eprintln!("SKIPPED (not a pass): no Tesseract with English language data on this machine (set PDFLUENT_OCR_COMPONENT_DIR or put tesseract on PATH)");
        return;
    };
    let engine = ComponentTesseract::new(&component, &["eng".into()]).expect("engine starts");
    let mut doc = OpenDocument::open_bytes(scanned_pdf()).unwrap();
    assert_unsearchable(&doc);

    let report = doc.add_ocr_text_layer(&engine, &[], "eng").expect("ocr");
    assert_eq!(report.pages_recognised, 1, "{report:?}");
    let reopened = save_and_reopen(&mut doc, "tesseract");
    let found = found_words(&reopened);
    // Recognition is not exact on every build; four of the five large words
    // is the floor, and zero is what the feature missing looks like.
    assert!(found.len() >= 4, "after OCR and save only {found:?} of {KEY_WORDS:?} are searchable; text: {:?}", reopened.extract_page_text(0));
}

// ── OCR is bundled in every build, not downloaded ────────────────────────
//
// Every build carries the component inside the app (scripts/ocr-component/
// ocr-bundle.mjs lays it out). These tests drive the code the app runs to find
// it; the logic is not behind a feature, so the default CI run covers it too.

/// "Installed" comes from the bundle alone, and the answer to a missing
/// component is its defect, never a download.
#[test]
fn a_build_without_its_bundle_names_the_defect_and_never_offers_a_download() {
    use pdfluent_lib::ocr_bundle::{compiled_manifest, platform_key, resolve, status};
    let manifest = compiled_manifest().expect("the compiled manifest parses");
    let nothing = scratch("bundle-absent").join("nothing-here");
    let s = status(&nothing, &manifest, &platform_key());
    assert!(!s.installed || s.development_override, "an empty bundle is not an installed component");
    if s.development_override {
        return; // PDFLUENT_OCR_COMPONENT_DIR (debug builds) answers instead of the bundle
    }
    assert!(s.problem.is_some(), "the status says why: {s:?}");
    let err = resolve(&nothing, &manifest, &platform_key()).unwrap_err();
    // Linux is no release platform: its key is not in the manifest, and the
    // refusal then says so instead of "not installed". Both name the defect.
    assert!(
        err.starts_with(pdfluent_lib::ocr_bundle::ERR_NOT_INSTALLED)
            || err.starts_with("OCR_COMPONENT_UNSUPPORTED_PLATFORM"),
        "{err}"
    );
    assert!(!err.to_lowercase().contains("download"), "{err}");
}

/// The shipped bundle: the folder `ocr-bundle.mjs --stage` wrote (or the
/// finished app's resource folder `resources/ocr`), named by
/// `PDFLUENT_OCR_BUNDLE_DIR`, judged by the manifest this build compiles in --
/// sizes as the app checks them, hashes as the build checks them -- then OCR
/// with exactly what is in it. Required (`PDFLUENT_REQUIRE_OCR_BUNDLE=1`) in
/// quality:macos and quality:windows and in every release build round, which
/// have the bundle.
#[test]
fn the_shipped_bundle_is_the_pinned_component_and_makes_the_scan_searchable() {
    use pdfluent_lib::ocr_bundle::{bundled, compiled_manifest, platform_key, verify_bundle_hashes};
    let Some(dir) = std::env::var_os("PDFLUENT_OCR_BUNDLE_DIR").map(PathBuf::from) else {
        if std::env::var("PDFLUENT_REQUIRE_OCR_BUNDLE").as_deref() == Ok("1") {
            panic!("PDFLUENT_REQUIRE_OCR_BUNDLE=1 but PDFLUENT_OCR_BUNDLE_DIR names no bundle");
        }
        eprintln!("SKIPPED (not a pass): no staged OCR bundle (set PDFLUENT_OCR_BUNDLE_DIR to the ocr-bundle.mjs --stage folder or the finished app's resources/ocr)");
        return;
    };
    let manifest = compiled_manifest().expect("the compiled manifest parses");
    let platform = platform_key();
    let component = bundled(&dir, &manifest, &platform).expect("the bundle is complete");
    verify_bundle_hashes(&dir, &manifest, &platform).expect("the bundled files are the pinned files");
    let languages: Vec<String> = component.languages.clone();
    assert!(languages.iter().any(|l| l == "eng"));
    let engine = ComponentTesseract::new(&component, &["eng".into()]).expect("the bundled Tesseract starts");
    let mut doc = OpenDocument::open_bytes(scanned_pdf()).unwrap();
    assert_unsearchable(&doc);
    let report = doc.add_ocr_text_layer(&engine, &[], "eng").expect("ocr with the bundled component");
    assert_eq!(report.pages_recognised, 1, "{report:?}");
    let reopened = save_and_reopen(&mut doc, "bundled");
    let found = found_words(&reopened);
    assert!(found.len() >= 4, "after OCR with the bundled component only {found:?} of {KEY_WORDS:?} are searchable; text: {:?}", reopened.extract_page_text(0));
}

/// The layout, without the release build: lay out a bundle from the component
/// `build-tesseract.sh` wrote for THIS machine (the way `ocr-bundle.mjs` lays
/// it out), pin it in the manifest, and OCR through the app's own bundle path. Proves that the folder structure the app reads is the one
/// the build writes, and that the binary runs from a bundle folder with its
/// language data beside it. Required with `PDFLUENT_REQUIRE_OCR_COMPONENT=1`.
#[test]
fn a_bundle_laid_out_from_the_built_component_runs_through_the_bundle_path() {
    use pdfluent_lib::ocr_bundle::{bundled, compiled_manifest, platform_key, resolve, status, verify_bundle_hashes};
    use sha2::{Digest, Sha256};

    let Some(build) = std::env::var_os("PDFLUENT_OCR_COMPONENT_BUILD").map(PathBuf::from) else {
        if std::env::var("PDFLUENT_REQUIRE_OCR_COMPONENT").as_deref() == Ok("1") {
            panic!("PDFLUENT_REQUIRE_OCR_COMPONENT=1 but PDFLUENT_OCR_COMPONENT_BUILD names no built component");
        }
        eprintln!("SKIPPED (not a pass): no built OCR component (set PDFLUENT_OCR_COMPONENT_BUILD to the --out folder of scripts/ocr-component/build-tesseract.sh)");
        return;
    };
    let platform = platform_key();
    let mut manifest = compiled_manifest().expect("the compiled manifest parses");
    manifest.platforms.retain(|k, _| *k == platform);
    manifest.languages.retain(|k, _| k == "eng");
    let bundle = scratch("bundle-layout");
    let entry = manifest.platforms.get_mut(&platform).unwrap_or_else(|| panic!("the manifest has no entry for {platform}"));
    let binary_rel = entry.binary.clone();
    for file in &mut entry.files {
        let from = build.join(&platform).join(&file.path);
        let bytes = std::fs::read(&from).unwrap_or_else(|e| panic!("{}: {e}", from.display()));
        file.sha256 = format!("{:x}", Sha256::digest(&bytes));
        file.size = bytes.len() as u64;
        let to = bundle.join(&file.path);
        std::fs::create_dir_all(to.parent().unwrap()).unwrap();
        std::fs::copy(&from, &to).unwrap(); // copy keeps the executable bit
    }
    let eng = manifest.languages.get_mut("eng").expect("eng in the manifest");
    let bytes = std::fs::read(build.join("tessdata").join(&eng.path)).expect("tessdata/eng.traineddata in the build");
    eng.sha256 = format!("{:x}", Sha256::digest(&bytes));
    eng.size = bytes.len() as u64;
    std::fs::create_dir_all(bundle.join("tessdata")).unwrap();
    std::fs::write(bundle.join("tessdata").join(&eng.path), &bytes).unwrap();
    manifest.published = true;

    let component = bundled(&bundle, &manifest, &platform).expect("the laid-out bundle is complete");
    assert_eq!(component.binary, bundle.join(&binary_rel));
    verify_bundle_hashes(&bundle, &manifest, &platform).expect("the laid-out files are the pinned files");
    let s = status(&bundle, &manifest, &platform);
    assert!(s.installed && s.problem.is_none(), "{s:?}");
    if !s.development_override {
        assert_eq!(resolve(&bundle, &manifest, &platform).unwrap().binary, component.binary);
    }

    let engine = ComponentTesseract::new(&component, &["eng".into()]).expect("the bundled engine starts");
    let mut doc = OpenDocument::open_bytes(scanned_pdf()).unwrap();
    assert_unsearchable(&doc);
    let report = doc.add_ocr_text_layer(&engine, &[], "eng").expect("ocr with the bundled layout");
    assert_eq!(report.pages_recognised, 1, "{report:?}");
    let reopened = save_and_reopen(&mut doc, "bundle-layout");
    let found = found_words(&reopened);
    assert!(found.len() >= 4, "after OCR from the bundle layout only {found:?} of {KEY_WORDS:?} are searchable; text: {:?}", reopened.extract_page_text(0));
}
