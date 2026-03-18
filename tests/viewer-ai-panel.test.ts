// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary and confidential.
// Free for personal, non-commercial use.
// Commercial use requires a valid license.
// See https://pdfluent.com/license for terms.

import { readFileSync } from 'node:fs';
import { describe, it, expect } from 'vitest';

const source = readFileSync(
  new URL('../src/viewer/components/AiPanel.tsx', import.meta.url),
  'utf8'
);

// ---------------------------------------------------------------------------
// AiPanelProps
// ---------------------------------------------------------------------------

describe('AiPanelProps', () => {
  it('declares isOpen boolean', () => {
    const s = source.indexOf('interface AiPanelProps');
    const e = source.indexOf('\n}', s) + 2;
    expect(source.slice(s, e)).toContain('isOpen: boolean');
  });

  it('declares onClose callback', () => {
    const s = source.indexOf('interface AiPanelProps');
    const e = source.indexOf('\n}', s) + 2;
    expect(source.slice(s, e)).toContain('onClose: () => void');
  });

  it('declares documentContext field', () => {
    const s = source.indexOf('interface AiPanelProps');
    const e = source.indexOf('\n}', s) + 2;
    expect(source.slice(s, e)).toContain('documentContext: DocumentAiContext');
  });

  it('declares aiConfig field', () => {
    const s = source.indexOf('interface AiPanelProps');
    const e = source.indexOf('\n}', s) + 2;
    expect(source.slice(s, e)).toContain('aiConfig: AiConfig');
  });

  it('declares onConfigChange callback', () => {
    const s = source.indexOf('interface AiPanelProps');
    const e = source.indexOf('\n}', s) + 2;
    expect(source.slice(s, e)).toContain('onConfigChange:');
  });
});

// ---------------------------------------------------------------------------
// AiPanel component
// ---------------------------------------------------------------------------

describe('AiPanel', () => {
  it('exports AiPanel function', () => {
    expect(source).toContain('export function AiPanel(');
  });

  it('returns null when isOpen is false', () => {
    expect(source).toContain('if (!isOpen) return null');
  });

  it('renders ai-panel root', () => {
    expect(source).toContain('data-testid="ai-panel"');
  });

  it('renders ai-close-btn', () => {
    expect(source).toContain('data-testid="ai-close-btn"');
  });

  it('renders ai-not-configured-notice when not configured', () => {
    expect(source).toContain('data-testid="ai-not-configured-notice"');
  });

  it('renders ai-summarize-section', () => {
    expect(source).toContain('data-testid="ai-summarize-section"');
  });

  it('renders ai-summarize-btn', () => {
    expect(source).toContain('data-testid="ai-summarize-btn"');
  });

  it('renders ai-summarize-result', () => {
    expect(source).toContain('data-testid="ai-summarize-result"');
  });

  it('renders ai-entity-section', () => {
    expect(source).toContain('data-testid="ai-entity-section"');
  });

  it('renders ai-entity-btn', () => {
    expect(source).toContain('data-testid="ai-entity-btn"');
  });

  it('renders ai-entity-result', () => {
    expect(source).toContain('data-testid="ai-entity-result"');
  });

  it('renders ai-annotation-section', () => {
    expect(source).toContain('data-testid="ai-annotation-section"');
  });

  it('renders ai-annotation-text-input', () => {
    expect(source).toContain('data-testid="ai-annotation-text-input"');
  });

  it('renders ai-annotation-suggest-btn', () => {
    expect(source).toContain('data-testid="ai-annotation-suggest-btn"');
  });

  it('renders ai-annotation-result', () => {
    expect(source).toContain('data-testid="ai-annotation-result"');
  });

  it('renders ai-qa-section', () => {
    expect(source).toContain('data-testid="ai-qa-section"');
  });

  it('renders ai-question-input', () => {
    expect(source).toContain('data-testid="ai-question-input"');
  });

  it('renders ai-ask-btn', () => {
    expect(source).toContain('data-testid="ai-ask-btn"');
  });

  it('renders ai-answer-result', () => {
    expect(source).toContain('data-testid="ai-answer-result"');
  });

  it('renders ai-settings-section', () => {
    expect(source).toContain('data-testid="ai-settings-section"');
  });

  it('renders ai-api-key-input', () => {
    expect(source).toContain('data-testid="ai-api-key-input"');
  });

  it('renders ai-model-select', () => {
    expect(source).toContain('data-testid="ai-model-select"');
  });

  it('renders ai-settings-save-btn', () => {
    expect(source).toContain('data-testid="ai-settings-save-btn"');
  });
});

// ---------------------------------------------------------------------------
// Integration checks
// ---------------------------------------------------------------------------

describe('AiPanel AI module integrations', () => {
  it('checks isAiConfigured for conditional rendering', () => {
    expect(source).toContain('isAiConfigured(aiConfig)');
  });

  it('calls makeSummarizationRequest', () => {
    expect(source).toContain('makeSummarizationRequest(');
  });

  it('calls parseSummarizationResponse', () => {
    expect(source).toContain('parseSummarizationResponse(');
  });

  it('calls makeEntityExtractionRequest', () => {
    expect(source).toContain('makeEntityExtractionRequest(');
  });

  it('calls parseEntityResponse', () => {
    expect(source).toContain('parseEntityResponse(');
  });

  it('calls makeAnnotationSuggestionRequest', () => {
    expect(source).toContain('makeAnnotationSuggestionRequest(');
  });

  it('calls isSuggestableText guard', () => {
    expect(source).toContain('isSuggestableText(');
  });

  it('calls makeQaRequest', () => {
    expect(source).toContain('makeQaRequest(');
  });

  it('calls isValidQuestion guard', () => {
    expect(source).toContain('isValidQuestion(');
  });

  it('calls sanitiseQuestion before sending', () => {
    expect(source).toContain('sanitiseQuestion(question)');
  });

  it('calls saveAiConfig on settings save', () => {
    expect(source).toContain('saveAiConfig(updated)');
  });

  it('disables summarize btn when not configured', () => {
    expect(source).toContain('disabled={!configured ||');
  });
});
