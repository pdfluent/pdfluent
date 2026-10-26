<!--
Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
See https://pdfluent.com/license for terms.
-->

# Store screenshot requirements (read 2026-10-19)

| | Mac App Store | Microsoft Store |
|---|---|---|
| Sizes taken | 1280x800, 1440x900, 2560x1600 or 2880x1800 (all 16:10) | Desktop: 1366x768 or larger; 4K (3840x2160) supported; landscape or portrait |
| Our output | 2880x1800 | 3840x2160 |
| Count | 1 to 10 per device size | 1 required, up to 10 desktop; Microsoft suggests at least 4, recommends 5 to 8 |
| Format | .jpeg, .jpg, .png; no alpha channel or transparency | .png; at most 50 MB each |
| Captions | none | optional, 200 characters or fewer, per language |
| Layout guidance | must follow the App Store Review Guidelines | keep key visuals and text in the top two thirds; do not add extra logos, icons or marketing messages; avoid very light or dark colours and high-contrast stripes |
| Other art (not screenshots) | | 1:1 app tile icon 300x300 (recommended), 16:9 super hero 1920x1080 or 3840x2160 (no text, no UI), 2:3 poster is for games |

Sources:

- Apple, screenshot specifications: https://developer.apple.com/help/app-store-connect/reference/app-information/screenshot-specifications/
- Microsoft, screenshots, images and trailers: https://learn.microsoft.com/en-us/windows/apps/publish/publish-your-app/msix/screenshots-and-images
  (the MSIX page; the Win32/MSI route PDFluent uses fills the same Store listing step, but the MSI-specific page returned 404 when read, so confirm in Partner Center).

Open points to confirm in the consoles, not on the doc pages: the Apple page states the limit per device size and does not
mention localisations; Partner Center is the final word on whether the 4K size is accepted at upload.

Things in this spec the pipeline enforces: exact output size, no alpha (flatten.py), at most 10 frames, caption at most
200 characters (compose.mjs), and the layout sizes themselves (tests/screenshots-pipeline.test.ts).

One conflict to decide: the 2026-08 set puts a headline on every frame. Microsoft's guidance says not to add marketing
messages to screenshots. compose.mjs makes both: `--variant plain` follows the guidance, `--variant marketing` matches the
live set.
