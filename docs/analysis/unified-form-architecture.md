# Unified Form Architecture — enterprise-breed AcroForm-onderzoek & ontwerp

> Interne ontwerpnotitie (2026-06-12). Derde document in de formulierenreeks:
> bouwt voort op `acroform-rendering-and-active-content-banner.md` (eerste
> diagnose) en `acroform-first-class-design.md` (UX/roadmap op het
> referentieformulier). Dit document verbreedt naar **alle corpora**, bepaalt
> de werkelijke SDK-dekking, valideert de gap-hypothese en ontwerpt één
> architectuur voor AcroForm én toekomstig XFA. **Geen code gewijzigd.**

## 0. Samenvatting

- **Corpus**: 931 PDF's gescand (XFA-repo hoofdcheckout 568, pdfluent-repos 18,
  Downloads 345). 455 bevatten een AcroForm-dictionary: **24 puur AcroForm**
  en **431 met XFA — waarvan 180 een échte AcroForm-schil met samen ~17.900
  terminale velden** (statische-XFA-hybrides). De AcroForm-pijplijn bedient
  dus niet 24 maar ruim 200 corpusdocumenten; dat is het hardste argument
  voor een verenigde architectuur.
- **SDK**: `pdfluent-forms` is functioneel vrijwel compleet — veldenboom met
  inheritance, alle veldsoorten (tekst single/multi/password/**comb**/
  fileselect; checkbox/radio/pushbutton mét on-state-semantiek; choice
  combo/editable/list/multiselect), **appearance-generatie voor alle vier
  typen**, een action-/triggermodel met een kant-en-klare
  `JsActionHandler`-naad, flatten, en een unificerende `FormAccess`-trait met
  `FormKind::{AcroForm, Xfa, None}`. 56 unit-tests, suite groen.
- **Hypothese (/AP, /AS, save-pariteit = grootste gaten): BEVESTIGD, met twee
  amendementen.** (1) De gaten zitten in de *integratielaag*, niet in de SDK —
  de editor schrijft alleen `/V` en roept de bestaande appearance-/AS-machinerie
  nooit aan. (2) Er zijn twee co-gaten die mee móeten: **tekst-encoding**
  (zowel `/V`-writeback als `/AP`-generatie zijn ASCII-naïef — é/ë/€ worden
  mojibake) en **renderer-/AS-substateselectie** (pdf-interpret cast `/AP /N`
  naar Stream; de substate-dictionary van checkboxes/radio's wordt nooit
  getekend, dus een correcte `/AS` zou nu onzichtbaar blijven).
- **Ontwerp**: één `FormModel` + `FormService` + `FormController`-keten,
  kind-agnostisch; statische XFA lift direct mee via zijn AcroForm-schil;
  dynamische XFA volgt later via een `XfaFormAdapter` op dezelfde trait.
  Trust-flow, save-flow, navigatie en UI zijn gedeeld per ontwerp.

---

## 1. Corpus-inventarisatie (het werkelijke AcroForm-oppervlak)

### 1.1 Methode

pypdf-scan over alle unieke PDF's (worktree-duplicaten uitgesloten) op:
AcroForm/XFA-aanwezigheid, terminale velden per `/FT`, vlag-bits (readonly,
required, multiline, password, radio, pushbutton, combo, multiselect, comb,
richtext), `/MaxLen`, `/Opt`, veld-`/AA`, `NeedAppearances`, `SigFlags`,
`OpenAction`, JS/Launch/SubmitForm-acties, Link/Widget-annotaties, producer.
Ruwe data: `/tmp/corpus_report.json`; 15 onleesbaar (encrypted/corrupt/>15MB).

### 1.2 Resultaten

| Populatie | Aantal | Toelichting |
|---|---|---|
| Gescand / leesbaar | 931 / 916 | |
| Met AcroForm-dict | 455 | |
| — puur AcroForm | **24** | gedomineerd door het Belastingdienst-referentiebestand |
| — met XFA | 431 | |
| — XFA mét echte AcroForm-schil (terminale velden) | **180** | 25× 1-10 velden, 66× 11-50, 69× 51-200, 20× >200 |
| Velden in die schillen | **17.867** | 13.723 Tx · 4.055 Btn · 58 Ch · 31 Sig |
| `NeedAppearances=true` | 4 | allemaal hybrides |

Feature-spreiding (puur AcroForm): comb 163 (+`/MaxLen` 164), radio-groepen
34, pushbuttons 18, multiline 6, combo 2, handtekeningvelden 18 (o.a. KvK
UBO-uittreksel, iText-certificeringen), veld-`/AA` 258, één JS-zwaar document
(595 acties), prefilled-waarden, ontbrekende `/DA` (13 velden). Producers:
Adobe PDF Library, iText 5/7/9, StreamServe, PDF24, Acrobat Distiller,
Adobe Acrobat 8 — een realistische enterprise-mix.

### 1.3 Corpus-gaten (zelf een bevinding)

Het corpus is historisch XFA-gedreven. Voor enterprise-AcroForm ontbreken:
**LibreOffice/Word-gegenereerde formulieren** (typisch
`NeedAppearances=true`!), listbox/multiselect in het wild, rich text (`/RV`),
date/format-`/AA`-conventies (AFDate/AFNumber), niet-Latijnse scripts,
ondertekenbare workflows. Het implementatieplan bevat daarom een
corpus-uitbreidingsfase met golden-tests.

---

## 2. SDK-feature-matrix (`crates/pdf-forms`, pakket `pdfluent-forms`)

Legenda: ✅ volledig + getest · 🟡 gedeeltelijk/zonder tests · ❌ ontbreekt.
Testsuite: 56 unit-tests, **groen** (lokale run, hoofdcheckout
`fix/sdk-hardening-bindings-release`).

| ISO 32000 §12.7-feature | SDK-status | Bewijs/kanttekening |
|---|---|---|
| Veldenboom, FQN, terminal fields | ✅ | `tree.rs`/`parse.rs` (7 tests) |
| Inheritance `/FT` `/Ff` `/DA` `/Q` `/MaxLen` | ✅ | `effective_*`, expliciet incl. MaxLen |
| Tekstvelden: single/multiline/password/**comb**/fileselect | ✅ | `TextFieldKind` (6 tests) |
| Buttons: checkbox/radio/pushbutton, on-states uit `/AP`, `toggle_checkbox`, `select_radio` | ✅ | `button.rs` (3 tests) — groepsexclusiviteit getest |
| Choice: combo/editable/list/**multiselect**, `/Opt` export+display | ✅ | `choice.rs` (7 tests) |
| `set_value` met readonly-/signature-guards | ✅ | `facade.rs` (10 tests) |
| **Appearance-generatie**: tekst (single/multi/comb per cel), checkbox, radio, choice (combo + listbox) , auto-size (DA 0) | ✅* | `appearance.rs` — *maar zie encoding hieronder |
| Appearance **encoding** | ❌ | `escape_pdf_string` escapet alleen `()\` en schrijft rauwe UTF-8 in een literal string bij `/Helv` ⇒ alles buiten ASCII wordt mojibake; geen unicode→WinAnsi-mapping, geen embedded-font-pad |
| Action-/triggermodel (Keystroke/Validate/Format/Calculate) + `JsActionHandler`-naad + `run_calculations` | ✅ (model) | engine bewust afwezig — naad bestaat al voor P2 |
| Flatten | ✅ | 11 tests |
| `FormAccess`-trait + `FormKind::{AcroForm,Xfa,None}` | 🟡 | trait + AcroForm-impl bestaan; **geen Xfa-implementatie** — dit is de beoogde unificatienaad |
| Tab-/navigatievolgorde | ❌ | geen sortering of `/Tabs`-ondersteuning |
| `NeedAppearances`-regeneratie bij openen | ❌ | renderer noch editor regenereert; LibreOffice-formulieren tonen leeg |
| Rich text (`/RV`) | ❌ | buiten scope houden (ook Acrobat-niche) |

**Renderer (pdf-interpret), formulier-relevant:**

| Feature | Status | Bewijs |
|---|---|---|
| Widget-`/AP /N` als directe stream (tekstvelden) | ✅ | gele Belastingdienst-velden renderen |
| **`/N` als substate-dict + `/AS`-selectie (checkbox/radio)** | ❌ | `ap.get::<Stream>(N)` faalt stil op een dict — aan/uit-widgets tekenen géén appearance; `/AS` wordt nergens gelezen |
| Hidden-flag (bit 2) respecteren | ✅ | expliciete check |
| Subtype-specifiek overslaan (precedent voor widget-skip-vlag) | ✅ | `skip_signature_widgets` |

**Editor-integratielaag** (samengevat uit het vorige document, nu corpus-breed
gewogen): `set_form_field_value` schrijft alleen `/V` (als rauwe
UTF-8-literal), geen `/AP`-regeneratie, geen `/AS`, geen
`NeedAppearances`-vangnet; `FormFieldInfo` exporteert geen button_kind /
on-states / widget-rects / maxlen / comb / multiline / DA-font; overlay
modus-gegated, alleen-huidige-pagina, radio's vallen door ontbrekende
type-mapping terug op tekstinputs; choice-`<select>` zonder options;
forms-modus onvindbaar in de V3-shell.

---

## 3. Hypothese-validatie

> *"Appearance-generation (/AP), button-state (/AS) en save-pariteit zijn
> momenteel de grootste functionele gaten."*

**Oordeel: bevestigd — met precisering en twee co-gaten.**

1. **Bevestigd, en corpus-breed gewogen**: elk ingevuld veld doorloopt de
   schrijfroute; die route levert vandaag `/V` zonder `/AP`/`/AS`. Gevolg in
   álle 200+ formulierdocumenten met AcroForm-velden: de eigen weergave blijft
   de oude appearance tonen, radio-/checkbox-state kan visueel niet eens
   omschakelen, en extern (Acrobat/Preview/Chrome zonder
   NeedAppearances-regeneratie aan hun kant) zijn waarden onbetrouwbaar
   zichtbaar. Save-pariteit is daarmee de kern-gap — 100%-raak op het primaire
   gebruiksdoel.
2. **Precisering**: dit zijn integratie-gaten. De SDK bevat de volledige
   machinerie (generate_appearance voor alle typen incl. comb-per-cel,
   select_radio/toggle_checkbox met on-states) — ze wordt alleen door flatten
   en tests gebruikt. De fix is dus aanroepen + terugschrijven, geen
   nieuwbouw.
3. **Co-gap A — encoding (gelijkwaardig aan de hypothese-gaten)**: zowel de
   editor-`/V`-writeback (UTF-8 als literal) als de SDK-appearance-encoder
   (rauwe UTF-8 bij `/Helv`) zijn alleen ASCII-veilig. Nederlandse en bredere
   Europese formulierwaarden (é, ë, ü, €, ñ) corrumperen — onacceptabel voor
   enterprise. Moet in dezelfde slag mee: `/V` als UTF-16BE-met-BOM waar
   nodig, appearance via unicode→WinAnsi-mapping (en op termijn een
   embedded-font-pad voor niet-Latin).
4. **Co-gap B — renderer-/AS-substateselectie**: zonder deze kleine
   interpreter-fix blijft een correct gezette `/AS` onzichtbaar in onze eigen
   weergave; hij is de zichtbaarheidsvoorwaarde voor hypothese-gap 2.
5. **Gewogen alternatieven die níet de hoofdgap zijn**: tab-order (comfort,
   P1), NeedAppearances-weergave (display-gap voor LibreOffice-instroom, P1),
   choice-options in de overlay (klein), JS-calculaties (bewust afwezig,
   pariteit met Preview; naad bestaat), SubmitForm/links (capability-laag,
   eerder ontworpen).

---

## 4. Unified Form Architecture

### 4.1 Principes

1. **Eén model, twee (later) providers.** De UI kent alleen `FormModel`;
   of velden uit een AcroForm-boom of (later) een XFA-template komen is een
   provider-detail achter de bestaande `FormAccess`-naad (`FormKind`).
2. **Statische XFA is vandaag al AcroForm.** De 180 hybride corpusbestanden
   bewijzen het: hun schil ís het formulier. Zij krijgen automatisch de
   volledige AcroForm-ervaring; alleen de badge-tekst verschilt.
3. **Schrijven is altijd compleet schrijven**: waarde + appearance + state +
   encoding + her-rasterisatie — voor élke provider dezelfde contract-eis.
4. **Trust hoort bij capabilities, niet bij documenttypen** (ontwerp uit het
   vorige document, ongewijzigd van toepassing op XFA).

### 4.2 Lagen

```
┌────────────────────────────────────────────────────────────┐
│ UI (React)                                                 │
│  FormBar · FormFieldOverlay · veldnavigator · trust-dialogs│
│            ▲ alleen FormModel + FormController             │
├────────────────────────────────────────────────────────────┤
│ FormController (frontend-state)                            │
│  veldwaarden/dirty/undo · focus & documentbrede tab-orde   │
│  validatie-aggregatie · capability-besluiten (links/JS)    │
├────────────────────────────────────────────────────────────┤
│ FormService (Tauri-commando's, kind-agnostisch)            │
│  get_form_model() → FormModel (drift-guarded DTO)          │
│  set_field_value(id, value) → volledige writeback-keten    │
│  validate_form() · save()                                  │
├────────────────────────────────────────────────────────────┤
│ Providers (SDK)                                            │
│  AcroFormProvider = FieldTree (bestaat)                    │
│  XfaFormAdapter   = template/datasets → FormAccess (later) │
│  gedeeld: appearance-gen · encoding · flatten · acties     │
└────────────────────────────────────────────────────────────┘
```

### 4.3 `FormModel` (het gedeelde DTO-contract)

Per document: `kind` (`acroform` | `xfa-static` | `xfa-dynamic`),
`needs_appearances`, capabilities (links/launch/submit/js aanwezig→inert).
Per veld: `id` (FQN), `field_kind` (text{single,multiline,password,comb},
checkbox, radio-group, pushbutton, combo{editable?}, list{multi?},
signature), `widgets[] {page_index, rect, on_state}` (radio-groepen: álle
kid-rects!), `flags {readonly, required, noexport}`, `max_len`, `options[]
{export, display}`, `da {font, size(0=auto), quadding}`, `value`,
`tab_index` (geometrisch bepaald of expliciet). Bewaakt met dezelfde
drift-guard-aanpak als `TextSpanInfo` (Rust-test + TS-test op de wire-keys).

### 4.4 Schrijfketen (save-pariteit by construction)

`set_field_value` (één implementatie in FormService):

1. Route per `field_kind`: tekst/choice → `FormAccess::set_value`;
   checkbox → `toggle_checkbox`; radio → `select_radio(widget)`.
2. `/V` serialiseren met correcte encoding (PDFDocEncoding waar mogelijk,
   anders UTF-16BE+BOM) — geldt ook voor de bestaande lopdf-writeback.
3. `generate_appearance` per geraakt veld → `/AP /N` (sub-states voor
   knoppen) schrijven; `/AS` per widget zetten.
4. Vangnet: lukt appearance-generatie niet (exotisch veld) →
   `NeedAppearances=true` zetten in plaats van stil falen.
5. `sync_after_mutation` + `renderRevision`-bump → de bitmap toont de echte
   documentstaat (en de §4-scherptefix uit het vorige document garandeert dat
   dat scherp gebeurt).
6. Save = bestaand `save_pdf`; export-opties (flatten) blijven los.

XFA-dynamic (later) implementeert exact dezelfde zes stappen, waarbij 2–4
"datasets-node bijwerken + re-layout" betekenen; de UI merkt geen verschil.

### 4.5 Gedeelde UX-, trust- en navigatielaag

Volledig zoals ontworpen in `acroform-first-class-design.md` §2–3 — die
secties gelden ongewijzigd voor alle `FormKind`s: formulierbalk (badge per
kind: "Invulbaar formulier" / "Interactief formulier (XFA)"),
direct-invullen in leesmodus, documentbrede Tab, capability-gebaseerde
trust-flow met klik-moment-toestemming en zichtbare "altijd"-toggle, zelfde
save-/dirty-/undo-gedrag. Form Mode verdwijnt als vereiste voor álle
formulieren tegelijk — er komt geen XFA-uitzondering terug.

---

## 5. Implementatieplan (geen code in deze ronde)

> Bouwt voort op P0–P2 uit `acroform-first-class-design.md`; fase B/C
> overlapt bewust met P0 dáár — dit plan vervangt de volgorde niet maar
> verbreedt hem corpus- en architectuurbewust. Omvang: S ≤1d · M 2–4d · L ≥1w.

| Fase | Werk | Impact | Risico | Afhankelijkheden | Omvang |
|---|---|---|---|---|---|
| **A1** (SDK) | Appearance-/waarde-**encoding**: unicode→WinAnsi-map in appearance-streams; UTF-16BE-helper voor `/V`; tests met é/ë/€/ñ + niet-Latin-fallbackgedrag gedefinieerd | Elke niet-ASCII-invulling correct, overal | Laag | — | **S/M** |
| **A2** (SDK) | **/AS-substateselectie** in pdf-interpret: `/N` als dict → entry per `/AS` (default `/Off`); volgt patroon `skip_signature_widgets` | Checkbox/radio-state wordt zichtbaar; voorwaarde voor B | Laag | — | **S** |
| **A3** (SDK) | **FormModel-export** op `FieldTree`: widgets/rects per kid, kinds, on-states, maxlen/comb/multiline, DA, options | Voedt de hele keten; heft FormFieldInfo-armoede op | Laag | — | **S/M** |
| **A4** (SDK, optioneel met A2) | `NeedAppearances`-pass bij openen: ontbrekende `/AP` regenereren (LibreOffice-instroom) | Display-pariteit voor een hele producer-klasse | Middel (visuele diffs) | A1 | **M** |
| **B** (service) | Unified `FormService`: `get_form_model` + `set_field_value`-keten §4.4 (select_radio/toggle/choice-multi, encoding, /AP+/AS, vangnet, renderRevision) + drift-guards | **Sluit de hypothese-gaten**: save-pariteit by construction | Laag-middel | A1–A3 | **M** |
| **C** (frontend) | `FormController` + overlay first-class (alle pagina's/widgets, radio-`name`-groepen, options, comb-letterspacing, DA-fontmaat, documentbrede Tab) + FormBar + capability-trust-flow + forms-mode-ontmanteling | Het Acrobat/Preview-gevoel, voor 200+ corpusdocumenten | Middel (pointer-coëxistentie; getest ontwerp ligt er) | B | **M/L** |
| **D** (kwaliteit) | **Corpus-uitbreiding** (LibreOffice/Word/overheid, NeedAppearances, listbox/multiselect, non-Latin, rich-text-detectie) + golden-gate: fill→save→extern verifiëren (pypdf + Acrobat/Preview-spotchecks) + beide acceptatiechecklists in CI/handmatige gate | Borgt enterprise-claim; voorkomt regressie | Laag | B, C | **M** |
| **E** (XFA-unificatie) | `kind=xfa-static` activeren (schil-detectie + badge; pipeline ongewijzigd) → daarna `XfaFormAdapter` voor dynamic (template/datasets → FormModel op bestaande layout-engine); flatten wordt export-optie i.p.v. enige route | Eén formulierproduct; XFA-belofte zonder tweede UX | Middel/hoog (dynamic) | B, C; dynamic ook eigen ontwerpdoc | static **S** · dynamic **L** |
| **F** (later) | JS-calculaties via bestaande `JsActionHandler`-naad (sandboxed, opt-in per document, geen netwerk/FS); SubmitForm met expliciete toestemming | Volledige Acrobat-pariteit voor rekenformulieren | Hoog (scope) | C, E | **L** |

**Aanbevolen uitvoeringsvolgorde**: A1+A2+A3 parallel (klein, SDK), dan B,
dan C, met D als doorlopende gate; E-static kan direct na C (één sprint
levert dan AcroForm + statische XFA in één ervaring), E-dynamic en F als
aparte vervolgtrajecten met eigen ontwerpdocument.

### Acceptatiecriteria (bovenop de checklist uit het vorige document)

1. **Corpus-gate**: op alle 24 pure AcroForm-bestanden + een steekproef van 30
   hybride schillen: elk schrijfbaar veld vullen → opslaan → pypdf-verificatie
   (`/V` correct gecodeerd, `/AP` aanwezig, `/AS` consistent) + visuele
   spotcheck in Preview/Acrobat zonder lege of verminkte waarden.
2. **Encoding-gate**: "Café Zürich — €1.234,56 ñ" overleeft fill→save→reopen
   in Acrobat, Preview en Chrome, in tekst-, comb- en combo-velden.
3. **State-gate**: alle 34 radio-groepen van het referentieformulier
   schakelen exclusief, zichtbaar in onze eigen rasterweergave (A2) én extern.
4. **Unified-gate (fase E-static)**: een statisch-XFA-corpusbestand doorloopt
   identiek dezelfde flow en checklist als een puur AcroForm-bestand.

---

## Appendix

- Ruwe scan: `/tmp/scan_corpus.py` → `/tmp/corpus_report.json` (931 records).
- SDK-tests: `cargo test -p pdfluent-forms --lib` — groen (56 tests).
- Eerdere documenten: `acroform-rendering-and-active-content-banner.md`
  (diagnose), `acroform-first-class-design.md` (UX + P0–P2 op het
  referentieformulier; de P0-nummers 1–6 daar corresponderen met fasen B/C
  hier).
- Open punten voor implementatiestart: gedrag van `parse_acroform` op de 103
  container-nodes van het referentiebestand; `/Tabs`-respect vs geometrische
  tab-orde valideren tegen Acrobat; beslissing embedded-font-pad voor
  niet-Latin appearances (A1-fallback documenteren).
