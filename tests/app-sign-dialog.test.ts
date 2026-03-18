// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 PDFluent Contributors

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const appSource = readFileSync(new URL("../src/App.tsx", import.meta.url), "utf8");

describe("sign dialog flow", () => {
  it("opens a dedicated sign dialog from toolbar action", () => {
    expect(appSource).toContain("const [signDialogOpen, setSignDialogOpen] = useState(false);");
    expect(appSource).toContain(
      "const [signDialogDraft, setSignDialogDraft] = useState<SignDialogDraft>(()",
    );
    expect(appSource).toContain("const openSignDialog = useCallback(async () => {");
    expect(appSource).toContain("onSignDocument={openSignDialog}");
    expect(appSource).toContain("sign_dialog_opened");
    expect(appSource).toContain("aria-labelledby=\"sign-dialog-title\"");
    expect(appSource).toContain("Apply signature");
  });

  it("handles certificate selection and validates required sign inputs", () => {
    expect(appSource).toContain("const selectSignCertificate = useCallback(async () => {");
    expect(appSource).toContain("filters: [{ name: \"Certificate\", extensions: [\"p12\", \"pfx\"] }]");
    expect(appSource).toContain("sign_certificate_selected");
    expect(appSource).toContain("Choose a signing certificate (.p12 or .pfx).");
    expect(appSource).toContain("Signer name is required.");
    expect(appSource).toContain("sign_dialog_validation_failed");
  });

  it("replaces old sign prompt chain with modal form fields", () => {
    expect(appSource).toContain("id=\"sign-cert-input\"");
    expect(appSource).toContain("id=\"sign-password-input\"");
    expect(appSource).toContain("id=\"sign-name-input\"");
    expect(appSource).toContain("id=\"sign-width-input\"");
    expect(appSource).toContain("type=\"password\"");
    expect(appSource).not.toContain("Certificate password:");
    expect(appSource).not.toContain("Signer name:");
    expect(appSource).not.toContain("Signature X position (pt):");
  });
});
