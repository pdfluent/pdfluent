// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary. The PDFluent application is free to use,
// including for commercial purposes. Redistribution, or extraction or reuse
// of its components (including the embedded PDF engine), requires a licence.
// See https://pdfluent.com/license for terms.

//! GLiNER span-mode input preparation and output decoding, without a runtime.
//!
//! The model (`knowledgator/gliner-pii-base-v1.0`) is a GLiNER span model: it
//! reads a prompt made of the label names followed by the text's words, and
//! scores every span of up to `max_width` words against every label. This
//! module turns text and labels into the six integer/boolean inputs the ONNX
//! graph takes and turns the `logits` output back into spans. The ONNX session
//! itself lives in `pii_model::gline`; everything here is plain data, so it is
//! tested with hand-made tensors and needs neither the model nor `ort`.
//!
//! Provenance: the input and output format follows the GLiNER reference
//! implementation (urchade/GLiNER, Apache-2.0) as the model's published format,
//! and the way `gline-rs` (fbilhaut/gline-rs, Apache-2.0) reads and writes it.
//! The decoding logic here was written from reading those two (words numbered
//! from 1 at the first sub-token, `span_idx` as start and start+offset, logits
//! as `[batch, words, width, labels]`, sigmoid then threshold, greedy flat
//! selection). No source was copied. Both are listed in
//! `compliance/pii-component-licences.json`.
//!
//! Input contract, for one text (batch of one):
//!
//! * words: the text split by `\w+(?:[-_]\w+)*|\S`, numbered 1..=n;
//! * prompt words: `<<ENT>>`, label 1, `<<ENT>>`, label 2, ..., `<<SEP>>`,
//!   then the text words; every prompt word is tokenised on its own;
//! * `input_ids`: `[CLS]`, all sub-tokens, `[SEP]`;
//! * `attention_mask`: 1 everywhere (batch of one: no padding);
//! * `words_mask`: 0 everywhere except the first sub-token of each text word,
//!   which holds that word's 1-based number;
//! * `text_lengths`: `[[n]]`;
//! * `span_idx`: `[1, n*max_width, 2]`, slot `start*max_width + k` holds
//!   `(start, start + k)`;
//! * `span_mask`: `[1, n*max_width]`, true when `start + k < n`;
//! * output `logits`: `[1, n, max_width, labels]`.

use crate::pii_model::NerSpan;
use regex::Regex;
use std::sync::OnceLock;

pub const ENT_TOKEN: &str = "<<ENT>>";
pub const SEP_TOKEN: &str = "<<SEP>>";
/// Longest span, in words, the model scores. Part of the model's
/// configuration (`max_width`); the component manifest carries it.
pub const DEFAULT_MAX_WIDTH: usize = 12;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct Word {
    /// Byte offsets into the text.
    pub start: usize,
    pub end: usize,
}

/// Words as GLiNER counts them: runs of word characters, joined by single
/// hyphens or underscores, or any other single non-space character.
pub fn split_words(text: &str) -> Vec<Word> {
    static RE: OnceLock<Regex> = OnceLock::new();
    let re = RE.get_or_init(|| Regex::new(r"\w+(?:[-_]\w+)*|\S").expect("static pattern"));
    re.find_iter(text).map(|m| Word { start: m.start(), end: m.end() }).collect()
}

/// The model's inputs for one text.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Encoded {
    pub input_ids: Vec<i64>,
    pub attention_mask: Vec<i64>,
    pub words_mask: Vec<i64>,
    /// Number of text words.
    pub num_words: usize,
}

/// Tokenise one prompt word (without special tokens) into ids.
pub type EncodeWord<'a> = dyn FnMut(&str) -> Result<Vec<u32>, String> + 'a;

pub fn encode(
    words: &[&str],
    labels: &[&str],
    cls_id: i64,
    sep_id: i64,
    encode_word: &mut EncodeWord,
) -> Result<Encoded, String> {
    let mut ids: Vec<i64> = vec![cls_id];
    let mut words_mask: Vec<i64> = vec![0];
    let push = |ids: &mut Vec<i64>, mask: &mut Vec<i64>, tokens: Vec<u32>, number: Option<i64>| -> Result<(), String> {
        if tokens.is_empty() {
            return Err("PII_MODEL_TOKENIZE: a word produced no tokens".to_string());
        }
        for (i, t) in tokens.iter().enumerate() {
            ids.push(*t as i64);
            mask.push(if i == 0 { number.unwrap_or(0) } else { 0 });
        }
        Ok(())
    };
    for label in labels {
        let marker = encode_word(ENT_TOKEN)?;
        push(&mut ids, &mut words_mask, marker, None)?;
        let tokens = encode_word(label)?;
        push(&mut ids, &mut words_mask, tokens, None)?;
    }
    let sep = encode_word(SEP_TOKEN)?;
    push(&mut ids, &mut words_mask, sep, None)?;
    for (i, word) in words.iter().enumerate() {
        let tokens = encode_word(word)?;
        push(&mut ids, &mut words_mask, tokens, Some(i as i64 + 1))?;
    }
    ids.push(sep_id);
    words_mask.push(0);
    let attention_mask = vec![1; ids.len()];
    Ok(Encoded { input_ids: ids, attention_mask, words_mask, num_words: words.len() })
}

/// `span_idx` (flattened `[num_words * max_width, 2]`) and `span_mask`
/// (`[num_words * max_width]`).
pub fn span_inputs(num_words: usize, max_width: usize) -> (Vec<i64>, Vec<bool>) {
    let mut idx = Vec::with_capacity(num_words * max_width * 2);
    let mut mask = Vec::with_capacity(num_words * max_width);
    for start in 0..num_words {
        for k in 0..max_width {
            idx.push(start as i64);
            idx.push((start + k) as i64);
            mask.push(start + k < num_words);
        }
    }
    (idx, mask)
}

/// One scored span, in word indices (end inclusive).
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct Candidate {
    pub start_word: usize,
    pub end_word: usize,
    pub label: usize,
    pub score: f32,
}

fn sigmoid(x: f32) -> f32 {
    1.0 / (1.0 + (-x).exp())
}

/// Every span whose sigmoid score reaches `threshold`. `logits` is the model's
/// output for a batch of one, flattened from `[1, num_words, max_width,
/// num_labels]`. Slots past the end of the text are ignored whatever they hold.
pub fn decode_logits(
    logits: &[f32],
    num_words: usize,
    max_width: usize,
    num_labels: usize,
    threshold: f32,
) -> Result<Vec<Candidate>, String> {
    if logits.len() != num_words * max_width * num_labels {
        return Err(format!(
            "PII_MODEL_OUTPUT: unexpected logits size {} for [1, {num_words}, {max_width}, {num_labels}]",
            logits.len()
        ));
    }
    let mut out = Vec::new();
    for start in 0..num_words {
        for k in 0..max_width {
            if start + k >= num_words {
                break;
            }
            for label in 0..num_labels {
                let score = sigmoid(logits[(start * max_width + k) * num_labels + label]);
                if score >= threshold {
                    out.push(Candidate { start_word: start, end_word: start + k, label, score });
                }
            }
        }
    }
    Ok(out)
}

/// Flat selection: highest score first, a span is kept only if it shares no
/// word with a span already kept. Result in reading order.
pub fn select_flat(mut candidates: Vec<Candidate>) -> Vec<Candidate> {
    candidates.sort_by(|a, b| b.score.total_cmp(&a.score).then(a.start_word.cmp(&b.start_word)));
    let mut kept: Vec<Candidate> = Vec::new();
    for c in candidates {
        if !kept.iter().any(|k| c.start_word <= k.end_word && k.start_word <= c.end_word) {
            kept.push(c);
        }
    }
    kept.sort_by_key(|c| c.start_word);
    kept
}

/// Word spans to text spans (byte offsets), labelled.
pub fn to_ner_spans(words: &[Word], labels: &[&str], selected: &[Candidate]) -> Vec<NerSpan> {
    selected
        .iter()
        .map(|c| NerSpan {
            label: labels[c.label].to_string(),
            start: words[c.start_word].start,
            end: words[c.end_word].end,
            score: c.score,
        })
        .collect()
}

/// The model call: given the encoded input, return the flattened logits.
pub type Infer<'a> = dyn FnMut(&Encoded, usize) -> Result<Vec<f32>, String> + 'a;

/// Text and labels in, spans out. `infer` runs the network; `max_width` is
/// the model's.
// One argument per knob of the span decoder; a struct would only rename them.
#[allow(clippy::too_many_arguments)]
pub fn recognise(
    text: &str,
    labels: &[&str],
    max_width: usize,
    threshold: f32,
    cls_id: i64,
    sep_id: i64,
    encode_word: &mut EncodeWord,
    infer: &mut Infer,
) -> Result<Vec<NerSpan>, String> {
    let words = split_words(text);
    if words.is_empty() || labels.is_empty() {
        return Ok(Vec::new());
    }
    let surface: Vec<&str> = words.iter().map(|w| &text[w.start..w.end]).collect();
    let encoded = encode(&surface, labels, cls_id, sep_id, encode_word)?;
    let logits = infer(&encoded, max_width)?;
    let candidates = decode_logits(&logits, words.len(), max_width, labels.len(), threshold)?;
    Ok(to_ner_spans(&words, labels, &select_flat(candidates)))
}

#[cfg(test)]
mod tests {
    use super::*;

    /// A tokenizer stand-in: markers are single tokens, a word is one token
    /// per 4 characters, ids are made up but stable.
    fn fake_tokenizer(word: &str) -> Result<Vec<u32>, String> {
        Ok(match word {
            ENT_TOKEN => vec![128002],
            SEP_TOKEN => vec![128003],
            w => w.chars().collect::<Vec<_>>().chunks(4).enumerate().map(|(i, _)| 1000 + w.len() as u32 * 10 + i as u32).collect(),
        })
    }

    #[test]
    fn words_are_split_the_way_gliner_counts_them() {
        let text = "Jan-Willem de Vries (jan_w@example.com), Kerkstraat 12.";
        let got: Vec<&str> = split_words(text).iter().map(|w| &text[w.start..w.end]).collect();
        assert_eq!(got, ["Jan-Willem", "de", "Vries", "(", "jan_w", "@", "example", ".", "com", ")", ",", "Kerkstraat", "12", "."]);
    }

    #[test]
    fn word_offsets_are_bytes_and_survive_multibyte_text() {
        let text = "Müller wohnt in Köln";
        let w = split_words(text);
        assert_eq!(&text[w[0].start..w[0].end], "Müller");
        assert_eq!(&text[w[3].start..w[3].end], "Köln");
        assert_eq!(w[3].end, text.len());
    }

    #[test]
    fn encoding_numbers_text_words_from_one_on_their_first_sub_token_only() {
        // labels "person" (2 tokens), "iban" (1 token); text words "Jan" (1), "Jansen" (2)
        let mut enc = fake_tokenizer;
        let e = encode(&["Jan", "Jansen"], &["person", "iban"], 1, 2, &mut enc).unwrap();
        let person = fake_tokenizer("person").unwrap().len();
        let iban = fake_tokenizer("iban").unwrap().len();
        let jansen = fake_tokenizer("Jansen").unwrap().len();
        assert_eq!((person, iban, jansen), (2, 1, 2));
        // [CLS] ENT person.. ENT iban SEP Jan Jansen.. [SEP]
        let prompt_len = 1 + 1 + person + 1 + iban + 1;
        assert_eq!(e.input_ids.len(), prompt_len + 1 + jansen + 1);
        assert_eq!(e.input_ids[0], 1);
        assert_eq!(*e.input_ids.last().unwrap(), 2);
        assert_eq!(e.input_ids[1], 128002);
        assert_eq!(e.input_ids[prompt_len - 1], 128003);
        assert_eq!(e.attention_mask, vec![1; e.input_ids.len()]);
        let mut expected = vec![0i64; prompt_len];
        expected.extend([1, 2, 0, 0]); // Jan, Jansen's first sub-token, its second, [SEP]
        assert_eq!(e.words_mask, expected);
        assert_eq!(e.num_words, 2);
    }

    #[test]
    fn a_word_that_tokenises_to_nothing_is_an_error_not_a_silent_shift() {
        let mut empty = |_: &str| -> Result<Vec<u32>, String> { Ok(vec![]) };
        assert!(encode(&["x"], &["person"], 1, 2, &mut empty).is_err());
    }

    #[test]
    fn span_slots_cover_every_start_and_width_and_mask_the_ones_past_the_end() {
        let (idx, mask) = span_inputs(3, 2);
        assert_eq!(idx, vec![0, 0, 0, 1, 1, 1, 1, 2, 2, 2, 2, 3]);
        assert_eq!(mask, vec![true, true, true, true, true, false]);
        let (idx, mask) = span_inputs(5, 12);
        assert_eq!((idx.len(), mask.len()), (5 * 12 * 2, 5 * 12));
    }

    /// 5 words, width 3, 2 labels: shape [1, 5, 3, 2], flattened.
    fn blank_logits() -> Vec<f32> {
        vec![-10.0; 5 * 3 * 2]
    }

    fn at(start: usize, k: usize, label: usize) -> usize {
        (start * 3 + k) * 2 + label
    }

    #[test]
    fn decoding_reads_start_width_and_label_from_the_right_axes() {
        let mut l = blank_logits();
        l[at(1, 2, 0)] = 4.0; // words 1..=3, label 0
        l[at(4, 0, 1)] = 2.0; // word 4 alone, label 1
        let c = decode_logits(&l, 5, 3, 2, 0.5).unwrap();
        assert_eq!(c.len(), 2);
        assert_eq!((c[0].start_word, c[0].end_word, c[0].label), (1, 3, 0));
        assert_eq!((c[1].start_word, c[1].end_word, c[1].label), (4, 4, 1));
        assert!((c[0].score - 0.9820138).abs() < 1e-5, "sigmoid(4.0)");
    }

    #[test]
    fn the_threshold_is_inclusive_and_a_zero_logit_is_one_half() {
        let mut l = blank_logits();
        l[at(0, 0, 0)] = 0.0;
        assert_eq!(decode_logits(&l, 5, 3, 2, 0.5).unwrap().len(), 1, "0.5 reaches a 0.5 threshold");
        assert!(decode_logits(&l, 5, 3, 2, 0.6).unwrap().is_empty());
    }

    #[test]
    fn slots_past_the_end_of_the_text_are_ignored_even_when_they_hold_a_high_logit() {
        let mut l = blank_logits();
        l[at(4, 1, 0)] = 20.0; // word 4 + width 1 = word 5, which does not exist
        l[at(3, 2, 1)] = 20.0; // 3 + 2 = 5, same
        assert!(decode_logits(&l, 5, 3, 2, 0.5).unwrap().is_empty());
    }

    #[test]
    fn a_logits_tensor_of_the_wrong_size_is_refused() {
        assert!(decode_logits(&[0.0; 7], 5, 3, 2, 0.5).unwrap_err().starts_with("PII_MODEL_OUTPUT"));
    }

    #[test]
    fn flat_selection_keeps_the_best_of_overlapping_spans_and_all_disjoint_ones() {
        let c = |s, e, label, score| Candidate { start_word: s, end_word: e, label, score };
        let kept = select_flat(vec![c(0, 1, 0, 0.7), c(1, 2, 0, 0.9), c(2, 2, 1, 0.8), c(4, 4, 1, 0.6)]);
        // (1,2) wins; (0,1) and (2,2) overlap it; (4,4) is disjoint.
        assert_eq!(kept.iter().map(|k| (k.start_word, k.end_word)).collect::<Vec<_>>(), [(1, 2), (4, 4)]);
        // Equal scores: the earlier span wins, deterministically.
        let kept = select_flat(vec![c(2, 3, 0, 0.8), c(1, 2, 0, 0.8)]);
        assert_eq!((kept[0].start_word, kept.len()), (1, 1));
    }

    #[test]
    fn word_spans_become_byte_spans_of_the_original_text() {
        let text = "Mail Zoë Müller nu";
        let words = split_words(text);
        let spans = to_ner_spans(&words, &["person", "iban"], &[Candidate { start_word: 1, end_word: 2, label: 0, score: 0.9 }]);
        assert_eq!(spans.len(), 1);
        assert_eq!(&text[spans[0].start..spans[0].end], "Zoë Müller");
        assert_eq!(spans[0].label, "person");
    }

    #[test]
    fn end_to_end_with_a_scripted_network() {
        let text = "Contact Jan de Vries today";
        let labels = ["person", "iban"];
        let mut enc = fake_tokenizer;
        let mut calls = 0;
        let mut infer = |e: &Encoded, max_width: usize| -> Result<Vec<f32>, String> {
            calls += 1;
            assert_eq!(e.num_words, 5);
            assert_eq!(max_width, 4);
            let mut l = vec![-10.0f32; 5 * 4 * 2];
            l[(4 + 2) * 2] = 6.0; // words 1..=3 ("Jan de Vries"), person
            l[(4 + 1) * 2] = 3.0; // words 1..=2, person: overlaps, lower
            Ok(l)
        };
        let spans = recognise(text, &labels, 4, 0.5, 1, 2, &mut enc, &mut infer).unwrap();
        assert_eq!(calls, 1);
        assert_eq!(spans.len(), 1);
        assert_eq!(&text[spans[0].start..spans[0].end], "Jan de Vries");
        assert!(spans[0].score > 0.99);
    }

    #[test]
    fn empty_text_or_no_labels_never_calls_the_network() {
        let mut enc = fake_tokenizer;
        let mut infer = |_: &Encoded, _: usize| -> Result<Vec<f32>, String> { panic!("no call expected") };
        assert!(recognise("   ", &["person"], 4, 0.5, 1, 2, &mut enc, &mut infer).unwrap().is_empty());
        assert!(recognise("Jan", &[], 4, 0.5, 1, 2, &mut enc, &mut infer).unwrap().is_empty());
    }
}
