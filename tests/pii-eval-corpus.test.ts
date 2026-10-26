// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary. The PDFluent application is free to use,
// including for commercial purposes. Redistribution, or extraction or reuse
// of its components (including the embedded PDF engine), requires a licence.
// See https://pdfluent.com/license for terms.

import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * The labelled corpus is generated, and the files in the tree are what the
 * generator makes. Edited by hand, or left behind after the generator changed,
 * the gate in src-tauri/tests/pii_eval.rs would score a corpus nobody can
 * reproduce.
 */
describe('PII evaluation corpus', () => {
  const generator = fileURLToPath(new URL('../src-tauri/tests/pii_eval/generate_corpus.py', import.meta.url));

  it('is exactly what generate_corpus.py produces', () => {
    const probe = spawnSync('python3', ['--version'], { encoding: 'utf8' });
    if (probe.error || probe.status !== 0) {
      console.error('SKIPPED (not a pass): python3 is not available, so the corpus was not compared with the generator');
      return;
    }
    const run = spawnSync('python3', ['-I', generator, '--check'], { encoding: 'utf8' });
    expect(run.stderr).toBe('');
    expect(run.status).toBe(0);
  });

  it('holds no real-looking personal data: e-mail only on reserved domains', () => {
    const domains = new Set<string>();
    for (const lang of ['en', 'nl', 'de', 'fr', 'es', 'it']) {
      const body = readFileSync(new URL(`../src-tauri/tests/pii_eval/corpus/${lang}.jsonl`, import.meta.url), 'utf8');
      for (const m of body.matchAll(/[a-z0-9._-]+@([a-z0-9.-]+\.[a-z]+)/g)) domains.add(m[1]);
    }
    expect([...domains].sort()).toEqual(['example.com', 'example.net', 'example.org', 'mail.example', 'post.test']);
  });
});
