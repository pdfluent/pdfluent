// SPDX-License-Identifier: LicenseRef-PDFluent-Proprietary
// Copyright (c) 2026 Innovation Trigger B.V.

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const appSource = readFileSync(new URL("../src/legacy/App.tsx", import.meta.url), "utf8");

describe("view mode defaults", () => {
  it("defaults to continuous mode for natural page scrolling", () => {
    expect(appSource).toContain(
      'const DEFAULT_VIEW_MODE: ViewMode = "continuous";',
    );
  });
});
