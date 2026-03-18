// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary and confidential.
// Free for personal, non-commercial use.
// Commercial use requires a valid license.
// See https://pdfluent.com/license for terms.

import { readFileSync } from 'node:fs';
import { describe, it, expect } from 'vitest';

const tauriAnnotSource = readFileSync(
  new URL('../src/platform/engine/tauri/TauriAnnotationEngine.ts', import.meta.url),
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

const rightPanelSource = readFileSync(
  new URL('../src/viewer/components/RightContextPanel.tsx', import.meta.url),
  'utf8'
);

const rustLibSource = readFileSync(
  new URL('../src-tauri/src/lib.rs', import.meta.url),
  'utf8'
);

const rustEngineSource = readFileSync(
  new URL('../src-tauri/src/pdf_engine.rs', import.meta.url),
  'utf8'
);

// ---------------------------------------------------------------------------
// Rust — parse_annotation_id helper
// ---------------------------------------------------------------------------

describe('Rust — parse_annotation_id helper', () => {
  it('is defined in pdf_engine.rs', () => {
    expect(rustEngineSource).toContain('fn parse_annotation_id(');
  });

  it('strips the annot-p prefix', () => {
    expect(rustEngineSource).toContain('strip_prefix("annot-p")');
  });

  it('splits on the last hyphen (rsplit_once)', () => {
    expect(rustEngineSource).toContain('rsplit_once(\'-\')');
  });

  it('parses page_index as u32', () => {
    expect(rustEngineSource).toContain('let page: u32 = page_str');
  });

  it('parses annot_idx as usize', () => {
    expect(rustEngineSource).toContain('let idx: usize = idx_str');
  });
});

// ---------------------------------------------------------------------------
// Rust — delete_annotation method
// ---------------------------------------------------------------------------

describe('Rust — OpenDocument::delete_annotation', () => {
  it('is defined in pdf_engine.rs', () => {
    expect(rustEngineSource).toContain('pub fn delete_annotation(');
  });

  it('calls parse_annotation_id', () => {
    const fnStart = rustEngineSource.indexOf('pub fn delete_annotation(');
    const fnEnd = rustEngineSource.indexOf('\n    }', fnStart) + 6;
    const fnBody = rustEngineSource.slice(fnStart, fnEnd);
    expect(fnBody).toContain('parse_annotation_id(annotation_id)');
  });

  it('looks up the page via get_pages (1-based)', () => {
    const fnStart = rustEngineSource.indexOf('pub fn delete_annotation(');
    const fnEnd = rustEngineSource.indexOf('\n    }', fnStart) + 6;
    const fnBody = rustEngineSource.slice(fnStart, fnEnd);
    expect(fnBody).toContain('get_pages()');
    expect(fnBody).toContain('page_index + 1');
  });

  it('handles both inline and indirect /Annots', () => {
    const fnStart = rustEngineSource.indexOf('pub fn delete_annotation(');
    const fnEnd = rustEngineSource.indexOf('\n    }', fnStart) + 6;
    const fnBody = rustEngineSource.slice(fnStart, fnEnd);
    expect(fnBody).toContain('Object::Reference');
    expect(fnBody).toContain('Object::Array');
  });

  it('removes the element at annot_idx', () => {
    const fnStart = rustEngineSource.indexOf('pub fn delete_annotation(');
    const fnEnd = rustEngineSource.indexOf('\n    }', fnStart) + 6;
    const fnBody = rustEngineSource.slice(fnStart, fnEnd);
    expect(fnBody).toContain('arr.remove(annot_idx)');
  });

  it('calls sync_after_mutation', () => {
    const fnStart = rustEngineSource.indexOf('pub fn delete_annotation(');
    const fnEnd = rustEngineSource.indexOf('\n    }', fnStart) + 6;
    const fnBody = rustEngineSource.slice(fnStart, fnEnd);
    expect(fnBody).toContain('sync_after_mutation()');
  });
});

// ---------------------------------------------------------------------------
// Rust — update_annotation_contents method
// ---------------------------------------------------------------------------

describe('Rust — OpenDocument::update_annotation_contents', () => {
  it('is defined in pdf_engine.rs', () => {
    expect(rustEngineSource).toContain('pub fn update_annotation_contents(');
  });

  it('calls parse_annotation_id', () => {
    const fnStart = rustEngineSource.indexOf('pub fn update_annotation_contents(');
    const fnEnd = rustEngineSource.indexOf('\n    }', fnStart) + 6;
    const fnBody = rustEngineSource.slice(fnStart, fnEnd);
    expect(fnBody).toContain('parse_annotation_id(annotation_id)');
  });

  it('resolves the annotation object id from the /Annots array', () => {
    const fnStart = rustEngineSource.indexOf('pub fn update_annotation_contents(');
    const fnEnd = rustEngineSource.indexOf('\n    }', fnStart) + 6;
    const fnBody = rustEngineSource.slice(fnStart, fnEnd);
    expect(fnBody).toContain('as_reference()');
  });

  it('sets the /Contents field', () => {
    const fnStart = rustEngineSource.indexOf('pub fn update_annotation_contents(');
    const fnEnd = rustEngineSource.indexOf('\n    }', fnStart) + 6;
    const fnBody = rustEngineSource.slice(fnStart, fnEnd);
    expect(fnBody).toContain('b"Contents"');
    expect(fnBody).toContain('contents.as_bytes()');
  });

  it('calls sync_after_mutation', () => {
    const fnStart = rustEngineSource.indexOf('pub fn update_annotation_contents(');
    const fnEnd = rustEngineSource.indexOf('\n    }', fnStart) + 6;
    const fnBody = rustEngineSource.slice(fnStart, fnEnd);
    expect(fnBody).toContain('sync_after_mutation()');
  });
});

// ---------------------------------------------------------------------------
// Rust — Tauri commands registered
// ---------------------------------------------------------------------------

describe('Rust — Tauri commands delete_annotation and update_annotation_contents', () => {
  it('delete_annotation command is defined in lib.rs', () => {
    expect(rustLibSource).toContain('fn delete_annotation(');
  });

  it('delete_annotation delegates to OpenDocument::delete_annotation', () => {
    const fnStart = rustLibSource.indexOf('fn delete_annotation(');
    const fnEnd = rustLibSource.indexOf('\n}', fnStart) + 2;
    const fnBody = rustLibSource.slice(fnStart, fnEnd);
    expect(fnBody).toContain('doc.delete_annotation(&annotation_id)');
  });

  it('update_annotation_contents command is defined in lib.rs', () => {
    expect(rustLibSource).toContain('fn update_annotation_contents(');
  });

  it('update_annotation_contents delegates to OpenDocument method', () => {
    const fnStart = rustLibSource.indexOf('fn update_annotation_contents(');
    const fnEnd = rustLibSource.indexOf('\n}', fnStart) + 2;
    const fnBody = rustLibSource.slice(fnStart, fnEnd);
    expect(fnBody).toContain('doc.update_annotation_contents(&annotation_id, &contents)');
  });

  it('both commands are registered in generate_handler', () => {
    expect(rustLibSource).toContain('delete_annotation,');
    expect(rustLibSource).toContain('update_annotation_contents,');
  });
});

// ---------------------------------------------------------------------------
// TauriAnnotationEngine — updateAnnotation bridge
// ---------------------------------------------------------------------------

describe('TauriAnnotationEngine — updateAnnotation bridge', () => {
  it('no longer returns notImpl for updateAnnotation', () => {
    const fnStart = tauriAnnotSource.indexOf('async updateAnnotation(');
    const fnEnd = tauriAnnotSource.indexOf('\n  }', fnStart) + 4;
    const fnBody = tauriAnnotSource.slice(fnStart, fnEnd);
    expect(fnBody).not.toContain("notImpl('updateAnnotation");
  });

  it('calls invoke update_annotation_contents', () => {
    const fnStart = tauriAnnotSource.indexOf('async updateAnnotation(');
    const fnEnd = tauriAnnotSource.indexOf('\n  }', fnStart) + 4;
    const fnBody = tauriAnnotSource.slice(fnStart, fnEnd);
    expect(fnBody).toContain("invoke('update_annotation_contents'");
  });

  it('passes annotationId and contents to the command', () => {
    const fnStart = tauriAnnotSource.indexOf('async updateAnnotation(');
    const fnEnd = tauriAnnotSource.indexOf('\n  }', fnStart) + 4;
    const fnBody = tauriAnnotSource.slice(fnStart, fnEnd);
    expect(fnBody).toContain('annotationId');
    expect(fnBody).toContain('contents');
    expect(fnBody).toContain('updates.contents');
  });

  it('only calls invoke when contents is present in updates', () => {
    const fnStart = tauriAnnotSource.indexOf('async updateAnnotation(');
    const fnEnd = tauriAnnotSource.indexOf('\n  }', fnStart) + 4;
    const fnBody = tauriAnnotSource.slice(fnStart, fnEnd);
    expect(fnBody).toContain('updates.contents !== undefined');
  });

  it('returns success: true on success', () => {
    const fnStart = tauriAnnotSource.indexOf('async updateAnnotation(');
    const fnEnd = tauriAnnotSource.indexOf('\n  }', fnStart) + 4;
    const fnBody = tauriAnnotSource.slice(fnStart, fnEnd);
    expect(fnBody).toContain('success: true');
  });

  it('returns internal-error on invoke failure', () => {
    const fnStart = tauriAnnotSource.indexOf('async updateAnnotation(');
    const fnEnd = tauriAnnotSource.indexOf('\n  }', fnStart) + 4;
    const fnBody = tauriAnnotSource.slice(fnStart, fnEnd);
    expect(fnBody).toContain("code: 'internal-error'");
  });
});

// ---------------------------------------------------------------------------
// TauriAnnotationEngine — deleteAnnotation bridge
// ---------------------------------------------------------------------------

describe('TauriAnnotationEngine — deleteAnnotation bridge', () => {
  it('no longer returns notImpl for deleteAnnotation', () => {
    const fnStart = tauriAnnotSource.indexOf('async deleteAnnotation(');
    const fnEnd = tauriAnnotSource.indexOf('\n  }', fnStart) + 4;
    const fnBody = tauriAnnotSource.slice(fnStart, fnEnd);
    expect(fnBody).not.toContain("notImpl('deleteAnnotation");
  });

  it('calls invoke delete_annotation', () => {
    const fnStart = tauriAnnotSource.indexOf('async deleteAnnotation(');
    const fnEnd = tauriAnnotSource.indexOf('\n  }', fnStart) + 4;
    const fnBody = tauriAnnotSource.slice(fnStart, fnEnd);
    expect(fnBody).toContain("invoke('delete_annotation'");
  });

  it('passes annotationId to delete_annotation', () => {
    const fnStart = tauriAnnotSource.indexOf('async deleteAnnotation(');
    const fnEnd = tauriAnnotSource.indexOf('\n  }', fnStart) + 4;
    const fnBody = tauriAnnotSource.slice(fnStart, fnEnd);
    expect(fnBody).toContain('annotationId');
  });

  it('returns success: true and undefined value on success', () => {
    const fnStart = tauriAnnotSource.indexOf('async deleteAnnotation(');
    const fnEnd = tauriAnnotSource.indexOf('\n  }', fnStart) + 4;
    const fnBody = tauriAnnotSource.slice(fnStart, fnEnd);
    expect(fnBody).toContain('success: true');
    expect(fnBody).toContain('value: undefined');
  });

  it('returns internal-error on invoke failure', () => {
    const fnStart = tauriAnnotSource.indexOf('async deleteAnnotation(');
    const fnEnd = tauriAnnotSource.indexOf('\n  }', fnStart) + 4;
    const fnBody = tauriAnnotSource.slice(fnStart, fnEnd);
    expect(fnBody).toContain("code: 'internal-error'");
  });
});

// ---------------------------------------------------------------------------
// ViewerApp — refetchComments helper
// ---------------------------------------------------------------------------

describe('ViewerApp — refetchComments helper', () => {
  it('declares refetchComments callback', () => {
    expect(viewerAppSource).toContain('refetchComments');
  });

  it('calls loadAnnotations on refetch', () => {
    const fnStart = viewerAppSource.indexOf('const refetchComments = useCallback');
    const fnEnd = viewerAppSource.indexOf('[pdfDoc, engine]', fnStart) + 20;
    const fnBody = viewerAppSource.slice(fnStart, fnEnd);
    expect(fnBody).toContain('loadAnnotations(pdfDoc)');
  });

  it('calls setAllAnnotations with all re-fetched annotations (filter happens in useMemo)', () => {
    const fnStart = viewerAppSource.indexOf('const refetchComments = useCallback');
    const fnEnd = viewerAppSource.indexOf('[pdfDoc, engine]', fnStart) + 20;
    const fnBody = viewerAppSource.slice(fnStart, fnEnd);
    expect(fnBody).toContain('setAllAnnotations(annotResult.value)');
  });

  it('calls setAllAnnotations on successful re-fetch', () => {
    const fnStart = viewerAppSource.indexOf('const refetchComments = useCallback');
    const fnEnd = viewerAppSource.indexOf('[pdfDoc, engine]', fnStart) + 20;
    const fnBody = viewerAppSource.slice(fnStart, fnEnd);
    expect(fnBody).toContain('setAllAnnotations(');
  });
});

// ---------------------------------------------------------------------------
// ViewerApp — handleDeleteComment
// ---------------------------------------------------------------------------

describe('ViewerApp — handleDeleteComment', () => {
  it('declares handleDeleteComment callback', () => {
    expect(viewerAppSource).toContain('handleDeleteComment');
  });

  it('calls deleteAnnotation on the engine', () => {
    const fnStart = viewerAppSource.indexOf('const handleDeleteComment = useCallback');
    const fnEnd = viewerAppSource.indexOf('refetchComments])', fnStart) + 20;
    const fnBody = viewerAppSource.slice(fnStart, fnEnd);
    expect(fnBody).toContain('deleteAnnotation(pdfDoc, annotationId)');
  });

  it('calls refetchComments after successful delete', () => {
    const fnStart = viewerAppSource.indexOf('const handleDeleteComment = useCallback');
    const fnEnd = viewerAppSource.indexOf('refetchComments])', fnStart) + 20;
    const fnBody = viewerAppSource.slice(fnStart, fnEnd);
    expect(fnBody).toContain('result.success');
    expect(fnBody).toContain('refetchComments()');
  });

  it('resets activeCommentIdx to -1 when the deleted comment was active', () => {
    const fnStart = viewerAppSource.indexOf('const handleDeleteComment = useCallback');
    const fnEnd = viewerAppSource.indexOf('refetchComments])', fnStart) + 20;
    const fnBody = viewerAppSource.slice(fnStart, fnEnd);
    expect(fnBody).toContain('setActiveCommentIdx(');
    expect(fnBody).toContain('return -1');
  });

  it('shifts activeCommentIdx down when deleted comment was before active', () => {
    const fnStart = viewerAppSource.indexOf('const handleDeleteComment = useCallback');
    const fnEnd = viewerAppSource.indexOf('refetchComments])', fnStart) + 20;
    const fnBody = viewerAppSource.slice(fnStart, fnEnd);
    expect(fnBody).toContain('return prev - 1');
  });

  it('passes onDeleteComment={handleDeleteComment} to RightContextPanel', () => {
    expect(viewerAppSource).toContain('onDeleteComment={handleDeleteComment}');
  });
});

// ---------------------------------------------------------------------------
// ViewerApp — handleUpdateComment
// ---------------------------------------------------------------------------

describe('ViewerApp — handleUpdateComment', () => {
  it('declares handleUpdateComment callback', () => {
    expect(viewerAppSource).toContain('handleUpdateComment');
  });

  it('calls updateAnnotation on the engine with contents', () => {
    const fnStart = viewerAppSource.indexOf('const handleUpdateComment = useCallback');
    const fnEnd = viewerAppSource.indexOf('refetchComments])', fnStart) + 20;
    const fnBody = viewerAppSource.slice(fnStart, fnEnd);
    expect(fnBody).toContain('updateAnnotation(pdfDoc, annotationId');
    expect(fnBody).toContain('newContents');
  });

  it('calls refetchComments after successful update', () => {
    const fnStart = viewerAppSource.indexOf('const handleUpdateComment = useCallback');
    const fnEnd = viewerAppSource.indexOf('refetchComments])', fnStart) + 20;
    const fnBody = viewerAppSource.slice(fnStart, fnEnd);
    expect(fnBody).toContain('result.success');
    expect(fnBody).toContain('refetchComments()');
  });

  it('passes onUpdateComment={handleUpdateComment} to RightContextPanel', () => {
    expect(viewerAppSource).toContain('onUpdateComment={handleUpdateComment}');
  });
});

// ---------------------------------------------------------------------------
// RightContextPanel — props contract
// ---------------------------------------------------------------------------

describe('RightContextPanel — props contract', () => {
  it('declares onDeleteComment prop', () => {
    expect(rightPanelSource).toContain('onDeleteComment: (annotationId: string) => void');
  });

  it('declares onUpdateComment prop', () => {
    expect(rightPanelSource).toContain('onUpdateComment: (annotationId: string, newContents: string) => void');
  });

  it('passes onDeleteComment to ReviewModeContent', () => {
    expect(rightPanelSource).toContain('onDeleteComment={onDeleteComment}');
  });

  it('passes onUpdateComment to ReviewModeContent', () => {
    expect(rightPanelSource).toContain('onUpdateComment={onUpdateComment}');
  });
});

// ---------------------------------------------------------------------------
// RightContextPanel — ReviewModeContent edit/delete UI
// ---------------------------------------------------------------------------

describe('RightContextPanel — ReviewModeContent edit/delete affordance', () => {
  it('imports TrashIcon from lucide-react', () => {
    expect(rightPanelSource).toContain('TrashIcon');
  });

  it('imports PencilIcon from lucide-react', () => {
    expect(rightPanelSource).toContain('PencilIcon');
  });

  it('renders delete-comment-btn testid on each comment', () => {
    expect(rightPanelSource).toContain('data-testid="delete-comment-btn"');
  });

  it('delete button calls onDeleteComment with comment.id on click', () => {
    const btnIdx = rightPanelSource.indexOf('data-testid="delete-comment-btn"');
    const surrounding = rightPanelSource.slice(btnIdx - 50, btnIdx + 200);
    expect(surrounding).toContain('onDeleteComment(comment.id)');
  });

  it('delete button stops event propagation', () => {
    const btnIdx = rightPanelSource.indexOf('data-testid="delete-comment-btn"');
    const surrounding = rightPanelSource.slice(btnIdx - 50, btnIdx + 200);
    expect(surrounding).toContain('e.stopPropagation()');
  });

  it('renders edit-comment-btn testid on each comment', () => {
    expect(rightPanelSource).toContain('data-testid="edit-comment-btn"');
  });

  it('edit button sets editingId to comment.id', () => {
    const btnIdx = rightPanelSource.indexOf('data-testid="edit-comment-btn"');
    const surrounding = rightPanelSource.slice(btnIdx - 50, btnIdx + 250);
    expect(surrounding).toContain('setEditingId(comment.id)');
    expect(surrounding).toContain('setEditText(comment.contents');
  });

  it('renders comment-edit-textarea testid when in edit mode', () => {
    expect(rightPanelSource).toContain('data-testid="comment-edit-textarea"');
  });

  it('textarea is shown when editingId === comment.id', () => {
    const taIdx = rightPanelSource.indexOf('data-testid="comment-edit-textarea"');
    const block = rightPanelSource.slice(taIdx - 200, taIdx);
    expect(block).toContain('isEditing');
  });

  it('confirm button calls onUpdateComment and clears editingId', () => {
    expect(rightPanelSource).toContain('data-testid="comment-edit-confirm-btn"');
    const btnIdx = rightPanelSource.indexOf('data-testid="comment-edit-confirm-btn"');
    const surrounding = rightPanelSource.slice(btnIdx - 50, btnIdx + 250);
    expect(surrounding).toContain('onUpdateComment(comment.id, editText)');
    expect(surrounding).toContain('setEditingId(null)');
  });

  it('cancel button clears editingId without saving', () => {
    expect(rightPanelSource).toContain('data-testid="comment-edit-cancel-btn"');
    const btnIdx = rightPanelSource.indexOf('data-testid="comment-edit-cancel-btn"');
    const surrounding = rightPanelSource.slice(btnIdx - 50, btnIdx + 200);
    expect(surrounding).toContain('setEditingId(null)');
    expect(surrounding).not.toContain('onUpdateComment');
  });

  it('ReviewModeContent has editingId and editText state', () => {
    expect(rightPanelSource).toContain('editingId');
    expect(rightPanelSource).toContain('editText');
  });
});

// ---------------------------------------------------------------------------
// No regressions: create / overlay / navigation paths
// ---------------------------------------------------------------------------

describe('no regressions — create / overlay / navigation paths', () => {
  it('handleAddComment is still present', () => {
    expect(viewerAppSource).toContain('handleAddComment');
  });

  it('add-comment-btn is still present in ModeToolbar source', () => {
    const modeToolbarSource = readFileSync(
      new URL('../src/viewer/components/ModeToolbar.tsx', import.meta.url),
      'utf8'
    );
    expect(modeToolbarSource).toContain('data-testid="add-comment-btn"');
  });

  it('TauriAnnotationEngine createAnnotation still calls add_comment_annotation', () => {
    expect(tauriAnnotSource).toContain("invoke('add_comment_annotation'");
  });

  it('TauriAnnotationEngine loadAnnotations still calls get_annotations', () => {
    expect(tauriAnnotSource).toContain("invoke<TauriAnnotation[]>('get_annotations'");
  });

  it('review-comment-item testid still present in RightContextPanel', () => {
    expect(rightPanelSource).toContain('data-testid="review-comment-item"');
  });

  it('comment-nav block still present in ModeToolbar', () => {
    const modeToolbarSource = readFileSync(
      new URL('../src/viewer/components/ModeToolbar.tsx', import.meta.url),
      'utf8'
    );
    expect(modeToolbarSource).toContain('data-testid="comment-nav"');
  });
});
