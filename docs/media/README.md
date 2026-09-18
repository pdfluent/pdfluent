# Media

Derivatives of the store screenshots, downsized for the README and the website.
The full-size originals stay outside this repository; what lives here is sized
for a page to load, and nothing here is over 300 KB.

| File | Used by | Source render |
|---|---|---|
| `store-1-edit-1440x900.png` / `.webp` | — | Edit panel, 2880×1800 master |
| `store-2-convert-1440x900.png` / `.webp` | — | Convert panel, 2880×1800 master |
| `store-3-sign-1440x900.png` / `.webp` | — | Sign panel, 2880×1800 master |
| `store-4-reading-1440x900.png` / `.webp` | — | Reading view, 2880×1800 master |
| `store-5-all-tools-1440x900.png` | README hero | All-tools view, 2880×1800 master |
| `store-5-all-tools-1440x900.webp` | pdfluent.com hero | same master |

Each pair comes from the Mac App Store master: Lanczos down to 1440×900, a
256-colour palette for the PNG, `cwebp -q 75` from the full-colour resize for
the WebP. Recompressing a PNG losslessly is welcome; requantising it is not, so
regenerate from the master rather than from the file here.

## Which renders may appear here

Each render is checked control by control against `docs/UI_REGISTER.md` in
`docs/store_visuals_parity.json`, and `tests/store-visuals-parity.test.ts` fails
when a derivative appears here for a render that still promises a control the
app does not have.

After the second design round of 2026-09-16 all six are clear. Five carry
nothing that needed a decision. The sixth, the reading render with the rail,
draws the Sign tab in its active state with no Sign panel open — a state the
shell cannot be in — and that row is an `ownerAccepted` entry rather than a
fixed image: the owner decided on 2026-09-16 that it ships as it stands and that
the app is not to grow the state to match. An acceptance missing its day, its
reason or who made it is not a decision and keeps the render out of here exactly
as an open row does.

The all-tools derivative is the README hero and the only one a page loads today;
a dash in the table means the file is ready and nothing references it yet. The
sixth render has no derivative because nothing has asked for one.
