// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary. The PDFluent application is free to use,
// including for commercial purposes. Redistribution, or extraction or reuse
// of its components (including the embedded PDF engine), requires a licence.
// See https://pdfluent.com/license for terms.

//! Telemetry support for crash reporting & feedback (plan §10 Fase 0).
//!
//! Privacy-first by construction: this module only *captures* crashes to a
//! local file and exposes the minimal environment a crash needs. It NEVER
//! sends anything itself — the frontend scrubs and asks the user first. No
//! file paths, document contents, IP or user identity are gathered here; the
//! raw panic text is scrubbed on the frontend (in `buildReport`) before it can
//! ever leave the machine.

use std::io::Write;
use std::path::PathBuf;
use std::sync::Mutex;

use serde::{Deserialize, Serialize};

/// File (NDJSON) under the app log dir where the panic hook records crashes
/// that have not yet been offered to the user ("detect on next launch").
pub const CRASH_FILE_NAME: &str = "pending-crashes.ndjson";

/// Our own feedback address (plan §9). The app bakes in only this pdfluent.com
/// URL; Cloudflare controls where it actually points (website form now,
/// Featurebase later) so released versions are always re-routable.
pub const FEEDBACK_URL: &str = "https://feedback.pdfluent.com";

/// Minimal, non-identifying runtime environment for a report payload.
/// Locale is intentionally omitted — the frontend supplies the active UI
/// language it already knows, rather than us guessing it here.
#[derive(Debug, Clone, Serialize)]
pub struct Environment {
    pub app_version: String,
    pub os: String,
    pub os_version: Option<String>,
}

/// One locally-recorded crash. `stack` holds the raw backtrace; it is scrubbed
/// on the frontend before any send.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PendingCrash {
    pub message: String,
    pub stack: Option<String>,
}

/// Managed state: the resolved paths of the two files this module owns. The
/// crash file is shared by the panic hook (write) and `take_pending_crashes`
/// (read + clear); the session file is written on start and on clean exit and
/// read by `session_reliability`.
pub struct TelemetryState {
    pub crash_file: Mutex<PathBuf>,
    pub session_file: Mutex<PathBuf>,
}

/// Human-friendly OS name, matching what the review dialog displays.
fn os_name() -> String {
    match std::env::consts::OS {
        "macos" => "macOS",
        "windows" => "Windows",
        "linux" => "Linux",
        other => other,
    }
    .to_string()
}

/// Install the global panic hook. It appends a scrub-on-send crash record to
/// `crash_file` and then chains to the previous hook so normal logging still
/// happens. Must run early in `setup()`.
pub fn install_panic_hook(crash_file: PathBuf) {
    let previous = std::panic::take_hook();
    std::panic::set_hook(Box::new(move |info| {
        let message = info.to_string();
        let backtrace = std::backtrace::Backtrace::force_capture().to_string();
        let record = PendingCrash {
            message,
            stack: Some(backtrace),
        };
        if let Ok(line) = serde_json::to_string(&record) {
            if let Some(parent) = crash_file.parent() {
                let _ = std::fs::create_dir_all(parent);
            }
            if let Ok(mut file) = std::fs::OpenOptions::new()
                .create(true)
                .append(true)
                .open(&crash_file)
            {
                let _ = writeln!(file, "{line}");
            }
        }
        // Preserve default behaviour (stderr logging, abort, etc.).
        previous(info);
    }));
}

/// Return the minimal environment for a report payload.
#[tauri::command]
pub fn get_environment() -> Environment {
    Environment {
        app_version: env!("CARGO_PKG_VERSION").to_string(),
        os: os_name(),
        // OS version detection is deliberately omitted in Fase 0 to avoid an
        // extra dependency; the field is nullable in the schema.
        os_version: None,
    }
}

/// Read and clear any crashes the panic hook recorded on a previous run. The
/// frontend drains these on launch to offer the review dialog. Returns an
/// empty list (never errors) so a missing/corrupt file can't block startup.
#[tauri::command]
pub fn take_pending_crashes(state: tauri::State<'_, TelemetryState>) -> Vec<PendingCrash> {
    let path = match state.crash_file.lock() {
        Ok(guard) => guard.clone(),
        Err(_) => return Vec::new(),
    };

    let contents = match std::fs::read_to_string(&path) {
        Ok(text) => text,
        Err(_) => return Vec::new(), // no file yet = no pending crashes
    };

    // Best-effort clear; if removal fails we still return what we read.
    let _ = std::fs::remove_file(&path);

    contents
        .lines()
        .filter(|line| !line.trim().is_empty())
        .filter_map(|line| serde_json::from_str::<PendingCrash>(line).ok())
        .collect()
}

/// How many sessions ended cleanly. Read from the local session file; nothing
/// is sent from here. The frontend asks for this only while building a crash or
/// feedback report, and writes the answer into the text the user reads before
/// deciding whether to send it -- the opt-in path, and nowhere else.
#[tauri::command]
pub fn session_reliability(state: tauri::State<'_, TelemetryState>) -> crate::session_log::SessionCounts {
    match state.session_file.lock() {
        Ok(path) => crate::session_log::read_counts(path.as_path()),
        // A poisoned lock is not a reason to fail a report; no history is the
        // honest answer, and the caller renders nothing for it.
        Err(_) => crate::session_log::count_sessions(""),
    }
}

/// Open an external URL in the user's default browser. Restricted to our own
/// `https://*.pdfluent.com` addresses so the app never hands an arbitrary URL
/// to the OS (plan §9: we only ever bake in addresses we control).
#[tauri::command]
pub fn open_external_url(url: String) -> Result<(), String> {
    let allowed = url.starts_with("https://")
        && url
            .strip_prefix("https://")
            .map(|rest| {
                let host = rest
                    .split(['/', '?', '#'])
                    .next()
                    .unwrap_or("");
                host == "pdfluent.com" || host.ends_with(".pdfluent.com")
            })
            .unwrap_or(false);

    if !allowed {
        return Err("refused: only https pdfluent.com URLs are allowed".to_string());
    }

    open::that(&url).map_err(|e| format!("Failed to open URL: {e}"))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn os_name_is_non_empty() {
        assert!(!os_name().is_empty());
    }

    #[test]
    fn open_external_url_rejects_non_pdfluent_hosts() {
        assert!(open_external_url("https://evil.com".into()).is_err());
        assert!(open_external_url("http://pdfluent.com".into()).is_err());
        assert!(open_external_url("https://pdfluent.com.evil.com".into()).is_err());
    }

    #[test]
    fn pending_crash_roundtrips_through_json() {
        let crash = PendingCrash {
            message: "panic: boom".into(),
            stack: Some("frame 1\nframe 2".into()),
        };
        let line = serde_json::to_string(&crash).unwrap();
        let back: PendingCrash = serde_json::from_str(&line).unwrap();
        assert_eq!(back.message, "panic: boom");
        assert_eq!(back.stack.as_deref(), Some("frame 1\nframe 2"));
    }
}
