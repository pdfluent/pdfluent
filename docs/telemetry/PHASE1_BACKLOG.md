# Telemetry — Fase 1 backlog

Follow-up items surfaced during the Fase 0 privacy/compliance review of the
crash-reporting + feedback system (see `CRASH_REPORTING_FEEDBACK_PLAN.md`).
Both are **non-blocking** for Fase 0: opt-in/default-off, review-before-send,
and source-side scrubbing already hold. These tighten two specific edges.

Docs-only for now — no runtime code change is in scope until these are picked
up as their own work.

---

## 1. Stricter short-secret scrubbing

**Problem.** `src/lib/telemetry/scrub.ts` (and its mirror in
`infra/report-worker/worker.js`) redacts file paths, emails, document
filenames, and long base64/hex blobs. Short inline secrets only get caught when
they happen to be long enough to trip the base64/hex rules. Strings like the
following can still pass through a crash message or stack:

- `password=hunter2`, `passwd: ...`, `secret=...`
- `Authorization: Bearer abc123`, bare `Bearer <token>`
- OpenAI-style keys: `sk-...`
- AWS access keys: `AKIA...` (and the longer secret key forms)
- short/medium API keys and `api_key=...` / `token=...` assignments

The review-before-send dialog is the backstop today (the user sees the exact
payload), but the stated minimum is "scrub at source; over-redaction is
acceptable, under-redaction is not."

**Scope.**
- Add targeted patterns for the token shapes above to the shared scrub.
- Keep the TS frontend and the JS Worker scrub in lockstep (defence-in-depth).

**Watch out for false positives.** Do **not** ship an aggressive catch-all that
mangles normal PDF/document text or ordinary prose. Prefer key/prefix-anchored
patterns (`sk-`, `AKIA`, `Bearer `, `password=`) over broad
"any alphanumeric run" rules. When in doubt, redact the value after a known key
rather than guessing at free-floating tokens.

**Acceptance.**
- Unit tests in `src/lib/telemetry/__tests__/scrub.test.ts` proving each of the
  above strings is removed from `message` and `stack`.
- A test (or equivalent assertion) that the same input scrubs identically on the
  Worker side, so frontend and server stay in sync.
- Regression tests proving representative normal document/prose text is left
  intact (no new false positives).

---

## 2. Cap pending-crash NDJSON size

**Problem.** The Rust panic hook in `src-tauri/src/telemetry.rs`
(`install_panic_hook`) *appends* one JSON line per panic to
`pending-crashes.ndjson` with no size cap. Cross-launch growth is bounded —
`take_pending_crashes` reads and deletes the file on each launch — so the only
unbounded path is repeated non-fatal thread panics within a single session.
Low risk, but currently unbounded.

**Scope.**
- Bound the file at write time: a max entry count and/or a max byte size.
- Prune oldest-first when the cap is exceeded, so the most recent crashes
  survive (they are the ones most likely to matter on next launch).
- Keep the write path best-effort and panic-safe — it runs inside the panic
  hook, so it must never itself panic or block shutdown.

**Acceptance.**
- A Rust unit test in `src-tauri/src/telemetry.rs` for the bounded
  append/prune behaviour: appending past the cap keeps the file within the
  limit and retains the newest entries.
- Existing tests (`pending_crash_roundtrips_through_json`,
  `take_pending_crashes`) continue to pass.

---

_Constraints carried from Fase 0: telemetry stays editor-only; no SDK/XFA/engine
changes; opt-in/default-off; review-before-send; no IP/user-id/third-party
endpoints._
