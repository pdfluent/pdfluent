// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary. The PDFluent application is free to use,
// including for commercial purposes. Redistribution, or extraction or reuse
// of its components (including the embedded PDF engine), requires a licence.
// See https://pdfluent.com/license for terms.

//! J-98 and J-99, the Rust half: Markdown export and Tables to Excel write a
//! real file from a real document. The fixture table_report.pdf is generated
//! by tests/fixtures/make_table_report.py: a heading, a sentence and a ruled
//! table of three columns and three data rows.

use pdfluent_lib::{
    count_doc_tables, export_doc_as_markdown, export_doc_tables_to_xlsx,
    TableCache, NO_TABLES_FOUND,
};
use std::path::PathBuf;

fn manifest(rel: &str) -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR")).join(rel)
}

fn scratch(name: &str) -> PathBuf {
    let dir = std::env::temp_dir().join(format!("pdfluent-structured-export-{}", std::process::id()));
    std::fs::create_dir_all(&dir).expect("scratch dir");
    dir.join(name)
}

fn load(rel: &str) -> lopdf::Document {
    lopdf::Document::load(manifest(rel)).unwrap_or_else(|e| panic!("load {rel}: {e}"))
}

#[test]
fn markdown_export_writes_the_text_of_the_document() {
    let out = scratch("table_report.md");
    export_doc_as_markdown(load("tests/fixtures/table_report.pdf"), out.to_str().unwrap()).expect("export");
    let md = std::fs::read_to_string(&out).expect("the file exists");
    for word in ["Quarterly stock report", "Widget", "Gadget", "Gizmo", "2.50", "12.00", "3.75"] {
        assert!(md.contains(word), "the Markdown carries {word:?}:\n{md}");
    }
}

#[test]
fn tables_to_excel_writes_a_workbook_with_the_table() {
    let out = scratch("table_report.xlsx");
    let tables = export_doc_tables_to_xlsx(load("tests/fixtures/table_report.pdf"), out.to_str().unwrap())
        .expect("the ruled table is recognised");
    assert_eq!(tables, 1, "one table on the page");
    let bytes = std::fs::read(&out).expect("the file exists");
    assert_eq!(&bytes[..2], b"PK", "an .xlsx is a zip archive");
}

#[test]
fn tables_to_excel_refuses_a_document_without_a_table_and_writes_no_file() {
    let out = scratch("no-table.xlsx");
    let _ = std::fs::remove_file(&out);
    let err = export_doc_tables_to_xlsx(load("tests/golden/fixture-sample-text-3p.pdf"), out.to_str().unwrap())
        .expect_err("running text is not a table");
    assert!(err.starts_with(NO_TABLES_FOUND), "got {err}");
    assert!(!out.exists(), "a refused export leaves no file");
}

#[test]
fn the_table_count_is_known_before_any_file_name_is_asked_for() {
    let cache = TableCache::default();
    assert_eq!(count_doc_tables(&cache, (1, 0), load("tests/fixtures/table_report.pdf")).expect("count"), 1);
    assert_eq!(
        count_doc_tables(&cache, (2, 0), load("tests/golden/fixture-sample-text-3p.pdf")).expect("count"),
        0,
        "running text is not a table"
    );
}
