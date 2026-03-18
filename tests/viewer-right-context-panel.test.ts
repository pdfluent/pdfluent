// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary and confidential.
// Free for personal, non-commercial use.
// Commercial use requires a valid license.
// See https://pdfluent.com/license for terms.

import { readFileSync } from 'node:fs';
import { describe, it, expect } from 'vitest';

const panelSource = readFileSync(
  new URL('../src/viewer/components/RightContextPanel.tsx', import.meta.url),
  'utf8'
);

const viewerAppSource = [
  '../src/viewer/hooks/usePageNavigation.ts',
  '../src/viewer/hooks/useZoomControls.ts',
  '../src/viewer/hooks/useSidebarState.ts',
  '../src/viewer/hooks/useUndoRedo.ts',
  '../src/viewer/hooks/useSearch.ts',
  '../src/viewer/hooks/useFormFields.ts',
  '../src/viewer/hooks/useModeManager.ts',
  '../src/viewer/hooks/useDocumentLifecycle.ts',
  '../src/viewer/hooks/useCommands.ts',
  '../src/viewer/hooks/useDragDrop.ts',
  '../src/viewer/ViewerSidePanels.tsx',
  '../src/viewer/hooks/useAnnotations.ts',
  '../src/viewer/hooks/useTextInteraction.ts',
  '../src/viewer/hooks/useKeyboardShortcuts.ts',
  '../src/viewer/ViewerApp.tsx',
  '../src/viewer/WelcomeSection.tsx',
].map(p => readFileSync(new URL(p, import.meta.url), 'utf8')).join('\n\n');

// ---------------------------------------------------------------------------
// Read mode — Documentinfo
// ---------------------------------------------------------------------------

describe('RightContextPanel — read mode: Documentinfo', () => {
  it('renders a MetadataInfo component', () => {
    expect(panelSource).toContain('MetadataInfo');
  });

  it('shows title from pdfDoc.metadata.title', () => {
    expect(panelSource).toContain('pdfDoc.metadata.title');
  });

  it('shows author from pdfDoc.metadata.author', () => {
    expect(panelSource).toContain('pdfDoc.metadata.author');
  });

  it('shows pageCount', () => {
    expect(panelSource).toContain('pageCount');
    expect(panelSource).toContain("t('docInfo.pages'");
  });

  it('falls back to fileName when title is empty', () => {
    expect(panelSource).toContain('pdfDoc.fileName');
  });

  it('shows "Geen document geopend" when pdfDoc is null', () => {
    expect(panelSource).toContain("t('docInfo.noDocument'");
  });

  it('renders Documentinfo section for read mode', () => {
    expect(panelSource).toContain("mode === 'read'");
    expect(panelSource).toContain("t('rightPanel.documentInfo'");
  });
});

// ---------------------------------------------------------------------------
// Protect mode — Beveiligingsinstellingen (Encrypt/Decrypt)
// ---------------------------------------------------------------------------

describe('RightContextPanel — protect mode: Beveiligingsinstellingen', () => {
  it('renders EncryptDecryptControls for protect mode', () => {
    expect(panelSource).toContain('EncryptDecryptControls');
    expect(panelSource).toContain("mode === 'protect'");
  });

  it('has a user password input', () => {
    expect(panelSource).toContain("t('protect.userPasswordPlaceholder'");
    expect(panelSource).toContain('userPassword');
  });

  it('has an owner password input', () => {
    expect(panelSource).toContain("t('protect.ownerPasswordPlaceholder'");
    expect(panelSource).toContain('ownerPassword');
  });

  it('has a Versleutelen button', () => {
    expect(panelSource).toContain("t('protect.encryptBtn'");
    expect(panelSource).toContain('handleEncrypt');
  });

  it('has a decrypt password input', () => {
    expect(panelSource).toContain("t('protect.currentPasswordPlaceholder'");
    expect(panelSource).toContain('decryptPassword');
  });

  it('has an Ontsleutelen button', () => {
    expect(panelSource).toContain("t('protect.decryptBtn'");
    expect(panelSource).toContain('handleDecrypt');
  });

  it('invokes encrypt_pdf with userPassword, ownerPassword, outputPath', () => {
    expect(panelSource).toContain("invoke('encrypt_pdf'");
    expect(panelSource).toContain('userPassword');
    expect(panelSource).toContain('ownerPassword');
    expect(panelSource).toContain('outputPath: path');
  });

  it('invokes decrypt_pdf with password', () => {
    expect(panelSource).toContain("invoke('decrypt_pdf'");
    expect(panelSource).toContain('password: decryptPassword');
  });

  it('opens a save dialog before encrypt', () => {
    expect(panelSource).toContain("plugin-dialog'");
    // save dialog for encrypt output path
    expect(panelSource).toContain("save({ filters");
  });

  it('disables buttons in non-Tauri environments', () => {
    expect(panelSource).toContain('!isTauri');
  });
});

// ---------------------------------------------------------------------------
// Protect mode — Machtigingen (Permissions)
// ---------------------------------------------------------------------------

describe('RightContextPanel — protect mode: Machtigingen', () => {
  it('renders PermissionsDisplay for protect mode', () => {
    expect(panelSource).toContain('PermissionsDisplay');
    expect(panelSource).toContain('Machtigingen');
  });

  it('reads permissions from pdfDoc.state.permissions', () => {
    expect(panelSource).toContain('pdfDoc?.state.permissions');
  });

  it('defines PERMISSION_LABELS mapping', () => {
    expect(panelSource).toContain('protect.permCanPrint');
  });

  it('maps all eight DocumentPermissions flags to Dutch labels', () => {
    expect(panelSource).toContain('canPrint');
    expect(panelSource).toContain('canPrintHighQuality');
    expect(panelSource).toContain('canModify');
    expect(panelSource).toContain('canCopy');
    expect(panelSource).toContain('canAnnotate');
    expect(panelSource).toContain('canFillForms');
    expect(panelSource).toContain('canExtractContent');
    expect(panelSource).toContain('canAssemble');
  });

  it('includes Dutch labels for key permissions', () => {
    expect(panelSource).toContain("'protect.permCanPrint'");
    expect(panelSource).toContain("'protect.permCanModify'");
    expect(panelSource).toContain("'protect.permCanCopy'");
    expect(panelSource).toContain("'protect.permCanAnnotate'");
    expect(panelSource).toContain("'protect.permCanFillForms'");
    expect(panelSource).toContain("'protect.permCanExtractContent'");
    expect(panelSource).toContain("'protect.permCanAssemble'");
  });

  it('shows check and cross icons for permission state', () => {
    expect(panelSource).toContain('CheckIcon');
    expect(panelSource).toContain('text-green-500');
    expect(panelSource).toContain('text-destructive');
  });

  it('handles null permissions gracefully', () => {
    expect(panelSource).toContain('permissions ?? null');
  });
});

// ---------------------------------------------------------------------------
// Task queue integration
// ---------------------------------------------------------------------------

describe('RightContextPanel — task queue integration', () => {
  it('uses useTaskQueueContext for push and update', () => {
    expect(panelSource).toContain('useTaskQueueContext');
    expect(panelSource).toContain('push,');
    expect(panelSource).toContain('update }');
  });

  it('pushes a running task when encrypt starts', () => {
    expect(panelSource).toContain('encrypt-${Date.now()}');
    expect(panelSource).toContain("label: t('tasks.encryptRunning')");
    expect(panelSource).toContain("status: 'running'");
  });

  it('pushes a running task when decrypt starts', () => {
    expect(panelSource).toContain('decrypt-${Date.now()}');
    expect(panelSource).toContain("label: t('tasks.decryptRunning')");
  });

  it('updates task to done on encrypt success', () => {
    expect(panelSource).toContain("label: t('tasks.encryptDone')");
    expect(panelSource).toContain("status: 'done'");
  });

  it('updates task to done on decrypt success', () => {
    expect(panelSource).toContain("label: t('tasks.decryptDone')");
  });

  it('updates task to error on failure', () => {
    expect(panelSource).toContain("status: 'error'");
    expect(panelSource).toContain("label: t('tasks.encryptFailed')");
    expect(panelSource).toContain("label: t('tasks.decryptFailed')");
  });
});

// ---------------------------------------------------------------------------
// Other modes — still placeholder
// ---------------------------------------------------------------------------

describe('RightContextPanel — other modes remain placeholder', () => {
  it('PLACEHOLDER_SECTIONS still covers edit, organize, convert (forms/review now real)', () => {
    // forms and review have been replaced by real components — they are no longer in PLACEHOLDER_SECTIONS
    expect(panelSource).toContain('edit:');
    expect(panelSource).toContain('organize:');
    expect(panelSource).toContain('convert:');
    expect(panelSource).not.toContain('review:');
    expect(panelSource).not.toContain('forms:');
  });

  it('non-read/protect/forms/review modes still render from PLACEHOLDER_SECTIONS', () => {
    expect(panelSource).toContain("mode !== 'forms'");
    expect(panelSource).toContain("mode !== 'review'");
    expect(panelSource).toContain('PLACEHOLDER_SECTION_KEYS[mode]');
  });

  it('no longer has the global TODO(pdfluent-viewer) marker for RightContextPanel', () => {
    expect(panelSource).not.toContain('TODO(pdfluent-viewer): connect RightContextPanel');
  });
});

// ---------------------------------------------------------------------------
// ViewerApp — RightContextPanel wiring
// ---------------------------------------------------------------------------

describe('ViewerApp — RightContextPanel wiring', () => {
  it('passes pdfDoc to RightContextPanel', () => {
    expect(viewerAppSource).toContain('pdfDoc={pdfDoc');
  });

  it('passes pageCount to RightContextPanel', () => {
    expect(viewerAppSource).toContain('pageCount={pageCount}');
  });
});
