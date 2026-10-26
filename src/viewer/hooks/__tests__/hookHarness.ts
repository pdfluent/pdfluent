// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary. The PDFluent application is free to use,
// including for commercial purposes. Redistribution, or extraction or reuse
// of its components (including the embedded PDF engine), requires a licence.
// See https://pdfluent.com/license for terms.

// Runs a hook's effects in node without a DOM, so a test can call the real
// hook and fire the window events it listens to. vitest runs in the `node`
// environment (vitest.config.ts) and the repo has no React renderer for tests;
// reading the hook's source would prove nothing about what it does.
//
// Usage in a test file:
//   vi.mock('react', async (orig) => reactForHooks(await orig()));
//   const win = installFakeWindow();
//   useMyHook(props);           // effects run synchronously
//   win.fire('keydown', keyEvent({ key: '2' }));

type Effect = () => void | (() => void);

/** The subset of React a hook body calls, with effects run immediately. */
export function reactForHooks<T extends object>(actual: T): T {
  return {
    ...actual,
    useEffect: (fn: Effect) => { fn(); },
    useLayoutEffect: (fn: Effect) => { fn(); },
    useRef: <V>(v: V) => ({ current: v }),
    useCallback: <F>(f: F) => f,
    useMemo: <V>(f: () => V) => f(),
    useState: <V>(v: V | (() => V)) => {
      const box = { current: typeof v === 'function' ? (v as () => V)() : v };
      const set = (n: V | ((p: V) => V)) => {
        box.current = typeof n === 'function' ? (n as (p: V) => V)(box.current) : n;
      };
      return [box.current, set];
    },
  } as T;
}

export interface FakeWindow {
  fire(type: string, event: object): void;
  listenerCount(type: string): number;
}

/** Install a `window` that records listeners; returns a handle to fire events. */
export function installFakeWindow(): FakeWindow {
  const listeners = new Map<string, Set<(e: unknown) => void>>();
  const win = {
    addEventListener(type: string, fn: (e: unknown) => void) {
      if (!listeners.has(type)) listeners.set(type, new Set());
      listeners.get(type)!.add(fn);
    },
    removeEventListener(type: string, fn: (e: unknown) => void) {
      listeners.get(type)?.delete(fn);
    },
    getSelection: () => null,
  };
  (globalThis as unknown as { window: unknown }).window = win;
  return {
    fire(type, event) {
      for (const fn of [...(listeners.get(type) ?? [])]) fn(event);
    },
    listenerCount(type) {
      return listeners.get(type)?.size ?? 0;
    },
  };
}

export interface FakeKeyEvent {
  key: string;
  metaKey: boolean;
  ctrlKey: boolean;
  altKey: boolean;
  shiftKey: boolean;
  defaultPrevented: boolean;
  target: unknown;
  preventDefault(): void;
}

/** A keydown event aimed at `target` (default: the page body, not a field). */
export function keyEvent(init: Partial<Omit<FakeKeyEvent, 'preventDefault'>> & { key: string }): FakeKeyEvent {
  const ev: FakeKeyEvent = {
    metaKey: false,
    ctrlKey: false,
    altKey: false,
    shiftKey: false,
    defaultPrevented: false,
    target: { tagName: 'BODY', isContentEditable: false },
    ...init,
    preventDefault() { ev.defaultPrevented = true; },
  };
  return ev;
}

/** What the inline text editor is: a contentEditable DIV. */
export const inlineEditorTarget = { tagName: 'DIV', isContentEditable: true };
