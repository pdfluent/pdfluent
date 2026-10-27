// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary. The PDFluent application is free to use,
// including for commercial purposes. Redistribution, or extraction or reuse
// of its components (including the embedded PDF engine), requires a licence.
// See https://pdfluent.com/license for terms.

// What a person does in the V3 shell, as steps a journey can take. Selectors
// are test ids where the shell has them, and otherwise the English label a
// person reads (the suite starts the app with PDFLUENT_E2E_LANG=en). A label
// that changes breaks a journey on purpose: it is what the user clicks.

import type { Journey } from './journey';

/** What the steps below need of a journey; the screenshot scenes supply the same. */
export type UiCtx = Pick<Journey, 's' | 'waitFor' | 'invoke' | 'answerDialog' | 'answerNativeDialogs'>;

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Click the first visible `selector` whose text is `text` (or contains it). */
export async function clickText(j: UiCtx, selector: string, text: string, exact = true): Promise<void> {
  const target = await j.s.call<string>('findText', selector, text, exact);
  await j.s.click(target);
}

export async function clickAria(j: UiCtx, label: string): Promise<void> {
  await j.s.click(`[aria-label="${label}"]`);
}

/** The top-bar work mode tabs: All tools, Edit, Convert, Sign. */
export async function openMode(j: UiCtx, label: 'All tools' | 'Edit' | 'Convert' | 'Sign'): Promise<void> {
  const active = await j.s.call<string[]>('texts', '.menu-tab.active');
  if (!active.includes(label)) await clickText(j, '.menu-tab', label);
  const until = Date.now() + 10_000;
  while (!(await j.s.call<string[]>('texts', '.menu-tab.active')).includes(label)) {
    if (Date.now() > until) throw new Error(`the ${label} tab did not become active`);
    await sleep(100);
  }
}

/** The All tools panel open: attachments and the comment list live in it. */
export async function openAllToolsPanel(j: UiCtx): Promise<void> {
  await openMode(j, 'All tools');
  if ((await j.s.call<number>('count', '.tool-row')) === 0) {
    // The tab is active but its panel was closed: a second click opens it.
    await clickText(j, '.menu-tab', 'All tools');
  }
  await j.waitFor('.tool-row');
}

/** A tool from the All tools panel, by its title ("Organize pages", "Redact", ...). */
export async function openTool(j: UiCtx, title: string): Promise<void> {
  await openMode(j, 'All tools');
  if ((await j.s.call<number>('count', '.tool-row')) === 0) {
    // The tab is active but its panel was closed: a second click opens it.
    await clickText(j, '.menu-tab', 'All tools');
  }
  await j.waitFor('.tool-row');
  await clickText(j, '.tool-row', title, false);
}

/** Organize pages → rotate page `index` right. A real edit that marks the document dirty. */
export async function rotatePageRight(j: UiCtx, index = 0): Promise<void> {
  if (!(await j.s.call<boolean>('visible', `[data-testid="organize-rotate-right-${index}"]`))) {
    await openTool(j, 'Organize pages');
    await j.waitFor(`[data-testid="organize-rotate-right-${index}"]`);
  }
  await j.s.click(`[data-testid="organize-rotate-right-${index}"]`);
  await waitDirty(j, true);
}

export async function waitDirty(j: UiCtx, dirty: boolean, timeout = 10_000): Promise<void> {
  const until = Date.now() + timeout;
  for (;;) {
    const shown = await j.s.call<boolean>('exists', '.dirty-dot');
    if (shown === dirty) return;
    if (Date.now() > until) throw new Error(`the unsaved marker is ${shown ? 'still shown' : 'not shown'} after ${timeout} ms`);
    await sleep(100);
  }
}

/** The top bar's Save button; waits until the unsaved marker is gone. */
export async function save(j: UiCtx): Promise<void> {
  await j.s.click('[data-testid="save-btn"]');
  await waitDirty(j, false, 30_000);
}

/** Share → Save As…, answering the native save panel with `dest`. */
export async function saveAs(j: UiCtx, dest: string | null): Promise<void> {
  await j.answerNativeDialogs(dest);
  // After a Save As that failed the menu is still open; a second click on the
  // trigger would close it.
  if (!(await j.s.call<boolean>('visible', '[data-testid="save-as-btn"]'))) await j.s.click('.share-trigger');
  await j.waitFor('[data-testid="save-as-btn"]');
  await j.s.click('[data-testid="save-as-btn"]');
}

/** An application-menu item (File → Open, Quit, ...) the way the menu bar triggers it. */
export async function menu(j: UiCtx, id: string): Promise<void> {
  await j.invoke('e2e_menu', { id });
}

/** What the title bar's close button does. */
export async function closeWindow(j: UiCtx): Promise<void> {
  await j.invoke('plugin:window|close', { label: 'main' });
}

/** File → Open… answered with `path`. */
export async function openViaMenu(j: UiCtx, path: string): Promise<void> {
  await j.answerDialog('open', path);
  await menu(j, 'file_open');
}

export async function pageCount(j: UiCtx): Promise<number> {
  return j.s.call<number>('count', 'button.thumb');
}

export async function waitForPages(j: UiCtx, n: number, timeout = 30_000): Promise<void> {
  const until = Date.now() + timeout;
  for (;;) {
    const got = await pageCount(j);
    if (got === n) return;
    if (Date.now() > until) throw new Error(`expected ${n} pages on screen, the app shows ${got}`);
    await sleep(150);
  }
}

export async function title(j: UiCtx): Promise<string> {
  return (await j.s.call<{ title: string }>('ping')).title;
}

/** Wait until the window title names `fileName`. */
export async function waitTitle(j: UiCtx, fileName: string, timeout = 30_000): Promise<void> {
  const until = Date.now() + timeout;
  for (;;) {
    const t = await title(j);
    if (t.includes(fileName)) return;
    if (Date.now() > until) throw new Error(`the window title is "${t}", expected it to name ${fileName}`);
    await sleep(150);
  }
}

/** The text of every visible toast / task-bar message, for error assertions. */
export async function messages(j: UiCtx): Promise<string> {
  return j.s.call<string>('bodyText');
}

/** What the first rendered page shows right now (see `canvasDigest` in page-agent.js). */
export async function pageDigest(j: UiCtx): Promise<string | null> {
  return j.s.call<string | null>('canvasDigest', '[data-testid="rendered-page"]');
}

/** The first rendered page once it has stopped changing: two equal fingerprints in a row. */
export async function settledPageDigest(j: UiCtx, timeout = 15_000): Promise<string> {
  const until = Date.now() + timeout;
  let last: string | null = null;
  for (;;) {
    const now = await pageDigest(j);
    if (now !== null && now === last) return now;
    last = now;
    if (Date.now() > until) throw new Error(`the page on screen did not settle within ${timeout} ms`);
    await sleep(300);
  }
}

/**
 * Wait until the first rendered page shows something other than `before`,
 * without the zoom or the page being touched. A document edit that reaches the
 * file but not the picture (a stale page render) fails here.
 */
export async function waitForPageToChange(j: UiCtx, before: string | null, timeout = 15_000): Promise<string> {
  const until = Date.now() + timeout;
  for (;;) {
    const now = await pageDigest(j);
    if (now !== null && now !== before) return now;
    if (Date.now() > until) throw new Error(`the page on screen did not change within ${timeout} ms (still ${String(now)})`);
    await sleep(200);
  }
}

export async function waitForText(j: UiCtx, needle: string | RegExp, timeout = 20_000): Promise<string> {
  const until = Date.now() + timeout;
  for (;;) {
    const body = await messages(j);
    if (typeof needle === 'string' ? body.includes(needle) : needle.test(body)) return body;
    if (Date.now() > until) throw new Error(`"${String(needle)}" did not appear on screen within ${timeout} ms`);
    await sleep(200);
  }
}

/** Type `text` into a field the way a person does: focus it, clear it, type. */
export async function fill(j: UiCtx, selector: string, text: string): Promise<void> {
  await j.s.call('setValue', selector, '');
  await j.s.click(selector);
  await j.s.call('focus', selector);
  await j.s.type(text);
  const got = await j.s.call<string>('value', selector);
  if (got !== text) throw new Error(`${selector} holds ${JSON.stringify(got)} after typing ${JSON.stringify(text)}`);
}

/** All tools > Document properties: set title and author, then Save properties. */
export async function setProperties(j: UiCtx, docTitle: string, author: string): Promise<void> {
  await openTool(j, 'Document properties');
  await j.waitFor('[aria-label="Title"]');
  await fill(j, '[aria-label="Title"]', docTitle);
  await fill(j, '[aria-label="Author"]', author);
  await clickText(j, '.panel button', 'Save properties', false);
  const body = await waitForText(j, /Properties saved|Could not save properties/, 20_000);
  if (body.includes('Could not save properties')) throw new Error('the app could not save the properties');
}

/** Double-click the first text span containing `text` and replace the line with `replacement`. */
export async function editLine(j: UiCtx, text: string, replacement: string): Promise<void> {
  const span = await j.s.call<string>('findText', '[data-testid="text-span"]', text, false);
  await j.s.doubleClick(span);
  await j.waitFor('[data-testid="text-inline-editor"]');
  await j.s.call('selectAll', '[data-testid="text-inline-editor"]');
  await j.s.type(replacement);
}

/** Wait until `file` exists and has stopped growing. */
export async function waitForFile(file: string, timeout = 60_000): Promise<void> {
  const { existsSync, statSync } = await import('node:fs');
  const until = Date.now() + timeout;
  let last = -1;
  for (;;) {
    if (existsSync(file)) {
      const size = statSync(file).size;
      if (size > 0 && size === last) return;
      last = size;
    }
    if (Date.now() > until) throw new Error(`${file} was not written within ${timeout} ms`);
    await sleep(300);
  }
}
