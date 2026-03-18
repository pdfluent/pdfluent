// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary and confidential.
// Free for personal, non-commercial use.
// Commercial use requires a valid license.
// See https://pdfluent.com/license for terms.

//! Paddle OCR bridge — spawns the Python bridge script and returns the JSON result.

use base64::Engine as _;
use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use std::process::Command;
use std::time::{SystemTime, UNIX_EPOCH};

// ---------------------------------------------------------------------------
// Request / response types
// ---------------------------------------------------------------------------

#[derive(Debug, Deserialize)]
pub struct PaddleOcrRequest {
    pub image_base64: String,
    pub language: String,
    pub include_structure: bool,
    pub preprocess_mode: String,
    pub preprocess_steps: Option<Vec<String>>,
    pub auto_confidence_threshold: Option<f64>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct PaddleOcrResponse {
    pub engine: String,
    pub language: String,
    pub words: Vec<serde_json::Value>,
    pub text: String,
    pub structure_blocks: Vec<serde_json::Value>,
    pub average_confidence: f64,
    pub preprocessing_applied: bool,
    pub preprocessing_mode: String,
    pub preprocessing_steps: Vec<String>,
    pub preprocessing_reason: String,
    pub quality_metrics: serde_json::Value,
}

// ---------------------------------------------------------------------------
// Bridge invocation
// ---------------------------------------------------------------------------

/// Resolve the path to the paddle_ocr_bridge.py script relative to the binary.
fn bridge_script_path() -> PathBuf {
    // In production the script is bundled next to the binary in `scripts/`.
    // In development it lives at `src-tauri/scripts/paddle_ocr_bridge.py`.
    let exe_dir = std::env::current_exe()
        .ok()
        .and_then(|p| p.parent().map(|d| d.to_path_buf()))
        .unwrap_or_else(|| PathBuf::from("."));

    let candidates = [
        exe_dir.join("scripts").join("paddle_ocr_bridge.py"),
        PathBuf::from("src-tauri/scripts/paddle_ocr_bridge.py"),
    ];
    for path in &candidates {
        if path.exists() {
            return path.clone();
        }
    }
    candidates[1].clone() // fallback — will fail with a clear error at runtime
}

/// Resolve the Python interpreter inside the .venv-ocr virtual environment.
fn python_executable() -> PathBuf {
    let exe_dir = std::env::current_exe()
        .ok()
        .and_then(|p| p.parent().map(|d| d.to_path_buf()))
        .unwrap_or_else(|| PathBuf::from("."));

    let venv_candidates = [
        exe_dir.join(".venv-ocr/bin/python3"),
        PathBuf::from(".venv-ocr/bin/python3"),
    ];
    for path in &venv_candidates {
        if path.exists() {
            return path.clone();
        }
    }
    PathBuf::from("python3") // system fallback
}

/// Execute the PaddleOCR bridge for a single rendered page image.
/// `_request_id` is reserved for future async/cancel support.
pub fn run_paddle_ocr_command(
    _request_id: u32,
    payload: PaddleOcrRequest,
) -> Result<PaddleOcrResponse, String> {
    // Decode base64 image into a temp file so the Python script can read it
    let image_bytes = base64::engine::general_purpose::STANDARD
        .decode(&payload.image_base64)
        .map_err(|e| format!("base64 decode error: {e}"))?;

    // Build a unique temp file path using timestamp + request_id
    let ts = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis())
        .unwrap_or(0);
    let tmp_path = std::env::temp_dir()
        .join(format!("pdfluent_ocr_{ts}_{_request_id}.png"))
        .to_string_lossy()
        .to_string();

    use std::io::Write as _;
    let mut tmp_file = std::fs::File::create(&tmp_path)
        .map_err(|e| format!("create temp image error: {e}"))?;
    tmp_file
        .write_all(&image_bytes)
        .map_err(|e| format!("write temp image error: {e}"))?;
    drop(tmp_file);

    // Build the subprocess command
    let mut cmd = Command::new(python_executable());
    cmd.arg(bridge_script_path());
    cmd.arg("--input-image").arg(&tmp_path);
    cmd.arg("--language").arg(&payload.language);
    cmd.arg("--include-structure")
        .arg(if payload.include_structure { "1" } else { "0" });
    cmd.arg("--preprocess-mode").arg(&payload.preprocess_mode);

    if let Some(ref steps) = payload.preprocess_steps {
        if !steps.is_empty() {
            cmd.arg("--preprocess-steps").arg(steps.join(","));
        }
    }

    if let Some(threshold) = payload.auto_confidence_threshold {
        cmd.arg("--auto-confidence-threshold")
            .arg(threshold.to_string());
    }

    let output = cmd
        .output()
        .map_err(|e| format!("failed to spawn OCR bridge: {e}"))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("OCR bridge exited with error: {stderr}"));
    }

    let stdout = String::from_utf8_lossy(&output.stdout);
    let response: PaddleOcrResponse = serde_json::from_str(&stdout)
        .map_err(|e| format!("OCR JSON parse error: {e}\nraw: {stdout}"))?;

    Ok(response)
}
