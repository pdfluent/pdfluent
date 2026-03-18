// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 PDFluent Contributors

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const mainSource = readFileSync(new URL("../src/main.tsx", import.meta.url), "utf8");
const boundarySource = readFileSync(
  new URL("../src/components/ErrorBoundary.tsx", import.meta.url),
  "utf8",
);

describe("runtime error boundary", () => {
  it("wraps the app root with ErrorBoundary", () => {
    expect(mainSource).toContain("<ErrorBoundary>");
    expect(mainSource).toContain("</ErrorBoundary>");
  });

  it("captures render crashes and logs diagnostic context", () => {
    expect(boundarySource).toContain("getDerivedStateFromError");
    expect(boundarySource).toContain("componentDidCatch(error: Error, info: ErrorInfo)");
    expect(boundarySource).toContain("react_error_boundary_caught");
    expect(boundarySource).toContain("componentStack: info.componentStack");
  });

  it("renders a recoverable fallback UI", () => {
    expect(boundarySource).toContain("Application error");
    expect(boundarySource).toContain("Reload app");
    expect(boundarySource).toContain("window.location.reload()");
  });
});
