# Binding Parity Matrix

**Version:** 1.0.0-beta.5  
**Last updated:** 2026-05-14  
**Scope:** Cross-language API surface coverage for the PDFluent SDK.

This document tracks which capabilities are exposed in each language binding.
The Rust `pdfluent` crate is the canonical source of truth; all other bindings
are derived from it.

## Legend

| Symbol | Meaning |
|--------|---------|
| ✅ | Fully implemented |
| 🟡 | Partially implemented (subset or different API shape) |
| ❌ | Not implemented |
| N/A | Not applicable for this target (e.g. filesystem ops in WASM) |
| — | Not planned for this binding |

## Core Document Operations

| Capability | Rust (`pdfluent`) | WASM (`xfa-wasm`) | C API | Java (JNI) | Python (PyO3) | Node.js (napi-rs) |
|------------|:---:|:---:|:---:|:---:|:---:|:---:|
| Open from bytes | ✅ | ✅ `PdfDoc.open()` | ✅ | ✅ | ✅ | ✅ |
| Open from path | ✅ | ❌ | ✅ | ❌ | ✅ | ✅ |
| Open with password | ✅ | ❌ | ✅ | ✅ | ✅ | ✅ |
| Close / free | ✅ `Drop` | ✅ `free()` | ✅ | ✅ | ✅ `__exit__` | ✅ |
| Page count | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Save to path | ✅ | ❌ | ❌ | ✅ | ✅ | ✅ |
| Save to bytes | ✅ | N/A | N/A | N/A | N/A | N/A |

## Page Geometry

| Capability | Rust | WASM | C API | Java | Python | Node.js |
|------------|:---:|:---:|:---:|:---:|:---:|:---:|
| Page width | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Page height | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Page rotation | ✅ | ❌ | ✅ | ✅ | ✅ | ✅ |
| Media box | ✅ | ❌ | ✅ | ❌ | ❌ | ❌ |
| Crop box | ✅ | ❌ | ✅ | ❌ | ❌ | ❌ |

## Rendering

| Capability | Rust | WASM | C API | Java | Python | Node.js |
|------------|:---:|:---:|:---:|:---:|:---:|:---:|
| Render page to RGBA | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Render thumbnail | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Render to canvas (browser) | ❌ | ✅ | N/A | N/A | N/A | N/A |
| Render to canvas vector | ❌ | ✅ | N/A | N/A | N/A | N/A |
| Render all pages | ✅ | ❌ | ❌ | ❌ | ✅ | ✅ |
| Custom DPI / background | ✅ | 🟡 (DPI only) | 🟡 (DPI only) | 🟡 (DPI only) | ✅ | ✅ |
| Force output size | ✅ | ❌ | ❌ | ❌ | ✅ | ✅ |

## Text Extraction

| Capability | Rust | WASM | C API | Java | Python | Node.js |
|------------|:---:|:---:|:---:|:---:|:---:|:---:|
| Extract page text | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Text positions (x, y, size) | ✅ | ✅ `getTextPositions` | ❌ | ❌ | ✅ `extract_text_blocks` | ✅ |
| Structured text blocks | ✅ | ❌ | ❌ | ❌ | ✅ | ✅ |
| Search text across pages | ✅ | ❌ | ❌ | ✅ | ✅ | ✅ |

## Metadata

| Capability | Rust | WASM | C API | Java | Python | Node.js |
|------------|:---:|:---:|:---:|:---:|:---:|:---:|
| Read metadata | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Write metadata | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Bookmarks / outline | ✅ | ❌ | 🟡 (count only) | ✅ | ✅ | ✅ |

## Annotations

| Capability | Rust | WASM | C API | Java | Python | Node.js |
|------------|:---:|:---:|:---:|:---:|:---:|:---:|
| Get annotations on page | ✅ | ✅ | 🟡 (count + type) | ✅ | ✅ | ✅ |
| Add highlight | ✅ | ✅ (static) | ✅ | ✅ | ✅ | ✅ |
| Add free text | ✅ | ✅ (static) | ❌ | ✅ | ✅ | ✅ |
| Add sticky note | ✅ | ✅ (static) | ❌ | ❌ | ❌ | ❌ |

## Form Fields (AcroForm)

| Capability | Rust | WASM | C API | Java | Python | Node.js |
|------------|:---:|:---:|:---:|:---:|:---:|:---:|
| Get form fields | ✅ | ❌ | 🟡 (count + name) | ✅ | ✅ | ✅ |
| Set form field value | ✅ | ❌ | ❌ | ✅ | ✅ | ✅ |

## XFA Forms

| Capability | Rust | WASM | C API | Java | Python | Node.js |
|------------|:---:|:---:|:---:|:---:|:---:|:---:|
| XFA parse / flatten | ✅ | ✅ `flattenXfa()` | ❌ | ❌ | ❌ | ❌ |
| Export XFA field values | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Import XFA field values | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |
| XFA JSON engine | ❌ | ✅ `XfaEngine` | ❌ | ❌ | ❌ | ❌ |
| Run FormCalc | ❌ | ✅ `runCalculations` | ❌ | ❌ | ❌ | ❌ |

## Document Manipulation

| Capability | Rust | WASM | C API | Java | Python | Node.js |
|------------|:---:|:---:|:---:|:---:|:---:|:---:|
| Merge documents | ✅ | ✅ | ✅ | ❌ | ❌ | ✅ |
| Rotate page | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Remove page | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Compress / optimize | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Insert image | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Add watermark | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |

## PDF/A Compliance

| Capability | Rust | WASM | C API | Java | Python | Node.js |
|------------|:---:|:---:|:---:|:---:|:---:|:---:|
| Validate PDF/A | ✅ | ✅ | ✅ | ❌ | ❌ | ✅ |
| Convert to PDF/A | ✅ | ✅ | ✅ | ❌ | ❌ | ✅ |

## Digital Signatures

| Capability | Rust | WASM | C API | Java | Python | Node.js |
|------------|:---:|:---:|:---:|:---:|:---:|:---:|
| Detect signatures | ✅ | ✅ | ❌ | ❌ | ❌ | ✅ |
| Verify signatures | ✅ | ✅ | ❌ | ❌ | ❌ | ✅ |
| Sign (PKCS#12) | ✅ | ❌ | ✅ | ❌ | ❌ | ✅ |

## Redaction

| Capability | Rust | WASM | C API | Java | Python | Node.js |
|------------|:---:|:---:|:---:|:---:|:---:|:---:|
| Search & redact text | ✅ | ❌ | ✅ | ✅ | ✅ | ✅ |

## Encryption

| Capability | Rust | WASM | C API | Java | Python | Node.js |
|------------|:---:|:---:|:---:|:---:|:---:|:---:|
| Encrypt (password) | ✅ | ❌ | ❌ | ✅ | ✅ | ✅ |
| Decrypt / strip encryption | ✅ | ❌ | ❌ | ✅ | ✅ | ✅ |

## Conversions (native-only)

| Capability | Rust | WASM | C API | Java | Python | Node.js |
|------------|:---:|:---:|:---:|:---:|:---:|:---:|
| Export to DOCX | ✅ | N/A | ❌ | ❌ | ❌ | ❌ |
| Export to XLSX | ✅ | N/A | ❌ | ❌ | ❌ | ❌ |
| Export to PPTX | ✅ | N/A | ❌ | ❌ | ❌ | ❌ |
| Export to images (PNG/JPEG) | ✅ | N/A | ❌ | ❌ | ❌ | ❌ |

## E-Invoicing

| Capability | Rust | WASM | C API | Java | Python | Node.js |
|------------|:---:|:---:|:---:|:---:|:---:|:---:|
| Parse / validate e-invoice | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |

## Licensing

| Capability | Rust | WASM | C API | Java | Python | Node.js |
|------------|:---:|:---:|:---:|:---:|:---:|:---:|
| Runtime license validation | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Tier / feature gating | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Watermarking (trial) | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |

## Summary by Binding

| Binding | Maturity | Status | Primary Use Case |
|---------|----------|--------|------------------|
| **Rust (`pdfluent`)** | Production | ✅ Complete | Desktop apps, servers, embedded systems |
| **WASM (`xfa-wasm`)** | Production | ✅ Browser-ready | In-browser PDF viewer, XFA forms, web apps |
| **C API (`pdf-capi`)** | Beta | 🟡 Subset | FFI into C/C++, Go, Swift, etc. |
| **Java (`pdf-java`)** | Beta | 🟡 Subset | Android, enterprise Java backends |
| **Python (`pdf-python`)** | Alpha | 🟡 Subset | Data science, automation, scripting |
| **Node.js (`pdf-node`)** | Alpha | 🟡 Subset | Server-side PDF processing in JS/TS |

## Known Gaps & Roadmap

1. **WASM licensing**: The WASM binding does not enforce runtime license validation.
   The browser distribution relies on the frontend app for license gating.
   Tracked as a distribution-blocker.

2. **C API completeness**: Missing form field value setting, annotation free-text/sticky-note
   additions, signature verification, and encryption. These are planned for C API v0.2.

3. **Java completeness**: Missing save-to-bytes, PDF/A validation/conversion, signature
   support, and bookmark reading. Planned for JNI Round 3.

4. **Python / Node.js**: Both bindings lag behind the Rust SDK. They expose the most
   commonly used subset (open, render, text, forms, annotations, redact, encrypt).
   Full parity is not a near-term goal; feature requests drive prioritization.

5. **FormCalc / XFA engine**: Only exposed in WASM. The Rust SDK has underlying XFA
   support but no high-level `PdfDocument` wrapper for it yet.
