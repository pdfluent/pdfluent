// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary and confidential.
// Free for personal, non-commercial use.
// Commercial use requires a valid license.
// See https://pdfluent.com/license for terms.

import { readFileSync } from 'node:fs';
import { describe, it, expect } from 'vitest';

const panelSource = readFileSync(
  new URL('../src/viewer/components/RightContextPanel.tsx', import.meta.url),
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
  '../src/viewer/WelcomeSection.tsx',
].map(p => readFileSync(new URL(p, import.meta.url), 'utf8')).join('\n\n');

// ---------------------------------------------------------------------------
// RightContextPanel — redaction props
// ---------------------------------------------------------------------------

describe('RightContextPanel — redaction props interface', () => {
  it('declares redactions prop as optional Annotation array', () => {
    const ifaceStart = panelSource.indexOf('interface RightContextPanelProps');
    const ifaceEnd = panelSource.indexOf('\n}', ifaceStart) + 2;
    const iface = panelSource.slice(ifaceStart, ifaceEnd);
    expect(iface).toContain('redactions?:');
  });

  it('declares onApplyRedactions optional callback', () => {
    const ifaceStart = panelSource.indexOf('interface RightContextPanelProps');
    const ifaceEnd = panelSource.indexOf('\n}', ifaceStart) + 2;
    const iface = panelSource.slice(ifaceStart, ifaceEnd);
    expect(iface).toContain('onApplyRedactions?:');
  });

  it('declares onDeleteRedaction optional callback', () => {
    const ifaceStart = panelSource.indexOf('interface RightContextPanelProps');
    const ifaceEnd = panelSource.indexOf('\n}', ifaceStart) + 2;
    const iface = panelSource.slice(ifaceStart, ifaceEnd);
    expect(iface).toContain('onDeleteRedaction?:');
  });

  it('declares onJumpToRedaction optional callback', () => {
    const ifaceStart = panelSource.indexOf('interface RightContextPanelProps');
    const ifaceEnd = panelSource.indexOf('\n}', ifaceStart) + 2;
    const iface = panelSource.slice(ifaceStart, ifaceEnd);
    expect(iface).toContain('onJumpToRedaction?:');
  });
});

// ---------------------------------------------------------------------------
// RightContextPanel — RedactionPanel component
// ---------------------------------------------------------------------------

describe('RightContextPanel — RedactionPanel component', () => {
  // Use the placeholder-sections comment as the end boundary (follows RedactionPanel).
  function redactionPanelBody(): string {
    const fnStart = panelSource.indexOf('function RedactionPanel(');
    const fnEnd = panelSource.indexOf('// Placeholder sections for modes not yet wired', fnStart);
    return panelSource.slice(fnStart, fnEnd);
  }

  it('defines RedactionPanel function', () => {
    expect(panelSource).toContain('function RedactionPanel(');
  });

  it('renders data-testid="redaction-panel" container', () => {
    expect(redactionPanelBody()).toContain('data-testid="redaction-panel"');
  });

  it('renders apply-redactions-btn', () => {
    expect(redactionPanelBody()).toContain('data-testid="apply-redactions-btn"');
  });

  it('apply button calls onApplyRedactions', () => {
    expect(redactionPanelBody()).toContain('onApplyRedactions?.()');
  });

  it('renders redaction-list-item for each redaction', () => {
    expect(redactionPanelBody()).toContain('data-testid="redaction-list-item"');
  });

  it('each list item shows page number', () => {
    expect(redactionPanelBody()).toContain('r.pageIndex');
  });

  it('clicking a list item calls onJumpToRedaction', () => {
    expect(redactionPanelBody()).toContain('onJumpToRedaction?.(r.pageIndex)');
  });

  it('renders delete-redaction-btn per item', () => {
    expect(redactionPanelBody()).toContain('data-testid="delete-redaction-btn"');
  });

  it('delete button calls onDeleteRedaction with annotation id', () => {
    expect(redactionPanelBody()).toContain('onDeleteRedaction?.(r.id)');
  });

  it('shows empty state when redactions list is empty', () => {
    expect(redactionPanelBody()).toContain("t('rightPanel.noRedactions')");
  });
});

// ---------------------------------------------------------------------------
// RightContextPanel — Redigeringen section in review mode
// ---------------------------------------------------------------------------

describe('RightContextPanel — Redigeringen section in review mode', () => {
  it('renders a Redigeringen CollapsibleSection in review mode', () => {
    const reviewStart = panelSource.indexOf("mode === 'review'");
    const reviewEnd = panelSource.indexOf("mode === 'forms'", reviewStart);
    const reviewBlock = panelSource.slice(reviewStart, reviewEnd);
    expect(reviewBlock).toContain("t('rightPanel.redactions')");
  });

  it('passes redactions prop to RedactionPanel', () => {
    const reviewStart = panelSource.indexOf("mode === 'review'");
    const reviewEnd = panelSource.indexOf("mode === 'forms'", reviewStart);
    const reviewBlock = panelSource.slice(reviewStart, reviewEnd);
    expect(reviewBlock).toContain('redactions={redactions}');
  });

  it('passes onApplyRedactions to RedactionPanel', () => {
    const reviewStart = panelSource.indexOf("mode === 'review'");
    const reviewEnd = panelSource.indexOf("mode === 'forms'", reviewStart);
    const reviewBlock = panelSource.slice(reviewStart, reviewEnd);
    expect(reviewBlock).toContain('onApplyRedactions={onApplyRedactions}');
  });

  it('passes onDeleteRedaction to RedactionPanel', () => {
    const reviewStart = panelSource.indexOf("mode === 'review'");
    const reviewEnd = panelSource.indexOf("mode === 'forms'", reviewStart);
    const reviewBlock = panelSource.slice(reviewStart, reviewEnd);
    expect(reviewBlock).toContain('onDeleteRedaction={onDeleteRedaction}');
  });

  it('passes onJumpToRedaction to RedactionPanel', () => {
    const reviewStart = panelSource.indexOf("mode === 'review'");
    const reviewEnd = panelSource.indexOf("mode === 'forms'", reviewStart);
    const reviewBlock = panelSource.slice(reviewStart, reviewEnd);
    expect(reviewBlock).toContain('onJumpToRedaction={onJumpToRedaction}');
  });
});

// ---------------------------------------------------------------------------
// ViewerApp — handleApplyRedactions and redactions state
// ---------------------------------------------------------------------------

describe('ViewerApp — handleApplyRedactions callback', () => {
  it('defines handleApplyRedactions with useCallback', () => {
    expect(viewerAppSource).toContain('const handleApplyRedactions = useCallback(');
  });

  it('calls apply_redactions Tauri command', () => {
    const fnStart = viewerAppSource.indexOf('const handleApplyRedactions = useCallback(');
    const fnEnd = viewerAppSource.indexOf('\n  }, [', fnStart) + 4;
    const fnBody = viewerAppSource.slice(fnStart, fnEnd);
    expect(fnBody).toContain("invoke('apply_redactions')");
  });

  it('calls refetchComments and markDirty after applying', () => {
    const fnStart = viewerAppSource.indexOf('const handleApplyRedactions = useCallback(');
    const fnEnd = viewerAppSource.indexOf('\n  }, [', fnStart) + 4;
    const fnBody = viewerAppSource.slice(fnStart, fnEnd);
    expect(fnBody).toContain('refetchComments()');
    expect(fnBody).toContain('markDirty()');
  });
});

describe('ViewerApp — redactions derived state', () => {
  it('derives redactions from allAnnotations filtered by type redaction', () => {
    expect(viewerAppSource).toContain("a.type === 'redaction'");
    const redactionsIdx = viewerAppSource.indexOf("const redactions = useMemo(");
    expect(redactionsIdx).toBeGreaterThan(-1);
  });

  it('passes redactions to RightContextPanel', () => {
    expect(viewerAppSource).toContain('redactions={redactions}');
  });

  it('passes onApplyRedactions to RightContextPanel', () => {
    expect(viewerAppSource).toContain('onApplyRedactions={handleApplyRedactions}');
  });

  it('passes onDeleteRedaction to RightContextPanel', () => {
    expect(viewerAppSource).toContain('onDeleteRedaction={handleDeleteSelectedAnnotation}');
  });

  it('passes onJumpToRedaction to RightContextPanel', () => {
    expect(viewerAppSource).toContain('onJumpToRedaction={setPageIndex}');
  });
});
