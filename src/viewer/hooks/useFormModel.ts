// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary. The PDFluent application is free to use,
// including for commercial purposes. Redistribution, or extraction or reuse
// of its components (including the embedded PDF engine), requires a licence.
// See https://pdfluent.com/license for terms.

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  getFormModel,
  setFormValue,
  type FormFieldModelDto,
  type FormWriteRequest,
} from '../../lib/tauri-api';
import { isTauriRuntime } from '../../lib/tauri-detection';
import { makeCommand } from '../undoEngine';
import type { UndoCommand } from '../undoEngine';
import i18n from '../../i18n';
import type { PdfDocument } from '../../core/document';

/** The four field families that carry a persistent value. */
type CommitKind = 'text' | 'checkbox' | 'radio' | 'choice' | 'multiChoice';

/**
 * Drives the first-class AcroForm experience: loads the SDK `build_form_model`
 * contract, holds optimistic field values for the overlay inputs, and provides
 * a document-wide tab order plus write-through commits (each commit runs the
 * SDK `/V`+`/AS`+`/AP` writeback so the saved file shows the value everywhere).
 *
 * The overlay inputs are the visual truth while editing; we deliberately do NOT
 * bump the page render revision on a fill, so the freshly-baked `/AP` underneath
 * never double-draws under the input.
 */

/** Local value for one logical field. */
export type FieldLocalValue = string | boolean | string[];

export interface FormModelState {
  /** All logical fields, or [] when the document has no AcroForm. */
  model: FormFieldModelDto[];
  /** True when there is at least one logical field. */
  hasForm: boolean;
  /** Total logical fields (for the Form Bar count). */
  fieldCount: number;
  /** Current optimistic value per field name. */
  values: Record<string, FieldLocalValue>;
  /** Ordered field names that can receive focus (Tab order). */
  tabOrder: string[];
  /** Set a text-ish field's local value (no PDF write — call on input change). */
  setTextLocal: (name: string, value: string) => void;
  /** Commit a text-ish field to the PDF (call on blur/Enter). Records undo. */
  commitText: (name: string, value: string) => void;
  /** Toggle a checkbox and write through. Records undo. */
  commitCheckbox: (name: string, checked: boolean) => void;
  /** Select a radio option (by export/on-state) and write through. Records undo. */
  commitRadio: (name: string, exportValue: string) => void;
  /** Select a choice value and write through. Records undo. */
  commitChoice: (name: string, value: string) => void;
  /** Set multiple selected values on a multi-select list box. Records undo. */
  commitMultiChoice: (name: string, values: string[]) => void;
  /** Focus a field by name, scrolling its page into the render window first. */
  focusField: (name: string) => void;
  /** Field name that follows `name` in tab order (wraps). dir -1 = previous. */
  siblingField: (name: string, dir: 1 | -1) => string | null;
  /** Re-read the model from the backend (after external mutation). */
  reload: () => void;
}

/** A field can receive focus when it is interactive and not read-only. */
function isFocusable(f: FormFieldModelDto): boolean {
  if (f.readOnly) return false;
  return (
    f.kind.type === 'text' ||
    f.kind.type === 'checkbox' ||
    f.kind.type === 'radioGroup' ||
    f.kind.type === 'comboBox' ||
    f.kind.type === 'listBox'
  );
}

/** First widget's position key for ordering: page, then top-down, then left. */
function orderKey(f: FormFieldModelDto): [number, number, number] {
  const w = f.widgets[0];
  if (!w) return [Number.MAX_SAFE_INTEGER, 0, 0];
  const page = w.pageIndex ?? Number.MAX_SAFE_INTEGER;
  // PDF y is bottom-up; higher y = nearer the top, so negate for top-first.
  return [page, -w.rect[1], w.rect[0]];
}

function initialValue(f: FormFieldModelDto): FieldLocalValue {
  switch (f.kind.type) {
    case 'checkbox':
      return f.kind.checked;
    case 'radioGroup':
      return f.value && f.value !== 'Off' ? f.value : '';
    case 'listBox':
      if (f.kind.multiSelect) return f.selectedValues ?? [];
      return f.value ?? '';
    default:
      return f.value ?? '';
  }
}

export function useFormModel(
  pdfDoc: PdfDocument | null,
  documentVersion: number,
  markDirty: () => void,
  setPageIndex: (i: number) => void,
  pushUndo: (cmd: UndoCommand) => void,
): FormModelState {
  const [model, setModel] = useState<FormFieldModelDto[]>([]);
  const [values, setValues] = useState<Record<string, FieldLocalValue>>({});
  const [reloadNonce, setReloadNonce] = useState(0);
  // Page of each field's first widget, for focusField scroll-into-view.
  const fieldPageRef = useRef<Record<string, number>>({});
  // Last *committed* value per field — distinct from `values`, which mirrors
  // live keystrokes (setTextLocal). The undo entry's "previous" value must come
  // from here; reading `values` would yield the just-typed text (prev === new)
  // and silently drop the undo entry.
  const committedRef = useRef<Record<string, FieldLocalValue>>({});

  const reload = useCallback(() => setReloadNonce(n => n + 1), []);

  // Load the model whenever the document identity or version changes.
  useEffect(() => {
    let cancelled = false;
    if (!pdfDoc || !isTauriRuntime()) {
      setModel([]);
      setValues({});
      return;
    }
    void getFormModel()
      .then(fields => {
        if (cancelled) return;
        setModel(fields);
        const vals: Record<string, FieldLocalValue> = {};
        const pages: Record<string, number> = {};
        for (const f of fields) {
          vals[f.name] = initialValue(f);
          const p = f.widgets[0]?.pageIndex;
          if (p != null) pages[f.name] = p;
        }
        setValues(vals);
        committedRef.current = { ...vals };
        fieldPageRef.current = pages;
      })
      .catch(() => {
        if (!cancelled) {
          setModel([]);
          setValues({});
        }
      });
    return () => {
      cancelled = true;
    };
  }, [pdfDoc?.id, documentVersion, reloadNonce]); // eslint-disable-line react-hooks/exhaustive-deps

  const tabOrder = useMemo(() => {
    return model
      .filter(isFocusable)
      .slice()
      .sort((a, b) => {
        const ka = orderKey(a);
        const kb = orderKey(b);
        return ka[0] - kb[0] || ka[1] - kb[1] || ka[2] - kb[2];
      })
      .map(f => f.name);
  }, [model]);

  const setTextLocal = useCallback((name: string, value: string) => {
    setValues(prev => (prev[name] === value ? prev : { ...prev, [name]: value }));
  }, []);

  const requestFor = useCallback(
    (name: string, kind: CommitKind, value: FieldLocalValue): FormWriteRequest => {
      switch (kind) {
        case 'checkbox':
          return { kind: 'checkbox', name, checked: value === true };
        case 'radio':
          return { kind: 'radio', name, export: String(value ?? '') };
        case 'choice':
          return { kind: 'choice', name, value: String(value ?? '') };
        case 'multiChoice':
          return { kind: 'multiChoice', name, values: Array.isArray(value) ? value : [] };
        default:
          return { kind: 'text', name, value: String(value ?? '') };
      }
    },
    [],
  );

  /** Apply one typed value: optimistic local update + SDK writeback. Also
   *  advances the committed-value baseline (so undo/redo chains correctly). */
  const applyValue = useCallback(
    async (name: string, kind: CommitKind, value: FieldLocalValue) => {
      committedRef.current = { ...committedRef.current, [name]: value };
      setValues(prev => ({ ...prev, [name]: value }));
      if (!isTauriRuntime()) return;
      try {
        await setFormValue(requestFor(name, kind, value));
        markDirty();
      } catch (err) {
        // Keep the optimistic value so input isn't lost; surface for diagnostics.
        // (Radio deselect / choice clear can legitimately reject — edge cases.)
        console.error('[PDFluent] form write failed for', name, err);
      }
    },
    [markDirty, requestFor],
  );

  /** Commit a value AND record an undo entry (prev → new) on the shared stack. */
  const commit = useCallback(
    (name: string, kind: CommitKind, value: FieldLocalValue) => {
      // Previous = last *committed* value (not the live-typed `values`).
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
    (name: string, exportValue: string) => commit(name, 'radio', exportValue),
    [commit],
  );
  const commitChoice = useCallback(
    (name: string, value: string) => commit(name, 'choice', value),
    [commit],
  );
  const commitMultiChoice = useCallback(
    (name: string, values: string[]) => commit(name, 'multiChoice', values),
    [commit],
  );

  const focusField = useCallback(
    (name: string) => {
      const page = fieldPageRef.current[name];
      if (page != null) setPageIndex(page);
      // Wait for the target page to enter the render window and mount.
      const tryFocus = (attempt: number) => {
        const el = document.querySelector<HTMLElement>(
          `[data-form-field="${CSS.escape(name)}"]`,
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
    hasForm: model.length > 0,
    fieldCount: model.length,
    values,
    tabOrder,
    setTextLocal,
    commitText,
    commitCheckbox,
    commitRadio,
    commitChoice,
    commitMultiChoice,
    focusField,
    siblingField,
    reload,
  };
}
