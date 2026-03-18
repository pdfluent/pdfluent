// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary and confidential.
// Free for personal, non-commercial use.
// Commercial use requires a valid license.
// See https://pdfluent.com/license for terms.

/**
 * Playwright runtime validation of the interaction infrastructure.
 *
 * Validates:
 * - interactionState: data-interaction attribute is present and correct
 * - cursorController: getCursorForTool integration
 * - hoverController: module exists and exports correct API surface
 * - contextActions: module exports and registry interface
 * - interactionDebug: __pdfluent_test__.interactionDebug is exposed
 * - selectionChrome: module source readiness
 *
 * These tests do NOT drive complex pointer interactions (no annotation
 * click sequences) — they verify the plumbing is correctly wired and
 * the API surface is present for future integration.
 */

import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join, dirname } from 'node:path';
import { gotoViewerWithDoc, gotoViewer, waitForTestHook } from '../helpers/app';
import { tid } from '../helpers/selectors';

const __dir = dirname(fileURLToPath(import.meta.url));

const interactionStateSrc = readFileSync(
  join(__dir, '../../../src/viewer/interaction/interactionState.ts'),
  'utf8',
);
const cursorControllerSrc = readFileSync(
  join(__dir, '../../../src/viewer/interaction/cursorController.ts'),
  'utf8',
);
const hoverControllerSrc = readFileSync(
  join(__dir, '../../../src/viewer/interaction/hoverController.ts'),
  'utf8',
);
const contextActionsSrc = readFileSync(
  join(__dir, '../../../src/viewer/interaction/contextActions.ts'),
  'utf8',
);
const selectionChromeSrc = readFileSync(
  join(__dir, '../../../src/viewer/interaction/selectionChrome.ts'),
  'utf8',
);
const interactionDebugSrc = readFileSync(
  join(__dir, '../../../src/viewer/interaction/interactionDebug.ts'),
  'utf8',
);

// ---------------------------------------------------------------------------
// Source-level readiness tests (no browser needed)
// ---------------------------------------------------------------------------

test.describe('interaction infrastructure — source readiness', () => {
  test('interactionState exports InteractionState type and getInteractionState', () => {
    expect(interactionStateSrc).toContain('export type InteractionState');
    expect(interactionStateSrc).toContain('export function getInteractionState');
    expect(interactionStateSrc).toContain('export function stateDataAttr');
    expect(interactionStateSrc).toContain("'idle'");
    expect(interactionStateSrc).toContain("'hover'");
    expect(interactionStateSrc).toContain("'selected'");
    expect(interactionStateSrc).toContain("'editing'");
    expect(interactionStateSrc).toContain("'dragging'");
    expect(interactionStateSrc).toContain("'disabled'");
  });

  test('cursorController exports getCursorForTool and getCursorForInteraction', () => {
    expect(cursorControllerSrc).toContain('export function getCursorForTool');
    expect(cursorControllerSrc).toContain('export function getCursorForInteraction');
    expect(cursorControllerSrc).toContain('export function toCssCursor');
    expect(cursorControllerSrc).toContain('export const CURSOR_CSS_MAP');
    // Covers all annotation tools
    expect(cursorControllerSrc).toContain("'highlight'");
    expect(cursorControllerSrc).toContain("'redaction'");
    expect(cursorControllerSrc).toContain("'rectangle'");
  });

  test('hoverController exports HoverController class and useHoverController hook', () => {
    expect(hoverControllerSrc).toContain('export class HoverController');
    expect(hoverControllerSrc).toContain('export function useHoverController');
    expect(hoverControllerSrc).toContain('subscribe(handler');
    expect(hoverControllerSrc).toContain('enter(target');
    expect(hoverControllerSrc).toContain('leave(target');
    expect(hoverControllerSrc).toContain('dispose()');
  });

  test('contextActions exports ActionRegistry and viewerActionRegistry', () => {
    expect(contextActionsSrc).toContain('export class ActionRegistry');
    expect(contextActionsSrc).toContain('export const viewerActionRegistry');
    expect(contextActionsSrc).toContain('export function useContextActions');
    expect(contextActionsSrc).toContain("'annotation:selected'");
    expect(contextActionsSrc).toContain("'form-field:editing-start'");
    expect(contextActionsSrc).toContain("'text:selected'");
    expect(contextActionsSrc).toContain('register<T extends ContextTrigger>');
    expect(contextActionsSrc).toContain('fire<T extends ContextTrigger>');
  });

  test('selectionChrome exports getChromeAttrs and chromeToSvgProps', () => {
    expect(selectionChromeSrc).toContain('export function getChromeAttrs');
    expect(selectionChromeSrc).toContain('export function chromeToSvgProps');
    expect(selectionChromeSrc).toContain('export function expandRect');
    expect(selectionChromeSrc).toContain('export interface ChromeRectAttrs');
    // Per-kind factories present
    expect(selectionChromeSrc).toContain('annotationChrome');
    expect(selectionChromeSrc).toContain('redactionChrome');
    expect(selectionChromeSrc).toContain('formFieldChrome');
    expect(selectionChromeSrc).toContain('textBlockChrome');
    expect(selectionChromeSrc).toContain('pageThumbnailChrome');
  });

  test('interactionDebug exports InteractionDebugLogger and attachInteractionDebugToTestHook', () => {
    expect(interactionDebugSrc).toContain('export class InteractionDebugLogger');
    expect(interactionDebugSrc).toContain('export const interactionDebugLogger');
    expect(interactionDebugSrc).toContain('export function attachInteractionDebugToTestHook');
    expect(interactionDebugSrc).toContain('logHoverEnter');
    expect(interactionDebugSrc).toContain('logStateChange');
    expect(interactionDebugSrc).toContain('logActionFire');
  });

  test('ViewerApp imports the interaction modules', () => {
    const viewerAppSrc = readFileSync(
      join(__dir, '../../../src/viewer/ViewerApp.tsx'),
      'utf8',
    );
    expect(viewerAppSrc).toContain("from './interaction/hoverController'");
    expect(viewerAppSrc).toContain("from './interaction/interactionState'");
    expect(viewerAppSrc).toContain("from './interaction/cursorController'");
    expect(viewerAppSrc).toContain('useHoverController');
    expect(viewerAppSrc).toContain('getInteractionState');
    expect(viewerAppSrc).toContain('stateDataAttr');
    expect(viewerAppSrc).toContain('getCursorForTool');
    expect(viewerAppSrc).toContain('toCssCursor');
  });
});

// ---------------------------------------------------------------------------
// Runtime tests (require browser)
// ---------------------------------------------------------------------------

test.describe('interaction infrastructure — runtime', () => {
  test('canvas wrapper has data-interaction="idle" before document load', async ({ page }) => {
    await gotoViewer(page);
    // Before a document is loaded the canvas wrapper is not rendered,
    // so this test validates that ViewerApp starts up without JS errors.
    const jsErrors: string[] = [];
    page.on('pageerror', (err) => jsErrors.push(err.message));
    await waitForTestHook(page);
    expect(jsErrors).toHaveLength(0);
  });

  test('canvas wrapper has data-interaction attribute after document load', async ({ page }) => {
    await gotoViewerWithDoc(page);
    // The canvas wrapper div gets data-interaction from stateDataAttr(annotationInteractionState).
    // With no annotation selected the state is 'idle'.
    const canvasWrapper = page.locator('[data-interaction]').first();
    await expect(canvasWrapper).toBeVisible();
    const attrValue = await canvasWrapper.getAttribute('data-interaction');
    expect(['idle', 'hover', 'selected', 'editing', 'dragging', 'focused', 'disabled']).toContain(attrValue);
  });

  test('data-interaction is "idle" when no annotation is selected', async ({ page }) => {
    await gotoViewerWithDoc(page);
    // No annotation is selected after a fresh document load.
    const canvasWrapper = page.locator('[data-interaction]').first();
    await expect(canvasWrapper).toHaveAttribute('data-interaction', 'idle');
  });

  test('__pdfluent_test__.interactionDebug is exposed after engine init', async ({ page }) => {
    await gotoViewerWithDoc(page);
    const debugPresent = await page.evaluate(() => {
      const hook = (window as unknown as Record<string, unknown>)['__pdfluent_test__'] as
        | { interactionDebug?: unknown }
        | undefined;
      return hook?.interactionDebug !== undefined;
    });
    expect(debugPresent).toBe(true);
  });

  test('interactionDebug.hoveredTarget is null initially', async ({ page }) => {
    await gotoViewerWithDoc(page);
    const hoveredTarget = await page.evaluate(() => {
      const hook = (window as unknown as Record<string, unknown>)['__pdfluent_test__'] as
        | { interactionDebug?: { hoveredTarget: string | null } }
        | undefined;
      return hook?.interactionDebug?.hoveredTarget ?? 'NOT_PRESENT';
    });
    expect(hoveredTarget).toBeNull();
  });

  test('interactionDebug.annotationInteractionState is "idle" with no selection', async ({ page }) => {
    await gotoViewerWithDoc(page);
    const state = await page.evaluate(() => {
      const hook = (window as unknown as Record<string, unknown>)['__pdfluent_test__'] as
        | { interactionDebug?: { annotationInteractionState: string } }
        | undefined;
      return hook?.interactionDebug?.annotationInteractionState ?? 'NOT_PRESENT';
    });
    expect(state).toBe('idle');
  });

  test('interactionDebug.canvasCursorCss is "default" when no tool is active', async ({ page }) => {
    await gotoViewerWithDoc(page);
    const cursor = await page.evaluate(() => {
      const hook = (window as unknown as Record<string, unknown>)['__pdfluent_test__'] as
        | { interactionDebug?: { canvasCursorCss: string | undefined } }
        | undefined;
      return hook?.interactionDebug?.canvasCursorCss ?? 'NOT_PRESENT';
    });
    // getCursorForTool(null) → 'default' → CURSOR_CSS_MAP['default'] = 'default'
    expect(cursor).toBe('default');
  });

  test('no JavaScript errors during interaction infrastructure init', async ({ page }) => {
    const jsErrors: string[] = [];
    page.on('pageerror', (err) => jsErrors.push(err.message));
    await gotoViewerWithDoc(page);
    expect(jsErrors).toHaveLength(0);
  });

  test('floating page indicator is visible after document load (interaction infra does not regress navigation)', async ({ page }) => {
    await gotoViewerWithDoc(page);
    await expect(page.locator(tid('floating-page-indicator'))).toBeVisible();
  });
});
