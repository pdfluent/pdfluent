// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary and confidential.
// Free for personal, non-commercial use.
// Commercial use requires a valid license.
// See https://pdfluent.com/license for terms.

import { readFileSync } from 'node:fs';
import { describe, it, expect } from 'vitest';

const paletteSource = readFileSync(
  new URL('../src/viewer/components/CommandPalette.tsx', import.meta.url),
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

// Locate the recentCmdIds initializer block in ViewerApp
const initStart  = viewerAppSource.indexOf('const [recentCmdIds');
const initEnd    = viewerAppSource.indexOf('});', initStart) + 3;
const initBlock  = viewerAppSource.slice(initStart, initEnd);

// Locate the persist effect block in ViewerApp
const persistStart = viewerAppSource.indexOf('Persist recent command history');
const persistEnd   = viewerAppSource.indexOf('}, [recentCmdIds])') + '}, [recentCmdIds])'.length;
const persistBlock = viewerAppSource.slice(persistStart, persistEnd);

// Locate handleCommandRun in ViewerApp
const handlerStart = viewerAppSource.indexOf('handleCommandRun');
const handlerEnd   = viewerAppSource.indexOf('}, []);', handlerStart) + '}, []);'.length;
const handlerBlock = viewerAppSource.slice(handlerStart, handlerEnd);

// ---------------------------------------------------------------------------
// CommandPalette — new props
// ---------------------------------------------------------------------------

describe('command palette recent — props', () => {
  it('accepts recentIds prop', () => {
    expect(paletteSource).toContain('recentIds?:');
    expect(paletteSource).toContain('string[]');
  });

  it('accepts onRun prop', () => {
    expect(paletteSource).toContain('onRun?:');
    expect(paletteSource).toContain('(id: string) => void');
  });

  it('defaults recentIds to empty array', () => {
    expect(paletteSource).toContain('recentIds = []');
  });
});

// ---------------------------------------------------------------------------
// CommandPalette — recentCommands derivation
// ---------------------------------------------------------------------------

describe('command palette recent — recentCommands memoization', () => {
  it('derives recentCommands from recentIds + commands', () => {
    expect(paletteSource).toContain('recentCommands');
    expect(paletteSource).toContain('recentIds');
  });

  it('maps ids to command objects', () => {
    expect(paletteSource).toContain('commands.find(c => c.id === id)');
  });

  it('filters out undefined (missing) commands', () => {
    expect(paletteSource).toContain('filter((c): c is Command => c !== undefined)');
  });

  it('caps recentCommands at 3 entries', () => {
    expect(paletteSource).toContain('.slice(0, 3)');
  });

  it('depends on [recentIds, commands]', () => {
    expect(paletteSource).toContain('}, [recentIds, commands])');
  });
});

// ---------------------------------------------------------------------------
// CommandPalette — showRecent condition
// ---------------------------------------------------------------------------

describe('command palette recent — showRecent flag', () => {
  it('declares showRecent', () => {
    expect(paletteSource).toContain('showRecent');
  });

  it('only shows recents when query is empty', () => {
    expect(paletteSource).toContain('!query.trim() && recentCommands.length > 0');
  });
});

// ---------------------------------------------------------------------------
// CommandPalette — recent section JSX
// ---------------------------------------------------------------------------

describe('command palette recent — section rendering', () => {
  it('renders a recent-commands-section testid', () => {
    expect(paletteSource).toContain('data-testid="recent-commands-section"');
  });

  it('shows section only when showRecent is true', () => {
    expect(paletteSource).toContain('{showRecent && (');
  });

  it('renders recent-command-item testid on each entry', () => {
    expect(paletteSource).toContain('data-testid="recent-command-item"');
  });

  it('section heading uses i18n key commandPalette.recent', () => {
    expect(paletteSource).toContain("'commandPalette.recent'");
  });

  it('each recent item calls onRun on click', () => {
    expect(paletteSource).toContain("onRun?.(cmd.id)");
  });

  it('each recent item also calls cmd.action and onClose on click', () => {
    // The recent item onClick contains the full invocation sequence
    expect(paletteSource).toContain('onRun?.(cmd.id); cmd.action(); onClose();');
  });

  it('has a divider between the recent section and the full list', () => {
    // The separator element sits between the recent section and the main list
    const sectionStart = paletteSource.indexOf('recent-commands-section');
    const sectionEnd   = paletteSource.indexOf('filtered.length === 0', sectionStart);
    const sectionBlock = paletteSource.slice(sectionStart, sectionEnd);
    expect(sectionBlock).toContain('border-t border-border');
  });
});

// ---------------------------------------------------------------------------
// CommandPalette — onRun called from Enter handler
// ---------------------------------------------------------------------------

describe('command palette recent — keyboard invocation', () => {
  it('Enter key also calls onRun with the command id', () => {
    expect(paletteSource).toContain("onRun?.(cmd.id); cmd.action(); onClose()");
  });
});

// ---------------------------------------------------------------------------
// ViewerApp — recentCmdIds state
// ---------------------------------------------------------------------------

describe('command palette recent — ViewerApp state', () => {
  it('declares recentCmdIds state', () => {
    expect(viewerAppSource).toContain('recentCmdIds');
    expect(viewerAppSource).toContain('setRecentCmdIds');
  });

  it('uses a lazy useState initializer', () => {
    expect(initBlock).toContain('useState<string[]>(() =>');
  });

  it('reads from localStorage on init', () => {
    expect(initBlock).toContain('localStorage.getItem');
    expect(initBlock).toContain("'pdfluent.viewer.commands.recent'");
  });

  it('parses stored value with JSON.parse', () => {
    expect(initBlock).toContain('JSON.parse(stored)');
  });

  it('validates that the parsed value is an array', () => {
    expect(initBlock).toContain('Array.isArray(parsed)');
  });

  it('falls back to empty array when unavailable or corrupt', () => {
    expect(initBlock).toContain('return []');
  });

  it('wraps init in try/catch', () => {
    expect(initBlock).toContain('try {');
    expect(initBlock).toContain('} catch {');
  });
});

// ---------------------------------------------------------------------------
// ViewerApp — persist effect
// ---------------------------------------------------------------------------

describe('command palette recent — ViewerApp persist', () => {
  it('writes to localStorage when recentCmdIds changes', () => {
    expect(persistBlock).toContain('localStorage.setItem');
    expect(persistBlock).toContain("'pdfluent.viewer.commands.recent'");
  });

  it('serializes with JSON.stringify', () => {
    expect(persistBlock).toContain('JSON.stringify(recentCmdIds)');
  });

  it('useEffect depends on [recentCmdIds]', () => {
    expect(persistBlock).toContain('}, [recentCmdIds])');
  });

  it('wraps write in try/catch', () => {
    expect(persistBlock).toContain('try {');
    expect(persistBlock).toContain('} catch {');
  });
});

// ---------------------------------------------------------------------------
// ViewerApp — handleCommandRun callback
// ---------------------------------------------------------------------------

describe('command palette recent — handleCommandRun', () => {
  it('is defined with useCallback', () => {
    expect(viewerAppSource).toContain('handleCommandRun');
    expect(viewerAppSource).toContain('useCallback');
  });

  it('prepends the new id to the front', () => {
    expect(handlerBlock).toContain('[id, ...prev.filter(x => x !== id)]');
  });

  it('deduplicates by filtering out existing occurrences of id', () => {
    expect(handlerBlock).toContain("prev.filter(x => x !== id)");
  });

  it('caps history at 5 entries', () => {
    expect(handlerBlock).toContain('deduped.slice(0, 5)');
  });
});

// ---------------------------------------------------------------------------
// ViewerApp — CommandPalette wiring
// ---------------------------------------------------------------------------

describe('command palette recent — CommandPalette wiring', () => {
  it('passes recentIds to CommandPalette', () => {
    expect(viewerAppSource).toContain('recentIds={recentCmdIds}');
  });

  it('passes onRun to CommandPalette', () => {
    expect(viewerAppSource).toContain('onRun={handleCommandRun}');
  });
});

// ---------------------------------------------------------------------------
// No regressions
// ---------------------------------------------------------------------------

describe('command palette recent — no regressions', () => {
  it('command filtering by query still present', () => {
    expect(paletteSource).toContain('!query.trim()');
    expect(paletteSource).toContain('cmd.label.toLowerCase().includes(q)');
  });

  it('arrow key navigation still present', () => {
    expect(paletteSource).toContain("e.key === 'ArrowDown'");
    expect(paletteSource).toContain("e.key === 'ArrowUp'");
  });

  it('Escape still closes the palette', () => {
    expect(paletteSource).toContain("e.key === 'Escape'");
    expect(paletteSource).toContain('onClose()');
  });

  it('selectedIndex state still present', () => {
    expect(paletteSource).toContain('selectedIndex');
    expect(paletteSource).toContain('setSelectedIndex');
  });

  it('CommandPalette is still passed commands from ViewerApp', () => {
    expect(viewerAppSource).toContain('commands={commands}');
  });
});
