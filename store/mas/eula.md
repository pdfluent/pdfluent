<!--
Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
See https://pdfluent.com/license for terms.
-->

# EULA for the App Store submission

## Which agreement applies

App Store Connect offers two options under **App Information → License
Agreement**: Apple's standard EULA, or a custom one. PDFluent uses a **custom
EULA**: the text in `LICENSE.md` at the root of this repository (EULA v2.0,
2026-07-11), which is the same agreement that ships with the direct download and
with the Microsoft Store build. One product, one agreement.

Paste the body of `LICENSE.md` into the custom licence agreement field. It must
be the whole document; App Store Connect stores plain text, so the markdown
headings become plain lines.

## The one thing a reviewer needs to read out of it

**PDFluent is free for everyone, including commercial and business use.** There is
no licence key, no paywall, no per-seat pricing, no trial period and no in-app
purchase in this app. The app contains no licence screen of any kind: it does not
ask for a key, it does not check one, and there is no code path that limits a
feature behind a purchase.

This matters for two review guidelines:

- **2.4.5(vi)** (a Mac app must not present a licence or registration screen).
  Nothing to present. The licensing module is not registered in the build and
  there is no licence UI in any build.
- **3.1.1 / 3.1.3** (in-app purchase). No purchase of any kind takes place in the
  app, so no IAP is required or offered.

What the custom EULA does reserve is the **SDK**: the PDF engine inside the app is
licensed separately for programmatic and embedded use. That restriction is about
extracting and reusing the engine, not about using the app. A person or a company
downloading PDFluent from the Mac App Store and editing PDFs with it, for work,
owes nothing.

## Wording to reuse where a field asks "how is this app monetised"

> PDFluent is free to use, including for commercial use. There is no in-app
> purchase, no subscription and no licence key. The company earns from a
> separately licensed SDK for developers who embed the PDF engine in their own
> software; that SDK is not part of this app and is not sold through it.
