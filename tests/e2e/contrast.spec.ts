// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary. The PDFluent application is free to use,
// including for commercial purposes. Redistribution, or extraction or reuse
// of its components (including the embedded PDF engine), requires a licence.
// See https://pdfluent.com/license for terms.
//
// Contrast gate, measured on the rendered page (WCAG 2.2 AA: 4.5:1 text, 3:1
// large text and UI components).
//
// Two things were wrong with the earlier dark-mode gate in accessibility.spec.ts:
//  - it scanned only what is on screen when a document opens, so a banner that
//    appears for one kind of document (form scripts, XFA, a rejected edit, an
//    update) was never measured; the owner found one by eye;
//  - it ran with the OS in dark mode only. Choosing "dark" in Settings on a
//    light OS is a different page: the shadcn/Tailwind tokens flip on a `.dark`
//    class that nothing set.
//
// So every theme is reached both ways (OS preference, Settings preference), the
// notices are mounted in a dev gallery (/?notice-gallery, built from the real
// components), and the menus, palette and dialogs are opened and measured.
// Each state gets axe's color-contrast rule AND the sweep in
// helpers/contrastSweep.ts, which resolves translucent backgrounds itself where
// axe gives up ("incomplete") and passes.

import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from './helpers/guarded-test';

import { gotoViewer, loadMockDocument } from './helpers/app';
import { describeFindings, sweepContrast } from './helpers/contrastSweep';

type Theme = 'light' | 'dark';
type Driver = 'os' | 'setting';

const COMBOS: Array<{ theme: Theme; driver: Driver }> = [
  { theme: 'light', driver: 'os' },
  { theme: 'dark', driver: 'os' },
  // The OS says the opposite of what Settings says: Settings wins.
  { theme: 'light', driver: 'setting' },
  { theme: 'dark', driver: 'setting' },
];

const SETTINGS_KEY = 'pdfluent.app.settings';

async function setTheme(page: Page, theme: Theme, driver: Driver): Promise<void> {
  if (driver === 'os') {
    await page.emulateMedia({ colorScheme: theme, reducedMotion: 'reduce' });
    return;
  }
  await page.emulateMedia({ colorScheme: theme === 'dark' ? 'light' : 'dark', reducedMotion: 'reduce' });
  await page.addInitScript(
    ([key, pref]) => {
      localStorage.setItem(key!, JSON.stringify({ themePreference: pref }));
    },
    [SETTINGS_KEY, theme],
  );
}

async function expectRootTheme(page: Page, theme: Theme): Promise<void> {
  const cls = await page.evaluate(() => document.documentElement.className);
  const dark = /\btheme-dark\b/.test(cls);
  expect(dark, `<html class="${cls}"> must say ${theme}`).toBe(theme === 'dark');
  // The shadcn tokens and Tailwind dark: variants key on `.dark`.
  expect(/(^|\s)dark(\s|$)/.test(cls), `<html class="${cls}"> must carry .dark exactly when dark`).toBe(theme === 'dark');
}

async function measure(page: Page, label: string): Promise<void> {
  // A surface mid-fade is measured at half strength and fails for no reason
  // (the palette footer read 2.6:1 at 30% opacity). Wait for every animation.
  await page.evaluate(() => Promise.all(document.getAnimations().map((a) => a.finished.catch(() => undefined))));
  const axe = await new AxeBuilder({ page }).withRules(['color-contrast']).analyze();
  const axeFails = axe.violations.flatMap((v) =>
    v.nodes.map((n) => `${n.target.join(' ')}  ${n.any[0]?.message ?? v.help}`),
  );
  const sweep = await sweepContrast(page);
  expect(sweep.measured, `${label}: the sweep measured nothing`).toBeGreaterThan(3);
  expect(
    axeFails,
    `axe color-contrast failed in ${label}:\n  ${axeFails.slice(0, 12).join('\n  ')}`,
  ).toEqual([]);
  expect(
    sweep.failures,
    `contrast sweep failed in ${label} (${sweep.failures.length}):\n${describeFindings(sweep)}`,
  ).toEqual([]);
}

const GALLERY_SAMPLE_TOAST = "the notice gallery shows every error toast on purpose, so their colours can be measured; the sample 'Export failed' toast is not an error of the app";

for (const { theme, driver } of COMBOS) {
  const where = `${theme} (${driver})`;

  test.describe(`contrast, ${where}`, () => {
    test.beforeEach(async ({ page }) => {
      await setTheme(page, theme, driver);
    });

    test('every document notice and toast in the gallery', async ({ page, allowFaults }) => {
      allowFaults({ kind: 'error-toast', command: 'export', reason: GALLERY_SAMPLE_TOAST });
      await page.goto(`/?notice-gallery&theme=${theme}`);
      await page.locator('[data-testid="notice-gallery"]').waitFor();
      // The gallery fixes its theme; the other half of the matrix is the app.
      await measure(page, `notice gallery, ${where}`);
    });

    for (const dialog of ['recovery', 'password', 'password-retry', 'unsaved', 'signed']) {
      test(`dialog: ${dialog}`, async ({ page, allowFaults }) => {
        allowFaults({ kind: 'error-toast', command: 'export', reason: GALLERY_SAMPLE_TOAST });
        await page.goto(`/?notice-gallery&theme=${theme}&dialog=${dialog}`);
        await page.locator('[role="dialog"], [role="alertdialog"], [data-testid$="-dialog"]').first().waitFor();
        await measure(page, `${dialog} dialog, ${where}`);
      });
    }

    test('the root carries the theme classes', async ({ page }) => {
      await gotoViewer(page);
      await expectRootTheme(page, theme);
    });

    test('empty state', async ({ page }) => {
      await gotoViewer(page);
      await measure(page, `empty state, ${where}`);
    });

    test('document open, with the surfaces a person opens', async ({ page }) => {
      // Every surface is opened and measured with axe and the sweep: well over the
      // 30 s default on a shared runner (30 s timeouts in CI, 20-10-2026).
      test.setTimeout(180_000);
      await gotoViewer(page);
      await loadMockDocument(page);
      await measure(page, `open document, ${where}`);

      // Each surface is opened, measured, closed. A surface that does not open
      // fails the test: a gate that quietly skips what it cannot reach measures
      // nothing.
      const surfaces: Array<{ name: string; open: () => Promise<void>; ready: string; close: () => Promise<void> }> = [
        {
          name: 'more menu',
          open: () => page.locator('[data-testid="more-menu-btn"]').click(),
          ready: '.dd-item',
          close: () => page.keyboard.press('Escape'),
        },
        {
          name: 'share menu',
          open: () => page.getByRole('button', { name: 'Delen' }).click(),
          ready: '.dd-item',
          close: () => page.keyboard.press('Escape'),
        },
        {
          name: 'search bar',
          open: () => page.locator('[data-testid="search-btn"]').click(),
          ready: '[data-testid="v3-search-input"]',
          close: () => page.keyboard.press('Escape'),
        },
        {
          name: 'command palette',
          open: () => page.keyboard.press('Meta+k'),
          ready: '[data-testid="command-palette"]',
          close: () => page.keyboard.press('Escape'),
        },
        {
          name: 'all tools',
          open: () => page.locator('[data-testid="all-tools-btn"]').click(),
          ready: '[data-testid="all-tools-btn"][aria-expanded="true"], [data-testid="all-tools-panel"], [role="dialog"]',
          close: () => page.keyboard.press('Escape'),
        },
        {
          name: 'zoom presets',
          open: () => page.locator('[data-testid="zoom-reset-btn"]').click(),
          ready: '[role="menu"], [role="listbox"], [data-testid="zoom-presets"], .zoom-pop, .dd-item',
          close: () => page.keyboard.press('Escape'),
        },
      ];
      for (const s of surfaces) {
        await s.open();
        await page.locator(s.ready).first().waitFor({ state: 'visible', timeout: 20_000 });
        await measure(page, `${s.name}, ${where}`);
        await s.close();
      }

      // The About dialog, through the more menu.
      if (!(await page.locator('.topbar-more-menu').isVisible())) {
        await page.locator('[data-testid="more-menu-btn"]').click();
      }
      await page.locator('.topbar-more-menu .dd-item').filter({ hasText: /^(Over|About)$/ }).click();
      await page.locator('div[style*="z-index: 62"]').first().waitFor({ state: 'visible', timeout: 20_000 });
      await measure(page, `about dialog, ${where}`);
      await page.keyboard.press('Escape');

      // The settings panel, through the command palette.
      await page.keyboard.press('Meta+k');
      await page.locator('[data-testid="command-palette-input"]').waitFor({ state: 'visible', timeout: 20_000 });
      await page.locator('[data-testid="command-palette-input"]').fill('instellingen');
      await page.keyboard.press('Enter');
      await page.locator('[data-testid="settings-panel"]').waitFor({ state: 'visible', timeout: 20_000 });
      await measure(page, `settings panel, ${where}`);
    });

    test('mode tabs: edit, convert, sign', async ({ page }) => {
      await gotoViewer(page);
      await loadMockDocument(page);
      for (const name of ['Bewerken', 'Converteren', 'Ondertekenen']) {
        await page.getByRole('button', { name, exact: true }).click();
        await measure(page, `${name} mode, ${where}`);
      }
    });

    test('keyboard focus ring is 3:1 against what it sits on', async ({ page }) => {
      await gotoViewer(page);
      await loadMockDocument(page);
      const bad: string[] = [];
      for (let i = 0; i < 14; i++) {
        await page.keyboard.press('Tab');
        // The ring may transition in; read it once it has arrived.
        await page.evaluate(() => Promise.all(document.getAnimations().map((a) => a.finished.catch(() => undefined))));
        const r = await page.evaluate(() => {
          const el = document.activeElement as HTMLElement | null;
          if (!el || el === document.body) return null;
          const cs = getComputedStyle(el);
          const parse = (c: string): number[] | null => {
            const m = /rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)(?:[,\s/]+([\d.]+))?/.exec(c);
            return m ? [Number(m[1]), Number(m[2]), Number(m[3]), m[4] === undefined ? 1 : Number(m[4])] : null;
          };
          const lum = (c: number[]): number => {
            const l = c.slice(0, 3).map((v) => { const x = v / 255; return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4; });
            return 0.2126 * l[0]! + 0.7152 * l[1]! + 0.0722 * l[2]!;
          };
          let ring = parse(cs.outlineColor);
          if (!ring || cs.outlineStyle === 'none' || parseFloat(cs.outlineWidth) === 0) {
            // A focus ring drawn as a box-shadow: the first coloured shadow.
            const m = /(rgba?\([^)]*\))\s+0px\s+0px\s+0px\s+[\d.]+px/.exec(cs.boxShadow) ?? /(rgba?\([^)]*\))/.exec(cs.boxShadow);
            ring = m ? parse(m[1]!) : null;
          }
          if (!ring) return { name: el.getAttribute('aria-label') ?? el.textContent?.trim().slice(0, 20) ?? el.tagName, ratio: 0 };
          let bg: number[] = [255, 255, 255, 1];
          const layers: number[][] = [];
          for (let n: Element | null = el.parentElement; n; n = n.parentElement) {
            const b = parse(getComputedStyle(n).backgroundColor);
            if (b && b[3] > 0) { layers.push(b); if (b[3] >= 1) break; }
          }
          for (let k = layers.length - 1; k >= 0; k--) {
            const t = layers[k]!;
            bg = [0, 1, 2].map((q) => t[q]! * t[3]! + bg[q]! * (1 - t[3]!)).concat(1);
          }
          const a = lum(ring);
          const b = lum(bg);
          return { name: el.getAttribute('aria-label') ?? el.textContent?.trim().slice(0, 20) ?? el.tagName, ratio: (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05) };
        });
        if (r && r.ratio < 3) bad.push(`${r.ratio.toFixed(2)}:1  ${r.name}`);
      }
      expect(bad, `focus ring under 3:1 in ${where}`).toEqual([]);
    });

    test('the brand mark square is 3:1 against its bar, the P 4.5:1 against the square', async ({ page }) => {
      await gotoViewer(page);
      const r = await page.evaluate(() => {
        const mark = document.querySelector('.pfv3 .brand-mark') as HTMLElement | null;
        if (!mark) return null;
        const parse = (c: string): number[] => {
          const m = /rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)(?:[,\s/]+([\d.]+))?/.exec(c)!;
          return [Number(m[1]), Number(m[2]), Number(m[3]), m[4] === undefined ? 1 : Number(m[4])];
        };
        const lum = (c: number[]): number => {
          const l = c.slice(0, 3).map((v) => { const x = v / 255; return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4; });
          return 0.2126 * l[0]! + 0.7152 * l[1]! + 0.0722 * l[2]!;
        };
        const ratio = (a: number[], b: number[]): number => (Math.max(lum(a), lum(b)) + 0.05) / (Math.min(lum(a), lum(b)) + 0.05);
        const square = parse(getComputedStyle(mark).backgroundColor);
        let bar: number[] = [255, 255, 255, 1];
        for (let n: Element | null = mark.parentElement; n; n = n.parentElement) {
          const b = parse(getComputedStyle(n).backgroundColor);
          if (b[3] >= 1) { bar = b; break; }
        }
        return { squareVsBar: ratio(square, bar), pVsSquare: ratio(parse(getComputedStyle(mark).color), square) };
      });
      expect(r, 'the brand mark was not found in the top bar').not.toBeNull();
      expect(r!.squareVsBar, `mark square vs top bar, ${where}`).toBeGreaterThanOrEqual(3);
      expect(r!.pVsSquare, `P vs mark square, ${where}`).toBeGreaterThanOrEqual(4.5);
    });
  });
}
