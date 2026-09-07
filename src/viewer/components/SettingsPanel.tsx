// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary. The PDFluent application is free to use,
// including for commercial purposes. Redistribution, or extraction or reuse
// of its components (including the embedded PDF engine), requires a licence.
// See https://pdfluent.com/license for terms.

import { useCallback, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { XIcon } from 'lucide-react';
import { useFocusTrap } from '../hooks/useFocusTrap';
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

/**
 * Overlay settings dialog. Mounted modally with backdrop dismissal,
 * Escape-to-close, focus trap on the first input, and i18n-driven copy.
 * Uses the `.app-dialog` family + `.settings-*` primitives so the dialog
 * inherits the design system's motion, spacing and dark-mode behaviour.
 */
export function SettingsPanel({
  isOpen,
  onClose,
  settings,
  onSettingsChange,
}: SettingsPanelProps) {
  const { t } = useTranslation();
  const firstInputRef = useRef<HTMLInputElement | null>(null);
  const dialogRef = useRef<HTMLDivElement | null>(null);
  useFocusTrap(dialogRef, isOpen);

  const handleChange = useCallback(
    <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => {
      onSettingsChange({ ...settings, [key]: value });
    },
    [settings, onSettingsChange],
  );

  // Escape closes the dialog and focus lands on the first input on open.
  useEffect(() => {
    if (!isOpen) return;

    firstInputRef.current?.focus();

    function handleKey(event: KeyboardEvent): void {
      if (event.key === 'Escape') {
        event.stopPropagation();
        onClose();
      }
    }
    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('keydown', handleKey);
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div
      data-testid="settings-panel"
      className="app-dialog-backdrop"
      role="presentation"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={dialogRef}
        className="app-dialog settings-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="settings-dialog-title"
      >
        <header className="settings-dialog-header">
          <h2 className="app-dialog-title" id="settings-dialog-title">
            {t('settings.title')}
          </h2>
          <button
            type="button"
            data-testid="settings-close-btn"
            onClick={onClose}
            className="settings-dialog-close"
            aria-label={t('settings.close')}
            title={t('common.close')}
          >
            <XIcon aria-hidden="true" />
          </button>
        </header>

        <div className="settings-dialog-body">
          {/* ── Reviewer identity ─────────────────────────────────────── */}
          <section className="settings-section">
            <h3 className="settings-section-title">
              {t('settings.reviewerIdentity')}
            </h3>
            <label className="settings-row-label" htmlFor="settings-reviewer-name">
              {t('settings.reviewerNameLabel')}
            </label>
            <input
              ref={firstInputRef}
              id="settings-reviewer-name"
              data-testid="settings-reviewer-name"
              type="text"
              value={settings.defaultReviewerName}
              onChange={(e) => {
                handleChange('defaultReviewerName', e.target.value);
              }}
              placeholder={t('settings.reviewerNamePlaceholder')}
              className="settings-input"
            />
          </section>

          {/* ── Export preferences ─────────────────────────────────────── */}
          <section className="settings-section">
            <h3 className="settings-section-title">
              {t('settings.exportPreferences')}
            </h3>
            <label className="settings-row-label" htmlFor="settings-export-format">
              {t('settings.exportFormatLabel')}
            </label>
            <select
              id="settings-export-format"
              data-testid="settings-export-format"
              value={settings.defaultExportFormat}
              onChange={(e) => {
                handleChange(
                  'defaultExportFormat',
                  e.target.value as AppSettings['defaultExportFormat'],
                );
              }}
              className="settings-select"
            >
              <option value="markdown">Markdown</option>
              <option value="json">JSON</option>
              <option value="html">HTML</option>
            </select>
          </section>

          {/* ── Autosave ──────────────────────────────────────────────── */}
          <section className="settings-section">
            <h3 className="settings-section-title">
              {t('settings.autosave')}
            </h3>
            <label className="settings-toggle-row" htmlFor="settings-autosave-toggle">
              <input
                id="settings-autosave-toggle"
                data-testid="settings-autosave-toggle"
                type="checkbox"
                checked={settings.autosaveEnabled}
                onChange={(e) => {
                  handleChange('autosaveEnabled', e.target.checked);
                }}
                className="settings-checkbox"
              />
              <span>
                {t('settings.autosaveEnable')}
              </span>
            </label>
          </section>

          {/* ── Theme ─────────────────────────────────────────────────── */}
          <section className="settings-section">
            <h3 className="settings-section-title">
              {t('settings.theme')}
            </h3>
            <label className="settings-row-label" htmlFor="settings-theme">
              {t('settings.themeLabel')}
            </label>
            <select
              id="settings-theme"
              data-testid="settings-theme"
              value={settings.themePreference}
              onChange={(e) => {
                handleChange(
                  'themePreference',
                  e.target.value as AppSettings['themePreference'],
                );
              }}
              className="settings-select"
            >
              <option value="system">{t('settings.system')}</option>
              <option value="light">{t('settings.light')}</option>
              <option value="dark">{t('settings.dark')}</option>
            </select>
          </section>

          {/* ── OCR defaults ──────────────────────────────────────────── */}
          <section className="settings-section">
            <h3 className="settings-section-title">
              {t('settings.ocrDefaults')}
            </h3>
            <label className="settings-row-label" htmlFor="settings-ocr-language">
              {t('settings.ocrLanguageLabel')}
            </label>
            <input
              id="settings-ocr-language"
              data-testid="settings-ocr-language"
              type="text"
              value={settings.ocrDefaultLanguage}
              onChange={(e) => {
                handleChange('ocrDefaultLanguage', e.target.value);
              }}
              placeholder={t('settings.ocrLanguagePlaceholder')}
              className="settings-input"
            />
          </section>

          {/* ── Updates (default ON, and switchable — see LICENSE.md §4) ──── */}
          <section className="settings-section">
            <h3 className="settings-section-title">
              {t('settings.updates')}
            </h3>
            <label
              className="settings-toggle-row"
              htmlFor="settings-auto-update-toggle"
            >
              <input
                id="settings-auto-update-toggle"
                data-testid="settings-auto-update-toggle"
                type="checkbox"
                checked={settings.automaticUpdateCheckEnabled}
                onChange={(e) => {
                  handleChange('automaticUpdateCheckEnabled', e.target.checked);
                }}
                className="settings-checkbox"
              />
              <span>{t('settings.automaticUpdateCheck')}</span>
            </label>
            <p className="settings-help-text">
              {t('settings.automaticUpdateCheckHint')}
            </p>
          </section>

          {/* ── Crash & error reports (opt-in, default OFF) ───────────────── */}
          <section className="settings-section">
            <h3 className="settings-section-title">
              {t('telemetry.settingsTitle')}
            </h3>
            <label
              className="settings-toggle-row"
              htmlFor="settings-crash-reporting-toggle"
            >
              <input
                id="settings-crash-reporting-toggle"
                data-testid="settings-crash-reporting-toggle"
                type="checkbox"
                checked={settings.crashReportingEnabled}
                onChange={(e) => {
                  handleChange('crashReportingEnabled', e.target.checked);
                }}
                className="settings-checkbox"
              />
              <span>{t('telemetry.settingsToggle')}</span>
            </label>
            <p className="settings-help-text">
              {t('telemetry.settingsDescription')}
            </p>
            {settings.crashReportingEnabled && (
              <>
                <label
                  className="settings-toggle-row"
                  htmlFor="settings-crash-autosend-toggle"
                >
                  <input
                    id="settings-crash-autosend-toggle"
                    data-testid="settings-crash-autosend-toggle"
                    type="checkbox"
                    checked={settings.crashReportAutoSend}
                    onChange={(e) => {
                      handleChange('crashReportAutoSend', e.target.checked);
                    }}
                    className="settings-checkbox"
                  />
                  <span>{t('telemetry.settingsAutoSend')}</span>
                </label>
                <p className="settings-help-text">
                  {t('telemetry.settingsAutoSendNote')}
                </p>
              </>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
