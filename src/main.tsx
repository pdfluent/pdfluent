// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary. The PDFluent application is free to use,
// including for commercial purposes. Redistribution, or extraction or reuse
// of its components (including the embedded PDF engine), requires a licence.
// See https://pdfluent.com/license for terms.
import React from "react";
import ReactDOM from "react-dom/client";
// LEGACY V1 shell — only used when ?legacy URL param is set.
// Do not add imports from src/legacy/ for V3 features.
import { App } from "./legacy/App";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { CrashReporter } from "./components/telemetry/CrashReporter";
import { ViewerApp } from "./viewer/ViewerApp";
// Stylesheet cascade order matters — load tokens/base first, then viewer
// component modules in numeric order, then magic-patterns (shadcn tokens +
// Tailwind layers). See src/styles/global.css ToC for module map.
import "./styles/global.css";
import "./styles/viewer/00-topbar.css";
import "./styles/viewer/10-modetoolbar.css";
import "./styles/viewer/20-bottom-taskbar.css";
import "./styles/viewer/30-empty-states.css";
import "./styles/viewer/40-settings-dialog.css";
import "./styles/viewer/50-all-tools.css";
import "./styles/viewer/60-command-palette.css";
import "./styles/viewer/70-search-panel.css";
import "./styles/viewer/80-shortcut-sheet.css";
import "./styles/viewer/85-leftrail-thumbs.css";
import "./styles/viewer/90-right-context-panel.css";
import "./styles/viewer/95-leftrail-panels.css";
import "./styles/viewer/99-signature-panel.css";
import "./styles/magic-patterns.css";
import "./styles/viewer-v3.css";
// i18n must be imported before any component that uses useTranslation
import "./i18n";
// Performance telemetry — sets up window.__pdfluent_perf / __pdfluent_dev_perf hooks
import "./viewer/performance/performanceTelemetry";

// ViewerApp (V3 shell) is the product — the Acrobat-style Tauri editor.
// The legacy App shell (src/legacy/App.tsx + src/legacy/components/) stays
// reachable via ?legacy until its remaining unique features are verified
// ported and it can be retired. The ?v2 param does nothing — it is a no-op
// used in some stale e2e tests. The only runtime switch is ?legacy.
const useLegacy = new URLSearchParams(window.location.search).has('legacy');

// Liveness ping for the Rust startup watchdog: this must be the earliest
// possible invoke. If the WebContent process is suspended before timers run
// (observed on macOS), this ping never arrives and the Rust side recreates
// the window — see spawn_startup_watchdog in src-tauri/src/lib.rs.
import("@tauri-apps/api/core")
  .then(({ invoke }) => invoke("frontend_ready"))
  .catch(() => { /* browser/test runtime — no Tauri IPC */ });

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    {/* CrashReporter is a SIBLING of the boundary: the boundary unmounts its
        children on catch, so the review dialog must live outside it. They
        communicate through the module-level crash channel. */}
    <CrashReporter />
    <ErrorBoundary>
      {useLegacy ? <App /> : <ViewerApp />}
    </ErrorBoundary>
  </React.StrictMode>,
);
