<!--
Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.

This software is proprietary. The PDFluent application is free to use,
including for commercial purposes. Redistribution, or extraction or reuse
of its components (including the embedded PDF engine), requires a licence.
See https://pdfluent.com/license for terms.
-->

# product/

The editor's promises, in one place.

| file | what it is |
|---|---|
| `editor-features.json` | every feature the editor promises, denies or has retired, with its journeys, its register affordances, the tests that prove it per platform, and the copy the site and stores show |
| `journeys.json` | the journey catalogue (J-ids, title, priority), transcribed from section 2 of the Q4 2026 editor plan |

`scripts/quality/features.mjs` reads both. Nothing else may state what the
editor does: the website renders a published copy of `editor-features.json`,
and the store listings take their bullets from it.

## Statuses

| status | gate | published |
|---|---|---|
| `promised` | every listed test PASSES on every platform it names; on `macos-arm64` and `windows-x64` at least one test must run real code (a `playwright-mock` test alone does not count) | yes |
| `preview` | same as `promised`; the site shows a Preview label | yes |
| `pending-proof` | not gated. Promised in public (owner decision D1, 17-10-2026) and not proven yet. Names the journeys and the stream (`owner_stream`: A e2e, B editing, C OCR/export, D feedback) that makes it true | yes |
| `not-offered` | none. The site says plainly that the editor does not do it | yes |
| `retired` | none | no |

### The pending-proof ratchet

`pending_proof_ceiling` lists the feature ids that were pending-proof when the
file was seeded (18-10-2026). `--check` fails when:

- a feature is `pending-proof` and its id is not in the ceiling (nothing new
  enters, and a `promised` feature cannot fall back);
- an id in the ceiling is no longer `pending-proof` (remove it in the same
  change that proves the feature);
- with `--base <ref>`, the ceiling holds an id the base's ceiling did not.

There is no environment variable, flag or file that skips the check or the
gate. A promise that cannot be proven comes off the site (`retired`) or is
denied (`not-offered`).

## Commands

```
node scripts/quality/features.mjs --check [--base <git-ref>]
node scripts/quality/features.mjs --gate --platform <macos-arm64|windows-x64> \
     --junit <vitest-junit.xml> [--junit <more.xml>] [--cargo-log <cargo-test-output>]
node scripts/quality/features.mjs --publish <out.json> [--commit <sha>]
```

`--check` runs before `--gate` and `--publish` as well.

## Test ids

| kind | id | resolved in |
|---|---|---|
| `rust` | `<test binary>::<test path>`: `pdfluent_lib::pdf_engine::tests::op_merge_pdfs_combines_page_counts` for a unit test in `src/lib.rs`, `save_is_atomic::a_read_only_document_is_refused_not_replaced` for `src-tauri/tests/save_is_atomic.rs` | the `cargo test` output passed as `--cargo-log` (the binary is the name on cargo's `Running` line, without its hash) |
| `unit-behaviour`, `playwright-mock`, `e2e-real-app` | `<file>` for every case in a file, `<file>::<describe> > <title>` for one case, `<file>::<describe>` for every case under that describe | the JUnit files passed as `--junit` (`classname` = file, `name` = full title) |

A case that is SKIPPED is not a pass. An id that matches nothing in the results
is not a pass. Either fails the gate with the feature id and the test id named.

## docs/JOURNEY_TESTS.json (written by the e2e stream)

The e2e stream (A) owns `docs/JOURNEY_TESTS.json` and the per-run results;
this gate reads both and never writes them.

```json
{
  "schema": 1,
  "platforms": { "macos-arm64": "journeys:macos", "windows-x64": "journeys:windows" },
  "journeys": {
    "J-34": { "title": "Print", "priority": "P0", "spec": "tests/journeys/J-34-print.e2e.ts",
              "platforms": ["macos-arm64", "windows-x64"], "gaps": [] },
    "J-41": { "title": "Type digits while editing text", "priority": "P0", "spec": "tests/journeys/J-41.e2e.ts",
              "platforms": ["macos-arm64", "windows-x64"],
              "gaps": [{ "id": "digits-switch-mode", "owner": "stream-B", "reason": "..." }] }
  }
}
```

For a `promised` or `preview` feature, each of its journeys that has a `spec`
and lists the platform being judged is a real-app test on that platform, in
addition to the feature's own `tests`:

- a gap that applies on that platform (`gaps[].platforms` absent or naming it)
  is a FAIL, with the gap and its owner named: a known gap is not a pass;
- otherwise `journey-results/<platform>/<J-id>.json` (written by the journey
  run, judged by `scripts/quality/journey-results.mjs`) must have
  `"status": "pass"`. Pass the directory with `--journey-results <dir>`; a
  missing file, `skipped`, `fail` or `known-gap` is a FAIL;
- a journey with `"spec": null` adds nothing; the feature's own tests decide.

`--check` validates the file whenever it exists. When it is absent, `--check`
and `--gate` say so on stderr every run. Once it lands, the gate must run where
the journey results exist (the journey job of each platform), or every promised
feature whose journey has a spec is red for want of a result.

## Copy

Every string in `copy.name`, `copy.site`, `copy.store_bullet` and `limits` is
published. It comes through the external-copy route (CLAUDE.md), and a string
with a digit in it needs a CLAIMS.md id in `copy.claims`. `--check` verifies the
id's shape; whether the id is committed in CLAIMS.md is checked when the copy is
published, in the PDFluent workspace, because CLAIMS.md is not in this
repository.

## Gaps with an owner but no feature of their own

Journey gaps from `docs/JOURNEY_TESTS.json` that had no owner, assigned on
18-10. Each is either inside a feature above (its note says so) or not a
public promise at all, so it needs no entry here beyond the owner.

| Gap | Journey | Owner | Where it lives |
|---|---|---|---|
| XFA filling is absent from release builds | J-59 | B | `xfa-fill` (pending-proof) |
| Dark mode choice is not kept across restarts | J-37 | B | not a public promise; journey gap only |
| Finding personal data to redact | J-66 | D | `pii-detection` (pending-proof; built on search + redaction) |
| `report.pdfluent.com` has no DNS record | J-A6, J-A7 | D | `crash-reports`; closed by the report Worker deploy (infra/report-worker/README.md, owner steps) |
