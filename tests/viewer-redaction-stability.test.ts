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

const engineSource = readFileSync(
  new URL('../src-tauri/src/pdf_engine.rs', import.meta.url),
  'utf8'
);

// ---------------------------------------------------------------------------
// Stability: redactions persist through save pipeline (dirty state)
// ---------------------------------------------------------------------------

describe('Stability — redaction annotations trigger dirty state', () => {
  it('handleRedactionDraw calls markDirty after creating annotation', () => {
    const fnStart = viewerAppSource.indexOf('const handleRedactionDraw = useCallback(');
    const fnEnd = viewerAppSource.indexOf('\n  }, [', fnStart) + 4;
    const fnBody = viewerAppSource.slice(fnStart, fnEnd);
    expect(fnBody).toContain('markDirty()');
  });

  it('handleApplyRedactions calls markDirty after applying', () => {
    const fnStart = viewerAppSource.indexOf('const handleApplyRedactions = useCallback(');
    const fnEnd = viewerAppSource.indexOf('\n  }, [', fnStart) + 4;
    const fnBody = viewerAppSource.slice(fnStart, fnEnd);
    expect(fnBody).toContain('markDirty()');
  });

  it('handleRedactionDraw calls refetchComments to refresh annotation list', () => {
    const fnStart = viewerAppSource.indexOf('const handleRedactionDraw = useCallback(');
    const fnEnd = viewerAppSource.indexOf('\n  }, [', fnStart) + 4;
    const fnBody = viewerAppSource.slice(fnStart, fnEnd);
    expect(fnBody).toContain('refetchComments()');
  });

  it('handleApplyRedactions calls refetchComments to clear annotation list', () => {
    const fnStart = viewerAppSource.indexOf('const handleApplyRedactions = useCallback(');
    const fnEnd = viewerAppSource.indexOf('\n  }, [', fnStart) + 4;
    const fnBody = viewerAppSource.slice(fnStart, fnEnd);
    expect(fnBody).toContain('refetchComments()');
  });
});

// ---------------------------------------------------------------------------
// Stability: guard when no document loaded
// ---------------------------------------------------------------------------

describe('Stability — guards when document is not loaded', () => {
  it('handleRedactionDraw guards on pdfDoc and isTauri', () => {
    const fnStart = viewerAppSource.indexOf('const handleRedactionDraw = useCallback(');
    const fnEnd = viewerAppSource.indexOf('\n  }, [', fnStart) + 4;
    const fnBody = viewerAppSource.slice(fnStart, fnEnd);
    expect(fnBody).toContain('if (!pdfDoc');
    expect(fnBody).toContain('isTauri');
  });

  it('handleRedactionDraw guards on docLoadingRef to prevent concurrent mutations', () => {
    const fnStart = viewerAppSource.indexOf('const handleRedactionDraw = useCallback(');
    const fnEnd = viewerAppSource.indexOf('\n  }, [', fnStart) + 4;
    const fnBody = viewerAppSource.slice(fnStart, fnEnd);
    expect(fnBody).toContain('docLoadingRef.current');
  });

  it('handleApplyRedactions guards on pdfDoc and isTauri', () => {
    const fnStart = viewerAppSource.indexOf('const handleApplyRedactions = useCallback(');
    const fnEnd = viewerAppSource.indexOf('\n  }, [', fnStart) + 4;
    const fnBody = viewerAppSource.slice(fnStart, fnEnd);
    expect(fnBody).toContain('if (!pdfDoc');
    expect(fnBody).toContain('isTauri');
  });
});

// ---------------------------------------------------------------------------
// Stability: apply_redactions handles empty redaction list gracefully
// ---------------------------------------------------------------------------

describe('Stability — apply_redactions is safe with no pending redactions', () => {
  it('returns early with zero counts when no Redact annotations found', () => {
    const fnStart = engineSource.indexOf('pub fn apply_redactions(');
    const fnEnd = engineSource.indexOf('\n    pub fn ', fnStart + 10);
    const fnBody = engineSource.slice(fnStart, fnEnd);
    expect(fnBody).toContain('is_empty()');
    expect(fnBody).toContain('areas_redacted: 0');
    expect(fnBody).toContain('pages_affected: 0');
  });
});

// ---------------------------------------------------------------------------
// Stability: tool resets to null after redaction is created
// ---------------------------------------------------------------------------

describe('Stability — annotation tool resets after redaction', () => {
  it('handleRedactionDraw resets activeAnnotationTool to null after success', () => {
    const fnStart = viewerAppSource.indexOf('const handleRedactionDraw = useCallback(');
    const fnEnd = viewerAppSource.indexOf('\n  }, [', fnStart) + 4;
    const fnBody = viewerAppSource.slice(fnStart, fnEnd);
    expect(fnBody).toContain('setActiveAnnotationTool(null)');
  });
});

// ---------------------------------------------------------------------------
// Stability: redaction overlay alignment — uses same coordinate system
// ---------------------------------------------------------------------------

describe('Stability — redaction annotation uses same coordinate system as other types', () => {
  it('redaction annotations stored in allAnnotations alongside other types', () => {
    expect(viewerAppSource).toContain("a.type === 'redaction'");
    // redactions comes from allAnnotations filtered — same source as other annotations
    const redactionsIdx = viewerAppSource.indexOf("const redactions = useMemo(");
    expect(redactionsIdx).toBeGreaterThan(-1);
    const redactionsBlock = viewerAppSource.slice(redactionsIdx, redactionsIdx + 200);
    expect(redactionsBlock).toContain('allAnnotations');
  });

  it('AnnotationOverlay receives redaction annotations via clickableAnnotations prop', () => {
    // clickableAnnotations is derived from allAnnotations — which includes redaction type
    expect(viewerAppSource).toContain('clickableAnnotations');
    expect(viewerAppSource).toContain('allAnnotations');
  });
});
