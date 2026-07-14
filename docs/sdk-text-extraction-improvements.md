# Rust SDK Text Extraction — Gap Analysis & Verbeteringen

**Document**: SDK-gerichte analyse van text extraction capabilities  
**Aanvulling op**: `text-interaction-research-findings.md` (editor-gericht)  
**Datum**: 2026-06-07

---

## 1. Huidige SDK Capabilities — Per TextSpan

| # | Veld | Type | Bron | Status |
|---|------|------|------|--------|
| 1 | `text` | `String` | ToUnicode + encoding maps | OK |
| 2 | `x`, `y` | `f64` | Composed transform | OK — maar alleen baseline |
| 3 | `width` | `f64` | Glyph advance (metric/estimate) | OK, maar metrics-based |
| 4 | `height` | `f64` | `font_size` (ascent only) | **Onnauwkeurig** — descent ontbreekt |
| 5 | `font_size` | `f64` | Glyph scale × 1000 | OK |
| 6 | `font_name` | `Option<String>` | PS name, subset-prefix stripped | OK |
| 7 | `is_bold` | `bool` | Weight≥700 / PS name | **Verlies** — weight 900 vs 600 zelfde bool |
| 8 | `is_italic` | `bool` | FontDescriptor flag + PS name | OK |
| 9 | `color` | `Option<[u8;4]>` | sRGB RGBA, `None` voor patterns | OK — maar mist non-sRGB info |
| 10 | `width_source` | `WidthSource` | Metric/Estimate | OK |
| 11 | `char_bounds` | `Vec<[f64;4]>` | Per-glyph [x0,y0,x1,y1] | **Metrics-based, niet visueel** |
| 12 | `mcid` | `Option<i32>` | Marked-content ID | OK |

---

## 2. Gap Analyse — Wat ontbreekt in de SDK

### Gap 1: Geen volledige transform-matrix

**Wat**: De volledige 6-element affine transform (CTM × Tm × glyph_transform) wordt gereduceerd tot (x, y) + font_size. Rotatie, shear, en niet-uniforme scaling gaan verloren.

**PDF.js equivalent**: `TextItem.transform` — een 6-element array `[a,b,c,d,e,f]` die de volledige transform in PDF device space beschrijft.

**Chromium equivalent**: PDFium's `FPDFText_GetCharBox()` + page rotation handling.

**Impact**: 
- Geroteerde tekst (>15°) wordt niet correct gepositioneerd
- Italic/shear (via text matrix skew) niet detecteerbaar
- Niet-uniforme scaling (horizontale stretch) niet detecteerbaar
- De editor kan geen CSS `transform: rotate()` of `skew()` toepassen

**Locatie**: `pdf-engine/src/text.rs` — `TextSpan` struct, `draw_glyph()` methode in `TextExtractionDevice`

**Huidige code**: De `classify_rotation()` functie (line 903-920) classificeert de x-basis vector naar cardinale rotaties (0/90/180/270) met 15° tolerantie. Alles daarbuiten valt terug naar 0°.

**Aanbevolen**: Voeg een `transform: Option<[f64; 6]>` veld toe aan `TextSpan` en bewaar de volledige matrix. De editor kan dan zelf `atan2()` en `hypot()` gebruiken zoals PDF.js.

---

### Gap 2: Geen font ascent/descent

**Wat**: `TextSpan.height` is altijd gelijk aan `font_size`. De echte ascent/descent ratio's uit de PDF FontDescriptor of uit de font binary worden niet gebruikt.

**PDF.js equivalent**: `#getAscent()` meet `fontBoundingBoxAscent` via de browser's canvas API. Fallback: PDF font data's ascent/descent.

**Impact**:
- De editor kan geen baseline-accurate positionering doen
- `adjustedTop = domY + domHeight - fontSize` is een grove benadering (ascent ≈ 80% van font-size)
- Voor fonts met ongebruikelijke ascent/descent (bijv. scripts, symbol fonts) is de positionering verkeerd

**Waar de data wél beschikbaar is**:
- **skrifa** (interne font library): `GlyphMetrics` heeft `ascent`, `descent`, `line_gap`, `cap_height`, `x_height` — maar deze worden niet doorgegeven aan text extraction
- **PDF FontDescriptor**: `/Ascent`, `/Descent`, `/CapHeight`, `/XHeight`, `/StemV`, `/StemH` — niet uitgelezen
- **OutlineFontData**: Heeft `weight`, `is_serif`, `is_monospace` — niet doorgegeven

**Aanbevolen**: Voeg een `FontMetrics` struct toe met `ascent: f64, descent: f64, cap_height: Option<f64>, x_height: Option<f64>` en voeg deze toe aan `TextSpan` (of als aparte font-map in de response).

---

### Gap 3: Geen text direction (LTR/RTL/TTB)

**Wat**: Er is geen text direction informatie. Alleen cardinale rotatie (0/90/180/270) wordt geclassificeerd. RTL scripts (Arabisch, Hebreeuws) en vertical writing mode (TTB voor CJK) worden niet gedetecteerd.

**PDF.js equivalent**: `TextItem.dir` — `'ltr' | 'rtl' | 'ttb'`. De editor zet `textDiv.dir = geom.dir`.

**Impact**:
- RTL tekst wordt als LTR weergegeven (karakters in verkeerde volgorde)
- Verticale CJK tekst wordt als geroteerde horizontale tekst behandeld
- De editor kan geen correcte `dir` en `writing-mode` CSS toepassen

**Waar de data beschikbaar is**:
- PDF `/WMode`: 0 = horizontaal, 1 = verticaal (in CIDFont dictionary)
- Unicode bidi algoritme: kan LTR/RTL bepalen uit de tekst zelf
- `classify_rotation()` detecteert 90/180/270 maar labelt niet als TTB

**Aanbevolen**: Voeg `dir: Option<TextDirection>` toe aan `TextSpan` met enum `Ltr | Rtl | Ttb`. Voor RTL: gebruik Unicode bidi algoritme of PDF's eigen direction hints.

---

### Gap 4: char_bounds zijn metrics-based, niet visueel

**Wat**: `char_bounds[idx] = [x, y, x+advance, y+font_size]` — dit is de **metrics-advance rechthoek**, niet de visuele bounding box van het glyph.

**Impact**:
- Tekens met ascenders (b, d, f, h, k, l, t) hebben visuele hoogte boven de font_size
- Tekens met descenders (g, j, p, q, y) hebben visuele diepte onder de baseline
- Italic glyphs kunnen visueel buiten de metrics-bounds vallen
- Accent/capitals kunnen boven de font_size uitsteken
- De editor kan geen pixel-exacte selectie-highlights maken

**Waar de data beschikbaar is**:
- `OutlineGlyph::outline()` — geeft de volledige `BezPath` van het glyph
- De glyph's visuele bbox kan hieruit berekend worden via `BezPath::bounding_box()`

**Aanbevolen**: Bereken de visuele glyph bbox uit de outline (optioneel, via feature flag). Als alternatief: voeg de metrics bbox én een `tight_bounds` veld toe.

---

### Gap 5: Geen font-weight numerieke waarde

**Wat**: Alleen `is_bold: bool` (≥700). De werkelijke weight (100-900) uit `OutlineFontData.weight` wordt niet doorgegeven.

**Impact**:
- De editor kan geen onderscheid maken tussen Regular (400), Medium (500), SemiBold (600), Bold (700), ExtraBold (800), Black (900)
- CSS `font-weight` kan niet exact worden ingesteld
- PDFs met niet-standaard weights verliezen visuele nuance

**Aanbevolen**: Vervang `is_bold: bool` door `font_weight: Option<u16>` (100-900 range).

---

### Gap 6: Geen text render mode

**Wat**: PDF kent 8 text rendering modes (0=fill, 1=stroke, 2=fill+stroke, 3=invisible, 4-7=clip varianten). Mode 3 (invisible) tekst wordt nog steeds geëxtraheerd.

**Impact**:
- Onzichtbare tekst (bijv. watermerken, verborgen metadata) verschijnt in extractie
- De editor kan geen onderscheid maken tussen zichtbare en verborgen tekst

**Aanbevolen**: Voeg `render_mode: Option<u8>` (0-7) toe aan `TextSpan`. Filter mode 3 (invisible) optioneel uit.

---

### Gap 7: Geen per-glyph Unicode mapping

**Wat**: Alleen de geconcateneerde `text: String` is beschikbaar. Er is geen mapping van glyph-index naar Unicode codepoint.

**PDF.js equivalent**: Niet direct, maar de text items zijn per-glyph (elke `TextItem.str` is één glyph-cluster).

**Impact**:
- Hit-testing op karakter-niveau is onmogelijk (je weet niet welk karakter onder de muis zit)
- Selectie op karakter-niveau is onmogelijk
- Ligature decompositie (bijv. "ffi" → "f"+"f"+"i") is niet omkeerbaar

**Aanbevolen**: Optioneel — voeg `glyph_offsets: Vec<usize>` toe die de byte-offsets van elk glyph in de `text` string aangeven. Voor ligatures kan een `Vec<Vec<usize>>` gebruikt worden (meerdere codepoints per glyph).

---

### Gap 8: OutlineFontData wordt niet doorgegeven

**Wat**: `OutlineFontData` bevat `is_serif: bool` en `is_monospace: bool` — deze worden niet doorgegeven aan `TextSpan` of `GlyphStyle`.

**Impact**:
- De editor kan geen onderscheid maken tussen serif en sans-serif als font_name ambigu is
- Monospace detectie is alleen mogelijk via font_name heuristiek (zoals `getEditorFontFamily()` nu doet)

**Aanbevolen**: Voeg `is_serif: bool` en `is_monospace: bool` toe aan `GlyphStyle` en propageer naar `TextSpan`.

---

### Gap 9: Geen vertical writing mode support

**Wat**: PDF CIDFonts met `/WMode 1` (vertical writing) worden niet correct afgehandeld. De vertical glyph advance `(w1_x, w1_y)` wordt genegeerd.

**Impact**:
- Verticale Japanse/Chinese/Koreaanse tekst wordt als horizontaal behandeld
- Karakterposities zijn verkeerd voor verticale text runs
- De editor kan geen `writing-mode: vertical-rl` CSS toepassen

**Aanbevolen**: Voeg `is_vertical: bool` en `vertical_advance: Option<f64>` toe. Gebruik `/WMode 1` uit de CIDFont dictionary.

---

### Gap 10: PDF Text State Parameters niet beschikbaar

**Wat**: De pdf-extract crate trackt `Tc` (char spacing), `Tw` (word spacing), `Th` (horizontal scaling %), `TL` (leading), `Ts` (text rise) — maar deze worden niet blootgesteld op `TextBlock`.

**Impact**:
- De editor kan geen exacte tekst-layout reproduceren (spacing tussen woorden/karakters)
- Text rise (superscript/subscript offset) wordt genegeerd
- Horizontale stretching (Th ≠ 100%) is onzichtbaar voor de editor

**Aanbevolen**: Voeg `char_spacing: Option<f64>`, `word_spacing: Option<f64>`, `h_scaling: Option<f64>`, `leading: Option<f64>`, `text_rise: Option<f64>` toe aan `TextSpan`.

---

## 3. Aanbevolen SDK Uitbreidingen — Samenvatting

| # | Nieuwe velden | Prioriteit | Waarom |
|---|---|---|---|
| 1 | `transform: [f64; 6]` | **Hoog** | Rotatie, shear, niet-uniforme scaling. Essentieel voor correcte positionering. |
| 2 | `ascent: f64, descent: f64` | **Hoog** | Baseline-accurate positionering. Gebruikt door PDF.js en Adobe. |
| 3 | `dir: TextDirection` | **Hoog** | RTL + TTB support. Essentieel voor internationale documenten. |
| 4 | `font_weight: u16` | Medium | CSS `font-weight` exact instellen. Vervangt `is_bold: bool`. |
| 5 | `tight_bounds: [f64; 4]` | Medium | Visuele glyph bbox voor pixel-exacte highlights. |
| 6 | `render_mode: u8` | Medium | Filter onzichtbare tekst (mode 3). |
| 7 | `is_serif, is_monospace` | Laag | Betere font-family mapping in editor. |
| 8 | `char_spacing, word_spacing, h_scaling` | Laag | Exacte tekst-layout reproductie. |
| 9 | `glyph_offsets: Vec<usize>` | Laag | Karakter-niveau hit testing en selectie. |
| 10 | `is_vertical, vertical_advance` | Laag | Vertical CJK writing support. |

---

## 4. Impact op de Data Flow

**Huidige flow**:
```
pdf-engine::TextSpan → (wrapper in pdf_engine.rs) → TextSpanInfo → JSON → TypeScript TextSpan
```

**Nieuwe flow met aanbevolen velden**:
```
pdf-engine::TextSpan (uitgebreid)
  ├── transform: [f64; 6]      ← nieuw
  ├── ascent: f64              ← nieuw
  ├── descent: f64             ← nieuw  
  ├── dir: TextDirection       ← nieuw
  ├── font_weight: u16         ← vervingt is_bold
  └── tight_bounds: [f64; 4]  ← nieuw (optioneel)
         ↓
TextSpanInfo (wrapper uitgebreid, JSON serialization)
         ↓
TypeScript TextSpan (interface uitgebreid)
         ↓
TextLayer.tsx (gebruikt nieuwe velden voor positionering)
```

**Let op**: Alle nieuwe velden moeten `Option` zijn en `skip_serializing_if = "Option::is_none"` gebruiken voor backward compatibility met bestaande PDFs die deze data niet hebben.

---

## 5. Prioritering & Implementatie-Volgorde

1. **Eerst**: `transform`, `ascent`, `descent`, `dir` — deze 4 velden hebben de grootste impact op de "native feel" en worden door zowel PDF.js als Adobe gebruikt.

2. **Dan**: `font_weight`, `is_serif`, `is_monospace` — verbeteren de font-matching in de editor.

3. **Tenslotte**: `tight_bounds`, `render_mode`, `char_spacing`, `glyph_offsets`, `is_vertical` — optionele verbeteringen voor specifieke use cases.

---

## 6. Objectieve Validatie Metrics & Bestaande Infrastructuur

### 6.1 Bestaande SDK Testinfrastructuur

De XFA SDK heeft een zeer mature testinfrastructuur die direct ingezet kan worden:

| Infrastructuur | Locatie | Hoe te gebruiken |
|---|---|---|
| **xfa-test-runner** corpus tests | `crates/xfa-test-runner/` | Draai `text_extract`, `text_oracle`, `text_replace` modules vóór/na wijzigingen |
| **SSIM rendering gate** | `.github/workflows/gate-ci.yml` | 500-PDF corpus, pixel-level regressie detectie (0.5% threshold) |
| **Poppler text oracle** | `xfa-test-runner/src/oracles/poppler.rs` | Vergelijk text extractie output met Poppler `pdftotext` (Levenshtein) |
| **Criterion benchmarks** | `crates/pdf-bench/benches/` | Meet performance impact van nieuwe velden |
| **Corpus ~237 PDFs** | `corpus/` | IRS forms, immigration forms, Canadian tax forms — divers genoeg voor representatieve tests |
| **Fuzz targets** | `fuzz/fuzz_targets/` | `fuzz_text_replace`, `fuzz_content_stream` — vind edge cases in text extraction |
| **Text completeness scripts** | `scripts/extraction_eval/` | `chunk_retrieval.py`, `competitive_structtree.py`, `rag_benchmark.py` |
| **CI crash guard** | `.github/workflows/crash-guard.yml` | Geen panics/crashes geïntroduceerd |

### 6.2 Metrics per Aanbeveling

#### Metric S1 — Transform Matrix Correctheid
- **Wat**: Valideer dat de nieuwe `transform` matrix correcte rotatie, shear, en scaling bevat
- **Hoe**: 
  1. Maak test-PDFs met bekende transformaties (0°, 15°, 45°, 90°, 180°, 270°, shear 15°, scale 200%)
  2. Draai `extract_text_blocks()` en controleer `transform[0..6]` tegen verwachte waarden
  3. Vergelijk `atan2(tx[1], tx[0])` met `classify_rotation()` voor backward compatibility
- **Bestaande infra**: `pdf-engine/src/text.rs` — `#[cfg(test)] mod tests` testblok toevoegen
- **Pass/fail**: `angle_diff < 0.1°` voor alle rotaties, `scale_diff < 0.001` voor uniforme scaling

#### Metric S2 — Ascent/Descent Nauwkeurigheid
- **Wat**: Valideer dat de nieuwe `ascent`/`descent` waarden kloppen met bekende fonts
- **Hoe**:
  1. Gebruik test-PDFs met standaard fonts (Helvetica, Times, Courier) waarvan metrics bekend zijn
  2. Vergelijk geëxtraheerde ascent/descent met referentiewaarden uit font specificaties
  3. Run `text_oracle` module op corpus om te verifiëren dat bestaande output ongewijzigd blijft
- **Bestaande infra**: `xfa-test-runner/src/tests/text_oracle.rs` — Poppler vergelijking
- **Pass/fail**: `ascent_diff < 5%`, `descent_diff < 5%`, bestaande text output 100% identiek

#### Metric S3 — Text Direction Detectie
- **Wat**: Valideer LTR/RTL/TTB detectie
- **Hoe**:
  1. Test-PDFs: Arabisch/Hebreeuws (RTL), Engels/Nederlands (LTR), Japans verticaal (TTB)
  2. Controleer `dir` veld per span
  3. Gebruik bestaande `fixtures/xfa-data/xd_21` (Arabic RTL) en `xd_22` (Hebrew RTL) fixtures
- **Bestaande infra**: `fixtures/xfa-data/` — RTL fixtures bestaan al
- **Pass/fail**: `dir == RTL` voor Arabische/Hebreeuwse text, `dir == LTR` voor Latijnse text

#### Metric S4 — Regressie-vrije Uitbreiding
- **Wat**: Bestaande text extraction mag niet veranderen
- **Hoe**:
  1. Draai `cargo test` over alle SDK crates
  2. Draai `xfa-test-runner --tier fast` op het corpus
  3. Draai `xfa-test-runner --tier standard --oracles text_oracle` 
  4. Vergelijk text output met vorige run via `scripts/track_failure_trends.py`
- **Bestaande infra**: CI `gate-ci.yml`, `crash-guard.yml`
- **Pass/fail**: 0 regressies in bestaande text extraction, 0 crashes, SSIM gate > 0.5% threshold

#### Metric S5 — Performance Impact
- **Wat**: Nieuwe velden mogen geen significante performance impact hebben
- **Hoe**:
  1. Draai `cargo bench` op `pdf-bench` vóór en na wijzigingen
  2. Focus op `sdk_operations` benchmark (text_extract, render)
  3. Check `scripts/check_benchmark_sla.py` — SLA compliance
- **Bestaande infra**: `crates/pdf-bench/`, `.github/workflows/bench.yml` (>10% regressie = PR block)
- **Pass/fail**: < 5% toename in text extraction tijd, < 1% toename in geheugengebruik

#### Metric S6 — Backward Compatibility
- **Wat**: JSON output blijft leesbaar voor bestaande frontend
- **Hoe**:
  1. Alle nieuwe velden zijn `Option` + `skip_serializing_if = "Option::is_none"`
  2. Bestaande `TextSpanInfo` velden behouden exact dezelfde serde namen en types
  3. Draai `cargo test` in `pdfluent-v3/src-tauri` om wrapper integriteit te checken
- **Pass/fail**: Bestaande TypeScript tests (6434) passeren, `TextSpanInfo` serialisatie roundtrip OK

### 6.3 Gebruik van Bestaande Oracle Infrastructuur

De SDK heeft 6 oracles die direct ingezet kunnen worden voor validatie:

| Oracle | Gebruik voor SDK wijzigingen |
|---|---|
| **Poppler text** (`text_oracle.rs`) | Vergelijk onze text output met Poppler `pdftotext`. Levenshtein similarity > 0.50 threshold. |
| **Poppler metadata** (`metadata_oracle.rs`) | Vergelijk metadata (page count, font info) met Poppler `pdfinfo`. |
| **SSIM rendering** (`ssim.rs`, `gate-ci.yml`) | Visuele rendering gate — controleert of pagina-rendering nog klopt na text extraction wijzigingen. |
| **veraPDF** (`verapdf.rs`) | PDF/A conformance — controleert of text extraction wijzigingen geen compliance breken. |
| **iText** (`itext.rs`) | XFA flatten pagina-telling vergelijking met iText 5. |
| **LLM vision** (`llm_vision.rs`) | Gemma 3 27B visuele kwaliteit review (score 1-10). Voor subjectieve text rendering kwaliteit. |

### 6.4 CI/CD Gates die Automatisch Draaien

| Gate | Workflow | Blokkeert PR bij |
|---|---|---|
| `cargo test` | `ci.yml` | Test failure |
| `cargo clippy` + `cargo fmt` | `ci.yml` | Lint/fmt issues |
| SSIM rendering gate | `gate-ci.yml` | >0.5% pixel regression op 500-PDF corpus |
| Crash guard | `crash-guard.yml` | Panic/crash op corpus |
| Bench regressie | `bench.yml` | >10% benchmark regressie |
| veraPDF conformance | `verapdf.yml` | PDF/A compliance breuk |
| Fuzz | `fuzz.yml` (weekly) | Crash in fuzz target |
| Security audit | `security-audit.yml` | Nieuwe RustSec advisory |
