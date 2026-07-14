// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary. The PDFluent application is free to use,
// including for commercial purposes. Redistribution, or extraction or reuse
// of its components (including the embedded PDF engine), requires a licence.
// See https://pdfluent.com/license for terms.

use std::path::{Component, Path, PathBuf};

const PDF_EXTENSIONS: &[&str] = &["pdf"];
const CERT_EXTENSIONS: &[&str] = &["p12", "pfx"];
const DANGEROUS_ATTACHMENT_EXTENSIONS: &[&str] = &[
    "app", "bat", "cmd", "com", "command", "desktop", "dll", "dmg", "dylib", "exe", "hta", "jar",
    "js", "jse", "lnk", "msi", "msp", "pkg", "ps1", "scr", "sh", "so", "url", "vb", "vbe", "vbs",
    "wsf",
];

pub fn validate_pdf_input_path(raw: &str) -> Result<String, String> {
    validate_existing_file(raw, PDF_EXTENSIONS)
}

pub fn validate_pdf_source_path(raw: &str) -> Result<String, String> {
    validate_existing_file(raw, PDF_EXTENSIONS)
}

pub fn validate_certificate_input_path(raw: &str) -> Result<String, String> {
    validate_existing_file(raw, CERT_EXTENSIONS)
}

pub fn validate_pdf_output_path(raw: &str, current_path: Option<&str>) -> Result<String, String> {
    validate_untrusted_output_path(raw, PDF_EXTENSIONS, current_path)
}

pub fn validate_output_dir(raw: &str, current_path: Option<&str>) -> Result<String, String> {
    let target = normalize_output_path(raw)?;
    let parent = target
        .parent()
        .ok_or_else(|| "Output directory has no parent directory".to_string())?;
    ensure_allowed_output_parent(parent, current_path)?;
    Ok(target.to_string_lossy().into_owned())
}

pub fn validate_dialog_output_path(raw: &str, allowed_exts: &[&str]) -> Result<String, String> {
    let target = normalize_output_path(raw)?;
    ensure_extension(&target, allowed_exts)?;
    ensure_not_dangerous_path(&target)?;
    Ok(target.to_string_lossy().into_owned())
}

pub fn ensure_safe_attachment_name(name: &str) -> Result<(), String> {
    let trimmed = name.trim();
    if trimmed.is_empty() {
        return Err("Attachment name is empty".to_string());
    }
    if trimmed.contains('/') || trimmed.contains('\\') || trimmed.contains('\0') {
        return Err("Attachment name must not contain path separators".to_string());
    }
    if is_dangerous_extension(trimmed) {
        return Err(format!(
            "Attachment '{trimmed}' has a blocked executable/script extension"
        ));
    }
    Ok(())
}

pub fn is_dangerous_extension(name: &str) -> bool {
    extension_lower(Path::new(name))
        .as_deref()
        .map(|ext| DANGEROUS_ATTACHMENT_EXTENSIONS.contains(&ext))
        .unwrap_or(false)
}

fn validate_existing_file(raw: &str, allowed_exts: &[&str]) -> Result<String, String> {
    let path = PathBuf::from(raw);
    ensure_plain_path(&path)?;
    ensure_extension(&path, allowed_exts)?;
    ensure_not_dangerous_path(&path)?;
    // Intentionally NO std::fs::canonicalize()/metadata here. The path comes from
    // a user action the OS already authorized (open panel, Finder "Open",
    // drag-drop, or a recent entry the user re-selects), so opening the file works
    // under that grant. canonicalize() additionally stats the *parent directory*
    // (e.g. ~/Documents) to resolve symlinks, which trips the macOS
    // folder-permission (TCC) prompt and froze the app's main thread the first
    // time a PDF was opened from a protected folder. ensure_plain_path above
    // already rejects relative paths, `..` traversal and null bytes; the loader
    // (OpenDocument::open) returns a clean error if the path is missing/unreadable.
    Ok(path.to_string_lossy().into_owned())
}

fn validate_untrusted_output_path(
    raw: &str,
    allowed_exts: &[&str],
    current_path: Option<&str>,
) -> Result<String, String> {
    let target = normalize_output_path(raw)?;
    ensure_extension(&target, allowed_exts)?;
    ensure_not_dangerous_path(&target)?;

    if matches_current_path(&target, current_path) {
        return Ok(target.to_string_lossy().into_owned());
    }

    let parent = target
        .parent()
        .ok_or_else(|| "Output path has no parent directory".to_string())?;
    ensure_allowed_output_parent(parent, current_path)?;
    Ok(target.to_string_lossy().into_owned())
}

fn normalize_output_path(raw: &str) -> Result<PathBuf, String> {
    let path = PathBuf::from(raw);
    ensure_plain_path(&path)?;
    let file_name = path
        .file_name()
        .ok_or_else(|| "Output path must include a file or directory name".to_string())?;
    let parent = path
        .parent()
        .ok_or_else(|| "Output path has no parent directory".to_string())?;
    let canonical_parent = std::fs::canonicalize(parent)
        .map_err(|e| format!("Cannot access output directory: {e}"))?;
    let target = canonical_parent.join(file_name);
    if let Ok(metadata) = std::fs::symlink_metadata(&target) {
        if metadata.file_type().is_symlink() {
            return Err("Output path must not target a symbolic link".to_string());
        }
    }
    Ok(target)
}

fn matches_current_path(target: &Path, current_path: Option<&str>) -> bool {
    let Some(current) = current_path else {
        return false;
    };
    let Ok(current_canonical) = std::fs::canonicalize(current) else {
        return false;
    };
    current_canonical == target
}

fn ensure_allowed_output_parent(parent: &Path, current_path: Option<&str>) -> Result<(), String> {
    let canonical_parent = std::fs::canonicalize(parent)
        .map_err(|e| format!("Cannot access output directory: {e}"))?;

    if let Some(current) = current_path {
        if let Ok(current_canonical) = std::fs::canonicalize(current) {
            if let Some(current_parent) = current_canonical.parent() {
                if canonical_parent.starts_with(current_parent) {
                    return Ok(());
                }
            }
        }
    }

    if safe_output_roots()
        .into_iter()
        .any(|root| canonical_parent.starts_with(root))
    {
        return Ok(());
    }

    Err("Output path is outside the allowed export locations. Use the native save dialog for unrestricted locations.".to_string())
}

fn safe_output_roots() -> Vec<PathBuf> {
    let mut roots = Vec::new();
    if let Some(path) = dirs::document_dir() {
        roots.push(path);
    }
    if let Some(path) = dirs::download_dir() {
        roots.push(path);
    }
    if let Some(path) = dirs::desktop_dir() {
        roots.push(path);
    }
    roots.push(std::env::temp_dir());
    roots
        .into_iter()
        .filter_map(|path| std::fs::canonicalize(path).ok())
        .collect()
}

fn ensure_extension(path: &Path, allowed_exts: &[&str]) -> Result<(), String> {
    let ext = extension_lower(path)
        .ok_or_else(|| "Path must have an allowed file extension".to_string())?;
    if allowed_exts.contains(&ext.as_str()) {
        Ok(())
    } else {
        Err(format!(
            "Unsupported file extension '.{ext}'. Allowed: {}",
            allowed_exts.join(", ")
        ))
    }
}

fn ensure_plain_path(path: &Path) -> Result<(), String> {
    if path.as_os_str().is_empty() {
        return Err("Path is empty".to_string());
    }
    if path.to_string_lossy().contains('\0') {
        return Err("Path contains an invalid null byte".to_string());
    }
    if !path.is_absolute() {
        return Err("Only absolute filesystem paths are accepted".to_string());
    }
    if path
        .components()
        .any(|component| matches!(component, Component::ParentDir))
    {
        return Err("Path traversal components are not accepted".to_string());
    }
    Ok(())
}

fn ensure_not_dangerous_path(path: &Path) -> Result<(), String> {
    if let Some(file_name) = path.file_name() {
        if file_name.to_string_lossy().starts_with('.') {
            return Err("Hidden dot-files are not accepted for PDF workflows".to_string());
        }
    }
    Ok(())
}

fn extension_lower(path: &Path) -> Option<String> {
    path.extension()
        .and_then(|ext| ext.to_str())
        .map(|ext| ext.trim_start_matches('.').to_ascii_lowercase())
}

#[cfg(test)]
mod tests {
    use super::{ensure_safe_attachment_name, is_dangerous_extension};

    #[test]
    fn blocks_executable_attachment_extensions() {
        assert!(is_dangerous_extension("invoice.exe"));
        assert!(is_dangerous_extension("script.PS1"));
        assert!(ensure_safe_attachment_name("payload.sh").is_err());
    }

    #[test]
    fn allows_plain_attachment_names() {
        assert!(ensure_safe_attachment_name("invoice.xml").is_ok());
        assert!(ensure_safe_attachment_name("scan.pdf").is_ok());
    }

    #[test]
    fn rejects_attachment_path_tricks() {
        assert!(ensure_safe_attachment_name("../secret.txt").is_err());
        assert!(ensure_safe_attachment_name("folder/file.txt").is_err());
    }
}
