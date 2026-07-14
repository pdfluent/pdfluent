// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary. The PDFluent application is free to use,
// including for commercial purposes. Redistribution, or extraction or reuse
// of its components (including the embedded PDF engine), requires a licence.
// See https://pdfluent.com/license for terms.
import { useTranslation } from "react-i18next";

interface SettingsProps {
  visible: boolean;
  onClose: () => void;
}

const sectionStyle: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 12,
};

const sectionTitleStyle: React.CSSProperties = {
  fontSize: 12,
  fontWeight: 700,
  textTransform: "uppercase",
  letterSpacing: "0.08em",
  color: "var(--text-secondary)",
};

const rowStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 12,
};

const labelStyle: React.CSSProperties = {
  fontSize: 13,
  color: "var(--text-primary)",
};

export function Settings({ visible, onClose }: SettingsProps) {
  const { t } = useTranslation();

  if (!visible) {
    return null;
  }

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 62,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "rgba(15, 21, 35, 0.35)",
        backdropFilter: "blur(2px)",
        // @ts-expect-error -- Electron/Tauri -webkit-app-region property
        WebkitAppRegion: "no-drag",
      }}
      onClick={(event) => {
        if (event.target === event.currentTarget) {
          onClose();
        }
      }}
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          onClose();
        }
      }}
    >
      <div
        style={{
          width: "min(480px, calc(100vw - 24px))",
          maxHeight: "calc(100vh - 48px)",
          display: "flex",
          flexDirection: "column",
          borderRadius: 18,
          border: "1px solid var(--border)",
          background: "var(--bg-surface)",
          boxShadow: "var(--shadow-panel)",
          overflow: "hidden",
        }}
      >
        {/* Header */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "16px 18px 12px",
            borderBottom: "1px solid var(--border)",
            flexShrink: 0,
          }}
        >
          <span
            style={{
              fontSize: 18,
              fontWeight: 700,
              color: "var(--text-primary)",
            }}
          >
            {t("settings.title")}
          </span>
          <button
            type="button"
            onClick={onClose}
            style={{
              width: 28,
              height: 28,
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              borderRadius: 8,
              border: "1px solid var(--border)",
              background: "transparent",
              color: "var(--text-secondary)",
              fontSize: 16,
              cursor: "pointer",
              lineHeight: 1,
            }}
            aria-label="Close settings"
          >
            ✕
          </button>
        </div>

        {/* Scrollable content */}
        <div
          style={{
            padding: 18,
            display: "flex",
            flexDirection: "column",
            gap: 20,
            overflowY: "auto",
          }}
        >
          {/* NOTE: the former "General" section (Theme / Default zoom /
              Default view) was display-only — the selects were never persisted
              or applied anywhere. Removed until real preferences exist. */}

          {/* About section */}
          <section style={sectionStyle}>
            <div style={sectionTitleStyle}>{t("about.section")}</div>

            <div style={rowStyle}>
              <span style={labelStyle}>{t("about.app")}</span>
              <span
                style={{
                  fontSize: 13,
                  fontWeight: 600,
                  color: "var(--text-primary)",
                }}
              >
                PDFluent
              </span>
            </div>

            <div style={rowStyle}>
              <span style={labelStyle}>{t("about.version")}</span>
              <span
                style={{
                  fontSize: 13,
                  color: "var(--text-secondary)",
                }}
              >
                {__APP_VERSION__}
              </span>
            </div>

            <div style={rowStyle}>
              <span style={labelStyle}>{t("about.privacy")}</span>
              <span
                style={{
                  fontSize: 13,
                  color: "var(--text-secondary)",
                }}
              >
                {t("about.privacyValue")}
              </span>
            </div>

            <div style={rowStyle}>
              <span style={labelStyle}>{t("about.website")}</span>
              <a
                href="https://pdfluent.com"
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  fontSize: 13,
                  color: "var(--accent)",
                  textDecoration: "none",
                }}
              >
                pdfluent.com
              </a>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
