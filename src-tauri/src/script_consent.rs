// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary. The PDFluent application is free to use,
// including for commercial purposes. Redistribution, or extraction or reuse
// of its components (including the embedded PDF engine), requires a licence.
// See https://pdfluent.com/license for terms.

//! Form scripts run only with the user's permission.
//!
//! A PDF form can carry code: XFA JavaScript and FormCalc, and the
//! calculate / format / validate / keystroke actions of an AcroForm field.
//! Code that arrives inside a document is the document's, not the user's, so
//! the editor opens it as data and runs none of it until the user says so.
//!
//! This module is the one place that decision lives:
//!
//! * [`ScriptGuard`] is closed by default and belongs to one open document.
//! * Every code path that would hand a script to an interpreter goes through
//!   [`ScriptGuard::run`] (or [`ScriptGuard::check`] when the call cannot be
//!   wrapped). Nothing else may call the engine's script entry points; the
//!   source-level test `script_entry_points_sit_behind_the_guard` in
//!   `pdf_engine.rs` holds that line.
//! * [`scan_scripts`] counts what a document would run, so the bar can say
//!   what it asks about without running any of it.
//!
//! The guard is not part of an undo snapshot: undoing an edit must not take a
//! permission back, and redoing one must not give it.

use lopdf::{Dictionary, Document, Object, ObjectId};
use serde::Serialize;
use std::collections::HashSet;
use std::fmt;

/// Prefix of the error a blocked script call returns. The webview maps it to
/// a message in the user's language.
pub const SCRIPTS_NOT_ALLOWED: &str = "FORM_SCRIPTS_NOT_ALLOWED";

/// What kind of script a call site would run.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ScriptKind {
    /// XFA JavaScript (initialize, calculate, change, click, docReady).
    XfaJavaScript,
    /// XFA FormCalc, the default language of an XFA script.
    // The interactive session checks XfaJavaScript for the whole form; the kind
    // stays so a build that separates the two languages has a name for it.
    #[allow(dead_code)]
    XfaFormCalc,
    /// An AcroForm field action: calculate, format, validate or keystroke.
    AcroFormAction,
}

impl ScriptKind {
    fn label(self) -> &'static str {
        match self {
            Self::XfaJavaScript => "xfa-javascript",
            Self::XfaFormCalc => "xfa-formcalc",
            Self::AcroFormAction => "acroform-action",
        }
    }
}

/// A script call that was refused because the user has not allowed scripts.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct ScriptsBlocked {
    pub kind: ScriptKind,
}

impl fmt::Display for ScriptsBlocked {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(
            f,
            "{SCRIPTS_NOT_ALLOWED}: a {} script was not run because the user has not allowed form scripts for this document",
            self.kind.label()
        )
    }
}

impl std::error::Error for ScriptsBlocked {}

/// The permission to run a document's scripts. Closed until opened.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default)]
pub struct ScriptGuard {
    open: bool,
}

impl ScriptGuard {
    /// A guard that lets nothing through. This is also `Default`.
    pub const fn closed() -> Self {
        Self { open: false }
    }

    pub fn is_open(&self) -> bool {
        self.open
    }

    pub fn grant(&mut self) {
        self.open = true;
    }

    pub fn revoke(&mut self) {
        self.open = false;
    }

    /// `Ok` only when scripts are allowed.
    pub fn check(&self, kind: ScriptKind) -> Result<(), ScriptsBlocked> {
        if self.open {
            Ok(())
        } else {
            Err(ScriptsBlocked { kind })
        }
    }

    /// Run `f` (the code that executes a script) only when scripts are
    /// allowed. The closure is not called otherwise.
    #[allow(dead_code)] // call sites use `check`; kept for the tests of the guard's contract
    pub fn run<T>(&self, kind: ScriptKind, f: impl FnOnce() -> T) -> Result<T, ScriptsBlocked> {
        self.check(kind)?;
        Ok(f())
    }
}

/// How many scripts a document would run, by kind.
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Serialize)]
pub struct ScriptSummary {
    pub javascript: usize,
    pub formcalc: usize,
    pub acroform: usize,
}

impl ScriptSummary {
    pub fn total(&self) -> usize {
        self.javascript + self.formcalc + self.acroform
    }
}

/// What the webview learns about a document's scripts and its permission.
#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct FormScriptsStatus {
    pub javascript: usize,
    pub formcalc: usize,
    pub acroform: usize,
    pub total: usize,
    /// Whether scripts may run for this document now.
    pub allowed: bool,
    /// SHA-256 of the file as it was opened: the key the webview remembers a
    /// choice under.
    pub content_hash: String,
}

/// What granting permission did.
#[derive(Debug, Clone, Default, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct FormScriptsRunReport {
    /// The initial scripts were run (false when the document has none this
    /// build can run, or when permission was withdrawn).
    pub ran: bool,
    /// Fields whose value the scripts changed.
    pub fields_changed: usize,
}

/// The answer to "allow scripts": the new status and what running them did.
#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct FormScriptsOutcome {
    pub status: FormScriptsStatus,
    pub report: FormScriptsRunReport,
}

// ── Scanning ─────────────────────────────────────────────────────────────

const MAX_DEPTH: usize = 64;

/// Count the scripts a document carries. Reads the document, runs nothing.
pub fn scan_scripts(doc: &Document) -> ScriptSummary {
    let mut summary = ScriptSummary::default();
    let Some(acro) = acroform_dict(doc) else {
        return summary;
    };
    count_xfa_scripts(doc, acro, &mut summary);
    if let Ok(fields) = acro.get(b"Fields").and_then(|f| deref_array(doc, f)) {
        let mut seen = HashSet::new();
        for field in fields {
            count_field_actions(doc, field, &mut summary, &mut seen, 0);
        }
    }
    summary
}

fn acroform_dict(doc: &Document) -> Option<&Dictionary> {
    let root = doc.trailer.get(b"Root").ok()?;
    let catalog = deref_dict(doc, root)?;
    deref_dict(doc, catalog.get(b"AcroForm").ok()?)
}

fn deref<'a>(doc: &'a Document, obj: &'a Object) -> Option<&'a Object> {
    match obj {
        Object::Reference(id) => doc.get_object(*id).ok(),
        other => Some(other),
    }
}

fn deref_dict<'a>(doc: &'a Document, obj: &'a Object) -> Option<&'a Dictionary> {
    match deref(doc, obj)? {
        Object::Dictionary(d) => Some(d),
        Object::Stream(s) => Some(&s.dict),
        _ => None,
    }
}

fn deref_array<'a>(doc: &'a Document, obj: &'a Object) -> Result<&'a Vec<Object>, lopdf::Error> {
    match deref(doc, obj) {
        Some(Object::Array(a)) => Ok(a),
        _ => Err(lopdf::Error::ObjectNotFound((0, 0))),
    }
}

fn count_field_actions(
    doc: &Document,
    field: &Object,
    summary: &mut ScriptSummary,
    seen: &mut HashSet<ObjectId>,
    depth: usize,
) {
    if depth > MAX_DEPTH {
        return;
    }
    if let Object::Reference(id) = field {
        if !seen.insert(*id) {
            return;
        }
    }
    let Some(dict) = deref_dict(doc, field) else {
        return;
    };
    if let Some(aa) = dict.get(b"AA").ok().and_then(|o| deref_dict(doc, o)) {
        // C calculate, F format, V validate, K keystroke.
        for key in [b"C".as_slice(), b"F", b"V", b"K"] {
            let is_js = aa
                .get(key)
                .ok()
                .and_then(|o| deref_dict(doc, o))
                .and_then(|action| action.get(b"S").ok())
                .and_then(|s| deref(doc, s))
                .is_some_and(|s| matches!(s, Object::Name(n) if n == b"JavaScript"));
            if is_js {
                summary.acroform += 1;
            }
        }
    }
    if let Ok(kids) = dict.get(b"Kids").and_then(|k| deref_array(doc, k)) {
        for kid in kids {
            count_field_actions(doc, kid, summary, seen, depth + 1);
        }
    }
}

fn count_xfa_scripts(doc: &Document, acro: &Dictionary, summary: &mut ScriptSummary) {
    let Ok(xfa) = acro.get(b"XFA") else { return };
    let mut xml = Vec::new();
    match deref(doc, xfa) {
        Some(Object::Stream(s)) => append_stream(s, &mut xml),
        Some(Object::Array(parts)) => {
            // [name, stream, name, stream, ...]
            for part in parts {
                if let Some(Object::Stream(s)) = deref(doc, part) {
                    append_stream(s, &mut xml);
                }
            }
        }
        _ => {}
    }
    count_script_elements(&xml, summary);
}

fn append_stream(stream: &lopdf::Stream, out: &mut Vec<u8>) {
    match stream.decompressed_content() {
        Ok(bytes) => out.extend_from_slice(&bytes),
        Err(_) => out.extend_from_slice(&stream.content),
    }
    out.push(b'\n');
}

/// Count `<script ...>` elements by language. An XFA script with no declared
/// `contentType` is FormCalc.
fn count_script_elements(xml: &[u8], summary: &mut ScriptSummary) {
    let text = String::from_utf8_lossy(xml);
    let mut rest: &str = &text;
    while let Some(at) = rest.find("<script") {
        let after = &rest[at + "<script".len()..];
        // `<scripts>` or `<scriptFoo` is a different element.
        let boundary = after.chars().next();
        let Some(end) = after.find('>') else { break };
        let tag = &after[..end];
        rest = &after[end..];
        if !matches!(boundary, Some(c) if c.is_whitespace() || c == '>' || c == '/') {
            continue;
        }
        if tag.trim_end().ends_with('/') {
            continue; // `<script/>`: no code
        }
        let lower = tag.to_ascii_lowercase();
        match lower.find("contenttype") {
            Some(i) if !lower[i..].contains("formcalc") => summary.javascript += 1,
            _ => summary.formcalc += 1,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use lopdf::{dictionary, Stream};

    #[test]
    fn the_guard_is_closed_by_default() {
        let guard = ScriptGuard::default();
        assert!(!guard.is_open());
        assert!(ScriptGuard::closed().check(ScriptKind::XfaJavaScript).is_err());
    }

    #[test]
    fn a_closed_guard_never_calls_the_script() {
        let guard = ScriptGuard::closed();
        let mut calls = 0;
        for kind in [ScriptKind::XfaJavaScript, ScriptKind::XfaFormCalc, ScriptKind::AcroFormAction] {
            let r = guard.run(kind, || calls += 1);
            assert_eq!(r, Err(ScriptsBlocked { kind }));
        }
        assert_eq!(calls, 0, "no script ran without permission");
    }

    #[test]
    fn an_open_guard_runs_the_script_and_revoking_closes_it_again() {
        let mut guard = ScriptGuard::closed();
        guard.grant();
        let mut calls = 0;
        guard.run(ScriptKind::AcroFormAction, || calls += 1).expect("allowed");
        assert_eq!(calls, 1);
        guard.revoke();
        assert!(guard.run(ScriptKind::AcroFormAction, || calls += 1).is_err());
        assert_eq!(calls, 1);
    }

    #[test]
    fn a_blocked_call_carries_the_code_the_webview_maps() {
        let err = ScriptGuard::closed().check(ScriptKind::XfaFormCalc).unwrap_err();
        assert!(err.to_string().starts_with("FORM_SCRIPTS_NOT_ALLOWED: "));
    }

    #[test]
    fn xfa_scripts_are_counted_by_language() {
        let xml = br#"<template><field><event><script contentType="application/x-javascript">a=1</script></event>
            <event><script>$.rawValue = 1</script></event>
            <event><script contentType="application/x-formcalc">x=1</script></event>
            <event><script contentType="application/x-javascript"/></event></field>
            <scripts></scripts></template>"#;
        let mut s = ScriptSummary::default();
        count_script_elements(xml, &mut s);
        assert_eq!(s, ScriptSummary { javascript: 1, formcalc: 2, acroform: 0 });
    }

    fn doc_with_field_actions(actions: &[(&str, &str)]) -> Document {
        let mut doc = Document::with_version("1.7");
        let mut aa = Dictionary::new();
        for (key, subtype) in actions {
            let action = doc.add_object(dictionary! { "S" => Object::Name(subtype.as_bytes().to_vec()) });
            aa.set(key.as_bytes().to_vec(), Object::Reference(action));
        }
        let field = doc.add_object(dictionary! {
            "FT" => "Tx",
            "T" => Object::string_literal("total"),
            "AA" => Object::Dictionary(aa),
        });
        let acro = doc.add_object(dictionary! { "Fields" => vec![Object::Reference(field)] });
        let root = doc.add_object(dictionary! { "Type" => "Catalog", "AcroForm" => Object::Reference(acro) });
        doc.trailer.set("Root", Object::Reference(root));
        doc
    }

    #[test]
    fn acroform_javascript_actions_are_counted_and_other_actions_are_not() {
        let doc = doc_with_field_actions(&[("C", "JavaScript"), ("F", "JavaScript"), ("V", "JavaScript"), ("K", "URI")]);
        assert_eq!(scan_scripts(&doc), ScriptSummary { javascript: 0, formcalc: 0, acroform: 3 });
    }

    #[test]
    fn a_document_without_a_form_has_no_scripts() {
        let mut doc = Document::with_version("1.7");
        let root = doc.add_object(dictionary! { "Type" => "Catalog" });
        doc.trailer.set("Root", Object::Reference(root));
        assert_eq!(scan_scripts(&doc).total(), 0);
    }

    #[test]
    fn an_xfa_packet_array_is_scanned() {
        let mut doc = Document::with_version("1.7");
        let xml = doc.add_object(Stream::new(
            Dictionary::new(),
            b"<template><script contentType=\"application/x-javascript\">1</script></template>".to_vec(),
        ));
        let acro = doc.add_object(dictionary! {
            "XFA" => vec![Object::string_literal("template"), Object::Reference(xml)],
        });
        let root = doc.add_object(dictionary! { "Type" => "Catalog", "AcroForm" => Object::Reference(acro) });
        doc.trailer.set("Root", Object::Reference(root));
        assert_eq!(scan_scripts(&doc), ScriptSummary { javascript: 1, formcalc: 0, acroform: 0 });
    }
}
