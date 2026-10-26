# Design: balanced-tier extraction in the editor (#729, decision D5)

Status: proposal. Nothing is built. The owner decides D5 first; the editor
plan currently says "not in Q4" (400+ MB of models, C++ ONNX Runtime).

## What it would add

The SDK 1.1.0 has two extraction tiers. The editor uses the default tier
(pure Rust, no models). The balanced tier adds learned layout and table
models run through `ort`, which improves headings and tables. This design
makes it an opt-in download, so the installer stays small and the default
behaviour does not change.

## Where it runs

In the app process, offline, on the user's machine, in the same Rust call
that does the default-tier export today. No server, no upload, no network
request except the one-time download below. The tier is chosen per export
call: `balanced` when the component is installed and enabled in Settings,
`default` otherwise. If the models fail to load or run, the export fails with
a named error. It never silently falls back to the default tier, because the
user would then get different output from what they asked for.

ONNX Runtime is a native library, so it ships inside the component, not in the
installer. That keeps the installer free of C++ and leaves the Mac App Store
build untouched (the component is not offered there unless review allows it).

## Which exports use it

Only the two structured exports that exist today (Preview):

- Markdown export.
- Tables to Excel (XLSX).

Text search, redaction, editing and page text grouping stay on the default
tier. The balanced tier is not used for anything that changes the PDF.

## Download: the OCR component pattern (superseded)

> Update 19-10: the OCR component is no longer downloaded; it is bundled in every
> build (docs/BUNDLED_OCR.md), and its downloader, its allow-list row and the
> `ocr-download` feature are gone. The pattern below describes what was removed.
> A download for this component (about 400 to 500 MB) cannot be bundled the same
> way and needs its own decision: an HTTP client, a host and an allow-list row,
> reviewed like a new origin. Read it as the design of the consent flow, not as
> code to copy.

Copy the consent and verification design of the former
`src-tauri/src/ocr_component.rs` downloader (git history, branch `feat/ocr-export`).

- Host: `https://components.pdfluent.com` only. It is already on the offline
  allowlist for OCR (`docs/OUTBOUND_ENDPOINTS.md`); the new files add a
  line to that entry and to `scripts/ci/offline-allowlist.mjs`.
- Manifest compiled into the build (`resources/extraction/balanced-component.json`).
  What may be downloaded is fixed at build time. Per file: path, exact size in
  bytes, SHA-256, licence, and platform (macOS arm64/x64, Windows x64).
  Fields: `component_version`, `sdk_pin`, `consent_text_version`,
  `published`. A manifest with `published: false` or with empty hashes cannot
  be downloaded from (same guard as OCR).
- Consent dialog, shown on first balanced export and from Settings. It lists
  every file with its size, its licence and the host. The total is stated up
  front (expected 400 to 500 MB; the real number comes from the manifest).
  Nothing is fetched before the user confirms. Declining keeps the default
  tier and shows no repeat prompt. Errors: `*_NO_CONSENT`, `*_SIZE_MISMATCH`,
  `*_HASH_MISMATCH`, each naming the file.
- Download goes to a temporary name, is checked for size then SHA-256, then
  renamed into the component directory in the app data folder. A failed or
  cancelled download leaves nothing behind. It resumes by file, not by byte.
- The component directory is only read from the path derived from the manifest
  version; no environment override in release builds.
- Remove from Settings deletes the directory; no residue, no account.

## Tests (to write when D5 is yes)

- Rust: balanced Markdown export of a table fixture equals the SDK's balanced
  output for the same pinned revision (the acceptance in #729).
- Rust: manifest guard (unpublished, wrong size, wrong hash, no consent) and a
  download against a local test server; a corrupted file is refused and removed.
- Vitest: consent dialog names every file, size, licence and host; offline
  allowlist test covers the new manifest entry.
- All in the existing macOS and Windows `cargo test` and vitest jobs, none
  `allow_failure`. The balanced test needs the models, so CI fetches them from
  the same manifest; if they are missing the test prints `SKIPPED (not a pass)`
  and the release gate fails on that line.

## Decisions for the owner

1. Ship balanced in the editor at all (D5), or stay on the default tier.
2. Size and licences: model licences must allow redistribution from our host
   (see "Modellicenties: meeleveren, neutraal"). The manifest carries each one.
3. Mac App Store: offer the component there, or direct-download builds only.
4. Cost of hosting 400+ MB per user on `components.pdfluent.com`.
