// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary. The PDFluent application is free to use,
// including for commercial purposes. Redistribution, or extraction or reuse
// of its components (including the embedded PDF engine), requires a licence.
// See https://pdfluent.com/license for terms.

//! The recent-files reopen path under the App Sandbox, end to end through the
//! objc2 interop: mint a bookmark for a real file, resolve it, hold the scope,
//! release it.
//!
//! Until the editor had a macOS CI job this crate never compiled in any
//! pipeline -- every Linux job builds the no-op stubs below and nothing else.
//! These cases run on the macOS runner, so a broken objc2 binding or an
//! unbalanced scope is red on the platform that ships it.

#[cfg(target_os = "macos")]
mod macos {
    use pdfluent_macos_secure::{
        active_count, bookmark_for_path, resolve_and_start, stop_access, stop_all,
    };
    use std::path::PathBuf;
    use std::sync::Mutex;

    // The scope registry is process-global; the cases below count it, so they
    // must not interleave.
    static SERIAL: Mutex<()> = Mutex::new(());

    fn real_file(tag: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!(
            "pdfluent-macos-secure-{}-{}",
            tag,
            std::process::id()
        ));
        std::fs::create_dir_all(&dir).expect("temp dir");
        let file = dir.join("recent.pdf");
        std::fs::write(&file, b"%PDF-1.7\n%%EOF\n").expect("write temp file");
        // The bookmark resolves to the canonical path (/private/var/... for a
        // /var/... temp dir), so compare against that.
        file.canonicalize().expect("canonical path")
    }

    #[test]
    fn a_minted_bookmark_resolves_to_the_same_file_and_balances_its_scope() {
        let _g = SERIAL.lock().unwrap_or_else(|e| e.into_inner());
        stop_all();
        let file = real_file("roundtrip");
        let path = file.to_str().expect("utf-8 path");

        let bookmark = bookmark_for_path(path).expect("the OS vends a bookmark for a readable file");
        assert!(!bookmark.is_empty(), "an empty bookmark cannot be resolved later");

        let (resolved, stale) =
            resolve_and_start(&bookmark).expect("a fresh bookmark resolves and starts access");
        assert_eq!(PathBuf::from(&resolved), file, "the bookmark resolved to a different file");
        assert!(!stale, "a bookmark minted a moment ago must not be stale");
        assert_eq!(active_count(), 1, "one started scope must be registered");

        assert!(stop_access(&resolved), "the started scope must be found and stopped");
        assert_eq!(active_count(), 0, "the scope balance must return to zero");
        assert!(!stop_access(&resolved), "a scope cannot be stopped twice");
    }

    #[test]
    fn stop_all_balances_every_outstanding_scope() {
        let _g = SERIAL.lock().unwrap_or_else(|e| e.into_inner());
        stop_all();
        let a = real_file("all-a");
        let b = real_file("all-b");
        for f in [&a, &b] {
            let bm = bookmark_for_path(f.to_str().unwrap()).expect("bookmark");
            resolve_and_start(&bm).expect("resolve");
        }
        assert_eq!(active_count(), 2);
        assert_eq!(stop_all(), 2, "stop_all must report every scope it closed");
        assert_eq!(active_count(), 0);
    }

    #[test]
    fn garbage_is_refused_rather_than_resolved() {
        let _g = SERIAL.lock().unwrap_or_else(|e| e.into_inner());
        assert!(resolve_and_start("not base64 !!").is_none());
        assert!(resolve_and_start("AAAA").is_none(), "four zero bytes are not a bookmark");
    }
}

#[cfg(not(target_os = "macos"))]
#[test]
fn the_stubs_never_claim_access_off_macos() {
    use pdfluent_macos_secure::{active_count, bookmark_for_path, resolve_and_start};
    assert!(bookmark_for_path("/tmp/x.pdf").is_none());
    assert!(resolve_and_start("AAAA").is_none());
    assert_eq!(active_count(), 0);
}
