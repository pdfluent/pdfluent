// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary. The PDFluent application is free to use,
// including for commercial purposes. Redistribution, or extraction or reuse
// of its components (including the embedded PDF engine), requires a licence.
// See https://pdfluent.com/license for terms.

import { isTauriRuntime } from '../../lib/tauri-detection';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import {
  BookOpenIcon,
  ChevronDownIcon,
  DownloadIcon,
  FileInputIcon,
  FileSignatureIcon,
  LayoutGridIcon,
  MessageSquareIcon,
  MoreHorizontalIcon,
  PencilIcon,
  PenLineIcon,
  RefreshCwIcon,
  ShieldIcon,
  type LucideIcon,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { ViewerMode } from '../types';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface ModeSwitcherProps {
  mode: ViewerMode;
  onChange: (m: ViewerMode) => void;
  /** Disables all tab clicks (e.g. while a heavy IPC mutation is in flight). */
  disabled?: boolean;
  /**
   * Mode-specific tools rendered in the thin bar directly beneath the
   * tabs. Pass the appropriate composition (e.g. <ReadContextualBar />)
   * from the host. Empty/undefined collapses the row entirely so the
   * document gets the saved ~40 px back — quietness by default.
   */
  contextual?: ReactNode;
  /**
   * Opens the Adobe-style "All tools" index panel. Rendered as the
   * left-most entry in the tab strip (matching Acrobat's "Alle tools").
   */
  onOpenAllTools?: () => void;
}

interface ModeTab {
  id: ViewerMode;
  labelKey: string;
  Icon: LucideIcon;
}

// ---------------------------------------------------------------------------
// Tab configurations per runtime
// ---------------------------------------------------------------------------

/**
 * Browser-test: four primary tabs matching the scope of the lightweight
 * non-Tauri harness. Mirrors the Adobe online layout:
 *   Read → Edit → Convert → Sign
 *
 * Review is not a primary tab in browser — comments/annotations are
 * accessible from the right panel while in Edit mode (read-only outside Tauri).
 * Protect and Organize require the native Tauri backend and stay
 * desktop-only.
 */
const BROWSER_TEST_TABS: ModeTab[] = [
  { id: 'read',    labelKey: 'modes.read',        Icon: BookOpenIcon },
  { id: 'edit',    labelKey: 'modes.editContent', Icon: PencilIcon },
  { id: 'convert', labelKey: 'modes.convert',     Icon: RefreshCwIcon },
  { id: 'sign',    labelKey: 'modes.sign',        Icon: PenLineIcon },
];

/**
 * Tauri/desktop: four primary tabs for daily workflows. Power features
 * stay in the "More" popover so forms and signatures are no longer
 * conflated.
 */
const TAURI_PRIMARY_TABS: ModeTab[] = [
  { id: 'read',   labelKey: 'modes.read',           Icon: BookOpenIcon },
  { id: 'review', labelKey: 'modes.reviewAnnotate', Icon: MessageSquareIcon },
  { id: 'edit',   labelKey: 'modes.editContent',    Icon: PencilIcon },
  { id: 'sign',   labelKey: 'modes.sign',           Icon: FileSignatureIcon },
];

/**
 * "More" overflow: modes that are powerful but not everyday starting
 * points. Shown in a popover below the More button in Tauri.
 */
const MORE_TABS: ModeTab[] = [
  { id: 'organize', labelKey: 'modes.organize', Icon: LayoutGridIcon },
  { id: 'forms',    labelKey: 'modes.forms',    Icon: FileInputIcon },
  { id: 'protect',  labelKey: 'modes.protect',  Icon: ShieldIcon },
  { id: 'convert',  labelKey: 'modes.convert',  Icon: RefreshCwIcon },
];

const isTauri = isTauriRuntime();

/** True when the active mode lives in the "More" overflow group. */
function isMoreMode(m: ViewerMode): boolean {
  return MORE_TABS.some((t) => t.id === m);
}

// ---------------------------------------------------------------------------
// ModeSwitcher
// ---------------------------------------------------------------------------

export function ModeSwitcher({
  mode,
  onChange,
  disabled = false,
  contextual,
  onOpenAllTools,
}: ModeSwitcherProps) {
  const { t } = useTranslation();
  const [moreOpen, setMoreOpen] = useState(false);
  const moreRef = useRef<HTMLDivElement | null>(null);

  // Close the More popover when clicking outside it or pressing Escape.
  // Keeps the tab strip predictable — popover doesn't linger.
  useEffect(() => {
    if (!moreOpen) return;

    function handlePointerDown(event: PointerEvent) {
      if (moreRef.current && !moreRef.current.contains(event.target as Node)) {
        setMoreOpen(false);
      }
    }
    function handleKey(event: KeyboardEvent) {
      if (event.key === 'Escape') setMoreOpen(false);
    }

    document.addEventListener('pointerdown', handlePointerDown);
    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
      document.removeEventListener('keydown', handleKey);
    };
  }, [moreOpen]);

  // Close the More popover when mode changes to a primary tab.
  useEffect(() => {
    if (!isMoreMode(mode)) setMoreOpen(false);
  }, [mode]);

  const primaryTabs = isTauri ? TAURI_PRIMARY_TABS : BROWSER_TEST_TABS;
  const hasContextual = Boolean(contextual);

  return (
    <div className="mode-bar" data-mode={mode}>
      <div className="mode-tabs" role="tablist" aria-label={t('modes.read')}>
        {onOpenAllTools && (
          <button
            type="button"
            className="mode-tab mode-tab-alltools"
            disabled={disabled}
            onClick={() => { onOpenAllTools(); }}
            title={t('modes.allTools')}
          >
            <LayoutGridIcon aria-hidden="true" />
            <span>{t('modes.allTools')}</span>
          </button>
        )}
        {primaryTabs.map(({ id, labelKey, Icon }) => {
          const isActive = mode === id;
          const label = t(labelKey);
          return (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={isActive}
              aria-controls={`mode-panel-${id}`}
              disabled={disabled}
              onClick={() => { onChange(id); }}
              className={`mode-tab${isActive ? ' mode-tab-active' : ''}`}
              title={label}
            >
              <Icon aria-hidden="true" />
              <span>{label}</span>
            </button>
          );
        })}

        {/* Tauri: "More" overflow popover for Organize / Forms / Protect /
            Convert — modes that are powerful but not everyday entries. */}
        {isTauri && (
          <div className="mode-tab-more" ref={moreRef}>
            <button
              type="button"
              className={`mode-tab${isMoreMode(mode) || moreOpen ? ' mode-tab-active' : ''}`}
              aria-haspopup="menu"
              aria-expanded={moreOpen}
              disabled={disabled}
              onClick={() => { setMoreOpen((open) => !open); }}
              title={t('modes.more')}
            >
              <MoreHorizontalIcon aria-hidden="true" />
              <span>
                {isMoreMode(mode)
                  ? t(MORE_TABS.find((m) => m.id === mode)?.labelKey ?? 'modes.more')
                  : t('modes.more')}
              </span>
              <ChevronDownIcon
                aria-hidden="true"
                style={{
                  transform: moreOpen ? 'rotate(180deg)' : 'none',
                  transition: 'transform var(--pf-dur-fast) var(--pf-ease)',
                }}
              />
            </button>
            {moreOpen && (
              <div className="mode-tab-more-popover" role="menu">
                {MORE_TABS.map((tab) => {
                  const isActive = tab.id === mode;
                  const label = t(tab.labelKey);
                  return (
                    <button
                      key={tab.id}
                      type="button"
                      role="menuitem"
                      className={`mode-tab-more-item${isActive ? ' mode-tab-more-item-active' : ''}`}
                      onClick={() => {
                        onChange(tab.id);
                        setMoreOpen(false);
                      }}
                      title={label}
                    >
                      <tab.Icon aria-hidden="true" />
                      <span>{label}</span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* Browser-test: right-aligned "Get Desktop App" CTA. Keeps the
            cross-platform messaging visible without making it a tab. */}
        {!isTauri && (
          <a
            href="https://pdfluent.com/download"
            target="_blank"
            rel="noopener noreferrer"
            className="mode-tab-cta"
            title={t('modes.getDesktopAppTitle')}
          >
            <DownloadIcon aria-hidden="true" />
            <span>{t('modes.getDesktopApp')}</span>
          </a>
        )}
      </div>

      <div
        id={`mode-panel-${mode}`}
        role="tabpanel"
        className={
          hasContextual
            ? 'mode-contextual'
            : 'mode-contextual mode-contextual-empty'
        }
      >
        {contextual}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Contextual-bar primitives — re-exported so the host can compose its
// own per-mode bars without re-inventing the styling.
// ---------------------------------------------------------------------------

interface ModeContextualActionProps {
  label: string;
  icon?: ReactNode;
  onClick: () => void;
  active?: boolean;
  disabled?: boolean;
}

export function ModeContextualAction({
  label,
  icon,
  onClick,
  active = false,
  disabled = false,
}: ModeContextualActionProps) {
  const className = active
    ? 'mode-contextual-action active'
    : 'mode-contextual-action';
  return (
    <button
      type="button"
      className={className}
      onClick={onClick}
      disabled={disabled}
      aria-pressed={active}
      title={label}
    >
      {icon}
      <span>{label}</span>
    </button>
  );
}

interface ModeContextualCtaProps {
  label: string;
  icon?: ReactNode;
  onClick: () => void;
  disabled?: boolean;
  busy?: boolean;
}

/**
 * Primary action used in Sign mode — visually heavier than a tool
 * toggle. The contextual bar gets exactly one of these at most.
 */
export function ModeContextualCta({
  label,
  icon,
  onClick,
  disabled = false,
  busy = false,
}: ModeContextualCtaProps) {
  return (
    <button
      type="button"
      className="mode-contextual-cta"
      onClick={onClick}
      disabled={disabled || busy}
    >
      {icon}
      <span>{busy ? `${label}…` : label}</span>
    </button>
  );
}

export function ModeContextualSep() {
  return <span className="mode-contextual-sep" aria-hidden="true" />;
}

export default ModeSwitcher;
