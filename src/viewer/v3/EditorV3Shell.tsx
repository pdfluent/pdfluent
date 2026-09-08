// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
// See https://pdfluent.com/license for terms.

import { isTauriRuntime } from '../../lib/tauri-detection';
import { useTranslation } from 'react-i18next';
import { createPortal } from 'react-dom';
import {
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type ReactNode,
  type RefObject,
} from 'react';
import {
  BadgeCheckIcon,
  BoldIcon,
  BookmarkIcon,
  ChevronDownIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  ChevronUpIcon,
  CombineIcon,
  DownloadIcon,
  EraserIcon,
  FileCheckIcon,
  FileTextIcon,
  GalleryVerticalEndIcon,
  HandIcon,
  HardDriveIcon,
  HeadphonesIcon,
  HighlighterIcon,
  ImageIcon,
  InfoIcon,
  ItalicIcon,
  LayersIcon,
  LayoutGridIcon,
  LinkIcon,
  LockIcon,
  MailIcon,
  MaximizeIcon,
  MessageSquareTextIcon,
  Minimize2Icon,
  MoonIcon,
  MoreHorizontalIcon,
  MousePointer2Icon,
  PauseIcon,
  PenLineIcon,
  PencilIcon,
  PencilLineIcon,
  PlayIcon,
  PrinterIcon,
  Redo2Icon,
  ReceiptTextIcon,
  RefreshCwIcon,
  RotateCcwIcon,
  RulerIcon,
  SaveIcon,
  ScissorsIcon,
  SearchIcon,
  Share2Icon,
  ShieldCheckIcon,
  SignatureIcon,
  StampIcon,
  StrikethroughIcon,
  TypeIcon,
  UnderlineIcon,
  Undo2Icon,
  UserRoundIcon,
  Languages as LanguagesIcon,
  XIcon,
} from 'lucide-react';
import type { AnnotationAppearance, ViewerMode } from '../types';
import type { Annotation, FormField, FormFieldValue, OutlineNode, PdfDocument } from '../../core/document';
import type { AnnotationTool } from '../components/ModeToolbar';
import type { AttachmentInfo, LayerInfo } from '../components/LeftNavRail';
import type { ExportFormat } from '../components/ExportDialog';
import type { TextParagraphTarget } from '../text/textInteractionModel';
import type {
  InvoiceData,
  InvoiceValidationResult,
  PdfAConvertResult,
  PdfAValidationResult,
  SignatureVerifyResult,
} from '../../lib/tauri-api';
import { ZoomPresetsPopover } from '../components/ZoomPresetsPopover';
import { LanguageSwitcher } from '../components/LanguageSwitcher';
import { pickPdfPath } from '../../platform/native/fileDialogs';
import { useTaskQueueContext } from '../context/TaskQueueContext';
import { Settings } from '../../components/Settings';
import {
  detectNativeCapabilities,
  pauseSpeech,
  resumeSpeech,
  speakText,
  stopSpeech,
  type NativeCapabilities,
  type NativeFeatureCapability,
} from '../../platform/native/nativeServices';
type V3Panel = 'tools' | 'edit' | 'convert' | 'esign' | 'protect' | 'watermark' | 'compress' | 'split' | 'merge' | 'redact' | 'pdfa' | 'metadata' | 'invoice';
type RailTool = 'select' | 'hand' | 'comment' | 'highlight' | 'draw' | 'text' | 'sign' | 'more';
type V3Modal = 'privacy' | 'author' | 'native';

interface EditorV3ShellProps {
  children: ReactNode;
  canvasRef: RefObject<HTMLDivElement | null>;
  fileName: string | null;
  pageIndex: number;
  pageCount: number;
  zoom: number;
  mode: ViewerMode;
  isDirty: boolean;
  currentFilePath: string | null;
  readAloudText: string;
  authorName: string;
  thumbnails: Map<number, string>;
  outline: OutlineNode[];
  /**
   * A panel the user asked for from outside the shell (an All-tools tile).
   *
   * The shell owns `activePanel`, so the request comes in as a prop and the
   * shell clears it through `onRequestedPanelHandled` once it has opened it.
   */
  requestedPanel: string | null;
  onRequestedPanelHandled: () => void;
  pageLabels: string[];
  comments: Annotation[];
  activeCommentIdx: number;
  onCommentSelect: (idx: number) => void;
  onDeleteComment: (annotationId: string) => void;
  onUpdateComment: (annotationId: string, contents: string) => void;
  onToggleResolved: (annotationId: string) => void;
  onAddReply: (annotationId: string, contents: string, author: string) => void;
  onDeleteReply: (annotationId: string, replyId: string) => void;
  onNextComment: () => void;
  onPrevComment: () => void;
  onResolveAll: () => void;
  onDeleteAllResolved: () => void;
  formFields: FormField[];
  activeFieldIdx: number;
  onFieldSelect: (idx: number) => void;
  onSetFieldValue: (fieldId: string, value: FormFieldValue) => void;
  formValidationErrors: Array<{ fieldId: string; errors: string[] }>;
  onFormSubmit: () => Promise<void>;
  pdfDoc: PdfDocument | null;
  onMetadataChange: (key: 'title' | 'author' | 'subject' | 'keywords', value: string) => void;
  selectedAnnotation: Annotation | null;
  annotationAppearance: AnnotationAppearance;
  onAnnotationAppearanceChange: (appearance: AnnotationAppearance | ((prev: AnnotationAppearance) => AnnotationAppearance)) => void;
  onDeleteSelectedAnnotation: (annotationId: string) => void;
  onUpdateAnnotationColor: (annotationId: string, color: [number, number, number]) => void;
  redactions: Annotation[];
  documentIssues: unknown[];
  onApplyRedactions: () => void;
  onDeleteRedaction: (annotationId: string) => void;
  onJumpToRedaction: (idx: number | ((prev: number) => number)) => void;
  onRedactSearch: (query: string) => Promise<{ matchesFound: number; areasRedacted: number } | null>;
  onRedactMetadata: () => Promise<boolean>;
  scannedPageIndices: Set<number>;
  ocrRunning: boolean;
  ocrVisible: boolean;
  onOcrVisibleChange: (visible: boolean | ((prev: boolean) => boolean)) => void;
  ocrConfidenceThreshold: number;
  onOcrConfidenceChange: (threshold: number | ((prev: number) => number)) => void;
  attachments: AttachmentInfo[];
  onExtractAttachment: (name: string) => void;
  onAddAttachment: () => void;
  onRemoveAttachment: (name: string) => void;
  layers: LayerInfo[];
  layerVisibility: Map<string, boolean>;
  onToggleLayer: (id: string) => void;
  activeAnnotationTool: AnnotationTool;
  canUndo: boolean;
  canRedo: boolean;
  searchResultCount: number;
  activeSearchResultIndex: number;
  isSearchOpen: boolean;
  searchQuery: string;
  onOpenFile: (source: string | ArrayBuffer) => Promise<void>;
  onSaveComplete: () => void;
  onSaveAs: () => Promise<void>;
  onCloseDocument: () => void;
  onUndo: () => void;
  onRedo: () => void;
  onModeChange: (mode: ViewerMode) => void;
  onOpenAllTools: () => void;
  onOpenExport: (format?: ExportFormat) => void;
  onOpenCommandPalette: () => void;
  onOpenSearch: () => void;
  onSearchQueryChange: (query: string) => void;
  onRunSearch: (query: string) => void;
  onNextSearchResult: () => void;
  onPrevSearchResult: () => void;
  onAnnotationToolChange: (tool: AnnotationTool) => void;
  onAddComment: () => void;
  onFormatCommand: (command: string, value?: string) => void;
  onNavigatePage: (pageIndex: number) => void;
  onZoomChange: (zoom: number | ((prev: number) => number)) => void;
  zoomPresetsOpen: boolean;
  setZoomPresetsOpen: (open: boolean | ((prev: boolean) => boolean)) => void;
  onOpenGoToPage: () => void;
  onRunOcr: () => void;
  onProtectDocument: () => void;
  onWatermark: () => void;
  onCheckForUpdates: () => void;
  onAuthorChange: (name: string) => void;
  onReorderPages: (newOrder: number[]) => Promise<void>;
  /** Called at each TTS word boundary so the viewer can highlight the active span.
   *  charIndex -1 signals TTS has stopped. */
  onTtsBoundary?: (charIndex: number, charLength: number) => void;
  selectedTextTarget: TextParagraphTarget | null;
  formatState: {
    isBold: boolean;
    isItalic: boolean;
    isUnderline: boolean;
    isStrikethrough: boolean;
  };
  onDocumentMutated?: () => void;
  /** Counts content mutations. The Sign panel re-checks on it, because an edit
   *  is exactly what turns a valid usage-rights signature into a dead one. */
  contentRevision?: number;
}

const isTauri = isTauriRuntime();

// Phase 1 release gate: these controls only create React overlays and do not
// persist into the PDF. Phase 2 can enable them after native write-through lands.
const LOCAL_OVERLAY_CONTROLS_ENABLED = false;

/** The items the rail's "More" popover offers, each with a branch that runs. */
type MoreTool = 'strikeout' | 'underline' | 'attachment';

const PANEL_TO_MODE: Record<V3Panel, ViewerMode> = {
  tools: 'read',
  edit: 'edit',
  convert: 'convert',
  esign: 'sign',
  protect: 'protect',
  watermark: 'protect',
  compress: 'read',
  split: 'read',
  merge: 'read',
  redact: 'review',
  pdfa: 'convert',
  metadata: 'edit',
  invoice: 'convert',
};

export function EditorV3Shell(props: EditorV3ShellProps) {
  const {
    children,
    canvasRef,
    fileName,
    pageIndex,
    pageCount,
    zoom,
    mode,
    isDirty,
    currentFilePath,
    readAloudText,
    authorName,
    thumbnails,
    outline,
    requestedPanel,
    onRequestedPanelHandled,
    pageLabels,
    comments,
    activeCommentIdx,
    onCommentSelect,
    onNextComment,
    onPrevComment,
    onResolveAll,
    formFields,
    activeFieldIdx,
    onFieldSelect,
    formValidationErrors,
    onFormSubmit,
    selectedAnnotation,
    redactions,
    documentIssues,
    onApplyRedactions,
    scannedPageIndices,
    ocrRunning,
    ocrVisible,
    onOcrVisibleChange,
    ocrConfidenceThreshold,
    onOcrConfidenceChange,
    attachments,
    onExtractAttachment,
    onAddAttachment,
    onRemoveAttachment,
    layers,
    layerVisibility,
    activeAnnotationTool,
    pdfDoc,
    canUndo,
    canRedo,
    searchResultCount,
    activeSearchResultIndex,
    isSearchOpen,
    searchQuery,
    onOpenFile,
    onSaveComplete,
    onSaveAs,
    onCloseDocument,
    onUndo,
    onRedo,
    onModeChange,
    onOpenAllTools,
    onOpenExport,
    onOpenCommandPalette,
    onOpenSearch,
    onSearchQueryChange,
    onRunSearch,
    onNextSearchResult,
    onPrevSearchResult,
    onAnnotationToolChange,
    onFormatCommand,
    onNavigatePage,
    onZoomChange,
    zoomPresetsOpen,
    setZoomPresetsOpen,
    onOpenGoToPage,
    onRunOcr,
    onProtectDocument,
    onWatermark,
    onCheckForUpdates,
    onRedactSearch,
    onAuthorChange,
    onDocumentMutated,
    contentRevision,
    onReorderPages,
    onTtsBoundary,
  } = props;

  const { t } = useTranslation();

  const [activePanel, setActivePanel] = useState<V3Panel | null>(pageCount > 0 ? 'tools' : null);
  const handlePanelChange = (nextPanel: V3Panel | null) => {
    setActivePanel(nextPanel);
    if (nextPanel) {
      onModeChange(PANEL_TO_MODE[nextPanel]);
    } else {
      onModeChange('read');
    }
  };
  const [thumbsOpen, setThumbsOpen] = useState(() => {
    try {
      const stored = localStorage.getItem('pdfluent.viewer.thumbs');
      if (stored !== null) return stored !== 'false';
    } catch { /* ignore */ }
    return true;
  });
  const [shareOpen, setShareOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [readOpen, setReadOpen] = useState(false);
  const [passiveRailTool, setPassiveRailTool] = useState<'select' | 'hand' | 'comment'>('select');

  // E-Sign modal & state variables
  const [showSignModal, setShowSignModal] = useState(false);
  const [showInitialsModal, setShowInitialsModal] = useState(false);
  const [signType, setSignType] = useState<'type' | 'draw'>('type');
  const [signatureName, setSignatureName] = useState('');
  const [signatureFont, setSignatureFont] = useState('font-signature-1');
  const [typedInitials, setTypedInitials] = useState('');

  const [isInsertingText, setIsInsertingText] = useState(false);
  const [isInsertingImage, setIsInsertingImage] = useState(false);
  const [pendingSignature, setPendingSignature] = useState<{
    type: 'signature' | 'initials';
    content: string;
    font?: string;
  } | null>(null);

  const [localOverlays, setLocalOverlays] = useState<Array<{
    id: string;
    pageIndex: number;
    x: number;
    y: number;
    type: 'text' | 'image' | 'signature' | 'initials';
    content: string;
    font?: string;
  }>>([]);
  const [textOverlayDraft, setTextOverlayDraft] = useState<{
    id?: string;
    pageIndex: number;
    x: number;
    y: number;
    value: string;
  } | null>(null);

  // Non-persistent placement state is strictly document-scoped. Clear both
  // armed tools and rendered overlays before a replacement document can use it.
  useEffect(() => {
    setIsInsertingText(false);
    setIsInsertingImage(false);
    setPendingSignature(null);
    setLocalOverlays([]);
    setTextOverlayDraft(null);
  }, [pdfDoc?.id]);

  // Persist thumbnail sidebar visibility to localStorage
  useEffect(() => {
    try {
      localStorage.setItem('pdfluent.viewer.thumbs', String(thumbsOpen));
    } catch { /* ignore write errors */ }
  }, [thumbsOpen]);

  // Click outside listener for dropdown dismissal
  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (moreOpen && !target.closest('.topbar-more-menu') && !target.closest('.more-trigger')) {
        setMoreOpen(false);
      }
      if (shareOpen && !target.closest('.share-menu') && !target.closest('.share-trigger')) {
        setShareOpen(false);
      }
    };
    document.addEventListener('mousedown', handleOutsideClick, true);
    return () => {
      document.removeEventListener('mousedown', handleOutsideClick, true);
    };
  }, [moreOpen, shareOpen]);

  // Click handler to place text, images, or signature on canvas
  useEffect(() => {
    const canvasEl = canvasRef.current;
    if (!canvasEl) return;

    const handleCanvasClick = (e: MouseEvent) => {
      const pageEl = (e.target as HTMLElement).closest('.page') as HTMLElement;
      if (!pageEl) return;

      const pageIdx = parseInt(pageEl.getAttribute('data-page-index') || '0', 10);
      const rect = pageEl.getBoundingClientRect();
      const clickX = e.clientX - rect.left;
      const clickY = e.clientY - rect.top;

      if (pendingSignature) {
        const sig = pendingSignature;
        setPendingSignature(null);
        setLocalOverlays(prev => [...prev, {
          id: `local-sig-${Date.now()}`,
          pageIndex: pageIdx,
          x: clickX / zoom,
          y: clickY / zoom,
          type: sig.type,
          content: sig.content,
          font: sig.font
        }]);
        showToast(sig.type === 'signature' ? t('editorV3.overlay.signaturePlaced') : t('editorV3.overlay.initialsPlaced'));
        return;
      }

      if (isInsertingText) {
        setIsInsertingText(false);
        setTextOverlayDraft({
          pageIndex: pageIdx,
          x: clickX / zoom,
          y: clickY / zoom,
          value: '',
        });
        return;
      }

      if (isInsertingImage) {
        setIsInsertingImage(false);
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = 'image/*';
        input.onchange = (ev) => {
          const file = (ev.target as HTMLInputElement).files?.[0];
          if (file) {
            const reader = new FileReader();
            reader.onload = (readEv) => {
              const src = readEv.target?.result as string;
              setLocalOverlays(prev => [...prev, {
                id: `local-img-${Date.now()}`,
                pageIndex: pageIdx,
                x: clickX / zoom,
                y: clickY / zoom,
                type: 'image',
                content: src
              }]);
              showToast(t('editorV3.overlay.imagePlaced'));
            };
            reader.readAsDataURL(file);
          }
        };
        input.click();
      }
    };

    canvasEl.addEventListener('click', handleCanvasClick);
    return () => {
      canvasEl.removeEventListener('click', handleCanvasClick);
    };
    // showToast and t are intentionally omitted: both are render-local helpers,
    // while this listener should only be rebound when placement state changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canvasRef, isInsertingText, isInsertingImage, pendingSignature, zoom]);

  const commitTextOverlayDraft = () => {
    if (!textOverlayDraft) return;
    const value = textOverlayDraft.value.trim();
    if (!value) {
      if (textOverlayDraft.id) {
        setLocalOverlays(prev => prev.filter(overlay => overlay.id !== textOverlayDraft.id));
        showToast(t('editorV3.textbox.deleted'));
      }
      setTextOverlayDraft(null);
      return;
    }

    if (textOverlayDraft.id) {
      setLocalOverlays(prev => prev.map(overlay => (
        overlay.id === textOverlayDraft.id ? { ...overlay, content: value } : overlay
      )));
      showToast(t('editorV3.textbox.updated'));
    } else {
      setLocalOverlays(prev => [...prev, {
        id: `local-txt-${Date.now()}`,
        pageIndex: textOverlayDraft.pageIndex,
        x: textOverlayDraft.x,
        y: textOverlayDraft.y,
        type: 'text',
        content: value,
      }]);
      showToast(t('editorV3.textbox.added'));
    }
    setTextOverlayDraft(null);
  };

  useEffect(() => {
    const canvasEl = canvasRef.current;
    if (!canvasEl) return;
    
    if (isInsertingText || isInsertingImage || pendingSignature) {
      canvasEl.style.cursor = 'crosshair';
    } else {
      canvasEl.style.cursor = '';
    }
  }, [canvasRef, isInsertingText, isInsertingImage, pendingSignature]);

  const [readPaused, setReadPaused] = useState(false);
  const [moreToolsOpen, setMoreToolsOpen] = useState(false);
  const [themeDark, setThemeDark] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [activeModal, setActiveModal] = useState<V3Modal | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [authorDraft, setAuthorDraft] = useState(authorName);
  const [nativeCapabilities, setNativeCapabilities] = useState<NativeCapabilities | null>(null);

  const showToast = (message: string) => {
    setToast(message);
    window.clearTimeout((showToast as unknown as { timer?: number }).timer);
    (showToast as unknown as { timer?: number }).timer = window.setTimeout(() => setToast(null), 2600);
  };

  // Track previous pageCount so we only collapse UI when a document is CLOSED,
  // not on initial mount (where pageCount is already 0).
  // The thumbs drawer is NOT touched here: it renders only with a document
  // (open={pageCount > 0 && thumbsOpen}), and forcing it closed would persist
  // `false` and silently override the user's open-by-default preference for
  // the next document.
  const prevPageCountRef = useRef(pageCount);
  useEffect(() => {
    const prev = prevPageCountRef.current;
    prevPageCountRef.current = pageCount;
    if (pageCount === 0 && prev > 0) {
      setActivePanel(null);
      setShareOpen(false);
      setMoreOpen(false);
      setReadOpen(false);
    }
  }, [pageCount]);

  useEffect(() => {
    setAuthorDraft(authorName);
  }, [authorName]);

  useEffect(() => {
    let cancelled = false;
    void detectNativeCapabilities().then(capabilities => {
      if (!cancelled) setNativeCapabilities(capabilities);
    });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (mode === 'edit') setActivePanel('edit');
    if (mode === 'convert') setActivePanel('convert');
    if (mode === 'sign') setActivePanel('esign');
    if (mode === 'protect') {
      if (activePanel !== 'watermark') {
        setActivePanel('protect');
      }
    }
  }, [mode, activePanel]);

  useEffect(() => {
    if (requestedPanel === null) return;
    if (Object.prototype.hasOwnProperty.call(PANEL_TO_MODE, requestedPanel)) {
      const next = requestedPanel as V3Panel;
      setActivePanel(next);
      onModeChange(PANEL_TO_MODE[next]);
    }
    onRequestedPanelHandled();
    // onModeChange and onRequestedPanelHandled are stable callbacks from ViewerApp.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [requestedPanel]);

  const effectiveRailTool: RailTool =
    activeAnnotationTool === 'highlight' || activeAnnotationTool === 'underline' || activeAnnotationTool === 'strikeout'
      ? 'highlight'
      : activeAnnotationTool === 'ink' || activeAnnotationTool === 'rectangle'
        ? 'draw'
        : mode === 'edit'
          ? 'text'
          : mode === 'sign'
            ? 'sign'
            : mode === 'review' && passiveRailTool === 'comment'
              ? 'comment'
              : passiveRailTool === 'hand'
                ? 'hand'
                : 'select';

  function togglePanel(panel: V3Panel) {
    if (activePanel === panel) {
      setActivePanel(null);
      if (mode === PANEL_TO_MODE[panel]) onModeChange('read');
      return;
    }
    setActivePanel(panel);
    onModeChange(PANEL_TO_MODE[panel]);
  }

  function setRailTool(tool: RailTool) {
    setMoreToolsOpen(false);
    switch (tool) {
      case 'select':
        onAnnotationToolChange(null);
        setPassiveRailTool(mode === 'read' && passiveRailTool === 'select' ? 'hand' : 'select');
        onModeChange('read');
        break;
      case 'hand':
        onAnnotationToolChange(null);
        setPassiveRailTool('hand');
        onModeChange('read');
        break;
      case 'comment':
        onAnnotationToolChange(null);
        setPassiveRailTool('comment');
        onModeChange('review');
        showToast(t('editorV3.railToasts.commentMode'));
        break;
      case 'highlight':
        setPassiveRailTool('select');
        onModeChange('review');
        onAnnotationToolChange('highlight');
        break;
      case 'draw':
        // The rail says "Draw" and drew a rectangle. `add_ink_annotation` has
        // been in the backend the whole time with nothing asking for it, so
        // this is now the freehand tool it is named after.
        setPassiveRailTool('select');
        onModeChange('review');
        onAnnotationToolChange('ink');
        break;
      case 'text':
        setPassiveRailTool('select');
        onAnnotationToolChange(null);
        onModeChange('edit');
        setActivePanel('edit');
        break;
      case 'sign':
        setPassiveRailTool('select');
        onAnnotationToolChange(null);
        onModeChange('sign');
        setActivePanel('esign');
        break;
      case 'more':
        setMoreToolsOpen(open => !open);
        break;
    }
  }

  // Four more items stood here and none of them did what it said. "Insert date"
  // and "Ruler" fell through to the end of this function; "Stamps" opened the
  // All-tools panel with a toast pointing at a stamp tile that is hidden for
  // having no handler; "Insert text box" opened the edit panel, whose text-box
  // control is behind LOCAL_OVERLAY_CONTROLS_ENABLED. A menu item that cannot
  // do the thing it is named after is not offered.
  function handleMoreTool(action: MoreTool) {
    setMoreToolsOpen(false);
    if (action === 'strikeout') {
      onModeChange('review');
      onAnnotationToolChange('strikeout');
      showToast(t('editorV3.railToasts.strikeout'));
      return;
    }
    if (action === 'underline') {
      onModeChange('review');
      onAnnotationToolChange('underline');
      showToast(t('editorV3.railToasts.underline'));
      return;
    }
    if (action === 'attachment') {
      onAddAttachment();
      return;
    }
  }

  async function startReadAloud() {
    try {
      await speakText(readAloudText, { rate: 1, onBoundary: onTtsBoundary });
      setReadOpen(true);
      setReadPaused(false);
    } catch (error) {
      showToast(error instanceof Error ? error.message : String(error));
    }
  }

  function handleReadToggle() {
    if (readOpen) {
      setReadOpen(false);
      setReadPaused(false);
      void stopSpeech();
      onTtsBoundary?.(-1, 0);
      return;
    }
    void startReadAloud();
  }

  function handleReadPauseToggle() {
    const nextPaused = !readPaused;
    setReadPaused(nextPaused);
    void (nextPaused ? pauseSpeech() : resumeSpeech());
  }

  function handleReadRestart() {
    void stopSpeech().finally(() => {
      void startReadAloud();
    });
  }

  function handleReadStop() {
    setReadOpen(false);
    setReadPaused(false);
    void stopSpeech();
    onTtsBoundary?.(-1, 0);
  }

  function commitAuthorName() {
    const cleaned = authorDraft.trim();
    onAuthorChange(cleaned);
    setActiveModal(null);
    showToast(cleaned ? t('editorV3.commentName.saved', { name: cleaned }) : t('editorV3.commentName.cleared'));
  }

  return (
    <div className={themeDark ? 'pfv3 theme-dark' : 'pfv3'} data-mode={mode} data-has-document={pageCount > 0} style={{ '--thumbs-offset': pageCount > 0 && thumbsOpen ? '75px' : '0px' } as React.CSSProperties}>
      <EditorV3TopBar
        fileName={fileName}
        pageIndex={pageIndex}
        pageCount={pageCount}
        isDirty={isDirty}
        currentFilePath={currentFilePath}
        canUndo={canUndo}
        canRedo={canRedo}
        activePanel={activePanel}
        shareOpen={shareOpen}
        moreOpen={moreOpen}
        readOpen={readOpen}
        readPaused={readPaused}
        searchOpen={isSearchOpen}
        searchQuery={searchQuery}
        searchResultCount={searchResultCount}
        activeSearchResultIndex={activeSearchResultIndex}
        nativeCapabilities={nativeCapabilities}
        onOpenFile={onOpenFile}
        onSaveAs={onSaveAs}
        onSaveComplete={onSaveComplete}
        onCloseDocument={onCloseDocument}
        onUndo={onUndo}
        onRedo={onRedo}
        onPanelToggle={togglePanel}
        onShareToggle={() => { setShareOpen(open => !open); setMoreOpen(false); }}
        onMoreToggle={() => { setMoreOpen(open => !open); setShareOpen(false); }}
        onReadToggle={handleReadToggle}
        onReadPauseToggle={handleReadPauseToggle}
        onReadRestart={handleReadRestart}
        onReadStop={handleReadStop}
        onOpenCommandPalette={onOpenCommandPalette}
        onOpenExport={onOpenExport}
        onOpenSearch={onOpenSearch}
        onSearchQueryChange={onSearchQueryChange}
        onRunSearch={onRunSearch}
        onNextSearchResult={onNextSearchResult}
        onPrevSearchResult={onPrevSearchResult}
        onNavigatePage={onNavigatePage}
        onShowPrivacy={() => { setActiveModal('privacy'); setMoreOpen(false); }}
        onShowAuthor={() => { setActiveModal('author'); setMoreOpen(false); }}
        onShowNative={() => { setActiveModal('native'); setMoreOpen(false); }}
        onShowSettings={() => { setShowSettings(true); setMoreOpen(false); }}
        onToggleTheme={() => { setThemeDark(dark => !dark); }}
        onProtectDocument={onProtectDocument}
        onCheckForUpdates={() => { onCheckForUpdates(); setMoreOpen(false); }}
        onShowToast={showToast}
        themeDark={themeDark}
      />

      <div className="workspace">
        <V3Thumbnails
          open={pageCount > 0 && thumbsOpen}
          thumbnails={thumbnails}
          pageLabels={pageLabels}
          pageCount={pageCount}
          currentPage={pageIndex}
          outline={outline}
          onPageSelect={onNavigatePage}
          onReorderPages={onReorderPages}
        />

        {pageCount > 0 && activePanel && (
          <EditorV3Panel
            panel={activePanel}
            onClose={() => handlePanelChange(null)}
            onPanelChange={handlePanelChange}
            onAnnotationToolChange={onAnnotationToolChange}
            onOpenAllTools={onOpenAllTools}
            onOpenExport={onOpenExport}
            onRunOcr={onRunOcr}
            onProtectDocument={onProtectDocument}
            onWatermark={onWatermark}
            currentFilePath={currentFilePath}
            onFormatCommand={onFormatCommand}
            onModeChange={onModeChange}
            isInsertingText={isInsertingText}
            setIsInsertingText={setIsInsertingText}
            isInsertingImage={isInsertingImage}
            setIsInsertingImage={setIsInsertingImage}
            pendingSignature={pendingSignature}
            setPendingSignature={setPendingSignature}
            comments={comments}
            activeCommentIdx={activeCommentIdx}
            onCommentSelect={onCommentSelect}
            onNextComment={onNextComment}
            onPrevComment={onPrevComment}
            onResolveAll={onResolveAll}
            formFields={formFields}
            activeFieldIdx={activeFieldIdx}
            onFieldSelect={onFieldSelect}
            formValidationErrors={formValidationErrors}
            onFormSubmit={onFormSubmit}
            selectedAnnotation={selectedAnnotation}
            redactions={redactions}
            documentIssues={documentIssues}
            onApplyRedactions={onApplyRedactions}
            onRedactSearch={onRedactSearch}
            scannedPageIndices={scannedPageIndices}
            ocrRunning={ocrRunning}
            ocrVisible={ocrVisible}
            onOcrVisibleChange={onOcrVisibleChange}
            ocrConfidenceThreshold={ocrConfidenceThreshold}
            onOcrConfidenceChange={onOcrConfidenceChange}
            attachments={attachments}
            onExtractAttachment={onExtractAttachment}
            onAddAttachment={onAddAttachment}
            onRemoveAttachment={onRemoveAttachment}
            layers={layers}
            layerVisibility={layerVisibility}
            onShowToast={showToast}
            onDocumentMutated={onDocumentMutated}
            contentRevision={contentRevision}
            onOpenSignModal={() => setShowSignModal(true)}
            onOpenInitialsModal={() => setShowInitialsModal(true)}
          />
        )}

        <div className="docarea" id="docarea">
          {pageCount > 0 && mode !== 'organize' && (
            <EditorV3ToolRail
              activeTool={effectiveRailTool}
              moreOpen={moreToolsOpen}
              commentsCount={comments.length}
              onToolSelect={setRailTool}
              onMoreTool={handleMoreTool}
            />
          )}

          {/* role + tabIndex, not decoration: aria-label on a bare div is ignored
              (and reported as a prohibited attribute), and a scrollable region
              that cannot be focused cannot be scrolled from the keyboard. */}
          <div
            ref={canvasRef}
            data-print-region
            className="canvas"
            role="region"
            tabIndex={0}
            aria-label={t('editorV3.canvas.document')}
          >
            {children}
          </div>

          {pageCount > 0 && mode !== 'organize' && (
            <>
              <div className="rightrail" aria-label={t('editorV3.nav.pageNavigation')}>
                <button className="rail-btn" data-tip={t('editorV3.nav.pages')} onClick={() => setThumbsOpen(open => !open)} aria-label={t('editorV3.nav.pages')}>
                  <GalleryVerticalEndIcon aria-hidden="true" />
                </button>
                <div className="rail-sep" />
                <button className="rail-btn" data-tip={t('editorV3.nav.prevPage')} onClick={() => onNavigatePage(Math.max(0, pageIndex - 1))} disabled={pageIndex <= 0} aria-label={t('editorV3.nav.prevPage')}>
                  <ChevronUpIcon aria-hidden="true" />
                </button>
                <div className="page-num tnum">{pageIndex + 1}<br />/<br />{pageCount}</div>
                <button className="rail-btn" data-tip={t('editorV3.nav.nextPage')} onClick={() => onNavigatePage(Math.min(pageCount - 1, pageIndex + 1))} disabled={pageIndex >= pageCount - 1} aria-label={t('editorV3.nav.nextPage')}>
                  <ChevronDownIcon aria-hidden="true" />
                </button>
                <div className="rail-sep" />
                <button className="rail-btn" data-tip={t('editorV3.nav.fitToView')} onClick={() => { onZoomChange(1.0); }} aria-label={t('editorV3.nav.fitToView')}>
                  <MaximizeIcon aria-hidden="true" />
                </button>
              </div>

              {/* Floating zoom controls */}
              <div className="bottombar">
                <button className="bb-btn" onClick={() => onNavigatePage(Math.max(0, pageIndex - 1))} disabled={pageIndex <= 0} title={t('editorV3.common.previous')}>
                  <ChevronLeftIcon aria-hidden="true" />
                </button>
                <button
                  className="bb-page tabular-nums"
                  data-testid="floating-page-indicator"
                  type="button"
                  title={t('editorV3.nav.goToPage')}
                  aria-label={t('editorV3.nav.goToPage')}
                  onClick={onOpenGoToPage}
                >
                  {pageIndex + 1} / {pageCount}
                </button>
                <button className="bb-btn" onClick={() => onNavigatePage(Math.min(pageCount - 1, pageIndex + 1))} disabled={pageIndex >= pageCount - 1} title={t('editorV3.common.next')}>
                  <ChevronRightIcon aria-hidden="true" />
                </button>
                <div className="bb-sep" aria-hidden="true" />
                <button
                  className="bb-btn"
                  data-testid="zoom-out-btn"
                  onClick={() => onZoomChange(z => Math.max(0.25, Number((z - 0.25).toFixed(2))))}
                  disabled={zoom <= 0.25}
                  title={t('editorV3.zoom.zoomOut')}
                >
                  −
                </button>
                <button
                  className="bb-zoom"
                  data-testid="zoom-reset-btn"
                  type="button"
                  title={t('editorV3.zoom.chooseLevel')}
                  aria-label={t('editorV3.zoom.chooseLevel')}
                  onClick={() => setZoomPresetsOpen(o => !o)}
                >
                  {Math.round(zoom * 100)}%
                </button>
                <button
                  className="bb-btn"
                  data-testid="zoom-in-btn"
                  onClick={() => onZoomChange(z => Math.min(4, Number((z + 0.25).toFixed(2))))}
                  disabled={zoom >= 4}
                  title={t('editorV3.zoom.zoomIn')}
                >
                  +
                </button>
                <button
                  className="bb-btn"
                  data-testid="zoom-fit-width-btn"
                  onClick={() => { onZoomChange(1.0); }}
                  aria-label={t('editorV3.nav.fitToView')}
                  title={t('editorV3.nav.fitToView')}
                >
                  <MaximizeIcon aria-hidden="true" />
                </button>
              </div>
              <ZoomPresetsPopover
                isOpen={zoomPresetsOpen}
                onClose={() => { setZoomPresetsOpen(false); }}
                onZoomChange={(z) => { onZoomChange(z); }}
              />
            </>
          )}
        </div>

      </div>

      {readOpen && (
        <div className={readPaused ? 'read-bar show paused' : 'read-bar show'}>
          <span className="label"><span className="eq"><i /><i /><i /><i /></span>{t('editorV3.read.readAloud')}</span>
          <button className="read-btn" onClick={handleReadRestart} title={t('editorV3.read.restart')}>
            <RotateCcwIcon aria-hidden="true" />
          </button>
          <button className="read-btn primary" onClick={handleReadPauseToggle} title={readPaused ? t('editorV3.read.play') : t('editorV3.read.pause')}>
            {readPaused ? <PlayIcon aria-hidden="true" /> : <PauseIcon aria-hidden="true" />}
          </button>
          <button className="read-btn" onClick={handleReadStop} title={t('editorV3.read.stop')}>
            <XIcon aria-hidden="true" />
          </button>
        </div>
      )}

      {activeModal === 'privacy' && (
        <EditorV3Modal title={t('editorV3.privacy.title')} onClose={() => setActiveModal(null)}>
          <div className="modal-kicker"><ShieldCheckIcon aria-hidden="true" />{t('editorV3.privacy.localFirst')}</div>
          <p>{t('editorV3.privacy.intro')}</p>
          <div className="modal-grid">
            <CapabilityRow title={t('editorV3.privacy.documentDataTitle')} detail={t('editorV3.privacy.documentDataDetail')} />
            <CapabilityRow title={t('editorV3.privacy.crashTitle')} detail={t('editorV3.privacy.crashDetail')} />
            <CapabilityRow title={t('editorV3.privacy.osTitle')} detail={t('editorV3.privacy.osDetail')} />
          </div>
        </EditorV3Modal>
      )}

      {activeModal === 'author' && (
        <EditorV3Modal title={t('editorV3.commentName.title')} onClose={() => setActiveModal(null)}>
          <p>{t('editorV3.commentName.intro')}</p>
          <label className="modal-field">
            <span>{t('editorV3.commentName.nameLabel')}</span>
            <input
              value={authorDraft}
              onChange={(event) => setAuthorDraft(event.target.value)}
              placeholder={t('editorV3.commentName.placeholder')}
              autoFocus
            />
          </label>
          <div className="modal-actions">
            <button className="modal-secondary" type="button" onClick={() => setActiveModal(null)}>{t('editorV3.common.cancel')}</button>
            <button className="modal-primary" type="button" onClick={commitAuthorName}>{t('editorV3.common.save')}</button>
          </div>
        </EditorV3Modal>
      )}

      {activeModal === 'native' && (
        <EditorV3Modal title={t('editorV3.native.title')} onClose={() => setActiveModal(null)}>
          <p>{t('editorV3.native.intro')}</p>
          <NativeCapabilityList capabilities={nativeCapabilities} />
        </EditorV3Modal>
      )}

      {showSignModal && (
        <EditorV3Modal title={t('editorV3.sign.addSignature')} onClose={() => setShowSignModal(false)}>
          <div className="esign-tabs" style={{ display: 'flex', gap: 12, marginBottom: 16 }}>
            <button className={`btn-ghost ${signType === 'type' ? 'active' : ''}`} style={{ flex: 1, borderBottom: signType === 'type' ? '2px solid var(--accent)' : 'none', borderRadius: 0, paddingBottom: 8 }} onClick={() => setSignType('type')}>{t('editorV3.sign.type')}</button>
            <button className={`btn-ghost ${signType === 'draw' ? 'active' : ''}`} style={{ flex: 1, borderBottom: signType === 'draw' ? '2px solid var(--accent)' : 'none', borderRadius: 0, paddingBottom: 8 }} onClick={() => setSignType('draw')}>{t('editorV3.sign.draw')}</button>
          </div>

          {signType === 'type' ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <label className="modal-field">
                <span>{t('editorV3.sign.signatureName')}</span>
                <input
                  value={signatureName}
                  onChange={(e) => setSignatureName(e.target.value)}
                  placeholder={t('editorV3.sign.typeName')}
                  autoFocus
                />
              </label>
              <div className="panel-section-label">{t('editorV3.sign.selectStyle')}</div>
              <label className="select-wrap" style={{ width: '100%' }}>
                <select className="select native-select" value={signatureFont} onChange={e => setSignatureFont(e.target.value)}>
                  <option value="font-signature-1">{t('editorV3.sign.styleClassic')}</option>
                  <option value="font-signature-2">{t('editorV3.sign.styleElegant')}</option>
                  <option value="font-signature-3">{t('editorV3.sign.styleBrush')}</option>
                  <option value="font-signature-4">{t('editorV3.sign.styleModern')}</option>
                </select>
                <ChevronDownIcon aria-hidden="true" />
              </label>
              {signatureName && (
                <div style={{
                  padding: '24px',
                  background: 'rgba(30,31,36,0.02)',
                  border: '1px solid var(--border)',
                  borderRadius: 8,
                  textAlign: 'center',
                  fontSize: 28,
                  color: 'rgb(22, 101, 52)',
                  fontFamily: 
                    signatureFont === 'font-signature-1' ? 'Brush Script MT, cursive' :
                    signatureFont === 'font-signature-2' ? 'Caveat, cursive' :
                    signatureFont === 'font-signature-3' ? 'Satisfy, cursive' : 'Lucida Handwriting, cursive'
                }}>
                  {signatureName}
                </div>
              )}
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div style={{
                height: 180,
                background: 'rgba(30,31,36,0.02)',
                border: '1px dashed var(--border)',
                borderRadius: 8,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: 'var(--text-muted)',
                fontSize: 13,
                cursor: 'crosshair',
                position: 'relative'
              }}>
                <span>{t('editorV3.sign.drawHere')}</span>
                <div style={{ position: 'absolute', bottom: 10, right: 10, fontSize: 10 }}>{t('editorV3.sign.clear')}</div>
              </div>
            </div>
          )}

          <div className="modal-actions" style={{ marginTop: 20 }}>
            <button className="modal-secondary" type="button" onClick={() => setShowSignModal(false)}>{t('editorV3.common.cancel')}</button>
            <button className="modal-primary" type="button" onClick={() => {
              setShowSignModal(false);
              setPendingSignature({
                type: 'signature',
                content: signatureName || t('editorV3.sign.defaultSignature'),
                font: signatureFont
              });
              showToast(t('editorV3.sign.clickToPlaceSignature'));
            }}>{t('editorV3.sign.apply')}</button>
          </div>
        </EditorV3Modal>
      )}

      {showInitialsModal && (
        <EditorV3Modal title={t('editorV3.sign.addInitials')} onClose={() => setShowInitialsModal(false)}>
          <p style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 16 }}>{t('editorV3.sign.initialsIntro')}</p>
          <label className="modal-field">
            <span>{t('editorV3.sign.initials')}</span>
            <input
              value={typedInitials}
              onChange={(e) => setTypedInitials(e.target.value)}
              placeholder={t('editorV3.sign.initialsPlaceholder')}
              maxLength={4}
              autoFocus
            />
          </label>
          {typedInitials && (
            <div style={{
              marginTop: 16,
              padding: '16px',
              background: 'rgba(30,31,36,0.02)',
              border: '1px solid var(--border)',
              borderRadius: 8,
              textAlign: 'center',
              fontSize: 24,
              color: 'rgb(22, 101, 52)',
              fontFamily: 'Caveat, cursive'
            }}>
              {typedInitials}
            </div>
          )}
          <div className="modal-actions" style={{ marginTop: 20 }}>
            <button className="modal-secondary" type="button" onClick={() => setShowInitialsModal(false)}>{t('editorV3.common.cancel')}</button>
            <button className="modal-primary" type="button" onClick={() => {
              setShowInitialsModal(false);
              setPendingSignature({
                type: 'initials',
                content: typedInitials || t('editorV3.sign.defaultInitials')
              });
              showToast(t('editorV3.sign.clickToPlaceInitials'));
            }}>{t('editorV3.sign.apply')}</button>
          </div>
        </EditorV3Modal>
      )}

      {textOverlayDraft && (
        <EditorV3Modal
          title={textOverlayDraft.id ? t('editorV3.textbox.editTitle') : t('editorV3.textbox.newTitle')}
          onClose={() => setTextOverlayDraft(null)}
        >
          <p style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 16 }}>
            {t('editorV3.textbox.intro')}
          </p>
          <label className="modal-field">
            <span>{t('editorV3.textbox.label')}</span>
            <textarea
              value={textOverlayDraft.value}
              onChange={(event) => setTextOverlayDraft(prev => prev ? { ...prev, value: event.target.value } : prev)}
              placeholder={t('editorV3.textbox.placeholder')}
              autoFocus
              style={{
                width: '100%',
                minHeight: 96,
                padding: 10,
                border: '1px solid var(--border)',
                borderRadius: 6,
                fontSize: 13,
                lineHeight: 1.4,
                outline: 'none',
                resize: 'vertical',
              }}
            />
          </label>
          <div className="modal-actions" style={{ marginTop: 20 }}>
            {textOverlayDraft.id && (
              <button
                className="modal-secondary"
                type="button"
                onClick={() => {
                  setLocalOverlays(prev => prev.filter(overlay => overlay.id !== textOverlayDraft.id));
                  setTextOverlayDraft(null);
                  showToast(t('editorV3.textbox.deleted'));
                }}
              >
                {t('editorV3.textbox.delete')}
              </button>
            )}
            <button className="modal-secondary" type="button" onClick={() => setTextOverlayDraft(null)}>{t('editorV3.common.cancel')}</button>
            <button className="modal-primary" type="button" onClick={commitTextOverlayDraft}>{t('editorV3.common.save')}</button>
          </div>
        </EditorV3Modal>
      )}

      {localOverlays.map(overlay => {
        const pageContainer = canvasRef.current?.querySelector(`[data-page-index="${overlay.pageIndex}"]`);
        if (!pageContainer) return null;

        const style: React.CSSProperties = {
          position: 'absolute',
          left: overlay.x * zoom,
          top: overlay.y * zoom,
          transform: 'translate(-50%, -50%)',
          zIndex: 40,
          pointerEvents: 'auto',
        };

        return createPortal(
          <div key={overlay.id} style={style} className="local-overlay-item">
            {overlay.type === 'text' ? (
              <div style={{
                padding: '4px 8px',
                background: 'transparent',
                color: 'var(--text-primary)',
                fontSize: 14 * zoom,
                fontFamily: 'Helvetica, Arial, sans-serif',
                whiteSpace: 'pre',
                border: '1px dashed transparent',
                cursor: 'pointer'
              }}
              onClick={(e) => {
                e.stopPropagation();
                setTextOverlayDraft({
                  id: overlay.id,
                  pageIndex: overlay.pageIndex,
                  x: overlay.x,
                  y: overlay.y,
                  value: overlay.content,
                });
              }}
              title={t('editorV3.overlay.clickToEdit')}
              >
                {overlay.content}
              </div>
            ) : overlay.type === 'image' ? (
              <img
                src={overlay.content}
                alt={t('editorV3.overlay.placed')}
                style={{
                  maxWidth: 150 * zoom,
                  maxHeight: 150 * zoom,
                  border: '1px dashed transparent',
                  cursor: 'pointer'
                }}
                onClick={(e) => {
                  e.stopPropagation();
                  setLocalOverlays(prev => prev.filter(o => o.id !== overlay.id));
                  showToast(t('editorV3.overlay.imageRemoved'));
                }}
                title={t('editorV3.overlay.clickToRemove')}
              />
            ) : (
              <div style={{
                padding: '6px 12px',
                background: 'rgba(239, 246, 255, 0.95)',
                border: '1.5px dashed var(--accent)',
                borderRadius: 4,
                color: 'rgb(22, 101, 52)',
                fontSize: overlay.type === 'signature' ? 24 * zoom : 18 * zoom,
                fontFamily: 
                  overlay.font === 'font-signature-1' ? 'Brush Script MT, cursive' :
                  overlay.font === 'font-signature-2' ? 'Caveat, cursive' :
                  overlay.font === 'font-signature-3' ? 'Satisfy, cursive' : 
                  overlay.type === 'initials' ? 'Caveat, cursive' : 'Lucida Handwriting, cursive',
                whiteSpace: 'nowrap',
                boxShadow: '0 4px 12px rgba(10, 102, 255, 0.15)',
                cursor: 'pointer',
                userSelect: 'none'
              }}
              onClick={(e) => {
                e.stopPropagation();
                setLocalOverlays(prev => prev.filter(o => o.id !== overlay.id));
                showToast(t('editorV3.overlay.signatureRemoved'));
              }}
              title={t('editorV3.overlay.clickToRemove')}
              >
                {overlay.content}
              </div>
            )}
          </div>,
          pageContainer
        );
      })}

      {toast && (
        <div className="toast-wrap">
          <div className="toast show"><ShieldCheckIcon className="ok" aria-hidden="true" /><span>{toast}</span></div>
        </div>
      )}

      <Settings
        visible={showSettings}
        onClose={() => setShowSettings(false)}
      />
    </div>
  );
}

function EditorV3Modal({
  title,
  children,
  onClose,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={onClose}>
      <section
        className="v3-modal"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="modal-head">
          <h2>{title}</h2>
          <button className="panel-close" type="button" onClick={onClose} aria-label={t('common.close')}>
            <XIcon aria-hidden="true" />
          </button>
        </div>
        <div className="modal-body">{children}</div>
      </section>
    </div>
  );
}

function CapabilityRow({ title, detail }: { title: string; detail: string }) {
  return (
    <div className="cap-row">
      <b>{title}</b>
      <span>{detail}</span>
    </div>
  );
}

function NativeCapabilityList({ capabilities }: { capabilities: NativeCapabilities | null }) {
  const { t } = useTranslation();
  if (!capabilities) {
    return (
      <div className="modal-grid">
        <CapabilityRow title={t('editorV3.native.detection')} detail={t('editorV3.native.loading')} />
      </div>
    );
  }

  const rows: Array<[string, NativeFeatureCapability]> = [
    [t('editorV3.native.ocr'), capabilities.ocr],
    [t('editorV3.native.tts'), capabilities.tts],
    [t('editorV3.native.scanner'), capabilities.scanner],
    [t('editorV3.native.spellcheck'), capabilities.spellcheck],
    [t('editorV3.native.dictation'), capabilities.dictation],
    [t('editorV3.native.share'), capabilities.share],
    [t('editorV3.native.secureStorage'), capabilities.secureStorage],
  ];

  return (
    <div className="native-list">
      <div className="native-platform">{t('editorV3.native.platform', { platform: capabilities.platform })}</div>
      {rows.map(([label, feature]) => (
        <div key={label} className={`native-row ${feature.status}`}>
          <span className="state">{feature.status}</span>
          <div>
            <b>{label}</b>
            <span>{feature.provider} - {feature.detail}</span>
          </div>
        </div>
      ))}
    </div>
  );
}

interface TopBarProps {
  fileName: string | null;
  pageIndex: number;
  pageCount: number;
  isDirty: boolean;
  currentFilePath: string | null;
  canUndo: boolean;
  canRedo: boolean;
  activePanel: V3Panel | null;
  shareOpen: boolean;
  moreOpen: boolean;
  readOpen: boolean;
  readPaused: boolean;
  searchOpen: boolean;
  searchQuery: string;
  searchResultCount: number;
  activeSearchResultIndex: number;
  nativeCapabilities: NativeCapabilities | null;
  themeDark: boolean;
  onOpenFile: (source: string | ArrayBuffer) => Promise<void>;
  onSaveAs: () => Promise<void>;
  onSaveComplete: () => void;
  onCloseDocument: () => void;
  onUndo: () => void;
  onRedo: () => void;
  onPanelToggle: (panel: V3Panel) => void;
  onShareToggle: () => void;
  onMoreToggle: () => void;
  onReadToggle: () => void;
  onReadPauseToggle: () => void;
  onReadRestart: () => void;
  onReadStop: () => void;
  onOpenCommandPalette: () => void;
  onOpenExport: (format?: ExportFormat) => void;
  onOpenSearch: () => void;
  onSearchQueryChange: (query: string) => void;
  onRunSearch: (query: string) => void;
  onNextSearchResult: () => void;
  onPrevSearchResult: () => void;
  onNavigatePage: (pageIndex: number) => void;
  onShowPrivacy: () => void;
  onShowAuthor: () => void;
  onShowNative: () => void;
  onShowSettings: () => void;
  onToggleTheme: () => void;
  onProtectDocument: () => void;
  onCheckForUpdates: () => void;
  onShowToast: (message: string) => void;
}

function EditorV3TopBar(props: TopBarProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const menuTabsRef = useRef<HTMLElement>(null);
  const { push, update } = useTaskQueueContext();
  const hasDocument = props.pageCount > 0;
  const canSave = props.isDirty && hasDocument;
  const ttsAvailable = props.nativeCapabilities?.tts.available ?? true;
  const [tabOverflow, setTabOverflow] = useState({ left: false, right: false });

  useEffect(() => {
    const el = menuTabsRef.current;
    if (!el || !hasDocument) return;

    const updateOverflow = () => {
      setTabOverflow({
        left: el.scrollLeft > 2,
        right: el.scrollLeft + el.clientWidth < el.scrollWidth - 2,
      });
    };

    updateOverflow();
    el.addEventListener('scroll', updateOverflow, { passive: true });
    const observer = new ResizeObserver(updateOverflow);
    observer.observe(el);
    return () => {
      el.removeEventListener('scroll', updateOverflow);
      observer.disconnect();
    };
  }, [hasDocument]);

  function scrollTabs(direction: -1 | 1) {
    menuTabsRef.current?.scrollBy({ left: direction * 156, behavior: 'smooth' });
  }

  async function handleSave(): Promise<void> {
    if (!canSave) return;
    const taskId = `save-${Date.now()}`;
    push({ id: taskId, label: t('editorV3.toasts.saving'), progress: null, status: 'running' });
    try {
      if (isTauri && props.currentFilePath) {
        const { invokeCommand: invoke } = await import('../../lib/commandBridge');
        await invoke('save_pdf', { path: props.currentFilePath });
      } else {
        await props.onSaveAs();
      }
      props.onSaveComplete();
      update(taskId, { status: 'done', label: t('editorV3.toasts.saved') });
      props.onShowToast(t('editorV3.toasts.savedOnDevice'));
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      update(taskId, { status: 'error', label: t('editorV3.toasts.saveFailed', { message }) });
    }
  }

  // Cmd/Ctrl+S — the shortcut sheet has advertised this since the sheet
  // existed and nothing answered it: no handler anywhere read `e.key === 's'`.
  // It saves through the same path as the toolbar's save button.
  useEffect(() => {
    function handleSaveKey(e: KeyboardEvent): void {
      if (!(e.metaKey || e.ctrlKey) || e.shiftKey || e.key !== 's') return;
      e.preventDefault();
      void handleSave();
    }
    window.addEventListener('keydown', handleSaveKey);
    return () => { window.removeEventListener('keydown', handleSaveKey); };
  }); // no dependency list: handleSave closes over props that change every render

  function handleFileInputChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const buffer = ev.target?.result;
      if (buffer instanceof ArrayBuffer) void props.onOpenFile(buffer);
    };
    reader.readAsArrayBuffer(file);
    event.target.value = '';
  }

  async function handleOpen(): Promise<void> {
    if (isTauri) {
      const path = await pickPdfPath();
      if (typeof path === 'string') await props.onOpenFile(path);
    } else {
      fileInputRef.current?.click();
    }
  }

  async function openExternalUrl(url: string): Promise<void> {
    if (isTauri) {
      const { invokeCommand: invoke } = await import('../../lib/commandBridge');
      await invoke('open_external_url', { url });
      return;
    }
    window.open(url, '_blank', 'noopener,noreferrer');
  }

  const { t } = useTranslation();
  const modeTabs: Array<{ id: V3Panel; label: string; icon: typeof LayoutGridIcon }> = [
    { id: 'tools', label: t('modes.allTools'), icon: LayoutGridIcon },
    { id: 'edit', label: t('modes.edit'), icon: PencilIcon },
    { id: 'convert', label: t('modes.convert'), icon: RefreshCwIcon },
    { id: 'esign', label: t('modes.sign'), icon: PenLineIcon },
  ];

  return (
    <>
      <header className="topbar">
        {!isTauri && <input ref={fileInputRef} type="file" accept=".pdf" className="hidden" onChange={handleFileInputChange} aria-label={t('topbar.openPdfFile')} />}
        <div className="tb-left">
          <button className="brand" onClick={() => { void handleOpen(); }} type="button">
            <span className="brand-mark">P</span>
            <span className="brand-name">PDFluent</span>
          </button>
          <div className="brand-divider" />
          {hasDocument ? (
            <div className="menu-tabs-wrap">
              <button
                className={tabOverflow.left ? 'tab-scroll show' : 'tab-scroll'}
                type="button"
                onClick={() => scrollTabs(-1)}
                aria-label={t('editorV3.topbar.scrollLeft')}
                tabIndex={tabOverflow.left ? 0 : -1}
              >
                <ChevronLeftIcon aria-hidden="true" />
              </button>
              <nav ref={menuTabsRef} className="menu-tabs" aria-label={t('editorV3.topbar.workMode')}>
                {modeTabs.map(tab => {
                  const Icon = tab.icon;
                  return (
                    <button
                      key={tab.id}
                      type="button"
                      className={props.activePanel === tab.id ? 'menu-tab active' : 'menu-tab'}
                      onClick={() => props.onPanelToggle(tab.id)}
                    >
                      <Icon aria-hidden="true" />
                      {tab.label}
                    </button>
                  );
                })}
              </nav>
              <button
                className={tabOverflow.right ? 'tab-scroll right show' : 'tab-scroll right'}
                type="button"
                onClick={() => scrollTabs(1)}
                aria-label={t('editorV3.topbar.scrollRight')}
                tabIndex={tabOverflow.right ? 0 : -1}
              >
                <ChevronRightIcon aria-hidden="true" />
              </button>
            </div>
          ) : (
            <button className="share-btn" type="button" onClick={() => { void handleOpen(); }}>
              <FileTextIcon aria-hidden="true" />
              {t('editorV3.topbar.openPdf')}
            </button>
          )}
        </div>

        <div className="tb-center">
          <div className="crumb">
            <HardDriveIcon className="pre" aria-hidden="true" />
            <span className="pre">{t('editorV3.topbar.myFiles')}</span>
            <span className="sep pre">/</span>
            <span className="file" title={props.fileName ?? t('editorV3.topbar.noDocument')}>{props.fileName ?? t('editorV3.topbar.noDocument')}</span>
            {hasDocument && <span className="badge">PDF</span>}
            {props.isDirty && <span className="dirty-dot" title={t('editorV3.topbar.unsaved')} />}
            {hasDocument && <ChevronDownIcon className="chev" aria-hidden="true" />}
          </div>
        </div>

        <div className="tb-right">
          {hasDocument && (
            <>
              <div className="tb-group">
                <button className="iconbtn" disabled={!props.canUndo} onClick={props.onUndo} title={t('editorV3.topbar.undo')} data-testid="undo-btn">
                  <Undo2Icon aria-hidden="true" />
                </button>
                <button className="iconbtn" disabled={!props.canRedo} onClick={props.onRedo} title={t('editorV3.topbar.redo')} data-testid="redo-btn">
                  <Redo2Icon aria-hidden="true" />
                </button>
              </div>
              <div className="brand-divider" />
              <button className={props.searchOpen ? 'iconbtn on' : 'iconbtn'} onClick={props.onOpenSearch} title={t('editorV3.topbar.search')} data-testid="search-btn">
                <SearchIcon aria-hidden="true" />
              </button>
              <button
                className={props.readOpen ? 'iconbtn live' : 'iconbtn'}
                onClick={props.onReadToggle}
                title={ttsAvailable ? t('editorV3.read.readAloud') : t('editorV3.read.notAvailable')}
                disabled={!ttsAvailable}
                data-testid="read-aloud-btn"
              >
                <HeadphonesIcon aria-hidden="true" />
              </button>
              <button className="iconbtn" onClick={() => { void handleSave(); }} disabled={!canSave} title={t('editorV3.topbar.save')} data-testid="save-btn">
                <SaveIcon aria-hidden="true" />
              </button>
            </>
          )}
          <button className={props.moreOpen ? 'iconbtn on more-trigger' : 'iconbtn more-trigger'} onClick={props.onMoreToggle} title={t('editorV3.topbar.more')}>
            <MoreHorizontalIcon aria-hidden="true" />
          </button>
          {hasDocument && (
            <>
              <div className="brand-divider" />
              <div className="privacy-badge" title={t('editorV3.topbar.localTooltip')}>
                <ShieldCheckIcon aria-hidden="true" />
                <span>{t('editorV3.topbar.local')}</span>
              </div>
              <button className="share-btn share-trigger" onClick={props.onShareToggle} type="button">
                <Share2Icon aria-hidden="true" />
                {t('editorV3.topbar.share')}
              </button>
            </>
          )}
        </div>

        {props.searchOpen && hasDocument && (
          <div className="searchpop show">
            <div className="row">
              <input
                type="text"
                placeholder={t('editorV3.topbar.searchPlaceholder')}
                value={props.searchQuery}
                autoFocus
                onChange={(event) => {
                  props.onSearchQueryChange(event.target.value);
                  props.onRunSearch(event.target.value);
                }}
              />
              <span className="count">{props.searchResultCount ? `${props.activeSearchResultIndex + 1}/${props.searchResultCount}` : ''}</span>
              <button className="iconbtn" style={{ width: 32, height: 32 }} onClick={props.onPrevSearchResult}><ChevronUpIcon aria-hidden="true" /></button>
              <button className="iconbtn" style={{ width: 32, height: 32 }} onClick={props.onNextSearchResult}><ChevronDownIcon aria-hidden="true" /></button>
            </div>
          </div>
        )}
      </header>

      {props.moreOpen && (
        <div className="dropdown show topbar-more-menu">
          {hasDocument && (
            <button className="dd-item" onClick={() => window.print()}><PrinterIcon aria-hidden="true" />{t('editorV3.menu.print')}<span className="sc">⌘P</span></button>
          )}
          <button className="dd-item" onClick={props.onOpenCommandPalette}><InfoIcon aria-hidden="true" />{t('editorV3.menu.commandPalette')}<span className="sc">⌘K</span></button>
          <div className="dd-sep" />
          <div className="dd-label">{t('editorV3.menu.view')}</div>
          <button className="dd-item" onClick={props.onToggleTheme}><MoonIcon aria-hidden="true" />{t('editorV3.menu.darkMode')}<span className="val">{props.themeDark ? t('editorV3.menu.on') : t('editorV3.menu.off')}</span></button>
          <div className="dd-item" style={{ cursor: 'default' }}><LanguagesIcon aria-hidden="true" />{t('editorV3.menu.language')}<span className="val"><LanguageSwitcher /></span></div>
          <button className="dd-item" onClick={props.onShowNative}><HardDriveIcon aria-hidden="true" />{t('editorV3.menu.nativeFeatures')}<span className="val">{props.nativeCapabilities?.platform ?? t('editorV3.menu.detecting')}</span></button>
          <div className="dd-sep" />
          <div className="dd-label">{t('editorV3.menu.privacy')}</div>
          <button className="dd-item" onClick={props.onShowAuthor}><UserRoundIcon aria-hidden="true" />{t('editorV3.menu.commentName')}</button>
          <button className="dd-item" onClick={props.onShowPrivacy}><ShieldCheckIcon aria-hidden="true" />{t('editorV3.menu.aboutPrivacy')}</button>
          <div className="dd-sep" />
          <button className="dd-item" onClick={props.onShowSettings}><BadgeCheckIcon aria-hidden="true" />{t('editorV3.menu.about')}</button>
          {/* Self-updater menu entry is omitted from the Mac App Store build
              (the App Store delivers updates there). */}
          {!__IS_MAS_BUILD__ && (
            <button className="dd-item" onClick={props.onCheckForUpdates}><DownloadIcon aria-hidden="true" />{t('editorV3.menu.checkForUpdates')}<span className="val">v{__APP_VERSION__}</span></button>
          )}
          <button className="dd-item" onClick={() => { void openExternalUrl('https://pdfluent.com'); }}><InfoIcon aria-hidden="true" />{t('editorV3.menu.website')}</button>
          {hasDocument && (
            <>
              <div className="dd-sep" />
              <button className="dd-item" onClick={props.onCloseDocument}><XIcon aria-hidden="true" />{t('editorV3.menu.closeDocument')}</button>
            </>
          )}
        </div>
      )}

      {props.shareOpen && hasDocument && (
        <div className="dropdown show share-menu">
          <div className="dd-label">{t('editorV3.share.localHeading')}</div>
          <button className="dd-item" onClick={() => { void handleSave(); }} disabled={!canSave}><SaveIcon aria-hidden="true" />{t('editorV3.share.saveCopy')}</button>
          <button className="dd-item" onClick={() => props.onOpenExport()} data-testid="export-btn"><DownloadIcon aria-hidden="true" />{t('editorV3.share.exportAs')}<span className="val">{t('editorV3.share.exportFormats')}</span></button>
          <button className="dd-item" onClick={props.onSaveAs} data-testid="save-as-btn"><SaveIcon aria-hidden="true" />{t('editorV3.share.saveAs')}</button>
          <button className="dd-item" onClick={props.onProtectDocument}><LockIcon aria-hidden="true" />{t('editorV3.share.protectedCopy')}</button>
          <button className="dd-item" onClick={() => { window.location.href = `mailto:?subject=${encodeURIComponent(props.fileName ?? 'PDF')}&body=${encodeURIComponent(t('editorV3.share.emailBody'))}`; }}><MailIcon aria-hidden="true" />{t('editorV3.share.sendByEmail')}</button>
          <button className="dd-item" onClick={() => props.onOpenExport()}><LayersIcon aria-hidden="true" />{t('editorV3.share.flatCopy')}</button>
          <div className="dd-sep" />
          <p className="share-note">{t('editorV3.share.note')}</p>
        </div>
      )}
    </>
  );
}

function EditorV3Panel({
  panel,
  onClose,
  onPanelChange,
  onAnnotationToolChange,
  onOpenSignModal,
  onOpenInitialsModal,
  onOpenAllTools: _onOpenAllTools,
  onOpenExport,
  onRunOcr,
  onProtectDocument: _onProtectDocument,
  onWatermark: _onWatermark,
  currentFilePath,
  onFormatCommand,
  onModeChange,
  comments,
  activeCommentIdx: _activeCommentIdx,
  onCommentSelect: _onCommentSelect,
  onNextComment,
  onPrevComment,
  onResolveAll,
  formFields,
  activeFieldIdx: _activeFieldIdx,
  onFieldSelect: _onFieldSelect,
  formValidationErrors,
  onFormSubmit,
  selectedAnnotation,
  redactions,
  documentIssues: _documentIssues,
  onApplyRedactions,
  onRedactSearch,
  scannedPageIndices,
  ocrRunning,
  ocrVisible,
  onOcrVisibleChange,
  ocrConfidenceThreshold,
  onOcrConfidenceChange,
  attachments,
  onExtractAttachment,
  onAddAttachment,
  onRemoveAttachment,
  layers,
  layerVisibility,
  onShowToast,
  onDocumentMutated,
  contentRevision = 0,
  isInsertingText: _isInsertingText,
  setIsInsertingText,
  isInsertingImage: _isInsertingImage,
  setIsInsertingImage,
  pendingSignature,
  setPendingSignature,
}: {
  panel: V3Panel;
  onClose: () => void;
  onPanelChange: (panel: V3Panel | null) => void;
  onAnnotationToolChange: (tool: AnnotationTool) => void;
  onOpenSignModal?: () => void;
  onOpenInitialsModal?: () => void;
  isInsertingText: boolean;
  setIsInsertingText: (val: boolean) => void;
  isInsertingImage: boolean;
  setIsInsertingImage: (val: boolean) => void;
  pendingSignature: { type: 'signature' | 'initials'; content: string; font?: string } | null;
  setPendingSignature: (val: { type: 'signature' | 'initials'; content: string; font?: string } | null) => void;
  onOpenAllTools: () => void;
  onOpenExport: (format?: ExportFormat) => void;
  onRunOcr: () => void;
  onProtectDocument: () => void;
  onWatermark: () => void;
  currentFilePath: string | null;
  onFormatCommand: (command: string, value?: string) => void;
  onModeChange: (mode: ViewerMode) => void;
  comments: Annotation[];
  activeCommentIdx: number;
  onCommentSelect: (idx: number) => void;
  onNextComment: () => void;
  onPrevComment: () => void;
  onResolveAll: () => void;
  formFields: FormField[];
  activeFieldIdx: number;
  onFieldSelect: (idx: number) => void;
  formValidationErrors: Array<{ fieldId: string; errors: string[] }>;
  onFormSubmit: () => Promise<void>;
  selectedAnnotation: Annotation | null;
  redactions: Annotation[];
  documentIssues: unknown[];
  onApplyRedactions: () => void;
  onRedactSearch: (query: string) => Promise<{ matchesFound: number; areasRedacted: number } | null>;
  scannedPageIndices: Set<number>;
  ocrRunning: boolean;
  ocrVisible: boolean;
  onOcrVisibleChange: (visible: boolean | ((prev: boolean) => boolean)) => void;
  ocrConfidenceThreshold: number;
  onOcrConfidenceChange: (threshold: number | ((prev: number) => number)) => void;
  attachments: AttachmentInfo[];
  onExtractAttachment: (name: string) => void;
  onAddAttachment: () => void;
  onRemoveAttachment: (name: string) => void;
  layers: LayerInfo[];
  layerVisibility: Map<string, boolean>;
  onShowToast: (message: string) => void;
  onDocumentMutated?: () => void;
  contentRevision?: number;
}) {
  const { t } = useTranslation();
  const { push, update } = useTaskQueueContext();
  const title =
    panel === 'tools' ? t('modes.allTools') :
    panel === 'edit' ? t('modes.edit') :
    panel === 'convert' ? t('modes.convert') :
    panel === 'esign' ? t('modes.sign') :
    panel === 'protect' ? t('modes.protect') :
    panel === 'watermark' ? t('toolbar.watermark') :
    panel === 'compress' ? t('toolbar.compress') :
    panel === 'split' ? t('toolbar.split') :
    panel === 'merge' ? t('toolbar.merge') :
    panel === 'redact' ? t('toolbar.redact') :
    panel === 'pdfa' ? t('toolbar.pdfa') :
    panel === 'metadata' ? t('toolbar.metadata') :
    panel === 'invoice' ? t('toolbar.invoice') : t('modes.protect');

  const basenameFromPath = (path: string): string => path.split(/[\\/]/).filter(Boolean).pop() ?? path;
  const normalizeDialogPaths = (value: string | string[] | null): string[] => {
    if (!value) return [];
    return Array.isArray(value) ? value : [value];
  };

  type MergeFileEntry = { name: string; size: string; path: string; locked?: boolean };

  const [compressBusy, setCompressBusy] = useState(false);
  const [compressProgress, setCompressProgress] = useState(0);

  const [splitType, setSplitType] = useState('page');
  const [splitRange, setSplitRange] = useState('1-2, 3-4');
  const [splitBusy, setSplitBusy] = useState(false);

  const [filesToMerge, setFilesToMerge] = useState<MergeFileEntry[]>([]);
  const [mergeBusy, setMergeBusy] = useState(false);

  const [signedRevision, setSignedRevision] = useState(0);

  const [redactSearchQuery, setRedactSearchQuery] = useState('');
  const [redactSearchBusy, setRedactSearchBusy] = useState(false);
  const [redactApplyBusy, setRedactApplyBusy] = useState(false);

  useEffect(() => {
    setFilesToMerge(currentFilePath
      ? [{
          name: basenameFromPath(currentFilePath),
          size: t('editorV3.merge.currentDocument'),
          path: currentFilePath,
          locked: true,
        }]
      : []);
  }, [currentFilePath, t]);

  useEffect(() => {
    if (panel === 'redact') {
      onAnnotationToolChange('redaction');
    }
  }, [panel, onAnnotationToolChange]);

  const handleCompress = async () => {
    if (!isTauri || compressBusy) return;
    setCompressBusy(true);
    setCompressProgress(10);
    const taskId = `compress-${Date.now()}`;
    try {
      const [{ save }, { invokeCommand: invoke }] = await Promise.all([
        import('@tauri-apps/plugin-dialog'),
        import('../../lib/commandBridge'),
      ]);
      const defaultName = currentFilePath
        ? basenameFromPath(currentFilePath).replace(/\.pdf$/i, '-compressed.pdf')
        : 'compressed.pdf';
      const outputPath = await save({
        title: t('editorV3.toasts.saveCompressedPdf'),
        defaultPath: defaultName,
        filters: [{ name: 'PDF', extensions: ['pdf'] }],
      });
      if (!outputPath) return;

      push({ id: taskId, label: t('editorV3.toasts.compressingPdf'), progress: null, status: 'running' });
      setCompressProgress(55);
      const result = await invoke<{
        objects_before: number;
        objects_after: number;
        streams_compressed: number;
        duplicates_merged: number;
        unused_removed: number;
      }>('compress_pdf', { outputPath });
      setCompressProgress(100);
      update(taskId, { status: 'done', label: t('editorV3.toasts.pdfCompressedTask', { count: result.streams_compressed }) });
      onShowToast(t('editorV3.toasts.pdfCompressedToast', { name: basenameFromPath(outputPath) }));
      onPanelChange('tools');
      onDocumentMutated?.();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      update(taskId, { status: 'error', label: t('editorV3.toasts.compressFailed', { message }) });
      onShowToast(t('editorV3.toasts.compressFailed', { message }));
    } finally {
      setCompressBusy(false);
      window.setTimeout(() => setCompressProgress(0), 350);
    }
  };

  const handleSplit = async () => {
    if (!isTauri || splitBusy) return;
    setSplitBusy(true);
    const taskId = `split-${Date.now()}`;
    try {
      const [{ open }, { invokeCommand: invoke }] = await Promise.all([
        import('@tauri-apps/plugin-dialog'),
        import('../../lib/commandBridge'),
      ]);
      const pickedDir = await open({ directory: true, multiple: false, title: t('editorV3.toasts.splitFolder') });
      const outputDir = normalizeDialogPaths(pickedDir)[0];
      if (!outputDir) return;

      const ranges = splitRange
        .split(',')
        .map(range => range.trim())
        .filter(Boolean);
      if (splitType === 'range' && ranges.length === 0) {
        onShowToast(t('editorV3.toasts.splitRangeRequired'));
        return;
      }

      push({ id: taskId, label: t('editorV3.toasts.splittingPdf'), progress: null, status: 'running' });
      const paths = splitType === 'page'
        ? await invoke<string[]>('split_into_pages', { outputDir })
        : await invoke<string[]>('split_pdf', { ranges, outputDir });
      update(taskId, { status: 'done', label: t('editorV3.toasts.splitFilesCreated', { count: paths.length }) });
      onShowToast(t('editorV3.toasts.splitFilesSaved', { count: paths.length }));
      onPanelChange('tools');
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      update(taskId, { status: 'error', label: t('editorV3.toasts.splitFailed', { message }) });
      onShowToast(t('editorV3.toasts.splitFailed', { message }));
    } finally {
      setSplitBusy(false);
    }
  };

  const handleAddMergeFile = async () => {
    if (!isTauri) return;
    const { open } = await import('@tauri-apps/plugin-dialog');
    const picked = await open({
      filters: [{ name: 'PDF', extensions: ['pdf'] }],
      multiple: true,
      title: t('editorV3.toasts.addPdfFiles'),
    });
    const paths = normalizeDialogPaths(picked);
    if (paths.length === 0) return;

    setFilesToMerge(prev => {
      const seen = new Set(prev.map(file => file.path));
      const additions = paths
        .filter(path => !seen.has(path))
        .map(path => ({
          name: basenameFromPath(path),
          size: 'PDF',
          path,
        }));
      return [...prev, ...additions];
    });
    onShowToast(t('editorV3.toasts.filesAddedToMerge', { count: paths.length }));
  };

  const handleMerge = async () => {
    if (!isTauri || mergeBusy) return;
    if (filesToMerge.length <= 1) {
      onShowToast(t('editorV3.toasts.mergeAddMore'));
      return;
    }
    setMergeBusy(true);
    const taskId = `merge-${Date.now()}`;
    try {
      const [{ save }, { invokeCommand: invoke }] = await Promise.all([
        import('@tauri-apps/plugin-dialog'),
        import('../../lib/commandBridge'),
      ]);
      const outputPath = await save({
        title: t('editorV3.toasts.saveMergedPdf'),
        defaultPath: t('editorV3.toasts.mergedFilename'),
        filters: [{ name: 'PDF', extensions: ['pdf'] }],
      });
      if (!outputPath) return;
      const paths = filesToMerge.map(file => file.path);
      push({ id: taskId, label: t('editorV3.toasts.mergingPdfs', { count: paths.length }), progress: null, status: 'running' });
      await invoke('merge_pdfs', { paths, outputPath });
      update(taskId, { status: 'done', label: t('editorV3.toasts.pdfsMerged', { count: paths.length }) });
      onShowToast(t('editorV3.toasts.mergedSaved', { name: basenameFromPath(outputPath) }));
      onPanelChange('tools');
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      update(taskId, { status: 'error', label: t('editorV3.toasts.mergeFailed', { message }) });
      onShowToast(t('editorV3.toasts.mergeFailed', { message }));
    } finally {
      setMergeBusy(false);
    }
  };

  const handleTextRedactSearch = async () => {
    if (!redactSearchQuery.trim()) return;
    setRedactSearchBusy(true);
    try {
      const result = await onRedactSearch(redactSearchQuery.trim());
      if (result) {
        onShowToast(t('editorV3.toasts.redactMatches', { matches: result.matchesFound, areas: result.areasRedacted }));
      } else {
        onShowToast(t('editorV3.toasts.noRedactMatches'));
      }
      setRedactSearchQuery('');
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      onShowToast(t('editorV3.toasts.redactSearchFailed', { message }));
    } finally {
      setRedactSearchBusy(false);
    }
  };

  const handleApplyRedactions = async () => {
    if (redactApplyBusy || redactions.length === 0) return;
    let confirmed = false;
    const message = t('editorV3.toasts.applyRedactConfirm', { count: redactions.length });

    if (isTauri) {
      try {
        const { ask } = await import('@tauri-apps/plugin-dialog');
        confirmed = await ask(message, { title: t('editorV3.toasts.applyRedactTitle'), kind: 'warning' });
      } catch {
        confirmed = false;
      }
    } else {
      confirmed = false;
    }
    if (!confirmed) return;

    const taskId = `apply-redactions-v3-${Date.now()}`;
    setRedactApplyBusy(true);
    push({ id: taskId, label: t('editorV3.toasts.applyRedactRunning'), progress: null, status: 'running' });
    try {
      await Promise.resolve(onApplyRedactions());
      update(taskId, { status: 'done', label: t('editorV3.toasts.applyRedactDone') });
      onShowToast(t('editorV3.toasts.redactionsApplied'));
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      update(taskId, { status: 'error', label: t('editorV3.toasts.redactFailed', { message }) });
      onShowToast(t('editorV3.toasts.redactFailed', { message }));
    } finally {
      setRedactApplyBusy(false);
    }
  };

  return (
    <aside className="panel">
      <div className="panel-head">
        <div className="panel-title-row">
          {panel !== 'tools' && (
            <button
              className="panel-back"
              type="button"
              onClick={() => onPanelChange('tools')}
              aria-label={t('editorV3.common.backToTools')}
            >
              <ChevronLeftIcon aria-hidden="true" />
            </button>
          )}
          <span className="panel-title">{title}</span>
        </div>
        <button className="panel-close" onClick={onClose} aria-label={t('editorV3.common.closePanel')}><XIcon aria-hidden="true" /></button>
      </div>
      <div className="panel-body">
        {panel === 'tools' && (
          <>
            <p className="panel-lede">{t('editorV3.tools.lede')}</p>
            <div className="panel-section-label">{t('editorV3.tools.maybeUseful')}</div>
            <ToolRow icon={Minimize2Icon} title={t('editorV3.tools.compress')} sub={t('editorV3.tools.compressSub')} onClick={() => onPanelChange('compress')} />
            <div className="panel-section-label">{t('editorV3.tools.pages')}</div>
            <ToolRow icon={LayoutGridIcon} title={t('editorV3.tools.organize')} sub={t('editorV3.tools.organizeSub')} onClick={() => onModeChange('organize')} />
            <ToolRow icon={ScissorsIcon} title={t('editorV3.tools.split')} sub={t('editorV3.tools.splitSub')} onClick={() => onPanelChange('split')} />
            <ToolRow icon={CombineIcon} title={t('editorV3.tools.merge')} sub={t('editorV3.tools.mergeSub')} onClick={() => onPanelChange('merge')} />
            <div className="panel-section-label">{t('editorV3.tools.contentSecurity')}</div>
            <ToolRow
              icon={EraserIcon}
              title={t('editorV3.tools.redact')}
              sub={t('editorV3.tools.redactSub')}
              onClick={() => {
                onPanelChange('redact');
                onAnnotationToolChange('redaction');
              }}
            />
            <ToolRow icon={ShieldCheckIcon} title={t('editorV3.tools.protect')} sub={t('editorV3.tools.protectSub')} onClick={() => onPanelChange('protect')} />
            <ToolRow icon={StampIcon} title={t('editorV3.tools.watermark')} sub={t('editorV3.tools.watermarkSub')} onClick={() => onPanelChange('watermark')} />
            <ToolRow icon={ImageIcon} title={t('editorV3.tools.convert')} sub={t('editorV3.tools.convertSub')} onClick={() => onModeChange('convert')} />
            <div className="panel-section-label">{t('editorV3.tools.archiveAndData')}</div>
            <ToolRow icon={FileCheckIcon} title={t('toolbar.pdfa')} sub={t('editorV3.tools.pdfaSub')} onClick={() => onPanelChange('pdfa')} />
            <ToolRow icon={ReceiptTextIcon} title={t('toolbar.invoice')} sub={t('editorV3.tools.invoiceSub')} onClick={() => onPanelChange('invoice')} />
            <ToolRow icon={InfoIcon} title={t('toolbar.metadata')} sub={t('editorV3.tools.metadataSub')} onClick={() => onPanelChange('metadata')} />
            <div className="panel-section-label">{t('editorV3.tools.documentStatus')}</div>
            <div className="flex flex-col gap-2" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {/* Opmerkingen */}
              <div className="esign-card">
                <div className="row" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%' }}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}><MessageSquareTextIcon aria-hidden="true" style={{ width: 16, height: 16 }} />{t('editorV3.tools.comments', { count: comments.length })}</span>
                  {comments.length > 0 && (
                    <div style={{ display: 'flex', gap: 4 }}>
                      <button className="ep-fmt" style={{ width: 24, height: 24, padding: 0 }} onClick={onPrevComment} title={t('editorV3.common.previous')}><ChevronLeftIcon aria-hidden="true" style={{ width: 14, height: 14 }} /></button>
                      <button className="ep-fmt" style={{ width: 24, height: 24, padding: 0 }} onClick={onNextComment} title={t('editorV3.common.next')}><ChevronRightIcon aria-hidden="true" style={{ width: 14, height: 14 }} /></button>
                      <button className="ep-fmt" style={{ width: 24, height: 24, padding: 0 }} onClick={onResolveAll} title={t('editorV3.tools.resolveAll')}><BadgeCheckIcon aria-hidden="true" style={{ width: 14, height: 14 }} /></button>
                    </div>
                  )}
                </div>
              </div>

              {/* Formuliervelden */}
              {formFields.length > 0 && (
                <div className="esign-card">
                  <div className="row" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%' }}>
                    <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}><FileTextIcon aria-hidden="true" style={{ width: 16, height: 16 }} />{t('editorV3.tools.fields', { count: formFields.length })}</span>
                    <button className="btn-primary accent" type="button" style={{ height: 24, fontSize: 10, padding: '0 8px', minHeight: 'unset', width: 'auto' }} onClick={() => { void onFormSubmit(); }}>
                      <SaveIcon aria-hidden="true" style={{ width: 12, height: 12, marginRight: 4 }} /><span>Check ({formValidationErrors.length})</span>
                    </button>
                  </div>
                </div>
              )}

              {/* Bijlagen & Lagen */}
              <div className="esign-card">
                <div className="row" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%' }}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}><LinkIcon aria-hidden="true" style={{ width: 16, height: 16 }} />{t('editorV3.tools.attachments', { count: attachments.length })}</span>
                  <button className="btn-ghost" style={{ height: 24, fontSize: 10, padding: '0 8px', minHeight: 'unset', width: 'auto' }} onClick={onAddAttachment}>
                    <span>{t('editorV3.tools.addAttachment')}</span>
                  </button>
                </div>
                {attachments.length > 0 && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 8 }}>
                    {attachments.slice(0, 4).map(attachment => (
                      <div
                        key={attachment.name}
                        style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) auto auto', gap: 6, alignItems: 'center', paddingTop: 6, borderTop: '1px solid var(--border)' }}
                      >
                        <span title={attachment.name} style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 11 }}>
                          {attachment.name}
                        </span>
                        <button className="ep-fmt" type="button" title={t('editorV3.tools.saveAttachment')} onClick={() => onExtractAttachment(attachment.name)}>
                          <DownloadIcon aria-hidden="true" />
                        </button>
                        <button className="ep-fmt" type="button" title={t('editorV3.tools.removeAttachment')} onClick={() => onRemoveAttachment(attachment.name)}>
                          <XIcon aria-hidden="true" />
                        </button>
                      </div>
                    ))}
                    {attachments.length > 4 && <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>{t('editorV3.tools.moreAttachments', { count: attachments.length - 4 })}</span>}
                  </div>
                )}
                {layers.length > 0 && (
                  <div className="row" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%', marginTop: 8, borderTop: '1px solid var(--border-color, rgba(0,0,0,0.06))', paddingTop: 8 }}>
                    <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}><LayersIcon aria-hidden="true" style={{ width: 16, height: 16 }} />{t('editorV3.tools.layers', { count: layers.length })}</span>
                    <button className="btn-ghost" style={{ height: 24, fontSize: 10, padding: '0 8px', minHeight: 'unset', width: 'auto' }} onClick={() => onShowToast(t('editorV3.tools.layersVisible', { count: Array.from(layerVisibility.values()).filter(Boolean).length }))}>
                      <span>{t('editorV3.tools.manageLayers')}</span>
                    </button>
                  </div>
                )}
              </div>
            </div>
          </>
        )}

        {panel === 'edit' && (
          <>
            <p className="panel-lede">{t('editorV3.edit.lede')}</p>
            <div className="panel-section-label">{t('editorV3.edit.formatText')}</div>
            <label className="select-wrap">
              <span className="sr-only">{t('editorV3.edit.fontLabel')}</span>
              <select
                className="select native-select"
                defaultValue="embedded"
                onChange={(event) => {
                  if (event.target.value === 'embedded') return;
                  onShowToast(t('editorV3.edit.fontHint', { font: event.target.value }));
                  event.target.value = 'embedded';
                }}
              >
                <option value="embedded">{t('editorV3.edit.fontEmbedded')}</option>
                <option value="Helvetica, Arial, sans-serif">Helvetica / Arial (Sans-Serif)</option>
                <option value="Times New Roman, Times, serif">Times New Roman / Georgia (Serif)</option>
                <option value="Courier New, Courier, monospace">Courier New / Consolas (Monospace)</option>
                <option value="Georgia, serif">Georgia (Classic Serif)</option>
                <option value="Garamond, serif">Garamond (Elegant Serif)</option>
                <option value="Verdana, sans-serif">Verdana (Readable Sans)</option>
                <option value="Calibri, sans-serif">Calibri (Office Standard)</option>
              </select>
              <ChevronDownIcon aria-hidden="true" />
            </label>
            <div className="format-grid">
              <button className="ep-fmt" onMouseDown={(event) => { event.preventDefault(); onFormatCommand('bold'); }}><BoldIcon aria-hidden="true" /></button>
              <button className="ep-fmt" onMouseDown={(event) => { event.preventDefault(); onFormatCommand('italic'); }}><ItalicIcon aria-hidden="true" /></button>
              <button className="ep-fmt" onMouseDown={(event) => { event.preventDefault(); onFormatCommand('underline'); }}><UnderlineIcon aria-hidden="true" /></button>
              <button className="ep-fmt" onMouseDown={(event) => { event.preventDefault(); onFormatCommand('strikeThrough'); }}><StrikethroughIcon aria-hidden="true" /></button>
            </div>
            <div className="panel-section-label">{t('editorV3.edit.color')}</div>
            <div className="color-row">
              {['#141414', '#0a66ff', '#dc2626', '#16a34a', '#8a8f9c'].map(color => (
                <button key={color} className="ep-color" style={{ background: color }} onMouseDown={(event) => { event.preventDefault(); onFormatCommand('foreColor', color); }} aria-label={t('editorV3.edit.colorLabel', { color })} />
              ))}
            </div>
            {LOCAL_OVERLAY_CONTROLS_ENABLED && (
              <>
                <div className="divider" />
                <div className="panel-section-label">{t('editorV3.edit.addContent')}</div>
                <button className="btn-ghost" onClick={() => { setIsInsertingText(true); setIsInsertingImage(false); onShowToast(t('editorV3.edit.clickToPlaceTextBox')); }}><span><TypeIcon aria-hidden="true" />{t('editorV3.edit.insertTextBox')}</span><TypeIcon aria-hidden="true" /></button>
                <button className="btn-ghost" onClick={() => { setIsInsertingImage(true); setIsInsertingText(false); onShowToast(t('editorV3.edit.clickToPlaceImage')); }}><span><ImageIcon aria-hidden="true" />{t('editorV3.edit.placeImage')}</span><ImageIcon aria-hidden="true" /></button>

                {(_isInsertingText || _isInsertingImage) && (
                  <div className="esign-card" style={{ marginTop: 12, border: '1px dashed var(--accent)', background: 'rgba(10,102,255,0.02)', padding: '10px 12px' }}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                      <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--accent)' }}>
                        {_isInsertingText ? t('editorV3.edit.placementModeTextBox') : t('editorV3.edit.placementModeImage')}
                      </span>
                      <span style={{ fontSize: 10, color: 'var(--text-secondary)' }}>
                        {_isInsertingText ? t('editorV3.edit.clickAnywhereTextBox') : t('editorV3.edit.clickAnywhereImage')}
                      </span>
                      <button
                        className="btn-ghost"
                        style={{ height: 26, minHeight: 'unset', width: '100%', marginTop: 4, display: 'flex', justifyContent: 'center', alignItems: 'center', fontSize: 10 }}
                        onClick={() => {
                          setIsInsertingText(false);
                          setIsInsertingImage(false);
                        }}
                      >
                        {t('editorV3.common.cancel')}
                      </button>
                    </div>
                  </div>
                )}
              </>
            )}
            {selectedAnnotation && (
              <>
                <div className="panel-section-label">{t('editorV3.edit.selection')}</div>
                <div className="esign-card">
                  <div className="row"><HighlighterIcon aria-hidden="true" />{t('editorV3.edit.annotationOnPage', { type: selectedAnnotation.type, page: selectedAnnotation.pageIndex + 1 })}</div>
                </div>
              </>
            )}
          </>
        )}

        {panel === 'convert' && (
          <>
            <div className="panel-section-label">{t('editorV3.convert.exportPdfTo')}</div>
            {/*
              The archive row is not an export format. Its tile used to call
              onOpenExport('pdf'), which is the ordinary "Save a copy" dialog:
              it wrote a plain PDF and called it PDF/A. The row now opens the
              PDF/A panel, which is the only thing in the shell that converts.
              tests/viewer-capability-entry-points.test.ts holds it there.
            */}
            {[
              { name: 'Microsoft Word', ext: 'DOCX', val: 'docx' as const },
              { name: 'Microsoft Excel', ext: 'XLSX', val: 'xlsx' as const },
              { name: 'Microsoft PowerPoint', ext: 'PPTX', val: 'pptx' as const },
              { name: t('editorV3.convert.image'), ext: 'JPG', val: 'jpeg' as const },
              { name: t('editorV3.convert.archive'), ext: 'PDF/A-2b', val: 'pdfa' as const }
            ].map((item, index) => {
              return (
                <button
                  key={item.name}
                  className={index === 0 ? 'fmt sel' : 'fmt'}
                  onClick={() => {
                    if (item.val === 'pdfa') onPanelChange('pdfa');
                    else onOpenExport(item.val);
                  }}
                >
                  <span className="radio" />
                  <span className="nm">{item.name}</span>
                  <span className="ext">{item.ext}</span>
                </button>
              );
            })}
            <button className="btn-primary accent" onClick={() => onOpenExport('docx')}><RefreshCwIcon aria-hidden="true" /><span>{t('editorV3.convert.convertToDocx')}</span></button>
            <div className="divider" />
            <div className="panel-section-label">{t('editorV3.convert.otherOptions')}</div>
            <ToolRow icon={Minimize2Icon} title={t('editorV3.tools.compress')} sub={t('editorV3.tools.compressSub')} onClick={() => onPanelChange('compress')} />
            <ToolRow icon={FileTextIcon} title={t('editorV3.convert.runOcr')} sub={t('editorV3.convert.runOcrSub')} onClick={onRunOcr} />
            <div className="panel-section-label">{t('editorV3.convert.ocrStatus')}</div>
            <div className="esign-card">
              <div className="row"><FileTextIcon aria-hidden="true" />{t('editorV3.convert.possibleScanPages', { count: scannedPageIndices.size })}</div>
              <div className="row"><BadgeCheckIcon aria-hidden="true" />{t('editorV3.convert.ocrOverlay', { state: ocrVisible ? t('editorV3.convert.overlayVisible') : t('editorV3.convert.overlayHidden') })}</div>
              <div className="row"><RulerIcon aria-hidden="true" />{t('editorV3.convert.confidenceFrom', { value: Math.round(ocrConfidenceThreshold * 100) })}</div>
            </div>
            <div className="format-grid">
              <button className="ep-fmt" type="button" onClick={() => onOcrVisibleChange(v => !v)}>{ocrVisible ? t('editorV3.convert.ocrOff') : t('editorV3.convert.ocrOn')}</button>
              <button className="ep-fmt" type="button" onClick={() => onOcrConfidenceChange(v => Math.max(0, Number((v - 0.1).toFixed(2))))}>-</button>
              <button className="ep-fmt" type="button" onClick={() => onOcrConfidenceChange(v => Math.min(1, Number((v + 0.1).toFixed(2))))}>+</button>
            </div>
            {ocrRunning && <p className="panel-lede">{t('editorV3.convert.ocrRunning')}</p>}
          </>
        )}

        {panel === 'esign' && (
          <>
            <p className="panel-lede">{t('editorV3.esign.lede')}</p>
            {/* The two lines that used to stand here -- "locally signed" and
                "PAdES compliant" -- were fixed copy on every document, signed
                or not, over a control that drew a picture of a signature. What
                the panel says now is what the two Tauri commands under it do:
                sign_pdf makes a PAdES B-B signature with a certificate the
                user supplies, and verify_signatures reports what the file
                already carries. */}
            <div className="panel-section-label">{t('editorV3.esign.signSection')}</div>
            <CertificateSignControls
              currentFilePath={currentFilePath}
              onShowToast={onShowToast}
              onSigned={() => {
                setSignedRevision(revision => revision + 1);
                onDocumentMutated?.();
              }}
            />
            <div className="panel-section-label">{t('editorV3.esign.verifySection')}</div>
            <SignatureVerifyControls signedRevision={signedRevision} contentRevision={contentRevision} />
            {LOCAL_OVERLAY_CONTROLS_ENABLED && (
              <>
                <div className="panel-section-label">{t('editorV3.esign.fillAndSign')}</div>
                <button className="btn-ghost" onClick={onOpenSignModal}><span><PenLineIcon aria-hidden="true" />{t('editorV3.esign.addSignature')}</span><PenLineIcon aria-hidden="true" /></button>
                <button className="btn-ghost" onClick={onOpenInitialsModal}><span><TypeIcon aria-hidden="true" />{t('editorV3.esign.addInitials')}</span><TypeIcon aria-hidden="true" /></button>
              </>
            )}

            {LOCAL_OVERLAY_CONTROLS_ENABLED && pendingSignature && (
              <div className="esign-card" style={{ marginTop: 12, border: '1px dashed var(--accent)', background: 'rgba(10,102,255,0.02)', padding: '10px 12px' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--accent)' }}>
                    {pendingSignature.type === 'signature' ? t('editorV3.esign.placementModeSignature') : t('editorV3.esign.placementModeInitials')}
                  </span>
                  <span style={{ fontSize: 10, color: 'var(--text-secondary)' }}>
                    {pendingSignature.type === 'signature' ? t('editorV3.esign.clickToPlaceSignature') : t('editorV3.esign.clickToPlaceInitials')}
                  </span>
                  <button
                    className="btn-ghost"
                    style={{ height: 26, minHeight: 'unset', width: '100%', marginTop: 4, display: 'flex', justifyContent: 'center', alignItems: 'center', fontSize: 10 }}
                    onClick={() => {
                      setPendingSignature(null);
                    }}
                  >
                    {t('editorV3.common.cancel')}
                  </button>
                </div>
              </div>
            )}
          </>
        )}

        {panel === 'protect' && (
          <>
            <p className="panel-lede">{t('editorV3.protect.lede')}</p>
            <div className="panel-section-label">{t('editorV3.protect.passwordProtection')}</div>
            <EncryptDecryptControls onApplied={onDocumentMutated} />
            <div className="esign-card" style={{ marginTop: 12, padding: '10px 12px', fontSize: 11, background: 'rgba(30,31,36,0.02)', border: '1px solid var(--border)' }}>
              <div style={{ fontWeight: 'bold', marginBottom: 4, color: 'var(--text-primary)' }}>{t('editorV3.protect.passwordDifference')}</div>
              <p style={{ color: 'var(--text-secondary)', lineHeight: 1.4 }}>
                <b>{t('editorV3.protect.userPasswordLabel')}</b> {t('editorV3.protect.userPasswordDesc')}
              </p>
              <p style={{ color: 'var(--text-secondary)', lineHeight: 1.4, marginTop: 6 }}>
                <b>{t('editorV3.protect.ownerPasswordLabel')}</b> {t('editorV3.protect.ownerPasswordDesc')}
              </p>
            </div>
          </>
        )}

        {panel === 'watermark' && (
          <>
            <p className="panel-lede">{t('editorV3.watermark.lede')}</p>
            <div className="panel-section-label">{t('editorV3.watermark.settings')}</div>
            <WatermarkControls onApplied={onDocumentMutated} />
          </>
        )}

        {panel === 'compress' && (
          <>
            <p className="panel-lede">{t('editorV3.compress.lede')}</p>
            <div className="panel-section-label">{t('editorV3.compress.section')}</div>
            <div className="esign-card" style={{ marginBottom: 12 }}>
              <div className="row"><HardDriveIcon aria-hidden="true" />{t('editorV3.compress.nativeOptimization')}</div>
              <div className="row"><ShieldCheckIcon aria-hidden="true" />{t('editorV3.compress.localViaTauri')}</div>
            </div>

            {compressBusy ? (
              <div style={{ marginTop: 16 }}>
                <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 6 }}>{t('editorV3.compress.compressingImages')}</div>
                <div style={{ height: 6, background: 'var(--border)', borderRadius: 3, overflow: 'hidden' }}>
                  <div style={{ height: '100%', width: `${compressProgress}%`, background: 'var(--accent)', transition: 'width 0.2s' }} />
                </div>
                <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 4, textAlign: 'right' }}>{t('editorV3.compress.percentComplete', { percent: compressProgress })}</div>
              </div>
            ) : (
              <button className="btn-primary accent" style={{ marginTop: 16 }} onClick={handleCompress} disabled={!isTauri}>
                <Minimize2Icon aria-hidden="true" />
                <span>{isTauri ? t('editorV3.compress.compressPdf') : t('editorV3.compress.desktopOnly')}</span>
              </button>
            )}
            <div className="divider" style={{ margin: '16px 0' }} />
            <button className="btn-ghost" onClick={() => onPanelChange('tools')}>{t('editorV3.compress.backToTools')}</button>
          </>
        )}

        {panel === 'split' && (
          <>
            <p className="panel-lede">{t('editorV3.split.lede')}</p>
            <div className="panel-section-label">{t('editorV3.split.method')}</div>
            {[
              { id: 'page', title: t('editorV3.split.perPageTitle'), desc: t('editorV3.split.perPageDesc') },
              { id: 'range', title: t('editorV3.split.rangeTitle'), desc: t('editorV3.split.rangeDesc') }
            ].map(item => (
              <button
                key={item.id}
                className={splitType === item.id ? 'fmt sel' : 'fmt'}
                onClick={() => setSplitType(item.id)}
                style={{ padding: '8px 12px', minHeight: 'unset', height: 'auto', marginBottom: 8, display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 2 }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span className="radio" style={{ top: 0 }} />
                  <span style={{ fontSize: 12, fontWeight: 600 }}>{item.title}</span>
                </div>
                <span style={{ fontSize: 10, color: 'var(--text-secondary)', marginLeft: 20 }}>{item.desc}</span>
              </button>
            ))}

            {splitType === 'range' && (
              <div style={{ marginTop: 12 }}>
                <span className="panel-label">{t('editorV3.split.rangesLabel')}</span>
                <input
                  type="text"
                  className="panel-input"
                  value={splitRange}
                  onChange={e => setSplitRange(e.target.value)}
                  placeholder={t('editorV3.split.rangesPlaceholder')}
                />
              </div>
            )}

            {splitBusy ? (
              <div style={{ marginTop: 16, display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: 'var(--text-secondary)' }}>
                <div className="animate-spin" style={{ width: 14, height: 14, borderRadius: '50%', border: '2px solid var(--accent)', borderTopColor: 'transparent' }} />
                {t('editorV3.split.splitting')}
              </div>
            ) : (
              <button className="btn-primary accent" style={{ marginTop: 16 }} onClick={handleSplit}>
                <ScissorsIcon aria-hidden="true" />
                <span>{t('editorV3.split.splitPdf')}</span>
              </button>
            )}
            <div className="divider" style={{ margin: '16px 0' }} />
            <button className="btn-ghost" onClick={() => onPanelChange('tools')}>{t('editorV3.split.backToTools')}</button>
          </>
        )}

        {panel === 'merge' && (
          <>
            <p className="panel-lede">{t('editorV3.merge.lede')}</p>
            <div className="panel-section-label">{t('editorV3.merge.filesToMerge')}</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 12 }}>
              {filesToMerge.map((file, idx) => (
                <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 10px', background: 'rgba(30,31,36,0.02)', border: '1px solid var(--border)', borderRadius: 6, fontSize: 12 }}>
                  <span style={{ fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 180 }}>{file.name}</span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>{file.size}</span>
                    {!file.locked && (
                      <button type="button" style={{ color: 'var(--danger)', background: 'transparent', padding: 0 }} onClick={() => setFilesToMerge(prev => prev.filter((_, i) => i !== idx))} aria-label={t('editorV3.merge.removeFile', { name: file.name })}>
                        <XIcon style={{ width: 14, height: 14 }} />
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>

            <button className="btn-ghost" style={{ marginBottom: 16 }} onClick={handleAddMergeFile} disabled={!isTauri}>
              <LinkIcon aria-hidden="true" />
              <span>{isTauri ? t('editorV3.merge.addFile') : t('editorV3.merge.desktopOnly')}</span>
            </button>

            {mergeBusy ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: 'var(--text-secondary)' }}>
                <div className="animate-spin" style={{ width: 14, height: 14, borderRadius: '50%', border: '2px solid var(--accent)', borderTopColor: 'transparent' }} />
                {t('editorV3.merge.merging')}
              </div>
            ) : (
              <button className="btn-primary accent" onClick={handleMerge} disabled={!isTauri || filesToMerge.length <= 1}>
                <CombineIcon aria-hidden="true" />
                <span>{t('editorV3.merge.mergeFiles')}</span>
              </button>
            )}
            <div className="divider" style={{ margin: '16px 0' }} />
            <button className="btn-ghost" onClick={() => onPanelChange('tools')}>{t('editorV3.merge.backToTools')}</button>
          </>
        )}

        {panel === 'pdfa' && (
          <>
            <p className="panel-lede">{t('editorV3.pdfa.lede')}</p>
            <div className="panel-section-label">{t('editorV3.pdfa.section')}</div>
            <PdfaControls />
            <div className="divider" style={{ margin: '16px 0' }} />
            <button className="btn-ghost" onClick={() => onPanelChange('tools')}>{t('editorV3.common.backToTools')}</button>
          </>
        )}

        {panel === 'metadata' && (
          <>
            <p className="panel-lede">{t('editorV3.metadata.lede')}</p>
            <div className="panel-section-label">{t('editorV3.metadata.section')}</div>
            <MetadataControls onApplied={onDocumentMutated} />
            <div className="divider" style={{ margin: '16px 0' }} />
            <button className="btn-ghost" onClick={() => onPanelChange('tools')}>{t('editorV3.common.backToTools')}</button>
          </>
        )}

        {panel === 'invoice' && (
          <>
            <p className="panel-lede">{t('editorV3.invoice.lede')}</p>
            <div className="panel-section-label">{t('editorV3.invoice.section')}</div>
            <InvoiceControls />
            <div className="divider" style={{ margin: '16px 0' }} />
            <button className="btn-ghost" onClick={() => onPanelChange('tools')}>{t('editorV3.common.backToTools')}</button>
          </>
        )}

        {panel === 'redact' && (
          <>
            <p className="panel-lede">{t('editorV3.redact.lede')}</p>

            <div className="panel-section-label">{t('editorV3.redact.modeActive')}</div>
            <div className="esign-card" style={{ marginBottom: 16, background: 'rgba(220,38,38,0.02)', border: '1px solid rgba(220,38,38,0.2)' }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, fontSize: 11, color: 'var(--danger)' }}>
                <EraserIcon style={{ width: 16, height: 16, flexShrink: 0, marginTop: 1 }} />
                <div>
                  {t('editorV3.redact.dragHint')}
                </div>
              </div>
            </div>

            <div className="panel-section-label">{t('editorV3.redact.searchAndRedact')}</div>
            <div style={{ display: 'flex', gap: 6, marginBottom: 16 }}>
              <input
                type="text"
                className="panel-input"
                style={{ marginBottom: 0 }}
                placeholder={t('editorV3.redact.searchPlaceholder')}
                value={redactSearchQuery}
                onChange={e => setRedactSearchQuery(e.target.value)}
              />
              <button className="btn-ghost" style={{ padding: '0 10px', height: 34, minHeight: 'unset', width: 'auto' }} onClick={() => { void handleTextRedactSearch(); }} disabled={redactSearchBusy || !redactSearchQuery.trim()}>
                {redactSearchBusy ? '...' : t('editorV3.redact.mark')}
              </button>
            </div>

            {redactions.length > 0 ? (
              <div style={{ marginBottom: 16 }}>
                <div className="panel-section-label">{t('editorV3.redact.draftRedactions', { count: redactions.length })}</div>
                <button className="btn-primary accent" type="button" style={{ width: '100%', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 6, background: 'var(--danger)', color: '#fff' }} onClick={() => { void handleApplyRedactions(); }} disabled={redactApplyBusy}>
                  <EraserIcon aria-hidden="true" style={{ width: 14, height: 14 }} />
                  <span>{redactApplyBusy ? t('editorV3.redact.applying') : t('editorV3.redact.applyPermanently')}</span>
                </button>
              </div>
            ) : (
              <div style={{ fontSize: 11, color: 'var(--text-muted)', textAlign: 'center', padding: '12px 0', border: '1px dashed var(--border)', borderRadius: 6, marginBottom: 16 }}>
                {t('editorV3.redact.noActiveMarkings')}
              </div>
            )}
            <div className="divider" style={{ margin: '16px 0' }} />
            <button
              className="btn-ghost"
              onClick={() => {
                onAnnotationToolChange(null);
                onPanelChange('tools');
              }}
            >
              {t('editorV3.redact.backToTools')}
            </button>
          </>
        )}
      </div>
    </aside>
  );
}

function ToolRow({
  icon: Icon,
  title,
  sub,
  tag,
  onClick,
}: {
  icon: typeof FileTextIcon;
  title: string;
  sub: string;
  tag?: string;
  onClick: () => void;
}) {
  return (
    <button className="tool-row" onClick={onClick}>
      <span className="ic"><Icon aria-hidden="true" /></span>
      <span className="tx"><b>{title}</b><span>{sub}</span></span>
      {tag && <span className="tag">{tag}</span>}
    </button>
  );
}

function EditorV3ToolRail({
  activeTool,
  moreOpen,
  commentsCount,
  onToolSelect,
  onMoreTool,
}: {
  activeTool: RailTool;
  moreOpen: boolean;
  commentsCount: number;
  onToolSelect: (tool: RailTool) => void;
  onMoreTool: (tool: MoreTool) => void;
}) {
  const { t } = useTranslation();
  return (
    <>
      <div className="toolrail" role="toolbar" aria-label={t('editorV3.rail.tools')}>
        <RailButton tool="select" activeTool={activeTool} label={t('editorV3.rail.select')} icon={MousePointer2Icon} onToolSelect={onToolSelect} />
        <RailButton tool="hand" activeTool={activeTool} label={t('editorV3.rail.hand')} icon={HandIcon} onToolSelect={onToolSelect} />
        <div className="rail-sep" />
        <RailButton tool="comment" activeTool={activeTool} label={t('editorV3.rail.comment')} icon={MessageSquareTextIcon} onToolSelect={onToolSelect} badge={commentsCount} />
        <RailButton tool="highlight" activeTool={activeTool} label={t('editorV3.rail.highlight')} icon={HighlighterIcon} onToolSelect={onToolSelect} caret />
        <RailButton tool="draw" activeTool={activeTool} label={t('editorV3.rail.draw')} icon={PencilLineIcon} onToolSelect={onToolSelect} caret />
        <RailButton tool="text" activeTool={activeTool} label={t('editorV3.rail.addText')} icon={TypeIcon} onToolSelect={onToolSelect} />
        <RailButton tool="sign" activeTool={activeTool} label={t('editorV3.rail.fillAndSign')} icon={SignatureIcon} onToolSelect={onToolSelect} />
        <div className="rail-sep" />
        <RailButton tool="more" activeTool={moreOpen ? 'more' : activeTool} label={t('editorV3.rail.more')} icon={MoreHorizontalIcon} onToolSelect={onToolSelect} />
      </div>
      {moreOpen && (
        <div className="more-pop show">
          <button className="more-item" onClick={() => onMoreTool('strikeout')} data-testid="annotation-tool-strikeout"><StrikethroughIcon aria-hidden="true" />{t('editorV3.rail.strikeText')}</button>
          <button className="more-item" onClick={() => onMoreTool('underline')} data-testid="annotation-tool-underline"><UnderlineIcon aria-hidden="true" />{t('editorV3.rail.underlineText')}</button>
          <button className="more-item" onClick={() => onMoreTool('attachment')} data-testid="annotation-tool-attachment"><LinkIcon aria-hidden="true" />{t('editorV3.rail.addAttachment')}</button>
        </div>
      )}
    </>
  );
}

function RailButton({
  tool,
  activeTool,
  label,
  icon: Icon,
  onToolSelect,
  caret,
  badge,
}: {
  tool: RailTool;
  activeTool: RailTool;
  label: string;
  icon: typeof MousePointer2Icon;
  onToolSelect: (tool: RailTool) => void;
  caret?: boolean;
  badge?: number;
}) {
  return (
    <button className={activeTool === tool ? 'rail-btn active' : 'rail-btn'} data-tip={label} onClick={() => onToolSelect(tool)} aria-label={label}>
      <Icon aria-hidden="true" />
      {caret && <span className="caret" />}
      {!!badge && <span className="rail-badge">{badge}</span>}
    </button>
  );
}

/** The outline as a flat list, each entry carrying its nesting depth. */
function flattenOutline(nodes: OutlineNode[], depth = 0): { node: OutlineNode; depth: number }[] {
  const out: { node: OutlineNode; depth: number }[] = [];
  for (const node of nodes) {
    out.push({ node, depth });
    if (node.children.length > 0) out.push(...flattenOutline(node.children, depth + 1));
  }
  return out;
}

function V3Thumbnails({
  open,
  thumbnails,
  pageLabels,
  pageCount,
  currentPage,
  outline,
  onPageSelect,
  onReorderPages,
}: {
  open: boolean;
  thumbnails: Map<number, string>;
  pageLabels: string[];
  pageCount: number;
  currentPage: number;
  outline: OutlineNode[];
  onPageSelect: (page: number) => void;
  onReorderPages?: (newOrder: number[]) => Promise<void>;
}) {
  const { t } = useTranslation();
  const dragSrcIndex = useRef<number | null>(null);
  const [tab, setTab] = useState<'pages' | 'outline'>('pages');
  // A document without an outline has one view, and the tab bar stays away.
  const showOutline = tab === 'outline' && outline.length > 0;

  function handleDrop(dropIndex: number) {
    const src = dragSrcIndex.current;
    if (src === null || src === dropIndex) return;
    const order = Array.from({ length: pageCount }, (_, i) => i);
    order.splice(src, 1);
    order.splice(dropIndex, 0, src);
    void onReorderPages?.(order);
    dragSrcIndex.current = null;
  }

  return (
    <aside className={open ? 'thumbs open' : 'thumbs'}>
      {/* Two views over the same navigation: page thumbnails, and the outline
          the backend already returns. `get_outline` has been fetched on every
          open since the v3 shell landed and its result was passed down and
          never drawn -- the only bookmarks panel lived in a rail nothing
          renders. The tab appears only for a document that has an outline. */}
      <div className="thumbs-head">
        {outline.length > 0 ? (
          <div className="thumbs-tabs">
            <button
              type="button"
              className={tab === 'pages' ? 'thumbs-tab active' : 'thumbs-tab'}
              onClick={() => { setTab('pages'); }}
            >
              {t('editorV3.thumbnails.pages')}
            </button>
            <button
              type="button"
              className={tab === 'outline' ? 'thumbs-tab active' : 'thumbs-tab'}
              onClick={() => { setTab('outline'); }}
            >
              {t('editorV3.thumbnails.bookmarks')}
            </button>
          </div>
        ) : (
          t('editorV3.thumbnails.pages')
        )}
      </div>
      {showOutline ? (
        <div className="thumbs-body outline-body">
          {flattenOutline(outline).map((entry, index) => (
            <button
              key={`${entry.node.title}-${entry.node.pageIndex}-${index}`}
              type="button"
              data-testid="v3-outline-item"
              className={entry.node.pageIndex === currentPage ? 'outline-item active' : 'outline-item'}
              style={{ paddingLeft: 8 + entry.depth * 10 }}
              onClick={() => onPageSelect(entry.node.pageIndex)}
              title={entry.node.title}
            >
              <BookmarkIcon aria-hidden="true" />
              <span className="outline-title">{entry.node.title}</span>
            </button>
          ))}
        </div>
      ) : (
        <div className="thumbs-body">
          {Array.from({ length: pageCount }, (_, index) => {
            const src = thumbnails.get(index);
            return (
              <button
                key={index}
                className={index === currentPage ? 'thumb active' : 'thumb'}
                onClick={() => onPageSelect(index)}
                draggable={!!onReorderPages}
                onDragStart={() => { dragSrcIndex.current = index; }}
                onDragOver={(e) => { e.preventDefault(); }}
                onDrop={() => handleDrop(index)}
              >
                <div className="thumb-img">{src && <img src={src} alt={t('editorV3.thumbnails.pageAlt', { page: index + 1 })} />}</div>
                <div className="thumb-label">{pageLabels[index] || index + 1}</div>
              </button>
            );
          })}
        </div>
      )}
    </aside>
  );
}

function EncryptDecryptControls({ onApplied }: { onApplied?: () => void }) {
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
      const { invokeCommand: invoke } = await import('../../lib/commandBridge');
      await invoke('encrypt_pdf', { userPassword, ownerPassword, outputPath: path });
      update(taskId, { status: 'done', label: t('tasks.encryptDone') });
      setUserPassword('');
      setOwnerPassword('');
      onApplied?.();
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
      const { invokeCommand: invoke } = await import('../../lib/commandBridge');
      await invoke('decrypt_pdf', { password: decryptPassword });
      update(taskId, { status: 'done', label: t('tasks.decryptDone') });
      setDecryptPassword('');
      onApplied?.();
    } catch {
      update(taskId, { status: 'error', label: t('tasks.decryptFailed') });
    }

    setBusy(false);
  }

  const inputClass = 'panel-input';
  const buttonClass = 'btn-primary accent';

  return (
    <div className="flex flex-col gap-4">
      {/* Encrypt */}
      <div className="flex flex-col gap-1">
        <span className="panel-label">{t('protect.encrypt')}</span>
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
          style={{ marginTop: 8, height: 36 }}
        >
          {t('protect.encryptBtn')}
        </button>
      </div>

      {/* Decrypt */}
      <div className="flex flex-col gap-1" style={{ marginTop: 12 }}>
        <span className="panel-label">{t('protect.decrypt')}</span>
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
          style={{ marginTop: 8, height: 36 }}
        >
          {t('protect.decryptBtn')}
        </button>
      </div>
    </div>
  );
}

/**
 * PDF/A: validate what is open, or write an archival copy of it.
 *
 * Both commands have existed in the backend since the engine landed and neither
 * had a way in outside the legacy shell, which is why the v3 shell could not
 * replace it. The conversion writes a new file rather than mutating the open
 * one: PDF/A conversion re-encodes fonts and colour spaces, and doing that in
 * place would lose the original with no way back.
 *
 * That promise is only true since the backend stopped running its own five-pass
 * pipeline over the live document. It now hands a copy of the bytes to the SDK's
 * conversion entry point and returns that pipeline's repair report, which the
 * second card below shows: a conversion that embedded no fonts, dropped an
 * attachment or tripled the file size says so instead of reporting a bare
 * "conforms".
 */
function PdfaControls() {
  const { t } = useTranslation();
  const { push, update } = useTaskQueueContext();
  const [level, setLevel] = useState('2b');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<PdfAValidationResult | null>(null);
  const [converted, setConverted] = useState<PdfAConvertResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function validatePdfaDocument(): Promise<void> {
    if (busy || !isTauri) return;
    setBusy(true);
    setError(null);
    try {
      const { invokeCommand: invoke } = await import('../../lib/commandBridge');
      setConverted(null);
      setResult(await invoke<PdfAValidationResult>('validate_pdfa'));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
    setBusy(false);
  }

  async function convertToPdfaFile(): Promise<void> {
    if (busy || !isTauri) return;
    const { save } = await import('@tauri-apps/plugin-dialog');
    const path = await save({ filters: [{ name: 'PDF', extensions: ['pdf'] }] });
    if (!path) return;
    setBusy(true);
    setError(null);
    const taskId = `pdfa-${Date.now()}`;
    push({ id: taskId, label: t('tasks.pdfaRunning'), progress: null, status: 'running' });
    try {
      const { invokeCommand: invoke } = await import('../../lib/commandBridge');
      const outcome = await invoke<PdfAConvertResult>('convert_to_pdfa', { level, outputPath: path });
      setResult(outcome.validation);
      setConverted(outcome);
      update(taskId, { status: 'done', label: t('tasks.pdfaDone') });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setConverted(null);
      update(taskId, { status: 'error', label: t('tasks.pdfaFailed') });
    }
    setBusy(false);
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-1">
        <span className="panel-label">{t('editorV3.pdfa.level')}</span>
        <select
          className="panel-input"
          data-testid="pdfa-level-select"
          value={level}
          onChange={e => { setLevel(e.target.value); }}
          aria-label={t('editorV3.pdfa.level')}
        >
          <option value="1b">PDF/A-1b</option>
          <option value="2b">PDF/A-2b</option>
          <option value="2u">PDF/A-2u</option>
          <option value="3b">PDF/A-3b</option>
        </select>
      </div>

      <button
        className="btn-ghost"
        data-testid="validate-pdfa-btn"
        onClick={() => { void validatePdfaDocument(); }}
        disabled={busy || !isTauri}
      >
        <FileCheckIcon aria-hidden="true" />
        <span>{isTauri ? t('editorV3.pdfa.validate') : t('editorV3.pdfa.desktopOnly')}</span>
      </button>

      <button
        className="btn-primary accent"
        data-testid="convert-pdfa-btn"
        onClick={() => { void convertToPdfaFile(); }}
        disabled={busy || !isTauri}
        style={{ height: 36 }}
      >
        <RefreshCwIcon aria-hidden="true" />
        <span>{t('editorV3.pdfa.convert')}</span>
      </button>

      {error !== null && (
        <p className="panel-lede" style={{ color: 'var(--danger)' }}>{error}</p>
      )}

      {result !== null && (
        <div className="esign-card" data-testid="pdfa-status" style={{ marginTop: 4 }}>
          <div className="row">
            {result.compliant ? <BadgeCheckIcon aria-hidden="true" /> : <InfoIcon aria-hidden="true" />}
            {result.compliant
              ? t('editorV3.pdfa.compliant', { level: result.conformance_level ?? level })
              : t('editorV3.pdfa.notCompliant', { errors: result.error_count, warnings: result.warning_count })}
          </div>
          {result.issues.slice(0, 5).map((issue, idx) => (
            <div key={`${issue.rule}-${idx}`} style={{ fontSize: 10, color: 'var(--text-secondary)', marginTop: 4 }}>
              <b>{issue.rule}</b> — {issue.message}
            </div>
          ))}
          {result.issues.length > 5 && (
            <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 4 }}>
              {t('editorV3.pdfa.moreIssues', { count: result.issues.length - 5 })}
            </div>
          )}
        </div>
      )}

      {converted !== null && (
        <div className="esign-card" data-testid="pdfa-convert-report" style={{ marginTop: 4 }}>
          <div className="row"><InfoIcon aria-hidden="true" />{t('editorV3.pdfa.report.title')}</div>
          <PdfaReportLine text={t('editorV3.pdfa.report.written', { path: converted.output_path })} />
          <PdfaReportLine
            text={t('editorV3.pdfa.report.size', {
              out: formatBytes(converted.output_bytes),
              in: formatBytes(converted.input_bytes),
              ratio: converted.size_ratio.toFixed(2),
              seconds: (converted.elapsed_ms / 1000).toFixed(1),
            })}
          />
          <PdfaReportLine text={t('editorV3.pdfa.report.pages', { count: converted.report.page_count })} />
          <PdfaReportLine
            text={t('editorV3.pdfa.report.fontsEmbedded', {
              embedded: converted.report.fonts_embedded,
              found: converted.report.fonts_non_embedded,
            })}
          />
          {converted.report.fonts_failed.length > 0 && (
            <PdfaReportLine
              text={t('editorV3.pdfa.report.fontsFailed', {
                fonts: converted.report.fonts_failed.slice(0, 3).join(', '),
              })}
            />
          )}
          {removedItemCount(converted) > 0 && (
            <PdfaReportLine text={t('editorV3.pdfa.report.removed', { count: removedItemCount(converted) })} />
          )}
          {converted.report.programs_subsetted > 0 && (
            <PdfaReportLine
              text={t('editorV3.pdfa.report.subset', {
                count: converted.report.programs_subsetted,
                bytes: Math.round(converted.report.subset_bytes_saved / 1024),
              })}
            />
          )}
          {converted.report.output_intent_added && (
            <PdfaReportLine text={t('editorV3.pdfa.report.outputIntent')} />
          )}
          {converted.report.warnings.slice(0, 5).map((warning, idx) => (
            <PdfaReportLine key={`warning-${idx}`} text={t('editorV3.pdfa.report.warning', { message: warning })} />
          ))}
          {converted.report.warnings.length > 5 && (
            <PdfaReportLine
              text={t('editorV3.pdfa.report.moreWarnings', { count: converted.report.warnings.length - 5 })}
            />
          )}
          <PdfaReportLine text={t('editorV3.pdfa.report.unchangedDocument')} />
        </div>
      )}
    </div>
  );
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function PdfaReportLine({ text }: { text: string }) {
  return (
    <div style={{ fontSize: 10, color: 'var(--text-secondary)', marginTop: 4 }}>{text}</div>
  );
}

/** Everything the conversion took out of the document because PDF/A forbids it. */
function removedItemCount(outcome: PdfAConvertResult): number {
  const r = outcome.report;
  return (
    r.js_actions_removed +
    r.embedded_files_removed +
    r.file_attachment_annotations_removed +
    r.long_string_fixes
  );
}

/**
 * Title and author, written into the PDF Info dictionary.
 *
 * `set_metadata` takes both as options and writes only what is not null, so the
 * two fields are applied in one call and an empty box means "leave it alone"
 * rather than "clear it".
 */
function MetadataControls({ onApplied }: { onApplied?: () => void }) {
  const { t } = useTranslation();
  const { push, update } = useTaskQueueContext();
  const [title, setTitle] = useState('');
  const [author, setAuthor] = useState('');
  const [busy, setBusy] = useState(false);

  async function applyMetadata(): Promise<void> {
    const nextTitle = title.trim();
    const nextAuthor = author.trim();
    if (busy || !isTauri || (nextTitle.length === 0 && nextAuthor.length === 0)) return;
    setBusy(true);
    const taskId = `metadata-${Date.now()}`;
    push({ id: taskId, label: t('tasks.metadataRunning'), progress: null, status: 'running' });
    try {
      const { invokeCommand: invoke } = await import('../../lib/commandBridge');
      await invoke('set_metadata', {
        title: nextTitle.length > 0 ? nextTitle : null,
        author: nextAuthor.length > 0 ? nextAuthor : null,
      });
      update(taskId, { status: 'done', label: t('tasks.metadataDone') });
      onApplied?.();
    } catch {
      update(taskId, { status: 'error', label: t('tasks.metadataFailed') });
    }
    setBusy(false);
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-1">
        <span className="panel-label">{t('editorV3.metadata.title')}</span>
        <input
          type="text"
          className="panel-input"
          value={title}
          onChange={e => { setTitle(e.target.value); }}
          aria-label={t('editorV3.metadata.title')}
        />
      </div>
      <div className="flex flex-col gap-1">
        <span className="panel-label">{t('editorV3.metadata.author')}</span>
        <input
          type="text"
          className="panel-input"
          value={author}
          onChange={e => { setAuthor(e.target.value); }}
          aria-label={t('editorV3.metadata.author')}
        />
      </div>
      <button
        className="btn-primary accent"
        onClick={() => { void applyMetadata(); }}
        disabled={busy || !isTauri || (title.trim().length === 0 && author.trim().length === 0)}
        style={{ height: 36 }}
      >
        <SaveIcon aria-hidden="true" />
        <span>{isTauri ? t('editorV3.metadata.apply') : t('editorV3.metadata.desktopOnly')}</span>
      </button>
    </div>
  );
}

/**
 * ZUGFeRD / Factur-X: read the invoice XML embedded in the PDF and check it.
 *
 * Both commands return `null` for a document that carries no invoice, which is
 * the common case and not an error -- the panel says so rather than showing an
 * empty table.
 */
function InvoiceControls() {
  const { t } = useTranslation();
  const [busy, setBusy] = useState(false);
  const [checked, setChecked] = useState(false);
  const [data, setData] = useState<InvoiceData | null>(null);
  const [validation, setValidation] = useState<InvoiceValidationResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function readEmbeddedInvoice(): Promise<void> {
    if (busy || !isTauri) return;
    setBusy(true);
    setError(null);
    try {
      const { invokeCommand: invoke } = await import('../../lib/commandBridge');
      setData(await invoke<InvoiceData | null>('extract_invoice_data'));
      setValidation(await invoke<InvoiceValidationResult | null>('validate_invoice'));
      setChecked(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
    setBusy(false);
  }

  return (
    <div className="flex flex-col gap-3">
      <button
        className="btn-primary accent"
        onClick={() => { void readEmbeddedInvoice(); }}
        disabled={busy || !isTauri}
        style={{ height: 36 }}
      >
        <ReceiptTextIcon aria-hidden="true" />
        <span>{isTauri ? t('editorV3.invoice.read') : t('editorV3.invoice.desktopOnly')}</span>
      </button>

      {error !== null && (
        <p className="panel-lede" style={{ color: 'var(--danger)' }}>{error}</p>
      )}

      {checked && data === null && error === null && (
        <p className="panel-lede">{t('editorV3.invoice.none')}</p>
      )}

      {data !== null && (
        <div className="esign-card">
          <div className="row"><ReceiptTextIcon aria-hidden="true" />{data.profile}</div>
          <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 6, display: 'flex', flexDirection: 'column', gap: 3 }}>
            <span>{t('editorV3.invoice.number', { number: data.invoice_number })}</span>
            <span>{t('editorV3.invoice.issued', { date: data.issue_date })}</span>
            <span>{t('editorV3.invoice.seller', { name: data.seller_name })}</span>
            <span>{t('editorV3.invoice.buyer', { name: data.buyer_name })}</span>
            <span>{t('editorV3.invoice.total', { total: data.grand_total, currency: data.currency })}</span>
            <span>{t('editorV3.invoice.lines', { count: data.line_items.length })}</span>
          </div>
        </div>
      )}

      {validation !== null && (
        <div className="esign-card">
          <div className="row">
            {validation.valid ? <BadgeCheckIcon aria-hidden="true" /> : <InfoIcon aria-hidden="true" />}
            {validation.valid
              ? t('editorV3.invoice.valid', { profile: validation.profile })
              : t('editorV3.invoice.invalid', { errors: validation.error_count, warnings: validation.warning_count })}
          </div>
          {validation.issues.slice(0, 5).map((issue, idx) => (
            <div key={`${issue.rule}-${idx}`} style={{ fontSize: 10, color: 'var(--text-secondary)', marginTop: 4 }}>
              <b>{issue.rule}</b> — {issue.message}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * Signing a document with a certificate the user supplies.
 *
 * This is `sign_pdf`: a PKCS#12 file (.p12/.pfx) plus its password, an
 * optional reason, and an output path chosen in the native save dialog. The
 * backend produces a PAdES B-B signature -- the certificate over the whole
 * file, with no timestamp token -- and then reopens the signed bytes as the
 * active document, which is why `onSigned` both re-checks the signatures and
 * tells the shell the document changed.
 *
 * The password is state and nothing more: it goes to the command and never
 * into a toast, a task label or a log line.
 */
function CertificateSignControls({
  currentFilePath,
  onShowToast,
  onSigned,
}: {
  currentFilePath: string | null;
  onShowToast: (message: string) => void;
  onSigned: () => void;
}) {
  const { t } = useTranslation();
  const { push, update } = useTaskQueueContext();
  const [certPath, setCertPath] = useState<string | null>(null);
  const [password, setPassword] = useState('');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);

  const certName = certPath === null ? null : (certPath.split(/[\\/]/).filter(Boolean).pop() ?? certPath);
  const ready = certPath !== null && password.length > 0 && !busy && isTauri;

  async function chooseCertificate(): Promise<void> {
    if (!isTauri) return;
    const { open } = await import('@tauri-apps/plugin-dialog');
    const picked = await open({
      title: t('editorV3.esign.chooseCertificate'),
      multiple: false,
      filters: [{ name: 'PKCS#12', extensions: ['p12', 'pfx'] }],
    });
    if (typeof picked === 'string') setCertPath(picked);
  }

  async function signDocument(): Promise<void> {
    if (busy || !isTauri) return;
    if (certPath === null || password.length === 0) {
      onShowToast(t('editorV3.esign.signNeedsCertificate'));
      return;
    }
    setBusy(true);
    const taskId = `sign-${Date.now()}`;
    try {
      const [{ save }, { invokeCommand: invoke }] = await Promise.all([
        import('@tauri-apps/plugin-dialog'),
        import('../../lib/commandBridge'),
      ]);
      const defaultName = currentFilePath !== null
        ? (currentFilePath.split(/[\\/]/).filter(Boolean).pop() ?? 'document.pdf').replace(/\.pdf$/i, '-signed.pdf')
        : 'signed.pdf';
      const outputPath = await save({
        title: t('editorV3.esign.sign'),
        defaultPath: defaultName,
        filters: [{ name: 'PDF', extensions: ['pdf'] }],
      });
      if (outputPath === null) return;

      push({ id: taskId, label: t('tasks.signRunning'), progress: null, status: 'running' });
      await invoke('sign_pdf', { certPath, password, reason, outputPath });
      update(taskId, { status: 'done', label: t('tasks.signDone') });
      const savedName = outputPath.split(/[\\/]/).filter(Boolean).pop() ?? outputPath;
      onShowToast(t('editorV3.esign.signSaved', { name: savedName }));
      onSigned();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      update(taskId, { status: 'error', label: t('tasks.signFailed') });
      onShowToast(t('editorV3.esign.signFailed', { message }));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <p className="panel-lede">{t('editorV3.esign.padesLevel')}</p>

      <span className="panel-label">{t('editorV3.esign.certificate')}</span>
      <button
        className="btn-ghost"
        data-testid="sign-cert-pick"
        type="button"
        onClick={() => { void chooseCertificate(); }}
        disabled={!isTauri}
        title={certPath ?? undefined}
      >
        <span><ShieldCheckIcon aria-hidden="true" />{certName ?? t('editorV3.esign.certificateNone')}</span>
      </button>

      <input
        className="panel-input"
        data-testid="sign-cert-password"
        type="password"
        value={password}
        onChange={event => { setPassword(event.target.value); }}
        placeholder={t('editorV3.esign.certificatePassword')}
        aria-label={t('editorV3.esign.certificatePassword')}
        disabled={!isTauri}
      />

      <input
        className="panel-input"
        data-testid="sign-reason"
        type="text"
        value={reason}
        onChange={event => { setReason(event.target.value); }}
        placeholder={t('editorV3.esign.reasonPlaceholder')}
        aria-label={t('editorV3.esign.reason')}
        disabled={!isTauri}
      />

      <button
        className="btn-primary accent"
        data-testid="sign-with-certificate"
        type="button"
        onClick={() => { void signDocument(); }}
        disabled={!ready}
        style={{ height: 36 }}
      >
        {busy ? t('editorV3.esign.signing') : isTauri ? t('editorV3.esign.sign') : t('editorV3.esign.desktopOnly')}
      </button>
    </div>
  );
}

/**
 * What the document's signatures actually say.
 *
 * `verify_signatures` returns one entry per signature field with signer,
 * timestamp and verification status; an empty list means the file is unsigned.
 *
 * Two kinds of entry come back and they do not mean the same thing. An author
 * signature attests to the content, and the text writer refuses to edit over
 * one (#400). A usage-rights signature (`/Perms /UR3`) grants Reader features
 * instead, so the writer does edit over it — and destroys it doing so. Shown as
 * one entry each, this panel reported extended rights the app had just broken
 * (#466), so a usage-rights entry says what it is and, once the edit has landed,
 * that the rights are gone.
 *
 * "Landed" is `contentRevision`, the app's own count of edits to this document,
 * and not anything the validator says. `pdf-sign` cannot read the CMS in an
 * Adobe `/UR3` signature at all (#469), so its verdict is the same sentence
 * before and after the edit — false on a Reader-enabled file nobody has
 * touched, and no different once the rights are actually gone. What the app can
 * stand behind is what it did itself.
 *
 * `signedRevision` moves when the panel above signs the document, and
 * `contentRevision` on every edit. The answer on screen was true about the file
 * as it was a moment ago, so it is re-asked rather than left standing.
 */
function SignatureVerifyControls({
  signedRevision = 0,
  contentRevision = 0,
}: {
  signedRevision?: number;
  contentRevision?: number;
}) {
  const { t } = useTranslation();
  const [busy, setBusy] = useState(false);
  const [checked, setChecked] = useState(false);
  const [results, setResults] = useState<SignatureVerifyResult[]>([]);
  const [error, setError] = useState<string | null>(null);

  async function verifyDocumentSignatures(): Promise<void> {
    if (busy || !isTauri) return;
    setBusy(true);
    setError(null);
    try {
      const { invokeCommand: invoke } = await import('../../lib/commandBridge');
      setResults(await invoke<SignatureVerifyResult[]>('verify_signatures'));
      setChecked(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
    setBusy(false);
  }

  useEffect(() => {
    if (signedRevision === 0) return;
    void verifyDocumentSignatures();
    // The counter is the trigger; re-running on the function identity would
    // re-verify on every render of the panel.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signedRevision]);

  // An edit is what invalidates a usage-rights signature, so a checked answer
  // is stale the moment one lands. Only for an answer already on screen: the
  // panel does not start asking the backend because someone typed.
  useEffect(() => {
    if (!checked) return;
    void verifyDocumentSignatures();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contentRevision]);

  return (
    <div className="flex flex-col gap-3">
      <button
        className="btn-ghost"
        onClick={() => { void verifyDocumentSignatures(); }}
        disabled={busy || !isTauri}
      >
        <ShieldCheckIcon aria-hidden="true" />
        <span>{isTauri ? t('editorV3.esign.verify') : t('editorV3.esign.desktopOnly')}</span>
      </button>

      {error !== null && (
        <p className="panel-lede" style={{ color: 'var(--danger)' }}>{error}</p>
      )}

      {checked && results.length === 0 && error === null && (
        <p className="panel-lede">{t('editorV3.esign.unsigned')}</p>
      )}

      {results.map((result, idx) => (
        <div
          className="esign-card"
          key={`${result.field_name}-${idx}`}
          data-testid={result.usage_rights ? 'usage-rights-entry' : 'signature-entry'}
          data-usage-rights={result.usage_rights}
          data-valid={result.valid}
        >
          <div className="row">
            {result.valid ? <BadgeCheckIcon aria-hidden="true" /> : <InfoIcon aria-hidden="true" />}
            {result.usage_rights
              ? t('editorV3.esign.usageRights')
              : (result.signer ?? result.field_name)}
          </div>
          <div style={{ fontSize: 10, color: 'var(--text-secondary)', marginTop: 4 }}>
            {result.usage_rights && contentRevision > 0
              ? t('editorV3.esign.usageRightsInvalidated')
              : `${result.status}${result.timestamp !== null ? ` — ${result.timestamp}` : ''}`}
          </div>
        </div>
      ))}
    </div>
  );
}

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
      const { invokeCommand: invoke } = await import('../../lib/commandBridge');
      await invoke('add_watermark', { text: trimmed, opacity });
      update(taskId, { status: 'done', label: t('tasks.watermarkDone') });
      onApplied?.();
    } catch {
      update(taskId, { status: 'error', label: t('tasks.watermarkFailed') });
    }
    setBusy(false);
  }

  const inputClass = 'panel-input';
  const buttonClass = 'btn-primary accent';

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
      <div className="flex flex-col gap-1">
        <span className="panel-label">
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
        style={{ marginTop: 8, height: 36 }}
      >
        {t('rightPanel.watermarkApply')}
      </button>
    </div>
  );
}
