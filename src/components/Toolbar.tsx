// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 PDFluent Contributors

interface ToolbarProps {
  onOpenFile: () => void;
  filePath: string | null;
}

export function Toolbar({ onOpenFile, filePath }: ToolbarProps) {
  const fileName = filePath ? filePath.split("/").pop() : null;

  return (
    <header className="toolbar">
      <div className="toolbar-left">
        <span className="toolbar-title">PDFluent</span>
        <button className="toolbar-btn" onClick={onOpenFile}>
          Open PDF
        </button>
      </div>
      <div className="toolbar-center">
        {fileName && <span className="toolbar-filename">{fileName}</span>}
      </div>
      <div className="toolbar-right" />
    </header>
  );
}
