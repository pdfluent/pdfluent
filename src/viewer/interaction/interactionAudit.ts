// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary and confidential.
// Free for personal, non-commercial use.
// Commercial use requires a valid license.
// See https://pdfluent.com/license for terms.

/**
 * Structured inventory of interactive UI areas and their current interaction
 * state coverage.
 *
 * This file is documentation-as-code: it drives the interaction architecture
 * roadmap and is used at runtime to surface gaps.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type InteractionStateKind =
  | 'hover'
  | 'focus'
  | 'active'
  | 'selected'
  | 'disabled';

export type InteractionGapSeverity = 'critical' | 'important' | 'nice-to-have';

export interface ComponentInteractionCoverage {
  /** Component / area name for human reference. */
  name: string;
  /** Import path relative to src/viewer/. */
  sourcePath: string;
  /** Interaction states the component currently exposes. */
  covered: ReadonlyArray<InteractionStateKind>;
  /** States absent or only partially implemented. */
  gaps: ReadonlyArray<InteractionStateKind>;
  /** How severe each gap is — parallel array to `gaps`. */
  gapSeverity: ReadonlyArray<InteractionGapSeverity>;
  /** Notes on current implementation. */
  notes?: string;
}

// ---------------------------------------------------------------------------
// Audit map
// ---------------------------------------------------------------------------

export const INTERACTION_AUDIT: ReadonlyArray<ComponentInteractionCoverage> = [
  {
    name: 'AnnotationOverlay',
    sourcePath: 'components/AnnotationOverlay.tsx',
    covered: ['hover', 'selected'],
    gaps: ['focus', 'active', 'disabled'],
    gapSeverity: ['important', 'nice-to-have', 'nice-to-have'],
    notes:
      'Local hoveredMarkId state per-component; selectedAnnotationId prop drives outline. ' +
      'No keyboard focus ring. Cursor is pointer everywhere — should differentiate by type.',
  },
  {
    name: 'PageCanvas',
    sourcePath: 'components/PageCanvas.tsx',
    covered: ['active'],
    gaps: ['hover', 'focus', 'selected', 'disabled'],
    gapSeverity: ['critical', 'important', 'important', 'nice-to-have'],
    notes:
      'Active draw state managed locally via dragStart/dragCurrent. ' +
      'Cursor set ad-hoc from activeAnnotationTool switch. ' +
      'No unified hover detection for text blocks or annotations.',
  },
  {
    name: 'ModeToolbar',
    sourcePath: 'components/ModeToolbar.tsx',
    covered: ['hover', 'focus', 'active', 'disabled'],
    gaps: ['selected'],
    gapSeverity: ['nice-to-have'],
    notes:
      'Tailwind hover:/focus:/disabled: utilities applied consistently. ' +
      'Active tool button lacks a visual "selected" ring distinct from hover.',
  },
  {
    name: 'LeftNavRail',
    sourcePath: 'components/LeftNavRail.tsx',
    covered: ['hover', 'active', 'disabled'],
    gaps: ['focus', 'selected'],
    gapSeverity: ['important', 'nice-to-have'],
    notes:
      'Panel tab active state uses bg-accent. ' +
      'No visible keyboard focus ring on icon buttons. ' +
      'thumbnail buttons missing explicit selected outline.',
  },
  {
    name: 'RightContextPanel — Comments section',
    sourcePath: 'components/RightContextPanel.tsx',
    covered: ['hover', 'focus'],
    gaps: ['selected', 'active', 'disabled'],
    gapSeverity: ['important', 'nice-to-have', 'nice-to-have'],
    notes:
      'Comment item hover via hover:bg-muted/50. ' +
      'No selected-comment outline (keyboard nav target). ' +
      'Bulk action buttons have no disabled visual distinct from enabled.',
  },
  {
    name: 'RightContextPanel — Forms section',
    sourcePath: 'components/RightContextPanel.tsx',
    covered: ['hover', 'focus', 'active'],
    gaps: ['selected', 'disabled'],
    gapSeverity: ['important', 'important'],
    notes:
      'field-value-input has focus:ring. ' +
      'No visual "focused field" highlight on the field-item row. ' +
      'submit button disabled state is present but not styled distinctly.',
  },
  {
    name: 'RightContextPanel — Redaction section',
    sourcePath: 'components/RightContextPanel.tsx',
    covered: ['hover'],
    gaps: ['focus', 'active', 'selected', 'disabled'],
    gapSeverity: ['important', 'nice-to-have', 'important', 'critical'],
    notes:
      'apply-redactions-btn has no disabled state when redaction list is empty — ' +
      'it must be disabled with clear visual feedback.',
  },
  {
    name: 'RightContextPanel — OCR section',
    sourcePath: 'components/RightContextPanel.tsx',
    covered: ['hover', 'disabled'],
    gaps: ['focus', 'active', 'selected'],
    gapSeverity: ['important', 'nice-to-have', 'nice-to-have'],
    notes:
      'run-ocr-btn shows loading state via spinner. ' +
      'Language/scope selects lack focus ring on all browsers.',
  },
  {
    name: 'TopBar',
    sourcePath: 'components/TopBar.tsx',
    covered: ['hover', 'disabled'],
    gaps: ['focus', 'active', 'selected'],
    gapSeverity: ['important', 'nice-to-have', 'nice-to-have'],
    notes:
      'Save/close buttons have hover states. ' +
      'No keyboard focus ring on icon buttons. ' +
      'Document title input has no "edited" state marker.',
  },
  {
    name: 'WelcomeScreen',
    sourcePath: 'components/WelcomeScreen.tsx',
    covered: ['hover', 'focus'],
    gaps: ['active', 'selected', 'disabled'],
    gapSeverity: ['nice-to-have', 'nice-to-have', 'nice-to-have'],
    notes:
      'Open button and recent file items have hover states. ' +
      'No active-press feedback on open button.',
  },
  {
    name: 'ModeSwitcher',
    sourcePath: 'components/ModeSwitcher.tsx',
    covered: ['hover', 'active'],
    gaps: ['focus', 'selected', 'disabled'],
    gapSeverity: ['important', 'important', 'nice-to-have'],
    notes:
      'Active mode tab uses border-primary underline. ' +
      'No explicit :focus-visible ring on mode tabs. ' +
      'Disabled modes not yet expressed (all modes currently enabled).',
  },
  {
    name: 'OrganizeGrid',
    sourcePath: 'components/OrganizeGrid.tsx',
    covered: ['hover', 'active', 'selected'],
    gaps: ['focus', 'disabled'],
    gapSeverity: ['important', 'important'],
    notes:
      'Page thumbnails use ring-2 ring-primary for selection. ' +
      'Action buttons (extract, delete) have no disabled visual when no pages selected.',
  },
  {
    name: 'CommandPalette',
    sourcePath: 'components/CommandPalette.tsx',
    covered: ['hover', 'focus', 'active'],
    gaps: ['selected', 'disabled'],
    gapSeverity: ['important', 'nice-to-have'],
    notes:
      'Keyboard-active item should show selected highlight distinct from hover.',
  },
  {
    name: 'ShortcutSheet',
    sourcePath: 'components/ShortcutSheet.tsx',
    covered: ['hover'],
    gaps: ['focus', 'active', 'selected', 'disabled'],
    gapSeverity: ['nice-to-have', 'nice-to-have', 'nice-to-have', 'nice-to-have'],
    notes: 'Read-only sheet — interaction states not critical.',
  },
  {
    name: 'SettingsPanel',
    sourcePath: 'components/SettingsPanel.tsx',
    covered: ['hover', 'focus'],
    gaps: ['active', 'selected', 'disabled'],
    gapSeverity: ['nice-to-have', 'nice-to-have', 'nice-to-have'],
    notes:
      'Settings inputs have focus:ring-1 focus:ring-primary. ' +
      'No unsaved-changes indicator (active edit state).',
  },
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Return all areas that have a gap of the given severity. */
export function getGapsByseverity(
  severity: InteractionGapSeverity,
): ReadonlyArray<ComponentInteractionCoverage> {
  return INTERACTION_AUDIT.filter(entry =>
    entry.gapSeverity.some((s, i) => s === severity && entry.gaps[i] !== undefined),
  );
}

/** Return all critical interaction gaps as a flat list of {area, gap} pairs. */
export function getCriticalGaps(): ReadonlyArray<{ area: string; gap: InteractionStateKind }> {
  const result: Array<{ area: string; gap: InteractionStateKind }> = [];
  for (const entry of INTERACTION_AUDIT) {
    entry.gaps.forEach((gap, i) => {
      if (entry.gapSeverity[i] === 'critical') {
        result.push({ area: entry.name, gap });
      }
    });
  }
  return result;
}

/** Compute a coverage score (0–1) for a component. */
export function coverageScore(entry: ComponentInteractionCoverage): number {
  const total = entry.covered.length + entry.gaps.length;
  return total === 0 ? 1 : entry.covered.length / total;
}
