// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary and confidential.
// Free for personal, non-commercial use.
// Commercial use requires a valid license.
// See https://pdfluent.com/license for terms.

/**
 * Shared interaction state model for PDFluent viewer components.
 *
 * Defines the canonical set of interaction states and provides
 * composable helpers for computing and querying them.
 */

// ---------------------------------------------------------------------------
// Core state type
// ---------------------------------------------------------------------------

/**
 * The seven interaction states that any interactive UI element can be in.
 * States are ordered from lowest to highest precedence.
 */
export type InteractionState =
  | 'idle'
  | 'hover'
  | 'focused'
  | 'selected'
  | 'editing'
  | 'dragging'
  | 'disabled';

/** Precedence order — higher index wins in conflict resolution. */
const STATE_PRECEDENCE: ReadonlyArray<InteractionState> = [
  'idle',
  'hover',
  'focused',
  'selected',
  'editing',
  'dragging',
  'disabled',
];

// ---------------------------------------------------------------------------
// Composable flags → state resolver
// ---------------------------------------------------------------------------

export interface InteractionFlags {
  isHovered?: boolean;
  isFocused?: boolean;
  isSelected?: boolean;
  isEditing?: boolean;
  isDragging?: boolean;
  isDisabled?: boolean;
}

/**
 * Compute the dominant interaction state from a set of boolean flags.
 * `disabled` always wins unless the element is dragging (drag must complete).
 */
export function getInteractionState(flags: InteractionFlags): InteractionState {
  if (flags.isDisabled) return 'disabled';
  if (flags.isDragging) return 'dragging';
  if (flags.isEditing) return 'editing';
  if (flags.isSelected) return 'selected';
  if (flags.isFocused) return 'focused';
  if (flags.isHovered) return 'hover';
  return 'idle';
}

// ---------------------------------------------------------------------------
// Predicate helpers
// ---------------------------------------------------------------------------

export function isHover(state: InteractionState): boolean {
  return state === 'hover';
}

export function isFocused(state: InteractionState): boolean {
  return state === 'focused';
}

export function isSelected(state: InteractionState): boolean {
  return state === 'selected';
}

export function isEditing(state: InteractionState): boolean {
  return state === 'editing';
}

export function isDragging(state: InteractionState): boolean {
  return state === 'dragging';
}

export function isDisabled(state: InteractionState): boolean {
  return state === 'disabled';
}

/** True for any interactive state (anything other than idle or disabled). */
export function isActive(state: InteractionState): boolean {
  return state !== 'idle' && state !== 'disabled';
}

/** True when the element is in a state where direct manipulation is possible. */
export function isEditable(state: InteractionState): boolean {
  return state === 'selected' || state === 'editing' || state === 'focused';
}

// ---------------------------------------------------------------------------
// Comparison utilities
// ---------------------------------------------------------------------------

/** Return the dominant state when two states compete (higher precedence wins). */
export function dominantState(a: InteractionState, b: InteractionState): InteractionState {
  const ai = STATE_PRECEDENCE.indexOf(a);
  const bi = STATE_PRECEDENCE.indexOf(b);
  return ai >= bi ? a : b;
}

// ---------------------------------------------------------------------------
// CSS class helpers
// ---------------------------------------------------------------------------

/**
 * Map an interaction state to a BEM-style modifier string.
 * Useful for generating data attributes or class names.
 */
export function stateToCssModifier(state: InteractionState): string {
  return `is-${state}`;
}

/**
 * Return the CSS data-attribute object for a given interaction state.
 * Components can spread this onto their root element for CSS targeting.
 *
 * @example
 * <div {...stateDataAttr(state)} />
 * // → <div data-interaction="selected" />
 */
export function stateDataAttr(state: InteractionState): Record<string, string> {
  return { 'data-interaction': state };
}
