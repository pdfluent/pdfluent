// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary. The PDFluent application is free to use,
// including for commercial purposes. Redistribution, or extraction or reuse
// of its components (including the embedded PDF engine), requires a licence.
// See https://pdfluent.com/license for terms.
import type { ErrorInfo, ReactNode } from "react";
import { Component } from "react";
import { appendDebugLog } from "../lib/debug-log";
import { emitCrash } from "../lib/telemetry/crashChannel";

interface ErrorBoundaryProps {
  children: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  message: string;
}

export class ErrorBoundary extends Component<
  ErrorBoundaryProps,
  ErrorBoundaryState
> {
  state: ErrorBoundaryState = {
    hasError: false,
    message: "",
  };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return {
      hasError: true,
      message: error.message || "Unexpected render error",
    };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    appendDebugLog("error", "react_error_boundary_caught", {
      message: error.message,
      stack: error.stack,
      componentStack: info.componentStack,
    });
    // Publish to the crash channel so the always-mounted CrashReporter (a
    // sibling of this boundary) can offer the privacy-first review dialog.
    // The raw text is scrubbed later, in buildReport().
    emitCrash({
      message: error.message || "Unexpected render error",
      stack: error.stack ?? info.componentStack ?? null,
      source: "react",
    });
  }

  render(): ReactNode {
    if (!this.state.hasError) {
      return this.props.children;
    }

    return (
      <main className="viewer">
        <div className="viewer-placeholder viewer-placeholder-card viewer-error animate-fade-in">
          <h2>Application error</h2>
          <p>{this.state.message}</p>
          <p>Please restart PDFluent. The crash details are saved in debug logs.</p>
          <button
            type="button"
            className="btn-primary"
            style={{ marginTop: "16px" }}
            onClick={() => {
              window.location.reload();
            }}
          >
            Reload app
          </button>
        </div>
      </main>
    );
  }
}
