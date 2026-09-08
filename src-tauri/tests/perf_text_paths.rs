// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary. The PDFluent application is free to use,
// including for commercial purposes. Redistribution, or extraction or reuse
// of its components (including the embedded PDF engine), requires a licence.
// See https://pdfluent.com/license for terms.

//! What the backend costs on the open path and on a repeat read, in
//! milliseconds, on a document the size the budgets are written for.
//!
//! docs/EDITOR_2_PLAN.md §3 asks for "open a 200-page PDF, app start to first
//! painted page, ≤ 1.5 s". The end of that budget is in the webview and is
//! measured there (src/viewer/performance/perfMarks.ts); this file measures the
//! part that is in Rust, so the two halves of the number are attributable.
//!
//! The A/B is in one binary on purpose. Comparing against a build of the
//! previous commit would compare two compilations on two machine states; here
//! the cold and the warm read of the same page happen microseconds apart, in
//! the same process, on the same document, so the difference is the caching and
//! nothing else.
//!
//! Numbers from a debug build are not numbers. The `quality:axes` job runs this
//! under `--release`; a debug run still measures and still gates, and says so.

use pdfluent_lib::OpenDocument;
use std::time::Instant;

/// Pages in the synthetic document. The plan's budget names 200; the corpus
/// has no document that size, and generating one keeps the measurement
/// reproducible on any machine without shipping a multi-megabyte fixture.
const PAGES: usize = 200;

/// Repeats per measurement. Five is the convention of the other gates here.
const RUNS: usize = 5;

fn median(mut samples: Vec<f64>) -> f64 {
    samples.sort_by(|a, b| a.partial_cmp(b).expect("no NaN"));
    if samples.is_empty() {
        return 0.0;
    }
    samples[samples.len() / 2]
}

fn ms_since(started: Instant) -> f64 {
    started.elapsed().as_secs_f64() * 1000.0
}

/// A document with `pages` pages, each carrying three short text runs, built in
/// memory so the test needs no fixture on disk.
fn synthetic_document(pages: usize) -> Vec<u8> {
    use lopdf::{dictionary, Document, Object, Stream};

    let mut doc = Document::with_version("1.7");
    let font_id = doc.add_object(Object::Dictionary(dictionary! {
        "Type" => "Font",
        "Subtype" => "Type1",
        "BaseFont" => "Helvetica",
    }));
    let resources_id = doc.add_object(Object::Dictionary(dictionary! {
        "Font" => dictionary! { "F1" => Object::Reference(font_id) },
    }));
    let pages_id = doc.new_object_id();

    let mut page_ids = Vec::with_capacity(pages);
    for page in 0..pages {
        let content = format!(
            "BT /F1 12 Tf 72 720 Td (Page {page} heading) Tj ET\n\
             BT /F1 10 Tf 72 700 Td (The quick brown fox jumps over the lazy dog.) Tj ET\n\
             BT /F1 10 Tf 72 686 Td (Paragraph {page} of a synthetic performance fixture.) Tj ET\n"
        );
        let content_id = doc.add_object(Stream::new(dictionary! {}, content.into_bytes()));
        let page_id = doc.add_object(Object::Dictionary(dictionary! {
            "Type" => "Page",
            "Parent" => Object::Reference(pages_id),
            "Contents" => Object::Reference(content_id),
            "Resources" => Object::Reference(resources_id),
            "MediaBox" => vec![0.into(), 0.into(), 612.into(), 792.into()],
        }));
        page_ids.push(Object::Reference(page_id));
    }

    let count = page_ids.len() as i64;
    doc.objects.insert(
        pages_id,
        Object::Dictionary(dictionary! {
            "Type" => "Pages",
            "Kids" => page_ids,
            "Count" => count,
        }),
    );
    let catalog_id = doc.add_object(Object::Dictionary(dictionary! {
        "Type" => "Catalog",
        "Pages" => Object::Reference(pages_id),
    }));
    doc.trailer.set("Root", Object::Reference(catalog_id));

    let mut bytes = Vec::new();
    doc.save_to(&mut bytes).expect("serialize the synthetic document");
    bytes
}

fn build_profile() -> &'static str {
    if cfg!(debug_assertions) {
        "debug (numbers are indicative only)"
    } else {
        "release"
    }
}

/// The backend half of the open budget, printed so it can be quoted.
///
/// Three numbers, because they are three different decisions:
///   parse         — reading and parsing the file
///   document_info — what the frontend gets back from `open_pdf`
///   probe         — the scanned-page walk, one span extraction per page
///
/// The probe is the number that made this story: it is not on the open path any
/// more (it waits for the first paint), but it is still the largest piece of
/// backend work a document open causes, so it has to stay visible.
#[test]
fn the_backend_open_path_is_measured_on_a_two_hundred_page_document() {
    let bytes = synthetic_document(PAGES);
    println!(
        "\nopen path, {PAGES} pages, {} KB, {} build, median of {RUNS}",
        bytes.len() / 1024,
        build_profile()
    );

    let mut parse = Vec::new();
    let mut info = Vec::new();
    let mut probe = Vec::new();
    for _ in 0..RUNS {
        let started = Instant::now();
        let mut doc = OpenDocument::open_bytes(bytes.clone()).expect("open");
        parse.push(ms_since(started));

        let started = Instant::now();
        let reported = doc.document_info();
        info.push(ms_since(started));
        assert_eq!(reported.page_count as usize, PAGES);

        let started = Instant::now();
        let mut pages_with_text = 0usize;
        for page in 0..PAGES {
            if !doc
                .extract_page_text_spans(page as u32)
                .expect("spans")
                .is_empty()
            {
                pages_with_text += 1;
            }
        }
        probe.push(ms_since(started));
        assert_eq!(
            pages_with_text, PAGES,
            "the fixture must have text on every page, or the probe measures nothing"
        );
    }

    println!("  parse            {:8.1} ms", median(parse));
    println!("  document_info    {:8.1} ms", median(info));
    println!("  scanned-page probe ({PAGES} pages) {:6.1} ms", median(probe.clone()));
    println!(
        "  probe per page   {:8.2} ms",
        median(probe) / PAGES as f64
    );
}

/// The cache, measured rather than asserted into existence.
///
/// Cold is the first read of a page: the rendering engine interprets it. Warm
/// is the second read of the same page with nothing changed in between. Both
/// happen in the same process on the same document, so the ratio is the caching
/// and not the machine.
///
/// This is the gate for the memo: delete `spans_cache` and the warm read costs
/// the same as the cold one, which fails here.
#[test]
fn a_second_read_of_an_unchanged_page_does_not_interpret_it_again() {
    let bytes = synthetic_document(PAGES);
    let mut doc = OpenDocument::open_bytes(bytes).expect("open");

    let mut cold = Vec::with_capacity(PAGES);
    let mut warm = Vec::with_capacity(PAGES);
    for page in 0..PAGES {
        let started = Instant::now();
        let first = doc.extract_page_text_spans(page as u32).expect("cold read");
        cold.push(ms_since(started));

        let started = Instant::now();
        let second = doc.extract_page_text_spans(page as u32).expect("warm read");
        warm.push(ms_since(started));

        assert_eq!(
            first.len(),
            second.len(),
            "page {page} returned different spans on the second read"
        );
    }

    let cold_p50 = median(cold);
    let warm_p50 = median(warm);
    println!(
        "\npage text spans, {} build, {PAGES} pages\n  cold {cold_p50:8.3} ms\n  warm {warm_p50:8.3} ms\n  ratio {:.1}x",
        build_profile(),
        if warm_p50 > 0.0 { cold_p50 / warm_p50 } else { f64::INFINITY }
    );

    // Deliberately loose. The claim is "the second read does not do the work
    // again", not a speed target; a factor of two survives a loaded CI runner
    // and still fails the moment the memo stops being used.
    assert!(
        warm_p50 * 2.0 < cold_p50,
        "a repeat read of an unchanged page costs about as much as the first \
         (cold {cold_p50:.3} ms, warm {warm_p50:.3} ms) — the per-page memo is not being used"
    );
}

/// The same open path on the real corpus.
///
/// The synthetic document above is generated so the measurement runs anywhere,
/// but its content streams are three short lines a page. Real documents are
/// where the probe actually costs something, and the per-page number here is
/// what has to be multiplied by a page count to reason about a 200-page file.
#[test]
fn the_backend_open_path_is_measured_on_the_golden_corpus() {
    let dir = std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("tests/golden");
    let mut files: Vec<std::path::PathBuf> = std::fs::read_dir(&dir)
        .expect("golden corpus")
        .filter_map(|entry| entry.ok().map(|e| e.path()))
        .filter(|path| path.extension().is_some_and(|ext| ext == "pdf"))
        .collect();
    files.sort();
    assert!(files.len() >= 17, "golden corpus shrank to {}", files.len());

    println!(
        "\nopen path on the golden corpus, {} build, median of 3\n\
         {:<34} {:>5} {:>9} {:>9} {:>11} {:>9}",
        build_profile(),
        "document",
        "pages",
        "parse ms",
        "info ms",
        "probe ms",
        "per page"
    );

    let mut per_page_all = Vec::new();
    for path in &files {
        let bytes = std::fs::read(path).expect("read");
        let mut parse = Vec::new();
        let mut info = Vec::new();
        let mut probe = Vec::new();
        let mut pages = 0usize;
        for _ in 0..3 {
            let started = Instant::now();
            let mut doc = OpenDocument::open_bytes(bytes.clone()).expect("open");
            parse.push(ms_since(started));

            let started = Instant::now();
            pages = doc.document_info().page_count as usize;
            info.push(ms_since(started));

            let started = Instant::now();
            for page in 0..pages {
                let _ = doc.extract_page_text_spans(page as u32);
            }
            probe.push(ms_since(started));
        }
        let probe_p50 = median(probe);
        let per_page = if pages == 0 { 0.0 } else { probe_p50 / pages as f64 };
        per_page_all.push(per_page);
        println!(
            "{:<34} {:>5} {:>9.1} {:>9.1} {:>11.1} {:>9.2}",
            path.file_stem().expect("stem").to_string_lossy(),
            pages,
            median(parse),
            median(info),
            probe_p50,
            per_page
        );
    }

    let per_page_p50 = median(per_page_all);
    println!(
        "\n  median probe cost per page across the corpus: {per_page_p50:.2} ms\n  \
         that is {:.0} ms of backend work for a 200-page document of this kind",
        per_page_p50 * 200.0
    );
}

/// An edit must cost a re-read. The complement of the case above: proof that
/// the speed comes from not repeating work, not from serving stale text.
#[test]
fn an_edit_makes_the_next_read_of_that_page_do_the_work_again() {
    let bytes = synthetic_document(8);
    let mut doc = OpenDocument::open_bytes(bytes).expect("open");

    let before = doc.extract_page_text_spans(0).expect("spans");
    assert!(before.iter().any(|span| span.text.contains("quick brown fox")));

    let result = doc
        .replace_text_span(0, "quick", "lively", None)
        .expect("replace");
    assert!(result.replaced, "the fixture edit must apply: {result:?}");

    let after = doc.extract_page_text_spans(0).expect("spans after the edit");
    assert!(
        after.iter().any(|span| span.text.contains("lively")),
        "the page was served from the memo after it changed"
    );
}
