// SPDX-License-Identifier: LicenseRef-PDFluent-Proprietary
// Copyright (c) 2026 Innovation Trigger B.V.

import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { readFileSync } from "node:fs";

const host = process.env.TAURI_DEV_HOST;
const pkg = JSON.parse(readFileSync(new URL("./package.json", import.meta.url), "utf8")) as { version: string };

export default defineConfig({
  plugins: [react()],
  clearScreen: false,
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
    // Mac App Store build flag. Set MAS_BUILD=1 for the App Store variant, which
    // hides the self-updater UI and the commercial-license activation UI (the
    // App Store delivers updates; Apple forbids in-app license-key mechanisms —
    // the MAS build is free, commercial-use terms live in the App Store EULA).
    __IS_MAS_BUILD__: JSON.stringify(process.env.MAS_BUILD === "1"),
  },
  worker: {
    format: "es",
  },
  server: {
    port: 1420,
    strictPort: true,
    host: host || false,
    hmr: host
      ? {
          protocol: "ws",
          host,
          port: 1421,
        }
      : undefined,
    watch: {
      ignored: ["**/src-tauri/**"],
    },
  },
});
