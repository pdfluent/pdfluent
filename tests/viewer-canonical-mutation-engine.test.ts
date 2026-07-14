// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary. The PDFluent application is free to use,
// including for commercial purposes. Redistribution, or extraction or reuse
// of its components (including the embedded PDF engine), requires a licence.
// See https://pdfluent.com/license for terms.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

const canonicalEngineSrc = readFileSync(
  new URL('../src/platform/engine/canonicalTextMutationEngine.ts', import.meta.url),
  'utf8',
);
const useTextInteractionSrc = readFileSync(
  new URL('../src/viewer/hooks/useTextInteraction.ts', import.meta.url),
  'utf8',
);

describe('canonicalTextMutationEngine — native-only source contract', () => {
  it('exports getCanonicalTextMutationEngine', () => {
    expect(canonicalEngineSrc).toContain('export function getCanonicalTextMutationEngine');
  });

  it('gates the real mutation engine behind the Tauri environment', () => {
    expect(canonicalEngineSrc).toContain('isTauriEnvironment');
    expect(canonicalEngineSrc).toContain('getTauriTextMutationEngine');
  });

  it('has a typed desktop-required fallback for non-Tauri harnesses', () => {
    expect(canonicalEngineSrc).toContain('DesktopRequiredTextMutationEngine');
    expect(canonicalEngineSrc).toContain('desktop-native-runtime-required');
    expect(canonicalEngineSrc).toContain('E-ENV-DESKTOP-NATIVE-REQUIRED');
    expect(canonicalEngineSrc).toContain('replaced: false');
  });

  it('does not import or activate a browser PDF mutation engine', () => {
    expect(canonicalEngineSrc).not.toMatch(/Wasm/i);
    expect(canonicalEngineSrc).not.toContain('documentId');
  });
});

describe('useTextInteraction — mutation engine routing', () => {
  it('uses canonical engine, not direct Tauri import', () => {
    expect(useTextInteractionSrc).toContain('getCanonicalTextMutationEngine');
    expect(useTextInteractionSrc).not.toContain('getTauriTextMutationEngine');
  });

  it('calls getCanonicalTextMutationEngine in handleDraftCommit', () => {
    const commitIdx = useTextInteractionSrc.indexOf('handleDraftCommit');
    const block = useTextInteractionSrc.slice(commitIdx, commitIdx + 6000);
    expect(block).toContain('getCanonicalTextMutationEngine');
    expect(block).toContain('mutationEngine.replaceTextSpan');
  });

  it('does not pass browser document-store state to the selector', () => {
    expect(useTextInteractionSrc).not.toMatch(/DocumentStore/);
    expect(useTextInteractionSrc).not.toContain('documentId');
  });
});
