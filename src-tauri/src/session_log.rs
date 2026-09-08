// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary. The PDFluent application is free to use,
// including for commercial purposes. Redistribution, or extraction or reuse
// of its components (including the embedded PDF engine), requires a licence.
// See https://pdfluent.com/license for terms.

//! Crash-free sessions, counted locally.
//!
//! The plan's target is "≥ 99.5 % of sessions end with a clean quit". There was
//! no metric at all: `applog` recorded that the app had started and nothing
//! recorded that it had stopped, so a start with no end was indistinguishable
//! from a start that went fine.
//!
//! Two lines per session, appended to a plain text file next to the app log:
//!
//! ```text
//! start 1757280000 1.0.0-beta.21
//! clean_quit 1757280412 1.0.0-beta.21
//! ```
//!
//! Nothing here is sent anywhere. The file holds a counter and a version, no
//! document names, no paths, no identity. The number reaches us only if the
//! user opens a crash or feedback report and sends it, and it is written into
//! the text they read before deciding.
//!
//! The counting is deliberately a pure function over the file's contents: it is
//! the part that can be wrong (a start with no quit at the end of the file is
//! the *current* session, not a crash), and a pure function is the part a test
//! can hold still.

use std::path::Path;

/// The file, next to the app log. Plain text rather than the NDJSON the crash
/// file uses: it is two words and a number per line, and a human reading the
/// log directory should not need a parser.
pub const SESSION_FILE_NAME: &str = "sessions.log";

/// Keep the file bounded. 2000 lines is a thousand sessions -- years for a
/// desktop application, a few kilobytes on disk.
const MAX_LINES: usize = 2000;

pub const EVENT_START: &str = "start";
pub const EVENT_CLEAN_QUIT: &str = "clean_quit";

/// What the counter found. `crash_free_percent` is `None` until at least one
/// session has finished, because 0 of 0 is not 0 %.
#[derive(Debug, Clone, PartialEq, serde::Serialize)]
pub struct SessionCounts {
    /// Sessions that started and are no longer running.
    pub finished: u32,
    /// Of those, the ones that ended with a clean quit.
    pub clean_quits: u32,
    /// `clean_quits / finished`, rounded to one decimal.
    pub crash_free_percent: Option<f64>,
}

/// Count start/clean-quit pairs in the contents of the session file.
///
/// The rule that matters: a `start` is only judged once it is followed by
/// another `start` or by a `clean_quit`. The last `start` in the file is the
/// session doing the counting, and counting it as a crash would put a running
/// app permanently below its own target.
///
/// Unknown or malformed lines are ignored rather than fatal. A log this cheap
/// is not worth a startup failure, and a truncated write (power loss during
/// the append) must not make the number meaningless.
pub fn count_sessions(contents: &str) -> SessionCounts {
    let mut finished = 0u32;
    let mut clean_quits = 0u32;
    let mut open_start = false;

    for line in contents.lines() {
        match line.split_whitespace().next() {
            Some(EVENT_START) => {
                // A previous start that never got its quit line: the app went
                // away without one.
                if open_start {
                    finished = finished.saturating_add(1);
                }
                open_start = true;
            }
            // The guard is the rule: a quit with no start before it is a
            // fragment of a trimmed file, not a session, and falls through to
            // the arm below that counts nothing.
            Some(EVENT_CLEAN_QUIT) if open_start => {
                finished = finished.saturating_add(1);
                clean_quits = clean_quits.saturating_add(1);
                open_start = false;
            }
            _ => {}
        }
    }

    let crash_free_percent = if finished == 0 {
        None
    } else {
        Some((f64::from(clean_quits) * 1000.0 / f64::from(finished)).round() / 10.0)
    };

    SessionCounts {
        finished,
        clean_quits,
        crash_free_percent,
    }
}

/// Drop the oldest lines so the file stays bounded. Returns the text to write.
pub fn trim(contents: &str, max_lines: usize) -> String {
    let lines: Vec<&str> = contents.lines().filter(|l| !l.trim().is_empty()).collect();
    let keep = lines.len().saturating_sub(max_lines);
    let mut out = lines[keep..].join("\n");
    if !out.is_empty() {
        out.push('\n');
    }
    out
}

/// Seconds since the epoch, or 0 if the clock is unreadable. A wrong timestamp
/// must not cost us the count.
fn now_secs() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0)
}

/// Append one session event.
///
/// Returns the error rather than dropping it. Writing this file is not
/// important enough to fail a start or delay a quit over, but a counter that
/// silently stops counting reports a healthier product than the real one, and
/// deciding what to do about that belongs to the caller -- which logs it.
pub fn record(path: &Path, event: &str, version: &str) -> std::io::Result<()> {
    use std::io::Write;

    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent)?;
    }

    // Trim before appending rather than on a schedule, so the file cannot grow
    // past the cap between two housekeeping runs that may never happen. No file
    // yet means nothing to trim, which is why the read is allowed to fail here
    // and the append below is not.
    if let Ok(existing) = std::fs::read_to_string(path) {
        if existing.lines().count() >= MAX_LINES {
            std::fs::write(path, trim(&existing, MAX_LINES - 1))?;
        }
    }

    let mut file = std::fs::OpenOptions::new().create(true).append(true).open(path)?;
    writeln!(file, "{event} {} {version}", now_secs())
}

/// Read and count. A missing file is an empty history -- no sessions, not zero
/// per cent -- so it is answered rather than raised.
pub fn read_counts(path: &Path) -> SessionCounts {
    match std::fs::read_to_string(path) {
        Ok(text) => count_sessions(&text),
        Err(_) => count_sessions(""),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn no_history_is_not_a_hundred_percent() {
        let counts = count_sessions("");
        assert_eq!(counts.finished, 0);
        assert_eq!(counts.clean_quits, 0);
        assert_eq!(counts.crash_free_percent, None);
    }

    #[test]
    fn a_start_and_a_quit_is_one_clean_session() {
        let counts = count_sessions("start 1 1.0.0\nclean_quit 2 1.0.0\n");
        assert_eq!(counts.finished, 1);
        assert_eq!(counts.clean_quits, 1);
        assert_eq!(counts.crash_free_percent, Some(100.0));
    }

    /// The one that decides whether the number means anything: the session
    /// doing the counting has started and has not quit yet. Counting it as a
    /// failure would hold every running app below its own target for ever.
    #[test]
    fn the_running_session_is_not_counted_as_a_crash() {
        let counts = count_sessions("start 1 1.0.0\nclean_quit 2 1.0.0\nstart 3 1.0.0\n");
        assert_eq!(counts.finished, 1);
        assert_eq!(counts.clean_quits, 1);
        assert_eq!(counts.crash_free_percent, Some(100.0));
    }

    #[test]
    fn a_start_followed_by_a_start_is_a_session_that_died() {
        let counts = count_sessions("start 1 1.0.0\nstart 2 1.0.0\nclean_quit 3 1.0.0\n");
        assert_eq!(counts.finished, 2);
        assert_eq!(counts.clean_quits, 1);
        assert_eq!(counts.crash_free_percent, Some(50.0));
    }

    #[test]
    fn the_percentage_has_one_decimal() {
        let mut log = String::new();
        for _ in 0..199 {
            log.push_str("start 1 1.0.0\nclean_quit 2 1.0.0\n");
        }
        log.push_str("start 3 1.0.0\nstart 4 1.0.0\n"); // one that died
        let counts = count_sessions(&log);
        assert_eq!(counts.finished, 200);
        assert_eq!(counts.clean_quits, 199);
        assert_eq!(counts.crash_free_percent, Some(99.5));
    }

    /// One decimal, not seventeen. Without the rounding this is
    /// 66.66666666666667, which is what would end up in the text a user reads
    /// before deciding whether to send it.
    #[test]
    fn the_percentage_is_rounded_not_left_raw() {
        let counts = count_sessions(
            "start 1 1.0.0\nclean_quit 2 1.0.0\nstart 3 1.0.0\nclean_quit 4 1.0.0\nstart 5 1.0.0\nstart 6 1.0.0\n",
        );
        assert_eq!(counts.finished, 3);
        assert_eq!(counts.clean_quits, 2);
        assert_eq!(counts.crash_free_percent, Some(66.7));
    }

    #[test]
    fn a_trimmed_file_starting_mid_session_does_not_invent_a_session() {
        // The oldest lines are dropped by `trim`, which can cut between a
        // start and its quit. That leading quit belongs to a session already
        // counted or already gone; it is not a new one.
        let counts = count_sessions("clean_quit 1 1.0.0\nstart 2 1.0.0\nclean_quit 3 1.0.0\n");
        assert_eq!(counts.finished, 1);
        assert_eq!(counts.clean_quits, 1);
    }

    #[test]
    fn junk_lines_are_ignored_rather_than_fatal() {
        let counts = count_sessions("start 1 1.0.0\n\nhalf-written li\nclean_quit 2 1.0.0\n");
        assert_eq!(counts.finished, 1);
        assert_eq!(counts.clean_quits, 1);
    }

    #[test]
    fn trim_keeps_the_newest_lines_and_ends_with_a_newline() {
        let text = "a\nb\nc\nd\n";
        assert_eq!(trim(text, 2), "c\nd\n");
        assert_eq!(trim(text, 10), "a\nb\nc\nd\n");
        assert_eq!(trim("", 5), "");
    }

    #[test]
    fn recorded_events_round_trip_through_the_file() {
        let dir = std::env::temp_dir().join(format!("pdfluent-session-test-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        let path = dir.join(SESSION_FILE_NAME);

        record(&path, EVENT_START, "1.0.0").expect("record start");
        record(&path, EVENT_CLEAN_QUIT, "1.0.0").expect("record clean quit");
        record(&path, EVENT_START, "1.0.0").expect("record second start");

        let counts = read_counts(&path);
        assert_eq!(counts.finished, 1);
        assert_eq!(counts.clean_quits, 1);

        let text = std::fs::read_to_string(&path).expect("session file");
        assert!(text.starts_with("start "), "first line was {text:?}");
        assert!(text.contains("\nclean_quit "), "no clean quit line in {text:?}");

        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn counts_from_a_file_that_does_not_exist_are_empty() {
        let counts = read_counts(Path::new("/nonexistent/pdfluent/sessions.log"));
        assert_eq!(counts.finished, 0);
        assert_eq!(counts.crash_free_percent, None);
    }
}
