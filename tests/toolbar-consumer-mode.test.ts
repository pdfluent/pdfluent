// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 PDFluent Contributors

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const toolbarSource = readFileSync(
  new URL("../src/components/Toolbar.tsx", import.meta.url),
  "utf8",
);

describe("toolbar consumer mode", () => {
  it("keeps a small intuitive action set", () => {
    expect(toolbarSource).toContain("Open PDF");
    expect(toolbarSource).toContain("Zoom Out");
    expect(toolbarSource).toContain("Zoom In");
    expect(toolbarSource).toContain("Text Edit");
    expect(toolbarSource).toContain("Rotate");
    expect(toolbarSource).toContain("Fit Width");
  });

  it("hides enterprise and network technical controls", () => {
    expect(toolbarSource).not.toMatch(/>\s*BYOS\s*</);
    expect(toolbarSource).not.toMatch(/>\s*Enable Network\s*</);
    expect(toolbarSource).not.toMatch(/>\s*SSO\s*</);
    expect(toolbarSource).not.toMatch(/>\s*Batch\s*</);
    expect(toolbarSource).not.toMatch(/>\s*Branding\s*</);
    expect(toolbarSource).not.toMatch(/>\s*API Key\s*</);
    expect(toolbarSource).not.toMatch(/>\s*Audit Log\s*</);
  });
});
