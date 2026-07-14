# Architecture

How the PDFluent editor is put together, for anyone reading or contributing to the code.

## Layout

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
│   │   └── pdf_engine.rs   # Document model over the PDFluent SDK
│   └── Cargo.toml          # Links the SDK crates by path
└── package.json            # Node dependencies
```

The PDF engine is the [PDFluent SDK](https://pdfluent.com) (separate workspace,
licensed separately), consumed as Cargo path dependencies: `pdf-engine` (parse,
render via the `vello_cpu` rasterizer, text, thumbnails), `pdf-forms`
(AcroForm), `pdf-manip` (merge/split/rotate/encrypt/watermark), `pdf-annot`,
`pdf-sign`, `pdf-extract`, `pdf-redact`, plus conversion crates. No native PDF
library is downloaded or bundled. The whole stack is Rust.

## How it works

1. The Rust backend parses PDFs with the SDK and renders pages to bitmaps.
2. The frontend calls Tauri commands (`open_pdf`, `render_page`, ...) for
   rendered pages and the form/annotation models.
3. Overlays draw interactive inputs (forms, annotations, links) over the
   rendered page.
4. Manipulation (merge, split, rotate, sign, convert) runs in Rust via the SDK
   crates.

## Tauri commands (Rust to frontend)

| Command | Input | Output |
|---------|-------|--------|
| `open_pdf` | `path: string` | `DocumentInfo { page_count, pages[] }` |
| `render_page` | `page_index: u16, scale?: f32` | `RenderedPage { index, width, height, data_base64 }` |
| `get_document_info` | — | `DocumentInfo` |
| `close_pdf` | — | `()` |
| `run_paddle_ocr` | `payload { image_base64, language, include_structure }` | `PaddleOcrResponse { words, text, structure_blocks }` |

This is a small sample of the command surface. See `src-tauri/src/lib.rs` for
the full `generate_handler!` list.

## Building from source

The SDK workspace isn't in this repository (it's licensed separately), so this
repo doesn't build standalone. If you have access to the SDK workspace,
check it out alongside this repo at the path `src-tauri/Cargo.toml` expects,
then follow the setup steps in [CONTRIBUTING.md](../CONTRIBUTING.md).

## Compliance and third-party inventory

```bash
# Generate OCR model checksum manifest
npm run ocr:manifest

# Generate THIRD_PARTY.md + THIRD_PARTY_ATTRIBUTIONS.md + compliance-report.json
npm run compliance:generate

# Fail on blocked/unknown licenses in compliance-report.json
npm run compliance:check
```

CI also runs a dedicated compliance workflow at `.github/workflows/compliance.yml`
and uploads the generated artifacts.
