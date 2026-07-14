<!--
Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
See https://pdfluent.com/license for terms.
-->

# Owner brief — what only Jasper can do

The technical work is done: a signed, hosted, validated Win32 MSI candidate; six
1920×1080 screenshots from the real app; a 300×300 logo; full listing copy,
privacy/compliance, system requirements, reviewer notes, release notes; and a
field-by-field Partner Center guide. Everything is committed under `store/`.

There is **no technical blocker.** What remains needs your account access or a
business decision.

## 1. Partner Center access (the gate)
- Register/confirm a **Microsoft Partner Center** account in the **Windows & Xbox**
  program. A **company** account verified as **Innovation Trigger B.V.** is needed
  to publish under that name (the installer is signed `CN=Innovation Trigger B.V.`).
  One-time fee (~US$99 company). I could not draft the live submission without it.

## 2. Decisions only you can make
- **Entity / publisher name:** the signing cert and these docs use
  **Innovation Trigger B.V.** Some older source headers used the bare product name
  as the entity (now normalized to Innovation Trigger B.V.). The Partner Center
  publisher name must match the entity that signs the MSI, so unless you
  deliberately re-sign under a different verified entity, use **Innovation Trigger B.V.**
- **Version to ship:** the validated candidate is **1.0.0-beta.20** (rebuilt 12 juli
  2026 — beta.18/19 still bundled the old in-app licensing UI, now fully removed;
  the editor is free for everyone including commercial use, see `LICENSE.md`). It
  is fully submittable, but decide whether to launch the Store with this beta or
  wait for a stable 1.0.0. (If you cut a stable build, re-run
  `store/scripts/validate-store-candidate.sh <ver>` and update the package URL in
  the upload guide. Nothing else changes.)
- **Screenshot language:** the six raw captures are **Dutch** (the box's OS
  locale). For an English (en-US) listing, re-capture in English (same harness, an
  English-locale Windows session) or publish a Dutch (nl-NL) listing. See
  `store/screenshots/screenshot-brief.md`.
- **Pricing / markets:** the guide assumes **Free**, **all markets**, **Public**.
  Confirm or change.

## 3. Exact values to provide during submission
- **Reserved product name** → the **Store ID / Product ID** Partner Center issues
  (paste it back into your notes).
- **Support contact** for the Properties step: `https://pdfluent.com/support`
  (live; links to `hello@pdfluent.com`). Already valid — no action needed.
- **Crypto export self-classification:** confirm PDFluent uses only standard
  cryptography (it does: PAdES/CMS signing, PDF encryption) and qualifies for the
  mass-market exemption.

## 4. Values already filled in for you (no action unless you disagree)
- Privacy policy URL: `https://pdfluent.com/privacy` (live)
- Website: `https://pdfluent.com`
- Package URL: `https://pdfluent.com/releases/1.0.0-beta.20/PDFluent_1.0.0-beta.20_x64_en-US.msi`
  (SHA-256 `8DAA08BE555FBF60B1D4AC68E1700A606CC1EE65E5E115F77168740E0885FFD8`)
- Category: Productivity · Architecture: x64 · Min OS: Windows 10 1809
- Age rating: everyone/3+ (IARC answers provided)
- Data collection: none by default (opt-in diagnostics only)

## 5. The final click
- Follow `store/partner-center-upload-guide.md` top to bottom, paste the copy +
  upload the screenshots and logo, then **Review**.
- **Do not press "Submit to the Store" until you've decided to go.** I did not
  draft or submit anything live (no Partner Center access, and per instruction).

## Optional, non-blocking
- Run WACK on the box for a deeper certification report (`store/build-validation-pipeline.md` §3).
- Commission branded screenshots + an optional 16:9 hero from the design briefs.
- Re-capture screenshots in English if you go en-US.
