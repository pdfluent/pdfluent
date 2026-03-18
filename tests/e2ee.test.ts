// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 PDFluent Contributors

import { describe, expect, it } from "vitest";
import { decryptBytes, encryptBytes } from "../src/lib/e2ee";

function ensureBase64Helpers(): void {
  if (typeof globalThis.btoa !== "function") {
    Object.defineProperty(globalThis, "btoa", {
      value: (input: string) => Buffer.from(input, "binary").toString("base64"),
      configurable: true,
      writable: true,
    });
  }

  if (typeof globalThis.atob !== "function") {
    Object.defineProperty(globalThis, "atob", {
      value: (input: string) => Buffer.from(input, "base64").toString("binary"),
      configurable: true,
      writable: true,
    });
  }
}

describe("e2ee helpers", () => {
  it("encrypts and decrypts a payload", async () => {
    ensureBase64Helpers();

    const source = new Uint8Array([10, 20, 30, 40, 50, 60]);
    const passphrase = "pdfluent-test-passphrase";

    const encrypted = await encryptBytes(source, passphrase);
    expect(encrypted.length).toBeGreaterThan(source.length);

    const decrypted = await decryptBytes(encrypted, passphrase);
    expect(Array.from(decrypted)).toEqual(Array.from(source));
  });

  it("throws on wrong passphrase", async () => {
    ensureBase64Helpers();

    const source = new TextEncoder().encode("confidential payload");
    const encrypted = await encryptBytes(source, "correct-passphrase");

    await expect(decryptBytes(encrypted, "wrong-passphrase")).rejects.toThrow(
      "Unable to decrypt payload. Check your passphrase.",
    );
  });
});
