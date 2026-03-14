// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 PDFluent Contributors

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const appSource = readFileSync(new URL("../src/App.tsx", import.meta.url), "utf8");

// NOTE: One test case that asserted pf-thumbnail-item and shadow-pf-page CSS
// class names on the legacy Sidebar.tsx was removed. That magic-patterns CSS
// migration was superseded by the v2 viewer adopting shadcn/Tailwind tokens.
// Tracked as known legacy debt.

describe("app layout ux", () => {
  it("shows form panel only when form fields exist", () => {
    expect(appSource).toContain("{formFields.length > 0 && formPanelVisible && (");
    expect(appSource).toContain("<FormPanel");
  });

  it("passes sidebar width controls from app to sidebar", () => {
    expect(appSource).toContain("width={sidebarWidth}");
    expect(appSource).toContain("onIncreaseWidth={increaseSidebarWidth}");
    expect(appSource).toContain("onDecreaseWidth={decreaseSidebarWidth}");
  });
});
