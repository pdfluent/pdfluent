// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary and confidential.
// Free for personal, non-commercial use.
// Commercial use requires a valid license.
// See https://pdfluent.com/license for terms.

import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
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
// Shortcut data keys — only genuinely implemented shortcuts are listed here
// ---------------------------------------------------------------------------

interface ShortcutRowKeys {
  keys: string;
  descriptionKey: string;
}

interface ShortcutGroupKeys {
  titleKey: string;
  shortcuts: ShortcutRowKeys[];
}

const SHORTCUT_GROUP_KEYS: ShortcutGroupKeys[] = [
  {
    titleKey: 'shortcuts.navigation',
    shortcuts: [
      { keys: '← / →',             descriptionKey: 'shortcuts.prevNextPage' },
      { keys: 'PageUp / PageDown',  descriptionKey: 'shortcuts.prevNextPage' },
      { keys: 'Home / End',         descriptionKey: 'shortcuts.firstLastPage' },
      { keys: '⌘G / Ctrl+G',       descriptionKey: 'shortcuts.goToPage' },
    ],
  },
  {
    titleKey: 'shortcuts.zoom',
    shortcuts: [
      { keys: '⌘= / Ctrl+=',       descriptionKey: 'shortcuts.zoomIn' },
      { keys: '⌘− / Ctrl+−',       descriptionKey: 'shortcuts.zoomOut' },
      { keys: '⌘0 / Ctrl+0',       descriptionKey: 'shortcuts.zoom100' },
      { keys: '⌘/Ctrl + Scroll',   descriptionKey: 'shortcuts.fitZoom' },
    ],
  },
  {
    titleKey: 'shortcuts.document',
    shortcuts: [
      { keys: '⌘S / Ctrl+S',       descriptionKey: 'shortcuts.save' },
      { keys: '⌘E / Ctrl+E',       descriptionKey: 'shortcuts.export' },
      { keys: '⌘K / Ctrl+K',       descriptionKey: 'shortcuts.commandPalette' },
    ],
  },
  {
    titleKey: 'shortcuts.view',
    shortcuts: [
      { keys: 'F11 / ⌘⇧F',         descriptionKey: 'shortcuts.toggleFullscreen' },
      { keys: '1 – 7',             descriptionKey: 'shortcuts.switchMode' },
    ],
  },
  {
    titleKey: 'shortcuts.dialogs',
    shortcuts: [
      { keys: 'Escape',            descriptionKey: 'shortcuts.closeDialog' },
      { keys: '⌘? / Ctrl+?',      descriptionKey: 'shortcuts.thisOverview' },
    ],
  },
];

// Keep legacy export for any tests that import SHORTCUT_GROUPS
export const SHORTCUT_GROUPS: ShortcutGroup[] = SHORTCUT_GROUP_KEYS.map(g => ({
  title: g.titleKey,
  shortcuts: g.shortcuts.map(s => ({ keys: s.keys, description: s.descriptionKey })),
}));

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
  const { t } = useTranslation();
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
            {t('shortcuts.title')}
          </h2>
          <button
            onClick={onClose}
            aria-label={t('shortcuts.closeAriaLabel')}
            data-testid="shortcut-sheet-close"
            className="p-0.5 text-muted-foreground hover:text-foreground rounded transition-colors"
          >
            <XIcon className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="overflow-y-auto max-h-[75vh] px-4 py-3 flex flex-col gap-4">
          {SHORTCUT_GROUP_KEYS.map(group => (
            <div key={group.titleKey}>
              <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground mb-1.5">
                {t(group.titleKey)}
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
                      {t(row.descriptionKey)}
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
