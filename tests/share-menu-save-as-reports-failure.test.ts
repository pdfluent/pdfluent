// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary. The PDFluent application is free to use,
// including for commercial purposes. Redistribution, or extraction or reuse
// of its components (including the embedded PDF engine), requires a licence.
// See https://pdfluent.com/license for terms.

// A Save As that cannot be written (J-83: a folder that does not exist) used
// to reach the crash reporter as an unhandled rejection, because the Share
// menu handed the rejecting promise straight to onClick. It must be said on
// screen. J-83 proves it in the running app; this keeps the wiring from being
// undone in a refactor.

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const shell = readFileSync('src/viewer/v3/EditorV3Shell.tsx', 'utf8');

describe('the Share menu Save as', () => {
  it('does not hand the rejecting promise to onClick', () => {
    const button = shell.split('\n').find((l) => l.includes('data-testid="save-as-btn"')) ?? '';
    expect(button).toContain('handleSaveAsClick');
    expect(button).not.toContain('onClick={props.onSaveAs}');
  });

  it('turns a failed save into a toast with the reason', () => {
    const start = shell.indexOf('async function handleSaveAsClick');
    const body = shell.slice(start, shell.indexOf('async function handleSave()', start));
    expect(body).toContain('await props.onSaveAs()');
    expect(body).toContain('catch (error)');
    expect(body).toContain("t('editorV3.toasts.saveFailed'");
  });
});
