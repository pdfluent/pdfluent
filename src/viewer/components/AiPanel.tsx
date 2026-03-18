// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary and confidential.
// Free for personal, non-commercial use.
// Commercial use requires a valid license.
// See https://pdfluent.com/license for terms.

// ---------------------------------------------------------------------------
// AI Panel
//
// Side-panel exposing all document intelligence AI features:
// summarization, entity extraction, annotation suggestions, and Q&A.
//
// AI features are opt-in. When no API key is configured the panel shows
// a notice and the settings section for key entry.
// ---------------------------------------------------------------------------

import React, { useCallback, useState } from 'react';
import type { AiConfig, AiResponse } from '../ai/aiProvider';
import { isAiConfigured, saveAiConfig } from '../ai/aiProvider';
import type { DocumentAiContext } from '../ai/documentContextBuilder';
import { makeSummarizationRequest, parseSummarizationResponse } from '../ai/summarizationModule';
import { makeEntityExtractionRequest, parseEntityResponse } from '../ai/entityExtractionModule';
import {
  makeAnnotationSuggestionRequest,
  parseAnnotationSuggestion,
  isSuggestableText,
} from '../ai/annotationAssistModule';
import {
  makeQaRequest,
  parseQaResponse,
  isValidQuestion,
  sanitiseQuestion,
} from '../ai/questionAnswerModule';

export interface AiPanelProps {
  isOpen: boolean;
  onClose: () => void;
  documentContext: DocumentAiContext;
  aiConfig: AiConfig;
  onConfigChange: (config: AiConfig) => void;
}

export function AiPanel({
  isOpen,
  onClose,
  documentContext,
  aiConfig,
  onConfigChange,
}: AiPanelProps): React.ReactElement | null {
  if (!isOpen) return null;

  const configured = isAiConfigured(aiConfig);

  // --- Summarization state ---
  const [summaryResult, setSummaryResult] = useState<string>('');
  const [summaryLoading, setSummaryLoading] = useState(false);

  // --- Entity state ---
  const [entityResult, setEntityResult] = useState<string>('');
  const [entityLoading, setEntityLoading] = useState(false);

  // --- Annotation assist state ---
  const [annotationText, setAnnotationText] = useState('');
  const [annotationResult, setAnnotationResult] = useState<string>('');
  const [annotationLoading, setAnnotationLoading] = useState(false);

  // --- Q&A state ---
  const [question, setQuestion] = useState('');
  const [answerResult, setAnswerResult] = useState<string>('');
  const [qaLoading, setQaLoading] = useState(false);

  // --- Settings state ---
  const [draftApiKey, setDraftApiKey] = useState(aiConfig.apiKey);
  const [draftModel, setDraftModel] = useState(aiConfig.model);

  const handleSummarize = useCallback(async () => {
    if (!configured) return;
    setSummaryLoading(true);
    const response: AiResponse = await makeSummarizationRequest(documentContext, aiConfig);
    if (response.success) {
      const parsed = parseSummarizationResponse(response.content);
      setSummaryResult(parsed.summary);
    } else {
      setSummaryResult(response.error ?? 'Fout bij samenvatten');
    }
    setSummaryLoading(false);
  }, [configured, documentContext, aiConfig]);

  const handleExtractEntities = useCallback(async () => {
    if (!configured) return;
    setEntityLoading(true);
    const response: AiResponse = await makeEntityExtractionRequest(documentContext, aiConfig);
    if (response.success) {
      const parsed = parseEntityResponse(response.content);
      setEntityResult(`${parsed.entities.length} entiteit(en) gevonden`);
    } else {
      setEntityResult(response.error ?? 'Fout bij extractie');
    }
    setEntityLoading(false);
  }, [configured, documentContext, aiConfig]);

  const handleAnnotationSuggest = useCallback(async () => {
    if (!configured || !isSuggestableText(annotationText)) return;
    setAnnotationLoading(true);
    const response: AiResponse = await makeAnnotationSuggestionRequest(
      annotationText,
      documentContext,
      aiConfig,
    );
    if (response.success) {
      const parsed = parseAnnotationSuggestion(response.content);
      setAnnotationResult(parsed.text);
    } else {
      setAnnotationResult(response.error ?? 'Fout bij suggestie');
    }
    setAnnotationLoading(false);
  }, [configured, annotationText, documentContext, aiConfig]);

  const handleAsk = useCallback(async () => {
    if (!configured || !isValidQuestion(question)) return;
    setQaLoading(true);
    const safe = sanitiseQuestion(question);
    const response: AiResponse = await makeQaRequest(safe, documentContext, aiConfig);
    if (response.success) {
      const parsed = parseQaResponse(response.content);
      setAnswerResult(parsed.answer);
    } else {
      setAnswerResult(response.error ?? 'Fout bij beantwoorden');
    }
    setQaLoading(false);
  }, [configured, question, documentContext, aiConfig]);

  const handleSaveSettings = useCallback(() => {
    const updated: AiConfig = { ...aiConfig, apiKey: draftApiKey, model: draftModel };
    saveAiConfig(updated);
    onConfigChange(updated);
  }, [aiConfig, draftApiKey, draftModel, onConfigChange]);

  return (
    <div data-testid="ai-panel" className="ai-panel">
      <div className="ai-panel__header">
        <button
          data-testid="ai-close-btn"
          onClick={onClose}
          className="ai-panel__close"
          aria-label="Sluit AI panel"
        >
          ×
        </button>
      </div>

      {!configured && (
        <div data-testid="ai-not-configured-notice" className="ai-panel__notice">
          Configureer een API-sleutel om AI-functies te gebruiken.
        </div>
      )}

      {/* Summarization */}
      <section data-testid="ai-summarize-section" className="ai-panel__section">
        <h3>Samenvatten</h3>
        <button
          data-testid="ai-summarize-btn"
          onClick={handleSummarize}
          disabled={!configured || summaryLoading}
          className="ai-panel__btn"
        >
          {summaryLoading ? 'Bezig...' : 'Samenvatten'}
        </button>
        {summaryResult && (
          <p data-testid="ai-summarize-result" className="ai-panel__result">
            {summaryResult}
          </p>
        )}
      </section>

      {/* Entity extraction */}
      <section data-testid="ai-entity-section" className="ai-panel__section">
        <h3>Entiteiten extraheren</h3>
        <button
          data-testid="ai-entity-btn"
          onClick={handleExtractEntities}
          disabled={!configured || entityLoading}
          className="ai-panel__btn"
        >
          {entityLoading ? 'Bezig...' : 'Extraheren'}
        </button>
        {entityResult && (
          <p data-testid="ai-entity-result" className="ai-panel__result">
            {entityResult}
          </p>
        )}
      </section>

      {/* Annotation assist */}
      <section data-testid="ai-annotation-section" className="ai-panel__section">
        <h3>Annotatie suggestie</h3>
        <input
          data-testid="ai-annotation-text-input"
          type="text"
          value={annotationText}
          onChange={e => setAnnotationText(e.target.value)}
          placeholder="Geselecteerde tekst..."
          className="ai-panel__input"
        />
        <button
          data-testid="ai-annotation-suggest-btn"
          onClick={handleAnnotationSuggest}
          disabled={!configured || !isSuggestableText(annotationText) || annotationLoading}
          className="ai-panel__btn"
        >
          {annotationLoading ? 'Bezig...' : 'Suggestie'}
        </button>
        {annotationResult && (
          <p data-testid="ai-annotation-result" className="ai-panel__result">
            {annotationResult}
          </p>
        )}
      </section>

      {/* Q&A */}
      <section data-testid="ai-qa-section" className="ai-panel__section">
        <h3>Vraag stellen</h3>
        <input
          data-testid="ai-question-input"
          type="text"
          value={question}
          onChange={e => setQuestion(e.target.value)}
          placeholder="Stel een vraag over dit document..."
          className="ai-panel__input"
        />
        <button
          data-testid="ai-ask-btn"
          onClick={handleAsk}
          disabled={!configured || !isValidQuestion(question) || qaLoading}
          className="ai-panel__btn"
        >
          {qaLoading ? 'Bezig...' : 'Vragen'}
        </button>
        {answerResult && (
          <p data-testid="ai-answer-result" className="ai-panel__result">
            {answerResult}
          </p>
        )}
      </section>

      {/* Settings */}
      <section data-testid="ai-settings-section" className="ai-panel__section">
        <h3>Instellingen</h3>
        <input
          data-testid="ai-api-key-input"
          type="password"
          value={draftApiKey}
          onChange={e => setDraftApiKey(e.target.value)}
          placeholder="sk-ant-..."
          className="ai-panel__input"
        />
        <select
          data-testid="ai-model-select"
          value={draftModel}
          onChange={e => setDraftModel(e.target.value)}
          className="ai-panel__select"
        >
          <option value="claude-haiku-4-5-20251001">Claude Haiku (snel)</option>
          <option value="claude-sonnet-4-6">Claude Sonnet (slim)</option>
        </select>
        <button
          data-testid="ai-settings-save-btn"
          onClick={handleSaveSettings}
          className="ai-panel__btn"
        >
          Opslaan
        </button>
      </section>
    </div>
  );
}
