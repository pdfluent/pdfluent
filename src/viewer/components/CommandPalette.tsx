// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary. The PDFluent application is free to use,
// including for commercial purposes. Redistribution, or extraction or reuse
// of its components (including the embedded PDF engine), requires a licence.
// See https://pdfluent.com/license for terms.

import { useEffect, useRef, useState, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { SearchIcon, XIcon } from 'lucide-react';
import { useFocusTrap } from '../hooks/useFocusTrap';

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
  const dialogRef = useRef<HTMLDivElement>(null);
  useFocusTrap(dialogRef, isOpen);
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
      {/* Backdrop — blurred + tinted, shared style with all overlays. */}
      <div
        className="cmdpalette-backdrop"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Centered floating palette. */}
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label={t('commandPalette.placeholder')}
        data-testid="command-palette"
        className="cmdpalette"
      >
        {/* Search input */}
        <div className="cmdpalette-input-row">
          <SearchIcon className="cmdpalette-input-icon" aria-hidden="true" />
          <input
            ref={inputRef}
            type="text"
            data-testid="command-palette-input"
            placeholder={t('commandPalette.placeholder')}
            aria-label={t('commandPalette.placeholder')}
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
            }}
            className="cmdpalette-input"
          />
          <button
            type="button"
            onClick={onClose}
            aria-label={t('commandPalette.dismiss')}
            className="cmdpalette-input-clear"
          >
            <XIcon aria-hidden="true" />
          </button>
        </div>

        {/* Command list */}
        <div className="cmdpalette-list">
          {/* Recent commands section — shown only when query is empty */}
          {showRecent && (
            <div data-testid="recent-commands-section">
              <p className="cmdpalette-section-title">
                {t('commandPalette.recent')}
              </p>
              <ul>
                {recentCommands.map((cmd) => (
                  <li key={cmd.id}>
                    <button
                      type="button"
                      data-testid="recent-command-item"
                      className="cmdpalette-item"
                      onClick={() => {
                        onRun?.(cmd.id);
                        cmd.action();
                        onClose();
                      }}
                    >
                      {cmd.label}
                    </button>
                  </li>
                ))}
              </ul>
              <div className="cmdpalette-divider" aria-hidden="true" />
            </div>
          )}

          {filtered.length === 0 ? (
            <div className="cmdpalette-empty">
              <p>{t('commandPalette.empty')}</p>
            </div>
          ) : (
            <ul>
              {filtered.map((cmd, i) => (
                <li key={cmd.id}>
                  <button
                    type="button"
                    data-testid="command-item"
                    className={
                      i === selectedIndex
                        ? 'cmdpalette-item cmdpalette-item-active'
                        : 'cmdpalette-item'
                    }
                    onMouseEnter={() => {
                      setSelectedIndex(i);
                    }}
                    onClick={() => {
                      onRun?.(cmd.id);
                      cmd.action();
                      onClose();
                    }}
                  >
                    {cmd.label}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Footer — keyboard hint row. */}
        <div className="cmdpalette-footer">
          <span>{t('commandPalette.navigate')}</span>
          <span>{t('commandPalette.select')}</span>
          <span>{t('commandPalette.dismiss')}</span>
        </div>
      </div>
    </>
  );
}
