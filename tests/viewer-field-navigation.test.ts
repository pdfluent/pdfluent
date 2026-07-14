// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary. The PDFluent application is free to use,
// including for commercial purposes. Redistribution, or extraction or reuse
// of its components (including the embedded PDF engine), requires a licence.
// See https://pdfluent.com/license for terms.

import { readFileSync } from 'node:fs';
import { describe, it, expect } from 'vitest';

const toolbarSource = readFileSync(
  new URL('../src/viewer/components/ModeToolbar.tsx', import.meta.url),
  'utf8'
);

const viewerAppSource = [
  '../src/viewer/hooks/usePageNavigation.ts',
  '../src/viewer/hooks/useZoomControls.ts',
  '../src/viewer/hooks/useSidebarState.ts',
  '../src/viewer/hooks/useUndoRedo.ts',
  '../src/viewer/hooks/useSearch.ts',
  '../src/viewer/hooks/useFormFields.ts',
  '../src/viewer/hooks/useModeManager.ts',
  '../src/viewer/hooks/useDocumentLifecycle.ts',
  '../src/viewer/hooks/useCommands.ts',
  '../src/viewer/hooks/useDragDrop.ts',
  '../src/viewer/ViewerSidePanels.tsx',
  '../src/viewer/hooks/useAnnotations.ts',
  '../src/viewer/hooks/useTextInteraction.ts',
  '../src/viewer/hooks/useKeyboardShortcuts.ts',
  '../src/viewer/ViewerApp.tsx',
  '../src/viewer/v3/EditorV3Shell.tsx',
  '../src/viewer/WelcomeSection.tsx',
].map(p => readFileSync(new URL(p, import.meta.url), 'utf8')).join('\n\n');

const shellBlockStart = viewerAppSource.indexOf('<EditorV3Shell');
const shellBlockEnd = viewerAppSource.indexOf('>\n          {docLoading', shellBlockStart);
const shellBlock = viewerAppSource.slice(shellBlockStart, shellBlockEnd);

// ---------------------------------------------------------------------------
// Locate the field-nav block in ModeToolbar for scoped assertions
// ---------------------------------------------------------------------------

const navBlockStart = toolbarSource.indexOf('data-testid="field-nav"');
const navBlockEnd   = toolbarSource.indexOf('</div>\n        </>\n      )}', navBlockStart) + 30;
const navBlock      = toolbarSource.slice(navBlockStart, navBlockEnd);

// ---------------------------------------------------------------------------
// Control rendering in forms mode
// ---------------------------------------------------------------------------

describe('ModeToolbar — field nav: rendering', () => {
  it('renders field-nav block only in forms mode', () => {
    expect(toolbarSource).toContain("mode === 'forms' && formFields.length > 0");
  });

  it('renders data-testid="field-nav"', () => {
    expect(toolbarSource).toContain('data-testid="field-nav"');
  });

  it('renders field-prev-btn', () => {
    expect(toolbarSource).toContain('data-testid="field-prev-btn"');
  });

  it('renders field-next-btn', () => {
    expect(toolbarSource).toContain('data-testid="field-next-btn"');
  });

  it('renders field-nav-counter', () => {
    expect(toolbarSource).toContain('data-testid="field-nav-counter"');
  });

  it('shows — / n counter when no field is selected', () => {
    expect(toolbarSource).toContain('`— / ${formFields.length}`');
  });

  it('shows idx+1 / n counter when a field is selected', () => {
    expect(toolbarSource).toContain('`${activeFieldIdx + 1} / ${formFields.length}`');
  });

});

// ---------------------------------------------------------------------------
// Props interface
// ---------------------------------------------------------------------------

describe('ModeToolbar — field nav: props', () => {
  it('imports FormField type from core/document', () => {
    expect(toolbarSource).toContain('FormField');
    expect(toolbarSource).toContain("from '../../core/document'");
  });

  it('declares formFields prop as FormField[]', () => {
    expect(toolbarSource).toContain('formFields: FormField[]');
  });

  it('declares activeFieldIdx prop as number', () => {
    expect(toolbarSource).toContain('activeFieldIdx: number');
  });

  it('declares onFieldNav prop', () => {
    expect(toolbarSource).toContain('onFieldNav: (idx: number) => void');
  });
});

// ---------------------------------------------------------------------------
// Disabled states at bounds
// ---------------------------------------------------------------------------

describe('ModeToolbar — field nav: disabled states', () => {
  it('prev button disabled when activeFieldIdx <= 0', () => {
    expect(navBlock).toContain('disabled={activeFieldIdx <= 0}');
  });

  it('next button disabled when at end of list', () => {
    expect(navBlock).toContain('disabled={formFields.length === 0 || activeFieldIdx >= formFields.length - 1}');
  });
});

// ---------------------------------------------------------------------------
// Navigation click handlers
// ---------------------------------------------------------------------------

describe('ModeToolbar — field nav: click handlers', () => {
  it('prev button calls onFieldNav with clamped idx - 1', () => {
    expect(navBlock).toContain('onFieldNav(Math.max(0, activeFieldIdx - 1))');
  });

  it('next button calls onFieldNav(0) on first click (activeFieldIdx < 0)', () => {
    expect(navBlock).toContain('activeFieldIdx < 0 ? 0 :');
  });

  it('next button calls onFieldNav with clamped idx + 1', () => {
    expect(navBlock).toContain('Math.min(formFields.length - 1, activeFieldIdx + 1)');
  });
});

// ---------------------------------------------------------------------------
// ViewerApp — handleFieldNav
// ---------------------------------------------------------------------------

const fieldNavFnStart = viewerAppSource.indexOf('handleFieldNav');
const fieldNavFnEnd   = viewerAppSource.indexOf('}, [formFields]);', fieldNavFnStart) + 16;
const fieldNavFnBody  = viewerAppSource.slice(fieldNavFnStart, fieldNavFnEnd);

describe('ViewerApp — field nav: handleFieldNav', () => {
  it('defines handleFieldNav with useCallback', () => {
    expect(viewerAppSource).toContain('handleFieldNav');
    expect(viewerAppSource).toContain('useCallback');
  });

  it('calls setActiveFieldIdx(idx)', () => {
    expect(fieldNavFnBody).toContain('setActiveFieldIdx(idx)');
  });

  it('jumps to the field page via setPageIndex', () => {
    expect(fieldNavFnBody).toContain('setPageIndex(');
    expect(fieldNavFnBody).toContain('formFields[idx]');
    expect(fieldNavFnBody).toContain('.pageIndex');
  });

  it('guards against out-of-bounds idx', () => {
    expect(fieldNavFnBody).toContain('idx >= 0 && idx < formFields.length');
  });

  it('depends on [formFields]', () => {
    expect(fieldNavFnBody).toContain('}, [formFields])');
  });
});

// ---------------------------------------------------------------------------
// ViewerApp — state and wiring
// ---------------------------------------------------------------------------

describe('ViewerApp — field nav: state', () => {
  it('declares activeFieldIdx state initialized to -1', () => {
    expect(viewerAppSource).toContain('activeFieldIdx, setActiveFieldIdx] = useState(-1)');
  });

  it('resets activeFieldIdx to -1 when a new document loads', () => {
    expect(viewerAppSource).toContain('setActiveFieldIdx(-1)');
  });

  it('passes formFields to EditorV3Shell', () => {
    expect(shellBlock).toContain('formFields={formFields}');
  });

  it('passes activeFieldIdx to EditorV3Shell', () => {
    expect(shellBlock).toContain('activeFieldIdx={activeFieldIdx}');
  });

  it('passes onFieldSelect={handleFieldNav} to EditorV3Shell', () => {
    expect(shellBlock).toContain('onFieldSelect={handleFieldNav}');
  });
});

// ---------------------------------------------------------------------------
// No regressions — comment nav still intact
// ---------------------------------------------------------------------------

describe('ModeToolbar — field nav: comment nav regressions', () => {
  it('comment-nav block still present', () => {
    expect(toolbarSource).toContain('data-testid="comment-nav"');
  });

  it('comment-prev-btn still present', () => {
    expect(toolbarSource).toContain('data-testid="comment-prev-btn"');
  });

  it('comment-next-btn still present', () => {
    expect(toolbarSource).toContain('data-testid="comment-next-btn"');
  });

  it('field nav appears before comment nav in source', () => {
    const fieldNavIdx   = toolbarSource.indexOf("mode === 'forms' && formFields.length > 0");
    const commentNavIdx = toolbarSource.indexOf("mode === 'review' && comments.length > 0");
    expect(fieldNavIdx).toBeGreaterThan(-1);
    expect(commentNavIdx).toBeGreaterThan(-1);
    expect(fieldNavIdx).toBeLessThan(commentNavIdx);
  });

  it('read mode zoom display still present', () => {
    expect(toolbarSource).toContain('data-testid="toolbar-zoom-display"');
  });
});

describe('ViewerApp — field nav: comment nav regressions', () => {
  it('activeCommentIdx state still present', () => {
    expect(viewerAppSource).toContain('activeCommentIdx');
  });

  it('handleCommentNav still defined', () => {
    expect(viewerAppSource).toContain('handleCommentNav');
  });

  it('onCommentSelect still passed to EditorV3Shell', () => {
    expect(shellBlock).toContain('onCommentSelect={handleCommentNav}');
  });
});
