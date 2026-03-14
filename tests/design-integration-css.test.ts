// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 PDFluent Contributors

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const css = readFileSync(
  new URL("../src/styles/magic-patterns.css", import.meta.url),
  "utf8",
);

// NOTE: Three test cases that asserted magic-patterns CSS class names
// (pf-toolbar, pf-sidebar, pf-viewer, pf-thumbnail-item) on the legacy
// Toolbar.tsx / Sidebar.tsx / Viewer.tsx were removed. That CSS migration
// was superseded by the v2 viewer adopting shadcn/Tailwind tokens. The
// migration will never be applied to the legacy "/" viewer components.
// Tracked as known legacy debt.

describe("magic-patterns design integration", () => {
  it("defines the mac-style neutral surface tokens", () => {
    expect(css).toContain("--pf-surface-0: hsl(36 2% 76%);");
    expect(css).toContain("--pf-surface-1: hsl(0 0% 96%);");
    expect(css).toContain("--pf-accent: hsl(211 100% 50%);");
    expect(css).toContain("--pf-toolbar-height: 52px;");
    expect(css).toContain("--pf-sidebar-width: 170px;");
  });

  it("enables tailwind base and custom scrollbar utilities", () => {
    expect(css).toContain("@tailwind base;");
    expect(css).toContain("@tailwind components;");
    expect(css).toContain("@tailwind utilities;");
    expect(css).toContain(".pf-scrollbar::-webkit-scrollbar");
    expect(css).toContain(".pf-glow");
  });
});
