// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary. The PDFluent application is free to use,
// including for commercial purposes. Redistribution, or extraction or reuse
// of its components (including the embedded PDF engine), requires a licence.
// See https://pdfluent.com/license for terms.

import { WIRED_TILES_ALL_RUNTIMES, WIRED_TILES_TAURI_ONLY } from './wiredTools.generated';

/**
 * Which All-tools tiles may be rendered, derived from the UI register.
 *
 * This used to be a hand-written set of twelve labels and it was wrong in both
 * directions: it disabled tiles whose tool had shipped (highlight, watermark,
 * merge, split, password) and enabled tiles that dispatched through a component
 * the app has not rendered for months. Nothing noticed, because nothing was
 * comparing the list to the code.
 *
 * The lists come from `scripts/quality/ui-register.mjs`, which resolves each
 * tile's `fulfilledBy` claim to a control the shipped shell renders and that
 * reaches a command or a named effect. `quality:ui-register` fails the build
 * when the generated file no longer matches that walk, so this set cannot go
 * stale without the pipeline saying so.
 *
 * @param isTauri whether the native backend is present; browser-test cannot run
 *                a tool whose chain reaches a Tauri command.
 */
export function getWiredTools(isTauri: boolean): ReadonlySet<string> {
  const set = new Set<string>(WIRED_TILES_ALL_RUNTIMES);
  if (isTauri) for (const label of WIRED_TILES_TAURI_ONLY) set.add(label);
  return set;
}
