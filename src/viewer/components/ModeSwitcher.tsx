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
import { useTranslation } from 'react-i18next';
import type { ViewerMode } from '../types';

interface ModeSwitcherProps {
  mode: ViewerMode;
  onChange: (m: ViewerMode) => void;
  onOpenAllTools: () => void;
}

interface ModeTab {
  id: ViewerMode | 'all';
  labelKey: string;
  icon: React.ReactNode;
}

const TABS: ModeTab[] = [
  { id: 'all', labelKey: 'modes.allTools', icon: <LayoutGridIcon className="w-3.5 h-3.5" /> },
  { id: 'read', labelKey: 'modes.read', icon: <BookOpenIcon className="w-3.5 h-3.5" /> },
  { id: 'review', labelKey: 'modes.review', icon: <MessageSquareIcon className="w-3.5 h-3.5" /> },
  { id: 'edit', labelKey: 'modes.edit', icon: <PencilIcon className="w-3.5 h-3.5" /> },
  { id: 'organize', labelKey: 'modes.organize', icon: <LayoutIcon className="w-3.5 h-3.5" /> },
  { id: 'forms', labelKey: 'modes.forms', icon: <FileInputIcon className="w-3.5 h-3.5" /> },
  { id: 'protect', labelKey: 'modes.protect', icon: <ShieldIcon className="w-3.5 h-3.5" /> },
  { id: 'convert', labelKey: 'modes.convert', icon: <RefreshCwIcon className="w-3.5 h-3.5" /> },
];

export function ModeSwitcher({ mode, onChange, onOpenAllTools }: ModeSwitcherProps) {
  const { t } = useTranslation();
  return (
    <div className="flex items-center border-b border-border bg-background shrink-0 px-2 overflow-x-auto">
      {TABS.map((tab) => {
        const isAll = tab.id === 'all';
        const isActive = !isAll && tab.id === mode;
        const label = t(tab.labelKey);

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
            title={label}
          >
            {tab.icon}
            <span>{label}</span>
          </button>
        );
      })}
    </div>
  );
}
