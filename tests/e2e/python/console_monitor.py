#!/usr/bin/env python3
# Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
#
# This software is proprietary. The PDFluent application is free to use,
# including for commercial purposes. Redistribution, or extraction or reuse
# of its components (including the embedded PDF engine), requires a licence.
# See https://pdfluent.com/license for terms.

"""
console_monitor.py — Console error sweep across all modes and interactions.

Navigeert door alle modes en interacties, vangt alle console errors/warnings.
Rapport met errors per actie.

Usage:
    python tests/e2e/python/console_monitor.py [--base-url http://localhost:1420]
"""

import argparse
import json
import sys
from dataclasses import dataclass, field
from datetime import datetime
from pathlib import Path

try:
    from playwright.sync_api import sync_playwright, Page, ConsoleMessage
except ImportError:
    print("playwright not installed. Run: pip install playwright && playwright install chromium")
    sys.exit(1)


BASE_URL = "http://localhost:1420"
VIEWER_URL = "/?v2"
OUTPUT_DIR = Path("/tmp/pdfluent-screenshots")

MODES = ["Lezen", "Bewerken", "Beoordelen", "Beveiligen", "Formulieren"]


@dataclass
class ActionLog:
    action: str
    errors: list[str] = field(default_factory=list)
    warnings: list[str] = field(default_factory=list)


def wait_for_viewer(page: Page) -> None:
    page.goto(f"{BASE_URL}{VIEWER_URL}")
    page.locator('[data-testid="viewer-empty-state"]').wait_for(
        state="visible", timeout=15_000
    )


def load_mock_document(page: Page) -> None:
    page.wait_for_function(
        "typeof window.__pdfluent_test__ !== 'undefined'", timeout=15_000
    )
    page.evaluate("window.__pdfluent_test__.loadDocument('mock-test.pdf')")
    page.locator('[data-testid="floating-page-indicator"]').wait_for(
        state="visible", timeout=5_000
    )


def switch_mode(page: Page, label: str) -> None:
    page.get_by_role("button", name=label, exact=True).click()
    page.wait_for_timeout(300)


def run(base_url: str) -> None:
    global BASE_URL
    BASE_URL = base_url

    logs: list[ActionLog] = []
    current_log: ActionLog | None = None
    total_errors = 0
    total_warnings = 0

    def on_console(msg: ConsoleMessage) -> None:
        nonlocal total_errors, total_warnings
        if current_log is None:
            return
        if msg.type == "error":
            current_log.errors.append(msg.text)
            total_errors += 1
        elif msg.type == "warning":
            current_log.warnings.append(msg.text)
            total_warnings += 1

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        context = browser.new_context(viewport={"width": 1440, "height": 900})
        page = context.new_page()
        page.on("console", on_console)

        # Action 1: Load viewer (welcome screen)
        current_log = ActionLog(action="Load welcome screen")
        wait_for_viewer(page)
        logs.append(current_log)

        # Action 2: Load document
        current_log = ActionLog(action="Load mock document")
        load_mock_document(page)
        logs.append(current_log)

        # Action 3: Cycle through all modes
        for mode in MODES:
            current_log = ActionLog(action=f"Switch to mode: {mode}")
            switch_mode(page, mode)
            logs.append(current_log)

        # Action 4: Zoom in/out cycle
        switch_mode(page, "Lezen")
        for zoom_pct in [50, 75, 100, 150, 200, 100]:
            current_log = ActionLog(action=f"Zoom to {zoom_pct}%")
            page.evaluate(f"window.__pdfluent_test__.setZoom?.({zoom_pct / 100})")
            page.wait_for_timeout(200)
            logs.append(current_log)

        # Action 5: Page navigation cycle
        for direction in ["next", "next", "prev", "prev"]:
            testid = f"nav-{direction}-page-btn"
            current_log = ActionLog(action=f"Navigate page: {direction}")
            btn = page.locator(f'[data-testid="{testid}"]')
            if btn.is_visible() and btn.is_enabled():
                btn.click()
                page.wait_for_timeout(300)
            logs.append(current_log)

        # Action 6: Open/close shortcut sheet
        current_log = ActionLog(action="Open shortcut sheet")
        try:
            page.keyboard.press("?")
            page.wait_for_timeout(300)
            ss = page.locator('[data-testid="shortcut-sheet"]')
            if ss.is_visible():
                page.locator('[data-testid="shortcut-sheet-close"]').click()
                page.wait_for_timeout(200)
        except Exception:
            pass
        logs.append(current_log)

        # Action 7: Open/close command palette
        current_log = ActionLog(action="Open command palette")
        try:
            page.keyboard.press("Meta+k")
            page.wait_for_timeout(300)
            cp = page.locator('[data-testid="command-palette"]')
            if cp.is_visible():
                page.keyboard.press("Escape")
                page.wait_for_timeout(200)
        except Exception:
            pass
        logs.append(current_log)

        # Action 8: Open/close export dialog
        current_log = ActionLog(action="Open export dialog")
        try:
            btn = page.locator('[data-testid="export-btn"]')
            if btn.is_visible():
                btn.click()
                page.wait_for_timeout(300)
                page.keyboard.press("Escape")
                page.wait_for_timeout(200)
        except Exception:
            pass
        logs.append(current_log)

        # Action 9: Full mode cycle (stress test)
        current_log = ActionLog(action="Full mode cycle (stress test)")
        for mode in MODES * 2:
            switch_mode(page, mode)
        logs.append(current_log)

        browser.close()

    # Print report
    print("=" * 70)
    print("PDFluent Console Monitor Report")
    print(f"Date: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    print("=" * 70)

    for log in logs:
        status = "OK" if not log.errors else f"ERRORS ({len(log.errors)})"
        warn_str = f", {len(log.warnings)} warnings" if log.warnings else ""
        print(f"\n[{status}] {log.action}{warn_str}")
        for err in log.errors:
            print(f"  ERROR: {err[:200]}")
        for warn in log.warnings[:3]:
            print(f"  WARN:  {warn[:200]}")

    print("\n" + "=" * 70)
    print(f"Total: {total_errors} errors, {total_warnings} warnings across {len(logs)} actions")
    print("=" * 70)

    # Write JSON report
    output_dir = OUTPUT_DIR / "console-reports"
    output_dir.mkdir(parents=True, exist_ok=True)
    report_path = output_dir / f"console-{datetime.now().strftime('%Y%m%d-%H%M%S')}.json"
    report = [
        {
            "action": log.action,
            "errors": log.errors,
            "warnings": log.warnings,
        }
        for log in logs
    ]
    report_path.write_text(json.dumps(report, indent=2))
    print(f"\nJSON report: {report_path}")

    sys.exit(1 if total_errors > 0 else 0)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="PDFluent console error monitor")
    parser.add_argument("--base-url", default=BASE_URL, help="Dev server base URL")
    args = parser.parse_args()
    run(args.base_url)
