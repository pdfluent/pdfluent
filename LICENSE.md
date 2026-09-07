# PDFluent End-User License Agreement (EULA)

**Effective date:** July 11, 2026
**Version:** 2.0 — applies to PDFluent application versions 1.0 and later.

Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.

---

## 1. Definitions

- **"Application"** means the PDFluent desktop application as distributed by Innovation Trigger B.V., including all updates, patches, and accompanying documentation.
- **"Components"** means the software embedded within the Application, including the PDF processing engine, libraries, and bundled resources, whether or not separately identifiable.

## 2. Grant of License

Innovation Trigger B.V. grants you a non-exclusive, non-transferable, revocable license to install and use the Application, free of charge, for any lawful purpose, including commercial and business use. No license key or payment is required.

## 3. Restrictions

You may **not**:

- Reverse engineer, decompile, disassemble, or attempt to derive the source code of the Application or its Components, except to the extent expressly permitted by applicable law.
- Redistribute, sublicense, rent, lease, lend, or otherwise transfer the Application to any third party other than by directing them to obtain their own copy from Innovation Trigger B.V.
- Extract, copy, or reuse any Component of the Application — including the embedded PDF engine — for use outside the Application, or link against, embed, or invoke the Application or its Components from other software.
- Offer the Application's functionality to third parties as a service (hosted, bureau, or API), or operate the Application by automated means as a document-processing backend. For programmatic PDF processing, license the PDFluent SDK.
- Remove, alter, or obscure any proprietary notices, labels, or marks on the Application.
- Use the Application to develop a competing product or service.

Nothing in this section restricts your ordinary use of the Application to open, edit, convert, sign, or otherwise process your own documents, including at scale and in a business context, provided you do so through the Application's own user interface rather than by automation or by extracting its Components.

## 4. Data Privacy

PDFluent is designed as a local-first application. **All PDF processing happens entirely on your device.** The Application does not transmit, upload, or share your documents or their contents with any server, cloud service, or third party. No account is required, and every document feature works with no internet connection at all.

The Application makes three kinds of outbound request. None of them carries any part of a document you open:

- **Update check.** The Application asks pdfluent.com whether a newer version exists. It does this shortly after start, and again whenever you choose "Check for updates". The check at start can be disabled in Settings; with it off, the Application never checks on its own, and "Check for updates" still works whenever you ask for it. If the request fails, the Application carries on as normal.
- **Crash and feedback reports.** Off by default. If you turn reporting on in Settings, the Application may send a report to report.pdfluent.com containing the application version, your operating system and its version, your interface language, the text you wrote, and — for a crash — a stack trace with file paths and other identifying detail stripped out. While reporting is off, nothing is sent.
- **Opening a link.** When you click a link in the Application, it hands the address to your own browser. The Application does not fetch the page itself.

## 5. Intellectual Property

The Application, its Components, and all associated intellectual property rights are and remain the exclusive property of Innovation Trigger B.V. This license does not grant you any ownership interest in the Application.

## 6. No Warranty

THE APPLICATION IS PROVIDED "AS IS" WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE, AND NON-INFRINGEMENT. INNOVATION TRIGGER B.V. DOES NOT WARRANT THAT THE APPLICATION WILL BE UNINTERRUPTED, ERROR-FREE, OR FREE OF HARMFUL COMPONENTS.

## 7. Limitation of Liability

TO THE MAXIMUM EXTENT PERMITTED BY APPLICABLE LAW, IN NO EVENT SHALL INNOVATION TRIGGER B.V. BE LIABLE FOR ANY INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL, OR PUNITIVE DAMAGES, OR ANY LOSS OF PROFITS, DATA, OR BUSINESS OPPORTUNITIES, ARISING OUT OF OR IN CONNECTION WITH THE USE OR INABILITY TO USE THE APPLICATION, REGARDLESS OF THE THEORY OF LIABILITY.

INNOVATION TRIGGER B.V.'S TOTAL AGGREGATE LIABILITY SHALL NOT EXCEED ONE HUNDRED EUROS (€100).

## 8. Termination

### 8.1 By You

You may terminate this license at any time by uninstalling the Application and destroying all copies in your possession.

### 8.2 By Innovation Trigger B.V.

Innovation Trigger B.V. may terminate this license immediately if you breach any term of this Agreement. Upon termination, you must cease all use of the Application and destroy all copies.

### 8.3 Effect of Termination

Sections 3, 4, 5, 6, 7, and 10 survive termination of this Agreement.

## 9. Updates

Innovation Trigger B.V. may release updates to the Application at its discretion. This Agreement applies to all versions you install unless a newer version is accompanied by its own license terms.

## 10. Governing Law and Jurisdiction

This Agreement is governed by and construed in accordance with the laws of the Netherlands, without regard to its conflict of law provisions. Any disputes arising from or relating to this Agreement shall be submitted to the exclusive jurisdiction of the competent courts in Amsterdam, the Netherlands.

## 11. Entire Agreement

This Agreement constitutes the entire agreement between you and Innovation Trigger B.V. regarding the Application and supersedes all prior agreements, understandings, and communications. Innovation Trigger B.V. reserves the right to modify this Agreement; continued use of the Application after notification of changes constitutes acceptance.

---

For licensing inquiries, including SDK licensing for programmatic or embedded PDF processing: [license@pdfluent.com](mailto:license@pdfluent.com)
For general information: [https://pdfluent.com](https://pdfluent.com)
