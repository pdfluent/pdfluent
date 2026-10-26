#![forbid(unsafe_code)]

// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary. The PDFluent application is free to use,
// including for commercial purposes. Redistribution, or extraction or reuse
// of its components (including the embedded PDF engine), requires a licence.
// See https://pdfluent.com/license for terms.

mod annot_write;
mod atomic_file;
mod close_guard;
mod feedback;
mod history;
mod image_pick;
mod redact_notes;
#[cfg(feature = "e2e")]
mod e2e;
mod ocr;
mod open_error;
pub mod page_images;
mod ocr_component;
mod pdf_engine;
mod perf;
pub mod pii;
pub mod pii_component;
pub mod pii_gliner;
pub mod pii_ids;
pub mod pii_model;
mod recovery;
#[cfg(test)]
mod pdfa_export_guard;
mod sdk_facade;
// The guard's callers are the interactive XFA commit (`xfa-interactive`) and the
// AcroForm recalculation: the pinned engine revision has neither, so a default
// build has the module and no caller yet.
mod form_scripts_policy;
#[cfg_attr(not(feature = "xfa-interactive"), allow(dead_code))]
mod script_consent;
mod security;
mod structured_export;
mod session_log;
mod startup_watchdog;
pub mod sessions;
pub mod signature_fonts;
pub mod system_fonts;
mod telemetry;
mod text_font;
#[cfg(feature = "ui-walk")]
mod ui_walk;

// Test seam. `pdf_engine` is a private module, so an integration test — which
// links against this crate from the outside — could not reach the open/save
// path at all. That is why the save round-trip was only ever measured by a
// scratch replica of it, and why a regression there would have reached a
// release unseen. The module stays private; only the document type is
// re-exported, for src-tauri/tests/golden_roundtrip.rs. The PDF/A conversion
// gate (src-tauri/tests/golden_pdfa.rs) reads what a conversion cost, so its
// reply type comes along.
pub use pdf_engine::{
    FormCalcFailure, FormCalcReport, FormCalcUpdate, FormFieldKindDto, FormFieldModelDto,
    FormWriteRequest, OpenDocument, ParagraphLine,
    PasswordRemoval, PdfAConvertResult, XfaWriteRequest,
};

// The open path's typed refusals, for src-tauri/tests/open_errors.rs.
pub use open_error::{classify_io_error, OpenError, OpenErrorCode, OpenLimits};

/// What `open_pdf` does, without the app state: check the path, then open the
/// file within `limits`, answering an [`OpenError`] the frontend can explain.
pub fn open_for_app(
    raw_path: &str,
    password: Option<&str>,
    limits: &OpenLimits,
) -> Result<OpenDocument, OpenError> {
    let path = validate_open_path(raw_path)?;
    OpenDocument::open_checked(&path, password, limits)
}

fn validate_open_path(raw_path: &str) -> Result<String, OpenError> {
    security::validate_pdf_input_path(raw_path)
        .map_err(|refusal| open_error::classify_path_refusal(raw_path, refusal))
}

/// The file-to-file operations the merge and split commands call, for
/// src-tauri/tests/document_operations.rs. A module because the Tauri commands
/// at the crate root carry the same names.
pub mod document_ops {
    pub use crate::pdf_engine::{merge_pdfs, split_into_pages, split_pdf};
}
// The OCR journey (J-60) is tested from outside too: src-tauri/tests/
// ocr_makes_scans_searchable.rs drives the same engine and text-layer path
// the `run_ocr` command does, against a scan it builds itself.
pub use ocr::{ComponentTesseract, OcrPageSummary, OcrTextLayerReport};
pub use ocr_component::Installed as InstalledOcrComponent;
// Every build ships the OCR component inside the app. These are the functions
// the app runs to find and check it, public so
// tests/ocr_makes_scans_searchable.rs exercises the same code on a bundle laid
// out the way the build lays it out.
#[doc(hidden)]
pub mod ocr_bundle {
    pub use crate::ocr_component::{
        bundled, resolve, status, verify_bundle_hashes, ComponentStatus, Manifest,
        BUNDLE_RESOURCE_DIR, ERR_NOT_INSTALLED,
    };
    pub use crate::ocr_component::platform_key;
    /// The manifest compiled into this build.
    pub fn compiled_manifest() -> Result<Manifest, String> {
        crate::ocr_component::manifest().cloned()
    }
}
// The free conversion functions the export commands run on a worker thread,
// public so `tests/exports_keep_their_content.rs` exercises the exact route
// the commands take.
pub use pdf_engine::{convert_doc_to_docx, convert_doc_to_pptx, convert_doc_to_xlsx};
pub use structured_export::{
    count_doc_tables, export_doc_as_markdown, export_doc_tables_cached, export_doc_tables_to_xlsx,
    table_extractions_run, TableCache, NO_TABLES_FOUND,
};

#[cfg(feature = "pii")]
use pdf_engine::{PiiCandidate, PiiRedactReport};
use pdf_engine::{
    AnnotationInfo, AttachmentInfo, CompressResult, DocumentInfo, ExtractedImageInfo,
    FormFieldInfo, InvoiceData, InvoiceValidationResult, LayerInfo, OutlineItemInfo,
    PdfAValidationResult, RedactReport, RenderedPage, SdkDocument, SearchRedactReport,
    SetFieldValueRequest, SignatureVerifyResult, SpanAnchor, TextReplaceResult, TextSpanInfo,
};
use std::process::{Child, Command};
use std::sync::atomic::{AtomicBool, AtomicU64, AtomicU8, Ordering};
use std::sync::{Arc, Mutex};
use tauri::{Emitter, Manager, State};
use tauri_plugin_dialog::DialogExt;

// ---------------------------------------------------------------------------
// Startup webview watchdog
//
// Observed in the field (2026-06-11, macOS 26.5): under certain system
// conditions the WKWebView WebContent child of a LaunchServices-launched
// instance is suspended right after first paint — JS timers, clicks and
// dynamic imports all stop, leaving the user on an eternal "Laden…" spinner.
// A frontend watchdog cannot fire there (its timers are frozen too), so the
// detection lives HERE: the frontend pings `frontend_ready` as its first
// invoke; if the web view shows no life, this Rust thread recreates the
// webview window once, and surfaces a native dialog if that also fails.
// A slow-but-alive start (heartbeat from public/startup-heartbeat.js) keeps
// its window: the rule lives in startup_watchdog.rs.
// ---------------------------------------------------------------------------

static FRONTEND_READY: AtomicBool = AtomicBool::new(false);
static RECOVERY_ATTEMPTS: AtomicU8 = AtomicU8::new(0);
static RECOVERY_ACTIVE: AtomicBool = AtomicBool::new(false);
/// Milliseconds since `process_clock()` start at the latest heartbeat or ready
/// ping; `NO_SIGN` while the current web view has not shown any life.
static LAST_SIGN_MS: AtomicU64 = AtomicU64::new(NO_SIGN);
const NO_SIGN: u64 = u64::MAX;

fn process_clock() -> std::time::Instant {
    static START: std::sync::OnceLock<std::time::Instant> = std::sync::OnceLock::new();
    *START.get_or_init(std::time::Instant::now)
}

fn note_sign_of_life() {
    LAST_SIGN_MS.store(process_clock().elapsed().as_millis() as u64, Ordering::SeqCst);
}

/// How long a start may stay silent before the first sign of life. Slow PCs
/// need a minute or more; see `startup_watchdog` for the full rule.
fn ready_timeout_secs() -> u64 {
    std::env::var("PDFLUENT_READY_TIMEOUT_SECS")
        .ok()
        .and_then(|v| v.parse().ok())
        .unwrap_or(startup_watchdog::DEFAULT_FIRST_SIGN_GRACE_SECS)
}

/// True when the test hook forces the watchdog to treat the frontend as
/// unresponsive (used to exercise the recovery path in validation builds).
/// `1` = always ignore the ready ping (drives the escalation path).
/// `once` = ignore only until the first recovery rebuild, so the REBUILT
/// window is allowed to load normally (proves recovery actually recovers).
fn watchdog_test_ignore_ready() -> bool {
    match std::env::var("PDFLUENT_TEST_IGNORE_READY").as_deref() {
        Ok("1") => true,
        Ok("once") => RECOVERY_ATTEMPTS.load(Ordering::SeqCst) == 0,
        _ => false,
    }
}

fn spawn_startup_watchdog(handle: tauri::AppHandle) {
    LAST_SIGN_MS.store(NO_SIGN, Ordering::SeqCst);
    std::thread::spawn(move || {
        let policy = startup_watchdog::Policy::new(ready_timeout_secs());
        let started = std::time::Instant::now();
        let started_ms = process_clock().elapsed().as_millis() as u64;
        let timeout = policy.first_sign_grace.as_secs();
        let reason = loop {
            std::thread::sleep(std::time::Duration::from_secs(1));
            let ignore = watchdog_test_ignore_ready();
            let ready = FRONTEND_READY.load(Ordering::SeqCst) && !ignore;
            let sign = LAST_SIGN_MS.load(Ordering::SeqCst);
            let last_sign = (!ignore && sign != NO_SIGN)
                .then(|| std::time::Duration::from_millis(sign.saturating_sub(started_ms)));
            match startup_watchdog::judge(&policy, started.elapsed(), ready, last_sign) {
                startup_watchdog::Verdict::Healthy => return,
                startup_watchdog::Verdict::Wait => {}
                startup_watchdog::Verdict::Recover(r) => break r,
            }
        };

        let attempt = RECOVERY_ATTEMPTS.fetch_add(1, Ordering::SeqCst);
        eprintln!("startup watchdog: frontend not ready ({reason:?}, grace {timeout}s, attempt {attempt}) — recovering");
        if attempt >= 1 {
            // Second failure: recreating the webview did not help. Tell the
            // user natively (this dialog does not depend on the webview).
            let h = handle.clone();
            let _ = handle.run_on_main_thread(move || {
                h.dialog()
                    .message(
                        "PDFluent could not start its window.\n\nQuit and open the app again. \
                         If that does not help, restart the computer and try once more.",
                    )
                    .title("PDFluent is not responding")
                    .blocking_show();
                h.exit(1);
            });
            return;
        }

        // First failure: recreate the webview window. Build the replacement
        // FIRST under a recovery label (window.close() is asynchronous, so
        // reusing "main" races the teardown), then close the frozen one —
        // the app never reaches a zero-window state this way. RECOVERY_ACTIVE
        // additionally suppresses ExitRequested during the swap as a belt.
        RECOVERY_ACTIVE.store(true, Ordering::SeqCst);
        FRONTEND_READY.store(false, Ordering::SeqCst);
        let h = handle.clone();
        let _ = handle.run_on_main_thread(move || {
            let mut window_cfg = h.config().app.windows.first().cloned();
            if let Some(cfg) = window_cfg.as_mut() {
                cfg.label = "main-recovery".to_string();
            }
            let built = window_cfg.and_then(|cfg| {
                tauri::WebviewWindowBuilder::from_config(&h, &cfg)
                    .and_then(|b| b.build())
                    .map_err(|e| eprintln!("startup watchdog: window rebuild failed: {e}"))
                    .ok()
            });
            match built {
                Some(win) => {
                    let _ = win.show();
                    let _ = win.set_focus();
                    if let Some(old) = h.get_webview_window("main") {
                        let _ = old.close();
                    }
                    eprintln!("startup watchdog: recovery window '{}' built and shown", win.label());
                    RECOVERY_ACTIVE.store(false, Ordering::SeqCst);
                    // Watch the replacement window too.
                    spawn_startup_watchdog(h);
                }
                None => {
                    RECOVERY_ACTIVE.store(false, Ordering::SeqCst);
                    h.dialog()
                        .message(
                            "PDFluent could not start its window.\n\nQuit and open the \
                             app again. If that does not help, restart the computer.",
                        )
                        .title("PDFluent is not responding")
                        .blocking_show();
                    h.exit(1);
                }
            }
        });
    });
}

/// One line from the frontend into the same durable log the backend writes to.
///
/// A failure the user sees on screen and a failure in the log used to be two
/// different sets: the backend logged, the webview did not, and a support
/// bundle showed a clean run for a session in which three commands had failed.
/// `commandBridge.ts` calls this for every rejected command and every visible
/// fallback, so the log is the whole story.
#[tauri::command]
fn frontend_log(message: String) {
    // Bounded: a log line is a diagnostic, not a transport for document text.
    let trimmed: String = message.chars().take(2000).collect();
    applog(&format!("frontend: {trimmed}"));
}

/// Timer-driven heartbeat from `public/startup-heartbeat.js`. A slow start
/// keeps sending it; a suspended web view cannot, which is how the watchdog
/// tells "late" from "dead".
#[tauri::command]
fn frontend_heartbeat() {
    note_sign_of_life();
}

/// First invoke from the frontend — proof the webview's JS is alive.
#[tauri::command]
fn frontend_ready() {
    FRONTEND_READY.store(true, Ordering::SeqCst);
    note_sign_of_life();
    perf::mark("frontend_ready");
    eprintln!(
        "startup watchdog: frontend_ready ping received (recovery attempts so far: {})",
        RECOVERY_ATTEMPTS.load(Ordering::SeqCst)
    );
}

#[cfg(desktop)]
use tauri::menu::{
    AboutMetadataBuilder, CheckMenuItemBuilder, Menu, MenuItemBuilder, PredefinedMenuItem,
    SubmenuBuilder,
};

struct AppState {
    /// The document on screen. With `current_path`, this is the *slot* every
    /// command works on; the other open documents are parked in `sessions`
    /// (J-90, see sessions.rs). Lock order when more than one is needed:
    /// `current_path`, then `sessions`, then `document`.
    document: Mutex<Option<OpenDocument>>,
    current_path: Mutex<Option<String>>,
    sessions: Mutex<sessions::SessionBook<OpenDocument>>,
    /// Tables found by the Tables-to-Excel pre-check, for the export after it.
    table_cache: Arc<structured_export::TableCache>,
    tts_child: Mutex<Option<Child>>,
    /// Set in `setup`: edits announce the new undo/redo state to the webview.
    app: std::sync::OnceLock<tauri::AppHandle>,
    /// The texts the last personal-data scan proposed. `redact_pii` accepts
    /// only these: it is a review list, not a free-form search.
    #[cfg(feature = "pii")]
    pii_reviewed: Mutex<std::collections::HashSet<String>>,
}

/// Event the webview listens to for the Undo and Redo controls.
const DOCUMENT_HISTORY_EVENT: &str = "document-history";

#[derive(Debug, serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct NativeFeatureCapability {
    status: &'static str,
    available: bool,
    provider: String,
    detail: String,
    local_only: bool,
}

#[derive(Debug, serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct NativeCapabilities {
    platform: &'static str,
    ocr: NativeFeatureCapability,
    tts: NativeFeatureCapability,
    scanner: NativeFeatureCapability,
    spellcheck: NativeFeatureCapability,
    dictation: NativeFeatureCapability,
    share: NativeFeatureCapability,
    secure_storage: NativeFeatureCapability,
}

#[derive(Debug, serde::Deserialize)]
struct NativeTtsRequest {
    text: String,
    rate: Option<f32>,
    voice: Option<String>,
    language: Option<String>,
}

#[derive(Debug, serde::Serialize)]
struct NativeTtsResult {
    provider: String,
    language: Option<String>,
    voice: Option<String>,
}


const WEBSITE_URL: &str = "https://pdfluent.com";
const LICENSE_URL: &str = "https://pdfluent.com/license";

/// The published Microsoft Store listing. This is copy for the About dialog, not
/// a link the app opens: `telemetry::open_external_url` refuses every host but
/// pdfluent.com, deliberately, so a Help item pointing here would fail silently.
/// It is in the About box because a Store install and a direct download are the
/// same binary, and a user reporting a problem needs to be able to say which one
/// they have.
const MICROSOFT_STORE_ID: &str = "XPDBXJ6XRLFQK2";
const MICROSOFT_STORE_URL: &str = "https://apps.microsoft.com/detail/XPDBXJ6XRLFQK2";

/// Path of a PDF the OS asked us to open (Finder double-click / "Open With" /
/// file association / command-line arg) before the webview was ready. The
/// frontend drains this on mount via the `take_pending_opens` command. Every
/// file is kept: several files opened together each get a tab (J-90).
struct PendingOpen(Mutex<Vec<String>>);

/// Return and clear the queued "open this file" requests, oldest first, so a
/// cold-start double-click / open-with still opens the documents once the UI
/// is listening.
#[tauri::command]
fn take_pending_opens(state: tauri::State<'_, PendingOpen>) -> Vec<String> {
    match state.0.lock() {
        Ok(mut pending) => std::mem::take(&mut *pending),
        Err(e) => {
            applog(&format!("open: could not read the files waiting to be opened: {e}"));
            Vec::new()
        }
    }
}

/// The e2e build starts many app instances in a row and a stray one (the
/// warm-up, a crashed journey) would swallow the next launch through the
/// single-instance plugin: the driver then sees its window vanish. So the e2e
/// build leaves the plugin out unless a journey asks for it with
/// `PDFLUENT_E2E_SINGLE_INSTANCE=1` (J-11 does, to test the real behaviour).
#[cfg(windows)]
fn e2e_skips_single_instance() -> bool {
    cfg!(feature = "e2e") && std::env::var_os("PDFLUENT_E2E_SINGLE_INSTANCE").is_none()
}

/// The arguments a launch is parsed from: the process's own, then (e2e build
/// only) the JSON array of strings in `PDFLUENT_E2E_ARGS`.
///
/// Why: a WebDriver session cannot hand the app a bare argument. msedgedriver
/// treats every entry of `tauri:options.args` as a switch, so on Windows
/// `C:\Docs\a.pdf` reaches the app as `--c:\docs\a.pdf` (lower-cased, and cut
/// at a space), which is no PDF path: the cold start opened nothing and every
/// journey that starts with a file waited for a document that never came. The
/// environment passes through tauri-driver and msedgedriver untouched.
fn launch_args_with<I>(own: I, e2e_extra: Option<&str>) -> Vec<String>
where
    I: IntoIterator<Item = String>,
{
    let mut args: Vec<String> = own.into_iter().collect();
    if let Some(raw) = e2e_extra {
        match serde_json::from_str::<Vec<String>>(raw) {
            Ok(extra) => args.extend(extra),
            Err(e) => applog(&format!("open: PDFLUENT_E2E_ARGS is not a JSON array of strings: {e}")),
        }
    }
    args
}

/// The PDF a launch was asked to open: the first argument after the program
/// name that ends in `.pdf`, made absolute against `cwd`.
///
/// Used for the cold start (this process's own arguments) and for a second
/// launch on Windows, whose arguments arrive through the single-instance
/// plugin together with *its* working directory — a relative path there means
/// relative to where that second process started, not to us.
#[cfg(test)]
fn pdf_path_from_launch_args<I, S>(args: I, cwd: &std::path::Path) -> Option<String>
where
    I: IntoIterator<Item = S>,
    S: AsRef<str>,
{
    pdf_paths_from_launch_args(args, cwd).into_iter().next()
}

/// Every PDF a launch was asked to open, in the order given: each one gets a
/// tab. Same rules as [`pdf_path_from_launch_args`], which is its first.
fn pdf_paths_from_launch_args<I, S>(args: I, cwd: &std::path::Path) -> Vec<String>
where
    I: IntoIterator<Item = S>,
    S: AsRef<str>,
{
    args.into_iter()
        .skip(1)
        .map(|a| a.as_ref().to_string())
        .filter(|a| a.to_lowercase().ends_with(".pdf"))
        .map(|a| {
            let p = std::path::Path::new(&a);
            if p.is_absolute() || cwd.as_os_str().is_empty() {
                a
            } else {
                cwd.join(p).to_string_lossy().into_owned()
            }
        })
        .collect()
}

/// A second launch without a file: just bring the window forward.
#[cfg(windows)]
fn open_in_running_instance_focus_only(app: &tauri::AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        if let Err(e) = window.unminimize().and_then(|_| window.show()).and_then(|_| window.set_focus()) {
            applog(&format!("open: could not bring the window forward: {e}"));
        }
    }
}

#[cfg(any(windows, target_os = "macos"))]
/// Hand a PDF to the running window: queue it for a webview that is not
/// listening yet, tell one that is, and bring the window forward. The webview
/// opens it through the same guarded path as File > Open, so unsaved changes
/// are asked about first.
fn open_in_running_instance(app: &tauri::AppHandle, path: String) {
    if let Some(state) = app.try_state::<PendingOpen>() {
        if let Ok(mut pending) = state.0.lock() {
            pending.push(path.clone());
        }
    }
    if let Err(e) = app.emit("open-file", path) {
        applog(&format!("open: could not hand the file to the window: {e}"));
    }
    if let Some(window) = app.get_webview_window("main") {
        if let Err(e) = window.unminimize().and_then(|_| window.show()).and_then(|_| window.set_focus()) {
            applog(&format!("open: could not bring the window forward: {e}"));
        }
    }
}

// ── Recovery copy (J-84, J-90) ──────────────────────────────────────────
// See recovery.rs. One slot per open document in the app's data folder; a
// document's slot is emptied by its save and its close, all of them by a clean
// quit, so what is left at the next start is what a crash left behind.

struct RecoveryState(Mutex<Option<recovery::RecoveryStore>>);

fn with_recovery<R>(
    app: &tauri::AppHandle,
    f: impl FnOnce(&recovery::RecoveryStore) -> Result<R, String>,
) -> Result<R, String> {
    let state = app
        .try_state::<RecoveryState>()
        .ok_or("the recovery folder is not available")?;
    let guard = state.0.lock().map_err(|e| e.to_string())?;
    let store = guard.as_ref().ok_or("the recovery folder is not available")?;
    f(store)
}

/// Names this launch's recovery slots, so the session ids of the next launch
/// (which start at 1 again) never overwrite a copy a crash left behind.
fn launch_id() -> u64 {
    static LAUNCH: std::sync::OnceLock<u64> = std::sync::OnceLock::new();
    *LAUNCH.get_or_init(|| {
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|d| d.as_millis() as u64)
            .unwrap_or(0)
    })
}

/// Empty the recovery slot of one document after its save or close. A failure
/// is logged: the worst it does is offer a copy the user no longer needs.
fn clear_recovery_for(app: &tauri::AppHandle, session: Option<sessions::SessionId>) {
    let Some(session) = session else {
        return;
    };
    let result = with_recovery(app, |store| {
        let slot = store
            .slot(&recovery::slot_key(launch_id(), session))
            .ok_or("the recovery slot name is not valid")?;
        slot.clear().map_err(|e| e.to_string())
    });
    if let Err(e) = result {
        applog(&format!("recovery: could not empty the slot: {e}"));
    }
}

/// Empty the slot of the document on screen (after Save).
fn clear_recovery(app: &tauri::AppHandle) {
    let active = app
        .try_state::<AppState>()
        .and_then(|state| state.active_session_id());
    clear_recovery_for(app, active);
}

/// Empty every slot this launch wrote: nothing is left to recover.
fn clear_recovery_of_this_launch(app: &tauri::AppHandle) {
    if let Err(e) = with_recovery(app, |store| store.clear_launch(launch_id()).map_err(|e| e.to_string())) {
        applog(&format!("recovery: could not empty the slots: {e}"));
    }
}

/// One recovery copy per document with unsaved changes; the slot of a document
/// without any is emptied. Returns whether a copy was written.
fn write_recovery_copies(app: &tauri::AppHandle, state: &AppState) -> Result<bool, String> {
    struct Snapshot {
        session: sessions::SessionId,
        path: Option<String>,
        bytes: Option<Vec<u8>>,
    }
    let take = |session: sessions::SessionId, path: Option<String>, doc: &mut OpenDocument| {
        let bytes = if doc.modified { Some(doc.recovery_bytes()) } else { None };
        (session, path, bytes)
    };
    let raw = state.with_sessions(|book, slot, slot_path| {
        let mut out = Vec::new();
        if let (Some(id), Some(doc)) = (book.active(), slot.as_mut()) {
            out.push(take(id, slot_path.clone(), doc));
        }
        for parked in book.parked_mut() {
            out.push(take(parked.id, parked.path.clone(), &mut parked.doc));
        }
        out
    })?;
    let mut snapshots = Vec::new();
    let mut failure = None;
    for (session, path, bytes) in raw {
        match bytes {
            None => snapshots.push(Snapshot { session, path, bytes: None }),
            Some(Ok(bytes)) => snapshots.push(Snapshot { session, path, bytes: Some(bytes) }),
            Some(Err(e)) => {
                // One document that cannot be serialised must not keep the
                // others from getting their copy.
                applog(&format!("recovery: could not copy document {session}: {e}"));
                failure = Some(e);
            }
        }
    }
    let mut wrote = false;
    with_recovery(app, |store| {
        for snapshot in &snapshots {
            let slot = store
                .slot(&recovery::slot_key(launch_id(), snapshot.session))
                .ok_or("the recovery slot name is not valid")?;
            match &snapshot.bytes {
                Some(bytes) => {
                    let record = recovery::RecoveryRecord {
                        original_path: snapshot.path.clone(),
                        saved_at: unix_now(),
                        app_version: env!("CARGO_PKG_VERSION").to_string(),
                    };
                    slot.write(bytes, &record)
                        .map_err(|e| format!("Failed to write the recovery copy: {e}"))?;
                    wrote = true;
                }
                None => slot.clear().map_err(|e| e.to_string())?,
            }
        }
        Ok(())
    })?;
    match failure {
        Some(e) if !wrote => Err(e),
        _ => Ok(wrote),
    }
}

fn finish_recovery_on_exit(app: &tauri::AppHandle) {
    let decided = app
        .try_state::<close_guard::CloseGuard>()
        .is_some_and(|g| g.was_confirmed());
    let unsaved = app
        .try_state::<close_guard::CloseGuard>()
        .is_some_and(|g| g.frontend_dirty())
        || backend_document_modified(app);
    if decided || !unsaved {
        clear_recovery_of_this_launch(app);
        return;
    }
    let Some(state) = app.try_state::<AppState>() else {
        return;
    };
    match write_recovery_copies(app, &state) {
        Ok(true) => applog("recovery: the app is exiting with unsaved changes; a last copy was kept"),
        Ok(false) => {}
        Err(e) => applog(&format!("recovery: could not write a last copy on exit: {e}")),
    }
}

fn unix_now() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0)
}

/// Write a recovery copy of every open document with unsaved changes.
/// Returns whether a copy was written.
#[tauri::command]
async fn write_recovery_copy(state: State<'_, AppState>, app: tauri::AppHandle) -> Result<bool, String> {
    write_recovery_copies(&app, &state)
}

/// The oldest recovery copy on disk, if any: a previous launch's, or one this
/// launch has written since. The journeys read it to see that a copy exists.
#[tauri::command]
fn pending_recovery(app: tauri::AppHandle) -> Option<recovery::RecoveryRecord> {
    with_recovery(&app, |store| {
        Ok(store.pending_all(None).into_iter().next().map(|(_, record)| record))
    })
    .ok()
    .flatten()
}

/// A copy a previous launch left behind, and the slot it sits in.
#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct PendingRecovery {
    slot: String,
    #[serde(flatten)]
    record: recovery::RecoveryRecord,
}

/// Every copy a previous launch left behind: one per document that was open
/// and unsaved when the app stopped.
#[tauri::command]
fn pending_recoveries(app: tauri::AppHandle) -> Vec<PendingRecovery> {
    let found = with_recovery(&app, |store| {
        Ok(store
            .pending_all(Some(launch_id()))
            .into_iter()
            .map(|(slot, record)| PendingRecovery { slot, record })
            .collect())
    });
    match found {
        Ok(list) => list,
        Err(e) => {
            applog(&format!("recovery: could not look for copies from an earlier launch: {e}"));
            Vec::new()
        }
    }
}

/// Copy a recovered document out of its slot and return its path, for the
/// webview to open through the ordinary open path. Without `slot`, the first
/// pending copy.
#[tauri::command]
fn restore_recovery(app: tauri::AppHandle, slot: Option<String>) -> Result<String, String> {
    with_recovery(&app, |root| {
        let key = match slot {
            Some(key) => key,
            None => root
                .pending_all(Some(launch_id()))
                .into_iter()
                .next()
                .ok_or("there is no recovery copy to restore")?
                .0,
        };
        let source = root.slot(&key).ok_or("the recovery slot name is not valid")?;
        let dir = root
            .document_path()
            .parent()
            .map(|p| p.to_path_buf())
            .ok_or("the recovery folder is not available")?;
        // Earlier restored copies are litter, but one restored a moment ago may
        // still be open in a tab: only the old ones go.
        if let Ok(entries) = std::fs::read_dir(&dir) {
            let hour = std::time::Duration::from_secs(3600);
            for entry in entries.flatten() {
                if !entry.file_name().to_string_lossy().starts_with("restored-") {
                    continue;
                }
                let old = entry
                    .metadata()
                    .and_then(|m| m.modified())
                    .ok()
                    .and_then(|t| t.elapsed().ok())
                    .is_some_and(|age| age > hour);
                if old {
                    if let Err(e) = std::fs::remove_file(entry.path()) {
                        applog(&format!("recovery: could not remove an earlier restored copy: {e}"));
                    }
                }
            }
        }
        static RESTORED: std::sync::atomic::AtomicU64 = std::sync::atomic::AtomicU64::new(0);
        let n = RESTORED.fetch_add(1, Ordering::SeqCst);
        let target = dir.join(format!("restored-{}-{n}.pdf", unix_now()));
        source
            .take_copy(&target)
            .map_err(|e| format!("Failed to restore the recovery copy: {e}"))?;
        Ok(target.to_string_lossy().into_owned())
    })
}

/// The restored document is unsaved work on the original file: mark it
/// modified and point Save at where it came from.
#[tauri::command]
fn adopt_recovered_document(state: State<AppState>, original_path: Option<String>) -> Result<(), String> {
    let mut current_path = state.current_path.lock().map_err(|e| e.to_string())?;
    state.with_document_mut(|doc| {
        doc.mark_unsaved();
        Ok(())
    })?;
    *current_path = original_path;
    Ok(())
}

/// Throw away a copy a previous launch left (`slot`). Without `slot`, the
/// first pending copy, as `restore_recovery` does.
#[tauri::command]
fn discard_recovery(app: tauri::AppHandle, slot: Option<String>) -> Result<(), String> {
    with_recovery(&app, |root| {
        let key = match slot {
            Some(key) => key,
            None => match root.pending_all(Some(launch_id())).into_iter().next() {
                Some((key, _)) => key,
                None => return Ok(()),
            },
        };
        root.slot(&key)
            .ok_or("the recovery slot name is not valid")?
            .clear()
            .map_err(|e| e.to_string())
    })
}

// ── Close / quit guard (J-81) ───────────────────────────────────────────
// See close_guard.rs for why the decision lives on this side.

/// Whether any of the backend's documents has unsaved changes. A document busy in
/// another command counts as modified: better one question too many than a
/// close in the middle of a save.
fn backend_document_modified(app: &tauri::AppHandle) -> bool {
    let Some(state) = app.try_state::<AppState>() else {
        return false;
    };
    let on_screen = match state.document.try_lock() {
        Ok(guard) => guard.as_ref().is_some_and(|doc| doc.modified),
        Err(_) => true,
    };
    if on_screen {
        return true;
    }
    // A document in another tab counts too: closing the app loses it as well.
    state
        .sessions
        .try_lock()
        .map_or(true, |book| book.parked().iter().any(|p| p.doc.modified))
}

/// Ask the guard; when it holds the close, tell the webview why.
fn close_requested(app: &tauri::AppHandle, kind: &'static str) -> close_guard::CloseDecision {
    let document_modified = backend_document_modified(app);
    let decision = app
        .state::<close_guard::CloseGuard>()
        .on_close_requested(document_modified, std::time::Instant::now());
    if decision == close_guard::CloseDecision::AskFrontend {
        let request = close_guard::CloseRequest { kind, document_modified };
        if let Err(e) = app.emit(close_guard::CLOSE_REQUESTED_EVENT, request) {
            applog(&format!("close guard: could not ask the webview: {e}"));
        }
    }
    decision
}

/// The webview reports whether it holds unsaved changes.
#[tauri::command]
fn set_unsaved_changes(guard: tauri::State<'_, close_guard::CloseGuard>, dirty: bool) {
    guard.set_frontend_dirty(dirty);
}

/// The webview received a close request.
#[tauri::command]
fn acknowledge_close_request(guard: tauri::State<'_, close_guard::CloseGuard>) {
    guard.acknowledge();
}

/// The user saved or chose not to: close the app.
#[tauri::command]
fn confirm_close(app: tauri::AppHandle, guard: tauri::State<'_, close_guard::CloseGuard>) {
    guard.confirm();
    applog("close guard: close confirmed by the user");
    app.exit(0);
}

impl AppState {
    /// The slot, its path and the book of parked documents together, taken in
    /// the order everything agrees on. For the few operations that move a
    /// document between them (open, switch, close).
    fn with_sessions<F, R>(&self, f: F) -> Result<R, String>
    where
        F: FnOnce(
            &mut sessions::SessionBook<OpenDocument>,
            &mut Option<OpenDocument>,
            &mut Option<String>,
        ) -> R,
    {
        let mut path = self.current_path.lock().map_err(|e| e.to_string())?;
        let mut book = self.sessions.lock().map_err(|e| e.to_string())?;
        let mut document = self.document.lock().map_err(|e| e.to_string())?;
        Ok(f(&mut book, &mut document, &mut path))
    }

    /// The id of the document on screen, if one is open.
    fn active_session_id(&self) -> Option<sessions::SessionId> {
        self.sessions.lock().ok().and_then(|book| book.active())
    }

    fn with_document<F, R>(&self, f: F) -> Result<R, String>
    where
        F: FnOnce(&OpenDocument) -> Result<R, String>,
    {
        let guard = self.document.lock().map_err(|e| e.to_string())?;
        let doc = guard.as_ref().ok_or("No PDF file open")?;
        f(doc)
    }

    /// Clone the render-source Arc under a brief lock so the actual render can
    /// run on a worker thread without holding the document mutex.
    fn render_snapshot(&self) -> Result<std::sync::Arc<SdkDocument>, String> {
        let guard = self.document.lock().map_err(|e| e.to_string())?;
        let doc = guard.as_ref().ok_or("No PDF file open")?;
        Ok(doc.render_snapshot())
    }

    fn with_document_mut<F, R>(&self, f: F) -> Result<R, String>
    where
        F: FnOnce(&mut OpenDocument) -> Result<R, String>,
    {
        let mut guard = self.document.lock().map_err(|e| e.to_string())?;
        let doc = guard.as_mut().ok_or("No PDF file open")?;
        f(doc)
    }

    /// A user action that changes the document: it becomes one undo step
    /// (J-85), and the webview hears the new undo/redo state. Every mutating
    /// command uses this instead of `with_document_mut`;
    /// `every_mutating_command_records_an_undo_step` keeps that list honest.
    fn with_document_edit<F, R>(&self, label: &str, f: F) -> Result<R, String>
    where
        F: FnOnce(&mut OpenDocument) -> Result<R, String>,
    {
        let (result, history) = {
            let mut guard = self.document.lock().map_err(|e| e.to_string())?;
            let doc = guard.as_mut().ok_or("No PDF file open")?;
            let result = doc.edit(label, f);
            (result, doc.history_state())
        };
        self.announce_history(&history);
        result
    }

    /// After a save, open, close or sign: the controls follow the document.
    fn announce_current_history(&self) {
        let history = match self.document.lock() {
            Ok(guard) => guard
                .as_ref()
                .map_or_else(|| history::History::<()>::default().state(false), |d| d.history_state()),
            Err(e) => {
                applog(&format!("history: document lock poisoned: {e}"));
                return;
            }
        };
        self.announce_history(&history);
    }

    fn announce_history(&self, history: &history::HistoryState) {
        if let Some(app) = self.app.get() {
            if let Err(e) = app.emit(DOCUMENT_HISTORY_EVENT, history) {
                applog(&format!("history: could not announce the undo state: {e}"));
            }
        }
    }
}

// ── Undo / redo (J-85) ────────────────────────────────────────────────

/// What the webview needs after undo or redo: the controls' new state and
/// the document's shape, which the step may have changed (a page deleted,
/// the title edited).
#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct HistoryStepResult {
    applied: bool,
    history: history::HistoryState,
    document: DocumentInfo,
}

fn history_step(state: &State<AppState>, redo: bool) -> Result<HistoryStepResult, String> {
    let result = state.with_document_mut(|doc| {
        let applied = if redo { doc.redo()? } else { doc.undo()? };
        Ok(HistoryStepResult { applied, history: doc.history_state(), document: doc.document_info() })
    })?;
    state.announce_history(&result.history);
    Ok(result)
}

#[tauri::command]
fn undo_document(state: State<AppState>) -> Result<HistoryStepResult, String> {
    history_step(&state, false)
}

#[tauri::command]
fn redo_document(state: State<AppState>) -> Result<HistoryStepResult, String> {
    history_step(&state, true)
}

/// The current undo/redo state; with no document open, nothing to undo.
#[tauri::command]
fn get_document_history(state: State<AppState>) -> Result<history::HistoryState, String> {
    let guard = state.document.lock().map_err(|e| e.to_string())?;
    Ok(match guard.as_ref() {
        Some(doc) => doc.history_state(),
        None => history::History::<()>::default().state(false),
    })
}

/// Edits between `begin_edit_group` and `end_edit_group` undo as one step.
#[tauri::command]
fn begin_edit_group(state: State<AppState>, label: String) -> Result<(), String> {
    state.with_document_mut(|doc| {
        doc.begin_edit_group(&label);
        Ok(())
    })
}

#[tauri::command]
fn end_edit_group(state: State<AppState>) -> Result<(), String> {
    state.with_document_mut(|doc| {
        doc.end_edit_group();
        Ok(())
    })
}

fn sanitize_scale(raw: Option<f32>) -> f32 {
    let value = raw.unwrap_or(2.0);
    if value.is_finite() && value > 0.0 {
        value.clamp(0.1, 12.0)
    } else {
        2.0
    }
}


fn current_path_for_policy(state: &State<'_, AppState>) -> Result<Option<String>, String> {
    let current_path = state.current_path.lock().map_err(|e| e.to_string())?;
    Ok(current_path.clone())
}

fn dialog_path_to_string(path: tauri_plugin_dialog::FilePath) -> Result<String, String> {
    path.into_path()
        .map(|path| path.to_string_lossy().into_owned())
        .map_err(|e| format!("Invalid dialog path: {e}"))
}

/// The journey suite's answer for a native dialog opened from Rust, in an e2e
/// build (`--features e2e`, see e2e.rs): `Some` replaces the panel, `None`
/// shows it. Always `None` in every other build.
fn e2e_dialog_answer() -> Option<Option<tauri_plugin_dialog::FilePath>> {
    #[cfg(feature = "e2e")]
    {
        e2e::take_dialog_answer()
            .map(|answer| answer.map(|p| tauri_plugin_dialog::FilePath::Path(std::path::PathBuf::from(p))))
    }
    #[cfg(not(feature = "e2e"))]
    {
        None
    }
}

fn native_feature(
    status: &'static str,
    provider: impl Into<String>,
    detail: impl Into<String>,
    local_only: bool,
) -> NativeFeatureCapability {
    NativeFeatureCapability {
        status,
        available: matches!(status, "available" | "fallback"),
        provider: provider.into(),
        detail: detail.into(),
        local_only,
    }
}

fn platform_name() -> &'static str {
    #[cfg(target_os = "macos")]
    {
        return "macos";
    }
    #[cfg(target_os = "windows")]
    {
        return "windows";
    }
    #[cfg(target_os = "linux")]
    {
        return "linux";
    }
    #[allow(unreachable_code)]
    "unknown"
}

fn command_available(binary: &str) -> bool {
    let Some(paths) = std::env::var_os("PATH") else {
        return false;
    };

    #[cfg(target_os = "windows")]
    let candidates: Vec<String> = {
        let path_ext = std::env::var_os("PATHEXT")
            .map(|raw| {
                raw.to_string_lossy()
                    .split(';')
                    .filter(|entry| !entry.is_empty())
                    .map(|entry| entry.to_ascii_lowercase())
                    .collect::<Vec<_>>()
            })
            .unwrap_or_else(|| vec![".exe".into(), ".cmd".into(), ".bat".into()]);
        if std::path::Path::new(binary).extension().is_some() {
            vec![binary.to_string()]
        } else {
            path_ext
                .into_iter()
                .map(|ext| format!("{binary}{ext}"))
                .chain(std::iter::once(binary.to_string()))
                .collect()
        }
    };

    #[cfg(not(target_os = "windows"))]
    let candidates = [binary.to_string()];

    std::env::split_paths(&paths).any(|dir| {
        candidates
            .iter()
            .map(|candidate| dir.join(candidate))
            .any(|path| path.is_file())
    })
}

/// Open the bundled open-source notices (third-party licenses/attributions) in
/// the OS default viewer. These are SEPARATE from the proprietary EULA — the
/// "Open Source Notices" menu item must never route to the commercial license
/// page. Falls back to the website when the bundled files are absent (e.g. a
/// dev run that did not package resources).
fn open_oss_notices(app: &tauri::AppHandle) {
    if let Ok(resource_dir) = app.path().resource_dir() {
        for name in ["legal/THIRD_PARTY.md", "legal/THIRD_PARTY_ATTRIBUTIONS.md"] {
            let path = resource_dir.join(name);
            if path.is_file() {
                let _ = open::that(&path);
                return;
            }
        }
    }
    let _ = telemetry::open_external_url(WEBSITE_URL.to_string());
}

fn configure_bundled_font_cache(app: &tauri::App) {
    let Ok(resource_dir) = app.path().resource_dir() else {
        return;
    };

    let bundled_font_cache = resource_dir
        .join("resources")
        .join("fonts")
        .join("liberation-2.1.5");

    if bundled_font_cache.is_dir() {
        std::env::set_var("XFA_FONT_CACHE", bundled_font_cache);
    }

    signature_fonts::set_resource_dir(resource_dir.join("resources").join("fonts").join("signature"));
}

#[tauri::command]
fn get_native_capabilities(app: tauri::AppHandle) -> NativeCapabilities {
    // OCR is the Tesseract that ships inside the app: "available" when the
    // bundle is complete, "unavailable" (with the reason in the log and in
    // Settings) when a defective build lacks part of it.
    let ocr = match ocr_component_status_for(&app) {
        Ok(status) if status.installed => native_feature(
            "available",
            "Tesseract (built in)",
            "OCR runs on this machine with the Tesseract that is part of the app.",
            true,
        ),
        _ => native_feature(
            "unavailable",
            "Tesseract (built in)",
            "The Tesseract component that belongs to this build is missing or incomplete.",
            true,
        ),
    };

    let tts = match platform_name() {
        "macos" => native_feature("available", "macOS say / AVSpeech", "System voices are available on this device.", true),
        "windows" => native_feature("available", "Windows SAPI", "Installed Windows voices are used on this device.", true),
        "linux" if command_available("spd-say") => native_feature("available", "Speech Dispatcher", "spd-say is available on this system.", true),
        "linux" => native_feature("unavailable", "Speech Dispatcher", "Install Speech Dispatcher to enable read aloud.", true),
        _ => native_feature("unavailable", "No OS text-to-speech", "No supported local text-to-speech provider found.", true),
    };

    NativeCapabilities {
        platform: platform_name(),
        ocr,
        tts,
        scanner: match platform_name() {
            "linux" if command_available("scanimage") => native_feature("available", "SANE", "scanimage is available for scanner detection.", true),
            "macos" => native_feature("planned", "ImageCaptureCore", "The scanner adapter becomes available once the native bridge is active.", true),
            "windows" => native_feature("planned", "WIA / Windows.Devices.Scanners", "The scanner adapter becomes available once the native bridge is active.", true),
            _ => native_feature("unavailable", "No scanner adapter", "No supported scanner provider found.", true),
        },
        spellcheck: native_feature(
            "fallback",
            "WebView spellcheck",
            "Input fields use the spellcheck of the webview or OS where available.",
            true,
        ),
        dictation: native_feature(
            "planned",
            "OS dictation",
            "Dictation stays hidden until a local platform adapter is available.",
            true,
        ),
        share: native_feature(
            "available",
            "File system and mailto",
            "Sharing creates local files or email drafts, without uploading anything.",
            true,
        ),
        secure_storage: match platform_name() {
            "macos" => native_feature("planned", "Keychain", "Secure storage goes through Keychain once the adapter is active.", true),
            "windows" => native_feature("planned", "Credential Manager", "Secure storage goes through Credential Manager once the adapter is active.", true),
            "linux" => native_feature("planned", "Secret Service", "Secure storage goes through the Linux secret store when one is present.", true),
            _ => native_feature("unavailable", "No secret store", "No supported secure storage found.", true),
        },
    }
}

fn build_tts_command(payload: &NativeTtsRequest) -> Result<(Command, &'static str, Option<String>), String> {
    let rate = payload.rate.unwrap_or(1.0).clamp(0.5, 2.0);

    #[cfg(target_os = "macos")]
    {
        let mut command = Command::new("say");
        command.arg("-r").arg(format!("{}", (200.0 * rate).round() as u32));
        let selected_voice = payload
            .voice
            .as_ref()
            .filter(|voice| !voice.trim().is_empty())
            .cloned()
            .or_else(|| payload.language.as_deref().and_then(macos_voice_for_language));
        if let Some(voice) = selected_voice {
            command.arg("-v").arg(&voice);
            command.arg(&payload.text);
            return Ok((command, "macOS say", Some(voice)));
        }
        command.arg(&payload.text);
        return Ok((command, "macOS say", None));
    }

    #[cfg(target_os = "windows")]
    {
        let sapi_rate = ((rate - 1.0) * 5.0).round().clamp(-5.0, 5.0) as i32;
        let mut command = Command::new("powershell");
        command
            .arg("-NoProfile")
            .arg("-NonInteractive")
            .arg("-Command")
            .arg(format!(
                "$voice = New-Object -ComObject SAPI.SpVoice; $voice.Rate = {sapi_rate}; [void]$voice.Speak($env:PDFLUENT_TTS_TEXT)"
            ))
            .env("PDFLUENT_TTS_TEXT", &payload.text);
        return Ok((command, "Windows SAPI", None));
    }

    #[cfg(target_os = "linux")]
    {
        if !command_available("spd-say") {
            return Err("Speech Dispatcher is not available on this system.".into());
        }
        let mut command = Command::new("spd-say");
        command.arg("--rate").arg(format!("{}", ((rate - 1.0) * 50.0).round() as i32));
        if let Some(language) = payload.language.as_ref().filter(|language| !language.trim().is_empty()) {
            command.arg("--language").arg(language);
        }
        command.arg(&payload.text);
        return Ok((command, "Speech Dispatcher", None));
    }

    #[allow(unreachable_code)]
    Err("Read aloud is not supported on this platform.".into())
}

#[cfg(target_os = "macos")]
fn macos_voice_for_language(language: &str) -> Option<String> {
    let desired = normalize_language(language);
    if desired.is_empty() {
        return None;
    }
    let output = Command::new("say").arg("-v").arg("?").output().ok()?;
    let stdout = String::from_utf8_lossy(&output.stdout);
    let desired_base = desired.split('_').next().unwrap_or(&desired);
    let mut best_match: Option<(String, i32)> = None;

    for line in stdout.lines() {
        let before_comment = line.split('#').next().unwrap_or(line).trim_end();
        let mut parts = before_comment.rsplitn(2, char::is_whitespace);
        let locale = parts.next().unwrap_or("").trim();
        let voice_name = parts.next().unwrap_or("").trim();
        if voice_name.is_empty() || locale.is_empty() {
            continue;
        }
        let normalized_locale = normalize_language(locale);
        let locale_base = normalized_locale.split('_').next().unwrap_or("");
        let locale_score = if normalized_locale == desired {
            100
        } else if locale_base == desired_base {
            60
        } else {
            continue;
        };
        let score = locale_score + macos_voice_quality_score(voice_name, desired_base);
        if best_match
            .as_ref()
            .map(|(_, current_score)| score > *current_score)
            .unwrap_or(true)
        {
            best_match = Some((voice_name.to_string(), score));
        }
    }

    best_match.map(|(voice, _)| voice)
}

#[cfg(target_os = "macos")]
fn macos_voice_quality_score(voice_name: &str, language_base: &str) -> i32 {
    let lower = voice_name.to_lowercase();
    let novelty = [
        "albert", "bad news", "bahh", "bells", "boing", "bubbles", "cellos", "good news",
        "jester", "junior", "organ", "ralph", "superstar", "trinoids", "whisper", "wobble",
        "zarvox",
    ];
    if novelty.iter().any(|name| lower.contains(name)) {
        return -80;
    }

    let preferred: &[&str] = match language_base {
        "en" => &[
            "samantha", "eddy", "flo", "shelley", "reed", "daniel", "karen", "moira", "kathy",
        ],
        "nl" => &["xander", "claire", "ellen"],
        "de" => &["anna", "eddy", "flo", "shelley", "reed"],
        "fr" => &["amelie", "thomas", "eddy", "flo", "shelley"],
        "es" => &["monica", "paulina", "eddy", "flo", "shelley"],
        _ => &["eddy", "flo", "shelley", "reed"],
    };

    preferred
        .iter()
        .position(|name| lower.contains(name))
        .map(|idx| 50 - idx as i32)
        .unwrap_or(0)
}

// Only macos_voice_for_language calls this; without the gate the Linux build
// fails clippy's -D warnings on dead code.
#[cfg(target_os = "macos")]
fn normalize_language(language: &str) -> String {
    language.trim().replace('-', "_").to_lowercase()
}


#[tauri::command]
fn native_tts_speak(state: State<AppState>, payload: NativeTtsRequest) -> Result<NativeTtsResult, String> {
    let text = payload.text.trim();
    if text.is_empty() {
        return Err("There is no text to read aloud.".into());
    }

    {
        let mut guard = state.tts_child.lock().map_err(|e| e.to_string())?;
        if let Some(mut child) = guard.take() {
            let _ = child.kill();
            let _ = child.wait();
        }
    }

    let (mut command, provider, selected_voice) = build_tts_command(&payload)?;
    let child = command
        .spawn()
        .map_err(|e| format!("Could not start read aloud: {e}"))?;

    let mut guard = state.tts_child.lock().map_err(|e| e.to_string())?;
    *guard = Some(child);

    Ok(NativeTtsResult {
        provider: provider.into(),
        language: payload.language.clone(),
        voice: selected_voice.or_else(|| payload.voice.clone()),
    })
}

#[tauri::command]
fn native_tts_stop(state: State<AppState>) -> Result<(), String> {
    let mut guard = state.tts_child.lock().map_err(|e| e.to_string())?;
    if let Some(mut child) = guard.take() {
        let _ = child.kill();
        let _ = child.wait();
    }
    Ok(())
}

#[cfg(any(target_os = "macos", target_os = "linux"))]
fn signal_tts_child(state: State<AppState>, signal: &str) -> Result<(), String> {
    let guard = state.tts_child.lock().map_err(|e| e.to_string())?;
    let Some(child) = guard.as_ref() else {
        return Ok(());
    };

    let status = Command::new("kill")
        .arg(signal)
        .arg(child.id().to_string())
        .status()
        .map_err(|e| format!("Could not pause read aloud: {e}"))?;

    if status.success() {
        Ok(())
    } else {
        Err(format!("Could not pause read aloud: the process refused signal {signal}."))
    }
}

#[tauri::command]
fn native_tts_pause(state: State<AppState>) -> Result<(), String> {
    #[cfg(any(target_os = "macos", target_os = "linux"))]
    {
        signal_tts_child(state, "-STOP")
    }

    #[cfg(not(any(target_os = "macos", target_os = "linux")))]
    {
        let _ = state;
        Err("Pausing read aloud is not supported on this platform yet.".into())
    }
}

#[tauri::command]
fn native_tts_resume(state: State<AppState>) -> Result<(), String> {
    #[cfg(any(target_os = "macos", target_os = "linux"))]
    {
        signal_tts_child(state, "-CONT")
    }

    #[cfg(not(any(target_os = "macos", target_os = "linux")))]
    {
        let _ = state;
        Err("Resuming read aloud is not supported on this platform yet.".into())
    }
}

#[tauri::command]
async fn open_pdf(
    state: State<'_, AppState>,
    path: String,
    // A user password for a protected PDF, after `password-required`. Used
    // for this open and dropped: never logged, never stored.
    password: Option<String>,
) -> Result<DocumentInfo, OpenError> {
    perf::mark("open_requested");
    applog(&format!("open_pdf: validating selected path (len {})", path.len()));
    // The rejection is a code plus a detail (open_error.rs); the frontend
    // shows its own text for the code, and the detail only reaches this log.
    let refused = |e: OpenError| {
        applog(&format!("open_pdf: refused {}: {}", e.code.as_str(), e.detail));
        e
    };
    let path = validate_open_path(&path).map_err(refused)?;
    applog("open_pdf: path validated; parsing document on worker thread");

    // Parse + (for XFA docs) one-time flatten on a worker thread so the main
    // thread keeps servicing UI events during open.
    let open_path = path.clone();
    let doc = tauri::async_runtime::spawn_blocking(move || {
        OpenDocument::open_checked(&open_path, password.as_deref(), &OpenLimits::default())
    })
        .await
        .map_err(|e| OpenError::new(OpenErrorCode::Unknown, e.to_string()))?
        .map_err(refused)?;
    // The text stays byte-identical: scripts/perf/measure-open.sh and the
    // phase-1 measurements both grep for it.
    applog("open_pdf: document parsed OK");
    perf::mark("parsed");
    let info = doc.document_info();
    perf::mark("info_built");

    // A new session beside the others (J-90): the document that was on
    // screen is parked with its undo steps, its unsaved changes and its path,
    // not closed. Closing is `close_session`.
    let lock_failed = |e: String| OpenError::new(OpenErrorCode::Unknown, e);
    let session = state
        .with_sessions(|book, slot, slot_path| book.open(slot, slot_path, doc, Some(path)))
        .map_err(lock_failed)?;
    state.announce_current_history();

    let mut info = info;
    info.session_id = Some(session);
    Ok(info)
}

#[tauri::command]
// async so Tauri runs this on a worker thread, not the main thread. The
// `blocking_*` native dialog dispatches the panel to the (free) main thread and
// blocks the worker for the result; if this ran on the main thread it would
// deadlock the app (panel needs the main run loop that the call is blocking).
async fn pick_pdf_dialog(app: tauri::AppHandle) -> Result<Option<String>, String> {
    let selected = match e2e_dialog_answer() {
        Some(answer) => answer,
        None => app.dialog().file().add_filter("PDF", &["pdf"]).blocking_pick_file(),
    };
    let Some(selected) = selected else {
        return Ok(None);
    };

    let raw_path = dialog_path_to_string(selected)?;
    security::validate_pdf_input_path(&raw_path).map(Some)
}

/// Pick a PNG or JPEG for a placement and return it as a data URL; `None` when
/// the panel is cancelled (J-45). Async for the reason `pick_pdf_dialog` is.
#[tauri::command]
async fn pick_image_dialog(app: tauri::AppHandle) -> Result<Option<String>, String> {
    let selected = match e2e_dialog_answer() {
        Some(answer) => answer,
        None => app
            .dialog()
            .file()
            .add_filter("Image", &["png", "jpg", "jpeg"])
            .blocking_pick_file(),
    };
    let Some(selected) = selected else {
        return Ok(None);
    };
    let path = selected
        .into_path()
        .map_err(|e| format!("Invalid picture path: {e}"))?;
    image_pick::read_picture(&path).map(Some)
}

// ── Recent-file security-scoped bookmarks (macOS App Sandbox) ──────────────
// The bookmark blobs live ONLY here, in the app container's Application Support
// directory (under the sandbox `dirs::home_dir()` resolves to the container).
// The frontend only ever passes file PATHS across the bridge — never a bookmark.

fn bookmarks_store_path() -> Option<std::path::PathBuf> {
    dirs::home_dir()
        .map(|h| h.join("Library/Application Support/com.pdfluent.app/recent-bookmarks.json"))
}

fn load_bookmarks() -> std::collections::HashMap<String, String> {
    let Some(path) = bookmarks_store_path() else {
        return std::collections::HashMap::new();
    };
    let Ok(raw) = std::fs::read_to_string(&path) else {
        return std::collections::HashMap::new();
    };
    serde_json::from_str(&raw).unwrap_or_default()
}

fn save_bookmarks(map: &std::collections::HashMap<String, String>) {
    let Some(path) = bookmarks_store_path() else {
        return;
    };
    if let Some(parent) = path.parent() {
        let _ = std::fs::create_dir_all(parent);
    }
    if let Ok(json) = serde_json::to_string(map) {
        let _ = std::fs::write(&path, json);
    }
}

const MAX_REMEMBERED_BOOKMARKS: usize = 32;

/// Mint and persist a security-scoped bookmark (in the app container) for a file
/// the user just opened, so it can be reopened from Recent after a sandboxed
/// relaunch. The bookmark blob never crosses to the frontend. macOS-only;
/// returns false elsewhere or when the OS declines to vend a bookmark.
#[tauri::command]
fn remember_file_access(path: String) -> bool {
    let Some(bookmark) = pdfluent_macos_secure::bookmark_for_path(&path) else {
        return false;
    };
    let mut map = load_bookmarks();
    map.insert(path, bookmark);
    if map.len() > MAX_REMEMBERED_BOOKMARKS {
        let extra: Vec<String> = map
            .keys()
            .take(map.len() - MAX_REMEMBERED_BOOKMARKS)
            .cloned()
            .collect();
        for key in extra {
            map.remove(&key);
        }
    }
    save_bookmarks(&map);
    true
}

/// Resolve the stored bookmark for a recent file and begin security-scoped
/// access so the path becomes readable again after relaunch. The frontend passes
/// only the path. Returns true if access is now active. No-op off macOS.
#[tauri::command]
fn prepare_recent_open(path: String) -> bool {
    let map = load_bookmarks();
    let Some(bookmark) = map.get(&path) else {
        applog("prepare_recent_open: no stored bookmark for this path");
        return false;
    };
    match pdfluent_macos_secure::resolve_and_start(bookmark) {
        Some((_resolved, stale)) => {
            applog(&format!(
                "prepare_recent_open: scoped access started (stale={stale}, active_scopes={})",
                pdfluent_macos_secure::active_count()
            ));
            true
        }
        None => {
            applog("prepare_recent_open: bookmark resolve/start failed");
            false
        }
    }
}

/// Stop security-scoped access for a path (call on document close / change) to
/// balance `prepare_recent_open`. No-op for never-resolved paths.
#[tauri::command]
fn release_file_access(path: String) {
    let stopped = pdfluent_macos_secure::stop_access(&path);
    applog(&format!(
        "release_file_access: stopped={stopped} (active_scopes={})",
        pdfluent_macos_secure::active_count()
    ));
}

/// Diagnostic: number of security-scoped resources currently being accessed.
/// Validation asserts the balance returns to 0 after documents close.
/// Debug-only — never compiled into a release build (used by the self-test).
#[cfg(debug_assertions)]
#[tauri::command]
fn active_scope_count() -> usize {
    pdfluent_macos_secure::active_count()
}

/// Diagnostic: read actual file CONTENT WITHOUT resolving any bookmark. Under
/// the sandbox a recent path in a fresh process is denied (EPERM) for
/// file-read-data — proving a successful open afterwards is due to the
/// security-scoped bookmark, not a cached/process-wide grant. (Note: `stat`/
/// metadata is allowed broadly by the sandbox and would NOT prove anything, so
/// this opens the file and reads bytes.) Returns bytes read on success.
/// Debug-only — never compiled into a release build (used by the self-test).
#[cfg(debug_assertions)]
#[tauri::command]
fn probe_raw_access(path: String) -> Result<u64, String> {
    use std::io::Read as _;
    let mut file = std::fs::File::open(&path).map_err(|e| format!("open: {e}"))?;
    let mut buf = [0u8; 16];
    let read = file.read(&mut buf).map_err(|e| format!("read: {e}"))?;
    Ok(read as u64)
}

/// Debug-only security-scoped-bookmark self-test. Gated behind the
/// `PDFLUENT_SELFTEST` env var; runs the round-trip, logs each step to stderr
/// and the durable log, then exits. NEVER compiled into release builds.
#[cfg(debug_assertions)]
fn selftest_arg(flag: &str) -> Option<String> {
    // Read `--flag value` from argv (passed via `open -a App --args ...`, the
    // only launch path that enters the macOS sandbox) or the matching env var.
    let args: Vec<String> = std::env::args().collect();
    if let Some(i) = args.iter().position(|a| a == flag) {
        if let Some(v) = args.get(i + 1) {
            return Some(v.clone());
        }
    }
    let env_key = match flag {
        "--selftest" => "PDFLUENT_SELFTEST",
        "--selftest-path" => "PDFLUENT_SELFTEST_PATH",
        _ => return None,
    };
    std::env::var(env_key).ok()
}

#[cfg(debug_assertions)]
fn maybe_run_bookmark_selftest() {
    let Some(mode) = selftest_arg("--selftest") else {
        return;
    };
    let path = selftest_arg("--selftest-path").unwrap_or_default();
    let line = |m: &str| {
        eprintln!("[SELFTEST] {m}");
        applog(&format!("SELFTEST {m}"));
    };
    line(&format!(
        "mode={mode} pid={} path_present={}",
        std::process::id(),
        !path.is_empty()
    ));

    match mode.as_str() {
        // Session 1: the app was launched WITH the file, so it is accessible;
        // mint + persist a bookmark for it.
        "mint" => {
            let raw = probe_raw_access(path.clone());
            line(&format!("mint raw_access_before={raw:?}"));
            let ok = remember_file_access(path.clone());
            line(&format!("mint remember_file_access={ok}"));
        }
        // Session 2 (fresh process): the raw path must be DENIED until the stored
        // bookmark is resolved — proving access comes from the bookmark, not a
        // cached/process-wide grant — then balanced by a stop.
        "resolve" => {
            let before = probe_raw_access(path.clone());
            line(&format!("resolve raw_BEFORE_bookmark={before:?} (expect Err/EPERM)"));
            let map = load_bookmarks();
            match map.get(&path) {
                None => line("resolve NO_BOOKMARK_STORED"),
                Some(bookmark) => {
                    line(&format!("resolve bookmark_len={}", bookmark.len()));
                    match pdfluent_macos_secure::resolve_and_start(bookmark) {
                        Some((resolved, stale)) => {
                            line(&format!(
                                "resolve resolved_path={resolved} stale={stale} active_scopes={}",
                                active_scope_count()
                            ));
                            let after = probe_raw_access(resolved.clone());
                            line(&format!("resolve raw_AFTER_at_resolved={after:?} (expect Ok)"));
                            let stopped = pdfluent_macos_secure::stop_access(&resolved);
                            line(&format!(
                                "resolve stop_access={stopped} active_scopes={} (expect 0)",
                                active_scope_count()
                            ));
                        }
                        None => line("resolve RESOLVE_FAILED (None)"),
                    }
                }
            }
        }
        // Confirm bookmarks are stored only in the app container + count them.
        "store-dump" => {
            let store = bookmarks_store_path();
            let map = load_bookmarks();
            line(&format!("store_path={store:?} entries={}", map.len()));
        }
        other => line(&format!("unknown mode {other}")),
    }

    let stopped = pdfluent_macos_secure::stop_all();
    line(&format!(
        "done stop_all={stopped} active_scopes={} (expect 0)",
        active_scope_count()
    ));
    std::process::exit(0);
}

/// Close the document on screen. With other documents open, the caller
/// activates one of them next; `close_session` closes one by id.
#[tauri::command]
fn close_pdf(state: State<AppState>, app: tauri::AppHandle) -> Result<(), String> {
    let closed = state.with_sessions(|book, slot, slot_path| match book.active() {
        Some(id) => book.close(slot, slot_path, id).ok().map(|_| id),
        None => {
            *slot = None;
            *slot_path = None;
            None
        }
    })?;
    state.announce_current_history();
    clear_recovery_for(&app, closed);
    Ok(())
}

/// The document's shape as the webview wants it: the engine's info with the
/// title and author the read-only facade reports.
fn full_document_info(doc: &OpenDocument) -> DocumentInfo {
    let mut info = doc.document_info();
    // Exercise the read-only facade metadata path for title/author.
    if let Ok((title, author)) = sdk_facade::document_metadata(&doc.raw_bytes) {
        info.title = title;
        info.author = author;
    }
    info
}

#[tauri::command]
fn get_document_info(state: State<AppState>) -> Result<DocumentInfo, String> {
    let session = state.active_session_id();
    state.with_document(|doc| {
        let mut info = full_document_info(doc);
        info.session_id = session;
        Ok(info)
    })
}

// ── Form scripts run only with the user's permission ────────────────────
//
// A document's scripts are data until the user allows them (script_consent.rs).
// The webview asks what a document carries, shows the bar, and reports the
// answer here; the permission lives on the open document, in Rust, so a
// script path cannot be reached by forgetting a check in the webview.

#[tauri::command]
fn get_form_scripts(state: State<AppState>) -> Result<script_consent::FormScriptsStatus, String> {
    state.with_document(|doc| Ok(doc.form_scripts_status()))
}

/// The organisation's choice from the OS-managed location (MDM profile on
/// macOS, HKLM policy on Windows), or null. It beats the setting and the
/// enterprise settings kept in the webview.
#[tauri::command]
async fn get_form_scripts_policy() -> Option<form_scripts_policy::FormScriptsPolicy> {
    form_scripts_policy::current()
}

/// Give or take back the permission. On a grant the form's initial scripts
/// run once and their effect is one undo step.
#[tauri::command]
async fn set_form_scripts_allowed(
    state: State<'_, AppState>,
    allowed: bool,
) -> Result<script_consent::FormScriptsOutcome, String> {
    form_scripts_policy::check_grant(form_scripts_policy::current(), allowed)?;
    state.with_document_edit("run-form-scripts", |doc| {
        let report = doc.set_scripts_allowed(allowed)?;
        Ok(script_consent::FormScriptsOutcome { status: doc.form_scripts_status(), report })
    })
}

// ── Several open documents (J-90) ───────────────────────────────────────

/// What the webview needs to show a document it switched to.
#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct SessionActivation {
    #[serde(flatten)]
    info: DocumentInfo,
    /// The document has unsaved changes (the webview's flag is rebuilt from it).
    modified: bool,
    /// Where Save writes to.
    path: Option<String>,
}

/// Make an open document the one on screen. The one that was on screen stays
/// open, with its undo steps and its unsaved changes.
#[tauri::command]
fn activate_session(state: State<AppState>, session_id: u64) -> Result<SessionActivation, String> {
    state.with_sessions(|book, slot, slot_path| {
        book.activate(slot, slot_path, session_id).map_err(|e| e.to_string())
    })??;
    state.announce_current_history();
    let path = state.current_path.lock().map_err(|e| e.to_string())?.clone();
    state.with_document(|doc| {
        let mut info = full_document_info(doc);
        info.session_id = Some(session_id);
        Ok(SessionActivation { info, modified: doc.modified, path })
    })
}

/// Close one open document by id, unsaved changes and all: the webview asked
/// the user first. Its recovery copy goes with it.
#[tauri::command]
fn close_session(state: State<AppState>, app: tauri::AppHandle, session_id: u64) -> Result<(), String> {
    let was_active = state.with_sessions(|book, slot, slot_path| {
        let was_active = book.active() == Some(session_id);
        book.close(slot, slot_path, session_id).map(|_| was_active).map_err(|e| e.to_string())
    })??;
    if was_active {
        state.announce_current_history();
    }
    clear_recovery_for(&app, Some(session_id));
    Ok(())
}

/// Free the memory of a document that is open in a tab but not on screen and
/// has nothing unsaved. The tab stays; the webview opens the file again when
/// the user comes back. Answers whether it was freed: a document with unsaved
/// changes, or the one on screen, is never dropped.
#[tauri::command]
fn hibernate_session(state: State<AppState>, session_id: u64) -> Result<bool, String> {
    state.with_sessions(|book, slot, slot_path| {
        if book.active() == Some(session_id) {
            return Ok(false);
        }
        let Some(parked) = book.parked().iter().find(|p| p.id == session_id) else {
            return Err(sessions::SessionError::NotFound(session_id).to_string());
        };
        if parked.doc.modified {
            return Ok(false);
        }
        book.close(slot, slot_path, session_id).map(|_| true).map_err(|e| e.to_string())
    })?
}

#[tauri::command(async)]
fn render_page(
    state: State<AppState>,
    page_index: u32,
    scale: Option<f32>,
) -> Result<RenderedPage, String> {
    let safe_scale = sanitize_scale(scale);
    state.with_document(|doc| doc.render_page(page_index, safe_scale))
}

#[tauri::command(async)]
fn render_thumbnail(state: State<AppState>, page_index: u32) -> Result<RenderedPage, String> {
    state.with_document(|doc| doc.render_thumbnail(page_index))
}

/// Binary IPC render: returns an 8-byte (width, height) LE header followed by
/// raw RGBA pixels. No PNG encode, no base64, no JSON envelope. The render runs
/// on a worker thread against an Arc snapshot, so the document mutex is held
/// only for the snapshot clone — thumbnails and page renders no longer queue
/// behind each other.
/// Name and size of the open document, for the feedback form's consent
/// prompt. No path parameter: see src-tauri/src/feedback.rs.
#[tauri::command]
fn feedback_document_info(
    state: State<'_, AppState>,
) -> Result<Option<feedback::FeedbackDocumentInfo>, String> {
    let current = current_path_for_policy(&state)?;
    feedback::document_info(current.as_deref())
}

/// The open document's bytes, read only after the user confirmed sharing it.
#[tauri::command]
fn feedback_document_bytes(state: State<'_, AppState>) -> Result<tauri::ipc::Response, String> {
    let current = current_path_for_policy(&state)?;
    Ok(tauri::ipc::Response::new(feedback::document_bytes(current.as_deref())?))
}

#[tauri::command]
async fn render_page_raw(
    state: State<'_, AppState>,
    page_index: u32,
    scale: Option<f32>,
) -> Result<tauri::ipc::Response, String> {
    let safe_scale = sanitize_scale(scale);
    let doc = state.render_snapshot()?;
    let body = tauri::async_runtime::spawn_blocking(move || {
        pdf_engine::render_page_raw_bytes(&doc, page_index, safe_scale)
    })
    .await
    .map_err(|e| e.to_string())??;
    Ok(tauri::ipc::Response::new(body))
}

/// Binary IPC thumbnail: returns PNG bytes directly (no base64/JSON wrapper).
#[tauri::command]
async fn render_thumbnail_raw(
    state: State<'_, AppState>,
    page_index: u32,
) -> Result<tauri::ipc::Response, String> {
    let doc = state.render_snapshot()?;
    let body = tauri::async_runtime::spawn_blocking(move || {
        pdf_engine::render_thumbnail_png_bytes(&doc, page_index)
    })
    .await
    .map_err(|e| e.to_string())??;
    Ok(tauri::ipc::Response::new(body))
}

#[tauri::command]
fn extract_page_text(state: State<AppState>, page_index: u32) -> Result<String, String> {
    state.with_document(|doc| sdk_facade::extract_page_text(&doc.raw_bytes, page_index))
}

/// Text spans for one page.
///
/// `async` is the point. This is the single most-called command at open — the
/// scanned-page probe asks it once per page, so 209 times on a 209-page
/// document — and as a sync command every one of those ran on the Tauri main
/// thread. The main thread is also what delivers the IPC reply for the page
/// render the user is waiting for and what services the window, so the probe
/// was competing with first paint rather than merely running beside it.
#[tauri::command]
async fn get_page_text_spans(
    state: State<'_, AppState>,
    page_index: u32,
) -> Result<Vec<TextSpanInfo>, String> {
    state.with_document_mut(|doc| doc.extract_page_text_spans(page_index))
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
/// Returns the document outline (table of contents). The `document_id` parameter
/// is accepted for interface parity with the TypeScript caller but ignored — the
/// command answers for the document on screen.
fn get_outline(state: State<AppState>, _document_id: String) -> Result<Vec<OutlineItemInfo>, String> {
    state.with_document(|doc| Ok(doc.outline()))
}

#[tauri::command]
fn save_pdf(state: State<AppState>, app: tauri::AppHandle, path: String) -> Result<(), String> {
    // The path lock is held from the policy check to the new path: switching
    // to another document waits for it, so the save and the path it records
    // can never land on two different documents (J-90).
    let mut current_path = state.current_path.lock().map_err(|e| e.to_string())?;
    let path = security::validate_pdf_output_path(&path, current_path.as_deref())?;
    state.with_document_mut(|doc| doc.save_to(&path))?;
    state.announce_current_history();
    *current_path = Some(path);
    clear_recovery(&app);
    Ok(())
}

#[tauri::command]
// async so the blocking native save panel runs on a worker thread, never the
// main thread (which would deadlock — see pick_pdf_dialog).
async fn save_pdf_as_dialog(
    state: State<'_, AppState>,
    app: tauri::AppHandle,
) -> Result<Option<String>, String> {
    let selected = match e2e_dialog_answer() {
        Some(answer) => answer,
        None => app.dialog().file().add_filter("PDF", &["pdf"]).blocking_save_file(),
    };
    let Some(selected) = selected else {
        return Ok(None);
    };

    let raw_path = dialog_path_to_string(selected)?;
    let path = security::validate_dialog_output_path(&raw_path, &["pdf"])?;
    let mut current_path = state.current_path.lock().map_err(|e| e.to_string())?;
    state.with_document_mut(|doc| doc.save_to(&path))?;
    state.announce_current_history();
    *current_path = Some(path.clone());
    clear_recovery(&app);
    Ok(Some(path))
}

/// Save As for a signed document whose changes cannot be appended (after a
/// redaction): a copy without signatures, chosen in the save dialog. The
/// frontend offers this when `save_pdf` answers `signed-document-needs-full-rewrite`.
#[tauri::command]
async fn save_unsigned_copy_as_dialog(
    state: State<'_, AppState>,
    app: tauri::AppHandle,
) -> Result<Option<String>, String> {
    let selected = match e2e_dialog_answer() {
        Some(answer) => answer,
        None => app.dialog().file().add_filter("PDF", &["pdf"]).blocking_save_file(),
    };
    let Some(selected) = selected else {
        return Ok(None);
    };
    let raw_path = dialog_path_to_string(selected)?;
    let path = security::validate_dialog_output_path(&raw_path, &["pdf"])?;
    let mut current_path = state.current_path.lock().map_err(|e| e.to_string())?;
    state.with_document_mut(|doc| doc.save_unsigned_copy(&path))?;
    state.announce_current_history();
    *current_path = Some(path.clone());
    clear_recovery(&app);
    Ok(Some(path))
}

#[tauri::command]
fn set_metadata(
    state: State<AppState>,
    title: Option<String>,
    author: Option<String>,
) -> Result<(), String> {
    state.with_document_edit("edit-properties", |doc| doc.set_document_info(title, author))
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
    state.with_document_edit("fill-field", |doc| doc.set_form_field_value(&request.name, &request.value))
}

/// First-class AcroForm model — one entry per logical field with typed kind,
/// widget rects, on-states, options and `/DA`. Drives the read-mode overlay.
#[tauri::command]
fn get_form_model(state: State<AppState>) -> Result<Vec<pdf_engine::FormFieldModelDto>, String> {
    state.with_document(|doc| Ok(doc.get_form_model()))
}

/// Apply a typed form value through the SDK writeback chain (save-pariteit:
/// `/V` + `/AS` + `/AP` + `NeedAppearances` fallback) and re-render. The
/// AcroForm calculations then run (`/AA /C` in `/CO` order); the report names
/// the fields they changed and the ones that failed.
#[tauri::command]
fn set_form_value(
    state: State<AppState>,
    request: pdf_engine::FormWriteRequest,
) -> Result<pdf_engine::FormCalcReport, String> {
    state.with_document_edit("fill-field", |doc| doc.apply_form_value(&request))
}

/// `/Link` annotations with a `/URI` action (page + rect + url) for the
/// clickable-link layer. Opening is gated by the UI's capability trust.
#[tauri::command]
fn get_link_annotations(
    state: State<AppState>,
) -> Result<Vec<pdf_engine::LinkAnnotationDto>, String> {
    state.with_document(|doc| Ok(doc.get_link_annotations()))
}

/// XFA form model (Phase 1): layout page count + enumerated fields with values,
/// flags, options and per-widget geometry. Drives the editable XFA overlay on
/// the rendered (read-only) XFA pages. `&mut` because the first call builds and
/// caches the parse-once fill session.
#[tauri::command]
fn xfa_form_model(state: State<AppState>) -> Result<pdf_engine::XfaFormModelDto, String> {
    state.with_document_mut(|doc| doc.xfa_form_model())
}

/// Set one XFA field value, writing through to the document's `datasets` packet
/// so a subsequent save reopens (in Adobe Acrobat/Reader too) with the value.
/// No reflow / event scripts run (Phase 1).
#[tauri::command]
fn set_xfa_field_value(
    state: State<AppState>,
    request: pdf_engine::XfaWriteRequest,
) -> Result<(), String> {
    state.with_document_edit("fill-field", |doc| doc.set_xfa_field_value(&request))
}

/// Phase 2 interactive XFA commit: routes the edit through the SDK commit loop
/// (change/click + calculate scripts → re-layout → presence changes) when the
/// `xfa-interactive` feature is compiled, else falls back to the Phase 1 value
/// write. Returns the commit outcome (presence changes, page-count delta) plus
/// the refreshed field model so the overlay updates in one round trip.
#[tauri::command]
fn commit_xfa_field_value(
    state: State<AppState>,
    request: pdf_engine::XfaWriteRequest,
) -> Result<pdf_engine::XfaCommitResultDto, String> {
    state.with_document_edit("fill-field", |doc| doc.commit_xfa_field_value(&request))
}

// ── PDF manipulation commands ─────────────────────────────────────────

#[tauri::command]
fn merge_pdfs(paths: Vec<String>, output_path: String) -> Result<(), String> {
    let paths = paths
        .iter()
        .map(|path| security::validate_pdf_source_path(path))
        .collect::<Result<Vec<_>, _>>()?;
    let output_path = security::validate_dialog_output_path(&output_path, &["pdf"])?;
    pdf_engine::merge_pdfs(&paths, &output_path)
}

/// Append all pages from `source_path` to the end of the current document.
#[tauri::command]
fn append_pdf(state: State<AppState>, source_path: String) -> Result<DocumentInfo, String> {
    let source_path = security::validate_pdf_source_path(&source_path)?;
    state.with_document_edit("insert-pages", |doc| {
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
    let source_path = security::validate_pdf_source_path(&source_path)?;
    state.with_document_edit("insert-pages", |doc| {
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
    let current = current_path_for_policy(&state)?;
    let output_path = security::validate_pdf_output_path(&output_path, current.as_deref())?;
    state.with_document(|doc| doc.extract_pages_to_file(&page_indices, &output_path))
}

/// Split the current document into individual single-page PDFs in `output_dir`.
/// Returns the list of created file paths.
#[tauri::command]
fn split_into_pages(state: State<AppState>, output_dir: String) -> Result<Vec<String>, String> {
    let current = current_path_for_policy(&state)?;
    let output_dir = security::validate_output_dir(&output_dir, current.as_deref())?;
    state.with_document(|doc| pdf_engine::split_into_pages(&doc.lopdf_doc, &output_dir))
}

#[tauri::command]
fn split_pdf(
    state: State<AppState>,
    ranges: Vec<String>,
    output_dir: String,
) -> Result<Vec<String>, String> {
    let current = current_path_for_policy(&state)?;
    let output_dir = security::validate_output_dir(&output_dir, current.as_deref())?;
    state.with_document(|doc| pdf_engine::split_pdf(&doc.lopdf_doc, &ranges, &output_dir))
}

#[tauri::command]
fn rotate_pages(
    state: State<AppState>,
    page_indices: Vec<u32>,
    rotation: i32,
) -> Result<DocumentInfo, String> {
    state.with_document_edit("rotate-pages", |doc| {
        doc.rotate_pages(&page_indices, rotation)?;
        Ok(doc.document_info())
    })
}

#[tauri::command]
fn rotate_page_left(state: State<AppState>, page_index: u32) -> Result<DocumentInfo, String> {
    state.with_document_edit("rotate-pages", |doc| {
        doc.rotate_page_left(page_index)?;
        Ok(doc.document_info())
    })
}

#[tauri::command]
fn rotate_page_right(state: State<AppState>, page_index: u32) -> Result<DocumentInfo, String> {
    state.with_document_edit("rotate-pages", |doc| {
        doc.rotate_page_right(page_index)?;
        Ok(doc.document_info())
    })
}

#[tauri::command]
fn get_page_labels(state: State<AppState>) -> Result<Vec<String>, String> {
    state.with_document(|doc| sdk_facade::get_page_labels(&doc.raw_bytes))
}

#[tauri::command]
fn check_xfa(state: State<AppState>) -> Result<bool, String> {
    state.with_document(|doc| sdk_facade::has_xfa_form(&doc.raw_bytes))
}

#[tauri::command]
fn delete_pages(state: State<AppState>, page_indices: Vec<u32>) -> Result<DocumentInfo, String> {
    state.with_document_edit("delete-pages", |doc| {
        doc.delete_pages(&page_indices)?;
        Ok(doc.document_info())
    })
}

#[tauri::command]
fn reorder_pages(state: State<AppState>, new_order: Vec<u32>) -> Result<DocumentInfo, String> {
    state.with_document_edit("reorder-pages", |doc| {
        doc.reorder_pages(&new_order)?;
        Ok(doc.document_info())
    })
}

#[tauri::command]
fn flatten_xfa(state: State<AppState>) -> Result<DocumentInfo, String> {
    state.with_document_edit("convert-xfa", |doc| {
        doc.flatten_xfa()?;
        Ok(doc.document_info())
    })
}

/// Flatten the AcroForm (J-58): the filled values become page content and
/// the fields are removed. One undo step.
#[tauri::command]
fn flatten_form(state: State<AppState>) -> Result<DocumentInfo, String> {
    state.with_document_edit("flatten-form", |doc| {
        doc.flatten_acroform()?;
        Ok(doc.document_info())
    })
}

#[tauri::command]
fn compress_pdf(
    state: State<AppState>,
    output_path: String,
    replace_open: Option<bool>,
) -> Result<CompressResult, String> {
    let output_path = security::validate_dialog_output_path(&output_path, &["pdf"])?;
    // A copy by default (#724). Only an explicit request replaces the open
    // document, and then it is one undo step.
    if replace_open.unwrap_or(false) {
        state.with_document_edit("compress", |doc| doc.compress(&output_path))
    } else {
        state.with_document(|doc| doc.compress_copy(&output_path))
    }
}

#[tauri::command]
fn add_watermark(
    state: State<AppState>,
    text: String,
    opacity: f32,
) -> Result<DocumentInfo, String> {
    state.with_document_edit("add-watermark", |doc| {
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
    state.with_document_edit("add-highlight", |doc| doc.add_highlight_annotation(page_index, &rects, color))
}

#[tauri::command]
fn add_underline_annotation(
    state: State<AppState>,
    page_index: u32,
    rects: Vec<[f32; 4]>,
    color: [f32; 3],
) -> Result<(), String> {
    state.with_document_edit("add-underline", |doc| doc.add_underline_annotation(page_index, &rects, color))
}

#[tauri::command]
fn add_strikeout_annotation(
    state: State<AppState>,
    page_index: u32,
    rects: Vec<[f32; 4]>,
    color: [f32; 3],
) -> Result<(), String> {
    state.with_document_edit("add-strikeout", |doc| doc.add_strikeout_annotation(page_index, &rects, color))
}

#[tauri::command]
fn add_comment_annotation(
    state: State<AppState>,
    page_index: u32,
    x: f32,
    y: f32,
    text: String,
) -> Result<(), String> {
    state.with_document_edit("add-comment", |doc| doc.add_comment_annotation(page_index, x, y, &text))
}

#[tauri::command]
fn delete_annotation(state: State<AppState>, annotation_id: String) -> Result<(), String> {
    state.with_document_edit("delete-annotation", |doc| doc.delete_annotation(&annotation_id))
}

#[tauri::command]
fn update_annotation_contents(
    state: State<AppState>,
    annotation_id: String,
    contents: String,
) -> Result<(), String> {
    state.with_document_edit("edit-comment", |doc| doc.update_annotation_contents(&annotation_id, &contents))
}

#[tauri::command]
fn update_annotation_color(
    state: State<AppState>,
    annotation_id: String,
    color: [f32; 3],
) -> Result<(), String> {
    state.with_document_edit("change-annotation-colour", |doc| doc.update_annotation_color(&annotation_id, color))
}

#[tauri::command]
fn list_page_images(state: State<AppState>, page_index: u32) -> Result<Vec<page_images::PageImage>, String> {
    let guard = state.document.lock().map_err(|e| e.to_string())?;
    guard.as_ref().ok_or("No PDF file open")?.list_page_images(page_index)
}

#[tauri::command]
fn move_page_image(
    state: State<AppState>,
    page_index: u32,
    image_index: usize,
    rect: [f64; 4],
) -> Result<usize, String> {
    state.with_document_edit("move-page-image", |doc| doc.move_page_image(page_index, image_index, rect))
}

#[tauri::command]
fn delete_page_image(state: State<AppState>, page_index: u32, image_index: usize) -> Result<(), String> {
    state.with_document_edit("delete-page-image", |doc| doc.delete_page_image(page_index, image_index))
}

#[tauri::command]
fn replace_page_image(
    state: State<AppState>,
    page_index: u32,
    image_index: usize,
    image_base64: String,
) -> Result<usize, String> {
    let data = decode_image(&image_base64)?;
    state.with_document_edit("replace-page-image", |doc| doc.replace_page_image(page_index, image_index, &data))
}

#[tauri::command]
fn update_annotation_rect(
    state: State<AppState>,
    annotation_id: String,
    rect: [f32; 4],
) -> Result<(), String> {
    state.with_document_edit("move-annotation", |doc| doc.update_annotation_rect(&annotation_id, rect))
}

#[tauri::command]
fn add_shape_annotation(
    state: State<AppState>,
    page_index: u32,
    rect: [f32; 4],
    shape_type: String,
    color: [f32; 3],
    stroke_width: Option<f32>,
) -> Result<(), String> {
    state.with_document_edit("add-shape", |doc| {
        doc.add_shape_annotation(
            page_index,
            rect,
            &shape_type,
            color,
            stroke_width.unwrap_or(1.5),
        )
    })
}

#[tauri::command]
fn add_redaction_annotation(
    state: State<AppState>,
    page_index: u32,
    rect: [f32; 4],
) -> Result<(), String> {
    state.with_document_edit("mark-redaction", |doc| doc.add_redaction_annotation(page_index, rect))
}

#[tauri::command]
fn add_ink_annotation(
    state: State<AppState>,
    page_index: u32,
    paths: Vec<Vec<[f32; 2]>>,
    color: [f32; 3],
    width: f32,
) -> Result<(), String> {
    state.with_document_edit("draw-ink", |doc| doc.add_ink_annotation(page_index, &paths, color, width))
}

/// A text box that is part of the PDF, not a picture over it (J-44).
#[tauri::command]
fn add_free_text_annotation(
    state: State<AppState>,
    page_index: u32,
    rect: [f32; 4],
    text: String,
    font_size: Option<f32>,
    color: Option<[f32; 3]>,
) -> Result<(), String> {
    state.with_document_edit("add-text-box", |doc| {
        doc.add_free_text_annotation(page_index, rect, &text, font_size.unwrap_or(12.0), color.unwrap_or([0.0, 0.0, 0.0]))
    })
}

/// A rubber stamp with a visible appearance (J-53).
#[tauri::command]
fn add_stamp_annotation(state: State<AppState>, page_index: u32, rect: [f32; 4], name: String) -> Result<(), String> {
    state.with_document_edit("add-stamp", |doc| doc.add_stamp_annotation(page_index, rect, &name))
}

fn decode_image(image_base64: &str) -> Result<Vec<u8>, String> {
    use base64::Engine as _;
    let payload = image_base64.split_once(',').map_or(image_base64, |(_, data)| data);
    base64::engine::general_purpose::STANDARD
        .decode(payload.trim())
        .map_err(|e| format!("The image could not be read: {e}"))
}

/// Place a PNG or JPEG on a page (J-45). `image_base64` may be a data URL.
#[tauri::command]
fn add_image_annotation(
    state: State<AppState>,
    page_index: u32,
    rect: [f32; 4],
    image_base64: String,
) -> Result<(), String> {
    let image = decode_image(&image_base64)?;
    state.with_document_edit("add-image", |doc| doc.add_image_annotation(page_index, rect, &image))
}

/// A visible signature with the signer's name and the date (J-62).
#[tauri::command]
// A Tauri command: its arguments are the frontend's call, not ours to bundle.
#[allow(clippy::too_many_arguments)]
fn add_signature_annotation(
    state: State<AppState>,
    page_index: u32,
    rect: [f32; 4],
    signer: String,
    date: String,
    paths: Option<Vec<Vec<[f32; 2]>>>,
    text: Option<String>,
    font_id: Option<String>,
) -> Result<(), String> {
    state.with_document_edit("add-signature", |doc| {
        doc.add_signature_annotation_with_font(
            page_index,
            rect,
            &signer,
            &date,
            paths.as_deref(),
            text.as_deref(),
            font_id.as_deref(),
        )
    })
}

/// The handwriting fonts a typed signature can use (#725).
#[tauri::command]
fn list_signature_fonts() -> Vec<signature_fonts::SignatureFont> {
    signature_fonts::list()
}

/// One signature font's file (base64), so the dialog previews the face the PDF gets.
#[tauri::command]
fn get_signature_font_data(font_id: String) -> Result<String, String> {
    signature_fonts::file_base64(&font_id)
}

/// Swap the image of a placed image (J-45).
#[tauri::command]
fn replace_annotation_image(state: State<AppState>, annotation_id: String, image_base64: String) -> Result<(), String> {
    let image = decode_image(&image_base64)?;
    state.with_document_edit("replace-image", |doc| doc.replace_annotation_image(&annotation_id, &image))
}

// ── Print ────────────────────────────────────────────────────────────

/// Print the document as it is now (J-34).
///
/// The current state — unsaved changes included, XFA flattened as shown — is
/// written to a private file in the app's cache and handed to the system's
/// print path: PDFKit's print panel on macOS; on Windows a window showing the
/// PDF in WebView2's own viewer with its print dialog opened. Until 1.0.1 the
/// menu and toolbar called `window.print()`, which prints the webview UI.
#[tauri::command]
async fn print_document(state: State<'_, AppState>, app: tauri::AppHandle) -> Result<(), String> {
    let bytes = state.with_document(|doc| doc.print_copy())?;
    let path = print_copy_path(&app)?;
    atomic_file::replace(&path, &bytes).map_err(|e| format!("Failed to prepare printing: {e}"))?;
    let path_str = path.to_string_lossy().into_owned();
    #[cfg(feature = "e2e")]
    if let Some(captured) = e2e::capture_print(&path_str) {
        applog(&format!("print: e2e capture of a {} byte print copy", bytes.len()));
        return captured;
    }
    applog(&format!("print: handing a {} byte print copy to the system", bytes.len()));
    platform_print(&app, path_str)
}

/// A fresh file under `<app cache>/print/`. Copies from earlier prints are
/// removed first: they are plaintext copies of documents and need not outlive
/// the dialog that used them.
fn print_copy_path(app: &tauri::AppHandle) -> Result<std::path::PathBuf, String> {
    let dir = app
        .path()
        .app_cache_dir()
        .map_err(|e| format!("Failed to prepare printing: no cache folder: {e}"))?
        .join("print");
    std::fs::create_dir_all(&dir).map_err(|e| format!("Failed to prepare printing: {e}"))?;
    if let Ok(entries) = std::fs::read_dir(&dir) {
        for entry in entries.flatten() {
            let name = entry.file_name();
            if name.to_string_lossy().starts_with("print-") {
                if let Err(e) = std::fs::remove_file(entry.path()) {
                    applog(&format!("print: could not remove an earlier print copy: {e}"));
                }
            }
        }
    }
    let stamp = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis())
        .unwrap_or(0);
    Ok(dir.join(format!("print-{}-{stamp}.pdf", std::process::id())))
}

#[cfg(target_os = "macos")]
fn platform_print(app: &tauri::AppHandle, path: String) -> Result<(), String> {
    let (tx, rx) = std::sync::mpsc::channel();
    app.run_on_main_thread(move || {
        if tx.send(pdfluent_macos_secure::print_pdf(&path)).is_err() {
            applog("print: the print result had nowhere to go");
        }
    })
    .map_err(|e| format!("Failed to open the print dialog: {e}"))?;
    match rx.recv().map_err(|e| format!("Failed to open the print dialog: {e}"))? {
        Ok(printed) => {
            applog(&format!("print: panel closed (printed: {printed})"));
            Ok(())
        }
        Err(e) => Err(format!("Failed to open the print dialog: {e}")),
    }
}

#[cfg(target_os = "windows")]
fn platform_print(app: &tauri::AppHandle, path: String) -> Result<(), String> {
    // WebView2 shows a PDF in its built-in viewer and prints the PDF itself,
    // not a rendering of the page around it. The window is the user's print
    // preview; its print dialog is opened once the PDF has loaded.
    let encoded: String = url_escape_path(&path);
    let url: tauri::Url = format!("http://asset.localhost/{encoded}")
        .parse()
        .map_err(|e| format!("Failed to open the print window: {e}"))?;
    if let Some(old) = app.get_webview_window("print") {
        if let Err(e) = old.close() {
            applog(&format!("print: could not close the previous print window: {e}"));
        }
    }
    tauri::WebviewWindowBuilder::new(app, "print", tauri::WebviewUrl::External(url))
        .title("PDFluent — Print")
        .inner_size(900.0, 1000.0)
        .on_page_load(|window, payload| {
            if payload.event() == tauri::webview::PageLoadEvent::Finished {
                if let Err(e) = window.print() {
                    applog(&format!("print: could not open the print dialog: {e}"));
                }
            }
        })
        .build()
        .map(|_| ())
        .map_err(|e| format!("Failed to open the print window: {e}"))
}

#[cfg(target_os = "windows")]
fn url_escape_path(path: &str) -> String {
    path.bytes()
        .map(|b| match b {
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'_' | b'.' | b'~' => (b as char).to_string(),
            _ => format!("%{b:02X}"),
        })
        .collect()
}

#[cfg(not(any(target_os = "macos", target_os = "windows")))]
fn platform_print(app: &tauri::AppHandle, path: String) -> Result<(), String> {
    // Linux is outside the release scope: open the print copy in the system
    // viewer, which prints it with its own dialog.
    use tauri_plugin_shell::ShellExt;
    #[allow(deprecated)]
    app.shell()
        .open(&path, None::<tauri_plugin_shell::open::Program>)
        .map_err(|e| format!("Failed to open the system viewer: {e}"))
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
    let cert_path = security::validate_certificate_input_path(&cert_path)?;
    let output_path = security::validate_dialog_output_path(&output_path, &["pdf"])?;
    let mut current_path = state.current_path.lock().map_err(|e| e.to_string())?;
    state.with_document_mut(|doc| doc.sign(&cert_path, &password, &reason, &output_path))?;
    state.announce_current_history();
    // The open document is now the signed file. Saving it back over the
    // unsigned original would quietly turn that file into a signed copy.
    *current_path = Some(output_path);
    Ok(())
}

#[tauri::command]
fn verify_signatures(state: State<AppState>) -> Result<Vec<SignatureVerifyResult>, String> {
    state.with_document(|doc| Ok(doc.verify_signatures()))
}

// ── PDF/A compliance commands ─────────────────────────────────────────

#[tauri::command]
fn validate_pdfa(state: State<AppState>) -> Result<PdfAValidationResult, String> {
    state.with_document(|doc| Ok(doc.validate_pdfa()))
}

/// Convert to PDF/A on a worker thread, against a copy.
///
/// `async` + `spawn_blocking` for the same reason the DOCX export is: a
/// conversion of a real form took up to 3.9 seconds on the route this replaced,
/// and holding the document mutex on the UI thread for that long freezes the
/// window. The copy is what keeps the open document out of it — the conversion
/// writes a new file and changes nothing the user has open.
#[tauri::command]
async fn convert_to_pdfa(
    state: State<'_, AppState>,
    level: String,
    output_path: String,
) -> Result<PdfAConvertResult, String> {
    let output_path = security::validate_dialog_output_path(&output_path, &["pdf"])?;
    let doc = state.with_document(|doc| Ok(doc.clone_lopdf()))?;
    applog("export: PDF/A conversion started on worker thread");
    let res = tauri::async_runtime::spawn_blocking(move || {
        pdf_engine::convert_doc_to_pdfa(doc, &level, &output_path)
    })
    .await
    .map_err(|e| format!("PDF/A conversion task failed: {e}"))?;
    match &res {
        Ok(outcome) => applog(&format!(
            "export: PDF/A conversion finished in {} ms at {:.2}x the input size",
            outcome.elapsed_ms, outcome.size_ratio
        )),
        Err(e) => applog(&format!("export: PDF/A conversion failed: {e}")),
    }
    res
}

// ── Encryption commands ───────────────────────────────────────────────

#[tauri::command]
fn encrypt_pdf(
    state: State<AppState>,
    user_password: String,
    owner_password: String,
    output_path: String,
) -> Result<(), String> {
    let output_path = security::validate_dialog_output_path(&output_path, &["pdf"])?;
    state.with_document_mut(|doc| doc.encrypt(&user_password, &owner_password, &output_path))
}

#[tauri::command]
fn decrypt_pdf(state: State<AppState>, password: Option<String>) -> Result<(), String> {
    // No password is only valid for a document already opened as owner; the
    // engine checks that and refuses with password-incorrect otherwise.
    let password = password.as_deref().unwrap_or("");
    state.with_document_edit("remove-password", |doc| doc.decrypt(password))
}

/// What the "Remove password" card has to ask for (#726).
#[tauri::command]
fn password_removal_state(state: State<AppState>) -> Result<pdf_engine::PasswordRemoval, String> {
    state.with_document(|doc| Ok(doc.password_removal()))
}

// ── Redaction commands ─────────────────────────────────────────────────

#[tauri::command]
fn redact_text(
    state: State<AppState>,
    page_index: u32,
    rects: Vec<[f32; 4]>,
) -> Result<RedactReport, String> {
    state.with_document_edit("redact", |doc| doc.redact_text(page_index, &rects))
}

#[tauri::command]
fn redact_search(state: State<AppState>, query: String) -> Result<SearchRedactReport, String> {
    state.with_document_edit("redact-matches", |doc| doc.redact_search(&query))
}

/// What a personal-data scan did with the model, so the panel can say so
/// instead of silently showing fewer results.
#[cfg(feature = "pii")]
#[derive(Debug, serde::Serialize)]
#[serde(tag = "state", rename_all = "snake_case")]
enum PiiModelUse {
    /// The caller did not ask for it.
    NotRequested,
    Used,
    /// Asked for, but not run: the error code says why (component missing,
    /// not published, not in this build, file changed on disk, load failed).
    Failed { code: String },
}

#[cfg(feature = "pii")]
#[derive(Debug, serde::Serialize)]
struct PiiScan {
    candidates: Vec<PiiCandidate>,
    model: PiiModelUse,
}

#[cfg(feature = "pii")]
fn pii_component_root(app: &tauri::AppHandle) -> Result<pii_component::ComponentRoot, String> {
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("Could not find the app data folder: {e}"))?;
    Ok(pii_component::ComponentRoot::new(dir.join("pii")))
}

/// The model, loaded from the verified component. Loaded per scan and dropped
/// after it: the weights are about 200 MB and the user scans rarely.
#[cfg(feature = "pii")]
fn load_pii_model(app: &tauri::AppHandle) -> Result<Box<dyn pii_model::NerBackend>, String> {
    let manifest = pii_component::manifest()?;
    let root = pii_component_root(app)?;
    let installed = pii_component::resolve(&root, manifest, &pii_component::platform_key())?;
    #[cfg(feature = "pii-model")]
    {
        let model = pii_model::gline::GlinerModel::load(&installed.runtime, &installed.tokenizer, &installed.model, manifest.model.max_width)?;
        Ok(Box::new(model))
    }
    #[cfg(not(feature = "pii-model"))]
    {
        let _ = installed;
        Err(pii_component::ERR_MODEL_NOT_IN_BUILD.to_string())
    }
}

/// Personal data the user can review before redacting (J-66). The validator
/// layer always runs; the model runs when `use_model` is set and the component
/// is installed and verified. Runs off the UI thread and outside the document
/// lock. Proposes only; redacts nothing.
#[cfg(feature = "pii")]
#[tauri::command]
async fn detect_pii(
    app: tauri::AppHandle,
    state: State<'_, AppState>,
    use_model: Option<bool>,
) -> Result<PiiScan, String> {
    let pages = state.with_document(|doc| doc.page_texts())?;
    let want_model = use_model.unwrap_or(false);
    let scan = tauri::async_runtime::spawn_blocking(move || -> Result<PiiScan, String> {
        let (model, use_state) = if want_model {
            match load_pii_model(&app) {
                Ok(m) => (Some(m), PiiModelUse::Used),
                Err(code) => (None, PiiModelUse::Failed { code }),
            }
        } else {
            (None, PiiModelUse::NotRequested)
        };
        let candidates = pdf_engine::pii_candidates_from_pages(&pages, model.as_deref())?;
        Ok(PiiScan { candidates, model: use_state })
    })
    .await
    .map_err(|e| format!("The personal-data scan stopped: {e}"))??;
    let mut reviewed = state.pii_reviewed.lock().map_err(|e| e.to_string())?;
    *reviewed = scan.candidates.iter().map(|c| c.text.clone()).collect();
    drop(reviewed);
    Ok(scan)
}

#[cfg(feature = "pii")]
#[tauri::command]
fn redact_pii(state: State<AppState>, texts: Vec<String>) -> Result<PiiRedactReport, String> {
    let reviewed = state.pii_reviewed.lock().map_err(|e| e.to_string())?.clone();
    state.with_document_edit("redact-personal-data", |doc| {
        doc.redact_pii_reviewed(&texts, &|t| reviewed.contains(t))
    })
}

#[cfg(feature = "pii")]
#[tauri::command]
fn pii_component_status(app: tauri::AppHandle) -> Result<pii_component::ComponentStatus, String> {
    let manifest = pii_component::manifest()?;
    let root = pii_component_root(&app)?;
    Ok(pii_component::status(&root, manifest, &pii_component::platform_key()))
}

/// Install the personal-data model after the user confirmed the dialog. The
/// consent and the manifest are checked here; the download itself is not wired
/// (the OCR component no longer downloads, so there is no shared downloader and
/// no allowed HTTP client; a download for this component needs its own decision,
/// docs/PII_DETECTION_GATE.md), until then it reports that the download is not
/// in this build.
#[cfg(feature = "pii")]
#[tauri::command]
fn install_pii_component(consent_text_version: u32, consented: bool) -> Result<(), String> {
    let manifest = pii_component::manifest()?;
    let request = pii_component::InstallRequest { consent_text_version, consented };
    pii_component::plan_install(manifest, &pii_component::platform_key(), &request)?;
    Err(pii_component::ERR_DOWNLOAD_NOT_IN_BUILD.to_string())
}

#[cfg(feature = "pii")]
#[tauri::command]
fn remove_pii_component(app: tauri::AppHandle) -> Result<pii_component::ComponentStatus, String> {
    let root = pii_component_root(&app)?;
    pii_component::remove_all(&root)?;
    pii_component_status(app)
}

#[tauri::command]
fn apply_redactions(state: State<AppState>) -> Result<RedactReport, String> {
    state.with_document_edit("apply-redactions", |doc| doc.apply_redactions())
}

#[tauri::command]
fn redact_metadata(state: State<AppState>) -> Result<(), String> {
    state.with_document_edit("remove-metadata", |doc| doc.redact_metadata())
}

// ── Text mutation commands (Phase 4) ──────────────────────────────────

/// Request shape for the replace_text_span command.
/// Field names use snake_case to match serde deserialization from TypeScript camelCase.
#[derive(Debug, serde::Deserialize)]
struct ReplaceTextSpanRequest {
    page_index: u32,
    original_text: String,
    replacement_text: String,
    /// Where on the page the user was pointing, in PDF user space. Absent means
    /// the first occurrence, which is what batch callers want.
    #[serde(default)]
    anchor: Option<SpanAnchor>,
}

/// Replace a single text span in a PDF page content stream.
/// See OpenDocument::replace_text_span for full documentation.
///
/// `async` on purpose: a synchronous Tauri command runs on the main thread, and
/// this one parses the page, scans every occurrence and rebuilds a content
/// stream while holding the document mutex. Off the main thread the window
/// keeps painting while it does.
#[tauri::command]
async fn replace_text_span(
    state: State<'_, AppState>,
    request: ReplaceTextSpanRequest,
) -> Result<TextReplaceResult, String> {
    let result = state.with_document_edit("edit-text", |doc| {
        doc.replace_text_span(
            request.page_index,
            &request.original_text,
            &request.replacement_text,
            request.anchor,
        )
    })?;
    perf::mark_with(
        "mutation_done",
        &format!("cmd=replace_text_span page={}", request.page_index),
    );
    applog(&format!(
        "replace_text_span p{} occurrence {:?}/{:?} -> {} font={:?} substituted={:?}",
        request.page_index,
        result.occurrence_index,
        result.occurrence_count,
        if result.replaced {
            "replaced".to_string()
        } else {
            result.reason.clone().unwrap_or_else(|| "unknown".to_string())
        },
        result.font_used,
        result.font_substituted,
    ));
    Ok(result)
}

/// The extraction engine's text blocks on a page (#640), for paragraph
/// grouping in the editor.
#[tauri::command]
async fn get_page_text_blocks(
    state: State<'_, AppState>,
    page_index: u32,
) -> Result<Vec<pdf_engine::TextBlockDto>, String> {
    state.with_document(|doc| doc.page_text_blocks(page_index))
}

/// Request shape for replace_text_paragraph (J-42).
#[derive(Debug, serde::Deserialize)]
struct ReplaceTextParagraphRequest {
    page_index: u32,
    /// The paragraph's lines, top to bottom, as shown.
    lines: Vec<pdf_engine::ParagraphLine>,
    replacement_text: String,
}

/// Replace a whole multi-line paragraph; the new text reflows inside the
/// paragraph's width. See OpenDocument::replace_paragraph. `async` for the
/// same reason as replace_text_span.
#[tauri::command]
async fn replace_text_paragraph(
    state: State<'_, AppState>,
    request: ReplaceTextParagraphRequest,
) -> Result<TextReplaceResult, String> {
    let result = state.with_document_edit("edit-text", |doc| {
        doc.replace_paragraph(request.page_index, &request.lines, &request.replacement_text)
    })?;
    perf::mark_with(
        "mutation_done",
        &format!("cmd=replace_text_paragraph page={}", request.page_index),
    );
    applog(&format!(
        "replace_text_paragraph p{} lines={} -> {}",
        request.page_index,
        request.lines.len(),
        if result.replaced { "replaced".to_string() } else { result.reason.clone().unwrap_or_else(|| "unknown".to_string()) },
    ));
    Ok(result)
}

// ── Text formatting commands (G5) ─────────────────────────────────────

/// Request shape for the format_text_span command (G5).
#[derive(Debug, serde::Deserialize)]
struct FormatTextSpanRequest {
    page_index: u32,
    original_text: String,
    /// New font size in points. Omitted to keep the current size.
    font_size: Option<f32>,
    /// New fill color as [r, g, b] normalized 0.0–1.0. Omitted to keep current color.
    color: Option<[f32; 3]>,
}

#[derive(Debug, serde::Serialize)]
struct FormatTextSpanResult {
    formatted: bool,
}

/// Change the font size and/or fill color of a text run identified by its
/// content. Returns `{ formatted: true }` on success or an Err string.
///
/// `async` for the same reason `replace_text_span` is: this decodes the page's
/// content stream, rewrites it and re-serialises the whole document while
/// holding the document mutex. On the main thread that is time the window
/// cannot paint in — and it is the second half of the very commit whose
/// repaint the user is waiting for.
#[tauri::command]
async fn format_text_span(
    state: State<'_, AppState>,
    request: FormatTextSpanRequest,
) -> Result<FormatTextSpanResult, String> {
    let formatted = state.with_document_edit("format-text", |doc| {
        doc.format_text_span(
            request.page_index,
            &request.original_text,
            request.font_size,
            request.color,
        )
    })?;
    perf::mark_with(
        "mutation_done",
        &format!("cmd=format_text_span page={}", request.page_index),
    );
    Ok(FormatTextSpanResult { formatted })
}

// ── Typeface commands (installed system fonts) ──────────────────────────

/// The fonts installed on this computer, by family, with whether each face's
/// licence permits embedding. Read once per run of the app.
#[tauri::command]
async fn list_system_fonts() -> Result<Vec<system_fonts::SystemFontFamily>, String> {
    tauri::async_runtime::spawn_blocking(|| system_fonts::list_system_fonts().to_vec())
        .await
        .map_err(|e| format!("font scan failed: {e}"))
}

#[derive(Debug, serde::Deserialize)]
struct SetTextRunFontRequest {
    page_index: u32,
    original_text: String,
    font_id: String,
}

#[derive(Debug, serde::Serialize)]
struct SetTextRunFontResult {
    applied: bool,
    /// Typed reason when `applied` is false; the UI picks its sentence by `code`.
    refusal: Option<system_fonts::FontRefusal>,
}

/// Write a text run in an installed face, embedding a subset of the font.
/// `async`: see `format_text_span`.
#[tauri::command]
async fn set_text_run_font(
    state: State<'_, AppState>,
    request: SetTextRunFontRequest,
) -> Result<SetTextRunFontResult, String> {
    let outcome = state.with_document_edit("font-text", |doc| {
        doc.set_text_run_font(request.page_index, &request.original_text, &request.font_id)
    })?;
    perf::mark_with(
        "mutation_done",
        &format!("cmd=set_text_run_font page={}", request.page_index),
    );
    Ok(match outcome {
        Ok(_) => SetTextRunFontResult { applied: true, refusal: None },
        Err(refusal) => {
            applog(&format!("set_text_run_font refused: {refusal}"));
            SetTextRunFontResult { applied: false, refusal: Some(refusal) }
        }
    })
}

// ── Text style commands (G6) ───────────────────────────────────────────

/// Request shape for the set_text_run_style command (G6).
#[derive(Debug, serde::Deserialize)]
struct SetTextRunStyleRequest {
    page_index: u32,
    original_text: String,
    /// `true` = bold, `false` = remove bold, `null` = unchanged.
    bold: Option<bool>,
    /// `true` = italic, `false` = remove italic, `null` = unchanged.
    italic: Option<bool>,
}

#[derive(Debug, serde::Serialize)]
struct SetTextRunStyleResult {
    styled: bool,
}

/// Apply bold and/or italic to a text run by swapping its embedded font variant.
/// Returns `Err("font-variant-not-embedded: …")` when the requested variant is
/// absent from the document xref — no modification is made in that case.
///
/// `async`: see `format_text_span`.
#[tauri::command]
async fn set_text_run_style(
    state: State<'_, AppState>,
    request: SetTextRunStyleRequest,
) -> Result<SetTextRunStyleResult, String> {
    let styled = state.with_document_edit("style-text", |doc| {
        doc.set_text_run_style(
            request.page_index,
            &request.original_text,
            request.bold,
            request.italic,
        )
    })?;
    perf::mark_with(
        "mutation_done",
        &format!("cmd=set_text_run_style page={}", request.page_index),
    );
    Ok(SetTextRunStyleResult { styled })
}

// ── OCR commands ──────────────────────────────────────────────────────
//
// OCR is two things: the Tesseract component, which ships inside the app
// (ocr_component.rs), and the run, which recognises scanned pages and writes an
// invisible text layer into the open document (ocr.rs). Every failure comes
// back as an error code the frontend names in the user's language; logs carry
// codes and counts, never file names or document text.

/// Where the bundled component sits: `<resources>/resources/ocr`. Tauri's
/// `resource_dir()` alone is not enough: it answers "unknown path" for an
/// executable outside an `.app` and outside `target/{debug,release}` (a Cargo
/// target directory on another disk, say), so the other layouts are tried and
/// the error names every path.
fn ocr_bundle_dir(app: &tauri::AppHandle) -> Result<std::path::PathBuf, String> {
    let search = ocr_component::BundleSearch {
        // The e2e build (never shipped, PDFLUENT-E2E-BUILD-NOT-SHIPPED) is a release
        // build in whatever Cargo target folder the runner uses, which Tauri's
        // dev-layout detection does not recognise; it names its bundle.
        env_dir: if cfg!(debug_assertions) || cfg!(feature = "e2e") {
            std::env::var_os("PDFLUENT_OCR_BUNDLE_DIR").map(std::path::PathBuf::from)
        } else {
            None
        },
        tauri_resource_dir: app.path().resource_dir().map_err(|e| e.to_string()),
        exe: std::env::current_exe().ok(),
        app_name: app.package_info().name.clone(),
        dev_stage_dir: if cfg!(debug_assertions) {
            Some(
                std::path::Path::new(env!("CARGO_MANIFEST_DIR"))
                    .join("resources")
                    .join("ocr-bundle"),
            )
        } else {
            None
        },
    };
    ocr_component::find_bundle(&search, ocr_component::AppLayout::current(), |p| p.is_dir())
}

/// The status never fails because the bundle folder is missing: that is a
/// fact about this build, reported in `problem`, and logged here once.
fn ocr_component_status_for(app: &tauri::AppHandle) -> Result<ocr_component::ComponentStatus, String> {
    let manifest = ocr_component::manifest()?;
    let platform = ocr_component::platform_key();
    match ocr_bundle_dir(app) {
        Ok(bundle) => Ok(ocr_component::status(&bundle, manifest, &platform)),
        Err(problem) => {
            applog(&format!("ocr: status: {problem}"));
            Ok(ocr_component::status_unresolved(manifest, &platform, problem))
        }
    }
}

/// What Settings shows: the component, its files, sizes, licences, and whether
/// the bundle is complete. Reads only the compiled-in manifest and the disk.
#[tauri::command]
fn ocr_component_status(app: tauri::AppHandle) -> Result<ocr_component::ComponentStatus, String> {
    ocr_component_status_for(&app)
}

/// Recognise the scanned pages among `page_indices` (0-based; none means
/// every page) in `languages` and write the text layer into the open
/// document. The document is marked modified; Save writes the layer.
///
/// The recognition runs outside the document lock -- a long scan must not
/// freeze rendering -- on a copy, which is put back only if the document did
/// not change meanwhile (`OCR_DOCUMENT_CHANGED` otherwise). Progress goes out
/// as `ocr-progress` events: `{ done, total }` pages.
#[tauri::command]
async fn run_ocr(
    state: State<'_, AppState>,
    app: tauri::AppHandle,
    languages: Vec<String>,
    page_indices: Option<Vec<u32>>,
) -> Result<ocr::OcrTextLayerReport, String> {
    use tauri::Emitter as _;
    let manifest = ocr_component::manifest()?;
    let bundle = ocr_bundle_dir(&app)?;
    let installed = ocr_component::resolve(&bundle, manifest, &ocr_component::platform_key())?;
    let engine = ocr::ComponentTesseract::new(&installed, &languages)?;
    let pages: Vec<u32> = page_indices
        .unwrap_or_default()
        .into_iter()
        .map(|i| i.saturating_add(1))
        .collect();
    let inputs = state.with_document(|doc| doc.ocr_inputs())?;
    applog(&format!("ocr: run started ({} page(s) requested)", pages.len()));
    let emitter = app.clone();
    let language = engine.language().to_string();
    let outcome = tauri::async_runtime::spawn_blocking(move || {
        let pdf_engine::OcrInputs { mut document, render, fingerprint } = inputs;
        let on_page = move |done: u32, total: u32| {
            if let Err(e) = emitter.emit("ocr-progress", serde_json::json!({ "done": done, "total": total })) {
                applog(&format!("ocr: run progress not delivered: {e}"));
            }
        };
        ocr::add_text_layer(&mut document, &render, &engine, &pages, &language, &on_page)
            .map(|report| (report, document, fingerprint))
    })
    .await
    .map_err(|e| format!("{}: {e}", ocr::ERR_ENGINE))?;
    let (report, document, fingerprint) = match outcome {
        Ok(v) => v,
        Err(e) => {
            applog(&format!("ocr: run failed: {}", e.split(':').next().unwrap_or(&e)));
            return Err(e);
        }
    };
    if report.pages_recognised > 0 {
        state.with_document_edit("ocr", |doc| doc.apply_ocr_result(document, fingerprint))?;
    }
    applog(&format!(
        "ocr: run finished ({} page(s) recognised, {} word(s))",
        report.pages_recognised, report.words
    ));
    Ok(report)
}

// ── Attachments commands ───────────────────────────────────────────────

#[tauri::command]
fn list_attachments(state: State<AppState>) -> Result<Vec<AttachmentInfo>, String> {
    state.with_document(|doc| Ok(doc.list_attachments()))
}

#[tauri::command]
fn extract_attachment(state: State<AppState>, name: String) -> Result<Vec<u8>, String> {
    security::ensure_safe_attachment_name(&name)?;
    state.with_document(|doc| doc.extract_attachment(&name))
}

#[tauri::command]
fn add_attachment(
    state: State<AppState>,
    name: String,
    data: Vec<u8>,
    mime_type: String,
) -> Result<(), String> {
    security::ensure_safe_attachment_name(&name)?;
    state.with_document_edit("add-attachment", |doc| doc.add_attachment(&name, &data, &mime_type))
}

#[tauri::command]
fn remove_attachment(state: State<AppState>, name: String) -> Result<(), String> {
    state.with_document_edit("remove-attachment", |doc| doc.remove_attachment(&name))
}

#[tauri::command]
// async so the blocking native save panel runs off the main thread (see
// pick_pdf_dialog).
async fn save_attachment_dialog(
    state: State<'_, AppState>,
    app: tauri::AppHandle,
    name: String,
) -> Result<Option<String>, String> {
    security::ensure_safe_attachment_name(&name)?;
    let bytes = state.with_document(|doc| doc.extract_attachment(&name))?;
    let selected = match e2e_dialog_answer() {
        Some(answer) => answer,
        None => app.dialog().file().set_file_name(name).blocking_save_file(),
    };
    let Some(selected) = selected else {
        return Ok(None);
    };

    let raw_path = dialog_path_to_string(selected)?;
    let output_path = security::validate_dialog_output_path(
        &raw_path,
        &[
            "pdf", "txt", "xml", "json", "csv", "png", "jpg", "jpeg", "bin", "zip",
        ],
    )?;
    std::fs::write(&output_path, bytes).map_err(|e| format!("Failed to write attachment: {e}"))?;
    Ok(Some(output_path))
}

#[tauri::command]
// async so the blocking native open panel runs off the main thread (see
// pick_pdf_dialog).
async fn add_attachment_dialog(
    state: State<'_, AppState>,
    app: tauri::AppHandle,
) -> Result<Option<Vec<AttachmentInfo>>, String> {
    let selected = match e2e_dialog_answer() {
        Some(answer) => answer,
        None => app.dialog().file().blocking_pick_file(),
    };
    let Some(selected) = selected else {
        return Ok(None);
    };

    let path = selected
        .into_path()
        .map_err(|e| format!("Invalid attachment path: {e}"))?;
    let name = path
        .file_name()
        .and_then(|name| name.to_str())
        .ok_or_else(|| "Attachment path has no valid file name".to_string())?
        .to_string();
    security::ensure_safe_attachment_name(&name)?;

    // The path comes from the native open panel (powerbox-granted under the App
    // Sandbox), so read it directly. We deliberately do NOT resolve symlinks or
    // stat the path beforehand: resolving would also touch parent directories
    // (unnecessary protected-folder access — the macOS folder-prompt bug class),
    // and the panel only ever returns a real file. The read below fails cleanly
    // if the path is somehow unreadable.
    let data = std::fs::read(&path)
        .map_err(|e| format!("Failed to read selected attachment: {e}"))?;
    state.with_document_edit("add-attachment", |doc| doc.add_attachment(&name, &data, "application/octet-stream"))?;
    state
        .with_document(|doc| Ok(doc.list_attachments()))
        .map(Some)
}

// ── Layers commands ────────────────────────────────────────────────────

#[tauri::command]
fn list_layers(state: State<AppState>) -> Result<Vec<LayerInfo>, String> {
    state.with_document(|doc| sdk_facade::get_layers(&doc.raw_bytes))
}

// ── Extraction & conversion commands ──────────────────────────────────

#[tauri::command]
fn extract_images(
    state: State<AppState>,
    output_dir: String,
) -> Result<Vec<ExtractedImageInfo>, String> {
    let current = current_path_for_policy(&state)?;
    let output_dir = security::validate_output_dir(&output_dir, current.as_deref())?;
    state.with_document(|doc| doc.extract_images(&output_dir))
}

#[tauri::command]
fn export_page_as_image(
    state: State<AppState>,
    page_index: u32,
    format: String,
    output_path: String,
) -> Result<(), String> {
    let output_path = security::validate_dialog_output_path(&output_path, &["png", "jpg", "jpeg"])?;
    state.with_document(|doc| doc.export_page_as_image(page_index, &format, &output_path))
}

// convert_to_{docx,xlsx,pptx} are `async` so Tauri runs them on a worker thread.
// Each clones the document under a brief lock, then converts + writes inside
// `spawn_blocking` so the CPU-heavy work (image re-encoding + zip) never blocks
// the main thread or holds the document mutex — exporting image-heavy PDFs no
// longer freezes the UI. Logs carry status only, never filenames.
#[tauri::command]
async fn convert_to_docx(state: State<'_, AppState>, output_path: String) -> Result<(), String> {
    let output_path = security::validate_dialog_output_path(&output_path, &["docx"])?;
    let doc = state.with_document(|doc| Ok(doc.clone_lopdf()))?;
    applog("export: DOCX conversion started on worker thread");
    let res = tauri::async_runtime::spawn_blocking(move || {
        pdf_engine::convert_doc_to_docx(&doc, &output_path)
    })
    .await
    .map_err(|e| format!("DOCX export task failed: {e}"))?;
    match &res {
        Ok(()) => applog("export: DOCX conversion finished"),
        Err(e) => applog(&format!("export: DOCX conversion failed: {e}")),
    }
    res
}

#[tauri::command]
async fn convert_to_xlsx(state: State<'_, AppState>, output_path: String) -> Result<(), String> {
    let output_path = security::validate_dialog_output_path(&output_path, &["xlsx"])?;
    let doc = state.with_document(|doc| Ok(doc.clone_lopdf()))?;
    applog("export: XLSX conversion started on worker thread");
    let res = tauri::async_runtime::spawn_blocking(move || {
        pdf_engine::convert_doc_to_xlsx(&doc, &output_path)
    })
    .await
    .map_err(|e| format!("XLSX export task failed: {e}"))?;
    match &res {
        Ok(()) => applog("export: XLSX conversion finished"),
        Err(e) => applog(&format!("export: XLSX conversion failed: {e}")),
    }
    res
}

#[tauri::command]
async fn convert_to_pptx(state: State<'_, AppState>, output_path: String) -> Result<(), String> {
    let output_path = security::validate_dialog_output_path(&output_path, &["pptx"])?;
    let doc = state.with_document(|doc| Ok(doc.clone_lopdf()))?;
    applog("export: PPTX conversion started on worker thread");
    let res = tauri::async_runtime::spawn_blocking(move || {
        pdf_engine::convert_doc_to_pptx(&doc, &output_path)
    })
    .await
    .map_err(|e| format!("PPTX export task failed: {e}"))?;
    match &res {
        Ok(()) => applog("export: PPTX conversion finished"),
        Err(e) => applog(&format!("export: PPTX conversion failed: {e}")),
    }
    res
}

// Markdown and tables-to-Excel read the document through the SDK's structured
// extraction, which the SDK marks Preview; the export dialog labels them so.
// Same shape as convert_to_docx: validated dialog path, a clone under a brief
// lock, the work in spawn_blocking, status-only logs.
#[tauri::command]
async fn export_as_markdown(state: State<'_, AppState>, output_path: String) -> Result<(), String> {
    let output_path = security::validate_dialog_output_path(&output_path, &["md"])?;
    let doc = state.with_document(|doc| Ok(doc.clone_lopdf()))?;
    applog("export: Markdown extraction started on worker thread");
    let res = tauri::async_runtime::spawn_blocking(move || {
        structured_export::export_doc_as_markdown(doc, &output_path)
    })
    .await
    .map_err(|e| format!("Markdown export task failed: {e}"))?;
    match &res {
        Ok(()) => applog("export: Markdown extraction finished"),
        Err(e) => applog(&format!("export: Markdown extraction failed: {e}")),
    }
    res
}

/// Table count for the open document; the dialog calls it before the save
/// dialog so a document without a table never opens one. The extraction is
/// kept for `export_tables_to_xlsx`, so it runs once.
#[tauri::command]
async fn count_document_tables(state: State<'_, AppState>) -> Result<usize, String> {
    let (doc, key) = state.with_document(|doc| Ok((doc.clone_lopdf(), doc.revision_key())))?;
    let cache = Arc::clone(&state.table_cache);
    applog("export: table count started on worker thread");
    let began = std::time::Instant::now();
    let res = tauri::async_runtime::spawn_blocking(move || structured_export::count_doc_tables(&cache, key, doc))
        .await
        .map_err(|e| format!("Table count task failed: {e}"))?;
    match &res {
        Ok(n) => applog(&format!("export: table count finished ({n} tables, {} ms)", began.elapsed().as_millis())),
        Err(e) => applog(&format!("export: table count failed: {e}")),
    }
    res
}

#[tauri::command]
async fn export_tables_to_xlsx(
    state: State<'_, AppState>,
    output_path: String,
) -> Result<usize, String> {
    let output_path = security::validate_dialog_output_path(&output_path, &["xlsx"])?;
    let (doc, key) = state.with_document(|doc| Ok((doc.clone_lopdf(), doc.revision_key())))?;
    applog("export: table extraction started on worker thread");
    let cache = Arc::clone(&state.table_cache);
    let res = tauri::async_runtime::spawn_blocking(move || {
        structured_export::export_doc_tables_cached(&cache, key, doc, &output_path)
    })
    .await
    .map_err(|e| format!("Table export task failed: {e}"))?;
    match &res {
        Ok(n) => applog(&format!("export: table extraction finished ({n} tables)")),
        Err(e) => applog(&format!("export: table extraction failed: {e}")),
    }
    res
}

// ── E-invoicing commands ──────────────────────────────────────────────

#[tauri::command]
fn extract_invoice_data(state: State<AppState>) -> Result<Option<InvoiceData>, String> {
    state.with_document(|doc| doc.extract_invoice_data())
}

#[tauri::command]
fn validate_invoice(state: State<AppState>) -> Result<Option<InvoiceValidationResult>, String> {
    state.with_document(|doc| doc.validate_invoice_data())
}

// ── Menu ─────────────────────────────────────────────────────────────

#[cfg(desktop)]
/// What a click on the application menu item `id` does. A function of its own
/// so the journey suite (e2e.rs) reaches the same code for the items no
/// webview driver can click, Quit above all.
fn handle_menu_event(app: &tauri::AppHandle, id: &str) {
    // "help_improve" is handled in the webview (menu-event): the feedback form
    // is part of the app.
    if id == "help_open_website" {
        let _ = telemetry::open_external_url(WEBSITE_URL.to_string());
    } else if id == "help_open_license" {
        // Proprietary EULA / commercial terms.
        let _ = telemetry::open_external_url(LICENSE_URL.to_string());
    } else if id == "help_open_notices" {
        // Third-party open-source notices — never the EULA page.
        open_oss_notices(app);
    } else if is_quit_menu_id(id) {
        if close_requested(app, "quit") == close_guard::CloseDecision::Proceed {
            app.exit(0);
        }
        return;
    }
    let _ = app.emit("menu-event", id);
}

/// "Quit PDFluent", routed through the close guard. Ids: see `is_quit_menu_id`.
#[cfg(desktop)]
fn quit_item(
    handle: &tauri::AppHandle,
    id: &str,
    with_shortcut: bool,
) -> Result<tauri::menu::MenuItem<tauri::Wry>, String> {
    let builder = MenuItemBuilder::with_id(id, "Quit PDFluent");
    let builder = if with_shortcut {
        builder.accelerator("CmdOrCtrl+Q")
    } else {
        builder
    };
    builder.build(handle).map_err(|e| e.to_string())
}

fn is_quit_menu_id(id: &str) -> bool {
    id == "app_quit" || id == "file_quit"
}

fn build_menu(handle: &tauri::AppHandle) -> Result<Menu<tauri::Wry>, String> {
    let file_menu = SubmenuBuilder::new(handle, "File")
        .items(&[
            &MenuItemBuilder::with_id("file_open", "Open...")
                .accelerator("CmdOrCtrl+O")
                .build(handle)
                .map_err(|e| e.to_string())?,
            // A tab per document (J-90): New Tab asks for a file, Close Tab
            // closes the document on screen. Next and Previous Tab carry no
            // accelerator here; the webview handles Ctrl+Tab and friends.
            &MenuItemBuilder::with_id("file_new_tab", "New Tab...")
                .accelerator("CmdOrCtrl+T")
                .build(handle)
                .map_err(|e| e.to_string())?,
            &MenuItemBuilder::with_id("file_close", "Close Tab")
                .accelerator("CmdOrCtrl+W")
                .build(handle)
                .map_err(|e| e.to_string())?,
            &MenuItemBuilder::with_id("window_next_tab", "Next Tab")
                .build(handle)
                .map_err(|e| e.to_string())?,
            &MenuItemBuilder::with_id("window_previous_tab", "Previous Tab")
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
            // Our own item, not PredefinedMenuItem::quit: that one sends
            // `terminate:` to AppKit directly and cannot be held for unsaved
            // changes (close_guard.rs). On macOS the shortcut belongs to the
            // app menu's Quit below.
            &quit_item(handle, "file_quit", !cfg!(target_os = "macos"))?,
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
        .license(Some(
            "PDFluent is free to use, including for commercial and business use. \
             SDK and third-party open-source components are listed in THIRD_PARTY.md and THIRD_PARTY_ATTRIBUTIONS.md. \
             See Help > Open Source Notices for third-party licenses, and Help > License & Terms \
             (https://pdfluent.com/license) for the End-User License Agreement.",
        ))
        .comments(Some(
            format!(
                "Also published on the Microsoft Store as {MICROSOFT_STORE_ID} ({MICROSOFT_STORE_URL}). \
                 Store and direct-download installs are the same build and update themselves the same way.",
            )
            .as_str(),
        ))
        .website(Some(WEBSITE_URL))
        .website_label(Some("pdfluent.com"))
        .build();

    let help_menu = SubmenuBuilder::new(handle, "Help")
        .about_with_text("About PDFluent", Some(about_metadata.clone()))
        .separator()
        .item(
            &MenuItemBuilder::with_id("help_open_website", "PDFluent Website")
                .build(handle)
                .map_err(|e| e.to_string())?,
        )
        .item(
            &MenuItemBuilder::with_id("help_open_license", "License & Terms")
                .build(handle)
                .map_err(|e| e.to_string())?,
        )
        .item(
            &MenuItemBuilder::with_id("help_open_notices", "Open Source Notices")
                .build(handle)
                .map_err(|e| e.to_string())?,
        )
        .separator()
        .item(
            // Opens the in-app feedback form (src/components/feedback). It used
            // to open a web page that mailed the text on and kept nothing.
            &MenuItemBuilder::with_id("help_improve", "Help Us Improve PDFluent…")
                .build(handle)
                .map_err(|e| e.to_string())?,
        )
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
        .item(&quit_item(handle, "app_quit", true)?)
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

/// Directory for durable local logs. macOS puts logs in ~/Library/Logs; the
/// other two platforms have no such convention, so the local data directory it
/// is. Windows is a shipped platform and had no durable log at all: everything
/// below was compiled out there, which is why a Windows report could never say
/// how far startup had got.
fn app_log_dir_path() -> Option<std::path::PathBuf> {
    #[cfg(target_os = "macos")]
    let dir = dirs::home_dir()?
        .join("Library")
        .join("Logs")
        .join("com.pdfluent.app");
    #[cfg(not(target_os = "macos"))]
    let dir = dirs::data_local_dir()?.join("com.pdfluent.app").join("logs");

    std::fs::create_dir_all(&dir).ok()?;
    Some(dir)
}

/// Durable local log file: `<log dir>/PDFluent.log`.
fn app_log_file_path() -> Option<std::path::PathBuf> {
    Some(app_log_dir_path()?.join("PDFluent.log"))
}

/// Where the session counter keeps its start/clean-quit lines. Next to the app
/// log, because that is where someone looks when they want to know what the
/// app did.
fn session_log_path() -> Option<std::path::PathBuf> {
    Some(app_log_dir_path()?.join(session_log::SESSION_FILE_NAME))
}

/// Append a timestamped line to the durable local log (and echo to stderr, which
/// also reaches the macOS unified log when launched from Finder). Best-effort and
/// `unsafe`-free; complements the panic crash file. Lets us see how far startup or
/// an open-file operation got when something stalls (e.g. a macOS permission
/// prompt blocking a filesystem call).
pub fn applog(msg: &str) {
    eprintln!("{msg}");
    use std::io::Write;
    // Milliseconds, not seconds. Startup is 2.5 s end to end, so a
    // whole-second timestamp put four or five interesting events on the same
    // stamp and no ordering could be read out of the file at all.
    let since_epoch = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default();
    let (secs, millis) = (since_epoch.as_secs(), since_epoch.subsec_millis());
    if let Some(path) = app_log_file_path() {
        if let Ok(mut f) = std::fs::OpenOptions::new().create(true).append(true).open(path) {
            let _ = writeln!(f, "[{secs}.{millis:03}] {msg}");
        }
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
/// Fingerprint of the embedded frontend, computed at build time (build.rs) from
/// `dist/index.html` and the assets it references. Referencing it here makes the
/// crate depend on the frontend contents, so a frontend change forces a recompile
/// and a fresh `generate_context!` embed — preventing a stale embedded bundle.
/// Also logged at startup so the running app's embedded frontend is verifiable.
pub const FRONTEND_FINGERPRINT: &str = env!("PDFLUENT_FRONTEND_FINGERPRINT");

pub fn run() {
    // First statement: everything measured is measured from here. Whatever
    // happened before (dyld, LaunchServices) is outside these numbers, and
    // scripts/perf/measure-open.sh prints that gap separately.
    perf::start();
    applog(&format!(
        "PDFluent {} starting (pid {}) [frontend {}]",
        env!("CARGO_PKG_VERSION"),
        std::process::id(),
        FRONTEND_FINGERPRINT
    ));
    perf::mark("starting");

    // Debug-only, env-gated security-scoped-bookmark self-test. Never compiled
    // into release builds. Runs the bookmark round-trip in a fresh process and
    // exits, so validation can prove (via logs) that recent-file access comes
    // from the resolved bookmark and that every start is balanced by a stop.
    #[cfg(debug_assertions)]
    maybe_run_bookmark_selftest();

    // A PDF path passed on the command line: Windows/Linux "open with" cold
    // start, or `open --args` on macOS. (macOS file-association double-clicks
    // arrive later as RunEvent::Opened, handled in .run() below.)
    // Without a working directory a relative argument stays relative, which
    // is what the cold start did before; the open then names the path it
    // could not read.
    let launch_cwd = match std::env::current_dir() {
        Ok(dir) => dir,
        Err(e) => {
            applog(&format!("open: no working directory for the launch arguments: {e}"));
            std::path::PathBuf::new()
        }
    };
    #[cfg(feature = "e2e")]
    let e2e_args = std::env::var("PDFLUENT_E2E_ARGS").ok();
    #[cfg(not(feature = "e2e"))]
    let e2e_args: Option<String> = None;
    let cli_pending: Vec<String> =
        pdf_paths_from_launch_args(launch_args_with(std::env::args(), e2e_args.as_deref()), &launch_cwd);

    let builder = tauri::Builder::default();
    #[cfg(feature = "ui-walk")]
    let builder = builder.plugin(ui_walk::plugin());
    // Registered first, as the plugin requires: a second launch exits before
    // anything else starts and its file opens here instead (J-11).
    #[cfg(windows)]
    let builder = if e2e_skips_single_instance() {
        builder
    } else {
        builder.plugin(tauri_plugin_single_instance::init(|app, argv, cwd| {
            applog("open: a second launch handed its arguments to this instance");
            let paths = pdf_paths_from_launch_args(&argv, std::path::Path::new(&cwd));
            if paths.is_empty() {
                open_in_running_instance_focus_only(app);
            }
            for path in paths {
                open_in_running_instance(app, path);
            }
        }))
    };

    #[cfg(feature = "e2e")]
    let builder = builder.plugin(e2e::plugin());

    builder
        .setup(|app| {
            configure_bundled_font_cache(app);
            form_scripts_policy::warm_up();

            // Crash capture (plan §10 Fase 0): record panics to a local file so
            // the frontend can offer the privacy-first review dialog on the next
            // launch. Nothing is ever sent from here.
            let crash_file = app
                .path()
                .app_log_dir()
                .map(|dir| dir.join(telemetry::CRASH_FILE_NAME))
                .unwrap_or_else(|_| {
                    std::env::temp_dir().join(telemetry::CRASH_FILE_NAME)
                });
            telemetry::install_panic_hook(crash_file.clone());

            // Crash-free sessions (plan §3). One line now, one on the way out;
            // a start with no matching quit is a session that did not end
            // cleanly. Purely local -- the number leaves the machine only if
            // the user sends a report and reads it in the text first.
            let session_file = session_log_path()
                .unwrap_or_else(|| std::env::temp_dir().join(session_log::SESSION_FILE_NAME));
            if let Err(e) = session_log::record(
                &session_file,
                session_log::EVENT_START,
                env!("CARGO_PKG_VERSION"),
            ) {
                applog(&format!("session log: could not record the start: {e}"));
            }

            app.manage(telemetry::TelemetryState {
                crash_file: Mutex::new(crash_file),
                session_file: Mutex::new(session_file),
            });

            let recovery_store = match app.path().app_data_dir() {
                Ok(dir) => Some(recovery::RecoveryStore::new(dir.join("recovery"))),
                Err(e) => {
                    applog(&format!("recovery: no app data folder, recovery copies are off: {e}"));
                    None
                }
            };
            app.manage(RecoveryState(Mutex::new(recovery_store)));

            if app.state::<AppState>().app.set(app.handle().clone()).is_err() {
                applog("history: the app handle was already set");
            }

            #[cfg(desktop)]
            {
                // The self-updater is compiled out of the Mac App Store build
                // (`--no-default-features --features custom-protocol`): the App
                // Store delivers updates and Apple forbids self-updating.
                #[cfg(feature = "updater")]
                {
                    app.handle()
                        .plugin(tauri_plugin_updater::Builder::new().build())
                        .map_err(|e| e.to_string())?;

                    // Lets the frontend relaunch() the app to finish an update.
                    app.handle()
                        .plugin(tauri_plugin_process::init())
                        .map_err(|e| e.to_string())?;
                }

                let handle = app.handle();
                let menu = build_menu(handle)?;
                app.set_menu(menu).map_err(|e| e.to_string())?;

                app.on_menu_event(|app, event| handle_menu_event(app, event.id().0.as_str()));
            }

            if let Some(window) = app.get_webview_window("main") {
                let _ = window.show();
                let _ = window.set_focus();
            }

            spawn_startup_watchdog(app.handle().clone());
            #[cfg(feature = "e2e")]
            e2e::start_bridge(app.handle());
            perf::mark("setup_done");
            Ok(())
        })
        // The webview finished loading index.html. Between `setup_done` and
        // this mark is window and WKWebView creation; between this mark and
        // `frontend_ready` is parsing and evaluating the bundle. Those were
        // the two largest unknowns in the 2.5 s.
        .on_page_load(|_window, payload| {
            if payload.event() == tauri::webview::PageLoadEvent::Finished {
                perf::mark("page_loaded");
            }
        })
        // The window's close button, Alt-F4, the taskbar: held while there
        // are unsaved changes (close_guard.rs). Not during the startup
        // watchdog's window swap, which closes the frozen window on purpose.
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                if RECOVERY_ACTIVE.load(Ordering::SeqCst) {
                    return;
                }
                if close_requested(window.app_handle(), "window")
                    == close_guard::CloseDecision::AskFrontend
                {
                    api.prevent_close();
                }
            }
        })
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_fs::init())
        .manage(close_guard::CloseGuard::default())
        .manage(AppState {
            document: Mutex::new(None),
            current_path: Mutex::new(None),
            sessions: Mutex::new(sessions::SessionBook::default()),
            table_cache: Arc::new(structured_export::TableCache::default()),
            tts_child: Mutex::new(None),
            app: std::sync::OnceLock::new(),
            #[cfg(feature = "pii")]
            pii_reviewed: Mutex::new(std::collections::HashSet::new()),
        })
        .manage(PendingOpen(Mutex::new(cli_pending)))
        .invoke_handler(tauri::generate_handler![
            frontend_ready,
            frontend_heartbeat,
            frontend_log,
            perf::perf_mark,
            open_pdf,
            pick_pdf_dialog,
            pick_image_dialog,
            remember_file_access,
            prepare_recent_open,
            release_file_access,
            #[cfg(debug_assertions)]
            active_scope_count,
            #[cfg(debug_assertions)]
            probe_raw_access,
            close_pdf,
            activate_session,
            close_session,
            hibernate_session,
            get_document_info,
            get_form_scripts,
            get_form_scripts_policy,
            set_form_scripts_allowed,
            undo_document,
            redo_document,
            get_document_history,
            begin_edit_group,
            end_edit_group,
            render_page,
            render_thumbnail,
            render_page_raw,
            render_thumbnail_raw,
            extract_page_text,
            get_page_text_spans,
            get_annotations,
            search_text,
            get_outline,
            save_pdf,
            save_pdf_as_dialog,
            set_metadata,
            has_unsaved_changes,
            get_current_path,
            get_form_fields,
            set_form_field_value,
            get_form_model,
            set_form_value,
            xfa_form_model,
            set_xfa_field_value,
            commit_xfa_field_value,
            get_link_annotations,
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
            check_xfa,
            delete_pages,
            reorder_pages,
            flatten_xfa,
            flatten_form,
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
            add_free_text_annotation,
            add_stamp_annotation,
            add_image_annotation,
            replace_annotation_image,
            add_signature_annotation,
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
            password_removal_state,
            // Redaction
            redact_text,
            redact_search,
            #[cfg(feature = "pii")]
            detect_pii,
            #[cfg(feature = "pii")]
            redact_pii,
            #[cfg(feature = "pii")]
            pii_component_status,
            #[cfg(feature = "pii")]
            install_pii_component,
            #[cfg(feature = "pii")]
            remove_pii_component,
            apply_redactions,
            redact_metadata,
            // Text mutation (Phase 4) + text formatting (G5/G6)
            replace_text_span,
            replace_text_paragraph,
            get_page_text_blocks,
            format_text_span,
            list_system_fonts,
            set_text_run_font,
            list_page_images,
            list_signature_fonts,
            get_signature_font_data,
            move_page_image,
            delete_page_image,
            replace_page_image,
            set_text_run_style,
            // OCR
            ocr_component_status,
            run_ocr,
            get_native_capabilities,
            native_tts_speak,
            native_tts_pause,
            native_tts_resume,
            native_tts_stop,
            // Attachments
            list_attachments,
            extract_attachment,
            add_attachment,
            save_attachment_dialog,
            add_attachment_dialog,
            remove_attachment,
            // Layers
            list_layers,
            // Extraction & conversion
            extract_images,
            export_page_as_image,
            convert_to_docx,
            convert_to_xlsx,
            convert_to_pptx,
            export_as_markdown,
            count_document_tables,
            export_tables_to_xlsx,
            // E-invoicing
            extract_invoice_data,
            validate_invoice,
            // Telemetry (crash reporting & feedback)
            telemetry::get_environment,
            telemetry::take_pending_crashes,
            telemetry::open_external_url,
            telemetry::session_reliability,
            feedback_document_info,
            feedback_document_bytes,
            take_pending_opens,
            set_unsaved_changes,
            save_unsigned_copy_as_dialog,
            write_recovery_copy,
            pending_recovery,
            pending_recoveries,
            restore_recovery,
            adopt_recovered_document,
            discard_recovery,
            acknowledge_close_request,
            confirm_close,
            #[cfg(feature = "e2e")]
            e2e::e2e_queue_dialog_answers,
            #[cfg(feature = "e2e")]
            e2e::e2e_menu,
            #[cfg(feature = "e2e")]
            e2e::e2e_reply,
        ])
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(|app_handle, event| {
            // While the startup watchdog swaps the main window, closing the
            // old one must not exit the app.
            if let tauri::RunEvent::ExitRequested { api, .. } = &event {
                if RECOVERY_ACTIVE.load(Ordering::SeqCst) {
                    api.prevent_exit();
                    return;
                }
            }

            // The other half of the pair. RunEvent::Exit fires for a menu
            // quit, a window close and a Cmd-Q alike; a kill, a panic or a
            // power cut leaves the start line unmatched, which is exactly the
            // distinction being counted.
            if let tauri::RunEvent::Exit = &event {
                if let Some(state) = app_handle.try_state::<telemetry::TelemetryState>() {
                    if let Ok(path) = state.session_file.lock() {
                        if let Err(e) = session_log::record(
                            path.as_path(),
                            session_log::EVENT_CLEAN_QUIT,
                            env!("CARGO_PKG_VERSION"),
                        ) {
                            applog(&format!("session log: could not record the clean quit: {e}"));
                        }
                    }
                }
                applog("clean_quit: the app is exiting normally");
                // Every change saved or deliberately discarded at the close
                // guard: the copy is no longer needed. An exit that bypassed
                // the guard with work unsaved (the Dock's Quit, logout,
                // shutdown) keeps a last copy instead, offered at next start.
                finish_recovery_on_exit(app_handle);
            }

            // Balance any outstanding security-scoped access on exit so no
            // bookmark grant outlives the process (macOS App Sandbox).
            #[cfg(target_os = "macos")]
            if let tauri::RunEvent::Exit = &event {
                let stopped = pdfluent_macos_secure::stop_all();
                applog(&format!(
                    "app exit: released {stopped} scoped resources (active_scopes now {})",
                    pdfluent_macos_secure::active_count()
                ));
            }

            // Finder double-click / "Open With" / file association on macOS
            // delivers the file(s) here. Queue + emit so the webview opens them.
            #[cfg(target_os = "macos")]
            if let tauri::RunEvent::Opened { urls } = event {
                for url in urls {
                    let path = url
                        .to_file_path()
                        .map(|p| p.to_string_lossy().to_string())
                        .unwrap_or_else(|_| url.to_string());
                    open_in_running_instance(app_handle, path);
                }
            }
            #[cfg(not(target_os = "macos"))]
            let _ = &event;
        });
}

// ── Tests ─────────────────────────────────────────────────────────────────
#[cfg(test)]
mod launch_args_tests {
    use super::pdf_path_from_launch_args;
    use std::path::Path;

    #[test]
    fn the_first_pdf_argument_after_the_program_is_the_file_to_open() {
        let args = ["C:\\Program Files\\PDFluent\\pdfluent.exe", "--flag", "C:\\Docs\\a.PDF", "b.pdf"];
        let cwd = Path::new("C:\\Users\\a");
        // An absolute Windows path is absolute only on Windows; elsewhere the
        // join below is what a relative path gets, so compare per platform.
        let got = pdf_path_from_launch_args(args, cwd).expect("a pdf argument");
        if cfg!(windows) {
            assert_eq!(got, "C:\\Docs\\a.PDF");
        } else {
            assert!(got.ends_with("a.PDF"), "{got}");
        }
    }

    #[test]
    fn a_relative_path_is_resolved_against_the_launching_process_folder() {
        let cwd = std::env::temp_dir();
        let got = pdf_path_from_launch_args(["pdfluent", "report.pdf"], &cwd).expect("pdf");
        assert_eq!(Path::new(&got), cwd.join("report.pdf"));
    }

    #[test]
    fn an_absolute_path_is_kept_as_it_is() {
        let abs = std::env::temp_dir().join("x.pdf");
        let abs = abs.to_string_lossy().into_owned();
        let got = pdf_path_from_launch_args(["pdfluent", abs.as_str()], Path::new("/somewhere/else"));
        assert_eq!(got.as_deref(), Some(abs.as_str()));
    }

    #[test]
    fn every_pdf_argument_is_opened_in_the_order_given() {
        let abs = std::env::temp_dir();
        let a = abs.join("a.pdf").to_string_lossy().into_owned();
        let b = abs.join("b.PDF").to_string_lossy().into_owned();
        let got = super::pdf_paths_from_launch_args(["pdfluent", a.as_str(), "--flag", b.as_str(), "notes.txt"], &abs);
        assert_eq!(got, vec![a, b]);
        assert!(super::pdf_paths_from_launch_args(["pdfluent"], &abs).is_empty());
    }

    #[test]
    fn e2e_arguments_come_after_the_process_arguments_and_open_like_any_other() {
        let abs = std::env::temp_dir().join("quarterly.pdf").to_string_lossy().into_owned();
        let json = serde_json::to_string(&[abs.as_str()]).unwrap();
        let args = super::launch_args_with(["pdfluent".to_string()], Some(json.as_str()));
        assert_eq!(args, vec!["pdfluent".to_string(), abs.clone()]);
        assert_eq!(super::pdf_paths_from_launch_args(&args, Path::new("/")), vec![abs]);
        // Without the variable nothing is added; a malformed one adds nothing either.
        assert_eq!(super::launch_args_with(["pdfluent".to_string()], None), vec!["pdfluent".to_string()]);
        assert_eq!(super::launch_args_with(["pdfluent".to_string()], Some("not json")), vec!["pdfluent".to_string()]);
    }

    #[test]
    fn the_program_name_and_non_pdf_arguments_are_not_opened() {
        assert_eq!(pdf_path_from_launch_args(["/Applications/x.pdf"], Path::new("/")), None);
        assert_eq!(pdf_path_from_launch_args(["pdfluent", "--help", "notes.txt"], Path::new("/")), None);
    }
}

#[cfg(test)]
mod tests {
    use super::sanitize_scale;

    /// Commands that take the document mutably without being a user edit.
    /// Anything else that writes to the document must go through
    /// `with_document_edit`, or its change cannot be undone (J-85) — which is
    /// how only form fields came to have undo. A new command that changes the
    /// document and uses `with_document_mut` fails here; if it truly is not an
    /// edit, it belongs on this list with its reason.
    const NOT_AN_EDIT: &[(&str, &str)] = &[
        ("adopt_recovered_document", "marks the restored copy unsaved; nothing to undo"),
        ("history_step", "undo and redo themselves"),
        ("begin_edit_group", "history bookkeeping"),
        ("end_edit_group", "history bookkeeping"),
        ("get_page_text_spans", "fills a cache; the content is unchanged"),
        ("xfa_form_model", "reads the XFA model; the content is unchanged"),
        ("save_pdf", "a save; the history continues across it"),
        ("save_pdf_as_dialog", "a save; the history continues across it"),
        ("save_unsigned_copy_as_dialog", "a save that ends the history (signatures dropped)"),
        ("sign_pdf", "writes a new signed file and starts a new history"),
        ("encrypt_pdf", "writes a protected copy; the open document is unchanged"),
    ];

    #[test]
    fn every_mutating_command_records_an_undo_step() {
        let src = include_str!("lib.rs");
        let body = &src[..src.find("\nmod tests {").expect("tests module")];
        let mut current_fn = "";
        let mut offenders = Vec::new();
        for line in body.lines() {
            let t = line.trim_start();
            for prefix in ["fn ", "async fn ", "pub fn "] {
                if let Some(rest) = t.strip_prefix(prefix) {
                    current_fn = rest.split(['(', '<']).next().unwrap_or("");
                }
            }
            if t.contains("with_document_mut(|") && !NOT_AN_EDIT.iter().any(|(n, _)| *n == current_fn) {
                offenders.push(current_fn.to_string());
            }
        }
        assert!(
            offenders.is_empty(),
            "these commands change the document without an undo step; use with_document_edit: {offenders:?}"
        );
    }

    #[test]
    fn sanitize_scale_clamps_into_safe_range() {
        assert_eq!(sanitize_scale(Some(0.05)), 0.1);
        assert_eq!(sanitize_scale(Some(3.2)), 3.2);
        assert_eq!(sanitize_scale(Some(9.0)), 9.0);
        assert_eq!(sanitize_scale(Some(14.0)), 12.0);
    }

    /// Regression: a synchronous `#[tauri::command]` that calls a blocking native
    /// dialog runs on the MAIN thread, where the blocking call deadlocks the app
    /// (the panel needs the main run loop the call is parked on — this was the
    /// Save As beachball). Every command using `blocking_pick_file` /
    /// `blocking_save_file` MUST be declared `async fn` so Tauri runs it on a
    /// worker thread.
    #[test]
    fn blocking_native_dialogs_only_in_async_commands() {
        let src = include_str!("lib.rs");
        // Scan PRODUCTION code only — exclude this test module, whose own
        // assertion strings mention the dialog names and would self-trigger.
        let prod = &src[..src.find("\n#[cfg(test)]").unwrap_or(src.len())];
        let mut is_async = false;
        let mut current = "<top-level>";
        for line in prod.lines() {
            let t = line.trim_start().trim_start_matches("pub ").trim_start();
            if let Some(rest) = t.strip_prefix("async fn ") {
                is_async = true;
                current = rest.split('(').next().unwrap_or(rest);
            } else if let Some(rest) = t.strip_prefix("fn ") {
                is_async = false;
                current = rest.split('(').next().unwrap_or(rest);
            }
            if line.contains("blocking_pick_file") || line.contains("blocking_save_file") {
                assert!(
                    is_async,
                    "blocking native dialog in SYNCHRONOUS command `{current}` — sync Tauri \
                     commands run on the main thread and the blocking dialog deadlocks the app. \
                     Make `{current}` an `async fn`."
                );
            }
        }
    }

    /// Regression: the attachment picker must not canonicalize or stat the
    /// user-selected path. The path is powerbox-granted under the App Sandbox;
    /// `canonicalize()` additionally stats parent directories (unnecessary
    /// protected-folder access — the macOS folder-prompt class of bug). The
    /// (legitimate) untrusted-output-path validators in security.rs are out of
    /// scope here; we check only add_attachment_dialog's own body.
    #[test]
    fn add_attachment_dialog_does_not_canonicalize_picked_path() {
        let src = include_str!("lib.rs");
        let start = src
            .find("async fn add_attachment_dialog")
            .expect("add_attachment_dialog not found");
        let rest = &src[start..];
        // Body ends at the EARLIEST of the next command attribute or section
        // comment (the fn is immediately followed by "// ── Layers commands").
        let b1 = rest[1..].find("\n#[tauri::command]").map(|p| p + 1);
        let b2 = rest[1..].find("\n// ──").map(|p| p + 1);
        let end = match (b1, b2) {
            (Some(a), Some(b)) => a.min(b),
            (Some(a), None) => a,
            (None, Some(b)) => b,
            (None, None) => rest.len(),
        };
        let body = &rest[..end];
        assert!(
            !body.contains("canonicalize"),
            "add_attachment_dialog must not canonicalize the picked path (stats protected parent dirs)"
        );
        assert!(
            !body.contains(".is_file()"),
            "add_attachment_dialog must not stat/is_file-probe the picked path"
        );
    }

    #[test]
    fn sanitize_scale_falls_back_on_invalid_values() {
        assert_eq!(sanitize_scale(None), 2.0);
        assert_eq!(sanitize_scale(Some(f32::NAN)), 2.0);
        assert_eq!(sanitize_scale(Some(-5.0)), 2.0);
    }


}
