// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary. The PDFluent application is free to use,
// including for commercial purposes. Redistribution, or extraction or reuse
// of its components (including the embedded PDF engine), requires a licence.
// See https://pdfluent.com/license for terms.

//! Read one string preference in-process.
//!
//! `CFPreferencesCopyAppValue` looks in the managed layer first (an MDM
//! configuration profile, `/Library/Managed Preferences`), then in the app's
//! own domain, which is what an administrator's policy needs.
//!
//! This replaces spawning `/usr/bin/defaults`. A child process is not this app,
//! so on macOS 15 and later reading the preferences of the App Store build from
//! it raised the "wants to access data from other apps" prompt, and the caller
//! waited for the user's answer. A read from the app itself raises nothing and
//! returns at once. On other targets there is no such store and the answer is
//! always `None`.

/// The string stored under `key` in the preference domain `app_id`, or `None`
/// when it is not set or is not a string.
pub fn managed_string(app_id: &str, key: &str) -> Option<String> {
    imp::managed_string(app_id, key)
}

#[cfg(target_os = "macos")]
mod imp {
    use core_foundation::base::{CFType, TCFType};
    use core_foundation::string::CFString;
    use core_foundation_sys::preferences::CFPreferencesCopyAppValue;

    pub fn managed_string(app_id: &str, key: &str) -> Option<String> {
        let key = CFString::new(key);
        let app = CFString::new(app_id);
        // SAFETY: both arguments are live CFStrings for the whole call. The
        // function follows the Create rule: a non-null result is owned by us
        // and `wrap_under_create_rule` releases it exactly once.
        let value = unsafe {
            let raw = CFPreferencesCopyAppValue(key.as_concrete_TypeRef(), app.as_concrete_TypeRef());
            if raw.is_null() {
                return None;
            }
            CFType::wrap_under_create_rule(raw)
        };
        value.downcast_into::<CFString>().map(|s| s.to_string())
    }

    #[cfg(test)]
    mod tests {
        use super::*;
        use core_foundation_sys::preferences::{CFPreferencesAppSynchronize, CFPreferencesSetAppValue};

        const DOMAIN: &str = "com.pdfluent.test.managed-prefs";

        fn set(key: &str, value: Option<&str>) {
            let k = CFString::new(key);
            let d = CFString::new(DOMAIN);
            let v = value.map(CFString::new);
            // SAFETY: live CFStrings; a null value removes the key.
            unsafe {
                let raw = v.as_ref().map_or(std::ptr::null(), |v| v.as_concrete_TypeRef() as *const _);
                CFPreferencesSetAppValue(k.as_concrete_TypeRef(), raw, d.as_concrete_TypeRef());
                CFPreferencesAppSynchronize(d.as_concrete_TypeRef());
            }
        }

        #[test]
        fn a_stored_string_is_read_and_a_missing_key_is_none() {
            set("Probe", Some("never"));
            assert_eq!(managed_string(DOMAIN, "Probe").as_deref(), Some("never"));
            assert_eq!(managed_string(DOMAIN, "NotSet"), None);
            set("Probe", None);
            assert_eq!(managed_string(DOMAIN, "Probe"), None);
        }

        #[test]
        fn an_unknown_domain_is_none() {
            assert_eq!(managed_string("com.pdfluent.test.no-such-domain", "FormScripts"), None);
        }
    }
}

#[cfg(not(target_os = "macos"))]
mod imp {
    pub fn managed_string(_app_id: &str, _key: &str) -> Option<String> {
        None
    }
}
