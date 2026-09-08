# Quality rounds

How a capability of this editor gets better on purpose, and how anyone reading
later can tell whether it did.

This is the engine's protocol (`PDFluent/docs/STRATEGY_2026H2.md` §4) applied to
the editor. Nothing in it is new thinking; what is new is that the editor now
has the files it needs to run it.

## The vocabulary

**Capability** — something the product claims to do: open/render, text edit,
save, PDF/A export, Office export, OCR, forms, signing.

**Four axes, per capability.** A capability is not "working"; it has four
numbers, and each one hides what the others show.

| Axis | The question | What it hides on its own |
|---|---|---|
| Completes | did it finish, with a result or a typed error, without hanging | a document that finished by producing nothing |
| Speed | p50 and p95 over five runs, per document and across the corpus | a fast path that skipped the work |
| Fidelity | is the output still the document — pages, words, text, conformance | a faithful output nobody can open |
| Size (or a fourth axis where size does not apply) | what it cost | everything else |

An improvement on one axis never offsets a regression on another. Subsetting
fonts once halved output size and made 17 of 17 documents non-conformant; three
axes said it was a win.

**Tuning set** — the seventeen documents in `src-tauri/tests/golden/`,
SHA-256-pinned in `MANIFEST.json`. Numbers measured on it are an upper bound on
our own behaviour, never a claim about documents in the world.

**Holdout** — none yet. The six real-world documents phase 1 measured are of
unknown licence, are not in the repository and are not reproducible off one
machine, so they are measured (`golden-23`, rows in `quality/runs/` only) and
never blessed into a baseline. A claimable holdout means adopting the engine's
`corpus/GATE_CORPUS_MANIFEST.json` fetch on this side; that is its own ticket.

**Baseline** — `quality/axes/<capability>.tsv`, one row per document, platform
and fidelity metric. The last accepted measured value, exactly. Not a target,
not a round number.

**Ratchet** — `scripts/quality/ratchet.py`. Judges a run against the baseline
per document, never per corpus alone, in **both directions**: a value that got
worse fails, and a value that got better beyond tolerance fails too, with
"raise the baseline in its own commit and say what moved it". That two-way rule
is what makes a hand-edited number red either way, and it is the only thing that
keeps a floor a floor.

**Round** — one capability, one hypothesis, one owner, closed on a ticket with a
before/after table.

**Claim** — a sentence someone outside may read. Needs an ID in `CLAIMS.md` and
a holdout. Nothing in this document is a claim.

## Running it

```sh
# Measure (the headless seam; --release, because a debug number is not a number)
PDFLUENT_MACHINE_CLASS=dev-macbook-m1pro \
  cargo test --release --manifest-path src-tauri/Cargo.toml --test golden_axes -- --nocapture

# Judge
python3 scripts/quality/ratchet.py --all --run quality/runs/<run-id>.json

# Accept a deliberate change, in its own commit, naming the ticket
python3 scripts/quality/ratchet.py --all --run quality/runs/<run-id>.json --bless --ticket 412
```

`PDFLUENT_MACHINE_CLASS` must name a class in `quality/MACHINES.toml`. There is
no literal machine anywhere in the tooling: a number measured on "the Mac" is
not comparable to anything, and a class past its calibration window makes the
speed axes *skipped*, which the ratchet treats as exit 2 — not as a pass.

A platform with no rows yet is named in the output and does not fail. A floor
invented on a platform that never ran is worse than no floor. A row that exists
and could not be re-measured is exit 2.

## Per-capability state

| Capability | Measured today | Platform | Note |
|---|---|---|---|
| save | yes, seam | darwin | the E8 invariants, now as four numbers |
| text edit | yes, seam | darwin | `edit_made` and `edit_persisted` are separate axes |
| PDF/A | retention, stamp, size, speed | darwin | veraPDF conformance only where veraPDF is installed; on the CI runner **unknown** |
| open/render | no | — | needs the render timing and an SSIM comparison against `mutool draw`; the fourth axis is peak RSS, since output size does not apply |
| Office export | no | — | needs zip+XML validation in the seam; `soffice` opens it only in the release suite |
| OCR | no | darwin only when it lands | env-gated on a Python runtime; no CI machine is known to have one |
| forms | no | — | AcroForm on one fixture, XFA on fifteen |
| signing | no | — | an independent verifier must agree, not only our own reader |

A row saying "no" is the honest state, not a gap someone forgot. Each becomes a
round.

## The round template

Copy this into the round's ticket.

```
## Round <n> — <capability> — #<ticket>
Owner: one terminal.  Baseline run: <run-id>.  Base commit: <sha>
(ratchet green on <platform>: yes/no → if no, this round is that fix).
Target: <axis or documents>.  Hypothesis: <one sentence>.
Tuning set: golden-17 (MANIFEST SHA-verified).  Holdout: none.

During the round:
- every fix has a test that is red before it is green, on a generated fixture,
  never on a golden document;
- every guard touched is mutation-tested, and the mutation is pasted on the ticket;
- intermediate numbers are posted with their run ids;
- a day of silence means the round is presumed lost.

Closing table (both platforms where reachable):
| Set | Completes before→after | Speed p50/p95 | Fidelity | Size | Documents regressed on any axis |

Also: run ids, machine class, editor commit and XFA_SDK_REV before and after,
tool versions (veraPDF, mutool, qpdf, pdftotext, node, rustc), refused count.
Independent re-measure on the other platform: <numbers>, differences reported,
not reconciled.
Baseline commit: <sha> (quality/axes + quality/runs only; a why on every
lowered value). QUALITY_CHANGELOG entry: yes.
Closed with: landing sha, and the words "tuning set; not a claim".
```

## Round 1 — PDF/A size tail

Open as #451. Before: `_all` 9.06x, tail 53.6x / 36.0x / 14.9x / 13.7x / 12.4x,
with conformance, retention and stamped pages already where they should be.
Target: `_all` <= 1.25x and no document above 3x without a `why`, and not one
step down on any other axis.
