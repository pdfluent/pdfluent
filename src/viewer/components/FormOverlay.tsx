// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary. The PDFluent application is free to use,
// including for commercial purposes. Redistribution, or extraction or reuse
// of its components (including the embedded PDF engine), requires a licence.
// See https://pdfluent.com/license for terms.

import React, { useCallback } from 'react';
import type { FormFieldModelDto } from '../../lib/tauri-api';
import type { FieldLocalValue } from '../hooks/useFormModel';

/**
 * First-class AcroForm overlay: renders interactive HTML inputs over the page
 * bitmap at each widget's rectangle, for every logical field with a widget on
 * this page. Shown in normal read mode — no Form Mode required.
 *
 * The container is pointer-transparent; only the field inputs capture pointer
 * events, so clicking outside a field falls through to normal page interaction.
 * Inputs paint an (near-)opaque fill so a baked `/AP` underneath never shows
 * through as doubled text.
 */

interface FormOverlayProps {
  /** All logical fields (the overlay filters to widgets on this page). */
  fields: FormFieldModelDto[];
  pageIndex: number;
  pageHeightPt: number;
  zoom: number;
  /** Optimistic current values keyed by field name. */
  values: Record<string, FieldLocalValue>;
  /** When true, draw the Acrobat-style "highlight existing fields" emphasis. */
  highlight: boolean;
  onTextChange: (name: string, value: string) => void;
  onTextCommit: (name: string, value: string) => void;
  onCheckbox: (name: string, checked: boolean) => void;
  onRadio: (name: string, exportValue: string) => void;
  onChoice: (name: string, value: string) => void;
  onMultiChoice: (name: string, values: string[]) => void;
  /** Tab/Shift+Tab → resolve the next/previous field name and focus it. */
  onTab: (currentName: string, dir: 1 | -1) => void;
}

interface Box {
  left: number;
  top: number;
  width: number;
  height: number;
}

/** PDF user-space rect [x0,y0,x1,y1] → DOM box (y-flip), scaled by zoom. */
function boxOf(rect: [number, number, number, number], pageHeightPt: number, zoom: number): Box {
  const x0 = Math.min(rect[0], rect[2]);
  const y0 = Math.min(rect[1], rect[3]);
  const x1 = Math.max(rect[0], rect[2]);
  const y1 = Math.max(rect[1], rect[3]);
  return {
    left: x0 * zoom,
    top: (pageHeightPt - y1) * zoom,
    width: (x1 - x0) * zoom,
    height: (y1 - y0) * zoom,
  };
}

function fontPx(field: FormFieldModelDto, box: Box, zoom: number): number {
  const ptHeight = box.height / zoom;
  const auto = Math.min(ptHeight * 0.66, 12);
  const size = field.da.fontSize > 0 ? field.da.fontSize : auto;
  return Math.max(8, size * zoom);
}

export function FormOverlay({
  fields,
  pageIndex,
  pageHeightPt,
  zoom,
  values,
  highlight,
  onTextChange,
  onTextCommit,
  onCheckbox,
  onRadio,
  onChoice,
  onMultiChoice,
  onTab,
}: FormOverlayProps) {
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
    background: readOnly ? 'rgba(244,244,245,0.55)' : 'rgba(255,255,255,0.96)',
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
    const onThisPage = field.widgets.filter(w => w.pageIndex === pageIndex);
    const w0 = onThisPage[0];
    if (!w0) continue;
    const fpx = fontPx(field, boxOf(w0.rect, pageHeightPt, zoom), zoom);
    const v = values[field.name];

    switch (field.kind.type) {
      case 'text': {
        const box = boxOf(w0.rect, pageHeightPt, zoom);
        const strVal = typeof v === 'string' ? v : '';
        const align = field.quadding === 1 ? 'center' : field.quadding === 2 ? 'right' : 'left';
        if (field.kind.multiline) {
          elements.push(
            <textarea
              key={field.name}
              data-form-field={field.name}
              data-testid="form-field-input"
              value={strVal}
              readOnly={field.readOnly}
              maxLength={field.maxLen ?? undefined}
              title={field.tooltip ?? undefined}
              onChange={e => onTextChange(field.name, e.target.value)}
              onBlur={e => onTextCommit(field.name, e.target.value)}
              onKeyDown={e => handleTabKey(e, field.name)}
              style={{
                ...baseStyle(box, field.readOnly),
                resize: 'none',
                padding: '2px 4px',
                fontSize: fpx,
                textAlign: align,
                lineHeight: 1.2,
                fontFamily: 'Helvetica, Arial, sans-serif',
              }}
            />,
          );
        } else if (field.kind.comb && field.maxLen) {
          // Comb: fixed cells. letter-spacing spreads glyphs across the cells.
          const cellW = box.width / field.maxLen;
          elements.push(
            <input
              key={field.name}
              data-form-field={field.name}
              data-testid="form-field-input"
              type="text"
              value={strVal}
              readOnly={field.readOnly}
              maxLength={field.maxLen}
              title={field.tooltip ?? undefined}
              onChange={e => onTextChange(field.name, e.target.value)}
              onBlur={e => onTextCommit(field.name, e.target.value)}
              onKeyDown={e => handleTabKey(e, field.name)}
              style={{
                ...baseStyle(box, field.readOnly),
                textAlign: 'center',
                fontFamily: 'monospace',
                fontSize: Math.min(fpx, cellW * 1.1),
                letterSpacing: `${Math.max(0, cellW - fpx * 0.6)}px`,
                textIndent: `${Math.max(0, (cellW - fpx * 0.6) / 2)}px`,
                paddingLeft: 0,
                paddingRight: 0,
              }}
            />,
          );
        } else {
          elements.push(
            <input
              key={field.name}
              data-form-field={field.name}
              data-testid="form-field-input"
              type={field.kind.password ? 'password' : 'text'}
              value={strVal}
              readOnly={field.readOnly}
              maxLength={field.maxLen ?? undefined}
              title={field.tooltip ?? undefined}
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
                textAlign: align,
                fontFamily: 'Helvetica, Arial, sans-serif',
              }}
            />,
          );
        }
        break;
      }

      case 'checkbox': {
        const checked = v === true;
        for (let wi = 0; wi < onThisPage.length; wi++) {
          const cw = onThisPage[wi];
          if (!cw) continue;
          const box = boxOf(cw.rect, pageHeightPt, zoom);
          elements.push(
            <input
              key={`${field.name}#${wi}`}
              data-form-field={wi === 0 ? field.name : undefined}
              data-testid="form-field-checkbox"
              type="checkbox"
              checked={checked}
              disabled={field.readOnly}
              title={field.tooltip ?? undefined}
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
        break;
      }

      case 'radioGroup': {
        const options = field.kind.options;
        const selected = typeof v === 'string' ? v : '';
        for (let wi = 0; wi < onThisPage.length; wi++) {
          const widget = onThisPage[wi];
          if (!widget) continue;
          // Map this widget back to its option index via on-state.
          const exportValue =
            widget.onState ?? options[field.widgets.indexOf(widget)] ?? '';
          const box = boxOf(widget.rect, pageHeightPt, zoom);
          elements.push(
            <input
              key={`${field.name}#${wi}`}
              data-form-field={wi === 0 ? field.name : undefined}
              data-testid="form-field-radio"
              type="radio"
              name={field.name}
              checked={selected === exportValue && exportValue !== ''}
              disabled={field.readOnly}
              title={field.tooltip ?? undefined}
              onChange={() => onRadio(field.name, exportValue)}
              onKeyDown={e => {
                // Let arrows move within the group natively; intercept Tab.
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
        break;
      }

      case 'comboBox':
      case 'listBox': {
        const box = boxOf(w0.rect, pageHeightPt, zoom);
        const options = field.kind.options;
        const editable = field.kind.type === 'comboBox' && field.kind.editable;
        const isMultiSelect = field.kind.type === 'listBox' && field.kind.multiSelect;

        if (editable) {
          const strVal = typeof v === 'string' ? v : '';
          elements.push(
            <input
              key={field.name}
              data-form-field={field.name}
              data-testid="form-field-combo"
              type="text"
              list={`opts-${field.name}`}
              value={strVal}
              readOnly={field.readOnly}
              title={field.tooltip ?? undefined}
              onChange={e => onTextChange(field.name, e.target.value)}
              onBlur={e => onChoice(field.name, e.target.value)}
              onKeyDown={e => handleTabKey(e, field.name)}
              style={{ ...baseStyle(box, field.readOnly), padding: '0 4px', fontSize: fpx }}
            />,
          );
          elements.push(
            <datalist key={`dl-${field.name}`} id={`opts-${field.name}`}>
              {options.map(o => (
                <option key={o.export} value={o.display} />
              ))}
            </datalist>,
          );
        } else if (isMultiSelect) {
          const arrVal = Array.isArray(v) ? v : [];
          elements.push(
            <select
              key={field.name}
              multiple
              data-form-field={field.name}
              data-testid="form-field-multiselect"
              value={arrVal}
              disabled={field.readOnly}
              title={field.tooltip ?? undefined}
              onChange={e =>
                onMultiChoice(
                  field.name,
                  Array.from(e.target.selectedOptions, o => o.value),
                )
              }
              onKeyDown={e => handleTabKey(e, field.name)}
              style={{ ...baseStyle(box, field.readOnly), padding: '0 2px', fontSize: fpx }}
            >
              {options.map(o => (
                <option key={o.export} value={o.export}>
                  {o.display}
                </option>
              ))}
            </select>,
          );
        } else {
          const strVal = typeof v === 'string' ? v : '';
          elements.push(
            <select
              key={field.name}
              data-form-field={field.name}
              data-testid="form-field-select"
              value={strVal}
              disabled={field.readOnly}
              title={field.tooltip ?? undefined}
              onChange={e => onChoice(field.name, e.target.value)}
              onKeyDown={e => handleTabKey(e, field.name)}
              style={{ ...baseStyle(box, field.readOnly), padding: '0 2px', fontSize: fpx }}
            >
              <option value="" />
              {options.map(o => (
                <option key={o.export} value={o.export}>
                  {o.display}
                </option>
              ))}
            </select>,
          );
        }
        break;
      }

      // Push buttons and signatures are non-fill widgets: no overlay input.
      case 'pushButton':
      case 'signature':
        break;
    }
  }

  if (elements.length === 0) return null;

  return (
    <div
      data-testid="form-overlay"
      // z-index must exceed the PageCanvas overlay stack (AnnotationOverlay z=10,
      // OCR z=12, TextInteraction z=15, TextLayer z=20) so the field inputs are
      // the top hit-target and a click focuses them. The container itself stays
      // pointer-transparent, so clicks outside a field fall through to the text
      // layer below for selection.
      style={{ position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 30 }}
    >
      {elements}
    </div>
  );
}
