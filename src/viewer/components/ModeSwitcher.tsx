// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary and confidential.
// Free for personal, non-commercial use.
// Commercial use requires a valid license.
// See https://pdfluent.com/license for terms.

import {
  LayoutGridIcon,
  BookOpenIcon,
  MessageSquareIcon,
  PencilIcon,
  ShieldIcon,
  RefreshCwIcon,
  FileInputIcon,
  LayoutIcon,
} from 'lucide-react';
import type { ViewerMode } from '../types';

interface ModeSwitcherProps {
  mode: ViewerMode;
  onChange: (m: ViewerMode) => void;
  onOpenAllTools: () => void;
}

interface ModeTab {
  id: ViewerMode | 'all';
  label: string;
  icon: React.ReactNode;
}

const TABS: ModeTab[] = [
  { id: 'all', label: 'Alle tools', icon: <LayoutGridIcon className="w-3.5 h-3.5" /> },
  { id: 'read', label: 'Lezen', icon: <BookOpenIcon className="w-3.5 h-3.5" /> },
  { id: 'review', label: 'Beoordelen', icon: <MessageSquareIcon className="w-3.5 h-3.5" /> },
  { id: 'edit', label: 'Bewerken', icon: <PencilIcon className="w-3.5 h-3.5" /> },
  { id: 'organize', label: 'Indelen', icon: <LayoutIcon className="w-3.5 h-3.5" /> },
  { id: 'forms', label: 'Formulieren', icon: <FileInputIcon className="w-3.5 h-3.5" /> },
  { id: 'protect', label: 'Beveiligen', icon: <ShieldIcon className="w-3.5 h-3.5" /> },
  { id: 'convert', label: 'Converteren', icon: <RefreshCwIcon className="w-3.5 h-3.5" /> },
];

export function ModeSwitcher({ mode, onChange, onOpenAllTools }: ModeSwitcherProps) {
  return (
    <div className="flex items-center border-b border-border bg-background shrink-0 px-2 overflow-x-auto">
      {TABS.map((tab) => {
        const isAll = tab.id === 'all';
        const isActive = !isAll && tab.id === mode;

        return (
          <button
            key={tab.id}
            onClick={() => {
              if (isAll) {
                onOpenAllTools();
              } else {
                onChange(tab.id as ViewerMode);
              }
            }}
            className={[
              'flex items-center gap-1.5 px-3 py-2 text-xs font-medium whitespace-nowrap border-b-2 transition-colors shrink-0',
              isActive
                ? 'border-primary text-primary bg-primary/5'
                : 'border-transparent text-muted-foreground hover:text-foreground hover:bg-muted/50',
            ].join(' ')}
            title={tab.label}
          >
            {tab.icon}
            <span>{tab.label}</span>
          </button>
        );
      })}
    </div>
  );
}
