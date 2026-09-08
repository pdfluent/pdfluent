// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary. The PDFluent application is free to use,
// including for commercial purposes. Redistribution, or extraction or reuse
// of its components (including the embedded PDF engine), requires a licence.
// See https://pdfluent.com/license for terms.
//
// Regression tests for the Tauri v2 Windows updater artifact format.
//
// Tauri v2 with `createUpdaterArtifacts: true` signs the installer DIRECTLY,
// producing `<installer>.msi.sig` (the bare MSI) — NOT the legacy v1
// `.msi.zip` + `.msi.zip.sig` wrapper. These tests pin:
//   1. scripts/ci-generate-latest-json.mjs discovers `*.msi.sig` and points
//      latest.json at the matching bare `.msi` (not a `.msi.zip`), with Linux
//      still required and macOS still optional (existing behavior intact);
//   2. the legacy `*.msi.zip.sig` name is NOT matched;
//   3. the release scripts no longer reference the v1 `.msi.zip` format.
//
// The generator is exercised as a subprocess against fixture artifacts in a temp
// dir (no build, no network, no signing keys).

import { describe, it, expect } from "vitest";
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const REPO_ROOT = process.cwd();
const GEN = path.join(REPO_ROOT, "scripts", "ci-generate-latest-json.mjs");

// Signature *content* is opaque to the generator (it copies the trimmed bytes
// verbatim into latest.json). These fixtures assert discovery + URL/signature
// wiring, not cryptography — so any stable base64-ish blobs suffice.
const SIG_MSI = "dW50cnVzdGVkIGNvbW1lbnQ6IHNpZ25hdHVyZSBmcm9tIHRhdXJpIHNlY3JldCBrZXkKRkFLRV9NU0lfU0lHCg==";
const SIG_LINUX = "dW50cnVzdGVkIGNvbW1lbnQ6IHNpZ25hdHVyZSBmcm9tIHRhdXJpIHNlY3JldCBrZXkKRkFLRV9MSU5VWF9TSUcK";
const SIG_MAC = "dW50cnVzdGVkIGNvbW1lbnQ6IHNpZ25hdHVyZSBmcm9tIHRhdXJpIHNlY3JldCBrZXkKRkFLRV9NQUNfU0lHCg==";

interface GenOpts {
  version: string;
  windows?: string; // sig filename under artifacts/windows/, or omit
  linux?: string; // sig filename under artifacts/linux/
  macos?: string; // sig filename under artifacts/macos/
}

interface LatestJson {
  version: string;
  notes: string;
  pub_date: string;
  platforms: Record<string, { url: string; signature: string } | undefined>;
}

function runGenerator(opts: GenOpts): { out: LatestJson; dir: string } {
  const dir = mkdtempSync(path.join(tmpdir(), "pdfl-latest-"));
  const base = path.join(dir, "artifacts");
  for (const p of ["windows", "linux", "macos"]) {
    mkdirSync(path.join(base, p), { recursive: true });
  }
  if (opts.windows) writeFileSync(path.join(base, "windows", opts.windows), SIG_MSI + "\n");
  if (opts.linux) writeFileSync(path.join(base, "linux", opts.linux), SIG_LINUX + "\n");
  if (opts.macos) writeFileSync(path.join(base, "macos", opts.macos), SIG_MAC + "\n");

  execFileSync("node", [GEN], {
    cwd: dir,
    env: {
      ...process.env,
      CI_COMMIT_TAG: `v${opts.version}`,
      CF_R2_PUBLIC_URL: "https://pdfluent.com/releases",
      CF_R2_BUCKET_NAME: "pdfluent-releases",
      // These fixtures are about sig DISCOVERY, not about the publish gate:
      // there is no artefact here to hash and no report to hash it against.
      // The gate itself is covered in tests/release-suite/publish-guard.test.ts,
      // including that this generator refuses without the override.
      PDFLUENT_PUBLISH_WITHOUT_REPORT: "411",
    },
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  const out = JSON.parse(readFileSync(path.join(dir, "latest.json"), "utf8")) as LatestJson;
  return { out, dir };
}

describe("Tauri v2 Windows updater artifact discovery (latest.json)", () => {
  it("detects *.msi.sig and points latest.json at the bare MSI (no .msi.zip)", () => {
    const { out } = runGenerator({
      version: "1.0.0-beta.15",
      windows: "PDFluent_1.0.0-beta.15_x64_en-US.msi.sig",
      linux: "PDFluent_1.0.0-beta.15_amd64.AppImage.tar.gz.sig",
    });
    expect(out.version).toBe("1.0.0-beta.15");
    const w = out.platforms["windows-x86_64"];
    expect(w).toBeDefined();
    expect(w?.url).toBe(
      "https://pdfluent.com/releases/1.0.0-beta.15/PDFluent_1.0.0-beta.15_x64_en-US.msi",
    );
    expect(w?.url.endsWith(".msi")).toBe(true);
    expect(w?.url).not.toContain(".msi.zip");
    expect(w?.signature).toBe(SIG_MSI);
  });

  it("includes every platform whose sig is present (macOS + Windows + optional Linux)", () => {
    const { out } = runGenerator({
      version: "1.0.0-beta.15",
      windows: "PDFluent_1.0.0-beta.15_x64_en-US.msi.sig",
      linux: "PDFluent_1.0.0-beta.15_amd64.AppImage.tar.gz.sig",
      macos: "PDFluent_1.0.0-beta.15_aarch64.app.tar.gz.sig",
    });
    expect(out.platforms["darwin-aarch64"]?.url.endsWith(".app.tar.gz")).toBe(true);
    expect(out.platforms["windows-x86_64"]?.url.endsWith(".msi")).toBe(true);
    expect(out.platforms["linux-x86_64"]?.url.endsWith(".AppImage.tar.gz")).toBe(true);
  });

  it("Windows+macOS-only release: omits Linux when absent (Linux is optional)", () => {
    const { out } = runGenerator({
      version: "1.0.0-beta.15",
      windows: "PDFluent_1.0.0-beta.15_x64_en-US.msi.sig",
      macos: "PDFluent_1.0.0-beta.15_aarch64.app.tar.gz.sig",
    });
    expect(out.platforms["windows-x86_64"]).toBeDefined();
    expect(out.platforms["darwin-aarch64"]).toBeDefined();
    expect(out.platforms["linux-x86_64"]).toBeUndefined();
  });

  it("does NOT match the legacy v1 .msi.zip.sig name (windows omitted)", () => {
    const { out } = runGenerator({
      version: "1.0.0-beta.15",
      windows: "PDFluent_1.0.0-beta.15_x64_en-US.msi.zip.sig", // legacy v1 wrapper
      linux: "PDFluent_1.0.0-beta.15_amd64.AppImage.tar.gz.sig",
    });
    expect(out.platforms["windows-x86_64"]).toBeUndefined();
  });

  it("generates a Windows-only feed when it is the only platform present", () => {
    const { out } = runGenerator({
      version: "1.0.0-beta.15",
      windows: "PDFluent_1.0.0-beta.15_x64_en-US.msi.sig",
    });
    expect(Object.keys(out.platforms)).toEqual(["windows-x86_64"]);
  });

  it("fails only when NO platform artifacts exist at all", () => {
    expect(() => runGenerator({ version: "1.0.0-beta.15" })).toThrow();
  });
});

describe("release scripts use the Tauri v2 direct-installer format (no .msi.zip)", () => {
  it("ci-generate-latest-json.mjs matches /\\.msi\\.sig$/ and dropped the v1 pattern", () => {
    const src = readFileSync(path.join(REPO_ROOT, "scripts", "ci-generate-latest-json.mjs"), "utf8");
    expect(src).toContain("/\\.msi\\.sig$/"); // v2 direct-installer discovery
    expect(src).not.toContain("/\\.msi\\.zip\\.sig$/"); // legacy v1 pattern removed
  });

  it("release-windows.ps1 stages *.msi.sig and emits UPDATER_SIG (no v1 markers)", () => {
    const ps = readFileSync(path.join(REPO_ROOT, "scripts", "release-windows.ps1"), "utf8");
    expect(ps).toContain("-Filter *.msi.sig"); // stages the v2 direct-installer sig
    expect(ps).toContain("UPDATER_SIG=");
    expect(ps).not.toContain("UPDATER_MSIZIP"); // legacy marker removed
    expect(ps).not.toContain("-Filter *.msi.zip"); // legacy staging removed
  });
});
