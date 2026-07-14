// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary. The PDFluent application is free to use,
// including for commercial purposes. Redistribution, or extraction or reuse
// of its components (including the embedded PDF engine), requires a licence.
// See https://pdfluent.com/license for terms.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { describe, it, expect } from 'vitest';

// Guards against the shipped v3 editor regressing to hardcoded Dutch (or any
// hardcoded user-visible copy). Every user-facing string in the shipped shell —
// the v3 shell, the wrapping ViewerApp, the organize grid, the settings panel,
// and the review-summary export — must go through react-i18next (`t(...)` /
// `i18n.t(...)`), so English mode contains no unintended Dutch and Dutch mode
// stays complete.

const here = dirname(fileURLToPath(import.meta.url));
const SHELL_FILES = [
  resolve(here, '../EditorV3Shell.tsx'),
  resolve(here, '../../ViewerApp.tsx'),
  resolve(here, '../../components/OrganizeGrid.tsx'),
  resolve(here, '../../../components/Settings.tsx'),
  resolve(here, '../../export/reviewSummary.ts'),
];

// Dutch markers that should never appear in a user-visible string literal.
// Chosen to avoid English collisions (e.g. no bare "links").
const DUTCH = [
  'pagina', 'bestand', 'opslaan', 'openen', 'sluiten', 'delen', 'verwijder',
  'onderteken', 'converteer', 'converteren', 'afbeelding', 'archief', 'voeg',
  'kies', 'geen', 'wordt', 'werd', 'deze', 'toevoegen', 'comprimeren',
  'draaien', 'verlaat', 'apparaat', 'bestanden', 'nederlands', 'huidige',
  'vorige', 'volgende', 'notitie', 'opmerking', 'opmerkingen', 'licentie',
  'gevonden', 'ongeldig', 'stempel', 'klik', 'gebruik', 'gebruikers', 'terug',
  'vallen', 'verborgen', 'samenvoegen', 'samenvatting', 'gesplitste', 'minimaal',
  'bijvoorbeeld', 'bijlage', 'inhoud', 'geupload', 'geüpload', 'kopie',
  'verstuurt', 'beheren', 'modus', 'selecteer', 'geselecteerde', 'plaatsen',
  'initialen', 'handtekening', 'paginabereik', 'opgeslagen', 'verwisselbare',
  'diensten', 'beschikbare', 'functies', 'conforme', 'niets', 'annuleren',
  'tekenen', 'wissen', 'toepassen', 'donkere', 'zoeken', 'beveiligde', 'platte',
  'vastzetten', 'lagen', 'tekstvak', 'doorhalen', 'onderstrepen', 'voorlezen',
  'splits', 'verklein', 'bestandsgrootte', 'documenten', 'ontvanger', 'bericht',
  'vertrouwelijkheid', 'parafeerplekken', 'redigeer', 'redigeren', 'maakt',
  'levert', 'laden', 'externe', 'standaard', 'omzetten', 'mislukt', 'gelukt',
  'sleep', 'hierheen', 'invullen', 'volledig', 'persoonlijk', 'commercieel',
  'commentaren', 'redacties', 'problemen', 'wijziging', 'wijzigingen', 'losse',
  'verplaatsen', 'doorgaan', 'recente', 'instellingen', 'weergave',
];

// Substrings that are legitimately not UI copy (CSS font stacks, brand, code).
const ALLOW = [
  'cursive', 'Brush Script', 'Caveat', 'Satisfy', 'Lucida Handwriting',
  'PDFluent', 'PAdES', 'Promise', 'DOCX', 'XLSX', 'PPTX', 'OCR', 'PDF/A',
];

function stripComments(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/(^|[^:])\/\/[^\n]*/g, '$1 ');
}

function extractUserVisible(src: string): { line: number; text: string }[] {
  const out: { line: number; text: string }[] = [];
  const lines = src.split('\n');
  lines.forEach((ln, i) => {
    const lineNo = i + 1;
    const push = (text: string) => {
      const t = text.trim();
      if (t && /[A-Za-z]{2,}/.test(t)) out.push({ line: lineNo, text: t });
    };
    for (const m of ln.matchAll(/\b(?:title|aria-label|placeholder|alt|data-tip|okLabel|cancelLabel)="([^"]*)"/g)) {
      push(m[1]);
    }
    for (const m of ln.matchAll(/>([^<>{}\n]*[A-Za-z]{2,}[^<>{}\n]*)</g)) {
      push(m[1]);
    }
    for (const m of ln.matchAll(/\b(?:showToast|alert|confirm|setError|setStatus|push|lines\.push)\(\s*['"`]([^'"`]{3,})['"`]/g)) {
      push(m[1]);
    }
  });
  return out;
}

function isAllowed(text: string): boolean {
  return ALLOW.some((a) => text.includes(a)) && !DUTCH.some((d) => new RegExp(`\\b${d}`, 'i').test(text));
}

function isDutch(text: string): boolean {
  if (isAllowed(text)) return false;
  return DUTCH.some((d) => new RegExp(`\\b${d}`, 'i').test(text));
}

describe('shipped v3 editor internationalization', () => {
  for (const file of SHELL_FILES) {
    const name = file.split('/').slice(-1)[0];
    it(`contains no hardcoded Dutch user-visible strings: ${name}`, () => {
      const src = stripComments(readFileSync(file, 'utf8'));
      const offenders = extractUserVisible(src).filter((s) => isDutch(s.text));
      const report = offenders.map((o) => `  L${o.line}: ${o.text}`).join('\n');
      expect(offenders, `Hardcoded Dutch in ${name} — route through i18n:\n${report}`).toHaveLength(0);
    });
  }
});
