# PDFluent

The open-source PDF editor. Your documents, your region, your choice.

PDFluent is a privacy-first desktop PDF editor built with [Tauri v2](https://tauri.app/) (Rust + React), [Pdfium](https://pdfium.googlesource.com/pdfium/) (rendering) and [LibPDF](https://libpdf.documenso.com/) (manipulation). It works offline, never phones home, and lets you choose where your files are stored.

## Status

Early development. Core PDF viewing works (open, navigate, zoom, thumbnails). Not yet ready for end-user use.

## Architecture

```
pdfluent/
├── src/                    # React frontend (TypeScript)
│   ├── App.tsx             # Main app - state management, keyboard shortcuts
│   ├── components/
│   │   ├── Viewer.tsx      # PDF page rendering (base64 PNG from Rust)
│   │   ├── Sidebar.tsx     # Page thumbnails with progressive loading
│   │   └── Toolbar.tsx     # Page navigation + zoom controls
│   ├── lib/
│   │   ├── tauri-api.ts    # Typed wrappers for Tauri commands
│   │   └── pdf-manipulator.ts  # LibPDF wrappers (merge, split, rotate)
│   └── styles/
│       └── global.css      # Full dark theme UI
├── src-tauri/              # Rust backend
│   ├── src/
│   │   ├── main.rs         # Entry point
│   │   ├── lib.rs          # Tauri commands (open_pdf, render_page, etc.)
│   │   └── pdf_engine.rs   # Pdfium rendering engine
│   ├── lib/                # Pdfium native library (not in git)
│   └── Cargo.toml          # Rust dependencies
├── scripts/
│   └── setup-pdfium.sh     # Downloads platform-specific Pdfium binary
└── package.json            # Node dependencies
```

### How it works

1. **Rust backend** loads PDFs via Pdfium, renders pages to PNG bitmaps, encodes as base64
2. **Frontend** calls Tauri commands (`open_pdf`, `render_page`) to get rendered pages
3. **Viewer** displays pages as `<img>` tags from base64 data
4. **LibPDF** (TypeScript) handles document manipulation (merge, split, rotate)

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

# 2. Download Pdfium native library (REQUIRED before first run)
./scripts/setup-pdfium.sh

# 3. (Optional) Install PaddleOCR Python bridge dependencies for OCR + PP-Structure
./scripts/setup-ocr.sh

# 4. Start dev server
npm run tauri dev
```

The Pdfium setup script automatically detects your platform (macOS ARM64/x64, Linux x64/ARM64, Windows x64/ARM64) and downloads the correct binary to `src-tauri/lib/`.

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
- [x] LibPDF integration (merge, split, rotate, remove pages)
- [ ] Annotations (highlight, comment, freehand)
- [ ] Form filling (AcroForms)
- [ ] Digital signatures
- [ ] Page management UI (drag to reorder)
- [ ] Storage integration (BYOS, managed storage)

## License

AGPL-3.0-or-later. See [LICENSE](LICENSE) for details.

Commercial licenses available for businesses. See [pdfluent.com](https://pdfluent.com) for pricing.
