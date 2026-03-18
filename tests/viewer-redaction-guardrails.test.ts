// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary and confidential.
// Free for personal, non-commercial use.
// Commercial use requires a valid license.
// See https://pdfluent.com/license for terms.

import { readFileSync } from 'node:fs';
import { describe, it, expect } from 'vitest';

const panelSource = readFileSync(
  new URL('../src/viewer/components/RightContextPanel.tsx', import.meta.url),
  'utf8'
);

const engineSource = readFileSync(
  new URL('../src-tauri/src/pdf_engine.rs', import.meta.url),
  'utf8'
);

// Helper: get RedactionPanel body.
function redactionPanelBody(): string {
  const fnStart = panelSource.indexOf('function RedactionPanel(');
  const fnEnd = panelSource.indexOf('// Placeholder sections for modes not yet wired', fnStart);
  return panelSource.slice(fnStart, fnEnd);
}

// ---------------------------------------------------------------------------
// Guardrail: button disabled when no redactions
// ---------------------------------------------------------------------------

describe('Guardrails — apply button disabled when no redactions', () => {
  it('apply button has disabled prop', () => {
    expect(redactionPanelBody()).toContain('disabled=');
  });

  it('apply button is disabled when redactions.length === 0', () => {
    expect(redactionPanelBody()).toContain('redactions.length === 0');
  });

  it('RedactionPanel renders empty state when redactions list is empty', () => {
    expect(redactionPanelBody()).toContain('Geen redigeringen aanwezig.');
  });
});

// ---------------------------------------------------------------------------
// Guardrail: warn before destructive apply
// ---------------------------------------------------------------------------

describe('Guardrails — confirmation dialog before destructive apply', () => {
  it('apply handler calls window.confirm before proceeding', () => {
    expect(redactionPanelBody()).toContain('window.confirm(');
  });

  it('apply is skipped when confirm returns false', () => {
    expect(redactionPanelBody()).toContain('if (!confirmed) return');
  });

  it('confirmation message mentions permanent/cannot be undone', () => {
    const confirmIdx = redactionPanelBody().indexOf('window.confirm(');
    const msg = redactionPanelBody().slice(confirmIdx, confirmIdx + 300);
    // Dutch message must warn about permanent nature
    expect(msg).toContain('permanent');
  });
});

// ---------------------------------------------------------------------------
// Guardrail: prevent double-apply (busy state)
// ---------------------------------------------------------------------------

describe('Guardrails — prevent double-apply via busy state', () => {
  it('RedactionPanel has a busy state', () => {
    expect(redactionPanelBody()).toContain('busy');
    expect(redactionPanelBody()).toContain('setBusy(');
  });

  it('apply handler guards on busy before proceeding', () => {
    expect(redactionPanelBody()).toContain('if (busy) return');
  });

  it('apply button is disabled when busy', () => {
    const btnIdx = redactionPanelBody().indexOf('data-testid="apply-redactions-btn"');
    const btnAttrs = redactionPanelBody().slice(btnIdx, btnIdx + 200);
    expect(btnAttrs).toContain('busy');
  });

  it('apply button shows busy label when in progress', () => {
    expect(redactionPanelBody()).toContain('Bezig…');
  });
});

// ---------------------------------------------------------------------------
// Guardrail: apply_redactions backend safe with no-op (empty list)
// ---------------------------------------------------------------------------

describe('Guardrails — apply_redactions backend no-op for empty list', () => {
  it('apply_redactions returns zero-count report when no Redact annotations found', () => {
    const fnStart = engineSource.indexOf('pub fn apply_redactions(');
    const fnEnd = engineSource.indexOf('\n    pub fn ', fnStart + 10);
    const fnBody = engineSource.slice(fnStart, fnEnd);
    expect(fnBody).toContain('is_empty()');
    expect(fnBody).toContain('areas_redacted: 0');
    expect(fnBody).toContain('operations_removed: 0');
  });
});
