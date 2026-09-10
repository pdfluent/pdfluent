#!/usr/bin/env python3
# Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
#
# This software is proprietary. The PDFluent application is free to use,
# including for commercial purposes. Redistribution, or extraction or reuse
# of its components (including the embedded PDF engine), requires a licence.
# See https://pdfluent.com/license for terms.
"""Judge a measured run against the committed per-document baselines.

Four axes per capability (completes, speed, fidelity, size), one row per
document per platform, and a tolerance that lives in the row so a noisy
document can carry its own floor without loosening the corpus.

Two things this deliberately does *not* do:

* It does not judge the corpus alone. A capability that got faster on
  fifteen documents and hung on one is a regression, and an average hides it.
* It does not let an improvement pass silently. A value that moved in the
  good direction beyond tolerance fails too, with "raise the baseline in its
  own commit and say what moved it". That is what makes a hand-edited
  baseline red in both directions, which is the only way a floor stays a
  floor.

Exit codes: 0 nothing moved, 1 something regressed or rose unblessed,
2 something could not be measured (missing tool, skipped axis, corpus
mismatch, unknown machine class, stale calibration). 2 blocks like 1.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import sys
from dataclasses import dataclass
from datetime import date, datetime
from pathlib import Path

# The repository root, or a stand-in. The tests build a small tree with its
# own MACHINES.toml, MANIFEST.json and baselines and point this at it; without
# the seam they would have to edit the real baselines to test the tool that
# guards them.
ROOT = Path(os.environ.get("PDFLUENT_QUALITY_ROOT", Path(__file__).resolve().parents[2]))
AXES_DIR = ROOT / "quality" / "axes"
MACHINES = ROOT / "quality" / "MACHINES.toml"
MANIFEST = ROOT / "src-tauri" / "tests" / "golden" / "MANIFEST.json"
GOLDEN_DIR = ROOT / "src-tauri" / "tests" / "golden"

METHODOLOGY = "golden-17-v1"

COLUMNS = [
    "doc", "platform", "machine", "completes", "speed_p50_ms", "speed_p95_ms",
    "fidelity", "fidelity_metric", "size_ratio", "tol_speed_pct", "tol_speed_ms",
    "tol_fidelity", "tol_size_pct", "run_id", "why",
]

# Defaults when a row leaves a tolerance at "-". The absolute floors matter
# more than the percentages: 20% of a 4 ms operation is timer noise, and a
# gate that fires on noise is a gate people learn to re-run.
DEFAULT_TOL_SPEED_PCT = 20.0
DEFAULT_TOL_SPEED_MS = 50.0
DEFAULT_TOL_P50_PCT = 10.0
DEFAULT_TOL_P50_MS = 20.0
DEFAULT_TOL_FIDELITY = 0.0
DEFAULT_TOL_SIZE_PCT = 1.0


class CannotMeasure(Exception):
    """Something made the comparison impossible. Exit 2, never a quiet pass."""


@dataclass
class Row:
    values: dict[str, str]

    def __getitem__(self, key: str) -> str:
        return self.values[key]

    @property
    def key(self) -> tuple[str, str, str, str]:
        return (self["doc"], self["platform"], self["machine"], self["fidelity_metric"])

    def number(self, column: str) -> float | None:
        raw = self[column]
        return None if raw in ("-", "") else float(raw)

    def tolerance(self, column: str, fallback: float) -> float:
        raw = self[column]
        return fallback if raw in ("-", "") else float(raw)

    def line(self) -> str:
        return "\t".join(self[column] for column in COLUMNS)


def read_baseline(path: Path) -> tuple[str, list[Row]]:
    """Returns (methodology, rows). A missing file is an empty baseline, not
    an error: a platform gets rows when a run on it has produced them, and a
    floor invented on another platform is worse than none."""
    if not path.exists():
        return METHODOLOGY, []
    methodology = METHODOLOGY
    rows: list[Row] = []
    for line in path.read_text().splitlines():
        if line.startswith("# methodology:"):
            methodology = line.split(":", 1)[1].strip()
            continue
        if not line.strip() or line.startswith("#") or line.startswith("doc\t"):
            continue
        fields = line.split("\t")
        if len(fields) != len(COLUMNS):
            raise CannotMeasure(f"{path.name}: malformed row ({len(fields)} fields): {line}")
        rows.append(Row(dict(zip(COLUMNS, fields))))
    return methodology, rows


def write_baseline(path: Path, rows: list[Row]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    body = [f"# methodology: {METHODOLOGY}", "\t".join(COLUMNS)]
    body += [row.line() for row in sorted(rows, key=lambda r: r.key)]
    path.write_text("\n".join(body) + "\n")


def machine_classes() -> dict[str, dict[str, str]]:
    """A four-line TOML reader. tomllib would do, but this file is read by a
    CI job on whatever python3 the runner has, and the format here is fixed."""
    if not MACHINES.exists():
        raise CannotMeasure("quality/MACHINES.toml is missing")
    classes: dict[str, dict[str, str]] = {}
    current: str | None = None
    for line in MACHINES.read_text().splitlines():
        line = line.strip()
        if line.startswith("#") or not line:
            continue
        if line.startswith("[") and line.endswith("]"):
            current = line[1:-1]
            classes[current] = {}
            continue
        if current and "=" in line:
            key, value = (part.strip() for part in line.split("=", 1))
            classes[current][key] = value.strip('"')
    return classes


def verify_corpus(run: dict) -> None:
    """The numbers mean nothing if they were measured on different files."""
    manifest = json.loads(MANIFEST.read_text())
    expected = {entry["name"]: entry["sha256"] for entry in manifest["documents"]}
    for name, sha in expected.items():
        path = GOLDEN_DIR / f"{name}.pdf"
        if not path.exists():
            raise CannotMeasure(f"golden document {name} is in MANIFEST.json but not on disk")
        actual = hashlib.sha256(path.read_bytes()).hexdigest()
        if actual != sha:
            raise CannotMeasure(f"golden document {name} does not match MANIFEST.json")
    measured = {
        doc
        for capability in run.get("capabilities", {}).values()
        for doc in capability
        if doc != "_all"
    }
    unknown = sorted(measured - set(expected) - {"_all"})
    if unknown and run.get("set") != "golden-23":
        raise CannotMeasure(f"run measured documents that are not in the manifest: {unknown}")


def verify_machine(run: dict) -> None:
    classes = machine_classes()
    name = run.get("machine")
    if name not in classes:
        raise CannotMeasure(f"unknown machine class {name!r}; add it to quality/MACHINES.toml")
    entry = classes[name]
    calibrated = entry.get("calibrated_on")
    valid_days = int(entry.get("calibration_valid_days", "0"))
    if not calibrated or not valid_days:
        raise CannotMeasure(f"machine class {name} has no calibration")
    age = (date.today() - datetime.strptime(calibrated, "%Y-%m-%d").date()).days
    if age > valid_days:
        raise CannotMeasure(
            f"machine class {name} was calibrated {age} days ago, past its {valid_days}-day window;"
            " speed axes cannot be judged"
        )


def rows_from_run(run: dict, capability: str) -> list[Row]:
    """One row per (document, fidelity metric). A capability with two fidelity
    metrics, as PDF/A has, gets two rows rather than one row with two numbers:
    the ratchet judges a metric, and a column that means different things on
    different lines is a column nobody can diff."""
    out: list[Row] = []
    for doc, measured in sorted(run["capabilities"][capability].items()):
        skipped = measured.get("skipped_reason")
        if skipped:
            raise CannotMeasure(f"{capability}/{doc}: {skipped}")
        speeds = sorted(measured.get("speed_ms") or [])
        p50 = percentile(speeds, 50)
        p95 = percentile(speeds, 95)
        fidelity = measured.get("fidelity") or {}
        if not fidelity:
            fidelity = {"-": "-"}
        for metric, value in sorted(fidelity.items()):
            out.append(
                Row(
                    {
                        "doc": doc,
                        "platform": run["platform"],
                        "machine": run["machine"],
                        "completes": str(measured["completes"]).lower(),
                        "speed_p50_ms": fmt(p50),
                        "speed_p95_ms": fmt(p95),
                        "fidelity": fmt(value),
                        "fidelity_metric": metric,
                        "size_ratio": fmt(measured.get("size_ratio")),
                        "tol_speed_pct": "-",
                        "tol_speed_ms": "-",
                        "tol_fidelity": "-",
                        "tol_size_pct": "-",
                        "run_id": run["run_id"],
                        "why": "-",
                    }
                )
            )
    return out


def percentile(values: list[float], pct: float) -> float | None:
    if not values:
        return None
    if len(values) == 1:
        return values[0]
    position = (len(values) - 1) * pct / 100.0
    lower = int(position)
    upper = min(lower + 1, len(values) - 1)
    weight = position - lower
    return values[lower] * (1 - weight) + values[upper] * weight


def fmt(value) -> str:
    if value is None:
        return "-"
    if isinstance(value, bool):
        return str(value).lower()
    if isinstance(value, str):
        return value
    return f"{value:.4f}".rstrip("0").rstrip(".") if isinstance(value, float) else str(value)


def as_float(text: str) -> float | None:
    if text in ("-", ""):
        return None
    if text in ("true", "false"):
        return 1.0 if text == "true" else 0.0
    try:
        return float(text)
    except ValueError:
        return None


# The two axes that measure the machine as much as the code. On a box that is
# shared with other CI agents they move for reasons that have nothing to do with
# a change: on 2026-09-08/09 three consecutive runs went red on three different
# documents, each time on speed alone and never on correctness, while a second
# and then a third runner took work on the same four cores. A gate that is red
# for a reason nobody can act on is a gate people learn to ignore, and that is
# more expensive than the axis it protects.
#
# So speed is judged hard only on a machine class marked `dedicated = true` in
# quality/MACHINES.toml -- a machine nothing else is allowed to use. Elsewhere it
# is printed as ADVISORY, with the load the run was taken under, and does not
# decide the exit status. Correctness, fidelity and size stay hard everywhere:
# those do not move because a neighbour is compiling.
SPEED_AXES = ("speed_p50_ms", "speed_p95_ms")


def machine_is_dedicated(run: dict) -> bool:
    return machine_classes().get(run["machine"], {}).get("dedicated", "").lower() == "true"


def compare(baseline: Row, now: Row) -> list[tuple[str, str]]:
    """Every way a row can be worse, and every way it can be better than the
    floor without anyone saying so.

    Each finding carries the axis it came from, because not every axis is
    judged the same way everywhere: see SPEED_AXES and `dedicated`."""
    findings: list[tuple[str, str]] = []
    doc, metric = baseline["doc"], baseline["fidelity_metric"]

    if baseline["completes"] == "true" and now["completes"] != "true":
        findings.append(("completes", f"{doc}: completes true -> {now['completes']}"))
    if baseline["completes"] != "true" and now["completes"] == "true":
        findings.append((
            "completes",
            f"{doc}: completes {baseline['completes']} -> true; raise the baseline in its"
            " own commit and say what moved it",
        ))

    findings += judge(
        doc, f"fidelity ({metric})", as_float(baseline["fidelity"]), as_float(now["fidelity"]),
        higher_is_better=True,
        tol_pct=None,
        tol_abs=baseline.tolerance("tol_fidelity", DEFAULT_TOL_FIDELITY),
    )
    findings += judge(
        doc, "size_ratio", as_float(baseline["size_ratio"]), as_float(now["size_ratio"]),
        higher_is_better=False,
        tol_pct=baseline.tolerance("tol_size_pct", DEFAULT_TOL_SIZE_PCT),
        tol_abs=0.0,
        # _all may not grow at all: a corpus total that creeps a percent per
        # round is how a size axis is lost without a single red run.
        forbid_any_growth=doc == "_all",
    )
    findings += judge(
        doc, "speed_p95_ms", as_float(baseline["speed_p95_ms"]), as_float(now["speed_p95_ms"]),
        higher_is_better=False,
        tol_pct=baseline.tolerance("tol_speed_pct", DEFAULT_TOL_SPEED_PCT),
        tol_abs=baseline.tolerance("tol_speed_ms", DEFAULT_TOL_SPEED_MS),
        both_required=True,
    )
    findings += judge(
        doc, "speed_p50_ms", as_float(baseline["speed_p50_ms"]), as_float(now["speed_p50_ms"]),
        higher_is_better=False,
        tol_pct=DEFAULT_TOL_P50_PCT,
        tol_abs=DEFAULT_TOL_P50_MS,
        both_required=True,
    )
    return findings


def judge(
    doc: str,
    axis: str,
    was: float | None,
    now: float | None,
    *,
    higher_is_better: bool,
    tol_pct: float | None,
    tol_abs: float,
    both_required: bool = False,
    forbid_any_growth: bool = False,
) -> list[tuple[str, str]]:
    if was is None and now is None:
        return []
    if was is not None and now is None:
        return [(axis, f"{doc}: {axis} was measured ({was}) and is missing now")]
    if was is None:
        return []

    delta = now - was
    worse = -delta if higher_is_better else delta
    if forbid_any_growth and worse > 0:
        return [(axis, f"{doc}: {axis} {was} -> {now}, and this row may not grow at all")]

    over_abs = abs(delta) > tol_abs
    over_pct = tol_pct is None or (was != 0 and abs(delta) / abs(was) * 100.0 > tol_pct)
    outside = (over_abs and over_pct) if both_required else (over_abs or (tol_pct is not None and over_pct))
    if not outside:
        return []
    if worse > 0:
        return [(axis, f"{doc}: {axis} {was} -> {now} (worse, tolerance {tol_pct}% / {tol_abs})")]
    return [(
        axis,
        f"{doc}: {axis} {was} -> {now} (better than the floor; raise the baseline in its own"
        " commit and say what moved it)",
    )]


def run_capability(capability: str, run: dict, platform: str, bless: bool, ticket: str | None) -> tuple[int, list[str]]:
    path = AXES_DIR / f"{capability}.tsv"
    methodology, baseline_rows = read_baseline(path)
    measured = rows_from_run(run, capability)

    if methodology != METHODOLOGY:
        write_baseline(path, measured)
        return 0, [
            f"[{capability}] methodology changed ({methodology} -> {METHODOLOGY}):"
            " re-recorded instead of judged; read the diff"
        ]

    if bless:
        return bless_rows(capability, path, baseline_rows, measured, ticket)

    by_key = {row.key: row for row in baseline_rows}
    dedicated = machine_is_dedicated(run)
    load = run.get("load_1min")
    findings: list[str] = []
    judged = 0
    for row in measured:
        was = by_key.get(row.key)
        if was is None:
            # No floor on this platform yet. Not a failure: a floor invented
            # on another platform is worse than none.
            continue
        judged += 1
        for axis, text in compare(was, row):
            if axis in SPEED_AXES and not dedicated:
                # Printed, never counted. The number is still in the log for
                # whoever wants to read the trend; it just does not fail a
                # landing on a machine that cannot hold a speed number still.
                findings.append(
                    f"[{capability}] ADVISORY (machine {run['machine']} is not dedicated,"
                    f" load_1min {fmt(load) if load is not None else 'unrecorded'}): {text}"
                )
                continue
            findings.append(f"[{capability}] {text}")

    if judged == 0:
        findings.append(
            f"[{capability}] SKIPPED (not a pass): no baseline rows for platform {platform};"
            f" bless a run on {platform} to create them"
        )
        return 0, findings
    hard = [line for line in findings if "] ADVISORY (" not in line]
    return (1 if hard else 0), findings


def bless_rows(capability: str, path: Path, baseline_rows: list[Row], measured: list[Row], ticket: str | None) -> tuple[int, list[str]]:
    if not ticket:
        return 2, [f"[{capability}] --bless needs --ticket: a new floor without a ticket is a floor nobody agreed to"]
    by_key = {row.key: row for row in baseline_rows}
    kept = [row for row in baseline_rows if row.key not in {r.key for r in measured}]
    problems: list[str] = []
    for row in measured:
        was = by_key.get(row.key)
        if was is None:
            row.values["why"] = f"#{ticket} first measurement on this platform"
            continue
        # Carry the tolerances and the reason forward; they are decisions, not
        # measurements, and a bless must not quietly drop them.
        for column in ("tol_speed_pct", "tol_speed_ms", "tol_fidelity", "tol_size_pct"):
            row.values[column] = was[column]
        moved = [text for _axis, text in compare(was, row)]
        worse = [finding for finding in moved if "worse" in finding or "-> false" in finding]
        if worse and was["why"] in ("-", ""):
            problems.append(f"[{capability}] {row['doc']} moved the wrong way and has no why: {worse}")
        row.values["why"] = f"#{ticket}" if not worse else f"#{ticket} {was['why']}" if was["why"] != "-" else f"#{ticket}"
    if problems:
        return 2, problems + [f"[{capability}] refusing to bless: every lowered value needs a why"]
    write_baseline(path, kept + measured)
    return 0, [f"[{capability}] blessed {len(measured)} rows against #{ticket}"]


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--capability")
    parser.add_argument("--all", action="store_true")
    parser.add_argument("--run", required=True)
    parser.add_argument("--platform")
    parser.add_argument("--bless", action="store_true")
    parser.add_argument("--ticket")
    args = parser.parse_args()

    try:
        run = json.loads(Path(args.run).read_text())
        verify_corpus(run)
        verify_machine(run)
        platform = args.platform or run["platform"]
        if platform != run["platform"]:
            raise CannotMeasure(
                f"--platform {platform} but the run was measured on {run['platform']}"
            )
        capabilities = (
            sorted(run["capabilities"]) if args.all else [args.capability]
        )
        if not capabilities or capabilities == [None]:
            raise CannotMeasure("name a --capability or pass --all")

        status = 0
        lines: list[str] = []
        for capability in capabilities:
            if capability not in run["capabilities"]:
                raise CannotMeasure(f"the run holds no numbers for {capability}")
            code, findings = run_capability(capability, run, platform, args.bless, args.ticket)
            status = max(status, code)
            lines += findings
    except CannotMeasure as problem:
        print(f"ratchet: cannot measure: {problem}", file=sys.stderr)
        return 2

    for line in lines:
        print(line)
    advisory = sum(1 for line in lines if "] ADVISORY (" in line)
    print(json.dumps({"axes": {"run_id": run["run_id"], "platform": platform,
                               "machine": run["machine"], "findings": len(lines) - advisory,
                               "advisory": advisory,
                               "status": status}}, sort_keys=True))
    return status


if __name__ == "__main__":
    sys.exit(main())
