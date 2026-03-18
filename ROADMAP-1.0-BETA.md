# PDFluent — Technische Roadmap naar 1.0 Beta

Laatst bijgewerkt: 2026-03-18

Puur technisch. Geen App Store, geen marketing, geen pricing — alleen het product technisch af krijgen.
GitHub milestone: [1.0-beta](https://github.com/pdfluent/pdfluent/milestone/1)

---

## Huidige staat

- Tauri v2 + React 19 + TypeScript 5.6
- 56.9K LOC TypeScript, 3.95K LOC Rust
- **Build: BROKEN** — 41 TypeScript compilation errors
- Tests: 6345/6350 passing (99.92%), 5 pre-existing failures
- E2E: Playwright config + 16 specs aanwezig, niet actief gedraaid
- ViewerApp.tsx: 2187 regels / ~100KB (te groot)

---

## Milestone 1: Build Werkend

**Doel:** `npm run build` slaagt. Nul TypeScript errors.

| Issue | Task | Effort |
|-------|------|--------|
| [#85](https://github.com/pdfluent/pdfluent/issues/85) | Fix 41 TypeScript compilation errors | 4-5 uur |

**Acceptatiecriteria:**
- `npx tsc --noEmit` → 0 errors
- `npm run build` → success
- `npx vitest run` → 6345+ passing

---

## Milestone 2: Push & Baseline

**Doel:** Alle lokale werk op remote. Clean baseline.

| Issue | Task | Effort |
|-------|------|--------|
| [#86](https://github.com/pdfluent/pdfluent/issues/86) | Push 7 commits + stage untracked files | 1 uur |

**Acceptatiecriteria:**
- `git status` → clean
- CI green

---

## Milestone 3: Rust Backend Compleet

**Doel:** Alle Tauri commands die de frontend nodig heeft bestaan en werken.

| Issue | Task | Effort |
|-------|------|--------|
| [#87](https://github.com/pdfluent/pdfluent/issues/87) | `reorder_pages` command | 0.5 dag |
| [#88](https://github.com/pdfluent/pdfluent/issues/88) | `set_form_field_value` command | 0.5 dag |
| [#89](https://github.com/pdfluent/pdfluent/issues/89) | `create/delete/update_annotation` commands | 1 dag |
| [#90](https://github.com/pdfluent/pdfluent/issues/90) | `search_text` command | 0.5 dag |
| [#91](https://github.com/pdfluent/pdfluent/issues/91) | `get_text_layer` command | 0.5 dag |
| [#92](https://github.com/pdfluent/pdfluent/issues/92) | Verify `convert_to_docx` end-to-end | 0.5 dag |

**Acceptatiecriteria:**
- Alle commands callable vanuit frontend
- Elke command heeft unit test
- `cargo test -p pdfluent` → green
- `cargo clippy -D warnings` → clean

---

## Milestone 4: Text Layer

**Doel:** Gebruiker kan tekst selecteren, kopiëren en highlighten.

| Issue | Task | Effort |
|-------|------|--------|
| [#93](https://github.com/pdfluent/pdfluent/issues/93) | Wire TextLayer in PageCanvas + copy handler | 3-4 dagen |

**Acceptatiecriteria:**
- Tekst selecteerbaar met muis
- Cmd+C kopieert naar clipboard
- Correct op alle zoom levels

---

## Milestone 5: Search

**Doel:** Cmd+F opent search, toont resultaten met navigatie.

| Issue | Task | Effort |
|-------|------|--------|
| [#73](https://github.com/pdfluent/pdfluent/issues/73) | Search panel basis (bestaand issue) | ref |
| [#94](https://github.com/pdfluent/pdfluent/issues/94) | Wire SearchPanel + highlight matches | 2-3 dagen |

**Acceptatiecriteria:**
- Cmd+F opent search
- Resultaten met page nummers
- Klik navigeert naar match
- Matches gehighlight op pagina

---

## Milestone 6: Annotations & Forms Interactie

**Doel:** Annotaties aanmaken en formulieren invullen werkt.

| Issue | Task | Effort |
|-------|------|--------|
| [#72](https://github.com/pdfluent/pdfluent/issues/72) | ModeToolbar wiring (bestaand issue) | ref |
| [#95](https://github.com/pdfluent/pdfluent/issues/95) | Annotation create/delete UI + overlay | 3 dagen |
| [#96](https://github.com/pdfluent/pdfluent/issues/96) | Form field overlay + interactief invullen | 3 dagen |

**Acceptatiecriteria:**
- Highlight/comment annotaties aanmaken
- Form fields invullen met Tab navigatie
- Alles persistent na save + reopen

---

## Milestone 7: Undo/Redo

**Doel:** Elke edit-operatie is ongedaan te maken.

| Issue | Task | Effort |
|-------|------|--------|
| [#80](https://github.com/pdfluent/pdfluent/issues/80) | Undo/Redo systeem (bestaand issue) | ref |
| [#97](https://github.com/pdfluent/pdfluent/issues/97) | Command pattern engine + integraties | 5-6 dagen |

**Acceptatiecriteria:**
- Cmd+Z / Cmd+Shift+Z werkt
- Buttons correct enabled/disabled
- 10+ scenario tests passing

---

## Milestone 8: ViewerApp Refactor

**Doel:** ViewerApp.tsx van 2187 naar <500 regels.

| Issue | Task | Effort |
|-------|------|--------|
| [#98](https://github.com/pdfluent/pdfluent/issues/98) | Opsplitsen in 7 custom hooks | 4-5 dagen |

**Acceptatiecriteria:**
- ViewerApp.tsx < 500 regels
- Alle tests passing
- Geen functionele regressie

---

## Milestone 9: E2E Tests

**Doel:** Playwright suite draait en is >90% green.

| Issue | Task | Effort |
|-------|------|--------|
| [#99](https://github.com/pdfluent/pdfluent/issues/99) | Playwright activeren + CI integratie | 4-5 dagen |

**Acceptatiecriteria:**
- ≥14/16 specs passing
- Playwright in CI op elke PR

---

## Milestone 10: i18n

**Doel:** UI tweetalig (Nederlands + Engels), Engels default.

| Issue | Task | Effort |
|-------|------|--------|
| [#100](https://github.com/pdfluent/pdfluent/issues/100) | i18n framework + NL/EN message files | 4-5 dagen |

**Acceptatiecriteria:**
- Engels default, Nederlands via settings
- Geen hardcoded strings in componenten

---

## Milestone 11: Polish & Stabilisatie

**Doel:** Beta-kwaliteit. Geen crashes, geen memory leaks.

| Issue | Task | Effort |
|-------|------|--------|
| [#101](https://github.com/pdfluent/pdfluent/issues/101) | Welcome screen, keyboard shortcuts, windowed rendering, cleanup | 7-9 dagen |

**Acceptatiecriteria:**
- 500-pagina PDF zonder lag
- Geen memory leaks
- Performance targets gehaald

---

## Milestone 12: Release Build

**Doel:** Werkende installers voor 3 platforms.

| Issue | Task | Effort |
|-------|------|--------|
| [#102](https://github.com/pdfluent/pdfluent/issues/102) | DMG + MSI + AppImage builds | 3-4 dagen |

**Acceptatiecriteria:**
- Alle 3 platforms builden
- App start en opent PDF
- Binary <10MB

---

## Volgorde & Afhankelijkheden

```
#85 M1 (Build Fix) ──→ #86 M2 (Push) ──→ M3 (Rust Backend: #87-#92)
                                            │
                                  ┌─────────┼──────────┐
                                  ▼         ▼          ▼
                           #93 M4 (Text) #95+#96 M6  #98 M8 (Refactor)
                             │         (Annot+Forms)    │
                             ▼              │           │
                           #94 M5 (Search)  ▼           │
                             │         #97 M7 (Undo)    │
                             └──────────────┼───────────┘
                                            ▼
                                     #99 M9 (E2E Tests)
                                            │
                                  ┌─────────┼─────────┐
                                  ▼                   ▼
                           #100 M10 (i18n)    #101 M11 (Polish)
                                  └─────────┬─────────┘
                                            ▼
                                    #102 M12 (Release Build)
```

---

## Totaaloverzicht (21 issues)

| Milestone | Issues | Effort |
|-----------|--------|--------|
| M1: Build Fix | #85 | 4-5 uur |
| M2: Push | #86 | 1 uur |
| M3: Rust Backend | #87, #88, #89, #90, #91, #92 | 3-4 dagen |
| M4: Text Layer | #93 | 3-4 dagen |
| M5: Search | #73, #94 | 2-3 dagen |
| M6: Annotations & Forms | #72, #95, #96 | 5-6 dagen |
| M7: Undo/Redo | #80, #97 | 5-6 dagen |
| M8: Refactor | #98 | 4-5 dagen |
| M9: E2E Tests | #99 | 4-5 dagen |
| M10: i18n | #100 | 4-5 dagen |
| M11: Polish | #101 | 7-9 dagen |
| M12: Release Build | #102 | 3-4 dagen |

**Totale doorlooptijd (met parallellisatie): 10-14 weken**
**Totale effort: ~50-60 mandagen**

---

## Wat NIET in 1.0-beta

- AI module (entity extraction, summarization) → 1.1+
- Collaboration/review bundle export → 1.1
- OCR UI integratie → 1.1
- Share/Delen → 1.1+
- XLSX/PPTX export → 1.1
- Redaction tool UI → 1.1
- Digital signatures UI → 1.1
- Auto-update deployment → na 1.0-beta
- Code signing certificaten → na 1.0-beta

## Wat WEL in 1.0-beta

Een PDF editor die:
- Elke PDF opent en correct rendert
- Tekst laat selecteren en kopiëren
- Zoeken in documenten ondersteunt
- Pagina's kan herordenen, verwijderen, roteren
- Formulieren kan invullen
- Annotaties kan toevoegen (highlight, comment)
- Undo/Redo heeft
- Exporteert naar PDF, PNG, JPEG, DOCX
- In Nederlands en Engels beschikbaar is
- Op macOS, Windows en Linux draait
- 100% lokaal werkt zonder internet
