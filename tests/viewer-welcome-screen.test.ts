// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary and confidential.
// Free for personal, non-commercial use.
// Commercial use requires a valid license.
// See https://pdfluent.com/license for terms.

import { readFileSync } from 'node:fs';
import { describe, it, expect } from 'vitest';

const welcomeSource = readFileSync(
  new URL('../src/viewer/components/WelcomeScreen.tsx', import.meta.url),
  'utf8'
);

const viewerAppSource = readFileSync(
  new URL('../src/viewer/ViewerApp.tsx', import.meta.url),
  'utf8'
);

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
    expect(welcomeSource).toContain('Nog geen bestanden geopend.');
  });

  it('renders PDF openen… label on open button', () => {
    expect(welcomeSource).toContain('PDF openen…');
  });

  it('uses LayersIcon from lucide-react', () => {
    expect(welcomeSource).toContain('LayersIcon');
    expect(welcomeSource).toContain('lucide-react');
  });

  it('renders PDFluent wordmark', () => {
    expect(welcomeSource).toContain('PDFluent');
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
