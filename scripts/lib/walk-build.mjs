// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary. The PDFluent application is free to use,
// including for commercial purposes. Redistribution, or extraction or reuse
// of its components (including the embedded PDF engine), requires a licence.
// See https://pdfluent.com/license for terms.

// The ui-walk build is a second build of the same commit with an in-page walker
// compiled in (cargo feature `ui-walk`, frontend flag VITE_UI_WALK, #471). It
// exists to be measured and thrown away. It carries its own file name
// (PDFluent-ui-walk-*) and bundle identifier (com.pdfluent.app.uiwalk), and this
// is the one place that says what such a build looks like, so the publish path,
// the suite and the fence all agree.

import path from "node:path";

/** The bundle identifier the walk build is given (src-tauri/tauri.ui-walk.conf.json). */
export const WALK_IDENTIFIER = "com.pdfluent.app.uiwalk";

/** Embedded in the walk build's web bundle and binary; absent from anything that ships. */
export const WALK_MARKER = "pdfluent-ui-walk-build";

/** True for a file name that belongs to a walk build. */
export function isWalkBuildName(file) {
  return /ui-?walk/i.test(path.basename(String(file)));
}

/** Every walk-build name among `files`; empty when none. */
export function walkBuilds(files) {
  return files.filter(isWalkBuildName);
}
