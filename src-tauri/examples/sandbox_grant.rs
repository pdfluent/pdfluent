// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary. The PDFluent application is free to use,
// including for commercial purposes. Redistribution, or extraction or reuse
// of its components (including the embedded PDF engine), requires a licence.
// See https://pdfluent.com/license for terms.

//! `sandbox_grant`: issue the App Sandbox grant the open and save panels give.
//!
//! The journey suite runs the app inside the Mac App Store sandbox
//! (tests/journeys/lib/sandbox.ts). A sandboxed app can touch the one path the
//! user picked in a panel and nothing around it; the panel is the system's
//! (the powerbox), a test cannot click it, so the harness issues the same kind
//! of grant itself and the e2e build takes it (`e2e.rs`). This prints one
//! token per path, one per line, for the paths given. A path need not exist: a
//! Save As target does not.
//!
//! An example rather than a `[[bin]]`, like `pdfcheck`: it must never ship.
//!
//! ```text
//! sandbox_grant <path>...
//! ```

#[cfg(target_os = "macos")]
fn main() {
    use std::ffi::{CStr, CString};
    use std::os::raw::{c_char, c_uint};

    extern "C" {
        fn sandbox_extension_issue_file(class: *const c_char, path: *const c_char, flags: c_uint) -> *mut c_char;
        fn free(ptr: *mut std::ffi::c_void);
    }

    let paths: Vec<String> = std::env::args().skip(1).collect();
    if paths.is_empty() {
        eprintln!("usage: sandbox_grant <path>...");
        std::process::exit(2);
    }
    let class = CString::new("com.apple.app-sandbox.read-write").expect("static string");
    for path in paths {
        let c_path = CString::new(path.clone()).unwrap_or_else(|_| {
            eprintln!("sandbox_grant: {path:?} holds a NUL byte");
            std::process::exit(2);
        });
        // SAFETY: both strings are valid and NUL-terminated for the call; the
        // returned token is owned by us and released with free().
        let token = unsafe { sandbox_extension_issue_file(class.as_ptr(), c_path.as_ptr(), 0) };
        if token.is_null() {
            eprintln!("sandbox_grant: no grant could be issued for {path}");
            std::process::exit(1);
        }
        // SAFETY: a non-null token is a NUL-terminated string.
        let text = unsafe { CStr::from_ptr(token) }.to_string_lossy().into_owned();
        unsafe { free(token.cast()) };
        println!("{text}");
    }
}

#[cfg(not(target_os = "macos"))]
fn main() {
    eprintln!("sandbox_grant: the App Sandbox exists on macOS only");
    std::process::exit(2);
}
