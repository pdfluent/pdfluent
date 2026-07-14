#!/usr/bin/env python3
"""
Package Audit — verify version coherence, license consistency, and publish safety
across the PDFluent workspace before release.

Run:
    python3 scripts/package_audit.py

Exit codes:
    0 = clean
    1 = warnings only
    2 = errors (release blocked)
"""

import json
import os
import re
import subprocess
import sys
import tomllib
from dataclasses import dataclass, field
from pathlib import Path
from typing import Optional

XFA_ROOT = Path(os.environ.get("XFA_ROOT", "../../XFA")).resolve()
PDFLUENT_ROOT = Path(os.environ.get("PDFLUENT_ROOT", ".")).resolve()


@dataclass
class CrateInfo:
    name: str
    path: Path
    version: str
    license: Optional[str] = None
    license_file: Optional[str] = None
    publish: Optional[bool] = None
    description: Optional[str] = None
    warnings: list[str] = field(default_factory=list)
    errors: list[str] = field(default_factory=list)


@dataclass
class AuditReport:
    workspace_version: str = ""
    crates: list[CrateInfo] = field(default_factory=list)
    frontend: dict = field(default_factory=dict)
    tauri: dict = field(default_factory=dict)
    warnings: list[str] = field(default_factory=list)
    errors: list[str] = field(default_factory=list)

    def has_errors(self) -> bool:
        return bool(self.errors) or any(c.errors for c in self.crates)

    def has_warnings(self) -> bool:
        return bool(self.warnings) or any(c.warnings for c in self.crates)


def parse_cargo_toml(path: Path) -> Optional[CrateInfo]:
    try:
        with open(path, "rb") as f:
            data = tomllib.load(f)
    except Exception as e:
        return None

    pkg = data.get("package", {})
    name = pkg.get("name", "")
    version = pkg.get("version", "")
    if not version:
        # Try workspace inheritance
        if pkg.get("version") is None and "workspace" in str(pkg.get("version", "")):
            # We'll resolve workspace version separately
            pass

    # Resolve version
    ver = pkg.get("version", "")
    if isinstance(ver, str) and ver:
        version = ver
    elif pkg.get("version") is None or (isinstance(ver, dict) and ver.get("workspace")):
        version = "workspace"

    info = CrateInfo(
        name=name,
        path=path,
        version=version,
        license=pkg.get("license"),
        license_file=pkg.get("license-file"),
        publish=pkg.get("publish"),
        description=pkg.get("description"),
    )
    return info


def audit_workspace(report: AuditReport) -> None:
    workspace_toml = XFA_ROOT / "Cargo.toml"
    try:
        with open(workspace_toml, "rb") as f:
            data = tomllib.load(f)
    except Exception as e:
        report.errors.append(f"Cannot read workspace Cargo.toml: {e}")
        return

    ws_pkg = data.get("workspace", {}).get("package", {})
    report.workspace_version = ws_pkg.get("version", "")
    ws_license = ws_pkg.get("license", "")

    members = data.get("workspace", {}).get("members", [])
    crate_dirs = []
    for pattern in members:
        if "*" in pattern:
            # Not expected in this workspace
            continue
        crate_dirs.append(XFA_ROOT / pattern)

    for crate_dir in crate_dirs:
        cargo_path = crate_dir / "Cargo.toml"
        if not cargo_path.exists():
            continue
        info = parse_cargo_toml(cargo_path)
        if info is None:
            continue

        # Resolve workspace-inherited values
        if info.version == "workspace":
            info.version = report.workspace_version
        if info.license is None and info.license_file is None:
            # Inherits workspace license
            info.license = ws_license

        report.crates.append(info)


def audit_versions(report: AuditReport) -> None:
    """Check that all proprietary crates share a coherent version."""
    versions = {}
    for c in report.crates:
        if c.version == "workspace" or not c.version:
            c.errors.append("Cannot resolve version (workspace inheritance missing?)")
            continue
        versions.setdefault(c.version, []).append(c.name)

    # The workspace version is the canonical version
    canonical = report.workspace_version

    # Proprietary crates should match the pdfluent crate version or workspace version
    proprietary = [
        c for c in report.crates
        if c.license_file or (c.license and c.license != "MIT" and "Apache" not in (c.license or ""))
    ]

    for c in proprietary:
        if c.version != canonical and c.name != "pdfluent":
            # pdfluent facade may have its own versioning
            c.warnings.append(
                f"Version {c.version} != workspace version {canonical}"
            )

    # Expected divergent versions: open-source forks and WIP bindings
    expected_divergent = {
        "pdfluent-lopdf", "pdfluent-cff", "pdfluent-ccitt", "pdfluent-jbig2",
        "pdfluent-jpeg2000", "pdf-syntax", "pdf-interpret", "xfa-pdfrest-compare",
        "pdfluent-snippet-extract",
        "pdf-capi", "pdf-java", "pdf-node", "pdf-python",
    }
    unexpected_versions = {
        v: names for v, names in versions.items()
        if any(n not in expected_divergent for n in names)
    }
    if len(unexpected_versions) > 3:
        report.warnings.append(
            f"High version divergence: {len(unexpected_versions)} distinct proprietary versions found: {sorted(unexpected_versions.keys())}"
        )

    # pdluent crate is the SDK facade — its version should match workspace
    pdfluent_crate = next((c for c in report.crates if c.name == "pdfluent"), None)
    if pdfluent_crate and pdfluent_crate.version != canonical:
        report.errors.append(
            f"SDK facade 'pdfluent' version ({pdfluent_crate.version}) != workspace version ({canonical})"
        )


def audit_licenses(report: AuditReport) -> None:
    """
    Ensure proprietary crates do NOT accidentally inherit MIT from workspace.
    Ensure open-source forks retain their permissive licenses.
    """
    # Crates that MUST be proprietary (commercial license)
    must_be_proprietary = {
        "pdfluent", "pdf-engine", "pdf-manip", "pdf-redact",
        "pdfluent-sign", "pdf-compliance", "pdfluent-extract",
        "pdfluent-forms", "pdf-annot", "pdf-docx", "pdf-ocr",
        "pdf-render", "pdf-font", "pdf-xfa", "xfa-dom-resolver",
        "xfa-layout-engine", "formcalc-interpreter", "xfa-json",
        "xfa-license", "pdf-xlsx", "pdf-pptx", "pdf-invoice",
        "pdf-diff", "xfa-wasm",
    }

    # Crates that MUST remain open-source
    must_be_open = {
        "pdfluent-lopdf": "MIT",
        "pdfluent-cff": "MIT OR Apache-2.0",
        "pdf-syntax": "MIT OR Apache-2.0",
        "pdf-interpret": "MIT OR Apache-2.0",
        "hayro-ccitt": "Apache-2.0 OR MIT",
        "hayro-jbig2": "Apache-2.0 OR MIT",
        "hayro-jpeg2000": "Apache-2.0 OR MIT",
    }

    for c in report.crates:
        effective_license = c.license_file or c.license or ""
        is_proprietary = "LICENSE" in effective_license and "MIT" not in effective_license
        is_mit = effective_license == "MIT" or "MIT" in (c.license or "")
        is_apache = "Apache" in (c.license or "")

        if c.name in must_be_proprietary:
            if is_mit and not is_proprietary:
                c.errors.append(
                    f"Proprietary crate '{c.name}' inherits MIT license from workspace — "
                    f"must set license-file = 'LICENSE' or explicit proprietary license"
                )
            elif c.name == "xfa-wasm" and is_mit:
                c.errors.append(
                    "xfa-wasm is a distribution artifact but inherits MIT from workspace. "
                    "Must override with license-file = 'LICENSE'"
                )

        if c.name in must_be_open:
            expected = must_be_open[c.name]
            if c.license != expected and not is_apache:
                c.warnings.append(
                    f"Open-source crate '{c.name}' has license '{c.license}' != expected '{expected}'"
                )

    # Check that LICENSE file exists for proprietary crates
    for c in report.crates:
        if c.license_file:
            license_path = c.path.parent / c.license_file
            if not license_path.exists():
                c.errors.append(f"license-file '{c.license_file}' does not exist at {license_path}")


def audit_publish_safety(report: AuditReport) -> None:
    """Ensure internal/test crates are marked publish = false."""
    internal = {"xfa-cli", "xfa-api-server", "xfa-license-gen", "xfa-test-runner",
                "xfa-golden-tests", "xfa-pdfrest-compare", "pdf-bench", "pdf-desktop",
                "pdf-node", "pdf-java", "pdf-python", "pdf-capi", "pdf-diff"}

    for c in report.crates:
        if c.name in internal and c.publish is not False:
            c.warnings.append(f"Internal crate '{c.name}' should set publish = false")


def audit_frontend(report: AuditReport) -> None:
    """Audit PDFluent frontend package.json."""
    pkg_path = PDFLUENT_ROOT / "package.json"
    try:
        with open(pkg_path, "r") as f:
            pkg = json.load(f)
    except Exception as e:
        report.errors.append(f"Cannot read package.json: {e}")
        return

    report.frontend["version"] = pkg.get("version", "")
    report.frontend["license"] = pkg.get("license", "MISSING")
    report.frontend["private"] = pkg.get("private", False)

    if not pkg.get("license"):
        report.warnings.append("package.json is missing 'license' field")

    # Version coherence with workspace
    if report.frontend["version"] != report.workspace_version:
        report.warnings.append(
            f"Frontend version ({report.frontend['version']}) != workspace version ({report.workspace_version})"
        )

    # Check WASM dependency path
    deps = pkg.get("dependencies", {})
    wasm_dep = deps.get("xfa-wasm", "")
    if "file:" in wasm_dep:
        report.frontend["wasm_dep"] = wasm_dep
        # This is expected for local development
    else:
        report.warnings.append(f"xfa-wasm dependency is not a local file path: {wasm_dep}")


def audit_tauri(report: AuditReport) -> None:
    """Audit Tauri app metadata."""
    cargo_path = PDFLUENT_ROOT / "src-tauri" / "Cargo.toml"
    conf_path = PDFLUENT_ROOT / "src-tauri" / "tauri.conf.json"

    try:
        with open(cargo_path, "rb") as f:
            cargo = tomllib.load(f)
    except Exception as e:
        report.errors.append(f"Cannot read src-tauri/Cargo.toml: {e}")
        return

    pkg = cargo.get("package", {})
    report.tauri["cargo_version"] = pkg.get("version", "")
    report.tauri["cargo_license"] = pkg.get("license", "")
    report.tauri["cargo_license_file"] = pkg.get("license-file", "")

    try:
        with open(conf_path, "r") as f:
            conf = json.load(f)
    except Exception as e:
        report.errors.append(f"Cannot read tauri.conf.json: {e}")
        return

    report.tauri["conf_version"] = conf.get("version", "")
    report.tauri["identifier"] = conf.get("identifier", "")
    report.tauri["productName"] = conf.get("productName", "")

    # Version coherence
    if report.tauri["cargo_version"] != report.tauri["conf_version"]:
        report.errors.append(
            f"Tauri Cargo.toml version ({report.tauri['cargo_version']}) != "
            f"tauri.conf.json version ({report.tauri['conf_version']})"
        )

    if report.tauri["cargo_version"] != report.workspace_version:
        report.warnings.append(
            f"Tauri version ({report.tauri['cargo_version']}) != workspace version ({report.workspace_version})"
        )

    if report.tauri["cargo_license"] == "Proprietary" and not report.tauri["cargo_license_file"]:
        # "Proprietary" as a SPDX string is non-standard; prefer license-file
        report.warnings.append(
            "Tauri Cargo.toml uses 'license = \"Proprietary\"' (non-standard SPDX). "
            "Consider using 'license-file = \"LICENSE\"' instead."
        )

    if not report.tauri["identifier"]:
        report.errors.append("Tauri bundle identifier is missing")


def audit_wasm_distribution(report: AuditReport) -> None:
    """Check WASM build artifacts and contract freshness."""
    wasm_pkg = XFA_ROOT / "crates" / "xfa-wasm" / "pkg"
    dts_path = wasm_pkg / "xfa_wasm.d.ts"
    wasm_path = wasm_pkg / "xfa_wasm_bg.wasm"
    js_path = wasm_pkg / "xfa_wasm.js"

    report.frontend["wasm_dts_exists"] = dts_path.exists()
    report.frontend["wasm_bin_exists"] = wasm_path.exists()
    report.frontend["wasm_js_exists"] = js_path.exists()

    if not dts_path.exists():
        report.errors.append("WASM type declarations (xfa_wasm.d.ts) missing — run wasm:build")
    if not wasm_path.exists():
        report.errors.append("WASM binary (xfa_wasm_bg.wasm) missing — run wasm:build")
    if not js_path.exists():
        report.warnings.append("WASM JS glue (xfa_wasm.js) missing — run wasm:build")

    # Check that wasm-opt is disabled (already in Cargo.toml, verify)
    wasm_cargo = XFA_ROOT / "crates" / "xfa-wasm" / "Cargo.toml"
    try:
        with open(wasm_cargo, "rb") as f:
            data = tomllib.load(f)
        wasm_opt = data.get("package", {}).get("metadata", {}).get("wasm-pack", {}).get("profile", {}).get("release", {}).get("wasm-opt", "")
        if wasm_opt is not False:
            report.warnings.append("xfa-wasm has wasm-opt enabled — this may strip symbols needed for debugging")
    except Exception:
        pass


def print_report(report: AuditReport) -> None:
    print("=" * 70)
    print("PDFLUENT PACKAGE AUDIT REPORT")
    print("=" * 70)
    print(f"Workspace version: {report.workspace_version}")
    print(f"Crates audited:    {len(report.crates)}")
    print()

    # Crates with issues
    crates_with_issues = [c for c in report.crates if c.errors or c.warnings]
    if crates_with_issues:
        print("CRATE ISSUES")
        print("-" * 40)
        for c in crates_with_issues:
            print(f"  {c.name} @ {c.version}")
            for e in c.errors:
                print(f"    ERROR: {e}")
            for w in c.warnings:
                print(f"    WARN:  {w}")
        print()

    # Frontend
    print("FRONTEND")
    print("-" * 40)
    print(f"  package.json version:  {report.frontend.get('version', 'N/A')}")
    print(f"  package.json license:  {report.frontend.get('license', 'N/A')}")
    print(f"  WASM dts exists:       {report.frontend.get('wasm_dts_exists', False)}")
    print(f"  WASM bin exists:       {report.frontend.get('wasm_bin_exists', False)}")
    print()

    # Tauri
    print("TAURI DESKTOP")
    print("-" * 40)
    print(f"  Cargo.toml version:    {report.tauri.get('cargo_version', 'N/A')}")
    print(f"  tauri.conf version:    {report.tauri.get('conf_version', 'N/A')}")
    print(f"  bundle identifier:     {report.tauri.get('identifier', 'N/A')}")
    print(f"  license:               {report.tauri.get('cargo_license', 'N/A')}")
    print()

    # Global issues
    if report.errors:
        print("GLOBAL ERRORS")
        print("-" * 40)
        for e in report.errors:
            print(f"  ERROR: {e}")
        print()

    if report.warnings:
        print("GLOBAL WARNINGS")
        print("-" * 40)
        for w in report.warnings:
            print(f"  WARN:  {w}")
        print()

    total_errors = len(report.errors) + sum(len(c.errors) for c in report.crates)
    total_warnings = len(report.warnings) + sum(len(c.warnings) for c in report.crates)

    print("=" * 70)
    if total_errors:
        print(f"RESULT: BLOCKED — {total_errors} error(s), {total_warnings} warning(s)")
    elif total_warnings:
        print(f"RESULT: WARNINGS — {total_errors} error(s), {total_warnings} warning(s)")
    else:
        print(f"RESULT: CLEAN — {total_errors} error(s), {total_warnings} warning(s)")
    print("=" * 70)


def write_json(report: AuditReport, out_path: Path) -> None:
    out_path.parent.mkdir(parents=True, exist_ok=True)
    data = {
        "workspace_version": report.workspace_version,
        "frontend": report.frontend,
        "tauri": report.tauri,
        "crates": [
            {
                "name": c.name,
                "version": c.version,
                "license": c.license,
                "license_file": c.license_file,
                "publish": c.publish,
                "warnings": c.warnings,
                "errors": c.errors,
            }
            for c in report.crates
        ],
        "global_warnings": report.warnings,
        "global_errors": report.errors,
    }
    with open(out_path, "w") as f:
        json.dump(data, f, indent=2)


def main():
    report = AuditReport()

    audit_workspace(report)
    audit_versions(report)
    audit_licenses(report)
    audit_publish_safety(report)
    audit_frontend(report)
    audit_tauri(report)
    audit_wasm_distribution(report)

    print_report(report)

    out_dir = Path(os.environ.get("OUT_DIR", "benchmarks/runs"))
    out_path = PDFLUENT_ROOT / out_dir / "package-audit.json"
    write_json(report, out_path)
    print(f"\nJSON report written to: {out_path}")

    if report.has_errors():
        sys.exit(2)
    elif report.has_warnings():
        sys.exit(1)
    else:
        sys.exit(0)


if __name__ == "__main__":
    main()
