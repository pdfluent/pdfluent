// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 PDFluent Contributors

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("tauri capabilities", () => {
  it("grants fs:allow-exists for recovery snapshot checks", () => {
    const raw = readFileSync(
      new URL("../src-tauri/capabilities/main.json", import.meta.url),
      "utf8",
    );
    const capability = JSON.parse(raw) as { permissions?: Array<string | unknown> };
    const permissions = capability.permissions?.filter(
      (entry): entry is string => typeof entry === "string",
    );

    expect(permissions).toContain("fs:allow-exists");
  });

  it("enables asset protocol for native file viewer URLs", () => {
    const raw = readFileSync(
      new URL("../src-tauri/tauri.conf.json", import.meta.url),
      "utf8",
    );
    const config = JSON.parse(raw) as {
      app?: {
        security?: {
          assetProtocol?: {
            enable?: boolean;
            scope?: string[];
          };
        };
      };
    };
    const assetProtocol = config.app?.security?.assetProtocol;

    expect(assetProtocol?.enable).toBe(true);
    expect(assetProtocol?.scope).toEqual(
      expect.arrayContaining(["$HOME/**", "$DOCUMENT/**", "$DOWNLOAD/**"]),
    );
  });
});
