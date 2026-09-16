# Media

Derivatives of the store screenshots, downsized for the README and the website.
The full-size originals stay outside this repository; only what a page actually
loads lives here, and nothing here is over 300 KB.

| File | Used by | Source render |
|---|---|---|
| `store-5-all-tools-1440x900.png` | README hero | All-tools view, 2880×1800 master |
| `store-5-all-tools-1440x900.webp` | pdfluent.com hero | same master |

## Which renders may appear here

Each render is checked control by control against `docs/UI_REGISTER.md` in
`docs/store_visuals_parity.json`, and `tests/store-visuals-parity.test.ts` fails
when a derivative appears here for a render that still promises a control the
app does not have.

After the second design round of 2026-09-16, three of the six are clear: the
Edit view, the reading view and the all-tools view. Three are not. The Convert
render's sample document still lists a PDF-to-text conversion the app cannot do.
The Sign render promises drawn and typed signatures twice over, in a feature
tile and in the sample document, where signing is certificate-only. The last
reading render draws the Sign tab in its active state with no Sign panel open, a
state the shell cannot be in. Those three wait on a decision about whether the
image changes or the control gets built.

Only the all-tools derivative is published so far; the other two clear renders
may follow when a page needs them.
