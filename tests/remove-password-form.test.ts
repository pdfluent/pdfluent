// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary. The PDFluent application is free to use,
// including for commercial purposes. Redistribution, or extraction or reuse
// of its components (including the embedded PDF engine), requires a licence.
// See https://pdfluent.com/license for terms.

// #726: the Remove password card names the owner password and skips the prompt
// when the document was opened as owner. The backend half is tested in
// src-tauri/tests/encrypted_documents.rs.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { removePasswordForm } from '../src/viewer/state/removePassword';

const en = JSON.parse(readFileSync(new URL('../src/i18n/locales/en.json', import.meta.url), 'utf8')) as {
  protect: Record<string, string>;
};

describe('remove password form (#726)', () => {
  it('asks for the owner password, by that name, when only the user password is known', () => {
    const f = removePasswordForm('needs-owner-password');
    expect(f.askForPassword).toBe(true);
    expect(en.protect[f.fieldKey.replace('protect.', '')]).toMatch(/owner/i);
    expect(en.protect[f.fieldKey.replace('protect.', '')]).not.toMatch(/current/i);
    expect(f.canSubmit('')).toBe(false);
    expect(f.canSubmit('x')).toBe(true);
  });

  it('skips the prompt when the document was opened with the owner password', () => {
    const f = removePasswordForm('ready');
    expect(f.askForPassword).toBe(false);
    expect(f.canSubmit('')).toBe(true);
  });

  it('offers nothing on an unprotected document', () => {
    expect(removePasswordForm('not-protected').canSubmit('x')).toBe(false);
  });

  it('every key the form can use exists in en.json', () => {
    for (const state of ['needs-owner-password', 'ready', 'not-protected'] as const) {
      const f = removePasswordForm(state);
      expect(en.protect[f.fieldKey.replace('protect.', '')]).toBeTruthy();
      expect(en.protect[f.helpKey.replace('protect.', '')]).toBeTruthy();
    }
  });

  it('the shell asks the backend and sends no password when none is needed', () => {
    const shell = readFileSync(new URL('../src/viewer/v3/EditorV3Shell.tsx', import.meta.url), 'utf8');
    expect(shell).toContain("'password_removal_state'");
    expect(shell).toContain('removalForm.askForPassword ? { password: decryptPassword } : {}');
    expect(shell).not.toContain('protect.currentPasswordPlaceholder');
  });
});
