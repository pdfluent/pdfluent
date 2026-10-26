// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary. The PDFluent application is free to use,
// including for commercial purposes. Redistribution, or extraction or reuse
// of its components (including the embedded PDF engine), requires a licence.
// See https://pdfluent.com/license for terms.

//! Tables to Excel extracts a document once: the pre-check before the save
//! dialog keeps its result and the export consumes it. This file holds a
//! single test because the extraction counter is process-wide.

use pdfluent_lib::{count_doc_tables, export_doc_tables_cached, table_extractions_run, TableCache};
use std::path::PathBuf;

fn load(rel: &str) -> lopdf::Document {
    lopdf::Document::load(PathBuf::from(env!("CARGO_MANIFEST_DIR")).join(rel)).unwrap_or_else(|e| panic!("load {rel}: {e}"))
}

fn scratch(name: &str) -> PathBuf {
    let dir = std::env::temp_dir().join(format!("pdfluent-extract-once-{}", std::process::id()));
    std::fs::create_dir_all(&dir).expect("scratch dir");
    dir.join(name)
}

#[test]
fn the_export_after_the_pre_check_extracts_once_and_a_changed_revision_extracts_again() {
    let cache = TableCache::default();
    let key = (7, 3);
    let before = table_extractions_run();
    assert_eq!(count_doc_tables(&cache, key, load("tests/fixtures/table_report.pdf")).expect("count"), 1);
    let out = scratch("cached.xlsx");
    let n = export_doc_tables_cached(&cache, key, load("tests/fixtures/table_report.pdf"), out.to_str().unwrap())
        .expect("export");
    assert_eq!(n, 1);
    assert_eq!(table_extractions_run() - before, 1, "count and export together extract once");
    assert_eq!(&std::fs::read(&out).expect("file")[..2], b"PK");

    // The slot is consumed, and a different revision never reuses it.
    let before = table_extractions_run();
    export_doc_tables_cached(&cache, key, load("tests/fixtures/table_report.pdf"), out.to_str().unwrap()).expect("export");
    assert_eq!(table_extractions_run() - before, 1, "no cached result left: extracts again");
    count_doc_tables(&cache, key, load("tests/fixtures/table_report.pdf")).expect("count");
    let before = table_extractions_run();
    export_doc_tables_cached(&cache, (7, 4), load("tests/fixtures/table_report.pdf"), out.to_str().unwrap()).expect("export");
    assert_eq!(table_extractions_run() - before, 1, "an edited document is extracted afresh");
}
