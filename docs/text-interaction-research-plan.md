# Onderzoeksplan: Native Tekstinteractie in PDFluent

## Doel

Grondig onderzoeken hoe toonaangevende PDF-viewers tekstinteractie implementeren, met als doel inzichten te verzamelen die PDFluent's tekstinteractie kunnen verbeteren. Het gewenste resultaat is dat tekstbewerking in PDFluent net zo native aanvoelt als in Adobe Acrobat en de Chromium PDF-viewer.

**Scope**: Alleen onderzoek en documentatie. Geen code-implementaties.

---

## Te onderzoeken systemen

### 1. Adobe Acrobat Web (`acrobat.adobe.com`)
Adobe's webgebaseerde PDF-editor voelt volledig native aan — alsof je direct met HTML interacteert.

**Onderzoeksvragen:**
- Hoe is de meerlaagsarchitectuur precies opgebouwd? (WASM engine, bitmap rendering, SVG overlays, Jot editor)
- Hoe werkt de Jot rich-text editor? Welke DOM-structuur gebruikt hij?
- Hoe worden PDF fonts gemapt naar browser fonts? Wat zijn de font metrics?
- Hoe worden SVG bounding boxes gepositioneerd? Welke coordinate conversies vinden plaats?
- Hoe werkt tekstselectie en copy/paste op character-niveau?
- Wat doet de WASM engine precies? Hoe communiceert hij met de frontend?
- Welke performance optimalisaties zijn zichtbaar? (lazy loading, virtualisatie?)
- Hoe werkt de SpellCheckerOverlay? Hoe detecteert hij spelfouten?

**Bronnen:**
- DOM inspectie via browser devtools (Elements tab, Network tab)
- JavaScript source maps en module names (bijv. `dc-rendition-provider`, `dc-jot-component`)
- Network requests analyse (welke assets worden geladen?)
- WebAssembly module analyse (welke functies exporteert de WASM?)

### 2. PDF.js (Mozilla, open source)
Mozilla's open-source PDF-viewer, gebruikt door Firefox. De standaardreferentie voor browsergebaseerde PDF-weergave.

**Onderzoeksvragen:**
- Hoe werkt de transparante text layer precies? Welke DOM-elementen, welke CSS?
- Hoe worden PDF-coordinaten geconverteerd naar CSS percentages? Wat is de matrix math?
- Hoe wordt font-matching gedaan? De canvas `measureText()` aanpak in detail.
- Hoe werkt tekstselectie over meerdere pagina's? Het `endOfContent` mechanisme.
- Wat zijn ALLE performance optimalisaties? (streaming, ascent cache, monomorphic shapes, etc.)
- Hoe wordt rotatie, RTL, en verticale CJK tekst afgehandeld?
- Hoe werkt find-in-page highlighting? De `TextHighlighter` class.
- Wat is de exacte data flow van PDF parsing tot DOM render?
- Welke beperkingen worden expliciet genoemd in de code? (comments, warnings)

**Bronnen:**
- `src/display/text_layer.js` — kern text layer engine
- `src/display/text_layer_builder.js` — viewer wrapper
- `web/text_layer_builder.css` — de volledige CSS
- `web/text_highlighter.js` — find-in-page
- `src/display/page_viewport.js` — coordinate systeem
- `src/shared/util.js` — `Util.transform`, hulpfuncties
- `src/display/display_utils.js` — `OutputScale`, `setLayerDimensions`

### 3. Chromium PDF Viewer (Google, open source)
Chrome's ingebouwde PDF-viewer, gebaseerd op PDFium (C++).

**Onderzoeksvragen:**
- Hoe werkt de architectuur? Wat is de JS/C++ scheiding?
- Het `<embed type="application/x-google-chrome-pdf">` element — hoe werkt dit?
- Hoe communiceert de JS viewer met de PDFium plugin? Message passing protocol.
- Hoe werkt tekstselectie op plugin-niveau? `PDFiumRange`, `GetScreenRects()`.
- Wat zijn de C++ level performance optimalisaties? Progressive painting, page unloading.
- Hoe werkt de viewport? De `Viewport` class in TypeScript.
- Hoe worden coordinaten getransformeerd? De 4-space systeem (PDF → Screen → Device → Document).
- Is er een tekstextractie laag? Hoe wordt `FPDFText_GetCharIndexAtPos()` gebruikt?
- Welke accessibility features zijn er? Screenreader support.

**Bronnen:**
- `pdf/pdfium/pdfium_engine.cc` / `.h` — de PDFium engine
- `pdf/pdfium/pdfium_range.cc` / `.h` — tekst selectie ranges
- `pdf/pdfium/pdfium_page.h` — pagina rendering en tekstextractie
- `pdf/draw_utils/coordinates.h` — coordinate systemen
- `chrome/browser/resources/pdf/pdf_viewer.ts` — de JS viewer
- `chrome/browser/resources/pdf/controller.ts` — JS/plugin communicatie
- `pdf/pdf_view_web_plugin.cc` — de plugin integratie

---

## Vergelijkingsdimensies

Voor elk systeem documenteren we:

### A. Architectuur
- Lagenopbouw (canvas, text layer, annotation layer, etc.)
- Data flow (van PDF bytes tot zichtbare tekst)
- Component diagram (welke modules praten met elkaar?)

### B. Coordinate systemen & positionering
- Origine, eenheden, Y-richting per laag
- Transformatiematrices
- Conversie formules

### C. Font rendering & matching
- PDF font → browser font mapping
- Breedte-compensatie technieken
- Ascent/descent/leading afhandeling
- Minimum font-size workarounds

### D. Tekstselectie
- Selectie mechanisme (DOM vs native)
- Multi-page selectie
- Copy/paste met correcte Unicode
- Ligature/encoding afhandeling

### E. Performance
- Lazy loading strategieën
- Caching mechanisms
- Chunk size optimalisaties
- Memory management

### F. Speciale gevallen
- Rotated text
- RTL / Bidi text
- Vertical CJK text
- Drop caps / complexe layouts

---

## Onderzoeksmethode

1. **Broncode ophalen**: Via `git clone` of raw GitHub URLs de relevante source files downloaden
2. **Statische analyse**: Code lezen, functies traceren, data flow in kaart brengen
3. **Vergelijkende analyse**: Per dimensie de drie systemen naast elkaar leggen
4. **PDFluent gap analysis**: Wat hebben zij wel en wij niet? Waarom?
5. **Documentatie**: Alles vastleggen in `docs/text-interaction-research-findings.md`

## Deliverable

Eén uitgebreid document: `docs/text-interaction-research-findings.md` met:
- Per systeem een diepgaande architectuurbeschrijving
- Vergelijkingstabellen per dimensie
- PDFluent gap analysis
- Concrete aanbevelingen (wat kunnen we leren?)
- Code snippets en referenties naar originele bronbestanden
