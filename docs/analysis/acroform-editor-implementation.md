# AcroForms first-class in the editor — implementation & validation

> Implementation log (2026-06-12). Branch `feat/acroform-first-class` (editor),
> built against SDK branch `acroform/sdk-foundation`. Companion to the three
> design docs in this folder. Acceptance form:
> `verz_betalingsreg_betaling_ondernemers_ov1352o27fol.pdf` (289 fields: 255
> text incl. 163 comb, 34 radio groups, 15 read-only; non-ASCII radio state).

## What shipped

### Backend (`src-tauri`)
- `FormFieldModelDto` + `FormWriteRequest` mirror the SDK `build_form_model` /
  `apply_field_value` contract 1:1 (`pdf_engine.rs`). Tagged-enum kinds
  (text/checkbox/radioGroup/comboBox/listBox/pushButton/signature), per-widget
  rects with on-states, DA, comb/maxlen/quadding.
- `PdfDocument::get_form_model()` → `build_form_model(parse_acroform(pdf()))`.
- `PdfDocument::apply_form_value()` → the SDK `apply_field_value` writeback
  (`/V` + `/AS` + `/AP` + `NeedAppearances` fallback) then
  `sync_after_mutation()` so the native renderer (`render_annotations: true`)
  shows the filled value. **This is the single save-pariteit write path.**
- Two Tauri commands: `get_form_model`, `set_form_value`.
- Drift-guard: `form_model_wire_contract_is_stable` (Rust serde-key test).

### Frontend (`src`)
- `useFormModel` hook: loads the model, holds optimistic values, builds a
  **document-wide tab order** (page → top-down → left), write-through commits.
  Deliberately never bumps the render revision on a fill — the overlay input is
  the visual truth, so the freshly-baked `/AP` underneath can't double-draw.
- `FormOverlay`: renders interactive inputs per widget on every visible page,
  in **normal read mode** (no Form Mode). Handles text, multiline (textarea),
  comb (per-cell letter-spacing + maxLength), checkbox, radio groups
  (`name`-grouped for native exclusivity), combo/list. Pointer-transparent
  container; near-opaque field fill; Tab/Shift+Tab → document-wide nav; Enter
  commits + advances; Escape blurs; read-only honoured.
- `FormBar`: replaces the active-content "warning" banner. Field count,
  highlight-fields toggle, jump-to-first-field. No security-theater wording.
- Capability-based link trust: `pdfluent.links.autoOpen` (ask / always / off),
  visible reversible toggle in the Form Bar when auto-open is on. The alarming
  open-time active-content banner and its trust system were removed; the
  backend detection is preserved for point-of-use decisions.
- Zoom convergence: the quality render pass now always converges to the exact
  bucketed `zoom × DPR` (was: a 1.35× dead band that left identical zoom levels
  sharp-or-soft depending on the path taken — measured up to 33% upscaling).

### Form Mode decision
**Retained as a compatibility fallback, no longer required.** Filling is now a
property of the document (fields present → fields live in read mode). The
legacy `FormFieldOverlay` component is removed (superseded by `FormOverlay` in
both read and forms mode); the `useFormFields` / ModeToolbar field-navigator
infrastructure stays for back-compat and can be retired in a later pass.

## Validation evidence

| Gate | Result |
|---|---|
| SDK `form_model` + writeback on the acceptance form (`corpus_gate`) | 289 fields / 341 widgets parsed; text + radio fills OK; saved. **pypdf**: `1.1` `/V` = `Gate Café € test` (non-ASCII roundtrip), radio `/V` = on-state Name. |
| **Editor hands-on** (release app) | Open → **Form Bar "289 velden", no banner** → fields editable in **read mode** → "Eerste veld" jumps+focuses → typed `Café Zürich Onderneming BV` (non-ASCII) → **Tab** → comb field renders `1 2 3 4 5 6 7 8 9` per-cell → ⌘S (dirty asterisk clears). |
| **fill → save → reopen** | Editor-saved file: **pypdf** `1.1` `/V` = `Café Zürich Onderneming BV`; `/AP` carries WinAnsi text. **Apple Preview** (external) renders both the text and the comb `1 2 3 4 5 6 7 8 9`. **Chrome/pdfium**: `/AP /N` WinAnsi + `/AS` present → renders (visual blocked by access-grant timeout; mechanism verified). |
| Zoom convergence on the **new build** (pixel-true `screencapture`) | 250% peak-gradient **0.886** (was 0.67 pre-fix; verse-render ref ~0.88) — converged, dead-band sag gone. |
| Corpus gate — **16 pure AcroForms** | 412 fields (text 279, comb 163, radio 34, checkbox 57, combo 2, listbox 4, sig 18, push 18); **0 fill failures**; non-ASCII on-state handled; 14/16 saved (the 2 non-saves are signature-only docs with nothing to fill). Static-XFA hybrid shells: the harness hangs on large *dynamic*-XFA files (a `corpus_gate`/`pdf_syntax` limitation on those exotic inputs, not the editor); the SDK model parses all 180 shells per the inventory. |
| Cross-viewer **Apple Preview** (visual) | Saved file renders `Gate Café € test` (é + € correct) and the radio shows checked — `/AP`+`/AS` honoured. |
| Cross-viewer **Chrome / pdfium** (mechanism) | `/AP /N` stream contains `(Gate Caf\xe9 \x80 test) Tj` in a `/Tx BMC` block with `/Encoding /WinAnsiEncoding`; 86 widgets carry `/AS`. pdfium renders `/AP` directly → values visible. (Visual screenshot blocked by an unresponsive access-grant dialog; mechanism + Preview cover it.) |
| TypeScript typecheck (strict, noUnused*, noUncheckedIndexedAccess) | clean |
| Vitest (full) | **333 files, 6474 tests pass** — zero regressions |
| Rust clippy `-D warnings` (editor lib) | clean |
| Rust form drift-guard test | pass |

## Post-audit fixes (2026-06-12, after the enterprise readiness audit)

The release-readiness audit found real gaps; these were fixed and re-validated
hands-on on the rebuilt release app:

| Fix | Root cause | Resolution | Re-validated |
|---|---|---|---|
| **Click-to-focus** (could not click a field to fill it) | `FormOverlay` had no z-index; PageCanvas stacks overlays to z=20 (TextLayer), so clicks hit the text layer, not the field inputs (programmatic focus via "Eerste veld"/Tab masked it) | `FormOverlay` container `zIndex: 30` (above the page-canvas stack); container stays `pointer-events:none` so non-field clicks still fall through to text selection | ✅ raw-click into 1b → "9 8 7 6 5 4 3 2 1" (comb), raw-click Aanslagnummer → "RAWCLICK-OK" |
| **Undo/redo for form edits** (⌘Z didn't revert a fill) | `useFormModel` didn't push undo commands; first attempt then read the "previous" value from `values`, which `setTextLocal` updates live on each keystroke (prev === new → entry dropped) | Push `makeCommand(redo, undo)` per commit on the shared `undoStackRef`; capture "previous" from a separate `committedRef` updated only on commit | ✅ type→commit→⌘Z reverts to empty; ⌘⇧Z re-applies |
| **Hyperlinks non-functional** (task 4) | `/Link`→`/URI` annotations were not a clickable layer; the trust toggle wasn't connected to any click | New backend `get_link_annotations` (page+rect+uri); `LinkOverlay` clickable layer; `handleLinkActivate` → ask-on-first-use dialog (**Eén keer openen / Altijd toestaan**); "Always" flips the persistent, visible, reversible Form Bar toggle | ✅ click link → dialog with full URL + 3 actions; "Altijd toestaan" → "Links automatisch openen ●" appears in the Form Bar |

Gates after fixes: TypeScript typecheck clean · **vitest 333 files / 6478 pass**
(4 new drift-guards: z-index, undo, link layer, trust) · Rust `clippy -D
warnings` clean · drift-guards green.

## Known limitations / follow-ups (not release-gating for the form experience)
- **Choice multi-select** implemented: `<select multiple>` renders in the
  overlay; the SDK exposes `selected_values: Option<Vec<String>>` on
  `FormFieldModel`; `apply_choice_multi` writes `/V` as an array +
  `NeedAppearances` so viewers render multi-selection correctly. The acceptance
  form has no multi-select list boxes (verified via corpus scan).
- **Save As** opens the native panel and routes to the proven `save_pdf`
  writer, but the panel couldn't be driven end-to-end by the automation tool
  (NSSavePanel rejects synthetic input); ⌘S (save to the open path) is proven.
  A ⌘S-after-a-cancelled-Save-As re-prompt (state quirk) is worth a follow-up.
- Comb letter-spacing is a CSS approximation of the SDK's per-cell `/AP`
  geometry; the saved appearance (what every other viewer shows) is exact.
- Per-commit `sync_after_mutation` re-parses the document; fine for interactive
  fills, batchable on save as a later perf optimization.
- Engine-init is slow (40–90s) under heavy concurrent build load; the idle
  release app loads in ~6s. Environmental, not a form-code regression.
