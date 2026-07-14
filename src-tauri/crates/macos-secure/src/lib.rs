// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary. The PDFluent application is free to use,
// including for commercial purposes. Redistribution, or extraction or reuse
// of its components (including the embedded PDF engine), requires a licence.
// See https://pdfluent.com/license for terms.

//! macOS security-scoped bookmark helpers.
//!
//! Under the App Sandbox a path the user picked via the open dialog is granted
//! to the process (powerbox), but that grant is lost when the app relaunches —
//! so a *recent file* reopened by stored path would fail. A security-scoped
//! bookmark, created while the file is accessible, lets the app re-acquire
//! access in a later session.
//!
//! Interop surface:
//! * [`bookmark_for_path`] — mint a base64 security-scoped bookmark for a path
//!   the process can currently access (just picked / dragged / launched).
//! * [`resolve_and_start`] — resolve a stored bookmark, begin accessing the
//!   resource, and register the live URL so access can be balanced later.
//! * [`stop_access`] — stop accessing one resource (on close / document change).
//! * [`stop_all`] — stop accessing everything (on app exit).
//! * [`active_count`] — number of resources currently being accessed (for
//!   balance assertions; must return to 0 once documents are closed).
//!
//! The bookmark bytes themselves never leave this crate except as an opaque
//! base64 string returned to the (Rust) caller, which persists it in the app
//! container. On non-macOS targets every function is a no-op stub.

#[cfg(target_os = "macos")]
mod imp {
    use std::collections::HashMap;
    use std::sync::{Mutex, OnceLock};

    use base64::Engine as _;
    use objc2::rc::Retained;
    use objc2_foundation::{
        NSData, NSString, NSURLBookmarkCreationOptions, NSURLBookmarkResolutionOptions, NSURL,
    };

    /// `NSURL` is immutable and its `start/stopAccessingSecurityScopedResource`
    /// methods are thread-safe; we only hold the object and toggle access, so it
    /// is sound to move the retained pointer into a global registry.
    struct SendUrl(Retained<NSURL>);
    // SAFETY: see the doc comment above — NSURL here is treated as an immutable,
    // thread-safe handle.
    unsafe impl Send for SendUrl {}

    /// Resources currently being accessed, keyed by resolved path. The map size
    /// is the live security-scope balance (started minus stopped).
    fn registry() -> &'static Mutex<HashMap<String, SendUrl>> {
        static REG: OnceLock<Mutex<HashMap<String, SendUrl>>> = OnceLock::new();
        REG.get_or_init(|| Mutex::new(HashMap::new()))
    }

    fn b64() -> base64::engine::GeneralPurpose {
        base64::engine::general_purpose::STANDARD
    }

    fn nsdata_to_vec(data: &NSData) -> Vec<u8> {
        // SAFETY: `bytes`/`length` describe a contiguous buffer owned by `data`
        // that stays alive for the duration of the copy.
        unsafe {
            let len = data.length();
            if len == 0 {
                return Vec::new();
            }
            let ptr = data.bytes();
            std::slice::from_raw_parts(ptr.as_ptr(), len).to_vec()
        }
    }

    fn url_path(url: &NSURL) -> Option<String> {
        // SAFETY: `path` is a standard NSURL accessor with no preconditions.
        unsafe { url.path() }.map(|s| s.to_string())
    }

    fn make_bookmark(url: &NSURL) -> Option<String> {
        // SAFETY: standard NSURL bookmark creation; all pointer args are None.
        let data = unsafe {
            url.bookmarkDataWithOptions_includingResourceValuesForKeys_relativeToURL_error(
                NSURLBookmarkCreationOptions::NSURLBookmarkCreationWithSecurityScope,
                None,
                None,
            )
        }
        .ok()?;
        Some(b64().encode(nsdata_to_vec(&data)))
    }

    pub fn bookmark_for_path(path: &str) -> Option<String> {
        let ns = NSString::from_str(path);
        // SAFETY: `fileURLWithPath:` has no preconditions beyond a valid string.
        let url = unsafe { NSURL::fileURLWithPath(&ns) };
        make_bookmark(&url)
    }

    pub fn resolve_and_start(bookmark_b64: &str) -> Option<(String, bool)> {
        let bytes = b64().decode(bookmark_b64).ok()?;
        let data = NSData::with_bytes(&bytes);
        let mut is_stale = objc2::runtime::Bool::NO;
        // SAFETY: standard NSURL bookmark resolution; `is_stale` is a valid
        // out-pointer for the duration of the call.
        let url = unsafe {
            NSURL::URLByResolvingBookmarkData_options_relativeToURL_bookmarkDataIsStale_error(
                &data,
                NSURLBookmarkResolutionOptions::NSURLBookmarkResolutionWithSecurityScope,
                None,
                &mut is_stale,
            )
        }
        .ok()?;
        // SAFETY: standard security-scoped access toggle.
        let started = unsafe { url.startAccessingSecurityScopedResource() };
        let path = url_path(&url)?;
        if started {
            if let Ok(mut reg) = registry().lock() {
                // Balance any prior access to the same path before replacing it.
                if let Some(SendUrl(old)) = reg.remove(&path) {
                    // SAFETY: balances a prior start for this path.
                    unsafe { old.stopAccessingSecurityScopedResource() };
                }
                reg.insert(path.clone(), SendUrl(url));
            }
        } else {
            return None;
        }
        Some((path, is_stale.as_bool()))
    }

    pub fn stop_access(path: &str) -> bool {
        if let Ok(mut reg) = registry().lock() {
            if let Some(SendUrl(url)) = reg.remove(path) {
                // SAFETY: balances the matching startAccessing on the same URL.
                unsafe { url.stopAccessingSecurityScopedResource() };
                return true;
            }
        }
        false
    }

    pub fn stop_all() -> usize {
        if let Ok(mut reg) = registry().lock() {
            let count = reg.len();
            for (_, SendUrl(url)) in reg.drain() {
                // SAFETY: balances each outstanding start.
                unsafe { url.stopAccessingSecurityScopedResource() };
            }
            return count;
        }
        0
    }

    pub fn active_count() -> usize {
        registry().lock().map(|r| r.len()).unwrap_or(0)
    }
}

#[cfg(not(target_os = "macos"))]
mod imp {
    pub fn bookmark_for_path(_path: &str) -> Option<String> {
        None
    }
    pub fn resolve_and_start(_bookmark_b64: &str) -> Option<(String, bool)> {
        None
    }
    pub fn stop_access(_path: &str) -> bool {
        false
    }
    pub fn stop_all() -> usize {
        0
    }
    pub fn active_count() -> usize {
        0
    }
}

/// Mint a base64 security-scoped bookmark for a file the process can currently
/// access. Returns `None` if the OS will not vend a scoped bookmark.
pub fn bookmark_for_path(path: &str) -> Option<String> {
    imp::bookmark_for_path(path)
}

/// Resolve a stored bookmark and begin accessing the resource. Returns the
/// resolved path and whether the bookmark is stale (should be recreated), or
/// `None` if the bookmark is invalid or access could not be obtained.
pub fn resolve_and_start(bookmark_b64: &str) -> Option<(String, bool)> {
    imp::resolve_and_start(bookmark_b64)
}

/// Stop accessing one resource previously started by [`resolve_and_start`].
/// Returns true if a live access was found and stopped.
pub fn stop_access(path: &str) -> bool {
    imp::stop_access(path)
}

/// Stop accessing every outstanding resource (call on app exit). Returns the
/// number stopped.
pub fn stop_all() -> usize {
    imp::stop_all()
}

/// Number of resources currently being accessed (live security-scope balance).
pub fn active_count() -> usize {
    imp::active_count()
}
