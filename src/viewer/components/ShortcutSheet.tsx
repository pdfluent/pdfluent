// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary. The PDFluent application is free to use,
// including for commercial purposes. Redistribution, or extraction or reuse
// of its components (including the embedded PDF engine), requires a licence.
// See https://pdfluent.com/license for terms.

import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { XIcon } from 'lucide-react';
import { LanguageSwitcher } from './LanguageSwitcher';
import { useFocusTrap } from '../hooks/useFocusTrap';

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
      { keys: '1 – 8',             descriptionKey: 'shortcuts.switchMode' },
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
  const dialogRef = useRef<HTMLDivElement>(null);
  useFocusTrap(dialogRef, isOpen);

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
      {/* Backdrop — shares the cmdpalette backdrop styling. */}
      <div
        className="cmdpalette-backdrop"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Sheet — centered floating panel with the same chrome as the
          command palette, since both serve discovery surfaces. */}
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="shortcut-sheet-title"
        data-testid="shortcut-sheet"
        className="shortcutsheet"
      >
        <header className="shortcutsheet-header">
          <h2 id="shortcut-sheet-title" className="shortcutsheet-title">
            {t('shortcuts.title')}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label={t('shortcuts.closeAriaLabel')}
            data-testid="shortcut-sheet-close"
            className="settings-dialog-close"
          >
            <XIcon aria-hidden="true" />
          </button>
        </header>

        <div className="shortcutsheet-body">
          {SHORTCUT_GROUP_KEYS.map((group) => (
            <section key={group.titleKey} className="shortcutsheet-group">
              <p className="shortcutsheet-group-title">{t(group.titleKey)}</p>
              <div className="shortcutsheet-rows">
                {group.shortcuts.map((row) => (
                  <div
                    key={row.keys}
                    className="shortcutsheet-row"
                    data-testid="shortcut-row"
                  >
                    <kbd className="shortcutsheet-kbd">{row.keys}</kbd>
                    <span className="shortcutsheet-description">
                      {t(row.descriptionKey)}
                    </span>
                  </div>
                ))}
              </div>
            </section>
          ))}
        </div>

        <footer className="shortcutsheet-footer">
          <span>Language / Taal</span>
          <LanguageSwitcher />
        </footer>
      </div>
    </>
  );
}
