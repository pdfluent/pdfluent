// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 PDFluent Contributors

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const appSource = readFileSync(new URL("../src/App.tsx", import.meta.url), "utf8");

describe("app native shortcut parity wiring", () => {
  it("uses platform-aware shortcut matchers for key actions", () => {
    expect(appSource).toContain("const platformTheme = useMemo(() => detectPlatformTheme(), []);");
    expect(appSource).toContain("isPrimaryModifierPressed(platformTheme, e)");
    expect(appSource).toContain("matchesUndoShortcut(platformTheme, e)");
    expect(appSource).toContain("matchesRedoShortcut(platformTheme, e)");
    expect(appSource).toContain("matchesPrimaryShortcut(platformTheme, e, \"f\")");
    expect(appSource).toContain("matchesPrimaryShortcut(platformTheme, e, \"0\")");
    expect(appSource).toContain("const isZoomInShortcut =");
    expect(appSource).toContain("const isZoomOutShortcut =");
  });
});
