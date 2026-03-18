# PDFluent Launch Plan — Product Hunt & Hacker News

## Product Hunt

### Tagline
Privacy-first PDF editor — free for personal use

### Description
PDFluent is a desktop PDF editor that processes everything locally. No cloud, no accounts, no telemetry.

Built with Rust for speed and a custom PDF engine for maximum compatibility — including XFA forms that most editors can't handle.

**What you can do:**
- View, annotate, and fill PDF forms
- Merge, split, rotate, and reorder pages
- Digital signatures and PDF/A compliance
- Encrypt/decrypt, compress, and watermark
- Extract images and convert to DOCX
- ZUGFeRD/Factur-X e-invoice support

Free for personal, non-commercial use. Per-seat license for businesses.

Available for macOS, Windows, and Linux.

### Topics
- Productivity
- Design Tools
- Developer Tools
- Privacy
- Open Source (engine is custom, app is proprietary)

### Maker Comment
We built PDFluent because every PDF editor either uploads your files to the cloud or costs a fortune. PDFluent runs entirely on your machine — your documents never leave your device.

The engine is written in Rust from scratch, which means it handles edge cases (like XFA forms) that trip up most competitors. And it's fast.

Free for personal use. If you use it at work, we charge per seat — similar to how JetBrains does it.

### First Comment Strategy
Post at 00:01 PST on launch day. First comment should explain the "why" — privacy concerns with cloud-based PDF editors and the XFA form gap.

---

## Hacker News

### Title Options (pick one)
1. Show HN: PDFluent — A privacy-first desktop PDF editor (free for personal use)
2. Show HN: PDFluent — Local-only PDF editor with Rust engine and XFA support

### Post Text
I built PDFluent because I was tired of PDF editors that upload my files or require subscriptions for basic operations.

PDFluent runs 100% locally. No cloud processing, no account needed. The PDF engine is written in Rust from scratch using our own SDK.

Features: view/annotate/fill forms, merge/split/rotate pages, digital signatures, PDF/A compliance, encrypt/decrypt, image extraction, DOCX conversion, and ZUGFeRD e-invoicing.

It handles XFA forms — the complex dynamic forms used by governments and large organizations that most PDF editors choke on.

Free for personal use. Commercial license for business use (per-seat, like JetBrains).

Available for macOS, Windows, and Linux.

Download: https://pdfluent.com/download

---

## Launch Checklist
- [ ] Final build + code signing for all platforms
- [ ] Upload release artifacts to GitHub
- [ ] Update pdfluent.com/download with correct URLs
- [ ] Prepare Product Hunt listing (screenshots, logo, video)
- [ ] Draft HN post
- [ ] Schedule PH launch (Tuesday-Thursday, 00:01 PST)
- [ ] Post to HN on same day
- [ ] Monitor comments and respond quickly
- [ ] Have fix pipeline ready for any reported bugs
