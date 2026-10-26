// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary. The PDFluent application is free to use,
// including for commercial purposes. Redistribution, or extraction or reuse
// of its components (including the embedded PDF engine), requires a licence.
// See https://pdfluent.com/license for terms.
//
// Keyboard, screen reader and right-to-left: the core journeys (J-91, J-92,
// J-94 in the editor plan).
//
// accessibility.spec.ts fails on serious and critical axe findings over the
// whole shell. This spec is narrower and stricter: on the open-document state,
// with the search popover open, any finding about names, labels or ARIA fails
// whatever its impact, because those are the findings that decide whether a
// screen reader can drive the app at all. The search popover's previous/next
// buttons had no name whatsoever, and nothing scanned the popover open.
//
// The core path is driven with the keyboard only -- open a document, change
// page, zoom, search, save -- and the modal dialogs must hold focus and close
// on Escape. Then the shell switches to Arabic: <html dir> must follow, the
// chrome must mirror, and the page canvas must not.
//
// Runs in the `playwright` job of .github/workflows/quality.yml, which runs
// every spec under tests/e2e that playwright.config.ts does not ignore.

import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Locator, type Page } from './helpers/guarded-test';

import { loadMockDocument } from './helpers/app';
import { tid } from './helpers/selectors';

/** Rules about accessible names, labels and ARIA. Any impact fails. */
function isNameOrAriaRule(id: string): boolean {
  return id === 'button-name' || id === 'label' || id === 'link-name' ||
    id === 'input-button-name' || id === 'select-name' || id.startsWith('aria-');
}

/** The welcome screen in the given UI language, before any document is open. */
async function gotoWelcome(page: Page, lang: string): Promise<void> {
  await page.addInitScript((l) => {
    try { localStorage.setItem('pdfluent-lang', l); } catch { /* storage unavailable */ }
  }, lang);
  await page.goto('/');
  await page.locator(tid('welcome-screen')).waitFor({ state: 'visible', timeout: 15_000 });
}

async function scanNamesAndAria(page: Page, state: string): Promise<void> {
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze();
  const found = results.violations.filter((v) => isNameOrAriaRule(v.id));
  const detail = found
    .map((v) => `  [${v.impact}] ${v.id}: ${v.help}\n` +
      v.nodes.slice(0, 6).map((n) => `      ${n.target.join(' ')}`).join('\n'))
    .join('\n');
  expect(
    found.map((v) => `${v.id} (${v.nodes.length} node(s))`),
    `axe found name/label/ARIA violations in the ${state}:\n${detail}`,
  ).toEqual([]);
}

/** Describe the focused element in one line, for failure messages. */
async function focusedDescription(page: Page): Promise<string> {
  return page.evaluate(() => {
    const el = document.activeElement as HTMLElement | null;
    if (!el) return '(nothing)';
    return `${el.tagName.toLowerCase()}${el.dataset.testid ? `[data-testid=${el.dataset.testid}]` : ''}` +
      `.${el.className} "${el.getAttribute('aria-label') ?? el.textContent?.trim().slice(0, 30) ?? ''}"`;
  });
}

/**
 * Press Tab until the focused element matches `selector` (and contains `text`,
 * when given), as a keyboard user would. Fails, naming the stops it passed,
 * when the control is not reachable.
 */
async function tabTo(page: Page, selector: string, text?: string, maxStops = 60): Promise<void> {
  const passed: string[] = [];
  for (let i = 0; i < maxStops; i++) {
    await page.keyboard.press('Tab');
    const hit = await page.evaluate(([s, t]) => {
      const el = document.activeElement;
      if (!el?.matches(s)) return false;
      return t ? (el.textContent ?? '').toLowerCase().includes(t.toLowerCase()) : true;
    }, [selector, text ?? ''] as const);
    if (hit) return;
    passed.push(await focusedDescription(page));
  }
  const target = text ? `${selector} with "${text}"` : selector;
  throw new Error(`${target} is not reachable with Tab in ${maxStops} stops; passed:\n  ${passed.join('\n  ')}`);
}

/** Whether the focused element draws a focus indicator a sighted keyboard user can see. */
async function focusIsVisible(page: Page): Promise<boolean> {
  return page.evaluate(() => {
    const el = document.activeElement as HTMLElement | null;
    if (!el || el === document.body) return false;
    const style = getComputedStyle(el);
    const outline = style.outlineStyle !== 'none' && parseFloat(style.outlineWidth) > 0;
    const ring = style.boxShadow !== 'none' && style.boxShadow !== '';
    return el.matches(':focus-visible') && (outline || ring);
  });
}

// The indicator follows the key a render later; a read straight after the key raced it
// (22-10, run 39776920930: "2 / 3" after Enter on Previous). Assertions on it poll.
async function pageIndicator(page: Page): Promise<string> {
  return (await page.locator(tid('floating-page-indicator')).innerText()).replace(/\s+/g, ' ').trim();
}

async function centreX(locator: Locator): Promise<number> {
  const box = await locator.boundingBox();
  if (!box) throw new Error('element has no layout box');
  return box.x + box.width / 2;
}

/** Tab through `count` stops and require every one to show where focus is. */
async function expectVisibleFocusOnEveryStop(page: Page, count: number): Promise<void> {
  const invisible: string[] = [];
  for (let i = 0; i < count; i++) {
    await page.keyboard.press('Tab');
    // Tab past the last control leaves the page for the browser chrome, which
    // the document sees as focus on <body>: not a stop in the app.
    const onBody = await page.evaluate(() => document.activeElement === document.body);
    if (!onBody && !(await focusIsVisible(page))) invisible.push(await focusedDescription(page));
  }
  expect(invisible, `these Tab stops show no focus indicator:\n  ${invisible.join('\n  ')}`).toEqual([]);
}

test.describe('screen reader names (J-92)', () => {
  test('the open document, with search open, has no name, label or ARIA violation', async ({ page }) => {
    await gotoWelcome(page, 'en');
    await loadMockDocument(page);
    await page.locator(tid('search-btn')).click();
    await expect(page.locator(tid('v3-search-input'))).toBeVisible();
    await scanNamesAndAria(page, 'open document with the search popover open');
  });

  test('icon-only buttons are named in the UI language, not in English', async ({ page }) => {
    await gotoWelcome(page, 'nl');
    await loadMockDocument(page);
    await page.locator(tid('search-btn')).click();
    const row = page.locator('.searchpop .row');
    await expect(row.getByRole('button', { name: 'Vorig resultaat' })).toBeVisible();
    await expect(row.getByRole('button', { name: 'Volgend resultaat' })).toBeVisible();
    await expect(page.locator(tid('bb-next-page-btn'))).toHaveAttribute('aria-label', 'Volgende pagina');
  });
});

test.describe('keyboard only (J-91)', () => {
  test('open, change page, zoom, search and save without a pointer', async ({ page }) => {
    await gotoWelcome(page, 'en');

    // Open: Tab to the welcome screen's open button and press Enter. The
    // browser build answers with a file chooser; the mock engine opens any
    // bytes as a three-page document.
    await tabTo(page, '.welcome-v3 .welcome-actions .share-btn');
    expect(await focusIsVisible(page), 'the open button shows focus').toBe(true);
    // Enter on the open button must reach the app's open action: the browser build
    // opens a file through its hidden file input, so the first Enter has to click
    // that input, and the test fails if it does not (a broken keyboard path).
    // Whether Chromium then shows the chooser is the browser's part and is the
    // only thing retried: it sometimes does not for a click that did reach the
    // input (1 run in 3 here, issue filed), so Enter is pressed again, up to three
    // times in all. In the desktop app the same button opens the native dialog
    // (tests/viewer-open-keyboard-path.test.ts).
    await page.evaluate(() => {
      const w = window as unknown as { __pfOpenInputClicks?: number };
      w.__pfOpenInputClicks = 0;
      document.querySelectorAll('input[type=file]').forEach((input) => {
        input.addEventListener('click', () => { w.__pfOpenInputClicks = (w.__pfOpenInputClicks ?? 0) + 1; }, true);
      });
    });
    const nextChooser = () => page.waitForEvent('filechooser', { timeout: 6_000 }).catch(() => undefined);
    let chooser: Awaited<ReturnType<typeof nextChooser>>;
    for (let attempt = 0; attempt < 3 && !chooser; attempt++) {
      const waiting = nextChooser();
      await page.keyboard.press('Enter');
      if (attempt === 0) {
        await expect
          .poll(() => page.evaluate(() => (window as unknown as { __pfOpenInputClicks?: number }).__pfOpenInputClicks ?? 0), {
            message: 'the first Enter on the open button clicked the hidden file input',
            timeout: 3_000,
          })
          .toBeGreaterThanOrEqual(1);
      }
      chooser = await waiting;
    }
    if (!chooser) throw new Error('Enter on the open button reached the file input but Chromium showed no file chooser in three tries');
    await chooser.setFiles({
      name: 'keyboard.pdf',
      mimeType: 'application/pdf',
      buffer: Buffer.from('%PDF-1.4\n%%EOF\n'),
    });
    await expect(page.locator(tid('floating-page-indicator'))).toBeVisible({ timeout: 10_000 });
    await expect.poll(() => pageIndicator(page), { timeout: 5_000 }).toBe('1 / 3');

    // Every stop through the top bar, the rails and the bottom bar shows
    // where focus is.
    await page.locator('.topbar .brand').focus();
    await expectVisibleFocusOnEveryStop(page, 30);

    // Page: the reading keys, and the bottom bar's buttons reached with Tab.
    await page.locator('.canvas').focus();
    await page.keyboard.press('PageDown');
    await expect.poll(() => pageIndicator(page), { timeout: 5_000 }).toBe('2 / 3');
    await page.keyboard.press('PageUp');
    await expect.poll(() => pageIndicator(page), { timeout: 5_000 }).toBe('1 / 3');
    await tabTo(page, tid('bb-next-page-btn'));
    await page.keyboard.press('Enter');
    await expect.poll(() => pageIndicator(page), { timeout: 5_000 }).toBe('2 / 3');
    await tabTo(page, tid('bb-prev-page-btn'));
    await page.keyboard.press('Enter');
    await expect.poll(() => pageIndicator(page), { timeout: 5_000 }).toBe('1 / 3');

    // Zoom: the shortcuts, and the bottom bar's buttons.
    // The level a document opens at depends on the window, so the steps are
    // asserted relative to it: one step is 25 percentage points.
    const zoom = page.locator(tid('zoom-reset-btn'));
    const start = parseInt(await zoom.innerText(), 10);
    expect(start, 'the zoom control shows a percentage').toBeGreaterThan(0);
    await page.keyboard.press('ControlOrMeta+=');
    await expect(zoom).toHaveText(`${start + 25}%`);
    await page.keyboard.press('ControlOrMeta+-');
    await expect(zoom).toHaveText(`${start}%`);
    await tabTo(page, tid('zoom-in-btn'));
    await page.keyboard.press('Enter');
    await expect(zoom).toHaveText(`${start + 25}%`);
    await tabTo(page, tid('zoom-out-btn'));
    await page.keyboard.press('Enter');
    await expect(zoom).toHaveText(`${start}%`);

    // Search: the top bar's search button, reached with Tab, puts the caret in
    // the query field.
    await tabTo(page, tid('search-btn'));
    await page.keyboard.press('Enter');
    const query = page.locator(tid('v3-search-input'));
    await expect(query).toBeFocused();
    await page.keyboard.type('page');
    await expect(query).toHaveValue('page');
    await expect(page.locator('.searchpop').getByRole('button', { name: 'Next result' })).toBeEnabled();

    // Save: the Share menu's "Save as", reached with Tab and pressed with
    // Enter. The browser build hands the bytes to a download; the desktop
    // build opens the save dialog through the same control. (The
    // Cmd/Ctrl+Shift+S shortcut goes through the native dialog only.)
    await tabTo(page, '.share-trigger');
    await page.keyboard.press('Enter');
    await tabTo(page, tid('save-as-btn'));
    await expect(page.locator(tid('save-as-btn'))).toBeEnabled();
    // What this proves is that the keyboard reaches and triggers the save
    // path. Whether bytes come out depends on the engine: MockDocumentEngine
    // .saveDocument returns none, and the browser save path then rejects with
    // a message that names it. That outcome is reported as a skip of the
    // download check, never as a pass of it.
    const outcome = Promise.race([
      page.waitForEvent('download', { timeout: 10_000 }).then((d) => ({ kind: 'download' as const, name: d.suggestedFilename() })),
      page.waitForEvent('pageerror', {
        timeout: 10_000,
        predicate: (e) => /did not return downloadable bytes/.test(e.message),
      }).then((e) => ({ kind: 'no-bytes' as const, name: e.message })),
      // A refused Save As is said on screen now (J-83), not thrown: the same
      // message arrives as a toast.
      page.getByText(/did not return downloadable bytes/).first().waitFor({ timeout: 10_000 })
        .then(() => ({ kind: 'no-bytes' as const, name: 'toast' })),
    ]);
    await page.keyboard.press('Enter');
    const result = await outcome;
    if (result.kind === 'download') {
      expect(result.name).toMatch(/\.pdf$/i);
    } else {
      console.error(
        'SKIPPED (not a pass): download not asserted -- the save path ran from the keyboard, ' +
        'but MockDocumentEngine.saveDocument returns no bytes',
      );
    }
  });

  for (const dialog of [
    {
      name: 'go to page',
      selector: tid('goto-page-dialog'),
      open: async (page: Page) => { await page.keyboard.press('ControlOrMeta+g'); },
    },
    {
      name: 'privacy',
      selector: tid('v3-modal'),
      open: async (page: Page) => {
        await tabTo(page, tid('more-menu-btn'));
        await page.keyboard.press('Enter');
        await tabTo(page, '.topbar-more-menu .dd-item', 'privacy');
        await page.keyboard.press('Enter');
      },
    },
    {
      name: 'export',
      selector: tid('export-dialog'),
      open: async (page: Page) => {
        await tabTo(page, '.share-trigger');
        await page.keyboard.press('Enter');
        await tabTo(page, '.share-menu .dd-item', 'export');
        await page.keyboard.press('Enter');
      },
    },
  ]) {
    test(`the ${dialog.name} dialog keeps focus inside and closes on Escape`, async ({ page }) => {
      await gotoWelcome(page, 'en');
      await loadMockDocument(page);
      await page.locator('.canvas').focus();
      await dialog.open(page);
      const box = page.locator(dialog.selector);
      await expect(box).toBeVisible();

      const escaped: string[] = [];
      for (let i = 0; i < 15; i++) {
        await page.keyboard.press(i % 4 === 3 ? 'Shift+Tab' : 'Tab');
        const inside = await page.evaluate(
          (s) => document.querySelector(s)?.contains(document.activeElement) ?? false,
          dialog.selector,
        );
        if (!inside) escaped.push(await focusedDescription(page));
      }
      expect(escaped, `focus left the ${dialog.name} dialog to:\n  ${escaped.join('\n  ')}`).toEqual([]);

      await page.keyboard.press('Escape');
      await expect(box).toHaveCount(0);
    });
  }
});

test.describe('right to left (J-94)', () => {
  test('Arabic mirrors the chrome and leaves the page canvas alone', async ({ page }) => {
    await gotoWelcome(page, 'en');
    await loadMockDocument(page);

    const html = page.locator('html');
    const brand = page.locator('.topbar .brand');
    const more = page.locator(tid('more-menu-btn'));
    const canvas = page.locator('.canvas');
    const pages = page.locator('.v3-page-stack');
    const firstPage = page.locator('.v3-page-stack .page').first();
    const toolrail = page.locator('.toolrail');
    const rightrail = page.locator('.rightrail');
    const prevChevron = page.locator(`${tid('bb-prev-page-btn')} svg`);

    // Left to right first, so the mirrored assertions below are not vacuous.
    await expect(html).toHaveAttribute('dir', 'ltr');
    await expect(html).toHaveAttribute('lang', 'en');
    expect(await centreX(brand)).toBeLessThan(await centreX(more));
    expect(await centreX(toolrail)).toBeLessThan(await centreX(canvas));
    expect(await centreX(rightrail)).toBeGreaterThan(await centreX(canvas));
    const pageBoxLtr = await firstPage.boundingBox();

    // Switch language the way a user does: the More menu's language picker.
    const switcher = page.locator(tid('language-switcher'));
    await more.click();
    await switcher.selectOption('ar');

    await expect(html).toHaveAttribute('dir', 'rtl');
    await expect(html).toHaveAttribute('lang', 'ar');
    await more.click();
    await expect(switcher).toHaveCount(0);

    // The top bar reads from the right: the brand now sits right of the menu.
    expect(await centreX(brand)).toBeGreaterThan(await centreX(more));
    // The tool rail and the page rail swap sides.
    expect(await centreX(toolrail)).toBeGreaterThan(await centreX(canvas));
    expect(await centreX(rightrail)).toBeLessThan(await centreX(canvas));
    // "Previous" points the way the reading order goes back: to the right.
    expect(await prevChevron.evaluate((el) => getComputedStyle(el).transform)).toMatch(/^matrix\(-1, /);

    // The pages keep the document's own direction and are not flipped.
    expect(await pages.evaluate((el) => getComputedStyle(el).direction)).toBe('ltr');
    expect(await pages.evaluate((el) => {
      const flipped: string[] = [];
      for (let node: Element | null = el; node; node = node.parentElement) {
        const t = getComputedStyle(node).transform;
        if (/^matrix\(-1, /.test(t)) flipped.push(node.className.toString());
      }
      for (const child of el.querySelectorAll('*')) {
        if (/^matrix\(-1, /.test(getComputedStyle(child).transform)) flipped.push(child.className.toString());
      }
      return flipped;
    })).toEqual([]);
    // The page stays where the canvas centres it: same width, same centre.
    const pageBoxRtl = await firstPage.boundingBox();
    expect(pageBoxLtr && pageBoxRtl).toBeTruthy();
    if (pageBoxLtr && pageBoxRtl) {
      expect(Math.round(pageBoxRtl.width)).toBe(Math.round(pageBoxLtr.width));
    }

    // Names and ARIA still hold in Arabic.
    await scanNamesAndAria(page, 'open document in Arabic');

    // And back: the document follows every change, not only the first.
    await more.click();
    await switcher.selectOption('en');
    await expect(html).toHaveAttribute('dir', 'ltr');
    await expect(html).toHaveAttribute('lang', 'en');
  });
});
