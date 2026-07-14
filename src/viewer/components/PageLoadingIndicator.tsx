// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary. The PDFluent application is free to use,
// including for commercial purposes. Redistribution, or extraction or reuse
// of its components (including the embedded PDF engine), requires a licence.
// See https://pdfluent.com/license for terms.

import { memo } from 'react';

interface PageLoadingIndicatorProps {
  variant: 'overlay' | 'badge';
  label: string;
}

export const PageLoadingIndicator = memo(function PageLoadingIndicator({
  variant,
  label,
}: PageLoadingIndicatorProps) {
  const isOverlay = variant === 'overlay';

  return (
    <div
      role="status"
      aria-live="polite"
      aria-label={label}
      data-testid={isOverlay ? 'page-loading-overlay' : 'page-loading-badge'}
      style={{
        position: 'absolute',
        zIndex: 42,
        pointerEvents: 'none',
        ...(isOverlay
          ? {
              inset: 0,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              background: 'rgba(255,255,255,0.72)',
              backdropFilter: 'blur(1.5px)',
            }
          : {
              top: 12,
              right: 12,
            }),
      }}
    >
      <div
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 10,
          minHeight: isOverlay ? 40 : 30,
          padding: isOverlay ? '8px 12px' : '5px 9px',
          borderRadius: 8,
          color: 'var(--foreground, #111111)',
          background: isOverlay ? 'rgba(255,255,255,0.88)' : 'rgba(255,255,255,0.84)',
          border: '1px solid rgba(0,0,0,0.12)',
          boxShadow: isOverlay
            ? '0 12px 28px rgba(0,0,0,0.10)'
            : '0 8px 20px rgba(0,0,0,0.10)',
        }}
      >
        <svg
          width={isOverlay ? 22 : 18}
          height={isOverlay ? 22 : 18}
          viewBox="0 0 48 48"
          fill="none"
          aria-hidden="true"
          focusable="false"
          style={{ display: 'block', flex: '0 0 auto' }}
        >
          <circle
            cx="24"
            cy="24"
            r="17"
            stroke="currentColor"
            strokeWidth="4"
            opacity="0.16"
          />
          <path
            d="M41 24a17 17 0 0 1-17 17"
            stroke="currentColor"
            strokeWidth="4"
            strokeLinecap="round"
          >
            <animateTransform
              attributeName="transform"
              type="rotate"
              from="0 24 24"
              to="360 24 24"
              dur="0.82s"
              repeatCount="indefinite"
            />
          </path>
          <path
            d="M24 7a17 17 0 0 1 14.7 8.5"
            stroke="currentColor"
            strokeWidth="4"
            strokeLinecap="round"
            opacity="0.55"
          >
            <animateTransform
              attributeName="transform"
              type="rotate"
              from="0 24 24"
              to="360 24 24"
              dur="0.82s"
              repeatCount="indefinite"
            />
          </path>
        </svg>
        <span
          style={{
            fontSize: isOverlay ? 12 : 11,
            lineHeight: 1,
            fontWeight: 500,
            letterSpacing: 0,
            whiteSpace: 'nowrap',
          }}
        >
          {label}
        </span>
      </div>
    </div>
  );
});
