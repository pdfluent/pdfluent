// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary. The PDFluent application is free to use,
// including for commercial purposes. Redistribution, or extraction or reuse
// of its components (including the embedded PDF engine), requires a licence.
// See https://pdfluent.com/license for terms.

//! The decision rule of the startup watchdog, kept free of window handles so
//! it can be tested without a webview.
//!
//! The watchdog exists for one failure: a webview whose JS is *suspended*
//! (macOS WKWebView, 2026-06-11), which leaves the user on a spinner forever.
//! A slow machine is a different case. There the page is alive and merely late
//! (Windows starts took 50-70 s under load), and replacing its window throws
//! away work that was about to finish. So the rule keys on *life*, not on the
//! clock alone:
//!
//! * the frontend reports `frontend_ready` -> healthy, stop watching;
//! * a heartbeat from `public/startup-heartbeat.js` (a timer, so it stops
//!   when the web view is suspended) keeps the window alive while it loads;
//! * recover when no sign of life ever arrived within `first_sign_grace`, or
//!   the signs stopped for `stall`, or the window has been "alive" for the
//!   whole `ceiling` without ever becoming ready (a load that cannot finish).

use std::time::Duration;

/// Default time to wait for the first sign of life (heartbeat or ready).
/// Generous on purpose: a loaded Windows PC needed 50-70 s to start.
pub const DEFAULT_FIRST_SIGN_GRACE_SECS: u64 = 120;
/// Default silence after the last heartbeat that counts as a suspended view.
pub const DEFAULT_STALL_SECS: u64 = 25;
/// Default upper bound for a window that is alive but never gets ready.
pub const DEFAULT_CEILING_SECS: u64 = 300;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct Policy {
    pub first_sign_grace: Duration,
    pub stall: Duration,
    pub ceiling: Duration,
}

impl Policy {
    /// `grace_secs` is the `PDFLUENT_READY_TIMEOUT_SECS` override (or the
    /// default). The ceiling never sits below the grace.
    pub fn new(grace_secs: u64) -> Self {
        let grace = Duration::from_secs(grace_secs);
        Policy {
            first_sign_grace: grace,
            stall: Duration::from_secs(DEFAULT_STALL_SECS.min(grace_secs.max(1))),
            ceiling: Duration::from_secs(DEFAULT_CEILING_SECS).max(grace),
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Recover {
    /// Nothing from the web view within `first_sign_grace`.
    NoSignOfLife,
    /// It lived, then went silent: a suspended or dead renderer.
    Stalled,
    /// Alive the whole time but never ready.
    Ceiling,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Verdict {
    Healthy,
    Wait,
    Recover(Recover),
}

/// `elapsed`: time since the watchdog started. `last_sign`: the `elapsed`
/// value at the latest heartbeat or ready ping, `None` if there was none.
pub fn judge(p: &Policy, elapsed: Duration, ready: bool, last_sign: Option<Duration>) -> Verdict {
    if ready {
        return Verdict::Healthy;
    }
    if elapsed >= p.ceiling {
        return Verdict::Recover(Recover::Ceiling);
    }
    match last_sign {
        None if elapsed >= p.first_sign_grace => Verdict::Recover(Recover::NoSignOfLife),
        Some(t) if elapsed.saturating_sub(t) >= p.stall => Verdict::Recover(Recover::Stalled),
        _ => Verdict::Wait,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn s(n: u64) -> Duration {
        Duration::from_secs(n)
    }

    #[test]
    fn slow_but_alive_start_keeps_its_window() {
        let p = Policy::new(DEFAULT_FIRST_SIGN_GRACE_SECS);
        // Heartbeat arrives every 2 s for 70 s (the observed slow Windows
        // start), ready only at 70 s: never a recovery on the way.
        for t in (0..70).step_by(1) {
            let last = if t >= 3 { Some(s(t - t % 2)) } else { None };
            assert_eq!(judge(&p, s(t), false, last), Verdict::Wait, "t={t}");
        }
        assert_eq!(judge(&p, s(70), true, Some(s(70))), Verdict::Healthy);
    }

    #[test]
    fn a_silent_start_is_not_cut_off_at_the_old_25_seconds() {
        let p = Policy::new(DEFAULT_FIRST_SIGN_GRACE_SECS);
        assert_eq!(judge(&p, s(26), false, None), Verdict::Wait);
        assert_eq!(judge(&p, s(119), false, None), Verdict::Wait);
    }

    #[test]
    fn nothing_ever_arrives_is_recovered_after_the_grace() {
        let p = Policy::new(DEFAULT_FIRST_SIGN_GRACE_SECS);
        assert_eq!(judge(&p, s(120), false, None), Verdict::Recover(Recover::NoSignOfLife));
    }

    #[test]
    fn a_renderer_that_goes_silent_is_recovered_fast() {
        let p = Policy::new(DEFAULT_FIRST_SIGN_GRACE_SECS);
        assert_eq!(judge(&p, s(34), false, Some(s(10))), Verdict::Wait);
        assert_eq!(judge(&p, s(35), false, Some(s(10))), Verdict::Recover(Recover::Stalled));
    }

    #[test]
    fn an_alive_window_that_never_gets_ready_is_bounded() {
        let p = Policy::new(DEFAULT_FIRST_SIGN_GRACE_SECS);
        assert_eq!(judge(&p, s(299), false, Some(s(298))), Verdict::Wait);
        assert_eq!(judge(&p, s(300), false, Some(s(299))), Verdict::Recover(Recover::Ceiling));
    }

    #[test]
    fn ready_always_wins() {
        let p = Policy::new(5);
        assert_eq!(judge(&p, s(10_000), true, None), Verdict::Healthy);
    }

    #[test]
    fn the_override_shortens_the_grace_and_never_inverts_the_ceiling() {
        let p = Policy::new(3);
        assert_eq!(p.first_sign_grace, s(3));
        assert_eq!(p.stall, s(3));
        assert!(p.ceiling >= p.first_sign_grace);
        let long = Policy::new(900);
        assert_eq!(long.ceiling, s(900));
    }
}
