// Copyright (c) 2026 PDFluent B.V. All rights reserved.
//
// This software is proprietary and confidential.
// Free for personal, non-commercial use.
// Commercial use requires a valid license.
// See https://pdfluent.com/license for terms.

// TODO(pdfluent-viewer): implement full command palette with searchable actions, navigation, and mode switching
// Status: design integrated, functionality not implemented yet

import { useEffect, useRef } from 'react';
import { SearchIcon, XIcon } from 'lucide-react';

interface CommandPaletteProps {
  isOpen: boolean;
  onClose: () => void;
}

export function CommandPalette({ isOpen, onClose }: CommandPaletteProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      // Focus the input when palette opens
      setTimeout(() => { inputRef.current?.focus(); }, 10);
    }
  }, [isOpen]);

  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    if (isOpen) {
      window.addEventListener('keydown', handleKey);
      return () => { window.removeEventListener('keydown', handleKey); };
    }
    return undefined;
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/30 z-40"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Palette */}
      <div
        role="dialog"
        aria-label="Command palette"
        className="fixed left-1/2 top-[15vh] -translate-x-1/2 w-full max-w-lg bg-background border border-border rounded-xl shadow-2xl z-50 overflow-hidden"
      >
        {/* Search input */}
        <div className="flex items-center gap-2 px-4 py-3 border-b border-border">
          <SearchIcon className="w-4 h-4 text-muted-foreground shrink-0" />
          <input
            ref={inputRef}
            type="text"
            placeholder="Zoek opdrachten…"
            disabled
            className="flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground/60 outline-none cursor-default"
            title="Command palette — coming soon"
          />
          <button
            onClick={onClose}
            aria-label="Close command palette"
            className="p-0.5 text-muted-foreground hover:text-foreground rounded transition-colors"
          >
            <XIcon className="w-4 h-4" />
          </button>
        </div>

        {/* Placeholder content */}
        {/* TODO(pdfluent-viewer): render grouped command list with keyboard navigation
            Status: design integrated, functionality not implemented yet */}
        <div className="px-4 py-8 flex flex-col items-center gap-2 text-center">
          <p className="text-sm text-muted-foreground">Opdrachtenpalette beschikbaar binnenkort.</p>
          <p className="text-xs text-muted-foreground/60">Druk op Esc om te sluiten.</p>
        </div>

        {/* Footer */}
        <div className="px-4 py-2 border-t border-border flex items-center gap-4">
          <span className="text-[10px] text-muted-foreground/50">↑↓ navigeren</span>
          <span className="text-[10px] text-muted-foreground/50">↵ selecteren</span>
          <span className="text-[10px] text-muted-foreground/50">Esc sluiten</span>
        </div>
      </div>
    </>
  );
}
