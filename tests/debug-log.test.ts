// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 PDFluent Contributors

import { beforeEach, describe, expect, it } from "vitest";
import {
  appendDebugLog,
  clearDebugLogs,
  getDebugSessionId,
  listDebugLogs,
  setDebugLogContextProvider,
} from "../src/lib/debug-log";

class LocalStorageMock {
  private store = new Map<string, string>();

  clear() {
    this.store.clear();
  }

  getItem(key: string): string | null {
    return this.store.has(key) ? this.store.get(key)! : null;
  }

  key(index: number): string | null {
    return Array.from(this.store.keys())[index] ?? null;
  }

  removeItem(key: string): void {
    this.store.delete(key);
  }

  setItem(key: string, value: string): void {
    this.store.set(key, value);
  }

  get length(): number {
    return this.store.size;
  }
}

beforeEach(() => {
  Object.defineProperty(globalThis, "localStorage", {
    value: new LocalStorageMock(),
    writable: true,
    configurable: true,
  });
  setDebugLogContextProvider(null);
});

describe("debug logs", () => {
  it("stores entries with event and level", () => {
    clearDebugLogs();
    appendDebugLog("info", "app_start", { stage: "init" });

    const entries = listDebugLogs();
    expect(entries).toHaveLength(1);
    expect(entries[0]?.event).toBe("app_start");
    expect(entries[0]?.level).toBe("info");
  });

  it("serializes Error details safely", () => {
    clearDebugLogs();
    appendDebugLog("error", "open_pdf_failed", new Error("broken"));

    const entries = listDebugLogs();
    const details = entries[0]?.details as Record<string, string>;
    expect(details.message).toBe("broken");
    expect(details.name).toBe("Error");
    expect(details._sessionId).toBe(getDebugSessionId());
  });

  it("attaches document context from provider snapshot", () => {
    clearDebugLogs();
    setDebugLogContextProvider(() => ({
      filePath: "/tmp/sample.pdf",
      currentPage: 4,
      pageCount: 12,
    }));
    appendDebugLog("warn", "render_retry", { reason: "timeout" });

    const entries = listDebugLogs();
    const details = entries[0]?.details as Record<string, unknown>;
    const context = details._context as Record<string, unknown>;
    expect(details._sessionId).toBe(getDebugSessionId());
    expect(context.filePath).toBe("/tmp/sample.pdf");
    expect(context.currentPage).toBe(4);
    expect(context.pageCount).toBe(12);
  });
});
