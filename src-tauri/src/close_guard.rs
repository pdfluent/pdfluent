// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary. The PDFluent application is free to use,
// including for commercial purposes. Redistribution, or extraction or reuse
// of its components (including the embedded PDF engine), requires a licence.
// See https://pdfluent.com/license for terms.

//! Closing the window or quitting with unsaved changes asks first (J-81).
//!
//! Until 1.0.1 the only guard was a `beforeunload` listener in the webview.
//! Tauri does not consult it: the window's close button, Alt-F4 and Cmd-Q
//! closed the app and the changes were gone. The decision now sits here, on the
//! Rust side of every way out:
//!
//! * the window's close button, Alt-F4, the taskbar's "Close window" — a
//!   `WindowEvent::CloseRequested`, which can be prevented;
//! * Quit in the menus and Cmd/Ctrl-Q — a menu item of our own. The predefined
//!   Quit item sends `terminate:` straight to AppKit, which tao lets through
//!   without a hook, so it could never be stopped.
//!
//! When there is something to lose, the close is held and the webview is asked
//! (`app-close-requested`). It shows Save / Don't save / Cancel and answers with
//! `confirm_close` only when the document is saved or deliberately discarded;
//! Cancel answers nothing and the app stays open.
//!
//! One escape hatch, because the guard must not become a trap: a webview that
//! has died cannot answer. The webview acknowledges every request as it
//! arrives; a request still unacknowledged after [`UNANSWERED`] lets the next
//! close through.

use std::sync::Mutex;
use std::time::{Duration, Instant};

/// How long a close request may go unacknowledged before the webview is
/// presumed dead and the next close is let through.
pub const UNANSWERED: Duration = Duration::from_secs(8);

/// The event the webview listens for, with a [`CloseRequest`] as payload.
pub const CLOSE_REQUESTED_EVENT: &str = "app-close-requested";

/// What the webview is told. `document_modified` is the backend's own flag:
/// the webview counts the document as unsaved if either side does, so a change
/// it never heard about is not closed away either.
#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CloseRequest {
    /// `"window"` (close button, Alt-F4) or `"quit"` (Quit, Cmd/Ctrl-Q).
    pub kind: &'static str,
    pub document_modified: bool,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum CloseDecision {
    /// Nothing to lose, or the user already decided: close.
    Proceed,
    /// Hold the close and ask the webview.
    AskFrontend,
}

#[derive(Debug, Default)]
struct State {
    /// What the webview last reported about unsaved changes.
    frontend_dirty: bool,
    /// The user chose Save (and it succeeded) or Don't save.
    confirmed: bool,
    /// When the oldest still-unacknowledged request was sent.
    asked_at: Option<Instant>,
}

#[derive(Debug, Default)]
pub struct CloseGuard {
    state: Mutex<State>,
}

impl CloseGuard {
    /// Decide what to do with a close or quit request.
    ///
    /// `document_modified` is the backend's own flag, so a change the webview
    /// failed to report is still protected.
    pub fn on_close_requested(&self, document_modified: bool, now: Instant) -> CloseDecision {
        let mut s = self.lock();
        if s.confirmed || !(s.frontend_dirty || document_modified) {
            return CloseDecision::Proceed;
        }
        match s.asked_at {
            Some(at) if now.saturating_duration_since(at) >= UNANSWERED => {
                crate::applog("close guard: the webview did not answer a close request; closing");
                CloseDecision::Proceed
            }
            Some(_) => CloseDecision::AskFrontend,
            None => {
                s.asked_at = Some(now);
                CloseDecision::AskFrontend
            }
        }
    }

    pub fn set_frontend_dirty(&self, dirty: bool) {
        self.lock().frontend_dirty = dirty;
    }

    /// The webview received the request and is showing (or skipping) the
    /// dialog. It is alive; the escape hatch is not needed.
    pub fn acknowledge(&self) {
        self.lock().asked_at = None;
    }

    /// The user decided: the next close goes through.
    pub fn confirm(&self) {
        let mut s = self.lock();
        s.confirmed = true;
        s.asked_at = None;
    }

    /// The user chose Save (and it succeeded) or Don't save.
    pub fn was_confirmed(&self) -> bool {
        self.lock().confirmed
    }

    /// What the webview last reported about unsaved changes.
    pub fn frontend_dirty(&self) -> bool {
        self.lock().frontend_dirty
    }

    fn lock(&self) -> std::sync::MutexGuard<'_, State> {
        // A poisoned lock means a panic while flipping a bool; the bools are
        // still meaningful.
        self.state.lock().unwrap_or_else(|p| p.into_inner())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_clean_document_closes_without_asking() {
        let g = CloseGuard::default();
        assert_eq!(g.on_close_requested(false, Instant::now()), CloseDecision::Proceed);
    }

    #[test]
    fn unsaved_changes_reported_by_the_webview_hold_the_close() {
        let g = CloseGuard::default();
        g.set_frontend_dirty(true);
        assert_eq!(g.on_close_requested(false, Instant::now()), CloseDecision::AskFrontend);
    }

    #[test]
    fn a_modified_backend_document_holds_the_close_even_if_the_webview_says_clean() {
        let g = CloseGuard::default();
        g.set_frontend_dirty(false);
        assert_eq!(g.on_close_requested(true, Instant::now()), CloseDecision::AskFrontend);
    }

    #[test]
    fn cancel_keeps_the_app_open_on_every_later_attempt() {
        let g = CloseGuard::default();
        g.set_frontend_dirty(true);
        let t0 = Instant::now();
        assert_eq!(g.on_close_requested(true, t0), CloseDecision::AskFrontend);
        // The webview showed the dialog and the user pressed Cancel: it
        // acknowledged, and did not confirm.
        g.acknowledge();
        let later = t0 + UNANSWERED * 3;
        assert_eq!(g.on_close_requested(true, later), CloseDecision::AskFrontend);
    }

    #[test]
    fn confirming_lets_the_next_close_through() {
        let g = CloseGuard::default();
        g.set_frontend_dirty(true);
        let t0 = Instant::now();
        assert_eq!(g.on_close_requested(true, t0), CloseDecision::AskFrontend);
        g.acknowledge();
        g.confirm();
        assert_eq!(g.on_close_requested(true, t0), CloseDecision::Proceed);
    }

    #[test]
    fn the_exit_path_can_tell_a_decided_close_from_one_that_bypassed_the_guard() {
        let g = CloseGuard::default();
        g.set_frontend_dirty(true);
        assert!(g.frontend_dirty());
        assert!(!g.was_confirmed(), "the Dock's Quit never asked: work is unsaved and undecided");
        g.confirm();
        assert!(g.was_confirmed());
    }

    #[test]
    fn a_webview_that_never_answers_does_not_trap_the_user() {
        let g = CloseGuard::default();
        g.set_frontend_dirty(true);
        let t0 = Instant::now();
        assert_eq!(g.on_close_requested(true, t0), CloseDecision::AskFrontend);
        // Clicked again quickly: still asking, the webview may just be slow.
        assert_eq!(
            g.on_close_requested(true, t0 + Duration::from_secs(1)),
            CloseDecision::AskFrontend
        );
        // No acknowledgement for UNANSWERED: the webview is gone.
        assert_eq!(g.on_close_requested(true, t0 + UNANSWERED), CloseDecision::Proceed);
    }
}
