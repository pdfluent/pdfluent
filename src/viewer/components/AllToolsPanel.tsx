// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary and confidential.
// Free for personal, non-commercial use.
// Commercial use requires a valid license.
// See https://pdfluent.com/license for terms.

import { useEffect } from 'react';
import { XIcon } from 'lucide-react';
import type { ViewerMode } from '../types';
import { TOOLS_BY_MODE, MODE_LABELS } from '../tools/toolDefinitions';

interface AllToolsPanelProps {
  isOpen: boolean;
  onClose: () => void;
  onModeSelect: (mode: ViewerMode) => void;
}

const MODES: ViewerMode[] = ['read', 'review', 'edit', 'organize', 'forms', 'protect', 'convert'];

export function AllToolsPanel({ isOpen, onClose, onModeSelect }: AllToolsPanelProps) {
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
        className="fixed inset-0 bg-black/40 z-40"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Panel */}
      <div
        role="dialog"
        aria-label="Alle tools"
        className="fixed left-1/2 top-[8vh] -translate-x-1/2 w-full max-w-2xl max-h-[80vh] bg-background border border-border rounded-xl shadow-2xl z-50 flex flex-col overflow-hidden"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-border shrink-0">
          <h2 className="text-sm font-semibold text-foreground">Alle tools</h2>
          <button
            onClick={onClose}
            aria-label="Sluit alle tools"
            className="p-1 text-muted-foreground hover:text-foreground rounded transition-colors"
          >
            <XIcon className="w-4 h-4" />
          </button>
        </div>

        {/* Tool browser — scrollable */}
        <div className="overflow-y-auto flex-1 px-5 py-4 space-y-5">
          {MODES.map((modeId) => (
            <section key={modeId}>
              <h3 className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground mb-2">
                {MODE_LABELS[modeId]}
              </h3>
              <div className="flex flex-wrap gap-1.5">
                {TOOLS_BY_MODE[modeId].flat().map((tool) => (
                  <button
                    key={`${modeId}-${tool.label}`}
                    onClick={() => { onModeSelect(modeId); onClose(); }}
                    title={tool.label}
                    className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs text-foreground bg-muted/50 hover:bg-muted border border-border transition-colors"
                  >
                    <tool.icon className="w-3.5 h-3.5 shrink-0" />
                    {tool.label}
                  </button>
                ))}
              </div>
            </section>
          ))}
        </div>

        {/* Footer hint */}
        <div className="px-5 py-2 border-t border-border shrink-0">
          <span className="text-[10px] text-muted-foreground/50">Esc sluiten</span>
        </div>
      </div>
    </>
  );
}
