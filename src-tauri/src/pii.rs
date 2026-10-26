// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary. The PDFluent application is free to use,
// including for commercial purposes. Redistribution, or extraction or reuse
// of its components (including the embedded PDF engine), requires a licence.
// See https://pdfluent.com/license for terms.

//! The pattern and checksum layer of personal-data detection (J-66).
//!
//! This is the validator half of a two-part detector. The other half is a
//! multilingual NER model (`pii_model.rs`, an opt-in component) that finds
//! names, addresses and the identifiers this layer has no rule for. This layer
//! reports only what it can prove, because a redaction tool that flags every
//! long number teaches its user to click "select all":
//!
//! * IBAN: country prefix, the country's exact length, and the ISO 7064
//!   mod-97 check. A number that looks like an IBAN but fails the check is
//!   not reported.
//! * E-mail: a practical subset of RFC 5321/5322 (dot-atom local part, DNS
//!   labels, alphabetic TLD), not the full grammar.
//! * Phone: international (`+cc` or `00cc`, valid calling code, plausible
//!   length) and national NL/BE/DE/FR/UK numbers. A bare digit string without
//!   separators only counts when it starts with a mobile prefix, because ten
//!   digits with a leading zero are also old Dutch account numbers.
//! * Credit card, national identifiers (BSN, Steuer-ID, NIR, NINO, SSN, DNI/NIE,
//!   codice fiscale, PESEL, Belgian register number, personnummer) and dates of
//!   birth: see `pii_ids.rs`.
//!
//! Nothing here touches the network or the document; the caller decides what
//! to redact, and the redaction itself goes through the existing redaction
//! path, which removes the text from the file. Detection only ever proposes.

use serde::Serialize;

/// The order is the priority when two hits overlap: the earlier kind wins, so
/// an IBAN's digits are never also a phone number and a card number is never
/// also a national ID.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, PartialOrd, Ord, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum PiiKind {
    Iban,
    CreditCard,
    NationalId,
    DateOfBirth,
    Email,
    Phone,
    /// Found by the model only: no rule here can prove these.
    BankAccount,
    Person,
    Address,
}

/// One hit in a piece of text. Offsets are byte offsets into that text.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct PiiMatch {
    pub kind: PiiKind,
    pub start: usize,
    pub end: usize,
    /// What sort of identifier, when the kind has several ("BSN", "NINO").
    pub detail: Option<&'static str>,
}

impl PiiMatch {
    pub fn text<'a>(&self, haystack: &'a str) -> &'a str {
        &haystack[self.start..self.end]
    }
}

/// Every validated IBAN, card number, national ID, birth date, e-mail address
/// and phone number in `text`, in reading order. Overlaps are resolved by
/// [`PiiKind`] order, so an IBAN's digits are never also reported as a phone
/// number.
pub fn detect(text: &str) -> Vec<PiiMatch> {
    let mut all = find_ibans(text);
    let from_ids = |hits: Vec<crate::pii_ids::IdHit>, kind: PiiKind| -> Vec<PiiMatch> {
        hits.into_iter()
            .map(|h| PiiMatch { kind, start: h.start, end: h.end, detail: Some(h.label) })
            .collect()
    };
    all.extend(from_ids(crate::pii_ids::find_credit_cards(text), PiiKind::CreditCard));
    all.extend(from_ids(crate::pii_ids::find_national_ids(text), PiiKind::NationalId));
    all.extend(from_ids(crate::pii_ids::find_dates_of_birth(text), PiiKind::DateOfBirth));
    all.extend(find_emails(text));
    all.extend(find_phones(text));
    all.sort_by_key(|m| (m.kind, m.start));
    let mut kept: Vec<PiiMatch> = Vec::new();
    for m in all {
        if !kept.iter().any(|k| m.start < k.end && k.start < m.end) {
            kept.push(m);
        }
    }
    kept.sort_by_key(|m| m.start);
    kept
}

// ── helpers ────────────────────────────────────────────────────────────

fn is_alnum(c: char) -> bool {
    c.is_alphanumeric()
}

fn char_before(text: &str, i: usize) -> Option<char> {
    text[..i].chars().next_back()
}

fn char_at(text: &str, i: usize) -> Option<char> {
    text[i..].chars().next()
}

// ── IBAN ───────────────────────────────────────────────────────────────

/// Country code -> IBAN length (ISO 13616 registry, SEPA and the common rest).
const IBAN_LENGTHS: &[(&str, usize)] = &[
    ("AD", 24), ("AE", 23), ("AL", 28), ("AT", 20), ("AZ", 28), ("BA", 20), ("BE", 16),
    ("BG", 22), ("BH", 22), ("BR", 29), ("BY", 28), ("CH", 21), ("CR", 22), ("CY", 28),
    ("CZ", 24), ("DE", 22), ("DK", 18), ("DO", 28), ("EE", 20), ("EG", 29), ("ES", 24),
    ("FI", 18), ("FO", 18), ("FR", 27), ("GB", 22), ("GE", 22), ("GI", 23), ("GL", 18),
    ("GR", 27), ("GT", 28), ("HR", 21), ("HU", 28), ("IE", 22), ("IL", 23), ("IQ", 23),
    ("IS", 26), ("IT", 27), ("JO", 30), ("KW", 30), ("KZ", 20), ("LB", 28), ("LC", 32),
    ("LI", 21), ("LT", 20), ("LU", 20), ("LV", 21), ("MC", 27), ("MD", 24), ("ME", 22),
    ("MK", 19), ("MR", 27), ("MT", 31), ("MU", 30), ("NL", 18), ("NO", 15), ("PK", 24),
    ("PL", 28), ("PS", 29), ("PT", 25), ("QA", 29), ("RO", 24), ("RS", 22), ("SA", 24),
    ("SC", 31), ("SE", 24), ("SI", 19), ("SK", 24), ("SM", 27), ("ST", 25), ("SV", 28),
    ("TL", 23), ("TN", 24), ("TR", 26), ("UA", 29), ("VA", 22), ("VG", 24), ("XK", 20),
];

/// ISO 7064 mod 97-10 over a compact (no separators), upper-case IBAN.
pub fn iban_is_valid(compact: &str) -> bool {
    let Some(&(_, want)) = IBAN_LENGTHS.iter().find(|(cc, _)| compact.starts_with(cc)) else {
        return false;
    };
    if compact.len() != want || !compact.bytes().all(|b| b.is_ascii_uppercase() || b.is_ascii_digit()) {
        return false;
    }
    let rearranged = compact[4..].bytes().chain(compact[..4].bytes());
    let mut rem: u32 = 0;
    for b in rearranged {
        let v = if b.is_ascii_digit() { (b - b'0') as u32 } else { (b - b'A') as u32 + 10 };
        rem = if v >= 10 { (rem * 100 + v) % 97 } else { (rem * 10 + v) % 97 };
    }
    rem == 1
}

fn find_ibans(text: &str) -> Vec<PiiMatch> {
    let bytes = text.as_bytes();
    let mut out = Vec::new();
    let mut i = 0;
    while i + 4 <= bytes.len() {
        let starts = bytes[i].is_ascii_uppercase()
            && bytes[i + 1].is_ascii_uppercase()
            && bytes[i + 2].is_ascii_digit()
            && bytes[i + 3].is_ascii_digit()
            && text.is_char_boundary(i)
            && char_before(text, i).is_none_or(|c| !is_alnum(c));
        if starts {
            if let Some(end) = iban_end(text, i) {
                out.push(PiiMatch { kind: PiiKind::Iban, start: i, end, detail: None });
                i = end;
                continue;
            }
        }
        i += 1;
    }
    out
}

/// The end of the IBAN that starts at `start`, if one does. Walks the
/// alphanumerics (single spaces allowed between them) and takes the one
/// prefix whose compact form has the country's length and a valid check.
fn iban_end(text: &str, start: usize) -> Option<usize> {
    let mut compact = String::new();
    let mut prev_space = false;
    for (off, c) in text[start..].char_indices() {
        if c.is_ascii_uppercase() || c.is_ascii_digit() {
            compact.push(c);
            prev_space = false;
        } else if c == ' ' && !prev_space && !compact.is_empty() {
            prev_space = true;
            continue;
        } else {
            break;
        }
        let end = start + off + c.len_utf8();
        let at_boundary = char_at(text, end).is_none_or(|n| !is_alnum(n));
        if compact.len() >= 15 && at_boundary && iban_is_valid(&compact) {
            return Some(end);
        }
        if compact.len() > 34 {
            break;
        }
    }
    None
}

// ── e-mail ─────────────────────────────────────────────────────────────

fn local_char(c: char) -> bool {
    c.is_ascii_alphanumeric() || "._%+-".contains(c)
}

fn find_emails(text: &str) -> Vec<PiiMatch> {
    let mut out = Vec::new();
    for (at, _) in text.match_indices('@') {
        let start = text[..at]
            .char_indices()
            .rev()
            .take_while(|&(_, c)| local_char(c))
            .last()
            .map_or(at, |(i, _)| i);
        let local = &text[start..at];
        let domain_len = text[at + 1..]
            .char_indices()
            .find(|&(_, c)| !(c.is_ascii_alphanumeric() || c == '-' || c == '.'))
            .map_or(text.len() - at - 1, |(i, _)| i);
        // A sentence-final full stop belongs to the sentence, not the domain.
        let domain = text[at + 1..at + 1 + domain_len].trim_end_matches(['.', '-']);
        if email_is_valid(local, domain) {
            out.push(PiiMatch { kind: PiiKind::Email, start, end: at + 1 + domain.len(), detail: None });
        }
    }
    out
}

fn email_is_valid(local: &str, domain: &str) -> bool {
    if local.is_empty()
        || local.len() > 64
        || local.starts_with(['.', '-']) // "-" is legal but never a real mailbox
        || local.ends_with('.')
        || local.contains("..")
        || domain.len() > 253
    {
        return false;
    }
    let labels: Vec<&str> = domain.split('.').collect();
    if labels.len() < 2 {
        return false;
    }
    let tld = labels[labels.len() - 1];
    if !(2..=24).contains(&tld.len()) || !tld.chars().all(|c| c.is_ascii_alphabetic()) {
        return false;
    }
    labels.iter().all(|l| {
        !l.is_empty() && l.len() <= 63 && !l.starts_with('-') && !l.ends_with('-')
    })
}

// ── phone ──────────────────────────────────────────────────────────────

/// Is `digits` (no `+`, no `00`) an assigned country calling code prefix?
/// Returns its length.
fn calling_code_len(digits: &str) -> Option<usize> {
    let n = |len: usize| digits.get(..len).and_then(|s| s.parse::<u32>().ok());
    if matches!(n(1), Some(1) | Some(7)) {
        return Some(1);
    }
    if let Some(cc) = n(2) {
        let two = matches!(cc, 20 | 27 | 30..=34 | 36 | 39..=41 | 43..=49 | 51..=58 | 60..=66
            | 81 | 82 | 84 | 86 | 90..=95 | 98);
        if two {
            return Some(2);
        }
    }
    if let Some(cc) = n(3) {
        let three = matches!(cc, 210..=213 | 216 | 218 | 220..=258 | 260..=269 | 290 | 291
            | 297..=299 | 350..=359 | 370..=389 | 420 | 421 | 423 | 500..=509 | 590..=599
            | 670..=692 | 850 | 852 | 853 | 855 | 856 | 880 | 886 | 960..=977 | 992..=996 | 998);
        if three {
            return Some(3);
        }
    }
    None
}

/// Plausible national-number length (digits after the country code, trunk 0
/// removed) per country. Countries not listed use the E.164 envelope.
fn national_len_ok(cc: &str, national: usize) -> bool {
    match cc {
        "31" => national == 9,
        "32" => (8..=9).contains(&national),
        "33" => national == 9,
        "44" => (9..=10).contains(&national),
        "49" => (7..=11).contains(&national),
        _ => (4..=14).contains(&national),
    }
}

/// A run of one digit is not a phone number; neither is 0123456789.
fn digits_look_real(d: &str) -> bool {
    let b = d.as_bytes();
    let mut run = 1;
    for w in b.windows(2) {
        run = if w[0] == w[1] { run + 1 } else { 1 };
        if run >= 6 {
            return false;
        }
    }
    let ascending = b.windows(2).all(|w| w[1] == w[0] + 1);
    !ascending
}

/// National (trunk-0) numbers by country; `separated` when the writer used
/// spaces, dashes or dots between digit groups.
fn national_number_ok(d: &str, separated: bool, first_group_len: usize) -> bool {
    let b = d.as_bytes();
    if b.len() < 9 || b[0] != b'0' || b[1] == b'0' {
        return false;
    }
    let second = b[1];
    let third = b.get(2).copied().unwrap_or(b'0');
    let nl = b.len() == 10 && (second == b'6' || (separated && second != b'0'));
    let be = match b.len() {
        // Two-digit area codes (02, 03, 04, 09) take seven digits, the longer
        // ones (01x, 05x-08x) six: "06 1234567" is neither.
        9 => separated && match first_group_len {
            2 => matches!(second, b'2' | b'3' | b'4' | b'9'),
            _ => matches!(second, b'1' | b'5' | b'6' | b'7' | b'8'),
        },
        10 => second == b'4' && ((b'5'..=b'9').contains(&third) || separated),
        _ => false,
    };
    let de = (10..=12).contains(&b.len()) && separated
        || ((11..=12).contains(&b.len()) && second == b'1' && matches!(third, b'5'..=b'7'));
    let fr = b.len() == 10 && (matches!(second, b'6' | b'7') || (separated && second != b'0'));
    let uk = (b.len() == 10 || b.len() == 11)
        && (second == b'7' && b.len() == 11 || (separated && matches!(second, b'1' | b'2' | b'3' | b'8')));
    nl || be || de || fr || uk
}

fn phone_char(c: char) -> bool {
    c.is_ascii_digit() || matches!(c, ' ' | '-' | '.' | '/' | '(' | ')')
}

/// The candidate at `i` sits at the end of a chain of short digit groups
/// ("4728 0708 5478 5411"): the groups before it are the head of a longer
/// number it belongs to, so it is not a number of its own. Numbers written as
/// `+..` or `(..` start a number of their own, and a full-length number before
/// it (a list of phone numbers) does not count as a chain.
fn tail_of_digit_groups(text: &str, i: usize) -> bool {
    if matches!(text[i..].chars().next(), Some('+' | '(')) {
        return false;
    }
    let before = &text[..i];
    let Some(sep) = before.chars().next_back().filter(|c| matches!(c, ' ' | '-' | '.')) else {
        return false;
    };
    let run = before[..before.len() - sep.len_utf8()]
        .chars()
        .rev()
        .take_while(|c| c.is_ascii_digit())
        .count();
    (1..=4).contains(&run)
}

/// Runs of text shaped like an IBAN (two capitals, two digits, then at least
/// fifteen characters of capitals and digits in groups), valid or not. The
/// digits of an IBAN that fails its check are not a phone number either.
fn iban_shaped_regions(text: &str) -> Vec<(usize, usize)> {
    let bytes = text.as_bytes();
    let mut out: Vec<(usize, usize)> = Vec::new();
    let mut i = 0;
    while i + 4 <= bytes.len() {
        let starts = bytes[i].is_ascii_uppercase()
            && bytes[i + 1].is_ascii_uppercase()
            && bytes[i + 2].is_ascii_digit()
            && bytes[i + 3].is_ascii_digit()
            && text.is_char_boundary(i)
            && char_before(text, i).is_none_or(|c| !is_alnum(c));
        if starts {
            let mut compact = 0;
            let mut last = i;
            let mut prev_space = false;
            for (off, c) in text[i..].char_indices() {
                if c.is_ascii_uppercase() || c.is_ascii_digit() {
                    compact += 1;
                    last = i + off + c.len_utf8();
                    prev_space = false;
                } else if c == ' ' && !prev_space {
                    prev_space = true;
                } else {
                    break;
                }
                if compact > 34 {
                    break;
                }
            }
            if (15..=34).contains(&compact) && char_at(text, last).is_none_or(|n| !is_alnum(n)) {
                out.push((i, last));
                i = last;
                continue;
            }
        }
        i += 1;
    }
    out
}

fn find_phones(text: &str) -> Vec<PiiMatch> {
    let shaped = iban_shaped_regions(text);
    let mut out = Vec::new();
    let mut i = 0;
    while i < text.len() {
        let c = text[i..].chars().next().unwrap();
        let candidate_start = (c.is_ascii_digit() || c == '+' || c == '(') && {
            match char_before(text, i) {
                None => true,
                Some(p) => !(is_alnum(p) || matches!(p, '+' | '-' | '.' | '/' | ',' | '_' | '€' | '$' | '%' | '#' | '@')),
            }
        };
        if candidate_start && !tail_of_digit_groups(text, i) {
            if let Some(end) = phone_end(text, i).filter(|&end| !shaped.iter().any(|&(s, e)| i < e && s < end)) {
                out.push(PiiMatch { kind: PiiKind::Phone, start: i, end, detail: None });
                i = end;
                continue;
            }
        }
        i += c.len_utf8();
    }
    out
}

/// The longest prefix of the phone-shaped run at `start` that is a valid
/// phone number and ends cleanly (not mid-number, not before more digits).
fn phone_end(text: &str, start: usize) -> Option<usize> {
    let international = text[start..].starts_with('+');
    // Candidate ends: after each digit or closing parenthesis of the run.
    let run_len = text[start + usize::from(international)..]
        .char_indices()
        .find(|&(_, c)| !phone_char(c))
        .map_or(text.len() - start - usize::from(international), |(i, _)| i);
    let run_end = start + usize::from(international) + run_len;
    let mut ends: Vec<usize> = text[start..run_end]
        .char_indices()
        .filter(|&(_, c)| c.is_ascii_digit())
        .map(|(o, _)| start + o + 1)
        .collect();
    ends.reverse();
    for end in ends {
        let next = char_at(text, end);
        let next_next = text[end..].chars().nth(1);
        let glued = next.is_some_and(|n| {
            is_alnum(n) || n == '_' || (matches!(n, '-' | '/' | '.' | ',') && next_next.is_some_and(|x| x.is_ascii_digit()))
        });
        if glued {
            continue;
        }
        if phone_is_valid(&text[start..end]) {
            return Some(end);
        }
    }
    None
}

fn phone_is_valid(s: &str) -> bool {
    let separated = s.chars().any(|c| matches!(c, ' ' | '-' | '.' | '/'));
    // Parentheses must balance and hold only digits (the "(0)" trunk or an area code).
    let mut depth = 0;
    for c in s.chars() {
        match c {
            '(' => depth += 1,
            ')' => depth -= 1,
            _ => {}
        }
        if !(0..=1).contains(&depth) {
            return false;
        }
    }
    if depth != 0 {
        return false;
    }
    // Separator hygiene: no doubled separators, none at the edges.
    let plain = s.trim_start_matches('+');
    if plain.contains("  ") || plain.contains("--") || plain.contains("..") || plain.ends_with(['-', '.', '/', ' ']) {
        return false;
    }
    // A decimal-looking "0.50" or a date-looking "12.03.2024" is not a number.
    let groups: Vec<&str> = plain.split([' ', '-', '.', '/']).collect();
    if groups.len() == 3
        && groups.iter().all(|g| g.chars().all(|c| c.is_ascii_digit()))
        && groups[0].len() <= 2
        && groups[1].len() <= 2
        && groups[2].len() == 4
    {
        return false;
    }

    let (international, rest) = if let Some(r) = s.strip_prefix('+') {
        (true, r)
    } else if let Some(r) = s.strip_prefix("00") {
        (true, r)
    } else {
        (false, s)
    };
    let all_digits: String = rest.chars().filter(|c| c.is_ascii_digit()).collect();
    if !digits_look_real(&all_digits) {
        return false;
    }
    if international {
        // The "(0)" trunk-zero notation, "+49 (0)30 ...", is not part of the number.
        let cleaned = rest.replacen("(0)", "", 1);
        let digits: String = cleaned.chars().filter(|c| c.is_ascii_digit()).collect();
        let Some(cc_len) = calling_code_len(&digits) else { return false };
        let cc = &digits[..cc_len];
        let national = digits[cc_len..].strip_prefix('0').unwrap_or(&digits[cc_len..]);
        // Without a "+" the "00" form is easy to hit by accident, so it needs separators or full length.
        if !s.starts_with('+') && !separated && digits.len() < 11 {
            return false;
        }
        return digits.len() <= 15 && national_len_ok(cc, national.len());
    }
    // National numbers: no parentheses other than around the area code.
    let digits = all_digits;
    let first_group_len = s
        .trim_start_matches('(')
        .split(|c: char| !c.is_ascii_digit())
        .next()
        .map_or(0, str::len);
    if separated && first_group_len < 2 && !s.starts_with("(0)") {
        return false;
    }
    national_number_ok(&digits, separated || s.contains('('), first_group_len)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn found(text: &str, kind: PiiKind) -> Vec<String> {
        detect(text).into_iter().filter(|m| m.kind == kind).map(|m| m.text(text).to_string()).collect()
    }

    // ── IBAN ──

    #[test]
    fn iban_valid_spaced_and_compact() {
        assert_eq!(found("Pay NL91 ABNA 0417 1643 00 today", PiiKind::Iban), ["NL91 ABNA 0417 1643 00"]);
        assert_eq!(found("IBAN:NL91ABNA0417164300.", PiiKind::Iban), ["NL91ABNA0417164300"]);
        assert_eq!(found("DE89 3704 0044 0532 0130 00", PiiKind::Iban), ["DE89 3704 0044 0532 0130 00"]);
        assert_eq!(found("GB82 WEST 1234 5698 7654 32", PiiKind::Iban), ["GB82 WEST 1234 5698 7654 32"]);
        assert_eq!(found("BE68 5390 0754 7034", PiiKind::Iban), ["BE68 5390 0754 7034"]);
        assert_eq!(found("FR14 2004 1010 0505 0001 3M02 606", PiiKind::Iban), ["FR14 2004 1010 0505 0001 3M02 606"]);
    }

    #[test]
    fn iban_stops_before_the_next_word() {
        assert_eq!(found("NL91 ABNA 0417 1643 00 and more", PiiKind::Iban), ["NL91 ABNA 0417 1643 00"]);
        assert_eq!(found("NL91 ABNA 0417 1643 00 1234", PiiKind::Iban), ["NL91 ABNA 0417 1643 00"]);
    }

    #[test]
    fn iban_with_a_wrong_check_is_not_reported() {
        assert!(found("NL92 ABNA 0417 1643 00", PiiKind::Iban).is_empty());
        assert!(found("NL91ABNA0417164301", PiiKind::Iban).is_empty());
    }

    #[test]
    fn iban_with_the_wrong_length_or_country_is_not_reported() {
        assert!(found("NL91 ABNA 0417 1643", PiiKind::Iban).is_empty());
        assert!(found("NL91 ABNA 0417 1643 0000", PiiKind::Iban).is_empty());
        assert!(found("XX00 0000 0000 0000", PiiKind::Iban).is_empty());
    }

    #[test]
    fn iban_inside_a_longer_token_is_not_reported() {
        assert!(found("refNL91ABNA0417164300", PiiKind::Iban).is_empty());
        assert!(found("NL91ABNA0417164300X", PiiKind::Iban).is_empty());
    }

    #[test]
    fn iban_checksum_function() {
        assert!(iban_is_valid("NL91ABNA0417164300"));
        assert!(!iban_is_valid("NL91ABNA0417164301"));
        assert!(!iban_is_valid("nl91abna0417164300"));
    }

    // ── e-mail ──

    #[test]
    fn email_valid() {
        assert_eq!(found("Mail jan.jansen+tax@example.co.uk now", PiiKind::Email), ["jan.jansen+tax@example.co.uk"]);
        assert_eq!(found("<info@pdfluent.com>", PiiKind::Email), ["info@pdfluent.com"]);
        assert_eq!(found("Contact: a_b-c@sub.mail.example.nl.", PiiKind::Email), ["a_b-c@sub.mail.example.nl"]);
        assert_eq!(found("x@y.io, z@w.de", PiiKind::Email), ["x@y.io", "z@w.de"]);
    }

    #[test]
    fn email_near_misses_are_not_reported() {
        for bad in [
            "a@b",                // no dot in the domain
            "@example.com",       // no local part
            "jan@@example.com",   // doubled at
            "jan@example..com",   // empty label
            ".jan@example.com",   // leading dot
            "jan.@example.com",   // trailing dot
            "ja..n@example.com",  // doubled dot
            "jan@-example.com",   // label starts with a hyphen
            "jan@example.c",      // one-letter TLD
            "jan@example.123",    // numeric TLD
            "price @ 5.00 each",  // spaces around the at sign
        ] {
            assert!(found(bad, PiiKind::Email).is_empty(), "{bad:?} must not be an e-mail address");
        }
    }

    // ── phone ──

    #[test]
    fn phone_international() {
        for good in [
            "+31 6 12345678",
            "+31612345678",
            "+31 (0)6 12345678",
            "+32 470 12 34 56",
            "+33 1 23 45 67 89",
            "+49 30 1234567",
            "+49 (0)30 1234567",
            "+44 20 7946 0958",
            "+44 (0)20 7946 0958",
            "+1 415 555 0132",
            "0031 6 12345678",
            "0044 20 7946 0958",
        ] {
            assert_eq!(found(&format!("Call {good} please"), PiiKind::Phone), [good], "{good}");
        }
    }

    #[test]
    fn phone_national() {
        for good in [
            "06 12345678",       // NL mobile
            "06-12345678",
            "0612345678",        // NL mobile, bare
            "020 1234567",       // NL landline
            "020-1234567",
            "(020) 1234567",
            "0470 12 34 56",     // BE mobile
            "0470123456",
            "02 123 45 67",      // BE landline
            "030 1234567",       // DE landline
            "030/1234567",
            "0171 1234567",      // DE mobile
            "01711234567",
            "01 42 68 53 00",    // FR
            "06 12 34 56 78",
            "0612345678",
            "020 7946 0958",     // UK
            "07911 123456",
            "07911123456",
            "01632 960123",
        ] {
            assert_eq!(found(&format!("Tel. {good}, thanks"), PiiKind::Phone), [good], "{good}");
        }
    }

    #[test]
    fn phone_near_misses_are_not_reported() {
        for bad in [
            "0417164300",             // old Dutch account number: bare, not a mobile prefix
            "0123456789",             // ascending run
            "0000000000",             // one digit
            "06 1234567",             // too short
            "06 1234567890123",       // too long
            "12345678",               // no trunk zero
            "2024-10-18",             // a date
            "18.10.2024",             // a date
            "0.50",                   // an amount
            "1,000,000",              // an amount
            "+28 612345678",          // unassigned calling code (+99 6.. is Kyrgyzstan)
            "+31 6 1234",             // too short
            "+31 6 12345678901234",   // longer than E.164
            "1+2=3 and 0612345678x",  // glued to a letter
            "order#0612345678",       // glued to a hash
            "ref-0612345678",         // glued to a hyphen
            "0012345678",             // 00 + unassigned code 12
        ] {
            assert!(found(bad, PiiKind::Phone).is_empty(), "{bad:?} must not be a phone number");
        }
    }

    #[test]
    fn phone_followed_by_other_digits_keeps_only_the_phone() {
        assert_eq!(found("06 12345678 2024", PiiKind::Phone), ["06 12345678"]);
    }

    #[test]
    fn the_tail_of_a_failed_card_or_iban_is_not_a_phone_number() {
        assert!(found("Card 4728 0708 5478 5411", PiiKind::Phone).is_empty());
        assert!(found("Carte 4728-0708-5478-5411", PiiKind::Phone).is_empty());
        assert!(found("NL92 ABNA 0417 1643 00", PiiKind::Phone).is_empty());
        assert_eq!(found("Tel. +31 6 12345678", PiiKind::Phone), ["+31 6 12345678"], "a + number starts its own number");
    }

    // ── combined ──

    #[test]
    fn an_iban_is_not_also_a_phone_number() {
        let text = "NL91 ABNA 0417 1643 00";
        let all = detect(text);
        assert_eq!(all.len(), 1);
        assert_eq!(all[0].kind, PiiKind::Iban);
    }

    #[test]
    fn digits_inside_an_email_are_not_a_phone_number() {
        let text = "0612345678@example.nl";
        let all = detect(text);
        assert_eq!(all.len(), 1);
        assert_eq!(all[0].kind, PiiKind::Email);
    }

    #[test]
    fn a_page_of_mixed_text_yields_exactly_the_personal_data() {
        let text = "Invoice 2024-0042 dated 18-10-2024 total EUR 1.234,56.\n\
                    Pay to NL91 ABNA 0417 1643 00 (ref 0417164300).\n\
                    Questions: billing@example.com or +31 20 123 4567.\n\
                    Order #0612345678 shipped; version 1.2.3; ratio 3:1.";
        let kinds: Vec<(PiiKind, &str)> = detect(text).iter().map(|m| (m.kind, m.text(text))).collect();
        assert_eq!(
            kinds,
            [
                (PiiKind::Iban, "NL91 ABNA 0417 1643 00"),
                (PiiKind::Email, "billing@example.com"),
                (PiiKind::Phone, "+31 20 123 4567"),
            ]
        );
    }

    #[test]
    fn non_ascii_text_does_not_panic() {
        let text = "Zoë ✓ café@exämple.com 😀 +31 6 12345678 ünï NL91 ABNA 0417 1643 00 ©";
        let all = detect(text);
        assert!(all.iter().any(|m| m.kind == PiiKind::Iban));
        assert!(all.iter().any(|m| m.kind == PiiKind::Phone));
    }
}
