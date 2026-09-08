// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
// See https://pdfluent.com/license for terms.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { extractFirstExternalLink } from '../src/viewer/text/linkDetection';

const root = join(import.meta.dirname, '..');
const shellSource = readFileSync(join(root, 'src/viewer/v3/EditorV3Shell.tsx'), 'utf8');
const viewerAppSource = readFileSync(join(root, 'src/viewer/ViewerApp.tsx'), 'utf8');
const nativeServicesSource = readFileSync(join(root, 'src/platform/native/nativeServices.ts'), 'utf8');
const rustLibSource = readFileSync(join(root, 'src-tauri/src/lib.rs'), 'utf8');
const textInteractionSource = readFileSync(join(root, 'src/viewer/hooks/useTextInteraction.ts'), 'utf8');

describe('V3 desktop interaction regressions', () => {
  it('pauses and resumes desktop TTS through native commands, not browser-only speechSynthesis', () => {
    expect(rustLibSource).toContain('fn native_tts_pause');
    expect(rustLibSource).toContain('fn native_tts_resume');
    expect(rustLibSource).toContain('signal_tts_child(state, "-STOP")');
    expect(rustLibSource).toContain('signal_tts_child(state, "-CONT")');
    expect(rustLibSource).toContain('native_tts_pause,');
    expect(rustLibSource).toContain('native_tts_resume,');
    expect(nativeServicesSource).toContain("await invoke('native_tts_pause')");
    expect(nativeServicesSource).toContain("await invoke('native_tts_resume')");
  });

  it('does not create a note just by clicking the V3 note rail button', () => {
    const commentCase = shellSource.slice(
      shellSource.indexOf("case 'comment':"),
      shellSource.indexOf("case 'highlight':")
    );
    expect(commentCase).toContain("setPassiveRailTool('comment')");
    expect(commentCase).toContain("onModeChange('review')");
    expect(commentCase).not.toContain('onAddComment()');
  });

  it('lets the select rail button toggle back to hand mode', () => {
    expect(shellSource).toContain('passiveRailTool');
    expect(shellSource).toContain("mode === 'read' && passiveRailTool === 'select' ? 'hand' : 'select'");
    expect(shellSource).toContain("setPassiveRailTool('hand')");
  });

  it('asks for confirmation before opening detected external links', () => {
    expect(extractFirstExternalLink('linkedin.com/in/jasperdewinter')?.href).toBe('https://linkedin.com/in/jasperdewinter');
    expect(extractFirstExternalLink('mail jasper@jasperdewinter.nl')).toBeNull();
    expect(viewerAppSource).toContain("i18n.t('externalLink.title')");
    expect(viewerAppSource).toContain("await ask(message");
    expect(viewerAppSource).toContain("await invoke('open_external_url'");
    expect(textInteractionSource).toContain('extractFirstExternalLink(extractText(target))');
  });

  it('does not start the contenteditable text overlay on simple text selection, but edit entry does', () => {
    const selectHandler = textInteractionSource.slice(
      textInteractionSource.indexOf('const handleTextTargetSelect'),
      textInteractionSource.indexOf('const handleEditEntry')
    );
    expect(selectHandler).not.toContain('setEditingTextTargetId(target.id)');
    expect(selectHandler).toContain('A click selects the text target only');

    const editEntry = textInteractionSource.slice(
      textInteractionSource.indexOf('const handleEditEntry'),
      textInteractionSource.indexOf('/** Handle context bar action')
    );
    expect(editEntry).toContain("replaceTextMode !== 'parser-backed'");
    expect(editEntry).toContain('setEditingTextTargetId(target.id)');
    expect(editEntry).toContain('setTextDraft(extractText(target))');
    expect(editEntry).not.toContain('De huidige basis-writer');
  });

  it('turns backend text mutation codes into user-facing explanations', () => {
    const replacementBranch = textInteractionSource.slice(
      textInteractionSource.indexOf('// 1. Text replacement mutation'),
      textInteractionSource.indexOf('// 2. Selection-level format mutation')
    );
    expect(replacementBranch).toContain('getBackendRejectionMessage(code, detail)');
    expect(replacementBranch).not.toContain('makeTextMutationError(reason))');
  });

  it('keeps the rejection on screen instead of only in a toast that slides away', () => {
    const replacementBranch = textInteractionSource.slice(
      textInteractionSource.indexOf('// 1. Text replacement mutation'),
      textInteractionSource.indexOf('// 2. Selection-level format mutation')
    );
    expect(replacementBranch).toContain('setTextMutationRejection({');
    expect(replacementBranch).toContain('detail: detail ?? null');
  });
});
