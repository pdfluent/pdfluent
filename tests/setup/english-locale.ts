// SPDX-License-Identifier: LicenseRef-PDFluent-Proprietary
// Copyright (c) 2026 Innovation Trigger B.V.

// The UI follows navigator.language (src/i18n/index.ts). Under Node that is the
// operating system's locale on Windows, so a Dutch runner shows Dutch text and
// every test that reads an English string fails there while it passes on the
// Linux and macOS runners. The tests assert English; a test that is about
// another language sets it itself.
if (typeof navigator !== 'undefined') {
  for (const [key, value] of [['language', 'en-US'], ['languages', ['en-US', 'en']]] as const) {
    try {
      Object.defineProperty(navigator, key, { value, configurable: true });
    } catch { /* a read-only navigator: the tests that depend on it say so themselves */ }
  }
}
