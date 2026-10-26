// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary. The PDFluent application is free to use,
// including for commercial purposes. Redistribution, or extraction or reuse
// of its components (including the embedded PDF engine), requires a licence.
// See https://pdfluent.com/license for terms.

//! The evaluation harness and release gate for personal-data detection.
//!
//! The corpus (`tests/pii_eval/corpus/<lang>.jsonl`) is synthetic and labelled,
//! built by `tests/pii_eval/generate_corpus.py`. This file scores a detector
//! against it, per type and per language, with precision and recall, and holds
//! the detector to `tests/pii_eval/thresholds.json`. The specification is in
//! `docs/PII_DETECTION_GATE.md`.
//!
//! Three layers of checks:
//!
//! * the scoring itself is tested (a harness that cannot tell a perfect
//!   detector from an empty one gates nothing);
//! * the validator layer is scored on every run, in CI, and must meet
//!   `validator_layer` for every language;
//! * the model is scored only when the component is present
//!   (`PDFLUENT_PII_MODEL_DIR`, feature `pii-model`): that run decides
//!   whether `published` may be `true` in the manifest, and writes
//!   `resources/pii/gate-report.json` when `PDFLUENT_PII_WRITE_GATE=1`.
//!   Without the model it says `SKIPPED (not a pass)`.
//!
//! `a_published_manifest_has_a_matching_passing_gate_report` is the lock: the
//! manifest cannot say `published: true` unless the report on disk passed,
//! names this exact model file and was made from this exact corpus and
//! threshold file.

use pdfluent_lib::pii::PiiKind;
use pdfluent_lib::pii_component;
use pdfluent_lib::pii_model::{self, NerBackend};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::collections::BTreeMap;
use std::path::PathBuf;

fn manifest_dir() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR"))
}

fn eval_dir() -> PathBuf {
    manifest_dir().join("tests/pii_eval")
}

fn gate_report_path() -> PathBuf {
    manifest_dir().join("resources/pii/gate-report.json")
}

// ── corpus ───────────────────────────────────────────────────────────────

#[derive(Debug, Clone, Deserialize)]
struct Entity {
    #[serde(rename = "type")]
    kind: String,
    /// Unicode scalar offsets, end exclusive.
    start: usize,
    end: usize,
    text: String,
    /// `"model"`: no rule can prove this entity, only the model is expected to find it.
    #[serde(default)]
    layer: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
struct Doc {
    id: String,
    lang: String,
    text: String,
    entities: Vec<Entity>,
}

#[derive(Debug, Clone, Deserialize)]
struct Limit {
    precision: f64,
    recall: f64,
}

#[derive(Debug, Clone, Deserialize)]
struct Thresholds {
    iou: f64,
    min_support: usize,
    required_languages: Vec<String>,
    validator_layer: BTreeMap<String, Limit>,
    full: BTreeMap<String, Limit>,
}

fn load_thresholds() -> (Thresholds, Vec<u8>) {
    let bytes = std::fs::read(eval_dir().join("thresholds.json")).expect("thresholds.json");
    (serde_json::from_slice(&bytes).expect("thresholds.json parses"), bytes)
}

fn load_corpus(languages: &[String]) -> (Vec<Doc>, String) {
    let mut docs = Vec::new();
    let mut hasher = Sha256::new();
    for lang in languages {
        let bytes = std::fs::read(eval_dir().join("corpus").join(format!("{lang}.jsonl")))
            .unwrap_or_else(|e| panic!("corpus/{lang}.jsonl: {e}"));
        hasher.update(&bytes);
        for line in String::from_utf8(bytes).expect("utf-8").lines().filter(|l| !l.trim().is_empty()) {
            docs.push(serde_json::from_str::<Doc>(line).unwrap_or_else(|e| panic!("corpus/{lang}.jsonl: {e}")));
        }
    }
    (docs, hex(&hasher.finalize()))
}

/// The corpus as the validator layer is held to it: entities only the model
/// can find are not expected of it.
fn without_model_only(docs: &[Doc]) -> Vec<Doc> {
    docs.iter()
        .map(|d| Doc {
            entities: d.entities.iter().filter(|e| e.layer.as_deref() != Some("model")).cloned().collect(),
            ..d.clone()
        })
        .collect()
}

fn hex(bytes: &[u8]) -> String {
    bytes.iter().map(|b| format!("{b:02x}")).collect()
}

fn sha_of(bytes: &[u8]) -> String {
    hex(&Sha256::digest(bytes))
}

// ── predictions and scoring ──────────────────────────────────────────────

/// A prediction in the corpus's own terms: type name, scalar offsets.
#[derive(Debug, Clone, PartialEq, Eq)]
struct Pred {
    kind: String,
    start: usize,
    end: usize,
}

/// The eval type name of a detector kind, or None for kinds that are not
/// scored (bank accounts other than IBAN have no gold in the corpus).
fn eval_type(kind: PiiKind) -> Option<&'static str> {
    Some(match kind {
        PiiKind::Iban => "iban",
        PiiKind::CreditCard => "credit_card",
        PiiKind::NationalId => "national_id",
        PiiKind::DateOfBirth => "date_of_birth",
        PiiKind::Email => "email",
        PiiKind::Phone => "phone",
        PiiKind::Person => "person",
        PiiKind::Address => "address",
        PiiKind::BankAccount => return None,
    })
}

fn byte_to_char(text: &str, byte: usize) -> usize {
    text[..byte].chars().count()
}

fn predict(text: &str, ner: Option<&dyn NerBackend>) -> Vec<Pred> {
    pii_model::analyse(text, ner)
        .expect("analyse")
        .into_iter()
        .filter_map(|s| {
            Some(Pred {
                kind: eval_type(s.kind)?.to_string(),
                start: byte_to_char(text, s.start),
                end: byte_to_char(text, s.end),
            })
        })
        .collect()
}

#[derive(Debug, Clone, Copy, Default, Serialize, PartialEq, Eq)]
struct Counts {
    tp: usize,
    fp: usize,
    fn_: usize,
}

impl Counts {
    fn support(&self) -> usize {
        self.tp + self.fn_
    }
    /// 1.0 when nothing was predicted: an empty answer makes no false claim.
    fn precision(&self) -> f64 {
        if self.tp + self.fp == 0 { 1.0 } else { self.tp as f64 / (self.tp + self.fp) as f64 }
    }
    /// 1.0 when there was nothing to find.
    fn recall(&self) -> f64 {
        if self.tp + self.fn_ == 0 { 1.0 } else { self.tp as f64 / (self.tp + self.fn_) as f64 }
    }
}

fn iou(a: (usize, usize), b: (usize, usize)) -> f64 {
    let inter = a.1.min(b.1).saturating_sub(a.0.max(b.0));
    let union = (a.1 - a.0) + (b.1 - b.0) - inter;
    if union == 0 { 0.0 } else { inter as f64 / union as f64 }
}

/// Score one document: a prediction matches an unmatched gold entity of the
/// same type when their intersection over union reaches `min_iou`; matching is
/// one-to-one, best overlap first. Types are scored independently.
fn score_doc(gold: &[Entity], preds: &[Pred], min_iou: f64, into: &mut BTreeMap<String, Counts>) {
    let mut types: Vec<&str> = gold.iter().map(|g| g.kind.as_str()).chain(preds.iter().map(|p| p.kind.as_str())).collect();
    types.sort_unstable();
    types.dedup();
    for t in types {
        let g: Vec<&Entity> = gold.iter().filter(|e| e.kind == t).collect();
        let p: Vec<&Pred> = preds.iter().filter(|e| e.kind == t).collect();
        let mut pairs: Vec<(f64, usize, usize)> = Vec::new();
        for (gi, ge) in g.iter().enumerate() {
            for (pi, pe) in p.iter().enumerate() {
                let o = iou((ge.start, ge.end), (pe.start, pe.end));
                if o >= min_iou {
                    pairs.push((o, gi, pi));
                }
            }
        }
        pairs.sort_by(|a, b| b.0.total_cmp(&a.0));
        let (mut gu, mut pu) = (vec![false; g.len()], vec![false; p.len()]);
        let mut tp = 0;
        for (_, gi, pi) in pairs {
            if !gu[gi] && !pu[pi] {
                gu[gi] = true;
                pu[pi] = true;
                tp += 1;
            }
        }
        let c = into.entry(t.to_string()).or_default();
        c.tp += tp;
        c.fn_ += g.len() - tp;
        c.fp += p.len() - tp;
    }
}

/// language -> type -> counts
type Scores = BTreeMap<String, BTreeMap<String, Counts>>;

fn evaluate(docs: &[Doc], min_iou: f64, detect: &dyn Fn(&str) -> Vec<Pred>) -> Scores {
    let mut scores: Scores = BTreeMap::new();
    for doc in docs {
        let preds = detect(&doc.text);
        score_doc(&doc.entities, &preds, min_iou, scores.entry(doc.lang.clone()).or_default());
    }
    scores
}

/// Why a layer fails its thresholds: one line per cell below the line, or
/// with too little evidence to judge.
fn gate_failures(scores: &Scores, limits: &BTreeMap<String, Limit>, thresholds: &Thresholds) -> Vec<String> {
    let mut out = Vec::new();
    for lang in &thresholds.required_languages {
        let Some(by_type) = scores.get(lang) else {
            out.push(format!("{lang}: no documents scored"));
            continue;
        };
        for (kind, limit) in limits {
            let c = by_type.get(kind).copied().unwrap_or_default();
            if c.support() < thresholds.min_support {
                out.push(format!("{lang}/{kind}: {} gold entities, {} needed to judge", c.support(), thresholds.min_support));
                continue;
            }
            if c.precision() < limit.precision {
                out.push(format!("{lang}/{kind}: precision {:.3} < {:.2} (tp {}, fp {})", c.precision(), limit.precision, c.tp, c.fp));
            }
            if c.recall() < limit.recall {
                out.push(format!("{lang}/{kind}: recall {:.3} < {:.2} (tp {}, fn {})", c.recall(), limit.recall, c.tp, c.fn_));
            }
        }
    }
    out
}

fn table(scores: &Scores) -> String {
    let mut s = String::from("lang  type            support  precision  recall\n");
    for (lang, by_type) in scores {
        for (kind, c) in by_type {
            s.push_str(&format!("{lang:<5} {kind:<15} {:>7}  {:>9.3}  {:>6.3}\n", c.support(), c.precision(), c.recall()));
        }
    }
    s
}

// ── tests of the harness itself ──────────────────────────────────────────

fn ent(kind: &str, start: usize, end: usize) -> Entity {
    Entity { kind: kind.into(), start, end, text: String::new(), layer: None }
}

fn pred(kind: &str, start: usize, end: usize) -> Pred {
    Pred { kind: kind.into(), start, end }
}

fn counts_of(gold: &[Entity], preds: &[Pred]) -> BTreeMap<String, Counts> {
    let mut m = BTreeMap::new();
    score_doc(gold, preds, 0.5, &mut m);
    m
}

#[test]
fn a_perfect_detector_scores_one_and_an_empty_one_scores_zero_recall() {
    let gold = [ent("iban", 0, 10), ent("person", 20, 30)];
    let perfect = counts_of(&gold, &[pred("iban", 0, 10), pred("person", 20, 30)]);
    for c in perfect.values() {
        assert_eq!((c.precision(), c.recall()), (1.0, 1.0));
    }
    let empty = counts_of(&gold, &[]);
    for c in empty.values() {
        assert_eq!((c.tp, c.fn_, c.recall()), (0, 1, 0.0));
    }
}

#[test]
fn overlap_must_reach_the_iou_and_the_type_must_match() {
    let gold = [ent("person", 0, 10)];
    // 5 of 10 characters: IoU 0.5, counts.
    assert_eq!(counts_of(&gold, &[pred("person", 0, 5)])["person"].tp, 1);
    // 4 of 10: IoU 0.4, does not.
    let c = counts_of(&gold, &[pred("person", 0, 4)]);
    assert_eq!((c["person"].tp, c["person"].fp, c["person"].fn_), (0, 1, 1));
    // Right place, wrong type: a miss for the gold type and a false positive for the other.
    let c = counts_of(&gold, &[pred("address", 0, 10)]);
    assert_eq!((c["person"].fn_, c["address"].fp), (1, 1));
}

#[test]
fn matching_is_one_to_one() {
    let gold = [ent("email", 0, 10)];
    let c = counts_of(&gold, &[pred("email", 0, 10), pred("email", 0, 10)]);
    assert_eq!((c["email"].tp, c["email"].fp), (1, 1), "a duplicate prediction is a false positive");
    let gold = [ent("email", 0, 10), ent("email", 5, 15)];
    let c = counts_of(&gold, &[pred("email", 0, 15)]);
    assert_eq!(c["email"].tp, 1, "one prediction cannot cover two entities");
}

fn gate_limits() -> (Thresholds, BTreeMap<String, Limit>) {
    let (t, _) = load_thresholds();
    let limits = t.validator_layer.clone();
    (t, limits)
}

#[test]
fn the_gate_fails_a_detector_that_finds_nothing_and_one_with_too_little_evidence() {
    let (t, limits) = gate_limits();
    let (docs, _) = load_corpus(&t.required_languages);
    let nothing = evaluate(&docs, t.iou, &|_| Vec::new());
    let failures = gate_failures(&nothing, &limits, &t);
    assert!(failures.iter().any(|f| f.contains("recall")), "{failures:#?}");
    assert!(failures.len() >= limits.len() * t.required_languages.len(), "every cell fails: {}", failures.len());

    // Perfect predictions but a corpus cut to a handful of documents: not enough support to judge.
    let few: Vec<Doc> = docs.iter().filter(|d| d.lang == "en").take(3).cloned().collect();
    let gold_as_pred = evaluate(&few, t.iou, &|text| {
        few.iter()
            .find(|d| d.text == text)
            .map(|d| d.entities.iter().map(|e| pred(&e.kind, e.start, e.end)).collect())
            .unwrap_or_default()
    });
    let failures = gate_failures(&gold_as_pred, &limits, &t);
    assert!(failures.iter().any(|f| f.contains("needed to judge")), "{failures:#?}");
}

#[test]
fn a_detector_that_flags_everything_fails_on_precision() {
    let (t, limits) = gate_limits();
    let (docs, _) = load_corpus(&["en".to_string()]);
    // Every digit run of 6 or more is "national_id": the select-all detector.
    let greedy = evaluate(&docs, t.iou, &|text| {
        let chars: Vec<char> = text.chars().collect();
        let mut out = Vec::new();
        let mut i = 0;
        while i < chars.len() {
            if chars[i].is_ascii_digit() {
                let s = i;
                while i < chars.len() && chars[i].is_ascii_digit() {
                    i += 1;
                }
                if i - s >= 6 {
                    out.push(pred("national_id", s, i));
                }
            } else {
                i += 1;
            }
        }
        out
    });
    let mut one_lang = t.clone();
    one_lang.required_languages = vec!["en".into()];
    let failures = gate_failures(&greedy, &limits, &one_lang);
    assert!(failures.iter().any(|f| f.starts_with("en/national_id") && f.contains("precision")), "{failures:#?}");
}

// ── the corpus ───────────────────────────────────────────────────────────

#[test]
fn the_corpus_is_well_formed_and_big_enough_for_every_gated_type() {
    let (t, _) = load_thresholds();
    let (docs, _) = load_corpus(&t.required_languages);
    let mut support: BTreeMap<(String, String), usize> = BTreeMap::new();
    for doc in &docs {
        let chars: Vec<char> = doc.text.chars().collect();
        let mut taken: Vec<(usize, usize)> = Vec::new();
        for e in &doc.entities {
            assert!(e.start < e.end && e.end <= chars.len(), "{}: {e:?} outside the text", doc.id);
            let slice: String = chars[e.start..e.end].iter().collect();
            assert_eq!(slice, e.text, "{}: offsets do not hold the entity text", doc.id);
            assert!(t.full.contains_key(&e.kind), "{}: unknown type {:?}", doc.id, e.kind);
            assert!(!taken.iter().any(|&(s, en)| e.start < en && s < e.end), "{}: overlapping entities", doc.id);
            taken.push((e.start, e.end));
            *support.entry((doc.lang.clone(), e.kind.clone())).or_default() += 1;
        }
    }
    for lang in &t.required_languages {
        for kind in t.full.keys() {
            let n = support.get(&(lang.clone(), kind.clone())).copied().unwrap_or(0);
            assert!(n >= t.min_support, "{lang}/{kind}: only {n} gold entities, {} needed", t.min_support);
        }
        assert!(docs.iter().any(|d| &d.lang == lang));
    }
}

#[test]
fn the_corpus_holds_look_alikes_the_detector_must_not_report() {
    // Without distractors a detector that flags every number would score 1.0.
    let (t, _) = load_thresholds();
    let (docs, _) = load_corpus(&t.required_languages);
    let text: String = docs.iter().map(|d| d.text.as_str()).collect::<Vec<_>>().join("\n");
    assert!(text.contains("123456789"), "no 9-digit non-BSN look-alike");
    assert!(text.contains("4111 1111 1111 1112") || docs.iter().any(|d| d.text.contains("Credit")), "no card that fails Luhn");
    let unlabelled_numbers = docs.iter().filter(|d| d.text.contains("4821937")).count();
    assert!(unlabelled_numbers >= t.required_languages.len(), "order numbers missing");
}

// ── the validator layer, every run ───────────────────────────────────────

/// The numbers no rule can prove are in the corpus on purpose, and the
/// validator layer does not find them: that is the hole the model has to
/// close, and the full gate holds it to that. If this test starts failing the
/// validator layer has grown a rule (good: move the entities out of the
/// "model" layer) or the corpus lost the hard cases (bad).
#[test]
fn the_corpus_has_entities_only_the_model_can_find_and_the_validators_miss_them() {
    let (t, _) = load_thresholds();
    let (docs, _) = load_corpus(&t.required_languages);
    let hard: Vec<&Entity> = docs.iter().flat_map(|d| d.entities.iter()).filter(|e| e.layer.as_deref() == Some("model")).collect();
    assert!(hard.len() >= 10, "only {} model-only entities", hard.len());
    let mut missed = 0;
    for d in &docs {
        let found = predict(&d.text, None);
        for e in d.entities.iter().filter(|e| e.layer.as_deref() == Some("model")) {
            if !found.iter().any(|p| p.kind == e.kind && iou((p.start, p.end), (e.start, e.end)) >= t.iou) {
                missed += 1;
            }
        }
    }
    assert_eq!(missed, hard.len(), "a model-only entity was found by a rule: reclassify it");
}

#[test]
fn the_validator_layer_meets_its_thresholds_in_every_language() {
    let (t, _) = load_thresholds();
    let (docs, _) = load_corpus(&t.required_languages);
    let scores = evaluate(&without_model_only(&docs), t.iou, &|text| predict(text, None));
    let failures = gate_failures(&scores, &t.validator_layer, &t);
    println!("{}", table(&scores));
    assert!(failures.is_empty(), "validator layer below its gate:\n{}\n{}", failures.join("\n"), table(&scores));
}

// ── the model gate ───────────────────────────────────────────────────────

#[derive(Debug, Serialize, Deserialize)]
struct GateReport {
    pass: bool,
    model_sha256: String,
    corpus_sha256: String,
    thresholds_sha256: String,
    /// Languages whose every gated type passed.
    languages_passed: Vec<String>,
    failures: Vec<String>,
    scores: BTreeMap<String, BTreeMap<String, ReportCell>>,
}

#[derive(Debug, Serialize, Deserialize)]
struct ReportCell {
    support: usize,
    precision: f64,
    recall: f64,
}

#[cfg(feature = "pii-model")]
fn model_dir() -> Option<PathBuf> {
    std::env::var_os("PDFLUENT_PII_MODEL_DIR").map(PathBuf::from)
}

/// Scores the model plus validators on the whole corpus. Run in the build
/// round, on the machine that has the component:
///
///   PDFLUENT_PII_MODEL_DIR=<folder with model/, runtime/> \
///   PDFLUENT_PII_WRITE_GATE=1 cargo test --features pii-model --test pii_eval model_gate -- --nocapture
#[cfg(feature = "pii-model")]
#[test]
fn model_gate_scores_the_model_and_the_validators_together() {
    let Some(dir) = model_dir() else {
        eprintln!("SKIPPED (not a pass): PDFLUENT_PII_MODEL_DIR is not set, so the model was not scored");
        return;
    };
    let (t, t_bytes) = load_thresholds();
    let (docs, corpus_sha) = load_corpus(&t.required_languages);
    let runtime = std::fs::read_dir(dir.join("runtime"))
        .expect("runtime/ in the model folder")
        .flatten()
        .map(|e| e.path())
        .find(|p| p.extension().is_some_and(|x| x == "dylib" || x == "dll"))
        .expect("an ONNX Runtime library in runtime/");
    let model_path = dir.join(pii_component::MODEL_FILE);
    let model = pii_model::gline::GlinerModel::load(&runtime, &dir.join(pii_component::TOKENIZER_FILE), &model_path, pii_component::manifest().expect("manifest").model.max_width).expect("model loads");

    let scores = evaluate(&docs, t.iou, &|text| predict(text, Some(&model)));
    let failures = gate_failures(&scores, &t.full, &t);
    println!("{}", table(&scores));

    let mut cells: BTreeMap<String, BTreeMap<String, ReportCell>> = BTreeMap::new();
    for (lang, by_type) in &scores {
        for (kind, c) in by_type {
            cells.entry(lang.clone()).or_default().insert(
                kind.clone(),
                ReportCell { support: c.support(), precision: c.precision(), recall: c.recall() },
            );
        }
    }
    let languages_passed: Vec<String> = t
        .required_languages
        .iter()
        .filter(|l| !failures.iter().any(|f| f.starts_with(&format!("{l}/")) || f.starts_with(&format!("{l}:"))))
        .cloned()
        .collect();
    let report = GateReport {
        pass: failures.is_empty(),
        model_sha256: pii_component::hash_file(&model_path).expect("hash the model").0,
        corpus_sha256: corpus_sha,
        thresholds_sha256: sha_of(&t_bytes),
        languages_passed,
        failures: failures.clone(),
        scores: cells,
    };
    if std::env::var_os("PDFLUENT_PII_WRITE_GATE").is_some() {
        std::fs::write(gate_report_path(), serde_json::to_vec_pretty(&report).unwrap()).expect("write the gate report");
    }
    assert!(failures.is_empty(), "the model does not meet the gate:\n{}", failures.join("\n"));
}

#[cfg(not(feature = "pii-model"))]
#[test]
fn model_gate_needs_the_pii_model_feature() {
    eprintln!("SKIPPED (not a pass): built without the `pii-model` feature, so the model was not scored; run with --features pii-model and PDFLUENT_PII_MODEL_DIR in the build round");
}

// ── the lock between the gate and the manifest ───────────────────────────

/// Does `report` justify publishing? One answer, used by the real check and
/// by the test that proves it refuses every mismatch.
fn check_report(
    report: &GateReport,
    model_sha: &str,
    corpus_sha: &str,
    thresholds_sha: &str,
    listed: &[String],
    required: &[String],
) -> Result<(), String> {
    if !report.pass {
        return Err(format!("the gate report did not pass: {:?}", report.failures));
    }
    if report.model_sha256 != model_sha {
        return Err("the report was made with a different model file".into());
    }
    if report.corpus_sha256 != corpus_sha {
        return Err("the corpus changed since the report".into());
    }
    if report.thresholds_sha256 != thresholds_sha {
        return Err("the thresholds changed since the report".into());
    }
    let (mut listed, mut passed) = (listed.to_vec(), report.languages_passed.clone());
    listed.sort();
    passed.sort();
    if listed != passed {
        return Err("the manifest lists languages the gate did not pass, or omits ones it did".into());
    }
    if let Some(missing) = required.iter().find(|r| !listed.contains(r)) {
        return Err(format!("{missing} is required and did not pass: the model is not shipped with a gap"));
    }
    Ok(())
}

/// The manifest may say `published: true` only with a gate report that
/// passed, was made from this model file, this corpus and these thresholds,
/// and whose passing languages are exactly the languages the manifest lists.
#[test]
fn a_published_manifest_has_a_matching_passing_gate_report() {
    let manifest = pii_component::manifest().expect("manifest");
    if !manifest.published {
        assert!(manifest.languages.is_empty(), "an unpublished component lists no supported language");
        eprintln!("SKIPPED (not a pass): the manifest is not published, so there is no gate report to match; the refusal logic is covered by `a_gate_report_that_does_not_match_blocks_publication`");
        return;
    }
    let (t, t_bytes) = load_thresholds();
    let (_, corpus_sha) = load_corpus(&t.required_languages);
    let report: GateReport = serde_json::from_slice(&std::fs::read(gate_report_path()).expect("a published manifest needs resources/pii/gate-report.json"))
        .expect("gate report parses");
    let model = manifest.shared.iter().find(|f| f.path == pii_component::MODEL_FILE).expect("model entry");
    check_report(&report, &model.sha256, &corpus_sha, &sha_of(&t_bytes), &manifest.languages, &t.required_languages)
        .unwrap_or_else(|e| panic!("{e}"));
}

/// The lock has teeth: every way a report can fail to match is refused.
#[test]
fn a_gate_report_that_does_not_match_blocks_publication() {
    let s = |v: &[&str]| v.iter().map(|x| x.to_string()).collect::<Vec<_>>();
    let good = GateReport {
        pass: true,
        model_sha256: "m".into(),
        corpus_sha256: "c".into(),
        thresholds_sha256: "t".into(),
        languages_passed: s(&["en", "nl"]),
        failures: vec![],
        scores: BTreeMap::new(),
    };
    let ok = |r: &GateReport, m: &str, c: &str, t: &str, listed: &[&str], req: &[&str]| check_report(r, m, c, t, &s(listed), &s(req));
    assert!(ok(&good, "m", "c", "t", &["en", "nl"], &["en", "nl"]).is_ok());
    assert!(ok(&good, "other", "c", "t", &["en", "nl"], &["en", "nl"]).is_err(), "different model");
    assert!(ok(&good, "m", "other", "t", &["en", "nl"], &["en", "nl"]).is_err(), "different corpus");
    assert!(ok(&good, "m", "c", "other", &["en", "nl"], &["en", "nl"]).is_err(), "different thresholds");
    assert!(ok(&good, "m", "c", "t", &["en"], &["en", "nl"]).is_err(), "manifest lists fewer languages than passed");
    assert!(ok(&good, "m", "c", "t", &["en", "nl"], &["en", "nl", "de"]).is_err(), "a required language did not pass");
    let failed = GateReport { pass: false, ..good };
    assert!(ok(&failed, "m", "c", "t", &["en", "nl"], &["en", "nl"]).is_err(), "a failed run");
}
