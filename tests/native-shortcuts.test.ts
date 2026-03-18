// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 PDFluent Contributors

import { describe, expect, it } from "vitest";
import {
  isPrimaryModifierPressed,
  matchesPrimaryShortcut,
  matchesRedoShortcut,
  matchesUndoShortcut,
} from "../src/App";

function shortcutEvent(
  key: string,
  flags: Partial<{
    metaKey: boolean;
    ctrlKey: boolean;
    shiftKey: boolean;
    altKey: boolean;
  }> = {},
) {
  return {
    key,
    metaKey: flags.metaKey ?? false,
    ctrlKey: flags.ctrlKey ?? false,
    shiftKey: flags.shiftKey ?? false,
    altKey: flags.altKey ?? false,
  };
}

describe("native shortcut parity helpers", () => {
  it("uses command on mac and control on windows/other", () => {
    expect(
      isPrimaryModifierPressed("mac", shortcutEvent("f", { metaKey: true })),
    ).toBe(true);
    expect(
      isPrimaryModifierPressed("mac", shortcutEvent("f", { ctrlKey: true })),
    ).toBe(false);
    expect(
      isPrimaryModifierPressed("windows", shortcutEvent("f", { ctrlKey: true })),
    ).toBe(true);
    expect(
      isPrimaryModifierPressed("windows", shortcutEvent("f", { metaKey: true })),
    ).toBe(false);
  });

  it("matches primary shortcuts with optional modifiers", () => {
    expect(
      matchesPrimaryShortcut("mac", shortcutEvent("f", { metaKey: true }), "f"),
    ).toBe(true);
    expect(
      matchesPrimaryShortcut(
        "windows",
        shortcutEvent("h", { ctrlKey: true, shiftKey: true, altKey: true }),
        "h",
        { shift: true, alt: true },
      ),
    ).toBe(true);
    expect(
      matchesPrimaryShortcut(
        "windows",
        shortcutEvent("h", { ctrlKey: true, shiftKey: true }),
        "h",
        { shift: true, alt: true },
      ),
    ).toBe(false);
  });

  it("supports undo/redo parity patterns across mac and windows", () => {
    expect(matchesUndoShortcut("mac", shortcutEvent("z", { metaKey: true }))).toBe(true);
    expect(matchesRedoShortcut("mac", shortcutEvent("z", { metaKey: true, shiftKey: true }))).toBe(
      true,
    );

    expect(matchesUndoShortcut("windows", shortcutEvent("z", { ctrlKey: true }))).toBe(true);
    expect(matchesRedoShortcut("windows", shortcutEvent("y", { ctrlKey: true }))).toBe(true);
    expect(matchesRedoShortcut("windows", shortcutEvent("z", { ctrlKey: true, shiftKey: true }))).toBe(
      true,
    );
  });
});
