// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary. The PDFluent application is free to use,
// including for commercial purposes. Redistribution, or extraction or reuse
// of its components (including the embedded PDF engine), requires a licence.
// See https://pdfluent.com/license for terms.
//
// The Sign panel of the shipped shell: it signs, it verifies, and it says
// which of the two it is doing.
//
// Until 2026-09-07 this panel showed "Locally signed — nothing leaves this
// device" and "PAdES-compliant digital signature" on every document, signed or
// not, over controls that drew a picture of a signature into an in-memory
// overlay. #404 removed the two lines. This test holds the other half: the
// panel now reaches `sign_pdf`, and the copy names the profile that command
// actually produces (PAdES B-B) instead of the word "compliant".

import { readFileSync, readdirSync } from 'node:fs';
import { describe, it, expect } from 'vitest';

const shellSource = readFileSync(
  new URL('../src/viewer/v3/EditorV3Shell.tsx', import.meta.url),
  'utf8',
);

const LOCALES_DIR = new URL('../src/i18n/locales/', import.meta.url);
const en = JSON.parse(readFileSync(new URL('en.json', LOCALES_DIR), 'utf8')) as {
  editorV3: { esign: Record<string, string> };
};

/** The Sign panel block of the shell, from `panel === 'esign'` to the next panel. */
function esignPanelBlock(): string {
  const start = shellSource.indexOf("{panel === 'esign' && (");
  expect(start, "the shell must still have an 'esign' panel").toBeGreaterThan(-1);
  const end = shellSource.indexOf("{panel === 'protect' && (", start);
  expect(end, 'the panel after esign must still be protect').toBeGreaterThan(start);
  return shellSource.slice(start, end);
}

describe('v3 Sign panel — certificate signing is wired', () => {
  it('invokes sign_pdf from the shell the app renders', () => {
    expect(shellSource).toContain("invoke('sign_pdf'");
  });

  it('passes the four arguments the sign_pdf command takes', () => {
    const call = /invoke\('sign_pdf',\s*\{([^}]*)\}/.exec(shellSource);
    expect(call, 'sign_pdf must be called with an argument object').not.toBeNull();
    const args = call?.[1] ?? '';
    for (const arg of ['certPath', 'password', 'reason', 'outputPath']) {
      expect(args).toContain(arg);
    }
  });

  it('picks the certificate and the output file through the native dialogs', () => {
    const block = esignPanelBlock();
    expect(block).toContain('<CertificateSignControls');
    const controls = shellSource.slice(shellSource.indexOf('function CertificateSignControls'));
    expect(controls).toContain("import('@tauri-apps/plugin-dialog')");
    expect(controls).toContain("extensions: ['p12', 'pfx']");
  });

  it('offers the four controls signing needs, each with a test id', () => {
    const controls = shellSource.slice(shellSource.indexOf('function CertificateSignControls'));
    for (const testid of [
      'sign-cert-pick',
      'sign-cert-password',
      'sign-reason',
      'sign-with-certificate',
    ]) {
      expect(controls, `missing control: ${testid}`).toContain(`data-testid="${testid}"`);
    }
  });

  it('does not send the certificate password to the toast or the task label', () => {
    const controls = shellSource.slice(
      shellSource.indexOf('function CertificateSignControls'),
      shellSource.indexOf('function SignatureVerifyControls'),
    );
    const leaks = controls
      .split('\n')
      .filter(line => /onShowToast\(|label:/.test(line) && /\bpassword\b/.test(line));
    expect(leaks, `password reached a user-visible string: ${leaks.join(' | ')}`).toEqual([]);
  });

  it('re-checks the signatures after signing, so the panel shows the new one', () => {
    const block = esignPanelBlock();
    expect(block).toContain('setSignedRevision');
    expect(block).toContain('<SignatureVerifyControls');
  });
});

describe('v3 Sign panel — the copy says what the app does', () => {
  it('names the PAdES level the backend produces', () => {
    expect(en.editorV3.esign.padesLevel).toContain('PAdES B-B');
    // Shown by the control that does the signing, which the panel renders.
    expect(esignPanelBlock()).toContain('<CertificateSignControls');
    const controls = shellSource.slice(shellSource.indexOf('function CertificateSignControls'));
    expect(controls).toContain("t('editorV3.esign.padesLevel')");
  });

  it('does not claim a level the SDK call cannot produce', () => {
    const esignCopy = Object.values(en.editorV3.esign).join(' ');
    for (const unearned of ['B-T', 'B-LT', 'B-LTA', 'timestamped', 'Timestamped']) {
      expect(esignCopy, `the panel promises ${unearned}, which sign_pdf does not produce`)
        .not.toContain(unearned);
    }
  });

  it('does not offer to route the document to other signers', () => {
    // There is no send-for-signature path in this app -- no account, no
    // server, no outbound request. The lede offered one anyway.
    expect(en.editorV3.esign.lede.toLowerCase()).not.toContain('others to sign');
    expect(en.editorV3.esign.lede.toLowerCase()).not.toContain('send for signature');
  });

  it('has dropped the two badges that stood over nothing, in every locale', () => {
    const orphans = ['localSigned', 'padesCompliant'];
    for (const file of readdirSync(LOCALES_DIR).filter(name => name.endsWith('.json'))) {
      const tree = JSON.parse(readFileSync(new URL(file, LOCALES_DIR), 'utf8')) as {
        editorV3?: { esign?: Record<string, string> };
      };
      const esign = tree.editorV3?.esign ?? {};
      for (const orphan of orphans) {
        expect(esign, `${file} still carries editorV3.esign.${orphan}`).not.toHaveProperty(orphan);
      }
    }
    for (const orphan of orphans) {
      expect(shellSource).not.toContain(`editorV3.esign.${orphan}`);
    }
  });
});
