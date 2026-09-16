# Outbound endpoints

Every address that ships inside PDFluent Editor, what it is for, and whether the
app can actually contact it. This list is not documentation about the code — it
is the same list the build checks against. `scripts/ci/offline-allowlist.mjs`
scans the built frontend bundle (`dist/`) and the backend sources
(`src-tauri/src/`) for `http(s)` origins and fails on anything not named here;
`tests/offline-endpoint-allowlist.test.ts` fails when this file and that script
disagree.

The linked executable is scanned too, and **reported without gating**. A release
binary carries the string literals of every crate and framework it links — XMP
and XML namespace identifiers, Apple's OCSP and CRL hosts, documentation links
in the error messages of crates nothing calls. None of those is a request, and a
list of origins cannot tell an address the product would dial from a name that
merely spells like one. Gating on them would either grow this table with hosts
we do not own or turn the gate into something a toolchain bump decides, so the
binary line says `ADVISORY` and changes no exit code (decided 2026-09-10).

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
| `https://apps.microsoft.com` | The Store listing, printed in the About box so a user can say which build they have. `open_external_url` refuses it like any other non-`pdfluent.com` host |

Backend test code is not scanned. `#[cfg(test)]` modules in `src-tauri/src/` are
stripped before the scan, because the case proving `open_external_url` refuses
foreign hosts has to write down a host it refuses — and an allow-list that
declared that host to keep the case quiet would stop failing on it in `dist/`,
which is the one place it would matter.

## Adding one

Adding an origin is a product decision, not a build fix. Put it in `ALLOWED` in
`scripts/ci/offline-allowlist.mjs` with a reason and in the right table above.
An endpoint that is not a `pdfluent.com` host fails the unit test on principle:
the promise is that your documents and your usage never leave the machine, and
an address we do not control cannot be held to it.

## What this check does not prove

It proves that no undeclared address ships. It does not, by itself, prove that
the declared ones stay quiet at runtime with the switches off. That is measured
on the artefact a user installs, by the release suite's S3 step
(`scripts/quality/release_suite.sh --platform macos`): while S2 has the real
`.app` open, its sockets are sampled — `lsof` twice a second, `nettop` running
continuously beside it — and a socket either source sees fails the row.

It is not started under a network-denying sandbox, and no second build is made
for the purpose. A sandboxed bundle is put in its container by launchd; started
under a second sandbox it dies before its own code runs, identically with a
profile that allows everything, so that run measured the harness (measured
2026-09-10). And a build made squeezable is not the build anybody installs.

**What a PASS on that row means, exactly:** no outbound socket was seen in _N_
samples over _M_ milliseconds — both numbers are on the row. It does not mean
"the app connects to nothing". Sampling is not watching: a connection opened and
closed between two samples is invisible, and a startup update check is exactly
that shape. `lsof` costs tens of milliseconds per call, so half a second is
nearer a floor than a ceiling. `nettop` runs continuously for that reason — not
as a second opinion but as cover for the first one's gaps, which is why a socket
seen by only one of the two still fails the row.

**The window has to contain the moment worth watching.** The app reaches out on
its own exactly once: a silent update check on a timer that starts when the
frontend loads, `STARTUP_CHECK_DELAY_MS` in `src/lib/updater.ts`. S2 used to
quit each document as soon as the parse mark appeared, about a second, so on the
10-09 rehearsal all seventeen launches ended before that timer fired — 43
samples over 45 s, and a row reporting a quiet window the app had not yet had
the chance to break (#551).

So S2 holds the **first** document's launch open for that delay plus a margin,
and the sampler writes the window per launch as well as for the whole run. The
row carries `covered_ms` (the longest single launch), `startup_check_ms` (the
product's own delay, read from the source — never a second copy of the number)
and `windows_ms` (each document and its window). A run in which no launch
outlived the check is **SKIPPED**, not PASS: it measured less than the promise
is about. Only the first launch is held — one launch long enough is the whole
claim, and holding all seventeen would buy the same fact seventeen times. What
the step cost is on the `alive` row as `s2_total_ms` and `hold_ms`.

**So the run now sees the update check, and has to recognise it.** The first
held launch on the 15-09 rehearsal opened exactly one socket, to an address of
`pdfluent.com` — the declared, default-on check, arriving on schedule. The run
resolves the updater endpoints from `src-tauri/tauri.conf.json` before it starts
and records their addresses; a peer on that list is counted as `declared_remotes`
and a peer off it still fails the row. Two limits belong on the record. Judging
a peer by address cannot separate two tenants of one shared front end, so an
address on that list clears anything else served from it. And a host the run
could not resolve is named on the row, because "we could not check" must not
read as "we caught something".

Both checks exit **3** when they had nothing to look at, never 0. A caller has
to be able to tell "clean" from "did not look", and an exit status is what a
caller reads: 0 means everything gated was declared and the sampled run showed
no outbound socket, 1 means it did not, 3 means the check did not run. A sampler
that wrote no sample is a 3, never a 0: no socket seen because nothing looked
reads exactly like no socket to see.
