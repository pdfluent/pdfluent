// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary. The PDFluent application is free to use,
// including for commercial purposes. Redistribution, or extraction or reuse
// of its components (including the embedded PDF engine), requires a licence.
// See https://pdfluent.com/license for terms.

//! Golden-set save round-trip gate.
//!
//! What the editor does when the user presses Save is: open the bytes, mutate
//! nothing (or replace a text span), write them back. That path had no test in
//! this repository. `mod pdf_engine` is private, so an integration test could
//! not reach `OpenDocument` at all, and the round-trip numbers in the plan came
//! from a scratch replica of the open/save path rather than from the path
//! itself — a replica cannot go red when the real one breaks.
//!
//! Two kinds of check run here, and they fail for different reasons:
//!
//! * **Invariants.** open → save → reopen, and open → edit → save → reopen,
//!   must not lose a page, lose a word, or produce a file the engine can no
//!   longer parse. These compare a document against itself, so they need no
//!   stored numbers and hold for any document, including the local corpus.
//! * **Baseline.** `tests/golden/baseline.tsv` records what each document is on
//!   the way in (pages, words, a hash of the extracted text) and what the round
//!   trip costs (saved/original size, replacements made, replacements that
//!   survived the save). A change in text extraction or in the writer then
//!   shows up as a diff to a reviewed file instead of as a silent shift.
//!   Regenerate deliberately: `PDFLUENT_GOLDEN_BLESS=1 cargo test --test
//!   golden_roundtrip` and read the diff before committing it.
//!
//! The corpus in `tests/golden/` is redistributable: two of this repository's
//! own fixtures and fifteen XFA golden forms from the SDK. The six real-world
//! documents the plan measured (8–209 pages) are of unknown licence and are not
//! in the repository. Point `PDFLUENT_GOLDEN_LOCAL_DIR` at a directory of PDFs
//! to run the invariants over those too; when it is unset the test says so on
//! stderr rather than passing quietly.

use pdfluent_lib::OpenDocument;
use std::collections::BTreeMap;
use std::fs;
use std::path::{Path, PathBuf};

/// Size headroom over the recorded round-trip ratio before the gate fails.
/// The writer is deterministic, so this is slack for noise, not room for a
/// document to grow.
const SIZE_SLACK: f64 = 0.02;

/// A page cannot plausibly hold more than this many copies of one word; the
/// cap turns a writer that stops making progress into a failure instead of a
/// hang.
const MAX_REPLACEMENTS_PER_PAGE: usize = 200;

fn golden_dir() -> PathBuf {
    Path::new(env!("CARGO_MANIFEST_DIR")).join("tests/golden")
}

fn baseline_path() -> PathBuf {
    golden_dir().join("baseline.tsv")
}

/// FNV-1a, written out rather than pulled in: this crate has no hashing
/// dependency and the hash only has to be stable across runs.
fn text_hash(text: &str) -> String {
    let mut hash: u64 = 0xcbf2_9ce4_8422_2325;
    for byte in text.as_bytes() {
        hash ^= u64::from(*byte);
        hash = hash.wrapping_mul(0x0000_0100_0000_01b3);
    }
    format!("{hash:016x}")
}

/// Everything the gate reads out of a document, in one pass.
struct Shape {
    pages: usize,
    words: usize,
    hash: String,
    text: String,
}

fn shape_of(doc: &OpenDocument) -> Shape {
    let pages = doc.page_count();
    let mut text = String::new();
    for page in 0..pages {
        // A page whose text cannot be extracted is part of the shape: it has to
        // stay unextractable, not turn into silently missing words.
        let page_text = doc
            .extract_page_text(page as u32)
            .unwrap_or_else(|e| format!("<extract-error: {e}>"));
        text.push_str(&page_text);
        text.push('\x0c');
    }
    Shape {
        pages,
        words: text.split_whitespace().count(),
        hash: text_hash(&text),
        text,
    }
}

/// Replacement text of exactly the same character count as the word it
/// replaces: an edit that also changes the line length would confuse a layout
/// regression with a writer regression. It must not contain the word itself,
/// or replacing every occurrence would never terminate.
fn replacement_for(word: &str) -> String {
    let filler = "Edited";
    let replacement: String = filler.chars().cycle().take(word.chars().count()).collect();
    assert!(
        !replacement.contains(word),
        "replacement for {word:?} contains it"
    );
    replacement
}

struct Row {
    pages: usize,
    words: usize,
    hash: String,
    bytes: u64,
    saved_ratio: f64,
    /// Word the edit→save case replaces, or `-` for a document with no
    /// content-stream text to edit.
    edit_word: String,
    /// Occurrences the writer replaces. `0` is a recorded miss and needs a note.
    edit_made: usize,
    /// Replacements still in the extracted text after the save. Lower than
    /// `edit_made` is a recorded loss and needs a note.
    edit_persisted: usize,
    note: String,
}

const HEADER: &str =
    "name\tpages\twords\ttext_fnv1a64\tbytes\tsaved_ratio\tedit_word\tedit_made\tedit_persisted\tnote";

fn read_baseline() -> BTreeMap<String, Row> {
    let raw = fs::read_to_string(baseline_path())
        .unwrap_or_else(|e| panic!("read {}: {e}", baseline_path().display()));
    let mut rows = BTreeMap::new();
    for line in raw.lines() {
        if line.starts_with('#') || line.trim().is_empty() || line.starts_with("name\t") {
            continue;
        }
        let f: Vec<&str> = line.split('\t').collect();
        assert_eq!(f.len(), 10, "malformed baseline row: {line}");
        rows.insert(
            f[0].to_string(),
            Row {
                pages: f[1].parse().expect("pages"),
                words: f[2].parse().expect("words"),
                hash: f[3].to_string(),
                bytes: f[4].parse().expect("bytes"),
                saved_ratio: f[5].parse().expect("saved_ratio"),
                edit_word: f[6].to_string(),
                edit_made: f[7].parse().expect("edit_made"),
                edit_persisted: f[8].parse().expect("edit_persisted"),
                note: f[9].to_string(),
            },
        );
    }
    rows
}

fn format_row(name: &str, row: &Row) -> String {
    format!(
        "{name}\t{}\t{}\t{}\t{}\t{:.4}\t{}\t{}\t{}\t{}",
        row.pages,
        row.words,
        row.hash,
        row.bytes,
        row.saved_ratio,
        row.edit_word,
        row.edit_made,
        row.edit_persisted,
        row.note
    )
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

fn temp_out(name: &str, suffix: &str) -> PathBuf {
    let dir = std::env::temp_dir().join(format!("pdfluent-golden-{}", std::process::id()));
    fs::create_dir_all(&dir).expect("temp dir");
    dir.join(format!("{name}-{suffix}.pdf"))
}

/// open → save → reopen. Nothing is edited, so nothing may change. Returns the
/// shape on the way in and the saved/original size ratio.
fn save_roundtrip(path: &Path) -> (Shape, f64) {
    let name = name_of(path);
    let mut doc = open(path);
    let before = shape_of(&doc);

    let out = temp_out(&name, "save");
    doc.save_to(out.to_str().expect("utf-8 path"))
        .unwrap_or_else(|e| panic!("{name}: save_to: {e}"));

    let after = shape_of(&open(&out));
    assert_eq!(after.pages, before.pages, "{name}: save changed the page count");
    assert_eq!(
        after.words, before.words,
        "{name}: save changed the extractable word count"
    );
    assert_eq!(after.hash, before.hash, "{name}: save changed the extracted text");

    let original = fs::metadata(path).expect("input size").len().max(1);
    let saved = fs::metadata(&out).expect("saved size").len();
    (before, saved as f64 / original as f64)
}

/// open → replace every occurrence of `word` → save → reopen. Returns
/// (replacements made, replacements still present after the save).
fn edit_roundtrip(path: &Path, word: &str) -> (usize, usize) {
    let name = name_of(path);
    let replacement = replacement_for(word);
    let mut doc = open(path);
    let pages = doc.page_count();

    let mut made = 0usize;
    for page in 0..pages {
        let mut on_page = 0usize;
        while doc
            .replace_text_span(page as u32, word, &replacement)
            .unwrap_or_else(|e| panic!("{name}: replace_text_span page {page}: {e}"))
            .replaced
        {
            made += 1;
            on_page += 1;
            assert!(
                on_page < MAX_REPLACEMENTS_PER_PAGE,
                "{name}: page {page} kept reporting replacements — the writer is not making progress"
            );
        }
    }
    if made == 0 {
        return (0, 0);
    }

    let out = temp_out(&name, "edit");
    doc.save_to(out.to_str().expect("utf-8 path"))
        .unwrap_or_else(|e| panic!("{name}: save_to after edit: {e}"));

    let after = shape_of(&open(&out));
    assert_eq!(
        after.pages,
        pages,
        "{name}: edit + save changed the page count"
    );
    (made, after.text.matches(&replacement).count())
}

fn measure(path: &Path, edit_word: &str, note: &str) -> Row {
    let (shape, saved_ratio) = save_roundtrip(path);
    let (made, persisted) = if edit_word == "-" {
        (0, 0)
    } else {
        edit_roundtrip(path, edit_word)
    };
    Row {
        pages: shape.pages,
        words: shape.words,
        hash: shape.hash,
        bytes: fs::metadata(path).expect("input size").len(),
        saved_ratio,
        edit_word: edit_word.to_string(),
        edit_made: made,
        edit_persisted: persisted,
        note: note.to_string(),
    }
}

#[test]
fn golden_corpus_and_baseline_describe_the_same_documents() {
    // Guards the gate: an empty corpus, or a baseline that drifted away from
    // the files on disk, would let the checks below pass on nothing.
    if std::env::var("PDFLUENT_GOLDEN_BLESS").is_ok() {
        // The other test rewrites baseline.tsv in this mode; reading it here
        // at the same time would compare against a half-written file.
        eprintln!("SKIPPED (not a pass): PDFLUENT_GOLDEN_BLESS is set, so the baseline is being rewritten");
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
            "{} has no baseline row — run with PDFLUENT_GOLDEN_BLESS=1 and read the diff",
            name_of(path)
        );
    }
    for name in baseline.keys() {
        assert!(
            files.iter().any(|p| name_of(p) == *name),
            "baseline row {name} has no document"
        );
    }
}

#[test]
fn golden_corpus_survives_open_save_and_edit_save() {
    let files = corpus(&golden_dir());
    let baseline = read_baseline();
    let bless = std::env::var("PDFLUENT_GOLDEN_BLESS").is_ok();
    let mut blessed: Vec<String> = vec![HEADER.to_string()];
    // Collected rather than asserted one at a time: when a change moves several
    // documents at once, the whole list is the news.
    let mut moved: Vec<String> = Vec::new();

    for path in &files {
        let name = name_of(path);
        let previous = baseline.get(&name);
        let word = previous.map_or("-", |r| r.edit_word.as_str());
        let note = previous.map_or("-", |r| r.note.as_str());
        let now = measure(path, word, note);

        if bless {
            blessed.push(format_row(&name, &now));
            continue;
        }

        let was = previous.unwrap_or_else(|| panic!("{name}: no baseline row"));
        if now.pages != was.pages {
            moved.push(format!("{name}: pages {} → {}", was.pages, now.pages));
        }
        if now.words != was.words {
            moved.push(format!("{name}: words {} → {}", was.words, now.words));
        }
        if now.hash != was.hash {
            moved.push(format!(
                "{name}: extracted text changed ({} → {})",
                was.hash, now.hash
            ));
        }
        if now.bytes != was.bytes {
            moved.push(format!("{name}: input bytes {} → {}", was.bytes, now.bytes));
        }
        if now.saved_ratio > was.saved_ratio + SIZE_SLACK {
            moved.push(format!(
                "{name}: save grew to {:.4}× (baseline {:.4}×)",
                now.saved_ratio, was.saved_ratio
            ));
        }
        if now.edit_made != was.edit_made {
            moved.push(format!(
                "{name}: replaced {} occurrences of {:?}, baseline says {}",
                now.edit_made, was.edit_word, was.edit_made
            ));
        }
        if now.edit_persisted != was.edit_persisted {
            moved.push(format!(
                "{name}: {} replacements survived the save, baseline says {}",
                now.edit_persisted, was.edit_persisted
            ));
        }
        // A miss or a loss is allowed to be a known fact, never an unexplained
        // one: the plan asks for a reason for every occurrence that does not
        // make it through. Collected rather than asserted, so a missing note
        // does not hide the list of documents that moved.
        if ((was.edit_word != "-" && was.edit_made == 0) || was.edit_persisted < was.edit_made)
            && was.note == "-"
        {
            moved.push(format!(
                "{name}: the baseline records a miss or a lost replacement with no reason"
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

    assert!(
        moved.is_empty(),
        "the golden set moved:\n  {}",
        moved.join("\n  ")
    );
}

/// The six real-world documents (8–209 pages) the plan measured are of unknown
/// licence and are not in the repository. The invariants need no baseline, so
/// they run over a local corpus whenever one is configured.
#[test]
fn local_corpus_survives_open_save() {
    let Ok(dir) = std::env::var("PDFLUENT_GOLDEN_LOCAL_DIR") else {
        eprintln!(
            "SKIPPED (not a pass): PDFLUENT_GOLDEN_LOCAL_DIR is unset, so the real-world \
             documents were not exercised. See src-tauri/tests/golden/README.md."
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
    for file in &files {
        let (shape, ratio) = save_roundtrip(file);
        eprintln!(
            "local corpus: {} pages={} words={} saved={:.4}×",
            name_of(file),
            shape.pages,
            shape.words,
            ratio
        );
    }
}
