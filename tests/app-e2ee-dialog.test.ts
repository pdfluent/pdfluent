// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 PDFluent Contributors

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const appSource = readFileSync(new URL("../src/App.tsx", import.meta.url), "utf8");

describe("e2ee dialog flows", () => {
  it("opens export/import encrypted dialogs from toolbar actions", () => {
    expect(appSource).toContain(
      "const [exportEncryptedCopyDialogOpen, setExportEncryptedCopyDialogOpen] =",
    );
    expect(appSource).toContain(
      "const [importEncryptedCopyDialogOpen, setImportEncryptedCopyDialogOpen] =",
    );
    expect(appSource).toContain(
      "const openExportEncryptedCopyDialog = useCallback(() => {",
    );
    expect(appSource).toContain(
      "const openImportEncryptedCopyDialog = useCallback(() => {",
    );
    expect(appSource).toContain("onExportEncryptedCopy={openExportEncryptedCopyDialog}");
    expect(appSource).toContain("onImportEncryptedCopy={openImportEncryptedCopyDialog}");
    expect(appSource).toContain("export_encrypted_copy_dialog_opened");
    expect(appSource).toContain("import_encrypted_copy_dialog_opened");
  });

  it("validates export passphrases and output before encrypting", () => {
    expect(appSource).toContain("const exportEncryptedCopy = useCallback(async () => {");
    expect(appSource).toContain("Choose an output path for the encrypted copy.");
    expect(appSource).toContain("Encryption passphrase is required.");
    expect(appSource).toContain("Confirm the encryption passphrase.");
    expect(appSource).toContain("Passphrases did not match.");
    expect(appSource).toContain("export_encrypted_copy_validation_failed");
    expect(appSource).toContain("export_encrypted_copy_start");
    expect(appSource).toContain("export_encrypted_copy_success");
    expect(appSource).toContain("export_encrypted_copy_failure");
    expect(appSource).toContain("id=\"export-encrypted-copy-passphrase-input\"");
  });

  it("validates import inputs and decrypts selected encrypted files", () => {
    expect(appSource).toContain("const importEncryptedCopy = useCallback(async () => {");
    expect(appSource).toContain("Choose an encrypted input file.");
    expect(appSource).toContain("Passphrase is required.");
    expect(appSource).toContain("Choose an output path for the decrypted PDF.");
    expect(appSource).toContain("import_encrypted_copy_validation_failed");
    expect(appSource).toContain("import_encrypted_copy_start");
    expect(appSource).toContain("import_encrypted_copy_success");
    expect(appSource).toContain("import_encrypted_copy_failure");
    expect(appSource).toContain("id=\"import-encrypted-copy-passphrase\"");
    expect(appSource).toContain("pickImportEncryptedCopyPath");
    expect(appSource).toContain("pickImportDecryptedOutputPath");
  });

  it("removes legacy prompt chains for encrypted export/import", () => {
    expect(appSource).not.toContain("window.prompt(\"Set encryption passphrase:");
    expect(appSource).not.toContain("window.prompt(\"Confirm passphrase:");
    expect(appSource).not.toContain("window.prompt(\"Passphrase:");
  });
});
