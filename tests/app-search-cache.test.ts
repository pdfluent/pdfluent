// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 PDFluent Contributors

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const appSource = readFileSync(new URL("../src/App.tsx", import.meta.url), "utf8");

describe("search page cache", () => {
  it("tracks a per-page cache and resets when document changes", () => {
    expect(appSource).toContain("const searchPageCacheRef = useRef<Map<number, EditableTextLine[]>>(new Map());");
    expect(appSource).toContain("searchPageCacheRef.current = new Map();");
    expect(appSource).toContain("search_page_cache_reset");
  });

  it("logs cache hits and misses during indexed search", () => {
    expect(appSource).toContain("search_page_cache_miss");
    expect(appSource).toContain("search_page_cache_hit");
    expect(appSource).toContain("searchPageCacheRef.current.set(pageIndex, lines);");
    expect(appSource).toContain("let lines = searchPageCacheRef.current.get(pageIndex);");
  });
});
