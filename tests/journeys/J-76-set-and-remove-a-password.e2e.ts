// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary. The PDFluent application is free to use,
// including for commercial purposes. Redistribution, or extraction or reuse
// of its components (including the embedded PDF engine), requires a licence.
// See https://pdfluent.com/license for terms.

// J-76: Create a protected copy writes an AES-256 copy that needs its password.
// Removing the password asks for the OWNER password by that name (#726, branch
// fix/editor-next-batch): opened with the user password only, the user password
// does not remove it and the field says "Owner (permissions) password"; opened
// with the owner password, there is no field and one click removes it.
// Covered at the logic level by src-tauri/tests/encrypted_documents.rs
// (removing_the_password_*) and tests/remove-password-form.test.ts.

import { expect } from 'vitest';
import { journey } from './lib/journey';
import { allText } from './lib/pdfcheck';
import { clickText, fill, save, waitForPages, waitForText } from './lib/ui';

const USER = 'pw-user-76';
const OWNER = 'pw-owner-76';

async function openProtected(j: Parameters<Parameters<typeof journey>[1]>[0], file: string, password: string): Promise<void> {
  await j.stop();
  await j.start({ open: file, noDocument: true });
  await j.waitFor('[data-testid="password-prompt-dialog"]', { timeout: 30_000 });
  await fill(j, '[data-testid="password-prompt-input"]', password);
  await j.s.click('[data-testid="password-prompt-open-btn"]');
  await waitForPages(j, 3);
  await j.s.click('.share-trigger');
  await clickText(j, '.share-menu .dd-item', 'Create a protected copy');
  await j.waitFor('[data-testid="remove-password-help"]');
}

journey('J-76', async (j) => {
  const doc = j.fixture('src-tauri/tests/golden/fixture-sample-text-3p.pdf', 'plain.pdf');
  const protectedCopy = j.file('protected.pdf');
  const plainText = allText(j.inspect(doc));
  await j.start({ open: doc });

  await j.step('Create a protected copy', async () => {
    await j.s.click('.share-trigger');
    await clickText(j, '.share-menu .dd-item', 'Create a protected copy');
    await j.waitFor('[aria-label="User password"]');
    await fill(j, '[aria-label="User password"]', USER);
    await fill(j, '[aria-label="Owner password"]', OWNER);
    await j.answerDialog('save', protectedCopy);
    await clickText(j, 'button', 'Encrypt…');
    await waitForText(j, 'PDF encrypted', 30_000);
    const without = j.inspect(protectedCopy);
    expect(without.encrypt_dictionary).toBe(true);
    expect(without.opens).toBe(false);
    expect(allText(j.inspect(protectedCopy, { password: USER }))).toBe(plainText);
  });

  await j.step('opened with the user password: the field asks for the owner password by name', async () => {
    await openProtected(j, protectedCopy, USER);
    expect(await j.s.call<number>('count', '[aria-label="Owner (permissions) password"]')).toBe(1);
    expect(await j.s.call<number>('count', '[aria-label="Current password"]')).toBe(0);
    await fill(j, '[aria-label="Owner (permissions) password"]', USER);
    await clickText(j, 'button', 'Decrypt');
    await waitForText(j, 'Decryption failed', 30_000);
    await fill(j, '[aria-label="Owner (permissions) password"]', OWNER);
    await clickText(j, 'button', 'Decrypt');
    await waitForText(j, 'PDF decrypted', 30_000);
    await save(j);
    const r = j.inspect(protectedCopy);
    expect(r.needs_password).toBe(false);
    expect(r.encrypt_dictionary).toBe(false);
    expect(allText(r)).toBe(plainText);
  });

  await j.step('opened with the owner password: no field, one click removes it', async () => {
    const second = j.file('protected-2.pdf');
    await j.stop();
    await j.start({ open: doc });
    await j.s.click('.share-trigger');
    await clickText(j, '.share-menu .dd-item', 'Create a protected copy');
    await j.waitFor('[aria-label="User password"]');
    await fill(j, '[aria-label="User password"]', USER);
    await fill(j, '[aria-label="Owner password"]', OWNER);
    await j.answerDialog('save', second);
    await clickText(j, 'button', 'Encrypt…');
    await waitForText(j, 'PDF encrypted', 30_000);
    await openProtected(j, second, OWNER);
    expect(await j.s.call<number>('count', '[aria-label="Owner (permissions) password"]')).toBe(0);
    await clickText(j, 'button', 'Decrypt');
    await waitForText(j, 'PDF decrypted', 30_000);
    await save(j);
    const r = j.inspect(second);
    expect(r.needs_password).toBe(false);
    expect(allText(r)).toBe(plainText);
  });
});
