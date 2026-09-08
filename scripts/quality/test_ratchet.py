#!/usr/bin/env python3
# Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
#
# This software is proprietary. The PDFluent application is free to use,
# including for commercial purposes. Redistribution, or extraction or reuse
# of its components (including the embedded PDF engine), requires a licence.
# See https://pdfluent.com/license for terms.
"""Tests for the ratchet, run with `python3 scripts/quality/test_ratchet.py`.

unittest rather than pytest: this runs on whatever python3 a CI runner has,
and a gate that needs an install step is a gate that gets skipped.

Every case builds its own repository root — MACHINES.toml, a manifest, two
one-byte "documents" and a baseline — so nothing here can pass or fail because
of the real baselines it exists to protect.
"""

from __future__ import annotations

import hashlib
import json
import os
import shutil
import subprocess
import sys
import tempfile
import unittest
from datetime import date, timedelta
from pathlib import Path

RATCHET = Path(__file__).resolve().parent / "ratchet.py"

COLUMNS = [
    "doc", "platform", "machine", "completes", "speed_p50_ms", "speed_p95_ms",
    "fidelity", "fidelity_metric", "size_ratio", "tol_speed_pct", "tol_speed_ms",
    "tol_fidelity", "tol_size_pct", "run_id", "why",
]

DOCS = {"doc-a": b"%PDF-a\n", "doc-b": b"%PDF-b\n"}


def row(doc, *, platform="darwin", machine="dev-macbook-m1pro", completes="true",
        p50="100", p95="200", fidelity="100.0",
        metric="retention_chars_pct", size="1.0", tol_speed_pct="-", tol_speed_ms="-",
        tol_fidelity="-", tol_size_pct="-", run_id="r1", why="-"):
    return "\t".join([
        doc, platform, machine, completes, p50, p95, fidelity, metric,
        size, tol_speed_pct, tol_speed_ms, tol_fidelity, tol_size_pct, run_id, why,
    ])


class Fixture:
    """A throwaway repository root with one capability, two documents."""

    def __init__(self, *, calibrated=None, methodology="golden-17-v1"):
        self.root = Path(tempfile.mkdtemp(prefix="ratchet-test-"))
        golden = self.root / "src-tauri" / "tests" / "golden"
        golden.mkdir(parents=True)
        documents = []
        for name, body in DOCS.items():
            (golden / f"{name}.pdf").write_bytes(body)
            documents.append({
                "name": name,
                "file": f"{name}.pdf",
                "sha256": hashlib.sha256(body).hexdigest(),
                "bytes": len(body),
                "source": "test",
                "licence": "test",
            })
        (golden / "MANIFEST.json").write_text(json.dumps({"set": "golden-17", "documents": documents}))
        calibrated = calibrated or date.today().isoformat()
        (self.root / "quality").mkdir()
        # Two classes, on two platforms: a baseline holds a row per platform,
        # and a bless of one of them must leave the other's numbers alone.
        (self.root / "quality" / "MACHINES.toml").write_text(
            "[dev-macbook-m1pro]\n"
            'platform = "darwin"\n'
            f'calibrated_on = "{calibrated}"\n'
            "calibration_valid_days = 180\n"
            "\n"
            "[runner-desktop-wsl-4core]\n"
            'platform = "linux"\n'
            f'calibrated_on = "{calibrated}"\n'
            "calibration_valid_days = 180\n"
        )
        (self.root / "quality" / "axes").mkdir()
        self.methodology = methodology

    def baseline(self, capability, rows):
        path = self.root / "quality" / "axes" / f"{capability}.tsv"
        path.write_text(
            "\n".join([f"# methodology: {self.methodology}", "\t".join(COLUMNS), *rows]) + "\n"
        )
        return path

    def run_file(self, capability, docs, *, platform="darwin",
                 machine="dev-macbook-m1pro", run_id="r2"):
        path = self.root / f"run-{platform}.json"
        path.write_text(json.dumps({
            "run_id": run_id,
            "platform": platform,
            "machine": machine,
            "set": "golden-17",
            "capabilities": {capability: docs},
        }))
        return path

    def ratchet(self, *args):
        env = dict(os.environ, PDFLUENT_QUALITY_ROOT=str(self.root))
        result = subprocess.run(
            [sys.executable, str(RATCHET), *args], capture_output=True, text=True, env=env
        )
        return result.returncode, result.stdout + result.stderr

    def cleanup(self):
        shutil.rmtree(self.root, ignore_errors=True)


# Five samples, the convention the run files use. Sorted they give p50 = 100
# and p95 = 200, which is what the baseline rows above record.
DEFAULT_SPEED = (100.0, 100.0, 100.0, 200.0, 200.0)


def measured(*, completes=True, speed=DEFAULT_SPEED, fidelity=100.0, size=1.0,
             metric="retention_chars_pct", skipped=None):
    entry = {"completes": completes, "speed_ms": list(speed),
             "fidelity": {metric: fidelity}, "size_ratio": size}
    if skipped:
        entry["skipped_reason"] = skipped
    return entry


class RatchetTest(unittest.TestCase):
    def setUp(self):
        self.fixture = Fixture()
        self.addCleanup(self.fixture.cleanup)

    def judge(self, docs, *extra):
        self.fixture.baseline("pdfa", [row("doc-a"), row("doc-b")])
        run = self.fixture.run_file("pdfa", docs)
        return self.fixture.ratchet("--capability", "pdfa", "--run", str(run), *extra)

    def test_1_run_equals_baseline(self):
        code, out = self.judge({"doc-a": measured(), "doc-b": measured()})
        self.assertEqual(code, 0, out)

    def test_2_one_document_two_percent_larger(self):
        code, out = self.judge({"doc-a": measured(size=1.02), "doc-b": measured()})
        self.assertEqual(code, 1, out)
        self.assertIn("doc-a", out)
        self.assertIn("size_ratio", out)
        self.assertIn("1.02", out)

    def test_3_one_document_three_percent_smaller_is_also_red(self):
        # Two-way. An unblessed improvement means the floor no longer says what
        # the code does, and the next regression starts from a number nobody
        # measured.
        code, out = self.judge({"doc-a": measured(size=0.97), "doc-b": measured()})
        self.assertEqual(code, 1, out)
        self.assertIn("raise the baseline", out)

    def test_4_speed_needs_both_the_percentage_and_the_floor(self):
        code, out = self.judge({"doc-a": measured(speed=(100.0, 100.0, 100.0, 230.0, 230.0)), "doc-b": measured()})
        self.assertEqual(code, 0, out)  # +15%, +30 ms: under the 50 ms floor
        code, out = self.judge({"doc-a": measured(speed=(100.0, 100.0, 100.0, 280.0, 280.0)), "doc-b": measured()})
        self.assertEqual(code, 1, out)  # +40%, +80 ms
        self.assertIn("speed_p95_ms", out)

    def test_5_fidelity_loss_is_not_offset_by_size(self):
        self.fixture.baseline("pdfa", [
            row("doc-a", fidelity="true", metric="verapdf_2b"),
            row("doc-b", fidelity="true", metric="verapdf_2b"),
        ])
        run = self.fixture.run_file("pdfa", {
            "doc-a": measured(fidelity=False, metric="verapdf_2b", size=0.5),
            "doc-b": measured(fidelity=True, metric="verapdf_2b", size=0.5),
        })
        code, out = self.fixture.ratchet("--capability", "pdfa", "--run", str(run))
        self.assertEqual(code, 1, out)
        self.assertIn("verapdf_2b", out)

    def test_6_a_skipped_axis_cannot_pass(self):
        code, out = self.judge({"doc-a": measured(skipped="veraPDF not installed"), "doc-b": measured()})
        self.assertEqual(code, 2, out)
        self.assertIn("veraPDF not installed", out)

    def test_7a_corpus_mismatch(self):
        (self.fixture.root / "src-tauri/tests/golden/doc-a.pdf").write_bytes(b"%PDF-changed\n")
        code, out = self.judge({"doc-a": measured(), "doc-b": measured()})
        self.assertEqual(code, 2, out)
        self.assertIn("MANIFEST", out)

    def test_7b_unknown_machine_class(self):
        self.fixture.baseline("pdfa", [row("doc-a")])
        path = self.fixture.root / "run.json"
        path.write_text(json.dumps({
            "run_id": "r2", "platform": "darwin", "machine": "someone's laptop",
            "set": "golden-17", "capabilities": {"pdfa": {"doc-a": measured()}},
        }))
        code, out = self.fixture.ratchet("--capability", "pdfa", "--run", str(path))
        self.assertEqual(code, 2, out)
        self.assertIn("unknown machine class", out)

    def test_7c_stale_calibration(self):
        self.fixture.cleanup()
        self.fixture = Fixture(calibrated=(date.today() - timedelta(days=400)).isoformat())
        code, out = self.judge({"doc-a": measured(), "doc-b": measured()})
        self.assertEqual(code, 2, out)
        self.assertIn("calibrated", out)

    def test_8_methodology_change_re_records(self):
        self.fixture.methodology = "golden-17-v0"
        self.fixture.baseline("pdfa", [row("doc-a", size="9.0"), row("doc-b", size="9.0")])
        run = self.fixture.run_file("pdfa", {"doc-a": measured(), "doc-b": measured()})
        code, out = self.fixture.ratchet("--capability", "pdfa", "--run", str(run))
        self.assertEqual(code, 0, out)
        self.assertIn("re-recorded instead of judged", out)
        rewritten = (self.fixture.root / "quality/axes/pdfa.tsv").read_text()
        self.assertIn("# methodology: golden-17-v1", rewritten)
        self.assertNotIn("\t9.0\t", rewritten)

    def test_9a_bless_without_ticket(self):
        code, out = self.judge({"doc-a": measured(size=1.5), "doc-b": measured()}, "--bless")
        self.assertEqual(code, 2, out)
        self.assertIn("--ticket", out)

    def test_9b_bless_of_a_lowered_value_without_why(self):
        code, out = self.judge(
            {"doc-a": measured(size=1.5), "doc-b": measured()}, "--bless", "--ticket", "412"
        )
        self.assertEqual(code, 2, out)
        self.assertIn("no why", out)

    def test_9c_bless_with_ticket_and_why(self):
        self.fixture.baseline("pdfa", [row("doc-a", why="#187 subsetting traded size for conformance"), row("doc-b")])
        run = self.fixture.run_file("pdfa", {"doc-a": measured(size=1.5), "doc-b": measured()})
        code, out = self.fixture.ratchet("--capability", "pdfa", "--run", str(run), "--bless", "--ticket", "412")
        self.assertEqual(code, 0, out)
        written = (self.fixture.root / "quality/axes/pdfa.tsv").read_text()
        self.assertIn("1.5", written)
        self.assertIn("#412", written)

    def test_a_platform_without_rows_is_named_not_silently_green(self):
        self.fixture.baseline("pdfa", [])
        run = self.fixture.run_file("pdfa", {"doc-a": measured(), "doc-b": measured()})
        code, out = self.fixture.ratchet("--capability", "pdfa", "--run", str(run))
        self.assertEqual(code, 0, out)
        self.assertIn("SKIPPED (not a pass)", out)
        self.assertIn("darwin", out)

    def test_all_row_may_not_grow_at_all(self):
        self.fixture.baseline("pdfa", [row("_all", size="1.0"), row("doc-a"), row("doc-b")])
        run = self.fixture.run_file("pdfa", {
            "_all": measured(size=1.005), "doc-a": measured(), "doc-b": measured(),
        })
        code, out = self.fixture.ratchet("--capability", "pdfa", "--run", str(run))
        self.assertEqual(code, 1, out)
        self.assertIn("may not grow at all", out)

    def test_blessing_one_platform_leaves_the_other_platform_alone(self):
        # A column is seeded per platform, one run at a time: the laptop is
        # measured here and the runner on the runner. A bless that wrote only
        # what it just measured would drop the other platform's floor, and the
        # next run there would find no rows and report SKIPPED rather than red.
        self.fixture.baseline("pdfa", [
            row("doc-a", size="1.0"),
            row("doc-b", size="1.0"),
        ])
        run = self.fixture.run_file(
            "pdfa",
            {"doc-a": measured(size=2.0), "doc-b": measured(size=2.0)},
            platform="linux",
            machine="runner-desktop-wsl-4core",
            run_id="r-linux",
        )
        code, out = self.fixture.ratchet(
            "--capability", "pdfa", "--run", str(run), "--bless", "--ticket", "451"
        )
        self.assertEqual(code, 0, out)

        written = (self.fixture.root / "quality/axes/pdfa.tsv").read_text()
        rows = [line.split("\t") for line in written.splitlines() if line.startswith("doc-")]
        by_platform = {}
        for fields in rows:
            by_platform.setdefault(fields[1], {})[fields[0]] = fields
        self.assertEqual(
            sorted(by_platform), ["darwin", "linux"],
            f"a bless on linux rewrote the platform list:\n{written}",
        )
        for doc in ("doc-a", "doc-b"):
            self.assertEqual(by_platform["darwin"][doc][8], "1.0", written)
            self.assertEqual(by_platform["darwin"][doc][13], "r1", written)
            self.assertEqual(by_platform["linux"][doc][8], "2")
            self.assertEqual(by_platform["linux"][doc][2], "runner-desktop-wsl-4core")

    def test_a_platform_with_rows_is_still_judged_after_the_other_was_blessed(self):
        # The other half of the same promise: the darwin rows that survived are
        # a floor, not decoration, and a darwin run that got worse is red even
        # though a linux bless has since rewritten the file.
        self.fixture.baseline("pdfa", [
            row("doc-a", size="1.0"),
            row("doc-b", size="1.0"),
            row("doc-a", platform="linux", machine="runner-desktop-wsl-4core", size="2.0"),
            row("doc-b", platform="linux", machine="runner-desktop-wsl-4core", size="2.0"),
        ])
        run = self.fixture.run_file(
            "pdfa", {"doc-a": measured(size=1.5), "doc-b": measured()}
        )
        code, out = self.fixture.ratchet("--capability", "pdfa", "--run", str(run))
        self.assertEqual(code, 1, out)
        self.assertIn("doc-a: size_ratio 1.0 -> 1.5", out)

    def test_a_document_that_stops_completing(self):
        code, out = self.judge({"doc-a": measured(completes=False), "doc-b": measured()})
        self.assertEqual(code, 1, out)
        self.assertIn("completes true -> false", out)


if __name__ == "__main__":
    unittest.main(verbosity=2)
