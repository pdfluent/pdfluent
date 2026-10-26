// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary. The PDFluent application is free to use,
// including for commercial purposes. Redistribution, or extraction or reuse
// of its components (including the embedded PDF engine), requires a licence.
// See https://pdfluent.com/license for terms.

//! Hooks for the journey suite (tests/journeys), compiled only with
//! `--features e2e`.
//!
//! The journey suite drives the real app and judges the files it writes. Three
//! things on that path are outside any webview driver's reach, and this module
//! is the seam for exactly those three:
//!
//! * **Native file dialogs opened from Rust** (Save As, the unsigned copy, the
//!   attachment pickers). A WebDriver session cannot answer an OS panel, so in
//!   an e2e build each of those commands first takes the next answer the test
//!   queued with `e2e_queue_dialog_answers`; with nothing queued it shows the
//!   real panel as usual.
//! * **The print panel.** PDFKit's panel is modal and no driver can close it.
//!   With `PDFLUENT_E2E_PRINT_CAPTURE` set to a file path, the print copy's
//!   path is written there instead of being handed to the panel, so the test
//!   can open the very bytes the system would have printed.
//! * **The UI language.** Selectors stay on test ids, but the journeys read
//!   messages too, and the runners are set to Dutch and English. With
//!   `PDFLUENT_E2E_LANG` set, the page starts with that language stored as the
//!   user's choice, exactly as the language switcher would store it.
//! * **macOS.** WKWebView has no WebDriver. With `PDFLUENT_E2E_BRIDGE` set to a
//!   directory, a thread evaluates the scripts the harness drops into
//!   `<dir>/in/` and the page answers through `e2e_reply` into `<dir>/out/`.
//!   Files, not a port: nothing listens, so the e2e build opens no socket the
//!   offline check would have to explain.
//!
//! None of this is in a shipped build. The feature is not a default feature
//! and no release build names it; `tests/e2e-build-is-never-shipped.test.ts`
//! pins both. `E2E_BUILD_MARKER` below is how `scripts/ci/build-e2e.sh`
//! proves the feature reached the binary it hands the suite.

use std::collections::VecDeque;
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use std::time::Duration;

use tauri::Manager;

/// Present in the binary of every e2e build and of no other build.
#[used]
pub static E2E_BUILD_MARKER: [u8; 30] = *b"PDFLUENT-E2E-BUILD-NOT-SHIPPED";

static DIALOG_ANSWERS: Mutex<VecDeque<Option<String>>> = Mutex::new(VecDeque::new());

/// The answer queued for the next native dialog opened from Rust, if any:
/// `Some(Some(path))` picks that path, `Some(None)` is a cancelled dialog,
/// `None` means nothing was queued and the real dialog should open.
pub fn take_dialog_answer() -> Option<Option<String>> {
    match DIALOG_ANSWERS.lock() {
        Ok(mut queue) => queue.pop_front(),
        Err(poisoned) => poisoned.into_inner().pop_front(),
    }
}

/// Queue answers for the next native dialogs, in order. `null` cancels.
#[tauri::command]
pub fn e2e_queue_dialog_answers(answers: Vec<Option<String>>) {
    let mut queue = match DIALOG_ANSWERS.lock() {
        Ok(queue) => queue,
        Err(poisoned) => poisoned.into_inner(),
    };
    queue.extend(answers);
}

/// When the suite captures printing, record the print copy and report that
/// the panel was not shown.
pub fn capture_print(path: &str) -> Option<Result<(), String>> {
    let target = std::env::var_os("PDFLUENT_E2E_PRINT_CAPTURE")?;
    Some(write_atomically(Path::new(&target), path.as_bytes()))
}

/// Do what the application menu item `id` does, for the menu items a driver
/// cannot click (the macOS menu bar is outside the webview).
#[tauri::command]
pub fn e2e_menu(app: tauri::AppHandle, id: String) {
    crate::handle_menu_event(&app, &id);
}

/// The page's answer to a bridge script: written to `<bridge>/out/<id>.json`.
#[tauri::command]
pub fn e2e_reply(id: String, payload: String) -> Result<(), String> {
    let dir = bridge_dir().ok_or("the e2e bridge is not enabled")?;
    if id.is_empty() || !id.chars().all(|c| c.is_ascii_alphanumeric() || c == '-') {
        return Err(format!("bridge reply id {id:?} is not a plain id"));
    }
    write_atomically(&dir.join("out").join(format!("{id}.json")), payload.as_bytes())
}

fn bridge_dir() -> Option<PathBuf> {
    std::env::var_os("PDFLUENT_E2E_BRIDGE").map(PathBuf::from)
}

fn write_atomically(target: &Path, bytes: &[u8]) -> Result<(), String> {
    let tmp = target.with_extension("partial");
    std::fs::write(&tmp, bytes).map_err(|e| format!("e2e: write {}: {e}", tmp.display()))?;
    std::fs::rename(&tmp, target).map_err(|e| format!("e2e: rename to {}: {e}", target.display()))
}

/// The e2e plugin: today only the language seed described above.
pub fn plugin<R: tauri::Runtime>() -> tauri::plugin::TauriPlugin<R> {
    let mut builder = tauri::plugin::Builder::new("pdfluent-e2e");
    if let Ok(lang) = std::env::var("PDFLUENT_E2E_LANG") {
        if !lang.is_empty() && lang.len() <= 8 && lang.chars().all(|c| c.is_ascii_alphanumeric() || c == '-') {
            builder = builder.js_init_script(format!(
                "try {{ localStorage.setItem('pdfluent-lang', '{lang}'); }} catch (e) {{}}"
            ));
        }
    }
    builder.build()
}

/// Start the file bridge when `PDFLUENT_E2E_BRIDGE` names a directory.
pub fn start_bridge(app: &tauri::AppHandle) {
    let Some(dir) = bridge_dir() else { return };
    let inbox = dir.join("in");
    let outbox = dir.join("out");
    for d in [&inbox, &outbox] {
        if let Err(e) = std::fs::create_dir_all(d) {
            crate::applog(&format!("e2e bridge: cannot create {}: {e}", d.display()));
            return;
        }
    }
    crate::applog(&format!("e2e bridge: listening on {}", inbox.display()));
    let app = app.clone();
    std::thread::spawn(move || loop {
        std::thread::sleep(Duration::from_millis(25));
        let mut scripts: Vec<PathBuf> = match std::fs::read_dir(&inbox) {
            Ok(entries) => entries
                .flatten()
                .map(|e| e.path())
                .filter(|p| p.extension().is_some_and(|x| x == "js"))
                .collect(),
            Err(_) => continue,
        };
        scripts.sort();
        for script in scripts {
            let taken = script.with_extension("taken");
            if std::fs::rename(&script, &taken).is_err() {
                continue;
            }
            let code = match std::fs::read_to_string(&taken) {
                Ok(code) => code,
                Err(e) => {
                    crate::applog(&format!("e2e bridge: unreadable script: {e}"));
                    continue;
                }
            };
            match app.get_webview_window("main") {
                Some(window) => {
                    if let Err(e) = window.eval(&code) {
                        crate::applog(&format!("e2e bridge: eval failed: {e}"));
                    }
                }
                None => crate::applog("e2e bridge: no main window to run a script in"),
            }
        }
    });
}
