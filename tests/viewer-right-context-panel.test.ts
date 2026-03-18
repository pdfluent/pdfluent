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

const viewerAppSource = readFileSync(
  new URL('../src/viewer/ViewerApp.tsx', import.meta.url),
  'utf8'
);

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
    expect(panelSource).toContain("Pagina's");
  });

  it('falls back to fileName when title is empty', () => {
    expect(panelSource).toContain('pdfDoc.fileName');
  });

  it('shows "Geen document geopend" when pdfDoc is null', () => {
    expect(panelSource).toContain('Geen document geopend.');
  });

  it('renders Documentinfo section for read mode', () => {
    expect(panelSource).toContain("mode === 'read'");
    expect(panelSource).toContain('Documentinfo');
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
    expect(panelSource).toContain('Gebruikerswachtwoord');
    expect(panelSource).toContain('userPassword');
  });

  it('has an owner password input', () => {
    expect(panelSource).toContain('Eigenaarswachtwoord');
    expect(panelSource).toContain('ownerPassword');
  });

  it('has a Versleutelen button', () => {
    expect(panelSource).toContain('Versleutelen…');
    expect(panelSource).toContain('handleEncrypt');
  });

  it('has a decrypt password input', () => {
    expect(panelSource).toContain('Huidig wachtwoord');
    expect(panelSource).toContain('decryptPassword');
  });

  it('has an Ontsleutelen button', () => {
    expect(panelSource).toContain('Ontsleutelen');
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
    expect(panelSource).toContain('PERMISSION_LABELS');
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
    expect(panelSource).toContain('Afdrukken');
    expect(panelSource).toContain('Bewerken');
    expect(panelSource).toContain("Kopiëren");
    expect(panelSource).toContain('Annoteren');
    expect(panelSource).toContain('Formulieren invullen');
    expect(panelSource).toContain('Inhoud extraheren');
    expect(panelSource).toContain('Samenstellen');
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
    expect(panelSource).toContain("label: 'Versleutelen…'");
    expect(panelSource).toContain("status: 'running'");
  });

  it('pushes a running task when decrypt starts', () => {
    expect(panelSource).toContain('decrypt-${Date.now()}');
    expect(panelSource).toContain("label: 'Ontsleutelen…'");
  });

  it('updates task to done on encrypt success', () => {
    expect(panelSource).toContain("label: 'PDF versleuteld'");
    expect(panelSource).toContain("status: 'done'");
  });

  it('updates task to done on decrypt success', () => {
    expect(panelSource).toContain("label: 'PDF ontsleuteld'");
  });

  it('updates task to error on failure', () => {
    expect(panelSource).toContain("status: 'error'");
    expect(panelSource).toContain("label: 'Versleuteling mislukt'");
    expect(panelSource).toContain("label: 'Ontsleuteling mislukt'");
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
    expect(panelSource).toContain("mode !== 'read' && mode !== 'review' && mode !== 'forms' && mode !== 'protect'");
    expect(panelSource).toContain('PLACEHOLDER_SECTIONS[mode]');
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
