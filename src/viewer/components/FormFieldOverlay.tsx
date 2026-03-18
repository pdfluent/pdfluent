// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary and confidential.
// Free for personal, non-commercial use.
// Commercial use requires a valid license.
// See https://pdfluent.com/license for terms.

import { useCallback, useRef } from 'react';
import type { FormField, FormFieldValue } from '../../core/document';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Field types rendered as a checkbox/radio input element. */
const CHECKBOX_FIELD_TYPES = new Set<string>(['checkbox', 'radio']);

/** Field types rendered as a <select> element. */
const SELECT_FIELD_TYPES = new Set<string>(['combo', 'list']);

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface FormFieldOverlayProps {
  /** Form fields for the current page (pre-filtered by caller). */
  fields: FormField[];
  /** Page height in PDF points — used for y-flip transform. */
  pageHeightPt: number;
  /** Zoom factor applied to all coordinates. */
  zoom: number;
  /** Called whenever a field value changes. */
  onSetFieldValue: (fieldId: string, value: FormFieldValue) => void;
  /** Index of the currently active/focused field (controlled by parent). */
  activeFieldIdx: number;
  /** Called to change the active field index. */
  onFieldSelect: (idx: number) => void;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function FormFieldOverlay({
  fields,
  pageHeightPt,
  zoom,
  onSetFieldValue,
  activeFieldIdx,
  onFieldSelect,
}: FormFieldOverlayProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  // Navigate to next/previous field on Tab/Shift+Tab, staying within this page.
  const handleKeyDown = useCallback((e: React.KeyboardEvent, localIdx: number) => {
    if (e.key === 'Tab') {
      e.preventDefault();
      const delta = e.shiftKey ? -1 : 1;
      const next = (localIdx + delta + fields.length) % fields.length;
      onFieldSelect(next);
      // Focus the sibling input after React re-renders
      const inputs = containerRef.current?.querySelectorAll<HTMLElement>(
        'input, select, textarea'
      );
      inputs?.[next]?.focus();
    }
  }, [fields.length, onFieldSelect]);

  if (fields.length === 0) return null;

  return (
    <div
      ref={containerRef}
      data-testid="form-field-overlay"
      style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}
    >
      {fields.map((field, localIdx) => {
        if (!field.visible) return null;

        // PDF y-up → DOM y-down coordinate transform (same as AnnotationOverlay)
        const domX = field.rect.x * zoom;
        const domY = (pageHeightPt - field.rect.y - field.rect.height) * zoom;
        const domW = field.rect.width * zoom;
        const domH = field.rect.height * zoom;

        const isActive = localIdx === activeFieldIdx;

        const commonStyle: React.CSSProperties = {
          position: 'absolute',
          left: domX,
          top: domY,
          width: domW,
          height: domH,
          pointerEvents: 'auto',
          boxSizing: 'border-box',
          fontSize: Math.max(10, Math.round(12 * zoom)),
          outline: 'none',
          border: field.required
            ? `1.5px solid rgba(220, 38, 38, ${isActive ? '0.9' : '0.6'})`
            : `1px solid rgba(59, 130, 246, ${isActive ? '0.8' : '0.35'})`,
          borderRadius: 2,
          background: isActive ? 'rgba(255,255,255,0.95)' : 'rgba(255,255,255,0.6)',
          cursor: field.readOnly ? 'default' : 'text',
          opacity: field.readOnly ? 0.65 : 1,
        };

        const sharedHandlers = {
          onFocus: () => { onFieldSelect(localIdx); },
          onKeyDown: (e: React.KeyboardEvent) => { handleKeyDown(e, localIdx); },
        };

        if (CHECKBOX_FIELD_TYPES.has(field.type)) {
          const checked = Boolean(field.value);
          return (
            <div
              key={field.id}
              data-testid="form-field-checkbox"
              data-field-id={field.id}
              style={{
                ...commonStyle,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                background: 'transparent',
                border: 'none',
                cursor: field.readOnly ? 'default' : 'pointer',
              }}
            >
              <input
                type={field.type === 'radio' ? 'radio' : 'checkbox'}
                checked={checked}
                readOnly={field.readOnly}
                style={{
                  width: Math.min(domW - 4, domH - 4),
                  height: Math.min(domW - 4, domH - 4),
                  cursor: field.readOnly ? 'default' : 'pointer',
                  accentColor: '#3b82f6',
                  pointerEvents: 'auto',
                }}
                onChange={() => {
                  if (!field.readOnly) onSetFieldValue(field.id, !checked);
                }}
                {...sharedHandlers}
              />
            </div>
          );
        }

        if (SELECT_FIELD_TYPES.has(field.type)) {
          const strValue = String(field.value ?? '');
          return (
            <select
              key={field.id}
              data-testid="form-field-select"
              data-field-id={field.id}
              value={strValue}
              disabled={field.readOnly}
              style={{ ...commonStyle, padding: '0 4px' }}
              onChange={e => { onSetFieldValue(field.id, e.target.value); }}
              {...sharedHandlers}
            />
          );
        }

        // Default: text input (covers 'text', 'number', 'date', 'time', 'password', etc.)
        const strValue = String(field.value ?? '');
        const inputType = field.type === 'password' ? 'password'
          : field.type === 'number' ? 'number'
          : field.type === 'date' ? 'date'
          : field.type === 'time' ? 'time'
          : 'text';
        return (
          <input
            key={field.id}
            data-testid="form-field-input"
            data-field-id={field.id}
            type={inputType}
            value={strValue}
            readOnly={field.readOnly}
            placeholder={field.tooltip ?? field.label}
            style={{ ...commonStyle, padding: '0 4px' }}
            onChange={e => {
              if (!field.readOnly) onSetFieldValue(field.id, e.target.value);
            }}
            onBlur={e => {
              if (!field.readOnly && e.target.value !== strValue) {
                onSetFieldValue(field.id, e.target.value);
              }
            }}
            {...sharedHandlers}
          />
        );
      })}
    </div>
  );
}
