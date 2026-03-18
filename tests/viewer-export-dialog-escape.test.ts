// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary and confidential.
// Free for personal, non-commercial use.
// Commercial use requires a valid license.
// See https://pdfluent.com/license for terms.

import { readFileSync } from 'node:fs';
import { describe, it, expect } from 'vitest';

const dialogSource = readFileSync(
  new URL('../src/viewer/components/ExportDialog.tsx', import.meta.url),
  'utf8'
);

// Locate the Escape key effect for scoped assertions
const escEffectStart = dialogSource.indexOf('Close on Escape key');
const escEffectEnd = dialogSource.indexOf('\n  if (!isOpen) return null;', escEffectStart);
const escSection = dialogSource.slice(escEffectStart, escEffectEnd);

// ---------------------------------------------------------------------------
// useRef for stable onClose
// ---------------------------------------------------------------------------

describe('ExportDialog — Escape handler: stable onClose ref', () => {
  it('imports useRef from react', () => {
    const importLine = dialogSource.slice(0, dialogSource.indexOf('interface ExportDialogProps'));
    expect(importLine).toContain('useRef');
  });

  it('creates onCloseRef with useRef', () => {
    expect(escSection).toContain('onCloseRef = useRef(onClose)');
  });

  it('keeps onCloseRef current on every render', () => {
    expect(escSection).toContain('onCloseRef.current = onClose');
  });
});

// ---------------------------------------------------------------------------
// Escape key effect
// ---------------------------------------------------------------------------

describe('ExportDialog — Escape handler: keydown effect', () => {
  it('checks for the Escape key', () => {
    expect(escSection).toContain("e.key === 'Escape'");
  });

  it('calls onCloseRef.current() when Escape is pressed', () => {
    expect(escSection).toContain('onCloseRef.current()');
  });

  it('registers a keydown listener', () => {
    expect(escSection).toContain("window.addEventListener('keydown', handleKey)");
  });

  it('removes the listener on cleanup', () => {
    expect(escSection).toContain("window.removeEventListener('keydown', handleKey)");
  });

  it('useEffect depends on isOpen', () => {
    expect(escSection).toContain('}, [isOpen])');
  });
});

// ---------------------------------------------------------------------------
// isOpen guard — no-op when dialog is closed
// ---------------------------------------------------------------------------

describe('ExportDialog — Escape handler: isOpen guard', () => {
  it('returns early when dialog is not open', () => {
    expect(escSection).toContain('if (!isOpen) return');
  });
});

// ---------------------------------------------------------------------------
// Existing close affordances unchanged
// ---------------------------------------------------------------------------

describe('ExportDialog — Escape handler: existing close affordances unchanged', () => {
  it('backdrop click still calls onClose', () => {
    expect(dialogSource).toContain('onClick={onClose}');
  });

  it('× button still calls onClose', () => {
    expect(dialogSource).toContain("aria-label={t('exportDialog.closeAriaLabel'");
  });

  it('Annuleren button still calls onClose', () => {
    expect(dialogSource).toContain("t('common.cancel'");
  });
});

// ---------------------------------------------------------------------------
// No regressions
// ---------------------------------------------------------------------------

describe('ExportDialog — Escape handler: no regressions', () => {
  it('reset-on-open effect still present', () => {
    expect(dialogSource).toContain('Reset state on each open');
    expect(dialogSource).toContain("setFormat('pdf')");
  });

  it('FORMAT_LABELS still exported', () => {
    expect(dialogSource).toContain('export const FORMAT_LABEL_KEYS');
  });

  it('handleExport function still present', () => {
    expect(dialogSource).toContain('async function handleExport()');
  });

  it('export button still present and wired', () => {
    expect(dialogSource).toContain('void handleExport()');
  });
});
