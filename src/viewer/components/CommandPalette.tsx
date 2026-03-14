// Copyright (c) 2026 PDFluent B.V. All rights reserved.
//
// This software is proprietary and confidential.
// Free for personal, non-commercial use.
// Commercial use requires a valid license.
// See https://pdfluent.com/license for terms.

import { useEffect, useRef, useState, useMemo } from 'react';
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
}

export function CommandPalette({ isOpen, onClose, commands }: CommandPaletteProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);

  // Refs so the keyboard handler always sees the latest values without re-registering
  const filteredRef = useRef<Command[]>([]);
  const selectedIndexRef = useRef(0);

  const filtered = useMemo(() => {
    if (!query.trim()) return commands;
    const q = query.toLowerCase();
    return commands.filter(cmd =>
      cmd.label.toLowerCase().includes(q) ||
      cmd.keywords?.some(k => k.toLowerCase().includes(q))
    );
  }, [commands, query]);

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
        if (cmd) { cmd.action(); onClose(); }
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
            placeholder="Zoek opdrachten…"
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
          {filtered.length === 0 ? (
            <div className="px-4 py-8 text-center">
              <p className="text-sm text-muted-foreground">Geen opdrachten gevonden.</p>
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
                    onClick={() => { cmd.action(); onClose(); }}
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
          <span className="text-[10px] text-muted-foreground/50">↑↓ navigeren</span>
          <span className="text-[10px] text-muted-foreground/50">↵ selecteren</span>
          <span className="text-[10px] text-muted-foreground/50">Esc sluiten</span>
        </div>
      </div>
    </>
  );
}
