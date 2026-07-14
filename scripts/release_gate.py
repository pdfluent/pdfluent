#!/usr/bin/env python3
"""
Unified Release Gate Orchestrator for PDFluent + XFA.

Runs all critical gates in deterministic order, produces machine-readable
reports, classifies failures, and outputs a final verdict.

Usage:
    python3 scripts/release_gate.py
    python3 scripts/release_gate.py --skip-xfa-build --skip-playwright
    python3 scripts/release_gate.py --baseline benchmarks/release-gate-baseline.json

Environment:
    PDFLUENT_GATE_BIN      Override XFA binary path (default: target/debug/pdfluent)
    PDFLUENT_GATE_TIMEOUT  Timeout per gate in seconds (default: 300)
    PDFLUENT_GATE_OUT_DIR  Output directory for reports (default: benchmarks/runs)
"""

from __future__ import annotations

import argparse
import json
import os
import platform
import shutil
import subprocess
import sys
import time
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

SCHEMA_VERSION = "phase10.unified_release_gate.v2"

VERDICT_PASS = "PASS"
VERDICT_PASS_WITH_EXPECTED_UNSUPPORTED = "PASS_WITH_EXPECTED_UNSUPPORTED"
VERDICT_PARTIAL_READY = "PARTIAL_READY"
VERDICT_RELEASE_BLOCKED = "RELEASE_BLOCKED"
VERDICT_INFRA_FAILURE = "INFRA_FAILURE"

GATE_STATUS_PASS = "pass"
GATE_STATUS_FAIL = "fail"
GATE_STATUS_SKIPPED = "skipped"
GATE_STATUS_EXPECTED_UNSUPPORTED = "expected_unsupported"
GATE_STATUS_TIMEOUT = "timeout"
GATE_STATUS_INFRA_FAILURE = "infra_failure"

FATAL_GATES = {
    "xfa_build",
    "xfa_smoke",
    "xfa_tier_a",
    "xfa_render_pillar",
    "xfa_text_pillar",
    "pdfluent_wasm_contract",
    "pdfluent_typecheck",
    "pdfluent_vitest",
}

# ---------------------------------------------------------------------------
# Data structures
# ---------------------------------------------------------------------------

@dataclass
class GateConfig:
    name: str
    description: str
    command: list[str]
    cwd: Path
    output_json_path: Path | None = None
    timeout: int = 300
    is_fatal: bool = True
    skip_if_previous_fatal: bool = True
    extract_summary_from_json: bool = True
    expected_unsupported_keys: list[str] = field(default_factory=list)


@dataclass
class GateResult:
    name: str
    status: str
    exit_code: int | None
    duration_ms: int
    stdout: str
    stderr: str
    json_summary: dict[str, Any] | None = None
    error_message: str | None = None
    artifact_path: str | None = None


# ---------------------------------------------------------------------------
# Environment detection
# ---------------------------------------------------------------------------

def get_environment() -> dict[str, str]:
    """Collect machine/environment metadata."""
    env: dict[str, str] = {
        "os": platform.system(),
        "os_version": platform.release(),
        "arch": platform.machine(),
        "python_version": platform.python_version(),
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }

    # Node version
    node_path = shutil.which("node")
    if node_path:
        try:
            result = subprocess.run(
                [node_path, "--version"],
                capture_output=True,
                text=True,
                timeout=10,
            )
            if result.returncode == 0:
                env["node_version"] = result.stdout.strip()
        except Exception:
            pass

    # Rust version
    rustup_path = shutil.which("rustup")
    if rustup_path:
        try:
            result = subprocess.run(
                [rustup_path, "show", "active-toolchain"],
                capture_output=True,
                text=True,
                timeout=10,
            )
            if result.returncode == 0:
                env["rust_toolchain"] = result.stdout.strip().splitlines()[0].strip()
        except Exception:
            pass

    rustc_path = shutil.which("rustc")
    if rustc_path:
        try:
            result = subprocess.run(
                [rustc_path, "--version"],
                capture_output=True, text=True, timeout=10,
            )
            if result.returncode == 0:
                env["rustc_version"] = result.stdout.strip()
        except Exception:
            pass

    cargo_path = shutil.which("cargo")
    if cargo_path:
        try:
            result = subprocess.run(
                [cargo_path, "--version"],
                capture_output=True, text=True, timeout=10,
            )
            if result.returncode == 0:
                env["cargo_version"] = result.stdout.strip()
        except Exception:
            pass

    npm_path = shutil.which("npm")
    if npm_path:
        try:
            result = subprocess.run(
                [npm_path, "--version"],
                capture_output=True, text=True, timeout=10,
            )
            if result.returncode == 0:
                env["npm_version"] = result.stdout.strip()
        except Exception:
            pass

    # Git commit hash (local only, no network)
    git_path = shutil.which("git")
    if git_path:
        try:
            result = subprocess.run(
                [git_path, "rev-parse", "--short", "HEAD"],
                capture_output=True,
                text=True,
                timeout=10,
            )
            if result.returncode == 0:
                env["git_commit"] = result.stdout.strip()
        except Exception:
            pass

    return env


# ---------------------------------------------------------------------------
# Gate execution
# ---------------------------------------------------------------------------

def run_gate(config: GateConfig) -> GateResult:
    """Execute a single gate and return structured results."""
    start = time.monotonic()
    stdout = ""
    stderr = ""
    exit_code: int | None = None
    error_message: str | None = None
    json_summary: dict[str, Any] | None = None

    try:
        result = subprocess.run(
            config.command,
            cwd=config.cwd,
            capture_output=True,
            text=True,
            timeout=config.timeout,
        )
        exit_code = result.returncode
        stdout = result.stdout
        stderr = result.stderr

        # Try to parse JSON output if path is provided and file exists
        if config.output_json_path and config.output_json_path.exists():
            try:
                with open(config.output_json_path, "r", encoding="utf-8") as f:
                    data = json.load(f)
                if config.extract_summary_from_json:
                    json_summary = {
                        "schema": data.get("schema_version", "unknown"),
                        "total": data.get("summary", {}).get("total"),
                        "status_counts": data.get("summary", {}).get("status_counts"),
                        "gate_passed": data.get("summary", {}).get("gate_passed"),
                    }
                else:
                    json_summary = {"raw": data}
            except Exception as e:
                json_summary = {"parse_error": str(e)}

    except subprocess.TimeoutExpired as e:
        exit_code = None
        stdout = e.stdout or ""
        stderr = e.stderr or ""
        error_message = f"Gate timed out after {config.timeout}s"
    except FileNotFoundError as e:
        exit_code = None
        error_message = f"Command not found: {e.filename}"
    except Exception as e:
        exit_code = None
        error_message = f"Unexpected error: {e}"

    duration_ms = int((time.monotonic() - start) * 1000)

    # Determine status
    if error_message and "timed out" in error_message:
        status = GATE_STATUS_TIMEOUT
    elif error_message and "not found" in error_message:
        status = GATE_STATUS_INFRA_FAILURE
    elif error_message:
        status = GATE_STATUS_INFRA_FAILURE
    elif exit_code != 0:
        status = GATE_STATUS_FAIL
    else:
        status = GATE_STATUS_PASS

    # Check for expected unsupported from JSON summary
    if status == GATE_STATUS_PASS and json_summary:
        status_counts = json_summary.get("status_counts")
        if isinstance(status_counts, dict):
            has_unsupported = status_counts.get("unsupported", 0) > 0
            if has_unsupported:
                status = GATE_STATUS_EXPECTED_UNSUPPORTED

    return GateResult(
        name=config.name,
        status=status,
        exit_code=exit_code,
        duration_ms=duration_ms,
        stdout=stdout,
        stderr=stderr,
        json_summary=json_summary,
        error_message=error_message,
        artifact_path=str(config.output_json_path) if config.output_json_path else None,
    )


# ---------------------------------------------------------------------------
# Verdict computation
# ---------------------------------------------------------------------------

def compute_verdict(
    results: list[GateResult],
    baseline: dict[str, Any],
) -> tuple[str, list[str]]:
    """Compute final release verdict and blocker list."""
    blockers: list[str] = []
    has_expected_unsupported = False
    has_infra_failure = False
    has_fatal_failure = False

    for result in results:
        if result.status == GATE_STATUS_SKIPPED:
            continue

        if result.status == GATE_STATUS_INFRA_FAILURE:
            has_infra_failure = True
            blockers.append(f"[{result.name}] INFRA_FAILURE: {result.error_message}")
            continue

        if result.status == GATE_STATUS_TIMEOUT:
            has_fatal_failure = True
            blockers.append(f"[{result.name}] TIMEOUT after gate duration")
            continue

        if result.status == GATE_STATUS_FAIL:
            if result.name in FATAL_GATES:
                has_fatal_failure = True
            blockers.append(f"[{result.name}] FAIL (exit_code={result.exit_code})")
            continue

        if result.status == GATE_STATUS_EXPECTED_UNSUPPORTED:
            has_expected_unsupported = True
            continue

    if has_infra_failure:
        return VERDICT_INFRA_FAILURE, blockers

    if has_fatal_failure:
        return VERDICT_RELEASE_BLOCKED, blockers

    if has_expected_unsupported:
        return VERDICT_PASS_WITH_EXPECTED_UNSUPPORTED, blockers

    if blockers:
        return VERDICT_PARTIAL_READY, blockers

    return VERDICT_PASS, blockers


# ---------------------------------------------------------------------------
# Report generation
# ---------------------------------------------------------------------------

def build_report(
    results: list[GateResult],
    verdict: str,
    blockers: list[str],
    baseline: dict[str, Any],
    env: dict[str, str],
    out_dir: Path,
) -> dict[str, Any]:
    """Build the final machine-readable release report."""
    total_duration_ms = sum(r.duration_ms for r in results)
    pass_count = sum(1 for r in results if r.status == GATE_STATUS_PASS)
    fail_count = sum(1 for r in results if r.status == GATE_STATUS_FAIL)
    skip_count = sum(1 for r in results if r.status == GATE_STATUS_SKIPPED)
    expected_unsupported_count = sum(
        1 for r in results if r.status == GATE_STATUS_EXPECTED_UNSUPPORTED
    )
    infra_count = sum(1 for r in results if r.status == GATE_STATUS_INFRA_FAILURE)
    timeout_count = sum(1 for r in results if r.status == GATE_STATUS_TIMEOUT)

    gate_entries = []
    for r in results:
        entry: dict[str, Any] = {
            "name": r.name,
            "status": r.status,
            "duration_ms": r.duration_ms,
        }
        if r.exit_code is not None:
            entry["exit_code"] = r.exit_code
        if r.error_message:
            entry["error_message"] = r.error_message
        if r.json_summary:
            entry["json_summary"] = r.json_summary
        if r.artifact_path:
            entry["artifact_path"] = r.artifact_path
        gate_entries.append(entry)

    return {
        "schema_version": SCHEMA_VERSION,
        "timestamp": env.get("timestamp", datetime.now(timezone.utc).isoformat()),
        "environment": env,
        "baseline": baseline.get("schema_version", "none"),
        "summary": {
            "verdict": verdict,
            "total_gates": len(results),
            "pass": pass_count,
            "fail": fail_count,
            "skipped": skip_count,
            "expected_unsupported": expected_unsupported_count,
            "infra_failure": infra_count,
            "timeout": timeout_count,
            "total_duration_ms": total_duration_ms,
            "blocker_count": len(blockers),
            "blockers": blockers,
        },
        "gates": gate_entries,
        "artifact_directory": str(out_dir),
    }


# ---------------------------------------------------------------------------
# Gate definitions
# ---------------------------------------------------------------------------

def define_gates(
    xfa_root: Path,
    pdfluent_root: Path,
    out_dir: Path,
    bin_path: str,
    timeout: int,
    skip_xfa_build: bool,
    skip_playwright: bool,
    skip_cargo_test: bool,
) -> list[GateConfig]:
    """Define the ordered list of gates to run."""
    baseline_path = xfa_root / "benchmarks" / "tier_a_expected_baseline.json"

    gates: list[GateConfig] = []

    # 1. XFA Build
    if not skip_xfa_build:
        gates.append(
            GateConfig(
                name="xfa_build",
                description="Build XFA CLI binary (cargo build -p xfa-cli)",
                command=["cargo", "build", "-p", "xfa-cli"],
                cwd=xfa_root,
                timeout=timeout,
                is_fatal=True,
                skip_if_previous_fatal=True,
                extract_summary_from_json=False,
            )
        )

    # 2. XFA Smoke Gate
    gates.append(
        GateConfig(
            name="xfa_smoke",
            description="Enterprise corpus smoke gate (8 docs)",
            command=[
                "python3",
                str(xfa_root / "scripts" / "enterprise_corpus_gate.py"),
                "--tier", "smoke",
                "--binary", bin_path,
                "--expected-baseline", str(baseline_path),
                "--timeout", "30",
                "--dpi", "72",
                "--output", str(out_dir / "enterprise-corpus-smoke.json"),
            ],
            cwd=xfa_root,
            output_json_path=out_dir / "enterprise-corpus-smoke.json",
            timeout=timeout,
            is_fatal=True,
            skip_if_previous_fatal=True,
        )
    )

    # 3. XFA Tier A Gate
    gates.append(
        GateConfig(
            name="xfa_tier_a",
            description="Enterprise corpus Tier A gate (8 docs)",
            command=[
                "python3",
                str(xfa_root / "scripts" / "enterprise_corpus_gate.py"),
                "--tier", "tier-a",
                "--binary", bin_path,
                "--expected-baseline", str(baseline_path),
                "--timeout", "30",
                "--dpi", "72",
                "--output", str(out_dir / "enterprise-corpus-tier-a.json"),
            ],
            cwd=xfa_root,
            output_json_path=out_dir / "enterprise-corpus-tier-a.json",
            timeout=timeout,
            is_fatal=True,
            skip_if_previous_fatal=True,
        )
    )

    # 4. XFA Render Pillar
    gates.append(
        GateConfig(
            name="xfa_render_pillar",
            description="Render pillar gate — visual fidelity (7 fixtures)",
            command=[
                "python3",
                str(xfa_root / "scripts" / "render_pillar_gate.py"),
                "--binary", bin_path,
                "--output", str(out_dir / "render-pillar-gate.json"),
            ],
            cwd=xfa_root,
            output_json_path=out_dir / "render-pillar-gate.json",
            timeout=timeout,
            is_fatal=True,
            skip_if_previous_fatal=True,
        )
    )

    # 5. XFA Text Pillar
    gates.append(
        GateConfig(
            name="xfa_text_pillar",
            description="Text pillar gate — text extraction (6 fixtures)",
            command=[
                "python3",
                str(xfa_root / "scripts" / "text_pillar_gate.py"),
                "--binary", bin_path,
                "--output", str(out_dir / "text-pillar-gate.json"),
            ],
            cwd=xfa_root,
            output_json_path=out_dir / "text-pillar-gate.json",
            timeout=timeout,
            is_fatal=True,
            skip_if_previous_fatal=True,
        )
    )

    # 6. PDFluent WASM Contract Check
    gates.append(
        GateConfig(
            name="pdfluent_wasm_contract",
            description="Verify WASM TypeScript contract against frontend types",
            command=["npm", "run", "wasm:check-contract"],
            cwd=pdfluent_root,
            timeout=timeout,
            is_fatal=True,
            skip_if_previous_fatal=True,
            extract_summary_from_json=False,
        )
    )

    # 7. PDFluent TypeScript Typecheck
    gates.append(
        GateConfig(
            name="pdfluent_typecheck",
            description="TypeScript typecheck (tsc --noEmit)",
            command=["npm", "run", "typecheck"],
            cwd=pdfluent_root,
            timeout=timeout,
            is_fatal=True,
            skip_if_previous_fatal=True,
            extract_summary_from_json=False,
        )
    )

    # 8. PDFluent Vitest
    gates.append(
        GateConfig(
            name="pdfluent_vitest",
            description="Frontend unit/integration tests (vitest run)",
            command=["npm", "run", "test"],
            cwd=pdfluent_root,
            timeout=timeout * 2,
            is_fatal=True,
            skip_if_previous_fatal=True,
            extract_summary_from_json=False,
        )
    )

    # 9. PDFluent Tauri Cargo Check
    gates.append(
        GateConfig(
            name="pdfluent_tauri_cargo_check",
            description="Tauri Rust code check (cargo check)",
            command=["cargo", "check"],
            cwd=pdfluent_root / "src-tauri",
            timeout=timeout,
            is_fatal=False,
            skip_if_previous_fatal=False,
            extract_summary_from_json=False,
        )
    )

    # 10. Optional: PDFluent Tauri Cargo Test
    if not skip_cargo_test:
        gates.append(
            GateConfig(
                name="pdfluent_tauri_cargo_test",
                description="Tauri Rust unit tests (cargo test)",
                command=["cargo", "test"],
                cwd=pdfluent_root / "src-tauri",
                timeout=timeout * 2,
                is_fatal=False,
                skip_if_previous_fatal=False,
                extract_summary_from_json=False,
            )
        )

    # 11. Package Audit — version coherence, license consistency, publish safety
    gates.append(
        GateConfig(
            name="pdfluent_package_audit",
            description="Package audit — versions, licenses, publish safety, WASM artifacts",
            command=[
                "python3",
                str(pdfluent_root / "scripts" / "package_audit.py"),
            ],
            cwd=pdfluent_root,
            output_json_path=out_dir / "package-audit.json",
            timeout=30,
            is_fatal=False,
            skip_if_previous_fatal=False,
            extract_summary_from_json=True,
        )
    )

    # 12. Support Bundle Smoke Test
    gates.append(
        GateConfig(
            name="pdfluent_support_bundle",
            description="Generate and validate a support bundle",
            command=[
                "python3",
                str(pdfluent_root / "scripts" / "generate_support_bundle.py"),
                "--validate",
                "--output", str(out_dir / "support-bundle-smoke.json"),
            ],
            cwd=pdfluent_root,
            output_json_path=out_dir / "support-bundle-smoke.json",
            timeout=30,
            is_fatal=False,
            skip_if_previous_fatal=False,
            extract_summary_from_json=False,
        )
    )

    # 13. Taxonomy Consistency — vitest tests for error taxonomy
    gates.append(
        GateConfig(
            name="pdfluent_taxonomy_consistency",
            description="Error taxonomy and crash fixture classification tests",
            command=[
                "npm", "run", "test", "--",
                "tests/crash-fixture-classification.test.ts",
                "tests/support-bundle-and-diagnostics.test.ts",
            ],
            cwd=pdfluent_root,
            timeout=timeout,
            is_fatal=False,
            skip_if_previous_fatal=False,
            extract_summary_from_json=False,
        )
    )

    return gates


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main() -> int:
    parser = argparse.ArgumentParser(
        description="Unified Release Gate Orchestrator for PDFluent + XFA",
    )
    parser.add_argument(
        "--baseline",
        type=Path,
        default=None,
        help="Path to expected-unsupported baseline JSON",
    )
    parser.add_argument(
        "--out-dir",
        type=Path,
        default=None,
        help="Output directory for reports (default: benchmarks/runs)",
    )
    parser.add_argument(
        "--skip-xfa-build",
        action="store_true",
        help="Skip XFA binary build (assumes binary exists)",
    )
    parser.add_argument(
        "--skip-playwright",
        action="store_true",
        help="Skip Playwright E2E tests",
    )
    parser.add_argument(
        "--skip-cargo-test",
        action="store_true",
        help="Skip Tauri cargo test",
    )
    parser.add_argument(
        "--timeout",
        type=int,
        default=int(os.environ.get("PDFLUENT_GATE_TIMEOUT", "300")),
        help="Timeout per gate in seconds",
    )
    parser.add_argument(
        "--bin",
        type=str,
        default=os.environ.get("PDFLUENT_GATE_BIN", "target/debug/pdfluent"),
        help="Path to pdfluent CLI binary",
    )
    parser.add_argument(
        "--verbose",
        action="store_true",
        help="Print gate stdout/stderr on failure",
    )
    args = parser.parse_args()

    pdfluent_root = Path(__file__).resolve().parents[1]
    xfa_root = pdfluent_root.parents[1] / "XFA"

    if not xfa_root.exists():
        # Fallback: look for XFA as sibling of PDFluent directory
        xfa_root = pdfluent_root.parent / "XFA"

    out_dir = args.out_dir or (pdfluent_root / "benchmarks" / "runs")
    out_dir.mkdir(parents=True, exist_ok=True)

    # Load baseline
    baseline: dict[str, Any] = {}
    if args.baseline and args.baseline.exists():
        with open(args.baseline, "r", encoding="utf-8") as f:
            baseline = json.load(f)

    env = get_environment()

    print("=" * 72)
    print("PDFluent + XFA Unified Release Gate")
    print("=" * 72)
    print(f"Timestamp: {env.get('timestamp', 'unknown')}")
    print(f"OS: {env.get('os', 'unknown')} {env.get('os_version', '')}")
    print(f"Arch: {env.get('arch', 'unknown')}")
    print(f"Python: {env.get('python_version', 'unknown')}")
    print(f"Node: {env.get('node_version', 'unknown')}")
    print(f"Rust: {env.get('rust_toolchain', 'unknown')}")
    if "git_commit" in env:
        print(f"Git: {env['git_commit']}")
    print(f"XFA Root: {xfa_root}")
    print(f"PDFluent Root: {pdfluent_root}")
    print(f"Output Dir: {out_dir}")
    print(f"Binary: {args.bin}")
    print("=" * 72)
    print()

    gates = define_gates(
        xfa_root=xfa_root,
        pdfluent_root=pdfluent_root,
        out_dir=out_dir,
        bin_path=args.bin,
        timeout=args.timeout,
        skip_xfa_build=args.skip_xfa_build,
        skip_playwright=args.skip_playwright,
        skip_cargo_test=args.skip_cargo_test,
    )

    results: list[GateResult] = []
    previous_fatal = False

    for gate in gates:
        if previous_fatal and gate.skip_if_previous_fatal:
            results.append(
                GateResult(
                    name=gate.name,
                    status=GATE_STATUS_SKIPPED,
                    exit_code=None,
                    duration_ms=0,
                    stdout="",
                    stderr="",
                    error_message="Skipped due to previous fatal failure",
                )
            )
            print(f"[SKIP ] {gate.name:40s} — {gate.description}")
            continue

        print(f"[RUN  ] {gate.name:40s} — {gate.description}", end="", flush=True)
        result = run_gate(gate)
        results.append(result)

        if result.status == GATE_STATUS_PASS:
            print(f"  PASS  ({result.duration_ms}ms)")
        elif result.status == GATE_STATUS_EXPECTED_UNSUPPORTED:
            print(f"  PASS* ({result.duration_ms}ms) — expected unsupported present")
        elif result.status == GATE_STATUS_FAIL:
            print(f"  FAIL  ({result.duration_ms}ms)")
            if gate.is_fatal:
                previous_fatal = True
        elif result.status == GATE_STATUS_TIMEOUT:
            print(f"  TIME  ({result.duration_ms}ms)")
            if gate.is_fatal:
                previous_fatal = True
        elif result.status == GATE_STATUS_INFRA_FAILURE:
            print(f"  INFRA ({result.duration_ms}ms) — {result.error_message}")
            if gate.is_fatal:
                previous_fatal = True
        else:
            print(f"  {result.status:5s} ({result.duration_ms}ms)")

        if args.verbose and result.status not in (GATE_STATUS_PASS, GATE_STATUS_EXPECTED_UNSUPPORTED):
            if result.stdout:
                print(f"  --- stdout ---\n{result.stdout[:2000]}")
            if result.stderr:
                print(f"  --- stderr ---\n{result.stderr[:2000]}")

    # Compute verdict
    verdict, blockers = compute_verdict(results, baseline)

    # Build report
    report = build_report(results, verdict, blockers, baseline, env, out_dir)

    report_path = out_dir / "unified-release-gate.json"
    with open(report_path, "w", encoding="utf-8") as f:
        json.dump(report, f, indent=2)

    # Print summary
    print()
    print("=" * 72)
    print("RELEASE GATE SUMMARY")
    print("=" * 72)
    print(f"Verdict:        {verdict}")
    print(f"Total Gates:    {report['summary']['total_gates']}")
    print(f"Pass:           {report['summary']['pass']}")
    print(f"Fail:           {report['summary']['fail']}")
    print(f"Skipped:        {report['summary']['skipped']}")
    print(f"Expected Unsup: {report['summary']['expected_unsupported']}")
    print(f"Infra Failure:  {report['summary']['infra_failure']}")
    print(f"Timeout:        {report['summary']['timeout']}")
    print(f"Total Duration: {report['summary']['total_duration_ms']}ms")
    print(f"Blockers:       {report['summary']['blocker_count']}")
    if blockers:
        for b in blockers:
            print(f"  • {b}")
    print()
    print(f"Report written: {report_path}")
    print("=" * 72)

    # Exit code
    if verdict == VERDICT_PASS:
        return 0
    if verdict == VERDICT_PASS_WITH_EXPECTED_UNSUPPORTED:
        return 0
    if verdict == VERDICT_PARTIAL_READY:
        return 1
    if verdict == VERDICT_INFRA_FAILURE:
        return 2
    return 3  # RELEASE_BLOCKED


if __name__ == "__main__":
    sys.exit(main())
