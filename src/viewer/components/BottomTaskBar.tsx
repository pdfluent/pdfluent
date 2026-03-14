// Copyright (c) 2026 PDFluent B.V. All rights reserved.
//
// This software is proprietary and confidential.
// Free for personal, non-commercial use.
// Commercial use requires a valid license.
// See https://pdfluent.com/license for terms.

// TODO(pdfluent-viewer): connect BottomTaskBar to real background task queue (OCR, export, save, etc.)
// Status: design integrated, functionality not implemented yet

export function BottomTaskBar() {
  return (
    <div className="h-6 flex items-center px-3 border-t border-border bg-muted/20 shrink-0">
      {/* TODO(pdfluent-viewer): render active task list with progress bars and dismiss buttons
          Status: design integrated, functionality not implemented yet */}
      <span className="text-[10px] text-muted-foreground/50 select-none">
        Geen actieve taken
      </span>
    </div>
  );
}
