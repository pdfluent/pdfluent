// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary and confidential.
// Free for personal, non-commercial use.
// Commercial use requires a valid license.
// See https://pdfluent.com/license for terms.

import { readFileSync } from 'node:fs';
import { describe, it, expect } from 'vitest';

const signaturePanelSource = readFileSync(
  new URL('../src/viewer/components/SignaturePanel.tsx', import.meta.url),
  'utf8'
);

const rightPanelSource = readFileSync(
  new URL('../src/viewer/components/RightContextPanel.tsx', import.meta.url),
  'utf8'
);

// ---------------------------------------------------------------------------
// SignaturePanel — sign section
// ---------------------------------------------------------------------------

describe('SignaturePanel — sign section', () => {
  it('has data-testid="signature-panel"', () => {
    expect(signaturePanelSource).toContain('data-testid="signature-panel"');
  });

  it('renders certificate browse button', () => {
    expect(signaturePanelSource).toContain('data-testid="browse-cert-btn"');
  });

  it('renders cert-path-display', () => {
    expect(signaturePanelSource).toContain('data-testid="cert-path-display"');
  });

  it('renders password input', () => {
    expect(signaturePanelSource).toContain('data-testid="cert-password-input"');
    expect(signaturePanelSource).toContain('type="password"');
  });

  it('renders reason input', () => {
    expect(signaturePanelSource).toContain('data-testid="sign-reason-input"');
  });

  it('renders sign button', () => {
    expect(signaturePanelSource).toContain('data-testid="sign-btn"');
  });

  it('uses signature.signSection i18n key', () => {
    expect(signaturePanelSource).toContain("t('signature.signSection')");
  });

  it('uses signature.certFile i18n key', () => {
    expect(signaturePanelSource).toContain("t('signature.certFile')");
  });

  it('uses signature.browseCert i18n key', () => {
    expect(signaturePanelSource).toContain("t('signature.browseCert')");
  });

  it('uses signature.noCert i18n key', () => {
    expect(signaturePanelSource).toContain("t('signature.noCert')");
  });

  it('uses signature.password i18n key', () => {
    expect(signaturePanelSource).toContain("t('signature.password')");
  });

  it('uses signature.reason i18n key', () => {
    expect(signaturePanelSource).toContain("t('signature.reason')");
  });

  it('uses signature.signBtn i18n key', () => {
    expect(signaturePanelSource).toContain("t('signature.signBtn')");
  });

  it('uses signature.signing i18n key when signing', () => {
    expect(signaturePanelSource).toContain("t('signature.signing')");
  });
});

// ---------------------------------------------------------------------------
// SignaturePanel — sign Tauri command
// ---------------------------------------------------------------------------

describe('SignaturePanel — sign Tauri command', () => {
  it('calls sign_pdf Tauri command', () => {
    expect(signaturePanelSource).toContain("invoke('sign_pdf'");
  });

  it('passes certPath to sign_pdf', () => {
    expect(signaturePanelSource).toContain('certPath');
  });

  it('passes password to sign_pdf', () => {
    expect(signaturePanelSource).toContain('password');
  });

  it('passes reason to sign_pdf', () => {
    expect(signaturePanelSource).toContain('reason');
  });

  it('uses tasks.signRunning for task queue', () => {
    expect(signaturePanelSource).toContain("t('tasks.signRunning')");
  });

  it('uses tasks.signDone for task queue', () => {
    expect(signaturePanelSource).toContain("t('tasks.signDone')");
  });

  it('uses tasks.signFailed for task queue', () => {
    expect(signaturePanelSource).toContain("t('tasks.signFailed')");
  });

  it('calls push before invoking sign_pdf', () => {
    const signIdx = signaturePanelSource.indexOf("invoke('sign_pdf'");
    const pushIdx = signaturePanelSource.indexOf('push({', signIdx - 300);
    expect(pushIdx).toBeGreaterThan(-1);
  });
});

// ---------------------------------------------------------------------------
// SignaturePanel — verify section
// ---------------------------------------------------------------------------

describe('SignaturePanel — verify section', () => {
  it('calls verify_signatures Tauri command', () => {
    expect(signaturePanelSource).toContain("'verify_signatures'");
  });

  it('uses signature.verifySection i18n key', () => {
    expect(signaturePanelSource).toContain("t('signature.verifySection')");
  });

  it('renders no-signatures message', () => {
    expect(signaturePanelSource).toContain('data-testid="no-signatures"');
    expect(signaturePanelSource).toContain("t('signature.noSignatures')");
  });

  it('renders signature-item for each signature', () => {
    expect(signaturePanelSource).toContain('data-testid="signature-item"');
  });

  it('uses signature.statusValid i18n key', () => {
    expect(signaturePanelSource).toContain("t('signature.statusValid')");
  });

  it('uses signature.statusInvalid i18n key', () => {
    expect(signaturePanelSource).toContain("t('signature.statusInvalid')");
  });

  it('uses signature.statusUnknown i18n key', () => {
    expect(signaturePanelSource).toContain("t('signature.statusUnknown')");
  });

  it('shows signer name when present', () => {
    expect(signaturePanelSource).toContain("t('signature.signer')");
    expect(signaturePanelSource).toContain('sig.signer');
  });

  it('shows timestamp when present', () => {
    expect(signaturePanelSource).toContain("t('signature.date')");
    expect(signaturePanelSource).toContain('sig.timestamp');
  });

  it('re-verifies signatures after signing', () => {
    const afterSignIdx = signaturePanelSource.indexOf("invoke('sign_pdf'");
    const reverifyIdx = signaturePanelSource.indexOf("invoke<SignatureResult[]>('verify_signatures')", afterSignIdx);
    expect(reverifyIdx).toBeGreaterThan(afterSignIdx);
  });
});

// ---------------------------------------------------------------------------
// RightContextPanel — SignaturePanel integration
// ---------------------------------------------------------------------------

describe('RightContextPanel — SignaturePanel integration', () => {
  it('imports SignaturePanel', () => {
    expect(rightPanelSource).toContain("import { SignaturePanel }");
  });

  it('renders SignaturePanel in protect mode', () => {
    expect(rightPanelSource).toContain('<SignaturePanel');
    expect(rightPanelSource).toContain('pdfDoc={pdfDoc}');
  });

  it('uses rightPanel.signatures i18n key', () => {
    expect(rightPanelSource).toContain("t('rightPanel.signatures')");
  });

  it('wraps SignaturePanel in a collapsible section', () => {
    const signaturesIdx = rightPanelSource.indexOf("t('rightPanel.signatures')");
    const signaturePanelIdx = rightPanelSource.indexOf('<SignaturePanel', signaturesIdx - 100);
    expect(signaturePanelIdx).toBeGreaterThan(-1);
  });
});
