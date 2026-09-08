// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary. The PDFluent application is free to use,
// including for commercial purposes. Redistribution, or extraction or reuse
// of its components (including the embedded PDF engine), requires a licence.
// See https://pdfluent.com/license for terms.

/**
 * A control that looks like a chooser has to be one.
 *
 * The Convert panel carried a "Document language" field that rendered as a
 * dropdown — a rounded box, a label, a chevron — and was a plain `<div>` with a
 * hard-coded value of "Dutch". Nothing opened, nothing could be picked, and
 * nothing about the conversion depended on it. It survived because the UI
 * register walks buttons, tiles, panels and shortcuts; a `<div>` dressed as a
 * control is invisible to it, and this one was one screenshot away from an App
 * Store listing that showed the reviewer a language they could not change.
 *
 * So the shell's own styling is the thing checked here: the `select` class is
 * the dropdown look, and anything wearing it has to be a real `<select>`.
 */

import { readFileSync, readdirSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = resolve(import.meta.dirname, '..');
const SHELL = join(ROOT, 'src', 'viewer');

function shellFiles(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const abs = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name !== '__tests__') shellFiles(abs, out);
    } else if (/\.tsx$/.test(entry.name) && !entry.name.includes('.test.')) {
      out.push(abs);
    }
  }
  return out;
}

/** Every JSX tag that carries the dropdown class, with its element name. */
function dropdownLookalikes(source: string): { tag: string; line: number }[] {
  const found: { tag: string; line: number }[] = [];
  const lines = source.split('\n');
  lines.forEach((line, i) => {
    for (const m of line.matchAll(/<([A-Za-z][\w.]*)\b[^>]*className="([^"]*)"/g)) {
      const classes = m[2].split(/\s+/);
      if (classes.includes('select')) found.push({ tag: m[1], line: i + 1 });
    }
  });
  return found;
}

describe('no control pretends to be a chooser', () => {
  it('finds the ones it is looking for', () => {
    // The reader has to see the shape that fooled everyone, or a walker that
    // quietly stops matching reports a clean shell.
    expect(
      dropdownLookalikes('<div className="select"><span>Dutch</span><Chevron /></div>'),
    ).toEqual([{ tag: 'div', line: 1 }]);
    expect(dropdownLookalikes('<select className="select native-select">')).toEqual([
      { tag: 'select', line: 1 },
    ]);
    expect(dropdownLookalikes('<div className="selection-overlay">')).toEqual([]);
  });

  it.each(shellFiles(SHELL).map((f) => [relative(ROOT, f), f] as const))('%s', (rel, file) => {
    const offenders = dropdownLookalikes(readFileSync(file, 'utf8')).filter(
      (d) => d.tag !== 'select',
    );
    expect(
      offenders,
      offenders.map((o) => `${rel}:${o.line} <${o.tag}> looks like a dropdown and is not one`).join('\n'),
    ).toEqual([]);
  });
});
