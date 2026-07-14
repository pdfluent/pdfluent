// SPDX-License-Identifier: LicenseRef-PDFluent-Proprietary
// Copyright (c) 2026 PDFluent Contributors

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("tauri capabilities", () => {
  it("grants the scoped filesystem access a local editor needs, but never shell access", () => {
    const raw = readFileSync(
      new URL("../src-tauri/capabilities/main.json", import.meta.url),
      "utf8",
    );
    const capability = JSON.parse(raw) as {
      permissions?: Array<string | { identifier?: string }>;
    };
    const permissions = capability.permissions ?? [];
    const stringPerms = permissions.filter(
      (entry): entry is string => typeof entry === "string",
    );

    expect(stringPerms).toEqual(
      expect.arrayContaining(["core:default", "core:event:default", "dialog:default"]),
    );
    // PDFluent edits the local files the user opens (Finder, drag-drop, dialog,
    // recent files), so it must grant fs commands...
    expect(stringPerms.some((permission) => permission.startsWith("fs:allow-"))).toBe(true);
    // ...but only through an explicit fs:scope entry, never an unscoped grant.
    expect(
      permissions.some(
        (entry) =>
          typeof entry === "object" &&
          (entry as { identifier?: string }).identifier === "fs:scope",
      ),
    ).toBe(true);
    // The frontend must never be able to spawn shell processes.
    expect(raw).not.toMatch(/"shell:/);
  });

  it("keeps a strict script CSP and enables the asset protocol only with an explicit scope", () => {
    const raw = readFileSync(
      new URL("../src-tauri/tauri.conf.json", import.meta.url),
      "utf8",
    );
    const config = JSON.parse(raw) as {
      app?: {
        withGlobalTauri?: boolean;
        security?: {
          csp?: string | null;
          assetProtocol?: {
            enable?: boolean;
            scope?: string[];
          };
        };
      };
      bundle?: {
        resources?: string[] | Record<string, string>;
      };
    };
    const assetProtocol = config.app?.security?.assetProtocol;
    const csp = config.app?.security?.csp ?? "";

    expect(config.app?.withGlobalTauri).toBe(false);
    expect(csp).toContain("default-src 'self'");
    expect(csp).toContain("script-src 'self'");
    expect(csp).not.toContain("wasm-unsafe-eval");
    expect(csp).not.toContain("'unsafe-eval'");
    expect(csp).toContain("object-src 'none'");
    // No remote script origins may be allowed (defense against remote code).
    const scriptSrc = /script-src[^;]*/.exec(csp)?.[0] ?? "";
    expect(scriptSrc).not.toMatch(/https?:\/\//);
    // The native PDF viewer renders local files through the asset protocol, so it
    // is enabled - but only with an explicit, non-empty path scope, and the CSP
    // must whitelist the asset frame (frame-src) without allowing remote frames.
    expect(assetProtocol?.enable).toBe(true);
    expect((assetProtocol?.scope ?? []).length).toBeGreaterThan(0);
    expect(csp).toContain("frame-src");
    const resources = config.bundle?.resources;
    const resourceSources = Array.isArray(resources)
      ? resources
      : Object.keys(resources ?? {});
    expect(resourceSources).toContain("resources/fonts/liberation-2.1.5");
    // EULA + open-source notices must be bundled for the commercial release.
    expect(resourceSources).toContain("../LICENSE.md");
    expect(resourceSources).toContain("../THIRD_PARTY.md");
  });
});
