// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary. The PDFluent application is free to use,
// including for commercial purposes. Redistribution, or extraction or reuse
// of its components (including the embedded PDF engine), requires a licence.
// See https://pdfluent.com/license for terms.

//! The editor ships no TLS or cryptography library of its own.
//!
//! The updater talks https through the
//! operating system's TLS (SChannel on Windows, Secure Transport on macOS).
//! `ring` and `aws-lc` are C and assembly; `rustls` pulls one of them in, so
//! none of the three may be in the dependency tree of a release target.
//! `openssl-sys` is allowed only on Linux, which is outside the release scope.
//!
//! Runs in the `cargo-test` job. The check goes through `cargo tree` for each
//! release target, so a feature flipped back to `rustls-tls` fails here and
//! not in a release build.

use std::process::Command;

const RELEASE_TARGETS: [&str; 3] = [
    "aarch64-apple-darwin",
    "x86_64-apple-darwin",
    "x86_64-pc-windows-msvc",
];
const FORBIDDEN: [&str; 6] = [
    "ring",
    "aws-lc-rs",
    "aws-lc-sys",
    "rustls",
    "rustls-webpki",
    "openssl-sys",
];

/// Whether `package` is in the dependency tree of `target` (default features).
fn in_tree(target: &str, package: &str) -> bool {
    let cargo = std::env::var("CARGO").unwrap_or_else(|_| "cargo".into());
    let out = Command::new(cargo)
        .current_dir(env!("CARGO_MANIFEST_DIR"))
        .args(["tree", "--locked", "--target", target, "-i", package])
        .output()
        .expect("cargo tree could not be started");
    let stderr = String::from_utf8_lossy(&out.stderr);
    if out.status.success() {
        // `cargo tree -i` exits 0 with "nothing to print" when the package
        // exists in the lock file but not for this target.
        return !out.stdout.is_empty();
    }
    // "package ID specification ... did not match any packages" is the
    // answer "not in the tree". Anything else is a real failure.
    assert!(
        stderr.contains("did not match any packages") || stderr.contains("nothing to print"),
        "cargo tree failed for {target} / {package}: {stderr}"
    );
    false
}

#[test]
fn release_targets_carry_no_bundled_crypto() {
    for target in RELEASE_TARGETS {
        for package in FORBIDDEN {
            assert!(
                !in_tree(target, package),
                "`{package}` is in the dependency tree of {target}. TLS must come from the operating \
                 system: check that tauri-plugin-updater has default-features = false with \
                 \"native-tls\", and that reqwest uses \"native-tls\" (src-tauri/Cargo.toml)."
            );
        }
    }
}

#[test]
fn the_guard_sees_a_package_that_is_there() {
    // Without this the test above passes whenever `cargo tree` misbehaves.
    assert!(in_tree("x86_64-pc-windows-msvc", "schannel"));
    assert!(in_tree("aarch64-apple-darwin", "security-framework"));
}
