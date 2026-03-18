// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 PDFluent Contributors

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const viewerSource = readFileSync(
  new URL("../src/components/Viewer.tsx", import.meta.url),
  "utf8",
);

describe("large-file performance guards", () => {
  it("adds a continuous page cache memory budget with pruning", () => {
    expect(viewerSource).toContain("const CONTINUOUS_PAGE_MEMORY_BUDGET_BYTES = 72 * 1024 * 1024;");
    expect(viewerSource).toContain("function estimateRenderedPageBytes(page: RenderedPage): number {");
    expect(viewerSource).toContain("function pruneContinuousPageCache(");
    expect(viewerSource).toContain("setContinuousPages((prev) => {");
    expect(viewerSource).toContain("continuous_cache_pruned");
    expect(viewerSource).toContain("continuous_cache_evicted_after_render");
  });

  it("captures cache budget telemetry when scheduling render batches", () => {
    expect(viewerSource).toContain("estimatedCacheBytes: estimateRenderedPageMapBytes(continuousPages)");
    expect(viewerSource).toContain("budgetBytes: CONTINUOUS_PAGE_MEMORY_BUDGET_BYTES");
  });
});
