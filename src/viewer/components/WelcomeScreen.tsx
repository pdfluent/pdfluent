// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary. The PDFluent application is free to use,
// including for commercial purposes. Redistribution, or extraction or reuse
// of its components (including the embedded PDF engine), requires a licence.
// See https://pdfluent.com/license for terms.

import { useState, type DragEvent } from "react";
import {
  FileTextIcon,
  FolderOpenIcon,
  ShieldCheckIcon,
  XIcon,
} from "lucide-react";
import { useTranslation } from "react-i18next";

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface WelcomeScreenProps {
  onOpen: () => void;
  onOpenRecent: (path: string) => void;
  onRemoveRecent: (path: string) => void;
  onClearRecent: () => void;
  recentFiles: string[];
}

// ---------------------------------------------------------------------------
// Component
//
// First surface a new user sees. Calm card, one question, one CTA, one
// quiet privacy chip. Recent files live as a sidebar rail — a
// convenience, not the primary action.
//
// Visual structure follows the .welcome-* classes defined in global.css.
// All visible strings flow through react-i18next so en.json + nl.json
// stay the single source of truth for copy.
// ---------------------------------------------------------------------------

export function WelcomeScreen({
  onOpen,
  onOpenRecent,
  onRemoveRecent,
  onClearRecent,
  recentFiles,
}: WelcomeScreenProps) {
  const { t } = useTranslation();

  // Visual drag-target feedback. The actual file open is wired through
  // Tauri's window drag-drop events on the host side; the WelcomeSection
  // wrapper also bridges browser-mode <input type="file"> drops. This
  // component just lights up the border so the user knows the drop will
  // be accepted.
  const [isDragging, setIsDragging] = useState(false);

  function handleDragEnter(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setIsDragging(true);
  }
  function handleDragOver(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
  }
  function handleDragLeave(event: DragEvent<HTMLDivElement>) {
    // Only clear if the user actually left the drop target — DOM events
    // fire on every child traversal otherwise.
    if (event.currentTarget.contains(event.relatedTarget as Node | null)) {
      return;
    }
    setIsDragging(false);
  }
  function handleDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setIsDragging(false);
    // Real drop handling lives in the host. The visual reset above is
    // the entire job of this surface.
  }

  // Detect platform once at render time so the ⌘/Ctrl hint matches the
  // host OS. Tauri's `data-platform` attribute is the source of truth.
  const isMac =
    typeof document !== "undefined" &&
    document.documentElement.dataset.platform !== "windows";

  const hasRecent = recentFiles.length > 0;

  return (
    <section
      className="welcome-screen"
      data-testid="welcome-screen"
      aria-label={t("welcome.title")}
    >
      <div
        className={
          hasRecent
            ? "welcome-screen-grid"
            : "welcome-screen-grid welcome-screen-grid-solo"
        }
      >
        <div
          className={
            isDragging
              ? "welcome-drop-target is-dragging-over"
              : "welcome-drop-target"
          }
          onDragEnter={handleDragEnter}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
        >
          <div className="welcome-card">
            <div className="welcome-card-mark" aria-hidden="true">
              P
            </div>

            <div>
              <h1>{t("welcome.title")}</h1>
              <p className="welcome-card-lede">{t("welcome.lede")}</p>
            </div>

            <button
              type="button"
              className="welcome-card-cta"
              onClick={onOpen}
              data-testid="welcome-open-btn"
            >
              <FolderOpenIcon aria-hidden="true" />
              <span>{t("welcome.openFile")}</span>
            </button>

            <span className="welcome-card-hint">
              {t("welcome.dragDropHint")} · <kbd>{isMac ? "⌘O" : "Ctrl O"}</kbd>
            </span>

            <span className="welcome-card-promise">
              <ShieldCheckIcon aria-hidden="true" />
              {t("welcome.privacyPromise")}
            </span>
          </div>
        </div>

        {hasRecent ? (
          <aside
            className="welcome-recent"
            aria-label={t("welcome.recentFiles")}
            data-testid="welcome-recent-rail"
          >
            <header className="welcome-recent-header">
              <span className="welcome-recent-title">
                {t("welcome.recentFiles")}
              </span>
              <button
                data-testid="welcome-clear-recent-btn"
                type="button"
                onClick={onClearRecent}
                className="welcome-recent-clear"
              >
                {t("welcome.clearAll")}
              </button>
            </header>

            <ul className="welcome-recent-list">
              {recentFiles.map((path) => {
                const name = path.split(/[/\\]/).pop() ?? path;
                const dir = path.slice(
                  0,
                  Math.max(0, path.length - name.length - 1),
                );
                return (
                  <li key={path}>
                    <div
                      className="welcome-recent-item"
                      role="button"
                      tabIndex={0}
                      title={path}
                      onClick={() => onOpenRecent(path)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter" || event.key === " ") {
                          event.preventDefault();
                          onOpenRecent(path);
                        }
                      }}
                      data-testid="recent-file-item"
                    >
                      <span
                        className="welcome-recent-item-icon"
                        aria-hidden="true"
                      >
                        <FileTextIcon />
                      </span>
                      <span className="welcome-recent-item-text">
                        <span className="welcome-recent-item-name">{name}</span>
                        {dir.length > 0 && (
                          <span className="welcome-recent-item-path">
                            {dir}
                          </span>
                        )}
                      </span>
                      <button
                        data-testid="recent-file-remove-btn"
                        type="button"
                        onClick={(event) => {
                          event.stopPropagation();
                          onRemoveRecent(path);
                        }}
                        className="welcome-recent-item-remove"
                        title={t("welcome.removeFromList")}
                        aria-label={t("welcome.removeAriaLabel")}
                      >
                        <XIcon aria-hidden="true" />
                      </button>
                    </div>
                  </li>
                );
              })}
            </ul>
          </aside>
        ) : (
          /* The empty-recents marker is invisible but provides the testid
             hook that the welcome-recent-management.test.ts suite expects. */
          <span data-testid="welcome-empty-state" hidden aria-hidden="true" />
        )}
      </div>
    </section>
  );
}

export default WelcomeScreen;
