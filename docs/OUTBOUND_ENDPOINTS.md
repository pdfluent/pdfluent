# Outbound endpoints

Every address that ships inside PDFluent Editor, what it is for, and whether the
app can actually contact it. This list is not documentation about the code — it
is the same list the build checks against. `scripts/ci/offline-allowlist.mjs`
scans the built bundle (and, in the build stage, the release executable) for
`http(s)` origins and fails on anything not named here;
`tests/offline-endpoint-allowlist.test.ts` fails when this file and that script
disagree.

## What the app can contact

Three origins, all ours. Nothing else the product does needs a network.

| Origin | Used for | Default | Turn it off |
|---|---|---|---|
| `https://pdfluent.com` | Update check (`/releases/latest.json`); the website and licence pages when you click them | On | Settings → "Check for updates automatically" |
| `https://report.pdfluent.com` | Crash and feedback reports (`POST /v1/report`) | **Off** | Never sent unless you switch reporting on and confirm the text |
| `https://feedback.pdfluent.com` | The feedback page, opened in your browser from the Help menu | On click only | Do not click it |

With automatic update checks off and reporting off — which is the state the app
ships in for reporting, and one switch away for updates — PDFluent makes no
outbound request at all. Opening, editing, signing, converting, redacting,
OCR-free text extraction and PDF/A export are entirely local: the PDF engine is
compiled into the application and there is no HTTP client in the Rust backend.

No account, no licence check, no analytics, no telemetry beacon, no font or
model download at runtime.

## What the app cannot contact

`open_external_url`, the one command that hands an address to the operating
system, refuses anything that is not `https://pdfluent.com` or a subdomain of
it (`src-tauri/src/telemetry.rs`). The webview's `connect-src` policy
(`src-tauri/tauri.conf.json`) allows only the app itself, Tauri IPC and the
report host, so a compromised or careless frontend cannot reach a fourth
address either.

## Strings that look like addresses and are not

These appear inside the bundle and are never fetched. They are listed because a
scanner cannot tell an inert string from an endpoint, and an unexplained
origin has to fail the build.

| Origin | What it really is |
|---|---|
| `http://www.w3.org`, `https://www.w3.org` | XML and SVG namespace identifiers — names, not addresses |
| `https://react.dev` | Documentation link inside a React runtime error message |
| `https://www.i18next.com` | Documentation link inside an i18next console warning |
| `https://locize.com` | Vendor link inside an i18next console message |
| `https://rollupjs.org` | Documentation link inside a Rollup/Vite runtime error message |

## Adding one

Adding an origin is a product decision, not a build fix. Put it in `ALLOWED` in
`scripts/ci/offline-allowlist.mjs` with a reason and in the right table above.
An endpoint that is not a `pdfluent.com` host fails the unit test on principle:
the promise is that your documents and your usage never leave the machine, and
an address we do not control cannot be held to it.

## What this check does not prove

It proves that no undeclared address ships. It does not, by itself, prove that
the declared ones stay quiet at runtime with the switches off — for that, run

```
bash scripts/quality/offline-runtime-check.sh
```

on macOS against a built app: it starts the application under a sandbox profile
that denies outbound network access and fails if the app misbehaves. It needs a
built bundle, so it is a release-time check.

Both checks exit **3** when they had nothing to look at, never 0. A caller has
to be able to tell "clean" from "did not look", and an exit status is what a
caller reads: 0 means everything scanned was declared and the app ran without a
network, 1 means it did not, 3 means the check did not run.
