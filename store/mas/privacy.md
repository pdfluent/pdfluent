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
| Crash report | Only when crash reporting is switched on **and** the user presses send in the review dialog. Off by default. | `POST https://report.pdfluent.com/v1/report`: app version, OS name and version, UI locale, a timestamp, the user's own message text, and a scrubbed error message and stack trace. No IP-derived identifier, no account, no device id, no document. |
| Feedback report ("Help us improve PDFluent") | Only when the user presses Send in the form. | `POST https://report.pdfluent.com/v1/feedback`: the form answers and, if the user ticks "include system details", the version, system, language and last error. An e-mail address is sent only if the user ticks one of the two follow-up boxes. **The open document is sent only if the user ticks "Share the open document with this report" and then confirms a second dialog that names the file** (20 MB at most). |

Nothing else. Opening, editing, converting, redacting, OCR and signing all run
locally; no feature uploads a document, page, or fragment of a document. The one
path by which a document can leave the device is the feedback report above, and
it needs two deliberate steps by the user. A crash report never includes a
document.

Reports are stored on Cloudflare in Western Europe; documents the user chooses
to share are stored in an EU-jurisdiction bucket. The report service deletes
reports automatically: crash reports after 90 days, feedback reports after 365
days (set in the service code, `infra/report-worker/`; claim B64). A document
shared with a feedback report is deleted 90 days after its issue is closed, and
at the latest after 365 days.

## The declaration

**Does this app collect data? → Yes**, with these types, and no others:

| Data type | Linked to the user | Used for tracking | Purpose | Note |
|---|---|---|---|---|
| Diagnostics → Crash Data | No | No | App Functionality | Optional. Off by default; sent only on an explicit press of send. |
| Diagnostics → Other Diagnostic Data | No | No | App Functionality | App version, OS version, UI locale, timestamp. Same trigger. |
| User Content → Other User Content | No | No | App Functionality | The free-text note a user types into a bug or feedback report, and, only after a checkbox and a second confirmation that names the file, the open document. Both are sent because the user chose to send them. |

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
  a person's submissions. Even so, a sender can delete the crash reports and
  feedback reports they sent from this computer (Settings: "Delete my crash
  reports" and the matching feedback button). The app keeps the delete token the
  server returned; deleting removes the stored report, any contact address and
  any shared document. Reports are also deleted automatically: crash reports
  after 90 days, feedback reports after 365 days.
- **Children's category?** Not selected. The app is rated 4+ but is not directed
  at children.

## If a reviewer asks to see the network behaviour

Run the app with Little Snitch or `nettop` and use every feature: nothing
connects. Then send a feedback note from "Help us improve PDFluent" (or turn crash
reporting on in Settings and send a crash report); a single POST to
`report.pdfluent.com` appears. The payload shape is in
`src/lib/telemetry/report.ts`, and the scrubber that strips file paths and
personal strings before sending is in `src/lib/telemetry/scrub.ts`.
