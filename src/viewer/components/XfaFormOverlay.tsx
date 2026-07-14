// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary. The PDFluent application is free to use,
// including for commercial purposes. Redistribution, or extraction or reuse
// of its components (including the embedded PDF engine), requires a licence.
// See https://pdfluent.com/license for terms.

import React, { useCallback } from 'react';
import type { XfaFieldDto, XfaRectDto } from '../../lib/tauri-api';
import type { XfaLocalValue } from '../hooks/useXfaFormModel';

/**
 * Phase-1 XFA fill overlay: renders interactive HTML inputs over the rendered
 * (flattened, read-only) XFA page bitmap at each widget's rectangle.
 *
 * Unlike the AcroForm `FormOverlay`, XFA rectangles are in page space with a
 * TOP-LEFT origin (y grows downward), so the box maps directly — no y-flip and
 * no page height needed. Only widgets whose layout page equals this rendered
 * page index are shown; fields on layout pages the flatten path suppressed
 * (over-produced empty `occur` instances) fall outside the rendered range and
 * are skipped ("fill visible fields").
 *
 * The container is pointer-transparent; only inputs capture pointer events, so
 * clicks elsewhere fall through to normal page interaction.
 */

interface XfaFormOverlayProps {
  /** All logical XFA fields (the overlay filters to widgets on this page). */
  fields: XfaFieldDto[];
  /** Rendered (flattened) page index this overlay sits on. */
  pageIndex: number;
  zoom: number;
  /** Optimistic current values keyed by field name. */
  values: Record<string, XfaLocalValue>;
  /** When true, draw the "highlight fillable fields" emphasis. */
  highlight: boolean;
  onTextChange: (name: string, value: string) => void;
  onTextCommit: (name: string, value: string) => void;
  onCheckbox: (name: string, checked: boolean) => void;
  onRadio: (name: string, onValue: string) => void;
  /** Tab/Shift+Tab → resolve the next/previous field name and focus it. */
  onTab: (currentName: string, dir: 1 | -1) => void;
}

interface Box {
  left: number;
  top: number;
  width: number;
  height: number;
}

/** XFA rect (points, top-left origin) → DOM box, scaled by zoom. No y-flip. */
function boxOf(rect: XfaRectDto, zoom: number): Box {
  return {
    left: rect.x * zoom,
    top: rect.y * zoom,
    width: rect.width * zoom,
    height: rect.height * zoom,
  };
}

function fontPx(box: Box, zoom: number): number {
  const ptHeight = box.height / zoom;
  return Math.max(8, Math.min(ptHeight * 0.66, 12) * zoom);
}

function isTextLike(t: XfaFieldDto['fieldType']): boolean {
  return t === 'text' || t === 'numeric' || t === 'dateTime' || t === 'password';
}

export function XfaFormOverlay({
  fields,
  pageIndex,
  zoom,
  values,
  highlight,
  onTextChange,
  onTextCommit,
  onCheckbox,
  onRadio,
  onTab,
}: XfaFormOverlayProps) {
  const handleTabKey = useCallback(
    (e: React.KeyboardEvent, name: string) => {
      if (e.key === 'Tab') {
        e.preventDefault();
        onTab(name, e.shiftKey ? -1 : 1);
      } else if (e.key === 'Escape') {
        (e.target as HTMLElement).blur();
      }
    },
    [onTab],
  );

  const baseStyle = (box: Box, readOnly: boolean): React.CSSProperties => ({
    position: 'absolute',
    left: box.left,
    top: box.top,
    width: box.width,
    height: box.height,
    boxSizing: 'border-box',
    pointerEvents: 'auto',
    margin: 0,
    background: readOnly ? 'rgba(244,244,245,0.55)' : 'rgba(255,255,255,0.92)',
    border: highlight
      ? '1px solid rgba(59,130,246,0.55)'
      : '1px solid rgba(120,120,128,0.28)',
    borderRadius: 2,
    outline: 'none',
    color: '#111',
    opacity: readOnly ? 0.7 : 1,
  });

  const elements: React.ReactNode[] = [];

  for (const field of fields) {
    if (field.hidden) continue;
    const onThisPage = field.widgets.filter(w => w.page === pageIndex);
    if (onThisPage.length === 0) continue;
    const w0 = onThisPage[0];
    if (!w0) continue;
    const v = values[field.name];

    if (isTextLike(field.fieldType)) {
      const box = boxOf(w0.rect, zoom);
      const fpx = fontPx(box, zoom);
      const strVal = typeof v === 'string' ? v : '';
      if (field.multiline) {
        elements.push(
          <textarea
            key={field.name}
            data-xfa-field={field.name}
            data-testid="xfa-field-input"
            value={strVal}
            readOnly={field.readOnly}
            title={field.somPath}
            onChange={e => onTextChange(field.name, e.target.value)}
            onBlur={e => onTextCommit(field.name, e.target.value)}
            onKeyDown={e => handleTabKey(e, field.name)}
            style={{
              ...baseStyle(box, field.readOnly),
              resize: 'none',
              padding: '2px 4px',
              fontSize: fpx,
              lineHeight: 1.2,
              fontFamily: 'Helvetica, Arial, sans-serif',
            }}
          />,
        );
      } else {
        elements.push(
          <input
            key={field.name}
            data-xfa-field={field.name}
            data-testid="xfa-field-input"
            type={field.fieldType === 'password' ? 'password' : 'text'}
            value={strVal}
            readOnly={field.readOnly}
            title={field.somPath}
            onChange={e => onTextChange(field.name, e.target.value)}
            onBlur={e => onTextCommit(field.name, e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter') {
                e.preventDefault();
                onTextCommit(field.name, (e.target as HTMLInputElement).value);
                onTab(field.name, 1);
              } else {
                handleTabKey(e, field.name);
              }
            }}
            style={{
              ...baseStyle(box, field.readOnly),
              padding: '0 4px',
              fontSize: fpx,
              fontFamily: 'Helvetica, Arial, sans-serif',
            }}
          />,
        );
      }
      continue;
    }

    if (field.fieldType === 'dropdown') {
      const box = boxOf(w0.rect, zoom);
      const fpx = fontPx(box, zoom);
      const strVal = typeof v === 'string' ? v : '';
      elements.push(
        <select
          key={field.name}
          data-xfa-field={field.name}
          data-testid="xfa-field-select"
          value={strVal}
          disabled={field.readOnly}
          title={field.somPath}
          onChange={e => onTextCommit(field.name, e.target.value)}
          onKeyDown={e => handleTabKey(e, field.name)}
          style={{ ...baseStyle(box, field.readOnly), padding: '0 2px', fontSize: fpx }}
        >
          <option value="" />
          {field.options.map(o => (
            <option key={o.save} value={o.save}>
              {o.display}
            </option>
          ))}
        </select>,
      );
      continue;
    }

    if (field.fieldType === 'checkbox') {
      const checked = v === true;
      for (let wi = 0; wi < onThisPage.length; wi++) {
        const cw = onThisPage[wi];
        if (!cw) continue;
        const box = boxOf(cw.rect, zoom);
        elements.push(
          <input
            key={`${field.name}#${wi}`}
            data-xfa-field={wi === 0 ? field.name : undefined}
            data-testid="xfa-field-checkbox"
            type="checkbox"
            checked={checked}
            disabled={field.readOnly}
            title={field.somPath}
            onChange={e => onCheckbox(field.name, e.target.checked)}
            onKeyDown={e => handleTabKey(e, field.name)}
            style={{
              position: 'absolute',
              left: box.left,
              top: box.top,
              width: box.width,
              height: box.height,
              margin: 0,
              pointerEvents: 'auto',
              accentColor: '#2563eb',
              cursor: field.readOnly ? 'default' : 'pointer',
            }}
          />,
        );
      }
      continue;
    }

    if (field.fieldType === 'radioGroup') {
      const selected = typeof v === 'string' ? v : '';
      for (let wi = 0; wi < onThisPage.length; wi++) {
        const widget = onThisPage[wi];
        if (!widget) continue;
        const onValue = widget.onValue ?? '';
        const box = boxOf(widget.rect, zoom);
        elements.push(
          <input
            key={`${field.name}#${wi}`}
            data-xfa-field={wi === 0 ? field.name : undefined}
            data-testid="xfa-field-radio"
            type="radio"
            name={field.name}
            checked={selected === onValue && onValue !== ''}
            disabled={field.readOnly}
            title={field.somPath}
            onChange={() => onRadio(field.name, onValue)}
            onKeyDown={e => {
              if (e.key === 'Tab') handleTabKey(e, field.name);
            }}
            style={{
              position: 'absolute',
              left: box.left,
              top: box.top,
              width: box.width,
              height: box.height,
              margin: 0,
              pointerEvents: 'auto',
              accentColor: '#2563eb',
              cursor: field.readOnly ? 'default' : 'pointer',
            }}
          />,
        );
      }
      continue;
    }

    // button / signature / image / barcode: not fillable — no overlay input.
  }

  if (elements.length === 0) return null;

  return (
    <div
      data-testid="xfa-form-overlay"
      // Same z-index as the AcroForm overlay: above the canvas/text stack so the
      // inputs are the top hit-target; the container itself is pointer-transparent.
      style={{ position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 30 }}
    >
      {elements}
    </div>
  );
}
