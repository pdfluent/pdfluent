// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary. The PDFluent application is free to use,
// including for commercial purposes. Redistribution, or extraction or reuse
// of its components (including the embedded PDF engine), requires a licence.
// See https://pdfluent.com/license for terms.

import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import en from './locales/en.json';
import nl from './locales/nl.json';
import ar from './locales/ar.json';
import cs from './locales/cs.json';
import da from './locales/da.json';
import de from './locales/de.json';
import el from './locales/el.json';
import es from './locales/es.json';
import fi from './locales/fi.json';
import fr from './locales/fr.json';
import hi from './locales/hi.json';
import hu from './locales/hu.json';
import id from './locales/id.json';
import it from './locales/it.json';
import ja from './locales/ja.json';
import ko from './locales/ko.json';
import nb from './locales/nb.json';
import pl from './locales/pl.json';
import pt from './locales/pt.json';
import ro from './locales/ro.json';
import ru from './locales/ru.json';
import sv from './locales/sv.json';
import th from './locales/th.json';
import tr from './locales/tr.json';
import vi from './locales/vi.json';
import zhCn from './locales/zh-CN.json';
import zhTw from './locales/zh-TW.json';

export const SUPPORTED_LANGUAGES = [
  'en', 'nl',
  'ar', 'cs', 'da', 'de', 'el', 'es', 'fi', 'fr',
  'hi', 'hu', 'id', 'it', 'ja', 'ko', 'nb', 'pl',
  'pt', 'ro', 'ru', 'sv', 'th', 'tr', 'vi', 'zh-CN', 'zh-TW',
] as const;
export type SupportedLanguage = typeof SUPPORTED_LANGUAGES[number];

export const LANGUAGE_NAMES: Record<SupportedLanguage, string> = {
  en: 'English',
  nl: 'Nederlands',
  ar: 'العربية',
  cs: 'Čeština',
  da: 'Dansk',
  de: 'Deutsch',
  el: 'Ελληνικά',
  es: 'Español',
  fi: 'Suomi',
  fr: 'Français',
  hi: 'हिन्दी',
  hu: 'Magyar',
  id: 'Bahasa Indonesia',
  it: 'Italiano',
  ja: '日本語',
  ko: '한국어',
  nb: 'Norsk (bokmål)',
  pl: 'Polski',
  pt: 'Português (Brasil)',
  ro: 'Română',
  ru: 'Русский',
  sv: 'Svenska',
  th: 'ภาษาไทย',
  tr: 'Türkçe',
  vi: 'Tiếng Việt',
  'zh-CN': '中文（简体）',
  'zh-TW': '中文（繁體）',
};

export const LANGUAGE_STORAGE_KEY = 'pdfluent-lang';

/** Best-effort map of an OS/browser locale tag to a supported language.
 *  In the Tauri WebView, navigator.language reflects the OS locale, so a
 *  Dutch macOS ("nl-NL") resolves to "nl". Exact tags (zh-CN/zh-TW) win
 *  before the base subtag. */
export function detectLanguageFromEnvironment(): SupportedLanguage | null {
  try {
    if (typeof navigator === 'undefined') return null;
    const candidates = [
      ...(Array.isArray(navigator.languages) ? navigator.languages : []),
      navigator.language,
    ].filter((tag): tag is string => typeof tag === 'string' && tag.length > 0);
    for (const tag of candidates) {
      const exact = SUPPORTED_LANGUAGES.find(
        (lang) => lang.toLowerCase() === tag.toLowerCase(),
      );
      if (exact) return exact;
      const base = tag.split('-')[0]?.toLowerCase();
      const baseMatch = base
        ? SUPPORTED_LANGUAGES.find((lang) => lang === base)
        : undefined;
      if (baseMatch) return baseMatch;
    }
  } catch { /* navigator unavailable */ }
  return null;
}

function getInitialLanguage(): string {
  try {
    const stored = localStorage.getItem(LANGUAGE_STORAGE_KEY);
    if (stored && SUPPORTED_LANGUAGES.includes(stored as SupportedLanguage)) {
      return stored;
    }
  } catch { /* localStorage unavailable */ }
  // No explicit user choice yet — follow the OS/browser locale so a Dutch
  // Mac shows Dutch automatically (like Adobe). Falls back to English.
  return detectLanguageFromEnvironment() ?? 'en';
}

void i18n
  .use(initReactI18next)
  .init({
    resources: {
      en:      { translation: en },
      nl:      { translation: nl },
      ar:      { translation: ar },
      cs:      { translation: cs },
      da:      { translation: da },
      de:      { translation: de },
      el:      { translation: el },
      es:      { translation: es },
      fi:      { translation: fi },
      fr:      { translation: fr },
      hi:      { translation: hi },
      hu:      { translation: hu },
      id:      { translation: id },
      it:      { translation: it },
      ja:      { translation: ja },
      ko:      { translation: ko },
      nb:      { translation: nb },
      pl:      { translation: pl },
      pt:      { translation: pt },
      ro:      { translation: ro },
      ru:      { translation: ru },
      sv:      { translation: sv },
      th:      { translation: th },
      tr:      { translation: tr },
      vi:      { translation: vi },
      'zh-CN': { translation: zhCn },
      'zh-TW': { translation: zhTw },
    },
    lng: getInitialLanguage(),
    fallbackLng: 'en',
    interpolation: {
      // React already escapes values — no need for i18next escaping
      escapeValue: false,
    },
  });

export default i18n;

/** Change language and persist the choice to localStorage. */
export function setLanguage(lang: SupportedLanguage): void {
  void i18n.changeLanguage(lang);
  try {
    localStorage.setItem(LANGUAGE_STORAGE_KEY, lang);
  } catch { /* ignore write errors */ }
}
