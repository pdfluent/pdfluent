// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 PDFluent Contributors

interface SidebarProps {
  filePath: string | null;
}

export function Sidebar({ filePath }: SidebarProps) {
  if (!filePath) {
    return <aside className="sidebar" />;
  }

  return (
    <aside className="sidebar">
      <div className="sidebar-header">Pages</div>
      <div className="sidebar-content">
        {/* Page thumbnails will be rendered here via Pdfium */}
      </div>
    </aside>
  );
}
