// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary. The PDFluent application is free to use,
// including for commercial purposes. Redistribution, or extraction or reuse
// of its components (including the embedded PDF engine), requires a licence.
// See https://pdfluent.com/license for terms.

//! "Export as Markdown" and "Tables to Excel" (Preview).
//!
//! Both read the document through the SDK's structured extraction
//! (`pdfluent::PdfDocument::extract_markdown` / `extract_blocks`), which the
//! SDK itself marks Preview: its output is still improving and may change in a
//! minor release. The editor labels both exports Preview for that reason.
//!
//! Only the fast tier runs here. It is pure Rust and downloads nothing; the
//! balanced tier needs a layout model and the `ort-layout` feature, and the
//! editor builds neither.
//!
//! Like the DOCX/XLSX/PPTX converters these are free functions over a cloned
//! `lopdf::Document`, so the command can run them on a worker thread without
//! holding the document mutex.

use pdfluent::{Block, BlockKind, ExtractOptions, PdfDocument};
use rust_xlsxwriter::Workbook;
use std::path::Path;
use std::sync::atomic::{AtomicUsize, Ordering};
use std::sync::Mutex;

/// The refusal when a document has no table the extraction recognises. A
/// workbook with no sheets is not a file Excel opens, and an empty one would
/// read as "the tables were empty", which is a different claim.
pub const NO_TABLES_FOUND: &str = "no-tables-found: no tables were recognised in this document.";

/// Serialize the (cloned) document and open it through the SDK facade.
///
/// Serialized rather than read back from the bytes on disk, for the reason
/// `convert_doc_to_pdfa` gives: unsaved edits are in the export.
fn facade_document(mut doc: lopdf::Document) -> Result<PdfDocument, String> {
    let mut bytes = Vec::new();
    doc.save_to(&mut bytes)
        .map_err(|e| format!("Failed to serialize document: {e}"))?;
    PdfDocument::from_bytes(&bytes).map_err(|e| format!("Failed to read document: {e}"))
}

/// The options both exports run with: the SDK defaults, which are the fast
/// tier with OCR off, minus figure markers. The Markdown would otherwise carry
/// image references to files this export does not write.
fn export_options() -> ExtractOptions {
    let mut options = ExtractOptions::default();
    options.include_figures = false;
    options
}

/// Write the document as Markdown to `output_path`.
pub fn export_doc_as_markdown(doc: lopdf::Document, output_path: &str) -> Result<(), String> {
    let facade = facade_document(doc)?;
    let markdown = facade
        .extract_markdown(&export_options())
        .map_err(|e| format!("Markdown extraction failed: {e}"))?;
    if markdown.trim().is_empty() {
        return Err(
            "Markdown export found no text. The document may be scanned; run OCR first."
                .to_string(),
        );
    }
    crate::atomic_file::replace(Path::new(output_path), markdown.as_bytes())
        .map_err(|e| format!("Failed to save Markdown file: {e}"))
}

/// One cell of an extracted table, on the table's own grid.
#[derive(Debug, Clone, PartialEq)]
pub struct ExtractedCell {
    pub row: usize,
    pub column: usize,
    pub text: String,
}

/// One table, as a run of cells, and the page (0-based) it starts on.
#[derive(Debug, Clone, PartialEq)]
pub struct ExtractedTable {
    pub page: usize,
    pub cells: Vec<ExtractedCell>,
}

fn cell_of(block: &Block) -> Option<(usize, usize)> {
    match block.kind {
        BlockKind::TableCell { row, column, .. } => Some((row as usize, column as usize)),
        _ => None,
    }
}

/// Group the table-cell blocks into tables.
///
/// The SDK writes a table as a run of adjacent cells in row-major order, so
/// `(row, column)` climbs with every cell and a run ends where the blocks stop
/// being cells, where the page changes, or where the coordinates go backwards
/// (a second table). The same rule the SDK's own Markdown writer reads tables
/// back with. A run on the next page whose first cell is marked
/// `continues_previous` is the same table set over a page break: its rows are
/// numbered on, and a first row that repeats the table's head is left out.
pub fn tables_from_blocks(blocks: &[Block]) -> Vec<ExtractedTable> {
    let mut tables: Vec<ExtractedTable> = Vec::new();
    let mut i = 0;
    while i < blocks.len() {
        let Some(first) = cell_of(&blocks[i]) else {
            i += 1;
            continue;
        };
        let continues = i > 0
            && blocks[i].continues_previous
            && blocks[i].page != blocks[i - 1].page
            && cell_of(&blocks[i - 1]).is_some()
            && !tables.is_empty();

        let mut run = Vec::new();
        let mut last = first;
        run.push(&blocks[i]);
        let mut end = i + 1;
        while end < blocks.len() && blocks[end].page == blocks[i].page {
            match cell_of(&blocks[end]) {
                Some(at) if at > last => {
                    last = at;
                    run.push(&blocks[end]);
                    end += 1;
                }
                _ => break,
            }
        }

        let to_cells = |offset: usize, skip_row: Option<usize>| -> Vec<ExtractedCell> {
            run.iter()
                .filter_map(|b| {
                    let (row, column) = cell_of(b)?;
                    if Some(row) == skip_row {
                        return None;
                    }
                    let shift = usize::from(skip_row.is_some_and(|s| row > s));
                    Some(ExtractedCell {
                        row: row + offset - shift,
                        column,
                        text: b.text.trim().to_string(),
                    })
                })
                .collect()
        };

        if continues {
            let table = tables.last_mut().expect("checked non-empty");
            let head: Vec<&str> = table
                .cells
                .iter()
                .filter(|c| c.row == 0)
                .map(|c| c.text.as_str())
                .collect();
            let first_row: Vec<&str> = run
                .iter()
                .filter(|b| cell_of(b).map(|(r, _)| r) == Some(first.0))
                .map(|b| b.text.trim())
                .collect();
            let skip = (!head.is_empty() && head == first_row).then_some(first.0);
            let rows_so_far = table.cells.iter().map(|c| c.row + 1).max().unwrap_or(0);
            let offset = rows_so_far.saturating_sub(first.0);
            let cells = to_cells(offset, skip);
            table.cells.extend(cells);
        } else {
            tables.push(ExtractedTable {
                page: blocks[i].page,
                cells: to_cells(0, None),
            });
        }
        i = end;
    }
    tables
}

/// A number Excel can sum, or `None` where the cell is text. Conservative on
/// purpose: a value with a leading zero (`007`, a postcode, an account
/// number) stays text, because writing it as a number drops the zero.
fn as_number(text: &str) -> Option<f64> {
    let t = text.trim();
    if t.is_empty() || t.len() > 15 {
        return None;
    }
    let digits = t.strip_prefix('-').unwrap_or(t);
    if digits.len() > 1 && digits.starts_with('0') && !digits.starts_with("0.") {
        return None;
    }
    if !digits.chars().all(|c| c.is_ascii_digit() || c == '.') {
        return None;
    }
    t.parse::<f64>().ok().filter(|v| v.is_finite())
}

/// Build the workbook: one sheet per table, named after its number and the
/// page it starts on.
pub fn tables_to_xlsx_bytes(tables: &[ExtractedTable]) -> Result<Vec<u8>, String> {
    let mut workbook = Workbook::new();
    for (n, table) in tables.iter().enumerate() {
        let sheet = workbook.add_worksheet();
        sheet
            .set_name(format!("Table {} (p{})", n + 1, table.page + 1))
            .map_err(|e| format!("Failed to name sheet: {e}"))?;
        for cell in &table.cells {
            let row = u32::try_from(cell.row).map_err(|_| "Table too large for Excel")?;
            let col = u16::try_from(cell.column).map_err(|_| "Table too wide for Excel")?;
            let written = match as_number(&cell.text) {
                Some(v) => sheet.write_number(row, col, v).map(|_| ()),
                None if cell.text.is_empty() => Ok(()),
                None => sheet.write_string(row, col, &cell.text).map(|_| ()),
            };
            written.map_err(|e| format!("Failed to write cell: {e}"))?;
        }
    }
    workbook
        .save_to_buffer()
        .map_err(|e| format!("Failed to build workbook: {e}"))
}

/// Times the SDK extraction has run for a tables export in this process; the
/// tests read it to prove the export does not extract twice.
static EXTRACTIONS: AtomicUsize = AtomicUsize::new(0);

pub fn table_extractions_run() -> usize {
    EXTRACTIONS.load(Ordering::SeqCst)
}

fn recognised_tables(doc: lopdf::Document) -> Result<Vec<ExtractedTable>, String> {
    EXTRACTIONS.fetch_add(1, Ordering::SeqCst);
    let facade = facade_document(doc)?;
    let blocks = facade
        .extract_blocks(&export_options())
        .map_err(|e| format!("Table extraction failed: {e}"))?;
    Ok(tables_from_blocks(&blocks))
}

/// Which state of which document a cached extraction belongs to
/// (`OpenDocument::revision_key`).
pub type RevisionKey = (usize, u64);

/// The tables found by the pre-check, kept for the export that follows it: a
/// large document is extracted once, before the save dialog, not again after.
/// One slot, consumed by the export, and only valid for the revision it was
/// made from: an edit in between changes the key and the export extracts anew.
#[derive(Default)]
pub struct TableCache {
    slot: Mutex<Option<(RevisionKey, Vec<ExtractedTable>)>>,
}

impl TableCache {
    fn put(&self, key: RevisionKey, tables: Vec<ExtractedTable>) {
        if let Ok(mut slot) = self.slot.lock() {
            *slot = Some((key, tables));
        }
    }

    fn take(&self, key: RevisionKey) -> Option<Vec<ExtractedTable>> {
        let mut slot = self.slot.lock().ok()?;
        match slot.take() {
            Some((k, tables)) if k == key => Some(tables),
            _ => None,
        }
    }
}

/// How many tables the extraction recognises. The export dialog asks this
/// before it opens a save dialog, so a document without a table is refused
/// without asking the person for a file name first. A non-empty result is kept
/// in `cache` for `export_doc_tables_cached`.
pub fn count_doc_tables(
    cache: &TableCache,
    key: RevisionKey,
    doc: lopdf::Document,
) -> Result<usize, String> {
    let tables = recognised_tables(doc)?;
    let n = tables.len();
    if n > 0 {
        cache.put(key, tables);
    }
    Ok(n)
}

fn write_tables(tables: &[ExtractedTable], output_path: &str) -> Result<usize, String> {
    if tables.is_empty() {
        return Err(NO_TABLES_FOUND.to_string());
    }
    let bytes = tables_to_xlsx_bytes(tables)?;
    crate::atomic_file::replace(Path::new(output_path), &bytes)
        .map_err(|e| format!("Failed to save Excel file: {e}"))?;
    Ok(tables.len())
}

/// Write every table the extraction recognises to its own sheet of an .xlsx
/// at `output_path`. Returns how many tables were written.
pub fn export_doc_tables_to_xlsx(doc: lopdf::Document, output_path: &str) -> Result<usize, String> {
    write_tables(&recognised_tables(doc)?, output_path)
}

/// As `export_doc_tables_to_xlsx`, but reuses the extraction the pre-check
/// kept for this revision and extracts only when there is none.
pub fn export_doc_tables_cached(
    cache: &TableCache,
    key: RevisionKey,
    doc: lopdf::Document,
    output_path: &str,
) -> Result<usize, String> {
    let tables = match cache.take(key) {
        Some(tables) => tables,
        None => recognised_tables(doc)?,
    };
    write_tables(&tables, output_path)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn numbers_keep_leading_zeros_as_text() {
        assert_eq!(as_number("40"), Some(40.0));
        assert_eq!(as_number("-3.5"), Some(-3.5));
        assert_eq!(as_number("0.25"), Some(0.25));
        assert_eq!(as_number("0"), Some(0.0));
        assert_eq!(as_number("007"), None);
        assert_eq!(as_number("Week 1"), None);
        assert_eq!(as_number(""), None);
        assert_eq!(as_number("1.2.3"), None);
    }

    #[test]
    fn a_workbook_without_tables_is_refused_not_written_empty() {
        let doc = lopdf::Document::with_version("1.7");
        let dir = std::env::temp_dir().join("pdfluent_structured_export_unit");
        std::fs::create_dir_all(&dir).expect("tmp dir");
        let nanos = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|d| d.as_nanos())
            .unwrap_or(0);
        let out = dir.join(format!("none-{}-{nanos}.xlsx", std::process::id()));
        // An empty document either fails to read or has no tables; neither may
        // produce a file.
        assert!(export_doc_tables_to_xlsx(doc, out.to_str().expect("utf8")).is_err());
        assert!(
            !out.exists(),
            "a refused export must not leave a file behind"
        );
    }
}
