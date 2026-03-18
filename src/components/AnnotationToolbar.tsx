// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary and confidential.
// Free for personal, non-commercial use.
// Commercial use requires a valid license.
// See https://pdfluent.com/license for terms.

import { useCallback, useState } from "react";
import type { AnnotationTool, HighlightColor } from "../lib/pdf-manipulator";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Tools available in the annotation floating toolbar. */
export type AnnotationToolbarTool =
  | "highlight"
  | "underline"
  | "comment"
  | "rectangle"
  | "circle"
  | "pen";

/** Properties that can be configured for the current annotation tool. */
export interface AnnotationProperties {
  /** CSS-compatible colour string (hex). */
  color: string;
  /** Opacity from 0 to 1. */
  opacity: number;
  /** Stroke/line width in points. */
  lineWidth: number;
}

interface AnnotationToolbarProps {
  /** Whether annotation mode is active (controls visibility). */
  visible: boolean;
  /** Currently selected tool. */
  activeTool: AnnotationTool;
  /** Current highlight colour. */
  highlightColor: HighlightColor;
  /** Called when the user selects a tool. */
  onSelectTool: (tool: AnnotationTool) => void;
  /** Called when the user changes highlight colour. */
  onHighlightColorChange: (color: HighlightColor) => void;
  /** Called when annotation properties change (color, opacity, line width). */
  onPropertiesChange: (properties: AnnotationProperties) => void;
  /** Called when the user closes the annotation toolbar. */
  onClose: () => void;
  /** Current annotation properties. */
  properties: AnnotationProperties;
  /** Whether an annotation save is in progress. */
  saving: boolean;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const TOOLS: {
  id: AnnotationToolbarTool;
  label: string;
  mappedTool: AnnotationTool;
}[] = [
  { id: "highlight", label: "Highlight", mappedTool: "highlight" },
  { id: "underline", label: "Underline", mappedTool: "underline" },
  { id: "comment", label: "Text comment", mappedTool: "comment" },
  { id: "rectangle", label: "Rectangle", mappedTool: "rectangle" },
  { id: "circle", label: "Circle", mappedTool: "circle" },
  { id: "pen", label: "Freehand draw", mappedTool: "pen" },
];

const TOOL_ICONS: Record<AnnotationToolbarTool, string> = {
  highlight: "H",
  underline: "U",
  comment: "C",
  rectangle: "R",
  circle: "O",
  pen: "D",
};

const HIGHLIGHT_SWATCHES: { color: HighlightColor; hex: string }[] = [
  { color: "yellow", hex: "#f9dd5f" },
  { color: "green", hex: "#90d676" },
  { color: "blue", hex: "#86b6ff" },
  { color: "pink", hex: "#f3a2cb" },
];

const SHAPE_COLOR_PRESETS = [
  "#ef4444",
  "#f97316",
  "#eab308",
  "#22c55e",
  "#3b82f6",
  "#8b5cf6",
  "#1f2937",
];

const DEFAULT_PROPERTIES: AnnotationProperties = {
  color: "#ef4444",
  opacity: 1.0,
  lineWidth: 2,
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function AnnotationToolbar({
  visible,
  activeTool,
  highlightColor,
  onSelectTool,
  onHighlightColorChange,
  onPropertiesChange,
  onClose,
  properties,
  saving,
}: AnnotationToolbarProps) {
  const [showPropertyPanel, setShowPropertyPanel] = useState(false);

  const isToolActive = useCallback(
    (tool: AnnotationToolbarTool): boolean => {
      return activeTool === tool;
    },
    [activeTool],
  );

  const handleToolClick = useCallback(
    (tool: AnnotationToolbarTool, mappedTool: AnnotationTool) => {
      if (activeTool === mappedTool) {
        onSelectTool("none");
        setShowPropertyPanel(false);
      } else {
        onSelectTool(mappedTool);
        const hasProperties =
          tool === "rectangle" || tool === "circle" || tool === "pen";
        setShowPropertyPanel(hasProperties);
      }
    },
    [activeTool, onSelectTool],
  );

  const handleColorChange = useCallback(
    (color: string) => {
      onPropertiesChange({ ...properties, color });
    },
    [properties, onPropertiesChange],
  );

  const handleOpacityChange = useCallback(
    (opacity: number) => {
      onPropertiesChange({ ...properties, opacity });
    },
    [properties, onPropertiesChange],
  );

  const handleLineWidthChange = useCallback(
    (lineWidth: number) => {
      onPropertiesChange({ ...properties, lineWidth });
    },
    [properties, onPropertiesChange],
  );

  if (!visible) return null;

  const showHighlightColors =
    activeTool === "highlight" || activeTool === "underline";
  const showShapeProperties =
    activeTool === "rectangle" ||
    activeTool === "circle" ||
    activeTool === "pen";

  return (
    <div className="annotation-toolbar">
      {/* Property panel (above the main toolbar) */}
      {showPropertyPanel && showShapeProperties && (
        <div className="annotation-properties" style={{ flexDirection: "column", gap: "12px", borderLeft: "none", paddingLeft: 0, minWidth: "220px" }}>
          <div>
            <span className="tool-label" style={{ textTransform: "uppercase", letterSpacing: "0.05em" }}>Color</span>
            <div className="color-picker" style={{ marginTop: "6px" }}>
              {SHAPE_COLOR_PRESETS.map((hex) => (
                <button
                  key={hex}
                  type="button"
                  aria-label={`Color ${hex}`}
                  title={hex}
                  onClick={() => handleColorChange(hex)}
                  className={`color-swatch${properties.color === hex ? " active" : ""}`}
                  style={{ backgroundColor: hex }}
                />
              ))}
              <input
                type="color"
                value={properties.color}
                onChange={(e) => handleColorChange(e.target.value)}
                className="color-swatch"
                aria-label="Custom color"
                title="Custom color"
                style={{ cursor: "pointer", padding: 0 }}
              />
            </div>
          </div>

          <div className="property-slider" style={{ flexDirection: "column", alignItems: "stretch" }}>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <span>Opacity</span>
              <span style={{ fontVariantNumeric: "tabular-nums" }}>{Math.round(properties.opacity * 100)}%</span>
            </div>
            <input
              type="range"
              min={0}
              max={100}
              step={5}
              value={Math.round(properties.opacity * 100)}
              onChange={(e) => handleOpacityChange(Number(e.target.value) / 100)}
              aria-label="Opacity"
            />
          </div>

          <div className="property-slider" style={{ flexDirection: "column", alignItems: "stretch" }}>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <span>Line width</span>
              <span style={{ fontVariantNumeric: "tabular-nums" }}>{properties.lineWidth}pt</span>
            </div>
            <input
              type="range"
              min={1}
              max={20}
              step={1}
              value={properties.lineWidth}
              onChange={(e) => handleLineWidthChange(Number(e.target.value))}
              aria-label="Line width"
            />
          </div>
        </div>
      )}

      {/* Highlight colour swatches */}
      {showHighlightColors && (
        <div className="color-picker">
          {HIGHLIGHT_SWATCHES.map((swatch) => (
            <button
              key={swatch.color}
              type="button"
              aria-label={`Highlight color: ${swatch.color}`}
              title={swatch.color}
              onClick={() => onHighlightColorChange(swatch.color)}
              className={`color-swatch${highlightColor === swatch.color ? " active" : ""}`}
              style={{ backgroundColor: swatch.hex, width: 28, height: 28 }}
            />
          ))}
        </div>
      )}

      {/* Main tool buttons */}
      <div className="annotation-tools">
        {TOOLS.map((tool) => (
          <button
            key={tool.id}
            type="button"
            title={tool.label}
            aria-label={tool.label}
            disabled={saving}
            onClick={() => handleToolClick(tool.id, tool.mappedTool)}
            className={`annotation-tool-btn${isToolActive(tool.id) ? " active" : ""}`}
          >
            <span className="tool-icon">{TOOL_ICONS[tool.id]}</span>
            <span className="tool-label">{tool.label}</span>
          </button>
        ))}
      </div>

      <button
        type="button"
        title="Close annotation toolbar"
        aria-label="Close annotation toolbar"
        onClick={onClose}
        className="annotation-close-btn"
      >
        X
      </button>
    </div>
  );
}

/** Get the default annotation properties. */
export function getDefaultAnnotationProperties(): AnnotationProperties {
  return { ...DEFAULT_PROPERTIES };
}

/**
 * Convert AnnotationProperties colour (hex string) to the [r, g, b] tuple
 * expected by the Tauri annotation commands (values 0-1).
 */
export function hexToRgbTuple(hex: string): [number, number, number] {
  const cleaned = hex.replace("#", "");
  const r = parseInt(cleaned.substring(0, 2), 16) / 255;
  const g = parseInt(cleaned.substring(2, 4), 16) / 255;
  const b = parseInt(cleaned.substring(4, 6), 16) / 255;
  return [
    Number.isFinite(r) ? r : 0,
    Number.isFinite(g) ? g : 0,
    Number.isFinite(b) ? b : 0,
  ];
}
