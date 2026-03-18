// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary and confidential.
// Free for personal, non-commercial use.
// Commercial use requires a valid license.
// See https://pdfluent.com/license for terms.

import { useEffect, useRef } from 'react';
import { XIcon } from 'lucide-react';
import { LanguageSwitcher } from './LanguageSwitcher';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ShortcutRow {
  keys: string;
  description: string;
}

interface ShortcutGroup {
  title: string;
  shortcuts: ShortcutRow[];
}

// ---------------------------------------------------------------------------
// Shortcut data — only genuinely implemented shortcuts are listed here
// ---------------------------------------------------------------------------

export const SHORTCUT_GROUPS: ShortcutGroup[] = [
  {
    title: 'Navigatie',
    shortcuts: [
      { keys: '← / →',             description: 'Vorige / volgende pagina' },
      { keys: 'PageUp / PageDown',  description: 'Vorige / volgende pagina' },
      { keys: 'Home / End',         description: 'Eerste / laatste pagina' },
      { keys: '⌘G / Ctrl+G',       description: 'Ga naar pagina' },
    ],
  },
  {
    title: 'Zoom',
    shortcuts: [
      { keys: '⌘= / Ctrl+=',       description: 'Inzoomen' },
      { keys: '⌘− / Ctrl+−',       description: 'Uitzoomen' },
      { keys: '⌘0 / Ctrl+0',       description: 'Zoom 100%' },
      { keys: '⌘/Ctrl + Scroll',   description: 'Zoom aanpassen' },
    ],
  },
  {
    title: 'Document',
    shortcuts: [
      { keys: '⌘S / Ctrl+S',       description: 'Opslaan' },
      { keys: '⌘E / Ctrl+E',       description: 'Exporteren' },
      { keys: '⌘K / Ctrl+K',       description: 'Opdrachtenpalette' },
    ],
  },
  {
    title: 'Weergave',
    shortcuts: [
      { keys: 'F11 / ⌘⇧F',         description: 'Volledig scherm aan/uit' },
      { keys: '1 – 7',             description: 'Modus wisselen' },
    ],
  },
  {
    title: 'Dialogen',
    shortcuts: [
      { keys: 'Escape',            description: 'Dialoog sluiten' },
      { keys: '⌘? / Ctrl+?',      description: 'Dit overzicht' },
    ],
  },
];

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface ShortcutSheetProps {
  isOpen: boolean;
  onClose: () => void;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function ShortcutSheet({ isOpen, onClose }: ShortcutSheetProps) {
  // Stable ref so the Escape listener always calls the latest onClose
  const onCloseRef = useRef(onClose);
  useEffect(() => { onCloseRef.current = onClose; });

  // Close on Escape
  useEffect(() => {
    if (!isOpen) return;
    function handleKey(e: KeyboardEvent): void {
      if (e.key === 'Escape') onCloseRef.current();
    }
    window.addEventListener('keydown', handleKey);
    return () => { window.removeEventListener('keydown', handleKey); };
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/30 z-40"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Sheet */}
      <div
        role="dialog"
        aria-labelledby="shortcut-sheet-title"
        data-testid="shortcut-sheet"
        className="fixed left-1/2 top-[10vh] -translate-x-1/2 w-full max-w-md bg-background border border-border rounded-xl shadow-2xl z-50 overflow-hidden"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <h2 id="shortcut-sheet-title" className="text-sm font-semibold text-foreground">
            Sneltoetsen
          </h2>
          <button
            onClick={onClose}
            aria-label="Sneltoetsenoverzicht sluiten"
            data-testid="shortcut-sheet-close"
            className="p-0.5 text-muted-foreground hover:text-foreground rounded transition-colors"
          >
            <XIcon className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="overflow-y-auto max-h-[75vh] px-4 py-3 flex flex-col gap-4">
          {SHORTCUT_GROUPS.map(group => (
            <div key={group.title}>
              <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground mb-1.5">
                {group.title}
              </p>
              <div className="flex flex-col gap-0.5">
                {group.shortcuts.map(row => (
                  <div
                    key={row.keys}
                    className="flex items-center justify-between gap-4 py-0.5"
                    data-testid="shortcut-row"
                  >
                    <kbd className="text-[10px] font-mono font-medium text-foreground bg-muted px-1.5 py-0.5 rounded border border-border shrink-0 whitespace-nowrap">
                      {row.keys}
                    </kbd>
                    <span className="text-[11px] text-muted-foreground text-right">
                      {row.description}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        {/* Footer — language switcher */}
        <div className="flex items-center justify-between px-4 py-2 border-t border-border">
          <span className="text-[10px] text-muted-foreground">Language / Taal</span>
          <LanguageSwitcher />
        </div>
      </div>
    </>
  );
}
