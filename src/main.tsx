// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary and confidential.
// Free for personal, non-commercial use.
// Commercial use requires a valid license.
// See https://pdfluent.com/license for terms.
import React from "react";
import ReactDOM from "react-dom/client";
import { App } from "./App";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { ViewerApp } from "./viewer/ViewerApp";
import "./styles/global.css";
import "./styles/magic-patterns.css";
// i18n must be imported before any component that uses useTranslation
import "./i18n";

const useViewer = new URLSearchParams(window.location.search).has('v2');

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <ErrorBoundary>
      {useViewer ? <ViewerApp /> : <App />}
    </ErrorBoundary>
  </React.StrictMode>,
);
