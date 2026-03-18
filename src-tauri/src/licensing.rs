// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary and confidential.
// Free for personal, non-commercial use.
// Commercial use requires a valid license.
// See https://pdfluent.com/license for terms.

//! License discovery, validation, and Tauri command integration.
//!
//! Scans well-known filesystem paths for license files, validates them using
//! Ed25519 public keys (primary + fallback for key rotation), and exposes
//! Tauri commands for the frontend to query and manage the license state.

use serde::Serialize;
use std::path::PathBuf;
use std::sync::Mutex;
use std::time::{SystemTime, UNIX_EPOCH};
use xfa_license::{LicenseGuard, Tier};

// ---------------------------------------------------------------------------
// Embedded public keys (placeholder — replace before release)
// ---------------------------------------------------------------------------

/// Primary Ed25519 public key for license verification.
/// This is a placeholder key that MUST be replaced before production release.
const PRIMARY_PUBLIC_KEY: [u8; 32] = [
    0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07, 0x08, 0x09, 0x0a, 0x0b, 0x0c, 0x0d, 0x0e, 0x0f,
    0x10, 0x11, 0x12, 0x13, 0x14, 0x15, 0x16, 0x17, 0x18, 0x19, 0x1a, 0x1b, 0x1c, 0x1d, 0x1e,
    0x1f, 0x20,
];

/// Fallback Ed25519 public key for key rotation support.
/// When the primary key is rotated, the old key moves here so that existing
/// license files issued with the previous key remain valid until they expire.
const FALLBACK_PUBLIC_KEY: [u8; 32] = [
    0x20, 0x1f, 0x1e, 0x1d, 0x1c, 0x1b, 0x1a, 0x19, 0x18, 0x17, 0x16, 0x15, 0x14, 0x13, 0x12,
    0x11, 0x10, 0x0f, 0x0e, 0x0d, 0x0c, 0x0b, 0x0a, 0x09, 0x08, 0x07, 0x06, 0x05, 0x04, 0x03,
    0x02, 0x01,
];

// ---------------------------------------------------------------------------
// License file names
// ---------------------------------------------------------------------------

/// File names we look for when scanning directories.
const LICENSE_FILE_NAMES: &[&str] = &["pdfluent-license.json"];

/// Glob-style suffix for wildcard matching.
const LICENSE_FILE_SUFFIX: &str = ".license.json";

// ---------------------------------------------------------------------------
// Types exposed to the frontend
// ---------------------------------------------------------------------------

/// Serializable license status returned to the frontend via Tauri commands.
#[derive(Debug, Clone, Serialize)]
pub struct LicenseStatus {
    /// Whether a valid license is loaded.
    pub licensed: bool,
    /// Human-readable tier name.
    pub tier: String,
    /// Name of the licensee (empty for personal use).
    pub licensee: String,
    /// Company name (empty for personal use).
    pub company: String,
    /// Number of seats in the license.
    pub seats: u32,
    /// Unix timestamp when the license was issued (0 for personal).
    pub issued_at: u64,
    /// Unix timestamp when the license expires (0 for personal).
    pub expires_at: u64,
    /// Path to the license file on disk, if any.
    pub license_file_path: Option<String>,
    /// Whether the license has expired.
    pub expired: bool,
    /// Human-readable error message, if license validation failed.
    pub error: Option<String>,
}

/// Internal state holding the active license guard and optional file path.
pub struct LicenseState {
    guard: LicenseGuard,
    file_path: Option<PathBuf>,
    error: Option<String>,
}

impl LicenseState {
    /// Create a new unlicensed (personal use) state.
    pub fn personal() -> Self {
        Self {
            guard: xfa_license::unlicensed_guard(),
            file_path: None,
            error: None,
        }
    }

    /// Build a `LicenseStatus` snapshot for the frontend.
    pub fn to_status(&self) -> LicenseStatus {
        let now = unix_now();
        let expired = self.guard.check_expiry(now).is_err();
        let tier = self.guard.tier();

        LicenseStatus {
            licensed: !matches!(tier, Tier::Trial),
            tier: tier_display_name(tier),
            licensee: self.guard.licensee().to_string(),
            company: self.guard.company().to_string(),
            seats: self.guard.seats(),
            issued_at: self.guard.payload().issued_at,
            expires_at: self.guard.payload().expires_at,
            license_file_path: self.file_path.as_ref().map(|p| p.display().to_string()),
            expired,
            error: self.error.clone(),
        }
    }
}

/// Thread-safe wrapper for `LicenseState`.
pub struct LicenseManager {
    pub state: Mutex<LicenseState>,
}

impl LicenseManager {
    /// Create a new manager starting in personal/unlicensed mode.
    #[allow(dead_code)]
    pub fn new() -> Self {
        Self {
            state: Mutex::new(LicenseState::personal()),
        }
    }
}

// ---------------------------------------------------------------------------
// License discovery
// ---------------------------------------------------------------------------

/// Return a list of directories to scan for license files, in priority order.
fn license_search_dirs() -> Vec<PathBuf> {
    let mut dirs = Vec::new();

    // 1. Same directory as the running executable.
    if let Ok(exe) = std::env::current_exe() {
        if let Some(dir) = exe.parent() {
            dirs.push(dir.to_path_buf());
        }
    }

    // 2. Platform-specific application config directory.
    #[cfg(target_os = "macos")]
    {
        if let Some(home) = dirs::home_dir() {
            dirs.push(home.join("Library/Application Support/com.pdfluent.app"));
        }
    }
    #[cfg(target_os = "linux")]
    {
        if let Some(home) = dirs::home_dir() {
            dirs.push(home.join(".config/pdfluent"));
        }
    }
    #[cfg(target_os = "windows")]
    {
        if let Ok(appdata) = std::env::var("APPDATA") {
            dirs.push(PathBuf::from(appdata).join("pdfluent"));
        }
    }

    // 3. User home directory.
    if let Some(home) = dirs::home_dir() {
        dirs.push(home);
    }

    dirs
}

/// Find the first license file in the well-known directories.
fn discover_license_file() -> Option<PathBuf> {
    for dir in license_search_dirs() {
        if !dir.is_dir() {
            continue;
        }

        // Check exact file names first.
        for name in LICENSE_FILE_NAMES {
            let candidate = dir.join(name);
            if candidate.is_file() {
                return Some(candidate);
            }
        }

        // Check for *.license.json files.
        if let Ok(entries) = std::fs::read_dir(&dir) {
            for entry in entries.flatten() {
                let path = entry.path();
                if let Some(name) = path.file_name().and_then(|n| n.to_str()) {
                    if name.ends_with(LICENSE_FILE_SUFFIX) && path.is_file() {
                        return Some(path);
                    }
                }
            }
        }
    }

    None
}

// ---------------------------------------------------------------------------
// Validation with key rotation
// ---------------------------------------------------------------------------

/// Try to validate a license JSON string using the primary key first,
/// then the fallback key. Returns the guard on success.
fn validate_with_key_rotation(license_json: &str, now: u64) -> Result<LicenseGuard, String> {
    // Try primary key.
    match LicenseGuard::from_license(&PRIMARY_PUBLIC_KEY, license_json, now) {
        Ok(guard) => return Ok(guard),
        Err(e) => {
            // Only fall through to fallback if the error is a signature issue.
            let is_signature_error = matches!(
                e,
                xfa_license::LicenseError::InvalidSignature
                    | xfa_license::LicenseError::InvalidPublicKey
            );
            if !is_signature_error {
                return Err(e.to_string());
            }
        }
    }

    // Try fallback key.
    LicenseGuard::from_license(&FALLBACK_PUBLIC_KEY, license_json, now).map_err(|e| e.to_string())
}

/// Validate a license file at the given path.
fn validate_license_file(path: &PathBuf) -> Result<LicenseGuard, String> {
    let json = std::fs::read_to_string(path).map_err(|e| format!("cannot read license file: {e}"))?;
    let now = unix_now();
    validate_with_key_rotation(&json, now)
}

// ---------------------------------------------------------------------------
// Startup discovery
// ---------------------------------------------------------------------------

/// Scan the filesystem for a license file and validate it.
/// Called once during app initialization.
pub fn discover_and_validate() -> LicenseState {
    match discover_license_file() {
        Some(path) => match validate_license_file(&path) {
            Ok(guard) => LicenseState {
                guard,
                file_path: Some(path),
                error: None,
            },
            Err(e) => LicenseState {
                guard: xfa_license::unlicensed_guard(),
                file_path: Some(path),
                error: Some(e),
            },
        },
        None => LicenseState::personal(),
    }
}

// ---------------------------------------------------------------------------
// Tauri commands
// ---------------------------------------------------------------------------

/// Get the current license status.
#[tauri::command]
pub fn get_license_status(
    license_manager: tauri::State<LicenseManager>,
) -> Result<LicenseStatus, String> {
    let state = license_manager
        .state
        .lock()
        .map_err(|e| e.to_string())?;
    Ok(state.to_status())
}

/// Activate a license from a file path.
///
/// Reads, validates, and (if valid) installs the license. Also copies the
/// license file to the platform config directory for future auto-discovery.
#[tauri::command]
pub fn activate_license(
    license_manager: tauri::State<LicenseManager>,
    path: String,
) -> Result<LicenseStatus, String> {
    let license_path = PathBuf::from(&path);

    if !license_path.is_file() {
        return Err(format!("License file not found: {path}"));
    }

    let guard = validate_license_file(&license_path)?;

    // Copy to config directory for auto-discovery on next launch.
    let _ = copy_to_config_dir(&license_path);

    let mut state = license_manager
        .state
        .lock()
        .map_err(|e| e.to_string())?;

    *state = LicenseState {
        guard,
        file_path: Some(license_path),
        error: None,
    };

    Ok(state.to_status())
}

/// Deactivate the current license and revert to personal/free mode.
#[tauri::command]
pub fn deactivate_license(
    license_manager: tauri::State<LicenseManager>,
) -> Result<LicenseStatus, String> {
    let mut state = license_manager
        .state
        .lock()
        .map_err(|e| e.to_string())?;

    // Remove the copied license file from the config directory.
    if let Some(ref path) = state.file_path {
        let _ = remove_from_config_dir(path);
    }

    *state = LicenseState::personal();
    Ok(state.to_status())
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/// Get the platform-specific config directory for PDFluent.
fn config_dir() -> Option<PathBuf> {
    #[cfg(target_os = "macos")]
    {
        dirs::home_dir().map(|h| h.join("Library/Application Support/com.pdfluent.app"))
    }
    #[cfg(target_os = "linux")]
    {
        dirs::home_dir().map(|h| h.join(".config/pdfluent"))
    }
    #[cfg(target_os = "windows")]
    {
        std::env::var("APPDATA")
            .ok()
            .map(|a| PathBuf::from(a).join("pdfluent"))
    }
    #[cfg(not(any(target_os = "macos", target_os = "linux", target_os = "windows")))]
    {
        None
    }
}

/// Copy a license file into the config directory so it is auto-discovered next time.
fn copy_to_config_dir(source: &PathBuf) -> Result<(), String> {
    let dir = config_dir().ok_or("no config directory")?;
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let dest = dir.join("pdfluent-license.json");
    std::fs::copy(source, dest).map_err(|e| e.to_string())?;
    Ok(())
}

/// Remove the license file from the config directory.
fn remove_from_config_dir(source: &PathBuf) -> Result<(), String> {
    let dir = config_dir().ok_or("no config directory")?;
    let dest = dir.join("pdfluent-license.json");
    if dest.is_file() {
        std::fs::remove_file(&dest).map_err(|e| e.to_string())?;
    }
    // If the source itself is inside the config dir, also remove it.
    if source.is_file() && source.starts_with(&dir) {
        let _ = std::fs::remove_file(source);
    }
    Ok(())
}

/// Current Unix timestamp in seconds.
fn unix_now() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs()
}

/// Human-readable display name for a license tier.
fn tier_display_name(tier: Tier) -> String {
    match tier {
        Tier::Trial => "Personal".to_string(),
        Tier::Basic => "Basic".to_string(),
        Tier::Professional => "Professional".to_string(),
        Tier::Enterprise => "Enterprise".to_string(),
        Tier::Archival => "Archival".to_string(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn personal_mode_status() {
        let state = LicenseState::personal();
        let status = state.to_status();
        assert!(!status.licensed);
        assert_eq!(status.tier, "Personal");
        assert_eq!(status.licensee, "Personal Use");
        assert!(status.license_file_path.is_none());
        assert!(!status.expired);
        assert!(status.error.is_none());
    }

    #[test]
    fn tier_display_names() {
        assert_eq!(tier_display_name(Tier::Trial), "Personal");
        assert_eq!(tier_display_name(Tier::Basic), "Basic");
        assert_eq!(tier_display_name(Tier::Professional), "Professional");
        assert_eq!(tier_display_name(Tier::Enterprise), "Enterprise");
        assert_eq!(tier_display_name(Tier::Archival), "Archival");
    }

    #[test]
    fn license_search_dirs_not_empty() {
        let dirs = license_search_dirs();
        // Should always contain at least the exe directory and home.
        assert!(!dirs.is_empty());
    }
}
