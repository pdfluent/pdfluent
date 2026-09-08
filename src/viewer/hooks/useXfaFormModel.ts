// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary. The PDFluent application is free to use,
// including for commercial purposes. Redistribution, or extraction or reuse
// of its components (including the embedded PDF engine), requires a licence.
// See https://pdfluent.com/license for terms.

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  xfaFormModel,
  commitXfaFieldValue,
  type XfaFieldDto,
  type XfaWriteRequest,
} from '../../lib/tauri-api';
import { isTauriRuntime } from '../../lib/tauri-detection';
import { makeCommand } from '../undoEngine';
import type { UndoCommand } from '../undoEngine';
import i18n from '../../i18n';
import { reportCommandFailure } from '../../lib/commandBridge';
import { announceXfaStaticWrite } from '../state/fallbackNotices';
import type { PdfDocument } from '../../core/document';

/**
 * Drives the Phase-1 XFA fill experience. Loads the SDK `xfa_form_model`
 * (layout page count + logical fields with values, flags, options and per-widget
 * geometry), holds optimistic values for the overlay inputs, and writes each
 * commit through `set_xfa_field_value` so the saved file's datasets packet
 * carries the value (Adobe Acrobat/Reader reopens the form filled).
 *
 * Distinct from the AcroForm `useFormModel`: XFA has no `/AP` to double-draw, no
 * reflow on write (Phase 1), and the geometry uses a top-left origin. Values are
 * the visual truth in the overlay; we never bump the page render revision on a
 * fill (no re-flatten — Phase 0 layout is preserved).
 */

/** Local value for one XFA field: text/dropdown → string, checkbox → boolean. */
export type XfaLocalValue = string | boolean;

type XfaCommitKind = 'text' | 'checkbox' | 'radio';

export interface XfaFormModelState {
  /** All logical XFA fields, or [] when the document is not XFA. */
  model: XfaFieldDto[];
  /** True when there is at least one XFA field. */
  hasXfaForm: boolean;
  /** Total logical fields. */
  fieldCount: number;
  /** XFA layout page count (may exceed the rendered page count). */
  pageCount: number;
  /** Current optimistic value per field name. */
  values: Record<string, XfaLocalValue>;
  /** Ordered field names that can receive focus (Tab order, rendered pages only). */
  tabOrder: string[];
  /** Set a text-ish field's local value (no write — call on input change). */
  setTextLocal: (name: string, value: string) => void;
  /** Commit a text-ish field (call on blur/Enter). Records undo. */
  commitText: (name: string, value: string) => void;
  /** Toggle a checkbox and write through. Records undo. */
  commitCheckbox: (name: string, checked: boolean) => void;
  /** Select a radio member by on-value and write through. Records undo. */
  commitRadio: (name: string, onValue: string) => void;
  /** Focus a field by name, scrolling its page into view first. */
  focusField: (name: string) => void;
  /** Field name that follows `name` in tab order (wraps). dir -1 = previous. */
  siblingField: (name: string, dir: 1 | -1) => string | null;
  /** Re-read the model from the backend. */
  reload: () => void;
}

/** Field families that accept a text payload (single value box). */
function isTextLike(t: XfaFieldDto['fieldType']): boolean {
  return (
    t === 'text' ||
    t === 'numeric' ||
    t === 'dateTime' ||
    t === 'password' ||
    t === 'dropdown'
  );
}

/** A field can receive focus when it is interactive and not read-only. */
function isFocusable(f: XfaFieldDto): boolean {
  if (f.readOnly || f.hidden) return false;
  return isTextLike(f.fieldType) || f.fieldType === 'checkbox' || f.fieldType === 'radioGroup';
}

function initialValue(f: XfaFieldDto): XfaLocalValue {
  if (f.fieldType === 'checkbox') {
    if (f.onValue != null) return f.value === f.onValue;
    const v = f.value.trim().toLowerCase();
    return v !== '' && v !== '0' && v !== 'off';
  }
  // text-like and radioGroup both carry their current value as a string
  // (radio: the selected member's on-value, '' when none selected).
  return f.value;
}

/** First widget's position key for ordering: page, then top-down, then left.
 *  XFA uses a top-left origin, so a smaller y is nearer the top. */
function orderKey(f: XfaFieldDto): [number, number, number] {
  const w = f.widgets[0];
  if (!w) return [Number.MAX_SAFE_INTEGER, 0, 0];
  return [w.page, w.rect.y, w.rect.x];
}

/** Derive the optimistic value map + field→page index from a field list. */
function buildValueMaps(fields: XfaFieldDto[]): {
  values: Record<string, XfaLocalValue>;
  pages: Record<string, number>;
} {
  const values: Record<string, XfaLocalValue> = {};
  const pages: Record<string, number> = {};
  for (const f of fields) {
    values[f.name] = initialValue(f);
    if (f.page != null) pages[f.name] = f.page;
  }
  return { values, pages };
}

export function useXfaFormModel(
  pdfDoc: PdfDocument | null,
  markDirty: () => void,
  setPageIndex: (i: number) => void,
  pushUndo: (cmd: UndoCommand) => void,
  /** Bump the page render revision so the rendered pages repaint after a commit
   *  re-layouts the document (revealed sections, new datasets). */
  requestRepaint: () => void,
): XfaFormModelState {
  const [model, setModel] = useState<XfaFieldDto[]>([]);
  const [pageCount, setPageCount] = useState(0);
  const [values, setValues] = useState<Record<string, XfaLocalValue>>({});
  const [reloadNonce, setReloadNonce] = useState(0);
  const fieldPageRef = useRef<Record<string, number>>({});
  // Last *committed* value per field — the undo baseline (distinct from `values`
  // which mirrors live keystrokes).
  const committedRef = useRef<Record<string, XfaLocalValue>>({});
  // Whether this document has already been told that its writes are static.
  const staticWriteAnnouncedRef = useRef(false);

  const reload = useCallback(() => setReloadNonce(n => n + 1), []);

  const isXfa = !!pdfDoc?.xfaDetected;

  // Load the model whenever the (XFA) document identity or version changes.
  useEffect(() => {
    let cancelled = false;
    staticWriteAnnouncedRef.current = false;
    if (!pdfDoc || !isXfa || !isTauriRuntime()) {
      setModel([]);
      setValues({});
      setPageCount(0);
      return;
    }
    void xfaFormModel()
      .then(result => {
        if (cancelled) return;
        setModel(result.fields);
        setPageCount(result.pageCount);
        const { values: vals, pages } = buildValueMaps(result.fields);
        setValues(vals);
        committedRef.current = { ...vals };
        fieldPageRef.current = pages;
      })
      .catch(err => {
        if (!cancelled) {
          // Non-XFA or parse failure: present an empty model rather than crash.
          console.error('[PDFluent] xfa_form_model failed', err);
          setModel([]);
          setValues({});
          setPageCount(0);
        }
      });
    return () => {
      cancelled = true;
    };
    // NOT keyed on documentVersion: a commit's re-layout updates the model from
    // the commit RESULT (which carries the script-driven presence changes). A
    // fresh xfa_form_model() read is a *static* enumeration and would discard
    // those reveals, so we must not re-fetch on every render-revision bump.
  }, [pdfDoc?.id, isXfa, reloadNonce]); // eslint-disable-line react-hooks/exhaustive-deps

  // Tab order is bounded to fields on rendered pages (the overlay's domain).
  const renderedPages = pdfDoc?.pages.length ?? 0;
  const tabOrder = useMemo(() => {
    return model
      .filter(f => isFocusable(f) && f.page != null && f.page < renderedPages)
      .slice()
      .sort((a, b) => {
        const ka = orderKey(a);
        const kb = orderKey(b);
        return ka[0] - kb[0] || ka[1] - kb[1] || ka[2] - kb[2];
      })
      .map(f => f.name);
  }, [model, renderedPages]);

  const setTextLocal = useCallback((name: string, value: string) => {
    setValues(prev => (prev[name] === value ? prev : { ...prev, [name]: value }));
  }, []);

  const requestFor = useCallback(
    (name: string, kind: XfaCommitKind, value: XfaLocalValue): XfaWriteRequest => {
      switch (kind) {
        case 'checkbox':
          return { kind: 'checkbox', name, checked: value === true };
        case 'radio':
          return { kind: 'radio', name, export: String(value ?? '') };
        default:
          return { kind: 'text', name, value: String(value ?? '') };
      }
    },
    [],
  );

  /**
   * Apply one typed value through the Phase 2 interactive commit loop:
   * optimistic local update, then `commit_xfa_field_value` (change/click +
   * calculate scripts → re-layout). The commit RESULT carries the refreshed
   * model (revealed/hidden fields, new geometry) and the presence changes, which
   * we fold back into the overlay and repaint. Falls back transparently to the
   * Phase 1 value write when the backend lacks the commit loop (the result then
   * reports `interactive=false`).
   */
  const applyValue = useCallback(
    async (name: string, kind: XfaCommitKind, value: XfaLocalValue) => {
      committedRef.current = { ...committedRef.current, [name]: value };
      setValues(prev => ({ ...prev, [name]: value }));
      if (!isTauriRuntime()) return;
      try {
        const result = await commitXfaFieldValue(requestFor(name, kind, value));
        markDirty();

        // A Phase 1 write is a different product from a Phase 2 commit: the
        // value lands, but no field script runs, so a calculated total stays
        // wrong and a subform that should appear does not. The comment on this
        // function used to call that "falls back transparently", which is the
        // whole problem -- transparent to the code, invisible to the person
        // filling in the form. Once per document, not once per keystroke.
        if (!result.interactive && !staticWriteAnnouncedRef.current) {
          staticWriteAnnouncedRef.current = true;
          announceXfaStaticWrite();
        }

        // Surface what the commit loop revealed/hid (debug output, task §3).
        if (result.presenceChanges.length > 0 || result.pageCountBefore !== result.pageCountAfter) {

          console.info(
            `[PDFluent] XFA commit "${name}": interactive=${result.interactive} ` +
              `scripts=${result.scriptsExecuted} pages ${result.pageCountBefore}→${result.pageCountAfter} ` +
              `presence=[${result.presenceChanges.map(p => `${p.name}:${p.before}→${p.after}`).join(', ')}]`,
          );
        }

        // Fold the refreshed model back in (revealed/hidden fields + new values),
        // preserving the just-committed local value as the source of truth.
        const { values: vals, pages } = buildValueMaps(result.model.fields);
        vals[name] = value;
        setModel(result.model.fields);
        setPageCount(result.model.pageCount);
        setValues(vals);
        committedRef.current = { ...vals };
        fieldPageRef.current = pages;

        // Re-layout may have changed the rendered pages → repaint.
        requestRepaint();
      } catch (err) {
        // Keep the optimistic value so input isn't lost, but say so: the field
        // shows what was typed while the document does not carry it.
        // (Read-only / unbound fields can legitimately reject.)
        reportCommandFailure('commit_xfa_field_value', err);
      }
    },
    [markDirty, requestFor, requestRepaint],
  );

  /** Commit a value AND record an undo entry (prev → new) on the shared stack. */
  const commit = useCallback(
    (name: string, kind: XfaCommitKind, value: XfaLocalValue) => {
      const prev = committedRef.current[name] ?? (kind === 'checkbox' ? false : '');
      if (prev === value) {
        void applyValue(name, kind, value);
        return;
      }
      void applyValue(name, kind, value);
      pushUndo(
        makeCommand(
          i18n.t('events.formFieldChange'),
          () => applyValue(name, kind, value), // redo
          () => applyValue(name, kind, prev), // undo
        ),
      );
    },
    [applyValue, pushUndo],
  );

  const commitText = useCallback((name: string, value: string) => commit(name, 'text', value), [commit]);
  const commitCheckbox = useCallback(
    (name: string, checked: boolean) => commit(name, 'checkbox', checked),
    [commit],
  );
  const commitRadio = useCallback(
    (name: string, onValue: string) => commit(name, 'radio', onValue),
    [commit],
  );

  const focusField = useCallback(
    (name: string) => {
      const page = fieldPageRef.current[name];
      if (page != null) setPageIndex(page);
      const tryFocus = (attempt: number) => {
        const el = document.querySelector<HTMLElement>(
          `[data-xfa-field="${CSS.escape(name)}"]`,
        );
        if (el) {
          el.focus();
          el.scrollIntoView({ block: 'center', behavior: 'smooth' });
        } else if (attempt < 8) {
          setTimeout(() => tryFocus(attempt + 1), 40);
        }
      };
      setTimeout(() => tryFocus(0), 0);
    },
    [setPageIndex],
  );

  const siblingField = useCallback(
    (name: string, dir: 1 | -1): string | null => {
      if (tabOrder.length === 0) return null;
      const idx = tabOrder.indexOf(name);
      if (idx === -1) return tabOrder[0] ?? null;
      const next = (idx + dir + tabOrder.length) % tabOrder.length;
      return tabOrder[next] ?? null;
    },
    [tabOrder],
  );

  return {
    model,
    hasXfaForm: model.length > 0,
    fieldCount: model.length,
    pageCount,
    values,
    tabOrder,
    setTextLocal,
    commitText,
    commitCheckbox,
    commitRadio,
    focusField,
    siblingField,
    reload,
  };
}
