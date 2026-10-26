// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary. The PDFluent application is free to use,
// including for commercial purposes. Redistribution, or extraction or reuse
// of its components (including the embedded PDF engine), requires a licence.
// See https://pdfluent.com/license for terms.

//! The editor reaches the network through the operating system's TLS and
//! nothing else. `tests/no_bundled_tls.rs` proves no TLS library is compiled in;
//! this proves that what is compiled in actually completes a handshake with the
//! host the app talks to (the update feed), on the platform it runs on. OCR
//! needs no connection at all: the component ships inside the app.
//!
//! It needs the network and the published hosts, so it only runs when
//! `PDFLUENT_TLS_SMOKE=1` (the macOS and Windows jobs set it). Without it every
//! case says so on stderr: a skipped smoke is not a pass.
#![cfg(debug_assertions)]

fn enabled(case: &str) -> bool {
    if std::env::var("PDFLUENT_TLS_SMOKE").as_deref() == Ok("1") {
        return true;
    }
    eprintln!("SKIPPED (not a pass): {case} -- PDFLUENT_TLS_SMOKE is not 1, so no connection was made");
    false
}

/// The update check, over https, against the feed the updater reads.
#[test]
fn the_update_feed_answers_over_the_os_tls() {
    if !enabled("update feed") {
        return;
    }
    let body = tauri::async_runtime::block_on(async {
        let client = reqwest::Client::builder().https_only(true).build().expect("a client on the OS TLS");
        let response = client
            .get("https://pdfluent.com/releases/latest.json")
            .send()
            .await
            .expect("the TLS handshake with pdfluent.com completes");
        assert_eq!(response.status(), reqwest::StatusCode::OK, "the update feed is published");
        response.text().await.expect("a body")
    });
    let feed: serde_json::Value = serde_json::from_str(&body).expect("the feed is JSON");
    assert!(feed.get("version").and_then(|v| v.as_str()).is_some(), "the feed names a version: {body}");
    assert!(feed.get("platforms").is_some(), "the feed lists platforms: {body}");
}
