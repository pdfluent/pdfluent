// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary. The PDFluent application is free to use,
// including for commercial purposes. Redistribution, or extraction or reuse
// of its components (including the embedded PDF engine), requires a licence.
// See https://pdfluent.com/license for terms.

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const editorV3ShellSource = readFileSync(
  new URL('../src/viewer/v3/EditorV3Shell.tsx', import.meta.url),
  'utf8'
);

describe('EditorV3Shell — no fake e-sign invitation flow', () => {
  it('does not expose the removed invitation action', () => {
    expect(editorV3ShellSource).not.toContain('onOpenInviteDialog');
    expect(editorV3ShellSource).not.toContain('showInviteDialog');
  });

  it('does not claim an invitation was sent without a backend', () => {
    expect(editorV3ShellSource).not.toContain('inviteSent');
    expect(editorV3ShellSource).not.toContain('inviteEmail');
  });
});
