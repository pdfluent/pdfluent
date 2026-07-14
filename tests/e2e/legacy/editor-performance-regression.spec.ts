// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary. The PDFluent application is free to use,
// including for commercial purposes. Redistribution, or extraction or reuse
// of its components (including the embedded PDF engine), requires a licence.
// See https://pdfluent.com/license for terms.

import { test, expect, type Page } from '@playwright/test';
import { tid } from './helpers/selectors';
import { readFile } from 'node:fs/promises';

const SAMPLE_TEXT = 'tests/fixtures/sample-text.pdf';

type ExtractedTestSpan = {
  text: string;
  color?: [number, number, number];
  isBold?: boolean;
  isItalic?: boolean;
};

type TestHook = {
  loadDocument: (source: string | ArrayBuffer) => Promise<void>;
  getTextSpans?: () => ExtractedTestSpan[];
};

async function openViewerWithDocument(page: Page): Promise<void> {
  await page.addInitScript(() => {
    localStorage.setItem('pdfluent-lang', 'en');
  });
  await page.goto('/?v2');
  await page.locator(tid('viewer-empty-state')).waitFor({ state: 'visible', timeout: 15_000 });
  await page.waitForFunction(
    () => typeof (window as unknown as { __pdfluent_test__?: TestHook }).__pdfluent_test__ !== 'undefined',
    undefined,
    { timeout: 15_000 },
  );
  await page.evaluate(async (p: string) => {
    await (window as unknown as { __pdfluent_test__: TestHook }).__pdfluent_test__.loadDocument(p);
  }, SAMPLE_TEXT);
  await page.locator(tid('floating-page-indicator')).waitFor({ state: 'visible', timeout: 15_000 });
}

async function waitForPaintedCanvas(page: Page): Promise<void> {
  const canvas = page.locator(tid('rendered-page')).first();
  await expect(canvas).toBeVisible({ timeout: 15_000 });
  await expect.poll(
    () => canvas.evaluate((el) => {
      const cvs = el as HTMLCanvasElement;
      const ctx = cvs.getContext('2d');
      if (!ctx || !cvs.width || !cvs.height) return false;
      return ctx.getImageData(0, 0, Math.min(4, cvs.width), Math.min(4, cvs.height)).data.some(v => v !== 0);
    }),
    { timeout: 15_000 },
  ).toBe(true);
}

async function selectEditorText(page: Page, needle: string): Promise<void> {
  await page.locator(tid('text-inline-editor')).evaluate((el, word) => {
    const root = el as HTMLElement;
    const text = root.textContent ?? '';
    const start = text.indexOf(word);
    if (start < 0) throw new Error(`target word not found in editor: ${word}`);
    const end = start + word.length;

    const findPosition = (offset: number): { node: Text; offset: number } => {
      const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
      let remaining = offset;
      let last: Text | null = null;
      while (walker.nextNode()) {
        const node = walker.currentNode as Text;
        last = node;
        if (remaining <= node.data.length) return { node, offset: remaining };
        remaining -= node.data.length;
      }
      if (last) return { node: last, offset: last.data.length };
      throw new Error('editor has no text nodes');
    };

    const range = document.createRange();
    const startPos = findPosition(start);
    const endPos = findPosition(end);
    range.setStart(startPos.node, startPos.offset);
    range.setEnd(endPos.node, endPos.offset);
    const selection = window.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);
  }, needle);
}

async function saveAndReload(page: Page, outputPath: string): Promise<void> {
  const downloadPromise = page.waitForEvent('download');
  await page.locator(tid('save-btn')).click();
  const download = await downloadPromise;
  await download.saveAs(outputPath);

  const savedBytes = await readFile(outputPath);
  await page.evaluate(async (bytes) => {
    await (window as unknown as { __pdfluent_test__: TestHook }).__pdfluent_test__.loadDocument(
      new Uint8Array(bytes).buffer,
    );
  }, Array.from(savedBytes));
  await expect(page.locator(tid('floating-page-indicator'))).toBeVisible({ timeout: 15_000 });
}

async function extractedSpans(page: Page): Promise<ExtractedTestSpan[]> {
  return page.evaluate(() => (
    (window as unknown as { __pdfluent_test__?: TestHook })
      .__pdfluent_test__?.getTextSpans?.() ?? []
  ));
}

function isRed(color?: [number, number, number]): boolean {
  return Boolean(color && color[0] > 0.85 && color[1] < 0.35 && color[2] < 0.35);
}

test.describe('editor performance regressions', () => {
  test.use({ deviceScaleFactor: 2 });

  test('retina zoom scales the existing canvas without dispatching a new render', async ({ page }) => {
    await openViewerWithDocument(page);
    await waitForPaintedCanvas(page);
    await page.waitForTimeout(1200);

    const before = await page.evaluate(() => {
      const canvas = document.querySelector('[data-testid="rendered-page"]') as HTMLCanvasElement | null;
      return {
        perfCount: ((window as unknown as { __PDFLUENT_PERF__?: { data: unknown[] } }).__PDFLUENT_PERF__?.data ?? []).length,
        width: canvas?.width ?? 0,
        height: canvas?.height ?? 0,
      };
    });

    await page.locator('button[title="Zoom in"]').first().click();
    await expect(page.locator(tid('zoom-reset-btn'))).toContainText('125%', { timeout: 2_000 });
    await page.waitForTimeout(900);

    const after = await page.evaluate(() => {
      const canvas = document.querySelector('[data-testid="rendered-page"]') as HTMLCanvasElement | null;
      return {
        perfCount: ((window as unknown as { __PDFLUENT_PERF__?: { data: unknown[] } }).__PDFLUENT_PERF__?.data ?? []).length,
        width: canvas?.width ?? 0,
        height: canvas?.height ?? 0,
        renderingOverlays: [...document.body.querySelectorAll('*')].filter(el => el.textContent === 'Rendering…').length,
      };
    });

    expect(after.perfCount).toBe(before.perfCount);
    expect(after.width).toBe(before.width);
    expect(after.height).toBe(before.height);
    expect(after.renderingOverlays).toBe(0);
  });

  test('single click in edit mode opens the inline text editor', async ({ page }) => {
    await openViewerWithDocument(page);
    await waitForPaintedCanvas(page);

    await page.getByRole('button', { name: 'Edit', exact: true }).click();
    const textSpan = page.locator(tid('text-span')).filter({ hasText: /\S/ }).first();
    await expect(textSpan).toBeVisible({ timeout: 15_000 });
    await textSpan.click();

    await expect(page.locator(tid('text-inline-editor'))).toBeVisible({ timeout: 5_000 });
    await expect(page.locator(tid('text-edit-floating-pill'))).toBeVisible({ timeout: 5_000 });

    const overlayMetrics = await page.evaluate(() => {
      const editor = document.querySelector<HTMLElement>('[data-testid="text-inline-editor"]');
      if (!editor) return null;
      const editorText = editor.textContent ?? '';
      const span = Array
        .from(document.querySelectorAll<HTMLElement>('[data-testid="text-span"]'))
        .find(el => {
          const text = el.textContent ?? '';
          return text.trim().length > 0 && editorText.includes(text);
        });
      if (!span) return null;

      const spanRect = span.getBoundingClientRect();
      const editorRect = editor.getBoundingClientRect();
      const style = window.getComputedStyle(editor);
      return {
        dx: Math.abs(editorRect.left - spanRect.left),
        dy: Math.abs(editorRect.top - spanRect.top),
        dw: Math.abs(editorRect.width - spanRect.width),
        dh: Math.abs(editorRect.height - spanRect.height),
        whiteSpace: style.whiteSpace,
        wordBreak: style.wordBreak,
      };
    });

    expect(overlayMetrics).not.toBeNull();
    expect(overlayMetrics!.dx).toBeLessThanOrEqual(0.5);
    expect(overlayMetrics!.dy).toBeLessThanOrEqual(0.5);
    expect(overlayMetrics!.dw).toBeLessThanOrEqual(0.5);
    expect(overlayMetrics!.dh).toBeLessThanOrEqual(0.5);
    expect(overlayMetrics!.whiteSpace).toBe('pre');
    expect(overlayMetrics!.wordBreak).toBe('normal');
  });

  test('inline save persists text, refreshes the text layer, and browser-save exports edited bytes', async ({ page }, testInfo) => {
    await openViewerWithDocument(page);
    await waitForPaintedCanvas(page);

    await page.getByRole('button', { name: 'Edit', exact: true }).click();
    const textSpan = page.locator(tid('text-span')).filter({ hasText: 'Lorem ipsum visual E2E page one' }).first();
    await expect(textSpan).toBeVisible({ timeout: 15_000 });
    await textSpan.click();

    const editor = page.locator(tid('text-inline-editor'));
    await expect(editor).toBeVisible({ timeout: 5_000 });
    await editor.evaluate((el) => {
      el.textContent = 'Edited visual E2E page one';
      el.dispatchEvent(new InputEvent('input', {
        bubbles: true,
        inputType: 'insertText',
        data: 'Edited visual E2E page one',
      }));
    });
    await page.locator(tid('text-edit-save-btn')).click();

    await expect(editor).toHaveCount(0, { timeout: 10_000 });
    await expect(page.locator(tid('text-layer')).first()).toContainText('Edited visual E2E page one', { timeout: 15_000 });
    await expect(page.locator(tid('text-layer')).first()).not.toContainText('Lorem ipsum visual E2E page one');
    await expect(page.locator(tid('text-selected-rect'))).toHaveCount(0);
    await expect(page.locator(tid('text-editing-rect'))).toHaveCount(0);

    const downloadPromise = page.waitForEvent('download');
    await page.locator(tid('save-btn')).click();
    const download = await downloadPromise;
    const savedPath = testInfo.outputPath('browser-saved-inline-edit.pdf');
    await download.saveAs(savedPath);

    const savedBytes = await readFile(savedPath);
    await page.evaluate(async (bytes) => {
      await (window as unknown as { __pdfluent_test__: TestHook }).__pdfluent_test__.loadDocument(
        new Uint8Array(bytes).buffer,
      );
    }, Array.from(savedBytes));
    await expect(page.locator(tid('text-layer')).first()).toContainText('Edited visual E2E page one', { timeout: 15_000 });
    await expect(page.locator(tid('text-layer')).first()).not.toContainText('Lorem ipsum visual E2E page one');
  });

  test('selected text color persists to the exact selected range after browser save and reload', async ({ page }, testInfo) => {
    await openViewerWithDocument(page);
    await waitForPaintedCanvas(page);

    await page.getByRole('button', { name: 'Edit', exact: true }).click();
    const textSpan = page.locator(tid('text-span')).filter({ hasText: 'Lorem ipsum visual E2E page one' }).first();
    await expect(textSpan).toBeVisible({ timeout: 15_000 });
    await textSpan.click();

    const editor = page.locator(tid('text-inline-editor'));
    await expect(editor).toBeVisible({ timeout: 5_000 });
    await selectEditorText(page, 'visual');

    await page.locator(tid('text-color-ef4444')).click();
    await expect.poll(
      () => editor.evaluate((el) => {
        const html = (el as HTMLElement).innerHTML.toLowerCase();
        return html.includes('#ef4444') || html.includes('rgb(239, 68, 68)');
      }),
      { timeout: 5_000 },
    ).toBe(true);

    await page.locator(tid('text-edit-save-btn')).click();
    await expect(editor).toHaveCount(0, { timeout: 10_000 });

    await expect.poll(
      async () => {
        const spans = await extractedSpans(page);
        return {
          visualRed: spans.some(span => span.text.includes('visual') && isRed(span.color)),
          wrongPrefixRed: spans.some(span => span.text.includes('Lorem') && isRed(span.color)),
        };
      },
      { timeout: 15_000 },
    ).toEqual({ visualRed: true, wrongPrefixRed: false });

    await saveAndReload(page, testInfo.outputPath('browser-saved-range-color.pdf'));
    await expect.poll(
      async () => {
        const spans = await extractedSpans(page);
        return {
          visualRed: spans.some(span => span.text.includes('visual') && isRed(span.color)),
          wrongPrefixRed: spans.some(span => span.text.includes('Lorem') && isRed(span.color)),
        };
      },
      { timeout: 15_000 },
    ).toEqual({ visualRed: true, wrongPrefixRed: false });
  });

  test('selected bold persists to the exact selected range after browser save and reload', async ({ page }, testInfo) => {
    await openViewerWithDocument(page);
    await waitForPaintedCanvas(page);

    await page.getByRole('button', { name: 'Edit', exact: true }).click();
    const textSpan = page.locator(tid('text-span')).filter({ hasText: 'Lorem ipsum visual E2E page one' }).first();
    await expect(textSpan).toBeVisible({ timeout: 15_000 });
    await textSpan.click();

    const editor = page.locator(tid('text-inline-editor'));
    await expect(editor).toBeVisible({ timeout: 5_000 });
    await selectEditorText(page, 'visual');
    await page.locator(tid('text-edit-bold-btn')).click();
    await expect.poll(
      () => editor.evaluate((el) => {
        const html = (el as HTMLElement).innerHTML.toLowerCase();
        return html.includes('<b>') || html.includes('font-weight') || html.includes('<strong>');
      }),
      { timeout: 5_000 },
    ).toBe(true);

    await page.locator(tid('text-edit-save-btn')).click();
    await expect(editor).toHaveCount(0, { timeout: 10_000 });

    await expect.poll(
      async () => {
        const spans = await extractedSpans(page);
        return {
          visualBold: spans.some(span => span.text.includes('visual') && span.isBold === true),
          wrongPrefixBold: spans.some(span => span.text.includes('Lorem') && span.isBold === true),
        };
      },
      { timeout: 15_000 },
    ).toEqual({ visualBold: true, wrongPrefixBold: false });

    await saveAndReload(page, testInfo.outputPath('browser-saved-range-bold.pdf'));
    await expect.poll(
      async () => {
        const spans = await extractedSpans(page);
        return {
          visualBold: spans.some(span => span.text.includes('visual') && span.isBold === true),
          wrongPrefixBold: spans.some(span => span.text.includes('Lorem') && span.isBold === true),
        };
      },
      { timeout: 15_000 },
    ).toEqual({ visualBold: true, wrongPrefixBold: false });
  });

  test('selected italic and color from properties panel persist together on the same range', async ({ page }, testInfo) => {
    await openViewerWithDocument(page);
    await waitForPaintedCanvas(page);

    await page.getByRole('button', { name: 'Edit', exact: true }).click();
    const textSpan = page.locator(tid('text-span')).filter({ hasText: 'Lorem ipsum visual E2E page one' }).first();
    await expect(textSpan).toBeVisible({ timeout: 15_000 });
    await textSpan.click();

    const editor = page.locator(tid('text-inline-editor'));
    await expect(editor).toBeVisible({ timeout: 5_000 });
    await selectEditorText(page, 'E2E');
    await page.locator(tid('text-props-italic-btn')).click();
    await page.locator(tid('text-color-ef4444')).click();

    await page.locator(tid('text-edit-save-btn')).click();
    await expect(editor).toHaveCount(0, { timeout: 10_000 });

    await saveAndReload(page, testInfo.outputPath('browser-saved-range-italic-color.pdf'));
    await expect.poll(
      async () => {
        const spans = await extractedSpans(page);
        return {
          e2eItalicRed: spans.some(span => span.text.includes('E2E') && span.isItalic === true && isRed(span.color)),
          wrongPrefixStyled: spans.some(span => span.text.includes('Lorem') && (span.isItalic === true || isRed(span.color))),
        };
      },
      { timeout: 15_000 },
    ).toEqual({ e2eItalicRed: true, wrongPrefixStyled: false });
  });
});
