// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary. The PDFluent application is free to use,
// including for commercial purposes. Redistribution, or extraction or reuse
// of its components (including the embedded PDF engine), requires a licence.
// See https://pdfluent.com/license for terms.

import { describe, expect, it } from 'vitest';
import { getWiredTools } from '../../components/ModeToolbar';

describe('runtime tool wiring', () => {
  describe('getWiredTools', () => {
    it('includes universal tools in both runtimes', () => {
      const browserTest = getWiredTools(false);
      const tauri = getWiredTools(true);

      const universal = [
        'toolbar.zoomIn',
        'toolbar.zoomOut',
        'toolbar.fullscreen',
        'toolbar.searchText',
      ];

      for (const key of universal) {
        expect(browserTest.has(key), `browser-test should have ${key}`).toBe(true);
        expect(tauri.has(key), `Tauri should have ${key}`).toBe(true);
      }
    });

    it('excludes Tauri-only tools from browser-test', () => {
      const browserTest = getWiredTools(false);

      const tauriOnly = [
        'toolbar.deletePage',
        'toolbar.rotateLeft',
        'toolbar.rotateRight',
        'toolbar.ocrScan',
        'toolbar.redact',
      ];

      for (const key of tauriOnly) {
        expect(browserTest.has(key), `browser-test should NOT have ${key}`).toBe(false);
      }
    });

    it('includes Tauri-only tools in Tauri runtime', () => {
      const tauri = getWiredTools(true);

      const tauriOnly = [
        'toolbar.deletePage',
        'toolbar.rotateLeft',
        'toolbar.rotateRight',
        'toolbar.ocrScan',
        'toolbar.redact',
      ];

      for (const key of tauriOnly) {
        expect(tauri.has(key), `Tauri should have ${key}`).toBe(true);
      }
    });

    it('returns a frozen-like set (no accidental mutation)', () => {
      const set = getWiredTools(false);
      // The set itself is a regular Set, but the function is pure.
      // Two calls with the same argument should return equal contents.
      const set2 = getWiredTools(false);
      expect(set.size).toBe(set2.size);
      for (const item of set) {
        expect(set2.has(item)).toBe(true);
      }
    });
  });

  describe('capability honesty checklist', () => {
    // These are NOT exhaustive feature tests — they verify that the UI
    // wiring layer is honest about what the browser-test runtime can and cannot do.

    it('browser-test wired tools match engine capability claims', () => {
      const browserTest = getWiredTools(false);

      const browserTestSupportedOps = new Set([
        'load',
        'open',
        'render',
        'extract-text',
        'search',
        'search-text',
      ]);

      // Map from toolbar label to engine operation name.
      const toolbarToEngine: Record<string, string | null> = {
        'toolbar.zoomIn': null,        // UI-only
        'toolbar.zoomOut': null,       // UI-only
        'toolbar.fullscreen': null,    // UI-only
        'toolbar.searchText': 'search-text',
        'toolbar.deletePage': null,    // Tauri-only page mutation
        'toolbar.rotateLeft': null,    // Tauri-only page mutation
        'toolbar.rotateRight': null,   // Tauri-only page mutation
        'toolbar.ocrScan': 'ocr',      // Tauri-only
        'toolbar.redact': 'redact',    // Tauri-only
      };

      for (const [label, op] of Object.entries(toolbarToEngine)) {
        if (op === null) continue;
        const engineSupports = browserTestSupportedOps.has(op);
        const uiWired = browserTest.has(label);
        if (engineSupports) {
          expect(uiWired, `${label} maps to ${op} which browser-test supports — should be wired`).toBe(true);
        } else {
          expect(uiWired, `${label} maps to ${op} which browser-test does NOT support — should NOT be wired`).toBe(false);
        }
      }
    });
  });
});
