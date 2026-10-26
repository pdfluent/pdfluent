// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary. The PDFluent application is free to use,
// including for commercial purposes. Redistribution, or extraction or reuse
// of its components (including the embedded PDF engine), requires a licence.
// See https://pdfluent.com/license for terms.

//! The model half of personal-data detection, and how it meets the validators.
//!
//! A zero-shot multilingual NER model (GLiNER, run on ONNX Runtime through
//! `ort`, with the span encoding and decoding in `pii_gliner.rs`) reads the
//! page text and proposes spans for labels we hand it ("person", "street address", ...). It is an opt-in component
//! (`pii_component.rs`); without it the detector is the validator layer alone
//! and says so.
//!
//! What this module owns is the part that has to be right whatever the model
//! is: the [`NerBackend`] seam (so the merge logic is tested without a model),
//! chunking text to the model's window, mapping the model's labels onto
//! [`PiiKind`], and [`analyse`], which runs the validators and the model on the
//! same text and merges them into suggestions:
//!
//! * a validated hit (checksum, context word) is the strongest evidence and is
//!   always kept; the model span at the same place only confirms it;
//! * a model span that overlaps a validated hit of another kind is dropped;
//! * a model IBAN or card number that fails its checksum is dropped: a failed
//!   checksum is evidence the number is not one;
//! * everything else the model finds (names, addresses, birth dates, ID
//!   numbers in formats we have no rule for, phone numbers in national forms
//!   we do not parse) is kept as an unvalidated suggestion with its score.
//!
//! Nothing here redacts. The output is a list of proposals for the review
//! panel; the user ticks, and the redaction path removes the text.

use crate::pii::{self, PiiKind};
use serde::Serialize;

/// The labels sent to the model and the kind each one means. The wording is
/// the model's prompt: GLiNER matches on the label text, so these are plain
/// English noun phrases the PII checkpoints were trained with.
pub const MODEL_LABELS: &[(&str, PiiKind)] = &[
    ("person", PiiKind::Person),
    ("street address", PiiKind::Address),
    ("date of birth", PiiKind::DateOfBirth),
    ("bank account number", PiiKind::BankAccount),
    ("national identification number", PiiKind::NationalId),
    ("iban", PiiKind::Iban),
    ("credit card number", PiiKind::CreditCard),
    ("email address", PiiKind::Email),
    ("phone number", PiiKind::Phone),
];

pub fn kind_for_label(label: &str) -> Option<PiiKind> {
    MODEL_LABELS
        .iter()
        .find(|(l, _)| l.eq_ignore_ascii_case(label))
        .map(|(_, k)| *k)
}

/// The label strings, in the order the backend receives them.
pub fn model_labels() -> Vec<&'static str> {
    MODEL_LABELS.iter().map(|(l, _)| *l).collect()
}

/// Model spans below this score are not asked for at all.
pub const MODEL_MIN_SCORE: f32 = 0.5;
/// A model-only suggestion is ticked in the review list from this score up.
/// Below it, it is listed but unticked. Nothing is redacted either way until
/// the user presses the button.
pub const MODEL_PRESELECT_SCORE: f32 = 0.9;

/// A span the model proposes, as byte offsets into the text it was given.
#[derive(Debug, Clone, PartialEq)]
pub struct NerSpan {
    pub label: String,
    pub start: usize,
    pub end: usize,
    pub score: f32,
}

/// Anything that can label spans in text. The production backend is
/// [`gline::GlinerModel`]; tests use a scripted one.
pub trait NerBackend {
    fn recognise(&self, text: &str, labels: &[&str]) -> Result<Vec<NerSpan>, String>;
}

/// Where a suggestion came from.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum Source {
    /// A pattern with a checksum or a context word.
    Pattern,
    /// The model alone.
    Model,
    /// Both found it.
    Both,
}

/// One proposed piece of personal data, as byte offsets into the analysed text.
#[derive(Debug, Clone, PartialEq)]
pub struct Suggestion {
    pub kind: PiiKind,
    pub detail: Option<String>,
    pub start: usize,
    pub end: usize,
    pub source: Source,
    /// 1.0 for a validated pattern, the model's score otherwise.
    pub score: f32,
    /// A checksum or context rule proved it (not just the model's say-so).
    pub validated: bool,
}

impl Suggestion {
    pub fn text<'a>(&self, haystack: &'a str) -> &'a str {
        &haystack[self.start..self.end]
    }

    /// Ticked by default in the review list.
    pub fn preselected(&self) -> bool {
        self.validated || self.score >= MODEL_PRESELECT_SCORE
    }
}

// ── chunking ───────────────────────────────────────────────────────────

/// Windows of at most `max_bytes` bytes, each starting `overlap` bytes before
/// the previous one ended, cut at whitespace so a name is not split, and
/// always on char boundaries. A short text is one window.
pub fn chunk_ranges(text: &str, max_bytes: usize, overlap: usize) -> Vec<(usize, usize)> {
    assert!(max_bytes > overlap && max_bytes > 0);
    if text.len() <= max_bytes {
        return if text.trim().is_empty() { Vec::new() } else { vec![(0, text.len())] };
    }
    let mut out = Vec::new();
    let mut start = 0usize;
    while start < text.len() {
        let mut end = (start + max_bytes).min(text.len());
        while !text.is_char_boundary(end) {
            end -= 1;
        }
        if end < text.len() {
            // Cut after the last whitespace in the window, if there is one
            // past the overlap region (otherwise the window cannot advance).
            if let Some(ws) = text[start..end].rfind(char::is_whitespace) {
                if start + ws > start + overlap {
                    end = start + ws;
                }
            }
        }
        out.push((start, end));
        if end >= text.len() {
            break;
        }
        let mut next = end.saturating_sub(overlap);
        while !text.is_char_boundary(next) {
            next += 1;
        }
        // Start the next window at a word, not mid-word.
        if let Some(ws) = text[next..end].find(char::is_whitespace) {
            next += ws + 1;
            while next < end && !text.is_char_boundary(next) {
                next += 1;
            }
        }
        start = next.max(start + 1);
        while !text.is_char_boundary(start) {
            start += 1;
        }
    }
    out
}

/// Characters of text per model call. The checkpoint reads 512 tokens; a
/// token is roughly three to four characters, so 1200 leaves room for
/// numbers and non-Latin scripts, which tokenise longer.
pub const CHUNK_BYTES: usize = 1200;
pub const CHUNK_OVERLAP: usize = 160;

/// Run the model over every chunk of `text` and return spans in the text's
/// own offsets, with the duplicates the overlap produces merged (same label,
/// overlapping: the higher score wins).
pub fn recognise_chunked(backend: &dyn NerBackend, text: &str) -> Result<Vec<NerSpan>, String> {
    let labels = model_labels();
    let mut all: Vec<NerSpan> = Vec::new();
    for (start, end) in chunk_ranges(text, CHUNK_BYTES, CHUNK_OVERLAP) {
        let window = &text[start..end];
        for mut span in backend.recognise(window, &labels)? {
            if span.score < MODEL_MIN_SCORE || span.start >= span.end || span.end > window.len() {
                continue;
            }
            if !window.is_char_boundary(span.start) || !window.is_char_boundary(span.end) {
                continue;
            }
            span.start += start;
            span.end += start;
            all.push(span);
        }
    }
    all.sort_by(|a, b| a.start.cmp(&b.start).then(b.score.total_cmp(&a.score)));
    let mut merged: Vec<NerSpan> = Vec::new();
    for span in all {
        match merged.iter_mut().find(|m| m.label == span.label && span.start < m.end && m.start < span.end) {
            Some(m) => {
                m.start = m.start.min(span.start);
                m.end = m.end.max(span.end);
                m.score = m.score.max(span.score);
            }
            None => merged.push(span),
        }
    }
    Ok(merged)
}

// ── merging ────────────────────────────────────────────────────────────

fn overlaps(a: (usize, usize), b: (usize, usize)) -> bool {
    a.0 < b.1 && b.0 < a.1
}

/// Trim spaces and edge punctuation the model tends to swallow. Returns None
/// when nothing is left.
fn trim_span(text: &str, start: usize, end: usize) -> Option<(usize, usize)> {
    let slice = &text[start..end];
    let trimmed_start = slice.trim_start_matches(|c: char| c.is_whitespace() || matches!(c, ',' | ';' | ':' | '(' | ')'));
    let lead = slice.len() - trimmed_start.len();
    let trimmed = trimmed_start.trim_end_matches(|c: char| c.is_whitespace() || matches!(c, ',' | ';' | ':' | '(' | ')' | '.'));
    if trimmed.is_empty() {
        None
    } else {
        Some((start + lead, start + lead + trimmed.len()))
    }
}

/// Kinds for which a failed checksum proves the model wrong.
fn checksum_kind(kind: PiiKind) -> bool {
    matches!(kind, PiiKind::Iban | PiiKind::CreditCard)
}

/// Validators and (when given) the model on one text, merged. Reading order.
pub fn analyse(text: &str, ner: Option<&dyn NerBackend>) -> Result<Vec<Suggestion>, String> {
    let mut out: Vec<Suggestion> = pii::detect(text)
        .into_iter()
        .map(|m| Suggestion {
            kind: m.kind,
            detail: m.detail.map(str::to_string),
            start: m.start,
            end: m.end,
            source: Source::Pattern,
            score: 1.0,
            validated: true,
        })
        .collect();

    if let Some(backend) = ner {
        let mut model: Vec<Suggestion> = Vec::new();
        for span in recognise_chunked(backend, text)? {
            let Some(kind) = kind_for_label(&span.label) else { continue };
            let Some((start, end)) = trim_span(text, span.start, span.end) else { continue };

            // Confirms a validated hit of the same kind at the same place.
            if let Some(v) = out
                .iter_mut()
                .find(|v| v.validated && v.kind == kind && overlaps((v.start, v.end), (start, end)))
            {
                v.source = Source::Both;
                continue;
            }
            // Another kind already proved it, or a checksum kind that failed.
            if out.iter().any(|v| v.validated && overlaps((v.start, v.end), (start, end))) {
                continue;
            }
            if checksum_kind(kind) {
                continue;
            }
            model.push(Suggestion {
                kind,
                detail: None,
                start,
                end,
                source: Source::Model,
                score: span.score,
                validated: false,
            });
        }
        // Model spans of different kinds on the same text: the higher score.
        model.sort_by(|a, b| b.score.total_cmp(&a.score));
        for s in model {
            if !out.iter().any(|o| overlaps((o.start, o.end), (s.start, s.end))) {
                out.push(s);
            }
        }
    }
    out.sort_by_key(|s| s.start);
    Ok(out)
}

// ── the model itself (feature `pii-model`) ─────────────────────────────

/// Is this build able to run the model at all? False when the crate was built
/// without the `pii-model` feature (the Mac App Store build and any build
/// where the ONNX runtime cannot be shipped).
pub const fn model_in_build() -> bool {
    cfg!(feature = "pii-model")
}

#[cfg(feature = "pii-model")]
pub mod gline {
    //! The model on ONNX Runtime: `ort` (the same pinned version as the
    //! engine's `pdf-ocr`) for the session, `tokenizers` for the word pieces,
    //! and `pii_gliner` for everything in between. The runtime library is
    //! loaded at run time from the component folder (`load-dynamic`), never
    //! from the system.
    use super::{NerBackend, NerSpan};
    use crate::pii_gliner;
    use ort::session::Session;
    use ort::value::Tensor;
    use std::path::Path;
    use std::sync::Mutex;
    use tokenizers::Tokenizer;

    pub struct GlinerModel {
        // `Session::run` takes `&mut self`.
        session: Mutex<Session>,
        tokenizer: Tokenizer,
        max_width: usize,
        cls_id: i64,
        sep_id: i64,
    }

    fn err(code: &str, e: impl std::fmt::Display) -> String {
        format!("{code}: {e}")
    }

    impl GlinerModel {
        /// `runtime_library` is the ONNX Runtime shared library from the
        /// component folder. `ort` reads its location from `ORT_DYLIB_PATH`
        /// the first time it is used, so the variable is set here, once,
        /// before the session is built.
        pub fn load(runtime_library: &Path, tokenizer: &Path, onnx: &Path, max_width: usize) -> Result<Self, String> {
            std::env::set_var("ORT_DYLIB_PATH", runtime_library);
            let tokenizer = Tokenizer::from_file(tokenizer).map_err(|e| err("PII_MODEL_LOAD_FAILED", e))?;
            let id = |t: &str| {
                tokenizer
                    .token_to_id(t)
                    .map(i64::from)
                    .ok_or_else(|| format!("PII_MODEL_LOAD_FAILED: the tokenizer has no {t} token"))
            };
            let (cls_id, sep_id) = (id("[CLS]")?, id("[SEP]")?);
            let session = Session::builder()
                .map_err(|e| err("PII_MODEL_LOAD_FAILED", e))?
                .commit_from_file(onnx)
                .map_err(|e| err("PII_MODEL_LOAD_FAILED", e))?;
            Ok(Self { session: Mutex::new(session), tokenizer, max_width, cls_id, sep_id })
        }

        fn infer(&self, e: &pii_gliner::Encoded, max_width: usize) -> Result<Vec<f32>, String> {
            let n = e.input_ids.len();
            let (span_idx, span_mask) = pii_gliner::span_inputs(e.num_words, max_width);
            let tensor = |r: Result<_, ort::Error>| r.map_err(|x| err("PII_MODEL_INPUT", x));
            let input_ids = tensor(Tensor::from_array(([1usize, n], e.input_ids.clone())))?;
            let attention_mask = tensor(Tensor::from_array(([1usize, n], e.attention_mask.clone())))?;
            let words_mask = tensor(Tensor::from_array(([1usize, n], e.words_mask.clone())))?;
            let text_lengths = tensor(Tensor::from_array(([1usize, 1usize], vec![e.num_words as i64])))?;
            let span_idx = tensor(Tensor::from_array(([1usize, e.num_words * max_width, 2usize], span_idx)))?;
            let span_mask = tensor(Tensor::from_array(([1usize, e.num_words * max_width], span_mask)))?;
            let mut session = self.session.lock().map_err(|x| err("PII_MODEL_RUN_FAILED", x))?;
            let outputs = session
                .run(ort::inputs![
                    "input_ids" => input_ids,
                    "attention_mask" => attention_mask,
                    "words_mask" => words_mask,
                    "text_lengths" => text_lengths,
                    "span_idx" => span_idx,
                    "span_mask" => span_mask,
                ])
                .map_err(|x| err("PII_MODEL_RUN_FAILED", x))?;
            let (_shape, data) = outputs["logits"]
                .try_extract_tensor::<f32>()
                .map_err(|x| err("PII_MODEL_OUTPUT", x))?;
            Ok(data.to_vec())
        }
    }

    impl NerBackend for GlinerModel {
        fn recognise(&self, text: &str, labels: &[&str]) -> Result<Vec<NerSpan>, String> {
            let mut encode_word = |word: &str| -> Result<Vec<u32>, String> {
                self.tokenizer
                    .encode(word, false)
                    .map(|enc| enc.get_ids().to_vec())
                    .map_err(|x| err("PII_MODEL_TOKENIZE", x))
            };
            let mut infer = |e: &pii_gliner::Encoded, w: usize| self.infer(e, w);
            pii_gliner::recognise(
                text,
                labels,
                self.max_width,
                super::MODEL_MIN_SCORE,
                self.cls_id,
                self.sep_id,
                &mut encode_word,
                &mut infer,
            )
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    /// A backend that returns what it was told to, for whatever text it gets:
    /// each (needle, label, score) is reported at every place the needle occurs.
    struct Scripted(Vec<(&'static str, &'static str, f32)>);

    impl NerBackend for Scripted {
        fn recognise(&self, text: &str, _labels: &[&str]) -> Result<Vec<NerSpan>, String> {
            let mut out = Vec::new();
            for (needle, label, score) in &self.0 {
                for (start, _) in text.match_indices(needle) {
                    out.push(NerSpan { label: label.to_string(), start, end: start + needle.len(), score: *score });
                }
            }
            Ok(out)
        }
    }

    fn texts<'a>(text: &'a str, s: &[Suggestion], kind: PiiKind) -> Vec<&'a str> {
        s.iter().filter(|x| x.kind == kind).map(|x| x.text(text)).collect()
    }

    #[test]
    fn without_a_model_only_validated_hits_are_suggested() {
        let t = "Jan Jansen, jan@example.com, NL91 ABNA 0417 1643 00";
        let s = analyse(t, None).unwrap();
        assert_eq!(texts(t, &s, PiiKind::Person), Vec::<&str>::new(), "names need the model");
        assert_eq!(texts(t, &s, PiiKind::Email), ["jan@example.com"]);
        assert!(s.iter().all(|x| x.validated && x.source == Source::Pattern && x.preselected()));
    }

    #[test]
    fn the_model_adds_names_and_addresses_unvalidated() {
        let t = "Contact Jan Jansen, Hoofdstraat 12, 1011 AB Amsterdam.";
        let model = Scripted(vec![("Jan Jansen", "person", 0.97), ("Hoofdstraat 12, 1011 AB Amsterdam", "street address", 0.62)]);
        let s = analyse(t, Some(&model)).unwrap();
        assert_eq!(texts(t, &s, PiiKind::Person), ["Jan Jansen"]);
        assert_eq!(texts(t, &s, PiiKind::Address), ["Hoofdstraat 12, 1011 AB Amsterdam"]);
        let person = s.iter().find(|x| x.kind == PiiKind::Person).unwrap();
        let address = s.iter().find(|x| x.kind == PiiKind::Address).unwrap();
        assert!(!person.validated && person.source == Source::Model);
        assert!(person.preselected(), "0.97 is above the preselect score");
        assert!(!address.preselected(), "0.62 is listed but unticked");
    }

    #[test]
    fn a_model_hit_on_a_validated_one_only_confirms_it() {
        let t = "Mail jan@example.com now";
        let model = Scripted(vec![("jan@example.com", "email address", 0.8)]);
        let s = analyse(t, Some(&model)).unwrap();
        assert_eq!(s.len(), 1);
        assert_eq!((s[0].source, s[0].validated, s[0].score), (Source::Both, true, 1.0));
    }

    #[test]
    fn a_model_iban_or_card_that_fails_its_checksum_is_dropped() {
        let t = "IBAN NL92 ABNA 0417 1643 00 card 4111 1111 1111 1112";
        let model = Scripted(vec![
            ("NL92 ABNA 0417 1643 00", "iban", 0.9),
            ("4111 1111 1111 1112", "credit card number", 0.9),
        ]);
        assert!(analyse(t, Some(&model)).unwrap().is_empty());
    }

    #[test]
    fn a_model_id_in_a_format_without_a_rule_is_kept_unvalidated() {
        let t = "Passport number X1234567 issued";
        let model = Scripted(vec![("X1234567", "national identification number", 0.7)]);
        let s = analyse(t, Some(&model)).unwrap();
        assert_eq!(texts(t, &s, PiiKind::NationalId), ["X1234567"]);
        assert!(!s[0].validated && !s[0].preselected());
    }

    #[test]
    fn a_model_span_inside_a_validated_hit_of_another_kind_is_dropped() {
        // The model calls the digits of a valid IBAN a phone number.
        let t = "NL91 ABNA 0417 1643 00";
        let model = Scripted(vec![("0417 1643 00", "phone number", 0.9)]);
        let s = analyse(t, Some(&model)).unwrap();
        assert_eq!(s.len(), 1);
        assert_eq!(s[0].kind, PiiKind::Iban);
    }

    #[test]
    fn edge_punctuation_the_model_swallows_is_trimmed() {
        let t = "Name: Jan Jansen.";
        let model = Scripted(vec![(": Jan Jansen.", "person", 0.95)]);
        let s = analyse(t, Some(&model)).unwrap();
        assert_eq!(texts(t, &s, PiiKind::Person), ["Jan Jansen"]);
    }

    #[test]
    fn unknown_labels_and_low_scores_are_ignored() {
        let t = "Jan Jansen works at Acme";
        let model = Scripted(vec![("Acme", "organization", 0.99), ("Jan Jansen", "person", 0.3)]);
        assert!(analyse(t, Some(&model)).unwrap().is_empty());
    }

    #[test]
    fn labels_map_both_ways() {
        for (label, kind) in MODEL_LABELS {
            assert_eq!(kind_for_label(label), Some(*kind));
            assert_eq!(kind_for_label(&label.to_uppercase()), Some(*kind));
        }
        assert_eq!(kind_for_label("organization"), None);
    }

    #[test]
    fn chunks_cover_the_text_cut_on_whitespace_and_overlap() {
        let words: Vec<String> = (0..600).map(|i| format!("woord{i}")).collect();
        let text = words.join(" ");
        let chunks = chunk_ranges(&text, 1200, 160);
        assert!(chunks.len() > 3);
        assert_eq!(chunks[0].0, 0);
        assert_eq!(chunks.last().unwrap().1, text.len());
        for w in chunks.windows(2) {
            assert!(w[1].0 < w[0].1, "windows overlap: {w:?}");
            assert!(w[1].0 > w[0].0, "windows advance: {w:?}");
        }
        for (s, e) in &chunks {
            assert!(e - s <= 1200);
            assert!(text.is_char_boundary(*s) && text.is_char_boundary(*e));
        }
        // Every word is whole in at least one window.
        for word in &words {
            assert!(chunks.iter().any(|(s, e)| text[*s..*e].split(' ').any(|w| w == word)), "{word} is cut in every window");
        }
    }

    #[test]
    fn chunking_handles_multibyte_text_and_short_text() {
        let text = "é".repeat(2000);
        let chunks = chunk_ranges(&text, 1200, 160);
        assert!(!chunks.is_empty());
        for (s, e) in chunks {
            assert!(text.is_char_boundary(s) && text.is_char_boundary(e));
        }
        assert_eq!(chunk_ranges("kort", 1200, 160), [(0, 4)]);
        assert!(chunk_ranges("   ", 1200, 160).is_empty());
    }

    #[test]
    fn a_name_in_the_overlap_is_reported_once_with_text_offsets() {
        let mut text = "x ".repeat(560);
        text.push_str("Jan Jansen ");
        text.push_str(&"y ".repeat(500));
        let model = Scripted(vec![("Jan Jansen", "person", 0.9)]);
        let spans = recognise_chunked(&model, &text).unwrap();
        assert_eq!(spans.len(), 1, "{spans:?}");
        assert_eq!(&text[spans[0].start..spans[0].end], "Jan Jansen");
    }
}
