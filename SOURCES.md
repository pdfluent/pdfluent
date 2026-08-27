# Where the documents and fonts in this repository come from

This repository is public. A file committed here is published to anyone, and
"we found it on the internet" is not a licence.

Every PDF, office document and font is listed below with where it came from and
under what terms it may be redistributed. `scripts/ci/every_document_has_a_source.py`
fails the build for anything that is not.

## Why this file exists

On 2026-08-27 a government form from a third party was found here. It had been
in the repository since 2026-07-14, added as a test fixture, and the question of
whether we may redistribute it was never asked. It was purged from the history,
and the four tests that depended on it went with it.

Nobody put it here carelessly. It arrived the way such files always arrive — as
the most convenient example of the thing being tested. This list exists so the
question gets asked before the commit rather than after the publication.

## Fonts

| File | Origin | Terms |
| --- | --- | --- |
| `src-tauri/resources/fonts/liberation-2.1.5/*` | Liberation Fonts 2.1.5, Red Hat / Google | SIL Open Font License 1.1 — redistribution permitted; see the `LICENSE` beside them |

## Documents

| File | Origin | Terms |
| --- | --- | --- |
| `src-tauri/tests/fixtures/sample_acroform.pdf` | written by us as a minimal AcroForm | ours |
| `src-tauri/tests/fixtures/two_pages.pdf` | written by us, produced on macOS | ours |
| `tests/fixtures/minimal.pdf` | written by us, smallest valid PDF | ours |
| `tests/fixtures/sample-text.pdf` | written by us | ours |
| `tests/fixtures/sample-xfa.pdf` | written by us as a minimal XFA shell | ours |
| `store/screenshots/en/demo/Project-Proposal.pdf` | written by us as demo content | ours |

## Images

Screenshots under `store/` and `docs/` show this application rendering our own
demo content. They are ours.

`store/assets/*` are our own brand assets.

## What does not belong here

A document from a third party, however public it looks. A government form is
published so it can be filled in, which is not the same as published so it can be
redistributed inside someone else's product. If a test needs a realistic
document, generate one.
