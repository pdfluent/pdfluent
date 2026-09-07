<!--
Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
See https://pdfluent.com/license for terms.
-->

# Editor licence, terminology and claims

Standing decisions this document records, and where each one is enforced.
Closes pdfluent/pdfluent-internal#225.

## The decisions

| # | Decision | Settled |
|---|---|---|
| 1 | The editor is free for everyone, including commercial and business use. | 2026-07-11 |
| 2 | It is proprietary, source-available software under the EULA in `LICENSE.md`. Never "open source". | 2026-08-18 |
| 3 | The legal entity is Innovation Trigger B.V. | 2026-08-18 |
| 4 | There is no licence key, no trial, no tier and no paywall. Monetisation runs through the separately licensed SDK. | 2026-07-11 |
| 5 | The editor carries a public-beta label. | 2026-09-06 |
| 6 | The SDK is a different product: AGPLv3 or a commercial licence. Its terms never describe the editor. | 2026-08-25 |

## Where each one is enforced

| Decision | Guard | What breaks it |
|---|---|---|
| 2, 3, 6 | `tests/licensing-claims-guard.test.ts` | Stale prose anywhere in the repository: an AGPL self-licence header, an open-source tagline for the editor, either of the two superseded copyright holders, the pricing and per-seat language of the paid-app era, and the old split between personal and business use. The nineteen patterns are listed in the file, which is why this table describes them instead of quoting them. |
| 1, 4 | `tests/editor-ui-terminology-guard.test.ts` | The vocabulary of the abolished paid model in anything a user reads: the 27 locale files, the frontend sources, the native menu. Plus the machinery behind it — a registered `activate_license` command, a managed `LicenseManager`, or the `LicenseSeat` model returning to the frontend. |
| all | `.gitlab-ci.yml`, job `quality-gates-fast` | Nothing, if the job stops running. It fires on every merge request *and* on every push to `main` or `release/**`, because the editor lands on `release/ga-readiness` by push. The guard above asserts that rule is still there. |

`.github/workflows/core-tests.yml` runs the same suite, but only for whoever
pushes this tree to GitHub. This repository pushes to `gitlab`; treat the
GitHub workflow as a courtesy for the public export, not as the gate.

## Claim IDs

Every factual statement in the editor's external texts maps to an ID in
`PDFluent/CLAIMS.md`. Per §7 of that register the ID does not appear in the
published text; it lives here so a review can check it.

| Where | Statement | ID |
|---|---|---|
| `README.md`, `LICENSE.md` §2, store listing | Free for everyone, including business use. No account, no telemetry unless the user switches reporting on | B01 |
| `LICENSE.md` §4, store listing, `store/listing/privacy-compliance.md` | Three kinds of outbound request: update check, opt-in report, opening a link | B08 |
| `LICENSE.md` §4 | What an opt-in report contains, and what it does not | B21 |
| `LICENSE.md` §4, Settings | The startup update check can be switched off; the manual check keeps working | B22 |
| `README.md` | No document content over the network | B09 |
| `README.md` | Pure-Rust engine, no C or C++ dependencies | A07 |
| `README.md` comparison table | Adobe Acrobat is subscription-only | C01, C02 |
| Download page, store listing | Download size | B13 |
| `README.md` status line, `package.json` | Public beta | B25 |
| `README.md`, store listing | Interface in 27 languages | B26 |
| The application itself | No licence-model vocabulary on screen | B24 |

## What is deliberately not written

**The §3 split between application and engine.** §3 forbids extracting "any
Component of the Application — including the embedded PDF engine". Splitting
that sentence so the engine is carved out would put a promise in the EULA that
the code does not keep while the engine is proprietary. It becomes writable
when `LICENSE` and `LICENSE-COMMERCIAL` exist on the SDK side (#220).

**A status row in Settings > About.** The About panel shows the version, which
reads `1.0.0-beta.21`. Adding a separate "Public beta" row means a new key in
27 locale files, and a machine translation into 26 languages is not worth the
risk of getting the one word that describes our release stage wrong.
