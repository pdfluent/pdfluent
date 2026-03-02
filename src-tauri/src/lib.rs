// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 PDFluent Contributors

mod pdf_engine;

use pdf_engine::{DocumentInfo, PdfEngine, RenderedPage};
use std::sync::Mutex;
use tauri::State;

struct AppState {
    engine: Mutex<PdfEngine>,
    current_file: Mutex<Option<String>>,
}

#[tauri::command]
fn open_pdf(state: State<AppState>, path: String) -> Result<DocumentInfo, String> {
    let engine = state.engine.lock().map_err(|e| e.to_string())?;
    let info = engine.get_document_info(&path)?;

    let mut current = state.current_file.lock().map_err(|e| e.to_string())?;
    *current = Some(path);

    Ok(info)
}

#[tauri::command]
fn render_page(
    state: State<AppState>,
    page_index: u16,
    scale: Option<f32>,
) -> Result<RenderedPage, String> {
    let engine = state.engine.lock().map_err(|e| e.to_string())?;
    let current = state.current_file.lock().map_err(|e| e.to_string())?;
    let path = current.as_ref().ok_or("No PDF file open")?;

    engine.render_page(path, page_index, scale.unwrap_or(2.0))
}

#[tauri::command]
fn get_document_info(state: State<AppState>) -> Result<DocumentInfo, String> {
    let engine = state.engine.lock().map_err(|e| e.to_string())?;
    let current = state.current_file.lock().map_err(|e| e.to_string())?;
    let path = current.as_ref().ok_or("No PDF file open")?;

    engine.get_document_info(path)
}

#[tauri::command]
fn close_pdf(state: State<AppState>) -> Result<(), String> {
    let mut current = state.current_file.lock().map_err(|e| e.to_string())?;
    *current = None;
    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let engine = PdfEngine::init().expect(
        "Failed to initialize Pdfium. Ensure libpdfium is in src-tauri/lib/lib/",
    );

    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .manage(AppState {
            engine: Mutex::new(engine),
            current_file: Mutex::new(None),
        })
        .invoke_handler(tauri::generate_handler![
            open_pdf,
            render_page,
            get_document_info,
            close_pdf,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
