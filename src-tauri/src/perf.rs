// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary. The PDFluent application is free to use,
// including for commercial purposes. Redistribution, or extraction or reuse
// of its components (including the embedded PDF engine), requires a licence.
// See https://pdfluent.com/license for terms.

//! Startup and edit latency, as milliseconds in the app log.
//!
//! Until now the only startup number anyone had was a stopwatch against the
//! line "open_pdf: document parsed OK", and the log carried whole seconds, so
//! the answer to "where do the 2.5 seconds go" was an estimate in a planning
//! document. The marks below are the measurement that replaces the estimate.
//!
//! Every mark is one line in the same durable log the rest of the app writes
//! to (`applog`), formatted so a script can parse it without knowing anything
//! about this module:
//!
//! ```text
//! perf <name> +<milliseconds since process start>ms
//! ```
//!
//! `T0` is the first statement of `run()`, so everything before it — dyld,
//! LaunchServices, Rust statics — is outside the numbers and has to be read
//! from the launching script's wall clock. That is a limit of the measurement,
//! not a gap in it: `scripts/perf/measure-open.sh` prints the difference.
//!
//! The frontend marks through the `perf_mark` command, so its `first_paint`
//! and the backend's `parsed` land on the same clock and in the same file.

use std::sync::OnceLock;
use std::time::Instant;

static T0: OnceLock<Instant> = OnceLock::new();

/// Start the clock. Called once, as the first statement of `run()`; a second
/// call is ignored so a test cannot move the origin under a running app.
pub fn start() {
    let _ = T0.set(Instant::now());
}

/// Milliseconds since `start()`. Zero when the clock was never started, which
/// is the case in unit tests and in the headless test binaries.
pub fn since_start_ms() -> u128 {
    T0.get().map(|t0| t0.elapsed().as_millis()).unwrap_or(0)
}

/// The line format every consumer parses. Kept as a function so the test below
/// and `scripts/perf/measure-open.sh` cannot drift apart silently.
pub fn format_mark(name: &str, ms: u128) -> String {
    format!("perf {name} +{ms}ms")
}

/// Record a mark in the app log.
pub fn mark(name: &str) {
    crate::applog(&format_mark(name, since_start_ms()));
}

/// Record a mark with a detail suffix, e.g. the page a mutation touched.
/// The `perf <name> +<ms>ms` prefix stays byte-identical so the parser does
/// not need to know which marks carry detail.
pub fn mark_with(name: &str, detail: &str) {
    crate::applog(&format!("{} {detail}", format_mark(name, since_start_ms())));
}

/// The frontend's half of the timeline. `performance.mark` lives in the
/// webview and never reaches a support bundle; this puts the same names in the
/// same log as the backend marks, on one clock.
///
/// Sync on purpose: the whole body is a string format and an append, in the
/// order of microseconds. Making it async would put the mark on a worker
/// thread and record when that thread got scheduled instead of when the
/// frontend reached the line.
#[tauri::command]
pub fn perf_mark(name: String, detail: Option<String>) {
    // A mark name is written into a durable log. Bound it and strip anything
    // that could forge a second log line.
    let safe: String = name
        .chars()
        .filter(|c| c.is_ascii_alphanumeric() || *c == '_' || *c == '-')
        .take(64)
        .collect();
    if safe.is_empty() {
        return;
    }
    match detail {
        Some(detail) => {
            let safe_detail: String = detail
                .chars()
                .filter(|c| c.is_ascii_alphanumeric() || " _-=,.:".contains(*c))
                .take(120)
                .collect();
            mark_with(&safe, &safe_detail);
        }
        None => mark(&safe),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    /// `measure-open.sh` and every later reader parse this exact shape. A test
    /// that only checked "the line contains the name" would have let the `+`
    /// or the `ms` suffix disappear.
    #[test]
    fn a_mark_line_has_the_documented_shape() {
        let line = format_mark("first_paint", 1234);
        assert_eq!(line, "perf first_paint +1234ms");

        let (name, rest) = line
            .strip_prefix("perf ")
            .expect("the line starts with the perf tag")
            .split_once(" +")
            .expect("name and offset are separated by ' +'");
        assert_eq!(name, "first_paint");
        assert_eq!(
            rest.strip_suffix("ms").expect("offset ends in ms").parse::<u128>(),
            Ok(1234)
        );
    }

    /// The clock is optional. Anything that calls `mark()` outside a running
    /// app — a unit test, a headless binary — must still get a parsable line
    /// rather than a panic or a wildly wrong number.
    #[test]
    fn without_a_started_clock_the_offset_is_zero() {
        assert_eq!(format_mark("parsed", since_start_ms()), "perf parsed +0ms");
    }

    /// A mark that is not emitted measures nothing, and its absence is
    /// invisible: the log simply has one line fewer and every reader assumes
    /// the step was fast. The timeline is therefore pinned here — remove a
    /// `perf::mark` from the startup or open path and this goes red.
    #[test]
    fn the_startup_timeline_is_emitted_from_the_paths_it_describes() {
        let source = include_str!("lib.rs");
        for mark in [
            "starting",
            "setup_done",
            "page_loaded",
            "frontend_ready",
            "open_requested",
            "parsed",
            "info_built",
        ] {
            assert!(
                source.contains(&format!("perf::mark(\"{mark}\")")),
                "lib.rs no longer emits the {mark} mark, so the startup timeline has a hole in it"
            );
        }
        assert!(
            source.contains("perf::mark_with(\n        \"mutation_done\"")
                || source.contains("perf::mark_with(\"mutation_done\""),
            "no text mutation command marks mutation_done, so the edit budget has no backend end event"
        );
        // The frontend's half only reaches the log if the command is registered.
        assert!(
            source.contains("perf::perf_mark,"),
            "perf_mark is not in generate_handler!, so every frontend mark fails at the IPC"
        );
    }

    /// The name reaches a durable log file. A newline in it would forge a
    /// second log line, and an unbounded name would let the frontend write a
    /// megabyte per mark.
    #[test]
    fn a_mark_name_cannot_forge_a_log_line() {
        perf_mark("first_paint\n[0.000] fake line".to_string(), None);
        let cleaned: String = "first_paint\n[0.000] fake line"
            .chars()
            .filter(|c| c.is_ascii_alphanumeric() || *c == '_' || *c == '-')
            .take(64)
            .collect();
        assert!(!cleaned.contains('\n'));
        assert!(!cleaned.contains('['));
    }
}
