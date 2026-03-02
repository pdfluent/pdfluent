// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 PDFluent Contributors

interface ViewerProps {
  filePath: string | null;
}

export function Viewer({ filePath }: ViewerProps) {
  if (!filePath) {
    return (
      <main className="viewer viewer-empty">
        <div className="viewer-placeholder">
          <h2>Open a PDF to get started</h2>
          <p>
            Drag and drop a file here, or click <strong>Open PDF</strong> in the
            toolbar.
          </p>
        </div>
      </main>
    );
  }

  return (
    <main className="viewer">
      {/* PDF rendering via Pdfium will go here */}
      <canvas id="pdf-canvas" />
    </main>
  );
}
