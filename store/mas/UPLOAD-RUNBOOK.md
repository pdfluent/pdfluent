<!--
Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
See https://pdfluent.com/license for terms.
-->

# Upload runbook (owner)

Everything up to the signed package is done and repeatable in this repo. What is
left needs the Apple account, so it is yours. Two routes; pick one, they end in
the same place.

## Before either route

0. **Only if the UI changed since build 3.** The package and the screenshots in
   the repo both come from build 3 and match each other. If anything in the shell
   moves before you upload, rebuild (`bash scripts/build-mas.sh`, which hands out
   the next number) and re-capture
   (`bash store/mas/screenshots/harness/prepare-local-copy.sh`, then
   `bash store/mas/screenshots/harness/capture-mas.sh`), and commit the changed
   counter and images.
1. **The app record must exist** in App Store Connect: My Apps → + → New App,
   platform **macOS**, bundle id `com.pdfluent.app`, SKU `pdfluent-macos`,
   primary language English (U.S.). If the record already exists, skip this.
2. **A package to upload.** The one built from this code is
   `dist-release/PDFluent_1.0.0_mas.pkg`. To rebuild it:
   ```sh
   cd <this repo>
   MAS_DRY_RUN=1 bash scripts/build-mas.sh     # prints the build number it would use
   bash scripts/build-mas.sh                   # builds, signs and packages
   ```
   The build number comes from `store/mas/build-number` and goes up by one each
   time. **Commit the changed counter** — that file is how the next build knows
   where to start.

## Route A — Transporter (no key to create)

1. Install **Transporter** from the Mac App Store, if it is not there.
2. Open it and sign in with the Apple ID that owns the developer account.
3. Drag `dist-release/PDFluent_1.0.0_mas.pkg` onto the window.
4. Press **Deliver**. It validates first; a validation error appears in full in
   the window, and the text of it is what to send back here.
5. The build appears in App Store Connect under TestFlight → macOS after
   processing (usually 5 to 30 minutes; the "processing" state is normal).

## Route B — App Store Connect API key (repeatable, no interactive sign-in)

1. App Store Connect → Users and Access → **Integrations** → App Store Connect
   API → **+**. Role **App Manager** is enough to upload.
2. Download the `.p8` **once** (it cannot be downloaded again), note the **Key
   ID** and the **Issuer ID**.
3. Keep the file out of this repo. `~/private/AuthKey_XXXXXXXX.p8` is fine.
4. Then the build and the upload are one command:
   ```sh
   APPLE_API_KEY_ID=XXXXXXXX \
   APPLE_API_ISSUER=<issuer-uuid> \
   APPLE_API_KEY_PATH=~/private/AuthKey_XXXXXXXX.p8 \
   bash scripts/build-mas.sh
   ```
   Without those three variables the script stops at the signed package and says
   so, which is what it did for this build.

## After the upload

1. **Export compliance** — App Store Connect asks per build unless the answer is
   in `Info.plist`. The answers are in `export-compliance.md`; the short version
   is "yes, it uses encryption" and "yes, it qualifies for the exemption".
2. **TestFlight smoke** — `review-notes.md` has the ten-minute script. Do this
   before Submit: it is the first time the sandboxed build runs anywhere other
   than the machine that built it.
3. **Fill the listing** from `listing.md`, upload the six screenshots from
   `screenshots/`, paste the custom EULA per `eula.md`, and answer App Privacy
   from `privacy.md`.
4. **Submit for review.**

## If the upload is rejected before review

- *"The bundle version must be higher than the previously uploaded version"* —
  the counter and App Store Connect disagree. Set the counter to the number App
  Store Connect shows and commit it; the next build goes one above.
- *"Invalid Code Signing Entitlements"* — run
  `node scripts/mas-entitlements.mjs --pkg <pkg>`; it prints exactly which
  entitlement differs from `src-tauri/Entitlements.appstore.plist`.
- *"App sandbox not enabled"* — same command; it is the first thing it checks.
- *"The provisioning profile has expired"* — the one on disk expires
  **2027-07-08**. Regenerate it in the developer portal and replace
  `src-tauri/PDFluent_MAS.provisionprofile`.
