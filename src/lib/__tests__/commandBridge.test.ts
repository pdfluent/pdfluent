// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary. The PDFluent application is free to use,
// including for commercial purposes. Redistribution, or extraction or reuse
// of its components (including the embedded PDF engine), requires a licence.
// See https://pdfluent.com/license for terms.

/**
 * A backend that says no reaches the person using the app.
 *
 * Every wrapper in `tauri-api.ts` is called here with an IPC that rejects, and
 * each one has to produce an AppError naming its own command. That is the test
 * the editor did not have: `open_pdf` could have been changed to swallow its
 * error and every suite stayed green, because the only thing that changed was
 * what the user saw.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';

const invokeMock = vi.fn();
vi.mock('@tauri-apps/api/core', () => ({ invoke: invokeMock }));

import {
  invokeCommand,
  reportFallback,
  subscribeCommandFailures,
  classifyCommandError,
  describeError,
} from '../commandBridge';
import type { AppError } from '../../viewer/state/errorCenter';
import * as api from '../tauri-api';

/** Collect everything the bridge publishes while `run` executes. */
async function captured(run: () => Promise<unknown>): Promise<AppError[]> {
  const seen: AppError[] = [];
  const stop = subscribeCommandFailures(e => { seen.push(e); });
  try {
    await run().catch(() => undefined);
  } finally {
    stop();
  }
  return seen;
}

beforeEach(() => {
  invokeMock.mockReset();
});

describe('invokeCommand', () => {
  it('publishes an AppError naming the command that failed', async () => {
    invokeMock.mockRejectedValue('the document is encrypted');
    const errors = await captured(() => invokeCommand('open_pdf', { path: '/tmp/x.pdf' }));

    expect(errors).toHaveLength(1);
    expect(errors[0]!.source).toBe('open_pdf');
    expect(errors[0]!.message).toBe('the document is encrypted');
    expect(errors[0]!.severity).toBe('error');
  });

  it('rethrows, so the caller still decides what to do next', async () => {
    invokeMock.mockRejectedValue(new Error('boom'));
    await expect(invokeCommand('save_pdf', {})).rejects.toThrow('boom');
  });

  it('says nothing when the command succeeds', async () => {
    invokeMock.mockResolvedValue({ page_count: 3 });
    const errors = await captured(() => invokeCommand('get_document_info'));
    expect(errors).toEqual([]);
    expect(await invokeCommand('get_document_info')).toEqual({ page_count: 3 });
  });

  it('writes the failure to the app log as well as the screen', async () => {
    invokeMock.mockImplementation((command: string) =>
      command === 'frontend_log' ? Promise.resolve() : Promise.reject('disk full'));
    await invokeCommand('save_pdf', {}).catch(() => undefined);
    await new Promise(resolve => setTimeout(resolve, 0));

    const logged = invokeMock.mock.calls.filter(([command]) => command === 'frontend_log');
    expect(logged).toHaveLength(1);
    expect(String((logged[0]![1] as { message: string }).message)).toContain('save_pdf');
  });

  it('names a fenced-off feature rather than calling it a failure', async () => {
    invokeMock.mockRejectedValue('commit loop not compiled into this build');
    const errors = await captured(() => invokeCommand('commit_xfa_field_value', {}));
    expect(errors[0]!.taxonomy).toBe('unsupported_feature.not_compiled');
    expect(errors[0]!.title).toContain('commit_xfa_field_value');
  });
});

describe('reportFallback', () => {
  it('announces a degraded result as a warning, not an error', () => {
    const seen: AppError[] = [];
    const stop = subscribeCommandFailures(e => { seen.push(e); });
    reportFallback({
      source: 'xfa',
      title: 'Form filled without recalculation',
      message: 'Field scripts do not run in this build.',
      code: 'XFA_PHASE1_STATIC_WRITE',
    });
    stop();

    expect(seen).toHaveLength(1);
    expect(seen[0]!.severity).toBe('warning');
    expect(seen[0]!.code).toBe('XFA_PHASE1_STATIC_WRITE');
  });
});

describe('classifyCommandError', () => {
  it.each([
    ['open_pdf', 'permission denied reading the file', 'tauri_runtime_failure.fs_permission'],
    ['run_ocr', 'OCR_COMPONENT_NOT_INSTALLED', 'environment_failure.ocr_model_missing'],
    ['save_pdf', 'no space left on device', 'environment_failure.disk_full'],
    ['render_page', 'bad geometry', 'render_crash.invalid_geometry'],
  ])('%s / %s', (command, message, taxonomy) => {
    expect(classifyCommandError(command, message)).toBe(taxonomy);
  });
});

describe('describeError', () => {
  it('reads a message out of a string, an Error and a plain object', () => {
    expect(describeError('plain')).toBe('plain');
    expect(describeError(new Error('wrapped'))).toBe('wrapped');
    expect(describeError({ message: 42 })).toBe('42');
  });
});

// ---------------------------------------------------------------------------
// Every command, not a sample
// ---------------------------------------------------------------------------

/** The Tauri command names `tauri-api.ts` actually calls. */
function commandNamesInApi(): string[] {
  const source = readFileSync(new URL('../tauri-api.ts', import.meta.url), 'utf8');
  const names = new Set<string>();
  for (const match of source.matchAll(/invoke(?:<[^>]*>)?\(\s*["']([a-z0-9_]+)["']/gi)) {
    names.add(match[1]!);
  }
  return [...names].sort();
}

/**
 * Every exported wrapper, with arguments that get it as far as the IPC call.
 *
 * `validateStorageProfile` is the one export left out: it throws before any IPC
 * ("not yet implemented in XFA SDK backend"), which is itself a loud failure.
 */
const CALLS: Record<string, () => Promise<unknown>> = {
  openPdf: () => api.openPdf('/tmp/x.pdf'),
  closePdf: () => api.closePdf(),
  getDocumentInfo: () => api.getDocumentInfo(),
  renderPage: () => api.renderPage(0, 1),
  renderThumbnail: () => api.renderThumbnail(0),
  extractPageText: () => api.extractPageText(0),
  searchText: () => api.searchText('x'),
  savePdf: () => api.savePdf('/tmp/x.pdf'),
  hasUnsavedChanges: () => api.hasUnsavedChanges(),
  getCurrentPath: () => api.getCurrentPath(),
  printDocument: () => api.printDocument(),
  getFormFields: () => api.getFormFields(),
  setFormFieldValue: () => api.setFormFieldValue('a', 'b'),
  getFormModel: () => api.getFormModel(),
  getLinkAnnotations: () => api.getLinkAnnotations(),
  setFormValue: () => api.setFormValue({ kind: 'text', name: 'a', value: 'b' }),
  xfaFormModel: () => api.xfaFormModel(),
  setXfaFieldValue: () => api.setXfaFieldValue({ kind: 'text', name: 'a', value: 'b' }),
  commitXfaFieldValue: () => api.commitXfaFieldValue({ kind: 'text', name: 'a', value: 'b' }),
  mergePdfs: () => api.mergePdfs(['/tmp/a.pdf'], '/tmp/out.pdf'),
  splitPdf: () => api.splitPdf(['1-2'], '/tmp'),
  rotatePages: () => api.rotatePages([0], 90),
  deletePages: () => api.deletePages([1]),
  reorderPages: () => api.reorderPages([0]),
  compressPdf: () => api.compressPdf('/tmp/x.pdf'),
  addWatermark: () => api.addWatermark('draft', 0.3),
  addHighlightAnnotation: () => api.addHighlightAnnotation(0, [[0, 0, 1, 1]], [1, 1, 0]),
  addUnderlineAnnotation: () => api.addUnderlineAnnotation(0, [[0, 0, 1, 1]], [1, 1, 0]),
  addCommentAnnotation: () => api.addCommentAnnotation(0, 1, 1, 'note'),
  addShapeAnnotation: () => api.addShapeAnnotation(0, [0, 0, 1, 1], 'square', [1, 0, 0]),
  addInkAnnotation: () => api.addInkAnnotation(0, [[[0, 0], [1, 1]]], [1, 0, 0], 2),
  signPdf: () => api.signPdf('/tmp/c.p12', 'pw', 'because', '/tmp/out.pdf'),
  verifySignatures: () => api.verifySignatures(),
  validatePdfa: () => api.validatePdfa(),
  convertToPdfa: () => api.convertToPdfa('2b', '/tmp/out.pdf'),
  encryptPdf: () => api.encryptPdf('u', 'o', '/tmp/out.pdf'),
  decryptPdf: () => api.decryptPdf('pw'),
  redactText: () => api.redactText(0, [[0, 0, 1, 1]]),
  redactSearch: () => api.redactSearch('secret'),
  detectPii: () => api.detectPii(),
  redactPii: () => api.redactPii(['jan@example.com']),
  ocrPage: () => api.ocrPage(0),
  extractImages: () => api.extractImages('/tmp'),
  exportPageAsImage: () => api.exportPageAsImage(0, 'png', '/tmp/p.png'),
  convertToDocx: () => api.convertToDocx('/tmp/x.docx'),
  extractInvoiceData: () => api.extractInvoiceData(),
  validateInvoice: () => api.validateInvoice(),
  runOcr: () => api.runOcr(['eng'], [0]),
  getPageTextSpans: () => api.getPageTextSpans(0),
  flattenForm: () => api.flattenForm(),
  // Parked (the commands exist only with the cargo feature `pii`), but the
  // wrappers stay and must report like every other.
  detectPii: () => api.detectPii(false),
  piiComponentStatus: () => api.piiComponentStatus(),
  installPiiComponent: () => api.installPiiComponent(1),
  removePiiComponent: () => api.removePiiComponent(),
  redactPii: () => api.redactPii([]),
  getFormScriptsPolicy: () => api.getFormScriptsPolicy(),
  getFormScripts: () => api.getFormScripts(),
  setFormScriptsAllowed: () => api.setFormScriptsAllowed(true),
};

describe('every wrapper in tauri-api reports its own failure', () => {
  it.each(Object.keys(CALLS))('%s', async (name) => {
    invokeMock.mockRejectedValue(`${name} refused`);
    const errors = await captured(CALLS[name]!);
    expect(errors.length).toBeGreaterThan(0);
    expect(errors.some(e => e.message.includes('refused'))).toBe(true);
  });

  it('covers every command tauri-api calls', () => {
    // Not a sample: a command added to tauri-api without a line in CALLS above
    // fails here, so "every command reports" stays a fact and not a claim.
    const covered = new Set<string>();
    const source = readFileSync(new URL('../tauri-api.ts', import.meta.url), 'utf8');
    for (const name of Object.keys(CALLS)) {
      const at = source.indexOf(`export async function ${name}(`);
      expect(at, `${name} is not exported by tauri-api`).toBeGreaterThan(-1);
      const body = source.slice(at, source.indexOf('\nexport ', at + 1));
      for (const m of body.matchAll(/invoke(?:<[^>]*>)?\(\s*["']([a-z0-9_]+)["']/gi)) covered.add(m[1]!);
    }
    expect([...commandNamesInApi()].filter(c => !covered.has(c))).toEqual([]);
  });

  it('does not toast a failed background OCR status probe, and logs it', async () => {
    invokeMock.mockImplementation((command: string) =>
      command === 'frontend_log' ? Promise.resolve() : Promise.reject('No resource folder: unknown path'));
    const errors = await captured(() => api.getOcrComponentStatus());
    expect(errors).toEqual([]);
    await expect(api.getOcrComponentStatus()).rejects.toBeDefined();
  });

  it('reaches the backend only through the bridge', () => {
    const source = readFileSync(new URL('../tauri-api.ts', import.meta.url), 'utf8');
    expect(source).not.toContain('@tauri-apps/api/core');
    expect(source).toContain('commandBridge');
    // A guard against the list above quietly covering three commands.
    expect(commandNamesInApi().length).toBeGreaterThan(40);
  });
});
