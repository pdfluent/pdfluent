// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary. The PDFluent application is free to use,
// including for commercial purposes. Redistribution, or extraction or reuse
// of its components (including the embedded PDF engine), requires a licence.
// See https://pdfluent.com/license for terms.

import { useEffect, type RefObject } from 'react';

/**
 * Keeps keyboard focus inside the given container while it's active.
 *
 * Behaviour:
 *   • While `active` is true and `containerRef.current` exists, Tab and
 *     Shift+Tab cycle through the focusable descendants of the container
 *     instead of escaping into the rest of the page.
 *   • The hook does NOT trap mouse focus — clicks outside the container
 *     work normally. Use the `onMouseDown` backdrop handler on each
 *     dialog to dismiss instead.
 *   • The hook does NOT handle Escape. Dialogs should still register
 *     their own Escape listener (consistent across the app).
 *
 * Zero dependencies — implemented with the focusable-elements selector
 * from the WAI-ARIA dialog pattern. Keeps the v2 redesign's "no new
 * libraries" constraint.
 */
const FOCUSABLE_SELECTOR = [
  'a[href]:not([tabindex="-1"])',
  'area[href]:not([tabindex="-1"])',
  'button:not([disabled]):not([tabindex="-1"])',
  'input:not([disabled]):not([tabindex="-1"])',
  'select:not([disabled]):not([tabindex="-1"])',
  'textarea:not([disabled]):not([tabindex="-1"])',
  'iframe:not([tabindex="-1"])',
  '[tabindex]:not([tabindex="-1"])',
  '[contenteditable=""]:not([tabindex="-1"])',
  '[contenteditable="true"]:not([tabindex="-1"])',
].join(',');

export function useFocusTrap(
  containerRef: RefObject<HTMLElement | null>,
  active: boolean,
): void {
  useEffect(() => {
    if (!active) return;
    const container = containerRef.current;
    if (!container) return;

    function handleKey(event: KeyboardEvent): void {
      if (event.key !== 'Tab') return;
      // Container may have been unmounted between event registration and
      // dispatch (e.g. during state transitions). Bail safely.
      if (!container) return;

      const focusables = Array.from(
        container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR),
      ).filter((el) => el.offsetParent !== null || el === document.activeElement);

      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      if (!first || !last) {
        // No focusable elements — keep focus on the container itself.
        event.preventDefault();
        container.focus();
        return;
      }
      const activeEl = document.activeElement as HTMLElement | null;

      // If focus is outside the container entirely, pull it back to first.
      if (!container.contains(activeEl)) {
        event.preventDefault();
        first.focus();
        return;
      }

      // Shift+Tab on first → wrap to last.
      if (event.shiftKey && activeEl === first) {
        event.preventDefault();
        last.focus();
        return;
      }

      // Tab on last → wrap to first.
      if (!event.shiftKey && activeEl === last) {
        event.preventDefault();
        first.focus();
        return;
      }
    }

    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('keydown', handleKey);
    };
  }, [active, containerRef]);
}
