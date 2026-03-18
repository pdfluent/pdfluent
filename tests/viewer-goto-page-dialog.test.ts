// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary and confidential.
// Free for personal, non-commercial use.
// Commercial use requires a valid license.
// See https://pdfluent.com/license for terms.

import { readFileSync } from 'node:fs';
import { describe, it, expect } from 'vitest';

const dialogSource = readFileSync(
  new URL('../src/viewer/components/GoToPageDialog.tsx', import.meta.url),
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

// Slice the go-to-page handler section in ViewerApp for scoped assertions
const handlerStart = viewerAppSource.indexOf('Go-to-page keyboard shortcut');
const handlerEnd   = viewerAppSource.indexOf('// ---------------------------------------------------------------------------\n  // Drag-and-drop', handlerStart);
const handlerBody  = viewerAppSource.slice(handlerStart, handlerEnd);

// ---------------------------------------------------------------------------
// ViewerApp — ⌘G wiring
// ---------------------------------------------------------------------------

describe('ViewerApp — go-to-page dialog: wiring', () => {
  it('imports GoToPageDialog', () => {
    expect(viewerAppSource).toContain("import { GoToPageDialog } from './components/GoToPageDialog'");
  });

  it('tracks goToPageOpen state', () => {
    expect(viewerAppSource).toContain('goToPageOpen');
    expect(viewerAppSource).toContain('setGoToPageOpen');
  });

  it('handleGoToPage opens the dialog', () => {
    expect(handlerBody).toContain('setGoToPageOpen(true)');
  });

  it('mounts GoToPageDialog with isOpen', () => {
    expect(viewerAppSource).toContain('<GoToPageDialog');
    expect(viewerAppSource).toContain('isOpen={goToPageOpen}');
  });

  it('passes pageCount to GoToPageDialog', () => {
    expect(viewerAppSource).toContain('pageCount={pageCount}');
  });

  it('onNavigate wires to setPageIndex', () => {
    expect(viewerAppSource).toContain('onNavigate={(idx) => { setPageIndex(idx); }}');
  });

  it('onClose resets goToPageOpen to false', () => {
    expect(viewerAppSource).toContain('onClose={() => { setGoToPageOpen(false); }}');
  });
});

// ---------------------------------------------------------------------------
// GoToPageDialog — close behavior
// ---------------------------------------------------------------------------

describe('GoToPageDialog — close behavior', () => {
  it('renders nothing when isOpen is false', () => {
    expect(dialogSource).toContain('if (!isOpen) return null');
  });

  it('closes on Escape key', () => {
    expect(dialogSource).toContain("e.key === 'Escape'");
    expect(dialogSource).toContain('onCloseRef.current()');
  });

  it('registers keydown listener only when open', () => {
    expect(dialogSource).toContain('if (!isOpen) return');
    expect(dialogSource).toContain("window.addEventListener('keydown', handleKey)");
    expect(dialogSource).toContain("window.removeEventListener('keydown', handleKey)");
  });

  it('useEffect for Escape depends on [isOpen]', () => {
    expect(dialogSource).toContain('}, [isOpen])');
  });

  it('closes on backdrop click', () => {
    expect(dialogSource).toContain('onClick={onClose}');
    expect(dialogSource).toContain('aria-hidden="true"');
  });

  it('uses stable-ref pattern for onClose', () => {
    expect(dialogSource).toContain('onCloseRef');
    expect(dialogSource).toContain('useEffect(() => { onCloseRef.current = onClose; })');
  });
});

// ---------------------------------------------------------------------------
// GoToPageDialog — auto-focus and reset
// ---------------------------------------------------------------------------

describe('GoToPageDialog — auto-focus and reset', () => {
  it('resets inputValue to empty string on open', () => {
    expect(dialogSource).toContain("setInputValue('')");
  });

  it('auto-focuses the input on open', () => {
    expect(dialogSource).toContain('inputRef.current?.focus()');
  });

  it('focus effect returns early when not open', () => {
    expect(dialogSource).toContain('if (!isOpen) return');
  });
});

// ---------------------------------------------------------------------------
// GoToPageDialog — submission and validation
// ---------------------------------------------------------------------------

describe('GoToPageDialog — submission', () => {
  it('parses the input value as an integer', () => {
    expect(dialogSource).toContain('parseInt(inputValue, 10)');
  });

  it('guards against NaN (invalid input)', () => {
    expect(dialogSource).toContain('isNaN(parsed)');
  });

  it('clamps the value within 1..pageCount using Math.min/Math.max', () => {
    expect(dialogSource).toContain('Math.min(pageCount, Math.max(1, parsed))');
  });

  it('converts 1-based page number to 0-based index for onNavigate', () => {
    expect(dialogSource).toContain('onNavigate(clamped - 1)');
  });

  it('closes after successful navigation', () => {
    expect(dialogSource).toContain('onNavigate(clamped - 1)');
    // onClose() must appear after navigation
    const navIdx = dialogSource.indexOf('onNavigate(clamped - 1)');
    const closeIdx = dialogSource.indexOf('onClose();', navIdx);
    expect(closeIdx).toBeGreaterThan(navIdx);
  });

  it('closes without navigating when input is NaN', () => {
    // NaN branch calls onClose() before returning
    const nanBranch = dialogSource.indexOf('if (isNaN(parsed))');
    const closeInBranch = dialogSource.indexOf('onClose()', nanBranch);
    expect(closeInBranch).toBeGreaterThan(nanBranch);
  });

  it('submits on Enter key', () => {
    expect(dialogSource).toContain("e.key === 'Enter'");
    expect(dialogSource).toContain('submit()');
  });

  it('submit button triggers submit()', () => {
    expect(dialogSource).toContain('onClick={submit}');
  });
});

// ---------------------------------------------------------------------------
// GoToPageDialog — structure and accessibility
// ---------------------------------------------------------------------------

describe('GoToPageDialog — structure', () => {
  it('renders with data-testid="goto-page-dialog"', () => {
    expect(dialogSource).toContain('data-testid="goto-page-dialog"');
  });

  it('renders the input with data-testid="goto-page-input"', () => {
    expect(dialogSource).toContain('data-testid="goto-page-input"');
  });

  it('renders the submit button with data-testid="goto-page-submit"', () => {
    expect(dialogSource).toContain('data-testid="goto-page-submit"');
  });

  it('uses role="dialog" for accessibility', () => {
    expect(dialogSource).toContain('role="dialog"');
  });

  it('has aria-labelledby pointing to the title', () => {
    expect(dialogSource).toContain('aria-labelledby="goto-page-title"');
    expect(dialogSource).toContain('id="goto-page-title"');
  });

  it('shows the "Ga naar pagina" heading', () => {
    expect(dialogSource).toContain("t('goToPage.title')");
  });

  it('shows page count context with "van {pageCount}"', () => {
    expect(dialogSource).toContain('max={pageCount}');
  });

  it('input is type="number"', () => {
    expect(dialogSource).toContain('type="number"');
  });

  it('input has min={1} and max={pageCount}', () => {
    expect(dialogSource).toContain('min={1}');
    expect(dialogSource).toContain('max={pageCount}');
  });
});

// ---------------------------------------------------------------------------
// ViewerApp — no regressions to existing shortcuts
// ---------------------------------------------------------------------------

describe('ViewerApp — go-to-page dialog: no regressions', () => {
  it('handleGoToPage still registered as keydown listener', () => {
    expect(handlerBody).toContain("window.addEventListener('keydown', handleGoToPage)");
  });

  it('⌘G guard still checks metaKey or ctrlKey', () => {
    expect(handlerBody).toContain('e.metaKey || e.ctrlKey');
  });

  it('pageCount === 0 guard still present', () => {
    expect(handlerBody).toContain('if (pageCount === 0) return');
  });

  it('fullscreen shortcut still present', () => {
    expect(viewerAppSource).toContain('handleFullscreenKey');
  });

  it('export shortcut still present', () => {
    expect(viewerAppSource).toContain('handleExportKey');
  });

  it('command palette shortcut still present', () => {
    expect(viewerAppSource).toContain('setCommandPaletteOpen');
  });

  it('shortcut sheet still present', () => {
    expect(viewerAppSource).toContain('<ShortcutSheet');
  });

  it('pageInputRef still passed to TopBar', () => {
    expect(viewerAppSource).toContain('pageInputRef={pageInputRef}');
  });
});
