// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary. The PDFluent application is free to use,
// including for commercial purposes. Redistribution, or extraction or reuse
// of its components (including the embedded PDF engine), requires a licence.
// See https://pdfluent.com/license for terms.

// Documents open fitted to the window (src/viewer/zoom/fitZoom.ts): the zoom
// calculation, the Default zoom setting, the hook that applies the fit and
// follows the window, and what a tab restores.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { reactForHooks } from '../src/viewer/hooks/__tests__/hookHarness';

vi.mock('react', async (orig) => reactForHooks(await orig()));

import {
  FIT_MAX_ZOOM,
  MIN_ZOOM,
  VIEWPORT_INSETS,
  autoFit,
  fitPageZoom,
  fitWidthZoom,
  isDefaultZoom,
  resolveZoom,
  type Size,
} from '../src/viewer/zoom/fitZoom';
import { DEFAULT_APP_SETTINGS, SETTINGS_STORAGE_KEY, loadAppSettings } from '../src/viewer/state/appSettings';
import { isZoomManual } from '../src/viewer/hooks/useZoomControls';
import { useAutoFitZoom } from '../src/viewer/hooks/useAutoFitZoom';

const LETTER: Size = { width: 612, height: 792 };
const A4: Size = { width: 595, height: 842 };
const A4_LANDSCAPE: Size = { width: 842, height: 595 };
const SLIDE: Size = { width: 960, height: 540 };

const gutter = 2 * VIEWPORT_INSETS.x;

describe('fit width', () => {
  it('fills the canvas minus the gutter, rounded down to 1%', () => {
    const viewport = { width: 1200, height: 900 };
    const zoom = fitWidthZoom(LETTER, viewport)!;
    expect(zoom).toBe(Math.floor(((1200 - gutter) / 612) * 100) / 100);
    expect(LETTER.width * zoom).toBeLessThanOrEqual(viewport.width - gutter);
  });

  it('is capped at 200% so a narrow page does not become enormous', () => {
    expect(FIT_MAX_ZOOM).toBe(2);
    expect(fitWidthZoom({ width: 200, height: 300 }, { width: 1800, height: 1000 })).toBe(2);
  });

  it('is floored at 25% for a huge page in a small window', () => {
    expect(fitWidthZoom({ width: 20000, height: 20000 }, { width: 400, height: 400 })).toBe(MIN_ZOOM);
  });

  it('a window narrower than the gutter gives the minimum, not a negative zoom', () => {
    expect(fitWidthZoom(LETTER, { width: 30, height: 500 })).toBe(MIN_ZOOM);
  });

  it('says nothing before anything is laid out', () => {
    expect(fitWidthZoom(LETTER, { width: 0, height: 0 })).toBeNull();
    expect(fitWidthZoom({ width: 0, height: 0 }, { width: 800, height: 600 })).toBeNull();
    expect(fitWidthZoom(LETTER, { width: Number.NaN, height: 600 })).toBeNull();
  });
});

describe('fit page', () => {
  it('shows the whole page: the smaller of the width fit and the height fit', () => {
    const viewport = { width: 1600, height: 700 };
    const zoom = fitPageZoom(LETTER, viewport)!;
    const room = viewport.height - VIEWPORT_INSETS.top - VIEWPORT_INSETS.bottom;
    expect(LETTER.height * zoom).toBeLessThanOrEqual(room);
    expect(zoom).toBe(Math.floor((room / 792) * 100) / 100);
  });

  it('equals fit width when the width is the tight side', () => {
    const viewport = { width: 500, height: 3000 };
    expect(fitPageZoom(LETTER, viewport)).toBe(fitWidthZoom(LETTER, viewport));
  });

  it('is capped at 200%', () => {
    expect(fitPageZoom({ width: 100, height: 100 }, { width: 3000, height: 3000 })).toBe(2);
  });
});

describe('the automatic rule: fit width, or fit page where that is clearly better', () => {
  it('portrait page in a large window: fit width (the page is read by scrolling)', () => {
    const fit = autoFit(A4, { width: 1400, height: 900 })!;
    expect(fit.kind).toBe('fit-width');
    expect(fit.zoom).toBe(fitWidthZoom(A4, { width: 1400, height: 900 }));
  });

  it('portrait page in a small window: fit width, because fit page would shrink it too far', () => {
    const viewport = { width: 1000, height: 560 };
    const fit = autoFit(A4, viewport)!;
    expect(fit.kind).toBe('fit-width');
  });

  it('portrait page in a wide, tall window: fit width when the whole page already fits', () => {
    const viewport = { width: 500, height: 1400 };
    const fit = autoFit(LETTER, viewport)!;
    expect(fit.kind).toBe('fit-width');
    expect(LETTER.height * fit.zoom).toBeLessThanOrEqual(viewport.height - VIEWPORT_INSETS.top - VIEWPORT_INSETS.bottom);
  });

  it('portrait page that only just overflows at fit width: fit page (within 80% of it)', () => {
    // Fit width 1.00 gives a page 792 px tall in a 880 px room; shrink the room to 700.
    const viewport = { width: 636, height: 700 + VIEWPORT_INSETS.top + VIEWPORT_INSETS.bottom };
    const fit = autoFit(LETTER, viewport)!;
    expect(fit.kind).toBe('fit-page');
    expect(LETTER.height * fit.zoom).toBeLessThanOrEqual(700);
  });

  it('landscape page that fits at fit width: fit width', () => {
    const fit = autoFit(A4_LANDSCAPE, { width: 1000, height: 800 })!;
    expect(fit.kind).toBe('fit-width');
  });

  it('landscape page that would be cut off at fit width: fit page, whatever the share', () => {
    const viewport = { width: 1400, height: 500 };
    const fit = autoFit(SLIDE, viewport)!;
    expect(fit.kind).toBe('fit-page');
    const room = viewport.height - VIEWPORT_INSETS.top - VIEWPORT_INSETS.bottom;
    expect(SLIDE.height * fit.zoom).toBeLessThanOrEqual(room);
    expect(SLIDE.width * fit.zoom).toBeLessThanOrEqual(viewport.width - gutter);
  });

  it('a very large window never opens above 200%', () => {
    for (const page of [LETTER, A4, SLIDE, { width: 300, height: 200 }]) {
      const fit = autoFit(page, { width: 5000, height: 3000 })!;
      expect(fit.zoom).toBeLessThanOrEqual(2);
    }
  });

  it('a small window: the page is never wider than the window', () => {
    for (const page of [LETTER, A4, A4_LANDSCAPE, SLIDE]) {
      const viewport = { width: 520, height: 420 };
      const fit = autoFit(page, viewport)!;
      expect(page.width * fit.zoom).toBeLessThanOrEqual(viewport.width - gutter);
    }
  });
});

describe('the zoom a document opens at, per Default zoom setting', () => {
  const viewport = { width: 1300, height: 900 };

  it('Fit width follows the automatic rule', () => {
    expect(resolveZoom({ preference: 'fit-width', page: A4, viewport, lastUsed: 3 })).toBe(autoFit(A4, viewport)!.zoom);
    expect(resolveZoom({ preference: 'fit-width', page: SLIDE, viewport: { width: 1400, height: 500 }, lastUsed: null }))
      .toBe(autoFit(SLIDE, { width: 1400, height: 500 })!.zoom);
  });

  it('Fit page is always the whole page, also for a portrait page that fit width would scroll', () => {
    expect(resolveZoom({ preference: 'fit-page', page: A4, viewport, lastUsed: null })).toBe(fitPageZoom(A4, viewport));
    expect(fitPageZoom(A4, viewport)!).toBeLessThan(fitWidthZoom(A4, viewport)!);
  });

  it('Actual size is 100% in any window', () => {
    expect(resolveZoom({ preference: 'actual-size', page: A4, viewport, lastUsed: 2 })).toBe(1);
    expect(resolveZoom({ preference: 'actual-size', page: null, viewport: { width: 0, height: 0 }, lastUsed: null })).toBe(1);
  });

  it('Last used is the zoom chosen by hand last time, whatever the window', () => {
    expect(resolveZoom({ preference: 'last-used', page: A4, viewport, lastUsed: 1.75 })).toBe(1.75);
    expect(resolveZoom({ preference: 'last-used', page: A4, viewport: { width: 400, height: 400 }, lastUsed: 1.75 })).toBe(1.75);
  });

  it('Last used with nothing chosen yet behaves like the default', () => {
    expect(resolveZoom({ preference: 'last-used', page: A4, viewport, lastUsed: null })).toBe(autoFit(A4, viewport)!.zoom);
  });

  it('Last used ignores a stored value outside the zoom range', () => {
    expect(resolveZoom({ preference: 'last-used', page: A4, viewport, lastUsed: 9 })).toBe(autoFit(A4, viewport)!.zoom);
    expect(resolveZoom({ preference: 'last-used', page: A4, viewport, lastUsed: 0.01 })).toBe(autoFit(A4, viewport)!.zoom);
  });

  it('cannot say before there is a page or a layout', () => {
    expect(resolveZoom({ preference: 'fit-width', page: null, viewport, lastUsed: null })).toBeNull();
    expect(resolveZoom({ preference: 'fit-page', page: A4, viewport: { width: 0, height: 0 }, lastUsed: null })).toBeNull();
  });
});

describe('the Default zoom setting', () => {
  const store = new Map<string, string>();

  beforeEach(() => {
    store.clear();
    (globalThis as unknown as { localStorage: Storage }).localStorage = {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => { store.set(k, v); },
      removeItem: (k: string) => { store.delete(k); },
      clear: () => { store.clear(); },
      key: () => null,
      length: 0,
    } as Storage;
  });
  afterEach(() => {
    delete (globalThis as unknown as { localStorage?: Storage }).localStorage;
  });

  it('is Fit width unless the reader chose otherwise', () => {
    expect(DEFAULT_APP_SETTINGS.defaultZoom).toBe('fit-width');
    expect(loadAppSettings().defaultZoom).toBe('fit-width');
  });

  it('stays Fit width for settings saved before the option existed', () => {
    store.set(SETTINGS_STORAGE_KEY, JSON.stringify({ defaultReviewerName: 'Sam', themePreference: 'dark' }));
    const loaded = loadAppSettings();
    expect(loaded.defaultZoom).toBe('fit-width');
    expect(loaded.defaultReviewerName).toBe('Sam');
  });

  it.each(['fit-width', 'fit-page', 'actual-size', 'last-used'] as const)('keeps a stored choice: %s', (choice) => {
    store.set(SETTINGS_STORAGE_KEY, JSON.stringify({ defaultZoom: choice }));
    expect(loadAppSettings().defaultZoom).toBe(choice);
  });

  it('falls back to Fit width for a value this version does not know', () => {
    store.set(SETTINGS_STORAGE_KEY, JSON.stringify({ defaultZoom: 'fit-everything' }));
    expect(loadAppSettings().defaultZoom).toBe('fit-width');
    store.set(SETTINGS_STORAGE_KEY, JSON.stringify({ defaultZoom: 150 }));
    expect(loadAppSettings().defaultZoom).toBe('fit-width');
  });

  it('knows exactly the four choices', () => {
    expect(['fit-width', 'fit-page', 'actual-size', 'last-used'].every(isDefaultZoom)).toBe(true);
    expect(isDefaultZoom('100%')).toBe(false);
    expect(isDefaultZoom(undefined)).toBe(false);
  });
});

describe('zoomed by hand is a mark on one document', () => {
  it('holds for that document and for no other', () => {
    expect(isZoomManual('doc_a', 'doc_a')).toBe(true);
    expect(isZoomManual('doc_a', 'doc_b')).toBe(false);
    expect(isZoomManual(null, 'doc_b')).toBe(false);
  });

  it('never holds without a document', () => {
    expect(isZoomManual(null, null)).toBe(false);
  });
});

describe('useAutoFitZoom: fits on open, follows the window until the reader zooms', () => {
  type Observer = { cb: () => void; disconnected: boolean };
  let observers: Observer[];

  function fakeContainer(width: number, height: number) {
    return {
      offsetWidth: width,
      offsetHeight: height,
      scrollTop: 0,
      scrollTo: vi.fn(),
    };
  }

  beforeEach(() => {
    observers = [];
    (globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver = class {
      private readonly entry: Observer;
      constructor(cb: () => void) {
        this.entry = { cb, disconnected: false };
        observers.push(this.entry);
      }
      observe(): void { /* the test fires the callback itself */ }
      disconnect(): void { this.entry.disconnected = true; }
    };
  });
  afterEach(() => {
    delete (globalThis as unknown as { ResizeObserver?: unknown }).ResizeObserver;
  });

  function run(over: Partial<Parameters<typeof useAutoFitZoom>[0]> & { container: ReturnType<typeof fakeContainer> }) {
    const setAutoZoom = vi.fn();
    const setZoom = vi.fn();
    const { container, ...rest } = over;
    const api = useAutoFitZoom({
      containerRef: { current: container as unknown as HTMLElement },
      documentId: 'doc_1',
      firstPage: A4,
      preference: 'fit-width',
      manual: false,
      zoom: 1,
      setAutoZoom,
      setZoom,
      ...rest,
    });
    return { api, setAutoZoom, setZoom };
  }

  it('opens at the fitted zoom, without marking it as the reader\'s', () => {
    const container = fakeContainer(1200, 900);
    const { setAutoZoom, setZoom } = run({ container });
    expect(setAutoZoom).toHaveBeenCalledWith(autoFit(A4, { width: 1200, height: 900 })!.zoom);
    expect(setZoom).not.toHaveBeenCalled();
  });

  it('recalculates when the window is resized', () => {
    const container = fakeContainer(1200, 900);
    const { setAutoZoom } = run({ container });
    setAutoZoom.mockClear();
    container.offsetWidth = 700;
    observers[0]!.cb();
    expect(setAutoZoom).toHaveBeenCalledWith(autoFit(A4, { width: 700, height: 900 })!.zoom);
  });

  it('leaves a document alone once the reader zoomed it', () => {
    const container = fakeContainer(1200, 900);
    const { setAutoZoom } = run({ container, manual: true });
    expect(setAutoZoom).not.toHaveBeenCalled();
    expect(observers).toHaveLength(0);
  });

  it('does nothing without a document, a page or a layout', () => {
    expect(run({ container: fakeContainer(1200, 900), documentId: null }).setAutoZoom).not.toHaveBeenCalled();
    expect(run({ container: fakeContainer(1200, 900), firstPage: null }).setAutoZoom).not.toHaveBeenCalled();
    expect(run({ container: fakeContainer(0, 0) }).setAutoZoom).not.toHaveBeenCalled();
  });

  it('does not change the zoom when the window changed but the result did not', () => {
    // Actual size is 100% whatever the window is.
    const container = fakeContainer(1200, 900);
    const { setAutoZoom } = run({ container, preference: 'actual-size', zoom: 1 });
    expect(setAutoZoom).not.toHaveBeenCalled();
    container.offsetWidth = 600;
    observers[0]!.cb();
    expect(setAutoZoom).not.toHaveBeenCalled();
  });

  it('the Fit button applies the rule as the reader\'s own choice', () => {
    const container = fakeContainer(1000, 560);
    const { api, setZoom, setAutoZoom } = run({ container, manual: true });
    api.fitNow();
    expect(setZoom).toHaveBeenCalledWith(autoFit(A4, { width: 1000, height: 560 })!.zoom);
    expect(setAutoZoom).not.toHaveBeenCalled();
  });
});

describe('the settings dialog offers the choice under View', () => {
  it('lists the four choices on the Default zoom select', async () => {
    const { readFileSync } = await import('node:fs');
    const panel = readFileSync(new URL('../src/viewer/components/SettingsPanel.tsx', import.meta.url), 'utf8');
    const start = panel.indexOf("t('settings.view')");
    expect(start).toBeGreaterThan(-1);
    const section = panel.slice(start, panel.indexOf('OCR defaults', start));
    expect(section).toContain('data-testid="settings-default-zoom"');
    for (const value of ['fit-width', 'fit-page', 'actual-size', 'last-used']) {
      expect(section).toContain(`<option value="${value}">`);
    }
    expect(section).toContain("handleChange('defaultZoom'");
  });

  it('has English and translated labels in every locale', async () => {
    const { readFileSync, readdirSync } = await import('node:fs');
    const dir = new URL('../src/i18n/locales/', import.meta.url);
    const keys = ['view', 'defaultZoomLabel', 'defaultZoomFitWidth', 'defaultZoomFitPage', 'defaultZoomActualSize', 'defaultZoomLastUsed', 'defaultZoomHint'];
    for (const file of readdirSync(dir)) {
      const tree = JSON.parse(readFileSync(new URL(file, dir), 'utf8')) as { settings: Record<string, string> };
      for (const key of keys) expect(typeof tree.settings[key], `${file} settings.${key}`).toBe('string');
    }
  });
});
