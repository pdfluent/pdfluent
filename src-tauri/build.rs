// SPDX-License-Identifier: LicenseRef-PDFluent-Proprietary
// Copyright (c) 2026 PDFluent Contributors

#[cfg(target_os = "macos")]
fn build_macos_translation_helper() {
    use std::env;
    use std::fs;
    use std::path::PathBuf;
    use std::process::Command;

    let manifest_dir = PathBuf::from(env::var("CARGO_MANIFEST_DIR").unwrap());
    let source = manifest_dir
        .join("native")
        .join("pdfluent_translate_helper.swift");
    let output_dir = manifest_dir.join("resources").join("bin");
    let output = output_dir.join("pdfluent_translate_helper");

    println!("cargo:rerun-if-changed={}", source.display());

    if !source.is_file() {
        println!("cargo:warning=macOS translation helper source not found");
        return;
    }

    if output.is_file() {
        if let (Ok(meta_src), Ok(meta_out)) = (fs::metadata(&source), fs::metadata(&output)) {
            if let (Ok(mtime_src), Ok(mtime_out)) = (meta_src.modified(), meta_out.modified()) {
                if mtime_src <= mtime_out {
                    println!(
                        "cargo:rustc-env=PDFFLUENT_TRANSLATE_HELPER={}",
                        output.display()
                    );
                    return;
                }
            }
        }
    }

    if let Err(err) = fs::create_dir_all(&output_dir) {
        println!("cargo:warning=failed to create translation helper output dir: {err}");
        return;
    }

    let status = Command::new("xcrun")
        .args([
            "swiftc",
            "-parse-as-library",
            "-O",
            "-framework",
            "Translation",
            "-o",
        ])
        .arg(&output)
        .arg(&source)
        .status();

    match status {
        Ok(status) if status.success() => {
            println!(
                "cargo:rustc-env=PDFFLUENT_TRANSLATE_HELPER={}",
                output.display()
            );
        }
        Ok(status) => {
            println!("cargo:warning=swiftc failed to build translation helper: {status}");
        }
        Err(err) => {
            println!("cargo:warning=failed to run swiftc for translation helper: {err}");
        }
    }
}

#[cfg(not(target_os = "macos"))]
fn build_macos_translation_helper() {}

/// Make the embedded frontend an explicit build input.
///
/// Tauri embeds `frontendDist` into the binary via `generate_context!` at
/// macro-expansion time, but Cargo's incremental model only re-expands the
/// macro when the *crate* recompiles — and a change to `../dist` (e.g. a new
/// content-hashed bundle name after `npm run build`) does not, on its own,
/// invalidate the crate. The result: an incremental build can silently ship a
/// STALE embedded frontend (the bug that hid the inline-editor fix behind an
/// old `index-*.js`).
///
/// This computes a deterministic fingerprint from `dist/index.html` and every
/// asset it references, exposes it as `PDFLUENT_FRONTEND_FINGERPRINT` (read via
/// `env!` in the crate), and emits `rerun-if-changed` for each input. When the
/// frontend changes, the fingerprint changes → the crate recompiles → the embed
/// is regenerated. The fingerprint is also what the post-build verifier checks.
fn frontend_embed_fingerprint() {
    use std::path::PathBuf;

    let manifest_dir = PathBuf::from(std::env::var("CARGO_MANIFEST_DIR").unwrap());
    let dist = manifest_dir.join("..").join("dist");
    let index = dist.join("index.html");

    // Always re-run when index.html changes.
    println!("cargo:rerun-if-changed={}", index.display());

    let Ok(html) = std::fs::read_to_string(&index) else {
        // No dist yet (e.g. a `cargo check` before the frontend is built):
        // emit a sentinel so the build still succeeds.
        println!("cargo:rustc-env=PDFLUENT_FRONTEND_FINGERPRINT=NO-DIST");
        return;
    };

    // Extract every referenced /assets/<name> path from index.html.
    let mut parts: Vec<String> = Vec::new();
    let mut rest = html.as_str();
    while let Some(pos) = rest.find("/assets/") {
        let after = &rest[pos + 1..]; // drop the leading '/'
        let end = after.find(['"', '\'', ')']).unwrap_or(after.len());
        let asset_rel = &after[..end]; // e.g. assets/index-XXXX.js
        let asset_path = manifest_dir.join("..").join("dist").join(asset_rel);
        println!("cargo:rerun-if-changed={}", asset_path.display());
        let size = std::fs::metadata(&asset_path).map(|m| m.len()).unwrap_or(0);
        parts.push(format!("{asset_rel}:{size}"));
        rest = &after[end..];
    }
    parts.sort();
    parts.dedup();

    // Fingerprint = index.html size + sorted "asset:size" pairs. Content-hashed
    // Vite filenames + sizes change whenever the frontend changes, so this value
    // changes too — forcing a recompile + fresh embed.
    let fingerprint = format!("idx{}|{}", html.len(), parts.join("|"));
    println!("cargo:rustc-env=PDFLUENT_FRONTEND_FINGERPRINT={fingerprint}");
}

fn main() {
    build_macos_translation_helper();
    frontend_embed_fingerprint();
    tauri_build::build()
}
