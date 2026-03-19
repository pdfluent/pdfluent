#!/usr/bin/env python3
# Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
#
# This software is proprietary and confidential.
# Free for personal, non-commercial use.
# Commercial use requires a valid license.
# See https://pdfluent.com/license for terms.

"""
visual_baseline.py — Screenshot alle states voor visuele QA.

Neemt screenshots van elke state/mode/panel combinatie.
Output: /tmp/pdfluent-screenshots/ met timestamped PNG's.

Usage:
    python tests/e2e/python/visual_baseline.py [--base-url http://localhost:1420]
"""

import argparse
import os
import sys
from datetime import datetime
from pathlib import Path

try:
    from playwright.sync_api import sync_playwright, Page
except ImportError:
    print("playwright not installed. Run: pip install playwright && playwright install chromium")
    sys.exit(1)


OUTPUT_DIR = Path("/tmp/pdfluent-screenshots")
BASE_URL = "http://localhost:1420"
VIEWER_URL = "/?v2"

# Dutch mode labels as used in the app
MODES = ["Lezen", "Bewerken", "Beoordelen", "Beveiligen", "Formulieren"]

# Right panel tabs (visible via tab buttons in RightContextPanel)
RIGHT_PANEL_TABS = ["Doc Info", "Comments", "Forms", "Redaction", "OCR"]


def timestamp() -> str:
    return datetime.now().strftime("%Y%m%d-%H%M%S")


def screenshot(page: Page, name: str, output_dir: Path) -> None:
    path = output_dir / f"{name}.png"
    page.screenshot(path=str(path), full_page=False)
    print(f"  [OK] {path.name}")


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

    ts = timestamp()
    output_dir = OUTPUT_DIR / ts
    output_dir.mkdir(parents=True, exist_ok=True)
    print(f"Screenshots → {output_dir}\n")

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        context = browser.new_context(viewport={"width": 1440, "height": 900})
        page = context.new_page()

        # 1. Welcome screen (no document)
        print("Welcome screen states:")
        wait_for_viewer(page)
        screenshot(page, "01-welcome-empty", output_dir)

        # 2. Load document
        load_mock_document(page)
        page.wait_for_timeout(500)

        # 3. Each mode
        print("\nMode screenshots:")
        for i, mode in enumerate(MODES):
            switch_mode(page, mode)
            screenshot(page, f"02-mode-{i+1:02d}-{mode.lower()}", output_dir)

        # Back to read mode for panel screenshots
        switch_mode(page, "Lezen")

        # 4. Right panel tabs
        print("\nRight panel tabs:")
        # The right panel tabs are rendered as clickable section headers
        # Try clicking each tab section
        for i, tab in enumerate(RIGHT_PANEL_TABS):
            try:
                tab_btn = page.get_by_role("button", name=tab, exact=False).first
                if tab_btn.is_visible():
                    tab_btn.click()
                    page.wait_for_timeout(200)
                    screenshot(
                        page, f"03-panel-{i+1:02d}-{tab.lower().replace(' ', '-')}", output_dir
                    )
            except Exception:
                print(f"  [SKIP] Tab '{tab}' not found or not clickable")

        # 5. Zoom levels
        print("\nZoom levels:")
        for zoom_pct in [50, 200]:
            page.evaluate(f"window.__pdfluent_test__.setZoom?.({zoom_pct / 100})")
            page.wait_for_timeout(300)
            screenshot(page, f"04-zoom-{zoom_pct}pct", output_dir)
        # Reset zoom
        page.evaluate("window.__pdfluent_test__.setZoom?.(1.0)")
        page.wait_for_timeout(200)

        # 6. Page navigation
        print("\nPage navigation:")
        for pg in range(1, 4):
            next_btn = page.locator('[data-testid="nav-next-page-btn"]')
            if pg > 1 and next_btn.is_visible():
                next_btn.click()
                page.wait_for_timeout(300)
            screenshot(page, f"05-page-{pg}", output_dir)

        # 7. Shortcut sheet
        print("\nDialogs:")
        try:
            page.keyboard.press("?")
            page.wait_for_timeout(300)
            shortcut_sheet = page.locator('[data-testid="shortcut-sheet"]')
            if shortcut_sheet.is_visible():
                screenshot(page, "06-shortcut-sheet", output_dir)
                page.locator('[data-testid="shortcut-sheet-close"]').click()
        except Exception:
            print("  [SKIP] Shortcut sheet not available")

        # 8. Command palette
        try:
            page.keyboard.press("Meta+k")
            page.wait_for_timeout(300)
            palette = page.locator('[data-testid="command-palette"]')
            if palette.is_visible():
                screenshot(page, "07-command-palette", output_dir)
                page.keyboard.press("Escape")
        except Exception:
            print("  [SKIP] Command palette not available")

        # 9. Export dialog
        try:
            export_btn = page.locator('[data-testid="export-btn"]')
            if export_btn.is_visible():
                export_btn.click()
                page.wait_for_timeout(300)
                screenshot(page, "08-export-dialog", output_dir)
                page.keyboard.press("Escape")
        except Exception:
            print("  [SKIP] Export dialog not available")

        browser.close()

    print(f"\nDone — {len(list(output_dir.glob('*.png')))} screenshots in {output_dir}")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="PDFluent visual baseline screenshots")
    parser.add_argument("--base-url", default=BASE_URL, help="Dev server base URL")
    args = parser.parse_args()
    run(args.base_url)
