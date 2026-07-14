// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary. The PDFluent application is free to use,
// including for commercial purposes. Redistribution, or extraction or reuse
// of its components (including the embedded PDF engine), requires a licence.
// See https://pdfluent.com/license for terms.

import { memo } from 'react';

/**
 * Calm, form-focused bar shown when a document has fillable AcroForm fields.
 * Replaces the old open-time warning banner: it invites filling rather than
 * alarming. No security-theater wording — capability decisions (links etc.)
 * happen at the moment of use, not on open.
 */

interface FormBarProps {
  /** Number of fillable fields (logical fields). */
  fieldCount: number;
  /** Whether the Acrobat-style field highlight is on. */
  highlight: boolean;
  onToggleHighlight: () => void;
  /** Jump to and focus the first field in tab order. */
  onJumpToFirst: () => void;
  /**
   * When the user chose "always open links", this toggle stays visible so the
   * auto-open is transparent and reversible. Null = no auto-open preference.
   */
  autoOpenLinks: boolean | null;
  onToggleAutoOpenLinks: () => void;
}

export const FormBar = memo(function FormBar({
  fieldCount,
  highlight,
  onToggleHighlight,
  onJumpToFirst,
  autoOpenLinks,
  onToggleAutoOpenLinks,
}: FormBarProps) {
  return (
    <div className="v3-form-bar" data-testid="form-bar">
      <span className="form-bar-icon" aria-hidden="true">🖊️</span>
      <div className="form-bar-text">
        <strong>Invulbaar formulier</strong>
        <span className="form-bar-sub">
          {fieldCount} {fieldCount === 1 ? 'veld' : 'velden'} · klik om in te vullen.
          Automatische berekeningen uit Adobe worden niet uitgevoerd.
        </span>
      </div>
      <div className="form-bar-actions">
        {autoOpenLinks && (
          <button
            type="button"
            className="form-bar-toggle is-on"
            data-testid="form-bar-autolinks-toggle"
            onClick={onToggleAutoOpenLinks}
            title="Links worden automatisch in je browser geopend. Klik om dit uit te zetten."
          >
            Links automatisch openen ●
          </button>
        )}
        <button
          type="button"
          className={highlight ? 'form-bar-toggle is-on' : 'form-bar-toggle'}
          data-testid="form-bar-highlight-toggle"
          aria-pressed={highlight}
          onClick={onToggleHighlight}
        >
          Velden markeren
        </button>
        <button
          type="button"
          className="form-bar-action"
          data-testid="form-bar-jump-first"
          onClick={onJumpToFirst}
          disabled={fieldCount === 0}
        >
          Eerste veld
        </button>
      </div>
    </div>
  );
});
