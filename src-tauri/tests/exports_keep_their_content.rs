// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary. The PDFluent application is free to use,
// including for commercial purposes. Redistribution, or extraction or reuse
// of its components (including the embedded PDF engine), requires a licence.
// See https://pdfluent.com/license for terms.

//! Every export the editor offers keeps the document's content.
//!
//! What existed before this file were the `op_convert_to_*_produces_non_empty_
//! output` unit tests: a file starting with `PK` and longer than 100 bytes. A
//! DOCX with an empty body passes that, and so does one that put every glyph of
//! a table in its own cell (#408). These tests open what the export wrote and
//! read it back: the words of the source are there, a table cell holds the
//! cell's text and not one character of it, a slide per page, an image the size
//! of the page that is not blank, a PDF/A whose text is the source's.
//!
//! The fixture is built here, in memory, from text written for it: two pages,
//! a heading, two paragraphs and two ruled tables. Every call goes through the
//! same function the Tauri command calls, on a clone of the open document, as
//! the command does.

use pdfluent_lib::{
    convert_doc_to_docx, convert_doc_to_pptx, convert_doc_to_xlsx, export_doc_as_markdown,
    export_doc_tables_to_xlsx, OpenDocument,
};
use std::collections::BTreeMap;
use std::io::Read;
use std::path::PathBuf;

// ── Fixture ─────────────────────────────────────────────────────────────

const HEADING: &str = "Harbour Survey Results";
const PARA_1: &str = "The survey counted vessels in the north basin over three weeks.";
const PARA_2: &str = "A second table lists the inspection outcomes per quay.";

/// Page 1's table: a header row and three rows of counts.
const TABLE_1: [[&str; 4]; 4] = [
    ["Category", "Week 1", "Week 2", "Week 3"],
    ["Ferries", "12", "15", "11"],
    ["Fishing boats", "40", "38", "44"],
    ["Sailboats", "7", "9", "13"],
];

/// Page 2's table.
const TABLE_2: [[&str; 3]; 3] = [
    ["Inspector", "Passed", "Failed"],
    ["North quay", "31", "2"],
    ["South quay", "27", "5"],
];

const PAGE_W: f64 = 612.0;
const PAGE_H: f64 = 792.0;

/// Content stream for a ruled table whose top-left corner is at (`x`, `top`):
/// the grid as stroked lines, each cell's text inset from its lower-left corner.
fn ruled_table(x: f64, top: f64, widths: &[f64], rows: &[&[&str]]) -> String {
    let row_h = 22.0;
    let total_w: f64 = widths.iter().sum();
    let mut s = String::from("0.5 w\n");
    for r in 0..=rows.len() {
        let y = top - r as f64 * row_h;
        s.push_str(&format!("{x} {y} m {} {y} l S\n", x + total_w));
    }
    let bottom = top - rows.len() as f64 * row_h;
    let mut cx = x;
    for w in widths.iter().chain(std::iter::once(&0.0)) {
        s.push_str(&format!("{cx} {top} m {cx} {bottom} l S\n"));
        cx += w;
    }
    for (r, row) in rows.iter().enumerate() {
        let y = top - (r as f64 + 1.0) * row_h + 7.0;
        let mut cx = x;
        for (c, text) in row.iter().enumerate() {
            let font = if r == 0 { "F2" } else { "F1" };
            s.push_str(&format!(
                "BT /{font} 11 Tf {} {y} Td ({text}) Tj ET\n",
                cx + 5.0
            ));
            cx += widths[c];
        }
    }
    s
}

fn fixture_pages() -> [String; 2] {
    let t1: Vec<&[&str]> = TABLE_1.iter().map(|r| r.as_slice()).collect();
    let t2: Vec<&[&str]> = TABLE_2.iter().map(|r| r.as_slice()).collect();
    let page1 = format!(
        "BT /F2 24 Tf 72 720 Td ({HEADING}) Tj ET\n\
         BT /F1 11 Tf 72 690 Td ({PARA_1}) Tj ET\n{}",
        ruled_table(72.0, 660.0, &[150.0, 90.0, 90.0, 90.0], &t1)
    );
    let page2 = format!(
        "BT /F1 11 Tf 72 720 Td ({PARA_2}) Tj ET\n{}",
        ruled_table(72.0, 690.0, &[150.0, 90.0, 90.0], &t2)
    );
    [page1, page2]
}

/// The fixture as PDF bytes: two Letter pages, Helvetica and Helvetica-Bold.
fn fixture_pdf() -> Vec<u8> {
    use lopdf::{dictionary, Document, Object, Stream};

    let mut doc = Document::with_version("1.7");
    let regular = doc.add_object(Object::Dictionary(dictionary! {
        "Type" => "Font", "Subtype" => "Type1", "BaseFont" => "Helvetica",
        "Encoding" => "WinAnsiEncoding",
    }));
    let bold = doc.add_object(Object::Dictionary(dictionary! {
        "Type" => "Font", "Subtype" => "Type1", "BaseFont" => "Helvetica-Bold",
        "Encoding" => "WinAnsiEncoding",
    }));
    let resources = doc.add_object(Object::Dictionary(dictionary! {
        "Font" => dictionary! {
            "F1" => Object::Reference(regular),
            "F2" => Object::Reference(bold),
        },
    }));
    let pages_id = doc.new_object_id();
    let mut kids = Vec::new();
    for content in fixture_pages() {
        let content_id = doc.add_object(Stream::new(dictionary! {}, content.into_bytes()));
        let page = doc.add_object(Object::Dictionary(dictionary! {
            "Type" => "Page",
            "Parent" => Object::Reference(pages_id),
            "Contents" => Object::Reference(content_id),
            "Resources" => Object::Reference(resources),
            "MediaBox" => vec![0.into(), 0.into(), PAGE_W.into(), PAGE_H.into()],
        }));
        kids.push(Object::Reference(page));
    }
    let count = kids.len() as i64;
    doc.objects.insert(
        pages_id,
        Object::Dictionary(dictionary! { "Type" => "Pages", "Kids" => kids, "Count" => count }),
    );
    let catalog = doc.add_object(Object::Dictionary(dictionary! {
        "Type" => "Catalog", "Pages" => Object::Reference(pages_id),
    }));
    doc.trailer.set("Root", Object::Reference(catalog));
    let mut bytes = Vec::new();
    doc.save_to(&mut bytes).expect("serialize the fixture");
    bytes
}

fn open_fixture() -> OpenDocument {
    OpenDocument::open_bytes(fixture_pdf()).expect("open the fixture")
}

/// A fresh output path per test and per run, so parallel tests never share one.
fn out_path(name: &str) -> PathBuf {
    let dir = std::env::temp_dir().join("pdfluent_exports_keep_their_content");
    std::fs::create_dir_all(&dir).expect("create the output dir");
    let nanos = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_nanos())
        .unwrap_or(0);
    dir.join(format!("{}-{nanos}-{name}", std::process::id()))
}

// ── OOXML reading ───────────────────────────────────────────────────────

fn zip_entries(path: &PathBuf) -> BTreeMap<String, String> {
    let file = std::fs::File::open(path).expect("open the export");
    let mut archive = zip::ZipArchive::new(file).expect("the export is a zip archive");
    let mut out = BTreeMap::new();
    for i in 0..archive.len() {
        let mut entry = archive.by_index(i).expect("read a zip entry");
        let name = entry.name().to_string();
        if name.ends_with(".xml") || name.ends_with(".rels") {
            let mut s = String::new();
            entry.read_to_string(&mut s).expect("entry is UTF-8 XML");
            out.insert(name, s);
        }
    }
    out
}

fn unescape(s: &str) -> String {
    s.replace("&lt;", "<")
        .replace("&gt;", ">")
        .replace("&quot;", "\"")
        .replace("&apos;", "'")
        .replace("&amp;", "&")
}

/// The inner XML of every `<tag ...>...</tag>` in `xml`, in document order.
/// Matches the tag exactly: `w:tc` does not match `w:tcPr`. A self-closing
/// `<tag/>` yields an empty string.
fn elements<'a>(xml: &'a str, tag: &str) -> Vec<&'a str> {
    let open = format!("<{tag}");
    let close = format!("</{tag}>");
    let mut out = Vec::new();
    let mut from = 0;
    while let Some(pos) = xml[from..].find(&open) {
        let start = from + pos;
        let after = start + open.len();
        let next = xml[after..].chars().next();
        if !matches!(next, Some('>') | Some(' ') | Some('/')) {
            from = after;
            continue;
        }
        let Some(gt) = xml[after..].find('>') else {
            break;
        };
        let head_end = after + gt;
        if xml[..head_end].ends_with('/') {
            out.push("");
            from = head_end + 1;
            continue;
        }
        let Some(end) = xml[head_end..].find(&close) else {
            break;
        };
        out.push(&xml[head_end + 1..head_end + end]);
        from = head_end + end + close.len();
    }
    out
}

/// The text of every `<t_tag>` in `xml`, concatenated.
fn text_of(xml: &str, t_tag: &str) -> String {
    elements(xml, t_tag).into_iter().map(unescape).collect()
}

fn attr<'a>(element_head: &'a str, name: &str) -> Option<&'a str> {
    let key = format!(" {name}=\"");
    let start = element_head.find(&key)? + key.len();
    let len = element_head[start..].find('"')?;
    Some(&element_head[start..start + len])
}

/// The cells of one worksheet as `cell reference -> text`, shared strings,
/// inline strings and numbers resolved.
fn sheet_cells(sheet_xml: &str, shared: &[String]) -> BTreeMap<String, String> {
    let mut out = BTreeMap::new();
    let mut from = 0;
    while let Some(pos) = sheet_xml[from..].find("<c ") {
        let start = from + pos;
        let head_end = start + sheet_xml[start..].find('>').expect("cell head ends");
        let head = &sheet_xml[start..head_end];
        let reference = attr(head, "r").expect("cell has a reference").to_string();
        if head.ends_with('/') {
            from = head_end + 1;
            continue;
        }
        let end = head_end + sheet_xml[head_end..].find("</c>").expect("cell closes");
        let body = &sheet_xml[head_end + 1..end];
        let value = match attr(head, "t") {
            Some("s") => {
                let idx: usize = text_of(body, "v").parse().expect("shared string index");
                shared[idx].clone()
            }
            Some("inlineStr") => text_of(body, "t"),
            _ => text_of(body, "v"),
        };
        out.insert(reference, value);
        from = end + 4;
    }
    out
}

fn shared_strings(entries: &BTreeMap<String, String>) -> Vec<String> {
    entries
        .get("xl/sharedStrings.xml")
        .map(|xml| {
            elements(xml, "si")
                .into_iter()
                .map(|si| text_of(si, "t"))
                .collect()
        })
        .unwrap_or_default()
}

/// Every worksheet of a workbook, in workbook order, as its name and cells.
fn workbook_sheets(path: &PathBuf) -> Vec<(String, BTreeMap<String, String>)> {
    let entries = zip_entries(path);
    let shared = shared_strings(&entries);
    let workbook = entries.get("xl/workbook.xml").expect("xl/workbook.xml");
    let rels = entries
        .get("xl/_rels/workbook.xml.rels")
        .expect("xl/_rels/workbook.xml.rels");
    let mut targets = BTreeMap::new();
    let mut from = 0;
    while let Some(pos) = rels[from..].find("<Relationship ") {
        let start = from + pos;
        let end = start + rels[start..].find('>').expect("relationship ends");
        let head = &rels[start..end];
        if let (Some(id), Some(target)) = (attr(head, "Id"), attr(head, "Target")) {
            targets.insert(id.to_string(), target.trim_start_matches('/').to_string());
        }
        from = end;
    }
    let mut sheets = Vec::new();
    let mut from = 0;
    while let Some(pos) = workbook[from..].find("<sheet ") {
        let start = from + pos;
        let end = start + workbook[start..].find('>').expect("sheet ends");
        let head = &workbook[start..end];
        let name = unescape(attr(head, "name").expect("sheet name"));
        let rid = attr(head, "r:id").expect("sheet r:id");
        let target = &targets[rid];
        let part = if target.starts_with("xl/") {
            target.clone()
        } else {
            format!("xl/{target}")
        };
        let xml = entries
            .get(&part)
            .unwrap_or_else(|| panic!("worksheet part {part}"));
        sheets.push((name, sheet_cells(xml, &shared)));
        from = end;
    }
    sheets
}

fn squash(s: &str) -> String {
    s.split_whitespace().collect::<Vec<_>>().join(" ")
}

/// Find the cell holding `text` and return its (column letters, row number).
fn locate(cells: &BTreeMap<String, String>, text: &str) -> Option<(String, u32)> {
    cells.iter().find(|(_, v)| squash(v) == text).map(|(r, _)| {
        let col: String = r.chars().take_while(|c| c.is_ascii_alphabetic()).collect();
        let row: u32 = r[col.len()..].parse().expect("row number");
        (col, row)
    })
}

fn next_col(col: &str) -> String {
    // Single-letter columns are enough for these fixtures.
    let c = col.as_bytes()[0];
    assert!(
        col.len() == 1 && c < b'Z',
        "fixture columns stay within A..Y"
    );
    ((c + 1) as char).to_string()
}

/// The fixture's table rows are in the sheet as rows of separate cells: the
/// row label in one cell and each count in the next cells to its right.
fn assert_rows_in_separate_cells(cells: &BTreeMap<String, String>, rows: &[&[&str]], what: &str) {
    for row in rows {
        let (col, r) = locate(cells, row[0]).unwrap_or_else(|| {
            panic!(
                "{what}: no cell holds exactly {:?}; cells: {cells:?}",
                row[0]
            )
        });
        let mut c = col;
        for value in &row[1..] {
            c = next_col(&c);
            let got = cells.get(&format!("{c}{r}")).map(|v| squash(v));
            assert_eq!(
                got.as_deref(),
                Some(*value),
                "{what}: row {:?} — cell {c}{r} should hold {value:?}; cells: {cells:?}",
                row[0]
            );
        }
    }
}

// ── DOCX ────────────────────────────────────────────────────────────────

struct DocxBody {
    /// The text of every top-level-or-nested `w:p`, whitespace squashed.
    paragraphs: Vec<String>,
    /// Each `w:tbl` as its rows, each row as its cells' text.
    tables: Vec<Vec<Vec<String>>>,
    page_breaks: usize,
}

fn docx_body(path: &PathBuf) -> DocxBody {
    let entries = zip_entries(path);
    let body = entries
        .get("word/document.xml")
        .expect("word/document.xml")
        .clone();
    DocxBody {
        paragraphs: elements(&body, "w:p")
            .into_iter()
            .map(|p| squash(&text_of(p, "w:t")))
            .collect(),
        tables: elements(&body, "w:tbl")
            .into_iter()
            .map(|tbl| {
                elements(tbl, "w:tr")
                    .into_iter()
                    .map(|tr| {
                        elements(tr, "w:tc")
                            .into_iter()
                            .map(|tc| squash(&text_of(tc, "w:t")))
                            .collect()
                    })
                    .collect()
            })
            .collect(),
        page_breaks: body.matches("<w:br w:type=\"page\"/>").count(),
    }
}

fn export_fixture_docx() -> DocxBody {
    let doc = open_fixture();
    let out = out_path("survey.docx");
    convert_doc_to_docx(&doc.clone_lopdf(), out.to_str().expect("utf8")).expect("DOCX export");
    docx_body(&out)
}

#[test]
fn docx_keeps_every_word_page_breaks_and_whole_word_cells() {
    let body = export_fixture_docx();
    let all = body.paragraphs.join("\n");
    for needle in [HEADING, PARA_1, PARA_2] {
        assert!(
            all.contains(needle),
            "DOCX lost {needle:?}; text was:\n{all}"
        );
    }
    // Every table value, row by row, in reading order: whether the converter
    // writes a row as a table row or as a line, its words are all there.
    let words = squash(&all);
    for row in TABLE_1
        .iter()
        .map(|r| r.join(" "))
        .chain(TABLE_2.iter().map(|r| r.join(" ")))
    {
        let in_text = words.contains(&row);
        let in_table = body
            .tables
            .iter()
            .flatten()
            .any(|cells| squash(&cells.join(" ")) == row);
        assert!(
            in_text || in_table,
            "DOCX lost table row {row:?}; text:\n{all}"
        );
    }
    assert_eq!(
        body.page_breaks, 1,
        "DOCX: one page break between the fixture's two pages"
    );

    // #408: a cell per glyph. Every cell the converter does write holds the
    // whole cell text of the source, never a fragment of it.
    let source_cells: Vec<&str> = TABLE_1
        .iter()
        .flatten()
        .chain(TABLE_2.iter().flatten())
        .copied()
        .collect();
    let cells: Vec<&String> = body
        .tables
        .iter()
        .flatten()
        .flatten()
        .filter(|c| !c.is_empty())
        .collect();
    assert!(
        !cells.is_empty(),
        "DOCX has no table at all; the fixture draws two ruled tables"
    );
    for label in ["Inspector", "North quay", "South quay"] {
        assert!(
            cells.iter().any(|c| c.as_str() == label),
            "DOCX: no cell holds exactly {label:?}; cells: {cells:?}"
        );
    }
    for cell in &cells {
        let whole = source_cells.contains(&cell.as_str());
        assert!(
            whole,
            "DOCX: cell {cell:?} is a fragment of a source cell (#408); cells: {cells:?}"
        );
    }
}

/// The DOCX converter's table detection at the pinned SDK (1.2.0). Three gaps
/// of SDK 1.1.x are closed, and this holds the better answer so it cannot slip
/// back unnoticed:
///
/// 1. both ruled tables are recognised, whole, with their rows as rows;
/// 2. the paragraph above the page-2 table stays a paragraph, outside the table;
/// 3. the heading and the paragraph under it are two paragraphs.
#[test]
fn docx_detects_both_tables_and_keeps_headings_apart() {
    let body = export_fixture_docx();
    assert_eq!(body.tables.len(), 2, "both ruled tables are tables; got {:?}", body.tables);
    let as_rows = |t: &Vec<Vec<String>>| -> Vec<Vec<String>> { t.clone() };
    let want_1: Vec<Vec<String>> = TABLE_1.iter().map(|r| r.iter().map(|c| c.to_string()).collect()).collect();
    let want_2: Vec<Vec<String>> = TABLE_2.iter().map(|r| r.iter().map(|c| c.to_string()).collect()).collect();
    assert_eq!(as_rows(&body.tables[0]), want_1, "the page-1 table lost or merged cells");
    assert_eq!(as_rows(&body.tables[1]), want_2, "the page-2 table lost or merged cells");
    assert!(
        body.paragraphs.iter().any(|p| p == PARA_2),
        "the paragraph above the page-2 table is a paragraph of its own; paragraphs: {:?}",
        body.paragraphs
    );
    assert!(
        body.paragraphs.iter().any(|p| p == HEADING) && body.paragraphs.iter().any(|p| p == PARA_1),
        "heading and first paragraph are separate paragraphs; paragraphs: {:?}",
        body.paragraphs
    );
}

// ── XLSX (Excel export) ─────────────────────────────────────────────────

#[test]
fn xlsx_puts_table_values_in_separate_cells() {
    let doc = open_fixture();
    let out = out_path("survey.xlsx");
    convert_doc_to_xlsx(&doc.clone_lopdf(), out.to_str().expect("utf8")).expect("XLSX export");

    let sheets = workbook_sheets(&out);
    assert!(!sheets.is_empty(), "XLSX has no worksheet");
    let mut merged = BTreeMap::new();
    for (name, cells) in &sheets {
        for (r, v) in cells {
            merged.insert(format!("{name}!{r}"), v.clone());
        }
    }
    // Each table must land whole on one sheet, so look for it per sheet.
    let t1: Vec<&[&str]> = TABLE_1[1..].iter().map(|r| r.as_slice()).collect();
    let t2: Vec<&[&str]> = TABLE_2[1..].iter().map(|r| r.as_slice()).collect();
    let sheet_with = |label: &str| {
        sheets
            .iter()
            .find(|(_, cells)| locate(cells, label).is_some())
            .map(|(_, cells)| cells)
            .unwrap_or_else(|| panic!("XLSX: no sheet holds {label:?}; cells: {merged:?}"))
    };
    assert_rows_in_separate_cells(sheet_with("Fishing boats"), &t1, "XLSX table 1");
    assert_rows_in_separate_cells(sheet_with("North quay"), &t2, "XLSX table 2");
}

// ── PPTX ────────────────────────────────────────────────────────────────

#[test]
fn pptx_has_one_slide_per_page_with_that_page_text() {
    let doc = open_fixture();
    let pages = doc.document_info().page_count as usize;
    assert_eq!(pages, 2);
    let out = out_path("survey.pptx");
    convert_doc_to_pptx(&doc.clone_lopdf(), out.to_str().expect("utf8")).expect("PPTX export");

    let entries = zip_entries(&out);
    let mut slides: Vec<(usize, &String)> = entries
        .iter()
        .filter_map(|(name, xml)| {
            let n = name
                .strip_prefix("ppt/slides/slide")?
                .strip_suffix(".xml")?
                .parse()
                .ok()?;
            Some((n, xml))
        })
        .collect();
    slides.sort_by_key(|(n, _)| *n);
    assert_eq!(slides.len(), pages, "PPTX slide count != PDF page count");

    let slide_text: Vec<String> = slides
        .iter()
        .map(|(_, xml)| squash(&text_of(xml, "a:t")))
        .collect();
    for needle in [HEADING, PARA_1, "Fishing boats"] {
        assert!(
            slide_text[0].contains(needle),
            "slide 1 lost {needle:?}; text: {}",
            slide_text[0]
        );
    }
    for needle in [PARA_2, "North quay"] {
        assert!(
            slide_text[1].contains(needle),
            "slide 2 lost {needle:?}; text: {}",
            slide_text[1]
        );
    }
    assert!(
        !slide_text[1].contains(HEADING),
        "slide 2 carries page 1's heading: pages were not split per slide"
    );
}

// ── Page to image ───────────────────────────────────────────────────────

/// What `export_page_as_image` renders at: 150 dpi over the PDF's 72.
const EXPORT_SCALE: f64 = 150.0 / 72.0;

fn assert_page_image(path: &PathBuf, what: &str) {
    let img = image::open(path)
        .unwrap_or_else(|e| panic!("{what}: decode failed: {e}"))
        .to_luma8();
    let (w, h) = img.dimensions();
    let ew = (PAGE_W * EXPORT_SCALE).round() as i64;
    let eh = (PAGE_H * EXPORT_SCALE).round() as i64;
    assert!(
        (w as i64 - ew).abs() <= 1 && (h as i64 - eh).abs() <= 1,
        "{what}: {w}x{h}, expected {ew}x{eh} (page size x 150/72)"
    );

    let n = (w as f64) * (h as f64);
    let mean = img.pixels().map(|p| p.0[0] as f64).sum::<f64>() / n;
    let var = img
        .pixels()
        .map(|p| (p.0[0] as f64 - mean).powi(2))
        .sum::<f64>()
        / n;
    let dark = img.pixels().filter(|p| p.0[0] < 128).count() as f64 / n;
    assert!(
        var > 20.0,
        "{what}: pixel variance {var:.1}: the page rendered blank"
    );
    assert!(
        dark > 0.002 && dark < 0.5,
        "{what}: {:.3}% dark pixels; text and rules should be a small, non-zero share",
        dark * 100.0
    );

    // The heading is drawn at y=720..744 from the bottom, x from 72: its band
    // must have ink, and the bottom margin, where nothing is drawn, must not.
    let band = |y0: f64, y1: f64| {
        let top = ((PAGE_H - y1) * EXPORT_SCALE) as u32;
        let bottom = ((PAGE_H - y0) * EXPORT_SCALE) as u32;
        let mut dark = 0u32;
        for y in top..bottom.min(h) {
            for x in 0..w {
                if img.get_pixel(x, y).0[0] < 128 {
                    dark += 1;
                }
            }
        }
        dark
    };
    assert!(
        band(718.0, 746.0) > 200,
        "{what}: no ink where the heading is drawn"
    );
    assert_eq!(
        band(10.0, 60.0),
        0,
        "{what}: ink in the empty bottom margin"
    );
}

#[test]
fn page_image_png_has_page_dimensions_and_is_not_blank() {
    let doc = open_fixture();
    let out = out_path("page1.png");
    doc.export_page_as_image(0, "png", out.to_str().expect("utf8"))
        .expect("PNG export");
    assert_eq!(&std::fs::read(&out).expect("read")[..4], b"\x89PNG");
    assert_page_image(&out, "PNG");
}

#[test]
fn page_image_jpeg_has_page_dimensions_and_is_not_blank() {
    let doc = open_fixture();
    let out = out_path("page1.jpg");
    doc.export_page_as_image(0, "jpeg", out.to_str().expect("utf8"))
        .expect("JPEG export");
    assert_eq!(&std::fs::read(&out).expect("read")[..2], b"\xFF\xD8");
    assert_page_image(&out, "JPEG");
}

#[test]
fn page_image_of_page_two_is_page_two() {
    let doc = open_fixture();
    let first = out_path("p1.png");
    let second = out_path("p2.png");
    doc.export_page_as_image(0, "png", first.to_str().expect("utf8"))
        .expect("page 1");
    doc.export_page_as_image(1, "png", second.to_str().expect("utf8"))
        .expect("page 2");
    let a = image::open(&first).expect("decode 1").to_luma8();
    let b = image::open(&second).expect("decode 2").to_luma8();
    assert_ne!(
        a.as_raw(),
        b.as_raw(),
        "page 2 rendered the same pixels as page 1"
    );
}

// ── PDF/A ───────────────────────────────────────────────────────────────

#[test]
fn pdfa_reopens_with_the_source_text_on_every_page() {
    let doc = open_fixture();
    let pages = doc.document_info().page_count;
    let out = out_path("survey-pdfa.pdf");
    doc.convert_to_pdfa("2b", out.to_str().expect("utf8"))
        .expect("PDF/A export");

    let reopened = OpenDocument::open(out.to_str().expect("utf8")).expect("PDF/A reopens");
    assert_eq!(
        reopened.document_info().page_count,
        pages,
        "PDF/A page count"
    );
    for page in 0..pages {
        let source = squash(&doc.extract_page_text(page).expect("source text"));
        let converted = squash(&reopened.extract_page_text(page).expect("PDF/A text"));
        assert!(!source.is_empty(), "fixture page {page} has no text");
        assert_eq!(
            converted, source,
            "PDF/A text of page {page} differs from the source"
        );
    }
    let page1 = squash(&reopened.extract_page_text(0).expect("text"));
    assert!(
        page1.contains(HEADING) && page1.contains("Fishing boats"),
        "page 1: {page1}"
    );
}

// ── Markdown (Preview) ──────────────────────────────────────────────────

#[test]
fn markdown_has_the_heading_the_paragraphs_and_a_pipe_table() {
    let doc = open_fixture();
    let out = out_path("survey.md");
    export_doc_as_markdown(doc.clone_lopdf(), out.to_str().expect("utf8"))
        .expect("Markdown export");
    let md = std::fs::read_to_string(&out).expect("read the Markdown");

    let heading_line = md
        .lines()
        .find(|l| l.contains(HEADING))
        .unwrap_or_else(|| panic!("Markdown lost the heading; got:\n{md}"));
    assert!(
        heading_line.trim_start().starts_with('#'),
        "the heading is not a Markdown heading: {heading_line:?}\n{md}"
    );
    for needle in [PARA_1, PARA_2] {
        assert!(
            squash(&md).contains(needle),
            "Markdown lost {needle:?}; got:\n{md}"
        );
    }

    // A pipe table row per data row, each value in its own column.
    let rows: Vec<Vec<String>> = md
        .lines()
        .filter(|l| l.trim_start().starts_with('|'))
        .map(|l| l.trim().trim_matches('|').split('|').map(squash).collect())
        .collect();
    for expected in TABLE_1
        .iter()
        .map(|r| r.as_slice())
        .chain(TABLE_2.iter().map(|r| r.as_slice()))
    {
        assert!(
            rows.iter().any(|r| r == expected),
            "Markdown has no pipe row {expected:?}; rows: {rows:?}\n{md}"
        );
    }
}

// ── Tables to Excel (Preview) ───────────────────────────────────────────

#[test]
fn tables_workbook_has_one_sheet_per_table_with_its_cells() {
    let doc = open_fixture();
    let out = out_path("tables.xlsx");
    let written = export_doc_tables_to_xlsx(doc.clone_lopdf(), out.to_str().expect("utf8"))
        .expect("tables export");
    assert_eq!(written, 2, "the fixture has two tables");

    let sheets = workbook_sheets(&out);
    assert_eq!(
        sheets.len(),
        2,
        "one sheet per table; got {:?}",
        sheets.iter().map(|s| &s.0).collect::<Vec<_>>()
    );
    assert_eq!(sheets[0].0, "Table 1 (p1)");
    assert_eq!(sheets[1].0, "Table 2 (p2)");

    let expect = |cells: &BTreeMap<String, String>, table: &[&[&str]]| {
        let cols = ["A", "B", "C", "D"];
        for (r, row) in table.iter().enumerate() {
            for (c, value) in row.iter().enumerate() {
                let reference = format!("{}{}", cols[c], r + 1);
                assert_eq!(
                    cells.get(&reference).map(|v| squash(v)).as_deref(),
                    Some(*value),
                    "cell {reference}; sheet: {cells:?}"
                );
            }
        }
        assert_eq!(
            cells.len(),
            table.iter().map(|r| r.len()).sum::<usize>(),
            "extra cells on the sheet: {cells:?}"
        );
    };
    let t1: Vec<&[&str]> = TABLE_1.iter().map(|r| r.as_slice()).collect();
    let t2: Vec<&[&str]> = TABLE_2.iter().map(|r| r.as_slice()).collect();
    expect(&sheets[0].1, &t1);
    expect(&sheets[1].1, &t2);
}

#[test]
fn tables_export_refuses_a_document_without_tables() {
    use lopdf::{dictionary, Document, Object, Stream};
    let mut d = Document::with_version("1.7");
    let font = d.add_object(Object::Dictionary(dictionary! {
        "Type" => "Font", "Subtype" => "Type1", "BaseFont" => "Helvetica",
    }));
    let pages_id = d.new_object_id();
    let content = d.add_object(Stream::new(
        dictionary! {},
        b"BT /F1 12 Tf 72 720 Td (Just one line of prose, no table.) Tj ET".to_vec(),
    ));
    let page = d.add_object(Object::Dictionary(dictionary! {
        "Type" => "Page", "Parent" => Object::Reference(pages_id),
        "Contents" => Object::Reference(content),
        "Resources" => dictionary! { "Font" => dictionary! { "F1" => Object::Reference(font) } },
        "MediaBox" => vec![0.into(), 0.into(), 612.into(), 792.into()],
    }));
    d.objects.insert(
        pages_id,
        Object::Dictionary(dictionary! {
            "Type" => "Pages", "Kids" => vec![Object::Reference(page)], "Count" => 1,
        }),
    );
    let catalog = d.add_object(Object::Dictionary(dictionary! {
        "Type" => "Catalog", "Pages" => Object::Reference(pages_id),
    }));
    d.trailer.set("Root", Object::Reference(catalog));

    let out = out_path("none.xlsx");
    let err = export_doc_tables_to_xlsx(d, out.to_str().expect("utf8")).expect_err("no tables");
    assert_eq!(err, pdfluent_lib::NO_TABLES_FOUND);
    assert!(!out.exists(), "a refused export left a file behind");
}
