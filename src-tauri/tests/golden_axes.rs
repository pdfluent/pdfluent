// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary. The PDFluent application is free to use,
// including for commercial purposes. Redistribution, or extraction or reuse
// of its components (including the embedded PDF engine), requires a licence.
// See https://pdfluent.com/license for terms.

//! Four axes per capability, measured through the same seam the save
//! round-trip gate uses, written to `quality/runs/<run-id>.json`.
//!
//! This file only measures. Judging is `scripts/quality/ratchet.py`, against
//! `quality/axes/<capability>.tsv`, and the two are separate on purpose: a
//! measurement that decides whether it passed is a measurement nobody can
//! re-read later.
//!
//! Three capabilities are reachable from here today — save, text edit and
//! PDF/A export. The rest (open/render, Office, OCR, forms, signing) are named
//! in `docs/QUALITY_ROUNDS.md` as not yet measured, which is the honest state
//! rather than a gap someone forgot.
//!
//! Speed is five runs per document per operation. Numbers from a debug build
//! are not numbers, so this is meant to run under `--release`; a debug run
//! still records, and the machine class in the run file is what makes two runs
//! comparable at all.

use pdfluent_lib::OpenDocument;
use std::collections::BTreeMap;
use std::fs;
use std::path::{Path, PathBuf};
use std::time::Instant;

/// Runs per document per operation. Five is the engine's convention: enough
/// for a p95 that is not just the slowest of two.
const RUNS: usize = 5;

/// The free-tier watermark the engine used to stamp on every exported page.
/// Split so this file does not itself contain the string a grep looks for.
const STAMP_NEEDLE: &str = concat!("Free", " Tier");

fn repo_root() -> PathBuf {
    Path::new(env!("CARGO_MANIFEST_DIR"))
        .parent()
        .expect("repository root")
        .to_path_buf()
}

fn golden_dir() -> PathBuf {
    Path::new(env!("CARGO_MANIFEST_DIR")).join("tests/golden")
}

fn corpus() -> Vec<PathBuf> {
    let mut files: Vec<PathBuf> = fs::read_dir(golden_dir())
        .expect("golden corpus")
        .filter_map(|entry| entry.ok().map(|e| e.path()))
        .filter(|path| path.extension().is_some_and(|ext| ext == "pdf"))
        .collect();
    files.sort();
    files
}

fn name_of(path: &Path) -> String {
    path.file_stem().expect("file stem").to_string_lossy().to_string()
}

fn open(path: &Path) -> OpenDocument {
    OpenDocument::open_bytes(fs::read(path).expect("read"))
        .unwrap_or_else(|e| panic!("open {}: {e}", path.display()))
}

fn full_text(doc: &OpenDocument) -> String {
    (0..doc.page_count())
        .map(|page| doc.extract_page_text(page as u32).unwrap_or_default())
        .collect::<Vec<_>>()
        .join("\u{c}")
}

fn words(text: &str) -> usize {
    text.split_whitespace().count()
}

fn temp_dir() -> PathBuf {
    let dir = std::env::temp_dir().join(format!("pdfluent-axes-{}", std::process::id()));
    fs::create_dir_all(&dir).expect("temp dir");
    dir
}

/// One document, one capability: the four axes plus the samples behind them.
struct Measured {
    completes: bool,
    speed_ms: Vec<f64>,
    fidelity: BTreeMap<String, f64>,
    size_ratio: Option<f64>,
}

impl Measured {
    fn to_json(&self) -> String {
        let speeds = self
            .speed_ms
            .iter()
            .map(|ms| format!("{ms:.4}"))
            .collect::<Vec<_>>()
            .join(", ");
        let fidelity = self
            .fidelity
            .iter()
            .map(|(metric, value)| format!("\"{metric}\": {value:.4}"))
            .collect::<Vec<_>>()
            .join(", ");
        let size = match self.size_ratio {
            Some(ratio) => format!("{ratio:.4}"),
            None => "null".to_string(),
        };
        format!(
            "{{\"completes\": {}, \"speed_ms\": [{speeds}], \"fidelity\": {{{fidelity}}}, \"size_ratio\": {size}}}",
            self.completes
        )
    }
}

fn percentile(sorted: &[f64], pct: f64) -> f64 {
    if sorted.is_empty() {
        return 0.0;
    }
    if sorted.len() == 1 {
        return sorted[0];
    }
    let position = (sorted.len() - 1) as f64 * pct / 100.0;
    let lower = position.floor() as usize;
    let upper = (lower + 1).min(sorted.len() - 1);
    let weight = position - lower as f64;
    sorted[lower] * (1.0 - weight) + sorted[upper] * weight
}

/// The corpus row. Speed is the spread across documents (their p50s), not a
/// pool of every sample: a 209-page document would otherwise decide the
/// corpus number on its own.
fn all_row(per_document: &BTreeMap<String, Measured>) -> Measured {
    let mut medians: Vec<f64> = per_document
        .values()
        .map(|m| {
            let mut sorted = m.speed_ms.clone();
            sorted.sort_by(|a, b| a.partial_cmp(b).expect("no NaN"));
            percentile(&sorted, 50.0)
        })
        .collect();
    medians.sort_by(|a, b| a.partial_cmp(b).expect("no NaN"));

    let mut fidelity: BTreeMap<String, (f64, usize)> = BTreeMap::new();
    for measured in per_document.values() {
        for (metric, value) in &measured.fidelity {
            let entry = fidelity.entry(metric.clone()).or_insert((0.0, 0));
            entry.0 += value;
            entry.1 += 1;
        }
    }
    let ratios: Vec<f64> = per_document.values().filter_map(|m| m.size_ratio).collect();

    Measured {
        completes: per_document.values().all(|m| m.completes),
        // Five entries so p50/p95 come out of the same percentile code as a
        // document row: the corpus p50 and p95 across documents.
        speed_ms: vec![
            percentile(&medians, 50.0),
            percentile(&medians, 50.0),
            percentile(&medians, 50.0),
            percentile(&medians, 95.0),
            percentile(&medians, 95.0),
        ],
        fidelity: fidelity
            .into_iter()
            .map(|(metric, (total, count))| (metric, total / count as f64))
            .collect(),
        size_ratio: if ratios.is_empty() {
            None
        } else {
            Some(ratios.iter().sum::<f64>() / ratios.len() as f64)
        },
    }
}

fn measure_save(path: &Path) -> Measured {
    let name = name_of(path);
    let out = temp_dir().join(format!("{name}-save.pdf"));
    let before = {
        let doc = open(path);
        (doc.page_count(), full_text(&doc))
    };

    let mut speed_ms = Vec::new();
    for _ in 0..RUNS {
        let mut doc = open(path);
        let started = Instant::now();
        doc.save_to(out.to_str().expect("utf-8")).expect("save_to");
        speed_ms.push(started.elapsed().as_secs_f64() * 1000.0);
    }

    let after = open(&out);
    let after_text = full_text(&after);
    let pages_kept = if before.0 == 0 {
        100.0
    } else {
        after.page_count() as f64 / before.0 as f64 * 100.0
    };
    let words_kept = if words(&before.1) == 0 {
        100.0
    } else {
        words(&after_text) as f64 / words(&before.1) as f64 * 100.0
    };

    Measured {
        completes: true,
        speed_ms,
        fidelity: BTreeMap::from([
            ("pages_kept_pct".to_string(), pages_kept),
            ("words_kept_pct".to_string(), words_kept),
        ]),
        size_ratio: Some(ratio(path, &out)),
    }
}

fn measure_text_edit(path: &Path, word: &str) -> Measured {
    let name = name_of(path);
    let out = temp_dir().join(format!("{name}-edit.pdf"));
    // Same character count as the word it replaces: an edit that also changes
    // the line length confuses a layout regression with a writer regression.
    let replacement: String = "Edited".chars().cycle().take(word.chars().count()).collect();

    let mut speed_ms = Vec::new();
    let mut made = 0usize;
    for run in 0..RUNS {
        let mut doc = open(path);
        let started = Instant::now();
        let mut this_run = 0usize;
        for page in 0..doc.page_count() {
            while doc
                .replace_text_span(page as u32, word, &replacement)
                .expect("replace_text_span")
                .replaced
            {
                this_run += 1;
                assert!(this_run < 500, "{name}: the writer is not making progress");
            }
        }
        speed_ms.push(started.elapsed().as_secs_f64() * 1000.0);
        if run == RUNS - 1 {
            made = this_run;
            doc.save_to(out.to_str().expect("utf-8")).expect("save after edit");
        }
    }

    let persisted = if made == 0 {
        0
    } else {
        full_text(&open(&out)).matches(&replacement).count()
    };
    // Two numbers, not one: a replacement the writer reports and the save then
    // drops is the failure this axis exists for, and an average hides it.
    let persisted_pct = if made == 0 { 100.0 } else { persisted as f64 / made as f64 * 100.0 };

    Measured {
        completes: true,
        speed_ms,
        fidelity: BTreeMap::from([
            ("replacements_made".to_string(), made as f64),
            ("replacements_persisted_pct".to_string(), persisted_pct),
        ]),
        size_ratio: if made == 0 { None } else { Some(ratio(path, &out)) },
    }
}

fn measure_pdfa(path: &Path, verapdf: Option<&str>) -> Measured {
    let name = name_of(path);
    let out = temp_dir().join(format!("{name}-pdfa.pdf"));
    let before_text = full_text(&open(path));

    let mut speed_ms = Vec::new();
    let mut completes = true;
    for _ in 0..RUNS {
        let mut doc = open(path);
        let started = Instant::now();
        // A refused conversion is a document in the denominator, not a
        // document that quietly leaves the corpus.
        completes = doc.convert_to_pdfa("PDF/A-2b", out.to_str().expect("utf-8")).is_ok();
        speed_ms.push(started.elapsed().as_secs_f64() * 1000.0);
        if !completes {
            break;
        }
    }
    if !completes {
        return Measured { completes: false, speed_ms, fidelity: BTreeMap::new(), size_ratio: None };
    }

    let converted = open(&out);
    let after_text = full_text(&converted);
    let retention = if words(&before_text) == 0 {
        100.0
    } else {
        words(&after_text) as f64 / words(&before_text) as f64 * 100.0
    };
    let stamped = (0..converted.page_count())
        .filter(|page| {
            converted
                .extract_page_text(*page as u32)
                .unwrap_or_default()
                .contains(STAMP_NEEDLE)
        })
        .count();
    let unstamped_pct = if converted.page_count() == 0 {
        100.0
    } else {
        (converted.page_count() - stamped) as f64 / converted.page_count() as f64 * 100.0
    };

    let mut fidelity = BTreeMap::from([
        ("retention_words_pct".to_string(), retention),
        ("unstamped_pages_pct".to_string(), unstamped_pct),
    ]);
    if let Some(binary) = verapdf {
        // Absent, the metric is simply not in the run — it is not a document
        // that failed. The SKIPPED line below says the axis was not measured;
        // a row that once existed and cannot be re-measured is what the
        // ratchet treats as unmeasurable.
        if let Some(compliant) = verapdf_2b(binary, &out) {
            fidelity.insert("verapdf_2b".to_string(), if compliant { 1.0 } else { 0.0 });
        }
    }

    Measured { completes: true, speed_ms, fidelity, size_ratio: Some(ratio(path, &out)) }
}

fn verapdf_2b(binary: &str, path: &Path) -> Option<bool> {
    let output = std::process::Command::new(binary)
        .args(["--flavour", "2b", "--format", "text"])
        .arg(path)
        .output()
        .ok()?;
    let text = String::from_utf8_lossy(&output.stdout);
    Some(text.contains("PASS"))
}

fn ratio(input: &Path, output: &Path) -> f64 {
    let before = fs::metadata(input).expect("input size").len().max(1);
    fs::metadata(output).expect("output size").len() as f64 / before as f64
}

fn edit_words() -> BTreeMap<String, String> {
    // The same words the save round-trip gate uses, read from its baseline so
    // the two gates cannot drift into measuring different edits.
    let baseline = fs::read_to_string(golden_dir().join("baseline.tsv")).expect("baseline.tsv");
    let mut words = BTreeMap::new();
    for line in baseline.lines() {
        if line.starts_with('#') || line.starts_with("name\t") || line.trim().is_empty() {
            continue;
        }
        let fields: Vec<&str> = line.split('\t').collect();
        if fields.len() >= 7 && fields[6] != "-" {
            words.insert(fields[0].to_string(), fields[6].to_string());
        }
    }
    words
}

fn which(binary: &str) -> Option<String> {
    let found = std::process::Command::new("sh")
        .arg("-c")
        .arg(format!("command -v {binary}"))
        .output()
        .ok()?;
    let path = String::from_utf8_lossy(&found.stdout).trim().to_string();
    if path.is_empty() {
        None
    } else {
        Some(path)
    }
}

fn shell(command: &str) -> String {
    std::process::Command::new("sh")
        .arg("-c")
        .arg(command)
        .output()
        .ok()
        .map(|out| String::from_utf8_lossy(&out.stdout).trim().to_string())
        .unwrap_or_default()
}

fn json_object(entries: &BTreeMap<String, Measured>) -> String {
    entries
        .iter()
        .map(|(doc, measured)| format!("      \"{doc}\": {}", measured.to_json()))
        .collect::<Vec<_>>()
        .join(",\n")
}

#[test]
fn golden_axes_writes_a_run_file() {
    let Ok(machine) = std::env::var("PDFLUENT_MACHINE_CLASS") else {
        eprintln!(
            "SKIPPED (not a pass): PDFLUENT_MACHINE_CLASS is unset, so no run file was written. \
             A number without a machine class is not comparable to anything; see \
             quality/MACHINES.toml and docs/QUALITY_ROUNDS.md."
        );
        return;
    };

    let verapdf = which("verapdf");
    if verapdf.is_none() {
        eprintln!(
            "SKIPPED (not a pass): veraPDF is not installed, so the PDF/A conformance metric was \
             not measured. Retention, stamped pages, speed and size were."
        );
    }

    let words = edit_words();
    let files = corpus();
    assert!(files.len() >= 17, "golden corpus shrank to {}", files.len());

    let mut save = BTreeMap::new();
    let mut text_edit = BTreeMap::new();
    let mut pdfa = BTreeMap::new();

    for path in &files {
        let name = name_of(path);
        save.insert(name.clone(), measure_save(path));
        if let Some(word) = words.get(&name) {
            text_edit.insert(name.clone(), measure_text_edit(path, word));
        }
        pdfa.insert(name.clone(), measure_pdfa(path, verapdf.as_deref()));
    }

    save.insert("_all".to_string(), all_row(&save));
    text_edit.insert("_all".to_string(), all_row(&text_edit));
    pdfa.insert("_all".to_string(), all_row(&pdfa));

    let platform = if cfg!(target_os = "macos") {
        "darwin"
    } else if cfg!(target_os = "windows") {
        "windows"
    } else {
        "linux"
    };
    let commit = std::env::var("CI_COMMIT_SHA").unwrap_or_else(|_| shell("git rev-parse HEAD"));
    let short = commit.chars().take(7).collect::<String>();
    let date = shell("date -u +%Y-%m-%d");
    let run_id = format!("{machine}-{date}-{platform}-{short}");
    let sdk_rev = fs::read_to_string(Path::new(env!("CARGO_MANIFEST_DIR")).join("Cargo.toml"))
        .expect("Cargo.toml")
        .split("rev = \"")
        .nth(1)
        .map(|rest| rest.split('"').next().unwrap_or_default().to_string())
        .unwrap_or_default();

    let body = format!(
        "{{\n  \"run_id\": \"{run_id}\",\n  \"platform\": \"{platform}\",\n  \"machine\": \"{machine}\",\n  \
         \"set\": \"golden-17\",\n  \"editor_commit\": \"{commit}\",\n  \"xfa_sdk_rev\": \"{sdk_rev}\",\n  \
         \"tools\": {{\"verapdf\": \"{}\"}},\n  \"capabilities\": {{\n    \"save\": {{\n{}\n    }},\n    \
         \"text_edit\": {{\n{}\n    }},\n    \"pdfa\": {{\n{}\n    }}\n  }}\n}}\n",
        verapdf.as_deref().unwrap_or("absent"),
        json_object(&save),
        json_object(&text_edit),
        json_object(&pdfa),
    );

    let runs = repo_root().join("quality/runs");
    fs::create_dir_all(&runs).expect("quality/runs");
    let path = runs.join(format!("{run_id}.json"));
    fs::write(&path, body).expect("write run file");
    eprintln!("wrote {}", path.display());
}

#[test]
fn every_measured_document_is_in_the_manifest() {
    // Guards the run: numbers measured on a document nobody pinned cannot be
    // compared to anything later, and a corpus that quietly grew is how a
    // baseline stops describing the set it names.
    let manifest = fs::read_to_string(golden_dir().join("MANIFEST.json")).expect("MANIFEST.json");
    for path in corpus() {
        let name = name_of(&path);
        assert!(
            manifest.contains(&format!("\"name\": \"{name}\"")),
            "{name} is in the corpus but not in MANIFEST.json"
        );
    }
}
