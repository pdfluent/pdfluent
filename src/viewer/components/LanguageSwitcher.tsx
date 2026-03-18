// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary and confidential.
// Free for personal, non-commercial use.
// Commercial use requires a valid license.
// See https://pdfluent.com/license for terms.

import { useTranslation } from 'react-i18next';
import {
  SUPPORTED_LANGUAGES,
  LANGUAGE_NAMES,
  setLanguage,
  type SupportedLanguage,
} from '../../i18n';

/**
 * Compact language toggle for use in settings panels and menus.
 * Renders a <select> with EN / NL options; persists choice to localStorage.
 */
export function LanguageSwitcher() {
  const { i18n } = useTranslation();
  const current = (i18n.language ?? 'en') as SupportedLanguage;

  return (
    <select
      data-testid="language-switcher"
      value={current}
      onChange={e => { setLanguage(e.target.value as SupportedLanguage); }}
      className="text-xs bg-transparent border border-border rounded px-1.5 py-0.5 text-muted-foreground hover:text-foreground cursor-pointer"
      aria-label="Language / Taal"
    >
      {SUPPORTED_LANGUAGES.map(lang => (
        <option key={lang} value={lang}>
          {LANGUAGE_NAMES[lang]}
        </option>
      ))}
    </select>
  );
}
