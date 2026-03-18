// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 PDFluent Contributors

/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  darkMode: "selector",
  theme: {
    container: {
      center: true,
      padding: "2rem",
      screens: {
        "2xl": "1400px",
      },
    },
    extend: {
      colors: {
        border: "var(--border)",
        input: "var(--input)",
        ring: "var(--ring)",
        background: "var(--background)",
        foreground: "var(--foreground)",
        primary: {
          DEFAULT: "var(--primary)",
          foreground: "var(--primary-foreground)",
        },
        secondary: {
          DEFAULT: "var(--secondary)",
          foreground: "var(--secondary-foreground)",
        },
        destructive: {
          DEFAULT: "var(--destructive)",
          foreground: "var(--destructive-foreground)",
        },
        muted: {
          DEFAULT: "var(--muted)",
          foreground: "var(--muted-foreground)",
        },
        accent: {
          DEFAULT: "var(--accent)",
          foreground: "var(--accent-foreground)",
        },
        popover: {
          DEFAULT: "var(--popover)",
          foreground: "var(--popover-foreground)",
        },
        card: {
          DEFAULT: "var(--card)",
          foreground: "var(--card-foreground)",
        },
        "muted-foreground": "var(--muted-foreground)",
        "popover-foreground": "var(--popover-foreground)",
        "card-foreground": "var(--card-foreground)",
        "primary-foreground": "var(--primary-foreground)",
        "secondary-foreground": "var(--secondary-foreground)",
        "accent-foreground": "var(--accent-foreground)",
        "destructive-foreground": "var(--destructive-foreground)",
        "pf-surface-0": "var(--pf-surface-0)",
        "pf-surface-1": "var(--pf-surface-1)",
        "pf-surface-2": "var(--pf-surface-2)",
        "pf-surface-3": "var(--pf-surface-3)",
        "pf-surface-4": "var(--pf-surface-4)",
        "pf-accent": "var(--pf-accent)",
        "pf-accent-hover": "var(--pf-accent-hover)",
        "pf-accent-muted": "var(--pf-accent-muted)",
        "pf-success": "var(--pf-success)",
        "pf-success-muted": "var(--pf-success-muted)",
        "pf-warning": "var(--pf-warning)",
        "pf-warning-muted": "var(--pf-warning-muted)",
        "pf-danger": "var(--pf-danger)",
        "pf-danger-muted": "var(--pf-danger-muted)",
        "pf-info": "var(--pf-info)",
        "pf-info-muted": "var(--pf-info-muted)",
        "pf-text-primary": "var(--pf-text-primary)",
        "pf-text-secondary": "var(--pf-text-secondary)",
        "pf-text-muted": "var(--pf-text-muted)",
        "pf-border-subtle": "var(--pf-border-subtle)",
        "pf-border-medium": "var(--pf-border-medium)",
        "pf-border-strong": "var(--pf-border-strong)",
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
      },
      boxShadow: {
        "pf-sm": "0 1px 2px rgba(0, 0, 0, 0.04)",
        "pf-md": "0 2px 8px rgba(0, 0, 0, 0.08)",
        "pf-lg": "0 4px 16px rgba(0, 0, 0, 0.12)",
        "pf-page":
          "0 1px 4px rgba(0, 0, 0, 0.12), 0 0 1px rgba(0, 0, 0, 0.08)",
        "pf-glow": "none",
        "pf-glow-sm": "none",
      },
      spacing: {
        "pf-toolbar": "var(--pf-toolbar-height)",
        "pf-sidebar": "var(--pf-sidebar-width)",
        "pf-panel": "var(--pf-panel-width)",
      },
      fontSize: {
        "pf-xs": ["0.6875rem", { lineHeight: "1rem" }],
        "pf-sm": ["0.8125rem", { lineHeight: "1.25rem" }],
        "pf-base": ["0.875rem", { lineHeight: "1.375rem" }],
        "pf-md": ["0.9375rem", { lineHeight: "1.5rem" }],
        "pf-lg": ["1.0625rem", { lineHeight: "1.625rem" }],
        "pf-xl": ["1.25rem", { lineHeight: "1.75rem" }],
        "pf-2xl": ["1.5rem", { lineHeight: "2rem" }],
      },
      keyframes: {
        "pf-fade-in": {
          from: { opacity: 0 },
          to: { opacity: 1 },
        },
        "pf-slide-in-right": {
          from: { opacity: 0, transform: "translateX(8px)" },
          to: { opacity: 1, transform: "translateX(0)" },
        },
        "pf-spin": {
          from: { transform: "rotate(0deg)" },
          to: { transform: "rotate(360deg)" },
        },
        "pf-progress": {
          from: { width: "0%" },
          to: { width: "100%" },
        },
      },
      animation: {
        "pf-fade-in": "pf-fade-in 0.15s ease-out",
        "pf-slide-in": "pf-slide-in-right 0.15s ease-out",
        "pf-spin": "pf-spin 1s linear infinite",
        "pf-progress": "pf-progress 3s ease-in-out",
      },
    },
  },
};
