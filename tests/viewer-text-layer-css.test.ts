// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 PDFluent Contributors

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const cssSource = readFileSync(
  new URL("../src/styles/global.css", import.meta.url),
  "utf8",
);

describe("viewer selectable text layer styles", () => {
  it("defines overlay classes for invisible selectable text", () => {
    expect(cssSource).toContain(".viewer-text-selection-layer");
    expect(cssSource).toContain("user-select: text;");
    expect(cssSource).toContain(".viewer-text-selection-line");
    expect(cssSource).toContain("color: transparent;");
    expect(cssSource).toContain(".viewer-text-selection-line::selection");
    expect(cssSource).toContain(".viewer-native-error-banner");
    expect(cssSource).toContain(".viewer-text-inline-editor");
    expect(cssSource).toContain(".viewer-text-inline-input");
    expect(cssSource).toContain(".viewer-text-inline-actions");
    expect(cssSource).toContain(".viewer-page-native-iframe");
  });
});
