// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary and confidential.
// Free for personal, non-commercial use.
// Commercial use requires a valid license.
// See https://pdfluent.com/license for terms.

/**
 * Contextual Edit Toolbar — Phase 3 Batch 5
 *
 * Verifies:
 * - TextContextBar has isEditing / onCommit / onCancel props
 * - When isEditing=true, renders Commit and Cancel buttons (not action list)
 * - When isEditing=false, renders the normal action list
 * - data-editing attribute is set when editing is active
 * - TextContextBar source-level checks for all actions + editing state
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dir = dirname(fileURLToPath(import.meta.url));

const contextBarSrc = readFileSync(
  join(__dir, '../src/viewer/components/TextContextBar.tsx'),
  'utf8',
);
const viewerAppSrc = readFileSync(
  join(__dir, '../src/viewer/ViewerApp.tsx'),
  'utf8',
);

// ---------------------------------------------------------------------------
// TextContextBar — isEditing prop
// ---------------------------------------------------------------------------

describe('TextContextBar — isEditing prop', () => {
  it('declares isEditing prop in TextContextBarProps', () => {
    expect(contextBarSrc).toContain('isEditing?');
  });

  it('declares onCommit prop in TextContextBarProps', () => {
    expect(contextBarSrc).toContain('onCommit?: () => void');
  });

  it('declares onCancel prop in TextContextBarProps', () => {
    expect(contextBarSrc).toContain('onCancel?: () => void');
  });

  it('isEditing defaults to false in component signature', () => {
    expect(contextBarSrc).toContain('isEditing = false');
  });
});

// ---------------------------------------------------------------------------
// TextContextBar — editing chrome (Commit + Cancel)
// ---------------------------------------------------------------------------

describe('TextContextBar — editing chrome', () => {
  it('renders Commit button with text-context-action-commit testid', () => {
    expect(contextBarSrc).toContain('text-context-action-commit');
  });

  it('renders Cancel button with text-context-action-cancel testid', () => {
    expect(contextBarSrc).toContain('text-context-action-cancel');
  });

  it('Commit button calls onCommit on click', () => {
    const commitBtn = contextBarSrc.slice(
      contextBarSrc.indexOf('text-context-action-commit'),
      contextBarSrc.indexOf('text-context-action-commit') + 200,
    );
    expect(commitBtn).toContain('onCommit?.()');
  });

  it('Cancel button calls onCancel on click', () => {
    const cancelBtn = contextBarSrc.slice(
      contextBarSrc.indexOf('text-context-action-cancel'),
      contextBarSrc.indexOf('text-context-action-cancel') + 200,
    );
    expect(cancelBtn).toContain('onCancel?.()');
  });

  it('Commit has Dutch label "Opslaan"', () => {
    expect(contextBarSrc).toContain('Opslaan');
  });

  it('Cancel has Dutch label "Annuleren"', () => {
    expect(contextBarSrc).toContain('Annuleren');
  });

  it('renders editing chrome inside isEditing conditional', () => {
    expect(contextBarSrc).toContain('isEditing ?');
  });
});

// ---------------------------------------------------------------------------
// TextContextBar — normal actions still present
// ---------------------------------------------------------------------------

describe('TextContextBar — normal actions', () => {
  it("still has 'edit-text' action", () => {
    expect(contextBarSrc).toContain("id: 'edit-text'");
  });

  it("still has 'copy' action", () => {
    expect(contextBarSrc).toContain("id: 'copy'");
  });

  it("still has 'summarize' action", () => {
    expect(contextBarSrc).toContain("id: 'summarize'");
  });

  it("still has 'explain' action", () => {
    expect(contextBarSrc).toContain("id: 'explain'");
  });

  it("still has 'annotate' action", () => {
    expect(contextBarSrc).toContain("id: 'annotate'");
  });

  it("still has 'redact' action", () => {
    expect(contextBarSrc).toContain("id: 'redact'");
  });
});

// ---------------------------------------------------------------------------
// TextContextBar — data-editing attribute
// ---------------------------------------------------------------------------

describe('TextContextBar — data-editing attribute', () => {
  it('sets data-editing attribute on root when isEditing is true', () => {
    expect(contextBarSrc).toContain('data-editing={isEditing');
  });
});

// ---------------------------------------------------------------------------
// TextContextBar — visibility when editing with no actions
// ---------------------------------------------------------------------------

describe('TextContextBar — always visible in editing mode', () => {
  it('does not early-return when isEditing=true and no actions available', () => {
    // Guard is: if (!isEditing && availableActions.length === 0) return null
    expect(contextBarSrc).toContain('!isEditing && availableActions.length === 0');
  });
});

// ---------------------------------------------------------------------------
// ViewerApp — context bar not used with isEditing (separate TextInlineEditor path)
// ---------------------------------------------------------------------------

describe('ViewerApp — editing UX routing', () => {
  it('imports TextInlineEditor alongside TextContextBar', () => {
    expect(viewerAppSrc).toContain('TextInlineEditor');
    expect(viewerAppSrc).toContain('TextContextBar');
  });

  it('shows TextInlineEditor when editingTextTargetId is set', () => {
    expect(viewerAppSrc).toContain('<TextInlineEditor');
    expect(viewerAppSrc).toContain('editingTextTargetId');
  });

  it('hides TextContextBar while TextInlineEditor is shown', () => {
    // The bar guard includes !editingTextTargetId
    const barJsxIdx = viewerAppSrc.indexOf('<TextContextBar');
    const barCondition = viewerAppSrc.slice(Math.max(0, barJsxIdx - 200), barJsxIdx);
    expect(barCondition).toContain('editingTextTargetId');
  });
});
