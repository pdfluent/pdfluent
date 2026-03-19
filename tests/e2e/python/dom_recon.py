#!/usr/bin/env python3
# Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
#
# This software is proprietary and confidential.
# Free for personal, non-commercial use.
# Commercial use requires a valid license.
# See https://pdfluent.com/license for terms.

"""
dom_recon.py — DOM reconnaissance.

Inspecteert de DOM in elke mode en rapporteert:
- Alle data-testid attributen (coverage check)
- Alle interactieve elementen (buttons, inputs, selects)
- Alle ARIA roles en labels
- Missing testids op interactieve elementen (gap analysis)

Usage:
    python tests/e2e/python/dom_recon.py [--base-url http://localhost:1420]
"""

import argparse
import json
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

MODES = ["Lezen", "Bewerken", "Beoordelen", "Beveiligen", "Formulieren"]


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


def collect_dom_info(page: Page) -> dict:
    """Collect DOM information from the current page state."""
    return page.evaluate("""() => {
        const testids = [];
        document.querySelectorAll('[data-testid]').forEach(el => {
            testids.push({
                testid: el.getAttribute('data-testid'),
                tag: el.tagName.toLowerCase(),
                visible: el.offsetParent !== null || el.getClientRects().length > 0,
            });
        });

        const interactive = [];
        const interactiveSel = 'button, input, select, textarea, a[href], [role="button"], [tabindex]';
        document.querySelectorAll(interactiveSel).forEach(el => {
            const testid = el.getAttribute('data-testid');
            const ariaLabel = el.getAttribute('aria-label');
            const role = el.getAttribute('role');
            const text = el.textContent?.trim().substring(0, 50) || '';
            interactive.push({
                tag: el.tagName.toLowerCase(),
                type: el.getAttribute('type') || null,
                testid: testid || null,
                ariaLabel: ariaLabel || null,
                role: role || null,
                text: text,
                visible: el.offsetParent !== null || el.getClientRects().length > 0,
                disabled: el.disabled || el.getAttribute('disabled') !== null,
            });
        });

        const ariaElements = [];
        document.querySelectorAll('[role], [aria-label], [aria-labelledby], [aria-describedby]').forEach(el => {
            ariaElements.push({
                tag: el.tagName.toLowerCase(),
                role: el.getAttribute('role'),
                ariaLabel: el.getAttribute('aria-label'),
                ariaLabelledBy: el.getAttribute('aria-labelledby'),
                testid: el.getAttribute('data-testid') || null,
            });
        });

        return { testids, interactive, ariaElements };
    }""")


def run(base_url: str) -> None:
    global BASE_URL
    BASE_URL = base_url

    all_results: dict[str, dict] = {}

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        context = browser.new_context(viewport={"width": 1440, "height": 900})
        page = context.new_page()

        # Welcome screen
        print("Scanning welcome screen...")
        wait_for_viewer(page)
        all_results["welcome"] = collect_dom_info(page)

        # Load document
        load_mock_document(page)

        # Each mode
        for mode in MODES:
            print(f"Scanning mode: {mode}...")
            switch_mode(page, mode)
            all_results[f"mode-{mode.lower()}"] = collect_dom_info(page)

        browser.close()

    # Aggregate unique testids
    all_testids: set[str] = set()
    for state_data in all_results.values():
        for item in state_data["testids"]:
            all_testids.add(item["testid"])

    # Find interactive elements without testids
    missing_testids: list[dict] = []
    seen: set[str] = set()
    for state, state_data in all_results.items():
        for item in state_data["interactive"]:
            if item["testid"] is None and item["visible"]:
                key = f"{item['tag']}:{item['text'][:30]}:{item.get('ariaLabel', '')}"
                if key not in seen:
                    seen.add(key)
                    missing_testids.append({
                        "state": state,
                        "tag": item["tag"],
                        "text": item["text"],
                        "ariaLabel": item["ariaLabel"],
                        "type": item["type"],
                    })

    # Print report
    print("\n" + "=" * 70)
    print("PDFluent DOM Reconnaissance Report")
    print(f"Date: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    print("=" * 70)

    print(f"\nTotal unique data-testid values: {len(all_testids)}")
    print("\nAll testids:")
    for tid in sorted(all_testids):
        print(f"  - {tid}")

    print(f"\nInteractive elements WITHOUT data-testid: {len(missing_testids)}")
    for item in missing_testids[:30]:
        label = item["ariaLabel"] or item["text"][:40] or "(no label)"
        print(f"  [{item['state']}] <{item['tag']}> {label}")

    if len(missing_testids) > 30:
        print(f"  ... and {len(missing_testids) - 30} more")

    # Per-state summary
    print("\nPer-state summary:")
    for state, data in all_results.items():
        n_testids = len(data["testids"])
        n_interactive = len([i for i in data["interactive"] if i["visible"]])
        n_with_testid = len([i for i in data["interactive"] if i["visible"] and i["testid"]])
        n_aria = len(data["ariaElements"])
        coverage = (n_with_testid / n_interactive * 100) if n_interactive else 0
        print(f"  {state:20s}: {n_testids:3d} testids, {n_interactive:3d} interactive ({coverage:.0f}% with testid), {n_aria:3d} ARIA")

    # Write JSON report
    output_dir = OUTPUT_DIR / "dom-reports"
    output_dir.mkdir(parents=True, exist_ok=True)
    report_path = output_dir / f"dom-recon-{datetime.now().strftime('%Y%m%d-%H%M%S')}.json"
    report = {
        "timestamp": datetime.now().isoformat(),
        "all_testids": sorted(all_testids),
        "missing_testids": missing_testids,
        "per_state": {
            state: {
                "testid_count": len(data["testids"]),
                "interactive_count": len([i for i in data["interactive"] if i["visible"]]),
                "interactive_with_testid": len([i for i in data["interactive"] if i["visible"] and i["testid"]]),
                "aria_count": len(data["ariaElements"]),
            }
            for state, data in all_results.items()
        },
    }
    report_path.write_text(json.dumps(report, indent=2))
    print(f"\nJSON report: {report_path}")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="PDFluent DOM reconnaissance")
    parser.add_argument("--base-url", default=BASE_URL, help="Dev server base URL")
    args = parser.parse_args()
    run(args.base_url)
