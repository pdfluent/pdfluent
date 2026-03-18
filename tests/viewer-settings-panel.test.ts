// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary and confidential.
// Free for personal, non-commercial use.
// Commercial use requires a valid license.
// See https://pdfluent.com/license for terms.

import { readFileSync } from 'node:fs';
import { describe, it, expect } from 'vitest';

const panelSource = readFileSync(
  new URL('../src/viewer/components/SettingsPanel.tsx', import.meta.url),
  'utf8'
);

// ---------------------------------------------------------------------------
// Props interface
// ---------------------------------------------------------------------------

describe('SettingsPanel — props interface', () => {
  it('accepts isOpen boolean prop', () => {
    expect(panelSource).toContain('isOpen: boolean');
  });

  it('accepts onClose callback', () => {
    expect(panelSource).toContain('onClose: () => void');
  });

  it('accepts settings of type AppSettings', () => {
    expect(panelSource).toContain('settings: AppSettings');
  });

  it('accepts onSettingsChange callback', () => {
    expect(panelSource).toContain('onSettingsChange: (settings: AppSettings) => void');
  });
});

// ---------------------------------------------------------------------------
// Render guard
// ---------------------------------------------------------------------------

describe('SettingsPanel — render guard', () => {
  it('returns null when isOpen is false', () => {
    expect(panelSource).toContain('if (!isOpen) return null');
  });
});

// ---------------------------------------------------------------------------
// Root container
// ---------------------------------------------------------------------------

describe('SettingsPanel — root container', () => {
  it('renders data-testid="settings-panel"', () => {
    expect(panelSource).toContain('data-testid="settings-panel"');
  });

  it('renders a close button with data-testid="settings-close-btn"', () => {
    expect(panelSource).toContain('data-testid="settings-close-btn"');
  });

  it('close button calls onClose', () => {
    const btnStart = panelSource.indexOf('data-testid="settings-close-btn"');
    const btnSection = panelSource.slice(btnStart - 50, btnStart + 100);
    expect(btnSection).toContain('onClose');
  });
});

// ---------------------------------------------------------------------------
// Reviewer name input
// ---------------------------------------------------------------------------

describe('SettingsPanel — reviewer name', () => {
  it('renders data-testid="settings-reviewer-name" input', () => {
    expect(panelSource).toContain('data-testid="settings-reviewer-name"');
  });

  it('input is bound to settings.defaultReviewerName', () => {
    const inputStart = panelSource.indexOf('data-testid="settings-reviewer-name"');
    const block = panelSource.slice(inputStart - 20, inputStart + 200);
    expect(block).toContain('defaultReviewerName');
  });

  it('input onChange calls onSettingsChange', () => {
    expect(panelSource).toContain("handleChange('defaultReviewerName'");
  });
});

// ---------------------------------------------------------------------------
// Export format select
// ---------------------------------------------------------------------------

describe('SettingsPanel — export format', () => {
  it('renders data-testid="settings-export-format" select', () => {
    expect(panelSource).toContain('data-testid="settings-export-format"');
  });

  it('select is bound to settings.defaultExportFormat', () => {
    const selStart = panelSource.indexOf('data-testid="settings-export-format"');
    const block = panelSource.slice(selStart - 20, selStart + 200);
    expect(block).toContain('defaultExportFormat');
  });

  it('select contains markdown, json, html options', () => {
    const selStart = panelSource.indexOf('data-testid="settings-export-format"');
    const block = panelSource.slice(selStart, selStart + 700);
    expect(block).toContain('markdown');
    expect(block).toContain('json');
    expect(block).toContain('html');
  });
});

// ---------------------------------------------------------------------------
// Autosave toggle
// ---------------------------------------------------------------------------

describe('SettingsPanel — autosave toggle', () => {
  it('renders data-testid="settings-autosave-toggle" checkbox', () => {
    expect(panelSource).toContain('data-testid="settings-autosave-toggle"');
  });

  it('checkbox is bound to settings.autosaveEnabled', () => {
    const cbStart = panelSource.indexOf('data-testid="settings-autosave-toggle"');
    const block = panelSource.slice(cbStart - 20, cbStart + 200);
    expect(block).toContain('autosaveEnabled');
  });
});

// ---------------------------------------------------------------------------
// Theme select
// ---------------------------------------------------------------------------

describe('SettingsPanel — theme preference', () => {
  it('renders data-testid="settings-theme" select', () => {
    expect(panelSource).toContain('data-testid="settings-theme"');
  });

  it('select is bound to settings.themePreference', () => {
    const selStart = panelSource.indexOf('data-testid="settings-theme"');
    const block = panelSource.slice(selStart - 20, selStart + 200);
    expect(block).toContain('themePreference');
  });

  it('select offers system, light, dark options', () => {
    const selStart = panelSource.indexOf('data-testid="settings-theme"');
    const block = panelSource.slice(selStart, selStart + 700);
    expect(block).toContain('system');
    expect(block).toContain('light');
    expect(block).toContain('dark');
  });
});

// ---------------------------------------------------------------------------
// OCR language input
// ---------------------------------------------------------------------------

describe('SettingsPanel — OCR language', () => {
  it('renders data-testid="settings-ocr-language" input', () => {
    expect(panelSource).toContain('data-testid="settings-ocr-language"');
  });

  it('input is bound to settings.ocrDefaultLanguage', () => {
    const inputStart = panelSource.indexOf('data-testid="settings-ocr-language"');
    const block = panelSource.slice(inputStart - 20, inputStart + 200);
    expect(block).toContain('ocrDefaultLanguage');
  });
});

// ---------------------------------------------------------------------------
// Change handler wiring
// ---------------------------------------------------------------------------

describe('SettingsPanel — handleChange wiring', () => {
  it('uses handleChange helper to update settings fields', () => {
    expect(panelSource).toContain('const handleChange = useCallback');
  });

  it('handleChange spreads settings and overrides the changed key', () => {
    const start = panelSource.indexOf('const handleChange = useCallback');
    const end = panelSource.indexOf('\n  )', start) + 3;
    const body = panelSource.slice(start, end);
    expect(body).toContain('{ ...settings, [key]: value }');
  });
});
