// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary and confidential.
// Free for personal, non-commercial use.
// Commercial use requires a valid license.
// See https://pdfluent.com/license for terms.

/**
 * BusyStateOverlay — ACROBAT_CLASS_RELIABILITY_AND_UX_HARDENING_BLOCK Batch 5
 *
 * Renders a full-screen blocking overlay during long-running operations.
 * Prevents user interaction while the application is busy and surfaces
 * progress information.
 *
 * Features:
 *   - Configurable operation label and optional progress (0–100)
 *   - Cancellable operations expose a cancel callback
 *   - Severity-aware styling (neutral / warning / error)
 *   - Accessible: aria-busy, aria-label, role="status"
 *   - Never rendered when busy=false
 */

import React from 'react';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type BusySeverity = 'neutral' | 'warning' | 'error';

export interface BusyStateProps {
  /** Whether the overlay is shown. */
  readonly busy: boolean;
  /** Human-readable label for the ongoing operation. */
  readonly label: string;
  /** Optional progress value 0–100. Null means indeterminate. */
  readonly progress?: number | null;
  /** If provided, show a cancel button that calls this function. */
  readonly onCancel?: (() => void) | null;
  /** Visual severity — affects overlay colour. */
  readonly severity?: BusySeverity;
  /** Test id for the root overlay element. */
  readonly testId?: string;
}

// ---------------------------------------------------------------------------
// Helpers (exported for testing)
// ---------------------------------------------------------------------------

/**
 * Clamp a progress value to the valid range [0, 100].
 * Returns null for null/undefined inputs (indeterminate).
 */
export function clampProgress(value: number | null | undefined): number | null {
  if (value === null || value === undefined) return null;
  return Math.max(0, Math.min(100, value));
}

/**
 * Return the CSS class suffix for a BusySeverity.
 */
export function severityClass(severity: BusySeverity): string {
  return `busy-overlay--${severity}`;
}

/**
 * Build the aria-label string from label and optional progress.
 */
export function buildAriaLabel(label: string, progress: number | null): string {
  if (progress === null) return label;
  return `${label} (${Math.round(progress)}%)`;
}

/**
 * Return true when a progress value represents completion (>= 100).
 */
export function isProgressComplete(progress: number | null): boolean {
  if (progress === null) return false;
  return progress >= 100;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/**
 * Full-screen busy overlay for long-running operations.
 * Renders null when busy=false.
 */
export function BusyStateOverlay({
  busy,
  label,
  progress = null,
  onCancel = null,
  severity = 'neutral',
  testId = 'busy-overlay',
}: BusyStateProps): React.ReactElement | null {
  if (!busy) return null;

  const clamped = clampProgress(progress);
  const ariaLabel = buildAriaLabel(label, clamped);
  const sevClass = severityClass(severity);

  return (
    <div
      className={`busy-overlay ${sevClass}`}
      role="status"
      aria-busy="true"
      aria-label={ariaLabel}
      data-testid={testId}
    >
      <div className="busy-overlay__content">
        <div className="busy-overlay__label">{label}</div>

        {clamped !== null && (
          <div
            className="busy-overlay__progress-bar"
            role="progressbar"
            aria-valuenow={clamped}
            aria-valuemin={0}
            aria-valuemax={100}
          >
            <div
              className="busy-overlay__progress-fill"
              style={{ width: `${clamped}%` }}
            />
          </div>
        )}

        {clamped === null && (
          <div className="busy-overlay__spinner" aria-hidden="true" />
        )}

        {onCancel !== null && (
          <button
            className="busy-overlay__cancel"
            onClick={onCancel}
            type="button"
          >
            Annuleren
          </button>
        )}
      </div>
    </div>
  );
}
