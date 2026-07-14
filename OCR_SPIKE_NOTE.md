# OCR — Technische Spike-notitie (geen implementatie)

_Doel: vastleggen hoe OCR nu werkt, welke betere route al in de codebase ligt, en een aanbevolen implementatieplan. Niet in dit blok uitgevoerd. Alle verwijzingen met `file:line`._

---

## 1. Huidige Python OCR-flow (wat er nu draait)
- Enige aangesloten engine: **`PaddleOcrPythonEngine`** in `src-tauri/src/ocr.rs`. Tauri-commands `get_ocr_status` + `run_paddle_ocr` (`lib.rs:775-783`, geregistreerd `lib.rs:1200-1202`).
- Spawnt een **systeem-Python** met `src-tauri/scripts/paddle_ocr_bridge.py` (importeert `paddleocr`/PPStructure, `cv2`, `numpy`).
- Python-resolutie (`ocr.rs:166-220`), in volgorde: `PDFLUENT_OCR_PYTHON` → `PDFLUENT_OCR_VENV`/`PDFLUENT_OCR_RUNTIME_DIR` → `<exe>/.venv-ocr` → `<cwd>/.venv-ocr` → kale `python3`/`python` op PATH. Op deze Mac valt het terug op `/opt/anaconda3/bin/python3`.
- Import-check (`ocr.rs:86-113`) meldt ontbrekende packages → exact de foutmelding die jij zag (`ocr.rs:262-264`: "Missing: paddleocr, opencv-python").
- De installer bundelt **geen Python en geen modellen** (`tauri.conf.json:48-51` levert alleen `bridge.py` + `requirements-ocr.txt`). PaddleOCR downloadt zijn eigen modellen at runtime naar `~/.paddleocr` / `~/.paddlex`.
- Frontend: `tauri-api.ts:729-737` (`getOcrStatus`/`runPaddleOcr`); v2-trigger `useAnnotations.ts:462-509` (checkt status; bij `!available` logt remediation en stopt).
- **Netto:** OCR werkt alleen op een dev-machine met een vooraf geprovisionde Python-venv. Een eindgebruiker krijgt altijd de fout.

## 2. Bestaande Rust pdf-ocr / ONNX-flow (de betere route, al aanwezig)
- `XFA/crates/pdf-ocr/` met feature **`paddle`** = pure-Rust **ONNX**-engine. **Niet gekoppeld** aan de desktop-app (ontbreekt in `src-tauri/Cargo.toml`).
- Stack: `ort` (ONNX Runtime) + `ndarray` + `image` + `ureq` + `dirs-next`. Volledige pipeline (`paddle/mod.rs:57-149`): DBNet-detectie → optionele hoek-classifier → SVTR-herkenning.
- Talen: EN, Latin, ZH, JA, KO, AR. Detectie V3 (~2.3 MB) of V5 (~84 MB).
- ⚠️ De `pdfluent`-facade (wél desktop-dependency) heeft `ocr-paddle`/`ocr-tesseract` als **lege stub-features** (`XFA/crates/pdfluent/Cargo.toml:24-25`) en re-exporteert `pdf-ocr` niet → je moet `pdf-ocr` **direct** als dependency toevoegen.

## 3. Model-download / cache-pad
- `pdf-ocr/src/paddle/models.rs:11`: `HF_BASE_URL = https://huggingface.co/monkt/paddleocr-onnx/resolve/main`.
- `download_models()` (`models.rs:205-232`) haalt `det.onnx`, `rec.onnx`, `dict.txt` (+ optioneel `cls.onnx`) via `ureq` (`download_file_if_missing` 234-265). **Geen checksum-verificatie.**
- Cache: OS-cachedir → macOS `~/Library/Caches/xfa/ocr-models` (`default_cache_dir` 159-164).
- `PaddleOcrEngine::with_config` (`mod.rs:45-54`): download als `!models_available()`, dan laad ONNX-sessies.

## 4. Offline gedrag
- Eerste gebruik: **eenmalige** download van modelgewichten (publieke bron). Daarna **100% offline** — modellen gecached, inference in-process, geen cloud-calls (grep bevestigt geen Textract/Azure-code in `src/`).
- De huidige Python-flow is óók "offline na setup", maar vereist handmatige Python+PaddleOCR-provisioning — dat is precies het probleem.

## 5. Bundling-impact
- **ONNX-pad:** `onnxruntime` shared lib per platform meeleveren (`ort` gebruikt `load-dynamic`, `pdf-ocr/Cargo.toml:30`) — macOS (arm64+x64), Windows (via de SSH-buildhost), Linux. Alternatief: `ort` op static / `download-binaries` zetten. **Dit is de grootste klus + risk.**
- Modellen **niet** in de installer → first-run download (~tientallen MB; det V3 + rec klein, V5 ~84 MB).
- Python-pad (alternatief, niet aanbevolen): honderden MB's PaddlePaddle-wheels + relocatable Python bundelen → veel groter en fragieler cross-platform.

## 6. Aanbevolen implementatieplan (apart blok)
1. `pdf-ocr` (feature `paddle`) als directe dependency in `src-tauri/Cargo.toml`.
2. `src-tauri/src/ocr.rs` herschrijven: vervang `PaddleOcrPythonEngine` door `pdf_ocr::PaddleOcrEngine`; **behoud de command-namen/contract** (`get_ocr_status`, `run_paddle_ocr`) zodat de frontend (`useAnnotations`, `tauri-api`, `OcrPanel`) ongemoeid blijft. `get_ocr_status` wordt "beschikbaar na eenmalige modeldownload".
3. `onnxruntime`/`ort`-packaging per platform regelen (incl. Windows-buildhost) — grootste klus/risk.
4. Modellen **mirroren naar eigen R2/CDN** (besluit al genomen) i.p.v. de third-party HF-repo; `HF_BASE_URL` (`models.rs:11`) ompunten + **SHA-256-verificatie** toevoegen aan `download_file_if_missing`.
5. First-run **"OCR-modellen downloaden…"** voortgangs-event naar de UI (OcrPanel/useAnnotations tonen status).
6. Opruimen: Python-bridge + `.venv-ocr`-probing + dode manifest-tooling (`generate-ocr-model-manifest.mjs`, lege `ocr-models.manifest.json`) verwijderen.

**Inschatting:** Effort **M** (code) + **Med** risk (vooral `ort`-packaging). De detect/recognize/download/cache-logica bestaat al en is getest in `pdf-ocr` — het is vooral koppel- en packaging-werk, geen nieuwe OCR-engine.

---
_Sleutelbestanden: `src-tauri/src/ocr.rs`, `src-tauri/src/lib.rs` (commands), `src-tauri/scripts/paddle_ocr_bridge.py`, `src-tauri/tauri.conf.json` (bundle), `src-tauri/Cargo.toml`, `XFA/crates/pdf-ocr/` (`Cargo.toml`, `src/lib.rs`, `src/paddle/mod.rs`, `src/paddle/models.rs`), `src/viewer/hooks/useAnnotations.ts`, `src/lib/tauri-api.ts`._
