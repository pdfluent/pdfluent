<!--
Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
See https://pdfluent.com/license for terms.
-->

# Export compliance answers

App Store Connect asks this once per build, unless the answer is baked into
`Info.plist`. **The key is deliberately not in `Info.plist`.** Writing
`ITSAppUsesNonExemptEncryption` into the build is a legal self-classification made
by whoever commits it; this is the owner's call, so the question is answered per
upload until the owner says otherwise.

## What the app actually does with cryptography

| Use | Where | Algorithms |
|---|---|---|
| Digital signatures (PAdES / CMS, PKCS#12 keys, optional TSA) | `pdf-sign` in the engine | RSA, ECDSA, SHA-2 — standard, via common libraries |
| PDF encryption and decryption (open and save password-protected PDFs) | `pdf-manip` in the engine | RC4 and AES as specified by ISO 32000 |
| HTTPS for the optional update check and optional opt-in diagnostics | system networking | TLS provided by macOS |

No proprietary or novel cryptography. No cryptography is used for anything other
than the document features above and ordinary transport security. There is no
licence verification at runtime, so nothing cryptographic guards a paid feature.

## The answers to give

1. **"Does your app use encryption?"** → **Yes.** (Answering "No" would be wrong:
   the app encrypts and decrypts PDFs and produces digital signatures.)
2. **"Does your app qualify for any of the exemptions provided in Category 5,
   Part 2?"** → **Yes**, on the ground that the app uses only standard published
   encryption algorithms through standard libraries, is mass market, and is
   available free to the general public. This is the same self-classification the
   Microsoft Store submission used (`store/listing/privacy-compliance.md`).
3. **"Does your app implement any encryption algorithms that are proprietary or
   not accepted as standards by international standard bodies?"** → **No.**
4. **France declaration** → not applicable to a mass-market exemption.

**[OWNER]** Confirm points 2 and 3 once. Then, if you want the question to stop
appearing on every upload, say so and the key goes into `tauri.mas.conf.json` in
the same shape as the answer above.
