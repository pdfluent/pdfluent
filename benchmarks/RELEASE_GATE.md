# PDFluent + XFA Unified Release Gate

> Architecture, gate order, failure taxonomy, and release criteria  
> Schema: `phase9.unified_release_gate.v1`

---

## 1. Purpose

The unified release gate is a single command that orchestrates all critical verification steps across both the **XFA Rust engine** and the **PDFluent Tauri desktop app**. It produces a machine-readable JSON report and a classified final verdict.

**Philosophy:**
- One command gives a release verdict.
- Expected unsupported docs are separated from regressions.
- No fake "green" from skipped workflows.
- Reports are machine-readable and human-interpretable.

---

## 2. Architecture

```
┌─ scripts/run_release_gate.sh ─────────────────────────────┐
│  Shell wrapper — forwards arguments to Python orchestrator │
└─────────────────────────────────────────────────────────────┘
                           │
                           ▼
┌─ scripts/release_gate.py ─────────────────────────────────┐
│  Python orchestrator                                       │
│  • Collects environment metadata                           │
│  • Runs gates in deterministic order                       │
│  • Captures stdout/stderr/exit codes                       │
│  • Parses existing gate JSON outputs                       │
│  • Classifies expected vs unexpected failures              │
│  • Computes final verdict                                  │
│  • Writes unified-release-gate.json                        │
└─────────────────────────────────────────────────────────────┘
                           │
           ┌───────────────┼───────────────┐
           ▼               ▼               ▼
    ┌────────────┐  ┌────────────┐  ┌────────────┐
    │ XFA Gates  │  │ PDFluent   │  │ Tauri Rust │
    │ (Python)   │  │ Frontend   │  │ (Cargo)    │
    └────────────┘  └────────────┘  └────────────┘
```

### Gate Order

Gates run sequentially in this order. A fatal failure in an early gate can skip downstream gates (configurable per gate).

| # | Gate | What It Validates | Fatal? | Skip on Fatal? |
|---|------|-------------------|--------|----------------|
| 1 | `xfa_build` | `cargo build -p xfa-cli` produces the `pdfluent` binary | Yes | — |
| 2 | `xfa_smoke` | 8-document smoke corpus: open, flatten, render, extract | Yes | Yes |
| 3 | `xfa_tier_a` | 8-document Tier A corpus: same as smoke, harder fixtures | Yes | Yes |
| 4 | `xfa_render_pillar` | 7-fixture visual fidelity gate: dimensions, blank detection, oracle SSIM | Yes | Yes |
| 5 | `xfa_text_pillar` | 6-fixture text extraction gate: content, ordering, positions | Yes | Yes |
| 6 | `pdfluent_wasm_contract` | WASM `.d.ts` matches frontend `wasmTypes.ts` contract | Yes | Yes |
| 7 | `pdfluent_typecheck` | TypeScript compiles without errors (`tsc --noEmit`) | Yes | Yes |
| 8 | `pdfluent_vitest` | Frontend unit/integration tests pass (6,000+ tests) | Yes | Yes |
| 9 | `pdfluent_tauri_cargo_check` | Tauri Rust code compiles (`cargo check`) | No | No |
| 10 | `pdfluent_tauri_cargo_test` | Tauri Rust unit tests pass (`cargo test`) | No | No |

---

## 3. Failure Taxonomy

### Per-Gate Status

| Status | Meaning |
|--------|---------|
| `pass` | Gate completed successfully with exit code 0 and no unsupported fixtures. |
| `expected_unsupported` | Gate completed successfully but some fixtures are expected-unsupported (non-fatal). |
| `fail` | Gate completed with non-zero exit code or detected regression. |
| `skipped` | Gate was skipped because a previous fatal gate failed. |
| `timeout` | Gate exceeded its time budget. |
| `infra_failure` | Command not found, permissions issue, or other infrastructure problem. |

### Final Verdicts

| Verdict | Code | Meaning | When |
|---------|------|---------|------|
| `PASS` | 0 | All gates passed. No blockers. | All gates `pass`. |
| `PASS_WITH_EXPECTED_UNSUPPORTED` | 0 | All gates passed, but some expected-unsupported fixtures present. | Gates pass with `expected_unsupported` status. |
| `PARTIAL_READY` | 1 | Some non-fatal gates failed. Product may be usable but not release-grade. | Non-fatal gate failures only. |
| `INFRA_FAILURE` | 2 | Infrastructure issue (missing binary, timeout, permissions). Re-run required. | Any `infra_failure` or `timeout`. |
| `RELEASE_BLOCKED` | 3 | Fatal gate failed. Release is blocked until fixed. | Any fatal gate `fail`. |

---

## 4. Release Criteria

### Alpha Release
- **Minimum:** `xfa_build`, `xfa_smoke`, `xfa_render_pillar`, `xfa_text_pillar` all pass.
- **Acceptable:** `PASS_WITH_EXPECTED_UNSUPPORTED` (known limitations are documented).

### Beta Release
- **Minimum:** All XFA gates pass + `pdfluent_wasm_contract` + `pdfluent_typecheck` pass.
- **Acceptable:** `PASS` or `PASS_WITH_EXPECTED_UNSUPPORTED`.
- **Blocker:** Any `fail` in fatal gates blocks beta.

### Commercial Desktop Release
- **Minimum:** All fatal gates pass + `pdfluent_vitest` passes.
- **Required:** `PASS` or `PASS_WITH_EXPECTED_UNSUPPORTED`.
- **Blocker:** Any frontend test failure, type error, or WASM contract drift.

### Enterprise SDK Release
- **Minimum:** All gates pass including `pdfluent_tauri_cargo_check` and `pdfluent_tauri_cargo_test`.
- **Required:** `PASS` (no expected unsupported at SDK boundary).
- **Blocker:** Any cargo test failure, facade regression, or binding issue.

---

## 5. Expected Unsupported Philosophy

**Expected unsupported is not a failure.** It is an explicit, documented classification of documents or features that the engine intentionally does not support.

Examples:
- Password-protected PDFs (engine rejects them by design).
- XFA forms with missing template packets (flatten is impossible).
- Complex FormCalc loops that exceed runtime limits.

**Baselines must be explicit JSON.** The `benchmarks/release-gate-baseline.json` file lists every expected-unsupported fixture by gate and ID. If a new unsupported fixture appears, it must be added to the baseline or treated as a regression.

**Never hide unsupported classifications in code.** They must be machine-readable and auditable.

---

## 6. Baseline Format

`benchmarks/release-gate-baseline.json`:

```json
{
  "schema_version": "phase9.release_gate_baseline.v1",
  "expected_unsupported": {
    "gate_name": {
      "reason": "human-readable explanation",
      "fixture_ids": ["fixture-id-1", "fixture-id-2"]
    }
  },
  "expected_visual_mismatch": {
    "gate_name": {
      "reason": "oracle PNGs not available",
      "fixture_ids": []
    }
  }
}
```

---

## 7. Report Format

The orchestrator writes `benchmarks/runs/unified-release-gate.json`:

```json
{
  "schema_version": "phase9.unified_release_gate.v1",
  "timestamp": "2026-05-14T15:00:00+00:00",
  "environment": {
    "os": "Darwin",
    "os_version": "24.4.0",
    "arch": "arm64",
    "python_version": "3.12.0",
    "node_version": "v22.0.0",
    "rust_toolchain": "stable-aarch64-apple-darwin (default)",
    "git_commit": "abc1234"
  },
  "baseline": "phase9.release_gate_baseline.v1",
  "summary": {
    "verdict": "PASS",
    "total_gates": 10,
    "pass": 8,
    "fail": 0,
    "skipped": 0,
    "expected_unsupported": 2,
    "infra_failure": 0,
    "timeout": 0,
    "total_duration_ms": 45000,
    "blocker_count": 0,
    "blockers": []
  },
  "gates": [
    {
      "name": "xfa_smoke",
      "status": "expected_unsupported",
      "duration_ms": 5200,
      "exit_code": 0,
      "json_summary": {
        "schema": "phase4.enterprise_corpus_gate.v1",
        "total": 8,
        "status_counts": {"pass": 6, "unsupported": 2},
        "gate_passed": true
      },
      "artifact_path": "benchmarks/runs/enterprise-corpus-smoke.json"
    }
  ],
  "artifact_directory": "benchmarks/runs"
}
```

---

## 8. Running the Gate

### Full Run (Recommended for Release)
```bash
./scripts/run_release_gate.sh
```

### Skip Slow Build (Binary Already Exists)
```bash
./scripts/run_release_gate.sh --skip-xfa-build
```

### Verbose (Print stdout/stderr on Failure)
```bash
./scripts/run_release_gate.sh --verbose
```

### Custom Timeout
```bash
PDFLUENT_GATE_TIMEOUT=600 ./scripts/run_release_gate.sh
```

### Custom Binary Path
```bash
PDFLUENT_GATE_BIN=target/release/pdfluent ./scripts/run_release_gate.sh
```

---

## 9. Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PDFLUENT_GATE_BIN` | `target/debug/pdfluent` | Path to the `pdfluent` CLI binary |
| `PDFLUENT_GATE_TIMEOUT` | `300` | Timeout per gate in seconds |
| `PDFLUENT_GATE_OUT_DIR` | `benchmarks/runs` | Output directory for JSON reports |

---

## 10. Difference Between Alpha / Beta / Release-Ready

| Dimension | Alpha | Beta | Release |
|-----------|-------|------|---------|
| **XFA gates** | Smoke + pillars pass | All XFA gates pass | All XFA gates pass |
| **Frontend** | Not required | WASM contract + typecheck pass | All vitest passes |
| **Tauri Rust** | Not required | `cargo check` passes | `cargo check` + `cargo test` pass |
| **Expected unsupported** | Allowed | Allowed | Ideally zero |
| **Verdict** | `PASS_WITH_EXPECTED_UNSUPPORTED` | `PASS` or `PASS_WITH_EXPECTED_UNSUPPORTED` | `PASS` |
| **User readiness** | Internal testing | External beta testers | General availability |

---

*End of RELEASE_GATE.md*
