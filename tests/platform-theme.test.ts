// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 PDFluent Contributors

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const appSource = readFileSync(new URL("../src/App.tsx", import.meta.url), "utf8");
const css = readFileSync(new URL("../src/styles/global.css", import.meta.url), "utf8");

describe("platform-specific theming", () => {
  it("detects platform theme and applies it on the root element", () => {
    expect(appSource).toContain("type PlatformTheme = \"mac\" | \"windows\" | \"other\";");
    expect(appSource).toContain("function detectPlatformTheme()");
    expect(appSource).toContain("document.documentElement.dataset.platform = platformTheme;");
    expect(appSource).toContain('appendDebugLog("info", "platform_theme_selected"');
  });

  it("defines dedicated windows override tokens and component styles", () => {
    expect(css).toContain(':root[data-platform="windows"] {');
    expect(css).toContain("--accent: #0f6cfe;");
    expect(css).toContain(':root[data-platform="windows"] .toolbar {');
    expect(css).toContain(':root[data-platform="windows"] .sidebar {');
    expect(css).toContain(':root[data-platform="windows"] .viewer-page-image {');
  });
});
