// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary and confidential.
// Free for personal, non-commercial use.
// Commercial use requires a valid license.
// See https://pdfluent.com/license for terms.

mod licensing;
mod ocr;
mod pdf_engine;

use licensing::LicenseManager;
use ocr::{run_paddle_ocr_command, PaddleOcrRequest, PaddleOcrResponse};
use pdf_engine::{
    AnnotationInfo, CompressResult, DocumentInfo, ExtractedImageInfo, FormFieldInfo, InvoiceData,
    InvoiceValidationResult, OpenDocument, PdfAValidationResult, RedactReport, RenderedPage,
    SearchRedactReport, SetFieldValueRequest, SignatureVerifyResult, TextReplaceResult,
    TextSpanInfo,
};
use std::sync::Mutex;
use tauri::{Emitter, Manager, State};

#[cfg(desktop)]
use tauri::menu::{
    AboutMetadataBuilder, CheckMenuItemBuilder, Menu, MenuItemBuilder, PredefinedMenuItem,
    SubmenuBuilder,
};

struct AppState {
    document: Mutex<Option<OpenDocument>>,
    current_path: Mutex<Option<String>>,
}

impl AppState {
    fn with_document<F, R>(&self, f: F) -> Result<R, String>
    where
        F: FnOnce(&OpenDocument) -> Result<R, String>,
    {
        let guard = self.document.lock().map_err(|e| e.to_string())?;
        let doc = guard.as_ref().ok_or("No PDF file open")?;
        f(doc)
    }

    fn with_document_mut<F, R>(&self, f: F) -> Result<R, String>
    where
        F: FnOnce(&mut OpenDocument) -> Result<R, String>,
    {
        let mut guard = self.document.lock().map_err(|e| e.to_string())?;
        let doc = guard.as_mut().ok_or("No PDF file open")?;
        f(doc)
    }
}

fn sanitize_scale(raw: Option<f32>) -> f32 {
    let value = raw.unwrap_or(2.0);
    if value.is_finite() && value > 0.0 {
        value.clamp(0.1, 8.0)
    } else {
        2.0
    }
}

#[tauri::command]
fn open_pdf(state: State<AppState>, path: String) -> Result<DocumentInfo, String> {
    let doc = OpenDocument::open(&path)?;
    let info = doc.document_info();

    let mut current_path = state.current_path.lock().map_err(|e| e.to_string())?;
    *current_path = Some(path);

    let mut document = state.document.lock().map_err(|e| e.to_string())?;
    *document = Some(doc);

    Ok(info)
}

#[tauri::command]
fn close_pdf(state: State<AppState>) -> Result<(), String> {
    let mut document = state.document.lock().map_err(|e| e.to_string())?;
    *document = None;
    let mut current_path = state.current_path.lock().map_err(|e| e.to_string())?;
    *current_path = None;
    Ok(())
}

#[tauri::command]
fn get_document_info(state: State<AppState>) -> Result<DocumentInfo, String> {
    state.with_document(|doc| Ok(doc.document_info()))
}

#[tauri::command]
fn render_page(
    state: State<AppState>,
    page_index: u32,
    scale: Option<f32>,
) -> Result<RenderedPage, String> {
    let safe_scale = sanitize_scale(scale);
    state.with_document(|doc| doc.render_page(page_index, safe_scale))
}

#[tauri::command]
fn render_thumbnail(state: State<AppState>, page_index: u32) -> Result<RenderedPage, String> {
    state.with_document(|doc| doc.render_thumbnail(page_index))
}

#[tauri::command]
fn extract_page_text(state: State<AppState>, page_index: u32) -> Result<String, String> {
    state.with_document(|doc| doc.extract_page_text(page_index))
}

#[tauri::command]
fn get_page_text_spans(
    state: State<AppState>,
    page_index: u32,
) -> Result<Vec<TextSpanInfo>, String> {
    state.with_document(|doc| doc.extract_page_text_spans(page_index))
}

/// Return annotations for a single page (if page_index is Some) or all pages (if None).
/// page_index is 0-based to match the TypeScript convention.
#[tauri::command]
fn get_annotations(
    state: State<AppState>,
    page_index: Option<u32>,
) -> Result<Vec<AnnotationInfo>, String> {
    state.with_document(|doc| {
        Ok(match page_index {
            Some(idx) => doc.get_page_annotations(idx),
            None => doc.get_all_annotations(),
        })
    })
}

#[tauri::command]
fn search_text(state: State<AppState>, query: String) -> Result<Vec<u32>, String> {
    state.with_document(|doc| Ok(doc.search_text(&query)))
}

#[tauri::command]
fn save_pdf(state: State<AppState>, path: String) -> Result<(), String> {
    state.with_document_mut(|doc| doc.save_to(&path))?;
    let mut current_path = state.current_path.lock().map_err(|e| e.to_string())?;
    *current_path = Some(path);
    Ok(())
}

#[tauri::command]
fn set_metadata(
    state: State<AppState>,
    title: Option<String>,
    author: Option<String>,
) -> Result<(), String> {
    state.with_document_mut(|doc| doc.set_document_info(title, author))
}

#[tauri::command]
fn has_unsaved_changes(state: State<AppState>) -> Result<bool, String> {
    state.with_document(|doc| Ok(doc.modified))
}

#[tauri::command]
fn get_current_path(state: State<AppState>) -> Result<Option<String>, String> {
    let current_path = state.current_path.lock().map_err(|e| e.to_string())?;
    Ok(current_path.clone())
}

#[tauri::command]
fn get_form_fields(state: State<AppState>) -> Result<Vec<FormFieldInfo>, String> {
    state.with_document(|doc| Ok(doc.get_form_fields()))
}

#[tauri::command]
fn set_form_field_value(
    state: State<AppState>,
    request: SetFieldValueRequest,
) -> Result<(), String> {
    state.with_document_mut(|doc| doc.set_form_field_value(&request.name, &request.value))
}

// ── PDF manipulation commands ─────────────────────────────────────────

#[tauri::command]
fn merge_pdfs(paths: Vec<String>, output_path: String) -> Result<(), String> {
    pdf_engine::merge_pdfs(&paths, &output_path)
}

/// Append all pages from `source_path` to the end of the current document.
#[tauri::command]
fn append_pdf(state: State<AppState>, source_path: String) -> Result<DocumentInfo, String> {
    state.with_document_mut(|doc| {
        doc.append_pdf(&source_path)?;
        Ok(doc.document_info())
    })
}

/// Insert all pages from `source_path` before the page at `at_index` (0-based).
#[tauri::command]
fn insert_pdf_at(
    state: State<AppState>,
    source_path: String,
    at_index: u32,
) -> Result<DocumentInfo, String> {
    state.with_document_mut(|doc| {
        doc.insert_pdf_at(&source_path, at_index)?;
        Ok(doc.document_info())
    })
}

/// Extract the selected pages (0-based indices) into a new PDF at `output_path`.
/// Does not modify the current document.
#[tauri::command]
fn extract_pages_to_file(
    state: State<AppState>,
    page_indices: Vec<u32>,
    output_path: String,
) -> Result<(), String> {
    state.with_document(|doc| doc.extract_pages_to_file(&page_indices, &output_path))
}

/// Split the current document into individual single-page PDFs in `output_dir`.
/// Returns the list of created file paths.
#[tauri::command]
fn split_into_pages(
    state: State<AppState>,
    output_dir: String,
) -> Result<Vec<String>, String> {
    state.with_document(|doc| {
        pdf_engine::split_into_pages(&doc.lopdf_doc, &output_dir)
    })
}

#[tauri::command]
fn split_pdf(
    state: State<AppState>,
    ranges: Vec<String>,
    output_dir: String,
) -> Result<Vec<String>, String> {
    state.with_document(|doc| {
        pdf_engine::split_pdf(&doc.lopdf_doc, &ranges, &output_dir)
    })
}

#[tauri::command]
fn rotate_pages(
    state: State<AppState>,
    page_indices: Vec<u32>,
    rotation: i32,
) -> Result<DocumentInfo, String> {
    state.with_document_mut(|doc| {
        doc.rotate_pages(&page_indices, rotation)?;
        Ok(doc.document_info())
    })
}

#[tauri::command]
fn rotate_page_left(state: State<AppState>, page_index: u32) -> Result<DocumentInfo, String> {
    state.with_document_mut(|doc| {
        doc.rotate_page_left(page_index)?;
        Ok(doc.document_info())
    })
}

#[tauri::command]
fn rotate_page_right(state: State<AppState>, page_index: u32) -> Result<DocumentInfo, String> {
    state.with_document_mut(|doc| {
        doc.rotate_page_right(page_index)?;
        Ok(doc.document_info())
    })
}

#[tauri::command]
fn get_page_labels(state: State<AppState>) -> Result<Vec<String>, String> {
    state.with_document(|doc| Ok(doc.get_page_labels()))
}

#[tauri::command]
fn delete_pages(
    state: State<AppState>,
    page_indices: Vec<u32>,
) -> Result<DocumentInfo, String> {
    state.with_document_mut(|doc| {
        doc.delete_pages(&page_indices)?;
        Ok(doc.document_info())
    })
}

#[tauri::command]
fn reorder_pages(
    state: State<AppState>,
    new_order: Vec<u32>,
) -> Result<DocumentInfo, String> {
    state.with_document_mut(|doc| {
        doc.reorder_pages(&new_order)?;
        Ok(doc.document_info())
    })
}

#[tauri::command]
fn compress_pdf(
    state: State<AppState>,
    output_path: String,
) -> Result<CompressResult, String> {
    state.with_document_mut(|doc| doc.compress(&output_path))
}

#[tauri::command]
fn add_watermark(
    state: State<AppState>,
    text: String,
    opacity: f32,
) -> Result<DocumentInfo, String> {
    state.with_document_mut(|doc| {
        doc.add_watermark(&text, opacity)?;
        Ok(doc.document_info())
    })
}

// ── Annotation commands ───────────────────────────────────────────────

#[tauri::command]
fn add_highlight_annotation(
    state: State<AppState>,
    page_index: u32,
    rects: Vec<[f32; 4]>,
    color: [f32; 3],
) -> Result<(), String> {
    state.with_document_mut(|doc| doc.add_highlight_annotation(page_index, &rects, color))
}

#[tauri::command]
fn add_underline_annotation(
    state: State<AppState>,
    page_index: u32,
    rects: Vec<[f32; 4]>,
    color: [f32; 3],
) -> Result<(), String> {
    state.with_document_mut(|doc| doc.add_underline_annotation(page_index, &rects, color))
}

#[tauri::command]
fn add_strikeout_annotation(
    state: State<AppState>,
    page_index: u32,
    rects: Vec<[f32; 4]>,
    color: [f32; 3],
) -> Result<(), String> {
    state.with_document_mut(|doc| doc.add_strikeout_annotation(page_index, &rects, color))
}

#[tauri::command]
fn add_comment_annotation(
    state: State<AppState>,
    page_index: u32,
    x: f32,
    y: f32,
    text: String,
) -> Result<(), String> {
    state.with_document_mut(|doc| doc.add_comment_annotation(page_index, x, y, &text))
}

#[tauri::command]
fn delete_annotation(state: State<AppState>, annotation_id: String) -> Result<(), String> {
    state.with_document_mut(|doc| doc.delete_annotation(&annotation_id))
}

#[tauri::command]
fn update_annotation_contents(
    state: State<AppState>,
    annotation_id: String,
    contents: String,
) -> Result<(), String> {
    state.with_document_mut(|doc| doc.update_annotation_contents(&annotation_id, &contents))
}

#[tauri::command]
fn update_annotation_color(
    state: State<AppState>,
    annotation_id: String,
    color: [f32; 3],
) -> Result<(), String> {
    state.with_document_mut(|doc| doc.update_annotation_color(&annotation_id, color))
}

#[tauri::command]
fn update_annotation_rect(
    state: State<AppState>,
    annotation_id: String,
    rect: [f32; 4],
) -> Result<(), String> {
    state.with_document_mut(|doc| doc.update_annotation_rect(&annotation_id, rect))
}

#[tauri::command]
fn add_shape_annotation(
    state: State<AppState>,
    page_index: u32,
    rect: [f32; 4],
    shape_type: String,
    color: [f32; 3],
) -> Result<(), String> {
    state.with_document_mut(|doc| doc.add_shape_annotation(page_index, rect, &shape_type, color))
}

#[tauri::command]
fn add_redaction_annotation(
    state: State<AppState>,
    page_index: u32,
    rect: [f32; 4],
) -> Result<(), String> {
    state.with_document_mut(|doc| doc.add_redaction_annotation(page_index, rect))
}

#[tauri::command]
fn add_ink_annotation(
    state: State<AppState>,
    page_index: u32,
    paths: Vec<Vec<[f32; 2]>>,
    color: [f32; 3],
    width: f32,
) -> Result<(), String> {
    state.with_document_mut(|doc| doc.add_ink_annotation(page_index, &paths, color, width))
}

// ── Print ────────────────────────────────────────────────────────────

#[tauri::command]
fn print_document(state: State<AppState>, app: tauri::AppHandle) -> Result<(), String> {
    let current_path = state.current_path.lock().map_err(|e| e.to_string())?;
    let path = current_path
        .as_ref()
        .ok_or("No PDF file open")?
        .clone();

    // Open the PDF in the system default viewer (Preview on macOS, default
    // PDF viewer on Windows/Linux) which provides print functionality.
    use tauri_plugin_shell::ShellExt;
    #[allow(deprecated)]
    app.shell()
        .open(&path, None::<tauri_plugin_shell::open::Program>)
        .map_err(|e| format!("Failed to open system viewer: {e}"))
}

// ── Digital signature commands ─────────────────────────────────────────

#[tauri::command]
fn sign_pdf(
    state: State<AppState>,
    cert_path: String,
    password: String,
    reason: String,
    output_path: String,
) -> Result<(), String> {
    state.with_document_mut(|doc| doc.sign(&cert_path, &password, &reason, &output_path))
}

#[tauri::command]
fn verify_signatures(
    state: State<AppState>,
) -> Result<Vec<SignatureVerifyResult>, String> {
    state.with_document(|doc| Ok(doc.verify_signatures()))
}

// ── PDF/A compliance commands ─────────────────────────────────────────

#[tauri::command]
fn validate_pdfa(state: State<AppState>) -> Result<PdfAValidationResult, String> {
    state.with_document(|doc| Ok(doc.validate_pdfa()))
}

#[tauri::command]
fn convert_to_pdfa(
    state: State<AppState>,
    level: String,
    output_path: String,
) -> Result<PdfAValidationResult, String> {
    state.with_document_mut(|doc| doc.convert_to_pdfa(&level, &output_path))
}

// ── Encryption commands ───────────────────────────────────────────────

#[tauri::command]
fn encrypt_pdf(
    state: State<AppState>,
    user_password: String,
    owner_password: String,
    output_path: String,
) -> Result<(), String> {
    state.with_document_mut(|doc| doc.encrypt(&user_password, &owner_password, &output_path))
}

#[tauri::command]
fn decrypt_pdf(
    state: State<AppState>,
    password: String,
) -> Result<(), String> {
    state.with_document_mut(|doc| doc.decrypt(&password))
}

// ── Redaction commands ─────────────────────────────────────────────────

#[tauri::command]
fn redact_text(
    state: State<AppState>,
    page_index: u32,
    rects: Vec<[f32; 4]>,
) -> Result<RedactReport, String> {
    state.with_document_mut(|doc| doc.redact_text(page_index, &rects))
}

#[tauri::command]
fn redact_search(
    state: State<AppState>,
    query: String,
) -> Result<SearchRedactReport, String> {
    state.with_document_mut(|doc| doc.redact_search(&query))
}

#[tauri::command]
fn apply_redactions(state: State<AppState>) -> Result<RedactReport, String> {
    state.with_document_mut(|doc| doc.apply_redactions())
}

#[tauri::command]
fn redact_metadata(state: State<AppState>) -> Result<(), String> {
    state.with_document_mut(|doc| doc.redact_metadata())
}

// ── Text mutation commands (Phase 4) ──────────────────────────────────

/// Request shape for the replace_text_span command.
/// Field names use snake_case to match serde deserialization from TypeScript camelCase.
#[derive(Debug, serde::Deserialize)]
struct ReplaceTextSpanRequest {
    page_index: u32,
    original_text: String,
    replacement_text: String,
}

/// Replace a single text span in a PDF page content stream.
/// See OpenDocument::replace_text_span for full documentation.
#[tauri::command]
fn replace_text_span(
    state: State<AppState>,
    request: ReplaceTextSpanRequest,
) -> Result<TextReplaceResult, String> {
    state.with_document_mut(|doc| {
        doc.replace_text_span(
            request.page_index,
            &request.original_text,
            &request.replacement_text,
        )
    })
}

// ── OCR commands ──────────────────────────────────────────────────────

#[tauri::command]
fn run_paddle_ocr(payload: PaddleOcrRequest) -> Result<PaddleOcrResponse, String> {
    // request_id is reserved for future async/cancel support; use 0 for now
    let request_id: u32 = 0;
    run_paddle_ocr_command(request_id, payload)
}

// ── Extraction & conversion commands ──────────────────────────────────

#[tauri::command]
fn extract_images(
    state: State<AppState>,
    output_dir: String,
) -> Result<Vec<ExtractedImageInfo>, String> {
    state.with_document(|doc| doc.extract_images(&output_dir))
}

#[tauri::command]
fn export_page_as_image(
    state: State<AppState>,
    page_index: u32,
    format: String,
    output_path: String,
) -> Result<(), String> {
    state.with_document(|doc| doc.export_page_as_image(page_index, &format, &output_path))
}

#[tauri::command]
fn convert_to_docx(
    state: State<AppState>,
    output_path: String,
) -> Result<(), String> {
    state.with_document(|doc| doc.convert_to_docx(&output_path))
}

// ── E-invoicing commands ──────────────────────────────────────────────

#[tauri::command]
fn extract_invoice_data(
    state: State<AppState>,
) -> Result<Option<InvoiceData>, String> {
    state.with_document(|doc| doc.extract_invoice_data())
}

#[tauri::command]
fn validate_invoice(
    state: State<AppState>,
) -> Result<Option<InvoiceValidationResult>, String> {
    state.with_document(|doc| doc.validate_invoice_data())
}

// ── Menu ─────────────────────────────────────────────────────────────

#[cfg(desktop)]
fn build_menu(handle: &tauri::AppHandle) -> Result<Menu<tauri::Wry>, String> {
    let file_menu = SubmenuBuilder::new(handle, "File")
        .items(&[
            &MenuItemBuilder::with_id("file_open", "Open...")
                .accelerator("CmdOrCtrl+O")
                .build(handle)
                .map_err(|e| e.to_string())?,
            &MenuItemBuilder::with_id("file_close", "Close")
                .accelerator("CmdOrCtrl+W")
                .build(handle)
                .map_err(|e| e.to_string())?,
            &PredefinedMenuItem::separator(handle).map_err(|e| e.to_string())?,
            &MenuItemBuilder::with_id("file_save", "Save")
                .accelerator("CmdOrCtrl+S")
                .build(handle)
                .map_err(|e| e.to_string())?,
            &MenuItemBuilder::with_id("file_save_as", "Save As...")
                .accelerator("CmdOrCtrl+Shift+S")
                .build(handle)
                .map_err(|e| e.to_string())?,
            &PredefinedMenuItem::separator(handle).map_err(|e| e.to_string())?,
            &MenuItemBuilder::with_id("file_print", "Print...")
                .accelerator("CmdOrCtrl+P")
                .build(handle)
                .map_err(|e| e.to_string())?,
            &PredefinedMenuItem::separator(handle).map_err(|e| e.to_string())?,
            &PredefinedMenuItem::quit(handle, Some("Quit PDFluent"))
                .map_err(|e| e.to_string())?,
        ])
        .build()
        .map_err(|e| e.to_string())?;

    let edit_menu = SubmenuBuilder::new(handle, "Edit")
        .items(&[
            &MenuItemBuilder::with_id("edit_undo", "Undo")
                .accelerator("CmdOrCtrl+Z")
                .build(handle)
                .map_err(|e| e.to_string())?,
            &MenuItemBuilder::with_id("edit_redo", "Redo")
                .accelerator("CmdOrCtrl+Shift+Z")
                .build(handle)
                .map_err(|e| e.to_string())?,
            &PredefinedMenuItem::separator(handle).map_err(|e| e.to_string())?,
            &PredefinedMenuItem::cut(handle, Some("Cut")).map_err(|e| e.to_string())?,
            &PredefinedMenuItem::copy(handle, Some("Copy")).map_err(|e| e.to_string())?,
            &PredefinedMenuItem::paste(handle, Some("Paste")).map_err(|e| e.to_string())?,
            &PredefinedMenuItem::select_all(handle, Some("Select All"))
                .map_err(|e| e.to_string())?,
        ])
        .build()
        .map_err(|e| e.to_string())?;

    let view_menu = SubmenuBuilder::new(handle, "View")
        .items(&[
            &MenuItemBuilder::with_id("view_zoom_in", "Zoom In")
                .accelerator("CmdOrCtrl+=")
                .build(handle)
                .map_err(|e| e.to_string())?,
            &MenuItemBuilder::with_id("view_zoom_out", "Zoom Out")
                .accelerator("CmdOrCtrl+-")
                .build(handle)
                .map_err(|e| e.to_string())?,
            &MenuItemBuilder::with_id("view_actual_size", "Actual Size")
                .accelerator("CmdOrCtrl+0")
                .build(handle)
                .map_err(|e| e.to_string())?,
            &PredefinedMenuItem::separator(handle).map_err(|e| e.to_string())?,
            &CheckMenuItemBuilder::with_id("view_single_page", "Single Page")
                .checked(true)
                .build(handle)
                .map_err(|e| e.to_string())?,
            &CheckMenuItemBuilder::with_id("view_continuous", "Continuous")
                .checked(false)
                .build(handle)
                .map_err(|e| e.to_string())?,
        ])
        .build()
        .map_err(|e| e.to_string())?;

    let about_metadata = AboutMetadataBuilder::new()
        .name(Some("PDFluent"))
        .version(Some(env!("CARGO_PKG_VERSION")))
        .copyright(Some("Copyright (c) 2026 Innovation Trigger B.V."))
        .website(Some("https://pdfluent.com"))
        .website_label(Some("pdfluent.com"))
        .build();

    let help_menu = SubmenuBuilder::new(handle, "Help")
        .about_with_text("About PDFluent", Some(about_metadata.clone()))
        .build()
        .map_err(|e| e.to_string())?;

    // On macOS, the first submenu is the app menu (shows in the menu bar as
    // the application name). It hosts About, Services, Hide, and Quit.
    #[cfg(target_os = "macos")]
    let app_menu = SubmenuBuilder::new(handle, "PDFluent")
        .about(Some(about_metadata))
        .separator()
        .services()
        .separator()
        .hide()
        .hide_others()
        .show_all()
        .separator()
        .quit()
        .build()
        .map_err(|e| e.to_string())?;

    #[cfg(target_os = "macos")]
    return Menu::with_items(
        handle,
        &[&app_menu, &file_menu, &edit_menu, &view_menu, &help_menu],
    )
    .map_err(|e| e.to_string());

    #[cfg(not(target_os = "macos"))]
    Menu::with_items(handle, &[&file_menu, &edit_menu, &view_menu, &help_menu])
        .map_err(|e| e.to_string())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            #[cfg(desktop)]
            {
                app.handle()
                    .plugin(tauri_plugin_updater::Builder::new().build())
                    .map_err(|e| e.to_string())?;

                let handle = app.handle();
                let menu = build_menu(handle)?;
                app.set_menu(menu).map_err(|e| e.to_string())?;

                app.on_menu_event(|app, event| {
                    let _ = app.emit("menu-event", event.id().0.as_str());
                });
            }

            if let Some(window) = app.get_webview_window("main") {
                let _ = window.show();
                let _ = window.set_focus();
            }
            Ok(())
        })
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_shell::init())
        .manage(AppState {
            document: Mutex::new(None),
            current_path: Mutex::new(None),
        })
        .manage({
            let license_state = licensing::discover_and_validate();
            LicenseManager {
                state: Mutex::new(license_state),
            }
        })
        .invoke_handler(tauri::generate_handler![
            open_pdf,
            close_pdf,
            get_document_info,
            render_page,
            render_thumbnail,
            extract_page_text,
            get_page_text_spans,
            get_annotations,
            search_text,
            save_pdf,
            set_metadata,
            has_unsaved_changes,
            get_current_path,
            get_form_fields,
            set_form_field_value,
            // PDF manipulation
            merge_pdfs,
            append_pdf,
            insert_pdf_at,
            extract_pages_to_file,
            split_into_pages,
            split_pdf,
            rotate_pages,
            rotate_page_left,
            rotate_page_right,
            get_page_labels,
            delete_pages,
            reorder_pages,
            compress_pdf,
            add_watermark,
            // Annotations
            add_highlight_annotation,
            add_underline_annotation,
            add_strikeout_annotation,
            add_comment_annotation,
            delete_annotation,
            update_annotation_contents,
            update_annotation_color,
            update_annotation_rect,
            add_shape_annotation,
            add_redaction_annotation,
            add_ink_annotation,
            // Print
            print_document,
            // Digital signatures
            sign_pdf,
            verify_signatures,
            // PDF/A compliance
            validate_pdfa,
            convert_to_pdfa,
            // Encryption
            encrypt_pdf,
            decrypt_pdf,
            // Redaction
            redact_text,
            redact_search,
            apply_redactions,
            redact_metadata,
            // Text mutation (Phase 4)
            replace_text_span,
            // OCR
            run_paddle_ocr,
            // Extraction & conversion
            extract_images,
            export_page_as_image,
            convert_to_docx,
            // E-invoicing
            extract_invoice_data,
            validate_invoice,
            // Licensing
            licensing::get_license_status,
            licensing::activate_license,
            licensing::deactivate_license,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

#[cfg(test)]
mod tests {
    use super::sanitize_scale;

    #[test]
    fn sanitize_scale_clamps_into_safe_range() {
        assert_eq!(sanitize_scale(Some(0.05)), 0.1);
        assert_eq!(sanitize_scale(Some(3.2)), 3.2);
        assert_eq!(sanitize_scale(Some(9.0)), 8.0);
    }

    #[test]
    fn sanitize_scale_falls_back_on_invalid_values() {
        assert_eq!(sanitize_scale(None), 2.0);
        assert_eq!(sanitize_scale(Some(f32::NAN)), 2.0);
        assert_eq!(sanitize_scale(Some(-5.0)), 2.0);
    }
}
