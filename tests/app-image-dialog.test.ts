// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 PDFluent Contributors

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const appSource = readFileSync(new URL("../src/App.tsx", import.meta.url), "utf8");

describe("image dialog flows", () => {
  it("opens dedicated dialogs for add image and remove image area", () => {
    expect(appSource).toContain("const [addImageDialogOpen, setAddImageDialogOpen] = useState(false);");
    expect(appSource).toContain(
      "const [addImageDialogDraft, setAddImageDialogDraft] =",
    );
    expect(appSource).toContain(
      "const [removeImageAreaDialogOpen, setRemoveImageAreaDialogOpen] = useState(false);",
    );
    expect(appSource).toContain("const openAddImageDialog = useCallback(() => {");
    expect(appSource).toContain("const openRemoveImageAreaDialog = useCallback(() => {");
    expect(appSource).toContain("onAddImage={openAddImageDialog}");
    expect(appSource).toContain("onRemoveImageArea={openRemoveImageAreaDialog}");
    expect(appSource).toContain("add_image_dialog_opened");
    expect(appSource).toContain("remove_image_area_dialog_opened");
  });

  it("supports file selection and validation before adding an image", () => {
    expect(appSource).toContain("const pickAddImageFile = useCallback(async () => {");
    expect(appSource).toContain("add_image_dialog_file_selected");
    expect(appSource).toContain("Choose an image file (PNG or JPEG).");
    expect(appSource).toContain("add_image_dialog_validation_failed");
    expect(appSource).toContain("id=\"add-image-path-input\"");
    expect(appSource).toContain("id=\"add-image-width-input\"");
    expect(appSource).toContain("id=\"add-image-opacity-input\"");
    expect(appSource).toContain("id=\"add-image-rotation-input\"");
    expect(appSource).toContain("id=\"add-image-layer-order-select\"");
    expect(appSource).toContain("parseLayerOrderInput(addImageDialogDraft.layerOrder, \"front\")");
    expect(appSource).toContain("Choose image");
    expect(appSource).toContain("return addImageToPage(");
    expect(appSource).toContain("rotationDegrees,");
    expect(appSource).toContain("opacity,");
    expect(appSource).toContain("layerOrder,");
  });

  it("replaces old prompt chains for image placement and area removal", () => {
    expect(appSource).toContain("id=\"remove-image-area-x-input\"");
    expect(appSource).toContain("id=\"remove-image-area-width-input\"");
    expect(appSource).toContain("removeImageAreaFromPage(bytes, currentPage, {");
    expect(appSource).toContain("const replaceImageAreaOnCurrentPage = useCallback(async () => {");
    expect(appSource).toContain("replaceImageAreaOnPage(");
    expect(appSource).toContain("Image layer order (front|back):");
    expect(appSource).toContain("remove_image_area_start");
    expect(appSource).not.toContain("Image X position (pt):");
    expect(appSource).not.toContain("Image Y position (pt):");
    expect(appSource).not.toContain("Area X position (pt):");
    expect(appSource).not.toContain("Area width (pt):");
  });
});
