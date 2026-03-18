# PDFluent — Technische Roadmap 1.1

Laatst bijgewerkt: 2026-03-18
GitHub milestone: [1.1](https://github.com/pdfluent/pdfluent/milestone/2)

---

## Scope

1.0-beta is compleet (23 issues gesloten). 1.1 voegt export formats, advanced tools, en release infrastructure toe.

**Wel in 1.1:** XLSX/PPTX export, OCR UI, redaction UI, digital signatures UI, auto-update, code signing.
**Niet in 1.1:** AI module, share/delen.

---

## Milestone 13: Export + Auto-Update Wiring

**Doel:** XLSX en PPTX export via bestaande SDK crates. Auto-update library wiren in de UI.

| Issue | Task | Effort |
|-------|------|--------|
| [#105](https://github.com/pdfluent/pdfluent/issues/105) | Auto-update integration: wire into ViewerApp | 1-2 uur |
| [#106](https://github.com/pdfluent/pdfluent/issues/106) | XLSX export: Tauri command + ExportDialog | 2-3 uur |
| [#107](https://github.com/pdfluent/pdfluent/issues/107) | PPTX export: Tauri command + ExportDialog | 2-3 uur |

**Alle 3 onafhankelijk — geen onderlinge dependencies.**

---

## Milestone 14: Advanced Tools UI

**Doel:** OCR, redaction en digitale handtekeningen — backend is al compleet, alleen UI wiring nodig.

| Issue | Task | Effort |
|-------|------|--------|
| [#108](https://github.com/pdfluent/pdfluent/issues/108) | OCR UI: toolbar trigger + overlay + confidence controls | 3-4 uur |
| [#109](https://github.com/pdfluent/pdfluent/issues/109) | Redaction tool: drawing mode + search-and-redact + confirmation | 3-4 uur |
| [#110](https://github.com/pdfluent/pdfluent/issues/110) | Digital signatures: cert picker + signing + verification panel | 4-5 uur |

**Alle 3 onafhankelijk — geen onderlinge dependencies. Parallel met M13.**

---

## Milestone 15: Release Infrastructure

**Doel:** Code signing voor distributie en werkende auto-update pipeline.

| Issue | Task | Effort |
|-------|------|--------|
| [#111](https://github.com/pdfluent/pdfluent/issues/111) | Code signing: Apple notarization + Windows Authenticode | 2-4 uur |
| [#112](https://github.com/pdfluent/pdfluent/issues/112) | Auto-update deployment: Tauri signing + GitHub Releases + E2E test | 1-2 uur |

**#112 hangt af van #111. M15 start na M13 + M14.**

---

## Volgorde & Afhankelijkheden

```
M13 (Export + Auto-Update Wiring)         M14 (Advanced Tools UI)
  #105 Auto-update wiring                  #108 OCR UI
  #106 XLSX export                         #109 Redaction UI
  #107 PPTX export                         #110 Signatures UI
         │                                        │
         └──────────────┬──────────────────────────┘
                        ▼
               M15 (Release Infra)
                 #111 Code signing ──→ #112 Auto-update deploy
```

M13 en M14 zijn **volledig parallel**. M15 start pas als beide af zijn.

---

## Totaaloverzicht

| Milestone | Issues | Effort |
|-----------|--------|--------|
| M13: Export + Auto-Update Wiring | #105, #106, #107 | 5-8 uur |
| M14: Advanced Tools UI | #108, #109, #110 | 10-13 uur |
| M15: Release Infrastructure | #111, #112 | 3-6 uur |

**Totale effort: 18-27 uur (3-5 werkdagen)**
**Doorlooptijd met parallellisatie: 2-3 weken**

---

## Volgorde voor terminal (sequentieel)

Als je dit in één terminal sessie wilt doorwerken:

1. #106 XLSX export (Rust + frontend, warm-up)
2. #107 PPTX export (identiek patroon)
3. #105 Auto-update wiring (puur frontend)
4. #108 OCR UI (frontend + overlay wiring)
5. #109 Redaction UI (frontend + drawing mode)
6. #110 Digital signatures UI (meest complex, frontend + panel)
7. #111 Code signing (configuratie, geen code)
8. #112 Auto-update deployment (configuratie + E2E test)
