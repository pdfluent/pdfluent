// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary and confidential.
// Free for personal, non-commercial use.
// Commercial use requires a valid license.
// See https://pdfluent.com/license for terms.

import { LayersIcon, XIcon } from 'lucide-react';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface WelcomeScreenProps {
  onOpen: () => void;
  onOpenRecent: (path: string) => void;
  onRemoveRecent: (path: string) => void;
  onClearRecent: () => void;
  recentFiles: string[];
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function WelcomeScreen({ onOpen, onOpenRecent, onRemoveRecent, onClearRecent, recentFiles }: WelcomeScreenProps) {
  return (
    <div
      data-testid="welcome-screen"
      className="h-full flex flex-col items-center justify-center gap-6 p-8"
    >
      {/* Wordmark */}
      <div className="flex items-center gap-2">
        <LayersIcon className="w-8 h-8 text-primary" />
        <span className="text-2xl font-bold text-foreground tracking-tight">PDFluent</span>
      </div>

      {/* Open button */}
      <button
        data-testid="welcome-open-btn"
        onClick={onOpen}
        className="px-6 py-2.5 bg-primary text-primary-foreground text-sm font-semibold rounded-lg hover:opacity-90 transition-opacity"
      >
        PDF openen…
      </button>

      {/* Recent files */}
      {recentFiles.length > 0 ? (
        <div className="w-full max-w-sm flex flex-col gap-1 overflow-y-auto max-h-64">
          <div className="flex items-center justify-between mb-1">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
              Recent geopend
            </p>
            <button
              data-testid="welcome-clear-recent-btn"
              onClick={onClearRecent}
              className="text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              Wis alles
            </button>
          </div>
          {recentFiles.map(path => {
            const fileName = path.split(/[/\\]/).pop() ?? path;
            return (
              <div
                key={path}
                data-testid="recent-file-item"
                className="group flex items-center gap-1 rounded-md hover:bg-muted/50 transition-colors"
              >
                <button
                  data-testid="recent-file-open-btn"
                  onClick={() => { onOpenRecent(path); }}
                  title={path}
                  className="flex-1 text-left px-3 py-2 min-w-0"
                >
                  <p className="text-sm font-medium text-foreground truncate">{fileName}</p>
                  <p className="text-xs text-muted-foreground truncate">{path}</p>
                </button>
                <button
                  data-testid="recent-file-remove-btn"
                  onClick={(e) => { e.stopPropagation(); onRemoveRecent(path); }}
                  title="Verwijderen uit lijst"
                  className="shrink-0 p-1.5 mr-1 opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-foreground transition-opacity"
                  aria-label="Verwijder uit recente bestanden"
                >
                  <XIcon className="w-3 h-3" />
                </button>
              </div>
            );
          })}
        </div>
      ) : (
        <p
          data-testid="welcome-empty-state"
          className="text-sm text-muted-foreground"
        >
          Nog geen bestanden geopend.
        </p>
      )}
    </div>
  );
}
