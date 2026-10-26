<!--
Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
See https://pdfluent.com/license for terms.
-->

# OCR is bundled in every build

Owner decision 19-10: Tesseract and its language packs ship inside every
PDFluent build, Mac DMG and site, Windows MSI and Microsoft Store, Mac App
Store. There is one path and no components: no download, no consent dialog, no
`components.pdfluent.com`, no network for OCR. This replaces the opt-in download
(decision D4, claim B63) and `docs/MAS_BUNDLED_OCR.md`, which covered the store
build only.

Why: the download was a second code path with its own UI (dialog, install,
add-language, remove), an HTTP client in the Rust backend, one extra allowed
origin and a host to run. The Mac App Store cannot use it at all (guideline
2.5.2 forbids downloading executable code), so the store build had a bundled
path anyway. One path is less code and a smaller attack surface, and OCR works
offline from the first launch.

## How it works

| Piece | Where |
|---|---|
| Component found in `<resources>/resources/ocr/{bin/tesseract[.exe],LICENSES,tessdata}`; sizes checked against the compiled-in manifest at run time; a defect is named (`OCR_COMPONENT_NOT_INSTALLED:bundle: tessdata/nld.traineddata: ...`), never turned into an offer to download | `ocr_component::bundled`, `resolve` |
| Status for the UI: `installed`, `problem`, `published`, `platform_supported`, languages | `ocr_component::status`, `ocr_component_status` command |
| UI: OCR runs at once; Settings shows one line (built in and complete, or what is missing); no dialog, no install, add-language or remove | `src/lib/ocrComponent.ts` (`ocrReadiness`), `useOcr.ts`, `SettingsPanel.tsx` |
| Build: the component is assembled from the `build-tesseract.sh` output after SHA-256 and size are checked against the manifest, and laid out as the app reads it | `scripts/ocr-component/ocr-bundle.mjs --stage` |
| Mapping into the app, the same for every profile (no overlay can forget it) | `bundle.resources` in `src-tauri/tauri.conf.json`: `resources/ocr-bundle` -> `resources/ocr` |
| A build for release cannot lack the bundle: `PDFLUENT_REQUIRE_OCR_BUNDLE=1` stops `src-tauri/build.rs` when it is not staged | `src-tauri/build.rs` |
| The bundle is checked inside the finished app | `ocr-bundle.mjs --verify` in every release script |
| Languages: eng, nld, deu, fra, spa, ita (tessdata_fast 4.1.0). Add one to the manifest and it is in every build | `src-tauri/resources/ocr/tesseract-component.json` |

The manifest has no download fields any more (`base_path` and
`consent_text_version` are gone, schema 2). It pins, per platform, every file of
the component (binary, licence texts) and every language pack with SHA-256 and
exact size.

## The three bundles

| Bundle | Used by | Binary |
|---|---|---|
| `macos-universal` | Mac DMG and site (`notarize-macos.sh`, `release-macos.sh`), Mac App Store (`build-mas.sh`) | the pinned arm64 and x86_64 builds, hashed against the manifest, `lipo`-merged, signed again with hardened runtime and the sandbox-inherit entitlements (`Entitlements.appstore.inherit.plist`) |
| `windows-x86_64` | Windows MSI and Microsoft Store (`release-windows.ps1`, `release-windows-remote.sh`) | the Authenticode-signed `tesseract.exe` as pinned: copied, not changed, so its exact hash is verified in the build and its size at run time |
| `macos-aarch64`, `macos-x86_64` | a developer or a CI runner that builds one architecture | never shipped |

### macOS (DMG, site, App Store)

* The app is sandboxed in every Mac distribution (`Entitlements.plist` for the
  DMG, `Entitlements.appstore.plist` for the store). A child process of a sandboxed
  app must be signed with `com.apple.security.app-sandbox` + `com.apple.security.inherit`,
  or the sandbox kills it at launch: on the user's and the reviewer's Mac, not on the
  build machine. So the merged binary is signed at staging time with those
  entitlements (`ocr-bundle.mjs`, `codesignBinary`), and `notarize-macos.sh` signs it
  with the Developer ID and the same entitlements in its nested-binary pass (the other
  nested binaries are signed as before). Hardened runtime and the secure timestamp
  are on, so notarisation accepts it.
* `notarize-macos.sh` reads the result back from the finished app: bundle verified,
  `codesign --verify --strict` on the helper, hardened runtime flag, `inherit`
  entitlement.
* `build-mas.sh` signs every nested Mach-O with the Apple Distribution identity and
  the inherit plist, re-seals the app, verifies the bundle in the `.app` and reads the
  helper entitlements back from the `.pkg` (`scripts/mas-entitlements.mjs --helpers`).
* Tesseract gets the page as PNG on stdin and writes TSV on stdout (`ocr.rs`),
  reads language data from the signed bundle through `--tessdata-dir` and writes no
  file, so the inherited sandbox is all it needs.

### Windows (MSI, Store)

* `build-tesseract.sh --platform windows-x86_64` builds statically with MSVC
  (`/MT`), CMake and the same pinned sources (Git Bash on the Windows build host, or
  the `quality:windows` runner, which already does). No MSYS2/vcpkg route is needed
  and nothing is paid for: the build host and the self-hosted runner exist.
* The binary is signed in `release-windows.ps1`, before the MSI build, with the same
  Azure Trusted Signing step as the app (`src-tauri/scripts/sign-windows.ps1`). The script
  verifies the Authenticode status is `Valid`, then re-pins the **signed** bytes with
  `write-manifest.mjs --platform windows-x86_64` and stages from that. Tauri signs the
  app and the installer but not resource executables, which is why the component is
  signed here.
* Signing and re-pinning: a signature changes the file, and every signing run changes it
  again (the timestamp is inside), so the hash can only be pinned after signing and a
  rebuild or re-sign needs a new pin. The pin on `main` is the unsigned build's hash;
  the release run overwrites it in its working tree with the signed hash, compiles the
  app with that manifest, and prints the commit to make. Commit the re-pinned
  `tesseract-component.json` after the release so `main` names the bytes that shipped.
  By hand: sign the exe, then `node scripts/ocr-component/write-manifest.mjs --platform
  windows-x86_64 --dir <out>\windows-x86_64`, and keep that exact file (do not re-sign).
* `release-windows.ps1` stages the bundle, builds with `PDFLUENT_REQUIRE_OCR_BUNDLE=1`,
  verifies `target/release/resources/ocr` (what the MSI is built from) and, for a signed
  build, refuses a `tesseract.exe` whose Authenticode status is not `Valid`.
  `release-windows-remote.sh` refuses to start without `PDFLUENT_OCR_COMPONENT_BUILD_WIN`
  (the folder on the box) and passes it to the build.
* The Microsoft Store submission uses the same MSI (RELEASE.md, step 4), so it carries
  the same bundle.

## Pinning (once per component version)

`published` stays `false` in the manifest until a person has built and pinned every
platform and language. (It is `true` since the macOS slices were pinned on 21-10; the
Windows pin is re-taken from the signed file at release time, above.) While it is `false`:

* `ocr-bundle.mjs --stage` refuses, so no release script can make an installer;
* an app built without the pin reports OCR as unavailable (`published: false`), and
  Settings says the OCR files are missing from the build.

The steps are in RELEASE.md, step 0b. The universal macOS binary is the one file the
manifest cannot pin (it is a merge of two pinned inputs, signed again), so its inputs
are what the manifest vouches for and the app signature seals the result.

## CI

The hosted jobs cannot build the pinned bytes: a rebuild on a runner differs from
the signed file. So `quality:macos` and `quality:windows`:

1. build the component from the pinned sources (`build-tesseract.sh`),
2. run `ocr-bundle.mjs --stage ... --rehearse <manifest copy>`: the build is pinned into
   a **copy** of the manifest (never the committed one) and staged and verified against
   it, which proves the layout, the merge and signing mechanics, the licence texts and
   the language packs,
3. build the app with `PDFLUENT_REQUIRE_OCR_BUNDLE=1`: `build.rs` fails the job if the
   bundle is missing or incomplete,
4. verify the bundle in the built app, on macOS also the helper's signature and its
   `inherit` entitlement, and (macOS) run `ocr-smoke.mjs` on the staged binary:
   `--version` and an OCR of `tests/fixtures/ocr/hello-ocr.png` per architecture, on a
   re-signed copy. The shipped helper itself cannot run outside a sandboxed app (it is
   signed `app-sandbox` + `inherit`: the kernel aborts it before `main`, exit 133, no
   output), so a plain `tesseract --version` on it prints nothing and means nothing,
5. run `ocr_makes_scans_searchable` (`PDFLUENT_REQUIRE_OCR_COMPONENT=1`), which lays the
   built component out as a bundle and makes a scan searchable through the app's own
   bundle path.

No release script rehearses: `tests/ocr-bundle.test.ts` fails if one contains
`--rehearse`.

## Size

Measured on the component built on this Mac (`builds/ocr-component/out`, Release
build of Tesseract 5.5.1, statically linked, tessdata_fast 4.1.0 packs), bytes:

| Payload | Bytes |
|---|---|
| `bin/tesseract`, macOS arm64 | 5,354,592 |
| `bin/tesseract`, macOS x86_64 | 5,622,416 |
| `bin/tesseract`, Windows x86_64 | not built on this Mac; see below |
| eng / nld / deu / fra / spa / ita | 4,113,088 / 6,050,296 / 1,525,436 / 1,130,365 / 2,294,433 / 2,701,314 |
| Language packs together | 17,814,932 |
| Licence texts | 30,584 |

Added to the app, per platform:

| Platform | Added to the app | Notes |
|---|---|---|
| Mac, Apple Silicon (device) | 23,200,108 bytes (about 23.2 MB) | arm64 slice + packs + licences (the App Store thins a universal app to the device; the DMG does not) |
| Mac, Intel (device) | 23,467,932 bytes (about 23.5 MB) | x86_64 slice + packs + licences |
| Mac, universal `.app` / DMG / `.pkg` | 28,836,204 bytes (about 28.8 MB); the universal binary measured 10,990,688 bytes | both slices in one file (a `lipo` merge is the two slices plus a small header) + packs + licences |
| Windows x86_64 (MSI, installed) | about 23 to 25 MB | estimate: MSVC static `/MT` binary of about 5 to 7 MB (the macOS builds are 5.3 to 5.4 MB) + packs + licences. Not measured on this Mac: the first Windows component build (`quality:windows` keeps it as the artefact `ocr-component-windows-x86_64`, 14 days) gives the exact number. The MSI compresses the packs, so the installer grows by less than the installed size |

App size before and after, per architecture, comes from the build round (no full
build in development mode):

```
node scripts/measure-app-size.mjs --before <before.app> --after <after.app>    # macOS, per architecture
# Windows, installed size of the OCR folder:
powershell -c "(Get-ChildItem -Recurse '<install dir>\resources\ocr' | Measure-Object Length -Sum).Sum"
```

| | arm64 | x86_64 | Windows |
|---|---|---|---|
| Before (no OCR) | to be measured in the build round | to be measured | to be measured |
| After (bundled OCR) | to be measured | to be measured | to be measured |

## Proposed claim text (replaces B63)

B63 described an opt-in download and is obsolete. Proposed wording, for the owner
to register in `CLAIMS.md` with a source and run ID before any external use:

> OCR is built in. It runs on your computer, works offline and needs no download.
> It reads English, Dutch, German, French, Spanish and Italian.

Evidence to attach at registration: the `quality:macos` and `quality:windows` runs
that execute `ocr_makes_scans_searchable` through the bundle, the offline
allow-list test (no OCR host), and the measured sizes above. Until it has an ID,
store texts and `product/editor-features.json` carry the wording as a limit, not
as a published claim.

## Tests

* `src-tauri/src/ocr_component.rs` (unit): bundle found with every language;
  complete bundle reported installed with its languages; missing language, wrong
  size, missing or non-executable binary and unpublished manifest refused by name;
  unknown platform unsupported; same-size tampering caught by `verify_bundle_hashes`;
  a pinned Windows binary checked by size and hash; no download code in the module
  and no `ocr-download`/`reqwest` in `Cargo.toml`.
* `src-tauri/tests/ocr_makes_scans_searchable.rs`: a build without its bundle names
  the defect and never offers a download; a bundle laid out from the built
  component runs OCR through the bundle path (`PDFLUENT_OCR_COMPONENT_BUILD`, required
  with `PDFLUENT_REQUIRE_OCR_COMPONENT=1`); the shipped bundle is the pinned component
  and makes a scan searchable (`PDFLUENT_OCR_BUNDLE_DIR`, required with
  `PDFLUENT_REQUIRE_OCR_BUNDLE=1` in the release build rounds).
* `tests/ocr-bundle.test.ts`: staging checks hashes and refuses tampering, gaps,
  unpublished manifests and stray files (macOS and Windows); verification catches a
  changed pack, a missing file, a thin binary, a wrong Windows hash; the rehearsal
  never touches the committed manifest and is used by CI only; every release script
  stages before building, builds with `PDFLUENT_REQUIRE_OCR_BUNDLE=1` and verifies
  after; the helper entitlements; the mapping lives in `tauri.conf.json` only; the
  offline allow-list no longer contains the component host, `HTTP_CLIENT_EXCEPTIONS`
  is empty, the install/cancel/remove commands are gone.
* `tests/ocr-component-manifest.test.ts`: the manifest tooling and the shape of the
  shipped copy (three platforms, four required languages, licence per notice, no
  download fields).
* `src/lib/__tests__/ocrComponent.test.ts`: complete bundle is ready, an incomplete
  one or a missing language is unavailable, never a download offer.

## Finding the bundle folder

`ocr_component::find_bundle` tries, in order: `PDFLUENT_OCR_BUNDLE_DIR` (debug and e2e
builds only), Tauri's `resource_dir()` + `resources/ocr`, the layout of the
platform next to the executable (macOS `Contents/Resources`, Windows beside the
`.exe`, Linux `lib/<app>`), and in debug builds the staged
`src-tauri/resources/ocr-bundle`. Tauri's `resource_dir()` alone answers
"unknown path" for an executable that is neither inside an `.app` nor in a
`target/{debug,release}` folder, for instance when `CARGO_TARGET_DIR` is on
another disk. A development run needs the bundle staged once
(`node scripts/ocr-component/ocr-bundle.mjs --stage`) or one of the two
variables (`PDFLUENT_OCR_BUNDLE_DIR`, `PDFLUENT_OCR_COMPONENT_DIR`).

`ocr_component_status` never fails because the folder is missing: it returns
`installed: false` with the paths it tried in `problem`. It is a background
probe, so the frontend asks through `invokeQuietly` and a failure is logged,
never shown as a toast; the OCR UI reads `installed: false` as "not available
in this build".
