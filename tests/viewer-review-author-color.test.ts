// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary and confidential.
// Free for personal, non-commercial use.
// Commercial use requires a valid license.
// See https://pdfluent.com/license for terms.

import { readFileSync } from 'node:fs';
import { describe, it, expect } from 'vitest';

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

const rightPanelSource = readFileSync(
  new URL('../src/viewer/components/RightContextPanel.tsx', import.meta.url),
  'utf8'
);

const annotOverlaySource = readFileSync(
  new URL('../src/viewer/components/AnnotationOverlay.tsx', import.meta.url),
  'utf8'
);

const pageCanvasSource = readFileSync(
  new URL('../src/viewer/components/PageCanvas.tsx', import.meta.url),
  'utf8'
);

// ---------------------------------------------------------------------------
// ViewerApp — authorName state
// ---------------------------------------------------------------------------

describe('ViewerApp — authorName state', () => {
  it('initialises authorName from localStorage with empty string fallback', () => {
    expect(viewerAppSource).toContain("localStorage.getItem('pdfluent.user.author') ?? ''");
  });

  it('declares authorName and setAuthorName via useState', () => {
    expect(viewerAppSource).toContain('const [authorName, setAuthorName] = useState(');
  });

  it('defines handleAuthorChange that sets state and persists to localStorage', () => {
    expect(viewerAppSource).toContain('const handleAuthorChange = useCallback((name: string) =>');
    const fnStart = viewerAppSource.indexOf('const handleAuthorChange = useCallback');
    const fnEnd = viewerAppSource.indexOf('}, [])', fnStart) + 6;
    const fnBody = viewerAppSource.slice(fnStart, fnEnd);
    expect(fnBody).toContain('setAuthorName(name)');
    expect(fnBody).toContain("localStorage.setItem('pdfluent.user.author', name)");
  });
});

// ---------------------------------------------------------------------------
// ViewerApp — handleAddComment uses authorName
// ---------------------------------------------------------------------------

describe('ViewerApp — handleAddComment uses authorName', () => {
  it('passes authorName (with User fallback) as author when creating annotation', () => {
    const fnStart = viewerAppSource.indexOf('const handleAddComment = useCallback(');
    const fnEnd = viewerAppSource.indexOf('}, [pdfDoc, engine, pageIndex])', fnStart) + 30;
    const fnBody = viewerAppSource.slice(fnStart, fnEnd);
    expect(fnBody).toContain("author: authorName || 'User'");
  });

  it('no longer hardcodes author as plain string User', () => {
    const fnStart = viewerAppSource.indexOf('const handleAddComment = useCallback(');
    const fnEnd = viewerAppSource.indexOf('}, [pdfDoc, engine, pageIndex])', fnStart) + 30;
    const fnBody = viewerAppSource.slice(fnStart, fnEnd);
    // The exact hardcoded 'User' without authorName must not appear
    expect(fnBody).not.toContain("author: 'User'");
  });
});

// ---------------------------------------------------------------------------
// ViewerApp — pageAnnotationMarks includes color
// ---------------------------------------------------------------------------

describe('ViewerApp — pageAnnotationMarks includes annotation color', () => {
  it('maps color from each annotation into the mark object', () => {
    const memoStart = viewerAppSource.indexOf('const pageAnnotationMarks = useMemo(');
    const memoEnd = viewerAppSource.indexOf('[allAnnotations, pageIndex]', memoStart) + 28;
    const memoBody = viewerAppSource.slice(memoStart, memoEnd);
    expect(memoBody).toContain('color: a.color');
  });
});

// ---------------------------------------------------------------------------
// ViewerApp — props passed to RightContextPanel
// ---------------------------------------------------------------------------

describe('ViewerApp — authorName + onAuthorChange passed to RightContextPanel', () => {
  it('passes authorName to RightContextPanel', () => {
    expect(viewerAppSource).toContain('authorName={authorName}');
  });

  it('passes handleAuthorChange as onAuthorChange to RightContextPanel', () => {
    expect(viewerAppSource).toContain('onAuthorChange={handleAuthorChange}');
  });
});

// ---------------------------------------------------------------------------
// RightContextPanel — new props in interface
// ---------------------------------------------------------------------------

describe('RightContextPanel — authorName + onAuthorChange props', () => {
  it('declares authorName in RightContextPanelProps', () => {
    const ifaceStart = rightPanelSource.indexOf('interface RightContextPanelProps');
    const ifaceEnd = rightPanelSource.indexOf('\n}', ifaceStart) + 2;
    const iface = rightPanelSource.slice(ifaceStart, ifaceEnd);
    expect(iface).toContain('authorName: string');
  });

  it('declares onAuthorChange in RightContextPanelProps', () => {
    const ifaceStart = rightPanelSource.indexOf('interface RightContextPanelProps');
    const ifaceEnd = rightPanelSource.indexOf('\n}', ifaceStart) + 2;
    const iface = rightPanelSource.slice(ifaceStart, ifaceEnd);
    expect(iface).toContain('onAuthorChange: (name: string) => void');
  });

  it('destructures authorName in RightContextPanel function', () => {
    const fnStart = rightPanelSource.indexOf('export function RightContextPanel(');
    const fnEnd = rightPanelSource.indexOf('}: RightContextPanelProps)', fnStart) + 30;
    const signature = rightPanelSource.slice(fnStart, fnEnd);
    expect(signature).toContain('authorName');
  });

  it('destructures onAuthorChange in RightContextPanel function', () => {
    const fnStart = rightPanelSource.indexOf('export function RightContextPanel(');
    const fnEnd = rightPanelSource.indexOf('}: RightContextPanelProps)', fnStart) + 30;
    const signature = rightPanelSource.slice(fnStart, fnEnd);
    expect(signature).toContain('onAuthorChange');
  });

  it('forwards authorName and onAuthorChange to ReviewModeContent', () => {
    expect(rightPanelSource).toContain('authorName={authorName}');
    expect(rightPanelSource).toContain('onAuthorChange={onAuthorChange}');
  });
});

// ---------------------------------------------------------------------------
// ReviewModeContent — reviewer name input
// ---------------------------------------------------------------------------

describe('ReviewModeContent — reviewer name input', () => {
  it('renders a reviewer-name-input', () => {
    expect(rightPanelSource).toContain('data-testid="reviewer-name-input"');
  });

  it('reviewer-name-input binds to authorName', () => {
    const inputStart = rightPanelSource.indexOf('data-testid="reviewer-name-input"');
    const inputEnd = rightPanelSource.indexOf('/>', inputStart) + 2;
    const inputEl = rightPanelSource.slice(inputStart, inputEnd);
    expect(inputEl).toContain('value={authorName}');
  });

  it('reviewer-name-input calls onAuthorChange on change', () => {
    const inputStart = rightPanelSource.indexOf('data-testid="reviewer-name-input"');
    const inputEnd = rightPanelSource.indexOf('/>', inputStart) + 2;
    const inputEl = rightPanelSource.slice(inputStart, inputEnd);
    expect(inputEl).toContain('onAuthorChange(e.target.value)');
  });

  it('reviewer-name-input appears before the comment filter controls', () => {
    const nameInputPos = rightPanelSource.indexOf('data-testid="reviewer-name-input"');
    const filterInputPos = rightPanelSource.indexOf('data-testid="comment-filter-input"');
    expect(nameInputPos).toBeGreaterThan(-1);
    expect(filterInputPos).toBeGreaterThan(-1);
    expect(nameInputPos).toBeLessThan(filterInputPos);
  });
});

// ---------------------------------------------------------------------------
// ReviewModeContent — color dot per comment
// ---------------------------------------------------------------------------

describe('ReviewModeContent — annotation color dot', () => {
  it('renders comment-color-dot per comment item', () => {
    expect(rightPanelSource).toContain('data-testid="comment-color-dot"');
  });

  it('uses comment.color as backgroundColor for the dot', () => {
    const dotStart = rightPanelSource.indexOf('data-testid="comment-color-dot"');
    const dotEnd = rightPanelSource.indexOf('/>', dotStart) + 2;
    const dotEl = rightPanelSource.slice(dotStart, dotEnd);
    expect(dotEl).toContain('backgroundColor: comment.color');
  });

  it('has a fallback color when comment.color is falsy', () => {
    const dotStart = rightPanelSource.indexOf('data-testid="comment-color-dot"');
    const dotEnd = rightPanelSource.indexOf('/>', dotStart) + 2;
    const dotEl = rightPanelSource.slice(dotStart, dotEnd);
    expect(dotEl).toContain("comment.color || '#FFD700'");
  });

  it('color dot appears before the author name span', () => {
    const dotPos = rightPanelSource.indexOf('data-testid="comment-color-dot"');
    const authorPos = rightPanelSource.indexOf('comment.author || unknown');
    expect(dotPos).toBeGreaterThan(-1);
    expect(authorPos).toBeGreaterThan(-1);
    expect(dotPos).toBeLessThan(authorPos);
  });
});

// ---------------------------------------------------------------------------
// AnnotationOverlay — AnnotationMark includes color
// ---------------------------------------------------------------------------

describe('AnnotationOverlay — AnnotationMark color field', () => {
  it('AnnotationMark interface has color field', () => {
    const ifaceStart = annotOverlaySource.indexOf('interface AnnotationMark');
    const ifaceEnd = annotOverlaySource.indexOf('\n}', ifaceStart) + 2;
    const iface = annotOverlaySource.slice(ifaceStart, ifaceEnd);
    expect(iface).toContain('color: string');
  });
});

// ---------------------------------------------------------------------------
// AnnotationOverlay — markers use annotation color
// ---------------------------------------------------------------------------

describe('AnnotationOverlay — markers use annotation color from mark.color', () => {
  it('uses mark.color for fill attribute (in rect-based marker types)', () => {
    // Type-specific markers: underline/strikeout use <line> (no fill), rect-based types use fill.
    // Check the whole clickableAnnotations.map block for fill={mark.color}.
    const mapBlockStart = annotOverlaySource.indexOf('clickableAnnotations.map(');
    const mapBlockEnd = annotOverlaySource.indexOf('Active annotation highlight', mapBlockStart);
    const mapBlock = annotOverlaySource.slice(mapBlockStart, mapBlockEnd);
    expect(mapBlock).toContain('fill={mark.color}');
  });

  it('uses fillOpacity for transparency (not hardcoded rgba)', () => {
    // Check the whole clickableAnnotations.map block for fillOpacity.
    const mapBlockStart = annotOverlaySource.indexOf('clickableAnnotations.map(');
    const mapBlockEnd = annotOverlaySource.indexOf('Active annotation highlight', mapBlockStart);
    const mapBlock = annotOverlaySource.slice(mapBlockStart, mapBlockEnd);
    expect(mapBlock).toContain('fillOpacity=');
    // Must NOT use the old hardcoded amber color
    expect(mapBlock).not.toContain('rgba(180, 140, 60');
  });

  it('uses mark.color for stroke attribute', () => {
    const markerStart = annotOverlaySource.indexOf('data-testid="annotation-marker"');
    const markerEnd = annotOverlaySource.indexOf('/>', markerStart) + 2;
    const markerEl = annotOverlaySource.slice(markerStart, markerEnd);
    expect(markerEl).toContain('stroke={mark.color}');
  });

  it('uses strokeOpacity for stroke transparency', () => {
    const markerStart = annotOverlaySource.indexOf('data-testid="annotation-marker"');
    const markerEnd = annotOverlaySource.indexOf('/>', markerStart) + 2;
    const markerEl = annotOverlaySource.slice(markerStart, markerEnd);
    expect(markerEl).toContain('strokeOpacity=');
  });
});

// ---------------------------------------------------------------------------
// PageCanvas — clickableAnnotations type includes color
// ---------------------------------------------------------------------------

describe('PageCanvas — clickableAnnotations type includes color field', () => {
  it('clickableAnnotations prop type includes color: string', () => {
    const ifaceStart = pageCanvasSource.indexOf('interface PageCanvasProps');
    const ifaceEnd = pageCanvasSource.indexOf('\n}', ifaceStart) + 2;
    const iface = pageCanvasSource.slice(ifaceStart, ifaceEnd);
    expect(iface).toContain('color: string');
  });
});

// ---------------------------------------------------------------------------
// No-regression: existing review paths still intact
// ---------------------------------------------------------------------------

describe('No-regression — existing review paths unchanged', () => {
  it('reviewer name input uses inputClass for styling (consistent with filters)', () => {
    const inputStart = rightPanelSource.indexOf('data-testid="reviewer-name-input"');
    const inputEnd = rightPanelSource.indexOf('/>', inputStart) + 2;
    const inputEl = rightPanelSource.slice(inputStart, inputEnd);
    expect(inputEl).toContain('className={inputClass}');
  });

  it('comment-filter-input still present', () => {
    expect(rightPanelSource).toContain('data-testid="comment-filter-input"');
  });

  it('comment-filter-author select still present', () => {
    expect(rightPanelSource).toContain('data-testid="comment-filter-author"');
  });

  it('edit-comment-btn still present', () => {
    expect(rightPanelSource).toContain('data-testid="edit-comment-btn"');
  });

  it('delete-comment-btn still present', () => {
    expect(rightPanelSource).toContain('data-testid="delete-comment-btn"');
  });

  it('annotation-highlight testid still in AnnotationOverlay', () => {
    expect(annotOverlaySource).toContain('data-testid="annotation-highlight"');
  });

  it('active highlight still uses rgba(255, 220, 0, 0.35)', () => {
    expect(annotOverlaySource).toContain('rgba(255, 220, 0, 0.35)');
  });

  it('SVG container still has pointerEvents: none', () => {
    expect(annotOverlaySource).toContain("pointerEvents: 'none'");
  });

  it('handleAddComment still present in ViewerApp', () => {
    expect(viewerAppSource).toContain('const handleAddComment = useCallback(');
  });
});
