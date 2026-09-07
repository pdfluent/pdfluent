// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary. The PDFluent application is free to use,
// including for commercial purposes. Redistribution, or extraction or reuse
// of its components (including the embedded PDF engine), requires a licence.
// See https://pdfluent.com/license for terms.
//
// The fast half of the legacy-shell fence. The slow half is
// scripts/ci/legacy-shell-fenced.mjs, which builds the frontend for production
// and proves on the emitted bundle that none of the retired V1 shell is in it;
// this one reads the single line that decides it, so the mutation shows up in
// the ordinary test run instead of only in the build job.
//
// Mutation to check this is not vacuous: restore `import { App } from
// "./legacy/App"` at the top of src/main.tsx — the first case goes red.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const main = readFileSync(new URL("../../src/main.tsx", import.meta.url), "utf8");

// Comments talk about src/legacy/ on purpose and must not count as imports.
const code = main
  .split("\n")
  .filter((line) => !line.trimStart().startsWith("//"))
  .join("\n");

describe("the legacy V1 shell is fenced out of the release build", () => {
  it("has no top-level import of the legacy shell", () => {
    // A static import compiles the whole 9,081-line shell into the bundle
    // whatever the runtime switch says. That is how it shipped to users.
    expect(code).not.toMatch(/^\s*import\s[^\n]*from\s+["'][./]*\/?legacy\//m);
  });

  it("loads the legacy shell only when import.meta.env.DEV", () => {
    // Vite replaces import.meta.env.DEV with the literal `false` in a
    // production build, which is what lets Rollup drop the dynamic import.
    const load = /import\.meta\.env\.DEV[\s\S]{0,200}?import\(["'][./]*\/?legacy\/App["']\)/;
    expect(code).toMatch(load);
  });

  it("renders the product shell when the legacy shell is not loadable", () => {
    // `?legacy` in a release build must not render nothing: the guard on the
    // render branch is what makes it fall through to ViewerApp.
    expect(code).toMatch(/useLegacy\s*&&\s*LegacyApp\s*\?/);
    expect(code).toMatch(/LegacyApp\s*!==\s*null\s*&&/);
  });
});
