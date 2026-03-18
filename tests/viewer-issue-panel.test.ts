// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary and confidential.
// Free for personal, non-commercial use.
// Commercial use requires a valid license.
// See https://pdfluent.com/license for terms.

import { readFileSync } from 'node:fs';
import { describe, it, expect } from 'vitest';

const issuePanelSource = readFileSync(
  new URL('../src/viewer/components/IssuePanel.tsx', import.meta.url),
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
// IssuePanel — component structure
// ---------------------------------------------------------------------------

describe('IssuePanel — component structure', () => {
  it('exports IssuePanel function', () => {
    expect(issuePanelSource).toContain('export function IssuePanel(');
  });

  it('renders data-testid="issue-panel"', () => {
    expect(issuePanelSource).toContain('data-testid="issue-panel"');
  });

  it('renders data-testid="issue-item" for each issue', () => {
    expect(issuePanelSource).toContain('data-testid="issue-item"');
  });

  it('renders data-testid="issue-page-link" for page navigation', () => {
    expect(issuePanelSource).toContain('data-testid="issue-page-link"');
  });

  it('renders data-testid="issue-open-count"', () => {
    expect(issuePanelSource).toContain('data-testid="issue-open-count"');
  });

  it('renders data-testid="issue-resolved-count"', () => {
    expect(issuePanelSource).toContain('data-testid="issue-resolved-count"');
  });

  it('renders data-testid="issue-status-badge"', () => {
    expect(issuePanelSource).toContain('data-testid="issue-status-badge"');
  });
});

// ---------------------------------------------------------------------------
// IssuePanel — props
// ---------------------------------------------------------------------------

describe('IssuePanel — props', () => {
  it('accepts issues prop', () => {
    const fnStart = issuePanelSource.indexOf('export function IssuePanel(');
    const sig = issuePanelSource.slice(fnStart, fnStart + 300);
    expect(sig).toContain('issues');
  });

  it('accepts onNavigate prop', () => {
    expect(issuePanelSource).toContain('onNavigate');
  });

  it('onNavigate is optional', () => {
    expect(issuePanelSource).toContain('onNavigate?');
  });

  it('onNavigate receives pageIndex and annotationId', () => {
    expect(issuePanelSource).toContain('onNavigate?.(issue.page, issue.annotationId)');
  });
});

// ---------------------------------------------------------------------------
// IssuePanel — reviewer filter
// ---------------------------------------------------------------------------

describe('IssuePanel — reviewer filter', () => {
  it('renders reviewer filter select', () => {
    expect(issuePanelSource).toContain('data-testid="issue-reviewer-filter"');
  });

  it('has "Alle reviewers" default option', () => {
    expect(issuePanelSource).toContain('Alle reviewers');
  });

  it('collects unique reviewer names via useMemo', () => {
    expect(issuePanelSource).toContain('filterReviewer');
    expect(issuePanelSource).toContain('setFilterReviewer');
  });

  it('filters issues by selected reviewer', () => {
    expect(issuePanelSource).toContain('issue.author !== filterReviewer');
  });
});

// ---------------------------------------------------------------------------
// IssuePanel — open / resolved toggle
// ---------------------------------------------------------------------------

describe('IssuePanel — open / resolved display', () => {
  it('renders show-resolved toggle', () => {
    expect(issuePanelSource).toContain('data-testid="issue-show-resolved-toggle"');
  });

  it('showResolved state controls whether resolved issues appear', () => {
    expect(issuePanelSource).toContain('showResolved');
    expect(issuePanelSource).toContain('setShowResolved');
  });

  it('hides resolved issues by default', () => {
    expect(issuePanelSource).toContain("issue.status === 'resolved'");
  });
});

// ---------------------------------------------------------------------------
// IssuePanel — issue data attributes
// ---------------------------------------------------------------------------

describe('IssuePanel — issue data attributes', () => {
  it('issue item has data-status attribute', () => {
    expect(issuePanelSource).toContain('data-status={issue.status}');
  });

  it('issue item has data-source attribute', () => {
    expect(issuePanelSource).toContain('data-source={issue.source}');
  });
});

// ---------------------------------------------------------------------------
// ViewerApp — IssuePanel wiring
// ---------------------------------------------------------------------------

describe('ViewerApp — IssuePanel wiring', () => {
  it('imports IssuePanel', () => {
    expect(viewerAppSource).toContain("from './components/IssuePanel'");
  });

  it('has showIssuePanel state', () => {
    expect(viewerAppSource).toContain('showIssuePanel');
    expect(viewerAppSource).toContain('setShowIssuePanel');
  });

  it('renders IssuePanel with issues={documentIssues}', () => {
    expect(viewerAppSource).toContain('issues={documentIssues}');
  });

  it('renders issue-panel-close-btn', () => {
    expect(viewerAppSource).toContain('issue-panel-close-btn');
  });

  it('close button sets showIssuePanel to false', () => {
    expect(viewerAppSource).toContain('setShowIssuePanel(false)');
  });

  it('IssuePanel onNavigate calls setPageIndex', () => {
    const panelStart = viewerAppSource.indexOf('<IssuePanel');
    const panelEnd = viewerAppSource.indexOf('/>', panelStart) + 2;
    const panelBody = viewerAppSource.slice(panelStart, panelEnd);
    expect(panelBody).toContain('setPageIndex');
  });
});
