// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 PDFluent Contributors

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const appSource = readFileSync(new URL("../src/App.tsx", import.meta.url), "utf8");

describe("redaction dialog flow", () => {
  it("opens a dedicated redaction dialog from the toolbar action", () => {
    expect(appSource).toContain(
      "const [redactionDialogOpen, setRedactionDialogOpen] = useState(false);",
    );
    expect(appSource).toContain("const openRedactionDialog = useCallback(() => {");
    expect(appSource).toContain("onRedactPage={openRedactionDialog}");
    expect(appSource).toContain("redaction_dialog_opened");
    expect(appSource).toContain("aria-labelledby=\"redaction-dialog-title\"");
  });

  it("validates regions input and applies redaction mutation", () => {
    expect(appSource).toContain("const redactCurrentPage = useCallback(async () => {");
    expect(appSource).toContain("Provide at least one redaction region.");
    expect(appSource).toContain("redaction_dialog_validation_failed");
    expect(appSource).toContain("redaction_start");
    expect(appSource).toContain("sanitize document metadata for safer forensic redaction");
    expect(appSource).toContain("redactPageRegions(bytes, currentPage, regions, {");
    expect(appSource).toContain("\"redact_page\"");
  });

  it("replaces old prompt chain with textarea-driven dialog input", () => {
    expect(appSource).toContain("id=\"redaction-regions-input\"");
    expect(appSource).toContain("className=\"redaction-dialog-textarea\"");
    expect(appSource).not.toContain(
      "Redactions: x,y,width,height,label; x,y,width,height",
    );
  });
});
