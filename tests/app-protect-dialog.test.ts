// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 PDFluent Contributors

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const appSource = readFileSync(new URL("../src/App.tsx", import.meta.url), "utf8");

describe("protect dialog flow", () => {
  it("opens a dedicated protect dialog from toolbar action", () => {
    expect(appSource).toContain(
      "const [protectDialogOpen, setProtectDialogOpen] = useState(false);",
    );
    expect(appSource).toContain(
      "const [protectDialogDraft, setProtectDialogDraft] = useState<ProtectDialogDraft>(",
    );
    expect(appSource).toContain("const openProtectDialog = useCallback(() => {");
    expect(appSource).toContain("onProtectPdf={openProtectDialog}");
    expect(appSource).toContain("protect_dialog_opened");
    expect(appSource).toContain("aria-labelledby=\"protect-dialog-title\"");
    expect(appSource).toContain("Apply protection");
  });

  it("validates user password and runs protection mutation", () => {
    expect(appSource).toContain("const protectDocument = useCallback(async () => {");
    expect(appSource).toContain("User password is required.");
    expect(appSource).toContain("protect_dialog_validation_failed");
    expect(appSource).toContain("protectPdfWithPassword(");
    expect(appSource).toContain("\"protect_pdf\"");
  });

  it("replaces old prompt chain with dialog fields", () => {
    expect(appSource).toContain("id=\"protect-user-password-input\"");
    expect(appSource).toContain("id=\"protect-owner-password-input\"");
    expect(appSource).toContain("type=\"password\"");
    expect(appSource).not.toContain("User password (required):");
    expect(appSource).not.toContain("Owner password (optional):");
  });
});
