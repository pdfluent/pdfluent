// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary. The PDFluent application is free to use,
// including for commercial purposes. Redistribution, or extraction or reuse
// of its components (including the embedded PDF engine), requires a licence.
// See https://pdfluent.com/license for terms.

// J-93: "27 languages". Every locale file has every key of the English one and
// no value left as an empty string. Read from the repository: it needs no app,
// so it is a plain step in every journey run.

import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { expect } from 'vitest';
import { journey } from './lib/journey';
import { repoFile } from './lib/env';

function leaves(o: unknown, prefix = ''): Record<string, string> {
  const out: Record<string, string> = {};
  if (o && typeof o === 'object') {
    for (const [k, v] of Object.entries(o as Record<string, unknown>)) Object.assign(out, leaves(v, prefix ? `${prefix}.${k}` : k));
  } else out[prefix] = String(o ?? '');
  return out;
}

journey('J-93', async (j) => {
  await j.step('27 locales, none missing a key or holding an empty value', async () => {
    const dir = path.dirname(repoFile('src/i18n/locales/en.json'));
    const files = readdirSync(dir).filter((f) => f.endsWith('.json'));
    expect(files.length, 'locale files').toBeGreaterThanOrEqual(27);
    const en = leaves(JSON.parse(readFileSync(path.join(dir, 'en.json'), 'utf8')));
    const problems: string[] = [];
    for (const f of files) {
      const l = leaves(JSON.parse(readFileSync(path.join(dir, f), 'utf8')));
      const missing = Object.keys(en).filter((k) => !(k in l));
      const empty = Object.keys(en).filter((k) => en[k] !== '' && l[k] === '');
      if (missing.length) problems.push(`${f}: ${missing.length} missing, e.g. ${missing[0]}`);
      if (empty.length) problems.push(`${f}: ${empty.length} empty, e.g. ${empty[0]}`);
    }
    expect(problems).toEqual([]);
  });
});
