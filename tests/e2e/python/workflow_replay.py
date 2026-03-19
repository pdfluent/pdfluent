#!/usr/bin/env python3
# Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
#
# This software is proprietary and confidential.
# Free for personal, non-commercial use.
# Commercial use requires a valid license.
# See https://pdfluent.com/license for terms.

"""
workflow_replay.py — Full workflow replay met screenshots bij elke stap.

Replayed de 6 release-gating workflows visueel:
1. Open → Review → Comment → Save
2. Open → Edit Text → Save → Reopen
3. Open → Move Object → Save → Reopen
4. Open → Annotate → Export
5. Open → Redact → Save
6. Open Large → Navigate → Edit → Save

Usage:
    python tests/e2e/python/workflow_replay.py [--base-url http://localhost:1420]
"""

import argparse
import sys
from datetime import datetime
from pathlib import Path

try:
    from playwright.sync_api import sync_playwright, Page
except ImportError:
    print("playwright not installed. Run: pip install playwright && playwright install chromium")
    sys.exit(1)


BASE_URL = "http://localhost:1420"
VIEWER_URL = "/?v2"
OUTPUT_DIR = Path("/tmp/pdfluent-screenshots")


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


def screenshot(page: Page, name: str, output_dir: Path) -> None:
    path = output_dir / f"{name}.png"
    page.screenshot(path=str(path), full_page=False)
    print(f"    [{name}]")


class WorkflowRunner:
    def __init__(self, page: Page, output_dir: Path):
        self.page = page
        self.output_dir = output_dir
        self.errors: list[str] = []

    def reset(self) -> None:
        wait_for_viewer(self.page)
        load_mock_document(self.page)

    def workflow_1_review_comment(self) -> None:
        """Open → Review → Comment panel → Save"""
        print("\n  Workflow 1: Open → Review → Comment → Save")
        self.reset()
        screenshot(self.page, "wf1-01-loaded", self.output_dir)

        switch_mode(self.page, "Beoordelen")
        screenshot(self.page, "wf1-02-review-mode", self.output_dir)

        # Fill reviewer name
        reviewer_input = self.page.locator('[data-testid="reviewer-name-input"]')
        if reviewer_input.is_visible():
            reviewer_input.fill("QA Tester")
            screenshot(self.page, "wf1-03-reviewer-filled", self.output_dir)

        # Check comment filter
        filter_input = self.page.locator('[data-testid="comment-filter-input"]')
        if filter_input.is_visible():
            filter_input.fill("test")
            screenshot(self.page, "wf1-04-filter-applied", self.output_dir)
            filter_input.clear()

        screenshot(self.page, "wf1-05-final", self.output_dir)

    def workflow_2_edit_text(self) -> None:
        """Open → Edit Text → Save → Reopen"""
        print("\n  Workflow 2: Open → Edit Text → Save → Reopen")
        self.reset()
        screenshot(self.page, "wf2-01-loaded", self.output_dir)

        switch_mode(self.page, "Bewerken")
        screenshot(self.page, "wf2-02-edit-mode", self.output_dir)

        # Verify text interaction overlay
        overlay = self.page.locator('[data-testid="text-interaction-overlay"]')
        if overlay.is_visible():
            screenshot(self.page, "wf2-03-text-overlay-visible", self.output_dir)

        # Switch back to read
        switch_mode(self.page, "Lezen")
        screenshot(self.page, "wf2-04-back-to-read", self.output_dir)

    def workflow_3_move_object(self) -> None:
        """Open → Move Object → Save → Reopen"""
        print("\n  Workflow 3: Open → Move Object → Save → Reopen")
        self.reset()
        screenshot(self.page, "wf3-01-loaded", self.output_dir)

        switch_mode(self.page, "Bewerken")
        screenshot(self.page, "wf3-02-edit-mode", self.output_dir)

        # Object selection overlay should be available in edit mode
        obj_overlay = self.page.locator('[data-testid="object-selection-overlay"]')
        if obj_overlay.is_visible():
            screenshot(self.page, "wf3-03-object-overlay", self.output_dir)

        switch_mode(self.page, "Lezen")
        screenshot(self.page, "wf3-04-final", self.output_dir)

    def workflow_4_annotate_export(self) -> None:
        """Open → Annotate → Export"""
        print("\n  Workflow 4: Open → Annotate → Export")
        self.reset()
        screenshot(self.page, "wf4-01-loaded", self.output_dir)

        switch_mode(self.page, "Beoordelen")
        screenshot(self.page, "wf4-02-review-mode", self.output_dir)

        # Check annotation overlay
        annot_overlay = self.page.locator('[data-testid="annotation-overlay"]')
        if annot_overlay.is_visible():
            screenshot(self.page, "wf4-03-annotation-overlay", self.output_dir)

        # Open export dialog
        export_btn = self.page.locator('[data-testid="export-btn"]')
        if export_btn.is_visible():
            export_btn.click()
            self.page.wait_for_timeout(300)
            screenshot(self.page, "wf4-04-export-dialog", self.output_dir)
            self.page.keyboard.press("Escape")
            self.page.wait_for_timeout(200)

        screenshot(self.page, "wf4-05-final", self.output_dir)

    def workflow_5_redact(self) -> None:
        """Open → Redact → Save"""
        print("\n  Workflow 5: Open → Redact → Save")
        self.reset()
        screenshot(self.page, "wf5-01-loaded", self.output_dir)

        switch_mode(self.page, "Beveiligen")
        screenshot(self.page, "wf5-02-protect-mode", self.output_dir)

        # Check redaction panel
        redact_panel = self.page.locator('[data-testid="redaction-panel"]')
        if redact_panel.is_visible():
            screenshot(self.page, "wf5-03-redaction-panel", self.output_dir)

        # Search for redaction
        search_input = self.page.locator('[data-testid="search-redact-input"]')
        if search_input.is_visible():
            search_input.fill("confidential")
            screenshot(self.page, "wf5-04-search-redact", self.output_dir)

        screenshot(self.page, "wf5-05-final", self.output_dir)

    def workflow_6_large_navigate_edit(self) -> None:
        """Open Large → Navigate → Edit → Save"""
        print("\n  Workflow 6: Open → Navigate → Edit → Save")
        self.reset()
        screenshot(self.page, "wf6-01-loaded", self.output_dir)

        # Navigate to page 2
        next_btn = self.page.locator('[data-testid="nav-next-page-btn"]')
        if next_btn.is_visible() and next_btn.is_enabled():
            next_btn.click()
            self.page.wait_for_timeout(300)
            screenshot(self.page, "wf6-02-page-2", self.output_dir)

        # Navigate to page 3
        if next_btn.is_visible() and next_btn.is_enabled():
            next_btn.click()
            self.page.wait_for_timeout(300)
            screenshot(self.page, "wf6-03-page-3", self.output_dir)

        # Switch to edit mode
        switch_mode(self.page, "Bewerken")
        screenshot(self.page, "wf6-04-edit-on-page-3", self.output_dir)

        # Back to page 1
        prev_btn = self.page.locator('[data-testid="nav-prev-page-btn"]')
        if prev_btn.is_visible() and prev_btn.is_enabled():
            prev_btn.click()
            self.page.wait_for_timeout(200)
            prev_btn.click()
            self.page.wait_for_timeout(300)
            screenshot(self.page, "wf6-05-back-to-page-1", self.output_dir)

        screenshot(self.page, "wf6-06-final", self.output_dir)


def run(base_url: str) -> None:
    global BASE_URL
    BASE_URL = base_url

    ts = datetime.now().strftime("%Y%m%d-%H%M%S")
    output_dir = OUTPUT_DIR / f"workflows-{ts}"
    output_dir.mkdir(parents=True, exist_ok=True)
    print(f"Workflow screenshots → {output_dir}")

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        context = browser.new_context(viewport={"width": 1440, "height": 900})
        page = context.new_page()

        # Capture JS errors
        js_errors: list[str] = []
        page.on("pageerror", lambda err: js_errors.append(str(err)))

        runner = WorkflowRunner(page, output_dir)

        workflows = [
            runner.workflow_1_review_comment,
            runner.workflow_2_edit_text,
            runner.workflow_3_move_object,
            runner.workflow_4_annotate_export,
            runner.workflow_5_redact,
            runner.workflow_6_large_navigate_edit,
        ]

        for wf in workflows:
            try:
                wf()
            except Exception as e:
                print(f"    [ERROR] {e}")
                runner.errors.append(str(e))

        browser.close()

    n_screenshots = len(list(output_dir.glob("*.png")))
    print(f"\nDone — {n_screenshots} screenshots in {output_dir}")

    if js_errors:
        print(f"\nJS errors encountered ({len(js_errors)}):")
        for err in js_errors[:10]:
            print(f"  {err[:200]}")

    if runner.errors:
        print(f"\nWorkflow errors ({len(runner.errors)}):")
        for err in runner.errors:
            print(f"  {err[:200]}")
        sys.exit(1)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="PDFluent workflow replay")
    parser.add_argument("--base-url", default=BASE_URL, help="Dev server base URL")
    args = parser.parse_args()
    run(args.base_url)
