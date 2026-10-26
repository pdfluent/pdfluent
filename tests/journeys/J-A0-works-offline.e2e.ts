// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary. The PDFluent application is free to use,
// including for commercial purposes. Redistribution, or extraction or reuse
// of its components (including the embedded PDF engine), requires a licence.
// See https://pdfluent.com/license for terms.

// J-A0: "works 100% offline". The app may talk to exactly one host, the
// opt-in crash report endpoint, and the page's content security policy says so;
// no source file fetches another address. Judged on the shipped configuration
// and sources, so it holds on every platform without a network switch.

import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { expect } from 'vitest';
import { journey } from './lib/journey';
import { repoFile } from './lib/env';

function sources(dir: string, out: string[] = []): string[] {
  for (const f of readdirSync(dir)) {
    const p = path.join(dir, f);
    if (statSync(p).isDirectory()) {
      if (f === '__tests__' || f === 'node_modules') continue;
      sources(p, out);
    } else if (/\.(ts|tsx)$/.test(f) && !/\.test\./.test(f)) out.push(p);
  }
  return out;
}

journey('J-A0', async (j) => {
  await j.step('the policy lets the page reach only the report endpoint', async () => {
    const csp = JSON.parse(readFileSync(repoFile('src-tauri/tauri.conf.json'), 'utf8')).app.security.csp as string;
    const connect = csp.split(';').map((s) => s.trim()).find((s) => s.startsWith('connect-src')) ?? '';
    const remote = connect.split(/\s+/).filter((t) => /^https:\/\//.test(t));
    expect(remote).toEqual(['https://report.pdfluent.com']);
    expect(csp).not.toContain('unsafe-eval');
  });

  await j.step('no source file fetches an address of its own', async () => {
    const root = path.dirname(repoFile('src/main.tsx'));
    const hits: string[] = [];
    for (const f of sources(root)) {
      const text = readFileSync(f, 'utf8');
      for (const m of text.matchAll(/\bfetch\(\s*['"`](https?:\/\/[^'"`]+)/g)) {
        if (!/report\.pdfluent\.com/.test(m[1] ?? '')) hits.push(`${path.relative(root, f)}: ${m[1]}`);
      }
    }
    expect(hits).toEqual([]);
  });
});
