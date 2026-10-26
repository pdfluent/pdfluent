// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary. The PDFluent application is free to use,
// including for commercial purposes. Redistribution, or extraction or reuse
// of its components (including the embedded PDF engine), requires a licence.
// See https://pdfluent.com/license for terms.

//! The ui-walk build's way out (#471). Compiled only with the `ui-walk` cargo
//! feature, which no release profile enables (tests/ui-walk-build.test.ts and
//! scripts/ci/ui-walk-fenced.mjs hold that).
//!
//! The walk runs inside the web view (src/viewer/uiWalk), so nothing listens on a
//! port and no debug protocol is exposed even here. The page asks for the list of
//! controls to cover and hands back one JSON document; both go through files
//! named by the environment of the process that started the build:
//!
//!   PDFLUENT_UI_WALK_TARGETS   JSON from `ui_walk.mjs --targets`
//!   PDFLUENT_UI_WALK_OUT       where the probe is written
//!
//! They are plugin commands (`plugin:ui-walk|targets`, `plugin:ui-walk|report`),
//! not entries of the app's own handler, so the shipped handler list does not
//! change shape between builds.

use tauri::plugin::{Builder, TauriPlugin};
use tauri::{AppHandle, Runtime};

/// Present in the walk binary and nowhere else (scripts/lib/walk-build.mjs).
pub const WALK_MARKER: &str = "pdfluent-ui-walk-build";

/// `used` keeps the string in the binary even though nothing reads it at run time:
/// it is how the fence and a person with `strings` tell this build from a shipped one.
#[used]
static WALK_MARKER_IN_BINARY: &str = WALK_MARKER;

fn var(name: &str) -> Result<String, String> {
    std::env::var(name).map_err(|_| format!("{name} is not set; this build only runs under the suite's walk"))
}

#[tauri::command]
fn targets() -> Result<String, String> {
    let path = var("PDFLUENT_UI_WALK_TARGETS")?;
    std::fs::read_to_string(&path).map_err(|e| format!("cannot read the walk targets at {path}: {e}"))
}

#[tauri::command]
fn report<R: Runtime>(app: AppHandle<R>, json: String) -> Result<(), String> {
    let path = var("PDFLUENT_UI_WALK_OUT")?;
    std::fs::write(&path, json).map_err(|e| format!("cannot write the walk result to {path}: {e}"))?;
    // The walk is over; leave the way a person would, so the suite's clean-quit
    // judgement is not confused by a kill.
    app.exit(0);
    Ok(())
}

pub fn plugin<R: Runtime>() -> TauriPlugin<R> {
    Builder::new("ui-walk")
        .invoke_handler(tauri::generate_handler![targets, report])
        .build()
}
