<!--
Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
See https://pdfluent.com/license for terms.
-->

# Privacy & compliance answers (Partner Center)

Source of truth: `https://pdfluent.com/privacy` ("We Do Not Collect…"). The app
is local-first; telemetry/crash reporting is **opt-in, default OFF**.

## Privacy policy
- **Privacy policy URL (required):** `https://pdfluent.com/privacy`

## Data collection — Partner Center "does your app collect data?" answers
- **Collects personal data by default:** **No.** PDFluent processes documents
  entirely on the device; no account, no sign-in, no document upload.
- **Telemetry / diagnostics:** Optional and **off by default**. If a user
  explicitly opts in (in app settings), anonymous crash/diagnostic data may be
  sent; it contains no document contents and no personal identifiers.
- **Advertising / tracking:** None.
- **Data shared with third parties:** None.
- **Network use:** Only (a) the optional auto-update check against
  `pdfluent.com/releases/latest.json`, and (b) optional opt-in diagnostics. Core
  PDF features work fully offline.

## Microsoft Store policy notes
- No restricted/sensitive capabilities; no background services or drivers.
- No user-generated content shared between users in-app (no social features).
- Honors a clean uninstall (verified: Program Files, ARP entry, ProgID removed).

## Age rating (IARC questionnaire) — answers
Answer the IARC questionnaire as follows (a productivity PDF tool):
- Violence / fear / sexual content / nudity / profanity / drugs / gambling / crime: **None / No** to all.
- In-game purchases / Microsoft commerce: **No**.
- Users interact / share content / communicate with each other in-app: **No**.
- Shares user's physical location: **No**.
- Collects/shares personal info: **No** (by default; opt-in diagnostics only).
- **Expected result:** rated for **everyone / 3+** in all regions.

## Export / encryption (US EAR / Partner Center "uses cryptography")
- The app uses cryptography for **digital signatures (PAdES/CMS)** and **PDF
  encryption/decryption** — all standard, using common algorithms. (The app has
  no licensing prompt and does not perform license verification at runtime.)
- Partner Center "Does your app call, support, or use cryptography?" → **Yes**,
  but it qualifies for the standard mass-market exemption (no proprietary/novel
  crypto; uses well-known algorithms via standard libraries). **[OWNER]** confirm
  the self-classification; no special export licence is expected for mass-market
  software using standard cryptography.

## Accessibility
- Standard Windows window + native menus; keyboard operable. **[OWNER]** — if you
  later complete an accessibility declaration, note keyboard navigation + the
  WebView2-based UI.
