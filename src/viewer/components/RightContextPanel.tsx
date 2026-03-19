// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary and confidential.
// Free for personal, non-commercial use.
// Commercial use requires a valid license.
// See https://pdfluent.com/license for terms.

import { useState, useRef, useEffect, useMemo } from 'react';
import type { ReactNode } from 'react';
import { ChevronRightIcon, CheckIcon, XIcon, TrashIcon, PencilIcon, EyeIcon, EyeOffIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { ViewerMode } from '../types';
import type { PdfDocument, DocumentPermissions, FormField, FormFieldType, FormFieldValue, Annotation } from '../../core/document';
import { useTaskQueueContext } from '../context/TaskQueueContext';
import { SignaturePanel } from './SignaturePanel';

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
  /** Delete the selected markup annotation. */
  onDeleteSelectedAnnotation?: (annotationId: string) => void;
  /** Update the color of the selected markup annotation. */
  onUpdateAnnotationColor?: (annotationId: string, color: [number, number, number]) => void;
  /** All redaction annotations across all pages (type === 'redaction'). */
  redactions?: Annotation[];
  /** Permanently apply all pending redactions. */
  onApplyRedactions?: () => void;
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
}

function CollapsibleSection({ title, children }: { title: string; children: ReactNode }) {
  const [open, setOpen] = useState(true);

  return (
    <div className="border-b border-border last:border-b-0">
      <button
        onClick={() => { setOpen(o => !o); }}
        className="w-full flex items-center justify-between px-3 py-2 text-left hover:bg-muted/30 transition-colors"
      >
        <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
          {title}
        </span>
        <ChevronRightIcon
          className={`w-3 h-3 text-muted-foreground transition-transform duration-150 ${open ? 'rotate-90' : ''}`}
        />
      </button>
      {open && (
        <div className="px-3 pb-3">
          {children}
        </div>
      )}
    </div>
  );
}

function PlaceholderText({ text }: { text: string }) {
  return (
    <p className="text-[10px] text-muted-foreground/60 leading-relaxed">{text}</p>
  );
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
    <div className="flex flex-col gap-2" data-testid="doc-info-panel">
      <div>
        <p className="text-[10px] text-muted-foreground">{t('docInfo.title')}</p>
        <input
          data-testid="metadata-title-input"
          className="w-full text-[10px] text-foreground bg-transparent border-b border-transparent focus:border-border outline-none truncate"
          defaultValue={title}
          onBlur={(e) => { onMetadataChange('title', e.currentTarget.value); }}
        />
      </div>
      <div>
        <p className="text-[10px] text-muted-foreground">{t('docInfo.author')}</p>
        <input
          data-testid="metadata-author-input"
          className="w-full text-[10px] text-foreground bg-transparent border-b border-transparent focus:border-border outline-none"
          defaultValue={author}
          onBlur={(e) => { onMetadataChange('author', e.currentTarget.value); }}
        />
      </div>
      <div>
        <p className="text-[10px] text-muted-foreground">{t('docInfo.pages')}</p>
        <p className="text-[10px] text-foreground" data-testid="doc-info-page-count">{pageCount}</p>
      </div>
      <div>
        <p className="text-[10px] text-muted-foreground">{t('docInfo.dimensions')}</p>
        <p className="text-[10px] text-foreground" data-testid="doc-info-dimensions">{dimensions}</p>
      </div>
      <div>
        <p className="text-[10px] text-muted-foreground">{t('docInfo.formType')}</p>
        <p className="text-[10px] text-foreground" data-testid="doc-info-form-type">{formType}</p>
      </div>
      <div>
        <p className="text-[10px] text-muted-foreground">{t('docInfo.pdfVersion')}</p>
        <p className="text-[10px] text-foreground" data-testid="doc-info-pdf-version">{pdfVersion}</p>
      </div>
      <div>
        <p className="text-[10px] text-muted-foreground">{t('docInfo.created')}</p>
        <p className="text-[10px] text-foreground" data-testid="doc-info-creation-date">{creationDateStr}</p>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Protect mode — Beveiligingsinstellingen (Encrypt / Decrypt)
// ---------------------------------------------------------------------------

const isTauri = typeof window !== 'undefined' && '__TAURI__' in window;

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
    'w-full text-[10px] bg-card border border-border rounded px-2 py-1 text-foreground placeholder:text-muted-foreground/50 outline-none focus:ring-1 focus:ring-primary';
  const buttonClass =
    'w-full mt-1 py-1 text-[10px] font-semibold rounded bg-primary text-primary-foreground hover:opacity-90 transition-opacity disabled:opacity-40 disabled:cursor-not-allowed';

  return (
    <div className="flex flex-col gap-4">
      {/* Encrypt */}
      <div className="flex flex-col gap-1.5">
        <span className="text-[10px] font-medium text-muted-foreground">{t('protect.encrypt')}</span>
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
        <span className="text-[10px] font-medium text-muted-foreground">{t('protect.decrypt')}</span>
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
          <span className="text-[10px] text-foreground">{t(labelKey)}</span>
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

  return (
    <div className="flex flex-col gap-0.5">
      {/* Completion summary — always visible */}
      <p data-testid="forms-completion-summary" className="text-[10px] text-muted-foreground mb-1">
        {formFields.some(f => f.required)
          ? t('forms.completionRequired', { filled: filledRequired.length, total: requiredCount })
          : t('forms.completionCount', { count: formFields.length })}
      </p>
      {formFields.length === 0 && (
        <PlaceholderText text={t('leftNav.noFormFields')} />
      )}
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
                className="text-[10px] font-medium text-foreground/90 truncate flex-1"
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
                <span className="text-[10px] text-foreground/60">
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
                className="mt-0.5 w-full text-[10px] bg-card border border-primary/50 rounded px-2 py-0.5 text-foreground outline-none focus:ring-1 focus:ring-primary focus:border-primary"
              />
            )}
          </div>
        );
      })}

      {/* Submit / save button — always visible when there are form fields */}
      <button
        data-testid="form-submit-btn"
        onClick={() => { void onFormSubmit(); }}
        className="mt-2 w-full py-1.5 text-[10px] font-semibold rounded bg-primary text-primary-foreground hover:opacity-90 transition-opacity"
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
        // eslint-disable-next-line jsx-a11y/no-autofocus
        autoFocus
        className="w-full text-[9px] bg-card border border-border rounded px-2 py-1 text-foreground resize-none outline-none focus:ring-1 focus:ring-primary"
      />
      <div className="flex gap-1">
        <button
          data-testid="reply-submit-btn"
          onClick={handleSubmit}
          disabled={!replyText.trim()}
          className="flex-1 py-0.5 text-[9px] font-medium rounded bg-primary text-primary-foreground hover:opacity-90 transition-opacity disabled:opacity-40"
        >
          {t('review.send')}
        </button>
        <button
          data-testid="reply-cancel-btn"
          onClick={e => { e.stopPropagation(); setOpen(false); setReplyText(''); }}
          className="flex-1 py-0.5 text-[9px] rounded border border-border text-muted-foreground hover:bg-muted transition-colors"
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
}: {
  scannedPageIndices: Set<number>;
  onRunOcr?: (options: { language: string; scope: 'scanned' | 'all'; preprocessMode: 'off' | 'auto' | 'manual' }) => void;
  ocrRunning?: boolean;
  ocrVisible?: boolean;
  onOcrVisibleChange?: (v: boolean) => void;
  ocrConfidenceThreshold?: number;
  onOcrConfidenceChange?: (v: number) => void;
}) {
  const { t } = useTranslation();
  const [ocrLanguage, setOcrLanguage] = useState('en');
  const [ocrScope, setOcrScope] = useState<'scanned' | 'all'>('scanned');
  const [ocrPreprocessMode, setOcrPreprocessMode] = useState<'off' | 'auto' | 'manual'>('auto');

  const scannedCount = scannedPageIndices.size;

  return (
    <div className="flex flex-col gap-2" data-testid="ocr-panel">
      {/* Scanned page summary */}
      <p className="text-[10px] text-muted-foreground">
        {scannedCount > 0
          ? t('ocr.scannedDetected', { count: scannedCount })
          : t('ocr.noScannedDetected')}
      </p>

      {/* Language selector */}
      <div className="flex flex-col gap-0.5">
        <label className="text-[9px] text-muted-foreground/70 uppercase tracking-wide">{t('ocr.language')}</label>
        <select
          data-testid="ocr-language-select"
          value={ocrLanguage}
          onChange={e => { setOcrLanguage(e.target.value); }}
          className="text-[10px] bg-card border border-border rounded px-2 py-1 text-foreground outline-none"
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
        <label className="text-[9px] text-muted-foreground/70 uppercase tracking-wide">{t('ocr.scope')}</label>
        <select
          data-testid="ocr-scope-select"
          value={ocrScope}
          onChange={e => { setOcrScope(e.target.value as 'scanned' | 'all'); }}
          className="text-[10px] bg-card border border-border rounded px-2 py-1 text-foreground outline-none"
        >
          <option value="scanned">{t('ocr.scopeScanned')}</option>
          <option value="all">{t('ocr.scopeAll')}</option>
        </select>
      </div>

      {/* Preprocessing mode */}
      <div className="flex flex-col gap-0.5">
        <label className="text-[9px] text-muted-foreground/70 uppercase tracking-wide">{t('ocr.preprocess')}</label>
        <select
          data-testid="ocr-preprocess-select"
          value={ocrPreprocessMode}
          onChange={e => { setOcrPreprocessMode(e.target.value as 'off' | 'auto' | 'manual'); }}
          className="text-[10px] bg-card border border-border rounded px-2 py-1 text-foreground outline-none"
        >
          <option value="auto">{t('ocr.preprocessAuto')}</option>
          <option value="off">{t('ocr.preprocessOff')}</option>
          <option value="manual">{t('ocr.preprocessManual')}</option>
        </select>
      </div>

      {/* Confidence threshold */}
      <div className="flex flex-col gap-0.5">
        <label className="text-[9px] text-muted-foreground/70 uppercase tracking-wide">
          {t('ocr.confidenceThreshold', { value: Math.round(ocrConfidenceThreshold * 100) })}
        </label>
        <input
          data-testid="ocr-confidence-slider"
          type="range"
          min={0}
          max={100}
          value={Math.round(ocrConfidenceThreshold * 100)}
          onChange={e => { onOcrConfidenceChange?.(parseInt(e.target.value) / 100); }}
          className="w-full accent-primary"
        />
      </div>

      {/* Run OCR button + overlay toggle */}
      <div className="flex gap-1">
        <button
          data-testid="run-ocr-btn"
          onClick={() => {
            onRunOcr?.({ language: ocrLanguage, scope: ocrScope, preprocessMode: ocrPreprocessMode });
          }}
          disabled={ocrRunning}
          aria-label={t('ocr.runAriaLabel')}
          className="flex-1 py-1 text-[10px] font-medium rounded bg-primary text-primary-foreground hover:opacity-90 transition-opacity disabled:opacity-40"
        >
          {ocrRunning ? t('ocr.running') : t('ocr.run')}
        </button>
        <button
          data-testid="ocr-visibility-toggle"
          onClick={() => { onOcrVisibleChange?.(!ocrVisible); }}
          title={t('ocr.toggleOverlay')}
          aria-label={t('ocr.toggleOverlay')}
          className="p-1.5 border border-border rounded text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
        >
          {ocrVisible ? <EyeIcon className="w-3 h-3" /> : <EyeOffIcon className="w-3 h-3" />}
        </button>
      </div>
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
    'w-full text-[10px] bg-card border border-border rounded px-2 py-1 text-foreground placeholder:text-muted-foreground/50 outline-none focus:ring-1 focus:ring-primary';

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
          value={filterText}
          onChange={e => { setFilterText(e.target.value); }}
          className={inputClass}
        />
        <div className="flex gap-1">
          <select
            data-testid="comment-filter-author"
            value={filterAuthor}
            onChange={e => { setFilterAuthor(e.target.value); onCommentSelect(-1); }}
            className="flex-1 text-[10px] bg-card border border-border rounded px-2 py-1 text-foreground outline-none"
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
          className="w-full text-[10px] bg-card border border-border rounded px-2 py-1 text-foreground outline-none"
        >
          <option value="">{t('review.allPages')}</option>
          {uniquePages.map(p => <option key={p} value={String(p)}>{t('review.commentPage', { page: p + 1 })}</option>)}
        </select>
        <select
          data-testid="comment-filter-status"
          value={filterStatus}
          onChange={e => { setFilterStatus(e.target.value as '' | 'open' | 'resolved'); onCommentSelect(-1); }}
          className="w-full text-[10px] bg-card border border-border rounded px-2 py-1 text-foreground outline-none"
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
      <p data-testid="comment-filter-count" className="text-[10px] text-muted-foreground mb-1">
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
          className="flex-1 py-0.5 text-[9px] rounded border border-border text-muted-foreground hover:bg-muted transition-colors"
        >
          {t('review.exportMd')}
        </button>
        <button
          data-testid="export-review-json-btn"
          onClick={() => { handleExportReview('json'); }}
          aria-label={t('review.exportJsonAriaLabel')}
          title={t('review.exportJson')}
          className="flex-1 py-0.5 text-[9px] rounded border border-border text-muted-foreground hover:bg-muted transition-colors"
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
            className="flex-1 py-0.5 text-[9px] rounded border border-border text-muted-foreground hover:bg-muted transition-colors disabled:opacity-40"
          >
            {t('review.markAsResolved')}
          </button>
          <button
            data-testid="delete-resolved-btn"
            onClick={() => { onDeleteAllResolved?.(); }}
            disabled={!comments.some(c => (c.status ?? 'open') === 'resolved')}
            aria-label={t('review.deleteResolvedAriaLabel')}
            title={t('review.deleteResolvedAriaLabel')}
            className="flex-1 py-0.5 text-[9px] rounded border border-border text-muted-foreground hover:bg-muted transition-colors disabled:opacity-40"
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
            className="flex-1 py-0.5 text-[9px] rounded border border-border text-muted-foreground hover:bg-muted transition-colors disabled:opacity-40"
          >
            ← {t('review.prev')}
          </button>
          <button
            data-testid="next-comment-btn"
            onClick={() => { onNextComment?.(); }}
            disabled={comments.length === 0}
            aria-label={t('review.nextCommentAriaLabel')}
            className="flex-1 py-0.5 text-[9px] rounded border border-border text-muted-foreground hover:bg-muted transition-colors disabled:opacity-40"
          >
            {t('review.next')} →
          </button>
        </div>
      )}

      {/* Zero-results state — shown when filters are active but no comments match */}
      {anyFilterActive && filteredComments.length === 0 && (
        <p data-testid="comment-filter-empty" className="text-[10px] text-muted-foreground/60 leading-relaxed">
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
                      <span className="text-[10px] font-medium text-foreground/80 truncate">
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
                        // eslint-disable-next-line jsx-a11y/no-autofocus
                        autoFocus
                        className="w-full text-[10px] bg-card border border-primary rounded px-2 py-1 text-foreground resize-none outline-none focus:ring-1 focus:ring-primary"
                      />
                      <div className="flex items-center gap-1">
                        <button
                          data-testid="comment-edit-confirm-btn"
                          onClick={() => {
                            onUpdateComment(comment.id, editText);
                            setEditingId(null);
                          }}
                          className="flex-1 py-0.5 text-[9px] font-medium rounded bg-primary text-primary-foreground hover:opacity-90 transition-opacity"
                        >
                          {t('common.save')}
                        </button>
                        <button
                          data-testid="comment-edit-cancel-btn"
                          onClick={() => { setEditingId(null); }}
                          className="flex-1 py-0.5 text-[9px] rounded border border-border text-muted-foreground hover:bg-muted transition-colors"
                        >
                          {t('common.cancel')}
                        </button>
                      </div>
                    </div>
                  ) : (
                    comment.contents && (
                      <p className="text-[10px] text-muted-foreground leading-snug line-clamp-2">
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
    const confirmed = window.confirm(t('rightPanel.redactionConfirm', { count: redactions.length }));
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
          <span className="text-[9px] text-muted-foreground/70 uppercase tracking-wide">{t('protect.searchRedact')}</span>
          <div className="flex gap-1">
            <input
              data-testid="search-redact-input"
              type="text"
              value={searchQuery}
              onChange={e => { setSearchQuery(e.target.value); }}
              onKeyDown={e => { if (e.key === 'Enter') void handleSearchRedact(); }}
              placeholder={t('protect.searchRedactPlaceholder')}
              className="flex-1 text-[10px] bg-card border border-border rounded px-2 py-1 text-foreground outline-none focus:ring-1 focus:ring-primary"
            />
            <button
              data-testid="search-redact-btn"
              onClick={() => { void handleSearchRedact(); }}
              disabled={!searchQuery.trim() || searching}
              className="text-[10px] px-2 py-1 bg-destructive text-destructive-foreground rounded hover:opacity-90 transition-opacity disabled:opacity-40 shrink-0"
            >
              {searching ? t('common.busy') : t('protect.searchRedactBtn')}
            </button>
          </div>
        </div>
      )}

      {/* Pending list + count */}
      <p className="text-[10px] text-muted-foreground">
        {redactions.length === 0
          ? t('rightPanel.noRedactions')
          : t('rightPanel.redactionCount', { count: redactions.length })}
      </p>

      <button
        data-testid="apply-redactions-btn"
        onClick={() => { void handleApply(); }}
        disabled={busy || redactions.length === 0}
        className="w-full py-1 text-[10px] font-semibold rounded bg-destructive text-destructive-foreground hover:opacity-90 transition-opacity disabled:opacity-40 disabled:cursor-not-allowed"
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
            <span className="text-[10px] text-foreground/70 truncate flex-1">
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
          <span className="text-[9px] text-muted-foreground/70 uppercase tracking-wide">{t('protect.redactMetadataTitle')}</span>
          <p className="text-[10px] text-muted-foreground">{t('protect.redactMetadataDesc')}</p>
          <button
            data-testid="redact-metadata-btn"
            onClick={() => { void handleRedactMetadata(); }}
            disabled={strippingMeta}
            className="w-full py-1 text-[10px] font-medium rounded bg-muted text-foreground hover:bg-muted/80 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
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

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function RightContextPanel({ mode, pdfDoc, pageCount, formFields, comments, activeCommentIdx, onCommentSelect, onDeleteComment, onUpdateComment, onToggleResolved, onAddReply, onDeleteReply, onNextComment, onPrevComment, onResolveAll, onDeleteAllResolved, scannedPageIndices = new Set(), onRunOcr, ocrRunning, ocrVisible = true, onOcrVisibleChange, ocrConfidenceThreshold = 0.6, onOcrConfidenceChange, activeFieldIdx, onFieldSelect, onSetFieldValue, formValidationErrors, onFormSubmit, authorName, onAuthorChange, onMetadataChange, selectedAnnotation, onDeleteSelectedAnnotation, onUpdateAnnotationColor, redactions = [], onApplyRedactions, onDeleteRedaction, onJumpToRedaction, onRedactSearch, onRedactMetadata }: RightContextPanelProps) {
  const { t } = useTranslation();
  return (
    <div className="w-48 flex flex-col bg-background border-l border-border shrink-0 overflow-hidden">
      {/* Panel header */}
      <div className="h-9 flex items-center px-3 border-b border-border shrink-0">
        <span className="text-xs font-medium text-foreground">{t('rightPanel.properties')}</span>
      </div>

      {/* Sections */}
      <div className="flex-1 overflow-y-auto pf-scrollbar">

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
                    <span className="text-[10px] text-muted-foreground truncate capitalize">
                      {selectedAnnotation.type} · p.{selectedAnnotation.pageIndex + 1}
                    </span>
                  </div>
                  <button
                    data-testid="delete-selected-annotation-btn"
                    onClick={() => { onDeleteSelectedAnnotation?.(selectedAnnotation.id); }}
                    className="flex items-center gap-1 px-2 py-1 rounded text-[10px] text-destructive hover:bg-destructive/10 transition-colors"
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

        {/* ── Protect mode ───────────────────────────────────────────────── */}
        {mode === 'protect' && (
          <>
            <CollapsibleSection title={t('rightPanel.redactions')}>
              <RedactionPanel redactions={redactions} onApplyRedactions={onApplyRedactions} onDeleteRedaction={onDeleteRedaction} onJumpToRedaction={onJumpToRedaction} onSearchRedact={onRedactSearch} onRedactMetadata={onRedactMetadata} />
            </CollapsibleSection>
            <CollapsibleSection title={t('rightPanel.signatures')}>
              <SignaturePanel pdfDoc={pdfDoc} />
            </CollapsibleSection>
            <CollapsibleSection title={t('rightPanel.securitySettings')}>
              <EncryptDecryptControls />
            </CollapsibleSection>
            <CollapsibleSection title={t('rightPanel.permissions')}>
              <PermissionsDisplay permissions={pdfDoc?.state.permissions ?? null} />
            </CollapsibleSection>
          </>
        )}

        {/* ── Edit mode — OCR ─────────────────────────────────────────────── */}
        {mode === 'edit' && (
          <>
            <CollapsibleSection title={t('rightPanel.ocr')}>
              <OcrPanel scannedPageIndices={scannedPageIndices} onRunOcr={onRunOcr} ocrRunning={ocrRunning} ocrVisible={ocrVisible} onOcrVisibleChange={onOcrVisibleChange} ocrConfidenceThreshold={ocrConfidenceThreshold} onOcrConfidenceChange={onOcrConfidenceChange} />
            </CollapsibleSection>
          </>
        )}

        {/* ── Convert mode — OCR ──────────────────────────────────────────── */}
        {mode === 'convert' && (
          <CollapsibleSection title={t('rightPanel.ocr')}>
            <OcrPanel scannedPageIndices={scannedPageIndices} onRunOcr={onRunOcr} ocrRunning={ocrRunning} ocrVisible={ocrVisible} onOcrVisibleChange={onOcrVisibleChange} ocrConfidenceThreshold={ocrConfidenceThreshold} onOcrConfidenceChange={onOcrConfidenceChange} />
          </CollapsibleSection>
        )}

      </div>
    </div>
  );
}
