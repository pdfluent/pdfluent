# XFA SDK Migratie-analyse voor PDFluent

## Samenvatting

Dit document beschrijft hoe de huidige PDF-backend van PDFluent vervangen kan worden door de XFA Native Rust SDK. De frontend (React/TypeScript) blijft ongewijzigd. Alle PDF-operaties verhuizen van de huidige mix van Pdfium + LibPDF + PaddleOCR naar een uniforme Rust-stack op basis van de XFA SDK.

---

## 1. Huidige architectuur

PDFluent gebruikt momenteel drie losse backends:

| Component | Technologie | Taal | Doel |
|-----------|------------|------|------|
| **Rendering** | Pdfium (`pdfium-render` 0.8) | Rust (Tauri) | PDF → PNG via Tauri IPC |
| **Manipulatie** | LibPDF (`@libpdf/core` 0.2.10) | TypeScript (frontend) | Merge, split, rotate, sign, forms, annotaties, redactie, watermarks, compliance, tekst, etc. |
| **OCR** | PaddleOCR | Python (subprocess) | Tekst herkenning op gerenderde pagina's |
| **Storage** | Apache OpenDAL | Rust (Tauri) | Cloud/lokale opslag abstractie |

### Problemen met de huidige opzet

1. **LibPDF draait in de frontend** — alle PDF-manipulatie gebeurt in JavaScript, wat traag is voor grote bestanden en geheugen-intensief
2. **Drie verschillende technologieën** — Pdfium (C++), LibPDF (JS), PaddleOCR (Python) met elk eigen beperkingen
3. **Pdfium is een C-library** — vereist `unsafe` Send/Sync implementatie, platform-specifieke binaries (25+ MB), en kan crashen bij malformed PDFs
4. **Geen XFA-rendering** — Pdfium ondersteunt dit beperkt, LibPDF helemaal niet

---

## 2. XFA SDK: wat het biedt

De XFA SDK is een 38-crate Rust workspace met de volgende relevante modules:

| XFA Crate | Vervangt | Functionaliteit |
|-----------|----------|-----------------|
| `pdf-engine` | Pdfium | Document openen, rendering, tekst extractie, metadata |
| `pdf-render` | Pdfium | Pure Rust CPU rasterizer (vello_cpu) |
| `pdf-syntax` | Pdfium | Zero-copy PDF parsing |
| `pdf-manip` | LibPDF merge/split/rotate | Pagina-operaties, watermarks, headers, Bates, encryptie |
| `pdf-forms` | LibPDF forms | AcroForm parsing, field tree, flattening |
| `pdf-annot` | LibPDF annotations | Highlights, sticky notes, free text, shapes, ink |
| `pdf-sign` | LibPDF signatures | Signature validatie (PAdES, CMS/PKCS#7) |
| `pdf-extract` | LibPDF text/images | Tekst extractie met posities, image extractie |
| `pdf-redact` | LibPDF redaction | Permanente content verwijdering, patroon-gebaseerd |
| `pdf-compliance` | LibPDF validation | PDF/A, PDF/X, PDF/UA validatie |
| `pdf-ocr` | PaddleOCR | Pluggable OCR (Tesseract backend) |
| `pdf-xfa` | — (nieuw) | XFA form rendering en FormCalc |
| `pdf-docx` | LibPDF DOCX | PDF → Word conversie |

---

## 3. Feature-mapping: LibPDF → XFA SDK

Hieronder elke LibPDF-functie uit `pdf-manipulator.ts` en de XFA SDK equivalent:

### 3.1 Rendering & Document Info

| PDFluent functie | Huidig (Pdfium) | XFA SDK |
|------------------|-----------------|---------|
| `open_pdf` | `pdfium.load_pdf_from_file()` | `PdfDocument::open()` |
| `render_page` | `page.render_with_config()` → PNG | `PdfDocument::render_page()` → RGBA → PNG |
| `get_document_info` | `document.pages()`, `document.form()` | `PdfDocument::page_count()`, `PdfDocument::metadata()` |
| `close_pdf` | Drop Pdfium document | Drop PdfDocument |

### 3.2 Pagina-manipulatie

| LibPDF functie | XFA SDK | Crate |
|----------------|---------|-------|
| `mergePdfs()` | `pdf_manip::insert_pages()` | pdf-manip |
| `splitPdf()` / `extractPdfPages()` | `pdf_manip::extract_pages()` | pdf-manip |
| `rotatePage()` / `rotateAllPages()` | `pdf_manip::rotate_pages()` | pdf-manip |
| `removePage()` | `pdf_manip::delete_pages()` | pdf-manip |
| `reorderPdfPages()` | `pdf_manip::rearrange_pages()` | pdf-manip |
| `duplicatePdfPage()` | extract + insert | pdf-manip |
| `insertBlankPageAfter()` | handmatig page toevoegen via lopdf | pdf-manip |
| `replacePageWithExternalPage()` | delete + insert | pdf-manip |
| `cropPageToRect()` | `pdf_manip::crop_pages()` | pdf-manip |

### 3.3 Formulieren

| LibPDF functie | XFA SDK | Crate |
|----------------|---------|-------|
| `getFormFields()` | `pdf_forms::parse_acroform()` | pdf-forms |
| `fillFormFields()` | Form field value setting via lopdf | pdf-forms |
| `addFormFieldToDocument()` | Field creation via lopdf | pdf-forms |
| `removeFormFieldFromDocument()` | Field removal via lopdf | pdf-forms |

### 3.4 Annotaties

| LibPDF functie | XFA SDK | Crate |
|----------------|---------|-------|
| `addAnnotation("highlight")` | `pdf_annot::create_highlight()` | pdf-annot |
| `addAnnotation("comment")` | `pdf_annot::create_sticky_note()` | pdf-annot |
| `addAnnotation("free_text")` | `pdf_annot::create_free_text()` | pdf-annot |
| `addAnnotation("stamp")` | Stamp annotation creation | pdf-annot |
| `addAnnotation("pen")` | Ink annotation creation | pdf-annot |
| `addAnnotation("rectangle/circle/line/arrow")` | Geometric annotations | pdf-annot |
| `addAnnotation("underline/strikeout")` | Markup annotations | pdf-annot |

### 3.5 Handtekeningen

| LibPDF functie | XFA SDK | Status |
|----------------|---------|--------|
| `signPdfWithCertificate()` | **Niet beschikbaar** | XFA SDK kan alleen valideren, niet tekenen |
| `verifyPdfSignatures()` | `pdf_sign::validate_signatures()` | Volledig |

> **Let op:** Signature *creation* (PAdES signing met P12-certificaten) is de enige functionaliteit die de XFA SDK momenteel niet ondersteunt. Dit moet tijdelijk via LibPDF of een aparte library (bijv. `p12` + `cms` crates) blijven draaien, of als feature aan de XFA SDK worden toegevoegd.

### 3.6 Tekst

| LibPDF functie | XFA SDK | Crate |
|----------------|---------|-------|
| `extractDocumentText()` | `pdf_extract::extract_page_text()` | pdf-extract |
| `extractEditableTextLines()` | `pdf_extract::extract_positioned_chars()` | pdf-extract |
| `replaceTextLine()` | Content stream manipulatie | pdf-manip / handmatig |
| `replaceTextMatchesOnPage()` | `pdf_extract::search_text()` + content stream edit | pdf-extract + pdf-manip |

### 3.7 Afbeeldingen

| LibPDF functie | XFA SDK | Crate |
|----------------|---------|-------|
| `addImageToPage()` | Image XObject toevoegen via lopdf | pdf-manip |
| `replaceImageAreaOnPage()` | Content stream manipulatie | pdf-manip |
| `removeImageAreaFromPage()` | Content stream manipulatie | pdf-manip |
| `createPdfFromImages()` | Document opbouwen via lopdf | pdf-manip |

### 3.8 Redactie

| LibPDF functie | XFA SDK | Crate |
|----------------|---------|-------|
| `redactPageRegions()` | `pdf_redact::redact()` | pdf-redact |
| Pattern-based redaction | `pdf_redact::search_and_redact()` | pdf-redact |

### 3.9 Watermarks, Headers, Footers

| LibPDF functie | XFA SDK | Crate |
|----------------|---------|-------|
| `addWatermarkToDocument()` | `pdf_manip::add_watermark()` | pdf-manip |
| `addHeaderFooterToDocument()` | `pdf_manip::add_header()` / `add_footer()` / `add_bates()` | pdf-manip |

### 3.10 Compliance & Optimalisatie

| LibPDF functie | XFA SDK | Crate |
|----------------|---------|-------|
| `validatePdfAReadiness()` | `pdf_compliance::validate_pdfa()` | pdf-compliance |
| `validatePdfXReadiness()` | `pdf_compliance::validate_pdfx()` | pdf-compliance |
| `validatePdfUaReadiness()` | `pdf_compliance::validate_pdfua()` | pdf-compliance |
| `generatePdfAReadyCopy()` | Validatie + correctie | pdf-compliance |
| `optimizePdfDocument()` | Stream compressie, font subsetting | pdf-manip |
| `protectPdfWithPassword()` | `pdf_manip::encrypt_pdf()` | pdf-manip |

### 3.11 Vergelijken

| LibPDF functie | XFA SDK | Crate |
|----------------|---------|-------|
| `comparePdfDocuments()` | `pdf-diff` (SSIM-based) | pdf-diff |

### 3.12 OCR

| LibPDF functie | XFA SDK | Status |
|----------------|---------|--------|
| `addOcrTextLayerToPage()` | `pdf_ocr::make_searchable()` | Beschikbaar (Tesseract) |
| PaddleOCR preprocessing | **Niet beschikbaar** | PaddleOCR biedt betere preprocessing |

> **Let op:** PaddleOCR biedt momenteel superieure OCR-kwaliteit en documentstructuur-analyse (PP-Structure). De XFA SDK heeft alleen Tesseract. Overweeg PaddleOCR als secundaire optie te behouden of een PaddleOCR-adapter voor de `OcrEngine` trait te schrijven.

---

## 4. Migratiestrategie

### Fase 0: Voorbereiding

**XFA SDK als lokale Cargo dependency toevoegen:**

```toml
# src-tauri/Cargo.toml
[dependencies]
# Bestaand (te verwijderen na migratie)
pdfium-render = "0.8"

# Nieuw: XFA SDK crates (pad relatief naar XFA repo)
pdf-engine = { path = "../../XFA/crates/pdf-engine" }
pdf-manip = { path = "../../XFA/crates/pdf-manip" }
pdf-forms = { path = "../../XFA/crates/pdf-forms" }
pdf-annot = { path = "../../XFA/crates/pdf-annot" }
pdf-sign = { path = "../../XFA/crates/pdf-sign" }
pdf-extract = { path = "../../XFA/crates/pdf-extract" }
pdf-redact = { path = "../../XFA/crates/pdf-redact" }
pdf-compliance = { path = "../../XFA/crates/pdf-compliance" }
pdf-ocr = { path = "../../XFA/crates/pdf-ocr" }
```

**Abstractielaag introduceren:**

Een `PdfBackend` trait in Rust die alle operaties definieert. Twee implementaties: `PdfiumBackend` (huidige) en `XfaBackend` (nieuw). Dit maakt het mogelijk om per functie te switchen en terug te vallen op Pdfium wanneer de XFA SDK nog niet goed genoeg werkt.

### Fase 1: Rendering vervangen (laagste risico)

**Wat:** Pdfium rendering → XFA `pdf-engine` rendering

**Waarom eerst:** Dit is de meest geïsoleerde operatie. De frontend stuurt een page index + scale en verwacht PNG base64 terug. De implementatie erachter maakt niet uit.

**Aanpak:**
1. Nieuwe `xfa_engine.rs` module aanmaken naast `pdf_engine.rs`
2. Zelfde `DocumentInfo` en `RenderedPage` structs gebruiken
3. Feature flag (`--features xfa-backend`) om te kiezen welke engine actief is
4. Testen met bestaande PDF's, visueel vergelijken met Pdfium output

**Verwachte impact:** Pdfium (25+ MB precompiled C-library) kan verwijderd worden. Pure Rust, geen platform-specifieke binaries meer nodig.

```rust
// src-tauri/src/xfa_engine.rs (nieuw)
use pdf_engine::PdfDocument;

pub struct XfaEngine;

impl XfaEngine {
    pub fn init() -> Result<Self, String> {
        Ok(Self)
    }

    pub fn get_document_info(&self, path: &str) -> Result<DocumentInfo, String> {
        let doc = PdfDocument::open(path)
            .map_err(|e| format!("Failed to open PDF: {e}"))?;
        // ... map naar DocumentInfo
    }

    pub fn render_page(&self, path: &str, page_index: u16, scale: f32) -> Result<RenderedPage, String> {
        let doc = PdfDocument::open(path)
            .map_err(|e| format!("Failed to open PDF: {e}"))?;
        let options = RenderOptions { dpi: (72.0 * scale as f64), ..Default::default() };
        let rendered = doc.render_page(page_index as usize, &options)
            .map_err(|e| format!("Failed to render: {e}"))?;
        // RGBA → PNG → base64
    }
}
```

### Fase 2: PDF-manipulatie naar Rust verplaatsen

**Wat:** LibPDF TypeScript-functies → Rust Tauri commands met XFA SDK

**Waarom:** Dit is de grootste winst. Alle PDF-operaties verhuizen van JavaScript (traag, hoog geheugenverbruik) naar native Rust (snel, efficiënt).

**Aanpak:** Per functiegroep nieuwe Tauri commands toevoegen.

**Stap 2a — Pagina-operaties:**
```rust
#[tauri::command]
fn merge_pdfs(paths: Vec<String>, output: String) -> Result<(), String> { ... }

#[tauri::command]
fn split_pdf(path: String, ranges: Vec<(u32, u32)>, output: String) -> Result<(), String> { ... }

#[tauri::command]
fn rotate_pages(path: String, pages: Vec<u32>, degrees: i32, output: String) -> Result<(), String> { ... }

#[tauri::command]
fn reorder_pages(path: String, order: Vec<u32>, output: String) -> Result<(), String> { ... }
```

**Stap 2b — Formulieren:**
```rust
#[tauri::command]
fn get_form_fields(path: String) -> Result<Vec<FormField>, String> { ... }

#[tauri::command]
fn fill_form(path: String, values: HashMap<String, String>, output: String) -> Result<(), String> { ... }
```

**Stap 2c — Annotaties:**
```rust
#[tauri::command]
fn add_annotation(path: String, annotation: AnnotationPayload, output: String) -> Result<(), String> { ... }

#[tauri::command]
fn get_annotations(path: String, page: u32) -> Result<Vec<Annotation>, String> { ... }
```

**Stap 2d — Tekst & Content:**
```rust
#[tauri::command]
fn extract_text(path: String, page: u32) -> Result<String, String> { ... }

#[tauri::command]
fn search_text(path: String, query: String) -> Result<Vec<SearchResult>, String> { ... }
```

**Stap 2e — Redactie, Watermarks, Compliance:**
```rust
#[tauri::command]
fn redact_regions(path: String, regions: Vec<RedactionArea>, output: String) -> Result<(), String> { ... }

#[tauri::command]
fn add_watermark(path: String, options: WatermarkOptions, output: String) -> Result<(), String> { ... }

#[tauri::command]
fn validate_pdfa(path: String) -> Result<ComplianceReport, String> { ... }
```

### Fase 3: Frontend TypeScript aanpassen

**Wat:** `pdf-manipulator.ts` omschrijven van directe LibPDF-aanroepen naar Tauri IPC commands.

**Voorbeeld — voor (LibPDF):**
```typescript
export async function mergePdfs(pdfBuffers: Uint8Array[]): Promise<Uint8Array> {
  const doc = await PDF.create();
  for (const buf of pdfBuffers) {
    const src = await PDF.load(buf);
    const pages = await doc.copyPages(src, src.getPageIndices());
    pages.forEach(p => doc.addPage(p));
  }
  return doc.save();
}
```

**Voorbeeld — na (Tauri IPC → XFA SDK):**
```typescript
export async function mergePdfs(paths: string[], outputPath: string): Promise<void> {
  return invoke("merge_pdfs", { paths, output: outputPath });
}
```

**Belangrijk:** De functie-signatures in `tauri-api.ts` blijven zo veel mogelijk hetzelfde. De frontend-componenten hoeven niet te weten of de operatie in JS of Rust wordt uitgevoerd.

### Fase 4: LibPDF verwijderen & opschonen

Na succesvolle migratie van alle functies:

1. `@libpdf/core` uit `package.json` verwijderen
2. `pdfium-render` uit `Cargo.toml` verwijderen
3. `src-tauri/lib/` directory verwijderen (Pdfium binaries, ~25 MB)
4. `pdf_engine.rs` verwijderen (Pdfium wrapper)
5. `pdf-manipulator.ts` opschonen (alleen Tauri IPC wrappers)

---

## 5. Aandachtspunten

### 5.1 Signature creation

De XFA SDK kan handtekeningen **valideren** maar niet **aanmaken**. Opties:
- **Optie A:** Feature toevoegen aan de XFA SDK (PAdES signing met `p12`, `cms`, `x509-cert` crates)
- **Optie B:** LibPDF's `P12Signer` tijdelijk behouden voor alleen deze functie
- **Optie C:** Aparte Rust crate voor signing (bijv. `pdf-sign-create`)

Aanbeveling: **Optie A** — signing toevoegen aan de XFA SDK is de schoonste oplossing.

### 5.2 OCR

PaddleOCR biedt momenteel betere kwaliteit dan Tesseract, vooral voor:
- Multi-taal (nl, de, fr, it, es, pt)
- Documentstructuur-analyse (PP-Structure)
- Preprocessing (deskew, denoise, contrast)

Opties:
- **Optie A:** PaddleOCR Python subprocess behouden (werkt, bewezen)
- **Optie B:** PaddleOCR-adapter schrijven voor de `OcrEngine` trait in `pdf-ocr`
- **Optie C:** Tesseract gebruiken via XFA SDK, PaddleOCR als optioneel

Aanbeveling: **Optie A** op korte termijn (PaddleOCR behouden), **Optie B** op langere termijn.

### 5.3 Rendering kwaliteit

De XFA SDK's pure Rust renderer is getest op 449K+ PDFs zonder crashes, maar de rendering kwaliteit kan op sommige documenten afwijken van Pdfium (vooral bij complexe transparantie, DeviceN kleuren, exotische fonts). Daarom:
- Feature flag om terug te schakelen naar Pdfium tijdens de overgangsperiode
- Visuele regressietests opzetten (render 100 referentie-PDF's, vergelijk output)

### 5.4 XFA Forms — bonus

De XFA SDK kan XFA-formulieren renderen (FormCalc, dynamische reflow), wat Pdfium niet kan. Dit is een upgrade in functionaliteit: `xfa_rendering_supported` kan op `true` gezet worden.

### 5.5 Bestandsgrootte

- **Huidige situatie:** Pdfium binary ~25 MB + app
- **Na migratie:** Pure Rust, alles statisch gelinkt → verwacht ~5-10 MB totaal
- Dit is een significante verbetering voor distributie

---

## 6. Tijdlijn & prioritering

| Fase | Scope | Afhankelijkheden |
|------|-------|------------------|
| **Fase 0** | Cargo dependencies + abstractielaag | Geen |
| **Fase 1** | Rendering (Pdfium → XFA) | Fase 0 |
| **Fase 2a** | Pagina-operaties (merge, split, rotate) | Fase 0 |
| **Fase 2b** | Formulieren | Fase 0 |
| **Fase 2c** | Annotaties | Fase 0 |
| **Fase 2d** | Tekst extractie & zoeken | Fase 0 |
| **Fase 2e** | Redactie, watermarks, compliance | Fase 0 |
| **Fase 3** | Frontend TypeScript aanpassen | Fase 2 |
| **Fase 4** | Cleanup: LibPDF + Pdfium verwijderen | Fase 1-3 |

Fases 1 en 2a-2e zijn **onafhankelijk** van elkaar en kunnen parallel uitgevoerd worden. Fase 3 is een doorlopend proces: elke keer dat een Rust command klaar is, kan de bijbehorende TypeScript-functie aangepast worden.

---

## 7. Risico's & mitigatie

| Risico | Impact | Mitigatie |
|--------|--------|----------|
| XFA SDK rendering wijkt af van Pdfium | Visuele verschillen voor gebruikers | Feature flag + visuele regressietests |
| XFA SDK bugs in manipulatie | Corrupte PDF-output | Uitgebreide tests met productie-PDF's |
| Geen signature creation | Feature verlies | LibPDF signing tijdelijk behouden |
| Build-complexiteit neemt toe (38 crates) | Langere compile times | Release builds cachen, incremental compilation |
| OCR kwaliteitsverlies bij switch naar Tesseract | Slechtere tekstherkenning | PaddleOCR subprocess behouden |

---

## 8. Conclusie

De migratie naar de XFA SDK is haalbaar en levert significante voordelen op:

1. **Eén uniforme Rust-stack** in plaats van drie losse technologieën
2. **Betere performance** — PDF-manipulatie verhuist van JS naar native Rust
3. **Kleinere binary** — geen 25 MB Pdfium C-library meer nodig
4. **XFA-support** — formulieren die Pdfium niet kan renderen
5. **Crash-resistent** — getest op 449K+ PDFs, geen crashes
6. **Eenvoudig upgradbaar** — als de XFA SDK verbetert, profiteert PDFluent automatisch

De aanpak met feature flags en een abstractielaag zorgt ervoor dat we stapsgewijs kunnen migreren zonder bestaande functionaliteit te breken. Elke fase is onafhankelijk testbaar en terugdraaibaar.
