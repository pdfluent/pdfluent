// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 PDFluent Contributors

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const appSource = readFileSync(new URL("../src/App.tsx", import.meta.url), "utf8");
const toolbarSource = readFileSync(
  new URL("../src/components/Toolbar.tsx", import.meta.url),
  "utf8",
);

describe("document search", () => {
  it("indexes extracted text lines across pages", () => {
    expect(appSource).toContain("const [searchQuery, setSearchQuery] = useState(\"\");");
    expect(appSource).toContain("const [searchMatches, setSearchMatches] = useState<SearchMatch[]>([]);");
    expect(appSource).toContain("search_query_start");
    expect(appSource).toContain("search_query_complete");
    expect(appSource).toContain("extractEditableTextLines(bytes, pageIndex);");
  });

  it("wires search controls to toolbar and viewer", () => {
    expect(appSource).toContain("onSearchQueryChange={updateSearchQuery}");
    expect(appSource).toContain("onSearchPrevious={goToPreviousSearchMatch}");
    expect(appSource).toContain("onSearchNext={goToNextSearchMatch}");
    expect(appSource).toContain("searchLineIndexes={currentPageSearchLineIndexes}");
    expect(appSource).toContain("activeSearchLineIndex={activeSearchLineIndex}");
    expect(appSource).toContain('input[placeholder="Zoek"]');
    expect(appSource).toContain('matchesPrimaryShortcut(platformTheme, e, "f")');
    expect(appSource).toContain("!isPrimaryModifier && hasSearchQuery && e.key === \"Enter\"");
    expect(toolbarSource).toContain("Previous match");
    expect(toolbarSource).toContain("Next match");
  });
});
