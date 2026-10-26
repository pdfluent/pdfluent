// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary. The PDFluent application is free to use,
// including for commercial purposes. Redistribution, or extraction or reuse
// of its components (including the embedded PDF engine), requires a licence.
// See https://pdfluent.com/license for terms.

//! The validator layer for structured personal data: credit cards, national
//! identifiers and dates of birth.
//!
//! A model finds names and addresses; it is weak at numbers that carry a
//! checksum. These recognisers are the other half. Each one has three parts,
//! the structure Microsoft Presidio (MIT) uses for its pattern recognisers:
//! a shape (regex), a checksum or structural rule that rejects look-alikes,
//! and, where the checksum is weak, a context word that must stand in front of
//! the number ("BSN", "Steuer-ID"). A nine-digit number passes the Dutch
//! 11-proef one time in eleven, so without the context word it is not reported.
//!
//! The checksum rules are public specifications of the issuing authorities
//! (ISO/IEC 7812 Luhn, the BSN 11-proef, the Bundeszentralamt fuer Steuern
//! algorithm for the Steuer-ID, the INSEE key of the NIR, the HMRC NINO prefix
//! rules, the SSA SSN area rules, the Spanish DNI letter table, the Italian
//! codice fiscale control character, the PESEL weights, the Belgian register
//! number key and the Swedish personnummer Luhn digit). The recogniser list
//! and the context-word approach follow Presidio (Copyright (c) Microsoft
//! Corporation, MIT licence); no Presidio code is copied.
//!
//! Every function here is pure: text in, byte ranges out.

use regex::Regex;
use std::sync::OnceLock;

/// One validated hit. `label` names the identifier ("BSN", "IBAN" is not
/// here: see `pii.rs`).
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct IdHit {
    pub start: usize,
    pub end: usize,
    pub label: &'static str,
}

// ── shared helpers ─────────────────────────────────────────────────────

fn digits_of(s: &str) -> Vec<u32> {
    s.chars().filter_map(|c| c.to_digit(10)).collect()
}

/// The match is a whole token: no letter or digit on either side, and not the
/// head or tail of a longer dotted/dashed number.
fn bounded(text: &str, start: usize, end: usize) -> bool {
    let before = text[..start].chars().next_back();
    let after = text[end..].chars().next();
    if before.is_some_and(|c| c.is_alphanumeric()) || after.is_some_and(|c| c.is_alphanumeric()) {
        return false;
    }
    if before.is_some_and(|c| matches!(c, '-' | '.' | ',' | '/'))
        && text[..start]
            .chars()
            .rev()
            .nth(1)
            .is_some_and(|c| c.is_ascii_digit())
    {
        return false;
    }
    let mut rest = text[end..].chars();
    if let (Some(sep), Some(next)) = (rest.next(), rest.next()) {
        if matches!(sep, '-' | '.' | ',' | '/') && next.is_ascii_digit() {
            return false;
        }
    }
    true
}

/// Lower-cased text of the `chars` characters in front of `start`.
fn window_before(text: &str, start: usize, chars: usize) -> String {
    let tail: Vec<char> = text[..start].chars().rev().take(chars).collect();
    tail.into_iter().rev().collect::<String>().to_lowercase()
}

fn has_context(text: &str, start: usize, keywords: &[&str]) -> bool {
    let window = window_before(text, start, 48);
    keywords.iter().any(|k| window.contains(k))
}

macro_rules! re {
    ($pat:expr) => {{
        static CELL: OnceLock<Regex> = OnceLock::new();
        CELL.get_or_init(|| Regex::new($pat).expect("static pattern"))
    }};
}

// ── Luhn and credit cards ──────────────────────────────────────────────

/// ISO/IEC 7812 Luhn check over a digit sequence.
pub fn luhn_is_valid(digits: &[u32]) -> bool {
    if digits.len() < 2 {
        return false;
    }
    let mut sum = 0;
    for (i, d) in digits.iter().rev().enumerate() {
        let mut v = *d;
        if i % 2 == 1 {
            v *= 2;
            if v > 9 {
                v -= 9;
            }
        }
        sum += v;
    }
    sum % 10 == 0
}

/// Issuer prefix and length of the major networks. A Luhn-valid 16-digit
/// number that no network issues is an order number, not a card.
fn card_network_ok(d: &[u32]) -> bool {
    let n = d.len();
    let p = |k: usize| d[..k].iter().fold(0u32, |a, x| a * 10 + x);
    match d[0] {
        4 => matches!(n, 13 | 16 | 19),
        3 => {
            ((p(2) == 34 || p(2) == 37) && n == 15)
                || (p(2) == 35 && (16..=19).contains(&n))
                || ((p(2) == 36 || p(2) == 38 || p(2) == 39 || (300..=305).contains(&p(3)))
                    && (14..=19).contains(&n))
        }
        5 => ((51..=55).contains(&p(2)) && n == 16) || (p(2) == 50 || (56..=58).contains(&p(2))) && (12..=19).contains(&n),
        2 => (2221..=2720).contains(&p(4)) && n == 16,
        6 => (12..=19).contains(&n),
        _ => false,
    }
}

pub fn find_credit_cards(text: &str) -> Vec<IdHit> {
    let mut out = Vec::new();
    for m in re!(r"\d(?:[ -]?\d){11,18}").find_iter(text) {
        if !bounded(text, m.start(), m.end()) {
            continue;
        }
        let raw = m.as_str();
        // One kind of separator, used consistently, between groups of 4 (or
        // the Amex 4-6-5): otherwise it is a long number, not a card.
        let seps: Vec<char> = raw.chars().filter(|c| !c.is_ascii_digit()).collect();
        if seps.windows(2).any(|w| w[0] != w[1]) {
            continue;
        }
        let d = digits_of(raw);
        if d.len() < 13 || d.len() > 19 || !card_network_ok(&d) || !luhn_is_valid(&d) {
            continue;
        }
        if d.iter().all(|x| *x == d[0]) {
            continue;
        }
        out.push(IdHit { start: m.start(), end: m.end(), label: "credit card" });
    }
    out
}

// ── national identifiers ───────────────────────────────────────────────

/// Dutch BSN: nine digits, weights 9..2 and -1, sum divisible by 11.
pub fn bsn_is_valid(d: &[u32]) -> bool {
    if d.len() != 9 || d.iter().all(|x| *x == 0) {
        return false;
    }
    let weights = [9i32, 8, 7, 6, 5, 4, 3, 2, -1];
    let sum: i32 = d.iter().zip(weights).map(|(x, w)| *x as i32 * w).sum();
    sum % 11 == 0
}

/// German Steuer-ID: eleven digits, ISO 7064 MOD 11,10, plus the structural
/// rule that among the first ten digits exactly one digit occurs two or three
/// times and none occurs more often (three never in a row).
pub fn steuer_id_is_valid(d: &[u32]) -> bool {
    if d.len() != 11 || d[0] == 0 {
        return false;
    }
    let mut counts = [0u32; 10];
    for x in &d[..10] {
        counts[*x as usize] += 1;
    }
    let repeated = counts.iter().filter(|c| **c >= 2).count();
    if repeated != 1 || counts.iter().any(|c| *c > 3) {
        return false;
    }
    if d[..10].windows(3).any(|w| w[0] == w[1] && w[1] == w[2]) {
        return false;
    }
    let mut product = 10u32;
    for x in &d[..10] {
        let mut sum = (x + product) % 10;
        if sum == 0 {
            sum = 10;
        }
        product = (sum * 2) % 11;
    }
    let mut check = 11 - product;
    if check == 10 {
        check = 0;
    }
    check == d[10]
}

/// French NIR (numero de securite sociale): 13 digits plus a two-digit key,
/// key = 97 - (number mod 97). Corsica writes 2A or 2B for the department;
/// for the key they count as 19 and 18.
fn nir_is_valid(compact: &str) -> bool {
    if compact.len() != 15 || !compact.is_ascii() {
        return false;
    }
    let (body, key) = compact.split_at(13);
    let Ok(key) = key.parse::<u64>() else { return false };
    // INSEE: 2A counts as 19 and 2B as 18 in the number the key is taken over
    // (the same as writing 20 and subtracting 1 000 000 or 2 000 000).
    let mut digits = body.to_string();
    if &digits[5..7] == "2A" {
        digits.replace_range(5..7, "19");
    } else if &digits[5..7] == "2B" {
        digits.replace_range(5..7, "18");
    }
    let Ok(n) = digits.parse::<u64>() else { return false };
    let month: u32 = body[3..5].parse().unwrap_or(0);
    let month_ok = (1..=12).contains(&month) || month == 20 || (30..=42).contains(&month) || month >= 50;
    month_ok && 97 - (n % 97) == key
}

/// UK National Insurance number prefix rules (HMRC).
fn nino_is_valid(compact: &str) -> bool {
    let b = compact.as_bytes();
    if b.len() != 9 {
        return false;
    }
    const BAD_PREFIX: [&str; 7] = ["BG", "GB", "NK", "KN", "TN", "NT", "ZZ"];
    !BAD_PREFIX.contains(&&compact[..2])
        && !matches!(b[0], b'D' | b'F' | b'I' | b'Q' | b'U' | b'V')
        && !matches!(b[1], b'D' | b'F' | b'I' | b'O' | b'Q' | b'U' | b'V')
}

/// US SSN area/group/serial rules (SSA): no area 000, 666 or 9xx; no group 00;
/// no serial 0000.
fn ssn_is_valid(area: u32, group: u32, serial: u32) -> bool {
    area != 0 && area != 666 && area < 900 && group != 0 && serial != 0
}

/// Spanish DNI / NIE control letter: number mod 23 into a fixed table. NIE
/// replaces the leading X/Y/Z with 0/1/2.
fn spanish_id_is_valid(compact: &str) -> bool {
    const TABLE: &[u8; 23] = b"TRWAGMYFPDXBNJZSQVHLCKE";
    let bytes = compact.as_bytes();
    if bytes.len() != 9 {
        return false;
    }
    let mut num = String::new();
    match bytes[0] {
        b'X' => num.push('0'),
        b'Y' => num.push('1'),
        b'Z' => num.push('2'),
        c if c.is_ascii_digit() => num.push(c as char),
        _ => return false,
    }
    num.push_str(&compact[1..8]);
    let Ok(n) = num.parse::<u32>() else { return false };
    TABLE[(n % 23) as usize] == bytes[8]
}

/// Italian codice fiscale control character (odd/even position tables).
fn codice_fiscale_is_valid(cf: &str) -> bool {
    const ODD: [u32; 26] = [
        1, 0, 5, 7, 9, 13, 15, 17, 19, 21, 2, 4, 18, 20, 11, 3, 6, 8, 12, 14, 16, 10, 22, 25, 24, 23,
    ];
    let b = cf.as_bytes();
    if b.len() != 16 {
        return false;
    }
    // Digits and letters share one value table: 0-9 and A-J are 0-9 / 0-9.
    let idx = |c: u8| -> Option<usize> {
        if c.is_ascii_digit() {
            Some((c - b'0') as usize)
        } else if c.is_ascii_uppercase() {
            Some((c - b'A') as usize)
        } else {
            None
        }
    };
    let mut sum = 0u32;
    for (i, c) in b[..15].iter().enumerate() {
        let Some(v) = idx(*c) else { return false };
        // Positions are 1-based in the specification: the first is odd.
        sum += if i % 2 == 0 { ODD[v] } else { v as u32 };
    }
    b'A' + (sum % 26) as u8 == b[15]
}

/// Polish PESEL: weights 1,3,7,9 repeating, check digit = (10 - sum mod 10) mod 10.
pub fn pesel_is_valid(d: &[u32]) -> bool {
    if d.len() != 11 {
        return false;
    }
    let w = [1u32, 3, 7, 9, 1, 3, 7, 9, 1, 3];
    let sum: u32 = d.iter().zip(w).map(|(x, w)| x * w).sum();
    (10 - sum % 10) % 10 == d[10]
}

/// Belgian national register number: nine digits (YYMMDDXXX) and a key,
/// key = 97 - (n mod 97); persons born from 2000 use 2 in front of n.
fn belgian_rrn_is_valid(d: &[u32]) -> bool {
    if d.len() != 11 {
        return false;
    }
    let n = d[..9].iter().fold(0u64, |a, x| a * 10 + *x as u64);
    let key = (d[9] * 10 + d[10]) as u64;
    97 - n % 97 == key || 97 - (n + 2_000_000_000) % 97 == key
}

/// Swedish personnummer: ten digits YYMMDDNNNC, Luhn over all ten.
fn swedish_pnr_is_valid(d: &[u32]) -> bool {
    if d.len() != 10 {
        return false;
    }
    let month = d[2] * 10 + d[3];
    let day = d[4] * 10 + d[5];
    (1..=12).contains(&month) && ((1..=31).contains(&day) || (61..=91).contains(&day)) && luhn_is_valid(d)
}

const BSN_CONTEXT: &[&str] = &["bsn", "burgerservicenummer", "sofinummer", "sofi", "citizen service", "burger service"];
const STEUER_CONTEXT: &[&str] = &["steuer-id", "steuerid", "steuer id", "identifikationsnummer", "idnr", "steuerliche id", "tax id"];
const PESEL_CONTEXT: &[&str] = &["pesel"];

/// Every validated national identifier in `text`.
pub fn find_national_ids(text: &str) -> Vec<IdHit> {
    let mut out = Vec::new();

    // NL BSN: bare nine digits, so the context word is mandatory.
    for m in re!(r"\d{9}").find_iter(text) {
        if bounded(text, m.start(), m.end())
            && has_context(text, m.start(), BSN_CONTEXT)
            && bsn_is_valid(&digits_of(m.as_str()))
        {
            out.push(IdHit { start: m.start(), end: m.end(), label: "BSN" });
        }
    }

    // DE Steuer-ID: eleven digits, optionally grouped 2-3-3-3; context needed.
    for m in re!(r"\d{2} ?\d{3} ?\d{3} ?\d{3}").find_iter(text) {
        if bounded(text, m.start(), m.end())
            && has_context(text, m.start(), STEUER_CONTEXT)
            && steuer_id_is_valid(&digits_of(m.as_str()))
        {
            out.push(IdHit { start: m.start(), end: m.end(), label: "Steuer-ID" });
        }
    }

    // FR NIR: sex, year, month, department (or 2A/2B), commune, order, key.
    for m in re!(r"[12478][ .]?\d{2}[ .]?\d{2}[ .]?(?:\d{2}|2[AB])[ .]?\d{3}[ .]?\d{3}[ .]?\d{2}").find_iter(text) {
        if !bounded(text, m.start(), m.end()) {
            continue;
        }
        let compact: String = m.as_str().chars().filter(|c| c.is_ascii_alphanumeric()).collect();
        if nir_is_valid(&compact) {
            out.push(IdHit { start: m.start(), end: m.end(), label: "NIR" });
        }
    }

    // UK NINO: two prefix letters, six digits, suffix A-D.
    for m in re!(r"[A-CEGHJ-PR-TW-Z][A-CEGHJ-NPR-TW-Z] ?\d{2} ?\d{2} ?\d{2} ?[A-D]").find_iter(text) {
        if !bounded(text, m.start(), m.end()) {
            continue;
        }
        let compact: String = m.as_str().chars().filter(|c| !c.is_whitespace()).collect();
        if nino_is_valid(&compact) {
            out.push(IdHit { start: m.start(), end: m.end(), label: "NINO" });
        }
    }

    // US SSN: the hyphenated or spaced form only; a bare nine digits is not
    // distinguishable from any other number.
    for m in re!(r"(\d{3})([- ])(\d{2})([- ])(\d{4})").captures_iter(text) {
        let whole = m.get(0).expect("whole match");
        if m[2] != m[4] || !bounded(text, whole.start(), whole.end()) {
            continue;
        }
        let (a, g, s) = (m[1].parse().unwrap_or(0), m[3].parse().unwrap_or(0), m[5].parse().unwrap_or(0));
        if ssn_is_valid(a, g, s) {
            out.push(IdHit { start: whole.start(), end: whole.end(), label: "SSN" });
        }
    }

    // ES DNI / NIE.
    for m in re!(r"(?:\d{8}|[XYZ]-?\d{7})-?[A-Z]").find_iter(text) {
        if !bounded(text, m.start(), m.end()) {
            continue;
        }
        let compact: String = m.as_str().chars().filter(|c| *c != '-').collect();
        if spanish_id_is_valid(&compact) {
            let label = if compact.as_bytes()[0].is_ascii_digit() { "DNI" } else { "NIE" };
            out.push(IdHit { start: m.start(), end: m.end(), label });
        }
    }

    // IT codice fiscale (omocodia letters allowed in the digit positions).
    for m in re!(r"[A-Z]{6}[\dLMNPQRSTUV]{2}[A-EHLMPR-T][\dLMNPQRSTUV]{2}[A-Z][\dLMNPQRSTUV]{3}[A-Z]").find_iter(text) {
        if bounded(text, m.start(), m.end()) && codice_fiscale_is_valid(m.as_str()) {
            out.push(IdHit { start: m.start(), end: m.end(), label: "codice fiscale" });
        }
    }

    // PL PESEL: eleven bare digits, context needed.
    for m in re!(r"\d{11}").find_iter(text) {
        if bounded(text, m.start(), m.end())
            && has_context(text, m.start(), PESEL_CONTEXT)
            && pesel_is_valid(&digits_of(m.as_str()))
        {
            out.push(IdHit { start: m.start(), end: m.end(), label: "PESEL" });
        }
    }

    // BE rijksregisternummer, written with its separators.
    for m in re!(r"\d{2}\.\d{2}\.\d{2}-\d{3}\.\d{2}").find_iter(text) {
        if bounded(text, m.start(), m.end()) && belgian_rrn_is_valid(&digits_of(m.as_str())) {
            out.push(IdHit { start: m.start(), end: m.end(), label: "rijksregisternummer" });
        }
    }

    // SE personnummer, written with the hyphen (or + for centenarians).
    for m in re!(r"(?:\d{6}|\d{8})[-+]\d{4}").find_iter(text) {
        if !bounded(text, m.start(), m.end()) {
            continue;
        }
        let mut d = digits_of(m.as_str());
        if d.len() == 12 {
            d.drain(..2);
        }
        if swedish_pnr_is_valid(&d) {
            out.push(IdHit { start: m.start(), end: m.end(), label: "personnummer" });
        }
    }

    out.sort_by_key(|h| h.start);
    out
}

// ── dates of birth ─────────────────────────────────────────────────────

const DOB_KEYWORDS: &[&str] = &[
    "date of birth", "birth date", "birthdate", "dob", "d.o.b", "born",
    "geboortedatum", "geboren", "geb.", "geb ",
    "geburtsdatum", "geboren am", "geburtstag",
    "date de naissance", "naissance", "né le", "née le",
    "fecha de nacimiento", "nacimiento", "nacido", "nacida",
    "data di nascita", "nascita", "nato il", "nata il",
];

/// Month number from the first three letters of a month name in English,
/// Dutch, German, French, Spanish or Italian.
fn month_from_name(word: &str) -> Option<u32> {
    let lower = word.trim_end_matches('.').to_lowercase();
    let key: String = lower.chars().take(3).collect();
    Some(match key.as_str() {
        "jan" | "gen" | "ene" => 1,
        "feb" | "fév" | "fev" => 2,
        "mar" | "mär" | "mrt" | "mrz" | "maa" => 3,
        "apr" | "avr" | "abr" => 4,
        "mai" | "mei" | "may" | "mag" => 5,
        "jun" | "giu" => 6,
        "jui" if lower.starts_with("juil") => 7,
        "jui" => 6,
        "jul" | "lug" => 7,
        "aug" | "ago" | "aoû" | "aou" => 8,
        "sep" | "set" => 9,
        "okt" | "oct" | "ott" => 10,
        "nov" => 11,
        "dez" | "dec" | "déc" | "dic" => 12,
        _ => return None,
    })
}

fn days_in_month(month: u32, year: u32) -> u32 {
    match month {
        1 | 3 | 5 | 7 | 8 | 10 | 12 => 31,
        4 | 6 | 9 | 11 => 30,
        2 if (year.is_multiple_of(4) && !year.is_multiple_of(100)) || year.is_multiple_of(400) => 29,
        2 => 28,
        _ => 0,
    }
}

fn valid_date(day: u32, month: u32, year: u32) -> bool {
    (1900..=2026).contains(&year) && (1..=12).contains(&month) && day >= 1 && day <= days_in_month(month, year)
}

/// A date that is introduced as a birth date ("geboren op", "date of
/// birth", "DOB"...). A date alone is not personal data; a date next to one of
/// these words is. The reported range is the date only.
pub fn find_dates_of_birth(text: &str) -> Vec<IdHit> {
    let mut out = Vec::new();
    let mut push = |start: usize, end: usize| {
        if bounded(text, start, end) && has_context(text, start, DOB_KEYWORDS) {
            out.push(IdHit { start, end, label: "date of birth" });
        }
    };

    // 1985-03-04
    for c in re!(r"(\d{4})-(\d{2})-(\d{2})").captures_iter(text) {
        let (y, m, d) = (c[1].parse().unwrap_or(0), c[2].parse().unwrap_or(0), c[3].parse().unwrap_or(0));
        if valid_date(d, m, y) {
            let w = c.get(0).expect("whole");
            push(w.start(), w.end());
        }
    }
    // 04-03-1985, 04/03/1985, 4.3.1985 (day-first or month-first: valid either way round)
    for c in re!(r"(\d{1,2})([-/.])(\d{1,2})([-/.])(\d{4})").captures_iter(text) {
        if c[2] != c[4] {
            continue;
        }
        let (a, b, y): (u32, u32, u32) = (c[1].parse().unwrap_or(0), c[3].parse().unwrap_or(0), c[5].parse().unwrap_or(0));
        if valid_date(a, b, y) || valid_date(b, a, y) {
            let w = c.get(0).expect("whole");
            push(w.start(), w.end());
        }
    }
    // 4 March 1985, 4. März 1985, 4th of ... is not handled; "1er mars 1985"
    for c in re!(r"(\d{1,2})(?:st|nd|rd|th|er|\.)?(?: de| of)? ([A-Za-zÀ-ÿ]{3,10}\.?)(?: de)?,? (\d{4})").captures_iter(text) {
        let (d, y): (u32, u32) = (c[1].parse().unwrap_or(0), c[3].parse().unwrap_or(0));
        if let Some(m) = month_from_name(&c[2]) {
            if valid_date(d, m, y) {
                let w = c.get(0).expect("whole");
                push(w.start(), w.end());
            }
        }
    }
    // March 4, 1985
    for c in re!(r"([A-Za-z]{3,10}\.?) (\d{1,2})(?:st|nd|rd|th)?, (\d{4})").captures_iter(text) {
        let (d, y): (u32, u32) = (c[2].parse().unwrap_or(0), c[3].parse().unwrap_or(0));
        if let Some(m) = month_from_name(&c[1]) {
            if valid_date(d, m, y) {
                let w = c.get(0).expect("whole");
                push(w.start(), w.end());
            }
        }
    }
    out.sort_by_key(|h| h.start);
    out.dedup_by_key(|h| (h.start, h.end));
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    fn found(text: &str, f: fn(&str) -> Vec<IdHit>) -> Vec<String> {
        f(text).iter().map(|h| text[h.start..h.end].to_string()).collect()
    }

    fn ids(text: &str) -> Vec<String> {
        found(text, find_national_ids)
    }

    #[test]
    fn luhn_accepts_published_test_numbers_and_rejects_a_changed_digit() {
        assert!(luhn_is_valid(&digits_of("4111111111111111")));
        assert!(luhn_is_valid(&digits_of("378282246310005")));
        assert!(!luhn_is_valid(&digits_of("4111111111111112")));
    }

    #[test]
    fn credit_cards_need_luhn_a_network_and_consistent_separators() {
        assert_eq!(found("Card 4111 1111 1111 1111 expires", find_credit_cards), ["4111 1111 1111 1111"]);
        assert_eq!(found("Amex 3782 822463 10005.", find_credit_cards), ["3782 822463 10005"]);
        assert_eq!(found("5555-5555-5555-4444", find_credit_cards), ["5555-5555-5555-4444"]);
        assert!(found("4111 1111 1111 1112", find_credit_cards).is_empty(), "Luhn fails");
        assert!(found("1234 5678 9012 3452", find_credit_cards).is_empty(), "no network issues a 1");
        assert!(found("4111 1111-1111 1111", find_credit_cards).is_empty(), "mixed separators");
        assert!(found("0000000000000000", find_credit_cards).is_empty());
        assert!(found("x41111111111111112345", find_credit_cards).is_empty(), "inside a longer token");
    }

    #[test]
    fn bsn_needs_the_eleven_test_and_a_context_word() {
        assert_eq!(ids("BSN: 111222333"), ["111222333"]);
        assert_eq!(ids("Burgerservicenummer 123456782."), ["123456782"]);
        assert!(ids("Nummer 111222333").is_empty(), "no context word");
        assert!(ids("BSN: 111222334").is_empty(), "11-proef fails");
        assert!(ids("BSN 1112223330").is_empty(), "longer number");
    }

    #[test]
    fn steuer_id_checks_structure_and_checksum() {
        assert_eq!(ids("Steuer-ID: 65929970489"), ["65929970489"]);
        assert_eq!(ids("Steuer-ID: 65 929 970 489"), ["65 929 970 489"]);
        assert!(ids("Steuer-ID: 65929970480").is_empty(), "check digit");
        assert!(ids("Kundennummer 65929970489").is_empty(), "no context word");
        assert!(ids("Steuer-ID: 11111111114").is_empty(), "structure");
    }

    #[test]
    fn nir_checks_the_key_including_corsica() {
        assert_eq!(ids("N° 2 69 05 49 588 157 80"), ["2 69 05 49 588 157 80"]);
        assert!(ids("N° 2 69 05 49 588 157 81").is_empty(), "key");
        assert_eq!(ids("1 85 12 2A 004 004 93"), ["1 85 12 2A 004 004 93"]);
        assert!(ids("1 85 12 2A 004 004 17").is_empty(), "Corsica key");
    }

    #[test]
    fn nino_prefix_rules() {
        assert_eq!(ids("NI QQ 12 34 56 C"), Vec::<String>::new(), "Q is never a prefix letter");
        assert_eq!(ids("NI AB 12 34 56 C"), ["AB 12 34 56 C"]);
        assert_eq!(ids("NI AB123456C"), ["AB123456C"]);
        assert!(ids("NI BG 12 34 56 A").is_empty(), "BG is not allocated");
        assert!(ids("NI AB 12 34 56 E").is_empty(), "suffix is A-D");
    }

    #[test]
    fn ssn_area_rules() {
        assert_eq!(ids("SSN 123-45-6789"), ["123-45-6789"]);
        assert!(ids("SSN 000-45-6789").is_empty());
        assert!(ids("SSN 666-45-6789").is_empty());
        assert!(ids("SSN 923-45-6789").is_empty());
        assert!(ids("SSN 123-00-6789").is_empty());
        assert!(ids("SSN 123-45-0000").is_empty());
        assert!(ids("Ref 123-45-67890").is_empty(), "longer number");
    }

    #[test]
    fn spanish_ids_check_the_letter() {
        assert_eq!(ids("DNI 12345678Z"), ["12345678Z"]);
        assert_eq!(ids("NIE X1234567L"), ["X1234567L"]);
        assert!(ids("DNI 12345678A").is_empty());
    }

    #[test]
    fn codice_fiscale_checks_the_control_character() {
        assert_eq!(ids("CF RSSMRA85T10A562S"), ["RSSMRA85T10A562S"]);
        assert!(ids("CF RSSMRA85T10A562T").is_empty());
    }

    #[test]
    fn pesel_belgian_and_swedish_numbers() {
        assert_eq!(ids("PESEL 44051401359"), ["44051401359"]);
        assert!(ids("PESEL 44051401358").is_empty());
        assert!(ids("Nr 44051401359").is_empty(), "no context word");
        assert_eq!(ids("RRN 85.07.30-033.28"), ["85.07.30-033.28"]);
        assert!(ids("RRN 85.07.30-033.29").is_empty());
        assert_eq!(ids("Personnummer 811218-9876"), ["811218-9876"]);
        assert!(ids("Personnummer 811218-9877").is_empty());
    }

    #[test]
    fn a_date_is_a_birth_date_only_next_to_a_birth_word() {
        let dob = |t: &str| found(t, find_dates_of_birth);
        assert_eq!(dob("Date of birth: 04/03/1985"), ["04/03/1985"]);
        assert_eq!(dob("Geboortedatum 4-3-1985"), ["4-3-1985"]);
        assert_eq!(dob("Geburtsdatum: 04.03.1985"), ["04.03.1985"]);
        assert_eq!(dob("né le 4 mars 1985 à Lyon"), ["4 mars 1985"]);
        assert_eq!(dob("nacido el 4 de marzo de 1985"), ["4 de marzo de 1985"]);
        assert_eq!(dob("nato il 4 marzo 1985"), ["4 marzo 1985"]);
        assert_eq!(dob("DOB 1985-03-04"), ["1985-03-04"]);
        assert_eq!(dob("born March 4, 1985"), ["March 4, 1985"]);
        assert!(dob("Invoice date 04/03/2024").is_empty(), "no birth word");
        assert!(dob("Date of birth: 31/02/1985").is_empty(), "not a calendar date");
        assert!(dob("Date of birth: 04/03/2087").is_empty(), "in the future");
    }
}
