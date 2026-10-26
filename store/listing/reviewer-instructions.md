<!--
Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
See https://pdfluent.com/license for terms.
-->

# Notes for certification / reviewer instructions

Paste into Partner Center → **Submission options → Notes for certification**.

---

**About PDFluent**

PDFluent is a privacy-first desktop PDF editor. Opening, editing, converting,
organizing pages, redacting, watermarking, OCR and signing all run on the local
device, and documents are not uploaded. There is no account and no sign-in.

**No login needed to test.** Launch the app and either drag in any PDF or use
**"PDF openen" / "Open PDF"**. To exercise the main flows:

1. Open any PDF — it renders immediately.
2. **Edit:** click **Bewerken / Edit** in the toolbar, click a line of text, and
   type — the text edits inline.
3. **Convert:** click **Converteer / Convert** and export to Word/Excel/PowerPoint
   /Image/PDF-A; a Save dialog writes the file locally.
4. **All tools:** click **Alle tools / All tools** for compress, organize pages,
   merge, split, redact, protect, watermark, OCR.
5. **Sign:** click **Ondertekenen / Sign** to sign with your own .p12 or .pfx certificate.

**Licensing:** PDFluent is free for everyone, including business and commercial use. There is
no licence prompt, no account, and no in-app purchase — the app is fully
functional immediately after install.

**Network / privacy:** the only optional network calls are an auto-update check
(`pdfluent.com/releases/latest.json`) and optional, off-by-default crash and feedback reports, sent only when the user
presses Send. A feedback report can include the open document only if the user
ticks a box and confirms a second dialog that names the file. Privacy policy: https://pdfluent.com/privacy

**Installer:** Authenticode-signed MSI (Azure Trusted Signing,
CN=Innovation Trigger B.V.), offline, silent-install/uninstall clean.

**UI language:** the app follows the OS display language (27 locales). The
submitted screenshots were captured on a Dutch-locale machine; on an English
system the same UI appears in English.
