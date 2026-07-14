// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
// See https://pdfluent.com/license for terms.

export interface DetectedExternalLink {
  readonly label: string;
  readonly href: string;
}

const URL_OR_DOMAIN_RE =
  /\b(?:https?:\/\/[^\s<>"')\]]+|www\.[^\s<>"')\]]+|[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+(?:\/[^\s<>"')\]]*)?)/gi;

const ACCEPTED_TLDS = new Set([
  'app', 'com', 'dev', 'io', 'net', 'nl', 'org', 'co', 'ai', 'de', 'fr', 'be',
  'uk', 'us', 'eu', 'info', 'biz', 'edu', 'gov',
]);

function stripTrailingPunctuation(value: string): string {
  return value.replace(/[.,;:!?]+$/g, '');
}

function normalizeHref(value: string): string | null {
  const cleaned = stripTrailingPunctuation(value.trim());
  if (!cleaned) return null;

  const withScheme = /^https?:\/\//i.test(cleaned)
    ? cleaned
    : `https://${cleaned.replace(/^www\./i, 'www.')}`;

  try {
    const parsed = new URL(withScheme);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null;
    const tld = parsed.hostname.split('.').pop()?.toLowerCase() ?? '';
    if (!ACCEPTED_TLDS.has(tld)) return null;
    return parsed.toString();
  } catch {
    return null;
  }
}

export function extractFirstExternalLink(text: string): DetectedExternalLink | null {
  URL_OR_DOMAIN_RE.lastIndex = 0;

  for (const match of text.matchAll(URL_OR_DOMAIN_RE)) {
    const raw = match[0];
    const index = match.index ?? 0;
    if (index > 0 && text[index - 1] === '@') continue;

    const href = normalizeHref(raw);
    if (href) {
      return { label: stripTrailingPunctuation(raw), href };
    }
  }

  return null;
}
