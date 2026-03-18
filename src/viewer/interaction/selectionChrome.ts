// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary and confidential.
// Free for personal, non-commercial use.
// Commercial use requires a valid license.
// See https://pdfluent.com/license for terms.

/**
 * Selection chrome system.
 *
 * Provides visual outline geometry for hover, selected, and editing states.
 * Components (AnnotationOverlay, future text editor) consume these helpers
 * to render consistent selection feedback without duplicating the visual logic.
 *
 * All output is pure data — no DOM side-effects.
 * SVG rect attributes are the primary output format since the annotation
 * layer already uses SVG.
 */

import type { InteractionState } from './interactionState';

// ---------------------------------------------------------------------------
// Geometry
// ---------------------------------------------------------------------------

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** SVG <rect> visual attributes produced by the chrome system. */
export interface ChromeRectAttrs {
  strokeColor: string;
  strokeWidth: number;
  strokeOpacity: number;
  strokeDasharray?: string;
  fillColor: string;
  fillOpacity: number;
  rx: number;
}

// ---------------------------------------------------------------------------
// Object-kind-specific chrome definitions
// ---------------------------------------------------------------------------

export type ChromeObjectKind =
  | 'annotation'
  | 'annotation-redaction'
  | 'form-field'
  | 'text-block'
  | 'page-thumbnail'
  | 'shape';

// ---------------------------------------------------------------------------
// Core factory
// ---------------------------------------------------------------------------

/**
 * Return the visual chrome attributes for an object of the given kind
 * in the given interaction state.
 *
 * Returns null for `idle` state (no chrome rendered).
 */
export function getChromeAttrs(
  kind: ChromeObjectKind,
  state: InteractionState,
): ChromeRectAttrs | null {
  if (state === 'idle' || state === 'disabled') return null;

  switch (kind) {
    case 'annotation':
      return annotationChrome(state);
    case 'annotation-redaction':
      return redactionChrome(state);
    case 'form-field':
      return formFieldChrome(state);
    case 'text-block':
      return textBlockChrome(state);
    case 'page-thumbnail':
      return pageThumbnailChrome(state);
    case 'shape':
      return shapeChrome(state);
    default:
      return defaultChrome(state);
  }
}

// ---------------------------------------------------------------------------
// Per-kind definitions
// ---------------------------------------------------------------------------

function annotationChrome(state: InteractionState): ChromeRectAttrs {
  switch (state) {
    case 'hover':
      return {
        strokeColor: 'rgb(37, 99, 235)',    // blue-600
        strokeWidth: 1.5,
        strokeOpacity: 0.6,
        strokeDasharray: '4 3',
        fillColor: 'rgb(219, 234, 254)',    // blue-100
        fillOpacity: 0.15,
        rx: 2,
      };
    case 'selected':
      return {
        strokeColor: 'rgb(37, 99, 235)',    // blue-600
        strokeWidth: 2,
        strokeOpacity: 1,
        fillColor: 'rgb(219, 234, 254)',
        fillOpacity: 0.08,
        rx: 2,
      };
    case 'editing':
      return {
        strokeColor: 'rgb(5, 150, 105)',    // emerald-600
        strokeWidth: 2,
        strokeOpacity: 1,
        fillColor: 'rgb(209, 250, 229)',    // emerald-100
        fillOpacity: 0.12,
        rx: 2,
      };
    case 'focused':
      return {
        strokeColor: 'rgb(99, 102, 241)',   // indigo-500
        strokeWidth: 1.5,
        strokeOpacity: 0.8,
        strokeDasharray: '3 2',
        fillColor: 'transparent',
        fillOpacity: 0,
        rx: 2,
      };
    default:
      return defaultChrome(state);
  }
}

function redactionChrome(state: InteractionState): ChromeRectAttrs {
  switch (state) {
    case 'hover':
      return {
        strokeColor: 'rgb(239, 68, 68)',    // red-500
        strokeWidth: 1.5,
        strokeOpacity: 0.7,
        strokeDasharray: '4 2',
        fillColor: 'transparent',
        fillOpacity: 0,
        rx: 0,
      };
    case 'selected':
      return {
        strokeColor: 'rgb(220, 38, 38)',    // red-600
        strokeWidth: 2.5,
        strokeOpacity: 1,
        fillColor: 'transparent',
        fillOpacity: 0,
        rx: 0,
      };
    default:
      return annotationChrome(state);
  }
}

function formFieldChrome(state: InteractionState): ChromeRectAttrs {
  switch (state) {
    case 'hover':
      return {
        strokeColor: 'rgb(59, 130, 246)',   // blue-500
        strokeWidth: 1,
        strokeOpacity: 0.5,
        strokeDasharray: '3 2',
        fillColor: 'rgb(239, 246, 255)',    // blue-50
        fillOpacity: 0.3,
        rx: 3,
      };
    case 'focused':
    case 'editing':
      return {
        strokeColor: 'rgb(37, 99, 235)',    // blue-600
        strokeWidth: 2,
        strokeOpacity: 1,
        fillColor: 'rgb(239, 246, 255)',
        fillOpacity: 0.2,
        rx: 3,
      };
    case 'selected':
      return {
        strokeColor: 'rgb(79, 70, 229)',    // violet-600
        strokeWidth: 2,
        strokeOpacity: 1,
        fillColor: 'rgb(237, 233, 254)',    // violet-100
        fillOpacity: 0.15,
        rx: 3,
      };
    default:
      return defaultChrome(state);
  }
}

function textBlockChrome(state: InteractionState): ChromeRectAttrs {
  switch (state) {
    case 'hover':
      return {
        strokeColor: 'rgb(148, 163, 184)',  // slate-400
        strokeWidth: 1,
        strokeOpacity: 0.4,
        strokeDasharray: '2 2',
        fillColor: 'transparent',
        fillOpacity: 0,
        rx: 1,
      };
    case 'selected':
      return {
        strokeColor: 'rgb(59, 130, 246)',
        strokeWidth: 1.5,
        strokeOpacity: 0.8,
        fillColor: 'rgb(219, 234, 254)',
        fillOpacity: 0.15,
        rx: 1,
      };
    case 'editing':
      return {
        strokeColor: 'rgb(5, 150, 105)',
        strokeWidth: 2,
        strokeOpacity: 1,
        fillColor: 'transparent',
        fillOpacity: 0,
        rx: 1,
      };
    default:
      return defaultChrome(state);
  }
}

function pageThumbnailChrome(state: InteractionState): ChromeRectAttrs {
  switch (state) {
    case 'hover':
      return {
        strokeColor: 'rgb(148, 163, 184)',
        strokeWidth: 1.5,
        strokeOpacity: 0.5,
        fillColor: 'transparent',
        fillOpacity: 0,
        rx: 4,
      };
    case 'selected':
      return {
        strokeColor: 'rgb(37, 99, 235)',
        strokeWidth: 2,
        strokeOpacity: 1,
        fillColor: 'transparent',
        fillOpacity: 0,
        rx: 4,
      };
    default:
      return defaultChrome(state);
  }
}

function shapeChrome(state: InteractionState): ChromeRectAttrs {
  return annotationChrome(state);
}

function defaultChrome(state: InteractionState): ChromeRectAttrs {
  return {
    strokeColor: state === 'selected' ? 'rgb(37, 99, 235)' : 'rgb(148, 163, 184)',
    strokeWidth: state === 'selected' ? 2 : 1,
    strokeOpacity: state === 'selected' ? 1 : 0.5,
    fillColor: 'transparent',
    fillOpacity: 0,
    rx: 2,
  };
}

// ---------------------------------------------------------------------------
// SVG attribute spread helper
// ---------------------------------------------------------------------------

/**
 * Convert ChromeRectAttrs to React SVG element props.
 * Spread directly onto a <rect> element.
 *
 * @example
 * const attrs = getChromeAttrs('annotation', 'selected');
 * if (attrs) {
 *   return <rect {...rect} {...chromeToSvgProps(attrs)} />;
 * }
 */
export function chromeToSvgProps(attrs: ChromeRectAttrs): Record<string, string | number> {
  const props: Record<string, string | number> = {
    stroke: attrs.strokeColor,
    strokeWidth: attrs.strokeWidth,
    strokeOpacity: attrs.strokeOpacity,
    fill: attrs.fillColor,
    fillOpacity: attrs.fillOpacity,
    rx: attrs.rx,
  };
  if (attrs.strokeDasharray) {
    props['strokeDasharray'] = attrs.strokeDasharray;
  }
  return props;
}

// ---------------------------------------------------------------------------
// Padding / expand utility
// ---------------------------------------------------------------------------

/**
 * Expand a rect by `padding` pixels on all sides.
 * Used to draw chrome outside the content boundary.
 */
export function expandRect(rect: Rect, padding: number): Rect {
  return {
    x: rect.x - padding,
    y: rect.y - padding,
    width: rect.width + padding * 2,
    height: rect.height + padding * 2,
  };
}
