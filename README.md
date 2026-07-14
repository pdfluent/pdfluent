# PDFluent

The privacy-first PDF editor. Your documents, your region, your choice.

PDFluent is a privacy-first desktop PDF editor built with [Tauri v2](https://tauri.app/) (Rust + React/TypeScript) and the XFA Rust SDK — a pure-Rust PDF engine (no Pdfium, Poppler, MuPDF or other C/C++ dependencies). It works offline, never phones home, and lets you choose where your files are stored.

## Status

Release-candidate for the non-XFA feature set on macOS and Windows: viewing, AcroForm filling (text, checkbox, radio, combo/list, comb), annotations, page management, merge/split, digital signatures, conversions, and OCR. XFA documents are viewed and can be converted/flattened to a standard PDF; dynamic XFA interactive fill is experimental and not part of this release.

## Architecture

```
pdfluent/
├── src/                    # React frontend (TypeScript)
│   ├── viewer/
│   │   ├── ViewerApp.tsx   # V3 app shell — state, modes, keyboard shortcuts
│   │   ├── components/     # Overlays (forms, annotations, text, links)
│   │   └── hooks/          # Document, forms, search, annotations, …
│   ├── platform/engine/    # Engine abstraction over the Tauri backend
│   ├── lib/tauri-api.ts    # Typed wrappers for Tauri commands
│   └── i18n/               # Localised UI strings
├── src-tauri/              # Rust backend
│   ├── src/
│   │   ├── lib.rs          # Tauri commands (open_pdf, render_page, …)
│   │   └── pdf_engine.rs   # Document model over the XFA Rust SDK
│   └── Cargo.toml          # Links the XFA SDK crates by path
└── package.json            # Node dependencies
```

The PDF engine is the XFA Rust SDK (separate workspace), consumed as Cargo path
dependencies: `pdf-engine` (parse, render via the `vello_cpu` rasteriser, text,
thumbnails), `pdf-forms` (AcroForm), `pdf-manip` (merge/split/rotate/encrypt/
watermark), `pdf-annot`, `pdf-sign`, `pdf-extract`, `pdf-redact`, plus
conversion crates. No native PDF library is downloaded or bundled.

### How it works

1. **Rust backend** parses PDFs with the XFA SDK and renders pages to bitmaps
2. **Frontend** calls Tauri commands (`open_pdf`, `render_page`, …) for rendered pages and the form/annotation models
3. **Overlays** draw interactive inputs (forms, annotations, links) over the rendered page
4. **Manipulation** (merge, split, rotate, sign, convert) runs in Rust via the SDK crates

### Tauri Commands (Rust → Frontend)

| Command | Input | Output |
|---------|-------|--------|
| `open_pdf` | `path: string` | `DocumentInfo { page_count, pages[] }` |
| `render_page` | `page_index: u16, scale?: f32` | `RenderedPage { index, width, height, data_base64 }` |
| `get_document_info` | — | `DocumentInfo` |
| `close_pdf` | — | `()` |
| `run_paddle_ocr` | `payload { image_base64, language, include_structure }` | `PaddleOcrResponse { words, text, structure_blocks }` |

## Development

### Prerequisites

- [Rust](https://rustup.rs/) (stable)
- [Node.js](https://nodejs.org/) 20+
- Platform-specific Tauri dependencies: see [Tauri prerequisites](https://v2.tauri.app/start/prerequisites/)

### Setup

```bash
# 1. Install Node dependencies
npm install

# 2. (Optional) Install PaddleOCR Python bridge dependencies for OCR + PP-Structure
./scripts/setup-ocr.sh

# 3. Start dev server
npm run tauri dev
```

The PDF engine is the XFA Rust SDK, linked via Cargo path dependencies (see
`src-tauri/Cargo.toml`); no native PDF library needs to be downloaded. The SDK
workspace must be checked out alongside this repo at the path those dependencies
expect.

### Build

```bash
npm run tauri build
```

### Type-checking

```bash
npm run typecheck    # TypeScript
cd src-tauri && cargo check  # Rust
```

### Compliance and third-party inventory

```bash
# Generate OCR model checksum manifest
npm run ocr:manifest

# Generate THIRD_PARTY.md + THIRD_PARTY_ATTRIBUTIONS.md + compliance-report.json
npm run compliance:generate

# Fail on blocked/unknown licenses in compliance-report.json
npm run compliance:check
```

CI also runs a dedicated compliance workflow at `.github/workflows/compliance.yml` and uploads generated artifacts.

## What's built

- [x] PDF viewing (open, render, navigate pages)
- [x] Zoom controls (Cmd +/-, reset)
- [x] Page thumbnails in sidebar
- [x] Keyboard navigation (arrows, PageUp/Down, Home/End)
- [x] Manipulation (merge, split, rotate, delete/reorder pages, compress, watermark)
- [x] Annotations (highlight, underline, strikeout, comment, shapes, freehand)
- [x] Form filling (AcroForms — text, checkbox, radio, combo/list, comb, multi-select, link trust)
- [x] Digital signatures (PAdES / PKCS#12)
- [x] Conversions (DOCX/XLSX/PPTX, PDF/A) and OCR
- [x] XFA: view + convert/flatten to standard PDF (interactive XFA fill is experimental, not shipped)
- [ ] Storage integration (BYOS, managed storage)

## License

PDFluent is proprietary software — **free to use, including for commercial and business use.** It is not open-source. Extracting or embedding its components outside the application requires a separate license — see [pdfluent.com](https://pdfluent.com) for SDK licensing.

See the full End-User License Agreement in [LICENSE.md](LICENSE.md) (summary in [LICENSE](LICENSE)) and [pdfluent.com/license](https://pdfluent.com/license); SDK licensing at [pdfluent.com](https://pdfluent.com).

Third-party open-source components bundled with PDFluent remain under their own licenses; see [THIRD_PARTY.md](THIRD_PARTY.md) and [THIRD_PARTY_ATTRIBUTIONS.md](THIRD_PARTY_ATTRIBUTIONS.md) (also surfaced in-app under **Help → Open Source Notices**).
