# Analyse — pixelige weergave + formulier-melding bij AcroForm-PDF's

> Interne technische analyse (2026-06-12). Testbestand: het Belastingdienst-formulier
> "Verzoek betalingsregeling en uitstel van betaling" (OV 135, `ov1352o27fol.pdf`,
> 11 pagina's, A4). Vergeleken met macOS Voorvertoning op hetzelfde scherm
> (Built-in Liquid Retina XDR, DPR 2).

## TL;DR

Drie klachten, drie oorzaken — **alle in onze weergavelaag, niet in de SDK en niet in het bestand**:

1. **Pixelig op 225–250% zoom.** De render-hook capt de fast-render op schaal 4.0
   en de quality-upgrade triggert pas bij >1,35× verschil. Op een DPR-2-scherm
   valt zoom 225–250% precies in dat gat → 12–25% CSS-upscaling → wazig. Het
   bestand is 100% vector; elke conforme rasterizer rendert het scherp.
2. **Alarmerende "GEBLOKKEERD"-melding die functioneel niets doet.** De
   active-content-banner toont rauwe machine-flags en een security-toon, terwijl
   de drie keuzeknoppen alleen een localStorage-waarde schrijven — niets in de
   app consumeert die beslissing.
3. **Velden niet invulbaar in leesmodus.** De invul-laag bestaat en is degelijk,
   maar rendert alleen in de aparte "Formulier"-modus. Voorvertoning vult inline
   in de standaardweergave — dat is de verwachting.

---

## Wat dit bestand werkelijk is (forensiek)

| Eigenschap | Bevinding |
|---|---|
| Type | **Gewone AcroForm** — géén XFA (`/XFA` afwezig). InDesign 20.5 + Adobe PDF Library 17.0 |
| Velden | **289**: 255 tekstvelden, 34 checkboxes/radio's. 341× `/BG` (achtergrondkleur) + 341× `/BC` (randkleur) → de gele invulvakken zitten ín de PDF |
| JavaScript | **597 acties** — onschuldige formulierlogica: `totaal_5c_huidig()` (berekening), `activateField(...)` (markering), `evaluateKeystroke('^[0-9]{0,7}$')` (invoervalidatie) |
| Overige triggers | 1× `/OpenAction`, 342× `/AA` (veld-niveau JS), 12× `/URI` (links). Géén `/Launch`, géén `/SubmitForm` |
| Beeld | **Nul afbeeldingen** in 11 pagina's; alle tekst vector met embedded Rijksoverheid-fonts |

Het bestand is dus volledig vector en de "actieve inhoud" is standaard formulierlogica.

---

## Issue 1 — pixelige weergave

### Oorzaak

De pipeline in [`useRenderedCanvas.ts`](../../src/viewer/hooks/useRenderedCanvas.ts)
zet de canvas-backing op `zoom × devicePixelRatio`, wat in principe goed is. Twee
dempers breken het:

- **Fast-cap 4.0** ([`:20`](../../src/viewer/hooks/useRenderedCanvas.ts:20)).
- **Hysterese 1,35×** ([`:235`](../../src/viewer/hooks/useRenderedCanvas.ts:235)
  en [`:246`](../../src/viewer/hooks/useRenderedCanvas.ts:246)): een hogere
  schaal wordt pas her-gerenderd als die >1,35× (of <0,5×) de huidige is — óók
  in de quality-nabrander. Daardoor kan een te lage backing blijven staan.

Samen: op DPR 2 bereikt de fast-render z'n cap bij zoom 200%. Tussen 200% en
275% wil het scherm schaal 4,0–5,4, maar de quality-upgrade vuurt pas als de
gewenste schaal >1,35× de huidige 4,0 is (= >5,4). De zoomstanden 225% en 250%
vallen daar net onder → de bitmap blijft op 4,0 en wordt opgerekt.

### Bewijs (DPR 2, dit scherm)

| Zoom | Gewenste schaal | Fast (cap 4) | Quality triggert? | Effectief | CSS-upscale |
|---|---|---|---|---|---|
| 100–200% | 2,0–4,0 | = | n.v.t. | exact | 100% (scherp) |
| **225%** | 4,5 | 4,0 | nee (4,5 < 5,4) | 4,0 | **112% — wazig** |
| **250%** | 5,0 | 4,0 | nee (5,0 < 5,4) | 4,0 | **125% — wazig** |
| 275%+ | 5,5+ | 4,0 | ja | 5,5+ | 100% (scherp) |

De screenshots tijdens deze sessie stonden op **250%** — precies de slechtste
stand. `imageSmoothingQuality: 'high'` maakt het zacht-wazig i.p.v. blokkerig,
wat als "pixelig" wordt ervaren. Voorvertoning (PDFKit) her-rastert continu op
exacte schermresolutie en is daarom op élke zoom scherp.

> **Methodische noot:** de schermafbeeldingen worden van 3456px naar ~1372px
> gedownsampled, dus pixel-scherpte is daaruit niet hard te beoordelen. Het
> bewijs is de schaal-wiskunde hierboven, niet de screenshots.

### Aanpak

1. **Quality-pass altijd naar exact `bucket(zoom × DPR)` laten her-renderen** als
   de view stilstaat (gesture voorbij). De 1,35×-drempel alleen houden voor (a)
   de fast-pass tijdens een actieve zoomgesture en (b) downscale — niet voor de
   eindstand. De bestaande debounce (120/180 ms) + bitmap-cache vangen de kosten.
2. **Fast-cap optillen of DPR-bewust maken.** 4,0 is te laag voor DPR-2 boven
   200%; de quality-cap (12,0) wordt nu effectief nooit bereikt. Overweeg de
   fast-cap op `4 × max(1, DPR/2)` of simpelweg de quality-pass te laten leiden.
3. Verifiëren op DPR 1 (extern scherm) en DPR 2/3 dat geen enkele zoomstand meer
   >~5% upscalet in stilstand.

Geen SDK-wijziging nodig: `render_page_raw_bytes` rendert op elke gevraagde
schaal scherp; we vragen simpelweg een te lage schaal.

---

## Issue 2 — de melding + niet-invulbaar formulier

### 2a. De active-content-banner

Getoond door [`ViewerApp.tsx:1349`](../../src/viewer/ViewerApp.tsx:1349),
getriggerd door de JS/OpenAction/AA/URI-detectie in
[`pdf_engine.rs:528`](../../src/viewer/../../src-tauri/src/pdf_engine.rs:528).
Drie problemen:

1. **Toon.** Badge "**Geblokkeerd**", titel "Deze PDF bevat actieve inhoud", en
   dan letterlijk "Gedetecteerd: additional-actions, javascript, uri,
   open-action" — rauwe Engelse machine-labels in de UI, plus drie knoppen met
   security-lading. Voor een Belastingdienst-formulier met invoervalidatie is dat
   onnodig alarmerend.
2. **De keuze doet niets.** `handleActiveContentDecision`
   ([`ViewerApp.tsx:1020`](../../src/viewer/ViewerApp.tsx:1020)) schrijft alleen
   een localStorage-waarde en verbergt de banner. **Niets** in de codebase
   consumeert die beslissing — er is geen JS-engine, dus er valt niets te
   activeren of blokkeren. "Dit document vertrouwen" ontgrendelt feitelijk niets.

### 2b. Velden geel maar plat, en alleen invulbaar in forms-modus

Side-by-side waargenomen:

| | PDFluent (leesmodus) | Voorvertoning |
|---|---|---|
| Velden | **Geel gevuld, plat** — deel van de paginabitmap | **Wit, met stippelrand, klikbaar** — losse widgets |
| Invullen | Niet mogelijk in leesmodus | Inline klikken + typen |

Oorzaak: PDFluent rendert met `render_annotations: true`
([`pdf_engine.rs:592`](../../src-tauri/src/pdf_engine.rs:592)), dus de SDK bakt
de widget-appearances (incl. de gele `/BG` uit de PDF) mee in de bitmap. De
interactieve laag [`FormFieldOverlay`](../../src/viewer/components/FormFieldOverlay.tsx)
— die tekstvelden, checkboxes/radio's, focusvolgorde en readOnly correct
afhandelt en via `get_form_fields`/`set_form_field_value` (SDK `pdf-forms`)
opslaat — rendert echter alleen bij `mode === 'forms'` én alleen op de huidige
pagina ([`ViewerApp.tsx:1527`](../../src/viewer/ViewerApp.tsx:1527)). De gebruiker
moet de "Formulier"-tab ontdekken (of sneltoets 6).

De SDK kan dus alles wat nodig is — detectie, veldenparsing, waarden wegschrijven.
Het zit vast op UX-keuzes in de shell.

> Automatische berekeningen (zoals `totaal_5c`) draaien niet, want we voeren geen
> AcroForm-JavaScript uit. Dat is bij Voorvertoning identiek (PDFKit voert het ook
> niet uit), dus dit is géén achterstand t.o.v. de referentie — wel iets om
> eerlijk te benoemen.

### Het nieuwe meldingsmodel (zoals besproken)

Vervang de drieweg-security-keuze door een rustige toestemmingsvraag met een
**persistente, zichtbare, uitzetbare** auto-accept — zodat de gebruiker altijd
ziet dát het aan staat en het kan terugdraaien.

**Bij openen van een document met interactieve inhoud (eerste keer):**

> 🧾 **Interactief formulier** — Dit document bevat invulbare velden en
> interactieve elementen (berekeningen, links). Open je het uit een vertrouwde
> bron?
>
> `[Deze keer toestaan]` · `[Niet toestaan]` · `[Altijd toestaan]`

- **Deze keer toestaan** → activeert het invullen voor deze sessie/dit document.
- **Niet toestaan** → blijft inert (huidige veilige default).
- **Altijd toestaan** → slaat de voorkeur op (auto-accept).

**Vanaf dan (auto-accept aan):** geen blokkerende melding meer, maar bovenin
blijft een compacte, niet-alarmerende balk met een **toggle** zichtbaar:

> 🧾 Interactieve inhoud automatisch toegestaan  `[●—— aan]`

Zet de gebruiker de toggle uit → terug naar vragen bij het volgende document.
Zo is de keuze transparant, herhaalbaar en omkeerbaar, precies zoals gevraagd.

**Opslag & scope.** Hergebruik de bestaande sleutels in
[`ViewerApp.tsx:90`](../../src/viewer/ViewerApp.tsx:90)
(`pdfluent.activeContent.trustAll` voor de globale auto-accept,
`pdfluent.activeContent.documentDecisions` voor per-document "deze keer"). Advies:
"Altijd toestaan" = globale auto-accept (dat is wat de gebruiker bedoelt met "niet
elke keer"), met de zichtbare toggle als waarborg; per-document override blijft
mogelijk.

### Aanpak (issue 2)

1. **Banner herschrijven** ([`ViewerApp.tsx:1349`](../../src/viewer/ViewerApp.tsx:1349)):
   rustige copy, badge "Formulier" i.p.v. "Geblokkeerd", géén rauwe flag-namen
   (verberg of vertaal naar mensentaal). Primaire knop activeert invullen.
2. **Meldingsmodel** zoals hierboven: drie acties + persistente toggle-balk bij
   auto-accept. Voeg de toggle-component toe (in de banner of de topbar).
3. **De keuze laten betekenen.** Koppel "toestaan" aan het daadwerkelijk
   ontgrendelen van invullen (forms-overlay) en eventueel het openen van de 12
   URI-links. Zolang er geen JS-engine is: niet doen alsof we iets blokkeren wat
   we toch niet uitvoeren — de melding gaat over invullen + links, niet over
   "scripts".
4. **Invulbaarheid in leesmodus.** Render `FormFieldOverlay` op alle zichtbare
   pagina's i.p.v. alleen `isCurrentPage`, en maak velden direct invulbaar in de
   standaardweergave (Preview-pariteit) — of laat "toestaan" automatisch naar
   forms-modus schakelen.
5. **i18n.** Nieuwe copy door alle 27 locales; foutmeldingen/labels in mensentaal.

---

## Voorgestelde volgorde

| Fase | Werk | Effect |
|---|---|---|
| 1 | Render-hysterese/quality-pass fix (issue 1) | Scherp op elke zoom — grootste zichtbare winst, geïsoleerd |
| 2 | Banner-copy + meldingsmodel + toggle (issue 2a) | Rustige, betekenisvolle, omkeerbare toestemming |
| 3 | Invulbaarheid in leesmodus / forms-overlay breder (issue 2b) | Preview-pariteit: gewoon invullen en opslaan |
| 4 | i18n + verificatie op DPR 1/2/3 en een 2e formulier | Afronding |

## Voorbehoud / nog te verifiëren

- Of `get_form_fields` alle 289 velden correct teruggeeft (incl. radio-groepen en
  de `/AA`-zware widgets) — parsing zit in SDK `pdf-forms`; verwacht van wel, te
  bevestigen bij fase 3.
- Live "toestaan"-gedrag kon niet via UI-klik worden getest (een schermvullend
  Meldingencentrum-venster blokkeerde klikken op de rechter schermhelft); de
  no-op is wel eenduidig uit de code vastgesteld.
- Exacte effectieve DPR van de WebView op het XDR-scherm; de wazige zoomzone
  schuift met DPR mee maar bestaat altijd net onder elke fast-cap-veelvoud.
