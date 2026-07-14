// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary. The PDFluent application is free to use,
// including for commercial purposes. Redistribution, or extraction or reuse
// of its components (including the embedded PDF engine), requires a licence.
// See https://pdfluent.com/license for terms.

//! Paddle OCR bridge — spawns the Python bridge script and returns the JSON result.

use base64::Engine as _;
use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;
use std::path::{Path, PathBuf};
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
// Runtime status / engine boundary
// ---------------------------------------------------------------------------

#[derive(Debug, Serialize, Clone)]
pub struct OcrRuntimeStatus {
    pub available: bool,
    pub python_path: Option<String>,
    pub python_source: Option<String>,
    pub bridge_path: String,
    pub bridge_available: bool,
    pub missing_packages: Vec<String>,
    pub diagnostics: Vec<String>,
    pub remediation: String,
    pub package_versions: BTreeMap<String, String>,
}

pub trait OcrEngine {
    fn status(&self) -> OcrRuntimeStatus;
    fn run(&self, request_id: u32, payload: PaddleOcrRequest) -> Result<PaddleOcrResponse, String>;
}

#[derive(Debug, Default)]
pub struct PaddleOcrPythonEngine;

#[derive(Debug, Clone)]
struct PythonCandidate {
    path: PathBuf,
    source: String,
}

#[derive(Debug, Deserialize)]
struct PythonCheckPayload {
    executable: Option<String>,
    missing: Vec<String>,
    versions: BTreeMap<String, String>,
}

const STATUS_PREFIX: &str = "PDFLUENT_OCR_STATUS=";

const IMPORT_CHECK_SCRIPT: &str = r#"
import importlib
import json
import sys

modules = {
    "paddleocr": "paddleocr",
    "numpy": "numpy",
    "cv2": "opencv-python",
}

missing = []
versions = {}
for module_name, package_name in modules.items():
    try:
        module = importlib.import_module(module_name)
        versions[package_name] = str(getattr(module, "__version__", "unknown"))
    except Exception:
        missing.append(package_name)

payload = {
    "executable": sys.executable,
    "missing": missing,
    "versions": versions,
}
print("PDFLUENT_OCR_STATUS=" + json.dumps(payload, sort_keys=True))
sys.exit(1 if missing else 0)
"#;

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
    candidates[1].clone()
}

fn add_python_candidate(
    candidates: &mut Vec<PythonCandidate>,
    path: PathBuf,
    source: impl Into<String>,
) {
    if candidates.iter().any(|candidate| candidate.path == path) {
        return;
    }
    candidates.push(PythonCandidate {
        path,
        source: source.into(),
    });
}

fn add_venv_candidates(
    candidates: &mut Vec<PythonCandidate>,
    root: PathBuf,
    source: impl Into<String>,
) {
    let source = source.into();
    #[cfg(target_os = "windows")]
    let rel_paths = ["Scripts/python.exe", "python.exe"];
    #[cfg(not(target_os = "windows"))]
    let rel_paths = ["bin/python3", "bin/python"];

    for rel in rel_paths {
        add_python_candidate(candidates, root.join(rel), source.clone());
    }
}

fn python_candidates() -> Vec<PythonCandidate> {
    let mut candidates = Vec::new();

    if let Ok(path) = std::env::var("PDFLUENT_OCR_PYTHON") {
        if !path.trim().is_empty() {
            add_python_candidate(&mut candidates, PathBuf::from(path), "PDFLUENT_OCR_PYTHON");
        }
    }

    if let Ok(path) = std::env::var("PDFLUENT_OCR_VENV") {
        if !path.trim().is_empty() {
            add_venv_candidates(&mut candidates, PathBuf::from(path), "PDFLUENT_OCR_VENV");
        }
    }

    if let Ok(path) = std::env::var("PDFLUENT_OCR_RUNTIME_DIR") {
        if !path.trim().is_empty() {
            add_venv_candidates(
                &mut candidates,
                PathBuf::from(path),
                "PDFLUENT_OCR_RUNTIME_DIR",
            );
        }
    }

    if let Some(exe_dir) = std::env::current_exe()
        .ok()
        .and_then(|p| p.parent().map(|d| d.to_path_buf()))
    {
        add_venv_candidates(&mut candidates, exe_dir.join(".venv-ocr"), "app .venv-ocr");
        add_venv_candidates(
            &mut candidates,
            exe_dir.join("ocr-runtime"),
            "app ocr-runtime",
        );
    }

    if let Ok(cwd) = std::env::current_dir() {
        add_venv_candidates(
            &mut candidates,
            cwd.join(".venv-ocr"),
            "workspace .venv-ocr",
        );
        add_venv_candidates(
            &mut candidates,
            cwd.join("src-tauri").join(".venv-ocr"),
            "src-tauri .venv-ocr",
        );
    }

    add_python_candidate(&mut candidates, PathBuf::from("python3"), "PATH python3");
    add_python_candidate(&mut candidates, PathBuf::from("python"), "PATH python");

    candidates
}

fn is_bare_command(path: &Path) -> bool {
    path.components().count() == 1
}

fn should_try_candidate(path: &Path) -> bool {
    is_bare_command(path) || path.exists()
}

fn display_path(path: &Path) -> String {
    path.to_string_lossy().to_string()
}

fn parse_check_payload(stdout: &[u8]) -> Result<PythonCheckPayload, String> {
    let stdout = String::from_utf8_lossy(stdout);
    let line = stdout
        .lines()
        .rev()
        .find(|line| line.starts_with(STATUS_PREFIX))
        .ok_or_else(|| format!("health check did not emit {STATUS_PREFIX}"))?;
    serde_json::from_str::<PythonCheckPayload>(&line[STATUS_PREFIX.len()..])
        .map_err(|e| format!("health check JSON parse error: {e}"))
}

fn push_unique_missing(missing: &mut Vec<String>, package: String) {
    if !missing.iter().any(|existing| existing == &package) {
        missing.push(package);
    }
}

fn unavailable_status(
    bridge_path: &Path,
    bridge_available: bool,
    python_path: Option<String>,
    python_source: Option<String>,
    missing_packages: Vec<String>,
    diagnostics: Vec<String>,
    package_versions: BTreeMap<String, String>,
) -> OcrRuntimeStatus {
    let remediation = if !bridge_available {
        "OCR bridge script is missing from the app resources.".to_string()
    } else if !missing_packages.is_empty() {
        "Install the PaddleOCR runtime packages, or point PDFLUENT_OCR_PYTHON at an environment that already contains paddleocr, numpy, and opencv-python.".to_string()
    } else {
        "Configure PDFLUENT_OCR_PYTHON or PDFLUENT_OCR_VENV to an existing open-source PaddleOCR Python environment.".to_string()
    };

    OcrRuntimeStatus {
        available: false,
        python_path,
        python_source,
        bridge_path: display_path(bridge_path),
        bridge_available,
        missing_packages,
        diagnostics,
        remediation,
        package_versions,
    }
}

impl OcrEngine for PaddleOcrPythonEngine {
    fn status(&self) -> OcrRuntimeStatus {
        let bridge_path = bridge_script_path();
        let bridge_available = bridge_path.exists();
        let mut diagnostics = vec![format!("OCR bridge: {}", display_path(&bridge_path))];
        let mut first_python_path: Option<String> = None;
        let mut first_python_source: Option<String> = None;
        let mut missing_packages: Vec<String> = Vec::new();
        let mut package_versions: BTreeMap<String, String> = BTreeMap::new();

        for candidate in python_candidates() {
            let display = display_path(&candidate.path);
            if !should_try_candidate(&candidate.path) {
                diagnostics.push(format!("Skipped missing Python candidate: {display}"));
                continue;
            }

            let output = match Command::new(&candidate.path)
                .arg("-c")
                .arg(IMPORT_CHECK_SCRIPT)
                .output()
            {
                Ok(output) => output,
                Err(err) => {
                    diagnostics.push(format!(
                        "Failed to run Python candidate {display} ({}): {err}",
                        candidate.source
                    ));
                    continue;
                }
            };

            let payload = match parse_check_payload(&output.stdout) {
                Ok(payload) => payload,
                Err(err) => {
                    let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
                    diagnostics.push(format!(
                        "Invalid health check response from {display} ({}): {err}; stderr: {stderr}",
                        candidate.source
                    ));
                    continue;
                }
            };

            let resolved_python = payload
                .executable
                .clone()
                .unwrap_or_else(|| display.clone());

            if first_python_path.is_none() {
                first_python_path = Some(resolved_python.clone());
                first_python_source = Some(candidate.source.clone());
            }

            for (name, version) in &payload.versions {
                package_versions
                    .entry(name.clone())
                    .or_insert_with(|| version.clone());
            }

            if output.status.success() && payload.missing.is_empty() && bridge_available {
                diagnostics.push(format!(
                    "OCR runtime ready from {}: {resolved_python}",
                    candidate.source
                ));
                return OcrRuntimeStatus {
                    available: true,
                    python_path: Some(resolved_python),
                    python_source: Some(candidate.source),
                    bridge_path: display_path(&bridge_path),
                    bridge_available,
                    missing_packages: Vec::new(),
                    diagnostics,
                    remediation: "OCR runtime is ready.".to_string(),
                    package_versions: payload.versions,
                };
            }

            if !payload.missing.is_empty() {
                diagnostics.push(format!(
                    "Python candidate {display} ({}) is missing packages: {}",
                    candidate.source,
                    payload.missing.join(", ")
                ));
                for package in payload.missing {
                    push_unique_missing(&mut missing_packages, package);
                }
            } else if !bridge_available {
                diagnostics.push("Python runtime is ready, but OCR bridge is missing.".to_string());
            }
        }

        unavailable_status(
            &bridge_path,
            bridge_available,
            first_python_path,
            first_python_source,
            missing_packages,
            diagnostics,
            package_versions,
        )
    }

    fn run(&self, request_id: u32, payload: PaddleOcrRequest) -> Result<PaddleOcrResponse, String> {
        let status = self.status();
        if !status.available {
            return Err(format!("OCR runtime unavailable: {}", status.remediation));
        }
        let python_path = status
            .python_path
            .ok_or_else(|| "OCR runtime unavailable: no Python executable resolved".to_string())?;

        // Decode base64 image into a temp file so the Python script can read it.
        let image_bytes = base64::engine::general_purpose::STANDARD
            .decode(&payload.image_base64)
            .map_err(|e| format!("base64 decode error: {e}"))?;

        let ts = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map(|d| d.as_millis())
            .unwrap_or(0);
        let tmp_path = std::env::temp_dir().join(format!("pdfluent_ocr_{ts}_{request_id}.png"));

        use std::io::Write as _;
        let mut tmp_file = std::fs::File::create(&tmp_path)
            .map_err(|e| format!("create temp image error: {e}"))?;
        tmp_file
            .write_all(&image_bytes)
            .map_err(|e| format!("write temp image error: {e}"))?;
        drop(tmp_file);

        let mut cmd = Command::new(python_path);
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

        let output = match cmd.output() {
            Ok(output) => output,
            Err(err) => {
                let _ = std::fs::remove_file(&tmp_path);
                return Err(format!("failed to spawn OCR bridge: {err}"));
            }
        };

        let _ = std::fs::remove_file(&tmp_path);

        if !output.status.success() {
            let stderr = String::from_utf8_lossy(&output.stderr);
            return Err(format!("OCR bridge exited with error: {stderr}"));
        }

        let stdout = String::from_utf8_lossy(&output.stdout);
        let response: PaddleOcrResponse = serde_json::from_str(&stdout)
            .map_err(|e| format!("OCR JSON parse error: {e}\nraw: {stdout}"))?;

        Ok(response)
    }
}

pub fn get_ocr_status_command() -> OcrRuntimeStatus {
    PaddleOcrPythonEngine.status()
}

/// Execute the PaddleOCR bridge for a single rendered page image.
/// `request_id` is reserved for future async/cancel support.
pub fn run_paddle_ocr_command(
    request_id: u32,
    payload: PaddleOcrRequest,
) -> Result<PaddleOcrResponse, String> {
    PaddleOcrPythonEngine.run(request_id, payload)
}
