// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary. The PDFluent application is free to use,
// including for commercial purposes. Redistribution, or extraction or reuse
// of its components (including the embedded PDF engine), requires a licence.
// See https://pdfluent.com/license for terms.

import { useState, useEffect, useRef, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { isTauriRuntime } from '../../lib/tauri-detection';
import {
  LayoutIcon,
  BookmarkIcon,
  MessageSquareIcon,
  PaperclipIcon,
  LayersIcon,
  FileInputIcon,
  XIcon,
  ChevronRightIcon,
  ChevronUpIcon,
  ChevronDownIcon,
  DownloadIcon,
  Trash2Icon,
  PlusIcon,
  EyeIcon,
  EyeOffIcon,
  LockIcon,
  Type,
} from 'lucide-react';
import type { OutlineNode, FormField, FormFieldType, Annotation } from '../../core/document';
import type { NavigationPanel } from '../types';
import type { TextParagraphTarget } from '../text/textInteractionModel';

// ── Attachment & Layer types (mirrors Rust structs) ─────────────────────────

export interface AttachmentInfo {
  name: string;
  size_bytes: number;
  description: string;
  mime_type: string;
  creation_date: string;
}

export interface LayerInfo {
  id: string;
  name: string;
  visible: boolean;
  locked: boolean;
}

// ── Props ────────────────────────────────────────────────────────────────────

interface LeftNavRailProps {
  thumbnails: Map<number, string>;
  pageCount: number;
  currentPage: number;
  onPageSelect: (index: number) => void;
  onNextPage: () => void;
  onPrevPage: () => void;
  outline: OutlineNode[];
  formFields: FormField[];
  comments: Annotation[];
  onReorderPages?: (newOrder: number[]) => void;
  pageLabels?: string[];
  attachments?: AttachmentInfo[];
  onExtractAttachment?: (name: string) => void;
  onAddAttachment?: () => void;
  onRemoveAttachment?: (name: string) => void;
  layers?: LayerInfo[];
  layerVisibility?: Map<string, boolean>;
  onToggleLayer?: (id: string) => void;

  // Format sidebar props
  isEditMode?: boolean;
  selectedTextTarget?: TextParagraphTarget | null;
  formatState?: { isBold: boolean; isItalic: boolean; isUnderline: boolean; };
  onFormatCommand?: (command: string, value?: string) => void;
  editorDivRef?: React.RefObject<HTMLDivElement | null>;
}

interface PanelTab {
  id: NavigationPanel;
  icon: React.ReactNode;
  label: string;
}

const PANELS: PanelTab[] = [
  { id: 'thumbnails', icon: <LayoutIcon className="w-4 h-4" />, label: 'leftNav.thumbnails' },
  { id: 'bookmarks', icon: <BookmarkIcon className="w-4 h-4" />, label: 'leftNav.bookmarks' },
  { id: 'comments', icon: <MessageSquareIcon className="w-4 h-4" />, label: 'leftNav.comments' },
  { id: 'attachments', icon: <PaperclipIcon className="w-4 h-4" />, label: 'leftNav.attachments' },
  { id: 'layers', icon: <LayersIcon className="w-4 h-4" />, label: 'leftNav.layers' },
  { id: 'fields', icon: <FileInputIcon className="w-4 h-4" />, label: 'leftNav.formFields' },
  { id: 'format', icon: <Type className="w-4 h-4" />, label: 'leftNav.formatText' },
];

// ── Individual panel content ────────────────────────────────────────────────

/** Approximate rendered height of one thumbnail card in pixels (A4 aspect + label + padding). */
const THUMBNAIL_ITEM_HEIGHT = 168;
/** Number of off-screen items to render above and below the visible window. */
const THUMBNAIL_OVERSCAN = 3;

function ThumbnailPanel({
  thumbnails,
  pageCount,
  currentPage,
  onPageSelect,
  onReorderPages,
  pageLabels,
}: Pick<LeftNavRailProps, 'thumbnails' | 'pageCount' | 'currentPage' | 'onPageSelect' | 'onReorderPages' | 'pageLabels'>) {
  const activeRef = useRef<HTMLButtonElement | null>(null);
  const dragSrcIndex = useRef<number | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [containerHeight, setContainerHeight] = useState(600);

  // Observe container resize so the visible window stays accurate.
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => {
      if (!entry) return;
      setContainerHeight(entry.contentRect.height);
    });
    ro.observe(el);
    return () => { ro.disconnect(); };
  }, []);

  // Scroll active thumbnail into view when the current page changes.
  useEffect(() => {
    activeRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [currentPage]);

  // Compute the visible window with overscan.
  const visibleStart = Math.max(0, Math.floor(scrollTop / THUMBNAIL_ITEM_HEIGHT) - THUMBNAIL_OVERSCAN);
  const visibleEnd = Math.min(
    pageCount - 1,
    Math.ceil((scrollTop + containerHeight) / THUMBNAIL_ITEM_HEIGHT) + THUMBNAIL_OVERSCAN
  );
  const topPad = visibleStart * THUMBNAIL_ITEM_HEIGHT;
  const bottomPad = Math.max(0, (pageCount - 1 - visibleEnd)) * THUMBNAIL_ITEM_HEIGHT;

  function handleDragStart(index: number) {
    dragSrcIndex.current = index;
  }

  function handleDragOver(e: React.DragEvent) {
    e.preventDefault();
  }

  function handleDrop(dropIndex: number) {
    const src = dragSrcIndex.current;
    if (src === null || src === dropIndex) return;
    const order = Array.from({ length: pageCount }, (_, i) => i);
    order.splice(src, 1);
    order.splice(dropIndex, 0, src);
    onReorderPages?.(order);
    dragSrcIndex.current = null;
  }

  return (
    <div
      ref={containerRef}
      className="flex-1 overflow-y-auto pf-scrollbar py-2 px-2 flex flex-col gap-2"
      onScroll={e => { setScrollTop((e.currentTarget).scrollTop); }}
      data-testid="thumbnail-scroll-container"
    >
      {topPad > 0 && <div style={{ height: topPad }} aria-hidden="true" />}
      {Array.from({ length: visibleEnd - visibleStart + 1 }, (_, idx) => {
        const i = visibleStart + idx;
        const thumbUrl = thumbnails.get(i);
        const isActive = currentPage === i;
        return (
          <button
            key={i}
            ref={isActive ? activeRef : null}
            data-testid={`thumbnail-${i}`}
            draggable={!!onReorderPages}
            onClick={() => { onPageSelect(i); }}
            onDragStart={() => { handleDragStart(i); }}
            onDragOver={handleDragOver}
            onDrop={() => { handleDrop(i); }}
            className={isActive ? 'leftrail-thumb leftrail-thumb-active' : 'leftrail-thumb'}
          >
            {thumbUrl ? (
              <img
                src={thumbUrl}
                alt={`Page ${i + 1}`}
                draggable={false}
                className="w-full block rounded-sm shadow-sm"
              />
            ) : (
              <div
                className="w-full bg-muted rounded-sm flex items-center justify-center text-xs text-muted-foreground"
                style={{ aspectRatio: '1 / 1.414' }}
              >
                {i + 1}
              </div>
            )}
            <span className={`text-[10px] font-medium select-none ${isActive ? 'text-primary' : 'text-muted-foreground'}`}>
              {pageLabels?.[i] ?? (i + 1)}
            </span>
          </button>
        );
      })}
      {bottomPad > 0 && <div style={{ height: bottomPad }} aria-hidden="true" />}
    </div>
  );
}

function OutlineItem({
  node,
  depth,
  currentPage,
  onPageSelect,
}: {
  node: OutlineNode;
  depth: number;
  currentPage: number;
  onPageSelect: (index: number) => void;
}) {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState(true);
  const hasChildren = node.children.length > 0;
  const isActive = node.pageIndex === currentPage;

  return (
    <div>
      <button
        onClick={() => {
          if (hasChildren) setExpanded(e => !e);
          onPageSelect(node.pageIndex);
        }}
        data-testid="outline-item"
        className={[
          'flex items-center gap-1 w-full text-left px-1 py-0.5 rounded text-[11px] transition-colors',
          isActive
            ? 'bg-primary/10 text-primary font-medium'
            : 'text-foreground/80 hover:bg-muted/60 hover:text-foreground',
        ].join(' ')}
        style={{ paddingLeft: `${4 + depth * 10}px` }}
        title={`${t('organize.pageAlt', { page: node.pageIndex + 1 })}: ${node.title}`}
      >
        {hasChildren ? (
          <ChevronRightIcon
            className={`w-3 h-3 shrink-0 transition-transform ${expanded ? 'rotate-90' : ''}`}
          />
        ) : (
          <span className="w-3 h-3 shrink-0" />
        )}
        <span className="truncate">{node.title}</span>
      </button>
      {hasChildren && expanded && (
        <div>
          {node.children.map((child, i) => (
            <OutlineItem key={i} node={child} depth={depth + 1} currentPage={currentPage} onPageSelect={onPageSelect} />
          ))}
        </div>
      )}
    </div>
  );
}

function BookmarksPanel({
  outline,
  currentPage,
  onPageSelect,
}: {
  outline: OutlineNode[];
  currentPage: number;
  onPageSelect: (index: number) => void;
}) {
  const { t } = useTranslation();
  if (outline.length === 0) {
    return (
      <div className="leftrail-empty">
        <span className="leftrail-empty-mark" aria-hidden="true">
          <BookmarkIcon />
        </span>
        <p className="leftrail-empty-message">{t('leftNav.noBookmarks')}</p>
      </div>
    );
  }
  return (
    <div className="flex-1 overflow-y-auto pf-scrollbar py-1 px-1">
      {outline.map((node, i) => (
        <OutlineItem key={i} node={node} depth={0} currentPage={currentPage} onPageSelect={onPageSelect} />
      ))}
    </div>
  );
}

// TODO(pdfluent-viewer): implement full-text search panel with result highlighting
// Status: design integrated, functionality not implemented yet
function SearchPanel() {
  const { t } = useTranslation();
  return (
    <div className="flex-1 flex flex-col gap-2 p-2">
      <input
        disabled
        type="search"
        placeholder={t('search.placeholder')}
        aria-label={t('search.placeholder')}
        className="w-full text-xs bg-muted border border-border rounded-md px-2 py-1.5 text-muted-foreground/50 cursor-default"
        title={t('leftNav.searchUnavailableTitle')}
      />
      <p className="text-[10px] text-muted-foreground/60 text-center mt-4">{t('leftNav.searchComingSoon')}</p>
    </div>
  );
}

function CommentsPanel({ comments }: { comments: Annotation[] }) {
  const { t } = useTranslation();
  if (comments.length === 0) {
    return (
      <div className="leftrail-empty">
        <span className="leftrail-empty-mark" aria-hidden="true">
          <MessageSquareIcon />
        </span>
        <p className="leftrail-empty-message">{t('leftNav.noCommentsSide')}</p>
      </div>
    );
  }

  // Group by page index and sort groups in ascending page order
  const groups = new Map<number, Annotation[]>();
  for (const comment of comments) {
    const existing = groups.get(comment.pageIndex);
    if (existing) { existing.push(comment); } else { groups.set(comment.pageIndex, [comment]); }
  }
  const sortedPageIndices = Array.from(groups.keys()).sort((a, b) => a - b);

  return (
    <div className="flex-1 overflow-y-auto pf-scrollbar py-1 px-1">
      {sortedPageIndices.map(pageIndex => (
        <div key={pageIndex}>
          <p
            data-testid="comment-group-heading"
            className="text-[9px] font-semibold uppercase tracking-wide text-muted-foreground/60 px-2 py-1 mt-1 first:mt-0"
          >
            {t('review.commentPage', { page: pageIndex + 1 })}
          </p>
          {groups.get(pageIndex)!.map(comment => (
            <div
              key={comment.id}
              className="flex flex-col gap-0.5 px-2 py-1.5 rounded hover:bg-muted/50 transition-colors"
            >
              <span className="text-[10px] font-medium text-foreground/80 truncate">
                {comment.author || 'Onbekend'}
              </span>
              {comment.contents && (
                <p className="text-[10px] text-muted-foreground leading-snug line-clamp-2">
                  {comment.contents}
                </p>
              )}
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function AttachmentsPanel({
  attachments = [],
  onExtractAttachment,
  onAddAttachment,
  onRemoveAttachment,
}: Pick<LeftNavRailProps, 'attachments' | 'onExtractAttachment' | 'onAddAttachment' | 'onRemoveAttachment'>) {
  const { t } = useTranslation();

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* Toolbar */}
      <div className="flex items-center justify-between px-2 py-1.5 border-b border-border shrink-0">
        <span className="text-[10px] text-muted-foreground">{t('leftNav.attachments')}</span>
        <button
          data-testid="add-attachment-btn"
          onClick={onAddAttachment}
          title={t('leftNav.addAttachment')}
          className="p-1 rounded hover:bg-muted transition-colors"
        >
          <PlusIcon className="w-3.5 h-3.5 text-muted-foreground" />
        </button>
      </div>

      {attachments.length === 0 ? (
        <div className="leftrail-empty">
          <span className="leftrail-empty-mark" aria-hidden="true">
            <PaperclipIcon />
          </span>
          <p className="leftrail-empty-message">{t('leftNav.noAttachments')}</p>
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto pf-scrollbar py-1 px-1">
          {attachments.map((att) => (
            <div
              key={att.name}
              data-testid="attachment-item"
              className="flex items-start gap-1.5 px-2 py-1.5 rounded hover:bg-muted/50 transition-colors group"
            >
              <PaperclipIcon className="w-3.5 h-3.5 text-muted-foreground shrink-0 mt-0.5" />
              <div className="flex-1 min-w-0">
                <p className="text-[10px] font-medium text-foreground/90 truncate" title={att.name}>{att.name}</p>
                <p className="text-[9px] text-muted-foreground/70">{formatBytes(att.size_bytes)}{att.mime_type ? ` · ${att.mime_type}` : ''}</p>
              </div>
              <div className="flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                <button
                  data-testid="extract-attachment-btn"
                  onClick={() => { onExtractAttachment?.(att.name); }}
                  title={t('leftNav.extractAttachment')}
                  className="p-1 rounded hover:bg-muted transition-colors"
                >
                  <DownloadIcon className="w-3 h-3 text-muted-foreground" />
                </button>
                <button
                  data-testid="remove-attachment-btn"
                  onClick={async () => {
                    let confirmed = false;
                    if (isTauriRuntime()) {
                      try {
                        const { ask } = await import('@tauri-apps/plugin-dialog');
                        confirmed = await ask(t('leftNav.removeAttachmentConfirm', { name: att.name }), {
                          title: t('leftNav.removeAttachment') || 'Remove Attachment',
                          kind: 'warning'
                        });
                      } catch (err) {
                        console.error('Tauri ask failed; cancelling attachment removal', err);
                        confirmed = false;
                      }
                    } else {
                      confirmed = false;
                    }
                    if (confirmed) {
                      onRemoveAttachment?.(att.name);
                    }
                  }}
                  title={t('leftNav.removeAttachment')}
                  className="p-1 rounded hover:bg-destructive/10 transition-colors"
                >
                  <Trash2Icon className="w-3 h-3 text-destructive/70" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function LayersPanel({
  layers = [],
  layerVisibility = new Map<string, boolean>(),
  onToggleLayer,
}: Pick<LeftNavRailProps, 'layers' | 'layerVisibility' | 'onToggleLayer'>) {
  const { t } = useTranslation();

  if (layers.length === 0) {
    return (
      <div className="leftrail-empty">
        <span className="leftrail-empty-mark" aria-hidden="true">
          <LayersIcon />
        </span>
        <p className="leftrail-empty-message">{t('leftNav.noLayers')}</p>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto pf-scrollbar py-1 px-1">
      {/* TODO: OCG-aware rendering — render_page currently ignores OCG state;
          toggling visibility here updates frontend state only. Full render
          support will be added in a future release (#XXX). */}
      {layers.map((layer) => {
        const visible = layerVisibility.get(layer.id) ?? layer.visible;
        return (
          <div
            key={layer.id}
            data-testid="layer-item"
            className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-muted/50 transition-colors"
          >
            <button
              data-testid="layer-visibility-btn"
              onClick={() => { if (!layer.locked) onToggleLayer?.(layer.id); }}
              disabled={layer.locked}
              title={visible ? t('leftNav.layerVisible') : t('leftNav.layerHidden')}
              className="shrink-0 disabled:cursor-not-allowed"
              aria-pressed={visible}
            >
              {visible
                ? <EyeIcon className="w-3.5 h-3.5 text-foreground/60" />
                : <EyeOffIcon className="w-3.5 h-3.5 text-muted-foreground/40" />}
            </button>
            <span className={`flex-1 text-[10px] truncate ${visible ? 'text-foreground/90' : 'text-muted-foreground/50'}`} title={layer.name}>
              {layer.name}
            </span>
            {layer.locked && (
              <span title={t('leftNav.layerLocked')}><LockIcon className="w-3 h-3 text-muted-foreground/40 shrink-0" /></span>
            )}
          </div>
        );
      })}
    </div>
  );
}

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

function FieldsPanel({
  formFields,
  onPageSelect,
}: {
  formFields: FormField[];
  onPageSelect: (index: number) => void;
}) {
  const { t } = useTranslation();
  if (formFields.length === 0) {
    return (
      <div className="leftrail-empty">
        <span className="leftrail-empty-mark" aria-hidden="true">
          <FileInputIcon />
        </span>
        <p className="leftrail-empty-message">{t('leftNav.noFormFields')}</p>
      </div>
    );
  }
  return (
    <div className="flex-1 overflow-y-auto pf-scrollbar py-1 px-1">
      {formFields.map(field => (
        <button
          key={field.id}
          data-testid="field-row"
          onClick={() => { onPageSelect(field.pageIndex); }}
          className="w-full text-left flex flex-col gap-0.5 px-2 py-1.5 rounded hover:bg-muted/50 transition-colors cursor-pointer focus:outline-none focus-visible:ring-1 focus-visible:ring-primary"
        >
          <span className="text-[11px] font-medium text-foreground/90 truncate" title={field.label || field.name}>
            {field.label || field.name}
          </span>
          <div className="flex items-center gap-1.5">
            <span className="text-[9px] font-medium px-1 py-0.5 rounded bg-muted text-muted-foreground uppercase tracking-wide">
              {t(FIELD_TYPE_LABEL_KEYS[field.type] ?? field.type)}
            </span>
            <span className="text-[10px] text-muted-foreground/60">
              p.{field.pageIndex + 1}
            </span>
          </div>
        </button>
      ))}
    </div>
  );
}

// ── Format Text Panel ────────────────────────────────────────────────────────

function FormatPanel({
  selectedTextTarget,
  formatState,
  onFormatCommand,
  editorDivRef,
}: {
  selectedTextTarget?: TextParagraphTarget | null;
  formatState?: { isBold: boolean; isItalic: boolean; isUnderline: boolean; };
  onFormatCommand?: (command: string, value?: string) => void;
  editorDivRef?: React.RefObject<HTMLDivElement | null>;
}) {
  const { t } = useTranslation();

  const [activeSize, setActiveSize] = useState('11');
  const [activeColor, setActiveColor] = useState('#000000');

  // Houdt synchronisatie bij
  useEffect(() => {
    const el = editorDivRef?.current;
    if (!el) return;

    function handleSelectionChange() {
      try {
        const style = window.getComputedStyle(el as HTMLDivElement);

        // Font Size
        const size = parseInt(style.fontSize, 10);
        if (!isNaN(size)) {
          setActiveSize(size.toString());
        }

        // Color
        const color = style.color;
        setActiveColor(color);
      } catch {
        // Safe fallback
      }
    }

    document.addEventListener('selectionchange', handleSelectionChange);
    // Voer ook direct een keer uit op mount/update van editorDivRef
    handleSelectionChange();

    return () => {
      document.removeEventListener('selectionchange', handleSelectionChange);
    };
  }, [editorDivRef, selectedTextTarget]);

  if (!selectedTextTarget) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-6 text-center gap-3">
        <div className="w-12 h-12 rounded-full bg-primary/5 flex items-center justify-center text-primary">
          <Type className="w-6 h-6" />
        </div>
        <h3 className="text-sm font-semibold text-foreground">{t('leftNav.formatPanelTitle', 'Tekst Opmaak')}</h3>
        <p className="text-xs text-muted-foreground max-w-[180px]">
          {t('leftNav.formatPanelEmpty', 'Selecteer een tekstblok in Edit Mode om deze aan te passen.')}
        </p>
      </div>
    );
  }

  const sizes = ['8', '9', '10', '11', '12', '14', '16', '18', '20', '24', '28', '32', '36', '48'];

  const colors = [
    { name: 'Zwart', hex: '#000000', rgb: 'rgb(0, 0, 0)' },
    { name: 'Grijs', hex: '#6b7280', rgb: 'rgb(107, 114, 128)' },
    { name: 'Rood', hex: '#ef4444', rgb: 'rgb(239, 68, 68)' },
    { name: 'Blauw', hex: '#3b82f6', rgb: 'rgb(59, 130, 246)' },
    { name: 'Groen', hex: '#10b981', rgb: 'rgb(16, 185, 129)' },
    { name: 'Oranje', hex: '#f97316', rgb: 'rgb(249, 115, 22)' },
    { name: 'Paars', hex: '#8b5cf6', rgb: 'rgb(139, 92, 246)' },
  ];

  const handleSizeChange = (size: string) => {
    setActiveSize(size);
    onFormatCommand?.('fontSize', size);
    if (editorDivRef?.current) {
      editorDivRef.current.style.fontSize = `${size}px`;
    }
  };

  const handleSizeIncrement = (amount: number) => {
    const current = parseInt(activeSize, 10) || 12;
    const next = Math.max(6, Math.min(120, current + amount));
    handleSizeChange(next.toString());
  };

  const handleColorSelect = (hex: string) => {
    setActiveColor(hex);
    onFormatCommand?.('foreColor', hex);
  };

  return (
    <div className="flex-1 flex flex-col overflow-y-auto pf-scrollbar p-4 gap-5">
      <div className="flex flex-col gap-1.5">
        <label className="leftrail-section-title">
          {t('leftNav.fontSizeLabel', 'Lettergrootte')}
        </label>
        <div className="flex items-center gap-1.5">
          <button
            onClick={() => handleSizeIncrement(-1)}
            className="w-8 h-8 rounded-lg border border-border/80 bg-background flex items-center justify-center text-sm font-semibold hover:bg-accent active:bg-accent/80 transition-colors shadow-sm cursor-pointer"
          >
            -
          </button>
          <select
            value={activeSize}
            onChange={(e) => handleSizeChange(e.target.value)}
            className="flex-1 bg-background border border-border/80 rounded-lg px-2 py-1.5 text-xs text-center focus:outline-none focus:ring-1 focus:ring-primary shadow-sm hover:border-border transition-colors cursor-pointer"
          >
            {sizes.map(s => (
              <option key={s} value={s}>{s} px</option>
            ))}
          </select>
          <button
            onClick={() => handleSizeIncrement(1)}
            className="w-8 h-8 rounded-lg border border-border/80 bg-background flex items-center justify-center text-sm font-semibold hover:bg-accent active:bg-accent/80 transition-colors shadow-sm cursor-pointer"
          >
            +
          </button>
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <label className="leftrail-section-title">
          {t('leftNav.stylingLabel', 'Stijl')}
        </label>
        <div className="flex flex-col gap-2">
          {/* Bold/Italic/Underline */}
          <div className="flex rounded-lg border border-border/80 overflow-hidden shadow-sm">
            <button
              data-testid="text-left-bold-btn"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => onFormatCommand?.('bold')}
              className={`flex-1 py-1.5 flex items-center justify-center font-bold text-xs hover:bg-accent transition-colors ${formatState?.isBold ? 'bg-primary/10 text-primary hover:bg-primary/15' : 'text-foreground'}`}
              title={t('leftNav.bold', 'Vet')}
            >
              B
            </button>
            <div className="w-px bg-border/80" />
            <button
              data-testid="text-left-italic-btn"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => onFormatCommand?.('italic')}
              className={`flex-1 py-1.5 flex items-center justify-center italic text-xs hover:bg-accent transition-colors ${formatState?.isItalic ? 'bg-primary/10 text-primary hover:bg-primary/15' : 'text-foreground'}`}
              title={t('leftNav.italic', 'Cursief')}
            >
              I
            </button>
            <div className="w-px bg-border/80" />
            <button
              data-testid="text-left-underline-btn"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => onFormatCommand?.('underline')}
              className={`flex-1 py-1.5 flex items-center justify-center underline text-xs hover:bg-accent transition-colors ${formatState?.isUnderline ? 'bg-primary/10 text-primary hover:bg-primary/15' : 'text-foreground'}`}
              title={t('leftNav.underline', 'Onderstreept')}
            >
              U
            </button>
          </div>

        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <label className="leftrail-section-title">
          {t('leftNav.colorLabel', 'Tekstkleur')}
        </label>
        <div className="flex items-center gap-2 py-1 px-0.5 overflow-x-auto pf-scrollbar">
          {colors.map(color => {
            const isActive = activeColor.toLowerCase() === color.hex || activeColor === color.rgb;
            return (
              <button
                key={color.hex}
                onClick={() => handleColorSelect(color.hex)}
                className={`w-6 h-6 rounded-full flex-shrink-0 relative transition-transform hover:scale-105 active:scale-95 cursor-pointer shadow-[0_0_0_1px_rgba(0,0,0,0.05)]`}
                style={{ backgroundColor: color.hex }}
                title={color.name}
              >
                {isActive && (
                  <span className="absolute inset-0 rounded-full border-2 border-background scale-75 flex items-center justify-center bg-transparent" />
                )}
              </button>
            );
          })}
        </div>
      </div>

    </div>
  );
}

// ── Panel content router ────────────────────────────────────────────────────

function PanelContent({
  panel,
  thumbnails,
  pageCount,
  currentPage,
  onPageSelect,
  outline,
  formFields,
  comments,
  onReorderPages,
  pageLabels,
  attachments,
  onExtractAttachment,
  onAddAttachment,
  onRemoveAttachment,
  layers,
  layerVisibility,
  onToggleLayer,
  selectedTextTarget,
  formatState,
  onFormatCommand,
  editorDivRef,
}: { panel: NavigationPanel } & LeftNavRailProps) {
  switch (panel) {
    case 'thumbnails':
      return <ThumbnailPanel thumbnails={thumbnails} pageCount={pageCount} currentPage={currentPage} onPageSelect={onPageSelect} onReorderPages={onReorderPages} pageLabels={pageLabels} />;
    case 'bookmarks':
      return <BookmarksPanel outline={outline} currentPage={currentPage} onPageSelect={onPageSelect} />;
    case 'search':
      return <SearchPanel />;
    case 'comments':
      return <CommentsPanel comments={comments} />;
    case 'attachments':
      return <AttachmentsPanel attachments={attachments} onExtractAttachment={onExtractAttachment} onAddAttachment={onAddAttachment} onRemoveAttachment={onRemoveAttachment} />;
    case 'layers':
      return <LayersPanel layers={layers} layerVisibility={layerVisibility} onToggleLayer={onToggleLayer} />;
    case 'fields':
      return <FieldsPanel formFields={formFields} onPageSelect={onPageSelect} />;
    case 'format':
      return (
        <FormatPanel
          selectedTextTarget={selectedTextTarget}
          formatState={formatState}
          onFormatCommand={onFormatCommand}
          editorDivRef={editorDivRef}
        />
      );
  }
}

// ── Root component ──────────────────────────────────────────────────────────

export function LeftNavRail(props: LeftNavRailProps) {
  const { t } = useTranslation();
  const { pageCount, comments } = props;
  const { currentPage, onPageSelect, onNextPage, onPrevPage } = props;
  const hasDoc = pageCount > 0;

  const [activePanel, setActivePanel] = useState<NavigationPanel | null>(() => {
    try {
      const saved = localStorage.getItem('pdfluent.nav.panel');
      // 'none' is the explicit closed state written when user closes the panel
      if (saved === 'none') return null;
      if (saved && PANELS.some(p => p.id === saved)) return saved as NavigationPanel;
    } catch { /* localStorage unavailable (e.g. sandboxed iframe) */ }
    return null; // default: closed — user opens on demand
  });

  useEffect(() => {
    try {
      if (activePanel === null) {
        localStorage.setItem('pdfluent.nav.panel', 'none'); // explicit closed
      } else {
        localStorage.setItem('pdfluent.nav.panel', activePanel);
      }
    } catch { /* ignore write errors */ }
  }, [activePanel]);

  // Automatisch het format paneel openen als we in Edit Mode zijn en er een tekst geselecteerd is
  useEffect(() => {
    if (props.isEditMode && props.selectedTextTarget) {
      setActivePanel('format');
    } else if (!props.isEditMode && activePanel === 'format') {
      setActivePanel(null);
    }
  }, [activePanel, props.isEditMode, props.selectedTextTarget]);

  // Filter panels om 'format' conditioneel te tonen
  const visiblePanels = PANELS.filter(p => {
    if (p.id === 'format') {
      return props.isEditMode;
    }
    return true;
  });

  // Panel resize state — must be declared before any conditional return
  const [panelWidth, setPanelWidth] = useState(256);
  const [isResizing, setIsResizing] = useState(false);

  const handleResizeMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setIsResizing(true);
  }, []);

  useEffect(() => {
    if (!isResizing) return;
    const handleMouseMove = (e: MouseEvent) => {
      // Calculate new width: mouse X minus the icon rail width (48px)
      const newWidth = e.clientX - 48;
      if (newWidth >= 180 && newWidth <= 400) {
        setPanelWidth(newWidth);
      }
    };
    const handleMouseUp = () => { setIsResizing(false); };
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isResizing]);

  // No document — don't render the rail at all (after all hooks)
  if (!hasDoc) return null;

  function togglePanel(id: NavigationPanel) {
    setActivePanel(prev => prev === id ? null : id);
  }

  const effectiveActivePanel = activePanel === 'format' && !props.isEditMode ? null : activePanel;
  const panelOpen = effectiveActivePanel !== null;
  const panelLabelKey = panelOpen && effectiveActivePanel ? (PANELS.find(p => p.id === effectiveActivePanel)?.label ?? '') : '';
  const panelLabel = panelLabelKey ? t(panelLabelKey) : '';

  return (
    <div className="flex h-full shadow-[1px_0_0_0_hsl(0,0%,88%)] bg-transparent shrink-0 z-10 relative">
      {/* ── Icon rail (48px) ────────────────────────────────────────────── */}
      <div className="w-12 flex flex-col items-center py-2 gap-0.5 shrink-0">
        {visiblePanels.map((panel) => {
          const isActive = effectiveActivePanel === panel.id;
          const commentCount = panel.id === 'comments' ? comments.length : 0;
          const showSeparator = panel.id === 'comments';
          return (
            <div key={panel.id} className="w-full flex flex-col items-center">
              {showSeparator && (
                <div className="w-5 h-px bg-border my-1.5" />
              )}
              <button
                onClick={() => { togglePanel(panel.id); }}
                title={t(panel.label)}
                aria-label={t(panel.label)}
                className={[
                  'w-9 h-9 flex items-center justify-center rounded-xl transition-colors duration-100',
                  isActive
                    ? 'bg-primary/10 text-primary'
                    : 'text-muted-foreground hover:text-foreground hover:bg-black/5',
                ].join(' ')}
              >
                <div className="relative">
                  {panel.icon}
                  {commentCount > 0 && (
                    <span
                      data-testid="comments-badge"
                      className="absolute -top-1.5 -right-1.5 min-w-[14px] h-[14px] bg-primary text-primary-foreground text-[8px] font-bold rounded-full flex items-center justify-center px-[3px] leading-none"
                    >
                      {commentCount}
                    </span>
                  )}
                </div>
              </button>
            </div>
          );
        })}
        {/* Navigation controls — always visible when document is open */}
        {hasDoc && (
          <div className="mt-auto flex flex-col items-center gap-0.5 pb-2 pt-1 border-t border-border shrink-0">
            <button
              onClick={onPrevPage}
              disabled={currentPage === 0}
              data-testid="nav-prev-page-btn"
              aria-label={t('leftNav.prevPageAriaLabel')}
              title={t('leftNav.prevPageAriaLabel')}
              className="p-1.5 text-muted-foreground hover:text-foreground hover:bg-muted rounded-lg transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
            >
              <ChevronUpIcon className="w-3.5 h-3.5" />
            </button>
            <input
              data-testid="nav-go-to-page-input"
              type="number"
              min={1}
              max={pageCount}
              value={currentPage + 1}
              onChange={(e) => {
                const v = parseInt(e.target.value, 10);
                if (!isNaN(v) && v >= 1 && v <= pageCount) onPageSelect(v - 1);
              }}
              className="w-8 text-center text-[10px] bg-background border border-border rounded py-0.5 text-foreground focus:ring-1 focus:ring-primary outline-none"
              aria-label={t('leftNav.goToPageAriaLabel')}
            />
            <button
              onClick={onNextPage}
              disabled={currentPage === pageCount - 1}
              data-testid="nav-next-page-btn"
              aria-label={t('leftNav.nextPageAriaLabel')}
              title={t('leftNav.nextPageAriaLabel')}
              className="p-1.5 text-muted-foreground hover:text-foreground hover:bg-muted rounded-lg transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
            >
              <ChevronDownIcon className="w-3.5 h-3.5" />
            </button>
          </div>
        )}
      </div>

      {/* ── Expandable panel (resizable, 240px default) ────────────────── */}
      <div
        className={`flex flex-col bg-transparent overflow-hidden relative ${!isResizing ? 'transition-all duration-200 ease-in-out' : ''}`}
        style={{ width: panelOpen && effectiveActivePanel ? `${panelWidth}px` : '0px' }}
      >
        {panelOpen && effectiveActivePanel && (
          <>
            {/* Panel header — minimal */}
            <div className="flex items-center justify-between px-3 py-2 border-b border-border/60 shrink-0">
              <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">{panelLabel}</span>
              <button
                onClick={() => { setActivePanel(null); }}
                aria-label={t('leftNav.closePanelAriaLabel')}
                className="p-1 text-muted-foreground/50 hover:text-foreground rounded-lg hover:bg-muted transition-colors"
              >
                <XIcon className="w-3.5 h-3.5" />
              </button>
            </div>

            {/* Panel content */}
            <div className="flex-1 overflow-hidden flex flex-col">
              <PanelContent panel={effectiveActivePanel} {...props} />
            </div>
          </>
        )}
      </div>

      {/* Resize handle */}
      {panelOpen && effectiveActivePanel && (
        <div
          className="absolute right-0 top-0 bottom-0 w-1 cursor-col-resize hover:bg-primary/30 active:bg-primary/50 transition-colors z-20"
          onMouseDown={handleResizeMouseDown}
        />
      )}
    </div>
  );
}
