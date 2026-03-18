// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 PDFluent Contributors

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const appSource = readFileSync(new URL("../src/App.tsx", import.meta.url), "utf8");
const toolbarSource = readFileSync(
  new URL("../src/components/Toolbar.tsx", import.meta.url),
  "utf8",
);

describe("sidebar visibility controls", () => {
  it("tracks and persists sidebar visibility", () => {
    expect(appSource).toContain("const SIDEBAR_VISIBLE_STORAGE_KEY = \"pdfluent:sidebar-visible\";");
    expect(appSource).toContain("const [sidebarVisible, setSidebarVisible] = useState<boolean>(() =>");
    expect(appSource).toContain("localStorage.setItem(SIDEBAR_VISIBLE_STORAGE_KEY, sidebarVisible ? \"1\" : \"0\");");
    expect(appSource).toContain("sidebar_visibility_changed");
  });

  it("renders sidebar conditionally and wires toolbar toggle props", () => {
    expect(appSource).toContain("{sidebarVisible && (");
    expect(appSource).toContain("sidebarVisible={sidebarVisible}");
    expect(appSource).toContain("onToggleSidebar={toggleSidebarVisibility}");
    expect(toolbarSource).toContain("Toggle sidebar");
    expect(toolbarSource).toContain("sidebarVisible: boolean;");
    expect(toolbarSource).toContain("onToggleSidebar: () => void;");
  });
});
