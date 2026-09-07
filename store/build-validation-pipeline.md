<!--
Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
See https://pdfluent.com/license for terms.
-->

# Store-candidate build + validation pipeline

The Store candidate is the **same** signed `.msi` PDFluent already ships for
direct download — there is no separate Store build. This keeps one artifact,
one signature, one auto-update path. The pipeline below reproduces it and gates
it for Store certification.

## 1. Build (reproducible, on the Windows build host)

```
# On the LAN Windows box (Win 11, MSVC + WiX), from the editor checkout:
#   - loads .env (TRUSTED_SIGNING_PROFILE + AZURE_* for Azure Trusted Signing,
#     TAURI_SIGNING_PRIVATE_KEY for the updater sig)
npm run release:windows -- 1.0.0-beta.21      # or: scripts/release-windows.ps1 1.0.0-beta.21
```

`scripts/release-windows.ps1` already enforces, in order:

1. **No silent unsigned release** — refuses to build an unsigned MSI when the
   updater key is present but Authenticode signing is disabled.
2. **Authenticode** — `signtool /dlib Azure.CodeSigning.Dlib.dll` (Azure Trusted
   Signing, profile `pdfluent-public-trust`, identity Innovation Trigger B.V.).
3. **Frontend-embed gate** — fails if the built `.exe` embeds a stale frontend
   bundle (the defect that shipped beta.17 behind an old `index-*.js`).
4. **Updater artifact** — produces `*.msi.sig` (minisign, trusted key
   `9E2BAD9AABF995DD`).

The MSI is then published to R2 (`scripts/publish-artifact.mjs`) at
`pdfluent.com/releases/<version>/…` — the URL the Store listing points at. This
is the **existing website release path; it is unchanged**.

## 2. Validate (the Store certification gate)

```
store/scripts/validate-store-candidate.sh 1.0.0-beta.21
#   add  WIN_BUILD_HOST=user@winbox  to also run the on-Windows checks over SSH
```

It verifies, and fails non-zero on any miss:

| Check | Requirement | Result on 1.0.0-beta.21 |
|---|---|---|
| Installer hosted + live | Win32 Store needs a self-hosted `.msi`/`.exe` URL | ✅ HTTP 200 |
| SHA-256 recorded | provenance | ✅ `D0B5348E…` |
| Updater feed | in-app updater advertises this version (windows-x86_64) | ✅ |
| Authenticode (Windows) | Valid, signed by us (Store does not re-sign EXE/MSI) | ✅ `CN=Innovation Trigger B.V.` |
| Silent install (Windows) | `msiexec /i /quiet` → exit 0, app present | ✅ |
| Silent uninstall (Windows) | `msiexec /x /quiet` → exit 0, fully removed | ✅ |

## 3. Optional deeper pass — Windows App Certification Kit (WACK)

Not required for Win32 Store submissions, but recommended before a stable
release. WACK is interactive + long, so run it on the Windows box directly:

```
& "C:\Program Files (x86)\Windows Kits\10\App Certification Kit\appcert.exe" reset
& "C:\Program Files (x86)\Windows Kits\10\App Certification Kit\appcert.exe" `
    test -apptype desktop `
    -setuppath "<path>\PDFluent_<ver>_x64_en-US.msi" `
    -reportoutputpath "C:\temp\pf-wack.xml"
```

WACK validates reversible install/uninstall, a present digital signature, no
banned/deprecated APIs, and launch stability. Attach the report XML to the
Partner Center submission if you want the extra signal (optional).

## What "tested Store candidate" covers (validated on the real candidate)

- Updater behaviour — feed reachable; the Win32 app keeps its own updater.
- File association — `.pdf` ProgID registered (`PDFluent.pdf` → `pdfluent-desktop.exe "%1"`).
- Runtime — see [`listing/reviewer-instructions.md`](listing/reviewer-instructions.md);
  the same binary passed the white-text edit, multi-format convert, and
  signing flows captured in the screenshots.
