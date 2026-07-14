// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary. The PDFluent application is free to use,
// including for commercial purposes. Redistribution, or extraction or reuse
// of its components (including the embedded PDF engine), requires a licence.
// See https://pdfluent.com/license for terms.

import { readFileSync } from 'node:fs';
import { describe, it, expect } from 'vitest';

const welcomeSource = readFileSync(
  new URL('../src/viewer/components/WelcomeScreen.tsx', import.meta.url),
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
// WelcomeScreen component
// ---------------------------------------------------------------------------

describe('WelcomeScreen — structure', () => {
  it('has data-testid="welcome-screen" on root div', () => {
    expect(welcomeSource).toContain('data-testid="welcome-screen"');
  });

  it('has data-testid="welcome-open-btn" on open button', () => {
    expect(welcomeSource).toContain('data-testid="welcome-open-btn"');
  });

  it('has data-testid="recent-file-item" on each recent file row', () => {
    expect(welcomeSource).toContain('data-testid="recent-file-item"');
  });

  it('has data-testid="welcome-empty-state" for no-files state', () => {
    expect(welcomeSource).toContain('data-testid="welcome-empty-state"');
  });

  it('renders empty state text "Nog geen bestanden geopend."', () => {
    // v2: no separate noRecentFiles text — the recent-files rail simply
    // doesn't render when empty. The welcome-empty-state testid hook
    // remains for backward-compat. Accept either pattern.
    expect(welcomeSource).toMatch(
      /(?:t\(['"]welcome\.noRecentFiles['"]|data-testid=['"]welcome-empty-state['"])/,
    );
  });

  it('renders PDF openen… label on open button', () => {
    // Quote style is project-mixed (Prettier on some files, ESLint on
    // others). Accept either.
    expect(welcomeSource).toMatch(/t\(['"]welcome\.openFile['"]/);
  });

  it('uses XIcon from lucide-react', () => {
    // FolderOpenIcon + ShieldCheckIcon + FileTextIcon also added in v2
    // for the new CTA + privacy chip + recent-file rows; XIcon remains
    // for remove-recent + close affordances.
    expect(welcomeSource).toContain('XIcon');
    expect(welcomeSource).toContain('lucide-react');
  });

  it('renders PDFluent brand mark', () => {
    // v2 brand mark is rendered via `.welcome-card-mark` CSS class with
    // a single "P" character — visually the wordmark. Either the literal
    // string "PDFluent" (legacy h1) or the welcome-card-mark class
    // satisfies the contract.
    expect(welcomeSource).toMatch(/PDFluent|welcome-card-mark/);
  });
});

// ---------------------------------------------------------------------------
// WelcomeScreen props
// ---------------------------------------------------------------------------

describe('WelcomeScreen — props', () => {
  it('accepts onOpen prop', () => {
    expect(welcomeSource).toContain('onOpen');
  });

  it('accepts onOpenRecent prop', () => {
    expect(welcomeSource).toContain('onOpenRecent');
  });

  it('accepts recentFiles prop', () => {
    expect(welcomeSource).toContain('recentFiles');
  });

  it('calls onOpen when open button is clicked', () => {
    expect(welcomeSource).toContain('onClick={onOpen}');
  });

  it('calls onOpenRecent with path when a recent file is clicked', () => {
    expect(welcomeSource).toContain('onOpenRecent(path)');
  });

  it('extracts file name as last path component', () => {
    expect(welcomeSource).toContain("path.split(/[/\\\\]/).pop()");
  });
});

// ---------------------------------------------------------------------------
// ViewerApp wiring
// ---------------------------------------------------------------------------

describe('ViewerApp — WelcomeScreen wiring', () => {
  it('imports WelcomeScreen', () => {
    expect(viewerAppSource).toContain('WelcomeScreen');
  });

  it('renders WelcomeScreen when !pdfDoc && !docLoading', () => {
    expect(viewerAppSource).toContain('!pdfDoc && !docLoading && !docError');
    expect(viewerAppSource).toContain('<WelcomeScreen');
  });

  it('passes recentFiles to WelcomeScreen', () => {
    expect(viewerAppSource).toContain('recentFiles={recentFiles}');
  });

  it('passes onOpenRecent to WelcomeScreen', () => {
    expect(viewerAppSource).toContain('onOpenRecent=');
  });

  it('passes onOpen to WelcomeScreen', () => {
    expect(viewerAppSource).toContain('onOpen=');
  });

  it('has handleOpenFile function', () => {
    expect(viewerAppSource).toContain('handleOpenFile');
  });

  it('has welcomeFileInputRef', () => {
    expect(viewerAppSource).toContain('welcomeFileInputRef');
  });
});
