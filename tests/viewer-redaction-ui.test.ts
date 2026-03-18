// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary and confidential.
// Free for personal, non-commercial use.
// Commercial use requires a valid license.
// See https://pdfluent.com/license for terms.

import { readFileSync } from 'node:fs';
import { describe, it, expect } from 'vitest';

const rightPanelSource = readFileSync(
  new URL('../src/viewer/components/RightContextPanel.tsx', import.meta.url),
  'utf8'
);

const useAnnotationsSource = readFileSync(
  new URL('../src/viewer/hooks/useAnnotations.ts', import.meta.url),
  'utf8'
);

const viewerAppSource = readFileSync(
  new URL('../src/viewer/ViewerApp.tsx', import.meta.url),
  'utf8'
);

// ---------------------------------------------------------------------------
// RedactionPanel — search and redact
// ---------------------------------------------------------------------------

describe('RedactionPanel — search and redact', () => {
  it('accepts onSearchRedact prop', () => {
    expect(rightPanelSource).toContain('onSearchRedact?');
  });

  it('renders search-and-redact input', () => {
    expect(rightPanelSource).toContain('data-testid="search-redact-input"');
  });

  it('renders search-and-redact button', () => {
    expect(rightPanelSource).toContain('data-testid="search-redact-btn"');
  });

  it('uses protect.searchRedact i18n key', () => {
    expect(rightPanelSource).toContain("t('protect.searchRedact')");
  });

  it('uses protect.searchRedactPlaceholder i18n key', () => {
    expect(rightPanelSource).toContain("t('protect.searchRedactPlaceholder')");
  });

  it('uses protect.searchRedactBtn i18n key', () => {
    expect(rightPanelSource).toContain("t('protect.searchRedactBtn')");
  });

  it('uses tasks.searchRedactRunning for task queue', () => {
    expect(rightPanelSource).toContain("t('tasks.searchRedactRunning')");
  });

  it('uses tasks.searchRedactDone for task queue', () => {
    expect(rightPanelSource).toContain("t('tasks.searchRedactDone'");
  });

  it('uses tasks.searchRedactFailed for task queue', () => {
    expect(rightPanelSource).toContain("t('tasks.searchRedactFailed')");
  });
});

// ---------------------------------------------------------------------------
// RedactionPanel — redact metadata
// ---------------------------------------------------------------------------

describe('RedactionPanel — redact metadata', () => {
  it('accepts onRedactMetadata prop', () => {
    expect(rightPanelSource).toContain('onRedactMetadata?');
  });

  it('renders redact-metadata button', () => {
    expect(rightPanelSource).toContain('data-testid="redact-metadata-btn"');
  });

  it('uses protect.redactMetadataTitle i18n key', () => {
    expect(rightPanelSource).toContain("t('protect.redactMetadataTitle')");
  });

  it('uses protect.redactMetadataBtn i18n key', () => {
    expect(rightPanelSource).toContain("t('protect.redactMetadataBtn')");
  });

  it('uses tasks.redactMetadataRunning for task queue', () => {
    expect(rightPanelSource).toContain("t('tasks.redactMetadataRunning')");
  });

  it('uses tasks.redactMetadataDone for task queue', () => {
    expect(rightPanelSource).toContain("t('tasks.redactMetadataDone')");
  });
});

// ---------------------------------------------------------------------------
// RedactionPanel — TaskQueue for apply
// ---------------------------------------------------------------------------

describe('RedactionPanel — TaskQueue integration for apply', () => {
  it('uses tasks.applyRedactRunning', () => {
    expect(rightPanelSource).toContain("t('tasks.applyRedactRunning')");
  });

  it('uses tasks.applyRedactDone', () => {
    expect(rightPanelSource).toContain("t('tasks.applyRedactDone')");
  });

  it('uses tasks.applyRedactFailed', () => {
    expect(rightPanelSource).toContain("t('tasks.applyRedactFailed')");
  });

  it('calls push before apply', () => {
    const applyIdx = rightPanelSource.indexOf('tasks.applyRedactRunning');
    const pushIdx = rightPanelSource.indexOf("push({", applyIdx - 200);
    expect(pushIdx).toBeGreaterThan(-1);
  });
});

// ---------------------------------------------------------------------------
// useAnnotations — handleRedactSearch and handleRedactMetadata
// ---------------------------------------------------------------------------

describe('useAnnotations — redact handlers', () => {
  it('exports handleRedactSearch', () => {
    expect(useAnnotationsSource).toContain('handleRedactSearch');
  });

  it('exports handleRedactMetadata', () => {
    expect(useAnnotationsSource).toContain('handleRedactMetadata');
  });

  it('handleRedactSearch calls redact_search Tauri command', () => {
    expect(useAnnotationsSource).toContain("'redact_search'");
  });

  it('handleRedactMetadata calls redact_metadata Tauri command', () => {
    expect(useAnnotationsSource).toContain("invoke('redact_metadata')");
  });

  it('handleRedactSearch returns matchesFound and areasRedacted', () => {
    expect(useAnnotationsSource).toContain('matchesFound');
    expect(useAnnotationsSource).toContain('areasRedacted');
  });
});

// ---------------------------------------------------------------------------
// ViewerApp — redaction prop wiring
// ---------------------------------------------------------------------------

describe('ViewerApp — redaction prop wiring', () => {
  it('passes onRedactSearch to RightContextPanel', () => {
    expect(viewerAppSource).toContain('onRedactSearch={handleRedactSearch}');
  });

  it('passes onRedactMetadata to RightContextPanel', () => {
    expect(viewerAppSource).toContain('onRedactMetadata={handleRedactMetadata}');
  });

  it('destructures handleRedactSearch from useAnnotations', () => {
    expect(viewerAppSource).toContain('handleRedactSearch,');
  });

  it('destructures handleRedactMetadata from useAnnotations', () => {
    expect(viewerAppSource).toContain('handleRedactMetadata,');
  });
});
