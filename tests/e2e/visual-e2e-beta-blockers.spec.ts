// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary. The PDFluent application is free to use,
// including for commercial purposes. Redistribution, or extraction or reuse
// of its components (including the embedded PDF engine), requires a licence.
// See https://pdfluent.com/license for terms.

import { test, expect, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { tid } from './helpers/selectors';

const SAMPLE_TEXT = 'tests/fixtures/sample-text.pdf';
const SAMPLE_XFA = 'tests/fixtures/sample-xfa.pdf';
const MINIMAL = 'tests/fixtures/minimal.pdf';

const LATER_SCENARIOS = ['VE-009'];
const RUNTIME_GAP_SCENARIOS = ['VE-007', 'VE-008', 'VE-010'];

type TestHook = {
  loadDocument: (source: string | ArrayBuffer) => Promise<void>;
};

async function gotoEnglishViewer(page: Page): Promise<void> {
  await page.addInitScript(() => {
    localStorage.setItem('pdfluent-lang', 'en');
  });
  // V3 is the default shell at /; ?v2 is a no-op (V3 shows instead).
  await page.goto('/');
  await page.locator('.pfv3[data-has-document="false"]').waitFor({ state: 'visible', timeout: 15_000 });
}

async function loadDocument(page: Page, path: string): Promise<void> {
  await page.waitForFunction(
    () => typeof (window as unknown as { __pdfluent_test__?: TestHook }).__pdfluent_test__ !== 'undefined',
    undefined,
    { timeout: 15_000 },
  );
  await page.evaluate(
    async (p) => {
      await (window as unknown as { __pdfluent_test__: TestHook }).__pdfluent_test__.loadDocument(p);
    },
    path,
  );
  await page.locator(tid('floating-page-indicator')).waitFor({ state: 'visible', timeout: 15_000 });
}

async function gotoViewerWithPdf(page: Page, path = SAMPLE_TEXT): Promise<void> {
  await gotoEnglishViewer(page);
  await loadDocument(page, path);
}

async function switchMode(page: Page, name: string): Promise<void> {
  await page.getByRole('button', { name, exact: true }).click();
}

async function waitForRenderedImage(page: Page): Promise<void> {
  // rendered-page is now a <canvas> element (not <img>) — no src/naturalWidth.
  // We wait for the canvas to be visible and to have non-zero pixel dimensions,
  // which proves the browser-test renderPageToCanvas call completed successfully.
  const canvas = page.locator(tid('rendered-page')).first();
  await expect(canvas).toBeVisible({ timeout: 15_000 });
  await expect.poll(
    () => canvas.evaluate((el) => (el as HTMLCanvasElement).width),
    { timeout: 15_000 },
  ).toBeGreaterThan(0);
}

async function dragAcrossFirstTextSpan(page: Page): Promise<void> {
  const span = page.locator(tid('text-span')).first();
  await expect(span).toBeVisible({ timeout: 15_000 });
  const box = await span.boundingBox();
  expect(box).not.toBeNull();
  await page.mouse.move(box!.x + 4, box!.y + box!.height / 2);
  await page.mouse.down();
  await page.mouse.move(box!.x + Math.min(box!.width - 2, 160), box!.y + box!.height / 2, { steps: 8 });
  await page.mouse.up();
}

async function exportPdfAndAssertValid(page: Page): Promise<Buffer> {
  await page.locator(tid('export-btn')).click();
  await expect(page.locator(tid('export-dialog'))).toBeVisible({ timeout: 5_000 });
  const options = page.locator(`${tid('export-format-select')} option`);
  await expect(options).toHaveCount(1);
  await expect(options.first()).toHaveAttribute('value', 'pdf');
  await expect(page.locator(tid('export-submit-btn'))).toBeEnabled();

  const downloadPromise = page.waitForEvent('download', { timeout: 15_000 });
  await page.locator(tid('export-submit-btn')).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/\.pdf$/i);
  const path = await download.path();
  expect(path).not.toBeNull();
  const bytes = readFileSync(path!);
  expect(bytes.subarray(0, 5).toString('latin1')).toBe('%PDF-');
  return bytes;
}

async function reopenExportedBytes(page: Page, bytes: Buffer): Promise<void> {
  await page.evaluate(
    async (downloaded) => {
      const buffer = Uint8Array.from(downloaded).buffer;
      await (window as unknown as { __pdfluent_test__: TestHook }).__pdfluent_test__.loadDocument(buffer);
    },
    Array.from(bytes),
  );
  await page.locator(tid('floating-page-indicator')).waitFor({ state: 'visible', timeout: 15_000 });
  await waitForRenderedImage(page);
}

test.describe('visual E2E beta blockers — scenario selection', () => {
  test('documents later scenarios as product gaps', () => {
    expect(LATER_SCENARIOS).toEqual(['VE-009']);
    expect(RUNTIME_GAP_SCENARIOS).toEqual(['VE-007', 'VE-008', 'VE-010']);
  });
});

test.describe('visual E2E beta blockers — open/render/navigation/zoom/search', () => {
  test('VE-001 and VE-002 open and render sample text PDF', async ({ page }) => {
    await gotoEnglishViewer(page);
    // V3 shell: welcome state is .welcome-v3 inside .pfv3[data-has-document="false"].
    await expect(page.locator('.pfv3[data-has-document="false"]')).toBeVisible();
    await expect(page.locator('.welcome-v3')).toBeVisible();

    await loadDocument(page, SAMPLE_TEXT);

    await expect(page.locator('.welcome-v3')).toHaveCount(0);
    await expect(page.locator(tid('floating-page-indicator'))).toContainText('1 / 3');
    // Use .first() — continuous-scroll renders all pages simultaneously
    await expect(page.locator(tid('page-view')).first()).toBeVisible();
    await waitForRenderedImage(page);
  });

  test('VE-003 page navigation updates page and render', async ({ page }) => {
    test.skip(true, 'v3-arch-gap: nav-next/prev/go-to-page testids live in LeftNavRail which is not rendered in the V3 shell — rewrite needed');
    await gotoViewerWithPdf(page);
    const indicator = page.locator(tid('floating-page-indicator'));
    // Continuous-scroll: all pages are rendered simultaneously, so we verify
    // the indicator (current-page tracker) rather than image src changes.
    await expect(indicator).toContainText('1 / 3');

    await page.locator(tid('nav-next-page-btn')).click();
    await expect(indicator).toContainText('2 / 3');

    await page.locator(tid('nav-next-page-btn')).click();
    await expect(indicator).toContainText('3 / 3');
    await page.locator(tid('nav-prev-page-btn')).click();
    await expect(indicator).toContainText('2 / 3');

    await page.locator(tid('nav-go-to-page-input')).fill('1');
    await page.keyboard.press('Enter');
    await expect(indicator).toContainText('1 / 3');
  });

  test('VE-004 zoom controls are enabled and update the page', async ({ page }) => {
    test.skip(true, 'v3-arch-gap: toolbar-zoom-display and zoom-in/out buttons live in ModeToolbar which is not rendered in the V3 shell — rewrite needed');
    await gotoViewerWithPdf(page);
    await expect(page.locator(tid('toolbar-zoom-display'))).toContainText('100%');

    const zoomIn = page.locator('button[title="Zoom in"]').first();
    const zoomOut = page.locator('button[title="Zoom out"]').first();
    await expect(zoomIn).toBeEnabled();
    await expect(zoomOut).toBeEnabled();

    await zoomIn.click();
    await expect(page.locator(tid('toolbar-zoom-display'))).toContainText('125%');
    await zoomIn.click();
    await expect(page.locator(tid('toolbar-zoom-display'))).toContainText('150%');
    await zoomOut.click();
    await expect(page.locator(tid('toolbar-zoom-display'))).toContainText('125%');

    await page.locator(tid('zoom-reset-btn')).click();
    await page.getByRole('menuitem', { name: '100%' }).click();
    await expect(page.locator(tid('toolbar-zoom-display'))).toContainText('100%');
    await page.locator(tid('zoom-fit-width-btn')).click();
    await expect(page.locator(tid('toolbar-zoom-display'))).toContainText('100%');
  });

  test('VE-005 searches text and navigates to a result', async ({ page }) => {
    test.skip(true, 'v3-arch-gap: search button/panel testids live in ModeToolbar+SearchPanel which are not rendered in the V3 shell — rewrite needed');
    await gotoViewerWithPdf(page);
    await page.locator('button[title="Search text"]').click();
    await expect(page.locator(tid('search-panel'))).toBeVisible();
    await page.locator(tid('search-input')).fill('Lorem');
    await expect(page.locator(tid('search-result-count'))).toContainText(/result/i);
    await expect(page.locator(tid('search-result-item')).first()).toBeVisible();
    await page.getByRole('button', { name: /Result page 2:/ }).click();
    await expect(page.locator(tid('floating-page-indicator'))).toContainText('2 / 3');
  });
});

test.describe('visual E2E beta blockers — text and annotations', () => {
  test('VE-006 selects and copies text with the floating selection toolbar', async ({ page, context }) => {
    test.skip(true, 'runtime gap: BrowserTestRuntimeAdapter uses MockPdfEngine which returns no real text spans — text selection requires the native Tauri engine');
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    await gotoViewerWithPdf(page);
    // Use .first() — continuous-scroll renders text-layer for each page
    await expect(page.locator(tid('text-layer')).first()).toBeVisible();

    await dragAcrossFirstTextSpan(page);

    await expect(page.locator(tid('text-selection-toolbar'))).toBeVisible();
    await page.locator(tid('sel-toolbar-copy')).click();
    await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toContain('Lorem');
  });

  test('VE-007 adds a highlight annotation via selection in browser-test', async ({ page }) => {
    test.skip(true, 'runtime gap: browser-test harness exposes no native addHighlight command.');
    await gotoViewerWithPdf(page);
    await switchMode(page, 'Review');
    await expect(page.locator(tid('annotation-tool-highlight'))).toBeVisible();
    await expect(page.locator(tid('annotation-tool-underline'))).toHaveCount(0);
    await expect(page.locator(tid('annotation-tool-strikeout'))).toHaveCount(0);
    await expect(page.locator(tid('annotation-tool-rectangle'))).toHaveCount(0);
    await expect(page.locator(tid('annotation-tool-redaction'))).toHaveCount(0);

    await page.locator(tid('annotation-tool-highlight')).click();
    await expect(page.locator(tid('annotation-tool-highlight'))).toHaveAttribute('aria-pressed', 'true');
    await dragAcrossFirstTextSpan(page);

    await expect(page.locator(tid('annotation-marker')).first()).toBeVisible({ timeout: 10_000 });
    await expect(page.locator(tid('bottom-task-bar'))).toHaveCount(0);
  });

  test('VE-008 adds a sticky note comment', async ({ page }) => {
    test.skip(true, 'runtime gap: browser-test harness exposes no native addStickyNote command.');
    await gotoViewerWithPdf(page);
    await switchMode(page, 'Review');
    await expect(page.locator(tid('add-comment-btn'))).toBeVisible();
    await expect(page.locator(tid('comment-filter-count'))).toContainText('0 comments');

    await page.locator(tid('add-comment-btn')).click();

    await expect(page.locator(tid('comment-filter-count'))).toContainText('1 comment', { timeout: 10_000 });
    await expect(page.locator(tid('comment-nav'))).toBeVisible();
    await expect(page.locator(tid('bottom-task-bar'))).toHaveCount(0);
  });

  test('VE-010 exports after annotation', async ({ page }) => {
    test.skip(true, 'runtime gap: export after annotation is blocked until native annotation creation is available.');
    await gotoViewerWithPdf(page);
    await switchMode(page, 'Review');
    await page.locator(tid('add-comment-btn')).click();
    await expect(page.locator(tid('comment-filter-count'))).toContainText('1 comment', { timeout: 10_000 });
    await exportPdfAndAssertValid(page);
  });
});

test.describe('visual E2E beta blockers — XFA, export, and browser-test gating', () => {
  test('VE-011 shows XFA banner and document info form type', async ({ page }) => {
    test.skip(true, 'v3-arch-gap: doc-info-form-type lives in RightContextPanel (not rendered in V3); XFA banner text is Dutch hardcoded — rewrite needed');
    await gotoViewerWithPdf(page, SAMPLE_XFA);
    await expect(page.getByText(/XFA form data/i)).toBeVisible();
    await expect(page.locator(tid('doc-info-form-type'))).toContainText('XFA');
  });

  test('VE-012 and VE-013 flatten XFA and export flattened PDF', async ({ page }) => {
    test.skip(true, 'v3-arch-gap: XFA banner text is Dutch hardcoded; export-btn is in share dropdown (not directly accessible) — rewrite needed');
    await gotoViewerWithPdf(page, SAMPLE_XFA);
    await expect(page.getByText(/XFA form data/i)).toBeVisible();
    await expect(page.locator(tid('xfa-flatten-btn'))).toBeVisible();
    await expect(page.locator(tid('xfa-flatten-btn'))).toBeEnabled();

    await page.locator(tid('xfa-flatten-btn')).click();
    await expect(page.getByText(/XFA form data/i)).toHaveCount(0, { timeout: 15_000 });
    await waitForRenderedImage(page);

    const bytes = await exportPdfAndAssertValid(page);
    await reopenExportedBytes(page, bytes);
  });

  test('VE-014 validates PDF/A and shows a result', async ({ page }) => {
    test.skip(true, 'v3-arch-gap: pdfa-panel/validate-pdfa-btn live in RightContextPanel which is not rendered in the V3 shell — rewrite needed');
    await gotoViewerWithPdf(page);
    await switchMode(page, 'Convert');
    await expect(page.locator(tid('pdfa-panel'))).toBeVisible();
    await expect(page.locator(tid('validate-pdfa-btn'))).toBeEnabled();

    await page.locator(tid('validate-pdfa-btn')).click();
    await expect(page.locator(tid('pdfa-status'))).toContainText(/PDF\/A/i, { timeout: 15_000 });
  });

  test('VE-015 converts to PDF/A and exports converted bytes', async ({ page }) => {
    test.skip(true, 'v3-arch-gap: convert-pdfa-btn/pdfa-status live in RightContextPanel which is not rendered in the V3 shell — rewrite needed');
    const original = readFileSync(SAMPLE_TEXT);
    await gotoViewerWithPdf(page);
    await switchMode(page, 'Convert');
    await expect(page.locator(tid('convert-pdfa-btn'))).toBeEnabled();

    await page.locator(tid('convert-pdfa-btn')).click();
    await expect(page.locator(tid('pdfa-status'))).toContainText(/Converted to PDF\/A-2b/i, { timeout: 15_000 });

    const bytes = await exportPdfAndAssertValid(page);
    expect(Buffer.compare(bytes, original)).not.toBe(0);
    await reopenExportedBytes(page, bytes);
  });

  test('VE-017 and VE-021 export a clean PDF and expose only PDF format', async ({ page }) => {
    test.skip(true, 'v3-arch-gap: export-btn is inside the share dropdown (requires opening it first) — rewrite needed');
    await gotoViewerWithPdf(page, MINIMAL);
    await exportPdfAndAssertValid(page);
  });

  test('VE-019 and VE-022 keep organize mutating tools disabled outside Tauri', async ({ page }) => {
    test.skip(true, 'v3-arch-gap: Organize is not exposed as a mode tab in browser-test; ModeSwitcher BROWSER_TEST_TABS only includes Read/Edit/Convert/Sign — rewrite needed');
    await gotoViewerWithPdf(page);
    const indicator = page.locator(tid('floating-page-indicator'));
    const originalText = await indicator.textContent();

    await switchMode(page, 'Organize');
    await expect(page.locator(tid('organize-grid'))).toBeVisible();
    await expect(page.locator(tid('organize-merge-pdf-btn'))).toBeDisabled();
    await expect(page.locator(tid('organize-merge-pdf-btn'))).toHaveAttribute('title', /not yet available/i);
    await expect(page.locator(tid('organize-split-btn'))).toBeDisabled();
    await expect(page.locator(tid('organize-split-btn'))).toHaveAttribute('title', /not yet available/i);
    await expect(page.locator(tid('organize-delete-0'))).toBeDisabled();
    await expect(page.locator(tid('organize-delete-0'))).toHaveAttribute('title', /not yet available/i);
    await expect(page.locator(tid('organize-rotate-0'))).toBeDisabled();
    await expect(page.locator(tid('organize-rotate-0'))).toHaveAttribute('title', /not yet available/i);
    await expect(page.locator(tid('batch-action-bar'))).toHaveCount(0);
    await page.locator(tid('organize-merge-pdf-btn')).click({ force: true });

    await page.locator(tid('select-all-btn')).click();
    await expect(page.locator(tid('batch-action-bar'))).toBeVisible();
    await expect(page.locator(tid('batch-delete-btn'))).toBeDisabled();
    await expect(page.locator(tid('batch-delete-btn'))).toHaveAttribute('title', /not yet available/i);
    await expect(page.locator(tid('batch-rotate-btn'))).toBeDisabled();
    await expect(page.locator(tid('batch-rotate-btn'))).toHaveAttribute('title', /not yet available/i);

    await page.locator(tid('batch-delete-btn')).click({ force: true });
    await page.waitForTimeout(500);

    await switchMode(page, 'Read');
    await expect(indicator).toContainText(originalText ?? '1 / 3');
    await expect(page.locator(tid('bottom-task-bar'))).toHaveCount(0);
  });

  test('VE-020 hides annotation creation tools in browser-test review toolbar', async ({ page }) => {
    test.skip(true, 'v3-arch-gap: Review is not exposed as a mode tab in browser-test; ModeSwitcher BROWSER_TEST_TABS only includes Read/Edit/Convert/Sign — rewrite needed');
    await gotoViewerWithPdf(page);
    await switchMode(page, 'Review');
    await expect(page.locator(tid('add-comment-btn'))).toHaveCount(0);
    await expect(page.locator(tid('annotation-tool-highlight'))).toHaveCount(0);
    await expect(page.locator(tid('annotation-tool-underline'))).toHaveCount(0);
    await expect(page.locator(tid('annotation-tool-strikeout'))).toHaveCount(0);
    await expect(page.locator(tid('annotation-tool-rectangle'))).toHaveCount(0);
    await expect(page.locator(tid('annotation-tool-redaction'))).toHaveCount(0);
  });

  test('VE-023 disables OCR scan in browser-test convert mode', async ({ page }) => {
    test.skip(true, 'v3-arch-gap: toolbar.ocrScan button lives in ModeToolbar which is not rendered in the V3 shell — rewrite needed');
    await gotoViewerWithPdf(page);
    await switchMode(page, 'Convert');
    const ocr = page.locator('button[title="OCR scan (not yet available)"]');
    await expect(ocr).toBeVisible();
    await expect(ocr).toBeDisabled();
    await expect(ocr).toHaveClass(/text-muted-foreground\/40/);
    await expect(ocr).toHaveClass(/cursor-default/);
  });

  test('VE-024 hides protect redaction draw button in browser-test', async ({ page }) => {
    test.skip(true, 'v3-arch-gap: Protect is not exposed as a mode tab in browser-test; ModeSwitcher BROWSER_TEST_TABS only includes Read/Edit/Convert/Sign — rewrite needed');
    await gotoViewerWithPdf(page);
    await switchMode(page, 'Protect');
    await expect(page.locator(tid('annotation-tool-redaction-protect'))).toHaveCount(0);
  });
});
