// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 PDFluent Contributors

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const cssSource = readFileSync(
  new URL("../src/styles/global.css", import.meta.url),
  "utf8",
);

describe("split dialog styles", () => {
  it("includes split dialog overlay and card styles", () => {
    expect(cssSource).toContain(".split-dialog-backdrop");
    expect(cssSource).toContain(".split-dialog");
    expect(cssSource).toContain(".split-dialog-title");
    expect(cssSource).toContain(".split-dialog-input");
    expect(cssSource).toContain(".split-dialog-actions");
  });

  it("includes sign dialog overlay and layout styles", () => {
    expect(cssSource).toContain(".sign-dialog-backdrop");
    expect(cssSource).toContain(".sign-dialog");
    expect(cssSource).toContain(".sign-dialog-grid-signature");
    expect(cssSource).toContain(".sign-dialog-input");
    expect(cssSource).toContain(".sign-dialog-actions");
  });

  it("includes protect dialog overlay and form styles", () => {
    expect(cssSource).toContain(".protect-dialog-backdrop");
    expect(cssSource).toContain(".protect-dialog");
    expect(cssSource).toContain(".protect-dialog-title");
    expect(cssSource).toContain(".protect-dialog-input");
    expect(cssSource).toContain(".protect-dialog-actions");
  });

  it("includes watermark dialog overlay and form styles", () => {
    expect(cssSource).toContain(".watermark-dialog-backdrop");
    expect(cssSource).toContain(".watermark-dialog");
    expect(cssSource).toContain(".watermark-dialog-title");
    expect(cssSource).toContain(".watermark-dialog-grid");
    expect(cssSource).toContain(".watermark-dialog-input");
    expect(cssSource).toContain(".watermark-dialog-actions");
  });

  it("includes image dialogs for add/remove image actions", () => {
    expect(cssSource).toContain(".add-image-dialog-backdrop");
    expect(cssSource).toContain(".add-image-dialog");
    expect(cssSource).toContain(".add-image-dialog-grid");
    expect(cssSource).toContain(".add-image-dialog-actions");
    expect(cssSource).toContain(".remove-image-area-dialog-backdrop");
    expect(cssSource).toContain(".remove-image-area-dialog");
    expect(cssSource).toContain(".remove-image-area-dialog-grid");
    expect(cssSource).toContain(".remove-image-area-dialog-actions");
  });

  it("includes redaction dialog overlay and textarea styles", () => {
    expect(cssSource).toContain(".redaction-dialog-backdrop");
    expect(cssSource).toContain(".redaction-dialog");
    expect(cssSource).toContain(".redaction-dialog-title");
    expect(cssSource).toContain(".redaction-dialog-textarea");
    expect(cssSource).toContain(".redaction-dialog-actions");
  });

  it("includes encrypted copy dialog styles", () => {
    expect(cssSource).toContain(".export-encrypted-copy-dialog-backdrop");
    expect(cssSource).toContain(".export-encrypted-copy-dialog");
    expect(cssSource).toContain(".export-encrypted-copy-dialog-input");
    expect(cssSource).toContain(".export-encrypted-copy-dialog-actions");
    expect(cssSource).toContain(".import-encrypted-copy-dialog-backdrop");
    expect(cssSource).toContain(".import-encrypted-copy-dialog");
    expect(cssSource).toContain(".import-encrypted-copy-dialog-input");
    expect(cssSource).toContain(".import-encrypted-copy-dialog-actions");
  });

  it("includes export images dialog styles", () => {
    expect(cssSource).toContain(".export-images-dialog-backdrop");
    expect(cssSource).toContain(".export-images-dialog");
    expect(cssSource).toContain(".export-images-dialog-grid");
    expect(cssSource).toContain(".export-images-dialog-input");
    expect(cssSource).toContain(".export-images-dialog-actions");
  });
});
