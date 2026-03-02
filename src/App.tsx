// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 PDFluent Contributors

import { useState } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import { Toolbar } from "./components/Toolbar";
import { Sidebar } from "./components/Sidebar";
import { Viewer } from "./components/Viewer";

export function App() {
  const [filePath, setFilePath] = useState<string | null>(null);

  async function handleOpenFile() {
    const selected = await open({
      multiple: false,
      filters: [{ name: "PDF", extensions: ["pdf"] }],
    });
    if (typeof selected === "string") {
      setFilePath(selected);
    }
  }

  return (
    <div className="app">
      <Toolbar onOpenFile={handleOpenFile} filePath={filePath} />
      <div className="app-body">
        <Sidebar filePath={filePath} />
        <Viewer filePath={filePath} />
      </div>
    </div>
  );
}
