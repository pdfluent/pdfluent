// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 PDFluent Contributors

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const appSource = readFileSync(new URL("../src/App.tsx", import.meta.url), "utf8");

describe("watermark dialog flow", () => {
  it("opens a dedicated watermark dialog from toolbar action", () => {
    expect(appSource).toContain("const [watermarkDialogOpen, setWatermarkDialogOpen] = useState(false);");
    expect(appSource).toContain(
      "const [watermarkDialogDraft, setWatermarkDialogDraft] =",
    );
    expect(appSource).toContain("const openWatermarkDialog = useCallback(() => {");
    expect(appSource).toContain("onAddWatermark={openWatermarkDialog}");
    expect(appSource).toContain("watermark_dialog_opened");
    expect(appSource).toContain("aria-labelledby=\"watermark-dialog-title\"");
    expect(appSource).toContain("Apply watermark");
  });

  it("validates text and applies watermark mutation", () => {
    expect(appSource).toContain("const addWatermark = useCallback(async () => {");
    expect(appSource).toContain("Watermark text is required.");
    expect(appSource).toContain("watermark_dialog_validation_failed");
    expect(appSource).toContain("addWatermarkToDocument(bytes, {");
    expect(appSource).toContain("\"add_watermark\"");
  });

  it("replaces old prompt chain with dialog fields", () => {
    expect(appSource).toContain("id=\"watermark-text-input\"");
    expect(appSource).toContain("id=\"watermark-opacity-input\"");
    expect(appSource).toContain("id=\"watermark-rotation-input\"");
    expect(appSource).toContain("id=\"watermark-font-size-input\"");
    expect(appSource).not.toContain("Watermark text:");
    expect(appSource).not.toContain("Watermark opacity (0.05-0.95):");
    expect(appSource).not.toContain("Watermark rotation (degrees):");
  });
});
