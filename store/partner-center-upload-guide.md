<!--
Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
See https://pdfluent.com/license for terms.
-->

# Partner Center — field-by-field upload guide (Win32 app)

Follow top to bottom. Values to paste are in `code`. Anything marked **[OWNER]**
needs a decision/value only you have — collected in [`OWNER-BRIEF.md`](OWNER-BRIEF.md).
Do **not** click the final **Submit to the Store** until you've reviewed everything.

## 0. Account (one-time)

1. Sign in at **partner.microsoft.com** with the Microsoft account that owns (or
   will own) the **Windows & Xbox** developer program. **[OWNER]** — register if
   not done (one-time ~US$19 individual / ~US$99 company; a company account needs
   verifiable business identity for "Innovation Trigger B.V.").
2. Confirm the **publisher display name** shown to customers. **[OWNER]** — this
   must match the legal entity used elsewhere; the installer is signed
   `CN=Innovation Trigger B.V.`, so use **Innovation Trigger B.V.** unless you
   deliberately publish under another verified name.

## 1. Create the app + reserve the name

1. **Apps and games → New product → App**.
2. **Reserve product name:** `PDFluent` (try also `PDFluent — PDF Editor` if
   `PDFluent` is taken). Reserving generates the **Store ID / Product ID** — record
   it. **[OWNER]** if `PDFluent` is unavailable.

## 2. Product setup

- **Will this app use any of the following?** Answer the in-app-purchase /
  device-feature prompts: PDFluent has **no** Microsoft IAP (licensing is handled
  by the app's own Ed25519 key, not Microsoft commerce) → IAP **No**.
- **Is this app a game?** **No**.
- **Microsoft Store device families:** select **Windows Desktop** (PC). Leave Xbox/
  HoloLens/IoT unchecked.

## 3. Pricing and availability

- **Base price:** `Free` (the app is completely free, including for business use;
  there is no in-app licensing). **[OWNER]** confirm Free is intended for the Store SKU.
- **Free trial:** None.
- **Markets:** Select all, or restrict. **[OWNER]** — recommended: **all markets**.
- **Visibility:** **Public** (or "Private/hidden" first if you want a soft launch).
- **Schedule:** Release **as soon as it passes certification** (or pick a date).

## 4. Properties

- **Category / Subcategory:** `Productivity`  (alt: `Business`).
- **Privacy policy URL** (required): `https://pdfluent.com/privacy`
- **Website:** `https://pdfluent.com`
- **Support contact info:** `https://pdfluent.com/support` (live support page;
  it links to `hello@pdfluent.com`). No action needed.
- **System requirements:** copy from [`listing/system-requirements.md`](listing/system-requirements.md).

## 5. Age ratings

- Complete the **IARC questionnaire**. Use the answers in
  [`listing/privacy-compliance.md`](listing/privacy-compliance.md) → result will be
  rated for **all ages / 3+** (a PDF tool: no violence, no user-to-user comms in
  the app, no data collection by default). The questionnaire auto-issues the
  rating; no manual rating to paste.

## 6. Packages (the Win32 installer)

This is the **App package** step for a Win32 app:

1. Choose **"I'll provide my own installer (.exe or .msi)"** (the Win32 / "bring
   your own installer" option).
2. **Installer URL / upload:**
   `https://pdfluent.com/releases/1.0.0-beta.20/PDFluent_1.0.0-beta.20_x64_en-US.msi`
   (offline, Authenticode-signed; the Store does not re-sign it).
   SHA-256: `8DAA08BE555FBF60B1D4AC68E1700A606CC1EE65E5E115F77168740E0885FFD8`
3. **Silent install parameters** (if asked): `/quiet /norestart`
4. **Silent uninstall** (if asked): `msiexec /x {ProductCode} /quiet` — or let the
   Store use Add/Remove Programs (the MSI registers "PDFluent v1.0.0").
5. **Supported architectures:** `x64`. **Supported OS:** Windows 10 / 11.
6. **App type / does it install drivers, run as admin, etc.:** No drivers; standard
   per-machine MSI; no elevated background service.

## 7. Store listings (per language)

Create at least **English (en-US)**. **[OWNER]** decide whether to also add
**Dutch (nl-NL)** — the raw screenshots are currently nl-NL (see the screenshot
brief). For each listing:

- **Description / What your app does:** paste from [`listing/listing-copy.md`](listing/listing-copy.md).
- **What's new in this version:** paste from [`listing/release-notes.md`](listing/release-notes.md).
- **Product features** (short bullets): from the listing copy.
- **Screenshots:** upload the six PNGs from [`screenshots/raw/`](screenshots/raw)
  in the order + with the captions in [`screenshots/screenshot-brief.md`](screenshots/screenshot-brief.md).
  Device family: **Desktop**.
- **Store logo (1:1, 300×300):** upload [`assets/store-logo-300.png`](assets/store-logo-300.png).
- **Search terms:** from the listing copy (up to 7).
- **Copyright/trademark:** `© 2026 Innovation Trigger B.V.`
- **Additional license terms (optional):** link `https://pdfluent.com/license`.
- **16:9 hero (optional, promo):** not provided — see the screenshot brief design
  notes if you want one later.

## 8. Submission options / notes to certification

- **Notes for certification:** paste from [`listing/reviewer-instructions.md`](listing/reviewer-instructions.md)
  (how to test without a login; that the app is free with no licensing prompt; that it's local-only).
- **Restricted capabilities:** none.

## 9. Review + submit

- Use Partner Center's **"Review"** to catch missing required fields.
- **Do not press "Submit to the Store" without explicit approval.** When approved,
  submit; certification for a Win32 app is typically automated + fast, but can
  take up to a few business days.
