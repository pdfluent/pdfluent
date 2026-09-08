<!--
Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
See https://pdfluent.com/license for terms.
-->

# App privacy answers (App Store Connect → App Privacy)

Privacy policy URL: `https://pdfluent.com/privacy`

Apple asks what the app **collects**, which it defines as any data transmitted
off the device — including data sent only after the user opts in, and including
data that is never linked to an identity. "Data Not Collected" would therefore be
the wrong answer here, even though it is the answer that would look best: the app
can send a crash or feedback report, and answering "collects nothing" would be a
misdeclaration that Apple can act on later.

## What leaves the device, ever

| Path | When | What |
|---|---|---|
| Update check | On launch, unless switched off in settings. **Not in the App Store build** — the updater is compiled out (`--no-default-features`) and the App Store delivers updates. | An HTTPS GET. Nothing about the user or the document. |
| Report (crash / bug / feedback) | Only when reporting is switched on **and** the user presses send in the review dialog. Off by default. | `POST https://report.pdfluent.com/v1/report`: app version, OS name and version, UI locale, a timestamp, the user's own message text, and a scrubbed error message and stack trace. No IP-derived identifier, no account, no device id, no document. |

Nothing else. Opening, editing, converting, redacting, OCR and signing all run
locally; no document, page, or fragment of a document is uploaded by any feature.

## The declaration

**Does this app collect data? → Yes**, with these types, and no others:

| Data type | Linked to the user | Used for tracking | Purpose | Note |
|---|---|---|---|---|
| Diagnostics → Crash Data | No | No | App Functionality | Optional. Off by default; sent only on an explicit press of send. |
| Diagnostics → Other Diagnostic Data | No | No | App Functionality | App version, OS version, UI locale, timestamp. Same trigger. |
| User Content → Other User Content | No | No | App Functionality | The free-text note a user types into a bug or feedback report. It is their own words, sent because they chose to send them. |

Mark all three **Optional** where App Store Connect offers the choice, and answer
**No** to every tracking question: there is no advertising, no analytics SDK, no
third-party network call, and no identifier that follows a user between apps or
websites.

## Answers to the questions that follow

- **Do you or your third-party partners use data for tracking?** No.
- **Does the app use the Advertising Identifier (IDFA)?** No.
- **Third-party SDKs that collect data?** None. The report endpoint is our own.
- **Account required?** No. There is no sign-in of any kind.
- **Data deletion in-app (5.1.1(v))?** Not applicable: no account, and no server
  side profile to delete. Reports carry no identifier that could be used to find
  a person's submissions.
- **Children's category?** Not selected. The app is rated 4+ but is not directed
  at children.

## If a reviewer asks to see the network behaviour

Run the app with Little Snitch or `nettop` and use every feature: nothing
connects. Then turn reporting on in Settings and send a feedback note; a single
POST to `report.pdfluent.com` appears. The payload shape is in
`src/lib/telemetry/report.ts`, and the scrubber that strips file paths and
personal strings before sending is in `src/lib/telemetry/scrub.ts`.
