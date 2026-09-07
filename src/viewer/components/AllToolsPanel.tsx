// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary. The PDFluent application is free to use,
// including for commercial purposes. Redistribution, or extraction or reuse
// of its components (including the embedded PDF engine), requires a licence.
// See https://pdfluent.com/license for terms.

import { isTauriRuntime } from '../../lib/tauri-detection';
import { useEffect, useRef, useState } from 'react';
import { XIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { ViewerMode } from '../types';
import { TOOLS_BY_MODE, MODE_LABELS } from '../tools/toolDefinitions';
import type { ToolDefinition } from '../tools/toolDefinitions';
import { getWiredTools } from '../tools/wiredTools';
import { useFocusTrap } from '../hooks/useFocusTrap';

interface AllToolsPanelProps {
  isOpen: boolean;
  onClose: () => void;
  onModeSelect: (mode: ViewerMode) => void;
  /**
   * Open the right-hand panel a tile names, when it names one.
   *
   * A tile used to do nothing but switch mode, so "PDF/A" left the user on the
   * convert panel and "Watermark" on the protect panel -- close enough to read
   * as wired, and never the tool the tile is named after.
   */
  onOpenPanel?: (panel: string) => void;
}

type ToolTab = 'alle' | 'bewerken' | 'converteren' | 'ondertekenen';

const TABS: { id: ToolTab; labelKey: string }[] = [
  { id: 'alle',         labelKey: 'allTools.tabAll' },
  { id: 'bewerken',     labelKey: 'allTools.tabEdit' },
  { id: 'converteren',  labelKey: 'allTools.tabConvert' },
  { id: 'ondertekenen', labelKey: 'allTools.tabSign' },
];

/** Which modes appear under each tab filter. 'alle' shows everything. */
const TAB_MODE_MAP: Record<ToolTab, ViewerMode[]> = {
  alle:         ['read', 'review', 'edit', 'sign', 'organize', 'forms', 'protect', 'convert'],
  bewerken:     ['edit', 'review', 'organize'],
  converteren:  ['convert', 'read'],
  ondertekenen: ['sign'],
};

const MODES: ViewerMode[] = ['read', 'review', 'edit', 'sign', 'organize', 'forms', 'protect', 'convert'];

const isTauri = isTauriRuntime();

export function AllToolsPanel({ isOpen, onClose, onModeSelect, onOpenPanel }: AllToolsPanelProps) {
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState<ToolTab>('alle');
  const wiredTools = getWiredTools(isTauri);
  const dialogRef = useRef<HTMLDivElement>(null);
  useFocusTrap(dialogRef, isOpen);

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

  const visibleModes = TAB_MODE_MAP[activeTab];

  return (
    <>
      {/* Backdrop — uses the shared app-dialog-backdrop so dismiss feels
          consistent with every other overlay in the editor. */}
      <div
        className="alltools-backdrop"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Sliding panel from left */}
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label={t('modes.allTools')}
        className="alltools-panel"
      >
        {/* Tab bar */}
        <div className="flex border-b border-border bg-background shrink-0 overflow-x-auto">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`px-4 py-3 text-sm font-medium whitespace-nowrap border-b-2 transition-colors ${
                activeTab === tab.id
                  ? 'border-primary text-foreground'
                  : 'border-transparent text-muted-foreground hover:text-foreground hover:bg-muted/50'
              }`}
            >
              {t(tab.labelKey)}
            </button>
          ))}
        </div>

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-border">
          <h2 className="text-base font-semibold text-foreground">
            {t(TABS.find((tb) => tb.id === activeTab)?.labelKey ?? 'modes.allTools')}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="settings-dialog-close"
            aria-label={t('allTools.close')}
          >
            <XIcon aria-hidden="true" />
          </button>
        </div>

        {/* Tools list */}
        <div className="flex-1 overflow-y-auto">
          <nav className="py-2" aria-label="Tools">
            {MODES.filter((m) => visibleModes.includes(m)).map((modeId) => {
              const allTools: ToolDefinition[] = TOOLS_BY_MODE[modeId].flat();
              // A tile is shown only when the register proves that something in
              // this shell performs its tool. Greying the rest out was the older
              // answer and it invited the click anyway, off a list that had been
              // wrong for months; a tool the app cannot do is simply not offered.
              const tools = allTools.filter(t => wiredTools.has(t.label));
              if (tools.length === 0) return null;
              return (
                <div key={modeId}>
                  <div className="px-5 pt-4 pb-1">
                    <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                      {t(MODE_LABELS[modeId])}
                    </span>
                  </div>
                  {tools.map((tool, idx) => {
                    const Icon = tool.icon;
                    return (
                      <button
                        key={`${modeId}-${idx}`}
                        data-testid={`all-tools-${tool.label}`}
                        onClick={() => {
                          if (tool.opensPanel !== undefined) onOpenPanel?.(tool.opensPanel);
                          else onModeSelect(modeId);
                          onClose();
                        }}
                        className="w-full flex items-center gap-4 px-5 py-3 text-left transition-colors group hover:bg-muted/60"
                      >
                        <div className={`shrink-0 ${tool.color ?? 'text-muted-foreground'}`}>
                          <Icon className="w-5 h-5" />
                        </div>
                        <span className="text-sm text-foreground group-hover:text-foreground font-medium">
                          {t(tool.label)}
                        </span>
                      </button>
                    );
                  })}
                </div>
              );
            })}
          </nav>
        </div>
      </div>
    </>
  );
}
