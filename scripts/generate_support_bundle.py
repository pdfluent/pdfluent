#!/usr/bin/env python3
"""
Support Bundle Generator — produce a machine-readable diagnostic bundle.

Usage:
    python3 scripts/generate_support_bundle.py
    python3 scripts/generate_support_bundle.py --fingerprint /path/to/doc.pdf
    python3 scripts/generate_support_bundle.py --output /tmp/bundle.json

Environment:
    XFA_ROOT            Path to XFA workspace (default: ../../XFA)
    PDFLUENT_ROOT       Path to PDFluent app (default: .)
    OUT_DIR             Output directory (default: benchmarks/runs)

The bundle contains environment metadata, capability summary, and error history.
It NEVER contains document content, text, or rendered images.
"""

import argparse
import hashlib
import json
import os
import platform
import subprocess
import sys
import time
from dataclasses import dataclass, field, asdict
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Optional

XFA_ROOT = Path(os.environ.get("XFA_ROOT", "../../XFA")).resolve()
PDFLUENT_ROOT = Path(os.environ.get("PDFLUENT_ROOT", ".")).resolve()

BUNDLE_SCHEMA_VERSION = "pdfluent.support_bundle.v1"


# ---------------------------------------------------------------------------
# Data structures
# ---------------------------------------------------------------------------

@dataclass
class Environment:
    runtime: str = "unknown"
    version: str = "unknown"
    os: str = "unknown"
    os_version: str = "unknown"
    arch: str = "unknown"
    rustc: str = "unknown"
    cargo: str = "unknown"
    node: str = "unknown"
    npm: str = "unknown"
    python: str = "unknown"
    timestamp: str = ""
    git_commit: str = "unknown"
    release_gate_schema: str = "unknown"
    build_profile: str = "unknown"
    target_triple: str = "unknown"


@dataclass
class CapabilitySummary:
    runtime: str = "unknown"
    signing: bool = False
    pdfa: bool = False
    redaction: bool = False
    ocr: bool = False
    docx_export: bool = False
    xfa_flatten: bool = False
    wasm: bool = False
    async_tokio: bool = False


@dataclass
class DocumentFingerprint:
    sha256: str = ""
    page_count: Optional[int] = None
    file_size: Optional[int] = None
    has_xfa: Optional[bool] = None
    note: str = "SHA-256 of full file. One-way hash — no content recoverable."


@dataclass
class ReleaseGateSummary:
    schema_version: str = ""
    timestamp: str = ""
    verdict: str = ""
    total_gates: int = 0
    pass_count: int = 0
    fail_count: int = 0


@dataclass
class SupportBundle:
    schema_version: str = BUNDLE_SCHEMA_VERSION
    timestamp: str = ""
    environment: Environment = field(default_factory=Environment)
    capabilities: CapabilitySummary = field(default_factory=CapabilitySummary)
    release_gate: ReleaseGateSummary = field(default_factory=ReleaseGateSummary)
    document_fingerprints: list[DocumentFingerprint] = field(default_factory=list)
    error_log: list[dict[str, Any]] = field(default_factory=list)
    bindings: list[str] = field(default_factory=list)
    enabled_gates: list[str] = field(default_factory=list)
    metadata: dict[str, Any] = field(default_factory=dict)


# ---------------------------------------------------------------------------
# Environment detection
# ---------------------------------------------------------------------------

def get_rustc_version() -> str:
    try:
        result = subprocess.run(
            ["rustc", "--version"],
            capture_output=True, text=True, timeout=10
        )
        if result.returncode == 0:
            return result.stdout.strip()
    except Exception:
        pass
    return "unknown"


def get_cargo_version() -> str:
    try:
        result = subprocess.run(
            ["cargo", "--version"],
            capture_output=True, text=True, timeout=10
        )
        if result.returncode == 0:
            return result.stdout.strip()
    except Exception:
        pass
    return "unknown"


def get_node_version() -> str:
    try:
        result = subprocess.run(
            ["node", "--version"],
            capture_output=True, text=True, timeout=10
        )
        if result.returncode == 0:
            return result.stdout.strip()
    except Exception:
        pass
    return "unknown"


def get_npm_version() -> str:
    try:
        result = subprocess.run(
            ["npm", "--version"],
            capture_output=True, text=True, timeout=10
        )
        if result.returncode == 0:
            return result.stdout.strip()
    except Exception:
        pass
    return "unknown"


def get_python_version() -> str:
    try:
        result = subprocess.run(
            [sys.executable, "--version"],
            capture_output=True, text=True, timeout=10
        )
        if result.returncode == 0:
            return result.stdout.strip()
    except Exception:
        pass
    return "unknown"


def get_git_commit(path: Path) -> str:
    try:
        result = subprocess.run(
            ["git", "rev-parse", "--short", "HEAD"],
            cwd=path,
            capture_output=True, text=True, timeout=10
        )
        if result.returncode == 0:
            return result.stdout.strip()
    except Exception:
        pass
    return "unknown"


def get_workspace_version(xfa_root: Path) -> str:
    try:
        cargo_toml = xfa_root / "Cargo.toml"
        with open(cargo_toml, "r", encoding="utf-8") as f:
            for line in f:
                if line.strip().startswith("version ="):
                    return line.split("=")[-1].strip().strip('"')
    except Exception:
        pass
    return "unknown"


def get_package_json_version(pdfluent_root: Path) -> str:
    try:
        pkg_path = pdfluent_root / "package.json"
        with open(pkg_path, "r", encoding="utf-8") as f:
            data = json.load(f)
            return data.get("version", "unknown")
    except Exception:
        pass
    return "unknown"


def get_release_gate_summary(pdfluent_root: Path) -> ReleaseGateSummary:
    """Read the latest unified-release-gate.json if it exists."""
    gate_path = pdfluent_root / "benchmarks" / "runs" / "unified-release-gate.json"
    if not gate_path.exists():
        return ReleaseGateSummary()
    try:
        with open(gate_path, "r", encoding="utf-8") as f:
            data = json.load(f)
        summary = data.get("summary", {})
        return ReleaseGateSummary(
            schema_version=data.get("schema_version", ""),
            timestamp=data.get("timestamp", ""),
            verdict=summary.get("verdict", ""),
            total_gates=summary.get("total_gates", 0),
            pass_count=summary.get("pass", 0),
            fail_count=summary.get("fail", 0),
        )
    except Exception:
        return ReleaseGateSummary()


def get_target_triple() -> str:
    try:
        result = subprocess.run(
            ["rustc", "--print", "host-tuple"],
            capture_output=True, text=True, timeout=10
        )
        if result.returncode == 0:
            return result.stdout.strip()
    except Exception:
        pass
    return "unknown"


def build_environment(xfa_root: Path, pdfluent_root: Path) -> Environment:
    uname = platform.uname()
    return Environment(
        runtime="tauri",
        version=get_package_json_version(pdfluent_root),
        os=uname.system,
        os_version=platform.mac_ver()[0] if uname.system == "Darwin" else platform.release(),
        arch=uname.machine,
        rustc=get_rustc_version(),
        cargo=get_cargo_version(),
        node=get_node_version(),
        npm=get_npm_version(),
        python=get_python_version(),
        timestamp=datetime.now(timezone.utc).isoformat(),
        git_commit=get_git_commit(pdfluent_root),
        release_gate_schema="phase10.unified_release_gate.v2",
        build_profile="release",
        target_triple=get_target_triple(),
    )


def build_capabilities(xfa_root: Path) -> CapabilitySummary:
    """Infer capabilities from pdfluent/Cargo.toml features."""
    cargo_path = xfa_root / "crates" / "pdfluent" / "Cargo.toml"
    caps = CapabilitySummary()
    try:
        with open(cargo_path, "r", encoding="utf-8") as f:
            content = f.read()
        caps.signing = "signing" in content
        caps.pdfa = "pdfa" in content
        caps.redaction = "redaction" in content
        caps.ocr = "ocr" in content
        caps.docx_export = "docx" in content
        caps.xfa_flatten = "xfa" in content
        caps.wasm = "wasm" in content
        caps.async_tokio = "async-tokio" in content
    except Exception:
        pass
    return caps


def get_enabled_bindings(xfa_root: Path) -> list[str]:
    """List bindings that have source files."""
    bindings = []
    binding_dirs = {
        "pdfluent-rust": xfa_root / "crates" / "pdfluent",
        "pdfluent-wasm": xfa_root / "crates" / "xfa-wasm",
        "pdfluent-c": xfa_root / "crates" / "pdf-capi",
        "pdfluent-python": xfa_root / "crates" / "pdf-python",
        "pdfluent-node": xfa_root / "crates" / "pdf-node",
        "pdfluent-java": xfa_root / "crates" / "pdf-java",
        "pdfluent-cli": xfa_root / "crates" / "xfa-cli",
        "pdfluent-desktop": PDFLUENT_ROOT / "src-tauri",
    }
    for name, path in binding_dirs.items():
        if path.exists():
            bindings.append(name)
    return bindings


def get_enabled_gates(pdfluent_root: Path) -> list[str]:
    """List gates from the latest release gate report."""
    gate_path = pdfluent_root / "benchmarks" / "runs" / "unified-release-gate.json"
    if not gate_path.exists():
        return []
    try:
        with open(gate_path, "r", encoding="utf-8") as f:
            data = json.load(f)
        gates = data.get("gates", [])
        return [g["name"] for g in gates if g.get("status") == "pass"]
    except Exception:
        return []


# ---------------------------------------------------------------------------
# Document fingerprinting
# ---------------------------------------------------------------------------

def fingerprint_document(path: str) -> DocumentFingerprint:
    """Compute a privacy-preserving fingerprint of a PDF document."""
    p = Path(path)
    if not p.exists():
        raise FileNotFoundError(f"Document not found: {path}")

    file_size = p.stat().st_size

    # SHA-256 of the full file (one-way, non-reversible)
    h = hashlib.sha256()
    with open(p, "rb") as f:
        while True:
            chunk = f.read(65536)
            if not chunk:
                break
            h.update(chunk)
    sha256 = h.hexdigest()

    # Optional metadata: page count, has_xfa — only if we can read quickly
    page_count = None
    has_xfa = None
    try:
        # Lightweight PDF header scan for page count and XFA
        with open(p, "rb") as f:
            header = f.read(8192)
            has_xfa = b"/XFA" in header or b"<xdp" in header
            # Look for /Count in first 8KB (approximate)
            count_idx = header.find(b"/Count ")
            if count_idx != -1:
                count_bytes = header[count_idx + 7 : count_idx + 15]
                count_str = count_bytes.split()[0].decode("ascii", errors="ignore")
                try:
                    page_count = int(count_str)
                except ValueError:
                    pass
    except Exception:
        pass

    return DocumentFingerprint(
        sha256=sha256,
        page_count=page_count,
        file_size=file_size,
        has_xfa=has_xfa,
    )


# ---------------------------------------------------------------------------
# Bundle assembly
# ---------------------------------------------------------------------------

def build_bundle(
    xfa_root: Path,
    pdfluent_root: Path,
    fingerprint_paths: list[str],
) -> SupportBundle:
    env = build_environment(xfa_root, pdfluent_root)
    caps = build_capabilities(xfa_root)
    gate_summary = get_release_gate_summary(pdfluent_root)
    bindings = get_enabled_bindings(xfa_root)
    enabled_gates = get_enabled_gates(pdfluent_root)

    fingerprints = []
    for path in fingerprint_paths:
        try:
            fingerprints.append(fingerprint_document(path))
        except Exception as e:
            fingerprints.append(
                DocumentFingerprint(
                    sha256="",
                    page_count=None,
                    file_size=None,
                    has_xfa=None,
                    note=f"Fingerprint failed: {e}",
                )
            )

    return SupportBundle(
        timestamp=datetime.now(timezone.utc).isoformat(),
        environment=env,
        capabilities=caps,
        release_gate=gate_summary,
        document_fingerprints=fingerprints,
        bindings=bindings,
        enabled_gates=enabled_gates,
        metadata={
            "generator": "scripts/generate_support_bundle.py",
            "schema_version": BUNDLE_SCHEMA_VERSION,
        },
    )


def bundle_to_dict(bundle: SupportBundle) -> dict[str, Any]:
    """Convert bundle to a clean JSON-serializable dict."""
    return asdict(bundle)


# ---------------------------------------------------------------------------
# Validation
# ---------------------------------------------------------------------------

def validate_bundle(data: dict[str, Any]) -> list[str]:
    """Validate a bundle for schema compliance and content leakage."""
    violations: list[str] = []

    # Schema check
    if data.get("schema_version") != BUNDLE_SCHEMA_VERSION:
        violations.append(f"Schema version mismatch: {data.get('schema_version')}")

    # Required fields
    for key in ("timestamp", "environment", "capabilities"):
        if key not in data:
            violations.append(f"Missing required field: {key}")

    # Content leakage check
    json_str = json.dumps(data)
    leakage_keywords = ["pdf_bytes", "content", "image_data", "raw_bytes", "text_content"]
    for kw in leakage_keywords:
        if kw in json_str:
            violations.append(f"Possible content leakage: key '{kw}' found in bundle")

    # Document fingerprint sanity
    for fp in data.get("document_fingerprints", []):
        sha = fp.get("sha256", "")
        if sha and len(sha) != 64:
            violations.append(f"Invalid SHA-256 length: {len(sha)} chars")

    return violations


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------

def main() -> int:
    parser = argparse.ArgumentParser(
        description="Generate a PDFluent support bundle"
    )
    parser.add_argument(
        "--fingerprint",
        action="append",
        default=[],
        help="Path to a PDF document to fingerprint (can be used multiple times)",
    )
    parser.add_argument(
        "--output", "-o",
        type=Path,
        default=None,
        help="Output file path (default: print to stdout)",
    )
    parser.add_argument(
        "--validate",
        action="store_true",
        help="Validate the generated bundle before output",
    )
    parser.add_argument(
        "--xfa-root",
        type=Path,
        default=XFA_ROOT,
        help="Path to XFA workspace",
    )
    parser.add_argument(
        "--pdfluent-root",
        type=Path,
        default=PDFLUENT_ROOT,
        help="Path to PDFluent app",
    )
    args = parser.parse_args()

    bundle = build_bundle(args.xfa_root, args.pdfluent_root, args.fingerprint)
    data = bundle_to_dict(bundle)

    if args.validate:
        violations = validate_bundle(data)
        if violations:
            print("BUNDLE VALIDATION FAILED", file=sys.stderr)
            for v in violations:
                print(f"  - {v}", file=sys.stderr)
            return 2
        print("Bundle validation passed", file=sys.stderr)

    json_str = json.dumps(data, indent=2, default=str)

    if args.output:
        args.output.parent.mkdir(parents=True, exist_ok=True)
        with open(args.output, "w", encoding="utf-8") as f:
            f.write(json_str)
        print(f"Support bundle written to: {args.output}")
    else:
        print(json_str)

    return 0


if __name__ == "__main__":
    sys.exit(main())
