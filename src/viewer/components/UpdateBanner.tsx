// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary and confidential.
// Free for personal, non-commercial use.
// Commercial use requires a valid license.
// See https://pdfluent.com/license for terms.

import { XIcon, DownloadIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface UpdateBannerProps {
  isVisible: boolean;
  version: string | null;
  installing: boolean;
  onInstall: () => void;
  onDismiss: () => void;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function UpdateBanner({ isVisible, version, installing, onInstall, onDismiss }: UpdateBannerProps) {
  const { t } = useTranslation();

  if (!isVisible) return null;

  return (
    <div
      data-testid="update-banner"
      className="flex items-center justify-between px-4 py-2 bg-primary/10 border-b border-primary/20 text-sm"
    >
      <div className="flex items-center gap-2 text-foreground">
        <DownloadIcon className="w-3.5 h-3.5 text-primary shrink-0" />
        <span className="font-medium">{t('update.available')}</span>
        {version && (
          <span className="text-muted-foreground">{t('update.version', { version })}</span>
        )}
      </div>
      <div className="flex items-center gap-2">
        <button
          onClick={onInstall}
          disabled={installing}
          className="px-3 py-1 bg-primary text-primary-foreground text-xs font-semibold rounded-md hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {installing ? t('update.installing') : t('update.install')}
        </button>
        <button
          onClick={onDismiss}
          aria-label={t('update.dismiss')}
          className="p-0.5 text-muted-foreground hover:text-foreground rounded transition-colors"
        >
          <XIcon className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
}
