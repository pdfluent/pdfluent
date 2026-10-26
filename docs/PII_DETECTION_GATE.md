# Personal-data detection: design, evaluation set and release gate

Status: implementation written, not yet built or run as a whole. Everything that
needs the model file, a full build or the network happens in the combined
build round (see "Build round" at the end).

The editor suggests personal data to redact (IBANs, card numbers, national ID
numbers, dates of birth, e-mail addresses, phone numbers, and, with the model,
names and addresses). It never redacts on its own: every result is a suggestion
in the review list, the user ticks, and the existing redaction path removes the
text.

The rule behind this document: international personal-data detection is done
with an existing, licence-compatible model, or it is not shipped. A hand-made,
single-country pattern list is not the product. The pattern code that exists is
the *validator layer* next to the model, not a replacement for it.

## 1. How it works

Two layers run on the extracted text of each page and are merged
(`src-tauri/src/pii_model.rs`, `analyse`).

| Layer | What it is | Always on | Finds |
|---|---|---|---|
| Validators | `pii.rs`, `pii_ids.rs`: shape, checksum, context word | yes | IBAN (mod 97), card number (Luhn + network), national IDs (BSN, DE Steuer-ID, FR NIR, UK NINO, US SSN, ES DNI/NIE, IT codice fiscale, PL PESEL, BE register number, SE personnummer), date of birth (a date next to a birth word, six languages), e-mail, phone |
| Model | GLiNER, zero-shot, on ONNX Runtime through `ort`; span encoding and decoding in `pii_gliner.rs` | opt-in download | person, street address, date of birth, bank account number, national ID in formats without a rule, phone and e-mail the rules do not parse |

Merge rules, each covered by a unit test in `pii_model.rs`:

- A validated hit is the strongest evidence and is always kept. A model span at
  the same place only confirms it (`source: both`).
- A model span overlapping a validated hit of another kind is dropped.
- A model IBAN or card number that fails its checksum is dropped: a failed
  checksum is evidence the number is not one.
- Everything else the model finds is kept as an unvalidated suggestion with its
  score. It is ticked in the list only from 90 percent up.
- Bare nine-digit (BSN), eleven-digit (Steuer-ID, PESEL) numbers need a context
  word before them. A checksum alone passes one random number in eleven.

The model runs on a blocking worker, outside the document lock, with the text
chunked to the model window (1200 bytes, 160 overlap, cut on whitespace). If the
model was requested and could not run, the scan result carries
`model: { state: "failed", code }` and the panel says so. A missing model is
never a silent gap.

Redaction accepts only texts the last scan proposed (`pii_reviewed` in
`AppState`), is all or nothing, and checks that none of the redacted text is
still extractable, otherwise the document is put back unchanged.

## 2. The model component (opt-in download)

Same pattern as the OCR component: nothing in the application binary, a dialog
that names every file, size, licence and host, SHA-256 and exact size checked
per file, receipt written last, removable from the panel.

- Manifest: `src-tauri/resources/pii/gliner-pii-component.json`. Files: the
  model (`knowledgator/gliner-pii-base-v1.0`, ONNX UINT8, about 197 MB),
  `tokenizer.json`, licence texts, and per platform the ONNX Runtime library
  (macOS arm64 and x86_64, Windows x86_64). Hashes and sizes are empty and
  `published` is `false` until the files are built and the gate has passed.
- Code: `src-tauri/src/pii_component.rs`. Install takes a `FileSource`; there is
  no production source. It was to be the OCR component's downloader, which is
  gone (OCR is bundled in every build, decision 19-10, docs/BUNDLED_OCR.md): the
  app has no HTTP client of its own, `HTTP_CLIENT_EXCEPTIONS` in
  `scripts/ci/offline-allowlist.mjs` is empty and `components.pdfluent.com` is
  not an allowed origin. A download for this component needs its own decision
  (a client, a host and an allow-list row, reviewed like a new origin) or the
  model ships in the bundle like Tesseract does. Until then `install_pii_component`
  checks consent and the manifest and answers `PII_COMPONENT_DOWNLOAD_NOT_IN_BUILD`.
- Before the model is loaded, every installed file is re-hashed
  (`verify_installed`). An ONNX file is code the runtime executes.
- Hosting is not set up and the host is not allowed (see above). The files go
  wherever the owner decides, after the licence rows below are closed.

### ONNX Runtime and `ort`: one version, decided

`gline-rs` 1.1.0 and `orp` 1.0.0 pin `ort =2.0.0-rc.9`; the engine's `pdf-ocr`
pins `=2.0.0-rc.12`; `ort-sys` is a `links` crate, so both cannot be in one
build. Decision: **drop gline-rs and orp.** The editor calls `ort =2.0.0-rc.12`
directly (features `std`, `load-dynamic`, `api-24`, the same as `pdf-ocr`) and
`tokenizers` 0.22 with default features off and `unstable_wasm` on: pure-Rust
regex backend (no `onig`, which is C), no `http` feature (no download code in
the binary), no progress bar. The GLiNER span encoding and decoding is ours,
`src-tauri/src/pii_gliner.rs`, written from the model's published format and
from reading how gline-rs prepares inputs and decodes logits (both Apache-2.0;
recorded in the licence inventory). It has no runtime dependency and is tested
with hand-made tensors: word splitting, prompt and `words_mask` numbering,
`span_idx`/`span_mask` slots, logits axis order, sigmoid threshold (inclusive),
slots past the end of the text, flat selection, byte offsets on multibyte text,
and an end-to-end run with a scripted network. Swapping an axis in the decoder
made three of those tests fail.

- `ort` and `tokenizers` are optional dependencies of feature `pii-model` in
  `src-tauri/Cargo.toml`. Neither is in `Cargo.lock` yet, so the **first cargo
  command with network access adds them** and the lock is committed with that
  run; until then offline cargo commands stop at resolution. The editor's lock
  has no `ort` today, and with this decision the engine's ONNX OCR can be
  enabled later without a second `ort-sys`.
- The ONNX Runtime library in the component must be one that rc.12 accepts
  (API level 24 and up).
- `pii_model::gline` (session, tensors, tokenizer glue) is written against the
  `ort` rc.12 API as `pdf-ocr` uses it (`Session::builder`, `commit_from_file`,
  `Tensor::from_array`, `inputs!`, `try_extract_tensor`). The tuple form
  `Tensor::from_array(([..], Vec<T>))`, `Vec<bool>` for the span mask, the
  `outputs["logits"]` lookup and `tokenizers` loading a DeBERTa
  `tokenizer.json` with the pure-Rust backend are unverified until it compiles.
- `max_width` (longest span in words) is part of the model's GLiNER
  configuration and is carried by the manifest (`model.max_width`, 12 until the
  component is built and the config is read). A wrong value makes the logits
  the wrong size, which is refused with `PII_MODEL_OUTPUT`.
- The prompt markers `<<ENT>>` / `<<SEP>>` and the `[CLS]`/`[SEP]` ids are taken
  from the tokenizer. If the checkpoint's tokenizer lacks them the load fails
  with a named code.

## 3. Evaluation set specification

Location: `src-tauri/tests/pii_eval/`.

- `generate_corpus.py`: deterministic generator (fixed seed). Writes
  `corpus/<lang>.jsonl`. `--check` fails when the files are not what the
  generator makes (`tests/pii-eval-corpus.test.ts`).
- Languages: **en, nl, de, fr, es, it**, 80 documents each. More languages are
  added by adding a language block to the generator and the list in
  `thresholds.json`.
- Synthetic only. Given names and surnames are drawn from lists of common names
  and combined at random; streets are generic; e-mail addresses are on reserved
  domains (`example.com`, `example.org`, `example.net`, `mail.example`,
  `post.test`; a test checks this); IBANs, cards and national IDs are computed
  from the public checksum rules by code written independently of the Rust
  validators; phone numbers are random digits. No real document or person is
  used or imitated.
- Format, one JSON object per line:
  `{"id", "lang", "text", "entities": [{"type", "start", "end", "text",
  "subtype"?, "layer"?}]}`. Offsets are Unicode scalar offsets, end exclusive.
  `"layer": "model"` marks an entity no rule can prove (a bare nine-digit BSN
  with no context word, say): the validator-layer gate does not expect it, the
  full gate does.
- Entity types: `person`, `address`, `email`, `phone`, `iban`, `credit_card`,
  `national_id` (subtype `nino`, `ssn`, `bsn`, `steuer_id`, `nir`, `dni`,
  `codice_fiscale`), `date_of_birth`. Bank account numbers other than IBAN have
  no gold yet and are not scored.
- Each document is a short letter: greeting, filler, labelled fields in the
  document's language (some contact data inline in a sentence), a closing, the
  signature, then **look-alikes that must not be reported**: invoice and order
  numbers, a nine-digit number that is not a BSN, a card number and an IBAN
  with a wrong check digit, invoice dates.
- Support: at least 25 gold entities per type per language, or the cell cannot
  be judged and fails the gate (`min_support`). The thinnest cell today is
  credit_card in nl and de with 35.

### What this corpus can and cannot show

It is a regression and coverage instrument, not evidence of real-world
quality. The generator and the validators follow the same public rules, so the
validator layer scoring 1.0 on structured types says "the rules do what they
say", not "documents in the wild are caught". Layout noise, scanned pages, OCR
errors, columns, tables, line-broken numbers and unusual formats are not in it.
The model's scores on person and address are the first real signal, and still
come from template sentences. Before any public sentence about accuracy:

1. add hand-built realistic fixtures per language (still synthetic, with layout
   and OCR noise), and
2. register each claim in `CLAIMS.md` with run ID and date.

Neither is done. No accuracy number from this corpus goes on the website.

## 4. Scoring

A prediction matches a gold entity of the same type when intersection over
union of their character ranges is at least 0.5; matching is one-to-one, best
overlap first; types are scored independently. Reported per type and per
language: support, precision, recall. Precision is 1.0 when nothing was
predicted, recall is 1.0 when there was nothing to find. The harness
(`src-tauri/tests/pii_eval.rs`) tests its own scoring: a perfect detector, an
empty one, a partial overlap, a wrong type, a duplicate, and a select-all
detector must each score as they should, and the gate must fail the empty and
the select-all detector.

## 5. Release gate: thresholds

`tests/pii_eval/thresholds.json`. Recall is set higher than precision on
structured types because a miss in redaction is a privacy incident and a false
positive is one more click.

| Type | Validator layer (CI, every run) P / R | Full gate (model + validators) P / R |
|---|---|---|
| iban | 0.98 / 0.95 | 0.98 / 0.95 |
| email | 0.98 / 0.95 | 0.98 / 0.95 |
| credit_card | 0.98 / 0.95 | 0.98 / 0.95 |
| national_id | 0.98 / 0.95 | 0.98 / 0.95 |
| phone | 0.95 / 0.85 | 0.95 / 0.90 |
| date_of_birth | 0.95 / 0.85 | 0.95 / 0.90 |
| person | not expected | 0.85 / 0.90 |
| address | not expected | 0.75 / 0.85 |

Each cell is judged per language. **The rule: PII detection with the model is
only enabled when every required language (en, nl, de, fr, es, it) passes every
type in the full gate.** One failing cell and the model is not shipped at all;
the editor then offers the validator layer only and says that names and
addresses are not detected. There is no "supported languages" list that quietly
leaves a language out.

These numbers are a proposal. They are meant to be argued with before the
build round, not after it.

### How the gate is enforced

- `the_validator_layer_meets_its_thresholds_in_every_language` runs in the
  normal `cargo test` job on every merge request and on master, and on the
  macOS and Windows quality jobs. It is not `allow_failure`.
- `model_gate_scores_the_model_and_the_validators_together` needs the
  `pii-model` feature and `PDFLUENT_PII_MODEL_DIR`. Without them it prints
  `SKIPPED (not a pass): ...` on stderr. With `PDFLUENT_PII_WRITE_GATE=1` it
  writes `src-tauri/resources/pii/gate-report.json`: pass/fail, SHA-256 of the
  model file, of the corpus and of the thresholds, per-cell scores, and the
  languages that passed.
- `a_published_manifest_has_a_matching_passing_gate_report`: the manifest may
  say `published: true` only if that report passed, names the exact model file
  in the manifest, was made from the current corpus and thresholds, and lists
  exactly the languages the manifest lists. `a_gate_report_that_does_not_match_blocks_publication`
  proves each mismatch is refused.
- `tests/pii-component-licences.test.ts`: the manifest cannot be published
  while a licence row blocks publication (next section).
- At run time `pii_component::offered` is `published` and the `pii-model`
  feature. The UI shows the download offer only when it is true.

Mutation check (Definition of Done, point 3): breaking the Luhn function, the
BSN 11-proef or the NIR key in a scratch copy made the unit tests fail. Do it
again on the real tree in the build round, and for the phone fix below.

## 6. Licence inventory

Rows live in `compliance/pii-component-licences.json` (the lock files cannot see
model weights). Summary:

| Item | Licence | Status |
|---|---|---|
| GLiNER and gline-rs (format reference, no code copied, not a dependency) | Apache-2.0 | allowed |
| ort =2.0.0-rc.12, tokenizers 0.22 (crates, feature `pii-model`) | Apache-2.0 (ort is MIT OR Apache-2.0) | allowed; transitive licences to be read from `cargo license` in the build round |
| gliner-pii-base-v1.0 weights, ONNX UINT8 | Apache-2.0 (model card) | allowed |
| **gliner-pii-base-v1.0 training data and backbone** | **unverified** | **needs review, blocks publication** |
| ONNX Runtime library | MIT | allowed |
| Presidio (design reference, no code copied) | MIT | allowed |

The open question, from the research: the model card names neither the base
model nor the training data, and its numbers come from a vendor-side synthetic
set. An Apache-2.0 licence on the weights does not settle whether the data they
were trained on carried terms that restrict commercial redistribution of a model
derived from it. To close it: read the card and any dataset card on the pinned
revision, ask Knowledgator in writing for the training-data sources and their
licences, keep the answer in the legal evidence folder, record it in the row,
set `blocksPublication` to false. Until then `published` stays `false`.

## 7. What the website may say

Nothing about PII detection, personal data, "names and addresses" or
international coverage until the gate has passed on the real model, the
licence row is closed, the component is published, and each sentence has an ID
in `CLAIMS.md`. The editor's own text is already honest about the gap: without
the model it says names and addresses are not detected.

## 8. Fixes found while writing the evaluation

The corpus found real defects in the baseline pattern code; they are fixed and
have unit tests:

- the digits of an IBAN that failed its check were reported as a phone number;
- the tail groups of a card number that failed Luhn were reported as a phone
  number;
- the Belgian nine-digit landline rule accepted `06 1234567`;
- two positive/negative phone test cases contradicted each other (`01 23 45 67 89`
  is an ascending run; `+99 6...` is Kyrgyzstan, not an unassigned code).

## Build round

1. With network: any cargo command adds `ort` and `tokenizers` to the lock;
   check `cargo tree -i ort-sys` shows only rc.12, `cargo tree -f "{p} {f}"
   -p tokenizers` shows no `http`/`onig`, run `cargo license`; commit the lock.
2. `cargo test --manifest-path src-tauri/Cargo.toml` (validator gate, scoring
   tests, component tests, `pii_detection` integration test).
3. Owner approves the model download. Fetch the model at the pinned revision,
   convert/verify the UINT8 ONNX file, build `model/` and `runtime/`, fill the
   manifest hashes and sizes, `source_revision`.
4. `PDFLUENT_PII_MODEL_DIR=... PDFLUENT_PII_WRITE_GATE=1 cargo test --features
   pii-model --test pii_eval model_gate -- --nocapture`. Read the table. If a
   cell fails, the answer is not a lower threshold by reflex: look at the
   failures, then decide with the owner.
5. Close the licence row. Set `published: true` and `languages` from the report.
6. Merge with `feat/ocr-export`: swap the `FileSource` for the shared
   downloader, add `pii-component` to `scripts/generate-third-party.mjs` beside
   `ocr-component`, add the PII origin note to `docs/OUTBOUND_ENDPOINTS.md` and
   `offline-allowlist.mjs`, and host the files.
