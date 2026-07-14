# Text Interaction Research Findings

## Vergelijkend onderzoek: PDF.js, Chromium PDFium, Adobe Acrobat Web

**Onderzoeksdatum**: 2026-06-07  
**Doel**: Begrijpen hoe toonaangevende PDF-viewers tekstinteractie implementeren om PDFluent te verbeteren.
**Bronbestanden**: Volledige source code van PDF.js en Chromium; DOM-analyse van Adobe Acrobat Web.

---

## 1. PDF.js (Mozilla) — Diepgaande Analyse

### 1.1 Architectuur Overzicht

PDF.js gebruikt een **twee-lagen architectuur**:
- **Canvas laag**: De PDF wordt gerenderd naar een `<canvas>` via de PDF.js renderer
- **Text Layer**: Een transparante `<div>` overlay met daarin `<span>` elementen, één per tekstfragment

De text layer en canvas zijn **siblings** in de DOM, beide absoluut gepositioneerd binnen een `.page` container. De canvas staat op `z-index: -1`, de text layer op `z-index: 0`.

### 1.2 Coordinate Systeem & Positionering (KERNINZICHT)

Dit is het meest geavanceerde deel van PDF.js. De positionering werkt in 4 stappen:

**Stap 1: Bouw een PDF→CSS conversiematrix**

```javascript
// text_layer.js constructor
const { pageWidth, pageHeight, pageX, pageY } = viewport.rawDims;
this.#transform = [1, 0, 0, -1, -pageX, pageY + pageHeight];
```

Dit is `[a, b, c, d, e, f]` = `[1, 0, 0, -1, shiftX, shiftY]`:
- `d = -1` flipt de Y-as (PDF bottom-up → CSS top-down)
- `e, f` compenseert voor niet-nul page origins

**Stap 2: Combineer met de text-item's eigen transform**

Elk text item uit de PDF heeft een eigen 3×3 affine transform die zijn positie, rotatie en schaal in PDF device space beschrijft.

```javascript
const tx = Util.transform(this.#transform, geom.transform);
```

`Util.transform()` doet volledige 3×3 matrix vermenigvuldiging:

```javascript
static transform(m1, m2) {
    return [
        m1[0]*m2[0] + m1[2]*m2[1],
        m1[1]*m2[0] + m1[3]*m2[1],
        m1[0]*m2[2] + m1[2]*m2[3],
        m1[1]*m2[2] + m1[3]*m2[3],
        m1[0]*m2[4] + m1[2]*m2[5] + m1[4],
        m1[1]*m2[4] + m1[3]*m2[5] + m1[5]
    ];
}
```

**Stap 3: Extraheer rotatie en font-grootte uit de matrix**

```javascript
const angle = Math.atan2(tx[1], tx[0]);           // rotatie uit shear
const fontHeight = Math.hypot(tx[2], tx[3]);       // font-grootte = magnitude Y-schaal
const fontAscent = fontHeight * ascent;            // daadwerkelijke ascent
```

**Stap 4: Converteer naar CSS percentages**

```javascript
left = tx[4];                                       // X in CSS px
top = tx[5] - fontAscent;                           // Y gecorrigeerd voor ascent
divStyle.left = `${((100 * left) / pageWidth).toFixed(2)}%`;
divStyle.top = `${((100 * top) / pageHeight).toFixed(2)}%`;
```

**Waarom percentages?** Omdat de text layer container schaalt met de viewport, blijven de percentages geldig bij elke zoom/resize. Geen herpositionering nodig.

**Stap 5: Font-size via CSS custom properties**

```javascript
divStyle.setProperty("--font-height", `${fontHeight.toFixed(2)}px`);
```

In CSS:
```css
font-size: calc(var(--total-scale-factor) * var(--font-height));
```

**Conclusie**: PDF.js gebruikt volledige matrix-transformaties, geen losse (x, y, w, h) tuples. Dit maakt rotatie, shear, en niet-uniforme scaling mogelijk.

### 1.3 Font Matching & Breedte-Compensatie (KERNINZICHT)

**Waarom is dit nodig?** PDF fonts en browser fonts hebben verschillende metrics. Zelfs met dezelfde font-family en font-size kan de gerenderde breedte 5-15% verschillen.

PDF.js lost dit op in de `#layout()` methode:

```javascript
#layout(params) {
    const { div, properties, ctx } = params;
    if (properties.canvasWidth !== 0 && properties.hasText) {
        const { fontFamily } = style;
        const { canvasWidth, fontSize } = properties;
        
        // 1. Zet exact dezelfde font op een hidden canvas
        TextLayer.#ensureCtxFont(ctx, fontSize * this.#scale, fontFamily);
        
        // 2. Meet de werkelijke gerenderde breedte
        const { width } = ctx.measureText(div.textContent);
        
        // 3. Bereken scaleX compensatie
        if (width > 0) {
            style.setProperty("--scale-x", (canvasWidth * this.#scale) / width);
        }
    }
    // 4. Pas rotatie toe
    if (properties.angle !== 0) {
        style.setProperty("--rotate", `${properties.angle}deg`);
    }
}
```

In CSS:
```css
transform: rotate(var(--rotate)) scaleX(var(--scale-x)) scale(var(--min-font-size-inv));
```

### 1.4 Ascent-Meting (KERNINZICHT)

```javascript
static #getAscent(fontFamily, style, lang) {
    const cachedAscent = this.#ascentCache.get(fontFamily);
    if (cachedAscent) return cachedAscent;
    
    const ctx = this.#getCtx(lang);
    ctx.canvas.width = ctx.canvas.height = DEFAULT_FONT_SIZE;  // 30px
    this.#ensureCtxFont(ctx, DEFAULT_FONT_SIZE, fontFamily);
    const metrics = ctx.measureText("");
    
    // Meet de echte font ascent/descent via de browser's text metrics API
    const ascent = metrics.fontBoundingBoxAscent;     // pixels boven baseline
    const descent = Math.abs(metrics.fontBoundingBoxDescent);  // pixels onder baseline
    
    ctx.canvas.width = ctx.canvas.height = 0;
    let ratio = 0.8; // fallback (DEFAULT_FONT_ASCENT)
    
    if (ascent) {
        ratio = ascent / (ascent + descent);
    } else {
        // Fallback: gebruik style.ascent en style.descent uit de PDF font data
        if (style.ascent) ratio = style.ascent;
        else if (style.descent) ratio = 1 + style.descent;
    }
    
    this.#ascentCache.set(fontFamily, ratio);
    return ratio;
}
```

### 1.5 Minimum Font-Size Workaround

Browsers hebben een minimum font-size (default ~6px in Firefox, ~0 in Chrome). PDF tekst kan kleiner zijn. PDF.js lost dit op door:

1. Font-size te vermenigvuldigen met `--min-font-size`
2. Terug te schalen met CSS `transform: scale(1/--min-font-size)`

```javascript
static #ensureMinFontSizeComputed() {
    const div = document.createElement("div");
    div.style.fontSize = "1px";
    div.textContent = "X";
    document.body.append(div);
    this.#minFontSize = div.getBoundingClientRect().height;
    div.remove();
}
```

```css
font-size: calc(var(--text-scale-factor) * var(--font-height));
/* waarbij --text-scale-factor = var(--total-scale-factor) * var(--min-font-size) */
transform: rotate(...) scaleX(...) scale(var(--min-font-size-inv));
```

### 1.6 Performance Optimalisaties (VOLLEDIGE LIJST)

| # | Optimalisatie | Locatie | Mechanisme |
|---|---|---|---|
| 1 | **Streaming chunks** | `text_layer.js:render()` | 100 items per chunk via ReadableStream, async yield naar main thread |
| 2 | **Ascent cache** | `text_layer.js:#getAscent()` | Map per font-family, eenmalig meten |
| 3 | **Canvas context pool** | `text_layer.js:#getCtx()` | Eén hidden canvas per locale (!), niet per tekstblok |
| 4 | **Font string caching** | `text_layer.js:#ensureCtxFont()` | Slaat `ctx.font` overslaan over als font al actief is |
| 5 | **Monomorphic cache shapes** | `text_layer.js:#appendText()` | `textDivProperties` heeft alle keys vooraf geïnitialiseerd (voorkomt V8 deopt) |
| 6 | **Skip single-char scale** | `text_layer.js:#appendText()` | Geen `measureText()` voor 1-karakter spans (tenzij asymmetrische scaling >1.5x) |
| 7 | **100K span hard cap** | `text_layer.js:MAX_TEXT_DIVS_TO_RENDER` | Veiligheidsgrens |
| 8 | **Style writes voor DOM-append** | `text_layer.js:#appendText()` | Alle CSS properties gezet vóór `container.append()` (geen layout-trigger) |
| 9 | **Update-only mode** | `text_layer.js:update()` | Bij zoomwijziging: alleen `#layout()` herhalen, geen DOM rebuild |
| 10 | **Global cleanup** | `text_layer.js:cleanup()` | Pas cache/canvas opruimen als alle text layers klaar zijn |

### 1.7 Tekstselectie Mechanisme

**Twee-lagen selectie:**
1. **Core TextLayer**: Rendered invisible spans. Browser's native `::selection` doet de highlighting.
2. **TextLayerBuilder**: Handled copy events, `endOfContent` truc, multi-page selectie.

**endOfContent mechanisme**:
Bij selectie over meerdere regels/pagina's kan de browser-selectie "springen" naar verkeerde posities. De `.endOfContent` div wordt dynamisch verplaatst naar de muispositie om de selectie te begrenzen:

```javascript
// Bij selectionchange: verplaats .endOfContent naast de anchor
const parentTextLayer = anchor.parentElement?.closest(".textLayer");
const endDiv = this.#textLayers.get(parentTextLayer);
if (endDiv) {
    endDiv.style.width = parentTextLayer.style.width;
    endDiv.style.height = parentTextLayer.style.height;
    anchor.parentElement.insertBefore(endDiv, anchor.nextSibling);
}
```

**Copy normalisatie**:
```javascript
div.addEventListener("copy", event => {
    const selection = document.getSelection();
    event.clipboardData.setData("text/plain",
        removeNullCharacters(normalizeUnicode(selection.toString()))
    );  // NFKC normalisatie + null-byte verwijdering
});
```

### 1.8 RTL, Rotatie, CJK

- **RTL**: `textDiv.dir = geom.dir` (waar `dir` 'rtl', 'ltr', of 'ttb' kan zijn). Browser's native bidi handling regelt de rest.
- **Rotatie**: `angle = Math.atan2(tx[1], tx[0])`, gecompenseerd in positionering: `left = tx[4] + fontAscent * Math.sin(angle)`
- **Vertical CJK**: `style.vertical === true` voegt π/2 toe aan de angle; gebruikt `geom.height` ipv `geom.width`
- **Marked Content**: PDF's structure tree wordt behouden via nested `<span class="markedContent">` met `display: contents`

---

## 2. Chromium PDF Viewer (PDFium) — Diepgaande Analyse

### 2.1 Architectuur Overzicht

Chromium's PDF viewer gebruikt een **fundamenteel andere aanpak** dan PDF.js:
- Er is **geen HTML text layer**
- Alle rendering gebeurt in het **PDFium plugin-proces** (C++)
- Tekstselectie is **plugin-level**, niet DOM-level
- De `<embed type="application/x-google-chrome-pdf">` is een native plugin

### 2.2 Plugin Architectuur

```
┌─────────────────────────────────────────────┐
│ Browser Process                             │
│  ┌───────────────────────────────────────┐  │
│  │ JS Viewer (pdf_viewer.ts)             │  │
│  │  ↕ postMessage                         │  │
│  │ PluginController                       │  │
│  └──────────────┬────────────────────────┘  │
│                 │ Mojo IPC                   │
│  ┌──────────────▼────────────────────────┐  │
│  │ Renderer Process                      │  │
│  │  PdfViewWebPlugin (C++)               │  │
│  │   ↕                                    │  │
│  │  PDFiumEngine (C++)                   │  │
│  │   ├── FPDFText_GetCharIndexAtPos()    │  │
│  │   ├── FPDFText_GetText()              │  │
│  │   └── FPDF_RenderPageBitmap()         │  │
│  └───────────────────────────────────────┘  │
└─────────────────────────────────────────────┘
```

### 2.3 Tekstselectie op Plugin-Niveau

```cpp
// pdf/pdfium/pdfium_engine.cc
void PDFiumEngine::OnMouseDown(...) {
    int char_index = FPDFText_GetCharIndexAtPos(
        text_page, point.x, point.y, x_tolerance, y_tolerance);
    // Start selectie
}

void PDFiumEngine::ExtendSelection(...) {
    // Bouw PDFiumRange objecten
    selection_.push_back(PDFiumRange(...));
    // Paint selectie op het canvas via DrawSelections()
}
```

De **`PDFiumRange`** class (pdf/pdfium/pdfium_range.h) encapsuleert een tekst range:
```cpp
class PDFiumRange {
    int page_index_;
    int char_start_;
    int char_count_;
    
    // Haal screen-coordinaat rects voor highlight rendering
    std::vector<gfx::Rect> GetScreenRects(...);
};
```

### 2.4 Coordinate Systemen (4-Space)

| Space | Origin | Eenheid | Gebruikt voor |
|-------|--------|---------|--------------|
| **PDF** | Bottom-left page | Points (1/72") | FPDFText APIs |
| **Screen** | Top-left plugin | CSS pixels | Input events, mouse coords |
| **Device** | Top-left plugin | Physical pixels | Screen × device_scale_factor |
| **Document** | Top-left full doc | Pixels | Layout, page positions |

Transformaties:
```cpp
// pdf/draw_utils/coordinates.h
gfx::Rect GetScreenRect(const gfx::Rect& rect, 
                        const gfx::Vector2d& position, 
                        double zoom) {
    return gfx::Rect((rect - position) * zoom);
}

// pdf/pdfium/pdfium_page.h
gfx::Rect PDFiumPage::PageToScreen(const gfx::Rect& rect, ...) {
    // Account voor page origin, zoom, en page rotatie
}
```

### 2.5 JS ↔ Plugin Communicatie

De communicatie verloopt via `postMessage`:

**JS → Plugin** (viewport, selectAll, print, save, etc.):
```typescript
// controller.ts
pluginController_.postMessage({type: 'viewport', ...});
pluginController_.postMessage({type: 'selectAll'});
```

**Plugin → JS** (documentDimensions, loadProgress, goToPage, etc.):
```typescript
// pdf_viewer.ts handlePluginMessage()
case 'goToPage':
    this.viewport.goToPage(message.page);
```

Reply-gebaseerde berichten gebruiken een `messageId` + Promise pattern:
```typescript
getSelectedText(): Promise<string> {
    return new Promise(resolve => {
        const messageId = this.getNextMessageId();
        this.pendingReplies_.set(messageId, resolve);
        this.postMessage({type: 'getSelectedText', messageId});
    });
}
```

### 2.6 Performance Optimalisaties

| # | Optimalisatie | Mechanisme |
|---|---|---|
| 1 | **Progressive painting** | Time-budgeted: 250ms first paint, 300ms subsequent. Incomplete pages → opnieuw volgende frame |
| 2 | **Page unloading** | `ScopedPageUnloadPreventer` — pagina's unloaden bij scrollen off-screen, behalve als in gebruik (selectie, forms) |
| 3 | **Lazy text page** | `FPDF_TEXTPAGE` wordt pas geladen wanneer nodig (`GetTextPage()`) |
| 4 | **Change invalidators** | `SelectionChangeInvalidator` / `FindResultChangeInvalidator` — alleen gewijzigde screen rects opnieuw schilderen |
| 5 | **Incremental loading** | Linearized PDFs laden progressief via `FPDFAvail_IsPageAvail()` |
| 6 | **Block-based save** | 16MB blokken (`kMaxSaveBufferSize`) om OOM te voorkomen |
| 7 | **Skia renderer** | `FPDF_RENDERERTYPE_SKIA` voor GPU-versnelde rendering |
| 8 | **Scroll sync** | Plugin vertelt JS viewport waar te scrollen; voorkomt redundante repaints |

---

## 3. Adobe Acrobat Web — Analyse

### 3.1 Architectuur Overzicht (4 Lagen)

Adobe gebruikt een meerlaagsarchitectuur die de illusie wekt van directe HTML-interactie:

```
Laag 1: WASM Rendering → bitmap
  ├── dc-rendition-provider (WASM module)
  ├── wasm_acrobat_we.*.wasm
  └── <img src="blob:..."> (1114×1576 retina, 557×788 CSS)

Laag 2: SVG Bounding Boxes → klikbare tekstblokken
  ├── EditOverlay div (557×788px, exact gelijk aan afbeelding)
  ├── pageIndex-0-bbox-2, pageIndex-0-bbox-3, ...
  └── position: absolute; left: 99px; top: 31px; border: 1px dashed

Laag 3: Jot Editor → contentEditable HTML
  ├── dc-jot-component/4.1.0_1.202.0
  ├── <div class="jot-editable-region" contenteditable="false">
  └── <p>, <ul>, <li>, <strong>, <span>, <cite> (echte DOM)

Laag 4: Overige Overlays
  ├── SpellCheckerOverlay (rode golvende SVG-lijntjes)
  ├── CommentsView (highlight-markers voor annotaties)
  └── React Spectrum UI-componenten
```

### 3.2 WASM Engine

De `wasm_acrobat_we.*.wasm` module (geladen via `dc-rendition-provider`) rendert PDF-pagina's naar bitmaps. De module:
- Verwerkt de volledige PDF (fonts, graphics, text positioning)
- Produceert pixel-exacte SVG bounding boxes voor elk tekstvak
- Levert font-metadata en tekststructuur aan de Jot editor

### 3.3 Jot Editor

Adobe Jot is een eigen rich-text editing engine (vergelijkbaar met Lexical/ProseMirror):

```html
<div class="jot-editable-region" contenteditable="false">
  <p class="jot-paragraph-element">
    <span style="font-family: 'Adobe Clean'">Jasper de Winter</span>
  </p>
  <ul class="jot-unordered-list-element">
    <li class="jot-list-item-element">
      <strong>Python, SQL, Rust</strong>
    </li>
  </ul>
</div>
```

Key features:
- Volledige DOM-gebaseerde rich text rendering
- Behoudt PDF structuur (paragrafen, lijsten, opmaak)
- Werkt met exacte font metrics uit de WASM engine
- Spellchecker overlay (aparte SVG laag)

### 3.4 SVG Bounding Box Positionering

De bbox SVGs zijn pixel-exact gepositioneerd:
```html
<svg style="position: absolute; left: 99px; top: 31px; ...">
  <rect ... />
</svg>
```

Elke bbox matcht exact met de tekst in de rasterafbeelding. De positionering is afkomstig uit de WASM engine die de PDF-structuur volledig begrijpt.

---

## 4. Vergelijkingsmatrix

| Dimensie | PDFluent (huidig) | PDF.js | Chromium PDFium | Adobe Acrobat Web |
|---|---|---|---|---|
| **Text layer type** | Transparante `<span>` overlay | Transparante `<span>` overlay | **Geen** — plugin rendering | SVG `bbox` overlays |
| **Positionering** | `left/top` px, `fontSize` × zoom | CSS `%` + matrix transform + scaleX | Native PDFium coords | WASM → pixel-exact SVG |
| **Coordinaten bron** | SDK: (x, y, w, h) per span | PDF: volledige 3×3 affine matrix per text item | PDFium C++ API | WASM engine |
| **Font breedte match** | Geen compensatie | Canvas `measureText()` → scaleX | N/A (plugin fonts) | Eigen font engine |
| **Ascent compensatie** | `fontSize` gebruikt als hoogte | `fontBoundingBoxAscent` via canvas | N/A (plugin) | Exacte font metrics |
| **Font mapping** | CSS font stacks via `getEditorFontFamily()` | `fontFamily` uit PDF, map voor FF/Win | Systeem fonts (plugin) | Adobe Clean + subsets |
| **Edit mode** | `contentEditable` (één paragraaf) | **Niet ondersteund** | **Niet ondersteund** | Jot: volledige rich-text editor |
| **Matrix support** | Alleen (x, y, w, h), geen rotatie | Volledige 3×3, atan2 rotatie, scaleX/Y | Volledig (PDFium native) | Volledig (WASM) |
| **Streaming render** | Alle spans tegelijk | 100-span chunks via ReadableStream | Progressive paint engine | Onbekend |
| **Hit testing** | O(n) lineaire scan | N/A (geen editing) | `FPDFText_GetCharIndexAtPos()` | Bbox hit test |
| **Multi-page selectie** | Single page | `endOfContent` mechanisme | Native multi-page | Via Jot |
| **RTL** | Niet ondersteund | `dir="rtl"` attribuut | Volledig | Volledig |
| **Rotated text** | Niet ondersteund | `atan2()` + CSS `rotate()` | Volledig | Volledig |
| **Accessibility** | Geen | `role="presentation"` + markedContent | Via plugin | Via Jot |
| **Spellcheck** | Browser default op contentEditable | N/A | N/A | Aparte SVG overlay |

---

## 5. PDFluent Gap Analysis

### Gap 1: Geen volledige transform-matrix

**Wat ontbreekt**: PDFluent krijgt alleen (x, y, width, height) per span. PDF.js en PDFium gebruiken de **volledige 3×3 affine transform** die ook rotatie en shear bevat.

**Waarom dit belangrijk is**: Zonder rotatie-matrix kunnen we geroteerde tekst niet correct positioneren. Zonder shear-matrix kunnen we italic/oblique tekst niet correct weergeven.

**Waar het moet gebeuren**: In de Rust SDK — `pdf_engine::TextSpan` moet worden uitgebreid met een `transform: [f64; 6]` veld, of de volledige PDF text matrix moet bewaard blijven.

### Gap 2: Geen font breedte-compensatie

**Wat ontbreekt**: PDFluent gebruikt `rect.width` direct uit de SDK. Deze PDF-font-breedte matcht niet met de CSS-font-breedte die de browser rendert.

**PDF.js oplossing**: Meet de werkelijke gerenderde breedte via `ctx.measureText()` op een hidden canvas en pas `scaleX()` toe.

**Waar het moet gebeuren**: In de Editor — `TextLayer.tsx`.

### Gap 3: Geen ascent-meting

**Wat ontbreekt**: PDFluent gebruikt `fontSize` als de volledige teksthoogte, maar de ascent (tekst boven baseline) is meestal ~80% van de font-size.

**PDF.js oplossing**: Meet `fontBoundingBoxAscent` via de browser's canvas API en corrigeer de `top` offset.

**Waar het moet gebeuren**: In de Editor — `TextLayer.tsx`.

### Gap 4: Streaming render ontbreekt

**Wat ontbreekt**: PDFluent rendert alle spans in één render-cycle. Op text-heavy pagina's (>5000 spans) blokkeert dit de UI.

**PDF.js oplossing**: Verwerk text items in chunks van 100 via `ReadableStream`, yield naar main thread tussen chunks.

**Waar het moet gebeuren**: In de Editor — `TextLayer.tsx`.

### Gap 5: Geen RTL/rotatie/vertical-text support

**Wat ontbreekt**: De SDK levert geen text direction informatie. De frontend heeft geen rotatie-afhandeling.

**PDF.js oplossing**: `dir` attribuut op spans, `atan2()` voor rotatiehoek, +π/2 voor verticale fonts.

**Waar het moet gebeuren**: Rust SDK (dir + rotatie in TextSpanInfo) + Editor (CSS transform + dir attribuut).

### Gap 6: Font ascent/descent niet in SDK

**Wat ontbreekt**: De Rust SDK extraheert geen font metrics uit de PDF font descriptors. De `/Ascent` en `/Descent` waarden uit de FontDescriptor dictionary worden niet gebruikt.

**Waarom dit belangrijk is**: Met de echte font ascent kunnen we baseline-accurate positionering doen zonder te vertrouwen op de browser's canvas API (die voor sommige fonts incorrect kan zijn).

**Waar het moet gebeuren**: In de Rust SDK — nieuwe font metrics extractie uit de PDF font descriptor.

### Gap 7: Editor beperkt tot één paragraaf

**Wat ontbreekt**: PDFluent's `contentEditable` editor werkt voor één paragraaf tegelijk. Adobe's Jot kan meerdere paragrafen, lijsten, en complexe opmaak aan binnen één editor sessie.

**Adobe oplossing**: Jot reconstrueert de volledige PDF-structuur (paragrafen, lijsten, headings) als echte DOM HTML met correcte styling per element.

**Waar het moet gebeuren**: In de Editor — `TextInlineEditor.tsx` uitbreiden met multi-paragraaf support en per-span styling.

---

## 6. Concrete Aanbevelingen

### Aanbeveling 1: Canvas-based width matching (Hoogste prioriteit)

**Wat**: Voeg een hidden `<canvas>` toe aan `TextLayer.tsx` en meet de werkelijke CSS-rendered breedte van elke multi-char span. Pas `transform: scaleX(ratio)` toe waar de ratio = `pdfWidth / measuredWidth`.

**Inspiratie**: `pdf.js/src/display/text_layer.js` — `#ensureCtxFont()` en `#layout()`.

**Voorbeeld pseudo-code**:
```typescript
const ctx = hiddenCanvas.getContext('2d');
ctx.font = `${fontSize}px ${fontFamily}`;
const measuredWidth = ctx.measureText(span.text).width;
const scaleX = (span.rect.width * zoom) / measuredWidth;
```

**Impact**: Spantekst matcht visue el exact met de canvas tekst eronder. Dit is de #1 verbetering voor "native feel".

### Aanbeveling 2: Ascent-compensated positioning

**Wat**: Meet `fontBoundingBoxAscent` via canvas API en pas `top` offset aan: `top = domY + domHeight - fontSize * ascentRatio`.

**Inspiratie**: `pdf.js/src/display/text_layer.js` — `#getAscent()`.

**Impact**: Baseline-accurate positionering. Voorkomt dat tekst 1-2px verschoven staat ten opzichte van de canvas.

### Aanbeveling 3: Streaming text layer render

**Wat**: Verwerk spans in chunks van 100 met `requestAnimationFrame` tussen chunks.

**Inspiratie**: `pdf.js/src/display/text_layer.js` — `TEXT_CONTENT_CHUNK_SIZE = 100` en de `pump()` async loop.

**Impact**: Geen UI-blokkering meer op text-heavy pagina's. Vooral merkbaar bij documenten met >5000 text spans.

### Aanbeveling 4: Ascent cache per font-family

**Wat**: Cache de gemeten ascent ratio per `fontFamily` string. Hergebruik voor alle spans met dezelfde font.

**Inspiratie**: `pdf.js/src/display/text_layer.js` — `#ascentCache` (Map).

**Impact**: Voorkomt honderden redundante canvas `measureText()` calls.

### Aanbeveling 5: Volledige transform-matrix in SDK (Langere termijn)

**Wat**: Bewaar de volledige 3×3 PDF text matrix per span in de SDK, in plaats van alleen (x, y, w, h). Voeg `transform: [f64; 6]` toe aan `TextSpanInfo`.

**Inspiratie**: `pdf.js/src/display/api.js` — `TextItem.transform` (array van 6 getallen).

**Impact**: Nodig voor rotatie, italic/shear, en niet-uniforme scaling support.

### Aanbeveling 6: Font metrics uit PDF font descriptor (Langere termijn)

**Wat**: Extraheer `/Ascent`, `/Descent`, `/CapHeight` uit de PDF FontDescriptor dictionary en stuur deze mee met de text extraction data.

**Inspiratie**: PDF specificatie §9.8 (Font Descriptors). De `/Ascent` en `/Descent` waarden zijn de "echte" font metrics (in font units, meestal 1000-upm).

**Impact**: Nauwkeurigere font metrics dan de browser's canvas API. Vooral belangrijk voor non-standaard fonts.

---

---

## 8. Objectieve Validatie Metrics & Bestaande Testinfrastructuur

### 8.1 Bestaande Editor Testinfrastructuur

| Infrastructuur | Locatie | Status |
|---|---|---|
| **Vitest tests** | `tests/*.test.ts` (325 files, 6434 tests) | Actief in CI (`lint-frontend` job) |
| **Playwright E2E** | `tests/e2e/*.spec.ts` (37 files) | ~30 quarantined; 3 actief |
| **Visual snapshots** | `tests/e2e/visual/` (26 PNGs) | Quarantined (stale baselines) |
| **Mock PDF engine** | `src/core/engine/mock/` (11 files) | Actief, gebruikt in unit tests |
| **Test fixtures** | `tests/fixtures/` (3 PDFs: sample-text, sample-xfa, minimal) | Actief |
| **CI/CD** | `.github/workflows/ci.yml`, `core-tests.yml` | Actief (typecheck + lint + tests + e2e + build) |

**Belangrijk**: ~60% van de 325 test files zijn source-level pattern checks (broncode scannen op strings), geen runtime validatie. Dit is onvoldoende om text interaction verbeteringen objectief te meten.

### 8.2 Nodige Nieuwe Testinfrastructuur

Voor het valideren van text interaction verbeteringen hebben we **runtime tests** nodig die écht renderen en meten:

| Nieuwe test | Type | Wat het meet |
|---|---|---|
| `text-positioning-accuracy.test.ts` | Vitest (jsdom) | Span-positionering nauwkeurigheid |
| `text-layer-render-bench.test.ts` | Vitest benchmark | Render tijd per N spans |
| `text-layer-visual.spec.ts` | Playwright | Pixel-exacte text layer alignment vs canvas |
| `font-width-match.test.ts` | Vitest | scaleX compensatie nauwkeurigheid |

### 8.3 Metrics per Aanbeveling

#### Metric E1 — Span-Positionering Nauwkeurigheid (Canvas Width Matching)
- **Doel**: Valideer dat `scaleX` compensatie de DOM span breedte exact matcht met de canvas tekst breedte
- **Huidige staat**: Geen runtime test. Alleen source-level checks dat `TextLayer.tsx` bestaat.
- **Nodig**: Een test die:
  1. Render een `<canvas>` met een bekende font + tekst + grootte
  2. Render een `<span>` met dezelfde tekst, font, grootte
  3. Meet het verschil in breedte met `getBoundingClientRect()`
  4. Pas `scaleX` compensatie toe
  5. Meet opnieuw — verschil moet < 1% zijn
- **Pass/fail**: `|spanWidth - canvasWidth| / canvasWidth < 0.01`
- **Bestaande infra**: `src/core/engine/mock/` voor mock document, `@testing-library/react` of jsdom voor rendering

#### Metric E2 — Baseline Alignment Nauwkeurigheid (Ascent Compensation)
- **Doel**: Valideer dat `top` offset via ascent-compensatie de span exact op de juiste baseline plaatst
- **Huidige staat**: Geen runtime test. Source-level check dat `adjustedTop` code bestaat.
- **Nodig**: Een test die:
  1. Gebruik een bekende font (bijv. Arial 12px) met bekende ascent ratio (~0.8)
  2. Meet de `top` waarde van een span met ascent compensatie
  3. Meet de `top` waarde van een span zonder compensatie
  4. Vergelijk met de canvas baseline positie via `ctx.measureText()`
- **Pass/fail**: `|spanBaselineY - canvasBaselineY| < 1.0px`
- **Bestaande infra**: Canvas 2D API in jsdom of Playwright

#### Metric E3 — Streaming Render Performance
- **Doel**: Valideer dat streaming render de UI niet blokkeert
- **Huidige staat**: Geen performance test voor TextLayer rendering
- **Nodig**: Een test die:
  1. Genereer 10.000 mock text spans
  2. Render met streaming (chunks van 100)
  3. Meet of er geen frame drops zijn (>50ms zonder render)
  4. Vergelijk met niet-streaming render tijd
- **Pass/fail**: Geen frame > 50ms tijdens streaming render, total time wordt niet significant langer
- **Bestaande infra**: `tests/e2e/editor-performance-regression.spec.ts` — kan uitgebreid worden

#### Metric E4 — Visual Text Layer Alignment (Playwright)
- **Doel**: Pixel-exact valideren dat de text layer spans visueel overeenkomen met de canvas tekst
- **Huidige staat**: Visual snapshots bestaan maar zijn quarantined (stale baselines)
- **Nodig**: Een Playwright test die:
  1. Laadt een bekende test-PDF met duidelijke tekst
  2. Maakt een screenshot van alleen de text layer (canvas verborgen)
  3. Maakt een screenshot van alleen de canvas (text layer verborgen)
  4. Overlay de twee screenshots en meet de pixel-afwijking
  5. Draai deze test op een diverse set van 10 test-PDFs met verschillende fonts, groottes, en layout
- **Pass/fail**: `SSIM > 0.95` tussen text layer positie en canvas tekst positie op >90% van de test-PDFs
- **Bestaande infra**: `tests/e2e/visual/` directory, `tests/fixtures/sample-text.pdf`

#### Metric E5 — Font Matching Dekking
- **Doel**: Valideer dat font-matching werkt voor alle 14 PDF Standard Fonts
- **Huidige staat**: `viewer-font-mutation-support.test.ts` test encoding detectie maar niet font-family mapping
- **Nodig**: Een test die:
  1. Test `getEditorFontFamily()` voor alle 14 standard fonts (Helvetica, Times, Courier, Symbol, ZapfDingbats + Bold/Italic/Oblique varianten)
  2. Test subset font prefix stripping (`ABCDEF+Helvetica` → `Helvetica`)
  3. Test fallback gedrag voor onbekende fonts
- **Pass/fail**: Alle 14 fonts resolven naar een CSS font stack, subset prefix correct gestript, unknown font → `system-ui` fallback
- **Bestaande infra**: `src/viewer/text/editorTextSpan.ts` — `getEditorFontFamily()`, bestaande unit tests uitbreiden

#### Metric E6 — Tekstselectie Integriteit
- **Doel**: Valideer dat tekstselectie werkt over de volledige text layer
- **Huidige staat**: Source-level checks dat `handleMouseUp` en `window.getSelection()` bestaan
- **Nodig**: Een Playwright test die:
  1. Laadt een test-PDF met bekende tekst
  2. Simuleert muis-selectie over meerdere regels
  3. Checkt dat `window.getSelection().toString()` de verwachte tekst bevat
  4. Checkt dat de selectie rects correct zijn (PDF coördinaten kloppen)
- **Pass/fail**: Geselecteerde tekst matcht verwachte tekst, selectie rects binnen 2px van canvas tekst positie
- **Bestaande infra**: `tests/e2e/workflows/text-interaction.spec.ts` (quarantined — kan gereactiveerd worden)

#### Metric E7 — Regressie-vrije Uitbreiding
- **Doel**: Bestaande text interactie functionaliteit mag niet breken
- **Huidige staat**: 6434 Vitest tests in CI, maar 60% zijn source-level checks
- **Nodig**: Draai ALLE bestaande tests vóór en na wijzigingen:
  1. `npm run test` (6434 tests — moet 100% passen)
  2. `npm run typecheck` (moet 0 nieuwe errors opleveren)
  3. `npm run lint` (moet slagen)
  4. Bestaande tests die `TextLayer`, `TextInlineEditor`, of `PageCanvas` source code checken moeten **geüpdatet** worden naar runtime tests
- **Pass/fail**: 0 regressies, bestaande source-level checks geüpdatet naar nieuwe code

### 8.4 Test Infrastructuur die Nog Gebouwd Moet Worden

| Infrastructuur | Prioriteit | Beschrijving |
|---|---|---|
| **TextLayer runtime render test** | **Hoog** | Render TextLayer met mock spans in jsdom, meet DOM rects |
| **Canvas-text vergelijkings harness** | **Hoog** | Vergelijk canvas `measureText()` met DOM `getBoundingClientRect()` |
| **Font metrics test dataset** | **Hoog** | Set van 10+ fonts met bekende ascent/descent/width metrics |
| **Text positioning regression suite** | Medium | Per-PDF screenshot comparison van text layer vs canvas |
| **Performance benchmark voor TextLayer** | Medium | Render tijd per 100/1000/5000 spans, met/zonder streaming |
| **Reactiveren E2E text interaction tests** | Medium | Un-quarantinen en updaten van `text-interaction.spec.ts`, `text-edit-flow.spec.ts` |
| **Visual baseline update tooling** | Laag | Script om visual snapshots te regenereren na goedgekeurde wijzigingen |
