// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary and confidential.
// Free for personal, non-commercial use.
// Commercial use requires a valid license.
// See https://pdfluent.com/license for terms.

import { useEffect, useRef } from 'react';

// ---------------------------------------------------------------------------
// Preset definitions — only levels reachable by the step buttons are listed,
// plus common intermediate values users reach for deliberately.
// ---------------------------------------------------------------------------

export const ZOOM_PRESETS: ReadonlyArray<{ label: string; value: number }> = [
  { label: '50%',  value: 0.5  },
  { label: '75%',  value: 0.75 },
  { label: '100%', value: 1.0  },
  { label: '125%', value: 1.25 },
  { label: '150%', value: 1.5  },
  { label: '200%', value: 2.0  },
];

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface ZoomPresetsPopoverProps {
  isOpen: boolean;
  onClose: () => void;
  onZoomChange: (zoom: number) => void;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function ZoomPresetsPopover({ isOpen, onClose, onZoomChange }: ZoomPresetsPopoverProps) {
  // Stable ref so the Escape listener always calls the latest onClose
  const onCloseRef = useRef(onClose);
  useEffect(() => { onCloseRef.current = onClose; });

  // Close on Escape
  useEffect(() => {
    if (!isOpen) return;
    function handleKey(e: KeyboardEvent): void {
      if (e.key === 'Escape') onCloseRef.current();
    }
    window.addEventListener('keydown', handleKey);
    return () => { window.removeEventListener('keydown', handleKey); };
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <>
      {/* Backdrop — transparent so the page stays visible; closes on outside click */}
      <div
        className="fixed inset-0 z-40"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Preset list — positioned above the floating zoom control */}
      <div
        data-testid="zoom-presets-popover"
        role="menu"
        className="fixed bottom-20 right-6 z-50 bg-background border border-border rounded-lg shadow-lg overflow-hidden"
      >
        {ZOOM_PRESETS.map(preset => (
          <button
            key={preset.value}
            data-testid="zoom-preset-option"
            role="menuitem"
            onClick={() => { onZoomChange(preset.value); onClose(); }}
            className="w-full text-left px-4 py-1.5 text-xs text-foreground hover:bg-muted transition-colors"
          >
            {preset.label}
          </button>
        ))}
      </div>
    </>
  );
}
