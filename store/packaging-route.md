<!--
Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
See https://pdfluent.com/license for terms.
-->

# Packaging route: Win32 (EXE/MSI), not MSIX

## Decision

Submit PDFluent to the Microsoft Store as a **Win32 app** using the existing
Authenticode-signed `.msi`. Do **not** repackage as MSIX.

The Microsoft Store has accepted Win32 `.exe`/`.msi` apps since June 2021. The
developer hosts the installer; the Store lists it, links the package URL, and runs
its own certification (signature + malware + policy) without re-signing or
sandboxing the installer.

## Why Win32 and not MSIX

PDFluent depends on three behaviors that MSIX's AppContainer + Store-managed
delivery would break or complicate:

| Capability | Win32 MSI | MSIX |
|---|---|---|
| **App's own auto-updater** (Tauri updater → `pdfluent.com/releases/latest.json`, Ed25519/minisign verified) | Works unchanged | Disabled — MSIX apps update via the Store only; the in-app updater must be stripped |
| **`.pdf` file association + "Open with"** | Standard registry ProgID (already registered by the MSI) | Must be re-declared in the MSIX manifest; behavior differs under AppContainer |
| **Local-first guarantee** ("everything runs on your device") | Native, no broker | AppContainer brokers some I/O; messaging harder to keep clean |

MSIX's benefits (free Microsoft re-signing, Store CDN hosting, Store-driven
updates) do not outweigh losing the in-app updater + native file
handling for this product. The Win32 route ships the **exact** binary we already
build, sign, test and auto-update — one artifact, one behavior across direct
download and Store.

## Requirements the Win32 route imposes (all satisfied)

- The installer must be `.exe` or `.msi` — ✅ WiX `.msi`.
- It must be an **offline** installer (no downloads during setup) — ✅ self-contained.
- We must **Authenticode-sign it ourselves** (the Store does not re-sign EXE/MSI) — ✅ Azure Trusted Signing, `CN=Innovation Trigger B.V.`, verified Valid.
- We must **host** the installer and provide its URL — ✅ `https://pdfluent.com/releases/1.0.0-beta.21/PDFluent_1.0.0-beta.21_x64_en-US.msi` (Cloudflare R2 behind pdfluent.com).
- A privacy policy URL is required — ✅ `https://pdfluent.com/privacy`.

## If MSIX is ever wanted (future, not now)

`makeappx.exe` is present on the build box. An MSIX could be produced from the
built payload, but it would require: removing the in-app updater and
re-declaring file associations in the package manifest. Treat as a
separate project; it is **not** needed to ship on the Store.
