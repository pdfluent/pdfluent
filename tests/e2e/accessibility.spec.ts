// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary. The PDFluent application is free to use,
// including for commercial purposes. Redistribution, or extraction or reuse
// of its components (including the embedded PDF engine), requires a licence.
// See https://pdfluent.com/license for terms.
//
// Accessibility gate (plan §3): "every toolbar control has a name, full
// keyboard path, axe-clean shell".
//
// Before this spec the evidence for that promise was 132 aria-labels counted by
// grep. A count is not a check: it says how many controls someone remembered to
// label, never which ones were forgotten, and it cannot see a contrast failure
// or a button whose only content is an icon.
//
// Two states are scanned, because they are different pages: the empty state a
// first run lands on, and the shell with a document open, where the toolbars,
// the rail and the page canvas exist.
//
// Serious and critical violations fail. Minor and moderate are reported in the
// message of a failure but do not fail on their own -- a gate nobody can get
// green gets switched off, and these two levels are where the disagreements
// live.

import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

import { gotoViewer, loadMockDocument } from './helpers/app';

const BLOCKING = new Set(['serious', 'critical']);

async function scan(page: Page, state: string): Promise<void> {
  const results = await new AxeBuilder({ page })
    // The three rule sets a desktop application is judged by. Best-practice
    // rules are deliberately excluded: they are advice, not conformance.
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze();

  const blocking = results.violations.filter((v) => BLOCKING.has(v.impact ?? ''));
  const rest = results.violations.filter((v) => !BLOCKING.has(v.impact ?? ''));

  const describe = (list: typeof results.violations): string =>
    list
      .map(
        (v) =>
          `  [${v.impact}] ${v.id}: ${v.help}\n` +
          v.nodes.slice(0, 4).map((n) => `      ${n.target.join(' ')}`).join('\n'),
      )
      .join('\n');

  // Compared as short strings, not as the raw violation objects: a failing
  // toEqual on those prints 150 lines of axe internals and buries the three
  // words that say what is wrong.
  expect(
    blocking.map((v) => `${v.id} (${v.nodes.length} node(s))`),
    `axe found ${blocking.length} serious/critical violation(s) in the ${state}:\n` +
      `${describe(blocking)}\n` +
      (rest.length ? `also present, not blocking:\n${describe(rest)}\n` : ''),
  ).toEqual([]);
}

test('the empty state is axe-clean', async ({ page }) => {
  await gotoViewer(page);
  await scan(page, 'empty state');
});

test('the shell with a document open is axe-clean', async ({ page }) => {
  await gotoViewer(page);
  await loadMockDocument(page);
  await scan(page, 'open document');
});

// axe checks that a control which HAS a name has a usable one. It does not walk
// the toolbars and ask whether each one has a name at all -- an icon button
// with no label is reported only through rules that need it to be focusable and
// visible, and one hidden behind a collapsed panel slips past. This does that
// walk explicitly, over the chrome a person uses to drive the app.
test('every toolbar control has an accessible name', async ({ page }) => {
  await gotoViewer(page);
  await loadMockDocument(page);

  const nameless = await page.evaluate(() => {
    // The chrome: top bar, left rail, the read bar under the page, and any
    // open panel header. Not the page canvas -- annotation handles are drawn,
    // not controls.
    const containers = document.querySelectorAll(
      '.topbar, .menu-tabs, .toolrail, .rightrail, .bottombar, .panel-head, .thumbs-head',
    );
    const missing: string[] = [];
    for (const container of containers) {
      const controls = container.querySelectorAll('button, [role="button"], a[href], select');
      for (const el of controls) {
        const style = getComputedStyle(el);
        if (style.display === 'none' || style.visibility === 'hidden') continue;
        const name =
          el.getAttribute('aria-label')?.trim() ||
          (el.getAttribute('aria-labelledby')
            ? document.getElementById(el.getAttribute('aria-labelledby') as string)?.textContent?.trim()
            : '') ||
          el.getAttribute('title')?.trim() ||
          (el.textContent ?? '').trim();
        if (!name) {
          const id = el.getAttribute('data-testid') ?? el.className ?? el.tagName;
          missing.push(`${el.tagName.toLowerCase()} ${id}`);
        }
      }
    }
    return missing;
  });

  expect(
    nameless,
    `these controls in the app chrome have no accessible name -- a screen reader ` +
      `announces them as "button":\n  ${nameless.join('\n  ')}`,
  ).toEqual([]);
});
