<!--
Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
See https://pdfluent.com/license for terms.
-->

# Store screenshots, reproducibly

Three stages. Only the first two need a desktop and a built app, and they run in the build round after
`feat/editor-monochrome` has landed.

1. **Scenes** (`scenes/*.shot.ts`) drive the real app into fixed states with fictitious demo documents and
   photograph the window. Built on the journey suite's driver and steps (`tests/journeys/lib`).
2. **Compositor** (`scripts/screenshots/compose.mjs`) places the raw shots into the store frames
   (`store/screenshots/1.1.0/layout.json`, `template.html`), checks sizes and refuses doubtful input.
3. **Copy** (`store/screenshots/1.1.0/copy.json`) is draft until a person approves it.

## Run

Build the e2e app as for the journeys (README in `tests/journeys`). For the Mac set build the frontend with
`MAS_BUILD=1 npm run build` first: the e2e build then hides what the Mac App Store build does not have (the updater),
so the shots show the app Apple will ship. Windows uses the normal frontend build.

```sh
export PDFLUENT_E2E_APP=... PDFLUENT_PDFCHECK=...        # as for the journeys
# Windows: also PDFLUENT_TAURI_DRIVER / PDFLUENT_NATIVE_DRIVER (scripts/ci/journey-tools.sh)
npx vitest run --config vitest.screenshots.config.ts      # all scenes
PDFLUENT_SHOT_THEME=dark npx vitest run --config vitest.screenshots.config.ts   # optional dark set

node scripts/screenshots/compose.mjs --variant plain       # both stores, no headline
node scripts/screenshots/compose.mjs --variant marketing   # needs approved copy.json
```

Raw shots land in `screenshots-out/<platform>/<theme>/` with a `manifest.json`; the compositor reads that.
Run the scenes on each platform and bring the folders together before composing both stores.

## Window size

- macOS: `PDFLUENT_SHOT_SIZE=1440x900` (default), points. On a 2x display the PNG is 2880x1800, no resampling.
  The terminal needs Screen Recording and Accessibility.
- Windows: `PDFLUENT_SHOT_SIZE=3200x1800` (default), physical pixels. Use a 3840x2160 display at 200 % so the
  shot is never scaled up. The session must be interactive and nothing may overlap the window.

A shot at the wrong aspect ratio is refused, never rescaled.

## Rules the pipeline keeps

- **Fictitious content only.** `fixtures/make-demo-docs.py` writes the report (invented studio, people and figures);
  forms and the scan come from `pdfcheck make-*`. The XFA form is the repository's own golden file: look at its
  fields once before the shot goes out.
- **No shot of something the app cannot do.** Each scene names the journey that proves what it shows. The scene
  copies that journey's known gaps (`docs/JOURNEY_TESTS.json`) into the manifest and the compositor stops on any.
  Today that stops frames 05 (OCR), 06 (images), 07 (typed signature) and 08 (XFA filling). A gap is accepted for
  a frame only through `acceptedGaps` in `layout.json` with `id`, `by`, `on`, `why`.
- **The control must still exist.** Frames that show controls belong in `docs/store_visuals_parity.json`
  (`tests/store-visuals-parity.test.ts`); add the new frames' controls there when the set is final.
- **Selectors, not coordinates.** A label or test id that changes breaks a scene on purpose.

## Figma

The Figma file `PDFluent-screenshots` (link in `assets/store-screenshots/Editable_Figma_Source.txt` of the
workspace) holds the 2026-08 frames. This pipeline does not write to it: `template.html` rebuilds the same
geometry in the repository so the set can be regenerated without a designer. If the designer wants the frames
in Figma, import the `plain` PNGs as the screen layer.
