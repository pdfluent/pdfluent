// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary. The PDFluent application is free to use,
// including for commercial purposes. Redistribution, or extraction or reuse
// of its components (including the embedded PDF engine), requires a licence.
// See https://pdfluent.com/license for terms.

import { isTauriRuntime } from '../../lib/tauri-detection';
import { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import type { ReactNode } from 'react';
import { ChevronRightIcon, CheckIcon, XIcon, TrashIcon, PencilIcon, EyeIcon, EyeOffIcon, BoldIcon, ItalicIcon, UnderlineIcon, StrikethroughIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { AnnotationAppearance, ViewerMode } from '../types';
import { DEFAULT_ANNOTATION_APPEARANCE } from '../types';
import type { PdfDocument, DocumentPermissions, FormField, FormFieldType, FormFieldValue, Annotation } from '../../core/document';
import type { TextParagraphTarget } from '../text/textInteractionModel';
import type { AnnotationTool } from './ModeToolbar';
import { useTaskQueueContext } from '../context/TaskQueueContext';
import { SignaturePanel } from './SignaturePanel';
import { getOcrStatus, type OcrRuntimeStatus } from '../../lib/tauri-api';

// ---------------------------------------------------------------------------
// Shared shell
// ---------------------------------------------------------------------------

interface RightContextPanelProps {
  mode: ViewerMode;
  pdfDoc: PdfDocument | null;
  pageCount: number;
  formFields: FormField[];
  comments: Annotation[];
  /** Index of the currently active comment (−1 = none). */
  activeCommentIdx: number;
  /** Called when the user clicks a comment item in the panel. */
  onCommentSelect: (idx: number) => void;
  /** Delete the comment with the given annotation id from the PDF. */
  onDeleteComment: (annotationId: string) => void;
  /** Update the text contents of the comment with the given annotation id. */
  onUpdateComment: (annotationId: string, newContents: string) => void;
  /** Reviewer name used when creating new annotations. */
  authorName: string;
  /** Called when the reviewer name changes — persists to localStorage. */
  onAuthorChange: (name: string) => void;
  /** Index of the currently active form field (−1 = none). */
  activeFieldIdx: number;
  /** Called when the user clicks a field item in the panel. */
  onFieldSelect: (idx: number) => void;
  /** Called when the user saves a new value for a form field. */
  onSetFieldValue: (fieldId: string, value: FormFieldValue) => void;
  /** Per-field validation errors from the last form submit attempt. */
  formValidationErrors: Array<{ fieldId: string; errors: string[] }>;
  /** Called when the user clicks the "Formulier opslaan" submit button. */
  onFormSubmit: () => void;
  /** Called when the user edits a metadata field in the document info panel. */
  onMetadataChange: (key: 'title' | 'author' | 'subject' | 'keywords', value: string) => void;
  /** The currently selected markup annotation (highlight/underline/strikeout/rectangle). */
  selectedAnnotation?: Annotation | null;
  activeAnnotationTool?: AnnotationTool;
  annotationAppearance?: AnnotationAppearance;
  onAnnotationAppearanceChange?: (appearance: AnnotationAppearance) => void;
  /** Delete the selected markup annotation. */
  onDeleteSelectedAnnotation?: (annotationId: string) => void;
  /** Update the color of the selected markup annotation. */
  onUpdateAnnotationColor?: (annotationId: string, color: [number, number, number]) => void;
  /** All redaction annotations across all pages (type === 'redaction'). */
  redactions?: Annotation[];
  /** Permanently apply all pending redactions. */
  onApplyRedactions?: () => void;
  /** Called after a watermark is applied so the host can re-render + mark dirty. */
  onWatermarkApplied?: () => void;
  /** Delete a single redaction annotation by id. */
  onDeleteRedaction?: (annotationId: string) => void;
  /** Jump to the page containing a redaction (0-based pageIndex). */
  onJumpToRedaction?: (pageIndex: number) => void;
  /** Toggle the resolved/open status of a comment. */
  onToggleResolved?: (annotationId: string) => void;
  /** Add a reply to a comment thread. */
  onAddReply?: (annotationId: string, contents: string, author: string) => void;
  /** Delete a reply from a comment thread. */
  onDeleteReply?: (annotationId: string, replyId: string) => void;
  /** Jump to the next comment in the list. */
  onNextComment?: () => void;
  /** Jump to the previous comment in the list. */
  onPrevComment?: () => void;
  /** Mark all comments as resolved. */
  onResolveAll?: () => void;
  /** Delete all comments whose status is resolved. */
  onDeleteAllResolved?: () => void;
  /** Set of 0-based page indices detected as scanned (no native text layer). */
  scannedPageIndices?: Set<number>;
  /** Run OCR on scanned pages or on all pages. */
  onRunOcr?: (options: { language: string; scope: 'scanned' | 'all'; preprocessMode: 'off' | 'auto' | 'manual' }) => void;
  /** Whether an OCR run is currently in progress. */
  ocrRunning?: boolean;
  /** Whether the OCR overlay is visible. */
  ocrVisible?: boolean;
  /** Callback to toggle OCR overlay visibility. */
  onOcrVisibleChange?: (v: boolean) => void;
  /** Confidence threshold for OCR overlay (0–1). */
  ocrConfidenceThreshold?: number;
  /** Callback to change OCR confidence threshold. */
  onOcrConfidenceChange?: (v: number) => void;
  /** Search-and-redact: finds all occurrences of a query and marks as redactions. */
  onRedactSearch?: (query: string) => Promise<{ matchesFound: number; areasRedacted: number } | null>;
  /** Permanently strip document metadata. */
  onRedactMetadata?: () => Promise<boolean>;
  /** Validate the current document against PDF/A. */
  onValidatePdfA?: (level: '1b' | '2b' | '3b') => Promise<void>;
  /** Convert the current document to PDF/A. */
  onConvertPdfA?: (level: '1b' | '2b' | '3b') => Promise<void>;
  /** Whether PDF/A validation/conversion is running. */
  pdfaBusy?: boolean;
  /** Last PDF/A workflow status. */
  pdfaStatus?: PdfAWorkflowStatus | null;
  /** Opens the export/download dialog — surfaced inside PdfAPanel after conversion. */
  onExportOpen?: () => void;
  /** The currently selected text paragraph in edit mode. */
  selectedTextTarget?: TextParagraphTarget | null;
  /** Active editor format states. */
  formatState?: { isBold: boolean; isItalic: boolean; isUnderline: boolean; isStrikethrough: boolean };
  /** Trigger editor formatting commands. */
  onFormatCommand?: (command: string, value?: string) => void;
  /** Callback to close the panel. */
  onClose?: () => void;
}

export interface PdfAWorkflowStatus {
  kind: 'idle' | 'success' | 'error';
  message: string;
  isValid?: boolean;
}

function CollapsibleSection({
  title,
  children,
  badge,
  defaultOpen = true,
}: {
  title: string;
  children: ReactNode;
  badge?: ReactNode;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <section className="contextpanel-section">
      <button
        type="button"
        onClick={() => {
          setOpen((o) => !o);
        }}
        className="contextpanel-section-header"
        aria-expanded={open}
      >
        <span className="contextpanel-section-header-left">
          <ChevronRightIcon
            className={
              open
                ? 'contextpanel-section-chevron is-open'
                : 'contextpanel-section-chevron'
            }
            aria-hidden="true"
          />
          <span className="contextpanel-section-title">{title}</span>
        </span>
        {badge}
      </button>
      <div className="contextpanel-section-body" hidden={!open}>
        {children}
      </div>
    </section>
  );
}

function PlaceholderText({ text }: { text: string }) {
  return <p className="contextpanel-empty">{text}</p>;
}

// ---------------------------------------------------------------------------
// Read mode — Documentinfo
// ---------------------------------------------------------------------------

const XFA_TYPE_LABEL_KEYS: Record<string, string> = {
  static:  'docInfo.xfaStatic',
  dynamic: 'docInfo.xfaDynamic',
  hybrid:  'docInfo.xfaHybrid',
};

function MetadataInfo({
  pdfDoc,
  pageCount,
  formFields,
  onMetadataChange,
}: {
  pdfDoc: PdfDocument | null;
  pageCount: number;
  formFields: FormField[];
  onMetadataChange: (key: 'title' | 'author' | 'subject' | 'keywords', value: string) => void;
}) {
  const { t } = useTranslation();

  if (!pdfDoc) {
    return <PlaceholderText text={t('docInfo.noDocument')} />;
  }

  const title  = pdfDoc.metadata.title?.trim()  || pdfDoc.fileName || '';
  const author = pdfDoc.metadata.author?.trim() || '';

  // Page dimensions — convert from points (1 pt = 25.4/72 mm) to whole millimetres
  const page0 = pdfDoc.pages[0];
  const dimensions = page0
    ? `${Math.round(page0.size.width * 25.4 / 72)} × ${Math.round(page0.size.height * 25.4 / 72)} mm`
    : '—';

  // Form type — prefer XFA metadata, fall back to AcroForm field count
  const xfaKey = XFA_TYPE_LABEL_KEYS[pdfDoc.metadata.xfaFormType ?? ''];
  const formType = pdfDoc.metadata.hasXfa
    ? (xfaKey !== undefined ? t(xfaKey) : 'XFA')
    : formFields.length > 0
      ? 'AcroForm'
      : t('docInfo.noForms');

  // PDF version — e.g. "1.7" or "2.0"
  const pdfVersion = pdfDoc.metadata.pdfVersion?.trim() || '—';

  // Creation date — format as short local date; fall back to '—' for invalid dates
  const creationDate = pdfDoc.metadata.creationDate;
  const creationDateStr = creationDate instanceof Date && !isNaN(creationDate.getTime())
    ? creationDate.toLocaleDateString()
    : '—';

  return (
    <div className="space-y-2 text-sm" data-testid="doc-info-panel">
      <div>
        <label className="text-xs text-muted-foreground mb-1 block">{t('docInfo.title')}</label>
        <input
          data-testid="metadata-title-input"
          className="w-full text-sm text-foreground bg-card border border-border rounded-md p-2 outline-none focus:ring-1 focus:ring-primary truncate"
          defaultValue={title}
          onBlur={(e) => { onMetadataChange('title', e.currentTarget.value); }}
        />
      </div>
      <div>
        <label className="text-xs text-muted-foreground mb-1 block">{t('docInfo.author')}</label>
        <input
          data-testid="metadata-author-input"
          className="w-full text-sm text-foreground bg-card border border-border rounded-md p-2 outline-none focus:ring-1 focus:ring-primary"
          defaultValue={author}
          onBlur={(e) => { onMetadataChange('author', e.currentTarget.value); }}
        />
      </div>
      <div className="flex justify-between">
        <span className="text-muted-foreground">{t('docInfo.pages')}</span>
        <span className="text-foreground" data-testid="doc-info-page-count">{pageCount}</span>
      </div>
      <div className="flex justify-between">
        <span className="text-muted-foreground">{t('docInfo.dimensions')}</span>
        <span className="text-foreground" data-testid="doc-info-dimensions">{dimensions}</span>
      </div>
      <div className="flex justify-between">
        <span className="text-muted-foreground">{t('docInfo.formType')}</span>
        <span className="text-foreground" data-testid="doc-info-form-type">{formType}</span>
      </div>
      <div className="flex justify-between">
        <span className="text-muted-foreground">{t('docInfo.pdfVersion')}</span>
        <span className="text-foreground" data-testid="doc-info-pdf-version">{pdfVersion}</span>
      </div>
      <div className="flex justify-between">
        <span className="text-muted-foreground">{t('docInfo.created')}</span>
        <span className="text-foreground" data-testid="doc-info-creation-date">{creationDateStr}</span>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Protect mode — Beveiligingsinstellingen (Encrypt / Decrypt)
// ---------------------------------------------------------------------------

const isTauri = isTauriRuntime();

function EncryptDecryptControls() {
  const { t } = useTranslation();
  const { push, update } = useTaskQueueContext();
  const [userPassword, setUserPassword] = useState('');
  const [ownerPassword, setOwnerPassword] = useState('');
  const [decryptPassword, setDecryptPassword] = useState('');
  const [busy, setBusy] = useState(false);

  async function handleEncrypt(): Promise<void> {
    if (busy || !isTauri || !userPassword) return;
    setBusy(true);

    const { save } = await import('@tauri-apps/plugin-dialog');
    const path = await save({ filters: [{ name: 'PDF', extensions: ['pdf'] }] });
    if (!path) { setBusy(false); return; }

    const taskId = `encrypt-${Date.now()}`;
    push({ id: taskId, label: t('tasks.encryptRunning'), progress: null, status: 'running' });

    try {
      const { invoke } = await import('@tauri-apps/api/core');
      await invoke('encrypt_pdf', { userPassword, ownerPassword, outputPath: path });
      update(taskId, { status: 'done', label: t('tasks.encryptDone') });
      setUserPassword('');
      setOwnerPassword('');
    } catch {
      update(taskId, { status: 'error', label: t('tasks.encryptFailed') });
    }

    setBusy(false);
  }

  async function handleDecrypt(): Promise<void> {
    if (busy || !isTauri || !decryptPassword) return;
    setBusy(true);

    const taskId = `decrypt-${Date.now()}`;
    push({ id: taskId, label: t('tasks.decryptRunning'), progress: null, status: 'running' });

    try {
      const { invoke } = await import('@tauri-apps/api/core');
      await invoke('decrypt_pdf', { password: decryptPassword });
      update(taskId, { status: 'done', label: t('tasks.decryptDone') });
      setDecryptPassword('');
    } catch {
      update(taskId, { status: 'error', label: t('tasks.decryptFailed') });
    }

    setBusy(false);
  }

  const inputClass =
    'w-full text-sm bg-card border border-border rounded-md p-2 text-foreground placeholder:text-muted-foreground/50 outline-none focus:ring-1 focus:ring-primary';
  const buttonClass =
    'w-full mt-2 py-2 text-sm font-medium rounded-md bg-primary text-primary-foreground hover:opacity-90 transition-opacity disabled:opacity-40 disabled:cursor-not-allowed';

  return (
    <div className="flex flex-col gap-4">
      {/* Encrypt */}
      <div className="flex flex-col gap-1.5">
        <span className="text-xs font-medium text-muted-foreground">{t('protect.encrypt')}</span>
        <input
          type="password"
          placeholder={t('protect.userPasswordPlaceholder')}
          value={userPassword}
          onChange={e => { setUserPassword(e.target.value); }}
          className={inputClass}
          aria-label={t('protect.userPasswordPlaceholder')}
        />
        <input
          type="password"
          placeholder={t('protect.ownerPasswordPlaceholder')}
          value={ownerPassword}
          onChange={e => { setOwnerPassword(e.target.value); }}
          className={inputClass}
          aria-label={t('protect.ownerPasswordPlaceholder')}
        />
        <button
          onClick={() => { void handleEncrypt(); }}
          disabled={busy || !userPassword || !isTauri}
          className={buttonClass}
        >
          {t('protect.encryptBtn')}
        </button>
      </div>

      {/* Decrypt */}
      <div className="flex flex-col gap-1.5">
        <span className="text-xs font-medium text-muted-foreground">{t('protect.decrypt')}</span>
        <input
          type="password"
          placeholder={t('protect.currentPasswordPlaceholder')}
          value={decryptPassword}
          onChange={e => { setDecryptPassword(e.target.value); }}
          className={inputClass}
          aria-label={t('protect.currentPasswordPlaceholder')}
        />
        <button
          onClick={() => { void handleDecrypt(); }}
          disabled={busy || !decryptPassword || !isTauri}
          className={buttonClass}
        >
          {t('protect.decryptBtn')}
        </button>
      </div>
    </div>
  );
}

/** Apply a text watermark to every page. Backend supports text + opacity only
 *  (no rotation/position), so the UI exposes exactly those. On success it calls
 *  onApplied so the host re-renders the (now mutated) document and marks dirty. */
function WatermarkControls({ onApplied }: { onApplied?: () => void }) {
  const { t } = useTranslation();
  const { push, update } = useTaskQueueContext();
  const [text, setText] = useState('');
  const [opacity, setOpacity] = useState(0.3);
  const [busy, setBusy] = useState(false);

  async function handleApply(): Promise<void> {
    const trimmed = text.trim();
    if (busy || !isTauri || trimmed.length === 0) return;
    setBusy(true);
    const taskId = `watermark-${Date.now()}`;
    push({ id: taskId, label: t('tasks.watermarkRunning'), progress: null, status: 'running' });
    try {
      const { invoke } = await import('@tauri-apps/api/core');
      await invoke('add_watermark', { text: trimmed, opacity });
      update(taskId, { status: 'done', label: t('tasks.watermarkDone') });
      onApplied?.();
    } catch {
      update(taskId, { status: 'error', label: t('tasks.watermarkFailed') });
    }
    setBusy(false);
  }

  const inputClass =
    'w-full text-sm bg-card border border-border rounded-md p-2 text-foreground placeholder:text-muted-foreground/50 outline-none focus:ring-1 focus:ring-primary';
  const buttonClass =
    'w-full mt-2 py-2 text-sm font-medium rounded-md bg-primary text-primary-foreground hover:opacity-90 transition-opacity disabled:opacity-40 disabled:cursor-not-allowed';

  return (
    <div className="flex flex-col gap-3">
      <input
        type="text"
        placeholder={t('rightPanel.watermarkPlaceholder')}
        value={text}
        onChange={e => { setText(e.target.value); }}
        className={inputClass}
        aria-label={t('toolbar.watermark')}
      />
      <div className="flex flex-col gap-1.5">
        <span className="text-xs font-medium text-muted-foreground">
          {t('rightPanel.watermarkOpacity')}: {Math.round(opacity * 100)}%
        </span>
        <input
          type="range"
          min={5}
          max={100}
          step={5}
          value={Math.round(opacity * 100)}
          onChange={e => { setOpacity(parseInt(e.target.value, 10) / 100); }}
          className="w-full accent-primary"
          aria-label={t('rightPanel.watermarkOpacity')}
        />
      </div>
      <button
        onClick={() => { void handleApply(); }}
        disabled={busy || !isTauri || text.trim().length === 0}
        className={buttonClass}
      >
        {t('rightPanel.watermarkApply')}
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Protect mode — Machtigingen (Permissions)
// ---------------------------------------------------------------------------

const PERMISSION_LABEL_KEYS: ReadonlyArray<[keyof DocumentPermissions, string]> = [
  ['canPrint',           'protect.permCanPrint'],
  ['canPrintHighQuality','protect.permCanPrintHighQuality'],
  ['canModify',          'protect.permCanModify'],
  ['canCopy',            'protect.permCanCopy'],
  ['canAnnotate',        'protect.permCanAnnotate'],
  ['canFillForms',       'protect.permCanFillForms'],
  ['canExtractContent',  'protect.permCanExtractContent'],
  ['canAssemble',        'protect.permCanAssemble'],
];

function PermissionsDisplay({ permissions }: { permissions: DocumentPermissions | null }) {
  const { t } = useTranslation();

  if (!permissions) {
    return <PlaceholderText text={t('protect.noDocument')} />;
  }

  return (
    <div className="flex flex-col gap-1">
      {PERMISSION_LABEL_KEYS.map(([key, labelKey]) => (
        <div key={key} className="flex items-center gap-1.5">
          {permissions[key] ? (
            <CheckIcon className="w-3 h-3 text-green-500 shrink-0" />
          ) : (
            <XIcon className="w-3 h-3 text-destructive shrink-0" />
          )}
          <span className="text-xs text-foreground">{t(labelKey)}</span>
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Forms mode — Formuliervelden
// ---------------------------------------------------------------------------

const FIELD_TYPE_LABEL_KEYS: Record<FormFieldType, string> = {
  text: 'leftNav.fieldTypeText',
  checkbox: 'leftNav.fieldTypeCheckbox',
  radio: 'leftNav.fieldTypeRadio',
  list: 'leftNav.fieldTypeList',
  combo: 'leftNav.fieldTypeCombo',
  signature: 'leftNav.fieldTypeSignature',
  button: 'leftNav.fieldTypeButton',
  date: 'leftNav.fieldTypeDate',
  time: 'leftNav.fieldTypeTime',
  number: 'leftNav.fieldTypeNumber',
  password: 'leftNav.fieldTypePassword',
  file: 'leftNav.fieldTypeFile',
  barcode: 'leftNav.fieldTypeBarcode',
  'rich-text': 'leftNav.fieldTypeRichText',
};

/** Field types that support the inline text input in this release. */
const TEXT_LIKE_TYPES: ReadonlySet<FormFieldType> = new Set(['text', 'number', 'date', 'time', 'combo', 'list']);

/** Field types with a boolean checked/unchecked state that toggle on click. */
const CHECKBOX_TYPES: ReadonlySet<FormFieldType> = new Set(['checkbox', 'radio']);

const isDesktopRuntime = (): boolean =>
  isTauriRuntime();

function FormsModeContent({
  formFields,
  activeFieldIdx,
  onFieldSelect,
  onSetFieldValue,
  formValidationErrors,
  onFormSubmit,
}: {
  formFields: FormField[];
  activeFieldIdx: number;
  onFieldSelect: (idx: number) => void;
  onSetFieldValue: (fieldId: string, value: FormFieldValue) => void;
  formValidationErrors: Array<{ fieldId: string; errors: string[] }>;
  onFormSubmit: () => void;
}) {
  const { t } = useTranslation();
  const activeItemRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    activeItemRef.current?.scrollIntoView({ block: 'nearest' });
  }, [activeFieldIdx]);

  // Edit buffer — resets whenever the active field changes or is saved
  const [editValue, setEditValue] = useState('');
  useEffect(() => {
    const f = formFields[activeFieldIdx];
    setEditValue(f ? (Array.isArray(f.value) ? f.value.join(', ') : String(f.value ?? '')) : '');
  }, [activeFieldIdx, formFields]);

  // Quick lookup: fieldId → validation error strings from the last submit attempt
  const errorMap = useMemo(
    () => new Map(formValidationErrors.map(e => [e.fieldId, e.errors])),
    [formValidationErrors]
  );

  // Check if any field has a truthy value (non-empty string, non-false boolean, etc.)
  function isFieldFilled(field: FormField): boolean {
    const v = field.value;
    if (typeof v === 'boolean') return v;
    if (typeof v === 'string') return v.trim().length > 0;
    if (typeof v === 'number') return !isNaN(v);
    if (Array.isArray(v)) return v.length > 0;
    return false;
  }

  const filledRequired = formFields.filter(f => f.required && isFieldFilled(f));
  const requiredCount = formFields.filter(f => f.required).length;

  if (formFields.length === 0) {
    return (
      <div className="flex flex-col gap-2" data-testid="forms-empty-state">
        <PlaceholderText text={t('forms.noFieldsBrowserHint')} />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-0.5">
      {/* Completion summary — always visible */}
      <p data-testid="forms-completion-summary" className="text-xs text-muted-foreground mb-1">
        {formFields.some(f => f.required)
          ? t('forms.completionRequired', { filled: filledRequired.length, total: requiredCount })
          : t('forms.completionCount', { count: formFields.length })}
      </p>
      {formFields.map((field, idx) => {
        const isActive = idx === activeFieldIdx;
        const filled = isFieldFilled(field);
        // Text-like and option-select fields get the inline text/value input when active
        const canEdit = isActive && TEXT_LIKE_TYPES.has(field.type) && !field.readOnly;
        return (
          <div
            key={field.id}
            data-testid="forms-field-item"
            ref={(el) => { if (isActive) { activeItemRef.current = el; } }}
            onClick={() => {
              if (CHECKBOX_TYPES.has(field.type) && !field.readOnly) {
                // Checkbox/radio: select and toggle in one click
                if (!isActive) onFieldSelect(idx);
                onSetFieldValue(field.id, !(field.value as boolean));
              } else if (!isActive) {
                onFieldSelect(idx);
              }
            }}
            className={`w-full text-left flex flex-col gap-0.5 py-1 px-1.5 rounded border-b border-border last:border-b-0 transition-colors cursor-pointer ${
              isActive ? 'bg-primary/5 ring-1 ring-primary/40' : 'hover:bg-muted/30'
            }`}
          >
            <div className="flex items-center gap-1">
              <span
                className="text-xs font-medium text-foreground/90 truncate flex-1"
                title={field.label || field.name}
              >
                {field.label || field.name}
              </span>
              {field.required && (
                <span data-testid="field-required-badge" className="text-[9px] text-destructive font-bold">*</span>
              )}
              {errorMap.has(field.id) && (
                <span data-testid="field-error-badge" className="text-[9px] text-destructive font-bold shrink-0">!</span>
              )}
              {filled ? (
                <span data-testid="field-filled-indicator" className="w-1.5 h-1.5 rounded-full bg-green-500 shrink-0" />
              ) : field.required ? (
                <span data-testid="field-empty-required-indicator" className="w-1.5 h-1.5 rounded-full bg-amber-400 shrink-0" />
              ) : null}
            </div>
            <div className="flex items-center gap-1.5">
              <span className="text-[9px] font-medium px-1 py-0.5 rounded bg-muted text-muted-foreground uppercase tracking-wide">
                {t(FIELD_TYPE_LABEL_KEYS[field.type] ?? field.type)}
              </span>
              <span className="text-[9px] text-muted-foreground/60">p.{field.pageIndex + 1}</span>
            </div>
            {/* Checkbox/radio value indicator — always visible for boolean field types */}
            {CHECKBOX_TYPES.has(field.type) && (
              <div className="mt-0.5 flex items-center gap-1.5">
                <span
                  data-testid="field-checkbox-indicator"
                  className={`w-3 h-3 ${field.type === 'radio' ? 'rounded-full' : 'rounded-sm'} border flex items-center justify-center shrink-0 ${
                    field.value ? 'bg-primary border-primary' : 'border-border bg-card'
                  }`}
                >
                  {field.value && field.type === 'checkbox' && <CheckIcon className="w-2 h-2 text-primary-foreground" />}
                </span>
                <span className="text-xs text-foreground/60">
                  {field.value ? t('forms.enabled') : t('forms.disabled')}
                </span>
              </div>
            )}
            {/* Inline validation error — shown after a failed submit attempt */}
            {errorMap.has(field.id) && (
              <p data-testid="field-validation-error" className="text-[9px] text-destructive mt-0.5">
                {errorMap.get(field.id)!.join(', ')}
              </p>
            )}
            {/* Inline text input — only for active, editable, text-like or option-select fields */}
            {canEdit && (
              <input
                data-testid="field-value-input"
                type="text"
                value={editValue}
                onChange={e => { setEditValue(e.target.value); }}
                onClick={e => { e.stopPropagation(); }}
                onKeyDown={e => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    e.stopPropagation();
                    onSetFieldValue(field.id, editValue);
                  } else if (e.key === 'Escape') {
                    e.stopPropagation();
                    // Cancel: reset to the current saved value, do not call onSetFieldValue
                    setEditValue(Array.isArray(field.value) ? field.value.join(', ') : String(field.value ?? ''));
                  }
                }}
                placeholder={t('forms.valuePrompt')}
                aria-label={t('forms.valueAriaLabel', { name: field.label || field.name })}
                className="mt-0.5 w-full text-xs bg-card border border-primary/50 rounded px-2 py-0.5 text-foreground outline-none focus:ring-1 focus:ring-primary focus:border-primary"
              />
            )}
          </div>
        );
      })}

      {/* Submit / save button — always visible when there are form fields */}
      <button
        data-testid="form-submit-btn"
        onClick={() => { void onFormSubmit(); }}
        className="contextpanel-action contextpanel-action-primary"
      >
        {t('forms.saveForm')}
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Review mode — Reply input
// ---------------------------------------------------------------------------

function ReplyInput({
  annotationId,
  authorName,
  onAddReply,
}: {
  annotationId: string;
  authorName: string;
  onAddReply?: (annotationId: string, contents: string, author: string) => void;
}) {
  const { t } = useTranslation();
  const [replyText, setReplyText] = useState('');
  const [open, setOpen] = useState(false);

  function handleSubmit() {
    const trimmed = replyText.trim();
    if (!trimmed) return;
    onAddReply?.(annotationId, trimmed, authorName);
    setReplyText('');
    setOpen(false);
  }

  if (!open) {
    return (
      <button
        data-testid="reply-toggle-btn"
        onClick={e => { e.stopPropagation(); setOpen(true); }}
        className="mt-0.5 text-[9px] text-muted-foreground/50 hover:text-primary transition-colors"
      >
        {t('review.reply')}
      </button>
    );
  }

  return (
    <div className="mt-0.5 flex flex-col gap-1" data-testid="reply-input-area" onClick={e => { e.stopPropagation(); }}>
      <textarea
        data-testid="reply-textarea"
        value={replyText}
        onChange={e => { setReplyText(e.target.value); }}
        rows={2}
        placeholder={t('review.replyPlaceholder')}
        autoFocus
        className="w-full text-[9px] bg-card border border-border rounded px-2 py-1 text-foreground resize-none outline-none focus:ring-1 focus:ring-primary"
      />
      <div className="flex gap-1">
        <button
          data-testid="reply-submit-btn"
          onClick={handleSubmit}
          disabled={!replyText.trim()}
          className="contextpanel-action contextpanel-action-primary"
        >
          {t('review.send')}
        </button>
        <button
          data-testid="reply-cancel-btn"
          onClick={e => { e.stopPropagation(); setOpen(false); setReplyText(''); }}
          className="contextpanel-action"
        >
          {t('common.cancel')}
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// OCR panel — run PaddleOCR on scanned pages
// ---------------------------------------------------------------------------

function OcrPanel({
  scannedPageIndices,
  onRunOcr,
  ocrRunning,
  ocrVisible = true,
  onOcrVisibleChange,
  ocrConfidenceThreshold = 0.6,
  onOcrConfidenceChange,
  available = isDesktopRuntime(),
}: {
  scannedPageIndices: Set<number>;
  onRunOcr?: (options: { language: string; scope: 'scanned' | 'all'; preprocessMode: 'off' | 'auto' | 'manual' }) => void;
  ocrRunning?: boolean;
  ocrVisible?: boolean;
  onOcrVisibleChange?: (v: boolean) => void;
  ocrConfidenceThreshold?: number;
  onOcrConfidenceChange?: (v: number) => void;
  available?: boolean;
}) {
  const { t } = useTranslation();
  const [ocrLanguage, setOcrLanguage] = useState('en');
  const [ocrScope, setOcrScope] = useState<'scanned' | 'all'>('scanned');
  const [ocrPreprocessMode, setOcrPreprocessMode] = useState<'off' | 'auto' | 'manual'>('auto');
  const [ocrStatus, setOcrStatus] = useState<OcrRuntimeStatus | null>(null);
  const [ocrStatusChecking, setOcrStatusChecking] = useState(false);
  const [ocrStatusError, setOcrStatusError] = useState<string | null>(null);

  const scannedCount = scannedPageIndices.size;
  const refreshOcrStatus = useCallback(async () => {
    if (!available || !isDesktopRuntime()) return;
    setOcrStatusChecking(true);
    try {
      const status = await getOcrStatus();
      setOcrStatus(status);
      setOcrStatusError(null);
    } catch (err) {
      setOcrStatus(null);
      setOcrStatusError(err instanceof Error ? err.message : String(err));
    } finally {
      setOcrStatusChecking(false);
    }
  }, [available]);

  useEffect(() => {
    void refreshOcrStatus();
  }, [refreshOcrStatus]);

  const runtimeAvailable = available && (ocrStatus?.available ?? false);
  const controlsDisabled = ocrRunning || !runtimeAvailable || ocrStatusChecking;
  const missingPackages = ocrStatus?.missing_packages ?? [];
  const statusText = !available
    ? t('ocr.desktopOnly')
    : ocrStatusChecking
      ? t('ocr.statusChecking')
      : runtimeAvailable
        ? t('ocr.statusReady')
        : ocrStatus
          ? t('ocr.statusUnavailableWithReason', { reason: ocrStatus.remediation })
          : ocrStatusError
            ? t('ocr.statusUnavailableWithReason', { reason: ocrStatusError })
            : t('ocr.statusUnavailable');

  return (
    <div className="flex flex-col gap-2" data-testid="ocr-panel">
      <div
        data-testid="ocr-status"
        className={`rounded-md border px-2 py-1.5 text-[10px] leading-snug ${
          runtimeAvailable
            ? 'border-emerald-500/25 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'
            : 'border-amber-500/25 bg-amber-500/10 text-amber-800 dark:text-amber-200'
        }`}
      >
        <div className="flex items-start justify-between gap-2">
          <span>{statusText}</span>
          {available && (
            <button
              data-testid="ocr-status-refresh"
              type="button"
              onClick={() => { void refreshOcrStatus(); }}
              disabled={ocrStatusChecking}
              className="shrink-0 underline-offset-2 hover:underline disabled:opacity-50"
            >
              {t('ocr.statusRetry')}
            </button>
          )}
        </div>
        {ocrStatus?.python_path && (
          <div className="mt-1 truncate text-[9px] opacity-75">
            {t('ocr.runtimePath', { path: ocrStatus.python_path })}
          </div>
        )}
        {missingPackages.length > 0 && (
          <div className="mt-1 text-[9px] opacity-75">
            {t('ocr.missingPackages', { packages: missingPackages.join(', ') })}
          </div>
        )}
      </div>

      {/* Scanned page summary */}
      <p className="text-xs text-muted-foreground">
        {!available
          ? t('ocr.desktopOnly')
          : scannedCount > 0
          ? t('ocr.scannedDetected', { count: scannedCount })
          : t('ocr.noScannedDetected')}
      </p>

      {/* Language selector */}
      <div className="flex flex-col gap-0.5">
        <label className="contextpanel-sub-title">{t('ocr.language')}</label>
        <select
          data-testid="ocr-language-select"
          value={ocrLanguage}
          onChange={e => { setOcrLanguage(e.target.value); }}
          disabled={!runtimeAvailable}
          className="contextpanel-input"
        >
          <option value="en">{t('ocr.langEn')}</option>
          <option value="nl">{t('ocr.langNl')}</option>
          <option value="de">{t('ocr.langDe')}</option>
          <option value="fr">{t('ocr.langFr')}</option>
          <option value="es">{t('ocr.langEs')}</option>
        </select>
      </div>

      {/* Scope selector */}
      <div className="flex flex-col gap-0.5">
        <label className="contextpanel-sub-title">{t('ocr.scope')}</label>
        <select
          data-testid="ocr-scope-select"
          value={ocrScope}
          onChange={e => { setOcrScope(e.target.value as 'scanned' | 'all'); }}
          disabled={!runtimeAvailable}
          className="contextpanel-input"
        >
          <option value="scanned">{t('ocr.scopeScanned')}</option>
          <option value="all">{t('ocr.scopeAll')}</option>
        </select>
      </div>

      {/* Preprocessing mode */}
      <div className="flex flex-col gap-0.5">
        <label className="contextpanel-sub-title">{t('ocr.preprocess')}</label>
        <select
          data-testid="ocr-preprocess-select"
          value={ocrPreprocessMode}
          onChange={e => { setOcrPreprocessMode(e.target.value as 'off' | 'auto' | 'manual'); }}
          disabled={!runtimeAvailable}
          className="contextpanel-input"
        >
          <option value="auto">{t('ocr.preprocessAuto')}</option>
          <option value="off">{t('ocr.preprocessOff')}</option>
          <option value="manual">{t('ocr.preprocessManual')}</option>
        </select>
      </div>

      {/* Confidence threshold */}
      <div className="flex flex-col gap-0.5">
        <label className="contextpanel-sub-title">
          {t('ocr.confidenceThreshold', { value: Math.round(ocrConfidenceThreshold * 100) })}
        </label>
        <input
          data-testid="ocr-confidence-slider"
          type="range"
          min={0}
          max={100}
          value={Math.round(ocrConfidenceThreshold * 100)}
          onChange={e => { onOcrConfidenceChange?.(parseInt(e.target.value) / 100); }}
          disabled={!runtimeAvailable}
          className="w-full accent-primary"
        />
      </div>

      {/* Run OCR button + overlay toggle */}
      <div className="flex gap-1">
        <button
          data-testid="run-ocr-btn"
          onClick={() => {
            if (!runtimeAvailable) return;
            onRunOcr?.({ language: ocrLanguage, scope: ocrScope, preprocessMode: ocrPreprocessMode });
          }}
          disabled={controlsDisabled}
          aria-label={runtimeAvailable ? t('ocr.runAriaLabel') : statusText}
          title={runtimeAvailable ? t('ocr.runAriaLabel') : statusText}
          className="contextpanel-action contextpanel-action-primary"
        >
          {ocrRunning ? t('ocr.running') : t('ocr.run')}
        </button>
        <button
          data-testid="ocr-visibility-toggle"
          onClick={() => { onOcrVisibleChange?.(!ocrVisible); }}
          title={t('ocr.toggleOverlay')}
          aria-label={t('ocr.toggleOverlay')}
          disabled={!runtimeAvailable}
          className="p-1.5 border border-border rounded text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
        >
          {ocrVisible ? <EyeIcon className="w-3 h-3" /> : <EyeOffIcon className="w-3 h-3" />}
        </button>
      </div>
    </div>
  );
}

function PdfAPanel({
  pdfDoc,
  busy = false,
  status = null,
  onValidatePdfA,
  onConvertPdfA,
  onExportOpen,
}: {
  pdfDoc: PdfDocument | null;
  busy?: boolean;
  status?: PdfAWorkflowStatus | null;
  onValidatePdfA?: (level: '1b' | '2b' | '3b') => Promise<void>;
  onConvertPdfA?: (level: '1b' | '2b' | '3b') => Promise<void>;
  /** Opens the export/download dialog — shown after a successful conversion. */
  onExportOpen?: () => void;
}) {
  const { t } = useTranslation();
  const [level, setLevel] = useState<'1b' | '2b' | '3b'>('2b');
  const disabled = !pdfDoc || busy;

  return (
    <div className="flex flex-col gap-2" data-testid="pdfa-panel">
      <div className="flex flex-col gap-0.5">
        <label className="contextpanel-sub-title" htmlFor="pdfa-level-select">
          {t('pdfa.level')}
        </label>
        <select
          id="pdfa-level-select"
          data-testid="pdfa-level-select"
          value={level}
          onChange={e => { setLevel(e.target.value as '1b' | '2b' | '3b'); }}
          disabled={busy}
          className="text-xs bg-card border border-border rounded px-2 py-1 text-foreground outline-none disabled:opacity-50"
        >
          <option value="1b">PDF/A-1b</option>
          <option value="2b">PDF/A-2b</option>
          <option value="3b">PDF/A-3b</option>
        </select>
      </div>

      <div className="flex gap-1">
        <button
          data-testid="validate-pdfa-btn"
          onClick={() => { void onValidatePdfA?.(level); }}
          disabled={disabled || !onValidatePdfA}
          className="flex-1 py-1 text-xs font-medium rounded bg-muted text-foreground hover:bg-muted/80 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {busy ? t('common.busy') : t('pdfa.validate')}
        </button>
        <button
          data-testid="convert-pdfa-btn"
          onClick={() => { void onConvertPdfA?.(level); }}
          disabled={disabled || !onConvertPdfA}
          className="contextpanel-action contextpanel-action-primary"
        >
          {busy ? t('common.busy') : t('pdfa.convert')}
        </button>
      </div>

      {status && (
        <>
          <p
            data-testid="pdfa-status"
            className={`text-xs leading-relaxed ${status.kind === 'error' ? 'text-destructive' : status.isValid === false ? 'text-amber-600 dark:text-amber-400' : 'text-muted-foreground'}`}
          >
            {status.message}
          </p>
          {/* After a successful conversion, surface a download button so the
              user doesn't have to discover the Export toolbar button. */}
          {status.kind === 'success' && status.isValid === true && onExportOpen && (
            <button
              data-testid="pdfa-download-btn"
              onClick={onExportOpen}
              className="w-full py-1 text-xs font-medium rounded bg-muted text-foreground hover:bg-muted/80 transition-colors"
            >
              {t('pdfa.downloadConverted')}
            </button>
          )}
        </>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Review mode — Opmerkingen
// ---------------------------------------------------------------------------

function ReviewModeContent({
  comments,
  activeCommentIdx,
  onCommentSelect,
  onDeleteComment,
  onUpdateComment,
  onToggleResolved,
  onAddReply,
  onDeleteReply,
  onNextComment,
  onPrevComment,
  onResolveAll,
  onDeleteAllResolved,
  authorName,
  onAuthorChange,
}: {
  comments: Annotation[];
  activeCommentIdx: number;
  onCommentSelect: (idx: number) => void;
  onDeleteComment: (annotationId: string) => void;
  onUpdateComment: (annotationId: string, newContents: string) => void;
  onToggleResolved?: (annotationId: string) => void;
  onAddReply?: (annotationId: string, contents: string, author: string) => void;
  onDeleteReply?: (annotationId: string, replyId: string) => void;
  onNextComment?: () => void;
  onPrevComment?: () => void;
  onResolveAll?: () => void;
  onDeleteAllResolved?: () => void;
  authorName: string;
  onAuthorChange: (name: string) => void;
}) {
  const { t } = useTranslation();
  const activeItemRef = useRef<HTMLButtonElement | null>(null);
  useEffect(() => {
    activeItemRef.current?.scrollIntoView({ block: 'nearest' });
  }, [activeCommentIdx]);

  // Inline edit state: which comment is being edited, and the draft text
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState('');

  // Local filter state
  const [filterText, setFilterText] = useState('');
  const [filterAuthor, setFilterAuthor] = useState('');
  // '' = all pages; stringified pageIndex otherwise (keeps select value simple)
  const [filterPage, setFilterPage] = useState('');
  // '' = all statuses; 'open' or 'resolved'
  const [filterStatus, setFilterStatus] = useState<'' | 'open' | 'resolved'>('');

  // Build flat index map: comment.id → original index in full comments array
  const commentFlatIndexMap = useMemo<Map<string, number>>(
    () => new Map<string, number>(comments.map((c, i) => [c.id, i])),
    [comments]
  );

  const unknown = t('review.unknown');

  // Unique authors for the author filter dropdown
  const uniqueAuthors = useMemo(() => {
    const seen = new Set<string>();
    return comments.reduce<string[]>((acc, c) => {
      const a = c.author || unknown;
      if (!seen.has(a)) { seen.add(a); acc.push(a); }
      return acc;
    }, []);
  }, [comments, unknown]);

  // Unique pages (sorted ascending) for the page filter dropdown
  const uniquePages = useMemo(() => {
    const seen = new Set<number>();
    return comments.reduce<number[]>((acc, c) => {
      if (!seen.has(c.pageIndex)) { seen.add(c.pageIndex); acc.push(c.pageIndex); }
      return acc;
    }, []).sort((a, b) => a - b);
  }, [comments]);

  // Filtered comments list — text, author, page, and status filters applied
  const filteredComments = useMemo(() => comments.filter(c => {
    if (filterAuthor && c.author !== filterAuthor) return false;
    if (filterPage !== '' && String(c.pageIndex) !== filterPage) return false;
    if (filterStatus !== '' && (c.status ?? 'open') !== filterStatus) return false;
    if (filterText) {
      const q = filterText.toLowerCase();
      return (c.contents?.toLowerCase().includes(q) ?? false) || (c.author?.toLowerCase().includes(q) ?? false);
    }
    return true;
  }), [comments, filterText, filterAuthor, filterPage, filterStatus]);

  // When any filter changes and the active comment falls out of the visible set, deselect it
  useEffect(() => {
    if (activeCommentIdx < 0) return;
    const activeComment = comments[activeCommentIdx];
    if (!activeComment) return;
    const isVisible = filteredComments.some(c => c.id === activeComment.id);
    if (!isVisible) onCommentSelect(-1);
  }, [filterText, filterAuthor, filterPage, filterStatus]); // eslint-disable-line react-hooks/exhaustive-deps

  const anyFilterActive = filterText !== '' || filterAuthor !== '' || filterPage !== '' || filterStatus !== '';

  function clearAllFilters(): void {
    setFilterText('');
    setFilterAuthor('');
    setFilterPage('');
    setFilterStatus('');
  }

  // Export review summary as JSON or Markdown
  function buildExportMarkdown(): string {
    const lines: string[] = ['# Review summary', ''];
    for (const c of comments) {
      const status = c.status ?? 'open';
      const author = c.author || unknown;
      const page = c.pageIndex + 1;
      const text = c.contents ?? '';
      lines.push(`## Comment — page ${page}`);
      lines.push(`- **Author:** ${author}`);
      lines.push(`- **Status:** ${status}`);
      lines.push(`- **Content:** ${text}`);
      if (c.replies && c.replies.length > 0) {
        lines.push('- **Replies:**');
        for (const r of c.replies) {
          lines.push(`  - ${r.author}: ${r.contents}`);
        }
      }
      lines.push('');
    }
    return lines.join('\n');
  }

  function buildExportJson(): string {
    const data = comments.map(c => ({
      id: c.id,
      page: c.pageIndex + 1,
      author: c.author || unknown,
      status: c.status ?? 'open',
      contents: c.contents ?? '',
      replies: (c.replies ?? []).map(r => ({ id: r.id, author: r.author, contents: r.contents })),
    }));
    return JSON.stringify(data, null, 2);
  }

  function handleExportReview(format: 'markdown' | 'json'): void {
    const content = format === 'markdown' ? buildExportMarkdown() : buildExportJson();
    const mimeType = format === 'markdown' ? 'text/markdown' : 'application/json';
    const ext = format === 'markdown' ? 'md' : 'json';
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `review-summary.${ext}`;
    a.dataset.testid = 'review-export-anchor';
    a.click();
    URL.revokeObjectURL(url);
  }

  // Group filteredComments by page index
  const groups = new Map<number, Annotation[]>();
  for (const comment of filteredComments) {
    const existing = groups.get(comment.pageIndex);
    if (existing) { existing.push(comment); } else { groups.set(comment.pageIndex, [comment]); }
  }
  const sortedPageIndices = Array.from(groups.keys()).sort((a, b) => a - b);

  const inputClass =
    'w-full text-xs bg-card border border-border rounded px-2 py-1 text-foreground placeholder:text-muted-foreground/50 outline-none focus:ring-1 focus:ring-primary';

  return (
    <div className="flex flex-col gap-0.5">
      {/* Reviewer name — used for new annotations, persisted via onAuthorChange */}
      <div className="mb-2">
        <input
          data-testid="reviewer-name-input"
          type="text"
          placeholder={t('review.reviewerNamePlaceholder')}
          value={authorName}
          onChange={e => { onAuthorChange(e.target.value); }}
          className={inputClass}
          aria-label={t('review.reviewerNameAriaLabel')}
        />
      </div>

      {/* Filter controls */}
      <div className="flex flex-col gap-1.5 mb-2">
        <input
          data-testid="comment-filter-input"
          type="text"
          placeholder={t('review.filterPlaceholder')}
          aria-label={t('review.filterPlaceholder')}
          value={filterText}
          onChange={e => { setFilterText(e.target.value); }}
          className={inputClass}
        />
        <div className="flex gap-1">
          <select
            data-testid="comment-filter-author"
            value={filterAuthor}
            onChange={e => { setFilterAuthor(e.target.value); onCommentSelect(-1); }}
            className="flex-1 text-xs bg-card border border-border rounded px-2 py-1 text-foreground outline-none"
          >
            <option value="">{t('review.allReviewers')}</option>
            {uniqueAuthors.map(a => <option key={a} value={a}>{a}</option>)}
          </select>
          <button
            data-testid="my-comments-filter-btn"
            onClick={() => {
              const isMyFilter = filterAuthor === authorName;
              setFilterAuthor(isMyFilter ? '' : authorName);
              onCommentSelect(-1);
            }}
            aria-label={t('review.myComments')}
            title={t('review.myComments')}
            className={`shrink-0 px-1.5 py-1 text-[9px] rounded border transition-colors ${filterAuthor === authorName ? 'bg-primary text-primary-foreground border-primary' : 'border-border text-muted-foreground hover:bg-muted'}`}
          >
            {t('review.myCommentsShort')}
          </button>
        </div>
        <select
          data-testid="comment-filter-page"
          value={filterPage}
          onChange={e => { setFilterPage(e.target.value); onCommentSelect(-1); }}
          className="contextpanel-input"
        >
          <option value="">{t('review.allPages')}</option>
          {uniquePages.map(p => <option key={p} value={String(p)}>{t('review.commentPage', { page: p + 1 })}</option>)}
        </select>
        <select
          data-testid="comment-filter-status"
          value={filterStatus}
          onChange={e => { setFilterStatus(e.target.value as '' | 'open' | 'resolved'); onCommentSelect(-1); }}
          className="contextpanel-input"
        >
          <option value="">{t('review.allStatuses')}</option>
          <option value="open">{t('review.statusOpen')}</option>
          <option value="resolved">{t('review.statusResolved')}</option>
        </select>
        {anyFilterActive && (
          <button
            data-testid="comment-filter-clear"
            onClick={clearAllFilters}
            className="w-full text-[9px] py-0.5 rounded border border-border text-muted-foreground hover:bg-muted transition-colors"
          >
            {t('review.clearFilters')}
          </button>
        )}
      </div>

      {/* Count label */}
      <p data-testid="comment-filter-count" className="text-xs text-muted-foreground mb-1">
        {anyFilterActive
          ? t('review.filteredCount', { filtered: filteredComments.length, total: comments.length })
          : comments.length === 1
            ? t('review.commentCount', { count: comments.length })
            : t('review.commentCount_plural', { count: comments.length })}
      </p>

      {/* Export review summary buttons */}
      <div className="flex items-center gap-1 mb-1">
        <button
          data-testid="export-review-md-btn"
          onClick={() => { handleExportReview('markdown'); }}
          aria-label={t('review.exportMdAriaLabel')}
          title={t('review.exportMd')}
          className="contextpanel-action"
        >
          {t('review.exportMd')}
        </button>
        <button
          data-testid="export-review-json-btn"
          onClick={() => { handleExportReview('json'); }}
          aria-label={t('review.exportJsonAriaLabel')}
          title={t('review.exportJson')}
          className="contextpanel-action"
        >
          {t('review.exportJson')}
        </button>
      </div>

      {/* Bulk action buttons — only rendered when there are comments */}
      {comments.length > 0 && (
        <div className="flex items-center gap-1 mb-1">
          <button
            data-testid="resolve-all-btn"
            onClick={() => { onResolveAll?.(); }}
            disabled={comments.length === 0}
            aria-label={t('review.resolveAllAriaLabel')}
            title={t('review.resolveAllAriaLabel')}
            className="contextpanel-action"
          >
            {t('review.markAsResolved')}
          </button>
          <button
            data-testid="delete-resolved-btn"
            onClick={() => { onDeleteAllResolved?.(); }}
            disabled={!comments.some(c => (c.status ?? 'open') === 'resolved')}
            aria-label={t('review.deleteResolvedAriaLabel')}
            title={t('review.deleteResolvedAriaLabel')}
            className="contextpanel-action"
          >
            {t('review.deleteResolved')}
          </button>
        </div>
      )}

      {/* Comment navigation buttons — only rendered when there are comments */}
      {comments.length > 0 && (
        <div className="flex items-center gap-1 mb-1">
          <button
            data-testid="prev-comment-btn"
            onClick={() => { onPrevComment?.(); }}
            disabled={comments.length === 0}
            aria-label={t('review.prevCommentAriaLabel')}
            className="contextpanel-action"
          >
            ← {t('review.prev')}
          </button>
          <button
            data-testid="next-comment-btn"
            onClick={() => { onNextComment?.(); }}
            disabled={comments.length === 0}
            aria-label={t('review.nextCommentAriaLabel')}
            className="contextpanel-action"
          >
            {t('review.next')} →
          </button>
        </div>
      )}

      {/* Zero-results state — shown when filters are active but no comments match */}
      {anyFilterActive && filteredComments.length === 0 && (
        <p data-testid="comment-filter-empty" className="text-xs text-muted-foreground/60 leading-relaxed">
          {t('review.noCommentForFilter')}
        </p>
      )}

      {/* Empty state — shown when there are no comments at all */}
      {comments.length === 0 && (
        <PlaceholderText text={t('leftNav.noCommentsSide')} />
      )}

      {/* Comment list grouped by page.
          commentFlatIndexMap.get(comment.id) gives the original index in the full
          comments array — used for isActive and onCommentSelect so that filtering
          does not corrupt the active selection. */}
      {(() => {
        return sortedPageIndices.map(pageIndex => (
          <div key={pageIndex}>
            <p
              data-testid="review-comment-group-heading"
              className="text-[9px] font-semibold uppercase tracking-wide text-muted-foreground/60 py-0.5 mt-1 first:mt-0"
            >
              {t('review.commentPage', { page: pageIndex + 1 })}
            </p>
            {groups.get(pageIndex)!.map(comment => {
              // Use the original full-array index for active state and navigation —
              // do NOT use a local counter that would be wrong when a filter is active.
              const originalIdx = commentFlatIndexMap.get(comment.id) ?? -1;
              const isActive = originalIdx === activeCommentIdx;
              const isEditing = editingId === comment.id;
              const isResolved = comment.status === 'resolved';
              return (
                <div
                  key={comment.id}
                  data-testid="review-comment-item"
                  data-resolved={isResolved ? 'true' : 'false'}
                  ref={(el) => { if (isActive) { activeItemRef.current = el as unknown as HTMLButtonElement; } }}
                  onClick={() => { if (!isEditing) onCommentSelect(originalIdx); }}
                  className={`w-full text-left flex flex-col gap-0.5 py-1 px-1.5 rounded border-b border-border last:border-b-0 transition-colors cursor-pointer ${
                    isActive ? 'bg-primary/5 ring-1 ring-primary/40' : 'hover:bg-muted/30'
                  } ${isResolved ? 'opacity-50' : ''}`}
                >
                  {/* Header row: color dot + author + resolve/edit/delete buttons */}
                  <div className="flex items-center justify-between gap-1">
                    <div className="flex items-center gap-1 flex-1 min-w-0">
                      <span
                        data-testid="comment-color-dot"
                        className="w-2 h-2 rounded-full shrink-0"
                        style={{ backgroundColor: comment.color || '#FFD700' }}
                      />
                      <span className="text-xs font-medium text-foreground/80 truncate">
                        {comment.author || unknown}
                      </span>
                    </div>
                    <div className="flex items-center gap-0.5 shrink-0">
                      <button
                        data-testid="resolve-comment-btn"
                        onClick={e => {
                          e.stopPropagation();
                          onToggleResolved?.(comment.id);
                        }}
                        aria-label={isResolved ? t('review.markAsOpen') : t('review.markAsResolved')}
                        title={isResolved ? t('review.markAsOpen') : t('review.markAsResolved')}
                        className={`p-0.5 rounded transition-colors ${isResolved ? 'text-green-500 hover:text-muted-foreground' : 'text-muted-foreground/40 hover:text-green-500'}`}
                      >
                        <CheckIcon className="w-2.5 h-2.5" />
                      </button>
                      <button
                        data-testid="edit-comment-btn"
                        onClick={e => {
                          e.stopPropagation();
                          setEditingId(comment.id);
                          setEditText(comment.contents ?? '');
                        }}
                        aria-label={t('review.editCommentAriaLabel')}
                        className="p-0.5 text-muted-foreground/40 hover:text-foreground rounded transition-colors"
                      >
                        <PencilIcon className="w-2.5 h-2.5" />
                      </button>
                      <button
                        data-testid="delete-comment-btn"
                        onClick={e => {
                          e.stopPropagation();
                          onDeleteComment(comment.id);
                        }}
                        aria-label={t('review.deleteComment')}
                        className="p-0.5 text-muted-foreground/40 hover:text-destructive rounded transition-colors"
                      >
                        <TrashIcon className="w-2.5 h-2.5" />
                      </button>
                    </div>
                  </div>

                  {/* Inline edit mode: textarea + confirm/cancel */}
                  {isEditing ? (
                    <div className="mt-0.5 flex flex-col gap-1" onClick={e => { e.stopPropagation(); }}>
                      <textarea
                        data-testid="comment-edit-textarea"
                        value={editText}
                        onChange={e => { setEditText(e.target.value); }}
                        rows={3}
                        autoFocus
                        className="w-full text-xs bg-card border border-primary rounded px-2 py-1 text-foreground resize-none outline-none focus:ring-1 focus:ring-primary"
                      />
                      <div className="flex items-center gap-1">
                        <button
                          data-testid="comment-edit-confirm-btn"
                          onClick={() => {
                            onUpdateComment(comment.id, editText);
                            setEditingId(null);
                          }}
                          className="contextpanel-action contextpanel-action-primary"
                        >
                          {t('common.save')}
                        </button>
                        <button
                          data-testid="comment-edit-cancel-btn"
                          onClick={() => { setEditingId(null); }}
                          className="contextpanel-action"
                        >
                          {t('common.cancel')}
                        </button>
                      </div>
                    </div>
                  ) : (
                    comment.contents && (
                      <p className="text-xs text-muted-foreground leading-snug line-clamp-2">
                        {comment.contents}
                      </p>
                    )
                  )}

                  {/* Reply thread */}
                  {(comment.replies?.length ?? 0) > 0 && (
                    <div className="mt-1 pl-2 border-l-2 border-border flex flex-col gap-0.5" data-testid="reply-thread">
                      {comment.replies!.map(reply => (
                        <div key={reply.id} data-testid="reply-item" className="flex flex-col gap-0.5">
                          <div className="flex items-center justify-between">
                            <span className="text-[9px] font-medium text-foreground/70">{reply.author || unknown}</span>
                            <button
                              data-testid="delete-reply-btn"
                              onClick={e => { e.stopPropagation(); onDeleteReply?.(comment.id, reply.id); }}
                              aria-label={t('review.deleteReplyAriaLabel')}
                              className="p-0.5 text-muted-foreground/30 hover:text-destructive rounded transition-colors"
                            >
                              <XIcon className="w-2 h-2" />
                            </button>
                          </div>
                          <p className="text-[9px] text-muted-foreground leading-snug">{reply.contents}</p>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Reply input */}
                  <ReplyInput
                    annotationId={comment.id}
                    authorName={authorName}
                    onAddReply={onAddReply}
                  />
                </div>
              );
            })}
          </div>
        ));
      })()}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Review mode — Redigeringen panel
// ---------------------------------------------------------------------------

function RedactionPanel({
  redactions,
  onApplyRedactions,
  onDeleteRedaction,
  onJumpToRedaction,
  onSearchRedact,
  onRedactMetadata,
}: {
  redactions: Annotation[];
  onApplyRedactions?: () => void;
  onDeleteRedaction?: (annotationId: string) => void;
  onJumpToRedaction?: (pageIndex: number) => void;
  onSearchRedact?: (query: string) => Promise<{ matchesFound: number; areasRedacted: number } | null>;
  onRedactMetadata?: () => Promise<boolean>;
}) {
  const { t } = useTranslation();
  const { push, update } = useTaskQueueContext();
  const [busy, setBusy] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searching, setSearching] = useState(false);
  const [strippingMeta, setStrippingMeta] = useState(false);

  async function handleApply(): Promise<void> {
    if (busy) return;
    let confirmed = false;
    if (isTauriRuntime()) {
      try {
        const { ask } = await import('@tauri-apps/plugin-dialog');
        confirmed = await ask(t('rightPanel.redactionConfirm', { count: redactions.length }), {
          title: t('tasks.applyRedactTitle') || 'Apply Redactions',
          kind: 'warning'
        });
      } catch (err) {
        console.error('Tauri ask failed; cancelling redaction apply', err);
        confirmed = false;
      }
    } else {
      confirmed = false;
    }
    if (!confirmed) return;
    const taskId = `apply-redactions-${Date.now()}`;
    push({ id: taskId, label: t('tasks.applyRedactRunning'), progress: null, status: 'running' });
    setBusy(true);
    try {
      await onApplyRedactions?.();
      update(taskId, { status: 'done', label: t('tasks.applyRedactDone') });
    } catch {
      update(taskId, { status: 'error', label: t('tasks.applyRedactFailed') });
    } finally {
      setBusy(false);
    }
  }

  async function handleSearchRedact(): Promise<void> {
    if (!searchQuery.trim() || searching) return;
    const taskId = `search-redact-${Date.now()}`;
    push({ id: taskId, label: t('tasks.searchRedactRunning'), progress: null, status: 'running' });
    setSearching(true);
    try {
      const result = await onSearchRedact?.(searchQuery);
      if (result) {
        update(taskId, { status: 'done', label: t('tasks.searchRedactDone', { count: result.areasRedacted }) });
        setSearchQuery('');
      } else {
        update(taskId, { status: 'error', label: t('tasks.searchRedactFailed') });
      }
    } catch {
      update(taskId, { status: 'error', label: t('tasks.searchRedactFailed') });
    } finally {
      setSearching(false);
    }
  }

  async function handleRedactMetadata(): Promise<void> {
    if (strippingMeta) return;
    const taskId = `redact-metadata-${Date.now()}`;
    push({ id: taskId, label: t('tasks.redactMetadataRunning'), progress: null, status: 'running' });
    setStrippingMeta(true);
    try {
      const ok = await onRedactMetadata?.();
      update(taskId, ok ? { status: 'done', label: t('tasks.redactMetadataDone') } : { status: 'error', label: t('tasks.redactMetadataFailed') });
    } catch {
      update(taskId, { status: 'error', label: t('tasks.redactMetadataFailed') });
    } finally {
      setStrippingMeta(false);
    }
  }

  return (
    <div data-testid="redaction-panel" className="flex flex-col gap-2">

      {/* Search and redact */}
      {onSearchRedact && (
        <div className="flex flex-col gap-0.5">
          <span className="contextpanel-sub-title">{t('protect.searchRedact')}</span>
          <div className="flex gap-1">
            <input
              data-testid="search-redact-input"
              type="text"
              value={searchQuery}
              onChange={e => { setSearchQuery(e.target.value); }}
              onKeyDown={e => { if (e.key === 'Enter') void handleSearchRedact(); }}
              placeholder={t('protect.searchRedactPlaceholder')}
              aria-label={t('protect.searchRedact')}
              className="flex-1 text-xs bg-card border border-border rounded px-2 py-1 text-foreground outline-none focus:ring-1 focus:ring-primary"
            />
            <button
              data-testid="search-redact-btn"
              onClick={() => { void handleSearchRedact(); }}
              disabled={!searchQuery.trim() || searching}
              className="text-xs px-2 py-1 bg-destructive text-destructive-foreground rounded hover:opacity-90 transition-opacity disabled:opacity-40 shrink-0"
            >
              {searching ? t('common.busy') : t('protect.searchRedactBtn')}
            </button>
          </div>
        </div>
      )}

      {/* Pending list + count */}
      <p className="text-xs text-muted-foreground">
        {redactions.length === 0
          ? t('rightPanel.noRedactions')
          : t('rightPanel.redactionCount', { count: redactions.length })}
      </p>

      <button
        data-testid="apply-redactions-btn"
        onClick={() => { void handleApply(); }}
        disabled={busy || redactions.length === 0}
        className="w-full py-1 text-xs font-semibold rounded bg-destructive text-destructive-foreground hover:opacity-90 transition-opacity disabled:opacity-40 disabled:cursor-not-allowed"
      >
        {busy ? t('common.busy') : t('rightPanel.applyRedactions')}
      </button>

      <div className="flex flex-col gap-0.5">
        {redactions.map((r) => (
          <div
            key={r.id}
            data-testid="redaction-list-item"
            className="flex items-center justify-between gap-1 py-0.5 px-1 rounded hover:bg-muted/30 cursor-pointer"
            onClick={() => { onJumpToRedaction?.(r.pageIndex); }}
          >
            <span className="text-xs text-foreground/70 truncate flex-1">
              p.{r.pageIndex + 1}
            </span>
            <button
              data-testid="delete-redaction-btn"
              onClick={(e) => {
                e.stopPropagation();
                onDeleteRedaction?.(r.id);
              }}
              aria-label={t('rightPanel.deleteRedaction')}
              className="p-0.5 text-muted-foreground/40 hover:text-destructive rounded transition-colors shrink-0"
            >
              <TrashIcon className="w-2.5 h-2.5" />
            </button>
          </div>
        ))}
      </div>

      {/* Redact metadata */}
      {onRedactMetadata && (
        <div className="flex flex-col gap-0.5 pt-1 border-t border-border">
          <span className="contextpanel-sub-title">{t('protect.redactMetadataTitle')}</span>
          <p className="text-xs text-muted-foreground">{t('protect.redactMetadataDesc')}</p>
          <button
            data-testid="redact-metadata-btn"
            onClick={() => { void handleRedactMetadata(); }}
            disabled={strippingMeta}
            className="w-full py-1 text-xs font-medium rounded bg-muted text-foreground hover:bg-muted/80 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {strippingMeta ? t('common.busy') : t('protect.redactMetadataBtn')}
          </button>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Color helpers
// ---------------------------------------------------------------------------

/** Convert a CSS color string to #RRGGBB hex for <input type="color">. */
function colorToHex(cssColor: string): string {
  if (cssColor.startsWith('#')) return cssColor.slice(0, 7);
  const m = cssColor.match(/rgb\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*\)/);
  if (m) {
    return '#' + [m[1], m[2], m[3]].map(n => parseInt(n ?? '0').toString(16).padStart(2, '0')).join('');
  }
  return '#000000';
}

function rgbTupleToHex(color: [number, number, number]): string {
  return '#' + color.map(channel => {
    const value = Math.round(Math.max(0, Math.min(1, channel)) * 255);
    return value.toString(16).padStart(2, '0');
  }).join('');
}

function hexToRgbTuple(hex: string): [number, number, number] {
  const normalized = hex.startsWith('#') ? hex.slice(1) : hex;
  const padded = normalized.padEnd(6, '0').slice(0, 6);
  return [
    parseInt(padded.slice(0, 2), 16) / 255,
    parseInt(padded.slice(2, 4), 16) / 255,
    parseInt(padded.slice(4, 6), 16) / 255,
  ];
}

function AnnotationToolPropertiesPanel({
  tool,
  appearance,
  onChange,
}: {
  tool: AnnotationTool;
  appearance: AnnotationAppearance;
  onChange?: (appearance: AnnotationAppearance) => void;
}) {
  const { t } = useTranslation();
  if (!tool || tool === 'redaction') return null;

  const colorHex = rgbTupleToHex(appearance.color);
  const setColor = (hex: string) => {
    onChange?.({ ...appearance, color: hexToRgbTuple(hex) });
  };
  const swatches = ['#ffff00', '#22c55e', '#38bdf8', '#f472b6', '#f97316', '#ef4444'];

  return (
    <div className="flex flex-col gap-3" data-testid="annotation-tool-properties-panel">
      <div className="flex flex-col gap-1.5">
        <label className="text-[9px] uppercase tracking-wide text-muted-foreground/70">
          {t('rightPanel.annotationColor')}
        </label>
        <div className="flex items-center gap-1.5">
          {swatches.map(hex => (
            <button
              key={hex}
              type="button"
              data-testid={`annotation-tool-color-${hex.slice(1)}`}
              onClick={() => { setColor(hex); }}
              className={`h-5 w-5 rounded-full border transition-transform hover:scale-110 ${
                colorHex.toLowerCase() === hex ? 'border-foreground ring-2 ring-primary/25' : 'border-border'
              }`}
              style={{ backgroundColor: hex }}
              aria-label={t('rightPanel.annotationColorValue', { color: hex })}
              title={hex}
            />
          ))}
          <input
            data-testid="annotation-tool-color-picker"
            type="color"
            value={colorHex}
            onChange={(event) => { setColor(event.target.value); }}
            className="h-5 w-5 rounded border border-border bg-transparent p-0"
            aria-label={t('rightPanel.changeColor')}
          />
        </div>
      </div>

      {tool === 'rectangle' && (
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center justify-between gap-2">
            <label className="text-[9px] uppercase tracking-wide text-muted-foreground/70">
              {t('rightPanel.strokeWidth')}
            </label>
            <span className="text-[10px] tabular-nums text-muted-foreground">
              {appearance.strokeWidth.toFixed(1)}
            </span>
          </div>
          <input
            data-testid="annotation-tool-stroke-width"
            type="range"
            min={0.5}
            max={6}
            step={0.5}
            value={appearance.strokeWidth}
            onChange={(event) => {
              onChange?.({ ...appearance, strokeWidth: Number(event.target.value) });
            }}
            className="w-full accent-primary"
            aria-label={t('rightPanel.strokeWidth')}
          />
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Edit mode — text properties panel
// ---------------------------------------------------------------------------

function TextPropertiesPanel({
  target,
  formatState,
  onFormatCommand
}: {
  target: TextParagraphTarget | null | undefined;
  formatState?: { isBold: boolean; isItalic: boolean; isUnderline: boolean; isStrikethrough: boolean };
  onFormatCommand?: (command: string, value?: string) => void;
}) {
  const { t } = useTranslation();
  const [localFontSize, setLocalFontSize] = useState<number>(12);

  useEffect(() => {
    if (target) {
      const spanFontSize = target.lines[0]?.spans[0]?.fontSize;
      if (spanFontSize) {
        setLocalFontSize(Math.round(spanFontSize));
      }
    }
  }, [target]);

  if (!target) {
    return <PlaceholderText text={t('edit.noTextSelected')} />;
  }

  const changeFontSize = (delta: number) => {
    const newSize = Math.max(6, Math.min(72, localFontSize + delta));
    setLocalFontSize(newSize);
    onFormatCommand?.('fontSize', String(newSize));
  };

  return (
    <div className="flex flex-col gap-4 p-3 bg-background/35 rounded-xl border border-border/10 shadow-sm animate-in fade-in duration-200" data-testid="text-properties-panel">
      {/* ── Font size ── */}
      <div className="flex flex-col gap-1">
        <span className="contextpanel-sub-title">{t('edit.fontSize')}</span>
        <div className="flex items-center gap-2">
          <div className="flex items-center bg-muted/40 p-0.5 rounded-lg border border-border/40">
            <button
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => changeFontSize(-1)}
              className="px-2 py-1 text-xs hover:bg-background/80 rounded-md transition-all duration-150 text-muted-foreground hover:text-foreground font-bold cursor-pointer font-sans"
              title={t('edit.smaller')}
            >
              −
            </button>
            <span className="px-3 text-xs font-medium text-foreground tabular-nums min-w-[3rem] text-center">
              {localFontSize} pt
            </span>
            <button
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => changeFontSize(1)}
              className="px-2 py-1 text-xs hover:bg-background/80 rounded-md transition-all duration-150 text-muted-foreground hover:text-foreground font-bold cursor-pointer font-sans"
              title={t('edit.larger')}
            >
              +
            </button>
          </div>
        </div>
      </div>

      {/* ── Text style ── */}
      <div className="flex flex-col gap-1">
        <span className="contextpanel-sub-title">{t('edit.style')}</span>
        <div className="flex items-center gap-1 bg-muted/40 p-0.5 rounded-lg border border-border/40 w-max">
          <button
            data-testid="text-props-bold-btn"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => onFormatCommand?.('bold')}
            className={`p-1.5 rounded-md hover:bg-background/80 transition-all duration-200 cursor-pointer ${
              formatState?.isBold
                ? 'bg-background text-primary shadow-sm ring-1 ring-black/5 font-semibold'
                : 'text-muted-foreground hover:text-foreground'
            }`}
            title={t('edit.bold')}
          >
            <BoldIcon className="w-3.5 h-3.5" />
          </button>
          <button
            data-testid="text-props-italic-btn"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => onFormatCommand?.('italic')}
            className={`p-1.5 rounded-md hover:bg-background/80 transition-all duration-200 cursor-pointer ${
              formatState?.isItalic
                ? 'bg-background text-primary shadow-sm ring-1 ring-black/5 font-semibold'
                : 'text-muted-foreground hover:text-foreground'
            }`}
            title={t('edit.italic')}
          >
            <ItalicIcon className="w-3.5 h-3.5" />
          </button>
          <button
            data-testid="text-props-underline-btn"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => onFormatCommand?.('underline')}
            className={`p-1.5 rounded-md hover:bg-background/80 transition-all duration-200 cursor-pointer ${
              formatState?.isUnderline
                ? 'bg-background text-primary shadow-sm ring-1 ring-black/5 font-semibold'
                : 'text-muted-foreground hover:text-foreground'
            }`}
            title={t('edit.underline')}
          >
            <UnderlineIcon className="w-3.5 h-3.5" />
          </button>
          <button
            data-testid="text-props-strike-btn"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => onFormatCommand?.('strikeThrough')}
            className={`p-1.5 rounded-md hover:bg-background/80 transition-all duration-200 cursor-pointer ${
              formatState?.isStrikethrough
                ? 'bg-background text-primary shadow-sm ring-1 ring-black/5 font-semibold'
                : 'text-muted-foreground hover:text-foreground'
            }`}
            title={t('edit.strikethrough')}
          >
            <StrikethroughIcon className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* ── Text color ── */}
      <div className="flex flex-col gap-1.5">
        <span className="contextpanel-sub-title">{t('edit.textColor')}</span>
        <div className="flex items-center gap-2 flex-wrap">
          {[
            { name: t('edit.colorBlack'), hex: '#000000', bg: 'bg-black' },
            { name: t('edit.colorDarkGray'), hex: '#4b5563', bg: 'bg-gray-600' },
            { name: t('edit.colorLightGray'), hex: '#9ca3af', bg: 'bg-gray-400' },
            { name: t('edit.colorRed'), hex: '#ef4444', bg: 'bg-red-500' },
            { name: t('edit.colorBlue'), hex: '#3b82f6', bg: 'bg-blue-500' },
            { name: t('edit.colorGreen'), hex: '#10b981', bg: 'bg-emerald-500' },
            { name: t('edit.colorGoldOrange'), hex: '#f59e0b', bg: 'bg-amber-500' },
          ].map((color) => (
            <button
              key={color.hex}
              data-testid={`text-color-${color.hex.slice(1)}`}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => onFormatCommand?.('foreColor', color.hex)}
              className={`w-5 h-5 rounded-full border border-border/25 shadow-sm transition-transform duration-200 hover:scale-110 active:scale-95 cursor-pointer ${color.bg}`}
              title={color.name}
            />
          ))}
        </div>
      </div>

      {/* Source metadata */}
      <div className="mt-2 pt-2 border-t border-border/10 flex justify-between items-center text-[9px] text-muted-foreground/50">
        <span>{t('edit.source')}</span>
        <span className="font-medium uppercase">
          {target.source === 'ocr' ? t('edit.sourceOcr') : t('edit.sourceDigital')}
        </span>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function RightContextPanel({ mode, pdfDoc, pageCount, formFields, comments, activeCommentIdx, onCommentSelect, onDeleteComment, onUpdateComment, onToggleResolved, onAddReply, onDeleteReply, onNextComment, onPrevComment, onResolveAll, onDeleteAllResolved, scannedPageIndices = new Set(), onRunOcr, ocrRunning, ocrVisible = true, onOcrVisibleChange, ocrConfidenceThreshold = 0.6, onOcrConfidenceChange, activeFieldIdx, onFieldSelect, onSetFieldValue, formValidationErrors, onFormSubmit, authorName, onAuthorChange, onMetadataChange, selectedAnnotation, activeAnnotationTool, annotationAppearance = DEFAULT_ANNOTATION_APPEARANCE, onAnnotationAppearanceChange, onDeleteSelectedAnnotation, onUpdateAnnotationColor, redactions = [], onApplyRedactions, onWatermarkApplied, onDeleteRedaction, onJumpToRedaction, onRedactSearch, onRedactMetadata, onValidatePdfA, onConvertPdfA, pdfaBusy, pdfaStatus, onExportOpen, selectedTextTarget, formatState, onFormatCommand, onClose }: RightContextPanelProps) {
  const { t } = useTranslation();
  return (
    <aside className="contextpanel" aria-label={t('rightPanel.properties')}>
      {/* Panel header */}
      <header className="contextpanel-header">
        <span className="contextpanel-title">{t('rightPanel.properties')}</span>
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            aria-label={t('rightPanel.close')}
            className="contextpanel-close"
          >
            <XIcon aria-hidden="true" />
          </button>
        )}
      </header>

      {/* Sections */}
      <div className="contextpanel-body pf-scrollbar">

        {/* ── Read mode ──────────────────────────────────────────────────── */}
        {mode === 'read' && (
          <>
            <CollapsibleSection title={t('rightPanel.documentInfo')}>
              <MetadataInfo pdfDoc={pdfDoc} pageCount={pageCount} formFields={formFields} onMetadataChange={onMetadataChange} />
            </CollapsibleSection>
          </>
        )}

        {/* ── Review mode ────────────────────────────────────────────────── */}
        {mode === 'review' && (
          <>
            {activeAnnotationTool && activeAnnotationTool !== 'redaction' && (
              <CollapsibleSection title={t('rightPanel.toolProperties')}>
                <AnnotationToolPropertiesPanel
                  tool={activeAnnotationTool}
                  appearance={annotationAppearance}
                  onChange={onAnnotationAppearanceChange}
                />
              </CollapsibleSection>
            )}
            {/* Selected markup annotation properties */}
            {selectedAnnotation && (
              <CollapsibleSection title={t('rightPanel.markup')}>
                <div className="flex flex-col gap-2" data-testid="selected-annotation-panel">
                  <div className="flex items-center gap-2">
                    <input
                      data-testid="annotation-color-picker"
                      type="color"
                      value={colorToHex(selectedAnnotation.color)}
                      onChange={(e) => {
                        const hex = e.target.value;
                        const r = parseInt(hex.slice(1, 3), 16) / 255;
                        const g = parseInt(hex.slice(3, 5), 16) / 255;
                        const b = parseInt(hex.slice(5, 7), 16) / 255;
                        onUpdateAnnotationColor?.(selectedAnnotation.id, [r, g, b]);
                      }}
                      className="w-5 h-5 rounded shrink-0 border border-border cursor-pointer p-0"
                      aria-label={t('rightPanel.changeColor')}
                    />
                    <span className="text-xs text-muted-foreground truncate capitalize">
                      {selectedAnnotation.type} · p.{selectedAnnotation.pageIndex + 1}
                    </span>
                  </div>
                  <button
                    data-testid="delete-selected-annotation-btn"
                    onClick={() => { onDeleteSelectedAnnotation?.(selectedAnnotation.id); }}
                    className="flex items-center gap-1 px-2 py-1 rounded text-xs text-destructive hover:bg-destructive/10 transition-colors"
                    aria-label={t('rightPanel.deleteMarkup')}
                  >
                    <TrashIcon className="w-3 h-3" />
                    {t('common.delete')}
                  </button>
                </div>
              </CollapsibleSection>
            )}
            <CollapsibleSection title={t('rightPanel.comments')}>
              <ReviewModeContent comments={comments} activeCommentIdx={activeCommentIdx} onCommentSelect={onCommentSelect} onDeleteComment={onDeleteComment} onUpdateComment={onUpdateComment} onToggleResolved={onToggleResolved} onAddReply={onAddReply} onDeleteReply={onDeleteReply} authorName={authorName} onAuthorChange={onAuthorChange} onNextComment={onNextComment} onPrevComment={onPrevComment} onResolveAll={onResolveAll} onDeleteAllResolved={onDeleteAllResolved} />
            </CollapsibleSection>
            <CollapsibleSection title={t('rightPanel.redactions')}>
              <RedactionPanel redactions={redactions} onApplyRedactions={onApplyRedactions} onDeleteRedaction={onDeleteRedaction} onJumpToRedaction={onJumpToRedaction} />
            </CollapsibleSection>
            <CollapsibleSection title={t('rightPanel.ocr')}>
              <OcrPanel scannedPageIndices={scannedPageIndices} onRunOcr={onRunOcr} ocrRunning={ocrRunning} ocrVisible={ocrVisible} onOcrVisibleChange={onOcrVisibleChange} ocrConfidenceThreshold={ocrConfidenceThreshold} onOcrConfidenceChange={onOcrConfidenceChange} />
            </CollapsibleSection>
          </>
        )}

        {/* ── Forms mode ─────────────────────────────────────────────────── */}
        {mode === 'forms' && (
          <CollapsibleSection title={t('rightPanel.formFields')}>
            <FormsModeContent formFields={formFields} activeFieldIdx={activeFieldIdx} onFieldSelect={onFieldSelect} onSetFieldValue={onSetFieldValue} formValidationErrors={formValidationErrors} onFormSubmit={onFormSubmit} />
          </CollapsibleSection>
        )}

        {/* ── Sign mode ──────────────────────────────────────────────────── */}
        {mode === 'sign' && (
          <CollapsibleSection title={t('rightPanel.signatures')}>
            <SignaturePanel pdfDoc={pdfDoc} />
          </CollapsibleSection>
        )}

        {/* ── Protect mode ───────────────────────────────────────────────── */}
        {mode === 'protect' && (
          <>
            <CollapsibleSection title={t('rightPanel.redactions')}>
              <RedactionPanel redactions={redactions} onApplyRedactions={onApplyRedactions} onDeleteRedaction={onDeleteRedaction} onJumpToRedaction={onJumpToRedaction} onSearchRedact={onRedactSearch} onRedactMetadata={onRedactMetadata} />
            </CollapsibleSection>
            <CollapsibleSection title={t('rightPanel.securitySettings')}>
              <EncryptDecryptControls />
            </CollapsibleSection>
            <CollapsibleSection title={t('rightPanel.permissions')}>
              <PermissionsDisplay permissions={pdfDoc?.state.permissions ?? null} />
            </CollapsibleSection>
          </>
        )}

        {/* ── Edit mode ───────────────────────────────────────────────────── */}
        {mode === 'edit' && (
          <>
            <CollapsibleSection title={t('edit.textProperties')}>
              <TextPropertiesPanel target={selectedTextTarget} formatState={formatState} onFormatCommand={onFormatCommand} />
            </CollapsibleSection>
            <CollapsibleSection title={t('rightPanel.ocr')} defaultOpen={false}>
              <OcrPanel scannedPageIndices={scannedPageIndices} onRunOcr={onRunOcr} ocrRunning={ocrRunning} ocrVisible={ocrVisible} onOcrVisibleChange={onOcrVisibleChange} ocrConfidenceThreshold={ocrConfidenceThreshold} onOcrConfidenceChange={onOcrConfidenceChange} />
            </CollapsibleSection>
            <CollapsibleSection title={t('toolbar.watermark')} defaultOpen={false}>
              <WatermarkControls onApplied={onWatermarkApplied} />
            </CollapsibleSection>
          </>
        )}

        {/* ── Convert mode — OCR ──────────────────────────────────────────── */}
        {mode === 'convert' && (
          <>
            <CollapsibleSection title={t('rightPanel.pdfa')}>
              <PdfAPanel pdfDoc={pdfDoc} busy={pdfaBusy} status={pdfaStatus} onValidatePdfA={onValidatePdfA} onConvertPdfA={onConvertPdfA} onExportOpen={onExportOpen} />
            </CollapsibleSection>
            <CollapsibleSection title={t('rightPanel.ocr')}>
              <OcrPanel scannedPageIndices={scannedPageIndices} onRunOcr={onRunOcr} ocrRunning={ocrRunning} ocrVisible={ocrVisible} onOcrVisibleChange={onOcrVisibleChange} ocrConfidenceThreshold={ocrConfidenceThreshold} onOcrConfidenceChange={onOcrConfidenceChange} />
            </CollapsibleSection>
          </>
        )}

      </div>
    </aside>
  );
}
