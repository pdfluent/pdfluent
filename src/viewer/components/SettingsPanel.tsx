// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary and confidential.
// Free for personal, non-commercial use.
// Commercial use requires a valid license.
// See https://pdfluent.com/license for terms.

import { useCallback } from 'react';
import type { AppSettings } from '../state/appSettings';

interface SettingsPanelProps {
  /** Whether the panel is currently visible. */
  isOpen: boolean;
  /** Called when the user closes the panel. */
  onClose: () => void;
  /** Current settings object. */
  settings: AppSettings;
  /** Called with the full updated settings whenever a value changes. */
  onSettingsChange: (settings: AppSettings) => void;
}

/** Overlay settings panel accessible from the toolbar. */
export function SettingsPanel({ isOpen, onClose, settings, onSettingsChange }: SettingsPanelProps) {
  const handleChange = useCallback(
    <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => {
      onSettingsChange({ ...settings, [key]: value });
    },
    [settings, onSettingsChange],
  );

  if (!isOpen) return null;

  return (
    <div
      data-testid="settings-panel"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="bg-background border border-border rounded-xl shadow-xl w-[440px] max-h-[80vh] overflow-y-auto p-6">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-sm font-semibold text-foreground">Instellingen</h2>
          <button
            data-testid="settings-close-btn"
            onClick={onClose}
            className="text-muted-foreground hover:text-foreground transition-colors"
            aria-label="Instellingen sluiten"
          >
            ✕
          </button>
        </div>

        {/* Reviewer identity */}
        <section className="mb-5">
          <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">
            Reviewer identiteit
          </h3>
          <label className="block text-xs text-foreground mb-1">Standaard naam</label>
          <input
            data-testid="settings-reviewer-name"
            type="text"
            value={settings.defaultReviewerName}
            onChange={(e) => { handleChange('defaultReviewerName', e.target.value); }}
            placeholder="Naam voor annotaties"
            className="w-full text-xs border border-border rounded px-2 py-1.5 bg-background text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
          />
        </section>

        {/* Export preferences */}
        <section className="mb-5">
          <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">
            Exportinstellingen
          </h3>
          <label className="block text-xs text-foreground mb-1">Standaard exportformaat</label>
          <select
            data-testid="settings-export-format"
            value={settings.defaultExportFormat}
            onChange={(e) => { handleChange('defaultExportFormat', e.target.value as AppSettings['defaultExportFormat']); }}
            className="w-full text-xs border border-border rounded px-2 py-1.5 bg-background text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
          >
            <option value="markdown">Markdown</option>
            <option value="json">JSON</option>
            <option value="html">HTML</option>
          </select>
        </section>

        {/* Autosave */}
        <section className="mb-5">
          <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">
            Automatisch opslaan
          </h3>
          <label className="flex items-center gap-2 text-xs text-foreground cursor-pointer">
            <input
              data-testid="settings-autosave-toggle"
              type="checkbox"
              checked={settings.autosaveEnabled}
              onChange={(e) => { handleChange('autosaveEnabled', e.target.checked); }}
              className="rounded border-border"
            />
            Automatisch opslaan inschakelen
          </label>
        </section>

        {/* UI preferences */}
        <section className="mb-5">
          <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">
            Weergave
          </h3>
          <label className="block text-xs text-foreground mb-1">Thema</label>
          <select
            data-testid="settings-theme"
            value={settings.themePreference}
            onChange={(e) => { handleChange('themePreference', e.target.value as AppSettings['themePreference']); }}
            className="w-full text-xs border border-border rounded px-2 py-1.5 bg-background text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
          >
            <option value="system">Systeemvoorkeur</option>
            <option value="light">Licht</option>
            <option value="dark">Donker</option>
          </select>
        </section>

        {/* OCR defaults */}
        <section className="mb-5">
          <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">
            OCR-standaarden
          </h3>
          <label className="block text-xs text-foreground mb-1">Standaardtaal (ISO-639-2)</label>
          <input
            data-testid="settings-ocr-language"
            type="text"
            value={settings.ocrDefaultLanguage}
            onChange={(e) => { handleChange('ocrDefaultLanguage', e.target.value); }}
            placeholder="bijv. nld, eng, deu"
            className="w-full text-xs border border-border rounded px-2 py-1.5 bg-background text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
          />
        </section>
      </div>
    </div>
  );
}
