# Media

Derivatives of the store screenshots, downsized for the README and the website.
The full-size originals stay outside this repository; only what a page actually
loads lives here, and nothing here is over 300 KB.

| File | Used by | Source render |
|---|---|---|
| `store-5-all-tools-1440x900.png` | README hero | All-tools view, 2880×1800 master |
| `store-5-all-tools-1440x900.webp` | pdfluent.com hero | same master |

## Why only one of the six

Each render is checked control by control against `docs/UI_REGISTER.md` in
`docs/store_visuals_parity.json`, and `tests/store-visuals-parity.test.ts` fails
when a derivative appears here for a render that still promises a control the
app does not have. Five of the six do: an "Invite to sign" button that has never
existed, "Add signature" and "Add initials" that sit behind a disabled flag, a
"Document language" select with nothing behind it, a page counter and a zoom
control drawn into the top bar where the shipped shell puts them in the floating
bottom bar. Those wait on a decision about whether the image changes or the
control gets built.

The all-tools render is the one where every visible label, tile and tool matches
the shipped shell, so it is the one that goes out.
