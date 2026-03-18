// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary and confidential.
// Free for personal, non-commercial use.
// Commercial use requires a valid license.
// See https://pdfluent.com/license for terms.

import type { RefObject } from 'react';
import { useTranslation } from 'react-i18next';
import { WelcomeScreen } from './components/WelcomeScreen';

interface WelcomeSectionProps {
  welcomeFileInputRef: RefObject<HTMLInputElement | null>;
  handleLoadDocument: (source: string | ArrayBuffer) => Promise<void>;
  handleOpenFile: () => void;
  removeRecentFile: (path: string) => void;
  clearRecentFiles: () => void;
  recentFiles: string[];
}

export function WelcomeSection({
  welcomeFileInputRef,
  handleLoadDocument,
  handleOpenFile,
  removeRecentFile,
  clearRecentFiles,
  recentFiles,
}: WelcomeSectionProps) {
  const { t } = useTranslation();
  return (
    <div
      data-testid="viewer-empty-state"
      className="absolute inset-0 flex flex-col overflow-hidden"
    >
      {/* Hidden file input for browser-mode open from WelcomeScreen */}
      <input
        ref={welcomeFileInputRef}
        type="file"
        accept=".pdf"
        style={{ display: 'none' }}
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (!file) return;
          const reader = new FileReader();
          reader.onload = (ev) => {
            const buf = ev.target?.result;
            if (buf instanceof ArrayBuffer) void handleLoadDocument(buf);
          };
          reader.readAsArrayBuffer(file);
        }}
      />
      <WelcomeScreen
        onOpen={() => { void handleOpenFile(); }}
        onOpenRecent={(path) => { void handleLoadDocument(path); }}
        onRemoveRecent={removeRecentFile}
        onClearRecent={clearRecentFiles}
        recentFiles={recentFiles}
      />
      {/* Recent files list — also accessible from the command palette */}
      {recentFiles.length > 0 && (
        <div
          className="hidden"
          data-testid="recent-files-list"
        >
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide text-center mb-1">
            {t('welcome.recentFiles')}
          </p>
          {recentFiles.map(path => {
            const name = path.split(/[/\\]/).pop() ?? path;
            return (
              <button
                key={path}
                onClick={() => { void handleLoadDocument(path); }}
                title={path}
                className="text-left text-sm text-foreground hover:text-primary hover:bg-muted/50 px-3 py-1.5 rounded-md transition-colors truncate"
                data-testid="recent-file-entry"
              >
                {name}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
