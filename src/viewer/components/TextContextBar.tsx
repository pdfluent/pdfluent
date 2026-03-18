// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary and confidential.
// Free for personal, non-commercial use.
// Commercial use requires a valid license.
// See https://pdfluent.com/license for terms.

/**
 * TextContextBar
 *
 * A small floating action bar that appears above a hovered or selected
 * text target. Exposes quick actions: annotate, redact, copy, summarize,
 * explain.
 *
 * Phase 2 scope:
 * - UI trigger + routing only.
 * - Deep action implementations (AI summarise, redaction pipeline) are
 *   handled by the existing systems the actions delegate to.
 *
 * Positioning: absolute within the page canvas coordinate space.
 * The bar appears above the target rect to avoid covering the text.
 *
 * Integrates with contextActions (Phase 1) to fire triggers when
 * the user clicks an action.
 */

import { memo } from 'react';
import { useTranslation } from 'react-i18next';
import type { TextParagraphTarget, TextRect } from '../text/textInteractionModel';
import { pdfRectToDom } from '../text/textInteractionModel';
import { viewerActionRegistry } from '../interaction/contextActions';
import type { ViewerMode } from '../types';
import type { TextEditabilityResult } from '../text/textEditability';

// ---------------------------------------------------------------------------
// Action definitions
// ---------------------------------------------------------------------------

export type TextContextActionId =
  | 'edit-text'
  | 'annotate'
  | 'redact'
  | 'copy'
  | 'summarize'
  | 'explain';

export interface TextContextAction {
  id: TextContextActionId;
  label: string;
  /** Icon character or emoji — placeholder until icon library is finalised. */
  icon: string;
  /** Whether this action is available in the given mode. */
  availableIn: ReadonlyArray<ViewerMode>;
}

export const TEXT_CONTEXT_ACTIONS: ReadonlyArray<TextContextAction> = [
  {
    id: 'edit-text',
    label: 'textContext.editText',
    icon: '✏',
    availableIn: ['edit'],
  },
  {
    id: 'annotate',
    label: 'textContext.annotate',
    icon: '✏️',
    availableIn: ['review', 'edit'],
  },
  {
    id: 'redact',
    label: 'textContext.redact',
    icon: '⬛',
    availableIn: ['protect', 'edit'],
  },
  {
    id: 'copy',
    label: 'textContext.copy',
    icon: '📋',
    availableIn: ['read', 'review', 'edit', 'protect', 'forms'],
  },
  {
    id: 'summarize',
    label: 'textContext.summarize',
    icon: '📝',
    availableIn: ['read', 'review', 'edit'],
  },
  {
    id: 'explain',
    label: 'textContext.explain',
    icon: '💡',
    availableIn: ['read', 'review', 'edit'],
  },
];

// ---------------------------------------------------------------------------
// Bar positioning
// ---------------------------------------------------------------------------

/**
 * Gap between the top of the target rect and the bottom of the context bar (DOM px).
 */
const BAR_OFFSET_PX = 6;

/** Estimated bar height in pixels (used to clamp to page top). */
const BAR_HEIGHT_PX = 32;

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface TextContextBarProps {
  /** The paragraph this bar is anchored to. */
  target: TextParagraphTarget;
  /** Current viewer mode — determines which actions are available. */
  mode: ViewerMode;
  pageHeightPt: number;
  zoom: number;
  /** Called when the user clicks an action button. */
  onAction: (actionId: TextContextActionId, target: TextParagraphTarget) => void;
  /**
   * Editability result for the target.
   * When provided, the "edit-text" action is shown disabled with a tooltip
   * explaining why editing is unavailable.
   */
  editability?: TextEditabilityResult | null;
  /**
   * When true, the toolbar switches to editing chrome:
   * shows Commit and Cancel buttons instead of the normal action list.
   */
  isEditing?: boolean;
  /** Called when the user clicks Commit in editing mode. */
  onCommit?: () => void;
  /** Called when the user clicks Cancel in editing mode. */
  onCancel?: () => void;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export const TextContextBar = memo(function TextContextBar({
  target,
  mode,
  pageHeightPt,
  zoom,
  onAction,
  editability = null,
  isEditing = false,
  onCommit,
  onCancel,
}: TextContextBarProps) {
  const { t } = useTranslation();
  const domRect = pdfRectToDom(target.rect, pageHeightPt, zoom);
  const availableActions = TEXT_CONTEXT_ACTIONS.filter(a => a.availableIn.includes(mode));

  // In editing mode, always show; in normal mode, hide if no actions available
  if (!isEditing && availableActions.length === 0) return null;

  // Position bar above the target rect, clamped to at least 0
  const barTop = Math.max(0, domRect.top - BAR_HEIGHT_PX - BAR_OFFSET_PX);
  const barLeft = domRect.left;

  return (
    <div
      data-testid="text-context-bar"
      data-editing={isEditing || undefined}
      style={{
        position: 'absolute',
        top: barTop,
        left: barLeft,
        display: 'flex',
        flexDirection: 'row',
        alignItems: 'center',
        gap: 2,
        background: 'var(--background, #fff)',
        border: '1px solid var(--border, #e2e8f0)',
        borderRadius: 6,
        boxShadow: '0 2px 8px rgba(0,0,0,0.12)',
        padding: '2px 4px',
        height: BAR_HEIGHT_PX,
        zIndex: 50,
        pointerEvents: 'auto',
        userSelect: 'none',
        whiteSpace: 'nowrap',
      }}
    >
      {isEditing ? (
        // Editing chrome: Commit + Cancel
        <>
          <button
            data-testid="text-context-action-cancel"
            title={t('textContext.cancelEsc')}
            onClick={(e) => { e.stopPropagation(); onCancel?.(); }}
            style={{
              fontSize: 11,
              padding: '2px 8px',
              height: 22,
              border: '1px solid var(--border, #e2e8f0)',
              borderRadius: 4,
              background: 'transparent',
              cursor: 'pointer',
              color: 'var(--muted-foreground, #64748b)',
            }}
          >
            {t('common.cancel')}
          </button>
          <button
            data-testid="text-context-action-commit"
            title={t('textContext.saveCmdEnter')}
            onClick={(e) => { e.stopPropagation(); onCommit?.(); }}
            style={{
              fontSize: 11,
              padding: '2px 8px',
              height: 22,
              border: 'none',
              borderRadius: 4,
              background: 'var(--primary, #2563eb)',
              color: '#fff',
              cursor: 'pointer',
              fontWeight: 500,
            }}
          >
            {t('common.save')}
          </button>
        </>
      ) : (
        availableActions.map(action => {
          // "edit-text" is disabled when the target is not editable
          const isDisabled = action.id === 'edit-text' && editability !== null && editability.status !== 'editable';
          const title = isDisabled ? (editability?.label ?? t(action.label)) : t(action.label);
          return (
            <button
              key={action.id}
              data-testid={`text-context-action-${action.id}`}
              data-editability-status={action.id === 'edit-text' ? (editability?.status ?? 'unknown') : undefined}
              title={title}
              disabled={isDisabled}
              onClick={(e) => {
                e.stopPropagation();
                if (isDisabled) return;
                // Fire context action via Phase 1 registry
                viewerActionRegistry.fire('text:selected', {
                  kind: 'text-selection',
                  text: target.lines.flatMap(l => l.spans.map(s => s.text)).join(' '),
                  pageIndex: parseInt(target.id.slice(1, target.id.indexOf(':')), 10) || 0,
                  rects: [target.rect],
                });
                onAction(action.id, target);
              }}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: 24,
                height: 24,
                border: 'none',
                background: 'transparent',
                borderRadius: 4,
                cursor: isDisabled ? 'not-allowed' : 'pointer',
                fontSize: 13,
                padding: 0,
                color: isDisabled ? 'var(--muted-foreground, #94a3b8)' : 'var(--foreground, #1a1a1a)',
                opacity: isDisabled ? 0.5 : 1,
                transition: 'background 0.1s',
              }}
              onMouseEnter={e => {
                if (!isDisabled) {
                  (e.currentTarget as HTMLButtonElement).style.background = 'var(--muted, #f1f5f9)';
                }
              }}
              onMouseLeave={e => {
                (e.currentTarget as HTMLButtonElement).style.background = 'transparent';
              }}
            >
              {action.icon}
            </button>
          );
        })
      )}
    </div>
  );
});

// ---------------------------------------------------------------------------
// Visibility helper
// ---------------------------------------------------------------------------

/**
 * Return whether the TextContextBar should be visible for the given
 * mode and target combination.
 *
 * The bar requires a selected paragraph and full interaction level.
 */
export function shouldShowContextBar(
  mode: ViewerMode,
  selectedParagraph: TextParagraphTarget | null,
): boolean {
  if (!selectedParagraph) return false;
  // Only show in modes that have at least one available action
  return TEXT_CONTEXT_ACTIONS.some(a => a.availableIn.includes(mode));
}

// ---------------------------------------------------------------------------
// Rect accessor for tests / positioning
// ---------------------------------------------------------------------------

export function getBarDomPosition(
  targetRect: TextRect,
  pageHeightPt: number,
  zoom: number,
): { top: number; left: number } {
  const domRect = pdfRectToDom(targetRect, pageHeightPt, zoom);
  return {
    top: Math.max(0, domRect.top - BAR_HEIGHT_PX - BAR_OFFSET_PX),
    left: domRect.left,
  };
}
