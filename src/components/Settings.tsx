// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary and confidential.
// Free for personal, non-commercial use.
// Commercial use requires a valid license.
// See https://pdfluent.com/license for terms.
import { useCallback, useEffect, useRef, useState } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import type { LicenseStatus } from "../lib/licensing";
import {
  activateLicense,
  deactivateLicense,
  formatLicenseDate,
  getLicenseStatus,
} from "../lib/licensing";

type ThemePreference = "system" | "light" | "dark";
type ZoomLevel = "50" | "75" | "100" | "125" | "150" | "200";
type ViewMode = "single" | "continuous";

interface SettingsProps {
  visible: boolean;
  onClose: () => void;
  /** Called when the license status changes so the parent can update. */
  onLicenseChange?: (status: LicenseStatus) => void;
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

const selectStyle: React.CSSProperties = {
  minHeight: 32,
  borderRadius: 8,
  border: "1px solid var(--border)",
  background: "var(--bg-surface-elevated)",
  color: "var(--text-primary)",
  fontSize: 13,
  padding: "0 10px",
  outline: "none",
  cursor: "pointer",
};

const separatorStyle: React.CSSProperties = {
  border: "none",
  borderTop: "1px solid var(--border)",
  margin: "4px 0",
};

const valueStyle: React.CSSProperties = {
  fontSize: 13,
  color: "var(--text-primary)",
};

const dropZoneStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  padding: "14px 16px",
  borderRadius: 10,
  border: "2px dashed var(--border)",
  color: "var(--text-muted)",
  fontSize: 12,
  textAlign: "center",
  lineHeight: 1.5,
  cursor: "pointer",
  transition: "border-color 0.15s, background 0.15s",
};

const dropZoneActiveStyle: React.CSSProperties = {
  ...dropZoneStyle,
  borderColor: "var(--accent)",
  background: "var(--accent-surface, rgba(59, 130, 246, 0.08))",
};

const errorStyle: React.CSSProperties = {
  fontSize: 12,
  color: "var(--danger, #ef4444)",
  lineHeight: 1.4,
  padding: "6px 8px",
  borderRadius: 6,
  background: "rgba(239, 68, 68, 0.08)",
};

export function Settings({ visible, onClose, onLicenseChange }: SettingsProps) {
  const [theme, setTheme] = useState<ThemePreference>("system");
  const [zoom, setZoom] = useState<ZoomLevel>("100");
  const [viewMode, setViewMode] = useState<ViewMode>("continuous");
  const [license, setLicense] = useState<LicenseStatus | null>(null);
  const [licenseLoading, setLicenseLoading] = useState(false);
  const [licenseError, setLicenseError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const dropRef = useRef<HTMLDivElement>(null);

  // Fetch license status when the dialog opens.
  useEffect(() => {
    if (!visible) return;
    setLicenseError(null);
    getLicenseStatus()
      .then((status) => {
        setLicense(status);
      })
      .catch(() => {
        // Silently fall back — license status unavailable.
      });
  }, [visible]);

  const handleLicenseActivation = useCallback(
    async (filePath: string) => {
      setLicenseLoading(true);
      setLicenseError(null);
      try {
        const status = await activateLicense(filePath);
        setLicense(status);
        if (status.error) {
          setLicenseError(status.error);
        }
        onLicenseChange?.(status);
      } catch (err: unknown) {
        const message =
          err instanceof Error ? err.message : String(err);
        setLicenseError(message);
      } finally {
        setLicenseLoading(false);
      }
    },
    [onLicenseChange],
  );

  const handleBrowseLicense = useCallback(async () => {
    const result = await open({
      title: "Select license file",
      filters: [
        {
          name: "License files",
          extensions: ["json"],
        },
      ],
      multiple: false,
      directory: false,
    });
    if (result !== null) {
      await handleLicenseActivation(result);
    }
  }, [handleLicenseActivation]);

  const handleRemoveLicense = useCallback(async () => {
    setLicenseLoading(true);
    setLicenseError(null);
    try {
      const status = await deactivateLicense();
      setLicense(status);
      onLicenseChange?.(status);
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : String(err);
      setLicenseError(message);
    } finally {
      setLicenseLoading(false);
    }
  }, [onLicenseChange]);

  // Drag and drop handlers for the drop zone.
  const handleDragOver = useCallback(
    (event: React.DragEvent<HTMLDivElement>) => {
      event.preventDefault();
      event.stopPropagation();
      setDragOver(true);
    },
    [],
  );

  const handleDragLeave = useCallback(
    (event: React.DragEvent<HTMLDivElement>) => {
      event.preventDefault();
      event.stopPropagation();
      setDragOver(false);
    },
    [],
  );

  const handleDrop = useCallback(
    (event: React.DragEvent<HTMLDivElement>) => {
      event.preventDefault();
      event.stopPropagation();
      setDragOver(false);

      const files = event.dataTransfer.files;
      if (files.length > 0) {
        const file = files[0];
        if (file && file.name.endsWith(".json")) {
          // In Tauri, dropped files have a `path` property on the File object.
          // However, web drag-and-drop does not expose the full path.
          // Users should use the browse button or place the file in one of the
          // auto-discovered directories. Show a helpful message.
          setLicenseError(
            "Drag-and-drop is not supported for license files. " +
            "Use the Browse button to select a license file.",
          );
        }
      }
    },
    [],
  );

  if (!visible) {
    return null;
  }

  const isLicensed = license !== null && license.licensed;
  const tierColor = isLicensed ? "var(--success, #22c55e)" : "var(--text-secondary)";
  const tierLabel = license?.tier ?? "Personal";

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
            Settings
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
          {/* General section */}
          <section style={sectionStyle}>
            <div style={sectionTitleStyle}>General</div>

            <div style={rowStyle}>
              <span style={labelStyle}>Theme</span>
              <select
                style={selectStyle}
                value={theme}
                onChange={(event) =>
                  setTheme(event.target.value as ThemePreference)
                }
              >
                <option value="system">System</option>
                <option value="light">Light</option>
                <option value="dark">Dark</option>
              </select>
            </div>

            <div style={rowStyle}>
              <span style={labelStyle}>Default zoom</span>
              <select
                style={selectStyle}
                value={zoom}
                onChange={(event) =>
                  setZoom(event.target.value as ZoomLevel)
                }
              >
                <option value="50">50%</option>
                <option value="75">75%</option>
                <option value="100">100%</option>
                <option value="125">125%</option>
                <option value="150">150%</option>
                <option value="200">200%</option>
              </select>
            </div>

            <div style={rowStyle}>
              <span style={labelStyle}>Default view</span>
              <select
                style={selectStyle}
                value={viewMode}
                onChange={(event) =>
                  setViewMode(event.target.value as ViewMode)
                }
              >
                <option value="single">Single page</option>
                <option value="continuous">Continuous scroll</option>
              </select>
            </div>
          </section>

          <hr style={separatorStyle} />

          {/* License section */}
          <section style={sectionStyle}>
            <div style={sectionTitleStyle}>License</div>

            <div style={rowStyle}>
              <span style={labelStyle}>Status</span>
              <span
                style={{
                  fontSize: 13,
                  fontWeight: 600,
                  color: tierColor,
                }}
              >
                {tierLabel}
                {license?.expired ? " (Expired)" : ""}
              </span>
            </div>

            {isLicensed && license.licensee.length > 0 && (
              <div style={rowStyle}>
                <span style={labelStyle}>Licensee</span>
                <span style={valueStyle}>{license.licensee}</span>
              </div>
            )}

            {isLicensed && license.company.length > 0 && (
              <div style={rowStyle}>
                <span style={labelStyle}>Company</span>
                <span style={valueStyle}>{license.company}</span>
              </div>
            )}

            {isLicensed && (
              <div style={rowStyle}>
                <span style={labelStyle}>Seats</span>
                <span style={valueStyle}>{license.seats}</span>
              </div>
            )}

            {isLicensed && license.expires_at > 0 && (
              <div style={rowStyle}>
                <span style={labelStyle}>Expires</span>
                <span
                  style={{
                    ...valueStyle,
                    color: license.expired
                      ? "var(--danger, #ef4444)"
                      : "var(--text-primary)",
                  }}
                >
                  {formatLicenseDate(license.expires_at)}
                </span>
              </div>
            )}

            {isLicensed && license.license_file_path !== null && (
              <div style={rowStyle}>
                <span style={labelStyle}>License file</span>
                <span
                  style={{
                    fontSize: 12,
                    color: "var(--text-muted)",
                    maxWidth: 240,
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                    direction: "rtl",
                    textAlign: "right",
                  }}
                  title={license.license_file_path}
                >
                  {license.license_file_path}
                </span>
              </div>
            )}

            {licenseError !== null && (
              <div style={errorStyle}>{licenseError}</div>
            )}

            {/* Drop zone for license files */}
            {!isLicensed && (
              <div
                ref={dropRef}
                style={dragOver ? dropZoneActiveStyle : dropZoneStyle}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                onClick={() => {
                  void handleBrowseLicense();
                }}
                role="button"
                tabIndex={0}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    void handleBrowseLicense();
                  }
                }}
              >
                {licenseLoading
                  ? "Validating license..."
                  : "Click to browse or drag a license file here"}
              </div>
            )}

            <div
              style={{
                display: "flex",
                justifyContent: "flex-end",
                gap: 8,
              }}
            >
              {isLicensed && (
                <button
                  type="button"
                  className="toolbar-btn"
                  onClick={() => {
                    void handleRemoveLicense();
                  }}
                  disabled={licenseLoading}
                >
                  Remove license
                </button>
              )}
              <button
                type="button"
                className="toolbar-btn"
                onClick={() => {
                  void handleBrowseLicense();
                }}
                disabled={licenseLoading}
              >
                {isLicensed ? "Change license" : "Load license file"}
              </button>
            </div>
          </section>

          <hr style={separatorStyle} />

          {/* About section */}
          <section style={sectionStyle}>
            <div style={sectionTitleStyle}>About</div>

            <div style={rowStyle}>
              <span style={labelStyle}>App</span>
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
              <span style={labelStyle}>Version</span>
              <span
                style={{
                  fontSize: 13,
                  color: "var(--text-secondary)",
                }}
              >
                0.1.0
              </span>
            </div>

            <div style={rowStyle}>
              <span style={labelStyle}>Privacy</span>
              <span
                style={{
                  fontSize: 13,
                  color: "var(--text-secondary)",
                }}
              >
                All processing is local
              </span>
            </div>

            <div style={rowStyle}>
              <span style={labelStyle}>Website</span>
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

            <div style={rowStyle}>
              <span style={labelStyle}>License terms</span>
              <a
                href="https://pdfluent.com/license"
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  fontSize: 13,
                  color: "var(--accent)",
                  textDecoration: "none",
                }}
              >
                pdfluent.com/license
              </a>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
