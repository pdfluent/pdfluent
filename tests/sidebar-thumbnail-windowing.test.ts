// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 PDFluent Contributors

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  getThumbnailLoadTargets,
  getThumbnailTargetPages,
} from "../src/components/Sidebar";

const sidebarSource = readFileSync(
  new URL("../src/components/Sidebar.tsx", import.meta.url),
  "utf8",
);

describe("sidebar thumbnail loading", () => {
  it("builds target pages around active page", () => {
    expect(getThumbnailTargetPages(8, 33)).toEqual([4, 5, 6, 7, 8, 9, 10, 11, 12]);
  });

  it("merges visible thumbnails into load targets", () => {
    expect(getThumbnailLoadTargets(8, 33, new Set([0, 1]))).toEqual([
      0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12,
    ]);
  });

  it("preloads first pages before visibility observer is ready", () => {
    expect(getThumbnailLoadTargets(20, 33, new Set())).toEqual([
      0, 1, 2, 3, 4, 16, 17, 18, 19, 20, 21, 22, 23, 24,
    ]);
  });

  it("uses windowed thumbnail preloading around current page", () => {
    expect(sidebarSource).toContain("const THUMBNAIL_PAGE_BUFFER = 4;");
    expect(sidebarSource).toContain("const [visiblePages, setVisiblePages] = useState<Set<number>>(new Set());");
    expect(sidebarSource).toContain("getThumbnailLoadTargets(");
    expect(sidebarSource).toContain("rootMargin: \"120px 0px 120px 0px\",");
    expect(sidebarSource).toContain("const aspectRatio =");
    expect(sidebarSource).toContain("style={{ aspectRatio }}");
    expect(sidebarSource).not.toContain("for (let i = 0; i < docInfo!.page_count; i++)");
  });

  it("bounds thumbnail cache and clears inflight markers", () => {
    expect(sidebarSource).toContain("const THUMBNAIL_CACHE_LIMIT = 42;");
    expect(sidebarSource).toContain("trimThumbnailCache");
    expect(sidebarSource).toContain("loadingRef.current.delete(pageIndex);");
  });
});
