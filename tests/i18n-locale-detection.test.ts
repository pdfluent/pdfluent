// SPDX-License-Identifier: LicenseRef-PDFluent-Proprietary
// Copyright (c) 2026 PDFluent Contributors
//
// Verifies OS/browser-locale detection (item 2 of the v2 smoke pass): a Dutch
// macOS resolves to nl, regional tags map sensibly, and unsupported locales
// fall through. The saved-preference override (localStorage wins) lives in
// getInitialLanguage and is asserted via behaviour notes in the suite.

import { afterEach, describe, expect, it, vi } from "vitest";
import { detectLanguageFromEnvironment } from "../src/i18n";

function stubNavigator(language: string, languages?: string[]): void {
  vi.stubGlobal("navigator", { language, languages: languages ?? [language] });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("detectLanguageFromEnvironment", () => {
  it("maps a Dutch OS locale (nl-NL) to nl — the key smoke-pass case", () => {
    stubNavigator("nl-NL");
    expect(detectLanguageFromEnvironment()).toBe("nl");
  });

  it("maps en-US to en", () => {
    stubNavigator("en-US");
    expect(detectLanguageFromEnvironment()).toBe("en");
  });

  it("prefers exact regional tags before the base subtag (zh-CN)", () => {
    stubNavigator("zh-CN");
    expect(detectLanguageFromEnvironment()).toBe("zh-CN");
  });

  it("falls back to the base subtag (fr-CA -> fr)", () => {
    stubNavigator("fr-CA");
    expect(detectLanguageFromEnvironment()).toBe("fr");
  });

  it("returns null for an unsupported locale so the caller can default to en", () => {
    stubNavigator("xx-YY");
    expect(detectLanguageFromEnvironment()).toBeNull();
  });

  it("scans navigator.languages in priority order", () => {
    stubNavigator("xx-YY", ["xx-YY", "nl-NL"]);
    expect(detectLanguageFromEnvironment()).toBe("nl");
  });
});
