// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary. The PDFluent application is free to use,
// including for commercial purposes. Redistribution, or extraction or reuse
// of its components (including the embedded PDF engine), requires a licence.
// See https://pdfluent.com/license for terms.

import type { Page } from '@playwright/test';
import { expect } from '@playwright/test';

interface BoundingBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Retrieve a bounding box for a selector, failing immediately if not found. */
export async function getBoundingBoxOrFail(page: Page, selector: string): Promise<BoundingBox> {
  const box = await page.locator(selector).first().boundingBox();
  expect(box, `Expected element "${selector}" to have a bounding box`).not.toBeNull();
  return box!;
}

/** Assert that two elements' bounding boxes do not overlap. */
export async function assertNoOverlap(page: Page, selectorA: string, selectorB: string): Promise<void> {
  const a = await getBoundingBoxOrFail(page, selectorA);
  const b = await getBoundingBoxOrFail(page, selectorB);

  const overlapX = a.x < b.x + b.width && a.x + a.width > b.x;
  const overlapY = a.y < b.y + b.height && a.y + a.height > b.y;

  expect(
    overlapX && overlapY,
    `Elements "${selectorA}" and "${selectorB}" overlap: A(${a.x},${a.y},${a.width}×${a.height}) B(${b.x},${b.y},${b.width}×${b.height})`,
  ).toBe(false);
}

/** Assert that a child element is fully contained within a parent element. */
export async function assertContainedWithin(page: Page, childSelector: string, parentSelector: string): Promise<void> {
  const child = await getBoundingBoxOrFail(page, childSelector);
  const parent = await getBoundingBoxOrFail(page, parentSelector);

  const contained =
    child.x >= parent.x - 1 &&
    child.y >= parent.y - 1 &&
    child.x + child.width <= parent.x + parent.width + 1 &&
    child.y + child.height <= parent.y + parent.height + 1;

  expect(
    contained,
    `Child "${childSelector}" (${child.x},${child.y},${child.width}×${child.height}) is not contained within parent "${parentSelector}" (${parent.x},${parent.y},${parent.width}×${parent.height})`,
  ).toBe(true);
}

/** Assert that an element has no horizontal overflow (scrollWidth ≤ clientWidth). */
export async function assertNoOverflow(page: Page, selector: string): Promise<void> {
  const overflow = await page.locator(selector).first().evaluate((el) => ({
    scrollWidth: el.scrollWidth,
    clientWidth: el.clientWidth,
    scrollHeight: el.scrollHeight,
    clientHeight: el.clientHeight,
  }));

  expect(
    overflow.scrollWidth,
    `Element "${selector}" has horizontal overflow: scrollWidth(${overflow.scrollWidth}) > clientWidth(${overflow.clientWidth})`,
  ).toBeLessThanOrEqual(overflow.clientWidth + 1);
}

/** Assert that an element meets a minimum rendered size. */
export async function assertMinimumSize(
  page: Page,
  selector: string,
  minWidth: number,
  minHeight: number,
): Promise<void> {
  const box = await getBoundingBoxOrFail(page, selector);

  expect(
    box.width,
    `Element "${selector}" width ${box.width}px is less than minimum ${minWidth}px`,
  ).toBeGreaterThanOrEqual(minWidth);

  expect(
    box.height,
    `Element "${selector}" height ${box.height}px is less than minimum ${minHeight}px`,
  ).toBeGreaterThanOrEqual(minHeight);
}

/** Assert that an <img> element has loaded successfully (naturalWidth > 0). */
export async function assertImageLoaded(page: Page, selector: string): Promise<void> {
  const result = await page.locator(selector).first().evaluate((el) => {
    if (el instanceof HTMLImageElement) {
      return { natural: el.naturalWidth, complete: el.complete };
    }
    return { natural: -1, complete: false };
  });

  expect(
    result.complete,
    `Image "${selector}" did not finish loading`,
  ).toBe(true);

  expect(
    result.natural,
    `Image "${selector}" has naturalWidth ${result.natural} — broken or invalid source`,
  ).toBeGreaterThan(0);
}

/** Assert that the <body> has no horizontal scrollbar. */
export async function assertNoHorizontalScrollbar(page: Page): Promise<void> {
  const overflow = await page.evaluate(() => ({
    scrollWidth: document.body.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }));

  expect(
    overflow.scrollWidth,
    `Body has horizontal scrollbar: scrollWidth(${overflow.scrollWidth}) > clientWidth(${overflow.clientWidth})`,
  ).toBeLessThanOrEqual(overflow.clientWidth + 1);
}
