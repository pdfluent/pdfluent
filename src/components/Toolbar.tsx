// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary and confidential.
// Free for personal, non-commercial use.
// Commercial use requires a valid license.
// See https://pdfluent.com/license for terms.
import {
  CircleIcon,
  ChevronsLeftIcon,
  ChevronsRightIcon,
  ChevronLeftIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  ChevronUpIcon,
  CropIcon,
  CopyIcon,
  EllipsisIcon,
  FolderOpenIcon,
  FileStackIcon,
  HighlighterIcon,
  InfoIcon,
  MessageSquareIcon,
  MailIcon,
  PanelLeftIcon,
  PanelRightIcon,
  PencilLineIcon,
  PenToolIcon,
  RotateCcwIcon,
  RotateCwIcon,
  ScissorsIcon,
  SlashIcon,
  SquareIcon,
  PrinterIcon,
  SearchIcon,
  Share2Icon,
  TextCursorInputIcon,
  WaypointsIcon,
  ZoomInIcon,
  ZoomOutIcon,
  SignatureIcon,
  Trash2Icon,
  Undo2Icon,
  XIcon,
  Redo2Icon,
} from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";

interface ToolbarProps {
  appName: string;
  onOpenFile: () => void;
  onCloseFile: () => void;
  onUndo: () => void;
  onRedo: () => void;
  canUndo: boolean;
  canRedo: boolean;
  recentFiles: string[];
  onOpenRecentFile: (path: string) => void;
  onClearRecentFiles: () => void;
  sidebarVisible: boolean;
  onToggleSidebar: () => void;
  filePath: string | null;
  currentPage: number;
  pageCount: number;
  scale: number;
  viewMode: "single" | "continuous";
  annotationTool:
    | "none"
    | "highlight"
    | "comment"
    | "free_text"
    | "stamp"
    | "pen"
    | "underline"
    | "strikeout"
    | "callout"
    | "measurement"
    | "rectangle"
    | "circle"
    | "line"
    | "arrow";
  highlightColor: "yellow" | "green" | "blue" | "pink";
  annotationSaving: boolean;
  signing: boolean;
  checkingUpdates: boolean;
  ocrProcessing: boolean;
  textEditorEnabled: boolean;
  networkMode: "offline" | "online";
  onGoToPage: (page: number) => void;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onZoomReset: () => void;
  onFitWidth: () => void;
  onViewModeChange: (mode: "single" | "continuous") => void;
  onAnnotationToolChange: (
    tool:
      | "none"
      | "highlight"
      | "comment"
      | "free_text"
      | "stamp"
      | "pen"
      | "underline"
      | "strikeout"
      | "callout"
      | "measurement"
      | "rectangle"
      | "circle"
      | "line"
      | "arrow",
  ) => void;
  onHighlightColorChange: (color: "yellow" | "green" | "blue" | "pink") => void;
  onSignDocument: () => Promise<void>;
  onRotatePageClockwise: () => void;
  onRotatePageCounterClockwise: () => void;
  onRotateAllPages: () => void;
  onDeletePage: () => void;
  onDuplicatePage: () => void;
  onExtractPage: () => void;
  onCropPage: () => void;
  onInsertBlankPage: () => void;
  onReplaceCurrentPage: () => void;
  onPrintDocument: () => void;
  onSplitPdf: () => void;
  onMergePdfs: () => void;
  onToggleTextEditor: () => void;
  onToggleNetworkMode: () => void;
  onCheckForUpdates: () => void;
  onExportEncryptedCopy: () => void;
  onImportEncryptedCopy: () => void;
  onAddImage: () => void;
  onRemoveImageArea: () => void;
  onReplaceImageArea: () => void;
  onRedactPage: () => void;
  onAddWatermark: () => void;
  onAddHeaderFooter: () => void;
  onExportDocx: () => void;
  onExportXlsx: () => void;
  onExportPptx: () => void;
  onExportImages: () => void;
  onCreatePdfFromImages: () => void;
  onRunOcr: () => void;
  onEnhanceScanForOcr: () => void;
  onProtectPdf: () => void;
  onValidatePdfA: () => void;
  onGeneratePdfA: () => void;
  onValidatePdfX: () => void;
  onGeneratePdfX: () => void;
  onRunAccessibilityAssistant: () => void;
  onVerifySignatures: () => void;
  onManageBookmarksOutlines: () => void;
  onManageDocumentLinks: () => void;
  onManageAttachments: () => void;
  onExportDocumentStructure: () => void;
  onRunESignRequest: () => void;
  onSendESignReminder: () => void;
  onManageESignTemplates: () => void;
  onShowESignStatus: () => void;
  onConfigureTeamBackend: () => void;
  onManageLicensesAndPolicies: () => void;
  onRunStorageSyncEngine: () => void;
  onManageIntegrations: () => void;
  onConfigureApiProduct: () => void;
  onExportSiemAudit: () => void;
  onComparePdfFiles: () => void;
  onOptimizePdf: () => void;
  adminConsoleOpen: boolean;
  onConfigureByosStorage: () => void;
  onConfigureManagedStorage: () => void;
  onConfigureSso: () => void;
  onToggleAdminConsole: () => void;
  onRunBatchProcessing: () => void;
  onConfigureBranding: () => void;
  onCreateApiKey: () => void;
  onExportAuditLog: () => void;
  onExportDebugBundle: () => void;
  searchQuery: string;
  searchResultCount: number;
  searchResultLabel: string;
  searchBusy: boolean;
  formFieldCount: number;
  formPanelVisible: boolean;
  commentThreadCount: number;
  commentsPanelVisible: boolean;
  onToggleFormPanel: () => void;
  onToggleCommentsPanel: () => void;
  onExportCommentsXfdf: () => void;
  onExportCommentsFdf: () => void;
  onSearchQueryChange: (query: string) => void;
  onSearchPrevious: () => void;
  onSearchNext: () => void;
  onCopyPageText: () => void;
  onCopyDocumentText: () => void;
  onFindReplacePage: () => void;
  onFindReplaceDocument: () => void;
  onAddFormField: () => void;
  onOpenSettings: () => void;
}

function iconButton(
  icon: ReactNode,
  label: string,
  onClick?: () => void,
  disabled = false,
  active = false,
) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={label}
      aria-label={label}
      disabled={disabled}
      className="pf-btn"
      style={active ? { background: "rgba(0,0,0,0.08)" } : undefined}
    >
      {icon}
    </button>
  );
}

const highlightSwatches = {
  yellow: "#f9dd5f",
  green: "#90d676",
  blue: "#86b6ff",
  pink: "#f3a2cb",
} satisfies Record<"yellow" | "green" | "blue" | "pink", string>;

export function Toolbar(props: ToolbarProps) {
  const {
    appName,
    onOpenFile,
    onCloseFile,
    onUndo,
    onRedo,
    canUndo,
    canRedo,
    recentFiles: _recentFiles,
    onOpenRecentFile: _onOpenRecentFile,
    onClearRecentFiles: _onClearRecentFiles,
    sidebarVisible,
    onToggleSidebar,
    filePath,
    currentPage,
    pageCount,
    scale,
    onGoToPage,
    viewMode,
    annotationTool,
    highlightColor,
    annotationSaving,
    signing,
    checkingUpdates,
    ocrProcessing,
    textEditorEnabled,
    onZoomIn,
    onZoomOut,
    onZoomReset,
    onFitWidth,
    onViewModeChange,
    onAnnotationToolChange,
    onHighlightColorChange,
    onToggleTextEditor,
    onToggleNetworkMode,
    onRotatePageClockwise,
    onRotatePageCounterClockwise,
    onRotateAllPages,
    onDeletePage,
    onDuplicatePage,
    onExtractPage,
    onCropPage,
    onInsertBlankPage,
    onReplaceCurrentPage,
    onPrintDocument,
    onSplitPdf,
    onMergePdfs,
    onSignDocument,
    onCheckForUpdates: _onCheckForUpdates,
    onExportEncryptedCopy,
    onImportEncryptedCopy,
    onAddImage,
    onRemoveImageArea,
    onReplaceImageArea,
    onRedactPage,
    onAddWatermark,
    onAddHeaderFooter,
    onExportDocx,
    onExportXlsx,
    onExportPptx,
    onExportImages,
    onCreatePdfFromImages,
    onRunOcr,
    onEnhanceScanForOcr,
    onProtectPdf,
    onValidatePdfA,
    onGeneratePdfA,
    onValidatePdfX,
    onGeneratePdfX,
    onRunAccessibilityAssistant,
    onVerifySignatures,
    onManageBookmarksOutlines,
    onManageDocumentLinks,
    onManageAttachments,
    onExportDocumentStructure,
    onRunESignRequest,
    onSendESignReminder,
    onManageESignTemplates,
    onShowESignStatus,
    onConfigureTeamBackend,
    onConfigureSso,
    onManageLicensesAndPolicies,
    onRunBatchProcessing,
    onRunStorageSyncEngine,
    onManageIntegrations,
    onConfigureApiProduct,
    onCreateApiKey,
    onExportSiemAudit,
    onComparePdfFiles,
    onOptimizePdf,
    onConfigureByosStorage,
    onConfigureManagedStorage,
    onToggleAdminConsole,
    onExportAuditLog,
    onExportDebugBundle,
    searchQuery,
    searchResultCount,
    searchResultLabel,
    searchBusy,
    formFieldCount,
    formPanelVisible,
    commentThreadCount,
    commentsPanelVisible,
    onToggleFormPanel,
    onToggleCommentsPanel,
    onExportCommentsXfdf,
    onExportCommentsFdf,
    onSearchQueryChange,
    onSearchPrevious,
    onSearchNext,
    onCopyPageText,
    onCopyDocumentText,
    onFindReplacePage,
    onFindReplaceDocument,
    onAddFormField,
    onOpenSettings: _onOpenSettings,
  } = props;

  const fileName = filePath ? filePath.split("/").pop() : null;
  const hasDocument = Boolean(fileName && pageCount > 0);
  const isProcessing = signing || checkingUpdates || ocrProcessing || annotationSaving;
  const isAnnotation = annotationTool !== "none";
  const hasSearchQuery = searchQuery.trim().length > 0;
  const hasSearchResults = hasSearchQuery && searchResultCount > 0;
  const [pageInput, setPageInput] = useState(() => String(currentPage + 1));
  const zoomLabel = `${Math.round(scale * 100)}%`;

  useEffect(() => {
    setPageInput(String(currentPage + 1));
  }, [currentPage, filePath]);

  function submitPageInput(): void {
    if (!hasDocument) {
      return;
    }

    const nextPage = Number.parseInt(pageInput, 10);
    if (!Number.isFinite(nextPage)) {
      setPageInput(String(currentPage + 1));
      return;
    }

    onGoToPage(nextPage - 1);
  }

  return (
    <header className="toolbar">
      <div className="toolbar-left">
        {hasDocument && (
          <div className="toolbar-brand">
            <div className="toolbar-logo-mark" />
          </div>
        )}
        {!hasDocument && (
          <div className="toolbar-brand">
            <div className="toolbar-logo-mark" />
            <span className="toolbar-brand-name">{appName}</span>
          </div>
        )}
        {iconButton(
          <PanelLeftIcon />,
          "Toggle sidebar",
          onToggleSidebar,
          false,
          sidebarVisible,
        )}
        {iconButton(<FolderOpenIcon />, "Open PDF", onOpenFile)}
        {iconButton(<XIcon />, "Close PDF", onCloseFile, !hasDocument)}
        {iconButton(
          <Undo2Icon />,
          "Undo",
          onUndo,
          !hasDocument || isProcessing || !canUndo,
        )}
        {iconButton(
          <Redo2Icon />,
          "Redo",
          onRedo,
          !hasDocument || isProcessing || !canRedo,
        )}
      </div>

      <div className="toolbar-center">
        {hasDocument && fileName && (
          <span className="toolbar-filename" title={fileName}>
            {fileName}
          </span>
        )}
      </div>

      <div className="toolbar-right">
        {iconButton(<SearchIcon />, "Search", undefined, !hasDocument || isProcessing || searchBusy)}
        {iconButton(<ZoomOutIcon />, "Zoom Out", onZoomOut, !hasDocument || isProcessing)}
        <button
          type="button"
          aria-label="Actual size"
          title="Actual size"
          onClick={onZoomReset}
          disabled={!hasDocument || isProcessing}
          className="toolbar-zoom-label"
        >
          {zoomLabel}
        </button>
        {iconButton(<ZoomInIcon />, "Zoom In", onZoomIn, !hasDocument || isProcessing)}
        {iconButton(
          <ChevronsLeftIcon />,
          "First page",
          () => {
            onGoToPage(0);
          },
          !hasDocument || isProcessing || currentPage <= 0,
        )}
        {iconButton(
          <ChevronLeftIcon />,
          "Previous page",
          () => {
            onGoToPage(currentPage - 1);
          },
          !hasDocument || isProcessing || currentPage <= 0,
        )}
        <div className="toolbar-group">
          <input
            type="number"
            aria-label="Page number"
            value={pageInput}
            onChange={(event) => {
              setPageInput(event.target.value);
            }}
            onBlur={submitPageInput}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                submitPageInput();
              }
            }}
            disabled={!hasDocument || isProcessing}
            className="toolbar-page-input"
          />
          <span className="toolbar-page-total">
            / {pageCount}
          </span>
        </div>
        {iconButton(
          <ChevronRightIcon />,
          "Next page",
          () => {
            onGoToPage(currentPage + 1);
          },
          !hasDocument || isProcessing || currentPage >= pageCount - 1,
        )}
        {iconButton(
          <ChevronsRightIcon />,
          "Last page",
          () => {
            onGoToPage(pageCount - 1);
          },
          !hasDocument || isProcessing || currentPage >= pageCount - 1,
        )}
        <div className="toolbar-group">
          <button
            type="button"
            aria-label="Single page view"
            title="Single page view"
            onClick={() => {
              onViewModeChange("single");
            }}
            disabled={!hasDocument || isProcessing}
            className={`toolbar-view-btn${viewMode === "single" ? " active" : ""}`}
          >
            Single
          </button>
          <button
            type="button"
            aria-label="Continuous view"
            title="Continuous view"
            onClick={() => {
              onViewModeChange("continuous");
            }}
            disabled={!hasDocument || isProcessing}
            className={`toolbar-view-btn${viewMode === "continuous" ? " active" : ""}`}
          >
            Continuous
          </button>
        </div>
        {iconButton(
          <Share2Icon />,
          "Share",
          onExportEncryptedCopy,
          !hasDocument || isProcessing,
        )}
        {iconButton(
          <PenToolIcon />,
          "Markup",
          () => {
            onAnnotationToolChange(isAnnotation ? "none" : "highlight");
          },
          !hasDocument || isProcessing,
          isAnnotation,
        )}
        <div className="toolbar-group">
          <button
            type="button"
            aria-label="Highlight tool"
            title="Highlight tool"
            onClick={() => { onAnnotationToolChange("highlight"); }}
            disabled={!hasDocument || isProcessing}
            className={`toolbar-annot-btn${annotationTool === "highlight" ? " active" : ""}`}
          >
            <HighlighterIcon />
          </button>
          <button
            type="button"
            aria-label="Comment tool"
            title="Comment tool"
            onClick={() => { onAnnotationToolChange("comment"); }}
            disabled={!hasDocument || isProcessing}
            className={`toolbar-annot-btn${annotationTool === "comment" ? " active" : ""}`}
          >
            <MessageSquareIcon />
          </button>
          <button
            type="button"
            aria-label="Pen tool"
            title="Pen tool"
            onClick={() => { onAnnotationToolChange("pen"); }}
            disabled={!hasDocument || isProcessing}
            className={`toolbar-annot-btn${annotationTool === "pen" ? " active" : ""}`}
          >
            <PencilLineIcon />
          </button>
          <button
            type="button"
            aria-label="Rectangle tool"
            title="Rectangle tool"
            onClick={() => { onAnnotationToolChange("rectangle"); }}
            disabled={!hasDocument || isProcessing}
            className={`toolbar-annot-btn${annotationTool === "rectangle" ? " active" : ""}`}
          >
            <SquareIcon />
          </button>
          <button
            type="button"
            aria-label="Circle tool"
            title="Circle tool"
            onClick={() => { onAnnotationToolChange("circle"); }}
            disabled={!hasDocument || isProcessing}
            className={`toolbar-annot-btn${annotationTool === "circle" ? " active" : ""}`}
          >
            <CircleIcon />
          </button>
          <button
            type="button"
            aria-label="Line tool"
            title="Line tool"
            onClick={() => { onAnnotationToolChange("line"); }}
            disabled={!hasDocument || isProcessing}
            className={`toolbar-annot-btn${annotationTool === "line" ? " active" : ""}`}
          >
            <SlashIcon />
          </button>
          <button
            type="button"
            aria-label="Arrow tool"
            title="Arrow tool"
            onClick={() => { onAnnotationToolChange("arrow"); }}
            disabled={!hasDocument || isProcessing}
            className={`toolbar-annot-btn${annotationTool === "arrow" ? " active" : ""}`}
          >
            <WaypointsIcon />
          </button>
        </div>
        {annotationTool === "highlight" && (
          <div className="toolbar-group">
            {(["yellow", "green", "blue", "pink"] as const).map((color) => (
              <button
                key={color}
                type="button"
                aria-label={`Highlight color ${color}`}
                title={`Highlight color ${color}`}
                onClick={() => { onHighlightColorChange(color); }}
                disabled={!hasDocument || isProcessing}
                className={`toolbar-swatch${highlightColor === color ? " active" : ""}`}
                style={{ backgroundColor: highlightSwatches[color] }}
              />
            ))}
          </div>
        )}
        {iconButton(
          <TextCursorInputIcon />,
          "Text Edit",
          onToggleTextEditor,
          !hasDocument || isProcessing,
          textEditorEnabled,
        )}
        {iconButton(
          <SignatureIcon />,
          "Sign document",
          () => {
            void onSignDocument();
          },
          !hasDocument || isProcessing,
        )}
        {iconButton(
          <RotateCcwIcon />,
          "Rotate left",
          onRotatePageCounterClockwise,
          !hasDocument || isProcessing,
        )}
        {iconButton(
          <RotateCwIcon />,
          "Rotate",
          onRotatePageClockwise,
          !hasDocument || isProcessing,
        )}
        {iconButton(
          <Trash2Icon />,
          "Delete page",
          onDeletePage,
          !hasDocument || isProcessing,
        )}
        {iconButton(
          <CopyIcon />,
          "Duplicate page",
          onDuplicatePage,
          !hasDocument || isProcessing,
        )}
        {iconButton(
          <CopyIcon />,
          "Copy page text",
          onCopyPageText,
          !hasDocument || isProcessing,
        )}
        {iconButton(
          <ScissorsIcon />,
          "Extract page",
          onExtractPage,
          !hasDocument || isProcessing,
        )}
        {iconButton(
          <PrinterIcon />,
          "Print document",
          onPrintDocument,
          !hasDocument || isProcessing,
        )}
        {iconButton(
          <FileStackIcon />,
          "Merge PDFs",
          onMergePdfs,
          !hasDocument || isProcessing,
        )}
        {iconButton(
          <CropIcon />,
          "Fit Width",
          onFitWidth,
          !hasDocument || isProcessing,
        )}
        {iconButton(
          <PanelRightIcon />,
          "Toggle forms panel",
          onToggleFormPanel,
          formFieldCount === 0 || isProcessing,
          formPanelVisible && formFieldCount > 0,
        )}
        {iconButton(
          <MessageSquareIcon />,
          "Toggle comments panel",
          onToggleCommentsPanel,
          !hasDocument || isProcessing || commentThreadCount === 0,
          commentsPanelVisible && commentThreadCount > 0,
        )}
        {iconButton(
          <MailIcon />,
          "Export Audit Log",
          onExportAuditLog,
          !hasDocument || isProcessing,
        )}
        {iconButton(
          <InfoIcon />,
          "Export debug bundle",
          onExportDebugBundle,
          isProcessing,
        )}
        <details className="relative" style={{ WebkitAppRegion: "no-drag" } as React.CSSProperties}>
          <summary
            className="pf-btn"
            aria-label="More tools"
            title="More tools"
            style={!hasDocument || isProcessing ? { opacity: 0.35, pointerEvents: "none" } : undefined}
          >
            <EllipsisIcon />
          </summary>
          <div className="toolbar-dropdown">
            <button
              type="button"
              className="toolbar-dropdown-item"
              onClick={onComparePdfFiles}
              disabled={!hasDocument || isProcessing}
            >
              Compare files
            </button>
            <button
              type="button"
              className="toolbar-dropdown-item"
              onClick={onOptimizePdf}
              disabled={!hasDocument || isProcessing}
            >
              Optimize PDF
            </button>
            <button
              type="button"
              className="toolbar-dropdown-item"
              onClick={onFindReplacePage}
              disabled={!hasDocument || isProcessing}
            >
              Find & replace (page)
            </button>
            <button
              type="button"
              className="toolbar-dropdown-item"
              onClick={onFindReplaceDocument}
              disabled={!hasDocument || isProcessing}
            >
              Find & replace (document)
            </button>
            <button
              type="button"
              className="toolbar-dropdown-item"
              onClick={onCopyDocumentText}
              disabled={!hasDocument || isProcessing}
            >
              Copy document text
            </button>
            <button
              type="button"
              className="toolbar-dropdown-item"
              onClick={onToggleCommentsPanel}
              disabled={!hasDocument || isProcessing}
            >
              Comments pane
            </button>
            <button
              type="button"
              className="toolbar-dropdown-item"
              onClick={onExportCommentsXfdf}
              disabled={!hasDocument || isProcessing || commentThreadCount === 0}
            >
              Export comments (XFDF)
            </button>
            <button
              type="button"
              className="toolbar-dropdown-item"
              onClick={onExportCommentsFdf}
              disabled={!hasDocument || isProcessing || commentThreadCount === 0}
            >
              Export comments (FDF)
            </button>
            <button
              type="button"
              className="toolbar-dropdown-item"
              onClick={onManageBookmarksOutlines}
              disabled={!hasDocument || isProcessing}
            >
              Bookmarks / outlines
            </button>
            <button
              type="button"
              className="toolbar-dropdown-item"
              onClick={onManageDocumentLinks}
              disabled={!hasDocument || isProcessing}
            >
              Links editor
            </button>
            <button
              type="button"
              className="toolbar-dropdown-item"
              onClick={onManageAttachments}
              disabled={!hasDocument || isProcessing}
            >
              Attachments editor
            </button>
            <button
              type="button"
              className="toolbar-dropdown-item"
              onClick={onExportDocumentStructure}
              disabled={!hasDocument || isProcessing}
            >
              Export structure
            </button>
            <button
              type="button"
              className="toolbar-dropdown-item"
              onClick={() => {
                onAnnotationToolChange("free_text");
              }}
              disabled={!hasDocument || isProcessing}
            >
              Free text annotation
            </button>
            <button
              type="button"
              className="toolbar-dropdown-item"
              onClick={() => {
                onAnnotationToolChange("stamp");
              }}
              disabled={!hasDocument || isProcessing}
            >
              Stamp annotation
            </button>
            <button
              type="button"
              className="toolbar-dropdown-item"
              onClick={() => {
                onAnnotationToolChange("underline");
              }}
              disabled={!hasDocument || isProcessing}
            >
              Underline annotation
            </button>
            <button
              type="button"
              className="toolbar-dropdown-item"
              onClick={() => {
                onAnnotationToolChange("strikeout");
              }}
              disabled={!hasDocument || isProcessing}
            >
              Strikeout annotation
            </button>
            <button
              type="button"
              className="toolbar-dropdown-item"
              onClick={() => {
                onAnnotationToolChange("callout");
              }}
              disabled={!hasDocument || isProcessing}
            >
              Callout annotation
            </button>
            <button
              type="button"
              className="toolbar-dropdown-item"
              onClick={() => {
                onAnnotationToolChange("measurement");
              }}
              disabled={!hasDocument || isProcessing}
            >
              Measurement annotation
            </button>
            <button
              type="button"
              className="toolbar-dropdown-item"
              onClick={onImportEncryptedCopy}
              disabled={!hasDocument || isProcessing}
            >
              Import encrypted copy
            </button>
            <button
              type="button"
              className="toolbar-dropdown-item"
              onClick={onAddImage}
              disabled={!hasDocument || isProcessing}
            >
              Add image
            </button>
            <button
              type="button"
              className="toolbar-dropdown-item"
              onClick={onRemoveImageArea}
              disabled={!hasDocument || isProcessing}
            >
              Remove image area
            </button>
            <button
              type="button"
              className="toolbar-dropdown-item"
              onClick={onReplaceImageArea}
              disabled={!hasDocument || isProcessing}
            >
              Replace image area
            </button>
            <button
              type="button"
              className="toolbar-dropdown-item"
              onClick={onRedactPage}
              disabled={!hasDocument || isProcessing}
            >
              Redact page
            </button>
            <button
              type="button"
              className="toolbar-dropdown-item"
              onClick={onAddWatermark}
              disabled={!hasDocument || isProcessing}
            >
              Add watermark
            </button>
            <button
              type="button"
              className="toolbar-dropdown-item"
              onClick={onAddHeaderFooter}
              disabled={!hasDocument || isProcessing}
            >
              Header/Footer & Bates
            </button>
            <button
              type="button"
              className="toolbar-dropdown-item"
              onClick={onSplitPdf}
              disabled={!hasDocument || isProcessing}
            >
              Split PDF ranges
            </button>
            <button
              type="button"
              className="toolbar-dropdown-item"
              onClick={onInsertBlankPage}
              disabled={!hasDocument || isProcessing}
            >
              Insert blank page
            </button>
            <button
              type="button"
              className="toolbar-dropdown-item"
              onClick={onReplaceCurrentPage}
              disabled={!hasDocument || isProcessing}
            >
              Replace current page
            </button>
            <button
              type="button"
              className="toolbar-dropdown-item"
              onClick={onCropPage}
              disabled={!hasDocument || isProcessing}
            >
              Crop current page
            </button>
            <button
              type="button"
              className="toolbar-dropdown-item"
              onClick={onRotateAllPages}
              disabled={!hasDocument || isProcessing}
            >
              Rotate all pages
            </button>
            <button
              type="button"
              className="toolbar-dropdown-item"
              onClick={onExportDocx}
              disabled={!hasDocument || isProcessing}
            >
              Export as DOCX
            </button>
            <button
              type="button"
              className="toolbar-dropdown-item"
              onClick={onExportXlsx}
              disabled={!hasDocument || isProcessing}
            >
              Export as XLSX
            </button>
            <button
              type="button"
              className="toolbar-dropdown-item"
              onClick={onExportPptx}
              disabled={!hasDocument || isProcessing}
            >
              Export as PPTX
            </button>
            <button
              type="button"
              className="toolbar-dropdown-item"
              onClick={onExportImages}
              disabled={!hasDocument || isProcessing}
            >
              Export as images
            </button>
            <button
              type="button"
              className="toolbar-dropdown-item"
              onClick={onAddFormField}
              disabled={!hasDocument || isProcessing}
            >
              Add form field
            </button>
            <button
              type="button"
              className="toolbar-dropdown-item"
              onClick={onCreatePdfFromImages}
              disabled={isProcessing}
            >
              Create PDF from images
            </button>
            <button
              type="button"
              className="toolbar-dropdown-item"
              onClick={onRunOcr}
              disabled={!hasDocument || isProcessing}
            >
              Run OCR
            </button>
            <button
              type="button"
              className="toolbar-dropdown-item"
              onClick={onEnhanceScanForOcr}
              disabled={!hasDocument || isProcessing}
            >
              Enhance scan + OCR
            </button>
            <button
              type="button"
              className="toolbar-dropdown-item"
              onClick={onProtectPdf}
              disabled={!hasDocument || isProcessing}
            >
              Protect PDF
            </button>
            <button
              type="button"
              className="toolbar-dropdown-item"
              onClick={onValidatePdfA}
              disabled={!hasDocument || isProcessing}
            >
              PDF/A check
            </button>
            <button
              type="button"
              className="toolbar-dropdown-item"
              onClick={onGeneratePdfA}
              disabled={!hasDocument || isProcessing}
            >
              PDF/A copy
            </button>
            <button
              type="button"
              className="toolbar-dropdown-item"
              onClick={onValidatePdfX}
              disabled={!hasDocument || isProcessing}
            >
              PDF/X check
            </button>
            <button
              type="button"
              className="toolbar-dropdown-item"
              onClick={onGeneratePdfX}
              disabled={!hasDocument || isProcessing}
            >
              PDF/X copy
            </button>
            <button
              type="button"
              className="toolbar-dropdown-item"
              onClick={onRunAccessibilityAssistant}
              disabled={!hasDocument || isProcessing}
            >
              Accessibility assistant
            </button>
            <button
              type="button"
              className="toolbar-dropdown-item"
              onClick={onVerifySignatures}
              disabled={!hasDocument || isProcessing}
            >
              Verify signatures
            </button>
            <button
              type="button"
              className="toolbar-dropdown-item"
              onClick={onRunESignRequest}
              disabled={!hasDocument || isProcessing}
            >
              Start e-sign request
            </button>
            <button
              type="button"
              className="toolbar-dropdown-item"
              onClick={onSendESignReminder}
              disabled={isProcessing}
            >
              Send e-sign reminder
            </button>
            <button
              type="button"
              className="toolbar-dropdown-item"
              onClick={onManageESignTemplates}
              disabled={isProcessing}
            >
              Manage e-sign templates
            </button>
            <button
              type="button"
              className="toolbar-dropdown-item"
              onClick={onShowESignStatus}
              disabled={isProcessing}
            >
              E-sign status
            </button>
            <button
              type="button"
              className="toolbar-dropdown-item"
              onClick={onConfigureTeamBackend}
              disabled={isProcessing}
            >
              Team backend
            </button>
            <button
              type="button"
              className="toolbar-dropdown-item"
              onClick={onConfigureSso}
              disabled={isProcessing}
            >
              Configure SSO
            </button>
            <button
              type="button"
              className="toolbar-dropdown-item"
              onClick={onManageLicensesAndPolicies}
              disabled={isProcessing}
            >
              Licenses & policies
            </button>
            <button
              type="button"
              className="toolbar-dropdown-item"
              onClick={onRunBatchProcessing}
              disabled={isProcessing}
            >
              Batch queue engine
            </button>
            <button
              type="button"
              className="toolbar-dropdown-item"
              onClick={onRunStorageSyncEngine}
              disabled={isProcessing}
            >
              Storage sync engine
            </button>
            <button
              type="button"
              className="toolbar-dropdown-item"
              onClick={onManageIntegrations}
              disabled={isProcessing}
            >
              Integrations
            </button>
            <button
              type="button"
              className="toolbar-dropdown-item"
              onClick={onConfigureApiProduct}
              disabled={isProcessing}
            >
              API product profile
            </button>
            <button
              type="button"
              className="toolbar-dropdown-item"
              onClick={onCreateApiKey}
              disabled={isProcessing}
            >
              Create API key
            </button>
            <button
              type="button"
              className="toolbar-dropdown-item"
              onClick={onExportSiemAudit}
              disabled={isProcessing}
            >
              Export SIEM audit
            </button>
            <button
              type="button"
              className="toolbar-dropdown-item"
              onClick={onConfigureByosStorage}
              disabled={isProcessing}
            >
              Configure BYOS
            </button>
            <button
              type="button"
              className="toolbar-dropdown-item"
              onClick={onConfigureManagedStorage}
              disabled={isProcessing}
            >
              Configure managed storage
            </button>
            <button
              type="button"
              className="toolbar-dropdown-item"
              onClick={onToggleAdminConsole}
              disabled={isProcessing}
            >
              Toggle admin console
            </button>
            <button
              type="button"
              className="toolbar-dropdown-item"
              onClick={onToggleNetworkMode}
              disabled={isProcessing}
            >
              Toggle network mode
            </button>
          </div>
        </details>

        <div className="toolbar-search-field">
          <SearchIcon className="search-icon" />
          <input
            type="text"
            placeholder="Search"
            disabled={!hasDocument || isProcessing}
            value={searchQuery}
            onChange={(event) => {
              onSearchQueryChange(event.target.value);
            }}
          />
        </div>
        {hasSearchQuery && (
          <span className="toolbar-search-count">
            {searchBusy ? "..." : searchResultLabel}
          </span>
        )}
        {iconButton(
          <ChevronUpIcon />,
          "Previous match",
          onSearchPrevious,
          !hasSearchResults || isProcessing || searchBusy,
        )}
        {iconButton(
          <ChevronDownIcon />,
          "Next match",
          onSearchNext,
          !hasSearchResults || isProcessing || searchBusy,
        )}
      </div>

      {isProcessing && (
        <div className="toolbar-progress">
          <div className="toolbar-progress-bar" />
        </div>
      )}
    </header>
  );
}
