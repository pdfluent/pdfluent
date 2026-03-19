// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary and confidential.
// Free for personal, non-commercial use.
// Commercial use requires a valid license.
// See https://pdfluent.com/license for terms.

import { useState, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
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
} from 'lucide-react';
import type { OutlineNode, FormField, FormFieldType, Annotation } from '../../core/document';
import type { NavigationPanel } from '../types';

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
}

interface PanelTab {
  id: NavigationPanel;
  icon: React.ReactNode;
  label: string;
}

const PANELS: PanelTab[] = [
  { id: 'thumbnails', icon: <LayoutIcon className="w-5 h-5" />, label: 'leftNav.thumbnails' },
  { id: 'bookmarks', icon: <BookmarkIcon className="w-5 h-5" />, label: 'leftNav.bookmarks' },
{ id: 'comments', icon: <MessageSquareIcon className="w-5 h-5" />, label: 'leftNav.comments' },
  { id: 'attachments', icon: <PaperclipIcon className="w-5 h-5" />, label: 'leftNav.attachments' },
  { id: 'layers', icon: <LayersIcon className="w-5 h-5" />, label: 'leftNav.layers' },
  { id: 'fields', icon: <FileInputIcon className="w-5 h-5" />, label: 'leftNav.formFields' },
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
            className="flex flex-col items-center gap-1.5 w-full rounded-md p-1.5 transition-colors hover:bg-muted/50 focus:outline-none"
            style={{
              border: isActive ? '2px solid #2563eb' : '2px solid transparent',
              borderRadius: '6px',
              background: isActive ? 'rgba(37,99,235,0.06)' : undefined,
            }}
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
      <div className="flex-1 flex flex-col items-center justify-center p-4 text-center gap-2">
        <BookmarkIcon className="w-8 h-8 text-muted-foreground/40" />
        <p className="text-xs text-muted-foreground">{t('leftNav.noBookmarks')}</p>
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
        placeholder={t('search.placeholder')}
        className="w-full text-xs bg-muted border border-border rounded-md px-2 py-1.5 text-muted-foreground/50 cursor-default"
        title="Search not yet available"
      />
      <p className="text-[10px] text-muted-foreground/60 text-center mt-4">{t('leftNav.searchComingSoon')}</p>
    </div>
  );
}

function CommentsPanel({ comments }: { comments: Annotation[] }) {
  const { t } = useTranslation();
  if (comments.length === 0) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-4 text-center gap-2">
        <MessageSquareIcon className="w-8 h-8 text-muted-foreground/40" />
        <p className="text-xs text-muted-foreground">{t('leftNav.noCommentsSide')}</p>
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
        <div className="flex-1 flex flex-col items-center justify-center p-4 text-center gap-2">
          <PaperclipIcon className="w-8 h-8 text-muted-foreground/40" />
          <p className="text-xs text-muted-foreground">{t('leftNav.noAttachments')}</p>
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
                  onClick={() => {
                    if (window.confirm(t('leftNav.removeAttachmentConfirm', { name: att.name }))) {
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
      <div className="flex-1 flex flex-col items-center justify-center p-4 text-center gap-2">
        <LayersIcon className="w-8 h-8 text-muted-foreground/40" />
        <p className="text-xs text-muted-foreground">{t('leftNav.noLayers')}</p>
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
      <div className="flex-1 flex flex-col items-center justify-center p-4 text-center gap-2">
        <FileInputIcon className="w-8 h-8 text-muted-foreground/40" />
        <p className="text-xs text-muted-foreground">{t('leftNav.noFormFields')}</p>
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
      if (saved && PANELS.some(p => p.id === saved)) return saved as NavigationPanel;
    } catch { /* localStorage unavailable (e.g. sandboxed iframe) */ }
    return 'thumbnails';
  });

  useEffect(() => {
    try {
      if (activePanel === null) {
        localStorage.removeItem('pdfluent.nav.panel');
      } else {
        localStorage.setItem('pdfluent.nav.panel', activePanel);
      }
    } catch { /* ignore write errors */ }
  }, [activePanel]);

  function togglePanel(id: NavigationPanel) {
    if (!hasDoc) return;
    setActivePanel(id);
  }

  const panelOpen = hasDoc && activePanel !== null;
  const panelLabelKey = panelOpen && activePanel ? (PANELS.find(p => p.id === activePanel)?.label ?? '') : '';
  const panelLabel = panelLabelKey ? t(panelLabelKey) : '';

  return (
    <div className="flex h-full border-r border-border bg-background shrink-0 z-10">
      {/* ── Icon rail (48px) ────────────────────────────────────────────── */}
      <div className="w-12 flex flex-col items-center py-3 gap-1 border-r border-border bg-muted/10 shrink-0">
        {PANELS.map((panel) => {
          const isActive = hasDoc && activePanel === panel.id;
          const commentCount = panel.id === 'comments' ? comments.length : 0;
          return (
            <button
              key={panel.id}
              onClick={() => { togglePanel(panel.id); }}
              title={t(panel.label)}
              aria-label={t(panel.label)}
              className={[
                'p-2 rounded-md transition-colors duration-100',
                isActive
                  ? 'bg-accent text-accent-foreground'
                  : hasDoc
                    ? 'text-muted-foreground hover:text-foreground hover:bg-muted'
                    : 'text-muted-foreground/40 cursor-default',
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
              className="p-1.5 text-muted-foreground hover:text-foreground hover:bg-muted rounded-md transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
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
              className="p-1.5 text-muted-foreground hover:text-foreground hover:bg-muted rounded-md transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
            >
              <ChevronDownIcon className="w-3.5 h-3.5" />
            </button>
          </div>
        )}
      </div>

      {/* ── Expandable panel (160px) ────────────────────────────────────── */}
      {panelOpen && activePanel && (
        <div className="w-40 flex flex-col bg-background overflow-hidden">
          {/* Panel header */}
          <div className="flex items-center justify-between px-3 py-2 border-b border-border shrink-0">
            <span className="text-xs font-medium text-foreground">{panelLabel}</span>
            <button
              onClick={() => { setActivePanel(null); }}
              aria-label="Close panel"
              className="p-0.5 text-muted-foreground hover:text-foreground rounded hover:bg-muted transition-colors"
            >
              <XIcon className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Panel content */}
          <div className="flex-1 overflow-hidden flex flex-col">
            <PanelContent panel={activePanel} {...props} />
          </div>
        </div>
      )}
    </div>
  );
}
