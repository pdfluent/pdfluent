# AcroForms als first-class documenttype — ontwerp & implementatievoorstel

> Interne ontwerpnotitie (2026-06-12). Vervolg op en verdieping van
> `acroform-rendering-and-active-content-banner.md`. Referentie- en
> acceptatiebestand: `verz_betalingsreg_betaling_ondernemers_ov1352o27fol.pdf`
> (Belastingdienst OV 135: 11 pagina's, 289 invulbare velden — 255 tekst
> waarvan **163 comb**, 34 **radio-groepen**, 15 readonly — ~600 JS-acties,
> volledig vector, geen XFA). Doel: een eindgebruiker krijgt hetzelfde gevoel
> als in Adobe Acrobat Reader / Apple Preview — direct openen, direct
> invullen, scherp renderen, logisch opslaan, minimale verwarring.
> **Geen code gewijzigd; dit is het onderzoeks- en planningsdocument.**

## 0. Samenvatting

AcroForms zijn vandaag in PDFluent een tweederangs documenttype: de pagina
rendert de velden als platte (gele) bitmap, invullen kan alleen in een
feitelijk onvindbare "Formulier"-modus, een alarmerende banner suggereert
gevaar zonder iets te beveiligen, ingevulde waarden komen niet in het
gerenderde beeld of betrouwbaar in het opgeslagen bestand terecht, en de
scherpte wisselt per zoom-pad. **Geen van deze problemen zit in de SDK** — de
benodigde bouwstenen (veldenboom, appearance-generatie incl. comb,
radio-groepssemantiek, maxLen-inheritance) bestaan al en worden simpelweg niet
of half gebruikt door de editor-laag.

De kern van het voorstel:

1. **Invullen hoort bij lezen.** De bestaande `FormFieldOverlay` is al
   ontworpen voor coëxistentie (container is pointer-transparant buiten
   velden). Render hem standaard in leesmodus op alle zichtbare pagina's;
   "Formulier" als modus wordt overbodig voor AcroForms.
2. **Waarde-schrijven moet de PDF écht bijwerken**: `/V` + appearance-stream
   (`/AP`) + `/AS` voor knoppen, via de bestaande SDK-functies. Daarna de
   pagina her-rasteren (bestaand `renderRevision`-mechanisme).
3. **Beveiligingsmeldingen koppelen aan echte capabilities op het moment van
   gebruik** — niet aan het openen van een document. Veld-JS is bij ons inert
   en verdient geen waarschuwing; URI-links verdienen een
   toestemmingsmoment-bij-klik (met "altijd toestaan"-toggle); launch/submit
   blijven geblokkeerd.
4. **Scherpte deterministisch maken**: de quality-render moet altijd naar de
   exacte schaal convergeren; gemeten is dat de huidige hysterese de scherpte
   pad-afhankelijk maakt (tot 33% upscaling, afhankelijk van hoe je op een
   zoomniveau belandt).

---

## 1. RQ1 — Waarom bestaat er een aparte Form Mode, en kan die weg?

### 1.1 Waarom de architectuur zo gekozen is

Het modussysteem (`read / review / edit / sign / organize / forms / protect /
convert`, [`types.ts:9`](../../src/viewer/types.ts)) is een
**pointer-intent-arbitragesysteem**. Dat is geen gok: het is expliciet
gedocumenteerd in
[`textInteractionRules.ts`](../../src/viewer/text/textInteractionRules.ts) —
per modus is vastgelegd welke laag de muis "bezit" (tekst-targeting,
annotaties, velden, handtekening-plaatsing), juist om te voorkomen dat
hover-affordances elkaar overschreeuwen. `forms` betekent daar: "Form field
affordances have priority over text blocks."

`FormFieldOverlay` is later (commit `5002d07`, 2026-03-18, #96) **in** die
bestaande structuur gehangen: "Visible only in forms mode; fields filtered by
current pageIndex." De keuze voor modus-gating was dus een conservatieve
integratiekeuze binnen een al bestaand arbitragemodel — niet een technische
noodzaak van het invullen zelf.

### 1.2 Wat er feitelijk van Form Mode afhangt

| Component | Afhankelijkheid | Bij first-class invullen |
|---|---|---|
| [`ViewerApp.tsx:1527`](../../src/viewer/ViewerApp.tsx) | rendert overlay alleen bij `mode==='forms'` én `isCurrentPage` | gate vervangen door "document heeft velden" (alle zichtbare pagina's) |
| [`ModeToolbar.tsx:408`](../../src/viewer/components/ModeToolbar.tsx) | veld-navigator (x/N teller) alleen in forms-modus | verplaatsen naar formulierbalk of rechterpaneel |
| [`RightContextPanel.tsx:2111`](../../src/viewer/components/RightContextPanel.tsx) | formulier-paneel (veldenlijst, typelabels) | blijft; opent contextueel i.p.v. modusgebonden |
| [`useKeyboardShortcuts.ts:268,374`](../../src/viewer/hooks/useKeyboardShortcuts.ts) | sneltoets '6'; veldnavigatie alleen in forms-modus | veldnavigatie activeren zodra een veld focus heeft |
| [`textInteractionRules.ts:109`](../../src/viewer/text/textInteractionRules.ts) | tekst-hover onderdrukt in forms-modus | onnodig: DOM-stacking regelt prioriteit (zie 1.3) |
| `AllToolsPanel`, `ModeSwitcher`, `modeConsistencyValidator` | bieden/valideren de modus | entry kan vervallen of "Formulier" wordt paneel |

**De vindbaarheids-bug die dit urgent maakt:** de geshipte V3-shell
(`EditorV3Shell.tsx`) heeft een eigen panel-systeem met
`PANEL_TO_MODE`-mapping ([`:205`](../../src/viewer/v3/EditorV3Shell.tsx)) — en
daar zit **geen forms-panel in**; `ModeSwitcher` (met de Formulier-tab) wordt
in de V3-shell **nergens gerenderd**. Formulier-modus is dus alleen bereikbaar
via sneltoets `6` of de command palette. Voor een eindgebruiker bestaat
invullen feitelijk niet — precies de geobserveerde ervaring.

### 1.3 Risico's van standaard-interactieve formulieren

1. **Pointerconflicten met tekstinteractie** (dubbelklik-naar-bewerken,
   tekstselectie). Beperkt: de overlay-container heeft al
   `pointerEvents:'none'` met `'auto'` alleen op de veld-elementen
   ([`FormFieldOverlay.tsx:75`](../../src/viewer/components/FormFieldOverlay.tsx))
   — buiten velden klikt alles door naar de canvas. Binnen een veld-rect wint
   het veld; dat is exact het Acrobat/Preview-gedrag. Restrisico: tekst die
   ónder een veld-rect ligt is niet meer selecteerbaar — in Acrobat/Preview
   ook niet; acceptabel.
2. **Conflict met annotatie-tekentools.** Bestaande regel volstaat: een
   actieve tekentool onderdrukt alle andere interactie
   (`textInteractionRules.ts:83`); dit ook op de overlay toepassen
   (overlay krijgt `pointerEvents:'none'` zolang een tekentool actief is).
3. **Performance** (referentiebestand: 289 velden / 11 pagina's ≈ 26 inputs
   per pagina). Met render-window (±renderRadius) en alleen-zichtbare
   pagina's is dit verwaarloosbaar; React-elementen van deze orde zijn
   routine.
4. **Per-ongeluk-wijzigen.** Mitigatie: wijziging markeert dirty + undo werkt
   al (`useFormFields` pusht undo-commands); plus zichtbare "gewijzigd"-status
   en Esc om veldfocus te verlaten.

### 1.4 Expliciet antwoord

**Ja — Form Mode kan verdwijnen voor AcroForms.** Invullen wordt een
eigenschap van het document (velden aanwezig → velden actief), niet van een
modus. Het modussysteem zelf blijft bestaan voor de overige werkstromen
(edit/review/sign/…): die arbitrage is gezond. Concreet:

- **P0**: overlay loskoppelen van `mode==='forms'` (renderconditie wordt
  `formFields.length > 0`), forms-modus blijft bestaan maar is niet meer
  nodig om in te vullen.
- **P1**: veld-navigator verhuist naar een formulierbalk/paneel; de
  "Formulier"-entry verdwijnt uit ModeSwitcher/AllTools/sneltoets `6`
  (of blijft als alias die alleen het paneel opent).
- Wat dan nog ontbreekt is geen modus, maar de kwaliteit van de overlay zelf
  (zie §5): comb, radio-groepen, opties, appearance-sync.

---

## 2. RQ2 — Doel-UX: Acrobat/Preview-gevoel

### 2.1 Openen & herkennen

1. Document opent zoals elk ander — geen modal, geen blokkade, geen
   "Geblokkeerd"-badge.
2. Bij `get_form_fields().length > 0` verschijnt een rustige
   **formulierbalk** (één regel, niet-blokkerend, zelfde plek als de huidige
   banner): *"🧾 Invulbaar formulier — 289 velden. Automatische berekeningen
   uit Adobe worden niet uitgevoerd."* met rechts twee affordances:
   **[Velden markeren]** (toggle, Acrobat's "Highlight Existing Fields") en
   **[Eerste veld]**.
3. Velden zijn **direct** klikbaar — geen kennis van modi nodig. De
   rasterized veld-achtergrond (geel, uit de PDF zelf: 341× `/BG`) blijft
   gewoon zichtbaar als het "rustende" uiterlijk, identiek aan Acrobat.

### 2.2 Veldfocus & muis

- Hover boven een veld: cursor `text` (tekstveld) of `pointer`
  (checkbox/radio); subtiele rand-highlight.
- Klik: veld krijgt focus; focusring (accentkleur) + lichte
  achtergrond-oplichting; bestaande waarde wordt geselecteerd zoals in
  Acrobat (typ-om-te-vervangen).
- Buiten een veld klikken = normale lees-interactie (selectie, dubbelklik
  naar tekstbewerking) — werkt al door de pass-through-container.
- Readonly velden (15 in het referentiebestand): geen focus, cursor
  `default`, 65% opacity (bestaand gedrag), tooltip "Alleen-lezen veld".

### 2.3 Toetsenbord

| Toets | Gedrag |
|---|---|
| `Tab` / `Shift+Tab` | volgend/vorig veld in **documentvolgorde over pagina's heen** (sorteer op `pageIndex`, dan Y aflopend, dan X — of expliciete tab-order indien aanwezig); autoscroll brengt het veld in beeld. Huidige overlay wrapt binnen één pagina — moet documentbreed worden. |
| `Spatie` | checkbox/radio togglen resp. selecteren (focusveld) |
| `Pijltjes` | binnen een radio-groep: selectie verplaatsen (standaard HTML-radiogedrag, mits correcte groepering via `name`) |
| `Enter` | in eenregelig tekstveld: commit + naar volgend veld (Acrobat-gedrag); in multiline: nieuwe regel |
| `Esc` | veldfocus verlaten, terug naar document (waarde blijft zoals bij blur) |
| `⌘S` | opslaan (bestaand) |

### 2.4 Specifieke veldtypen

- **Radio-groepen (34 stuks)**: één logisch veld met meerdere widgets; klik op
  widget X ⇒ groepswaarde = on-state van X (export value), alle andere
  widgets uit. Backend heeft hiervoor al `pdf_forms::button::select_radio` +
  `on_state_name`; de overlay moet per wídget renderen (alle kid-rects!) met
  HTML `name=<groepsnaam>` zodat pijltjes/exclusiviteit native werken.
  *Huidige staat: backend levert per groep één rect en de overlay togglet een
  boolean — èn door ontbrekende type-mapping (zie 2.6) renderen radio's nu
  zelfs als tekstinput.*
- **Checkboxes**: toggle naar on-state/"Off" (`toggle_checkbox` bestaat).
  Het referentiebestand heeft er 0, maar algemene PDF's wel.
- **Comb-velden (163 stuks — BSN, IBAN, bedragen)**: vaste celverdeling
  (`/MaxLen` verplicht aanwezig, SDK kent `effective_max_len`).
  Overlay-rendering: monospaced invoer met `letter-spacing` afgestemd op
  `breedte/maxLen` zodat tekens in de voorgedrukte hokjes vallen, `maxLength`
  afgedwongen. Opslag-appearance per cel doet de SDK al
  (`generate_text_appearance`, comb-tak).
- **Choice (combo/list)**: opties uit `FormFieldOption{export,display}`
  (backend levert ze al) als `<option>`-children renderen — ontbreekt nu
  volledig in de overlay (lege `<select>`).
- **Multiline tekst**: `<textarea>` bij `/Ff` multiline-bit (bit 13) —
  vereist dat de backend die flag exporteert (nu niet).

### 2.5 Opslaan

- Elke veldwijziging: commit op blur/Enter → `set_form_field_value` →
  dirty-markering + undo-stap (bestaat al) → **pagina-bitmap vernieuwen**
  (renderRevision-bump, bestaand mechanisme) zodat het document toont wat er
  echt in de PDF staat — het ultieme "opslaan werkt vanzelfsprekend"-signaal.
- `⌘S` schrijft naar het geopende pad; Save As-flow bestaat
  (`useFormFields.handleSaveAs` incl. veld-validatie vóór opslaan).
- Acceptatie-eis: het opgeslagen bestand toont de waarden in **Preview,
  Acrobat en Chrome** (vereist appearance-sync, §5.3 — vandaag niet
  gegarandeerd).

### 2.6 Bekende UX-blokkers in de huidige keten (op te lossen, zie roadmap)

1. Backend `FormFieldInfo.field_type` kent alleen
   `text|button|choice|signature|unknown`; nergens (ook niet in
   [`tauri-api.ts:136`](../../src/lib/tauri-api.ts)) wordt `button` →
   `checkbox`/`radio` vertaald, terwijl overlay en model
   (`model.ts:241`) op die fijnere typen rekenen ⇒ radio's vallen door naar
   het tekstinput-pad.
2. Overlay rendert alleen het huidige-pagina-deel (`isCurrentPage`) ⇒ Tab
   over pagina's onmogelijk.
3. Geen comb/maxLen/multiline-metadata over de draad.
4. Vaste fontmaat `12×zoom` i.p.v. veld-DA-fontmaat (incl. auto-size 0).

---

## 3. RQ3 — Actieve-inhoud-banner: risico's, werkelijkheid en voorstel

### 3.1 Wat er vandaag werkelijk kan gebeuren (capability-inventaris)

| Inhoudstype | In referentiebestand | Voert PDFluent het uit? | Feitelijk risico vandaag |
|---|---|---|---|
| Veld-JavaScript (validatie/berekening/zichtbaarheid, `/AA` 342×, 597 acties) | ja | **nee** — er is geen JS-engine | **geen** |
| `/OpenAction` (JS bij openen) | 1× | nee | geen |
| URI-acties (links, 12×) | ja | **nee** — link-annotaties zijn niet aanklikbaar; geen `shell.open` in de frontend; `Link` ontbreekt zelfs in de annotatietype-mapping ([`pdf_engine.rs:655-671`](../../src-tauri/src/pdf_engine.rs)) | geen (maar ook: verwachte functionaliteit ontbreekt) |
| `/Launch` (programma starten) | 0× | nee, niet geïmplementeerd | geen |
| `/SubmitForm` (data versturen) | 0× | nee | geen |
| Formulier invullen | 289 velden | half (forms-modus) | geen — lokale bewerking, geen netwerk |

**Conclusie:** de banner gate't *niets*. De drie knoppen schrijven alleen een
localStorage-voorkeur ([`ViewerApp.tsx:1020`](../../src/viewer/ViewerApp.tsx))
die nergens wordt geconsumeerd. Het is dus geen beveiligingsmaatregel maar een
melding die risico suggereert waar geen capability bestaat — en de meest
permissieve knop ("Alle documenten vertrouwen") is nota bene de visuele
primary. Wat gebruikers wél verwachten — invullen, links die werken — wordt er
niet door geleverd.

### 3.2 Principe

> **Toestemming hoort bij een capability op het moment van gebruik, niet bij
> het openen van een document.** Geen capability ⇒ geen vraag.

Zo doen de referentie-apps het ook: Preview opent dit formulier zonder één
melding (JS negeert het stil); Acrobat toont hooguit een gele
informatiebalk en vraagt pas iets bij een handeling met echt effect
(verbinding, submit).

### 3.3 Voorstel per categorie

| Categorie | Behandeling | Onderbouwing |
|---|---|---|
| **AcroForm + veld-JS** (validatie, berekeningen, visibility) | **Geen melding.** Informatief regeltje in de formulierbalk: "Automatische berekeningen worden niet uitgevoerd." | Wij voeren niets uit ⇒ er valt niets te vertrouwen. Het enige eerlijke bericht is functioneel (pariteit met Preview, dat ook geen JS draait en ook niets vraagt). |
| **URI-links** | **Informatief + toestemming op klikmoment**: links worden klikbaar (P1); bij klik tooltip/statusbalk met de échte URL; eerste klik per document → klein bevestigingsdialoog "Open <url> in je browser?" met **[Eén keer] [Altijd voor links]**. "Altijd" zet de persistente voorkeur aan; daarna toont de formulierbalk een **zichtbare toggle** ("Links automatisch openen ●") die het weer uitzet. | Het echte risico (phishing/tracking) ontstaat op het moment van openen van de URL — daar hoort de beslissing. Zichtbare, omkeerbare toggle conform het eerder afgesproken voorkeursmodel. |
| **Launch / SubmitForm / ingesloten uitvoerbare inhoud** | **Altijd blokkeren.** Geen open-banner; pas als de gebruiker zo'n actie aanklikt een uitleg-toast: "PDFluent voert programma-/verzendacties uit PDF's niet uit." | Capability bestaat niet en hoort er voor een privacy-first editor ook niet zomaar te komen; melden bij gebruik voorkomt zowel theater als stille verwarring. |
| **Toekomstige JS-engine** (berekeningen draaien) | Aparte, expliciete opt-in per document zodra die capability echt bestaat (gesandboxed, geen netwerk/filesystem). | Dan is er pas iets om toestemming voor te vragen. |

De huidige `ActiveContentInfo`-detectie ([`pdf_engine.rs:60`](../../src-tauri/src/pdf_engine.rs))
blijft waardevol — niet voor een banner maar als datamodel voor het
document-info-paneel ("Bevat: formulier, links, scripts (inactief)") en voor
de klik-moment-beslissingen hierboven. De bestaande localStorage-sleutels
(`pdfluent.activeContent.*`) kunnen één-op-één hergebruikt worden voor de
link-voorkeur.

---

## 4. RQ4 — Scherpte: metingen en conclusie

### 4.1 Methode

- Apparaat: ingebouwd Liquid Retina XDR (3456×2234 fysiek, 1728×1117 logisch
  ⇒ DPR exact 2).
- Per zoomniveau (100→300%, via ⌘0/⌘−/⌘=) is dezelfde kopregio van pagina 1
  pixel-true vastgelegd met `screencapture -R` (native 2×; bestanden in
  `docs/analysis/assets/sharpness/`). Preview als referentie op vergelijkbare
  tekstgrootte. Na elke zoomstap 3s wachttijd (ruim boven de 120/180
  ms-debounces).
- Metriek per beeld: gemiddelde **randovergangsbreedte** (aantal
  grijspixels per licht→donker-overgang op horizontale scanlijnen; lager =
  scherper) en **piekgradiënt** (95e percentiel |∂x|; hoger = scherper),
  n = 1.094–3.244 randen per meting.

### 4.2 Resultaten

| Meting (pad: oplopend vanaf 100%) | Verwachte backing → benodigde schaal | Voorspelde upscale | Piekgradiënt (↑ = scherp) | Gem. randbreedte |
|---|---|---|---|---|
| PDFluent 100% | 2.0 → 2.0 | 0% | 0,745 | 0,70 px |
| PDFluent 150% | 3.0 → 3.0 | 0% | **0,875** | **0,53 px** |
| PDFluent 200% | **blijft 3.0** → 4.0 | **33%** | 0,710 | 0,81 px |
| PDFluent 225% | verse fast 4.0 → 4.5 | 12,5% | **0,882** | **0,57 px** |
| PDFluent 250% | blijft 4.0 → 5.0 | **25%** | 0,671 | 0,87 px |
| PDFluent 300% | quality 5.5 (via 275%) → 6.0 | 9% (+ grootste glyphs) | 0,553 | 1,17 px |
| **Preview** (referentie) | n.v.t. (PDFKit, altijd exact) | 0% | **0,969** | **0,42 px** |

### 4.3 Evidence-based conclusie

1. **De hysterese-theorie is bevestigd, maar moet worden aangescherpt: het
   kwaliteitsverlies is pad-afhankelijk, niet alleen zone-afhankelijk.** De
   1,35×-drempel ([`useRenderedCanvas.ts:235,246`](../../src/viewer/hooks/useRenderedCanvas.ts))
   vergelijkt steeds met de *laatst gerenderde* schaal, dus dezelfde
   zoomstand is soms scherp en soms wazig afhankelijk van de route ernaartoe.
   Gemeten: 200% bereikt vanaf 150% is 33% ondergesampled (gradiënt zakt
   0,88→0,71), terwijl 225% — één stap verder — weer bijna scherp is (0,88)
   omdat de drempel daar nét overschreden wordt en een verse render afdwingt.
   Dit verklaart de "soms heel pixelig"-ervaring beter dan een vaste dode
   zone: gebruikers belanden via verschillende paden in verschillende
   kwaliteitstoestanden op identieke zoomniveaus.
2. **Hoe groot is het verschil werkelijk?** Binnen PDFluent scheelt
   pad-geluk ~25% in piekgradiënt (0,88 vs 0,67) op dezelfde inhoud. Preview
   ligt met 0,969 nog eens ~10% boven ónze beste toestand en 40–75% boven
   onze slechte toestanden — consistent op élke zoom, omdat PDFKit altijd op
   exacte schermresolutie her-rastert.
3. **Is de hysterese-theorie volledig voldoende?** Grotendeels — alle
   metingen sporen met de keten-voorspellingen — met twee kanttekeningen:
   (a) de 300%-meting is vervuild door een glyfgrootte-confound van de
   scanlijn-metriek (grotere letters ⇒ meer bijna-horizontale randpixels),
   dus de exacte restafwijking daar is minder hard; (b) de fast-cap 4.0 in
   combinatie met de quality-voorwaarde `> 1,35×` betekent dat de
   quality-pass (tot 12.0) in de praktijk zelden vuurt — tussen 200% en 270%
   per definitie nooit. Code en meting wijzen op dezelfde fix.

### 4.4 Fix-ontwerp

1. **Convergentie-garantie**: de quality-pass (180 ms na rust) her-rendert
   altijd zodra `bucket(zoom×DPR) ≠ renderedScale` — de 1,35×-drempel blijft
   alleen voor de *fast*-pass tijdens actieve gestures en voor downscale
   (supersampled laten staan is prima). Bitmap-cache + debounce vangen de
   kosten; renders zijn ~15–25 ms warm.
2. **Caps DPR-bewust**: fast-cap `4.0 × (DPR/2)` of simpelweg quality leidend
   maken; de 12.0-quality-cap blijft als geheugenplafond (A4 bij 12.0 ≈ 245 MB
   RGBA — binnen het bestaande 256 MB-cachebudget, maar net; overweeg 8.0).
3. Optioneel polijsten: tijdens de gesture de bestaande bitmap met
   CSS-transform schalen (standaard PDF.js-aanpak) zodat de tussentoestand
   nooit "springt".
4. **Validatieprotocol**: geautomatiseerde her-meting van §4.2 (zelfde
   screencapture + metriek) op DPR 1 en DPR 2, alle paden ≤5% upscale in
   rust.

---

## 5. RQ5 — Veldrendering: lagen, verschillen, pariteit

### 5.1 Welke laag gebruikt Preview (vermoedelijk)

PDFKit rastert de pagina-inhoud en tekent **widget-annotaties als eigen
interactieve laag** met een eigen uiterlijk (witte vlakken, blauwe
focus/markering — het negeert de gele `/BG` uit `/MK`). De velden zijn echte
accessibility-objecten: een AX-hit-test op het IBAN-veld gaf
`text field 1 of group … of Preview` terug. Het is dus géén
HTML-over-bitmap maar native views/drawing — functioneel equivalent aan een
overlay-architectuur: rasterlaag + losse interactieve veldlaag.

### 5.2 Welke laag gebruikt PDFluent

- **Rasterlaag**: de SDK rastert mét annotaties
  (`render_annotations: true`, [`pdf_engine.rs:592`](../../src-tauri/src/pdf_engine.rs)),
  dus inclusief de widget-`/AP`-streams → de gele vlakken zitten ín de
  paginabitmap (zo ziet Acrobat het overigens ook — geel is het ontwerp van
  het formulier zelf).
- **Interactielaag**: `FormFieldOverlay` (HTML-inputs over de canvas), maar
  alleen in forms-modus, alleen huidige pagina, en met de gaten uit §2.6.

### 5.3 De ontbrekende schakel: appearance-sync bij schrijven

[`set_form_field_value`](../../src-tauri/src/pdf_engine.rs) schrijft nu
alleen `/V` (literal string) in de lopdf-dict. Er wordt **geen**
`/AP`-appearance gegenereerd, **geen** `/AS` gezet voor knoppen en **geen**
`NeedAppearances` gezet. Gevolgen: de her-gerasterde pagina toont de oude
(lege) appearance; andere viewers tonen het opgeslagen bestand mogelijk leeg;
radio-groepen kunnen visueel niet eens omschakelen. Terwijl de SDK alles
heeft: `pdf_forms::appearance::generate_appearance` (één call voor
tekst/comb/checkbox/radio), `button::select_radio`/`toggle_checkbox` (met
on-state-names), `tree::effective_max_len`. Die functies worden vandaag
alleen door de flatten-pijplijn en SDK-tests gebruikt — de editor moet ze
gaan aanroepen en de resultaten (`/V`, `/AP`, `/AS`) naar lopdf
terugschrijven, met `NeedAppearances=true` als vangnet voor exotische velden.

### 5.4 Kan Preview-pariteit zonder grote SDK-wijzigingen? **Ja.**

- **Optie A (aanbevolen, P0/P1 — nul SDK-wijzigingen):** bitmap blijft de
  rustende weergave (geel, mét door §5.3 actuele waarden); de HTML-overlay
  levert focus, invoer en toetsenbord. Na commit bitmap verversen
  (renderRevision). Veld-tekst is dan zo scherp als de pagina zelf — met de
  §4-fix dus exact.
- **Optie B (P2-verfijning, kleine SDK-wijziging):** een
  `skip_widget_annotations`-vlag in de interpreter naast het bestaande
  precedent `skip_signature_widgets`
  ([`pdf-interpret/interpret/mod.rs:229+`](file:///Users/jasperdewinter/Documents/XFA/crates/pdf-interpret/src/interpret/mod.rs)) —
  velden volledig DOM-gerenderd (à la Preview: eigen stijl, perfecte
  scherpte op elke zoom, focus-states los van de bitmap). Dit is een
  ~kleine, patroon-volgende toevoeging, geen architectuurwijziging.

---

## 6. RQ6 — Implementatie-roadmap (alleen AcroForms; XFA expliciet buiten scope)

> Omvang: S ≈ ≤1 dag, M ≈ 2–4 dagen, L ≈ ≥1 week. Volgorde binnen P0 is de
> aanbevolen uitvoeringsvolgorde; 1–3 vormen samen de kern "invullen werkt
> écht".

### P0 — must-have voor releasekwaliteit

| # | Werk | Impact | Risico | Afhankelijkheden | Omvang |
|---|---|---|---|---|---|
| 1 | **Backend waarde-pijplijn compleet**: `set_form_field_value` → `pdf-forms` set_value + `generate_appearance` + `/AP`/`/AS`-writeback (`select_radio`/`toggle_checkbox` voor knoppen) + `NeedAppearances`-vangnet; daarna renderRevision-bump zodat de bitmap de echte staat toont | Ingevulde waarden zichtbaar in PDFluent én elk extern programma — de kern van "opslaan werkt logisch" | Laag: SDK-functies bestaan en zijn getest; writeback-patroon (lopdf) bestaat al voor `/V` | geen | **M** |
| 2 | **`FormFieldInfo` verrijken**: `button_kind` (checkbox/radio), on-state/export per widget, álle widget-rects van een groep, `max_len`, comb-/multiline-flags, DA-fontmaat; mapping naar frontend-typen + drift-guard-test (patroon TextSpanInfo bestaat) | Radio's/comb/choice kunnen überhaupt correct renderen; heft §2.6-blokkers op | Laag; wire-contract-discipline is er al | — | **S/M** |
| 3 | **Overlay first-class**: renderen bij `formFields.length>0` in leesmodus, op alle zichtbare pagina's; radio-groepssemantiek (HTML `name`, klik = export value); `<option>`-children voor choice; `maxLength`; focus/Enter/Esc-gedrag uit §2 | "Direct openen, direct invullen" — het Acrobat-gevoel | Middel: pointer-coëxistentie met dubbelklik-bewerken testen (ontwerp staat in §1.3) | 1, 2 | **M** |
| 4 | **Scherpte-convergentie** (§4.4-1/2): quality-pass altijd naar exacte bucket; caps DPR-bewust | Scherp op elk zoom-pad; grootste zichtbare kwaliteitswinst buiten formulieren ook | Laag; geïsoleerd in `useRenderedCanvas` | — | **S** |
| 5 | **Banner vervangen door capability-model** (§3.3): open-banner weg; formulierbalk met veldenteller, "Velden markeren", berekeningen-disclaimer; launch/submit-uitleg bij interactie | Geen vals alarm; formulier wordt uitgenodigd i.p.v. ontmoedigd | Laag | 3 (formulierbalk) | **S/M** |
| 6 | **Acceptatietest op referentieformulier** (checklist §7) als geautomatiseerde+handmatige gate | Borgt het doel; voorkomt regressie | — | 1–5 | **S** |

### P1 — sterke verbetering

| # | Werk | Impact | Risico | Afhankelijkheden | Omvang |
|---|---|---|---|---|---|
| 7 | **Comb-velden in de overlay**: letter-spacing per cel + maxLength (163 velden in het referentiebestand!) | Invoer valt in de hokjes; zonder dit voelt het rommelig | Laag | 2 | **S/M** |
| 8 | **Documentbrede Tab-navigatie** + autoscroll + veld-navigator in formulierbalk/paneel; forms-modus-entry verwijderen (RQ1-besluit) | Toetsenbord-invullen van 289 velden zonder muis | Laag | 3 | **M** |
| 9 | **URI-links activeren** met klik-toestemming + "altijd"-toggle (§3.3) — incl. `Link`-subtype in annotatie-mapping | Links werken (verwachting), risico op het juiste moment belegd | Middel (nieuwe capability — zorgvuldige copy) | 5 | **M** |
| 10 | **Save-flow polish**: bestandsnaamsuggestie "…-ingevuld.pdf" bij Save As; statusregel "N velden ingevuld"; flatten-optie bij export | Logisch opslaan, deelbaarheid | Laag | 1 | **S** |
| 11 | **DA-fontmaat + auto-size** in overlay-inputs (i.p.v. vaste 12×zoom) | Visuele continuïteit tussen typen en resultaat | Laag | 2 | **S** |

### P2 — later

| # | Werk | Impact | Risico | Afhankelijkheden | Omvang |
|---|---|---|---|---|---|
| 12 | `skip_widget_annotations`-rendervlag (SDK, klein; precedent bestaat) + volledig DOM-gerenderde velden met eigen focus-stijl | Preview-niveau veld-esthetiek, perfecte veldscherpte op elke zoom | Middel (visuele regressies bij exotische /AP's) | 1–3 | **M** (SDK **S**) |
| 13 | Gesandboxde veld-JS-engine (berekeningen als `totaal_5c`), expliciete opt-in per document, geen netwerk/FS | Volledige Acrobat-pariteit voor reken-formulieren | Hoog (scope!); apart ontwerp nodig | 1–3 | **L** |
| 14 | `SubmitForm` met expliciete toestemming per actie | Workflows die echt versturen | Middel/hoog | 9, 13 | **M/L** |
| 15 | Format-/validatiehints zonder JS (AFNumber/AFDate uit `/AA`-strings herkennen voor input-masks) | Nettere invoer zonder engine | Middel (heuristisch) | 2 | **M** |
| 16 | Multiline/rich text-verfijning, veldzoeken, "verplichte velden eerst"-gids | Comfort | Laag | 3, 8 | **M** |

---

## 7. Acceptatiecriterium — checklist op het referentieformulier

Een release haalt "AcroForm-pariteit" als op
`verz_betalingsreg_betaling_ondernemers_ov1352o27fol.pdf`:

1. Openen toont het formulier **zonder modal of waarschuwingsbanner**; een
   rustige formulierbalk meldt "Invulbaar formulier — 289 velden".
2. Klik op (Bedrijfs)naam (p. 2) → typen werkt direct; geen modus, geen
   instructie nodig.
3. `Tab` loopt in logische volgorde door alle velden over alle 11 pagina's,
   met autoscroll; `Shift+Tab` terug.
4. Radio-groep 3e: klik en pijltjes schakelen **exclusief**; opgeslagen
   bestand toont de juiste keuze in Acrobat/Preview.
5. BSN/RSIN- en IBAN-comb-velden: tekens vallen in de hokjes (overlay én
   opgeslagen weergave); meer tekens dan hokjes kan niet.
6. Readonly velden zijn zichtbaar maar niet bewerkbaar; required-styling
   klopt.
7. Na invullen toont de **pagina zelf** (bitmap) de waarden; ⌘S; her-openen
   in **Preview, Acrobat en Chrome** toont alle waarden identiek.
8. Scherpte: op 100–300%, óngeacht het zoompad, ≤5% upscale in rust
   (her-meting met het §4-protocol); geen zichtbaar kwaliteitsverschil met
   Preview op gelijke grootte.
9. De woorden "Geblokkeerd"/"actieve inhoud" komen nergens in de standaard
   open-flow voor; de berekeningen-disclaimer is één informatieve regel.
10. Undo/redo werkt over veldwijzigingen; sluiten met onopgeslagen wijzigingen
    geeft de bestaande waarschuwing.

---

## Appendix

- **Meetdata**: `docs/analysis/assets/sharpness/` (pdfluent_100–300.png,
  preview_ref.png; metriek-script in §4.1 beschreven).
- **Bestandsforensiek**: zie tabel §0 en
  `acroform-rendering-and-active-content-banner.md` (eerdere, smallere
  analyse; door dit document vervangen waar ze overlappen).
- **Open verificaties voor implementatiestart**: (1) `get_form_fields` op het
  referentiebestand draaien en de 289 terminal fields + rects controleren
  (pypdf-inventaris bevestigt de structuur al); (2) gedrag van
  `parse_acroform` bij de 103 niet-terminale containernodes; (3) tab-order:
  het bestand definieert geen expliciete volgorde ⇒ geometrische sortering
  valideren tegen Acrobat's volgorde op p. 2.
