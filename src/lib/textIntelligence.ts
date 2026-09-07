// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
// See https://pdfluent.com/license for terms.

export type TextLanguageCode = 'en' | 'nl' | 'de' | 'fr' | 'es' | 'unknown';

export interface TextLanguageGuess {
  readonly language: TextLanguageCode;
  readonly bcp47: string;
  readonly label: string;
  readonly confidence: number;
  readonly scores: Partial<Record<TextLanguageCode, number>>;
}

const LANGUAGE_TAGS: Record<Exclude<TextLanguageCode, 'unknown'>, string> = {
  en: 'en-US',
  nl: 'nl-NL',
  de: 'de-DE',
  fr: 'fr-FR',
  es: 'es-ES',
};

const LANGUAGE_LABELS: Record<TextLanguageCode, string> = {
  en: 'Engels',
  nl: 'Nederlands',
  de: 'Duits',
  fr: 'Frans',
  es: 'Spaans',
  unknown: 'Onbekend',
};

const LANGUAGE_MARKERS: Record<Exclude<TextLanguageCode, 'unknown'>, ReadonlySet<string>> = {
  en: new Set([
    'the', 'and', 'that', 'with', 'for', 'this', 'from', 'are', 'was', 'were', 'work', 'data',
    'business', 'product', 'technical', 'enough', 'where', 'what', 'about', 'scale', 'build',
    'decision', 'stakeholder', 'advisory', 'public', 'sector',
  ]),
  nl: new Set([
    'de', 'het', 'een', 'en', 'van', 'voor', 'met', 'dat', 'die', 'dit', 'zijn', 'niet',
    'naar', 'over', 'door', 'als', 'ook', 'pdf', 'pagina', 'document', 'samenvatting',
  ]),
  de: new Set([
    'der', 'die', 'das', 'und', 'ist', 'mit', 'nicht', 'ein', 'eine', 'für', 'auf', 'von',
    'zu', 'den', 'dem', 'sich', 'dass',
  ]),
  fr: new Set([
    'le', 'la', 'les', 'des', 'une', 'un', 'et', 'est', 'pour', 'avec', 'dans', 'que',
    'qui', 'sur', 'pas', 'plus',
  ]),
  es: new Set([
    'el', 'la', 'los', 'las', 'una', 'un', 'y', 'es', 'para', 'con', 'en', 'que', 'por',
    'del', 'como', 'más',
  ]),
};

export function normalizeExtractedText(text: string): string {
  return repairPdfTextArtifacts(text)
    .replace(/\u00ad/g, '')
    .split('\u0000').join('')
    .replace(/[ \t\f\v]+/g, ' ')
    .replace(/\s+([,.;:!?])/g, '$1')
    .replace(/([([{])\s+/g, '$1')
    .replace(/\s+([)\]}])/g, '$1')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/**
 * Repair PDF ligature encoding bugs (InDesign exports map OpenType ligature
 * glyphs to wrong ToUnicode entries). Positional rules, not suffix lists:
 *
 * - "ti" encoded as ">", ";", "=" or "?": the glyph may sit mid-word
 *   ("nego>a>on" → "negotiation"), at word start ("">cket" → "ticket") or
 *   after a hyphen ("real->me" → "real-time"). Standalone punctuation
 *   survives because the next char must be a letter ("managing > €1 MM").
 * - "ti" encoded as the digit 7 ("Educa7on" → "Education") — strict: only
 *   BETWEEN letters, so "7th", "7-day" and "Windows 7" survive.
 * - "tf" encoded as capital O between lowercase letters ("plaOorm" → "platform").
 * - Standard Unicode ligatures (U+FB00–U+FB04) are decomposed.
 */
export function repairPdfTextArtifacts(text: string): string {
  const isAsciiLetter = (ch: string): boolean => /[A-Za-z]/.test(ch);

  // Glyph-reorder variant seen in the wild: "organis;aonal" — the ligature glyph
  // lands one position early, so the positional rule below cannot repair it.
  const reordered = text
    .replace(/\borganis[;=>?]aonal\b/gi, match => (match.charAt(0) === 'O' ? 'Organisational' : 'organisational'))
    .replace(/\borganiz[;=>?]aonal\b/gi, match => (match.charAt(0) === 'O' ? 'Organizational' : 'organizational'));

  let out = '';
  for (let i = 0; i < reordered.length; i++) {
    const ch = reordered.charAt(i);
    const prev = i > 0 ? reordered.charAt(i - 1) : '';
    const next = i + 1 < reordered.length ? reordered.charAt(i + 1) : '';

    const prevAlpha = isAsciiLetter(prev);
    const prevLoose = i === 0 || prevAlpha || prev === '-' || /\s/.test(prev);
    const nextValid = isAsciiLetter(next) || next === '-';

    if ((ch === '>' || ch === ';' || ch === '=' || ch === '?') && prevLoose && nextValid) {
      out += 'ti';
    } else if (ch === '7' && prevAlpha && isAsciiLetter(next)) {
      out += 'ti';
    } else if (ch === 'O' && /[a-z]/.test(prev) && /[a-z]/.test(next)) {
      out += 'tf';
    } else if (ch === 'ﬀ') {
      out += 'ff';
    } else if (ch === 'ﬁ') {
      out += 'fi';
    } else if (ch === 'ﬂ') {
      out += 'fl';
    } else if (ch === 'ﬃ') {
      out += 'ffi';
    } else if (ch === 'ﬄ') {
      out += 'ffl';
    } else {
      out += ch;
    }
  }
  return out;
}

export function detectTextLanguage(text: string): TextLanguageGuess {
  const normalized = normalizeExtractedText(text).toLowerCase();
  const words = normalized.match(/[\p{L}']+/gu) ?? [];
  const scores: Partial<Record<TextLanguageCode, number>> = {};

  for (const [language, markers] of Object.entries(LANGUAGE_MARKERS) as Array<[Exclude<TextLanguageCode, 'unknown'>, ReadonlySet<string>]>) {
    let score = 0;
    for (const word of words) {
      if (markers.has(word)) score += 2;
      if (word.length > 4 && markers.has(word.replace(/s$/, ''))) score += 1;
    }
    scores[language] = score;
  }

  if (/[àâçéèêëîïôùûüÿœ]/i.test(normalized)) scores.fr = (scores.fr ?? 0) + 3;
  if (/[äöüß]/i.test(normalized)) scores.de = (scores.de ?? 0) + 3;
  if (/[áéíóúñ¿¡]/i.test(normalized)) scores.es = (scores.es ?? 0) + 3;
  if (/\b(ij|zijn|voor|niet|een|het|de)\b/i.test(normalized)) scores.nl = (scores.nl ?? 0) + 2;

  const entries = (Object.entries(scores) as Array<[Exclude<TextLanguageCode, 'unknown'>, number]>)
    .sort((a, b) => b[1] - a[1]);
  const [bestLanguage, bestScore] = entries[0] ?? ['unknown', 0];
  const secondScore = entries[1]?.[1] ?? 0;
  const evidenceWords = words.length;
  const confidence = evidenceWords === 0 || bestScore < 3
    ? 0
    : Math.min(0.98, Math.max(0.35, (bestScore - secondScore + 1) / Math.max(4, bestScore + secondScore)));

  if (bestLanguage === 'unknown' || confidence < 0.34) {
    return {
      language: 'unknown',
      bcp47: 'en-US',
      label: LANGUAGE_LABELS.unknown,
      confidence,
      scores,
    };
  }

  return {
    language: bestLanguage,
    bcp47: LANGUAGE_TAGS[bestLanguage],
    label: LANGUAGE_LABELS[bestLanguage],
    confidence,
    scores,
  };
}

export function baseLanguage(tag: string | null | undefined): string {
  return (tag ?? '').trim().toLowerCase().replace('_', '-').split('-')[0] ?? '';
}
