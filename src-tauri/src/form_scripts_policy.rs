// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary. The PDFluent application is free to use,
// including for commercial purposes. Redistribution, or extraction or reuse
// of its components (including the embedded PDF engine), requires a licence.
// See https://pdfluent.com/license for terms.

//! The organisation's choice for "Form scripts", read from where the OS keeps
//! managed settings, so a user cannot change it from the app's own storage.
//!
//! * macOS: the managed preference `FormScripts` of the app's bundle id, which
//!   an MDM configuration profile fills. Read in-process through
//!   CFPreferences, which sees the managed layer first. Never through a
//!   `defaults` child process: that is not this app, and on macOS 15 and later
//!   reading the App Store build's preferences from it raised a privacy prompt
//!   that froze the window.
//! * Windows: `HKLM\Software\Policies\PDFluent`, value `FormScripts`, REG_SZ,
//!   read through the registry API, not `reg.exe`.
//!
//! The value is `ask`, `always` or `never`. Anything else, or nothing, is no
//! policy. A policy beats the user's setting in Settings (which it disables)
//! and the enterprise settings kept in the webview.

use serde::Serialize;

/// Bundle id the managed preference is read for (tauri.conf.json `identifier`).
/// Only the macOS preference read uses it.
#[cfg(target_os = "macos")]
pub const BUNDLE_ID: &str = "com.pdfluent.app";
/// Name of the policy value on both platforms. Linux has no managed location,
/// so only the macOS and Windows readers use it; unused there under -D dead-code.
#[cfg(any(target_os = "macos", windows))]
pub const POLICY_KEY: &str = "FormScripts";
/// Prefix of the error a refused grant returns.
pub const REFUSED_BY_POLICY: &str = "FORM_SCRIPTS_POLICY_NEVER";

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum FormScriptsPolicy {
    Ask,
    Always,
    Never,
}

/// Where the raw policy text comes from. The real source asks the OS; a test
/// supplies a stub.
pub trait PolicyReader {
    fn read_raw(&self) -> Option<String>;
}

/// `ask`, `always` or `never`, ignoring case and surrounding space.
pub fn parse_policy(raw: &str) -> Option<FormScriptsPolicy> {
    match raw.trim().trim_matches('"').to_ascii_lowercase().as_str() {
        "ask" => Some(FormScriptsPolicy::Ask),
        "always" => Some(FormScriptsPolicy::Always),
        "never" => Some(FormScriptsPolicy::Never),
        _ => None,
    }
}

pub fn read_policy(reader: &dyn PolicyReader) -> Option<FormScriptsPolicy> {
    reader.read_raw().and_then(|raw| parse_policy(&raw))
}

/// Whether giving the permission is allowed under `policy`. A policy of
/// `never` refuses it whatever the webview asks.
pub fn check_grant(policy: Option<FormScriptsPolicy>, allow: bool) -> Result<(), String> {
    if allow && policy == Some(FormScriptsPolicy::Never) {
        return Err(format!(
            "{REFUSED_BY_POLICY}: your organisation does not allow form scripts to run"
        ));
    }
    Ok(())
}

/// The OS-managed location of this platform.
pub struct OsPolicy;

impl PolicyReader for OsPolicy {
    #[cfg(target_os = "macos")]
    fn read_raw(&self) -> Option<String> {
        pdfluent_macos_secure::managed_string(BUNDLE_ID, POLICY_KEY)
    }

    #[cfg(windows)]
    fn read_raw(&self) -> Option<String> {
        use winreg::enums::{HKEY_LOCAL_MACHINE, KEY_READ};
        use winreg::RegKey;
        RegKey::predef(HKEY_LOCAL_MACHINE)
            .open_subkey_with_flags(r"Software\Policies\PDFluent", KEY_READ)
            .ok()?
            .get_value::<String, _>(POLICY_KEY)
            .ok()
    }

    #[cfg(not(any(target_os = "macos", windows)))]
    fn read_raw(&self) -> Option<String> {
        None
    }
}

/// The policy in force, read once per run. The read is in-process and quick,
/// but it still touches the OS, so callers are async commands (off the main
/// thread) and `warm_up` fills the cell at startup on a background thread.
pub fn current() -> Option<FormScriptsPolicy> {
    static POLICY: std::sync::OnceLock<Option<FormScriptsPolicy>> = std::sync::OnceLock::new();
    *POLICY.get_or_init(|| read_policy(&OsPolicy))
}

/// Fill the cell on a background thread so no command waits on the OS read.
pub fn warm_up() {
    std::thread::spawn(|| {
        current();
    });
}

#[cfg(test)]
mod tests {
    use super::*;

    struct Stub(Option<&'static str>);
    impl PolicyReader for Stub {
        fn read_raw(&self) -> Option<String> {
            self.0.map(str::to_string)
        }
    }

    #[test]
    fn the_three_values_are_read_whatever_their_case_or_spacing() {
        assert_eq!(read_policy(&Stub(Some("ask\n"))), Some(FormScriptsPolicy::Ask));
        assert_eq!(read_policy(&Stub(Some("  Always "))), Some(FormScriptsPolicy::Always));
        assert_eq!(read_policy(&Stub(Some("NEVER"))), Some(FormScriptsPolicy::Never));
        assert_eq!(read_policy(&Stub(Some("\"never\""))), Some(FormScriptsPolicy::Never));
    }

    #[test]
    fn nothing_or_nonsense_is_no_policy() {
        assert_eq!(read_policy(&Stub(None)), None);
        assert_eq!(read_policy(&Stub(Some(""))), None);
        assert_eq!(read_policy(&Stub(Some("sometimes"))), None);
        assert_eq!(read_policy(&Stub(Some("1"))), None);
    }

    #[test]
    fn a_never_policy_refuses_the_grant_and_nothing_else_does() {
        let never = Some(FormScriptsPolicy::Never);
        let err = check_grant(never, true).unwrap_err();
        assert!(err.starts_with("FORM_SCRIPTS_POLICY_NEVER: "));
        assert!(check_grant(never, false).is_ok(), "withdrawing is always allowed");
        for p in [None, Some(FormScriptsPolicy::Ask), Some(FormScriptsPolicy::Always)] {
            assert!(check_grant(p, true).is_ok());
        }
    }

    #[test]
    fn the_stub_stands_in_for_the_os_in_the_whole_chain() {
        let policy = read_policy(&Stub(Some("never")));
        assert!(check_grant(policy, true).is_err());
    }
}
