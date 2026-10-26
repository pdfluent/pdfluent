// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary. The PDFluent application is free to use,
// including for commercial purposes. Redistribution, or extraction or reuse
// of its components (including the embedded PDF engine), requires a licence.
// See https://pdfluent.com/license for terms.

//! J-56: every AcroForm field type can be filled, saved and reopened, and
//! the saved file shows the value in other viewers.
//!
//! J-58: a filled AcroForm can be flattened: after flatten, save and reopen
//! there are no fields left and the values are part of the page content.
//!
//! The fixture `tests/fixtures/every_field_type.pdf` is built by
//! `build_fixture` below; `committed_fixture_is_what_the_generator_builds`
//! keeps the file and the generator in step. Regenerate it with
//! `PDFLUENT_REGENERATE_FIXTURES=1 cargo test --test acroform_every_field_type`.
//!
//! Runs in the `cargo-test` job on Linux, macOS and Windows.

use lopdf::{dictionary, Dictionary, Document, Object, ObjectId, Stream, StringFormat};
use pdfluent_lib::{FormFieldKindDto, FormFieldModelDto, FormWriteRequest, OpenDocument};
use std::fs;
use std::path::{Path, PathBuf};

const FIXTURE: &str = "tests/fixtures/every_field_type.pdf";

fn manifest(rel: &str) -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR")).join(rel)
}

fn scratch(name: &str) -> PathBuf {
    let dir = std::env::temp_dir().join(format!("pdfluent-forms-{}", std::process::id()));
    fs::create_dir_all(&dir).expect("scratch dir");
    dir.join(name)
}

fn path_str(p: &Path) -> &str {
    p.to_str().expect("utf-8 path")
}

fn s(text: &str) -> Object {
    Object::String(text.as_bytes().to_vec(), StringFormat::Literal)
}

fn rect(x0: i64, y0: i64, x1: i64, y1: i64) -> Object {
    Object::Array(vec![x0.into(), y0.into(), x1.into(), y1.into()])
}

/// An appearance stream of `w` x `h` points.
fn ap_stream(doc: &mut Document, w: i64, h: i64, content: &str) -> ObjectId {
    doc.add_object(Stream::new(
        dictionary! {
            "Type" => "XObject",
            "Subtype" => "Form",
            "BBox" => rect(0, 0, w, h),
        },
        content.as_bytes().to_vec(),
    ))
}

/// One page with one field of every AcroForm type, all empty. Button widgets
/// carry their own on/off appearances, as every authoring tool writes them.
pub fn build_fixture() -> Vec<u8> {
    let mut doc = Document::with_version("1.7");
    let pages_id = doc.new_object_id();
    let page_id = doc.new_object_id();
    let helv = doc.add_object(dictionary! {
        "Type" => "Font",
        "Subtype" => "Type1",
        "BaseFont" => "Helvetica",
        "Encoding" => "WinAnsiEncoding",
    });
    let zadb = doc.add_object(dictionary! {
        "Type" => "Font",
        "Subtype" => "Type1",
        "BaseFont" => "ZapfDingbats",
    });
    let content = doc.add_object(Stream::new(
        dictionary! {},
        b"BT /Helv 14 Tf 72 760 Td (Every field type) Tj ET".to_vec(),
    ));

    let da = s("/Helv 0 Tf 0 g");
    let mut fields: Vec<Object> = Vec::new();
    let mut annots: Vec<Object> = Vec::new();
    // A field that is its own widget: listed in the form and on the page.
    fn add_field(doc: &mut Document, fields: &mut Vec<Object>, annots: &mut Vec<Object>, dict: Dictionary) {
        let id = doc.add_object(dict);
        fields.push(Object::Reference(id));
        annots.push(Object::Reference(id));
    }

    // Single-line text.
    add_field(&mut doc, &mut fields, &mut annots, dictionary! {
        "Type" => "Annot", "Subtype" => "Widget", "FT" => "Tx", "T" => s("name"),
        "Rect" => rect(72, 700, 300, 720), "P" => page_id, "DA" => da.clone(), "F" => 4,
    });
    // Multiline text (Ff bit 13).
    add_field(&mut doc, &mut fields, &mut annots, dictionary! {
        "Type" => "Annot", "Subtype" => "Widget", "FT" => "Tx", "T" => s("notes"),
        "Ff" => 4096, "Rect" => rect(72, 620, 300, 690), "P" => page_id, "DA" => da.clone(), "F" => 4,
    });
    // Checkbox.
    let on = ap_stream(&mut doc, 14, 14, "q BT 0 g /ZaDb 12 Tf 1 2 Td (4) Tj ET Q");
    let off = ap_stream(&mut doc, 14, 14, "");
    add_field(&mut doc, &mut fields, &mut annots, dictionary! {
        "Type" => "Annot", "Subtype" => "Widget", "FT" => "Btn", "T" => s("agree"),
        "Rect" => rect(72, 590, 86, 604), "P" => page_id, "F" => 4,
        "DA" => s("/ZaDb 0 Tf 0 g"), "V" => "Off", "AS" => "Off",
        "AP" => dictionary! { "N" => dictionary! { "Yes" => on, "Off" => off } },
    });
    // Radio group (Ff radio + NoToggleToOff) with two options.
    let radio_id = doc.new_object_id();
    let mut kids = Vec::new();
    for (i, state) in ["red", "blue"].iter().enumerate() {
        let x = 72 + 40 * i as i64;
        let on = ap_stream(&mut doc, 14, 14, "q BT 0 g /ZaDb 12 Tf 1 2 Td (l) Tj ET Q");
        let off = ap_stream(&mut doc, 14, 14, "");
        let mut normal = Dictionary::new();
        normal.set(state.as_bytes().to_vec(), on);
        normal.set("Off", off);
        let kid = doc.add_object(dictionary! {
            "Type" => "Annot", "Subtype" => "Widget", "Parent" => radio_id,
            "Rect" => rect(x, 560, x + 14, 574), "P" => page_id, "F" => 4,
            "AS" => "Off", "AP" => dictionary! { "N" => normal },
        });
        kids.push(Object::Reference(kid));
        annots.push(Object::Reference(kid));
    }
    doc.objects.insert(
        radio_id,
        Object::Dictionary(dictionary! {
            "FT" => "Btn", "T" => s("color"), "Ff" => 49152, "V" => "Off",
            "DA" => s("/ZaDb 0 Tf 0 g"), "Kids" => kids,
        }),
    );
    fields.push(Object::Reference(radio_id));
    // Combo box (Ff bit 18).
    add_field(&mut doc, &mut fields, &mut annots, dictionary! {
        "Type" => "Annot", "Subtype" => "Widget", "FT" => "Ch", "T" => s("country"),
        "Ff" => 131072, "Opt" => vec![s("Netherlands"), s("Belgium"), s("Germany")],
        "Rect" => rect(72, 520, 250, 540), "P" => page_id, "DA" => da.clone(), "F" => 4,
    });
    // List box, single selection.
    add_field(&mut doc, &mut fields, &mut annots, dictionary! {
        "Type" => "Annot", "Subtype" => "Widget", "FT" => "Ch", "T" => s("size"),
        "Opt" => vec![s("Small"), s("Medium"), s("Large")],
        "Rect" => rect(72, 440, 250, 500), "P" => page_id, "DA" => da.clone(), "F" => 4,
    });
    // List box, multiple selection (Ff bit 22).
    add_field(&mut doc, &mut fields, &mut annots, dictionary! {
        "Type" => "Annot", "Subtype" => "Widget", "FT" => "Ch", "T" => s("toppings"),
        "Ff" => 2097152, "Opt" => vec![s("Cheese"), s("Ham"), s("Olives")],
        "Rect" => rect(72, 360, 250, 420), "P" => page_id, "DA" => da.clone(), "F" => 4,
    });

    doc.objects.insert(
        page_id,
        Object::Dictionary(dictionary! {
            "Type" => "Page", "Parent" => pages_id,
            "MediaBox" => rect(0, 0, 612, 792),
            "Contents" => content,
            "Resources" => dictionary! { "Font" => dictionary! { "Helv" => helv } },
            "Annots" => annots,
        }),
    );
    doc.objects.insert(
        pages_id,
        Object::Dictionary(dictionary! {
            "Type" => "Pages", "Kids" => vec![Object::Reference(page_id)], "Count" => 1,
        }),
    );
    let acroform = doc.add_object(dictionary! {
        "Fields" => fields,
        "DA" => da,
        "DR" => dictionary! { "Font" => dictionary! { "Helv" => helv, "ZaDb" => zadb } },
    });
    let catalog = doc.add_object(dictionary! {
        "Type" => "Catalog", "Pages" => pages_id, "AcroForm" => acroform,
    });
    doc.trailer.set("Root", catalog);
    let mut out = Vec::new();
    doc.save_to(&mut out).expect("serialise fixture");
    out
}

#[test]
fn committed_fixture_is_what_the_generator_builds() {
    let built = build_fixture();
    let path = manifest(FIXTURE);
    if std::env::var_os("PDFLUENT_REGENERATE_FIXTURES").is_some() {
        fs::write(&path, &built).expect("write fixture");
    }
    let committed = fs::read(&path).expect("read committed fixture");
    assert_eq!(
        committed, built,
        "{FIXTURE} differs from build_fixture(); regenerate it with PDFLUENT_REGENERATE_FIXTURES=1"
    );
}

/// Every write the editor can send, one per field type.
fn fill_all(doc: &mut OpenDocument) {
    let writes = [
        FormWriteRequest::Text { name: "name".into(), value: "Jane Doe".into() },
        FormWriteRequest::Text { name: "notes".into(), value: "Line one\nLine two".into() },
        FormWriteRequest::Checkbox { name: "agree".into(), checked: true },
        FormWriteRequest::Radio { name: "color".into(), export: "blue".into() },
        FormWriteRequest::Choice { name: "country".into(), value: "Belgium".into() },
        FormWriteRequest::Choice { name: "size".into(), value: "Medium".into() },
        FormWriteRequest::MultiChoice {
            name: "toppings".into(),
            values: vec!["Cheese".into(), "Olives".into()],
        },
    ];
    for w in &writes {
        doc.apply_form_value(w).unwrap_or_else(|e| panic!("fill {w:?}: {e}"));
    }
}

fn fill_save_reopen(file: &str) -> (OpenDocument, PathBuf) {
    let mut doc = OpenDocument::open(path_str(&manifest(FIXTURE))).expect("open fixture");
    fill_all(&mut doc);
    let out = scratch(file);
    doc.save_to(path_str(&out)).expect("save");
    (OpenDocument::open(path_str(&out)).expect("reopen"), out)
}

/// The raw saved file, to check what a viewer other than ours reads.
struct Raw(Document);

impl Raw {
    fn load(path: &Path) -> Self {
        Raw(Document::load(path).expect("lopdf load"))
    }

    fn deref<'a>(&'a self, o: &'a Object) -> &'a Object {
        match o {
            Object::Reference(id) => self.0.get_object(*id).expect("dangling ref"),
            other => other,
        }
    }

    fn acroform(&self) -> Option<&Dictionary> {
        let root = self.0.trailer.get(b"Root").ok()?;
        let cat = self.deref(root).as_dict().ok()?;
        self.deref(cat.get(b"AcroForm").ok()?).as_dict().ok()
    }

    fn need_appearances(&self) -> bool {
        self.acroform()
            .and_then(|a| a.get(b"NeedAppearances").ok())
            .and_then(|o| o.as_bool().ok())
            .unwrap_or(false)
    }

    fn field(&self, name: &str) -> &Dictionary {
        let fields = self.acroform().expect("AcroForm").get(b"Fields").expect("Fields");
        for f in self.deref(fields).as_array().expect("Fields array") {
            let d = self.deref(f).as_dict().expect("field dict");
            if matches!(d.get(b"T"), Ok(Object::String(t, _)) if t == name.as_bytes()) {
                return d;
            }
        }
        panic!("no field {name}");
    }

    /// The widget dictionaries of a field: its kids, or the field itself.
    fn widgets<'a>(&'a self, field: &'a Dictionary) -> Vec<&'a Dictionary> {
        match field.get(b"Kids") {
            Ok(kids) => self
                .deref(kids)
                .as_array()
                .expect("Kids")
                .iter()
                .map(|k| self.deref(k).as_dict().expect("kid"))
                .collect(),
            Err(_) => vec![field],
        }
    }

    fn appearance_state(w: &Dictionary) -> Option<Vec<u8>> {
        w.get(b"AS").ok()?.as_name().ok().map(<[u8]>::to_vec)
    }

    /// The decoded normal appearance stream of a widget, when it has one.
    fn normal_appearance(&self, w: &Dictionary) -> Option<Vec<u8>> {
        let ap = self.deref(w.get(b"AP").ok()?).as_dict().ok()?;
        let normal = self.deref(ap.get(b"N").ok()?);
        let stream = match normal {
            Object::Stream(st) => st,
            Object::Dictionary(states) => {
                let state = Self::appearance_state(w)?;
                match self.deref(states.get(&state).ok()?) {
                    Object::Stream(st) => st,
                    _ => return None,
                }
            }
            _ => return None,
        };
        Some(stream.decompressed_content().unwrap_or_else(|_| stream.content.clone()))
    }

    /// A text-ish widget shows `needle`: its own appearance carries it, or the
    /// form asks every viewer to build the appearances from `/V`.
    fn shows_text(&self, name: &str, needle: &str) -> bool {
        let field = self.field(name);
        let w = self.widgets(field)[0];
        let in_ap = self
            .normal_appearance(w)
            .is_some_and(|ap| String::from_utf8_lossy(&ap).contains(needle));
        in_ap || self.need_appearances()
    }
}

fn model_of(doc: &OpenDocument, name: &str) -> FormFieldModelDto {
    doc.get_form_model()
        .into_iter()
        .find(|f| f.name == name)
        .unwrap_or_else(|| panic!("no field {name} in the model"))
}

#[test]
fn text_field_fill_survives_save_and_reopen_with_an_appearance() {
    let (doc, out) = fill_save_reopen("text.pdf");
    assert_eq!(model_of(&doc, "name").value.as_deref(), Some("Jane Doe"));
    let raw = Raw::load(&out);
    let w = raw.widgets(raw.field("name"))[0];
    let ap = raw.normal_appearance(w).expect("the filled text field has a normal appearance");
    assert!(
        String::from_utf8_lossy(&ap).contains("Jane Doe"),
        "the appearance draws the value: {}",
        String::from_utf8_lossy(&ap)
    );
}

#[test]
fn multiline_text_field_fill_survives_save_and_reopen_with_an_appearance() {
    let (doc, out) = fill_save_reopen("multiline.pdf");
    assert_eq!(model_of(&doc, "notes").value.as_deref(), Some("Line one\nLine two"));
    let raw = Raw::load(&out);
    assert!(raw.shows_text("notes", "Line one"), "multiline value has no appearance");
}

#[test]
fn checkbox_fill_survives_save_and_reopen_with_its_on_state() {
    let (doc, out) = fill_save_reopen("checkbox.pdf");
    let m = model_of(&doc, "agree");
    assert!(
        matches!(m.kind, FormFieldKindDto::Checkbox { checked: true, .. }),
        "checkbox reads back checked: {:?}",
        m.kind
    );
    let raw = Raw::load(&out);
    let field = raw.field("agree");
    assert_eq!(field.get(b"V").and_then(Object::as_name).ok(), Some(&b"Yes"[..]));
    assert_eq!(Raw::appearance_state(raw.widgets(field)[0]).as_deref(), Some(&b"Yes"[..]));
}

#[test]
fn radio_group_fill_survives_save_and_reopen_with_one_widget_on() {
    let (doc, out) = fill_save_reopen("radio.pdf");
    assert_eq!(model_of(&doc, "color").value.as_deref(), Some("blue"));
    let raw = Raw::load(&out);
    let field = raw.field("color");
    assert_eq!(field.get(b"V").and_then(Object::as_name).ok(), Some(&b"blue"[..]));
    let states: Vec<_> = raw.widgets(field).into_iter().map(Raw::appearance_state).collect();
    assert_eq!(states, vec![Some(b"Off".to_vec()), Some(b"blue".to_vec())]);
}

#[test]
fn combo_box_fill_survives_save_and_reopen_with_an_appearance() {
    let (doc, out) = fill_save_reopen("combo.pdf");
    assert_eq!(model_of(&doc, "country").value.as_deref(), Some("Belgium"));
    assert!(Raw::load(&out).shows_text("country", "Belgium"), "combo value has no appearance");
}

#[test]
fn list_box_fill_survives_save_and_reopen_with_an_appearance() {
    let (doc, out) = fill_save_reopen("list.pdf");
    assert_eq!(model_of(&doc, "size").value.as_deref(), Some("Medium"));
    assert!(Raw::load(&out).shows_text("size", "Medium"), "list value has no appearance");
}

#[test]
fn multi_select_list_fill_survives_save_and_reopen_with_an_appearance() {
    let (doc, out) = fill_save_reopen("multi.pdf");
    let m = model_of(&doc, "toppings");
    assert_eq!(
        m.selected_values,
        Some(vec!["Cheese".to_string(), "Olives".to_string()]),
        "both selections read back"
    );
    assert!(Raw::load(&out).shows_text("toppings", "Cheese"), "multi-select has no appearance");
}

#[test]
fn flattened_form_has_no_fields_and_keeps_the_values_as_page_text() {
    let mut doc = OpenDocument::open(path_str(&manifest(FIXTURE))).expect("open fixture");
    fill_all(&mut doc);
    let flattened = doc.flatten_acroform().expect("flatten");
    assert!(flattened >= 6, "every filled widget is drawn into the page, got {flattened}");
    let out = scratch("flattened.pdf");
    doc.save_to(path_str(&out)).expect("save");

    let reopened = OpenDocument::open(path_str(&out)).expect("reopen");
    assert!(reopened.get_form_model().is_empty(), "no fields after flatten");
    let raw = Raw::load(&out);
    assert!(raw.acroform().is_none(), "the AcroForm dictionary is gone");
    let page = raw.0.get_pages()[&1];
    let page = raw.0.get_object(page).unwrap().as_dict().unwrap();
    let widgets = page
        .get(b"Annots")
        .ok()
        .map(|a| {
            raw.deref(a)
                .as_array()
                .unwrap()
                .iter()
                .filter(|o| {
                    matches!(raw.deref(o).as_dict().unwrap().get(b"Subtype"), Ok(Object::Name(n)) if n == b"Widget")
                })
                .count()
        })
        .unwrap_or(0);
    assert_eq!(widgets, 0, "no widget annotations are left on the page");

    let text = reopened.extract_page_text(0).expect("extract");
    for value in ["Jane Doe", "Line one", "Belgium"] {
        assert!(text.contains(value), "flattened page text carries {value:?}: {text:?}");
    }
}

#[test]
fn flatten_is_one_undo_step() {
    let mut doc = OpenDocument::open(path_str(&manifest(FIXTURE))).expect("open fixture");
    fill_all(&mut doc);
    doc.edit("flatten-form", |d| d.flatten_acroform().map(|_| ())).expect("flatten");
    assert!(doc.get_form_model().is_empty());
    assert_eq!(doc.history_state().undo_label.as_deref(), Some("flatten-form"));
    assert!(doc.undo().expect("undo"));
    assert_eq!(doc.get_form_model().len(), 7, "undo brings every field back");
    assert_eq!(model_of(&doc, "name").value.as_deref(), Some("Jane Doe"));
    assert_eq!(model_of(&doc, "color").value.as_deref(), Some("blue"));
}

#[test]
fn flatten_refuses_a_document_without_a_form() {
    let mut doc =
        OpenDocument::open(path_str(&manifest("tests/fixtures/two_pages.pdf"))).expect("open");
    let err = doc.flatten_acroform().expect_err("nothing to flatten");
    assert!(err.contains("no form fields"), "{err}");
}
