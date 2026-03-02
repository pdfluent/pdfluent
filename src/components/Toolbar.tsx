// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 PDFluent Contributors

import { useState } from "react";

interface ToolbarProps {
  onOpenFile: () => void;
  onCloseFile: () => void;
  filePath: string | null;
  currentPage: number;
  pageCount: number;
  scale: number;
  onGoToPage: (page: number) => void;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onZoomReset: () => void;
}

export function Toolbar({
  onOpenFile,
  onCloseFile,
  filePath,
  currentPage,
  pageCount,
  scale,
  onGoToPage,
  onZoomIn,
  onZoomOut,
  onZoomReset,
}: ToolbarProps) {
  const fileName = filePath ? filePath.split("/").pop() : null;
  const [pageInput, setPageInput] = useState("");

  function handlePageSubmit(e: React.FormEvent) {
    e.preventDefault();
    const num = parseInt(pageInput, 10);
    if (!isNaN(num) && num >= 1 && num <= pageCount) {
      onGoToPage(num - 1);
    }
    setPageInput("");
  }

  return (
    <header className="toolbar">
      <div className="toolbar-left">
        <span className="toolbar-title">PDFluent</span>
        <button className="toolbar-btn" onClick={onOpenFile}>
          Open
        </button>
        {filePath && (
          <button className="toolbar-btn" onClick={onCloseFile}>
            Close
          </button>
        )}
      </div>

      <div className="toolbar-center">
        {fileName && pageCount > 0 && (
          <>
            <div className="toolbar-nav">
              <button
                className="toolbar-btn toolbar-btn-icon"
                onClick={() => onGoToPage(currentPage - 1)}
                disabled={currentPage === 0}
                title="Previous page"
              >
                &#x2039;
              </button>
              <form onSubmit={handlePageSubmit} className="toolbar-page-form">
                <input
                  className="toolbar-page-input"
                  type="text"
                  value={pageInput}
                  onChange={(e) => setPageInput(e.target.value)}
                  placeholder={String(currentPage + 1)}
                  title="Go to page"
                />
                <span className="toolbar-page-total">/ {pageCount}</span>
              </form>
              <button
                className="toolbar-btn toolbar-btn-icon"
                onClick={() => onGoToPage(currentPage + 1)}
                disabled={currentPage >= pageCount - 1}
                title="Next page"
              >
                &#x203A;
              </button>
            </div>

            <span className="toolbar-separator" />

            <div className="toolbar-zoom">
              <button
                className="toolbar-btn toolbar-btn-icon"
                onClick={onZoomOut}
                title="Zoom out (Cmd -)"
              >
                &minus;
              </button>
              <button
                className="toolbar-btn toolbar-zoom-label"
                onClick={onZoomReset}
                title="Reset zoom (Cmd 0)"
              >
                {Math.round(scale * 100)}%
              </button>
              <button
                className="toolbar-btn toolbar-btn-icon"
                onClick={onZoomIn}
                title="Zoom in (Cmd +)"
              >
                +
              </button>
            </div>
          </>
        )}
        {fileName && pageCount === 0 && (
          <span className="toolbar-filename">{fileName}</span>
        )}
      </div>

      <div className="toolbar-right">
        {fileName && (
          <span className="toolbar-filename">{fileName}</span>
        )}
      </div>
    </header>
  );
}
