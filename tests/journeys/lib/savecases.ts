// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary. The PDFluent application is free to use,
// including for commercial purposes. Redistribution, or extraction or reuse
// of its components (including the embedded PDF engine), requires a licence.
// See https://pdfluent.com/license for terms.

// Building blocks for the save-and-open journeys (J-A3, J-B1, J-B2): make an
// edit that leaves two independent marks in the file (a form value and a
// note), and read both back from the saved bytes and from a
// freshly opened app. "Saved" means the file says so, and a reopened document
// shows it, not that the dirty marker went away.

import { spawn, type ChildProcess } from 'node:child_process';
import { expect } from 'vitest';
import type { Journey } from './journey';
import type { PdfReport } from './pdfcheck';
import { clickAria, fill, settledPageDigest, sleep, waitDirty } from './ui';

export const field = (name: string): string => `[data-form-field="${name}"]`;

/** One edit with two marks, each read back from the saved file: the name field and a note. */
export async function markDocument(j: Journey, tag: string): Promise<void> {
  await j.waitFor('[data-testid="form-overlay"]');
  await fill(j, field('full_name'), `Ada ${tag}`);
  // Field edits commit on blur.
  await j.s.click('[data-testid="page-view"]');
  await sleep(400);
  await clickAria(j, 'Note');
  await j.s.click('[data-testid="page-view"]');
  await j.waitFor('[data-testid="comment-edit-textarea"]');
  await fill(j, '[data-testid="comment-edit-textarea"]', `Note ${tag}`);
  await j.s.click('[data-testid="comment-edit-confirm-btn"]');
  await waitDirty(j, true);
}

/** The file carries every mark `markDocument(tag)` made, and still opens. */
export function expectMarked(j: Journey, file: string, tag: string): PdfReport {
  const r = j.inspect(file);
  expect(r.opens, `${file} must open: ${r.open_error}`).toBe(true);
  expect(r.page_count).toBeGreaterThanOrEqual(1);
  const values = Object.fromEntries((r.form_fields ?? []).map((f) => [f.name, f.value]));
  expect(values.full_name).toBe(`Ada ${tag}`);
  const notes = (r.annotations ?? []).map((a) => a.contents ?? '');
  expect(notes.some((c) => c.includes(`Note ${tag}`)), `a note "Note ${tag}" in ${JSON.stringify(notes)}`).toBe(true);
  return r;
}

/**
 * Close the app, open `file` in a new one, and check what a person sees: the
 * page count, a rendered page, the form field's value, the note in the list.
 */
export async function reopenAndVerify(
  j: Journey,
  file: string,
  tag: string,
  pages: number,
  start: { sandbox?: boolean } = {},
): Promise<void> {
  await j.stop();
  await j.start({ open: file, ...start });
  await j.waitForDocument(pages);
  const digest = await settledPageDigest(j);
  expect(digest, 'the first page renders').toMatch(/^\d+x\d+:/);
  expect(await j.s.call<string>('value', field('full_name'))).toBe(`Ada ${tag}`);
  expect(await j.backendDirty()).toBe(false);
}

/**
 * Hold `file` open in another process, the way a program that has it open
 * does. `share` is the .NET FileShare name: `None` refuses every other opener,
 * `Read` lets others read but not replace or delete it (a viewer, an indexer,
 * a sync client). Windows only. Call `.release()` to let go.
 */
export async function holdOpen(file: string, share: 'None' | 'Read'): Promise<{ release(): void }> {
  if (process.platform !== 'win32') throw new Error('holdOpen is for Windows');
  const quoted = file.replace(/'/g, "''");
  const script = `$f=[System.IO.File]::Open('${quoted}','Open','Read','${share}'); Write-Output 'held'; Start-Sleep -Seconds 600`;
  const child: ChildProcess = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], { stdio: ['ignore', 'pipe', 'pipe'] });
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('the holder process did not take the file within 30 s')), 30_000);
    child.stdout?.on('data', (d: Buffer) => {
      if (String(d).includes('held')) { clearTimeout(timer); resolve(); }
    });
    child.on('exit', (code) => { clearTimeout(timer); reject(new Error(`the holder exited early (${code})`)); });
  });
  return {
    release() {
      if (child.pid) spawn('taskkill', ['/F', '/T', '/PID', String(child.pid)], { stdio: 'ignore' });
    },
  };
}
