#![forbid(unsafe_code)]

// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary. The PDFluent application is free to use,
// including for commercial purposes. Redistribution, or extraction or reuse
// of its components (including the embedded PDF engine), requires a licence.
// See https://pdfluent.com/license for terms.

mod ocr;
mod pdf_engine;
#[cfg(test)]
mod pdfa_export_guard;
mod sdk_facade;
mod security;
mod telemetry;

use ocr::{
    get_ocr_status_command, run_paddle_ocr_command, OcrRuntimeStatus, PaddleOcrRequest,
    PaddleOcrResponse,
};
use pdf_engine::{
    AnnotationInfo, AttachmentInfo, CompressResult, DocumentInfo, ExtractedImageInfo,
    FormFieldInfo, InvoiceData, InvoiceValidationResult, LayerInfo, OpenDocument, OutlineItemInfo,
    PdfAValidationResult, RedactReport, RenderedPage, SdkDocument, SearchRedactReport,
    SetFieldValueRequest, SignatureVerifyResult, TextReplaceResult, TextSpanInfo,
};
use std::process::{Child, Command};
use std::sync::atomic::{AtomicBool, AtomicU8, Ordering};
use std::sync::Mutex;
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
// invoke; if the ping never arrives, this Rust thread recreates the webview
// window once, and surfaces a native dialog if that also fails.
// ---------------------------------------------------------------------------

static FRONTEND_READY: AtomicBool = AtomicBool::new(false);
static RECOVERY_ATTEMPTS: AtomicU8 = AtomicU8::new(0);
static RECOVERY_ACTIVE: AtomicBool = AtomicBool::new(false);

fn ready_timeout_secs() -> u64 {
    std::env::var("PDFLUENT_READY_TIMEOUT_SECS")
        .ok()
        .and_then(|v| v.parse().ok())
        .unwrap_or(25)
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
    std::thread::spawn(move || {
        let timeout = ready_timeout_secs();
        for _ in 0..timeout {
            std::thread::sleep(std::time::Duration::from_secs(1));
            if FRONTEND_READY.load(Ordering::SeqCst) && !watchdog_test_ignore_ready() {
                return; // healthy
            }
        }

        let attempt = RECOVERY_ATTEMPTS.fetch_add(1, Ordering::SeqCst);
        eprintln!("startup watchdog: frontend not ready after {timeout}s (attempt {attempt}) — recovering");
        if attempt >= 1 {
            // Second failure: recreating the webview did not help. Tell the
            // user natively (this dialog does not depend on the webview).
            let h = handle.clone();
            let _ = handle.run_on_main_thread(move || {
                h.dialog()
                    .message(
                        "PDFluent kon de weergave niet starten.\n\nStart de app opnieuw. \
                         Helpt dat niet, herstart dan de Mac en probeer het nogmaals.",
                    )
                    .title("PDFluent reageert niet")
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
                            "PDFluent kon de weergave niet starten.\n\nStart de app \
                             opnieuw. Helpt dat niet, herstart dan de Mac.",
                        )
                        .title("PDFluent reageert niet")
                        .blocking_show();
                    h.exit(1);
                }
            }
        });
    });
}

/// First invoke from the frontend — proof the webview's JS is alive.
#[tauri::command]
fn frontend_ready() {
    FRONTEND_READY.store(true, Ordering::SeqCst);
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
    document: Mutex<Option<OpenDocument>>,
    current_path: Mutex<Option<String>>,
    tts_child: Mutex<Option<Child>>,
}

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
/// frontend drains this on mount via the `take_pending_open` command.
struct PendingOpen(Mutex<Option<String>>);

/// Return and clear any queued "open this file" request, so a cold-start
/// double-click / open-with still opens the document once the UI is listening.
#[tauri::command]
fn take_pending_open(state: tauri::State<'_, PendingOpen>) -> Option<String> {
    state.0.lock().ok().and_then(|mut p| p.take())
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
}

#[tauri::command]
fn get_native_capabilities() -> NativeCapabilities {
    let ocr_status = get_ocr_status_command();
    let tesseract_available = command_available("tesseract");

    let ocr = if ocr_status.available {
        native_feature(
            "fallback",
            "PDFluent PaddleOCR",
            "Lokale OCR-runtime is beschikbaar voor gescande pagina's.",
            true,
        )
    } else if tesseract_available {
        native_feature(
            "fallback",
            "Tesseract",
            "Tesseract is aanwezig en kan als lokale OCR-fallback worden aangesloten.",
            true,
        )
    } else {
        native_feature(
            "planned",
            "OS OCR adapter",
            "Native Vision/Windows OCR adapters worden pas getoond zodra ze gewired zijn.",
            true,
        )
    };

    let tts = match platform_name() {
        "macos" => native_feature("available", "macOS say / AVSpeech", "Systeemstemmen zijn lokaal beschikbaar.", true),
        "windows" => native_feature("available", "Windows SAPI", "Geinstalleerde Windows-stemmen worden lokaal gebruikt.", true),
        "linux" if command_available("spd-say") => native_feature("available", "Speech Dispatcher", "spd-say is beschikbaar op dit systeem.", true),
        "linux" => native_feature("unavailable", "Speech Dispatcher", "Installeer Speech Dispatcher om lokaal voorlezen te activeren.", true),
        _ => native_feature("unavailable", "Geen OS TTS", "Geen ondersteunde lokale text-to-speech provider gevonden.", true),
    };

    NativeCapabilities {
        platform: platform_name(),
        ocr,
        tts,
        scanner: match platform_name() {
            "linux" if command_available("scanimage") => native_feature("available", "SANE", "scanimage is beschikbaar voor scannerdetectie.", true),
            "macos" => native_feature("planned", "ImageCaptureCore", "Scanneradapter wordt beschikbaar zodra de native bridge actief is.", true),
            "windows" => native_feature("planned", "WIA / Windows.Devices.Scanners", "Scanneradapter wordt beschikbaar zodra de native bridge actief is.", true),
            _ => native_feature("unavailable", "Geen scanneradapter", "Geen ondersteunde scannerprovider gevonden.", true),
        },
        spellcheck: native_feature(
            "fallback",
            "WebView spellcheck",
            "Invoervelden gebruiken de lokale spellcheck van de webview/OS waar beschikbaar.",
            true,
        ),
        dictation: native_feature(
            "planned",
            "OS-dictatie",
            "Dictatie blijft verborgen totdat een lokale platformadapter beschikbaar is.",
            true,
        ),
        share: native_feature(
            "available",
            "Bestandssysteem en mailto",
            "Delen maakt lokale bestanden of maildrafts zonder upload.",
            true,
        ),
        secure_storage: match platform_name() {
            "macos" => native_feature("planned", "Keychain", "Licentieopslag wordt via Keychain gegated wanneer de adapter actief is.", true),
            "windows" => native_feature("planned", "Credential Manager", "Licentieopslag wordt via Credential Manager gegated wanneer de adapter actief is.", true),
            "linux" => native_feature("planned", "Secret Service", "Licentieopslag wordt via de Linux secret store gegated wanneer aanwezig.", true),
            _ => native_feature("unavailable", "Geen secret store", "Geen ondersteunde veilige opslag gevonden.", true),
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
            return Err("Speech Dispatcher is niet beschikbaar op dit systeem.".into());
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
    Err("Voorlezen wordt op dit platform niet ondersteund.".into())
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
        return Err("Geen tekst beschikbaar om voor te lezen.".into());
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
        .map_err(|e| format!("Voorlezen starten mislukt: {e}"))?;

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
        .map_err(|e| format!("Voorlezen pauzeren mislukt: {e}"))?;

    if status.success() {
        Ok(())
    } else {
        Err(format!("Voorlezen pauzeren mislukt: process signal {signal} werd geweigerd."))
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
        Err("Voorlezen pauzeren wordt op dit platform nog niet ondersteund.".into())
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
        Err("Voorlezen hervatten wordt op dit platform nog niet ondersteund.".into())
    }
}

#[tauri::command]
async fn open_pdf(state: State<'_, AppState>, path: String) -> Result<DocumentInfo, String> {
    applog(&format!("open_pdf: validating selected path (len {})", path.len()));
    let path = security::validate_pdf_input_path(&path)?;
    applog("open_pdf: path validated; parsing document on worker thread");

    // Parse + (for XFA docs) one-time flatten on a worker thread so the main
    // thread keeps servicing UI events during open.
    let open_path = path.clone();
    let doc = tauri::async_runtime::spawn_blocking(move || OpenDocument::open(&open_path))
        .await
        .map_err(|e| e.to_string())??;
    applog("open_pdf: document parsed OK");
    let info = doc.document_info();

    let mut current_path = state.current_path.lock().map_err(|e| e.to_string())?;
    *current_path = Some(path);

    let mut document = state.document.lock().map_err(|e| e.to_string())?;
    *document = Some(doc);

    Ok(info)
}

#[tauri::command]
// async so Tauri runs this on a worker thread, not the main thread. The
// `blocking_*` native dialog dispatches the panel to the (free) main thread and
// blocks the worker for the result; if this ran on the main thread it would
// deadlock the app (panel needs the main run loop that the call is blocking).
async fn pick_pdf_dialog(app: tauri::AppHandle) -> Result<Option<String>, String> {
    let Some(selected) = app
        .dialog()
        .file()
        .add_filter("PDF", &["pdf"])
        .blocking_pick_file()
    else {
        return Ok(None);
    };

    let raw_path = dialog_path_to_string(selected)?;
    security::validate_pdf_input_path(&raw_path).map(Some)
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
    state.with_document(|doc| {
        let mut info = doc.document_info();
        // Exercise the read-only facade metadata path for title/author.
        if let Ok((title, author)) = sdk_facade::document_metadata(&doc.raw_bytes) {
            info.title = title;
            info.author = author;
        }
        Ok(info)
    })
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
/// Returns the document outline (table of contents). The `document_id` parameter
/// is accepted for interface parity with the TypeScript caller but ignored — the
/// backend holds a single open document at a time.
fn get_outline(state: State<AppState>, _document_id: String) -> Result<Vec<OutlineItemInfo>, String> {
    state.with_document(|doc| Ok(doc.outline()))
}

#[tauri::command]
fn save_pdf(state: State<AppState>, path: String) -> Result<(), String> {
    let current = current_path_for_policy(&state)?;
    let path = security::validate_pdf_output_path(&path, current.as_deref())?;
    state.with_document_mut(|doc| doc.save_to(&path))?;
    let mut current_path = state.current_path.lock().map_err(|e| e.to_string())?;
    *current_path = Some(path);
    Ok(())
}

#[tauri::command]
// async so the blocking native save panel runs on a worker thread, never the
// main thread (which would deadlock — see pick_pdf_dialog).
async fn save_pdf_as_dialog(
    state: State<'_, AppState>,
    app: tauri::AppHandle,
) -> Result<Option<String>, String> {
    let Some(selected) = app
        .dialog()
        .file()
        .add_filter("PDF", &["pdf"])
        .blocking_save_file()
    else {
        return Ok(None);
    };

    let raw_path = dialog_path_to_string(selected)?;
    let path = security::validate_dialog_output_path(&raw_path, &["pdf"])?;
    state.with_document_mut(|doc| doc.save_to(&path))?;
    let mut current_path = state.current_path.lock().map_err(|e| e.to_string())?;
    *current_path = Some(path.clone());
    Ok(Some(path))
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

/// First-class AcroForm model — one entry per logical field with typed kind,
/// widget rects, on-states, options and `/DA`. Drives the read-mode overlay.
#[tauri::command]
fn get_form_model(state: State<AppState>) -> Result<Vec<pdf_engine::FormFieldModelDto>, String> {
    state.with_document(|doc| Ok(doc.get_form_model()))
}

/// Apply a typed form value through the SDK writeback chain (save-pariteit:
/// `/V` + `/AS` + `/AP` + `NeedAppearances` fallback) and re-render.
#[tauri::command]
fn set_form_value(
    state: State<AppState>,
    request: pdf_engine::FormWriteRequest,
) -> Result<(), String> {
    state.with_document_mut(|doc| doc.apply_form_value(&request))
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
    state.with_document_mut(|doc| doc.set_xfa_field_value(&request))
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
    state.with_document_mut(|doc| doc.commit_xfa_field_value(&request))
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
    let source_path = security::validate_pdf_source_path(&source_path)?;
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
    state.with_document(|doc| sdk_facade::get_page_labels(&doc.raw_bytes))
}

#[tauri::command]
fn check_xfa(state: State<AppState>) -> Result<bool, String> {
    state.with_document(|doc| sdk_facade::has_xfa_form(&doc.raw_bytes))
}

#[tauri::command]
fn delete_pages(state: State<AppState>, page_indices: Vec<u32>) -> Result<DocumentInfo, String> {
    state.with_document_mut(|doc| {
        doc.delete_pages(&page_indices)?;
        Ok(doc.document_info())
    })
}

#[tauri::command]
fn reorder_pages(state: State<AppState>, new_order: Vec<u32>) -> Result<DocumentInfo, String> {
    state.with_document_mut(|doc| {
        doc.reorder_pages(&new_order)?;
        Ok(doc.document_info())
    })
}

#[tauri::command]
fn flatten_xfa(state: State<AppState>) -> Result<DocumentInfo, String> {
    state.with_document_mut(|doc| {
        doc.flatten_xfa()?;
        Ok(doc.document_info())
    })
}

#[tauri::command]
fn compress_pdf(state: State<AppState>, output_path: String) -> Result<CompressResult, String> {
    let output_path = security::validate_dialog_output_path(&output_path, &["pdf"])?;
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
    stroke_width: Option<f32>,
) -> Result<(), String> {
    state.with_document_mut(|doc| {
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
    let path = current_path.as_ref().ok_or("No PDF file open")?.clone();

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
    let cert_path = security::validate_certificate_input_path(&cert_path)?;
    let output_path = security::validate_dialog_output_path(&output_path, &["pdf"])?;
    state.with_document_mut(|doc| doc.sign(&cert_path, &password, &reason, &output_path))
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

#[tauri::command]
fn convert_to_pdfa(
    state: State<AppState>,
    level: String,
    output_path: String,
) -> Result<PdfAValidationResult, String> {
    let output_path = security::validate_dialog_output_path(&output_path, &["pdf"])?;
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
    let output_path = security::validate_dialog_output_path(&output_path, &["pdf"])?;
    state.with_document_mut(|doc| doc.encrypt(&user_password, &owner_password, &output_path))
}

#[tauri::command]
fn decrypt_pdf(state: State<AppState>, password: String) -> Result<(), String> {
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
fn redact_search(state: State<AppState>, query: String) -> Result<SearchRedactReport, String> {
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
#[tauri::command]
fn format_text_span(
    state: State<AppState>,
    request: FormatTextSpanRequest,
) -> Result<FormatTextSpanResult, String> {
    let formatted = state.with_document_mut(|doc| {
        doc.format_text_span(
            request.page_index,
            &request.original_text,
            request.font_size,
            request.color,
        )
    })?;
    Ok(FormatTextSpanResult { formatted })
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
#[tauri::command]
fn set_text_run_style(
    state: State<AppState>,
    request: SetTextRunStyleRequest,
) -> Result<SetTextRunStyleResult, String> {
    let styled = state.with_document_mut(|doc| {
        doc.set_text_run_style(
            request.page_index,
            &request.original_text,
            request.bold,
            request.italic,
        )
    })?;
    Ok(SetTextRunStyleResult { styled })
}

// ── OCR commands ──────────────────────────────────────────────────────

#[tauri::command]
fn get_ocr_status() -> OcrRuntimeStatus {
    get_ocr_status_command()
}

#[tauri::command]
fn run_paddle_ocr(payload: PaddleOcrRequest) -> Result<PaddleOcrResponse, String> {
    // request_id is reserved for future async/cancel support; use 0 for now
    let request_id: u32 = 0;
    run_paddle_ocr_command(request_id, payload)
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
    state.with_document_mut(|doc| doc.add_attachment(&name, &data, &mime_type))
}

#[tauri::command]
fn remove_attachment(state: State<AppState>, name: String) -> Result<(), String> {
    state.with_document_mut(|doc| doc.remove_attachment(&name))
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
    let Some(selected) = app.dialog().file().set_file_name(name).blocking_save_file() else {
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
    let Some(selected) = app.dialog().file().blocking_pick_file() else {
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
    state.with_document_mut(|doc| doc.add_attachment(&name, &data, "application/octet-stream"))?;
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
            &PredefinedMenuItem::quit(handle, Some("Quit PDFluent")).map_err(|e| e.to_string())?,
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
            &MenuItemBuilder::with_id("help_send_feedback", "Send Feedback…")
                .build(handle)
                .map_err(|e| e.to_string())?,
        )
        .item(
            &MenuItemBuilder::with_id("help_report_problem", "Report a Problem…")
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

/// Durable local log file: ~/Library/Logs/com.pdfluent.app/PDFluent.log (macOS).
#[cfg(target_os = "macos")]
fn app_log_file_path() -> Option<std::path::PathBuf> {
    let dir = dirs::home_dir()?
        .join("Library")
        .join("Logs")
        .join("com.pdfluent.app");
    std::fs::create_dir_all(&dir).ok()?;
    Some(dir.join("PDFluent.log"))
}

/// Append a timestamped line to the durable local log (and echo to stderr, which
/// also reaches the macOS unified log when launched from Finder). Best-effort and
/// `unsafe`-free; complements the panic crash file. Lets us see how far startup or
/// an open-file operation got when something stalls (e.g. a macOS permission
/// prompt blocking a filesystem call).
pub fn applog(msg: &str) {
    eprintln!("{msg}");
    #[cfg(target_os = "macos")]
    {
        use std::io::Write;
        let ts = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|d| d.as_secs())
            .unwrap_or(0);
        if let Some(path) = app_log_file_path() {
            if let Ok(mut f) = std::fs::OpenOptions::new().create(true).append(true).open(path) {
                let _ = writeln!(f, "[{ts}] {msg}");
            }
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
    applog(&format!(
        "PDFluent {} starting (pid {}) [frontend {}]",
        env!("CARGO_PKG_VERSION"),
        std::process::id(),
        FRONTEND_FINGERPRINT
    ));

    // Debug-only, env-gated security-scoped-bookmark self-test. Never compiled
    // into release builds. Runs the bookmark round-trip in a fresh process and
    // exits, so validation can prove (via logs) that recent-file access comes
    // from the resolved bookmark and that every start is balanced by a stop.
    #[cfg(debug_assertions)]
    maybe_run_bookmark_selftest();

    // A PDF path passed on the command line: Windows/Linux "open with" cold
    // start, or `open --args` on macOS. (macOS file-association double-clicks
    // arrive later as RunEvent::Opened, handled in .run() below.)
    let cli_pending: Option<String> = std::env::args()
        .skip(1)
        .find(|a| a.to_lowercase().ends_with(".pdf"));

    tauri::Builder::default()
        .setup(|app| {
            configure_bundled_font_cache(app);

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
            app.manage(telemetry::TelemetryState {
                crash_file: Mutex::new(crash_file),
            });

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

                app.on_menu_event(|app, event| {
                    let id = event.id().0.as_str();
                    // Feedback / problem reporting both open our own feedback
                    // address; Cloudflare routes it to the right destination.
                    if id == "help_send_feedback" || id == "help_report_problem" {
                        let _ = telemetry::open_external_url(telemetry::FEEDBACK_URL.to_string());
                    } else if id == "help_open_website" {
                        let _ = telemetry::open_external_url(WEBSITE_URL.to_string());
                    } else if id == "help_open_license" {
                        // Proprietary EULA / commercial terms.
                        let _ = telemetry::open_external_url(LICENSE_URL.to_string());
                    } else if id == "help_open_notices" {
                        // Third-party open-source notices — never the EULA page.
                        open_oss_notices(app);
                    }
                    let _ = app.emit("menu-event", id);
                });
            }

            if let Some(window) = app.get_webview_window("main") {
                let _ = window.show();
                let _ = window.set_focus();
            }

            spawn_startup_watchdog(app.handle().clone());
            Ok(())
        })
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_fs::init())
        .manage(AppState {
            document: Mutex::new(None),
            current_path: Mutex::new(None),
            tts_child: Mutex::new(None),
        })
        .manage(PendingOpen(Mutex::new(cli_pending)))
        .invoke_handler(tauri::generate_handler![
            frontend_ready,
            open_pdf,
            pick_pdf_dialog,
            remember_file_access,
            prepare_recent_open,
            release_file_access,
            #[cfg(debug_assertions)]
            active_scope_count,
            #[cfg(debug_assertions)]
            probe_raw_access,
            close_pdf,
            get_document_info,
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
            // Text mutation (Phase 4) + text formatting (G5/G6)
            replace_text_span,
            format_text_span,
            set_text_run_style,
            // OCR
            get_ocr_status,
            run_paddle_ocr,
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
            // E-invoicing
            extract_invoice_data,
            validate_invoice,
            // Telemetry (crash reporting & feedback)
            telemetry::get_environment,
            telemetry::take_pending_crashes,
            telemetry::open_external_url,
            take_pending_open,
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
                    if let Some(state) = app_handle.try_state::<PendingOpen>() {
                        if let Ok(mut pending) = state.0.lock() {
                            *pending = Some(path.clone());
                        }
                    }
                    let _ = app_handle.emit("open-file", path);
                }
            }
            #[cfg(not(target_os = "macos"))]
            let _ = (&app_handle, &event);
        });
}

// ── Tests ─────────────────────────────────────────────────────────────────
#[cfg(test)]
mod tests {
    use super::sanitize_scale;

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
