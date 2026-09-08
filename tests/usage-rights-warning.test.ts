// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary. The PDFluent application is free to use,
// including for commercial purposes. Redistribution, or extraction or reuse
// of its components (including the embedded PDF engine), requires a licence.
// See https://pdfluent.com/license for terms.

/**
 * Editing a Reader-enabled document costs it its usage rights, and the app says so.
 *
 * Seven of the golden forms carry a `/Perms /UR3` signature and no author
 * signature. The writer edits them on purpose — refusing would make every
 * Reader-enabled form read-only — and the edit destroys the signature. Until
 * this change nothing said that, and the Sign panel went on drawing the dead
 * signature with a tick, so the app reported extended rights it had just broken.
 *
 * Red when: the notice stops reaching the error stack, stops being once per
 * document, loses a locale, or the Sign panel goes back to showing a
 * usage-rights entry as an ordinary signature.
 */

import { readFileSync, readdirSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import { announceUsageRightsInvalidated } from '../src/viewer/state/fallbackNotices';
import { subscribeCommandFailures } from '../src/lib/commandBridge';
import type { AppError } from '../src/viewer/state/errorCenter';

const LOCALES_DIR = new URL('../src/i18n/locales/', import.meta.url);

function read(path: string): string {
  return readFileSync(new URL(path, import.meta.url), 'utf8');
}

function published(run: () => void): AppError[] {
  const seen: AppError[] = [];
  const stop = subscribeCommandFailures(error => { seen.push(error); });
  try { run(); } finally { stop(); }
  return seen;
}

describe('the notice itself', () => {
  it('reaches the error stack with a code the log can be searched for', () => {
    const seen = published(() => announceUsageRightsInvalidated());
    expect(seen).toHaveLength(1);
    expect(seen[0]!.code).toBe('USAGE_RIGHTS_INVALIDATED');
    expect(seen[0]!.source).toBe('replace_text_span');
  });

  it('is a warning, because the edit the user asked for did land', () => {
    // An error would tell them to try again at something that already worked.
    expect(published(() => announceUsageRightsInvalidated())[0]!.severity).toBe('warning');
  });

  it('says what was lost, not that something went wrong', () => {
    const notice = published(() => announceUsageRightsInvalidated())[0]!;
    expect(notice.message.toLowerCase()).toContain('usage-rights');
    expect(notice.message.toLowerCase()).toContain('reader');
  });
});

describe('the strings exist in every locale', () => {
  const keys = [
    ['fallbacks', 'usageRightsInvalidatedTitle'],
    ['fallbacks', 'usageRightsInvalidatedMessage'],
    ['editorV3', 'esign', 'usageRights'],
    ['editorV3', 'esign', 'usageRightsInvalidated'],
  ];

  const locales = readdirSync(LOCALES_DIR)
    .filter(name => name.endsWith('.json'))
    .map(name => name.replace(/\.json$/, ''));

  it('ships the 27 locales the app advertises', () => {
    expect(locales).toHaveLength(27);
  });

  it.each(locales)('%s carries every string this warning prints', locale => {
    const bundle: unknown = JSON.parse(read(`../src/i18n/locales/${locale}.json`));
    for (const path of keys) {
      let node: unknown = bundle;
      for (const segment of path) {
        node = (node as Record<string, unknown>)[segment];
      }
      expect(node, path.join('.')).toBeTypeOf('string');
      expect(node, path.join('.')).not.toBe('');
    }
  });
});

describe('the writer reports what the edit cost', () => {
  const engine = read('../src-tauri/src/pdf_engine.rs');

  it('reads the usage rights before the edit, not after', () => {
    const writer = engine.slice(engine.indexOf('pub fn replace_text_span'));
    const body = writer.slice(0, writer.indexOf('session.commit()'));
    expect(body).toContain('self.has_usage_rights_signature()');
  });

  it('puts the answer on the applied result, where it cannot be forgotten', () => {
    // A parameter of `applied`, not a field patched on afterwards: the compiler
    // is what keeps it from going missing on the one path that has it.
    expect(engine).toContain('usage_rights_invalidated: Some(usage_rights_invalidated),');
    const applied = engine.slice(engine.indexOf('TextReplaceResult::applied(\n'));
    expect(applied.slice(0, 200).replace(/\s+/g, ' ')).toContain(
      'TextReplaceResult::applied( &report, index, count, usage_rights, )',
    );
  });

  it('is on the wire contract both sides check', () => {
    expect(read('../src/lib/textSpanWireContract.ts')).toContain("'usage_rights_invalidated'");
    expect(read('../src/lib/tauri-api.ts')).toContain('usage_rights_invalidated: boolean | null;');
    expect(read('../src/platform/engine/tauri/TauriTextMutationEngine.ts'))
      .toContain('usageRightsInvalidated: result.usage_rights_invalidated,');
  });

  it('tells a usage-rights signature apart from an author signature', () => {
    expect(engine).toContain('pub usage_rights: bool');
    expect(engine).toContain('fn usage_rights_signature_ids');
    expect(read('../src/lib/tauri-api.ts')).toContain('usage_rights: boolean;');
  });
});

describe('the text-edit path announces once per document', () => {
  const hook = read('../src/viewer/hooks/useTextInteraction.ts');

  it('announces on an edit that invalidated the rights', () => {
    expect(hook).toContain(
      "if (result.value.usageRightsInvalidated === true && !usageRightsAnnouncedRef.current) {",
    );
    expect(hook).toContain('announceUsageRightsInvalidated();');
  });

  it('does not repeat itself for the rest of the document', () => {
    expect(hook).toContain('usageRightsAnnouncedRef.current = true;');
  });

  it('resets per document, or the second file opened says nothing', () => {
    const reset = hook.slice(hook.indexOf('usageRightsAnnouncedRef.current = false;'));
    expect(reset.slice(0, 60)).toContain('usageRightsAnnouncedRef.current = false;');
    expect(reset.slice(0, 90)).toContain('[documentKey]');
  });
});

describe('the Sign panel', () => {
  const shell = read('../src/viewer/v3/EditorV3Shell.tsx');
  const panel = shell.slice(shell.indexOf('function SignatureVerifyControls'));

  it('names a usage-rights entry instead of drawing a signer', () => {
    expect(panel).toContain("t('editorV3.esign.usageRights')");
    expect(panel).toContain('data-usage-rights={result.usage_rights}');
  });

  it('says the rights are gone once this document has been edited', () => {
    expect(panel).toContain('result.usage_rights && contentRevision > 0');
    expect(panel).toContain("t('editorV3.esign.usageRightsInvalidated')");
    // Never on the validator's verdict: it says "cannot parse CMS SignedData"
    // for an Adobe /UR3 signature whether or not anyone has touched the file,
    // so `!result.valid` would put this line on an untouched document.
    expect(panel).not.toContain('result.usage_rights && !result.valid');
  });

  it('re-checks after an edit, because that is what invalidates them', () => {
    expect(panel).toContain('contentRevision');
    const effect = panel.slice(panel.indexOf('if (!checked) return;'));
    expect(effect.slice(0, 220)).toContain('[contentRevision]');
  });

  it('gets the counter from the app, bumped on every content mutation', () => {
    const app = read('../src/viewer/ViewerApp.tsx');
    const mutated = app.slice(app.indexOf('const handleDocumentMutated'));
    expect(mutated.slice(0, 600)).toContain('setContentRevision(n => n + 1);');
    expect(app).toContain('contentRevision={contentRevision}');
  });
});
