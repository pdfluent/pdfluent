// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary and confidential.
// Free for personal, non-commercial use.
// Commercial use requires a valid license.
// See https://pdfluent.com/license for terms.

import { useEffect, useRef, useState, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { SearchIcon, XIcon } from 'lucide-react';

export interface Command {
  id: string;
  label: string;
  keywords?: string[];
  action: () => void;
}

interface CommandPaletteProps {
  isOpen: boolean;
  onClose: () => void;
  commands: Command[];
  recentIds?: string[];
  onRun?: (id: string) => void;
}

export function CommandPalette({ isOpen, onClose, commands, recentIds = [], onRun }: CommandPaletteProps) {
  const { t } = useTranslation();
  const inputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);

  // Refs so the keyboard handler always sees the latest values without re-registering
  const filteredRef = useRef<Command[]>([]);
  const selectedIndexRef = useRef(0);

  // Up to 3 recent commands shown when the query is empty (in usage order, deduped)
  const recentCommands = useMemo(() => {
    return recentIds
      .map(id => commands.find(c => c.id === id))
      .filter((c): c is Command => c !== undefined)
      .slice(0, 3);
  }, [recentIds, commands]);

  const filtered = useMemo(() => {
    if (!query.trim()) return commands;
    const q = query.toLowerCase();
    return commands.filter(cmd =>
      cmd.label.toLowerCase().includes(q) ||
      cmd.keywords?.some(k => k.toLowerCase().includes(q))
    );
  }, [commands, query]);

  // Whether to show the recent section (only when query is empty and there are recents)
  const showRecent = !query.trim() && recentCommands.length > 0;

  filteredRef.current = filtered;
  selectedIndexRef.current = selectedIndex;

  // Reset state when palette opens
  useEffect(() => {
    if (isOpen) {
      setQuery('');
      setSelectedIndex(0);
      setTimeout(() => { inputRef.current?.focus(); }, 10);
    }
  }, [isOpen]);

  // Clamp selection when filtered list shrinks
  useEffect(() => {
    if (selectedIndex >= filtered.length) {
      setSelectedIndex(Math.max(0, filtered.length - 1));
    }
  }, [filtered.length, selectedIndex]);

  // Keyboard navigation — registered once per open/close cycle
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        onClose();
        return;
      }
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedIndex(i => Math.min(i + 1, filteredRef.current.length - 1));
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedIndex(i => Math.max(i - 1, 0));
        return;
      }
      if (e.key === 'Enter') {
        e.preventDefault();
        const cmd = filteredRef.current[selectedIndexRef.current];
        if (cmd) { onRun?.(cmd.id); cmd.action(); onClose(); }
      }
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
            placeholder={t('commandPalette.placeholder')}
            aria-label={t('commandPalette.placeholder')}
            value={query}
            onChange={e => { setQuery(e.target.value); }}
            className="flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground/60 outline-none"
          />
          <button
            onClick={onClose}
            aria-label="Close command palette"
            className="p-0.5 text-muted-foreground hover:text-foreground rounded transition-colors"
          >
            <XIcon className="w-4 h-4" />
          </button>
        </div>

        {/* Command list */}
        <div className="max-h-72 overflow-y-auto">
          {/* Recent commands section — shown only when query is empty */}
          {showRecent && (
            <div data-testid="recent-commands-section">
              <p className="px-4 pt-2 pb-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground/60">
                {t('commandPalette.recent')}
              </p>
              <ul>
                {recentCommands.map(cmd => (
                  <li key={cmd.id}>
                    <button
                      data-testid="recent-command-item"
                      className="w-full text-left px-4 py-2 text-sm text-foreground hover:bg-muted/50 transition-colors"
                      onClick={() => { onRun?.(cmd.id); cmd.action(); onClose(); }}
                    >
                      {cmd.label}
                    </button>
                  </li>
                ))}
              </ul>
              <div className="mx-4 my-1 border-t border-border" aria-hidden="true" />
            </div>
          )}

          {filtered.length === 0 ? (
            <div className="px-4 py-8 text-center">
              <p className="text-sm text-muted-foreground">{t('commandPalette.empty')}</p>
            </div>
          ) : (
            <ul>
              {filtered.map((cmd, i) => (
                <li key={cmd.id}>
                  <button
                    className={`w-full text-left px-4 py-2.5 text-sm transition-colors ${
                      i === selectedIndex
                        ? 'bg-primary/10 text-foreground'
                        : 'text-foreground hover:bg-muted/50'
                    }`}
                    onMouseEnter={() => { setSelectedIndex(i); }}
                    onClick={() => { onRun?.(cmd.id); cmd.action(); onClose(); }}
                  >
                    {cmd.label}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Footer */}
        <div className="px-4 py-2 border-t border-border flex items-center gap-4">
          <span className="text-[10px] text-muted-foreground/50">{t('commandPalette.navigate')}</span>
          <span className="text-[10px] text-muted-foreground/50">{t('commandPalette.select')}</span>
          <span className="text-[10px] text-muted-foreground/50">{t('commandPalette.dismiss')}</span>
        </div>
      </div>
    </>
  );
}
