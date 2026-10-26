// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary. The PDFluent application is free to use,
// including for commercial purposes. Redistribution, or extraction or reuse
// of its components (including the embedded PDF engine), requires a licence.
// See https://pdfluent.com/license for terms.
import React from "react";
import ReactDOM from "react-dom/client";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { CrashReporter } from "./components/telemetry/CrashReporter";
import { FeedbackHost } from "./components/feedback/FeedbackHost";
import { ViewerApp } from "./viewer/ViewerApp";
import type { GalleryDialog } from "./viewer/dev/NoticeGallery";
import { applyStoredTheme, applyThemeToRoot } from "./viewer/state/theme";
// Stylesheet cascade order matters — load tokens/base first, then viewer
// component modules in numeric order, then magic-patterns (shadcn tokens +
// Tailwind layers). See src/styles/global.css ToC for module map.
import "./styles/tokens.css";
import "./styles/global.css";
import "./styles/viewer/00-topbar.css";
import "./styles/viewer/01-document-tabs.css";
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
//
// The legacy V1 shell (src/legacy/App.tsx, 9,081 lines) is a DEVELOPMENT-ONLY
// escape hatch, kept until its two remaining unique features (multi-file merge,
// PDF/A UI) are confirmed present in V3. `import.meta.env.DEV` is replaced by
// the literal `false` in a production build, so Rollup drops this branch and the
// module it imports: what shipped as 9,081 reachable-by-URL lines is not in the
// released bundle at all, and `?legacy` renders the product shell there.
// Proven on the bundle, not on this comment, by
// scripts/ci/legacy-shell-fenced.mjs. Do not turn this back into a top-level
// import, and do not add imports from src/legacy/ for V3 features.
//
// The ?v2 param does nothing — it is a no-op used in some stale e2e tests.
const LegacyApp = import.meta.env.DEV
  ? React.lazy(() => import("./legacy/App").then((m) => ({ default: m.App })))
  : null;
// Dev-only contrast gallery (see viewer/dev/NoticeGallery.tsx).
const NoticeGallery = import.meta.env.DEV
  ? React.lazy(() => import("./viewer/dev/NoticeGallery").then((m) => ({ default: m.NoticeGallery })))
  : null;
const galleryParams = new URLSearchParams(window.location.search);
const useGallery = NoticeGallery !== null && galleryParams.has('notice-gallery');
const useLegacy =
  LegacyApp !== null && new URLSearchParams(window.location.search).has('legacy');

// Apply the stored theme before the first render so a dark restart never
// flashes light (#721).
applyStoredTheme();
// The gallery states its own theme; it never depends on stored settings.
if (useGallery) applyThemeToRoot(galleryParams.get('theme') === 'dark');

// The ui-walk build only (#471): VITE_UI_WALK is replaced by its value at build
// time, so in every other build this is \`if (false)\` and the walker is not in the
// bundle. scripts/ci/ui-walk-fenced.mjs proves that on the shipped bundle.
if (import.meta.env.VITE_UI_WALK === "1") {
  void import("./viewer/uiWalk/boot").then((m) => m.bootUiWalk());
}

// Liveness ping for the Rust startup watchdog: this must be the earliest
// possible invoke. If the WebContent process is suspended before timers run
// (observed on macOS), this ping never arrives and the Rust side recreates
// the window — see spawn_startup_watchdog in src-tauri/src/lib.rs.
import("./lib/commandBridge")
  .then(({ invokeQuietly }) => invokeQuietly("frontend_ready"))
  .then(() => {
    // public/startup-heartbeat.js kept the watchdog informed while loading.
    (window as Window & { __pdfluentStopHeartbeat?: () => void }).__pdfluentStopHeartbeat?.();
  })
  .catch(() => { /* browser/test runtime — no Tauri IPC */ });

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    {/* CrashReporter is a SIBLING of the boundary: the boundary unmounts its
        children on catch, so the review dialog must live outside it. They
        communicate through the module-level crash channel. */}
    <CrashReporter />
    <FeedbackHost />
    <ErrorBoundary>
      {useGallery && NoticeGallery ? (
        <React.Suspense fallback={null}>
          <NoticeGallery dark={galleryParams.get('theme') === 'dark'} dialog={(galleryParams.get('dialog') as GalleryDialog | null)} />
        </React.Suspense>
      ) : useLegacy && LegacyApp ? (
        <React.Suspense fallback={null}>
          <LegacyApp />
        </React.Suspense>
      ) : (
        <ViewerApp />
      )}
    </ErrorBoundary>
  </React.StrictMode>,
);
