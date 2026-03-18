// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 PDFluent Contributors

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const appSource = readFileSync(new URL("../src/App.tsx", import.meta.url), "utf8");

describe("export images dialog flow", () => {
  it("opens a dedicated export images dialog from toolbar action", () => {
    expect(appSource).toContain(
      "const [exportImagesDialogOpen, setExportImagesDialogOpen] = useState(false);",
    );
    expect(appSource).toContain("const openExportImagesDialog = useCallback(() => {");
    expect(appSource).toContain("onExportImages={openExportImagesDialog}");
    expect(appSource).toContain("export_images_dialog_opened");
    expect(appSource).toContain("aria-labelledby=\"export-images-dialog-title\"");
  });

  it("validates output path and runs export with configured parameters", () => {
    expect(appSource).toContain("const exportAsImages = useCallback(async () => {");
    expect(appSource).toContain("Choose an output path for exported images.");
    expect(appSource).toContain("export_images_dialog_validation_failed");
    expect(appSource).toContain("export_images_start");
    expect(appSource).toContain("export_images_success");
    expect(appSource).toContain("export_images_failure");
    expect(appSource).toContain("id=\"export-images-format-select\"");
    expect(appSource).toContain("id=\"export-images-scale-input\"");
    expect(appSource).toContain("id=\"export-images-jpeg-quality-input\"");
    expect(appSource).toContain("id=\"export-images-output-input\"");
  });

  it("replaces legacy prompt chain with dialog controls", () => {
    expect(appSource).not.toContain("Image format (png or jpg):");
    expect(appSource).not.toContain("Render scale (1.0 - 4.0):");
    expect(appSource).not.toContain("JPEG quality (0.4-1.0):");
  });
});
