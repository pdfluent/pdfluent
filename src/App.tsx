// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary and confidential.
// Free for personal, non-commercial use.
// Commercial use requires a valid license.
// See https://pdfluent.com/license for terms.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { open, save } from "@tauri-apps/plugin-dialog";
import { copyFile, exists, readFile, remove, writeFile } from "@tauri-apps/plugin-fs";
import { check as checkForUpdates } from "@tauri-apps/plugin-updater";
import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";
import { Toolbar } from "./components/Toolbar";
import { Sidebar } from "./components/Sidebar";
import { Viewer } from "./components/Viewer";
import { FormPanel } from "./components/FormPanel";
import { AdminPanel } from "./components/AdminPanel";
import { CommentsPanel } from "./components/CommentsPanel";
import {
  openPdf,
  closePdf,
  renderPage,
  runPaddleOcr,
  validateStorageProfile,
} from "./lib/tauri-api";
import type { DocumentInfo, StorageProfilePayload } from "./lib/tauri-api";
import {
  addImageToPage,
  addFormFieldToDocument,
  addOcrTextLayerToPages,
  addAnnotation,
  addHeaderFooterToDocument,
  addWatermarkToDocument,
  cropPageToRect,
  createPdfFromImages,
  duplicatePdfPage,
  comparePdfDocuments,
  extractPdfPages,
  extractDocumentText,
  extractEditableTextLines,
  splitPdf,
  insertBlankPageAfter,
  fillFormFields,
  generatePdfAReadyCopy,
  generatePdfXReadyCopy,
  generatePdfUaReadyCopy,
  getFormFields,
  mergePdfs,
  protectPdfWithPassword,
  redactPageRegions,
  removeFormFieldFromDocument,
  removeImageAreaFromPage,
  replaceImageAreaOnPage,
  replacePageWithExternalPage,
  replaceTextLine,
  replaceTextMatchesOnPage,
  removePage,
  optimizePdfDocument,
  type PdfOptimizationCustomOptions,
  type PdfOptimizationProfile,
  reorderPdfPages,
  rotatePage,
  rotateAllPages,
  signPdfWithCertificate,
  validatePdfAReadiness,
  validatePdfXReadiness,
  validatePdfUaReadiness,
  verifyPdfSignatures,
} from "./lib/pdf-manipulator";
import type {
  AnnotationPayload,
  AnnotationTool,
  CreateFormFieldPayload,
  EditableTextLine,
  FormFieldKind,
  FormFieldDefinition,
  HighlightColor,
  OcrWordBox,
  OcrPageLayerInput,
  PageRange,
  RedactionRegion,
} from "./lib/pdf-manipulator";
import { PDF } from "@libpdf/core";
import type { FieldValue } from "@libpdf/core";
import { decryptBytes, encryptBytes } from "./lib/e2ee";
import {
  appendDebugLog,
  clearDebugLogs,
  getDebugSessionId,
  listDebugLogs,
  setDebugLogContextProvider,
} from "./lib/debug-log";
import { pickFirstPdfPath } from "./lib/file-drop";
import { readNetworkMode, writeNetworkMode } from "./lib/network-mode";
import {
  buildOcrPolicy,
  normalizeManualPreprocessSteps,
  type OcrPreprocessMode,
} from "./lib/ocr-policy";
import { convertPdfToDocx, convertPdfToPptx, convertPdfToXlsx } from "./lib/docx";
import {
  addBookmarkNode,
  addDocumentLink,
  createEmptyDocumentStructureState,
  exportDocumentStructureAsJson,
  removeBookmarkNode,
  removeDocumentLink,
  summarizeDocumentStructure,
  type DocumentStructureState,
} from "./lib/document-structure";
import {
  addCommentReply,
  addCommentThread,
  exportCommentThreadsAsFdf,
  exportCommentThreadsAsXfdf,
  filterCommentThreads,
  setCommentThreadStatus,
  type CommentThread,
  type CommentThreadFilter,
  type CommentThreadStatus,
} from "./lib/comments";
import {
  addBatchExecutionReport,
  addESignReminder,
  addEnterpriseUser,
  appendTamperAuditEntry,
  completeSsoAuthSession,
  configureApiProductProfile,
  configureTeamBackend,
  connectIntegration,
  createBatchPreset,
  createSsoAuthSession,
  createESignRequest,
  createESignTemplate,
  createApiKey,
  createManagedProfile,
  disconnectIntegration,
  enqueueBatchQueueItem,
  evaluatePolicyEnforcement,
  exportTamperAuditAsSiemJsonl,
  getPendingESignRequests,
  issueLicenseSeat,
  loadEnterpriseSettings,
  managedRegions,
  markBatchQueueItemResult,
  markIntegrationSynced,
  recordBatchJob,
  recordSyncConflict,
  recordTeamBackendSync,
  removeEnterpriseUser,
  resolveSyncConflict,
  revokeLicenseSeat,
  revokeApiKey,
  rotateKeyManagementKey,
  saveEnterpriseSettings,
  setActiveStorageProfile,
  updateESignRequestStatus,
  updateBranding,
  updateEnterprisePolicies,
  updateSsoConfig,
  updateUserRole,
  upsertStorageProfile,
  verifyTamperAuditTrail,
} from "./lib/enterprise";
import type {
  EnterprisePolicies,
  EnterpriseRole,
  EnterpriseSettings,
  IntegrationProvider,
  LicenseTier,
} from "./lib/enterprise";
import {
  appendAuditEntry,
  exportAuditEntriesAsJsonl,
  listAuditEntries,
} from "./lib/audit-log";
import type { AuditEntry } from "./lib/audit-log";
import { FirstRunDialog, hasCompletedFirstRun } from "./components/FirstRunDialog";
import type { UsageMode } from "./components/FirstRunDialog";
import { LicenseBanner } from "./components/LicenseBanner";
import { Settings } from "./components/Settings";
import type { LicenseStatus } from "./lib/licensing";
import { getLicenseStatus } from "./lib/licensing";

const MIN_SCALE = 0.25;
const MAX_SCALE = 5.0;
const SCALE_STEP = 0.25;
const DEFAULT_SCALE = 1.5;
const DEFAULT_VIEW_MODE: ViewMode = "continuous";
const MIN_SIDEBAR_WIDTH = 148;
const MAX_SIDEBAR_WIDTH = 232;
const SIDEBAR_WIDTH_STEP = 14;
const DEFAULT_SIDEBAR_WIDTH = 170;
const SIDEBAR_WIDTH_STORAGE_KEY = "pdfluent:sidebar-width";
const SIDEBAR_VISIBLE_STORAGE_KEY = "pdfluent:sidebar-visible";
const FORM_PANEL_VISIBLE_STORAGE_KEY = "pdfluent:form-panel-visible";
const COMMENTS_PANEL_VISIBLE_STORAGE_KEY = "pdfluent:comments-panel-visible";
const RECENT_FILES_STORAGE_KEY = "pdfluent:recent-files";
const RECENT_FILES_LIMIT = 10;
const MUTATION_HISTORY_LIMIT = 40;
const FORM_PANEL_WIDTH_PX = 300;
const COMMENTS_PANEL_WIDTH_PX = 320;
const ADMIN_PANEL_WIDTH_PX = 300;
const FIT_WIDTH_VIEWER_GUTTER_PX = 72;

type ViewMode = "single" | "continuous";
type PlatformTheme = "mac" | "windows" | "other";

interface SearchMatch {
  pageIndex: number;
  lineIndex: number;
}

interface PersistedViewState {
  currentPage: number;
  scale: number;
  viewMode: ViewMode;
}

interface MutationHistoryEntry {
  action: string;
  bytes: Uint8Array;
  page: number;
  createdAtIso: string;
}

interface OcrRunPreset {
  preprocessMode?: OcrPreprocessMode;
  manualSteps?: string[];
  forceOnTextPages?: boolean;
}

type AppDialogMode = "prompt" | "confirm" | "alert";

interface AppDialogRequest {
  mode: AppDialogMode;
  title: string;
  description?: string;
  defaultValue?: string;
  placeholder?: string;
  inputType?: "text" | "password";
  confirmLabel?: string;
  cancelLabel?: string;
}

interface AppDialogState {
  mode: AppDialogMode;
  title: string;
  description: string;
  value: string;
  placeholder: string;
  inputType: "text" | "password";
  confirmLabel: string;
  cancelLabel: string;
}

interface AppDialogResult {
  confirmed: boolean;
  value: string;
}

interface SignDialogDraft {
  certPath: string;
  password: string;
  signerName: string;
  reason: string;
  location: string;
  contactInfo: string;
  x: string;
  y: string;
  width: string;
  height: string;
}

function createDefaultSignDialogDraft(): SignDialogDraft {
  return {
    certPath: "",
    password: "",
    signerName: "PDFluent Signer",
    reason: "Approved",
    location: "EU",
    contactInfo: "",
    x: "36",
    y: "36",
    width: "220",
    height: "70",
  };
}

interface ProtectDialogDraft {
  userPassword: string;
  ownerPassword: string;
}

function createDefaultProtectDialogDraft(): ProtectDialogDraft {
  return {
    userPassword: "",
    ownerPassword: "",
  };
}

interface WatermarkDialogDraft {
  text: string;
  opacity: string;
  rotationDegrees: string;
  fontSize: string;
}

function createDefaultWatermarkDialogDraft(): WatermarkDialogDraft {
  return {
    text: "CONFIDENTIAL",
    opacity: "0.2",
    rotationDegrees: "30",
    fontSize: "42",
  };
}

interface AddImageDialogDraft {
  imagePath: string;
  x: string;
  y: string;
  width: string;
  height: string;
  opacity: string;
  rotationDegrees: string;
  layerOrder: "front" | "back";
}

function createDefaultAddImageDialogDraft(): AddImageDialogDraft {
  return {
    imagePath: "",
    x: "36",
    y: "36",
    width: "220",
    height: "160",
    opacity: "1",
    rotationDegrees: "0",
    layerOrder: "front",
  };
}

interface RemoveImageAreaDialogDraft {
  x: string;
  y: string;
  width: string;
  height: string;
}

function createDefaultRemoveImageAreaDialogDraft(): RemoveImageAreaDialogDraft {
  return {
    x: "36",
    y: "36",
    width: "220",
    height: "160",
  };
}

interface RedactionDialogDraft {
  regions: string;
}

function createDefaultRedactionDialogDraft(): RedactionDialogDraft {
  return {
    regions: "36,36,220,24,REDACTED",
  };
}

interface ExportEncryptedCopyDialogDraft {
  outputPath: string;
  passphrase: string;
  confirmPassphrase: string;
}

function createDefaultExportEncryptedCopyDialogDraft(
  filePath: string | null,
): ExportEncryptedCopyDialogDraft {
  return {
    outputPath: filePath ? filePath.replace(/\.pdf$/i, ".pdfluent.enc") : "",
    passphrase: "",
    confirmPassphrase: "",
  };
}

interface ImportEncryptedCopyDialogDraft {
  encryptedPath: string;
  outputPath: string;
  passphrase: string;
}

function createDefaultImportEncryptedCopyDialogDraft(): ImportEncryptedCopyDialogDraft {
  return {
    encryptedPath: "",
    outputPath: "",
    passphrase: "",
  };
}

type ExportImageFormat = "png" | "jpg";

interface ExportImagesDialogDraft {
  format: ExportImageFormat;
  scale: string;
  jpegQuality: string;
  outputPath: string;
}

function createDefaultExportImagesDialogDraft(
  filePath: string | null,
): ExportImagesDialogDraft {
  return {
    format: "png",
    scale: "2",
    jpegQuality: "0.9",
    outputPath: filePath ? replaceFileExtension(filePath, ".png") : "",
  };
}

function getViewStateKey(filePath: string): string {
  return `pdfluent:view-state:${encodeURIComponent(filePath)}`;
}

function isViewMode(value: unknown): value is ViewMode {
  return value === "single" || value === "continuous";
}

function clampSidebarWidth(value: number): number {
  if (!Number.isFinite(value)) return DEFAULT_SIDEBAR_WIDTH;
  return Math.max(MIN_SIDEBAR_WIDTH, Math.min(value, MAX_SIDEBAR_WIDTH));
}

interface FitWidthScaleInput {
  pageWidthPt: number;
  viewportWidthPx: number;
  sidebarVisible: boolean;
  sidebarWidthPx: number;
  formPanelVisible: boolean;
  hasFormPanel: boolean;
  commentsPanelVisible: boolean;
  hasCommentsPanel: boolean;
  adminPanelVisible: boolean;
}

export function calculateFitToWidthScale(input: FitWidthScaleInput): number {
  if (!Number.isFinite(input.pageWidthPt) || input.pageWidthPt <= 0) {
    return 1;
  }

  const sidebarWidth = input.sidebarVisible ? Math.max(0, input.sidebarWidthPx) : 0;
  const formPanelWidth =
    input.formPanelVisible && input.hasFormPanel ? FORM_PANEL_WIDTH_PX : 0;
  const commentsPanelWidth =
    input.commentsPanelVisible && input.hasCommentsPanel ? COMMENTS_PANEL_WIDTH_PX : 0;
  const adminPanelWidth = input.adminPanelVisible ? ADMIN_PANEL_WIDTH_PX : 0;
  const reservedWidth =
    sidebarWidth +
    formPanelWidth +
    commentsPanelWidth +
    adminPanelWidth +
    FIT_WIDTH_VIEWER_GUTTER_PX;
  const availableViewerWidth = Math.max(240, input.viewportWidthPx - reservedWidth);
  const nextScale = availableViewerWidth / input.pageWidthPt;

  if (!Number.isFinite(nextScale) || nextScale <= 0) {
    return 1;
  }

  return Math.max(MIN_SCALE, Math.min(nextScale, MAX_SCALE));
}

function readSidebarWidth(): number {
  try {
    const raw = localStorage.getItem(SIDEBAR_WIDTH_STORAGE_KEY);
    if (!raw) return DEFAULT_SIDEBAR_WIDTH;

    const parsed = Number.parseInt(raw, 10);
    return clampSidebarWidth(parsed);
  } catch {
    return DEFAULT_SIDEBAR_WIDTH;
  }
}

function readSidebarVisible(): boolean {
  try {
    const raw = localStorage.getItem(SIDEBAR_VISIBLE_STORAGE_KEY);
    if (raw === null) {
      return true;
    }
    return raw !== "0";
  } catch {
    return true;
  }
}

function readFormPanelVisible(): boolean {
  try {
    const raw = localStorage.getItem(FORM_PANEL_VISIBLE_STORAGE_KEY);
    if (raw === null) {
      return true;
    }
    return raw !== "0";
  } catch {
    return true;
  }
}

function readCommentsPanelVisible(): boolean {
  try {
    const raw = localStorage.getItem(COMMENTS_PANEL_VISIBLE_STORAGE_KEY);
    if (raw === null) {
      return false;
    }
    return raw !== "0";
  } catch {
    return false;
  }
}

function readRecentFiles(): string[] {
  try {
    const raw = localStorage.getItem(RECENT_FILES_STORAGE_KEY);
    if (!raw) {
      return [];
    }
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) {
      return [];
    }
    return parsed.filter((value): value is string => typeof value === "string");
  } catch {
    return [];
  }
}

function recordRecentFile(current: string[], nextPath: string): string[] {
  const normalized = nextPath.trim();
  if (normalized.length === 0) {
    return current;
  }

  const deduped = current.filter((path) => path !== normalized);
  return [normalized, ...deduped].slice(0, RECENT_FILES_LIMIT);
}

function detectPlatformTheme(): PlatformTheme {
  const platform = navigator.platform.toLowerCase();
  const userAgent = navigator.userAgent.toLowerCase();

  if (platform.includes("mac") || userAgent.includes("mac os")) {
    return "mac";
  }

  if (platform.includes("win") || userAgent.includes("windows")) {
    return "windows";
  }

  return "other";
}

interface ShortcutKeyEvent {
  key: string;
  metaKey: boolean;
  ctrlKey: boolean;
  shiftKey: boolean;
  altKey: boolean;
}

export function isPrimaryModifierPressed(
  platformTheme: PlatformTheme,
  event: ShortcutKeyEvent,
): boolean {
  return platformTheme === "mac" ? event.metaKey : event.ctrlKey;
}

export function matchesPrimaryShortcut(
  platformTheme: PlatformTheme,
  event: ShortcutKeyEvent,
  key: string,
  options: { shift?: boolean; alt?: boolean } = {},
): boolean {
  const normalizedKey = event.key.toLowerCase();
  const normalizedTarget = key.toLowerCase();
  if (!isPrimaryModifierPressed(platformTheme, event)) {
    return false;
  }
  const requireShift = options.shift ?? false;
  const requireAlt = options.alt ?? false;
  if (event.shiftKey !== requireShift) {
    return false;
  }
  if (event.altKey !== requireAlt) {
    return false;
  }
  return normalizedKey === normalizedTarget;
}

export function matchesUndoShortcut(
  platformTheme: PlatformTheme,
  event: ShortcutKeyEvent,
): boolean {
  return matchesPrimaryShortcut(platformTheme, event, "z");
}

export function matchesRedoShortcut(
  platformTheme: PlatformTheme,
  event: ShortcutKeyEvent,
): boolean {
  if (platformTheme === "mac") {
    return matchesPrimaryShortcut(platformTheme, event, "z", { shift: true });
  }
  return (
    matchesPrimaryShortcut(platformTheme, event, "y") ||
    matchesPrimaryShortcut(platformTheme, event, "z", { shift: true })
  );
}

function readViewState(filePath: string): PersistedViewState | null {
  try {
    const raw = localStorage.getItem(getViewStateKey(filePath));
    if (!raw) return null;

    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null) return null;

    const candidate = parsed as Record<string, unknown>;
    const currentPage = candidate.currentPage;
    const scale = candidate.scale;
    const viewMode = candidate.viewMode;

    if (
      typeof currentPage !== "number" ||
      !Number.isFinite(currentPage) ||
      typeof scale !== "number" ||
      !Number.isFinite(scale) ||
      !isViewMode(viewMode)
    ) {
      return null;
    }

    return {
      currentPage,
      scale,
      viewMode,
    };
  } catch {
    return null;
  }
}

function persistViewState(filePath: string, state: PersistedViewState): void {
  localStorage.setItem(getViewStateKey(filePath), JSON.stringify(state));
}

function base64ToBytes(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index++) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

function bytesToDataUrl(bytes: Uint8Array, mimeType: string): string {
  let binary = "";
  const chunkSize = 0x8000;

  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    const chunk = bytes.subarray(offset, offset + chunkSize);
    binary += String.fromCharCode(...chunk);
  }

  return `data:${mimeType};base64,${btoa(binary)}`;
}

function parseNumberInput(value: string | null, fallback: number): number {
  if (value === null) return fallback;
  const parsed = Number.parseFloat(value);
  if (!Number.isFinite(parsed)) return fallback;
  return parsed;
}

function parseBooleanInput(value: string | null, fallback: boolean): boolean {
  if (value === null) return fallback;
  const normalized = value.trim().toLowerCase();
  if (normalized === "1" || normalized === "true" || normalized === "yes") {
    return true;
  }
  if (normalized === "0" || normalized === "false" || normalized === "no") {
    return false;
  }
  return fallback;
}

function parseLayerOrderInput(
  value: string | null,
  fallback: "front" | "back" = "front",
): "front" | "back" {
  if (value === null) return fallback;
  const normalized = value.trim().toLowerCase();
  if (normalized === "front") return "front";
  if (normalized === "back") return "back";
  return fallback;
}

function cloneBytes(value: Uint8Array): Uint8Array {
  return Uint8Array.from(value);
}

function parseRedactionRegions(input: string): RedactionRegion[] {
  return input
    .split(";")
    .map((part) => part.trim())
    .filter((part) => part.length > 0)
    .map((part) => {
      const [xRaw, yRaw, widthRaw, heightRaw, labelRaw] = part.split(",");
      const x = Number.parseFloat(xRaw ?? "");
      const y = Number.parseFloat(yRaw ?? "");
      const width = Number.parseFloat(widthRaw ?? "");
      const height = Number.parseFloat(heightRaw ?? "");

      if (
        !Number.isFinite(x) ||
        !Number.isFinite(y) ||
        !Number.isFinite(width) ||
        !Number.isFinite(height) ||
        width <= 0 ||
        height <= 0
      ) {
        throw new Error(
          "Invalid redaction format. Use x,y,width,height or x,y,width,height,label",
        );
      }

      return {
        x,
        y,
        width,
        height,
        label: labelRaw?.trim() || undefined,
      };
    });
}

function parseRectInput(input: string, fallbackLabel = "rectangle"): {
  x: number;
  y: number;
  width: number;
  height: number;
} {
  const [xRaw, yRaw, widthRaw, heightRaw] = input
    .split(",")
    .map((part) => part.trim());
  const x = Number.parseFloat(xRaw ?? "");
  const y = Number.parseFloat(yRaw ?? "");
  const width = Number.parseFloat(widthRaw ?? "");
  const height = Number.parseFloat(heightRaw ?? "");

  if (
    !Number.isFinite(x) ||
    !Number.isFinite(y) ||
    !Number.isFinite(width) ||
    !Number.isFinite(height) ||
    width <= 0 ||
    height <= 0
  ) {
    throw new Error(
      `Invalid ${fallbackLabel} format. Use x,y,width,height with positive size.`,
    );
  }

  return {
    x,
    y,
    width,
    height,
  };
}

function parseSplitRangesInput(input: string, totalPages: number): PageRange[] {
  const ranges = input
    .split(",")
    .map((part) => part.trim())
    .filter((part) => part.length > 0)
    .map((part) => {
      const rangeMatch = /^(\d+)(?:-(\d+))?$/.exec(part);
      if (!rangeMatch) {
        throw new Error("Invalid split range format. Use values like 1-3,4,7-9.");
      }

      const startRaw = rangeMatch[1];
      const endRaw = rangeMatch[2];
      if (!startRaw) {
        throw new Error("Split range start is missing.");
      }

      const start = Number.parseInt(startRaw, 10);
      const end = endRaw ? Number.parseInt(endRaw, 10) : start;

      if (!Number.isFinite(start) || !Number.isFinite(end)) {
        throw new Error("Split range values must be numeric.");
      }
      if (start < 1 || end < 1 || start > totalPages || end > totalPages) {
        throw new Error(`Split range must be within 1-${totalPages}.`);
      }
      if (start > end) {
        throw new Error("Split range start cannot exceed end.");
      }

      return {
        start: start - 1,
        end: end - 1,
      };
    });

  if (ranges.length === 0) {
    throw new Error("Provide at least one split range.");
  }

  return ranges;
}

async function convertPngToJpeg(
  pngBytes: Uint8Array,
  quality: number,
): Promise<Uint8Array> {
  const image = new Image();
  image.src = bytesToDataUrl(pngBytes, "image/png");
  await new Promise<void>((resolve, reject) => {
    image.onload = () => resolve();
    image.onerror = () => reject(new Error("Unable to decode PNG for JPEG export."));
  });

  const canvas = document.createElement("canvas");
  canvas.width = image.width;
  canvas.height = image.height;
  const context = canvas.getContext("2d");
  if (!context) {
    throw new Error("Canvas 2D context unavailable for JPEG conversion.");
  }
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.drawImage(image, 0, 0);

  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (value) => {
        if (value) {
          resolve(value);
        } else {
          reject(new Error("Unable to encode JPEG output."));
        }
      },
      "image/jpeg",
      quality,
    );
  });

  return new Uint8Array(await blob.arrayBuffer());
}

function replaceFileExtension(path: string, extensionWithDot: string): string {
  return path.replace(/\.[^./]+$/i, extensionWithDot);
}

function createSafeWritePaths(path: string): { backupPath: string; tempPath: string } {
  const nonce = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  return {
    backupPath: `${path}.pdfluent-backup`,
    tempPath: `${path}.pdfluent-temp-${nonce}`,
  };
}

function createRecoverySnapshotPath(path: string): string {
  return `${path}.pdfluent-recovery`;
}

async function removeIfExists(path: string): Promise<void> {
  if (await exists(path)) {
    await remove(path);
  }
}

async function writeDocumentSafely(
  path: string,
  bytes: Uint8Array,
  context: string,
  previousBytes?: Uint8Array,
): Promise<void> {
  const { backupPath, tempPath } = createSafeWritePaths(path);
  const recoveryPath = createRecoverySnapshotPath(path);
  const startedAt = performance.now();

  appendDebugLog("info", "safe_write_start", {
    context,
    path,
    backupPath,
    tempPath,
    recoveryPath,
    bytes: bytes.byteLength,
  });

  await removeIfExists(tempPath);
  await removeIfExists(backupPath);
  if (previousBytes && previousBytes.byteLength > 0) {
    await writeFile(recoveryPath, previousBytes);
    appendDebugLog("debug", "safe_write_recovery_snapshot_created", {
      context,
      path,
      recoveryPath,
      snapshotBytes: previousBytes.byteLength,
    });
  }
  await copyFile(path, backupPath);

  let failed = false;
  let writeError = "";

  try {
    await writeFile(tempPath, bytes);
    await copyFile(tempPath, path);
    appendDebugLog("info", "safe_write_success", {
      context,
      path,
      durationMs: Math.round(performance.now() - startedAt),
      bytes: bytes.byteLength,
    });
  } catch (err) {
    failed = true;
    writeError = String(err);
    appendDebugLog("error", "safe_write_failure", {
      context,
      path,
      error: writeError,
    });
    throw err;
  } finally {
    if (failed) {
      try {
        if (await exists(backupPath)) {
          await copyFile(backupPath, path);
          appendDebugLog("warn", "safe_write_rollback_success", {
            context,
            path,
            error: writeError,
          });
        }
      } catch (rollbackError) {
        appendDebugLog("error", "safe_write_rollback_failure", {
          context,
          path,
          error: String(rollbackError),
          originalError: writeError,
        });
      }
    }

    await removeIfExists(tempPath).catch((cleanupError) => {
      appendDebugLog("warn", "safe_write_temp_cleanup_failure", {
        context,
        path,
        error: String(cleanupError),
      });
    });
    await removeIfExists(backupPath).catch((cleanupError) => {
      appendDebugLog("warn", "safe_write_backup_cleanup_failure", {
        context,
        path,
        error: String(cleanupError),
      });
    });
    if (!failed) {
      await removeIfExists(recoveryPath).catch((cleanupError) => {
        appendDebugLog("warn", "safe_write_recovery_cleanup_failure", {
          context,
          path,
          recoveryPath,
          error: String(cleanupError),
        });
      });
    }
  }
}

function normalizeSearchQuery(value: string): string {
  return value.trim().toLowerCase();
}

function hexToRgba(hex: string, alpha: number): string {
  const normalized = hex.replace("#", "").trim();
  if (!/^[0-9a-fA-F]{6}$/.test(normalized)) {
    return `rgba(74, 158, 255, ${alpha})`;
  }

  const red = Number.parseInt(normalized.slice(0, 2), 16);
  const green = Number.parseInt(normalized.slice(2, 4), 16);
  const blue = Number.parseInt(normalized.slice(4, 6), 16);
  return `rgba(${red}, ${green}, ${blue}, ${alpha})`;
}

export function App() {
  const [filePath, setFilePath] = useState<string | null>(null);
  const [docInfo, setDocInfo] = useState<DocumentInfo | null>(null);
  const [currentPage, setCurrentPage] = useState(0);
  const [scale, setScale] = useState(DEFAULT_SCALE);
  const [viewMode, setViewMode] = useState<ViewMode>(DEFAULT_VIEW_MODE);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sidebarWidth, setSidebarWidth] = useState<number>(() =>
    readSidebarWidth(),
  );
  const [sidebarVisible, setSidebarVisible] = useState<boolean>(() =>
    readSidebarVisible(),
  );
  const [annotationTool, setAnnotationTool] = useState<AnnotationTool>("none");
  const [highlightColor, setHighlightColor] = useState<HighlightColor>("yellow");
  const [annotationSaving, setAnnotationSaving] = useState(false);
  const [formFields, setFormFields] = useState<FormFieldDefinition[]>([]);
  const [formPanelVisible, setFormPanelVisible] = useState<boolean>(() =>
    readFormPanelVisible(),
  );
  const [commentThreads, setCommentThreads] = useState<CommentThread[]>([]);
  const [commentThreadFilter, setCommentThreadFilter] =
    useState<CommentThreadFilter>("all");
  const [commentsPanelVisible, setCommentsPanelVisible] = useState<boolean>(() =>
    readCommentsPanelVisible(),
  );
  const [documentStructure, setDocumentStructure] = useState<DocumentStructureState>(
    () => createEmptyDocumentStructureState(),
  );
  const [recentFiles, setRecentFiles] = useState<string[]>(() => readRecentFiles());
  const [formSaving, setFormSaving] = useState(false);
  const [editableTextLines, setEditableTextLines] = useState<EditableTextLine[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchMatches, setSearchMatches] = useState<SearchMatch[]>([]);
  const [activeSearchMatchIndex, setActiveSearchMatchIndex] = useState(0);
  const [searchingDocument, setSearchingDocument] = useState(false);
  const [textEditorEnabled, setTextEditorEnabled] = useState(false);
  const [textSaving, setTextSaving] = useState(false);
  const [signing, setSigning] = useState(false);
  const [documentSaving, setDocumentSaving] = useState(false);
  const [networkMode, setNetworkMode] = useState<"offline" | "online">("offline");
  const [checkingUpdates, setCheckingUpdates] = useState(false);
  const [ocrProcessing, setOcrProcessing] = useState(false);
  const [enterpriseSettings, setEnterpriseSettings] = useState<EnterpriseSettings>(
    () => loadEnterpriseSettings(),
  );
  const [auditEntries, setAuditEntries] = useState<AuditEntry[]>(() =>
    listAuditEntries(),
  );
  const [signDialogOpen, setSignDialogOpen] = useState(false);
  const [signDialogDraft, setSignDialogDraft] = useState<SignDialogDraft>(() =>
    createDefaultSignDialogDraft(),
  );
  const [protectDialogOpen, setProtectDialogOpen] = useState(false);
  const [protectDialogDraft, setProtectDialogDraft] = useState<ProtectDialogDraft>(
    () => createDefaultProtectDialogDraft(),
  );
  const [watermarkDialogOpen, setWatermarkDialogOpen] = useState(false);
  const [watermarkDialogDraft, setWatermarkDialogDraft] =
    useState<WatermarkDialogDraft>(() => createDefaultWatermarkDialogDraft());
  const [addImageDialogOpen, setAddImageDialogOpen] = useState(false);
  const [addImageDialogDraft, setAddImageDialogDraft] =
    useState<AddImageDialogDraft>(() => createDefaultAddImageDialogDraft());
  const [removeImageAreaDialogOpen, setRemoveImageAreaDialogOpen] = useState(false);
  const [removeImageAreaDialogDraft, setRemoveImageAreaDialogDraft] =
    useState<RemoveImageAreaDialogDraft>(() =>
      createDefaultRemoveImageAreaDialogDraft(),
    );
  const [redactionDialogOpen, setRedactionDialogOpen] = useState(false);
  const [redactionDialogDraft, setRedactionDialogDraft] =
    useState<RedactionDialogDraft>(() => createDefaultRedactionDialogDraft());
  const [exportEncryptedCopyDialogOpen, setExportEncryptedCopyDialogOpen] =
    useState(false);
  const [exportEncryptedCopyDialogDraft, setExportEncryptedCopyDialogDraft] =
    useState<ExportEncryptedCopyDialogDraft>(() =>
      createDefaultExportEncryptedCopyDialogDraft(null),
    );
  const [importEncryptedCopyDialogOpen, setImportEncryptedCopyDialogOpen] =
    useState(false);
  const [importEncryptedCopyDialogDraft, setImportEncryptedCopyDialogDraft] =
    useState<ImportEncryptedCopyDialogDraft>(() =>
      createDefaultImportEncryptedCopyDialogDraft(),
    );
  const [exportImagesDialogOpen, setExportImagesDialogOpen] = useState(false);
  const [exportImagesDialogDraft, setExportImagesDialogDraft] =
    useState<ExportImagesDialogDraft>(() => createDefaultExportImagesDialogDraft(null));
  const [splitDialogOpen, setSplitDialogOpen] = useState(false);
  const [splitRangesInput, setSplitRangesInput] = useState("");
  const [splitTargetDirectory, setSplitTargetDirectory] = useState("");
  const [appDialogState, setAppDialogState] = useState<AppDialogState | null>(null);
  const [adminConsoleOpen, setAdminConsoleOpen] = useState(false);
  const [settingsVisible, setSettingsVisible] = useState(false);
  const [showFirstRun, setShowFirstRun] = useState(() => !hasCompletedFirstRun());
  const [licenseStatus, setLicenseStatus] = useState<LicenseStatus | null>(null);
  const [undoStack, setUndoStack] = useState<MutationHistoryEntry[]>([]);
  const [redoStack, setRedoStack] = useState<MutationHistoryEntry[]>([]);
  const lastDroppedFileRef = useRef<{ path: string; timestamp: number } | null>(
    null,
  );
  const currentPageRef = useRef(0);
  const searchRequestRef = useRef(0);
  const searchPageCacheRef = useRef<Map<number, EditableTextLine[]>>(new Map());
  const undoStackRef = useRef<MutationHistoryEntry[]>([]);
  const redoStackRef = useRef<MutationHistoryEntry[]>([]);
  const appDialogResolverRef = useRef<((result: AppDialogResult) => void) | null>(
    null,
  );
  const platformTheme = useMemo(() => detectPlatformTheme(), []);

  // Fetch license status from the backend on startup.
  useEffect(() => {
    getLicenseStatus()
      .then((status) => {
        setLicenseStatus(status);
      })
      .catch(() => {
        // License system unavailable — stay in personal mode.
      });
  }, []);

  const handleFirstRunComplete = useCallback(
    (mode: UsageMode) => {
      setShowFirstRun(false);
      if (mode === "commercial") {
        setSettingsVisible(true);
      }
    },
    [],
  );

  const handleLicenseChange = useCallback((status: LicenseStatus) => {
    setLicenseStatus(status);
  }, []);

  useEffect(() => {
    currentPageRef.current = currentPage;
  }, [currentPage]);

  useEffect(() => {
    undoStackRef.current = undoStack;
  }, [undoStack]);

  useEffect(() => {
    redoStackRef.current = redoStack;
  }, [redoStack]);

  useEffect(() => {
    setDebugLogContextProvider(() => ({
      filePath,
      currentPage: currentPage + 1,
      pageCount: docInfo?.page_count ?? 0,
      scale,
      viewMode,
      annotationTool,
      textEditorEnabled,
      networkMode,
      sidebarVisible,
      formPanelVisible,
      commentsPanelVisible,
      commentThreadFilter,
      commentThreadCount: commentThreads.length,
      adminConsoleOpen,
      documentSaving,
      annotationSaving,
      formSaving,
      signing,
    }));

    return () => {
      setDebugLogContextProvider(null);
    };
  }, [
    adminConsoleOpen,
    annotationSaving,
    annotationTool,
    commentThreadFilter,
    commentThreads.length,
    commentsPanelVisible,
    currentPage,
    docInfo?.page_count,
    documentSaving,
    filePath,
    formPanelVisible,
    formSaving,
    networkMode,
    scale,
    sidebarVisible,
    signing,
    textEditorEnabled,
    viewMode,
  ]);

  useEffect(() => {
    searchPageCacheRef.current = new Map();
    appendDebugLog("debug", "search_page_cache_reset", {
      filePath,
      pageCount: docInfo?.page_count ?? 0,
    });
  }, [filePath, docInfo]);

  useEffect(() => {
    appendDebugLog("info", "app_start", {
      sessionId: getDebugSessionId(),
      href: window.location.href,
      userAgent: navigator.userAgent,
    });

    const handleWindowError = (event: ErrorEvent) => {
      appendDebugLog("error", "window_error", {
        message: event.message,
        filename: event.filename,
        line: event.lineno,
        column: event.colno,
        error: event.error,
      });
    };

    const handleUnhandledRejection = (event: PromiseRejectionEvent) => {
      appendDebugLog("error", "unhandled_rejection", {
        reason: event.reason,
      });
    };

    window.addEventListener("error", handleWindowError);
    window.addEventListener("unhandledrejection", handleUnhandledRejection);

    return () => {
      window.removeEventListener("error", handleWindowError);
      window.removeEventListener("unhandledrejection", handleUnhandledRejection);
    };
  }, []);

  useEffect(() => {
    document.documentElement.dataset.platform = platformTheme;
    appendDebugLog("info", "platform_theme_selected", { platformTheme });

    return () => {
      delete document.documentElement.dataset.platform;
    };
  }, [platformTheme]);

  useEffect(() => {
    const debugApi = {
      list: () => listDebugLogs(),
      clear: () => clearDebugLogs(),
    };

    Object.assign(window, { pdfluentDebug: debugApi });
    appendDebugLog("info", "debug_api_ready");

    return () => {
      delete (window as Window & { pdfluentDebug?: typeof debugApi }).pdfluentDebug;
    };
  }, []);

  useEffect(() => {
    localStorage.setItem(SIDEBAR_WIDTH_STORAGE_KEY, String(sidebarWidth));
  }, [sidebarWidth]);

  useEffect(() => {
    localStorage.setItem(SIDEBAR_VISIBLE_STORAGE_KEY, sidebarVisible ? "1" : "0");
  }, [sidebarVisible]);

  useEffect(() => {
    localStorage.setItem(
      FORM_PANEL_VISIBLE_STORAGE_KEY,
      formPanelVisible ? "1" : "0",
    );
  }, [formPanelVisible]);

  useEffect(() => {
    localStorage.setItem(
      COMMENTS_PANEL_VISIBLE_STORAGE_KEY,
      commentsPanelVisible ? "1" : "0",
    );
  }, [commentsPanelVisible]);

  useEffect(() => {
    localStorage.setItem(RECENT_FILES_STORAGE_KEY, JSON.stringify(recentFiles));
  }, [recentFiles]);

  const resolveAppDialog = useCallback((confirmed: boolean) => {
    setAppDialogState((current) => {
      if (!current) {
        return null;
      }

      const resolver = appDialogResolverRef.current;
      appDialogResolverRef.current = null;
      queueMicrotask(() => {
        resolver?.({
          confirmed,
          value: current.value,
        });
      });
      return null;
    });
  }, []);

  const requestAppDialog = useCallback(
    async (request: AppDialogRequest): Promise<AppDialogResult> =>
      new Promise((resolve) => {
        if (appDialogResolverRef.current) {
          appDialogResolverRef.current({
            confirmed: false,
            value: "",
          });
          appDialogResolverRef.current = null;
        }

        appDialogResolverRef.current = resolve;
        setAppDialogState({
          mode: request.mode,
          title: request.title,
          description: request.description?.trim() ?? "",
          value: request.defaultValue ?? "",
          placeholder: request.placeholder ?? "",
          inputType: request.inputType ?? "text",
          confirmLabel:
            request.confirmLabel ??
            (request.mode === "alert" ? "OK" : request.mode === "confirm" ? "Confirm" : "Apply"),
          cancelLabel: request.cancelLabel ?? "Cancel",
        });
      }),
    [],
  );

  const promptDialog = useCallback(
    async (
      title: string,
      defaultValue = "",
      options: Omit<AppDialogRequest, "mode" | "title" | "defaultValue"> = {},
    ): Promise<string | null> => {
      const result = await requestAppDialog({
        mode: "prompt",
        title,
        defaultValue,
        ...options,
      });
      return result.confirmed ? result.value : null;
    },
    [requestAppDialog],
  );

  const confirmDialog = useCallback(
    async (
      title: string,
      options: Omit<AppDialogRequest, "mode" | "title"> = {},
    ): Promise<boolean> => {
      const result = await requestAppDialog({
        mode: "confirm",
        title,
        ...options,
      });
      return result.confirmed;
    },
    [requestAppDialog],
  );

  const alertDialog = useCallback(
    async (
      title: string,
      options: Omit<AppDialogRequest, "mode" | "title"> = {},
    ): Promise<void> => {
      await requestAppDialog({
        mode: "alert",
        title,
        ...options,
      });
    },
    [requestAppDialog],
  );

  useEffect(
    () => () => {
      if (appDialogResolverRef.current) {
        appDialogResolverRef.current({
          confirmed: false,
          value: "",
        });
        appDialogResolverRef.current = null;
      }
    },
    [],
  );

  const loadDetectedFormFields = useCallback(async (path: string) => {
    const bytes = await readFile(path);
    const fields = await getFormFields(bytes);
    setFormFields(fields);
  }, []);

  const loadEditableLines = useCallback(
    async (path: string, pageIndex: number) => {
      const bytes = await readFile(path);
      const lines = await extractEditableTextLines(bytes, pageIndex);
      setEditableTextLines(lines);
    },
    [],
  );

  const resetSearchState = useCallback(() => {
    searchRequestRef.current += 1;
    setSearchQuery("");
    setSearchMatches([]);
    setActiveSearchMatchIndex(0);
    setSearchingDocument(false);
  }, []);

  useEffect(() => {
    setNetworkMode(readNetworkMode());
  }, []);

  const recordAudit = useCallback(
    (
      action: string,
      outcome: "success" | "failure" | "warning",
      metadata?: Record<string, string | number | boolean | null>,
    ) => {
      appendAuditEntry(action, outcome, metadata);
      setAuditEntries(listAuditEntries());
    },
    [],
  );

  const updateEnterpriseSettings = useCallback(
    (updater: (previous: EnterpriseSettings) => EnterpriseSettings) => {
      setEnterpriseSettings((previous) => {
        const next = updater(previous);
        saveEnterpriseSettings(next);
        return next;
      });
    },
    [],
  );

  const appendTamperAudit = useCallback(
    (
      action: string,
      outcome: "success" | "warning" | "failure",
      payload: Record<string, unknown> = {},
    ) => {
      updateEnterpriseSettings((previous) =>
        appendTamperAuditEntry(previous, action, outcome, payload),
      );
    },
    [updateEnterpriseSettings],
  );

  const pushUndoSnapshot = useCallback(
    (action: string, bytes: Uint8Array, page: number) => {
      const entry: MutationHistoryEntry = {
        action,
        bytes: cloneBytes(bytes),
        page,
        createdAtIso: new Date().toISOString(),
      };

      setUndoStack((previous) => {
        const next = [...previous, entry];
        if (next.length > MUTATION_HISTORY_LIMIT) {
          return next.slice(next.length - MUTATION_HISTORY_LIMIT);
        }
        return next;
      });
      setRedoStack([]);
      appendDebugLog("debug", "undo_snapshot_recorded", {
        action,
        page: page + 1,
        bytes: bytes.byteLength,
      });
    },
    [],
  );

  const applyRecoverySnapshotIfPresent = useCallback(
    async (path: string) => {
      const recoveryPath = createRecoverySnapshotPath(path);
      const hasRecovery = await exists(recoveryPath);
      if (!hasRecovery) {
        return false;
      }

      appendDebugLog("warn", "recovery_snapshot_detected", {
        path,
        recoveryPath,
      });
      const shouldRestore = await confirmDialog(
        "PDFluent found a recovery snapshot from an interrupted save. Restore it now?",
      );
      if (!shouldRestore) {
        await removeIfExists(recoveryPath);
        appendDebugLog("info", "recovery_snapshot_dismissed", {
          path,
          recoveryPath,
        });
        return false;
      }

      const recoveryBytes = await readFile(recoveryPath);
      await writeFile(path, recoveryBytes);
      await removeIfExists(recoveryPath);
      appendDebugLog("info", "recovery_snapshot_restored", {
        path,
        recoveryPath,
        bytes: recoveryBytes.byteLength,
      });
      recordAudit("restore_recovery_snapshot", "warning", {
        filePath: path,
      });
      return true;
    },
    [confirmDialog, recordAudit],
  );

  useEffect(() => {
    const root = document.documentElement;
    root.style.setProperty("--accent", enterpriseSettings.branding.accentColor);
    root.style.setProperty(
      "--accent-dim",
      hexToRgba(enterpriseSettings.branding.accentColor, 0.18),
    );
  }, [enterpriseSettings.branding.accentColor]);

  const openPdfFromPath = useCallback(
    async (
      path: string,
      source: "dialog" | "drop_browser" | "drop_tauri" | "recent",
    ) => {
      const startedAt = performance.now();
      appendDebugLog("info", "open_pdf_start", { path, source });
      setLoading(true);
      setError(null);

      try {
        await applyRecoverySnapshotIfPresent(path);
        let resolvedPath = path;
        let info: DocumentInfo;

        try {
          info = await openPdf(resolvedPath);
        } catch (openError) {
          const openReason = String(openError).toLowerCase();
          const mayBeEncrypted =
            openReason.includes("password") ||
            openReason.includes("encrypted") ||
            openReason.includes("security");
          const mayBeMalformed =
            openReason.includes("corrupt") ||
            openReason.includes("malformed") ||
            openReason.includes("xref") ||
            openReason.includes("trailer") ||
            openReason.includes("cross-reference") ||
            openReason.includes("parse") ||
            openReason.includes("syntax");

          if (!mayBeEncrypted && mayBeMalformed) {
            appendDebugLog("warn", "open_pdf_malformed_detected", {
              path,
              source,
              error: String(openError),
            });

            try {
              const rawBytes = await readFile(path);
              const repairedPdf = await PDF.load(rawBytes);
              const repairedBytes = await repairedPdf.save();
              const repairedPath = path.replace(/\.pdf$/i, ".pdfluent-repaired.pdf");
              await writeFile(repairedPath, repairedBytes);
              resolvedPath = repairedPath;
              info = await openPdf(repairedPath);

              recordAudit("open_repaired_pdf", "warning", {
                originalPath: path,
                repairedPath,
                source,
              });
              appendDebugLog("info", "open_pdf_malformed_repaired", {
                originalPath: path,
                repairedPath,
                source,
              });
            } catch (repairError) {
              appendDebugLog("error", "open_pdf_malformed_repair_failed", {
                path,
                source,
                error: String(repairError),
                originalError: String(openError),
              });
              throw openError;
            }
          } else if (!mayBeEncrypted) {
            throw openError;
          } else {
            appendDebugLog("warn", "open_pdf_encrypted_detected", {
              path,
              source,
              error: String(openError),
            });

            const password = await promptDialog(
              "This PDF appears encrypted. Enter the password to open it:",
            );
            if (!password) {
              throw openError;
            }

            const encryptedBytes = await readFile(path);
            const unlockedPdf = await PDF.load(encryptedBytes, {
              credentials: password,
            });
            const unlockedBytes = await unlockedPdf.save();
            const unlockedPath = path.replace(/\.pdf$/i, ".pdfluent-unlocked.pdf");
            await writeFile(unlockedPath, unlockedBytes);
            resolvedPath = unlockedPath;
            info = await openPdf(resolvedPath);
            recordAudit("open_encrypted_pdf", "warning", {
              originalPath: path,
              unlockedPath,
              source,
            });
            appendDebugLog("info", "open_pdf_encrypted_unlocked", {
              originalPath: path,
              unlockedPath,
              source,
            });
          }
        }

        const savedViewState = readViewState(resolvedPath);
        const nextPage =
          savedViewState && info.page_count > 0
            ? Math.max(0, Math.min(savedViewState.currentPage, info.page_count - 1))
            : 0;
        const defaultPageWidth = info.pages[nextPage]?.width_pt ?? 0;
        const fittedScale = calculateFitToWidthScale({
          pageWidthPt: defaultPageWidth,
          viewportWidthPx:
            typeof window !== "undefined" && Number.isFinite(window.innerWidth)
              ? window.innerWidth
              : defaultPageWidth,
          sidebarVisible,
          sidebarWidthPx: sidebarWidth,
          formPanelVisible,
          hasFormPanel: false,
          commentsPanelVisible: false,
          hasCommentsPanel: false,
          adminPanelVisible: adminConsoleOpen,
        });
        const nextScale = savedViewState
          ? Math.max(MIN_SCALE, Math.min(savedViewState.scale, MAX_SCALE))
          : fittedScale;

        setFilePath(resolvedPath);
        setDocInfo(info);
        setCurrentPage(nextPage);
        setScale(nextScale);
        setViewMode(DEFAULT_VIEW_MODE);
        setSignDialogOpen(false);
        setSignDialogDraft(createDefaultSignDialogDraft());
        setProtectDialogOpen(false);
        setProtectDialogDraft(createDefaultProtectDialogDraft());
        setWatermarkDialogOpen(false);
        setWatermarkDialogDraft(createDefaultWatermarkDialogDraft());
        setSplitDialogOpen(false);
        setSplitRangesInput("");
        setSplitTargetDirectory("");
        setCommentThreads([]);
        setCommentThreadFilter("all");
        setCommentsPanelVisible(false);
        setDocumentStructure(createEmptyDocumentStructureState());
        setUndoStack([]);
        setRedoStack([]);
        resetSearchState();
        setRecentFiles((current) => recordRecentFile(current, resolvedPath));
        await loadDetectedFormFields(resolvedPath);
        await loadEditableLines(resolvedPath, nextPage);
        recordAudit("open_pdf", "success", { filePath: resolvedPath, source });
        appendDebugLog("info", "open_pdf_success", {
          path: resolvedPath,
          source,
          pageCount: info.page_count,
          openedPage: nextPage + 1,
          scale: nextScale,
          fittedScale,
          durationMs: Math.round(performance.now() - startedAt),
        });
      } catch (err) {
        const reason = String(err);
        setError(reason);
        recordAudit("open_pdf", "failure", { reason, source });
        appendDebugLog("error", "open_pdf_failure", {
          path,
          source,
          durationMs: Math.round(performance.now() - startedAt),
          error: err,
        });
      } finally {
        setLoading(false);
      }
    },
    [
      applyRecoverySnapshotIfPresent,
      loadDetectedFormFields,
      loadEditableLines,
      promptDialog,
      recordAudit,
      resetSearchState,
      adminConsoleOpen,
      formPanelVisible,
      sidebarVisible,
      sidebarWidth,
    ],
  );

  const openRecentFile = useCallback(
    async (path: string) => {
      await openPdfFromPath(path, "recent");
    },
    [openPdfFromPath],
  );

  const clearRecentFiles = useCallback(() => {
    setRecentFiles([]);
    appendDebugLog("info", "recent_files_cleared");
  }, []);

  async function handleOpenFile() {
    const selected = await open({
      multiple: false,
      filters: [{ name: "PDF", extensions: ["pdf"] }],
    });
    if (typeof selected === "string") {
      appendDebugLog("info", "open_file_dialog_selected", { path: selected });
      await openPdfFromPath(selected, "dialog");
    } else {
      appendDebugLog("debug", "open_file_dialog_cancelled");
    }
  }

  async function handleCloseFile() {
    await closePdf();
    if (filePath) {
      await removeIfExists(createRecoverySnapshotPath(filePath)).catch((cleanupError) => {
        appendDebugLog("warn", "recovery_snapshot_close_cleanup_failed", {
          filePath,
          error: String(cleanupError),
        });
      });
      recordAudit("close_pdf", "success", { filePath });
    }
    setFilePath(null);
    setDocInfo(null);
    setCurrentPage(0);
    setScale(DEFAULT_SCALE);
    setViewMode(DEFAULT_VIEW_MODE);
    setAnnotationTool("none");
    setTextEditorEnabled(false);
    setFormFields([]);
    setCommentThreads([]);
    setCommentThreadFilter("all");
    setCommentsPanelVisible(false);
    setDocumentStructure(createEmptyDocumentStructureState());
    setEditableTextLines([]);
    setSignDialogOpen(false);
    setSignDialogDraft(createDefaultSignDialogDraft());
    setProtectDialogOpen(false);
    setProtectDialogDraft(createDefaultProtectDialogDraft());
    setWatermarkDialogOpen(false);
    setWatermarkDialogDraft(createDefaultWatermarkDialogDraft());
    setSplitDialogOpen(false);
    setSplitRangesInput("");
    setSplitTargetDirectory("");
    setUndoStack([]);
    setRedoStack([]);
    resetSearchState();
    setError(null);
  }

  const selectAnnotationTool = useCallback(
    (tool: AnnotationTool) => {
      if (tool !== "none" && viewMode !== "single") {
        setViewMode("single");
      }
      if (tool !== "none") {
        setTextEditorEnabled(false);
      }
      setAnnotationTool(tool);
    },
    [viewMode],
  );

  const goToPage = useCallback(
    (page: number) => {
      if (!docInfo) return;
      const clamped = Math.max(0, Math.min(page, docInfo.page_count - 1));
      setCurrentPage(clamped);
    },
    [docInfo],
  );

  const updateSearchQuery = useCallback((query: string) => {
    setSearchQuery(query);
  }, []);

  const jumpToSearchMatch = useCallback(
    (targetIndex: number, reason: "next" | "previous" | "initial") => {
      if (searchMatches.length === 0) {
        return;
      }

      const nextIndex =
        ((targetIndex % searchMatches.length) + searchMatches.length) %
        searchMatches.length;
      const match = searchMatches[nextIndex];
      if (!match) {
        return;
      }

      setActiveSearchMatchIndex(nextIndex);
      setCurrentPage(match.pageIndex);
      if (viewMode !== "single") {
        setViewMode("single");
      }
      appendDebugLog("debug", "search_match_selected", {
        reason,
        index: nextIndex + 1,
        total: searchMatches.length,
        page: match.pageIndex + 1,
      });
    },
    [searchMatches, viewMode],
  );

  const goToPreviousSearchMatch = useCallback(() => {
    jumpToSearchMatch(activeSearchMatchIndex - 1, "previous");
  }, [activeSearchMatchIndex, jumpToSearchMatch]);

  const goToNextSearchMatch = useCallback(() => {
    jumpToSearchMatch(activeSearchMatchIndex + 1, "next");
  }, [activeSearchMatchIndex, jumpToSearchMatch]);

  const copyCurrentPageText = useCallback(async () => {
    if (!filePath) return;

    setError(null);

    try {
      const pageLines =
        searchPageCacheRef.current.get(currentPage) ??
        (await extractEditableTextLines(await readFile(filePath), currentPage));
      searchPageCacheRef.current.set(currentPage, pageLines);

      const text = pageLines
        .map((line) => line.text.trim())
        .filter((line) => line.length > 0)
        .join("\n");
      if (text.length === 0) {
        setError("No extractable text found on this page.");
        return;
      }

      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
      } else {
        throw new Error("Clipboard API unavailable in this runtime.");
      }

      appendDebugLog("info", "copy_page_text_success", {
        filePath,
        page: currentPage + 1,
        lines: pageLines.length,
        characters: text.length,
      });
      recordAudit("copy_page_text", "success", {
        filePath,
        page: currentPage + 1,
      });
    } catch (err) {
      const reason = String(err);
      setError(`Copy page text failed: ${reason}`);
      appendDebugLog("error", "copy_page_text_failure", {
        filePath,
        page: currentPage + 1,
        error: reason,
      });
      recordAudit("copy_page_text", "failure", {
        filePath,
        page: currentPage + 1,
        reason,
      });
    }
  }, [currentPage, filePath, recordAudit]);

  const copyDocumentText = useCallback(async () => {
    if (!filePath) return;

    setError(null);

    try {
      const bytes = await readFile(filePath);
      const extracted = await extractDocumentText(bytes);
      const text = extracted
        .map((page) => {
          const body = page.lines.join("\n");
          return `--- Page ${page.pageIndex + 1} ---\n${body}`;
        })
        .join("\n\n")
        .trim();

      if (text.length === 0) {
        setError("No extractable text found in this document.");
        return;
      }

      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
      } else {
        throw new Error("Clipboard API unavailable in this runtime.");
      }

      appendDebugLog("info", "copy_document_text_success", {
        filePath,
        pages: extracted.length,
        characters: text.length,
      });
      recordAudit("copy_document_text", "success", {
        filePath,
        pages: extracted.length,
      });
    } catch (err) {
      const reason = String(err);
      setError(`Copy document text failed: ${reason}`);
      appendDebugLog("error", "copy_document_text_failure", {
        filePath,
        error: reason,
      });
      recordAudit("copy_document_text", "failure", {
        filePath,
        reason,
      });
    }
  }, [filePath, recordAudit]);

  const zoomIn = useCallback(() => {
    setScale((s) => Math.min(s + SCALE_STEP, MAX_SCALE));
  }, []);

  const zoomOut = useCallback(() => {
    setScale((s) => Math.max(s - SCALE_STEP, MIN_SCALE));
  }, []);

  const zoomReset = useCallback(() => {
    setScale(DEFAULT_SCALE);
  }, []);

  const fitToWidth = useCallback(() => {
    const pageWidthPt = docInfo?.pages[currentPage]?.width_pt ?? 0;
    const viewportWidthPx =
      typeof window !== "undefined" && Number.isFinite(window.innerWidth)
        ? window.innerWidth
        : pageWidthPt;
    const nextScale = calculateFitToWidthScale({
      pageWidthPt,
      viewportWidthPx,
      sidebarVisible,
      sidebarWidthPx: sidebarWidth,
      formPanelVisible,
      hasFormPanel: formFields.length > 0,
      commentsPanelVisible,
      hasCommentsPanel: commentThreads.length > 0,
      adminPanelVisible: adminConsoleOpen,
    });
    setViewMode("continuous");
    setScale(nextScale);
    appendDebugLog("info", "fit_to_width_applied", {
      page: currentPage + 1,
      pageWidthPt,
      viewportWidthPx,
      sidebarVisible,
      sidebarWidth,
      formPanelVisible,
      commentsPanelVisible,
      hasFormPanel: formFields.length > 0,
      commentThreadCount: commentThreads.length,
      adminPanelVisible: adminConsoleOpen,
      scale: nextScale,
    });
  }, [
    adminConsoleOpen,
    commentThreads.length,
    commentsPanelVisible,
    currentPage,
    docInfo,
    formFields.length,
    formPanelVisible,
    sidebarVisible,
    sidebarWidth,
  ]);

  const increaseSidebarWidth = useCallback(() => {
    setSidebarWidth((current) => clampSidebarWidth(current + SIDEBAR_WIDTH_STEP));
  }, []);

  const decreaseSidebarWidth = useCallback(() => {
    setSidebarWidth((current) => clampSidebarWidth(current - SIDEBAR_WIDTH_STEP));
  }, []);

  const toggleSidebarVisibility = useCallback(() => {
    setSidebarVisible((current) => {
      const next = !current;
      appendDebugLog("info", "sidebar_visibility_changed", {
        visible: next,
      });
      return next;
    });
  }, []);

  const toggleFormPanelVisibility = useCallback(() => {
    setFormPanelVisible((current) => {
      const next = !current;
      appendDebugLog("info", "form_panel_visibility_changed", {
        visible: next,
      });
      return next;
    });
  }, []);

  const toggleCommentsPanelVisibility = useCallback(() => {
    setCommentsPanelVisible((current) => {
      const next = !current;
      appendDebugLog("info", "comments_panel_visibility_changed", {
        visible: next,
      });
      return next;
    });
  }, []);

  const applyAnnotation = useCallback(
    async (payload: AnnotationPayload) => {
      if (!filePath) return;

      setAnnotationSaving(true);
      setError(null);

      try {
        const existingBytes = await readFile(filePath);
        const updatedBytes = await addAnnotation(existingBytes, payload);
        pushUndoSnapshot("add_annotation", existingBytes, currentPage);
        await writeDocumentSafely(
          filePath,
          updatedBytes,
          "add_annotation",
          existingBytes,
        );
        const updatedInfo = await openPdf(filePath);
        setDocInfo(updatedInfo);
        await loadDetectedFormFields(filePath);
        if (payload.type === "comment") {
          const commentMessage = payload.contents?.trim() || "Comment";
          setCommentThreads((previous) =>
            addCommentThread(previous, {
              pageIndex: payload.pageIndex,
              author: "Reviewer",
              message: commentMessage,
            }),
          );
          setCommentsPanelVisible(true);
        }
        recordAudit("add_annotation", "success", {
          annotationType: payload.type,
          page: payload.pageIndex + 1,
        });
      } catch (err) {
        setError(String(err));
        recordAudit("add_annotation", "failure", {
          annotationType: payload.type,
          reason: String(err),
        });
        throw err;
      } finally {
        setAnnotationSaving(false);
      }
    },
    [currentPage, filePath, loadDetectedFormFields, pushUndoSnapshot, recordAudit],
  );

  const filteredCommentThreads = useMemo(
    () =>
      filterCommentThreads(commentThreads, commentThreadFilter)
        .slice()
        .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt)),
    [commentThreadFilter, commentThreads],
  );

  const updateCommentStatus = useCallback(
    (threadId: string, status: CommentThreadStatus) => {
      setCommentThreads((previous) => setCommentThreadStatus(previous, threadId, status));
      recordAudit("comment_thread_status", "success", { threadId, status });
    },
    [recordAudit],
  );

  const replyToCommentThread = useCallback(
    (threadId: string, message: string) => {
      setCommentThreads((previous) =>
        addCommentReply(previous, threadId, {
          author: "Reviewer",
          message,
        }),
      );
      recordAudit("comment_thread_reply", "success", { threadId });
    },
    [recordAudit],
  );

  const exportCommentThreadsXfdf = useCallback(async () => {
    if (commentThreads.length === 0) {
      await alertDialog("No comment threads available to export.");
      return;
    }

    const outputPath = await save({
      filters: [{ name: "XFDF", extensions: ["xfdf"] }],
      defaultPath: filePath ? replaceFileExtension(filePath, "-comments.xfdf") : "comments.xfdf",
    });
    if (!outputPath) return;

    setDocumentSaving(true);
    setError(null);
    try {
      const payload = exportCommentThreadsAsXfdf(commentThreads, filePath);
      await writeFile(outputPath, new TextEncoder().encode(payload));
      recordAudit("export_comments_xfdf", "success", {
        outputPath,
        threadCount: commentThreads.length,
      });
    } catch (err) {
      setError(String(err));
      recordAudit("export_comments_xfdf", "failure", { reason: String(err) });
    } finally {
      setDocumentSaving(false);
    }
  }, [alertDialog, commentThreads, filePath, recordAudit]);

  const exportCommentThreadsFdf = useCallback(async () => {
    if (commentThreads.length === 0) {
      await alertDialog("No comment threads available to export.");
      return;
    }

    const outputPath = await save({
      filters: [{ name: "FDF", extensions: ["fdf"] }],
      defaultPath: filePath ? replaceFileExtension(filePath, "-comments.fdf") : "comments.fdf",
    });
    if (!outputPath) return;

    setDocumentSaving(true);
    setError(null);
    try {
      const payload = exportCommentThreadsAsFdf(commentThreads, filePath);
      await writeFile(outputPath, new TextEncoder().encode(payload));
      recordAudit("export_comments_fdf", "success", {
        outputPath,
        threadCount: commentThreads.length,
      });
    } catch (err) {
      setError(String(err));
      recordAudit("export_comments_fdf", "failure", { reason: String(err) });
    } finally {
      setDocumentSaving(false);
    }
  }, [alertDialog, commentThreads, filePath, recordAudit]);

  const updateFormField = useCallback(
    async (name: string, value: FieldValue) => {
      if (!filePath) return;

      setFormSaving(true);
      setError(null);
      const startedAt = performance.now();
      appendDebugLog("info", "form_field_update_start", {
        filePath,
        fieldName: name,
      });

      try {
        const existingBytes = await readFile(filePath);
        const updatedBytes = await fillFormFields(existingBytes, {
          [name]: value,
        });
        pushUndoSnapshot("update_form_field", existingBytes, currentPage);
        await writeDocumentSafely(
          filePath,
          updatedBytes,
          "update_form_field",
          existingBytes,
        );

        const updatedInfo = await openPdf(filePath);
        setDocInfo(updatedInfo);
        const refreshedFields = await getFormFields(updatedBytes);
        setFormFields(refreshedFields);
        appendDebugLog("info", "form_field_update_success", {
          filePath,
          fieldName: name,
          durationMs: Math.round(performance.now() - startedAt),
        });
      } catch (err) {
        setError(String(err));
        appendDebugLog("error", "form_field_update_failure", {
          filePath,
          fieldName: name,
          durationMs: Math.round(performance.now() - startedAt),
          error: String(err),
        });
        throw err;
      } finally {
        setFormSaving(false);
      }
    },
    [currentPage, filePath, pushUndoSnapshot],
  );

  const applyDocumentMutation = useCallback(
    async (
      mutation: (bytes: Uint8Array) => Promise<Uint8Array>,
      onUpdated?: (updatedInfo: DocumentInfo) => void,
      auditAction: string = "document_mutation",
    ) => {
      if (!filePath) return;

      setDocumentSaving(true);
      setError(null);
      const startedAt = performance.now();
      appendDebugLog("info", "document_mutation_start", {
        action: auditAction,
        filePath,
      });

      try {
        const existingBytes = await readFile(filePath);
        const updatedBytes = await mutation(existingBytes);
        pushUndoSnapshot(auditAction, existingBytes, currentPage);
        await writeDocumentSafely(filePath, updatedBytes, auditAction, existingBytes);

        const updatedInfo = await openPdf(filePath);
        onUpdated?.(updatedInfo);
        setDocInfo(updatedInfo);
        await loadDetectedFormFields(filePath);
        recordAudit(auditAction, "success", { filePath });
        appendDebugLog("info", "document_mutation_success", {
          action: auditAction,
          filePath,
          durationMs: Math.round(performance.now() - startedAt),
        });
      } catch (err) {
        setError(String(err));
        recordAudit(auditAction, "failure", { filePath, reason: String(err) });
        appendDebugLog("error", "document_mutation_failure", {
          action: auditAction,
          filePath,
          durationMs: Math.round(performance.now() - startedAt),
          error: String(err),
        });
        throw err;
      } finally {
        setDocumentSaving(false);
      }
    },
    [currentPage, filePath, loadDetectedFormFields, pushUndoSnapshot, recordAudit],
  );

  const addFormField = useCallback(async () => {
    if (!filePath || !docInfo) {
      return;
    }

    const nameInput = await promptDialog(
      "New field name:",
      `field_${Date.now()}`,
    );
    if (!nameInput || nameInput.trim().length === 0) {
      return;
    }

    const kindInput = await promptDialog(
      "Field type (text|checkbox|radio|dropdown|listbox):",
      "text",
    );
    if (!kindInput) {
      return;
    }

    const kind = kindInput.trim().toLowerCase() as FormFieldKind;
    if (!["text", "checkbox", "radio", "dropdown", "listbox"].includes(kind)) {
      setError("Invalid field type. Use text, checkbox, radio, dropdown, or listbox.");
      return;
    }

    const pageInfo = docInfo.pages[currentPage];
    const defaultRect = pageInfo
      ? `36,${Math.max(24, Math.round(pageInfo.height_pt - 96))},220,24`
      : "36,700,220,24";
    const rectInput = await promptDialog("Field rectangle (x,y,width,height):", defaultRect);
    if (!rectInput) {
      return;
    }

    let rect: { x: number; y: number; width: number; height: number };
    try {
      rect = parseRectInput(rectInput, "form field rectangle");
    } catch (err) {
      setError(String(err));
      return;
    }

    const payload: CreateFormFieldPayload = {
      pageIndex: currentPage,
      name: nameInput.trim(),
      kind,
      rect,
    };

    if (kind === "text") {
      const multiline = await confirmDialog("Make this a multiline text field?");
      const defaultValue = await promptDialog("Default text value (optional):", "");
      payload.multiline = multiline;
      payload.defaultValue = defaultValue ?? "";
    } else if (kind === "checkbox") {
      payload.defaultValue = await confirmDialog("Default checked?");
    } else if (kind === "radio" || kind === "dropdown" || kind === "listbox") {
      const optionsInput = await promptDialog(
        "Comma-separated options:",
        "Option A,Option B,Option C",
      );
      if (!optionsInput) {
        return;
      }
      const options = optionsInput
        .split(",")
        .map((option) => option.trim())
        .filter((option) => option.length > 0);
      if (options.length === 0) {
        setError("At least one option is required.");
        return;
      }
      payload.options = options;
      if (kind === "listbox") {
        const defaultsInput = await promptDialog(
          "Default selected options (comma-separated, optional):",
          options[0] ?? "",
        );
        payload.defaultValue = defaultsInput
          ? defaultsInput
              .split(",")
              .map((value) => value.trim())
              .filter((value) => value.length > 0)
          : [];
      } else {
        const defaultOption = await promptDialog(
          "Default selected option:",
          options[0] ?? "",
        );
        payload.defaultValue = defaultOption ?? options[0] ?? "";
      }
    }

    await applyDocumentMutation(
      (bytes) => addFormFieldToDocument(bytes, payload),
      undefined,
      "add_form_field",
    );
  }, [applyDocumentMutation, confirmDialog, currentPage, docInfo, filePath, promptDialog]);

  const removeFormField = useCallback(
    async (fieldName: string) => {
      if (!filePath) {
        return;
      }

      const shouldRemove = await confirmDialog(
        `Remove form field '${fieldName}' from this document?`,
      );
      if (!shouldRemove) {
        return;
      }

      await applyDocumentMutation(
        (bytes) => removeFormFieldFromDocument(bytes, fieldName),
        undefined,
        "remove_form_field",
      );
    },
    [applyDocumentMutation, confirmDialog, filePath],
  );

  const replaceTextMatchesOnCurrentPage = useCallback(async () => {
    if (!filePath || !docInfo) return;

    const query = await promptDialog("Find text on current page:", "");
    if (!query) return;
    const replacement = await promptDialog("Replace with:", "");
    if (replacement === null) return;
    const caseSensitive = await confirmDialog("Use case-sensitive matching?");
    let replacedLines = 0;

    await applyDocumentMutation(
      async (bytes) => {
        const result = await replaceTextMatchesOnPage(
          bytes,
          currentPage,
          query,
          replacement,
          {
            caseSensitive,
          },
        );
        replacedLines = result.replacedLines;
        return result.bytes;
      },
      async () => {
        if (filePath) {
          await loadEditableLines(filePath, currentPage);
        }
      },
      "replace_text_matches_page",
    );

    appendDebugLog("info", "replace_text_matches_page_done", {
      filePath,
      page: currentPage + 1,
      query,
      replacement,
      caseSensitive,
      replacedLines,
    });
    recordAudit("replace_text_matches_page", "success", {
      filePath,
      page: currentPage + 1,
      replacedLines,
      caseSensitive,
    });
  }, [
    applyDocumentMutation,
    confirmDialog,
    currentPage,
    docInfo,
    filePath,
    loadEditableLines,
    promptDialog,
    recordAudit,
  ]);

  const replaceTextMatchesAcrossDocument = useCallback(async () => {
    if (!filePath || !docInfo) return;

    const query = await promptDialog("Find text across entire document:", "");
    if (!query) return;
    const replacement = await promptDialog("Replace with:", "");
    if (replacement === null) return;
    const shouldReplace = await confirmDialog(
      `Replace matches across all ${docInfo.page_count} pages?`,
    );
    if (!shouldReplace) return;
    const caseSensitive = await confirmDialog("Use case-sensitive matching?");

    let replacedLines = 0;
    let touchedPages = 0;

    await applyDocumentMutation(
      async (bytes) => {
        let nextBytes = bytes;
        for (let pageIndex = 0; pageIndex < docInfo.page_count; pageIndex += 1) {
          const result = await replaceTextMatchesOnPage(
            nextBytes,
            pageIndex,
            query,
            replacement,
            {
              caseSensitive,
            },
          );
          nextBytes = result.bytes;
          if (result.replacedLines > 0) {
            touchedPages += 1;
          }
          replacedLines += result.replacedLines;
        }
        return nextBytes;
      },
      async () => {
        if (filePath) {
          await loadEditableLines(filePath, currentPage);
        }
      },
      "replace_text_matches_document",
    );

    appendDebugLog("info", "replace_text_matches_document_done", {
      filePath,
      query,
      replacement,
      caseSensitive,
      touchedPages,
      replacedLines,
      totalPages: docInfo.page_count,
    });
    recordAudit("replace_text_matches_document", "success", {
      filePath,
      caseSensitive,
      touchedPages,
      replacedLines,
      totalPages: docInfo.page_count,
    });
  }, [
    applyDocumentMutation,
    confirmDialog,
    currentPage,
    docInfo,
    filePath,
    loadEditableLines,
    promptDialog,
    recordAudit,
  ]);

  const rotateCurrentPage = useCallback(
    async (degrees: 90 | 270) => {
      if (!filePath) return;

      await applyDocumentMutation(
        (bytes) => rotatePage(bytes, currentPage, degrees),
        undefined,
        "rotate_page",
      );
    },
    [applyDocumentMutation, currentPage, filePath],
  );

  const rotateEntireDocument = useCallback(async () => {
    if (!filePath) return;

    await applyDocumentMutation(
      (bytes) => rotateAllPages(bytes, 90),
      undefined,
      "rotate_all_pages",
    );
  }, [applyDocumentMutation, filePath]);

  const deleteCurrentPage = useCallback(async () => {
    if (!docInfo) {
      appendDebugLog("warn", "delete_page_blocked_no_document", {
        filePath,
        page: currentPage + 1,
      });
      return;
    }

    appendDebugLog("info", "delete_page_requested", {
      filePath,
      page: currentPage + 1,
      pageCount: docInfo.page_count,
    });

    if (docInfo.page_count <= 1) {
      setError("At least one page must remain in the document.");
      appendDebugLog("warn", "delete_page_blocked_minimum_pages", {
        filePath,
        page: currentPage + 1,
        pageCount: docInfo.page_count,
      });
      return;
    }

    const shouldDelete = await confirmDialog(
      `Delete page ${currentPage + 1}? This cannot be undone.`,
    );
    if (!shouldDelete) {
      appendDebugLog("info", "delete_page_cancelled", {
        filePath,
        page: currentPage + 1,
      });
      return;
    }

    appendDebugLog("info", "delete_page_confirmed", {
      filePath,
      page: currentPage + 1,
      pageCount: docInfo.page_count,
    });

    await applyDocumentMutation(
      (bytes) => removePage(bytes, currentPage),
      (updatedInfo) => {
        setCurrentPage(
          Math.max(0, Math.min(currentPage, updatedInfo.page_count - 1)),
        );
      },
      "delete_page",
    );
  }, [applyDocumentMutation, confirmDialog, currentPage, docInfo, filePath]);

  const duplicateCurrentPage = useCallback(async () => {
    if (!docInfo || docInfo.page_count <= 0) {
      return;
    }

    await applyDocumentMutation(
      (bytes) => duplicatePdfPage(bytes, currentPage),
      (updatedInfo) => {
        setCurrentPage(Math.max(0, Math.min(currentPage + 1, updatedInfo.page_count - 1)));
      },
      "duplicate_page",
    );
  }, [applyDocumentMutation, currentPage, docInfo]);

  const insertBlankPage = useCallback(async () => {
    if (!docInfo || docInfo.page_count <= 0) {
      return;
    }

    appendDebugLog("info", "insert_blank_page_requested", {
      filePath,
      page: currentPage + 1,
      pageCount: docInfo.page_count,
    });

    await applyDocumentMutation(
      (bytes) => insertBlankPageAfter(bytes, currentPage),
      (updatedInfo) => {
        const insertedPage = Math.max(0, Math.min(currentPage + 1, updatedInfo.page_count - 1));
        setCurrentPage(insertedPage);
      },
      "insert_blank_page",
    );
  }, [applyDocumentMutation, currentPage, docInfo, filePath]);

  const replaceCurrentPage = useCallback(async () => {
    if (!filePath || !docInfo || docInfo.page_count <= 0) {
      return;
    }

    const replacementPath = await open({
      multiple: false,
      filters: [{ name: "PDF", extensions: ["pdf"] }],
    });
    if (typeof replacementPath !== "string") {
      appendDebugLog("debug", "replace_page_picker_cancelled");
      return;
    }

    const replacementPageInput = await promptDialog(
      "Replacement page number:",
      "1",
    );
    if (replacementPageInput === null) {
      appendDebugLog("debug", "replace_page_number_cancelled", {
        replacementPath,
      });
      return;
    }

    const replacementPageIndex = Math.max(
      0,
      Number.parseInt(replacementPageInput, 10) - 1 || 0,
    );

    appendDebugLog("info", "replace_page_requested", {
      filePath,
      page: currentPage + 1,
      replacementPath,
      replacementPage: replacementPageIndex + 1,
    });

    await applyDocumentMutation(
      async (bytes) => {
        const replacementBytes = await readFile(replacementPath);
        return replacePageWithExternalPage(
          bytes,
          currentPage,
          replacementBytes,
          replacementPageIndex,
        );
      },
      () => {
        setCurrentPage(Math.max(0, Math.min(currentPage, docInfo.page_count - 1)));
      },
      "replace_page",
    );
  }, [applyDocumentMutation, currentPage, docInfo, filePath, promptDialog]);

  const reorderPages = useCallback(
    async (newOrder: number[]) => {
      await applyDocumentMutation(
        (bytes) => reorderPdfPages(bytes, newOrder),
        () => {
          const nextCurrentPage = newOrder.findIndex(
            (index) => index === currentPage,
          );
          if (nextCurrentPage >= 0) {
            setCurrentPage(nextCurrentPage);
          }
        },
        "reorder_pages",
      );
    },
    [applyDocumentMutation, currentPage],
  );

  const extractCurrentPage = useCallback(async () => {
    if (!filePath) return;

    const outputPath = await save({
      filters: [{ name: "PDF", extensions: ["pdf"] }],
      defaultPath: filePath.replace(/\.pdf$/i, `-page-${currentPage + 1}.pdf`),
    });
    if (!outputPath) return;

    setDocumentSaving(true);
    setError(null);

    try {
      const existingBytes = await readFile(filePath);
      const extractedBytes = await extractPdfPages(existingBytes, [currentPage]);
      await writeFile(outputPath, extractedBytes);
      recordAudit("extract_page", "success", {
        filePath,
        page: currentPage + 1,
        outputPath,
      });
    } catch (err) {
      setError(String(err));
      recordAudit("extract_page", "failure", { filePath, reason: String(err) });
    } finally {
      setDocumentSaving(false);
    }
  }, [currentPage, filePath, recordAudit]);

  const printDocument = useCallback(() => {
    if (!filePath) return;

    appendDebugLog("info", "print_document_start", {
      filePath,
    });
    try {
      window.print();
      recordAudit("print_document", "success", { filePath });
      appendDebugLog("info", "print_document_success", {
        filePath,
      });
    } catch (err) {
      setError(String(err));
      recordAudit("print_document", "failure", {
        filePath,
        reason: String(err),
      });
      appendDebugLog("error", "print_document_failure", {
        filePath,
        error: String(err),
      });
    }
  }, [filePath, recordAudit]);

  const openSplitDialog = useCallback(() => {
    if (!filePath || !docInfo) return;

    setSignDialogOpen(false);
    setSignDialogDraft(createDefaultSignDialogDraft());
    setProtectDialogOpen(false);
    setProtectDialogDraft(createDefaultProtectDialogDraft());
    setWatermarkDialogOpen(false);
    setWatermarkDialogDraft(createDefaultWatermarkDialogDraft());
    setAddImageDialogOpen(false);
    setAddImageDialogDraft(createDefaultAddImageDialogDraft());
    setRemoveImageAreaDialogOpen(false);
    setRemoveImageAreaDialogDraft(createDefaultRemoveImageAreaDialogDraft());
    setRedactionDialogOpen(false);
    setRedactionDialogDraft(createDefaultRedactionDialogDraft());
    setExportEncryptedCopyDialogOpen(false);
    setExportEncryptedCopyDialogDraft(createDefaultExportEncryptedCopyDialogDraft(filePath));
    setImportEncryptedCopyDialogOpen(false);
    setImportEncryptedCopyDialogDraft(createDefaultImportEncryptedCopyDialogDraft());
    setExportImagesDialogOpen(false);
    setExportImagesDialogDraft(createDefaultExportImagesDialogDraft(filePath));
    setSplitRangesInput(`1-${docInfo.page_count}`);
    setSplitTargetDirectory("");
    setSplitDialogOpen(true);
    appendDebugLog("info", "split_pdf_dialog_opened", {
      filePath,
      pageCount: docInfo.page_count,
    });
  }, [docInfo, filePath]);

  const closeSplitDialog = useCallback(() => {
    setSplitDialogOpen(false);
    appendDebugLog("debug", "split_pdf_dialog_closed", {
      filePath,
    });
  }, [filePath]);

  const pickSplitDirectory = useCallback(async () => {
    const targetDirectory = await open({
      multiple: false,
      directory: true,
    });
    if (typeof targetDirectory !== "string") {
      appendDebugLog("debug", "split_pdf_directory_picker_cancelled");
      return;
    }

    setSplitTargetDirectory(targetDirectory);
    appendDebugLog("info", "split_pdf_directory_selected", {
      targetDirectory,
    });
  }, []);

  const splitDocumentByRanges = useCallback(async () => {
    if (!filePath || !docInfo) return;
    if (splitRangesInput.trim().length === 0) {
      setError("Provide at least one split range.");
      appendDebugLog("warn", "split_pdf_validation_failed", {
        reason: "missing_ranges",
      });
      return;
    }
    if (splitTargetDirectory.trim().length === 0) {
      setError("Choose an output folder for split files.");
      appendDebugLog("warn", "split_pdf_validation_failed", {
        reason: "missing_target_directory",
      });
      return;
    }

    let ranges: PageRange[] = [];
    try {
      ranges = parseSplitRangesInput(splitRangesInput, docInfo.page_count);
    } catch (err) {
      setError(String(err));
      appendDebugLog("warn", "split_pdf_validation_failed", {
        reason: "invalid_ranges",
        rangesInput: splitRangesInput,
      });
      return;
    }

    const startedAt = performance.now();
    appendDebugLog("info", "split_pdf_start", {
      filePath,
      rangeCount: ranges.length,
      targetDirectory: splitTargetDirectory,
    });
    setDocumentSaving(true);
    setError(null);

    try {
      const existingBytes = await readFile(filePath);
      const parts = await splitPdf(existingBytes, ranges);
      const baseName = (filePath.split("/").pop() ?? "document").replace(/\.pdf$/i, "");

      for (let index = 0; index < parts.length; index += 1) {
        const bytes = parts[index];
        if (!bytes) {
          continue;
        }
        const outputPath = `${splitTargetDirectory}/${baseName}-part-${String(index + 1).padStart(2, "0")}.pdf`;
        await writeFile(outputPath, bytes);
      }

      recordAudit("split_pdf", "success", {
        filePath,
        parts: parts.length,
      });
      appendDebugLog("info", "split_pdf_success", {
        filePath,
        parts: parts.length,
        durationMs: Math.round(performance.now() - startedAt),
      });
      setSplitDialogOpen(false);
    } catch (err) {
      setError(String(err));
      recordAudit("split_pdf", "failure", {
        filePath,
        reason: String(err),
      });
      appendDebugLog("error", "split_pdf_failure", {
        filePath,
        rangeCount: ranges.length,
        durationMs: Math.round(performance.now() - startedAt),
        error: String(err),
      });
    } finally {
      setDocumentSaving(false);
    }
  }, [docInfo, filePath, recordAudit, splitRangesInput, splitTargetDirectory]);

  const mergeIntoDocument = useCallback(async () => {
    if (!filePath) return;

    const selected = await open({
      multiple: true,
      filters: [{ name: "PDF", extensions: ["pdf"] }],
    });

    const selectedPaths = Array.isArray(selected)
      ? selected
      : typeof selected === "string"
        ? [selected]
        : [];

    if (selectedPaths.length === 0) return;

    const sourcePaths = [filePath, ...selectedPaths.filter((path) => path !== filePath)];

    await applyDocumentMutation(async () => {
      const buffers = await Promise.all(sourcePaths.map((path) => readFile(path)));
      return mergePdfs(buffers);
    }, undefined, "merge_pdfs");
  }, [applyDocumentMutation, filePath]);

  const openExportEncryptedCopyDialog = useCallback(() => {
    if (!filePath) return;

    setSplitDialogOpen(false);
    setSignDialogOpen(false);
    setSignDialogDraft(createDefaultSignDialogDraft());
    setProtectDialogOpen(false);
    setProtectDialogDraft(createDefaultProtectDialogDraft());
    setWatermarkDialogOpen(false);
    setWatermarkDialogDraft(createDefaultWatermarkDialogDraft());
    setAddImageDialogOpen(false);
    setAddImageDialogDraft(createDefaultAddImageDialogDraft());
    setRemoveImageAreaDialogOpen(false);
    setRemoveImageAreaDialogDraft(createDefaultRemoveImageAreaDialogDraft());
    setRedactionDialogOpen(false);
    setRedactionDialogDraft(createDefaultRedactionDialogDraft());
    setImportEncryptedCopyDialogOpen(false);
    setImportEncryptedCopyDialogDraft(createDefaultImportEncryptedCopyDialogDraft());
    setExportImagesDialogOpen(false);
    setExportImagesDialogDraft(createDefaultExportImagesDialogDraft(filePath));
    setExportEncryptedCopyDialogDraft(
      createDefaultExportEncryptedCopyDialogDraft(filePath),
    );
    setExportEncryptedCopyDialogOpen(true);
    appendDebugLog("info", "export_encrypted_copy_dialog_opened", {
      filePath,
    });
  }, [filePath]);

  const closeExportEncryptedCopyDialog = useCallback(() => {
    setExportEncryptedCopyDialogOpen(false);
    setExportEncryptedCopyDialogDraft(
      createDefaultExportEncryptedCopyDialogDraft(filePath),
    );
    appendDebugLog("debug", "export_encrypted_copy_dialog_closed", {
      filePath,
    });
  }, [filePath]);

  const pickExportEncryptedCopyPath = useCallback(async () => {
    if (!filePath) return;

    const outputPath = await save({
      filters: [{ name: "Encrypted PDFluent file", extensions: ["pdfluent.enc"] }],
      defaultPath:
        exportEncryptedCopyDialogDraft.outputPath.trim() ||
        filePath.replace(/\.pdf$/i, ".pdfluent.enc"),
    });
    if (typeof outputPath !== "string") {
      appendDebugLog("debug", "export_encrypted_copy_output_picker_cancelled");
      return;
    }

    setExportEncryptedCopyDialogDraft((current) => ({
      ...current,
      outputPath,
    }));
    appendDebugLog("info", "export_encrypted_copy_output_selected", {
      outputPath,
    });
  }, [exportEncryptedCopyDialogDraft.outputPath, filePath]);

  const exportEncryptedCopy = useCallback(async () => {
    if (!filePath) return;

    const outputPath = exportEncryptedCopyDialogDraft.outputPath.trim();
    if (outputPath.length === 0) {
      setError("Choose an output path for the encrypted copy.");
      appendDebugLog("warn", "export_encrypted_copy_validation_failed", {
        reason: "missing_output_path",
      });
      return;
    }

    const passphrase = exportEncryptedCopyDialogDraft.passphrase;
    if (passphrase.length === 0) {
      setError("Encryption passphrase is required.");
      appendDebugLog("warn", "export_encrypted_copy_validation_failed", {
        reason: "missing_passphrase",
      });
      return;
    }

    const confirmPassphrase = exportEncryptedCopyDialogDraft.confirmPassphrase;
    if (confirmPassphrase.length === 0) {
      setError("Confirm the encryption passphrase.");
      appendDebugLog("warn", "export_encrypted_copy_validation_failed", {
        reason: "missing_confirm_passphrase",
      });
      return;
    }

    if (passphrase !== confirmPassphrase) {
      setError("Passphrases did not match.");
      appendDebugLog("warn", "export_encrypted_copy_validation_failed", {
        reason: "mismatched_passphrase",
      });
      return;
    }

    const startedAt = performance.now();
    setDocumentSaving(true);
    setError(null);
    appendDebugLog("info", "export_encrypted_copy_start", {
      filePath,
      outputPath,
    });

    try {
      const documentBytes = await readFile(filePath);
      const encryptedBytes = await encryptBytes(documentBytes, passphrase);
      await writeFile(outputPath, encryptedBytes);
      recordAudit("export_encrypted_copy", "success", { outputPath });
      appendDebugLog("info", "export_encrypted_copy_success", {
        filePath,
        outputPath,
        durationMs: Math.round(performance.now() - startedAt),
      });
      setExportEncryptedCopyDialogOpen(false);
      setExportEncryptedCopyDialogDraft(
        createDefaultExportEncryptedCopyDialogDraft(filePath),
      );
    } catch (err) {
      setError(String(err));
      recordAudit("export_encrypted_copy", "failure", { reason: String(err) });
      appendDebugLog("error", "export_encrypted_copy_failure", {
        filePath,
        outputPath,
        durationMs: Math.round(performance.now() - startedAt),
        error: String(err),
      });
    } finally {
      setDocumentSaving(false);
    }
  }, [exportEncryptedCopyDialogDraft, filePath, recordAudit]);

  const openImportEncryptedCopyDialog = useCallback(() => {
    if (!filePath) return;

    setSplitDialogOpen(false);
    setSignDialogOpen(false);
    setSignDialogDraft(createDefaultSignDialogDraft());
    setProtectDialogOpen(false);
    setProtectDialogDraft(createDefaultProtectDialogDraft());
    setWatermarkDialogOpen(false);
    setWatermarkDialogDraft(createDefaultWatermarkDialogDraft());
    setAddImageDialogOpen(false);
    setAddImageDialogDraft(createDefaultAddImageDialogDraft());
    setRemoveImageAreaDialogOpen(false);
    setRemoveImageAreaDialogDraft(createDefaultRemoveImageAreaDialogDraft());
    setRedactionDialogOpen(false);
    setRedactionDialogDraft(createDefaultRedactionDialogDraft());
    setExportEncryptedCopyDialogOpen(false);
    setExportEncryptedCopyDialogDraft(
      createDefaultExportEncryptedCopyDialogDraft(filePath),
    );
    setExportImagesDialogOpen(false);
    setExportImagesDialogDraft(createDefaultExportImagesDialogDraft(filePath));
    setImportEncryptedCopyDialogDraft(createDefaultImportEncryptedCopyDialogDraft());
    setImportEncryptedCopyDialogOpen(true);
    appendDebugLog("info", "import_encrypted_copy_dialog_opened", {
      filePath,
    });
  }, [filePath]);

  const closeImportEncryptedCopyDialog = useCallback(() => {
    setImportEncryptedCopyDialogOpen(false);
    setImportEncryptedCopyDialogDraft(createDefaultImportEncryptedCopyDialogDraft());
    appendDebugLog("debug", "import_encrypted_copy_dialog_closed", {
      filePath,
    });
  }, [filePath]);

  const pickImportEncryptedCopyPath = useCallback(async () => {
    const encryptedPath = await open({
      multiple: false,
      filters: [{ name: "Encrypted PDFluent file", extensions: ["pdfluent.enc"] }],
    });
    if (typeof encryptedPath !== "string") {
      appendDebugLog("debug", "import_encrypted_copy_input_picker_cancelled");
      return;
    }

    setImportEncryptedCopyDialogDraft((current) => ({
      ...current,
      encryptedPath,
      outputPath:
        current.outputPath.trim() ||
        encryptedPath.replace(/\.pdfluent\.enc$/i, ".pdf"),
    }));
    appendDebugLog("info", "import_encrypted_copy_input_selected", {
      encryptedPath,
    });
  }, []);

  const pickImportDecryptedOutputPath = useCallback(async () => {
    const outputPath = await save({
      filters: [{ name: "PDF", extensions: ["pdf"] }],
      defaultPath:
        importEncryptedCopyDialogDraft.outputPath.trim() ||
        (importEncryptedCopyDialogDraft.encryptedPath
          ? importEncryptedCopyDialogDraft.encryptedPath.replace(
              /\.pdfluent\.enc$/i,
              ".pdf",
            )
          : "decrypted-copy.pdf"),
    });
    if (typeof outputPath !== "string") {
      appendDebugLog("debug", "import_encrypted_copy_output_picker_cancelled");
      return;
    }

    setImportEncryptedCopyDialogDraft((current) => ({
      ...current,
      outputPath,
    }));
    appendDebugLog("info", "import_encrypted_copy_output_selected", {
      outputPath,
    });
  }, [importEncryptedCopyDialogDraft.encryptedPath, importEncryptedCopyDialogDraft.outputPath]);

  const importEncryptedCopy = useCallback(async () => {
    const encryptedPath = importEncryptedCopyDialogDraft.encryptedPath.trim();
    if (encryptedPath.length === 0) {
      setError("Choose an encrypted input file.");
      appendDebugLog("warn", "import_encrypted_copy_validation_failed", {
        reason: "missing_encrypted_path",
      });
      return;
    }

    const passphrase = importEncryptedCopyDialogDraft.passphrase;
    if (passphrase.length === 0) {
      setError("Passphrase is required.");
      appendDebugLog("warn", "import_encrypted_copy_validation_failed", {
        reason: "missing_passphrase",
      });
      return;
    }

    const outputPath = importEncryptedCopyDialogDraft.outputPath.trim();
    if (outputPath.length === 0) {
      setError("Choose an output path for the decrypted PDF.");
      appendDebugLog("warn", "import_encrypted_copy_validation_failed", {
        reason: "missing_output_path",
      });
      return;
    }

    const startedAt = performance.now();
    setLoading(true);
    setError(null);
    appendDebugLog("info", "import_encrypted_copy_start", {
      encryptedPath,
      outputPath,
    });

    try {
      const encryptedBytes = await readFile(encryptedPath);
      const decryptedBytes = await decryptBytes(encryptedBytes, passphrase);
      await writeFile(outputPath, decryptedBytes);

      const info = await openPdf(outputPath);
      setFilePath(outputPath);
      setDocInfo(info);
      setCurrentPage(0);
      setScale(DEFAULT_SCALE);
      setViewMode(DEFAULT_VIEW_MODE);
      resetSearchState();
      await loadDetectedFormFields(outputPath);
      recordAudit("import_encrypted_copy", "success", { outputPath });
      appendDebugLog("info", "import_encrypted_copy_success", {
        outputPath,
        durationMs: Math.round(performance.now() - startedAt),
      });
      setImportEncryptedCopyDialogOpen(false);
      setImportEncryptedCopyDialogDraft(createDefaultImportEncryptedCopyDialogDraft());
    } catch (err) {
      setError(String(err));
      recordAudit("import_encrypted_copy", "failure", { reason: String(err) });
      appendDebugLog("error", "import_encrypted_copy_failure", {
        encryptedPath,
        outputPath,
        durationMs: Math.round(performance.now() - startedAt),
        error: String(err),
      });
    } finally {
      setLoading(false);
    }
  }, [importEncryptedCopyDialogDraft, loadDetectedFormFields, recordAudit, resetSearchState]);

  const toggleNetworkMode = useCallback(() => {
    setNetworkMode((current) => {
      const next = current === "offline" ? "online" : "offline";
      writeNetworkMode(next);
      recordAudit("toggle_network_mode", "success", { mode: next });
      return next;
    });
  }, [recordAudit]);

  const toggleTextEditor = useCallback(() => {
    if (viewMode !== "single") {
      setViewMode("single");
    }
    setAnnotationTool("none");
    setTextEditorEnabled((enabled) => !enabled);
  }, [viewMode]);

  const openSignDialog = useCallback(async () => {
    if (!filePath) return;

    setSplitDialogOpen(false);
    setProtectDialogOpen(false);
    setProtectDialogDraft(createDefaultProtectDialogDraft());
    setWatermarkDialogOpen(false);
    setWatermarkDialogDraft(createDefaultWatermarkDialogDraft());
    setAddImageDialogOpen(false);
    setAddImageDialogDraft(createDefaultAddImageDialogDraft());
    setRemoveImageAreaDialogOpen(false);
    setRemoveImageAreaDialogDraft(createDefaultRemoveImageAreaDialogDraft());
    setRedactionDialogOpen(false);
    setRedactionDialogDraft(createDefaultRedactionDialogDraft());
    setExportEncryptedCopyDialogOpen(false);
    setExportEncryptedCopyDialogDraft(createDefaultExportEncryptedCopyDialogDraft(filePath));
    setImportEncryptedCopyDialogOpen(false);
    setImportEncryptedCopyDialogDraft(createDefaultImportEncryptedCopyDialogDraft());
    setExportImagesDialogOpen(false);
    setExportImagesDialogDraft(createDefaultExportImagesDialogDraft(filePath));
    setSignDialogDraft(createDefaultSignDialogDraft());
    setSignDialogOpen(true);
    appendDebugLog("info", "sign_dialog_opened", {
      filePath,
      page: currentPage + 1,
    });
  }, [currentPage, filePath]);

  const closeSignDialog = useCallback(() => {
    setSignDialogOpen(false);
    setSignDialogDraft(createDefaultSignDialogDraft());
    appendDebugLog("debug", "sign_dialog_closed", {
      filePath,
    });
  }, [filePath]);

  const selectSignCertificate = useCallback(async () => {
    const certPath = await open({
      multiple: false,
      filters: [{ name: "Certificate", extensions: ["p12", "pfx"] }],
    });

    if (typeof certPath !== "string") {
      appendDebugLog("debug", "sign_certificate_picker_cancelled");
      return;
    }

    setSignDialogDraft((current) => ({
      ...current,
      certPath,
    }));
    appendDebugLog("info", "sign_certificate_selected", { certPath });
  }, []);

  const signDocument = useCallback(async () => {
    if (!filePath) return;

    const certPath = signDialogDraft.certPath.trim();
    const signerName = signDialogDraft.signerName.trim();
    if (certPath.length === 0) {
      setError("Choose a signing certificate (.p12 or .pfx).");
      appendDebugLog("warn", "sign_dialog_validation_failed", {
        reason: "missing_certificate",
      });
      return;
    }
    if (signerName.length === 0) {
      setError("Signer name is required.");
      appendDebugLog("warn", "sign_dialog_validation_failed", {
        reason: "missing_signer_name",
      });
      return;
    }

    const x = parseNumberInput(signDialogDraft.x, 36);
    const y = parseNumberInput(signDialogDraft.y, 36);
    const width = Math.max(20, parseNumberInput(signDialogDraft.width, 220));
    const height = Math.max(20, parseNumberInput(signDialogDraft.height, 70));
    const password = signDialogDraft.password;
    const reason = signDialogDraft.reason.trim();
    const location = signDialogDraft.location.trim();
    const contactInfo = signDialogDraft.contactInfo.trim();

    setSigning(true);
    setError(null);
    const startedAt = performance.now();
    appendDebugLog("info", "sign_document_start", {
      filePath,
      certPath,
      page: currentPage + 1,
    });

    try {
      const [documentBytes, p12Bytes] = await Promise.all([
        readFile(filePath),
        readFile(certPath),
      ]);

      const signedBytes = await signPdfWithCertificate(documentBytes, {
        pageIndex: currentPage,
        rect: {
          x,
          y,
          width,
          height,
        },
        p12Bytes,
        password,
        signerName,
        reason: reason.length > 0 ? reason : undefined,
        location: location.length > 0 ? location : undefined,
        contactInfo: contactInfo.length > 0 ? contactInfo : undefined,
      });

      pushUndoSnapshot("sign_document", documentBytes, currentPage);
      await writeDocumentSafely(
        filePath,
        signedBytes,
        "sign_document",
        documentBytes,
      );
      const updatedInfo = await openPdf(filePath);
      setDocInfo(updatedInfo);
      await loadDetectedFormFields(filePath);
      recordAudit("sign_document", "success", { filePath });
      appendDebugLog("info", "sign_document_success", {
        filePath,
        certPath,
        page: currentPage + 1,
        durationMs: Math.round(performance.now() - startedAt),
      });
      setSignDialogOpen(false);
      setSignDialogDraft(createDefaultSignDialogDraft());
    } catch (err) {
      setError(String(err));
      recordAudit("sign_document", "failure", { reason: String(err) });
      appendDebugLog("error", "sign_document_failure", {
        filePath,
        certPath,
        page: currentPage + 1,
        durationMs: Math.round(performance.now() - startedAt),
        error: String(err),
      });
    } finally {
      setSigning(false);
    }
  }, [
    currentPage,
    filePath,
    loadDetectedFormFields,
    pushUndoSnapshot,
    recordAudit,
    signDialogDraft,
  ]);

  const checkForAppUpdates = useCallback(async () => {
    if (networkMode !== "online") {
      setError("Network mode is offline. Enable network mode to check updates.");
      return;
    }

    setCheckingUpdates(true);
    setError(null);

    try {
      const update = await checkForUpdates();
      if (!update) {
        await alertDialog("No updates available.");
        recordAudit("check_updates", "success", { available: false });
        return;
      }

      const shouldInstall = await confirmDialog(
        `Update ${update.version} is available. Download and install now?`,
      );
      if (!shouldInstall) {
        await update.close();
        recordAudit("check_updates", "warning", { available: true, installed: false });
        return;
      }

      await update.downloadAndInstall();
      await update.close();

      await alertDialog(
        "Update installed successfully. Restart PDFluent to use the new version.",
      );
      recordAudit("check_updates", "success", { available: true, installed: true });
    } catch (err) {
      setError(`Update check failed: ${String(err)}`);
      recordAudit("check_updates", "failure", { reason: String(err) });
    } finally {
      setCheckingUpdates(false);
    }
  }, [alertDialog, confirmDialog, networkMode, recordAudit]);

  const openAddImageDialog = useCallback(() => {
    if (!filePath) return;

    setSplitDialogOpen(false);
    setSignDialogOpen(false);
    setSignDialogDraft(createDefaultSignDialogDraft());
    setProtectDialogOpen(false);
    setProtectDialogDraft(createDefaultProtectDialogDraft());
    setWatermarkDialogOpen(false);
    setWatermarkDialogDraft(createDefaultWatermarkDialogDraft());
    setRemoveImageAreaDialogOpen(false);
    setRemoveImageAreaDialogDraft(createDefaultRemoveImageAreaDialogDraft());
    setRedactionDialogOpen(false);
    setRedactionDialogDraft(createDefaultRedactionDialogDraft());
    setExportEncryptedCopyDialogOpen(false);
    setExportEncryptedCopyDialogDraft(createDefaultExportEncryptedCopyDialogDraft(filePath));
    setImportEncryptedCopyDialogOpen(false);
    setImportEncryptedCopyDialogDraft(createDefaultImportEncryptedCopyDialogDraft());
    setExportImagesDialogOpen(false);
    setExportImagesDialogDraft(createDefaultExportImagesDialogDraft(filePath));
    setAddImageDialogDraft(createDefaultAddImageDialogDraft());
    setAddImageDialogOpen(true);
    appendDebugLog("info", "add_image_dialog_opened", {
      filePath,
      page: currentPage + 1,
    });
  }, [currentPage, filePath]);

  const closeAddImageDialog = useCallback(() => {
    setAddImageDialogOpen(false);
    setAddImageDialogDraft(createDefaultAddImageDialogDraft());
    appendDebugLog("debug", "add_image_dialog_closed", {
      filePath,
    });
  }, [filePath]);

  const pickAddImageFile = useCallback(async () => {
    const imagePath = await open({
      multiple: false,
      filters: [
        { name: "PNG", extensions: ["png"] },
        { name: "JPEG", extensions: ["jpg", "jpeg"] },
      ],
    });

    if (typeof imagePath !== "string") {
      appendDebugLog("debug", "add_image_dialog_file_picker_cancelled");
      return;
    }

    setAddImageDialogDraft((current) => ({
      ...current,
      imagePath,
    }));
    appendDebugLog("info", "add_image_dialog_file_selected", {
      imagePath,
    });
  }, []);

  const addImageOnCurrentPage = useCallback(async () => {
    if (!filePath) return;

    const imagePath = addImageDialogDraft.imagePath.trim();
    if (imagePath.length === 0) {
      setError("Choose an image file (PNG or JPEG).");
      appendDebugLog("warn", "add_image_dialog_validation_failed", {
        reason: "missing_image_path",
      });
      return;
    }

    const x = parseNumberInput(addImageDialogDraft.x, 36);
    const y = parseNumberInput(addImageDialogDraft.y, 36);
    const width = Math.max(16, parseNumberInput(addImageDialogDraft.width, 220));
    const height = Math.max(16, parseNumberInput(addImageDialogDraft.height, 160));
    const opacity = Math.max(
      0,
      Math.min(1, parseNumberInput(addImageDialogDraft.opacity, 1)),
    );
    const rotationDegrees = parseNumberInput(addImageDialogDraft.rotationDegrees, 0);
    const layerOrder = parseLayerOrderInput(addImageDialogDraft.layerOrder, "front");

    appendDebugLog("info", "add_image_start", {
      filePath,
      page: currentPage + 1,
      imagePath,
      x,
      y,
      width,
      height,
      opacity,
      rotationDegrees,
      layerOrder,
    });

    await applyDocumentMutation(
      async (bytes) => {
        const imageBytes = await readFile(imagePath);
        const mimeType = imagePath.toLowerCase().endsWith(".png")
          ? "image/png"
          : "image/jpeg";

        return addImageToPage(
          bytes,
          currentPage,
          imageBytes,
          mimeType,
          {
            x,
            y,
            width,
            height,
          },
          {
            opacity,
            rotationDegrees,
            layerOrder,
          },
        );
      },
      undefined,
      "add_image",
    );

    setAddImageDialogOpen(false);
    setAddImageDialogDraft(createDefaultAddImageDialogDraft());
  }, [addImageDialogDraft, applyDocumentMutation, currentPage, filePath]);

  const openRemoveImageAreaDialog = useCallback(() => {
    if (!filePath) return;

    setSplitDialogOpen(false);
    setSignDialogOpen(false);
    setSignDialogDraft(createDefaultSignDialogDraft());
    setProtectDialogOpen(false);
    setProtectDialogDraft(createDefaultProtectDialogDraft());
    setWatermarkDialogOpen(false);
    setWatermarkDialogDraft(createDefaultWatermarkDialogDraft());
    setAddImageDialogOpen(false);
    setAddImageDialogDraft(createDefaultAddImageDialogDraft());
    setRedactionDialogOpen(false);
    setRedactionDialogDraft(createDefaultRedactionDialogDraft());
    setExportEncryptedCopyDialogOpen(false);
    setExportEncryptedCopyDialogDraft(createDefaultExportEncryptedCopyDialogDraft(filePath));
    setImportEncryptedCopyDialogOpen(false);
    setImportEncryptedCopyDialogDraft(createDefaultImportEncryptedCopyDialogDraft());
    setExportImagesDialogOpen(false);
    setExportImagesDialogDraft(createDefaultExportImagesDialogDraft(filePath));
    setRemoveImageAreaDialogDraft(createDefaultRemoveImageAreaDialogDraft());
    setRemoveImageAreaDialogOpen(true);
    appendDebugLog("info", "remove_image_area_dialog_opened", {
      filePath,
      page: currentPage + 1,
    });
  }, [currentPage, filePath]);

  const closeRemoveImageAreaDialog = useCallback(() => {
    setRemoveImageAreaDialogOpen(false);
    setRemoveImageAreaDialogDraft(createDefaultRemoveImageAreaDialogDraft());
    appendDebugLog("debug", "remove_image_area_dialog_closed", {
      filePath,
    });
  }, [filePath]);

  const removeImageAreaOnCurrentPage = useCallback(async () => {
    if (!filePath) return;

    const x = parseNumberInput(removeImageAreaDialogDraft.x, 36);
    const y = parseNumberInput(removeImageAreaDialogDraft.y, 36);
    const width = Math.max(
      12,
      parseNumberInput(removeImageAreaDialogDraft.width, 220),
    );
    const height = Math.max(
      12,
      parseNumberInput(removeImageAreaDialogDraft.height, 160),
    );

    appendDebugLog("info", "remove_image_area_start", {
      filePath,
      page: currentPage + 1,
      x,
      y,
      width,
      height,
    });

    await applyDocumentMutation(
      (bytes) =>
        removeImageAreaFromPage(bytes, currentPage, {
          x,
          y,
          width,
          height,
        }),
      undefined,
      "remove_image_area",
    );

    setRemoveImageAreaDialogOpen(false);
    setRemoveImageAreaDialogDraft(createDefaultRemoveImageAreaDialogDraft());
  }, [applyDocumentMutation, currentPage, filePath, removeImageAreaDialogDraft]);

  const replaceImageAreaOnCurrentPage = useCallback(async () => {
    if (!filePath || !docInfo) return;

    const replacementPath = await open({
      multiple: false,
      filters: [
        { name: "PNG", extensions: ["png"] },
        { name: "JPEG", extensions: ["jpg", "jpeg"] },
      ],
    });
    if (typeof replacementPath !== "string") {
      appendDebugLog("debug", "replace_image_area_picker_cancelled");
      return;
    }

    const pageInfo = docInfo.pages[currentPage];
    const defaultRect = pageInfo
      ? `0,0,${Math.round(pageInfo.width_pt)},${Math.round(pageInfo.height_pt)}`
      : "36,36,220,160";
    const rectInput = await promptDialog(
      "Replacement rectangle (x,y,width,height):",
      defaultRect,
    );
    if (!rectInput) return;

    let rect: { x: number; y: number; width: number; height: number };
    try {
      rect = parseRectInput(rectInput, "image replacement rectangle");
    } catch (err) {
      setError(String(err));
      appendDebugLog("warn", "replace_image_area_validation_failed", {
        reason: String(err),
      });
      return;
    }

    const rotationDegrees = parseNumberInput(
      await promptDialog("Image rotation degrees:", "0"),
      0,
    );
    const opacity = Math.max(
      0,
      Math.min(1, parseNumberInput(await promptDialog("Image opacity (0-1):", "1"), 1)),
    );
    const layerOrderInput = await promptDialog("Image layer order (front|back):", "front");
    if (!layerOrderInput) return;
    const layerOrderNormalized = layerOrderInput.trim().toLowerCase();
    if (layerOrderNormalized !== "front" && layerOrderNormalized !== "back") {
      setError("Invalid layer order. Use front or back.");
      appendDebugLog("warn", "replace_image_area_validation_failed", {
        reason: "invalid_layer_order",
        value: layerOrderInput,
      });
      return;
    }
    const layerOrder = parseLayerOrderInput(layerOrderInput, "front");

    await applyDocumentMutation(
      async (bytes) => {
        const replacementBytes = await readFile(replacementPath);
        const mimeType = replacementPath.toLowerCase().endsWith(".png")
          ? "image/png"
          : "image/jpeg";
        return replaceImageAreaOnPage(
          bytes,
          currentPage,
          replacementBytes,
          mimeType,
          rect,
          {
            opacity,
            rotationDegrees,
            layerOrder,
          },
        );
      },
      undefined,
      "replace_image_area",
    );
  }, [applyDocumentMutation, currentPage, docInfo, filePath, promptDialog]);

  const cropCurrentPage = useCallback(async () => {
    if (!filePath || !docInfo) return;

    const pageInfo = docInfo.pages[currentPage];
    const defaultRect = pageInfo
      ? `0,0,${Math.round(pageInfo.width_pt)},${Math.round(pageInfo.height_pt)}`
      : "0,0,612,792";
    const rectInput = await promptDialog(
      "Crop rectangle (x,y,width,height):",
      defaultRect,
    );
    if (!rectInput) {
      appendDebugLog("debug", "crop_page_cancelled", {
        filePath,
        page: currentPage + 1,
      });
      return;
    }

    let rect: { x: number; y: number; width: number; height: number };
    try {
      rect = parseRectInput(rectInput, "crop rectangle");
    } catch (err) {
      setError(String(err));
      appendDebugLog("warn", "crop_page_validation_failed", {
        filePath,
        page: currentPage + 1,
        reason: String(err),
      });
      return;
    }

    await applyDocumentMutation(
      (bytes) => cropPageToRect(bytes, currentPage, rect),
      undefined,
      "crop_page",
    );
  }, [applyDocumentMutation, currentPage, docInfo, filePath, promptDialog]);

  const openRedactionDialog = useCallback(() => {
    if (!filePath) return;

    setSplitDialogOpen(false);
    setSignDialogOpen(false);
    setSignDialogDraft(createDefaultSignDialogDraft());
    setProtectDialogOpen(false);
    setProtectDialogDraft(createDefaultProtectDialogDraft());
    setWatermarkDialogOpen(false);
    setWatermarkDialogDraft(createDefaultWatermarkDialogDraft());
    setAddImageDialogOpen(false);
    setAddImageDialogDraft(createDefaultAddImageDialogDraft());
    setRemoveImageAreaDialogOpen(false);
    setRemoveImageAreaDialogDraft(createDefaultRemoveImageAreaDialogDraft());
    setExportEncryptedCopyDialogOpen(false);
    setExportEncryptedCopyDialogDraft(createDefaultExportEncryptedCopyDialogDraft(filePath));
    setImportEncryptedCopyDialogOpen(false);
    setImportEncryptedCopyDialogDraft(createDefaultImportEncryptedCopyDialogDraft());
    setExportImagesDialogOpen(false);
    setExportImagesDialogDraft(createDefaultExportImagesDialogDraft(filePath));
    setRedactionDialogDraft(createDefaultRedactionDialogDraft());
    setRedactionDialogOpen(true);
    appendDebugLog("info", "redaction_dialog_opened", {
      filePath,
      page: currentPage + 1,
    });
  }, [currentPage, filePath]);

  const closeRedactionDialog = useCallback(() => {
    setRedactionDialogOpen(false);
    setRedactionDialogDraft(createDefaultRedactionDialogDraft());
    appendDebugLog("debug", "redaction_dialog_closed", {
      filePath,
    });
  }, [filePath]);

  const redactCurrentPage = useCallback(async () => {
    if (!filePath) return;

    const raw = redactionDialogDraft.regions.trim();
    if (raw.length === 0) {
      setError("Provide at least one redaction region.");
      appendDebugLog("warn", "redaction_dialog_validation_failed", {
        reason: "missing_regions",
      });
      return;
    }

    let regions: RedactionRegion[] = [];
    try {
      regions = parseRedactionRegions(raw);
    } catch (err) {
      setError(String(err));
      appendDebugLog("warn", "redaction_dialog_validation_failed", {
        reason: "invalid_regions",
        regionsInput: raw,
      });
      return;
    }

    appendDebugLog("info", "redaction_start", {
      filePath,
      page: currentPage + 1,
      regionCount: regions.length,
    });
    const sanitizeMetadata = await confirmDialog(
      "Also sanitize document metadata for safer forensic redaction?",
    );
    await applyDocumentMutation(
      (bytes) =>
        redactPageRegions(bytes, currentPage, regions, {
          sanitizeMetadata,
        }),
      undefined,
      "redact_page",
    );

    setRedactionDialogOpen(false);
    setRedactionDialogDraft(createDefaultRedactionDialogDraft());
  }, [
    applyDocumentMutation,
    confirmDialog,
    currentPage,
    filePath,
    redactionDialogDraft,
  ]);

  const openWatermarkDialog = useCallback(() => {
    if (!filePath) return;

    setSplitDialogOpen(false);
    setSignDialogOpen(false);
    setSignDialogDraft(createDefaultSignDialogDraft());
    setProtectDialogOpen(false);
    setProtectDialogDraft(createDefaultProtectDialogDraft());
    setAddImageDialogOpen(false);
    setAddImageDialogDraft(createDefaultAddImageDialogDraft());
    setRemoveImageAreaDialogOpen(false);
    setRemoveImageAreaDialogDraft(createDefaultRemoveImageAreaDialogDraft());
    setRedactionDialogOpen(false);
    setRedactionDialogDraft(createDefaultRedactionDialogDraft());
    setExportEncryptedCopyDialogOpen(false);
    setExportEncryptedCopyDialogDraft(createDefaultExportEncryptedCopyDialogDraft(filePath));
    setImportEncryptedCopyDialogOpen(false);
    setImportEncryptedCopyDialogDraft(createDefaultImportEncryptedCopyDialogDraft());
    setExportImagesDialogOpen(false);
    setExportImagesDialogDraft(createDefaultExportImagesDialogDraft(filePath));
    setWatermarkDialogDraft(createDefaultWatermarkDialogDraft());
    setWatermarkDialogOpen(true);
    appendDebugLog("info", "watermark_dialog_opened", {
      filePath,
    });
  }, [filePath]);

  const closeWatermarkDialog = useCallback(() => {
    setWatermarkDialogOpen(false);
    setWatermarkDialogDraft(createDefaultWatermarkDialogDraft());
    appendDebugLog("debug", "watermark_dialog_closed", {
      filePath,
    });
  }, [filePath]);

  const addWatermark = useCallback(async () => {
    if (!filePath) return;

    const text = watermarkDialogDraft.text.trim();
    if (text.length === 0) {
      setError("Watermark text is required.");
      appendDebugLog("warn", "watermark_dialog_validation_failed", {
        reason: "missing_text",
      });
      return;
    }

    const opacity = Math.max(
      0.05,
      Math.min(0.95, parseNumberInput(watermarkDialogDraft.opacity, 0.2)),
    );
    const rotationDegrees = parseNumberInput(watermarkDialogDraft.rotationDegrees, 30);
    const fontSize = Math.max(
      8,
      parseNumberInput(watermarkDialogDraft.fontSize, 42),
    );

    await applyDocumentMutation((bytes) =>
      addWatermarkToDocument(bytes, {
        text,
        opacity,
        rotationDegrees,
        fontSize,
      }),
      undefined,
      "add_watermark",
    );
    setWatermarkDialogOpen(false);
    setWatermarkDialogDraft(createDefaultWatermarkDialogDraft());
  }, [applyDocumentMutation, filePath, watermarkDialogDraft]);

  const addHeaderFooterAndBates = useCallback(async () => {
    if (!filePath || !docInfo) return;

    const headerText = await promptDialog(
      "Header text template (optional). Use {page} and {total}:",
      "",
    );
    if (headerText === null) return;
    const footerText = await promptDialog(
      "Footer text template (optional). Use {page} and {total}:",
      "",
    );
    if (footerText === null) return;
    const showPageNumbers = parseBooleanInput(
      await promptDialog("Show page numbers? (yes/no):", "yes"),
      true,
    );
    const pageNumberTemplate = await promptDialog(
      "Page number template:",
      "Page {page} of {total}",
    );
    if (pageNumberTemplate === null) return;
    const batesPrefix = await promptDialog("Bates prefix (optional):", "");
    if (batesPrefix === null) return;
    const batesStart = Math.max(
      1,
      Math.round(parseNumberInput(await promptDialog("Bates start number:", "1"), 1)),
    );
    const fontSize = Math.max(
      6,
      Math.min(24, parseNumberInput(await promptDialog("Header/footer font size:", "10"), 10)),
    );

    appendDebugLog("info", "header_footer_start", {
      filePath,
      pageCount: docInfo.page_count,
      showPageNumbers,
      hasHeader: headerText.trim().length > 0,
      hasFooter: footerText.trim().length > 0,
      hasBatesPrefix: batesPrefix.trim().length > 0,
      batesStart,
      fontSize,
    });

    await applyDocumentMutation(
      (bytes) =>
        addHeaderFooterToDocument(bytes, {
          headerText,
          footerText,
          showPageNumbers,
          pageNumberTemplate,
          batesPrefix,
          batesStart,
          fontSize,
        }),
      undefined,
      "add_header_footer",
    );
  }, [applyDocumentMutation, docInfo, filePath, promptDialog]);

  const exportAsDocx = useCallback(async () => {
    if (!filePath) return;

    const outputPath = await save({
      filters: [{ name: "Word Document", extensions: ["docx"] }],
      defaultPath: replaceFileExtension(filePath, ".docx"),
    });
    if (!outputPath) return;

    setDocumentSaving(true);
    setError(null);

    try {
      const existingBytes = await readFile(filePath);
      const docxBytes = await convertPdfToDocx(existingBytes);
      await writeFile(outputPath, docxBytes);
      recordAudit("export_docx", "success", { outputPath });
    } catch (err) {
      setError(String(err));
      recordAudit("export_docx", "failure", { reason: String(err) });
    } finally {
      setDocumentSaving(false);
    }
  }, [filePath, recordAudit]);

  const exportAsXlsx = useCallback(async () => {
    if (!filePath) return;

    const outputPath = await save({
      filters: [{ name: "XLSX", extensions: ["xlsx"] }],
      defaultPath: replaceFileExtension(filePath, ".xlsx"),
    });
    if (!outputPath) return;

    setDocumentSaving(true);
    setError(null);

    try {
      const existingBytes = await readFile(filePath);
      const xlsxBytes = await convertPdfToXlsx(existingBytes);
      await writeFile(outputPath, xlsxBytes);
      recordAudit("export_xlsx", "success", { filePath, outputPath });
    } catch (err) {
      setError(String(err));
      recordAudit("export_xlsx", "failure", { filePath, reason: String(err) });
    } finally {
      setDocumentSaving(false);
    }
  }, [filePath, recordAudit]);

  const exportAsPptx = useCallback(async () => {
    if (!filePath) return;

    const outputPath = await save({
      filters: [{ name: "PPTX", extensions: ["pptx"] }],
      defaultPath: replaceFileExtension(filePath, ".pptx"),
    });
    if (!outputPath) return;

    setDocumentSaving(true);
    setError(null);

    try {
      const existingBytes = await readFile(filePath);
      const pptxBytes = await convertPdfToPptx(existingBytes);
      await writeFile(outputPath, pptxBytes);
      recordAudit("export_pptx", "success", { filePath, outputPath });
    } catch (err) {
      setError(String(err));
      recordAudit("export_pptx", "failure", { filePath, reason: String(err) });
    } finally {
      setDocumentSaving(false);
    }
  }, [filePath, recordAudit]);

  const openExportImagesDialog = useCallback(() => {
    if (!filePath || !docInfo) return;

    setSplitDialogOpen(false);
    setSignDialogOpen(false);
    setSignDialogDraft(createDefaultSignDialogDraft());
    setProtectDialogOpen(false);
    setProtectDialogDraft(createDefaultProtectDialogDraft());
    setWatermarkDialogOpen(false);
    setWatermarkDialogDraft(createDefaultWatermarkDialogDraft());
    setAddImageDialogOpen(false);
    setAddImageDialogDraft(createDefaultAddImageDialogDraft());
    setRemoveImageAreaDialogOpen(false);
    setRemoveImageAreaDialogDraft(createDefaultRemoveImageAreaDialogDraft());
    setRedactionDialogOpen(false);
    setRedactionDialogDraft(createDefaultRedactionDialogDraft());
    setExportEncryptedCopyDialogOpen(false);
    setExportEncryptedCopyDialogDraft(createDefaultExportEncryptedCopyDialogDraft(filePath));
    setImportEncryptedCopyDialogOpen(false);
    setImportEncryptedCopyDialogDraft(createDefaultImportEncryptedCopyDialogDraft());
    setExportImagesDialogDraft(createDefaultExportImagesDialogDraft(filePath));
    setExportImagesDialogOpen(true);
    appendDebugLog("info", "export_images_dialog_opened", {
      filePath,
      pages: docInfo.page_count,
    });
  }, [docInfo, filePath]);

  const closeExportImagesDialog = useCallback(() => {
    setExportImagesDialogOpen(false);
    setExportImagesDialogDraft(createDefaultExportImagesDialogDraft(filePath));
    appendDebugLog("debug", "export_images_dialog_closed", {
      filePath,
    });
  }, [filePath]);

  const pickExportImagesOutputPath = useCallback(async () => {
    if (!filePath) return;

    const format = exportImagesDialogDraft.format;
    const outputPath = await save({
      filters: [
        {
          name: format === "png" ? "PNG Image" : "JPEG Image",
          extensions: [format],
        },
      ],
      defaultPath:
        exportImagesDialogDraft.outputPath.trim() ||
        replaceFileExtension(filePath, `.${format}`),
    });
    if (typeof outputPath !== "string") {
      appendDebugLog("debug", "export_images_output_picker_cancelled");
      return;
    }

    setExportImagesDialogDraft((current) => ({
      ...current,
      outputPath,
    }));
    appendDebugLog("info", "export_images_output_selected", {
      outputPath,
    });
  }, [exportImagesDialogDraft.format, exportImagesDialogDraft.outputPath, filePath]);

  const exportAsImages = useCallback(async () => {
    if (!filePath || !docInfo) return;

    const format = exportImagesDialogDraft.format;
    const outputPath = exportImagesDialogDraft.outputPath.trim();
    if (outputPath.length === 0) {
      setError("Choose an output path for exported images.");
      appendDebugLog("warn", "export_images_dialog_validation_failed", {
        reason: "missing_output_path",
      });
      return;
    }

    const scale = Math.max(
      1,
      Math.min(4, parseNumberInput(exportImagesDialogDraft.scale, 2)),
    );
    const quality = Math.max(
      0.4,
      Math.min(1, parseNumberInput(exportImagesDialogDraft.jpegQuality, 0.9)),
    );
    const basePath = outputPath.replace(/\.[^/.]+$/, "");

    setDocumentSaving(true);
    setError(null);
    const startedAt = performance.now();
    appendDebugLog("info", "export_images_start", {
      filePath,
      format,
      scale,
      quality,
      pages: docInfo.page_count,
      outputPath,
    });

    try {
      for (let index = 0; index < docInfo.page_count; index++) {
        const rendered = await renderPage(index, scale);
        const pngBytes = base64ToBytes(rendered.data_base64);
        const bytesToWrite =
          format === "jpg" ? await convertPngToJpeg(pngBytes, quality) : pngBytes;
        const pageOutput = `${basePath}-page-${String(index + 1).padStart(3, "0")}.${format}`;
        await writeFile(pageOutput, bytesToWrite);
      }
      recordAudit("export_images", "success", {
        format,
        pages: docInfo.page_count,
      });
      appendDebugLog("info", "export_images_success", {
        filePath,
        format,
        scale,
        quality,
        pages: docInfo.page_count,
        outputPath,
        durationMs: Math.round(performance.now() - startedAt),
      });
      setExportImagesDialogOpen(false);
      setExportImagesDialogDraft(createDefaultExportImagesDialogDraft(filePath));
    } catch (err) {
      setError(String(err));
      recordAudit("export_images", "failure", { reason: String(err) });
      appendDebugLog("error", "export_images_failure", {
        filePath,
        format,
        scale,
        quality,
        pages: docInfo.page_count,
        outputPath,
        durationMs: Math.round(performance.now() - startedAt),
        error: String(err),
      });
    } finally {
      setDocumentSaving(false);
    }
  }, [docInfo, exportImagesDialogDraft, filePath, recordAudit]);

  const convertImagesToPdf = useCallback(async () => {
    const selected = await open({
      multiple: true,
      filters: [
        { name: "Images", extensions: ["png", "jpg", "jpeg"] },
      ],
    });

    const imagePaths = Array.isArray(selected)
      ? selected
      : typeof selected === "string"
        ? [selected]
        : [];

    if (imagePaths.length === 0) return;

    const outputPath = await save({
      filters: [{ name: "PDF", extensions: ["pdf"] }],
      defaultPath: "images-to-pdf.pdf",
    });
    if (!outputPath) return;

    setDocumentSaving(true);
    setError(null);

    try {
      const images = await Promise.all(
        imagePaths.map(async (path) => ({
          name: path,
          bytes: await readFile(path),
        })),
      );
      const pdfBytes = await createPdfFromImages(images);
      await writeFile(outputPath, pdfBytes);
      recordAudit("create_pdf_from_images", "success", {
        images: imagePaths.length,
      });
    } catch (err) {
      setError(String(err));
      recordAudit("create_pdf_from_images", "failure", { reason: String(err) });
    } finally {
      setDocumentSaving(false);
    }
  }, [recordAudit]);

  const runOcrWorkflow = useCallback(async (preset?: OcrRunPreset) => {
    if (!filePath || !docInfo) return;
    if (networkMode !== "online") {
      appendDebugLog("info", "ocr_offline_mode_enabled", {
        filePath,
        mode: networkMode,
      });
    }

    const modeInput = await promptDialog("OCR mode (searchable|txt):", "searchable");
    if (!modeInput) return;
    const mode = modeInput.trim().toLowerCase();
    if (mode !== "searchable" && mode !== "txt") {
      setError("Invalid OCR mode. Use searchable or txt.");
      return;
    }

    const scopeInput = await promptDialog("OCR scope (current|all):", "current");
    if (!scopeInput) return;
    const scope = scopeInput.trim().toLowerCase();
    if (scope !== "current" && scope !== "all") {
      setError("Invalid OCR scope. Use current or all.");
      return;
    }

    const languageInput = await promptDialog(
      "OCR language code (PaddleOCR, e.g. en, nl, de, fr):",
      "en",
    );
    if (!languageInput) return;
    const language = languageInput.trim() || "en";

    const includeStructureInput = await promptDialog(
      "Enable PP-Structure layout analysis? (yes|no):",
      "yes",
    );
    if (!includeStructureInput) return;
    const includeStructureNormalized = includeStructureInput.trim().toLowerCase();
    if (
      includeStructureNormalized !== "yes" &&
      includeStructureNormalized !== "no"
    ) {
      setError("Invalid PP-Structure option. Use yes or no.");
      return;
    }
    const includeStructure = includeStructureNormalized === "yes";

    let forceOnTextPages = Boolean(preset?.forceOnTextPages);
    if (preset?.forceOnTextPages === undefined) {
      const skipNativeTextInput = await promptDialog(
        "Skip pages that already contain selectable text? (yes|no):",
        "yes",
      );
      if (!skipNativeTextInput) return;
      const skipNativeText = skipNativeTextInput.trim().toLowerCase();
      if (skipNativeText !== "yes" && skipNativeText !== "no") {
        setError("Invalid option. Use yes or no.");
        return;
      }
      forceOnTextPages = skipNativeText === "no";
    }

    let preprocessMode: OcrPreprocessMode =
      preset?.preprocessMode ?? "auto";
    if (!preset?.preprocessMode) {
      const preprocessModeInput = await promptDialog(
        "OCR preprocess mode (off|auto|manual):",
        "auto",
      );
      if (!preprocessModeInput) return;
      const normalized = preprocessModeInput.trim().toLowerCase();
      if (normalized !== "off" && normalized !== "auto" && normalized !== "manual") {
        setError("Invalid preprocess mode. Use off, auto, or manual.");
        return;
      }
      preprocessMode = normalized;
    }

    let manualSteps = normalizeManualPreprocessSteps(preset?.manualSteps ?? []);
    if (preprocessMode === "manual" && manualSteps.length === 0) {
      const stepsInput = await promptDialog(
        "Manual preprocessing steps (deskew,denoise,contrast):",
        "deskew,denoise,contrast",
      );
      if (!stepsInput) return;
      manualSteps = normalizeManualPreprocessSteps(
        stepsInput.split(","),
      );
      if (manualSteps.length === 0) {
        setError("Select at least one valid preprocessing step.");
        return;
      }
    }

    const pageIndexes =
      scope === "all"
        ? Array.from({ length: docInfo.page_count }, (_, index) => index)
        : [currentPage];

    setOcrProcessing(true);
    setError(null);

    try {
      const existingBytes = await readFile(filePath);
      const pageAssessments = await Promise.all(
        pageIndexes.map(async (pageIndex) => {
          try {
            const lines = await extractEditableTextLines(existingBytes, pageIndex);
            return {
              pageIndex,
              extractableTextLength: lines.reduce(
                (total, line) => total + line.text.trim().length,
                0,
              ),
            };
          } catch (err) {
            appendDebugLog("warn", "ocr_native_text_probe_failed", {
              filePath,
              page: pageIndex + 1,
              error: String(err),
            });
            return {
              pageIndex,
              extractableTextLength: 0,
            };
          }
        }),
      );

      const ocrPolicy = buildOcrPolicy({
        mode: preprocessMode,
        manualSteps,
        forceOnTextPages,
        pageAssessments,
      });

      for (const skipped of ocrPolicy.skippedPages) {
        appendDebugLog("info", "ocr_page_skipped_native_text", {
          filePath,
          page: skipped.pageIndex + 1,
          reason: skipped.reason,
        });
      }

      if (ocrPolicy.shouldRunPages.length === 0) {
        setError("OCR skipped: selected pages already contain selectable text.");
        recordAudit("run_ocr", "success", {
          filePath,
          mode,
          scope,
          language,
          includeStructure,
          pagesRequested: pageIndexes.length,
          pagesProcessed: 0,
          pagesSkipped: ocrPolicy.skippedPages.length,
          reason: "native_text_detected",
        });
        return;
      }

      const textOutputs: Array<{ page: number; text: string }> = [];
      const structureOutputs: Array<{ page: number; blocks: unknown[] }> = [];
      const ocrLayers: OcrPageLayerInput[] = [];
      let preprocessAppliedPages = 0;
      let averageConfidenceTotal = 0;

      for (const pageIndex of ocrPolicy.shouldRunPages) {
        appendDebugLog("info", "ocr_page_start", {
          filePath,
          page: pageIndex + 1,
          scope,
          mode,
          language,
          includeStructure,
          preprocessMode: ocrPolicy.mode,
          preprocessSteps: ocrPolicy.steps,
        });
        const rendered = await renderPage(pageIndex, 2);
        const result = await runPaddleOcr({
          image_base64: rendered.data_base64,
          language,
          include_structure: includeStructure,
          preprocess_mode: ocrPolicy.mode,
          preprocess_steps: ocrPolicy.steps,
          auto_confidence_threshold: 0.72,
        });
        const text = result.text.trim();
        textOutputs.push({
          page: pageIndex + 1,
          text,
        });
        structureOutputs.push({
          page: pageIndex + 1,
          blocks: result.structure_blocks,
        });
        if (result.preprocessing_applied) {
          preprocessAppliedPages += 1;
        }
        averageConfidenceTotal += result.average_confidence;

        const words: OcrWordBox[] = result.words
          .map((word) => ({
            text: String(word.text ?? ""),
            x0: Number(word.x0 ?? 0),
            y0: Number(word.y0 ?? 0),
            x1: Number(word.x1 ?? 0),
            y1: Number(word.y1 ?? 0),
            confidence: Number(word.confidence ?? 0),
          }))
          .filter((word) => {
            const width = word.x1 - word.x0;
            const height = word.y1 - word.y0;
            return word.text.trim().length > 0 && width > 0.5 && height > 0.5;
          });

        ocrLayers.push({
          pageIndex,
          words,
          renderedWidth: rendered.width,
          renderedHeight: rendered.height,
        });

        appendDebugLog("info", "ocr_page_success", {
          filePath,
          page: pageIndex + 1,
          engine: result.engine,
          language: result.language,
          recognizedWords: words.length,
          textLength: text.length,
          structureBlocks: result.structure_blocks.length,
          averageConfidence: result.average_confidence,
          preprocessingApplied: result.preprocessing_applied,
          preprocessingMode: result.preprocessing_mode,
          preprocessingSteps: result.preprocessing_steps,
          preprocessingReason: result.preprocessing_reason,
          qualityMetrics: result.quality_metrics,
        });
      }

      if (mode === "txt") {
        const defaultPath =
          scope === "all"
            ? replaceFileExtension(filePath, "-ocr.txt")
            : replaceFileExtension(filePath, `-page-${currentPage + 1}.txt`);
        const outputPath = await save({
          filters: [{ name: "Text", extensions: ["txt"] }],
          defaultPath,
        });
        if (!outputPath) return;

        const skippedSummary =
          ocrPolicy.skippedPages.length > 0
            ? `\n\n--- Skipped pages (native text detected) ---\n${ocrPolicy.skippedPages
                .map((entry) => `Page ${entry.pageIndex + 1}`)
                .join(", ")}`
            : "";
        const outputText =
          textOutputs
            .map(
              (entry) =>
                `--- Page ${entry.page} ---\n${
                  entry.text.length > 0 ? entry.text : "(No OCR text found)"
                }`,
            )
            .join("\n\n") + skippedSummary;

        await writeFile(outputPath, new TextEncoder().encode(outputText));

        if (includeStructure) {
          const structurePath = replaceFileExtension(outputPath, ".structure.json");
          const structurePayload = {
            engine: "paddleocr_ppocrv5_ppstructure",
            sourceFile: filePath,
            language,
            preprocessMode: ocrPolicy.mode,
            preprocessSteps: ocrPolicy.steps,
            skippedPages: ocrPolicy.skippedPages,
            pages: structureOutputs,
          };
          await writeFile(
            structurePath,
            new TextEncoder().encode(JSON.stringify(structurePayload, null, 2)),
          );
          appendDebugLog("info", "ocr_structure_exported", {
            filePath,
            outputPath: structurePath,
            pages: structureOutputs.length,
            blocks: structureOutputs.reduce(
              (total, page) => total + page.blocks.length,
              0,
            ),
          });
        }
        recordAudit("run_ocr", "success", {
          filePath,
          pagesRequested: pageIndexes.length,
          pagesProcessed: ocrPolicy.shouldRunPages.length,
          pagesSkipped: ocrPolicy.skippedPages.length,
          outputPath,
          mode,
          scope,
          language,
          includeStructure,
          preprocessMode: ocrPolicy.mode,
          preprocessSteps: ocrPolicy.steps.join(","),
          preprocessAppliedPages,
          averageConfidence:
            ocrPolicy.shouldRunPages.length > 0
              ? averageConfidenceTotal / ocrPolicy.shouldRunPages.length
              : 0,
        });
        return;
      }

      if (ocrLayers.length === 0) {
        setError("OCR produced no searchable words for the selected pages.");
        return;
      }

      const updatedBytes = await addOcrTextLayerToPages(existingBytes, ocrLayers);
      pushUndoSnapshot("ocr_searchable_layer", existingBytes, currentPage);
      await writeDocumentSafely(
        filePath,
        updatedBytes,
        "ocr_searchable_layer",
        existingBytes,
      );

      const updatedInfo = await openPdf(filePath);
      setDocInfo(updatedInfo);
      await loadEditableLines(filePath, currentPage);
      recordAudit("run_ocr", "success", {
        filePath,
        pagesRequested: pageIndexes.length,
        pagesProcessed: ocrPolicy.shouldRunPages.length,
        pagesSkipped: ocrPolicy.skippedPages.length,
        mode,
        scope,
        language,
        includeStructure,
        preprocessMode: ocrPolicy.mode,
        preprocessSteps: ocrPolicy.steps.join(","),
        preprocessAppliedPages,
        averageConfidence:
          ocrPolicy.shouldRunPages.length > 0
            ? averageConfidenceTotal / ocrPolicy.shouldRunPages.length
            : 0,
        recognizedWords: ocrLayers.reduce(
          (total, layer) => total + layer.words.length,
          0,
        ),
      });
    } catch (err) {
      setError(`OCR failed: ${String(err)}`);
      recordAudit("run_ocr", "failure", { reason: String(err) });
    } finally {
      setOcrProcessing(false);
    }
  }, [
    currentPage,
    docInfo,
    filePath,
    loadEditableLines,
    networkMode,
    promptDialog,
    pushUndoSnapshot,
    recordAudit,
  ]);

  const runOcrOnCurrentPage = useCallback(async () => {
    await runOcrWorkflow();
  }, [runOcrWorkflow]);

  const runEnhancedOcrOnCurrentPage = useCallback(async () => {
    await runOcrWorkflow({
      preprocessMode: "manual",
      manualSteps: ["deskew", "denoise", "contrast"],
      forceOnTextPages: true,
    });
  }, [runOcrWorkflow]);

  const openProtectDialog = useCallback(() => {
    if (!filePath) return;

    setSplitDialogOpen(false);
    setSignDialogOpen(false);
    setSignDialogDraft(createDefaultSignDialogDraft());
    setWatermarkDialogOpen(false);
    setWatermarkDialogDraft(createDefaultWatermarkDialogDraft());
    setAddImageDialogOpen(false);
    setAddImageDialogDraft(createDefaultAddImageDialogDraft());
    setRemoveImageAreaDialogOpen(false);
    setRemoveImageAreaDialogDraft(createDefaultRemoveImageAreaDialogDraft());
    setRedactionDialogOpen(false);
    setRedactionDialogDraft(createDefaultRedactionDialogDraft());
    setExportEncryptedCopyDialogOpen(false);
    setExportEncryptedCopyDialogDraft(createDefaultExportEncryptedCopyDialogDraft(filePath));
    setImportEncryptedCopyDialogOpen(false);
    setImportEncryptedCopyDialogDraft(createDefaultImportEncryptedCopyDialogDraft());
    setExportImagesDialogOpen(false);
    setExportImagesDialogDraft(createDefaultExportImagesDialogDraft(filePath));
    setProtectDialogDraft(createDefaultProtectDialogDraft());
    setProtectDialogOpen(true);
    appendDebugLog("info", "protect_dialog_opened", {
      filePath,
    });
  }, [filePath]);

  const closeProtectDialog = useCallback(() => {
    setProtectDialogOpen(false);
    setProtectDialogDraft(createDefaultProtectDialogDraft());
    appendDebugLog("debug", "protect_dialog_closed", {
      filePath,
    });
  }, [filePath]);

  const protectDocument = useCallback(async () => {
    if (!filePath) return;

    const userPassword = protectDialogDraft.userPassword.trim();
    if (userPassword.length === 0) {
      setError("User password is required.");
      appendDebugLog("warn", "protect_dialog_validation_failed", {
        reason: "missing_user_password",
      });
      return;
    }

    const ownerPassword = protectDialogDraft.ownerPassword.trim();

    await applyDocumentMutation((bytes) =>
      protectPdfWithPassword(
        bytes,
        userPassword,
        ownerPassword.length > 0 ? ownerPassword : undefined,
      ),
      undefined,
      "protect_pdf",
    );
    setProtectDialogOpen(false);
    setProtectDialogDraft(createDefaultProtectDialogDraft());
  }, [applyDocumentMutation, filePath, protectDialogDraft]);

  const validatePdfA = useCallback(async () => {
    if (!filePath) return;

    setDocumentSaving(true);
    setError(null);

    try {
      const existingBytes = await readFile(filePath);
      const report = await validatePdfAReadiness(existingBytes);
      const summary = report.checks
        .map(
          (check) =>
            `${check.pass ? "PASS" : "FAIL"} - ${check.rule}: ${check.detail}`,
        )
        .join("\n");
      await alertDialog(
        `PDF/A readiness: ${report.compliant ? "PASS" : "FAIL"}\n\n${summary}`,
      );
      recordAudit("validate_pdfa", report.compliant ? "success" : "warning");
    } catch (err) {
      setError(String(err));
      recordAudit("validate_pdfa", "failure", { reason: String(err) });
    } finally {
      setDocumentSaving(false);
    }
  }, [alertDialog, filePath, recordAudit]);

  const exportPdfAReadyCopy = useCallback(async () => {
    if (!filePath) return;

    const outputPath = await save({
      filters: [{ name: "PDF", extensions: ["pdf"] }],
      defaultPath: replaceFileExtension(filePath, "-pdfa.pdf"),
    });
    if (!outputPath) return;

    setDocumentSaving(true);
    setError(null);

    try {
      const existingBytes = await readFile(filePath);
      const pdfaBytes = await generatePdfAReadyCopy(existingBytes);
      await writeFile(outputPath, pdfaBytes);
      recordAudit("generate_pdfa_copy", "success", { outputPath });
    } catch (err) {
      setError(String(err));
      recordAudit("generate_pdfa_copy", "failure", { reason: String(err) });
    } finally {
      setDocumentSaving(false);
    }
  }, [filePath, recordAudit]);

  const validatePdfX = useCallback(async () => {
    if (!filePath) return;

    setDocumentSaving(true);
    setError(null);

    try {
      const existingBytes = await readFile(filePath);
      const report = await validatePdfXReadiness(existingBytes);
      const summary = report.checks
        .map(
          (check) =>
            `${check.pass ? "PASS" : "FAIL"} - ${check.rule}: ${check.detail}`,
        )
        .join("\n");
      await alertDialog(
        `PDF/X readiness: ${report.compliant ? "PASS" : "FAIL"}\n\n${summary}`,
      );
      recordAudit("validate_pdfx", report.compliant ? "success" : "warning");
    } catch (err) {
      setError(String(err));
      recordAudit("validate_pdfx", "failure", { reason: String(err) });
    } finally {
      setDocumentSaving(false);
    }
  }, [alertDialog, filePath, recordAudit]);

  const exportPdfXReadyCopy = useCallback(async () => {
    if (!filePath) return;

    const outputPath = await save({
      filters: [{ name: "PDF", extensions: ["pdf"] }],
      defaultPath: replaceFileExtension(filePath, "-pdfx.pdf"),
    });
    if (!outputPath) return;

    setDocumentSaving(true);
    setError(null);

    try {
      const existingBytes = await readFile(filePath);
      const pdfxBytes = await generatePdfXReadyCopy(existingBytes);
      await writeFile(outputPath, pdfxBytes);
      recordAudit("generate_pdfx_copy", "success", { outputPath });
    } catch (err) {
      setError(String(err));
      recordAudit("generate_pdfx_copy", "failure", { reason: String(err) });
    } finally {
      setDocumentSaving(false);
    }
  }, [filePath, recordAudit]);

  const runAccessibilityAssistant = useCallback(async () => {
    if (!filePath) return;

    setDocumentSaving(true);
    setError(null);

    try {
      const existingBytes = await readFile(filePath);
      const report = await validatePdfUaReadiness(existingBytes);
      const summary = report.checks
        .map(
          (check) =>
            `${check.pass ? "PASS" : "FAIL"} - ${check.rule}: ${check.detail}`,
        )
        .join("\n");

      if (report.compliant) {
        await alertDialog(`Accessibility assistant: PASS\n\n${summary}`);
        recordAudit("accessibility_assistant", "success", {
          compliant: true,
        });
        return;
      }

      const shouldAutofix = await confirmDialog(
        `Accessibility assistant found issues.\n\n${summary}\n\nApply auto-fix copy in-place now?`,
      );

      if (!shouldAutofix) {
        recordAudit("accessibility_assistant", "warning", {
          compliant: false,
          autofixApplied: false,
        });
        return;
      }

      await applyDocumentMutation(
        (bytes) => generatePdfUaReadyCopy(bytes),
        undefined,
        "accessibility_autofix",
      );

      const refreshedBytes = await readFile(filePath);
      const refreshedReport = await validatePdfUaReadiness(refreshedBytes);
      const refreshedSummary = refreshedReport.checks
        .map(
          (check) =>
            `${check.pass ? "PASS" : "FAIL"} - ${check.rule}: ${check.detail}`,
        )
        .join("\n");
      await alertDialog(
        `Accessibility auto-fix complete.\nResult: ${
          refreshedReport.compliant ? "PASS" : "PARTIAL"
        }\n\n${refreshedSummary}`,
      );
      recordAudit(
        "accessibility_assistant",
        refreshedReport.compliant ? "success" : "warning",
        {
          compliant: refreshedReport.compliant,
          autofixApplied: true,
        },
      );
    } catch (err) {
      setError(String(err));
      recordAudit("accessibility_assistant", "failure", { reason: String(err) });
    } finally {
      setDocumentSaving(false);
    }
  }, [alertDialog, applyDocumentMutation, confirmDialog, filePath, recordAudit]);

  const verifySignatures = useCallback(async () => {
    if (!filePath) return;

    setDocumentSaving(true);
    setError(null);

    try {
      const existingBytes = await readFile(filePath);
      const report = await verifyPdfSignatures(existingBytes);
      const fieldSummary =
        report.fields.length === 0
          ? "No signature fields found."
          : report.fields
              .map((field) => `${field.fieldName}: ${field.signed ? "signed" : "empty"}`)
              .join("\n");
      const rangeSummary =
        report.byteRanges.length === 0
          ? "No ByteRange entries found."
          : report.byteRanges
              .map(
                (range, index) =>
                  `ByteRange ${index + 1}: ${range.intact ? "OK" : "FAIL"} (${range.reason})`,
              )
              .join("\n");
      const warningSummary =
        report.warnings.length === 0
          ? "No enterprise verification warnings."
          : report.warnings
              .map(
                (warning, index) =>
                  `${index + 1}. [${warning.severity.toUpperCase()}] ${warning.detail}`,
              )
              .join("\n");
      const subFilterSummary =
        report.detectedSubFilters.length === 0
          ? "(none detected)"
          : report.detectedSubFilters.join(", ");
      const signingTimeSummary =
        report.signingTimeHints.length === 0
          ? "(no signing time markers found)"
          : report.signingTimeHints.join("\n");
      const enterpriseSignals = [
        `Timestamp tokens: ${report.timestampTokenCount}`,
        `Document timestamps: ${report.documentTimestampCount}`,
        `Estimated certificate material: ${report.estimatedCertificateCount}`,
        `DSS present: ${report.dss.present ? "yes" : "no"}`,
        `DSS certificates: ${report.dss.certificateCount}`,
        `DSS OCSP responses: ${report.dss.ocspCount}`,
        `DSS CRLs: ${report.dss.crlCount}`,
        `DSS VRI entries: ${report.dss.vriEntryCount}`,
        `Revocation evidence: ${report.hasRevocationData ? "yes" : "no"}`,
        `LTV evidence: ${report.hasLtvData ? "yes" : "no"}`,
      ].join("\n");

      await alertDialog(
        `${fieldSummary}\n\n${rangeSummary}\n\nSigned fields: ${report.signedFieldCount}\nIntact ByteRanges: ${report.intactByteRangeCount}\nEnterprise-ready: ${
          report.enterpriseReady ? "YES" : "NO"
        }\nDetected SubFilters: ${subFilterSummary}\n\nSigning time markers:\n${signingTimeSummary}\n\nEnterprise signals:\n${enterpriseSignals}\n\nWarnings:\n${warningSummary}\n\nOverall: ${
          report.allSignedFieldsHaveContents ? "CHECKED" : "WARNING"
        }`,
      );

      const shouldExportReport = await confirmDialog(
        "Export signature verification report as JSON?",
      );
      if (shouldExportReport) {
        const outputPath = await save({
          filters: [{ name: "JSON", extensions: ["json"] }],
          defaultPath: replaceFileExtension(filePath, "-signature-report.json"),
        });
        if (outputPath) {
          const payload = JSON.stringify(report, null, 2);
          await writeFile(outputPath, new TextEncoder().encode(payload));
        }
      }
      recordAudit(
        "verify_signatures",
        report.enterpriseReady && report.allSignedFieldsHaveContents
          ? "success"
          : "warning",
      );
    } catch (err) {
      setError(String(err));
      recordAudit("verify_signatures", "failure", { reason: String(err) });
    } finally {
      setDocumentSaving(false);
    }
  }, [alertDialog, confirmDialog, filePath, recordAudit]);

  const configureByosStorage = useCallback(async () => {
    const providerInput = await promptDialog(
      "BYOS provider (s3 | azblob | gcs | onedrive):",
      "s3",
    );
    if (!providerInput) return;

    const provider = providerInput.trim().toLowerCase();
    const name = await promptDialog("Profile name:", `BYOS ${provider.toUpperCase()}`);
    if (!name || name.trim().length === 0) return;

    const profile: StorageProfilePayload = {
      id: `storage_${Date.now()}`,
      name: name.trim(),
      kind: "s3",
    };

    if (provider === "s3") {
      profile.kind = "s3";
      profile.bucket = await promptDialog("S3 bucket:") ?? "";
      profile.region = await promptDialog("S3 region (optional):", "eu-central-1") ?? "";
      profile.endpoint = await promptDialog("S3 endpoint (optional):", "") ?? "";
      profile.access_key_id = await promptDialog("Access key id:") ?? "";
      profile.secret_access_key = await promptDialog("Secret access key:") ?? "";
    } else if (provider === "azblob") {
      profile.kind = "azblob";
      profile.container = await promptDialog("Azure container:") ?? "";
      profile.account_name = await promptDialog("Azure account name:") ?? "";
      profile.account_key = await promptDialog("Azure account key:") ?? "";
    } else if (provider === "gcs") {
      profile.kind = "gcs";
      profile.bucket = await promptDialog("GCS bucket:") ?? "";
      profile.service_account_json =
        await promptDialog("Service account JSON (full content):") ?? "";
    } else if (provider === "onedrive") {
      profile.kind = "onedrive";
    } else {
      setError("Unknown BYOS provider.");
      return;
    }

    setDocumentSaving(true);
    setError(null);

    try {
      if (profile.kind !== "onedrive") {
        const result = await validateStorageProfile(profile);
        if (!result.ok) {
          throw new Error(result.message);
        }
      }

      updateEnterpriseSettings((previous) =>
        setActiveStorageProfile(upsertStorageProfile(previous, profile), profile.id),
      );
      recordAudit("configure_byos_storage", "success", { provider: profile.kind });
      appendTamperAudit("configure_byos_storage", "success", {
        provider: profile.kind,
      });
      await alertDialog(
        profile.kind === "onedrive"
          ? "OneDrive profile saved. OAuth validation is not yet available in this build."
          : "BYOS storage validated and saved.",
      );
    } catch (err) {
      setError(String(err));
      recordAudit("configure_byos_storage", "failure", { reason: String(err) });
      appendTamperAudit("configure_byos_storage", "failure", { reason: String(err) });
    } finally {
      setDocumentSaving(false);
    }
  }, [alertDialog, appendTamperAudit, promptDialog, recordAudit, updateEnterpriseSettings]);

  const configureManagedStorage = useCallback(async () => {
    const regionHint = managedRegions.map((region) => region.id).join(", ");
    const regionId = await promptDialog(
      `Managed region id (${regionHint}):`,
      managedRegions[0]?.id ?? "eu-central",
    );
    if (!regionId) return;

    const profileName = await promptDialog("Managed profile name:", "Managed Storage");
    if (!profileName || profileName.trim().length === 0) return;

    const bucket = await promptDialog("Managed bucket/container name:");
    const accessKeyId = await promptDialog("Managed access key id:");
    const secretAccessKey = await promptDialog("Managed secret access key:");

    if (!bucket || !accessKeyId || !secretAccessKey) {
      setError("Managed storage requires bucket and access credentials.");
      return;
    }

    const profile = createManagedProfile(
      `managed_${Date.now()}`,
      profileName.trim(),
      bucket,
      accessKeyId,
      secretAccessKey,
      regionId,
    );

    setDocumentSaving(true);
    setError(null);

    try {
      const result = await validateStorageProfile(profile);
      if (!result.ok) {
        throw new Error(result.message);
      }

      updateEnterpriseSettings((previous) => {
        const withProfile = upsertStorageProfile(previous, profile);
        const withActive = setActiveStorageProfile(withProfile, profile.id);
        return {
          ...withActive,
          managedStorageRegion: regionId,
        };
      });
      recordAudit("configure_managed_storage", "success", {
        regionId,
      });
      appendTamperAudit("configure_managed_storage", "success", {
        regionId,
      });
      await alertDialog("Managed regional storage validated and saved.");
    } catch (err) {
      setError(String(err));
      recordAudit("configure_managed_storage", "failure", { reason: String(err) });
      appendTamperAudit("configure_managed_storage", "failure", {
        reason: String(err),
      });
    } finally {
      setDocumentSaving(false);
    }
  }, [alertDialog, appendTamperAudit, promptDialog, recordAudit, updateEnterpriseSettings]);

  const configureSso = useCallback(async () => {
    const providerInput = await promptDialog("SSO provider (oidc | saml):", "oidc");
    if (!providerInput) return;

    const provider = providerInput.trim().toLowerCase() === "saml" ? "saml" : "oidc";
    const issuer = await promptDialog("Issuer URL:", enterpriseSettings.sso.issuer);
    if (issuer === null) return;
    const clientId = await promptDialog("Client ID:", enterpriseSettings.sso.clientId);
    if (clientId === null) return;
    const clientSecret = await promptDialog(
      "Client secret (stored locally for this environment):",
      enterpriseSettings.sso.clientSecret,
      { inputType: "password" },
    );
    if (clientSecret === null) return;
    const authorizationEndpoint = await promptDialog(
      "Authorization endpoint:",
      enterpriseSettings.sso.authorizationEndpoint || `${issuer}/authorize`,
    );
    if (authorizationEndpoint === null) return;
    const tokenEndpoint = await promptDialog(
      "Token endpoint:",
      enterpriseSettings.sso.tokenEndpoint || `${issuer}/token`,
    );
    if (tokenEndpoint === null) return;
    const redirectUri = await promptDialog(
      "Redirect URI:",
      enterpriseSettings.sso.redirectUri || "pdfluent://callback",
    );
    if (redirectUri === null) return;
    const scopes = await promptDialog(
      "Scopes:",
      enterpriseSettings.sso.scopes || "openid profile email",
    );
    if (scopes === null) return;
    const audience = await promptDialog(
      "Audience (optional):",
      enterpriseSettings.sso.audience,
    );
    if (audience === null) return;
    const usePkce = parseBooleanInput(
      await promptDialog(
        "Use PKCE in auth flow? (yes/no):",
        enterpriseSettings.sso.usePkce ? "yes" : "no",
      ),
      true,
    );
    const samlEntryPoint = await promptDialog(
      "SAML entry point (optional):",
      enterpriseSettings.sso.samlEntryPoint,
    );
    if (samlEntryPoint === null) return;
    const samlCertificate = await promptDialog(
      "SAML certificate thumbprint/cert (optional):",
      enterpriseSettings.sso.samlCertificate,
    );
    if (samlCertificate === null) return;

    let createdSessionState = "";
    let previewUrl = "";
    updateEnterpriseSettings((previous) =>
      {
        const configured = updateSsoConfig(previous, {
          enabled: true,
          provider,
          issuer,
          clientId,
          clientSecret,
          authorizationEndpoint,
          tokenEndpoint,
          redirectUri,
          scopes,
          audience,
          usePkce,
          samlEntryPoint,
          samlCertificate,
        });

        if (provider !== "oidc") {
          previewUrl = samlEntryPoint.trim().length > 0 ? samlEntryPoint : authorizationEndpoint;
          return configured;
        }

        const withSession = createSsoAuthSession(configured);
        createdSessionState = withSession.session.state;
        previewUrl = withSession.session.authorizationUrl;
        return withSession.settings;
      },
    );

    if (previewUrl.length > 0) {
      await alertDialog(
        provider === "oidc"
          ? `OIDC auth URL preview:\n${previewUrl}`
          : `SAML entrypoint preview:\n${previewUrl}`,
      );
    }

    if (provider === "oidc" && createdSessionState.length > 0) {
      const completedNow = parseBooleanInput(
        await promptDialog("Mark current auth session as completed? (yes/no):", "yes"),
        true,
      );
    updateEnterpriseSettings((previous) =>
      completeSsoAuthSession(previous, createdSessionState, completedNow),
    );
    }

    recordAudit("configure_sso", "success", { provider });
    appendTamperAudit("configure_sso", "success", { provider });
  }, [
    alertDialog,
    appendTamperAudit,
    enterpriseSettings.sso,
    promptDialog,
    recordAudit,
    updateEnterpriseSettings,
  ]);

  const configureTeamBackendProduction = useCallback(async () => {
    const baseUrl = await promptDialog(
      "Team backend base URL:",
      enterpriseSettings.teamBackend.baseUrl || "https://api.pdfluent.dev",
    );
    if (!baseUrl || baseUrl.trim().length === 0) return;
    const workspaceId = await promptDialog(
      "Team workspace ID:",
      enterpriseSettings.teamBackend.workspaceId || "workspace_default",
    );
    if (!workspaceId || workspaceId.trim().length === 0) return;
    const serviceTokenPrefix = await promptDialog(
      "Service token prefix:",
      enterpriseSettings.teamBackend.serviceTokenPrefix || "svc_tok",
    );
    if (!serviceTokenPrefix || serviceTokenPrefix.trim().length === 0) return;

    updateEnterpriseSettings((previous) =>
      recordTeamBackendSync(
        configureTeamBackend(previous, {
          baseUrl: baseUrl.trim(),
          workspaceId: workspaceId.trim(),
          serviceTokenPrefix: serviceTokenPrefix.trim(),
        }),
      ),
    );
    recordAudit("configure_team_backend", "success", {
      baseUrl: baseUrl.trim(),
      workspaceId: workspaceId.trim(),
    });
    appendTamperAudit("configure_team_backend", "success", {
      baseUrl: baseUrl.trim(),
      workspaceId: workspaceId.trim(),
    });
  }, [
    appendTamperAudit,
    enterpriseSettings.teamBackend.baseUrl,
    enterpriseSettings.teamBackend.serviceTokenPrefix,
    enterpriseSettings.teamBackend.workspaceId,
    promptDialog,
    recordAudit,
    updateEnterpriseSettings,
  ]);

  const manageLicensesAndPolicies = useCallback(async () => {
    const action = await promptDialog(
      "License/policy action (issue | revoke | evaluate | toggle-server | list):",
      "list",
    );
    if (!action) return;
    const normalizedAction = action.trim().toLowerCase();

    if (normalizedAction === "list") {
      const summary = [
        `Server-side policy enforcement: ${enterpriseSettings.enforcePoliciesServerSide ? "enabled" : "disabled"}`,
        `Seats total: ${enterpriseSettings.licenseSeats.length}`,
        `Active seats: ${enterpriseSettings.licenseSeats.filter((seat) => seat.status === "active").length}`,
        `Recent policy decisions: ${enterpriseSettings.policyDecisions.length}`,
      ].join("\n");
      await alertDialog(`License & policy status\n\n${summary}`);
      return;
    }

    if (normalizedAction === "toggle-server") {
      const next = parseBooleanInput(
        await promptDialog(
          "Enable server-side policy enforcement? (yes/no):",
          enterpriseSettings.enforcePoliciesServerSide ? "yes" : "no",
        ),
        true,
      );
      updateEnterpriseSettings((previous) => ({
        ...previous,
        enforcePoliciesServerSide: next,
      }));
      recordAudit("license_policy_toggle_server", "success", { enabled: next });
      appendTamperAudit("license_policy_toggle_server", "success", { enabled: next });
      return;
    }

    if (normalizedAction === "issue") {
      const email = await promptDialog("Seat email:", "");
      if (!email || email.trim().length === 0) return;
      const tierInput = await promptDialog("Seat tier (pro | business | enterprise):", "enterprise");
      if (!tierInput) return;
      const tier: LicenseTier =
        tierInput.trim().toLowerCase() === "pro"
          ? "pro"
          : tierInput.trim().toLowerCase() === "business"
            ? "business"
            : "enterprise";
      updateEnterpriseSettings((previous) => issueLicenseSeat(previous, email.trim(), tier));
      recordAudit("license_issue_seat", "success", { email: email.trim(), tier });
      appendTamperAudit("license_issue_seat", "success", { email: email.trim(), tier });
      return;
    }

    if (normalizedAction === "revoke") {
      if (enterpriseSettings.licenseSeats.length === 0) {
        await alertDialog("No license seats to revoke.");
        return;
      }
      const choice = await promptDialog(
        `Seat number to revoke:\n${enterpriseSettings.licenseSeats
          .map((seat, index) => `${index + 1}. ${seat.email} (${seat.status})`)
          .join("\n")}`,
        "1",
      );
      if (!choice) return;
      const selectedIndex = Math.max(
        0,
        Math.min(
          enterpriseSettings.licenseSeats.length - 1,
          Math.round(parseNumberInput(choice, 1)) - 1,
        ),
      );
      const target = enterpriseSettings.licenseSeats[selectedIndex];
      if (!target) return;
      updateEnterpriseSettings((previous) => revokeLicenseSeat(previous, target.id));
      recordAudit("license_revoke_seat", "warning", { seatId: target.id });
      appendTamperAudit("license_revoke_seat", "warning", { seatId: target.id });
      return;
    }

    if (normalizedAction === "evaluate") {
      const externalShare = parseBooleanInput(
        await promptDialog("Evaluate external sharing action? (yes/no):", "yes"),
        true,
      );
      const offlineExport = parseBooleanInput(
        await promptDialog("Evaluate offline export action? (yes/no):", "no"),
        false,
      );

      let decisionAllowed = true;
      let decisionReason = "";
      updateEnterpriseSettings((previous) => {
        const result = evaluatePolicyEnforcement(previous, "manual_policy_check", {
          externalShare,
          offlineExport,
        });
        decisionAllowed = result.decision.allowed;
        decisionReason = result.decision.reason;
        return result.settings;
      });
      await alertDialog(
        `Policy decision: ${decisionAllowed ? "ALLOWED" : "BLOCKED"}\nReason: ${decisionReason}`,
      );
      recordAudit("license_policy_evaluate", decisionAllowed ? "success" : "warning", {
        externalShare,
        offlineExport,
      });
      appendTamperAudit(
        "license_policy_evaluate",
        decisionAllowed ? "success" : "warning",
        { externalShare, offlineExport, decisionAllowed, decisionReason },
      );
    }
  }, [
    alertDialog,
    appendTamperAudit,
    enterpriseSettings.enforcePoliciesServerSide,
    enterpriseSettings.licenseSeats,
    enterpriseSettings.policyDecisions.length,
    promptDialog,
    recordAudit,
    updateEnterpriseSettings,
  ]);

  const runStorageSyncEngine = useCallback(async () => {
    const action = await promptDialog(
      "Sync action (conflict | resolve | rotate-key | status):",
      "status",
    );
    if (!action) return;
    const normalizedAction = action.trim().toLowerCase();

    if (normalizedAction === "status") {
      const unresolved = enterpriseSettings.syncConflicts.filter(
        (conflict) => conflict.resolution === "unresolved",
      ).length;
      const activeKey = enterpriseSettings.keyManagement.find((key) => key.status === "active");
      await alertDialog(
        `Sync status\n\nConflicts: ${enterpriseSettings.syncConflicts.length}\nUnresolved: ${unresolved}\nActive key: ${activeKey?.id ?? "(none)"}\nIntegrations: ${enterpriseSettings.integrations.length}`,
      );
      return;
    }

    if (normalizedAction === "conflict") {
      const filePath = await promptDialog("Conflict file path:", "/tmp/document.pdf");
      if (!filePath || filePath.trim().length === 0) return;
      updateEnterpriseSettings((previous) =>
        recordSyncConflict(previous, {
          filePath: filePath.trim(),
          baseVersion: `v${Date.now() - 2}`,
          localVersion: `local_${Date.now()}`,
          remoteVersion: `remote_${Date.now()}`,
        }),
      );
      recordAudit("sync_conflict_recorded", "warning", { filePath: filePath.trim() });
      appendTamperAudit("sync_conflict_recorded", "warning", { filePath: filePath.trim() });
      return;
    }

    if (normalizedAction === "resolve") {
      const unresolved = enterpriseSettings.syncConflicts.filter(
        (conflict) => conflict.resolution === "unresolved",
      );
      if (unresolved.length === 0) {
        await alertDialog("No unresolved conflicts.");
        return;
      }
      const choice = await promptDialog(
        `Conflict number:\n${unresolved
          .map((conflict, index) => `${index + 1}. ${conflict.filePath}`)
          .join("\n")}`,
        "1",
      );
      if (!choice) return;
      const modeInput = await promptDialog(
        "Resolution (keep_local | keep_remote | merge_manual):",
        "merge_manual",
      );
      if (!modeInput) return;
      const mode =
        modeInput.trim().toLowerCase() === "keep_local"
          ? "keep_local"
          : modeInput.trim().toLowerCase() === "keep_remote"
            ? "keep_remote"
            : "merge_manual";
      const selectedIndex = Math.max(
        0,
        Math.min(unresolved.length - 1, Math.round(parseNumberInput(choice, 1)) - 1),
      );
      const target = unresolved[selectedIndex];
      if (!target) return;
      updateEnterpriseSettings((previous) =>
        resolveSyncConflict(previous, target.id, mode),
      );
      recordAudit("sync_conflict_resolved", "success", {
        conflictId: target.id,
        mode,
      });
      appendTamperAudit("sync_conflict_resolved", "success", {
        conflictId: target.id,
        mode,
      });
      return;
    }

    if (normalizedAction === "rotate-key") {
      updateEnterpriseSettings((previous) => rotateKeyManagementKey(previous));
      recordAudit("sync_key_rotated", "success");
      appendTamperAudit("sync_key_rotated", "success");
    }
  }, [
    alertDialog,
    appendTamperAudit,
    enterpriseSettings.integrations.length,
    enterpriseSettings.keyManagement,
    enterpriseSettings.syncConflicts,
    promptDialog,
    recordAudit,
    updateEnterpriseSettings,
  ]);

  const manageIntegrationConnections = useCallback(async () => {
    const action = await promptDialog(
      "Integration action (connect | disconnect | sync | list):",
      "list",
    );
    if (!action) return;
    const normalizedAction = action.trim().toLowerCase();

    if (normalizedAction === "list") {
      const summary =
        enterpriseSettings.integrations.length === 0
          ? "No integrations connected."
          : enterpriseSettings.integrations
              .map(
                (integration, index) =>
                  `${index + 1}. ${integration.provider} · ${integration.accountEmail} · ${integration.status}`,
              )
              .join("\n");
      await alertDialog(`Integration status\n\n${summary}`);
      return;
    }

    const providerInput = await promptDialog("Provider (microsoft | google | box):", "microsoft");
    if (!providerInput) return;
    const provider: IntegrationProvider =
      providerInput.trim().toLowerCase() === "google"
        ? "google"
        : providerInput.trim().toLowerCase() === "box"
          ? "box"
          : "microsoft";

    if (normalizedAction === "disconnect") {
      updateEnterpriseSettings((previous) => disconnectIntegration(previous, provider));
      recordAudit("integration_disconnect", "warning", { provider });
      appendTamperAudit("integration_disconnect", "warning", { provider });
      return;
    }

    if (normalizedAction === "sync") {
      updateEnterpriseSettings((previous) => markIntegrationSynced(previous, provider));
      recordAudit("integration_sync", "success", { provider });
      appendTamperAudit("integration_sync", "success", { provider });
      return;
    }

    const accountEmail = await promptDialog("Account email:", `ops@${provider}.com`);
    if (!accountEmail || accountEmail.trim().length === 0) return;
    const scopesInput = await promptDialog("Scopes (comma-separated):", "files.read,files.write");
    if (scopesInput === null) return;
    const scopes = scopesInput
      .split(",")
      .map((scope) => scope.trim())
      .filter((scope) => scope.length > 0);

    updateEnterpriseSettings((previous) =>
      connectIntegration(previous, provider, accountEmail.trim(), scopes),
    );
    recordAudit("integration_connect", "success", { provider, accountEmail: accountEmail.trim() });
    appendTamperAudit("integration_connect", "success", {
      provider,
      accountEmail: accountEmail.trim(),
    });
  }, [
    alertDialog,
    appendTamperAudit,
    enterpriseSettings.integrations,
    promptDialog,
    recordAudit,
    updateEnterpriseSettings,
  ]);

  const configureApiProductization = useCallback(async () => {
    const version = await promptDialog(
      "API version:",
      enterpriseSettings.apiProfile.version || "v1",
    );
    if (!version || version.trim().length === 0) return;
    const docsUrl = await promptDialog(
      "Docs URL:",
      enterpriseSettings.apiProfile.docsUrl || "https://docs.pdfluent.dev/api",
    );
    if (!docsUrl || docsUrl.trim().length === 0) return;
    const authModeInput = await promptDialog(
      "Auth mode (api_key | oauth2):",
      enterpriseSettings.apiProfile.authMode,
    );
    if (!authModeInput) return;
    const authMode = authModeInput.trim().toLowerCase() === "oauth2" ? "oauth2" : "api_key";
    const scopesInput = await promptDialog(
      "Default scopes (comma-separated):",
      enterpriseSettings.apiProfile.defaultScopes.join(","),
    );
    if (scopesInput === null) return;
    const scopes = scopesInput
      .split(",")
      .map((scope) => scope.trim())
      .filter((scope) => scope.length > 0);
    if (scopes.length === 0) return;
    const rpm = Math.max(
      1,
      Math.min(
        20_000,
        Math.round(
          parseNumberInput(
            await promptDialog("Requests per minute for default scopes:", "600"),
            600,
          ),
        ),
      ),
    );

    updateEnterpriseSettings((previous) =>
      configureApiProductProfile(previous, {
        version: version.trim(),
        docsUrl: docsUrl.trim(),
        authMode,
        defaultScopes: scopes,
        rateLimits: scopes.map((scope) => ({
          scope,
          requestsPerMinute: rpm,
          burst: Math.max(1, Math.round(rpm * 0.2)),
        })),
      }),
    );
    recordAudit("configure_api_product", "success", {
      version: version.trim(),
      authMode,
      scopes: scopes.length,
      requestsPerMinute: rpm,
    });
    appendTamperAudit("configure_api_product", "success", {
      version: version.trim(),
      authMode,
      scopes,
      requestsPerMinute: rpm,
    });
  }, [
    appendTamperAudit,
    enterpriseSettings.apiProfile.authMode,
    enterpriseSettings.apiProfile.defaultScopes,
    enterpriseSettings.apiProfile.docsUrl,
    enterpriseSettings.apiProfile.version,
    promptDialog,
    recordAudit,
    updateEnterpriseSettings,
  ]);

  const exportTamperAuditSiem = useCallback(async () => {
    const outputPath = await save({
      filters: [{ name: "JSONL", extensions: ["jsonl"] }],
      defaultPath: "pdfluent-siem-audit.jsonl",
    });
    if (!outputPath) return;

    const chainValid = verifyTamperAuditTrail(enterpriseSettings);
    if (!chainValid) {
      await alertDialog("Tamper audit verification failed. Export aborted.");
      return;
    }

    setDocumentSaving(true);
    setError(null);
    try {
      const payload = exportTamperAuditAsSiemJsonl(enterpriseSettings);
      await writeFile(outputPath, payload);
      recordAudit("export_siem_audit", "success", { outputPath });
      appendTamperAudit("export_siem_audit", "success", { outputPath });
    } catch (err) {
      setError(String(err));
      recordAudit("export_siem_audit", "failure", { reason: String(err) });
      appendTamperAudit("export_siem_audit", "failure", { reason: String(err) });
    } finally {
      setDocumentSaving(false);
    }
  }, [alertDialog, appendTamperAudit, enterpriseSettings, recordAudit]);

  const toggleAdminConsole = useCallback(() => {
    setAdminConsoleOpen((current) => !current);
  }, []);

  const runBatchProcessing = useCallback(async () => {
    const selected = await open({
      multiple: true,
      filters: [{ name: "PDF", extensions: ["pdf"] }],
    });
    const paths = Array.isArray(selected)
      ? selected
      : typeof selected === "string"
        ? [selected]
        : [];

    if (paths.length === 0) return;

    const operationInput = await promptDialog(
      "Batch operation (rotate | watermark | protect):",
      "rotate",
    );
    if (!operationInput) return;
    const operation = operationInput.trim().toLowerCase();
    const presetName =
      (await promptDialog("Batch preset name:", `${operation} preset`))?.trim() ||
      `${operation} preset`;
    const maxRetries = Math.max(
      0,
      Math.min(
        5,
        Math.round(parseNumberInput(await promptDialog("Max retries per file:", "1"), 1)),
      ),
    );

    let watermarkText = "";
    let batchPassword = "";
    if (operation === "watermark") {
      const value = await promptDialog("Watermark text for batch:", "CONFIDENTIAL");
      if (!value) return;
      watermarkText = value;
    }
    if (operation === "protect") {
      const value = await promptDialog("Batch user password:");
      if (!value) return;
      batchPassword = value;
    }

    setDocumentSaving(true);
    setError(null);

    const startedAtIso = new Date().toISOString();
    let presetId = "";
    const queueItemIds: string[] = [];
    let successful = 0;
    let failed = 0;
    let retried = 0;

    try {
      updateEnterpriseSettings((previous) => {
        let next = createBatchPreset(previous, presetName, operation, {
          maxRetries,
          watermarkText: operation === "watermark" ? watermarkText : null,
        });
        presetId = next.batchPresets[next.batchPresets.length - 1]?.id ?? "";
        for (const path of paths) {
          next = enqueueBatchQueueItem(next, presetId, path, maxRetries);
          const queueItemId = next.batchQueue[next.batchQueue.length - 1]?.id;
          if (queueItemId) {
            queueItemIds.push(queueItemId);
          }
        }
        return next;
      });

      for (let index = 0; index < paths.length; index += 1) {
        const path = paths[index];
        if (!path) {
          continue;
        }
        const queueItemId = queueItemIds[index] ?? "";
        let attempt = 0;
        let completed = false;

        while (!completed && attempt <= maxRetries) {
          attempt += 1;
          try {
            const input = await readFile(path);
            const sourceBytes = Uint8Array.from(input);
            let output: Uint8Array = sourceBytes;
            let suffix = "-batch";

            if (operation === "rotate") {
              output = await rotateAllPages(sourceBytes, 90);
              suffix = "-rotated";
            } else if (operation === "watermark") {
              output = await addWatermarkToDocument(sourceBytes, {
                text: watermarkText,
                opacity: 0.2,
              });
              suffix = "-watermarked";
            } else if (operation === "protect") {
              output = await protectPdfWithPassword(sourceBytes, batchPassword);
              suffix = "-protected";
            } else {
              throw new Error("Unsupported batch operation.");
            }

            const outputPath = replaceFileExtension(path, `${suffix}.pdf`);
            await writeFile(outputPath, output);
            successful += 1;
            completed = true;
            if (queueItemId) {
              updateEnterpriseSettings((previous) =>
                markBatchQueueItemResult(previous, queueItemId, true),
              );
            }
          } catch (err) {
            const errorMessage = String(err);
            if (attempt <= maxRetries) {
              retried += 1;
            } else {
              failed += 1;
              completed = true;
            }
            if (queueItemId) {
              updateEnterpriseSettings((previous) =>
                markBatchQueueItemResult(previous, queueItemId, false, errorMessage),
              );
            }
          }
        }
      }

      updateEnterpriseSettings((previous) => {
        let next = recordBatchJob(previous, operation, paths.length, successful, failed);
        if (presetId) {
          next = addBatchExecutionReport(next, {
            presetId,
            startedAt: startedAtIso,
            finishedAt: new Date().toISOString(),
            total: paths.length,
            completed: successful,
            failed,
            retried,
          });
        }
        return next;
      });
      recordAudit("run_batch_processing", failed > 0 ? "warning" : "success", {
        operation,
        files: paths.length,
        successful,
        failed,
        retried,
      });
      appendTamperAudit("run_batch_processing", failed > 0 ? "warning" : "success", {
        operation,
        files: paths.length,
        successful,
        failed,
        retried,
        presetName,
      });
    } catch (err) {
      setError(String(err));
      recordAudit("run_batch_processing", "failure", { reason: String(err) });
      appendTamperAudit("run_batch_processing", "failure", { reason: String(err) });
    } finally {
      setDocumentSaving(false);
    }
  }, [appendTamperAudit, promptDialog, recordAudit, updateEnterpriseSettings]);

  const configureBrandingSettings = useCallback(async () => {
    const appNameInput = await promptDialog(
      "App display name:",
      enterpriseSettings.branding.appName,
    );
    if (appNameInput === null || appNameInput.trim().length === 0) return;

    const accentColorInput = await promptDialog(
      "Accent color (#RRGGBB):",
      enterpriseSettings.branding.accentColor,
    );
    if (accentColorInput === null || accentColorInput.trim().length === 0) return;

    const logoPathInput = await open({
      multiple: false,
      filters: [{ name: "Image", extensions: ["png", "jpg", "jpeg", "svg"] }],
    });

    updateEnterpriseSettings((previous) =>
      updateBranding(previous, {
        appName: appNameInput.trim(),
        accentColor: accentColorInput.trim(),
        logoPath: typeof logoPathInput === "string" ? logoPathInput : previous.branding.logoPath,
      }),
    );
    recordAudit("configure_branding", "success");
    appendTamperAudit("configure_branding", "success", {
      appName: appNameInput.trim(),
      accentColor: accentColorInput.trim(),
    });
  }, [
    appendTamperAudit,
    enterpriseSettings.branding,
    promptDialog,
    recordAudit,
    updateEnterpriseSettings,
  ]);

  const createAutomationApiKey = useCallback(async () => {
    const label = await promptDialog("API key label:", "CI automation");
    if (!label || label.trim().length === 0) return;
    const scopesInput = await promptDialog(
      "API scopes (comma-separated):",
      enterpriseSettings.apiProfile.defaultScopes.join(","),
    );
    if (scopesInput === null) return;
    const scopes = scopesInput
      .split(",")
      .map((scope) => scope.trim())
      .filter((scope) => scope.length > 0);
    if (scopes.length === 0) return;
    const rateLimitPerMinute = Math.max(
      1,
      Math.min(
        20_000,
        Math.round(
          parseNumberInput(
            await promptDialog("Rate limit per minute:", "600"),
            600,
          ),
        ),
      ),
    );

    let generatedToken = "";
    updateEnterpriseSettings((previous) => {
      const result = createApiKey(
        previous,
        label.trim(),
        scopes,
        rateLimitPerMinute,
      );
      generatedToken = result.token;
      return result.settings;
    });
    recordAudit("create_api_key", "success", {
      label: label.trim(),
      scopes: scopes.length,
      rateLimitPerMinute,
    });
    appendTamperAudit("create_api_key", "success", {
      label: label.trim(),
      scopes,
      rateLimitPerMinute,
    });

    if (generatedToken) {
      await alertDialog(
        `Store this API key now (shown once):\n${generatedToken}\n\nExample automation payload:\n{"action":"rotate","input":"/path/file.pdf","output":"/path/file-rotated.pdf"}`,
      );
    }
  }, [
    alertDialog,
    appendTamperAudit,
    enterpriseSettings.apiProfile.defaultScopes,
    promptDialog,
    recordAudit,
    updateEnterpriseSettings,
  ]);

  const manageESignTemplates = useCallback(async () => {
    const mode = await promptDialog(
      "E-sign template action (create | list):",
      "create",
    );
    if (!mode) return;

    const normalizedMode = mode.trim().toLowerCase();
    if (normalizedMode === "list") {
      const templates = enterpriseSettings.eSignTemplates;
      const summary =
        templates.length === 0
          ? "No templates configured."
          : templates
              .map(
                (template, index) =>
                  `${index + 1}. ${template.name} (subject: ${template.subject}, reminder: ${template.reminderDays}d)`,
              )
              .join("\n");
      await alertDialog(`E-sign templates\n\n${summary}`);
      return;
    }

    const name = await promptDialog("Template name:", "Standard NDA");
    if (!name || name.trim().length === 0) return;
    const subject = await promptDialog("Template subject:", "Signature request");
    if (!subject || subject.trim().length === 0) return;
    const message = await promptDialog(
      "Template message:",
      "Please review and sign this document.",
    );
    if (!message || message.trim().length === 0) return;
    const reminderDaysInput = await promptDialog("Reminder cadence in days:", "3");
    if (reminderDaysInput === null) return;
    const reminderDays = Math.max(
      1,
      Math.min(30, Math.round(parseNumberInput(reminderDaysInput, 3))),
    );

    updateEnterpriseSettings((previous) =>
      createESignTemplate(
        previous,
        name.trim(),
        subject.trim(),
        message.trim(),
        reminderDays,
      ),
    );
    recordAudit("esign_template_created", "success", {
      templateName: name.trim(),
      reminderDays,
    });
  }, [alertDialog, enterpriseSettings.eSignTemplates, promptDialog, recordAudit, updateEnterpriseSettings]);

  const runESignRequestWorkflow = useCallback(async () => {
    if (!filePath) return;

    const recipientEmail = await promptDialog("Recipient email:", "");
    if (!recipientEmail || recipientEmail.trim().length === 0) return;

    const templateOptions = enterpriseSettings.eSignTemplates;
    let selectedTemplateIndex = -1;
    if (templateOptions.length > 0) {
      const templateList = templateOptions
        .map((template, index) => `${index + 1}. ${template.name}`)
        .join("\n");
      const templateSelection = await promptDialog(
        `Template number (optional).\n${templateList}`,
        "0",
      );
      if (templateSelection === null) return;
      const parsed = Math.round(parseNumberInput(templateSelection, 0));
      if (parsed > 0 && parsed <= templateOptions.length) {
        selectedTemplateIndex = parsed - 1;
      }
    }

    const selectedTemplate =
      selectedTemplateIndex >= 0 ? templateOptions[selectedTemplateIndex] ?? null : null;
    const defaultSubject =
      selectedTemplate?.subject ??
      `Signature request: ${filePath.split("/").pop() ?? "document.pdf"}`;
    const defaultMessage =
      selectedTemplate?.message ??
      "Please review and sign this document at your earliest convenience.";

    const subject = await promptDialog("Request subject:", defaultSubject);
    if (!subject || subject.trim().length === 0) return;
    const message = await promptDialog("Request message:", defaultMessage);
    if (!message || message.trim().length === 0) return;
    const sendNow = parseBooleanInput(
      await promptDialog("Mark request as sent now? (yes/no):", "yes"),
      true,
    );

    let createdRequestId = "";
    updateEnterpriseSettings((previous) => {
      const result = createESignRequest(previous, {
        documentPath: filePath,
        recipientEmail: recipientEmail.trim(),
        templateId: selectedTemplate?.id ?? null,
        subject: subject.trim(),
        message: message.trim(),
        status: sendNow ? "sent" : "draft",
      });
      createdRequestId = result.request.id;
      return result.settings;
    });

    recordAudit("esign_request_created", sendNow ? "success" : "warning", {
      requestId: createdRequestId,
      recipientEmail: recipientEmail.trim(),
      templateId: selectedTemplate?.id ?? null,
      sent: sendNow,
    });
    await alertDialog(
      `E-sign request ${sendNow ? "queued and marked as sent" : "saved as draft"}.\nRequest ID: ${createdRequestId}`,
    );
  }, [alertDialog, enterpriseSettings.eSignTemplates, filePath, promptDialog, recordAudit, updateEnterpriseSettings]);

  const sendESignReminder = useCallback(async () => {
    const pendingRequests = getPendingESignRequests(enterpriseSettings);
    if (pendingRequests.length === 0) {
      await alertDialog("No pending e-sign requests need reminders.");
      return;
    }

    const choice = await promptDialog(
      `Reminder request number:\n${pendingRequests
        .map(
          (request, index) =>
            `${index + 1}. ${request.recipientEmail} · ${request.status} · ${request.id}`,
        )
        .join("\n")}`,
      "1",
    );
    if (!choice) return;
    const selectedIndex = Math.max(
      0,
      Math.min(pendingRequests.length - 1, Math.round(parseNumberInput(choice, 1)) - 1),
    );
    const target = pendingRequests[selectedIndex];
    if (!target) return;

    const reminderNote = await promptDialog(
      "Reminder note:",
      "Friendly reminder to review and sign.",
    );
    if (!reminderNote || reminderNote.trim().length === 0) return;

    updateEnterpriseSettings((previous) => {
      const withReminder = addESignReminder(
        previous,
        target.id,
        reminderNote.trim(),
        "email",
      );
      return updateESignRequestStatus(withReminder, target.id, "sent");
    });
    recordAudit("esign_reminder_sent", "success", {
      requestId: target.id,
      recipientEmail: target.recipientEmail,
    });
  }, [alertDialog, enterpriseSettings, promptDialog, recordAudit, updateEnterpriseSettings]);

  const showESignStatus = useCallback(async () => {
    const requests = enterpriseSettings.eSignRequests;
    const statusCounts = requests.reduce<Record<string, number>>((acc, request) => {
      acc[request.status] = (acc[request.status] ?? 0) + 1;
      return acc;
    }, {});

    const summaryLines = [
      `Total requests: ${requests.length}`,
      `Draft: ${statusCounts.draft ?? 0}`,
      `Sent: ${statusCounts.sent ?? 0}`,
      `Viewed: ${statusCounts.viewed ?? 0}`,
      `Signed: ${statusCounts.signed ?? 0}`,
      `Declined: ${statusCounts.declined ?? 0}`,
      `Expired: ${statusCounts.expired ?? 0}`,
      `Cancelled: ${statusCounts.cancelled ?? 0}`,
    ];
    const recent = requests
      .slice()
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
      .slice(0, 8)
      .map(
        (request, index) =>
          `${index + 1}. ${request.recipientEmail} · ${request.status} · reminders=${request.reminders.length}`,
      );

    await alertDialog(
      `E-sign status\n\n${summaryLines.join("\n")}\n\nRecent requests:\n${
        recent.length > 0 ? recent.join("\n") : "(none)"
      }`,
    );
  }, [alertDialog, enterpriseSettings.eSignRequests]);

  const manageBookmarksOutlines = useCallback(async () => {
    const action = await promptDialog("Bookmarks action (add | remove | list):", "list");
    if (!action) return;

    const normalizedAction = action.trim().toLowerCase();
    if (normalizedAction === "list") {
      const summary = summarizeDocumentStructure(documentStructure);
      await alertDialog(`Bookmarks / outlines\n\n${summary}`);
      return;
    }

    if (normalizedAction === "add") {
      const title = await promptDialog(
        "Bookmark title:",
        `Section ${documentStructure.bookmarks.length + 1}`,
      );
      if (!title || title.trim().length === 0) return;

      const pageInput = await promptDialog(
        "Page number:",
        String(Math.max(1, currentPage + 1)),
      );
      if (!pageInput) return;
      const pageIndex = Math.max(0, Math.round(parseNumberInput(pageInput, currentPage + 1)) - 1);

      setDocumentStructure((previous) =>
        addBookmarkNode(previous, {
          title: title.trim(),
          pageIndex,
        }),
      );
      recordAudit("edit_bookmarks_outlines", "success", { action: "add", page: pageIndex + 1 });
      return;
    }

    if (normalizedAction === "remove") {
      if (documentStructure.bookmarks.length === 0) {
        await alertDialog("No bookmarks available to remove.");
        return;
      }

      const selection = await promptDialog(
        `Bookmark number to remove:\n${documentStructure.bookmarks
          .map(
            (bookmark, index) =>
              `${index + 1}. ${bookmark.title} (page ${bookmark.pageIndex + 1})`,
          )
          .join("\n")}`,
        "1",
      );
      if (!selection) return;
      const selectedIndex = Math.max(
        0,
        Math.min(
          documentStructure.bookmarks.length - 1,
          Math.round(parseNumberInput(selection, 1)) - 1,
        ),
      );
      const target = documentStructure.bookmarks[selectedIndex];
      if (!target) return;

      setDocumentStructure((previous) => removeBookmarkNode(previous, target.id));
      recordAudit("edit_bookmarks_outlines", "warning", {
        action: "remove",
        bookmarkId: target.id,
      });
      return;
    }

    setError("Unknown bookmark action.");
  }, [alertDialog, currentPage, documentStructure, promptDialog, recordAudit]);

  const manageDocumentLinks = useCallback(async () => {
    const action = await promptDialog("Links action (add | remove | list):", "list");
    if (!action) return;

    const normalizedAction = action.trim().toLowerCase();
    if (normalizedAction === "list") {
      const summary = summarizeDocumentStructure(documentStructure);
      await alertDialog(`Document links\n\n${summary}`);
      return;
    }

    if (normalizedAction === "add") {
      const pageInput = await promptDialog(
        "Page number:",
        String(Math.max(1, currentPage + 1)),
      );
      if (!pageInput) return;
      const url = await promptDialog("URL:", "https://");
      if (!url || url.trim().length === 0) return;

      const pageIndex = Math.max(0, Math.round(parseNumberInput(pageInput, currentPage + 1)) - 1);
      setDocumentStructure((previous) =>
        addDocumentLink(previous, {
          pageIndex,
          url: url.trim(),
          rect: null,
        }),
      );
      recordAudit("edit_document_links", "success", { action: "add", page: pageIndex + 1 });
      return;
    }

    if (normalizedAction === "remove") {
      if (documentStructure.links.length === 0) {
        await alertDialog("No links available to remove.");
        return;
      }

      const selection = await promptDialog(
        `Link number to remove:\n${documentStructure.links
          .map((link, index) => `${index + 1}. ${link.url} (page ${link.pageIndex + 1})`)
          .join("\n")}`,
        "1",
      );
      if (!selection) return;
      const selectedIndex = Math.max(
        0,
        Math.min(
          documentStructure.links.length - 1,
          Math.round(parseNumberInput(selection, 1)) - 1,
        ),
      );
      const target = documentStructure.links[selectedIndex];
      if (!target) return;

      setDocumentStructure((previous) => removeDocumentLink(previous, target.id));
      recordAudit("edit_document_links", "warning", { action: "remove", linkId: target.id });
      return;
    }

    setError("Unknown links action.");
  }, [alertDialog, currentPage, documentStructure, promptDialog, recordAudit]);

  const managePdfAttachments = useCallback(async () => {
    if (!filePath) return;

    const action = await promptDialog("Attachments action (add | list):", "list");
    if (!action) return;
    const normalizedAction = action.trim().toLowerCase();

    if (normalizedAction === "list") {
      try {
        const existingBytes = await readFile(filePath);
        const pdf = await PDF.load(existingBytes);
        const attachments = Array.from(pdf.getAttachments().entries());
        const summary =
          attachments.length === 0
            ? "No embedded attachments."
            : attachments
                .map(([name], index) => `${index + 1}. ${name}`)
                .join("\n");
        await alertDialog(`Embedded attachments\n\n${summary}`);
        recordAudit("edit_attachments", "success", {
          action: "list",
          count: attachments.length,
        });
      } catch (err) {
        setError(String(err));
        recordAudit("edit_attachments", "failure", { reason: String(err), action: "list" });
      }
      return;
    }

    if (normalizedAction === "add") {
      const selected = await open({
        multiple: false,
        filters: [
          {
            name: "Attachment",
            extensions: ["pdf", "txt", "docx", "xlsx", "pptx", "csv", "json", "xml", "png", "jpg", "jpeg"],
          },
        ],
      });
      const attachmentPath = typeof selected === "string" ? selected : null;
      if (!attachmentPath) return;

      setDocumentSaving(true);
      setError(null);
      try {
        const [existingBytes, attachmentBytes] = await Promise.all([
          readFile(filePath),
          readFile(attachmentPath),
        ]);
        const pdf = await PDF.load(existingBytes);
        const attachmentName = attachmentPath.split("/").pop() ?? "attachment.bin";
        pdf.addAttachment(attachmentName, attachmentBytes);
        const updatedBytes = await pdf.save({ incremental: true });
        pushUndoSnapshot("add_attachment", existingBytes, currentPage);
        await writeDocumentSafely(filePath, updatedBytes, "add_attachment", existingBytes);
        const updatedInfo = await openPdf(filePath);
        setDocInfo(updatedInfo);
        await loadDetectedFormFields(filePath);
        await loadEditableLines(filePath, currentPage);
        recordAudit("edit_attachments", "success", {
          action: "add",
          attachmentName,
        });
      } catch (err) {
        setError(String(err));
        recordAudit("edit_attachments", "failure", { reason: String(err), action: "add" });
      } finally {
        setDocumentSaving(false);
      }
      return;
    }

    setError("Unknown attachments action.");
  }, [
    alertDialog,
    currentPage,
    filePath,
    loadDetectedFormFields,
    loadEditableLines,
    promptDialog,
    pushUndoSnapshot,
    recordAudit,
  ]);

  const exportDocumentStructure = useCallback(async () => {
    const outputPath = await save({
      filters: [{ name: "JSON", extensions: ["json"] }],
      defaultPath: filePath ? replaceFileExtension(filePath, "-structure.json") : "structure.json",
    });
    if (!outputPath) return;

    setDocumentSaving(true);
    setError(null);
    try {
      const payload = exportDocumentStructureAsJson(documentStructure);
      await writeFile(outputPath, new TextEncoder().encode(payload));
      recordAudit("export_document_structure", "success", {
        outputPath,
        bookmarks: documentStructure.bookmarks.length,
        links: documentStructure.links.length,
      });
    } catch (err) {
      setError(String(err));
      recordAudit("export_document_structure", "failure", { reason: String(err) });
    } finally {
      setDocumentSaving(false);
    }
  }, [documentStructure, filePath, recordAudit]);

  const comparePdfFiles = useCallback(async () => {
    if (!filePath) return;

    const selected = await open({
      multiple: false,
      filters: [{ name: "PDF", extensions: ["pdf"] }],
    });
    const targetPath = typeof selected === "string" ? selected : null;
    if (!targetPath) return;

    const outputPath = await save({
      filters: [{ name: "JSON", extensions: ["json"] }],
      defaultPath: replaceFileExtension(filePath, "-compare.json"),
    });
    if (!outputPath) return;

    setDocumentSaving(true);
    setError(null);
    const startedAt = performance.now();
    appendDebugLog("info", "compare_files_start", {
      basePath: filePath,
      targetPath,
      outputPath,
    });

    try {
      const [baseBytes, targetBytes] = await Promise.all([
        readFile(filePath),
        readFile(targetPath),
      ]);
      const report = await comparePdfDocuments(baseBytes, targetBytes);
      const payload = new TextEncoder().encode(JSON.stringify(report, null, 2));
      await writeFile(outputPath, payload);
      recordAudit("compare_pdf_files", "success", {
        basePath: filePath,
        targetPath,
        outputPath,
        changedTextPages: report.changedTextPages,
        changedVisualPages: report.changedVisualPages,
      });
      appendDebugLog("info", "compare_files_success", {
        basePath: filePath,
        targetPath,
        outputPath,
        changedTextPages: report.changedTextPages,
        changedVisualPages: report.changedVisualPages,
        differenceCount: report.differences.length,
        durationMs: Math.round(performance.now() - startedAt),
      });
      await alertDialog(
        `Compare complete.\nText changes: ${report.changedTextPages}\nVisual changes: ${report.changedVisualPages}\nDetailed report saved to:\n${outputPath}`,
      );
    } catch (err) {
      setError(String(err));
      recordAudit("compare_pdf_files", "failure", { reason: String(err) });
      appendDebugLog("error", "compare_files_failure", {
        basePath: filePath,
        targetPath,
        outputPath,
        error: String(err),
        durationMs: Math.round(performance.now() - startedAt),
      });
    } finally {
      setDocumentSaving(false);
    }
  }, [alertDialog, filePath, recordAudit]);

  const optimizePdf = useCallback(async () => {
    if (!filePath) return;

    const profileInput = await promptDialog(
      "Optimization profile (screen | print | high_quality | custom):",
      "screen",
    );
    if (!profileInput) return;

    const normalized = profileInput.trim().toLowerCase();
    const profile: PdfOptimizationProfile =
      normalized === "print"
        ? "print"
        : normalized === "high_quality"
          ? "high_quality"
          : normalized === "custom"
            ? "custom"
          : "screen";

    let customOptions: PdfOptimizationCustomOptions | undefined;
    if (profile === "custom") {
      const compressionThreshold = Math.max(
        0,
        Math.min(
          8192,
          Math.round(
            parseNumberInput(
              await promptDialog(
                "Custom compression threshold (0-8192). Lower = stronger compression:",
                "256",
              ),
              256,
            ),
          ),
        ),
      );
      const subsetFonts = parseBooleanInput(
        await promptDialog("Subset fonts? (yes/no):", "yes"),
        true,
      );
      const compressStreams = parseBooleanInput(
        await promptDialog("Compress streams? (yes/no):", "yes"),
        true,
      );
      customOptions = {
        subsetFonts,
        compressStreams,
        compressionThreshold,
      };
    }

    const outputPath = await save({
      filters: [{ name: "PDF", extensions: ["pdf"] }],
      defaultPath: replaceFileExtension(filePath, `-optimized-${profile}.pdf`),
    });
    if (!outputPath) return;

    setDocumentSaving(true);
    setError(null);
    const startedAt = performance.now();
    appendDebugLog("info", "optimize_pdf_start", {
      filePath,
      outputPath,
      profile,
    });

    try {
      const bytes = await readFile(filePath);
      const optimized = await optimizePdfDocument(bytes, profile, customOptions);
      await writeFile(outputPath, optimized.bytes);
      recordAudit("optimize_pdf", "success", {
        filePath,
        outputPath,
        profile,
        beforeBytes: optimized.report.beforeBytes,
        afterBytes: optimized.report.afterBytes,
        compressionThreshold: optimized.report.options.compressionThreshold,
      });
      appendDebugLog("info", "optimize_pdf_success", {
        filePath,
        outputPath,
        profile,
        beforeBytes: optimized.report.beforeBytes,
        afterBytes: optimized.report.afterBytes,
        changedBytes: optimized.report.changedBytes,
        options: optimized.report.options,
        durationMs: Math.round(performance.now() - startedAt),
      });
      await alertDialog(
        `Optimization complete.\nProfile: ${optimized.report.profile}\nBefore: ${optimized.report.beforeBytes} bytes\nAfter: ${optimized.report.afterBytes} bytes\nOutput: ${outputPath}`,
      );
    } catch (err) {
      setError(String(err));
      recordAudit("optimize_pdf", "failure", { reason: String(err) });
      appendDebugLog("error", "optimize_pdf_failure", {
        filePath,
        outputPath,
        profile,
        options: customOptions ?? null,
        error: String(err),
        durationMs: Math.round(performance.now() - startedAt),
      });
    } finally {
      setDocumentSaving(false);
    }
  }, [alertDialog, filePath, promptDialog, recordAudit]);

  const exportAuditLog = useCallback(async () => {
    const outputPath = await save({
      filters: [{ name: "JSONL", extensions: ["jsonl"] }],
      defaultPath: "pdfluent-audit-log.jsonl",
    });
    if (!outputPath) return;

    setDocumentSaving(true);
    setError(null);

    try {
      const tamperTrailValid = verifyTamperAuditTrail(enterpriseSettings);
      await writeFile(outputPath, exportAuditEntriesAsJsonl());
      recordAudit("export_audit_log", "success", { outputPath, tamperTrailValid });
      appendTamperAudit("export_audit_log", "success", {
        outputPath,
        tamperTrailValid,
      });
    } catch (err) {
      setError(String(err));
      recordAudit("export_audit_log", "failure", { reason: String(err) });
      appendTamperAudit("export_audit_log", "failure", { reason: String(err) });
    } finally {
      setDocumentSaving(false);
    }
  }, [appendTamperAudit, enterpriseSettings, recordAudit]);

  const exportDebugBundle = useCallback(async () => {
    const outputPath = await save({
      filters: [{ name: "JSON", extensions: ["json"] }],
      defaultPath: "pdfluent-debug-bundle.json",
    });
    if (!outputPath) return;

    setDocumentSaving(true);
    setError(null);

    try {
      const payload = {
        generatedAt: new Date().toISOString(),
        debugSessionId: getDebugSessionId(),
        app: {
          filePath,
          currentPage: currentPage + 1,
          pageCount: docInfo?.page_count ?? 0,
          scale,
          viewMode,
          annotationTool,
          textEditorEnabled,
          networkMode,
          sidebarVisible,
          formPanelVisible,
          adminConsoleOpen,
          error,
        },
        auditEntries: listAuditEntries(),
        debugLogs: listDebugLogs(),
      };

      await writeFile(
        outputPath,
        new TextEncoder().encode(JSON.stringify(payload, null, 2)),
      );
      appendDebugLog("info", "export_debug_bundle_success", {
        outputPath,
        auditCount: payload.auditEntries.length,
        debugCount: payload.debugLogs.length,
      });
      recordAudit("export_debug_bundle", "success", { outputPath });
    } catch (err) {
      setError(String(err));
      appendDebugLog("error", "export_debug_bundle_failure", {
        error: String(err),
      });
      recordAudit("export_debug_bundle", "failure", { reason: String(err) });
    } finally {
      setDocumentSaving(false);
    }
  }, [
    adminConsoleOpen,
    annotationTool,
    currentPage,
    docInfo?.page_count,
    error,
    filePath,
    formPanelVisible,
    networkMode,
    recordAudit,
    scale,
    sidebarVisible,
    textEditorEnabled,
    viewMode,
  ]);

  const addAdminUser = useCallback(
    (email: string, role: EnterpriseRole) => {
      updateEnterpriseSettings((previous) => addEnterpriseUser(previous, email, role));
      recordAudit("admin_add_user", "success", { email, role });
    },
    [recordAudit, updateEnterpriseSettings],
  );

  const removeAdminUser = useCallback(
    (userId: string) => {
      updateEnterpriseSettings((previous) => removeEnterpriseUser(previous, userId));
      recordAudit("admin_remove_user", "success", { userId });
    },
    [recordAudit, updateEnterpriseSettings],
  );

  const changeAdminUserRole = useCallback(
    (userId: string, role: EnterpriseRole) => {
      updateEnterpriseSettings((previous) => updateUserRole(previous, userId, role));
      recordAudit("admin_change_user_role", "success", { userId, role });
    },
    [recordAudit, updateEnterpriseSettings],
  );

  const changeEnterprisePolicies = useCallback(
    (policies: Partial<EnterprisePolicies>) => {
      updateEnterpriseSettings((previous) =>
        updateEnterprisePolicies(previous, policies),
      );
      recordAudit("admin_update_policies", "success");
    },
    [recordAudit, updateEnterpriseSettings],
  );

  const setActiveStorage = useCallback(
    (profileId: string) => {
      updateEnterpriseSettings((previous) =>
        setActiveStorageProfile(previous, profileId),
      );
      recordAudit("set_active_storage_profile", "success", { profileId });
    },
    [recordAudit, updateEnterpriseSettings],
  );

  const revokeAutomationApiKey = useCallback(
    (keyId: string) => {
      updateEnterpriseSettings((previous) => revokeApiKey(previous, keyId));
      recordAudit("revoke_api_key", "warning", { keyId });
    },
    [recordAudit, updateEnterpriseSettings],
  );

  const editTextLine = useCallback(
    async (line: EditableTextLine, replacementText: string) => {
      if (!filePath) return;

      setTextSaving(true);
      setError(null);
      const startedAt = performance.now();
      appendDebugLog("info", "edit_text_line_start", {
        filePath,
        page: currentPage + 1,
        lineIndex: line.lineIndex,
        replacementLength: replacementText.length,
      });

      try {
        const existingBytes = await readFile(filePath);
        const updatedBytes = await replaceTextLine(
          existingBytes,
          currentPage,
          line,
          replacementText,
        );

        pushUndoSnapshot("edit_text_line", existingBytes, currentPage);
        await writeDocumentSafely(
          filePath,
          updatedBytes,
          "edit_text_line",
          existingBytes,
        );
        const updatedInfo = await openPdf(filePath);
        setDocInfo(updatedInfo);
        await loadDetectedFormFields(filePath);
        await loadEditableLines(filePath, currentPage);
        recordAudit("edit_text_line", "success", {
          filePath,
          page: currentPage + 1,
        });
        appendDebugLog("info", "edit_text_line_success", {
          filePath,
          page: currentPage + 1,
          lineIndex: line.lineIndex,
          durationMs: Math.round(performance.now() - startedAt),
        });
      } catch (err) {
        setError(String(err));
        recordAudit("edit_text_line", "failure", { reason: String(err) });
        appendDebugLog("error", "edit_text_line_failure", {
          filePath,
          page: currentPage + 1,
          lineIndex: line.lineIndex,
          durationMs: Math.round(performance.now() - startedAt),
          error: String(err),
        });
        throw err;
      } finally {
        setTextSaving(false);
      }
    },
    [
      currentPage,
      filePath,
      loadDetectedFormFields,
      loadEditableLines,
      pushUndoSnapshot,
      recordAudit,
    ],
  );

  const undoLastMutation = useCallback(async () => {
    if (!filePath || !docInfo) {
      return;
    }

    const entry = undoStackRef.current.at(-1);
    if (!entry) {
      appendDebugLog("debug", "undo_noop_no_snapshot", { filePath });
      return;
    }

    setDocumentSaving(true);
    setError(null);
    const startedAt = performance.now();
    appendDebugLog("info", "undo_start", {
      filePath,
      action: entry.action,
      page: entry.page + 1,
    });

    try {
      const currentBytes = await readFile(filePath);
      await writeDocumentSafely(filePath, entry.bytes, "undo_mutation", currentBytes);
      const updatedInfo = await openPdf(filePath);
      setDocInfo(updatedInfo);
      setCurrentPage(Math.max(0, Math.min(entry.page, updatedInfo.page_count - 1)));
      await loadDetectedFormFields(filePath);
      await loadEditableLines(filePath, Math.max(0, entry.page));

      const redoEntry: MutationHistoryEntry = {
        action: entry.action,
        bytes: cloneBytes(currentBytes),
        page: currentPageRef.current,
        createdAtIso: new Date().toISOString(),
      };

      setUndoStack((previous) => previous.slice(0, -1));
      setRedoStack((previous) => {
        const next = [...previous, redoEntry];
        if (next.length > MUTATION_HISTORY_LIMIT) {
          return next.slice(next.length - MUTATION_HISTORY_LIMIT);
        }
        return next;
      });
      recordAudit("undo_mutation", "success", {
        filePath,
        action: entry.action,
      });
      appendDebugLog("info", "undo_success", {
        filePath,
        action: entry.action,
        durationMs: Math.round(performance.now() - startedAt),
      });
    } catch (err) {
      setError(String(err));
      recordAudit("undo_mutation", "failure", { reason: String(err) });
      appendDebugLog("error", "undo_failure", {
        filePath,
        action: entry.action,
        error: String(err),
      });
    } finally {
      setDocumentSaving(false);
    }
  }, [docInfo, filePath, loadDetectedFormFields, loadEditableLines, recordAudit]);

  const redoLastMutation = useCallback(async () => {
    if (!filePath || !docInfo) {
      return;
    }

    const entry = redoStackRef.current.at(-1);
    if (!entry) {
      appendDebugLog("debug", "redo_noop_no_snapshot", { filePath });
      return;
    }

    setDocumentSaving(true);
    setError(null);
    const startedAt = performance.now();
    appendDebugLog("info", "redo_start", {
      filePath,
      action: entry.action,
      page: entry.page + 1,
    });

    try {
      const currentBytes = await readFile(filePath);
      await writeDocumentSafely(filePath, entry.bytes, "redo_mutation", currentBytes);
      const updatedInfo = await openPdf(filePath);
      setDocInfo(updatedInfo);
      setCurrentPage(Math.max(0, Math.min(entry.page, updatedInfo.page_count - 1)));
      await loadDetectedFormFields(filePath);
      await loadEditableLines(filePath, Math.max(0, entry.page));

      const undoEntry: MutationHistoryEntry = {
        action: entry.action,
        bytes: cloneBytes(currentBytes),
        page: currentPageRef.current,
        createdAtIso: new Date().toISOString(),
      };
      setRedoStack((previous) => previous.slice(0, -1));
      setUndoStack((previous) => {
        const next = [...previous, undoEntry];
        if (next.length > MUTATION_HISTORY_LIMIT) {
          return next.slice(next.length - MUTATION_HISTORY_LIMIT);
        }
        return next;
      });
      recordAudit("redo_mutation", "success", {
        filePath,
        action: entry.action,
      });
      appendDebugLog("info", "redo_success", {
        filePath,
        action: entry.action,
        durationMs: Math.round(performance.now() - startedAt),
      });
    } catch (err) {
      setError(String(err));
      recordAudit("redo_mutation", "failure", { reason: String(err) });
      appendDebugLog("error", "redo_failure", {
        filePath,
        action: entry.action,
        error: String(err),
      });
    } finally {
      setDocumentSaving(false);
    }
  }, [docInfo, filePath, loadDetectedFormFields, loadEditableLines, recordAudit]);

  const openDroppedPdf = useCallback(
    (paths: string[], source: "drop_browser" | "drop_tauri") => {
      const resolvedPaths = paths
        .map((path) => path.trim())
        .filter((path) => path.length > 0);

      if (resolvedPaths.length === 0) {
        appendDebugLog("debug", "drop_event_without_paths", {
          source,
          inputCount: paths.length,
        });
        return;
      }

      const droppedPdfPath = pickFirstPdfPath(resolvedPaths);
      if (!droppedPdfPath) {
        appendDebugLog("warn", "drop_pdf_not_found", {
          source,
          paths: resolvedPaths,
        });
        recordAudit("drop_open_pdf", "warning", { reason: "non_pdf_file", source });
        if (!filePath) {
          setError("Dropped file is not a PDF.");
        } else {
          appendDebugLog("info", "drop_non_pdf_ignored_with_open_document", {
            source,
          });
        }
        return;
      }

      const now = Date.now();
      if (
        lastDroppedFileRef.current &&
        lastDroppedFileRef.current.path === droppedPdfPath &&
        now - lastDroppedFileRef.current.timestamp < 1500
      ) {
        appendDebugLog("debug", "drop_event_deduplicated", {
          source,
          path: droppedPdfPath,
        });
        return;
      }

      lastDroppedFileRef.current = {
        path: droppedPdfPath,
        timestamp: now,
      };

      appendDebugLog("info", "drop_pdf_open_requested", {
        source,
        path: droppedPdfPath,
      });
      void openPdfFromPath(droppedPdfPath, source).catch((error) => {
        const reason = String(error);
        appendDebugLog("error", "drop_pdf_open_unhandled_failure", {
          source,
          path: droppedPdfPath,
          error: reason,
        });
        recordAudit("drop_open_pdf", "failure", { reason, source });
      });
    },
    [filePath, openPdfFromPath, recordAudit],
  );

  useEffect(() => {
    const handleDragOver = (event: DragEvent) => {
      event.preventDefault();
    };

    const handleBrowserDrop = (event: DragEvent) => {
      event.preventDefault();

      const transfer = event.dataTransfer;
      if (!transfer) {
        appendDebugLog("warn", "browser_drop_missing_data_transfer");
        return;
      }

      const droppedPaths = Array.from(transfer.files)
        .map((file) => (file as File & { path?: string }).path ?? "")
        .filter((path) => path.length > 0);

      appendDebugLog("info", "browser_drop_event", {
        fileCount: transfer.files.length,
        fileNames: Array.from(transfer.files).map((file) => file.name),
        resolvedPathCount: droppedPaths.length,
      });

      if (droppedPaths.length > 0) {
        openDroppedPdf(droppedPaths, "drop_browser");
      }
    };

    window.addEventListener("dragover", handleDragOver);
    window.addEventListener("drop", handleBrowserDrop);

    return () => {
      window.removeEventListener("dragover", handleDragOver);
      window.removeEventListener("drop", handleBrowserDrop);
    };
  }, [openDroppedPdf]);

  useEffect(() => {
    let isMounted = true;
    let unlistenDrop: (() => void) | null = null;

    async function registerDropListener() {
      appendDebugLog("info", "tauri_drop_listener_register_start");
      try {
        unlistenDrop = await getCurrentWebviewWindow().onDragDropEvent((event) => {
          if (event.payload.type !== "drop") return;
          const paths = Array.isArray(event.payload.paths) ? event.payload.paths : [];

          appendDebugLog("info", "tauri_drop_event", {
            paths,
          });
          openDroppedPdf(paths, "drop_tauri");
        });
        appendDebugLog("info", "tauri_drop_listener_register_success");
      } catch (err) {
        if (!isMounted) return;
        appendDebugLog("warn", "tauri_drop_listener_register_failed", {
          error: err,
        });
      }
    }

    void registerDropListener();

    return () => {
      isMounted = false;
      if (unlistenDrop) {
        appendDebugLog("debug", "tauri_drop_listener_unlisten");
        unlistenDrop();
      }
    };
  }, [openDroppedPdf]);

  useEffect(() => {
    if (
      !splitDialogOpen &&
      !signDialogOpen &&
      !protectDialogOpen &&
      !watermarkDialogOpen &&
      !addImageDialogOpen &&
      !removeImageAreaDialogOpen &&
      !redactionDialogOpen &&
      !exportEncryptedCopyDialogOpen &&
      !importEncryptedCopyDialogOpen &&
      !exportImagesDialogOpen
    )
      return;

    function handleDialogKeyDown(event: KeyboardEvent) {
      if (event.key !== "Escape" || documentSaving || signing || loading) {
        return;
      }

      event.preventDefault();
      if (importEncryptedCopyDialogOpen) {
        closeImportEncryptedCopyDialog();
        return;
      }
      if (exportEncryptedCopyDialogOpen) {
        closeExportEncryptedCopyDialog();
        return;
      }
      if (exportImagesDialogOpen) {
        closeExportImagesDialog();
        return;
      }
      if (addImageDialogOpen) {
        closeAddImageDialog();
        return;
      }
      if (removeImageAreaDialogOpen) {
        closeRemoveImageAreaDialog();
        return;
      }
      if (redactionDialogOpen) {
        closeRedactionDialog();
        return;
      }
      if (watermarkDialogOpen) {
        closeWatermarkDialog();
        return;
      }
      if (protectDialogOpen) {
        closeProtectDialog();
        return;
      }
      if (signDialogOpen) {
        closeSignDialog();
        return;
      }
      if (splitDialogOpen) {
        closeSplitDialog();
      }
    }

    window.addEventListener("keydown", handleDialogKeyDown);
    return () => window.removeEventListener("keydown", handleDialogKeyDown);
  }, [
    addImageDialogOpen,
    closeAddImageDialog,
    closeExportEncryptedCopyDialog,
    closeExportImagesDialog,
    closeImportEncryptedCopyDialog,
    closeRemoveImageAreaDialog,
    closeRedactionDialog,
    closeWatermarkDialog,
    closeProtectDialog,
    closeSignDialog,
    closeSplitDialog,
    documentSaving,
    exportEncryptedCopyDialogOpen,
    exportImagesDialogOpen,
    importEncryptedCopyDialogOpen,
    loading,
    removeImageAreaDialogOpen,
    redactionDialogOpen,
    protectDialogOpen,
    signDialogOpen,
    signing,
    splitDialogOpen,
    watermarkDialogOpen,
  ]);

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (!docInfo) return;
      if (
        splitDialogOpen ||
        signDialogOpen ||
        protectDialogOpen ||
        watermarkDialogOpen ||
        addImageDialogOpen ||
        removeImageAreaDialogOpen ||
        redactionDialogOpen ||
        exportEncryptedCopyDialogOpen ||
        importEncryptedCopyDialogOpen ||
        exportImagesDialogOpen
      )
        return;

      const isPrimaryModifier = isPrimaryModifierPressed(platformTheme, e);
      const hasSearchQuery = normalizeSearchQuery(searchQuery).length > 0;
      const isZoomInShortcut =
        matchesPrimaryShortcut(platformTheme, e, "=") ||
        matchesPrimaryShortcut(platformTheme, e, "+", { shift: true });
      const isZoomOutShortcut =
        matchesPrimaryShortcut(platformTheme, e, "-") ||
        matchesPrimaryShortcut(platformTheme, e, "_", { shift: true });

      if (matchesPrimaryShortcut(platformTheme, e, "f")) {
        e.preventDefault();
        const searchInput = document.querySelector<HTMLInputElement>(
          'input[placeholder="Zoek"]',
        );
        searchInput?.focus();
        searchInput?.select();
      } else if (matchesUndoShortcut(platformTheme, e)) {
        e.preventDefault();
        void undoLastMutation();
      } else if (matchesRedoShortcut(platformTheme, e)) {
        e.preventDefault();
        void redoLastMutation();
      } else if (matchesPrimaryShortcut(platformTheme, e, "i", { shift: true })) {
        e.preventDefault();
        void insertBlankPage();
      } else if (matchesPrimaryShortcut(platformTheme, e, "r", { shift: true })) {
        e.preventDefault();
        void replaceCurrentPage();
      } else if (matchesPrimaryShortcut(platformTheme, e, "c", { shift: true })) {
        e.preventDefault();
        void cropCurrentPage();
      } else if (matchesPrimaryShortcut(platformTheme, e, "t", { shift: true })) {
        e.preventDefault();
        void copyCurrentPageText();
      } else if (matchesPrimaryShortcut(platformTheme, e, "d", { shift: true })) {
        e.preventDefault();
        void copyDocumentText();
      } else if (
        matchesPrimaryShortcut(platformTheme, e, "h", { shift: true, alt: true })
      ) {
        e.preventDefault();
        void replaceTextMatchesAcrossDocument();
      } else if (matchesPrimaryShortcut(platformTheme, e, "h", { shift: true })) {
        e.preventDefault();
        void replaceTextMatchesOnCurrentPage();
      } else if (!isPrimaryModifier && hasSearchQuery && e.key === "Enter") {
        e.preventDefault();
        if (e.shiftKey) {
          goToPreviousSearchMatch();
        } else {
          goToNextSearchMatch();
        }
      } else if (isZoomInShortcut) {
        e.preventDefault();
        zoomIn();
      } else if (isZoomOutShortcut) {
        e.preventDefault();
        zoomOut();
      } else if (matchesPrimaryShortcut(platformTheme, e, "0")) {
        e.preventDefault();
        zoomReset();
      } else if (e.key === "ArrowLeft" || e.key === "PageUp") {
        e.preventDefault();
        goToPage(currentPage - 1);
      } else if (e.key === "ArrowRight" || e.key === "PageDown") {
        e.preventDefault();
        goToPage(currentPage + 1);
      } else if (e.key === "Home") {
        e.preventDefault();
        goToPage(0);
      } else if (e.key === "End") {
        e.preventDefault();
        goToPage(docInfo.page_count - 1);
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [
    addImageDialogOpen,
    docInfo,
    currentPage,
    exportEncryptedCopyDialogOpen,
    exportImagesDialogOpen,
    copyCurrentPageText,
    copyDocumentText,
    goToNextSearchMatch,
    goToPage,
    goToPreviousSearchMatch,
    importEncryptedCopyDialogOpen,
    insertBlankPage,
    removeImageAreaDialogOpen,
    redoLastMutation,
    redactionDialogOpen,
    protectDialogOpen,
    replaceCurrentPage,
    cropCurrentPage,
    replaceTextMatchesAcrossDocument,
    replaceTextMatchesOnCurrentPage,
    searchQuery,
    signDialogOpen,
    splitDialogOpen,
    platformTheme,
    undoLastMutation,
    watermarkDialogOpen,
    zoomIn,
    zoomOut,
    zoomReset,
  ]);

  useEffect(() => {
    if (!filePath || !docInfo) return;

    persistViewState(filePath, {
      currentPage,
      scale,
      viewMode,
    });
  }, [filePath, docInfo, currentPage, scale, viewMode]);

  useEffect(() => {
    if (!filePath || !docInfo) {
      setEditableTextLines([]);
      return;
    }

    void loadEditableLines(filePath, currentPage).catch(() => {
      setEditableTextLines([]);
    });
  }, [filePath, docInfo, currentPage, loadEditableLines]);

  const normalizedSearch = useMemo(
    () => normalizeSearchQuery(searchQuery),
    [searchQuery],
  );

  useEffect(() => {
    if (!filePath || !docInfo || normalizedSearch.length === 0) {
      searchRequestRef.current += 1;
      setSearchMatches([]);
      setActiveSearchMatchIndex(0);
      setSearchingDocument(false);
      return;
    }

    const requestId = ++searchRequestRef.current;
    let cancelled = false;
    setSearchingDocument(true);

    appendDebugLog("info", "search_query_start", {
      query: normalizedSearch,
      pageCount: docInfo.page_count,
    });

    void (async () => {
      try {
        const bytes = await readFile(filePath);
        const matches: SearchMatch[] = [];

        for (let pageIndex = 0; pageIndex < docInfo.page_count; pageIndex += 1) {
          if (cancelled || searchRequestRef.current !== requestId) {
            return;
          }

          let lines = searchPageCacheRef.current.get(pageIndex);
          if (!lines) {
            appendDebugLog("debug", "search_page_cache_miss", {
              page: pageIndex + 1,
            });

            try {
              lines = await extractEditableTextLines(bytes, pageIndex);
              searchPageCacheRef.current.set(pageIndex, lines);
            } catch (err) {
              appendDebugLog("warn", "search_page_extract_failed", {
                page: pageIndex + 1,
                error: String(err),
              });
              continue;
            }
          } else {
            appendDebugLog("debug", "search_page_cache_hit", {
              page: pageIndex + 1,
            });
          }

          for (const line of lines) {
            if (line.text.toLowerCase().includes(normalizedSearch)) {
              matches.push({
                pageIndex,
                lineIndex: line.lineIndex,
              });
            }
          }
        }

        if (cancelled || searchRequestRef.current !== requestId) {
          return;
        }

        const startingPage = currentPageRef.current;
        const initialMatchIndex = matches.findIndex(
          (match) => match.pageIndex === startingPage,
        );
        const nextActiveIndex = initialMatchIndex >= 0 ? initialMatchIndex : 0;

        setSearchMatches(matches);
        setActiveSearchMatchIndex(nextActiveIndex);

        if (matches.length > 0) {
          const initialMatch = matches[nextActiveIndex];
          if (initialMatch) {
            setCurrentPage(initialMatch.pageIndex);
            appendDebugLog("debug", "search_match_selected", {
              reason: "initial",
              index: nextActiveIndex + 1,
              total: matches.length,
              page: initialMatch.pageIndex + 1,
            });
          }
        }

        appendDebugLog("info", "search_query_complete", {
          query: normalizedSearch,
          matchCount: matches.length,
        });
      } catch (err) {
        if (cancelled || searchRequestRef.current !== requestId) {
          return;
        }

        setSearchMatches([]);
        setActiveSearchMatchIndex(0);
        appendDebugLog("error", "search_query_failed", {
          query: normalizedSearch,
          error: String(err),
        });
      } finally {
        if (!cancelled && searchRequestRef.current === requestId) {
          setSearchingDocument(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [filePath, docInfo, normalizedSearch]);

  const currentPageSearchLineIndexes = useMemo(() => {
    if (normalizedSearch.length === 0) {
      return [];
    }

    return editableTextLines
      .filter((line) => line.text.toLowerCase().includes(normalizedSearch))
      .map((line) => line.lineIndex);
  }, [editableTextLines, normalizedSearch]);

  const activeSearchMatch = searchMatches[activeSearchMatchIndex] ?? null;
  const activeSearchLineIndex =
    activeSearchMatch && activeSearchMatch.pageIndex === currentPage
      ? activeSearchMatch.lineIndex
      : null;
  const searchResultLabel =
    normalizedSearch.length === 0
      ? ""
      : searchMatches.length === 0
        ? "0"
        : `${Math.min(activeSearchMatchIndex + 1, searchMatches.length)}/${searchMatches.length}`;
  const canUndo = filePath !== null && undoStack.length > 0;
  const canRedo = filePath !== null && redoStack.length > 0;

  return (
    <div className="app">
      <Toolbar
        appName={enterpriseSettings.branding.appName}
        onOpenFile={handleOpenFile}
        onCloseFile={handleCloseFile}
        onUndo={() => {
          void undoLastMutation();
        }}
        onRedo={() => {
          void redoLastMutation();
        }}
        canUndo={canUndo}
        canRedo={canRedo}
        recentFiles={recentFiles}
        onOpenRecentFile={openRecentFile}
        onClearRecentFiles={clearRecentFiles}
        sidebarVisible={sidebarVisible}
        onToggleSidebar={toggleSidebarVisibility}
        filePath={filePath}
        currentPage={currentPage}
        pageCount={docInfo?.page_count ?? 0}
        scale={scale}
        viewMode={viewMode}
        annotationTool={annotationTool}
        highlightColor={highlightColor}
        annotationSaving={
          annotationSaving || formSaving || signing || documentSaving || textSaving
        }
        signing={signing}
        checkingUpdates={checkingUpdates}
        ocrProcessing={ocrProcessing}
        textEditorEnabled={textEditorEnabled}
        networkMode={networkMode}
        onGoToPage={goToPage}
        onZoomIn={zoomIn}
        onZoomOut={zoomOut}
        onZoomReset={zoomReset}
        onFitWidth={fitToWidth}
        onViewModeChange={setViewMode}
        onAnnotationToolChange={selectAnnotationTool}
        onHighlightColorChange={setHighlightColor}
        onToggleTextEditor={toggleTextEditor}
        onSignDocument={openSignDialog}
        onRotatePageClockwise={() => {
          void rotateCurrentPage(90);
        }}
        onRotatePageCounterClockwise={() => {
          void rotateCurrentPage(270);
        }}
        onRotateAllPages={() => {
          void rotateEntireDocument();
        }}
        onDeletePage={() => {
          void deleteCurrentPage().catch((err) => {
            appendDebugLog("error", "delete_page_unhandled_error", {
              filePath,
              page: currentPageRef.current + 1,
              error: String(err),
            });
          });
        }}
        onDuplicatePage={() => {
          void duplicateCurrentPage();
        }}
        onCopyPageText={() => {
          void copyCurrentPageText();
        }}
        onCopyDocumentText={() => {
          void copyDocumentText();
        }}
        onFindReplacePage={() => {
          void replaceTextMatchesOnCurrentPage();
        }}
        onFindReplaceDocument={() => {
          void replaceTextMatchesAcrossDocument();
        }}
        onExtractPage={() => {
          void extractCurrentPage();
        }}
        onCropPage={() => {
          void cropCurrentPage();
        }}
        onInsertBlankPage={() => {
          void insertBlankPage();
        }}
        onReplaceCurrentPage={() => {
          void replaceCurrentPage();
        }}
        onPrintDocument={printDocument}
        onSplitPdf={openSplitDialog}
        onMergePdfs={() => {
          void mergeIntoDocument();
        }}
        onToggleNetworkMode={toggleNetworkMode}
        onCheckForUpdates={() => {
          void checkForAppUpdates();
        }}
        onExportEncryptedCopy={openExportEncryptedCopyDialog}
        onImportEncryptedCopy={openImportEncryptedCopyDialog}
        onAddImage={openAddImageDialog}
        onRemoveImageArea={openRemoveImageAreaDialog}
        onReplaceImageArea={() => {
          void replaceImageAreaOnCurrentPage();
        }}
        onRedactPage={openRedactionDialog}
        onAddWatermark={openWatermarkDialog}
        onAddHeaderFooter={() => {
          void addHeaderFooterAndBates();
        }}
        onExportDocx={() => {
          void exportAsDocx();
        }}
        onExportXlsx={() => {
          void exportAsXlsx();
        }}
        onExportPptx={() => {
          void exportAsPptx();
        }}
        onExportImages={openExportImagesDialog}
        onCreatePdfFromImages={() => {
          void convertImagesToPdf();
        }}
        onRunOcr={() => {
          void runOcrOnCurrentPage();
        }}
        onEnhanceScanForOcr={() => {
          void runEnhancedOcrOnCurrentPage();
        }}
        onProtectPdf={openProtectDialog}
        onValidatePdfA={() => {
          void validatePdfA();
        }}
        onGeneratePdfA={() => {
          void exportPdfAReadyCopy();
        }}
        onValidatePdfX={() => {
          void validatePdfX();
        }}
        onGeneratePdfX={() => {
          void exportPdfXReadyCopy();
        }}
        onRunAccessibilityAssistant={() => {
          void runAccessibilityAssistant();
        }}
        onVerifySignatures={() => {
          void verifySignatures();
        }}
        onManageBookmarksOutlines={() => {
          void manageBookmarksOutlines();
        }}
        onManageDocumentLinks={() => {
          void manageDocumentLinks();
        }}
        onManageAttachments={() => {
          void managePdfAttachments();
        }}
        onExportDocumentStructure={() => {
          void exportDocumentStructure();
        }}
        onRunESignRequest={() => {
          void runESignRequestWorkflow();
        }}
        onSendESignReminder={() => {
          void sendESignReminder();
        }}
        onManageESignTemplates={() => {
          void manageESignTemplates();
        }}
        onShowESignStatus={() => {
          void showESignStatus();
        }}
        onConfigureTeamBackend={() => {
          void configureTeamBackendProduction();
        }}
        onManageLicensesAndPolicies={() => {
          void manageLicensesAndPolicies();
        }}
        onRunStorageSyncEngine={() => {
          void runStorageSyncEngine();
        }}
        onManageIntegrations={() => {
          void manageIntegrationConnections();
        }}
        onConfigureApiProduct={() => {
          void configureApiProductization();
        }}
        onExportSiemAudit={() => {
          void exportTamperAuditSiem();
        }}
        onComparePdfFiles={() => {
          void comparePdfFiles();
        }}
        onOptimizePdf={() => {
          void optimizePdf();
        }}
        adminConsoleOpen={adminConsoleOpen}
        onConfigureByosStorage={() => {
          void configureByosStorage();
        }}
        onConfigureManagedStorage={() => {
          void configureManagedStorage();
        }}
        onConfigureSso={() => {
          void configureSso();
        }}
        onToggleAdminConsole={toggleAdminConsole}
        onRunBatchProcessing={() => {
          void runBatchProcessing();
        }}
        onConfigureBranding={() => {
          void configureBrandingSettings();
        }}
        onCreateApiKey={() => {
          void createAutomationApiKey();
        }}
        onExportAuditLog={() => {
          void exportAuditLog();
        }}
        onExportDebugBundle={() => {
          void exportDebugBundle();
        }}
        searchQuery={searchQuery}
        searchResultCount={searchMatches.length}
        searchResultLabel={searchResultLabel}
        searchBusy={searchingDocument}
        formFieldCount={formFields.length}
        formPanelVisible={formPanelVisible}
        commentThreadCount={commentThreads.length}
        commentsPanelVisible={commentsPanelVisible}
        onToggleFormPanel={toggleFormPanelVisibility}
        onToggleCommentsPanel={toggleCommentsPanelVisibility}
        onExportCommentsXfdf={() => {
          void exportCommentThreadsXfdf();
        }}
        onExportCommentsFdf={() => {
          void exportCommentThreadsFdf();
        }}
        onSearchQueryChange={updateSearchQuery}
        onSearchPrevious={goToPreviousSearchMatch}
        onSearchNext={goToNextSearchMatch}
        onAddFormField={() => {
          void addFormField();
        }}
        onOpenSettings={() => {
          setSettingsVisible(true);
        }}
      />
      <div className="flex flex-1 overflow-hidden">
        {sidebarVisible && (
          <Sidebar
            docInfo={docInfo}
            fileName={filePath ? filePath.split("/").pop() ?? null : null}
            currentPage={currentPage}
            scale={0.3}
            width={sidebarWidth}
            disabled={documentSaving || signing || formSaving || annotationSaving}
            canIncreaseWidth={sidebarWidth < MAX_SIDEBAR_WIDTH}
            canDecreaseWidth={sidebarWidth > MIN_SIDEBAR_WIDTH}
            onIncreaseWidth={increaseSidebarWidth}
            onDecreaseWidth={decreaseSidebarWidth}
            onSelectPage={goToPage}
            onReorderPages={reorderPages}
          />
        )}
        <Viewer
          filePath={filePath}
          docInfo={docInfo}
          currentPage={currentPage}
          scale={scale}
          viewMode={viewMode}
          annotationTool={annotationTool}
          highlightColor={highlightColor}
          textEditorEnabled={textEditorEnabled}
          editableTextLines={editableTextLines}
          searchLineIndexes={currentPageSearchLineIndexes}
          activeSearchLineIndex={activeSearchLineIndex}
          loading={loading}
          error={error}
          onPageChange={goToPage}
          onZoomIn={zoomIn}
          onZoomOut={zoomOut}
          onCreateAnnotation={applyAnnotation}
          onEditTextLine={editTextLine}
          annotationSaving={
            annotationSaving || formSaving || signing || documentSaving || textSaving
          }
        />
        {formFields.length > 0 && formPanelVisible && (
          <FormPanel
            fields={formFields}
            disabled={
              !filePath ||
              formSaving ||
              annotationSaving ||
              signing ||
              documentSaving
            }
            onUpdateField={updateFormField}
            onAddField={addFormField}
            onRemoveField={removeFormField}
          />
        )}
        {commentsPanelVisible && (
          <CommentsPanel
            threads={filteredCommentThreads}
            filter={commentThreadFilter}
            disabled={!filePath || documentSaving || signing || annotationSaving}
            onFilterChange={setCommentThreadFilter}
            onSetStatus={updateCommentStatus}
            onAddReply={replyToCommentThread}
            onExportXfdf={() => {
              void exportCommentThreadsXfdf();
            }}
            onExportFdf={() => {
              void exportCommentThreadsFdf();
            }}
          />
        )}
        {adminConsoleOpen && (
          <AdminPanel
            settings={enterpriseSettings}
            auditEntries={auditEntries}
            disabled={documentSaving || signing || formSaving || annotationSaving}
            onAddUser={addAdminUser}
            onRemoveUser={removeAdminUser}
            onChangeUserRole={changeAdminUserRole}
            onUpdatePolicies={changeEnterprisePolicies}
            onSetActiveStorage={setActiveStorage}
            onRevokeApiKey={revokeAutomationApiKey}
          />
        )}
      </div>
      <Settings
        visible={settingsVisible}
        onClose={() => {
          setSettingsVisible(false);
        }}
      />
      {appDialogState && (
        <div
          className="app-dialog-backdrop"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) {
              resolveAppDialog(false);
            }
          }}
        >
          <form
            className="app-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="app-dialog-title"
            onSubmit={(event) => {
              event.preventDefault();
              resolveAppDialog(true);
            }}
          >
            <h2 className="app-dialog-title" id="app-dialog-title">
              {appDialogState.title}
            </h2>
            {appDialogState.description.length > 0 && (
              <p className="app-dialog-description">{appDialogState.description}</p>
            )}
            {appDialogState.mode === "prompt" && (
              <>
                <label className="app-dialog-label" htmlFor="app-dialog-input">
                  Value
                </label>
                <input
                  id="app-dialog-input"
                  className="app-dialog-input"
                  type={appDialogState.inputType}
                  value={appDialogState.value}
                  onChange={(event) => {
                    const value = event.target.value;
                    setAppDialogState((current) => {
                      if (!current) return current;
                      return {
                        ...current,
                        value,
                      };
                    });
                  }}
                  placeholder={appDialogState.placeholder}
                  autoFocus
                />
              </>
            )}
            <div className="app-dialog-actions">
              {appDialogState.mode !== "alert" && (
                <button
                  type="button"
                  className="toolbar-btn"
                  onClick={() => {
                    resolveAppDialog(false);
                  }}
                >
                  {appDialogState.cancelLabel}
                </button>
              )}
              <button type="submit" className="toolbar-btn toolbar-btn-primary">
                {appDialogState.confirmLabel}
              </button>
            </div>
          </form>
        </div>
      )}
      {exportEncryptedCopyDialogOpen && (
        <div
          className="export-encrypted-copy-dialog-backdrop"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget && !documentSaving) {
              closeExportEncryptedCopyDialog();
            }
          }}
        >
          <form
            className="export-encrypted-copy-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="export-encrypted-copy-dialog-title"
            onSubmit={(event) => {
              event.preventDefault();
              void exportEncryptedCopy();
            }}
          >
            <h2
              className="export-encrypted-copy-dialog-title"
              id="export-encrypted-copy-dialog-title"
            >
              Export encrypted copy
            </h2>
            <p className="export-encrypted-copy-dialog-description">
              Save the current PDF as an encrypted `.pdfluent.enc` file.
            </p>
            <label
              className="export-encrypted-copy-dialog-label"
              htmlFor="export-encrypted-copy-output-input"
            >
              Output file
            </label>
            <div className="export-encrypted-copy-dialog-row">
              <input
                id="export-encrypted-copy-output-input"
                className="export-encrypted-copy-dialog-input export-encrypted-copy-dialog-input-readonly"
                value={exportEncryptedCopyDialogDraft.outputPath}
                placeholder="No output selected"
                readOnly
                disabled={documentSaving}
              />
              <button
                type="button"
                className="toolbar-btn"
                onClick={() => {
                  void pickExportEncryptedCopyPath();
                }}
                disabled={documentSaving}
              >
                Choose output
              </button>
            </div>
            <label
              className="export-encrypted-copy-dialog-label"
              htmlFor="export-encrypted-copy-passphrase-input"
            >
              Passphrase
            </label>
            <input
              id="export-encrypted-copy-passphrase-input"
              className="export-encrypted-copy-dialog-input"
              type="password"
              value={exportEncryptedCopyDialogDraft.passphrase}
              onChange={(event) => {
                const value = event.target.value;
                setExportEncryptedCopyDialogDraft((current) => ({
                  ...current,
                  passphrase: value,
                }));
              }}
              placeholder="Required"
              autoFocus
              disabled={documentSaving}
            />
            <label
              className="export-encrypted-copy-dialog-label"
              htmlFor="export-encrypted-copy-confirm-input"
            >
              Confirm passphrase
            </label>
            <input
              id="export-encrypted-copy-confirm-input"
              className="export-encrypted-copy-dialog-input"
              type="password"
              value={exportEncryptedCopyDialogDraft.confirmPassphrase}
              onChange={(event) => {
                const value = event.target.value;
                setExportEncryptedCopyDialogDraft((current) => ({
                  ...current,
                  confirmPassphrase: value,
                }));
              }}
              placeholder="Required"
              disabled={documentSaving}
            />
            <div className="export-encrypted-copy-dialog-actions">
              <button
                type="button"
                className="toolbar-btn"
                onClick={closeExportEncryptedCopyDialog}
                disabled={documentSaving}
              >
                Cancel
              </button>
              <button
                type="submit"
                className="toolbar-btn toolbar-btn-primary"
                disabled={documentSaving}
              >
                {documentSaving ? "Exporting..." : "Export encrypted copy"}
              </button>
            </div>
          </form>
        </div>
      )}
      {importEncryptedCopyDialogOpen && (
        <div
          className="import-encrypted-copy-dialog-backdrop"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget && !loading) {
              closeImportEncryptedCopyDialog();
            }
          }}
        >
          <form
            className="import-encrypted-copy-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="import-encrypted-copy-dialog-title"
            onSubmit={(event) => {
              event.preventDefault();
              void importEncryptedCopy();
            }}
          >
            <h2
              className="import-encrypted-copy-dialog-title"
              id="import-encrypted-copy-dialog-title"
            >
              Import encrypted copy
            </h2>
            <p className="import-encrypted-copy-dialog-description">
              Decrypt a `.pdfluent.enc` file and open the resulting PDF.
            </p>
            <label
              className="import-encrypted-copy-dialog-label"
              htmlFor="import-encrypted-copy-input-path"
            >
              Encrypted file
            </label>
            <div className="import-encrypted-copy-dialog-row">
              <input
                id="import-encrypted-copy-input-path"
                className="import-encrypted-copy-dialog-input import-encrypted-copy-dialog-input-readonly"
                value={importEncryptedCopyDialogDraft.encryptedPath}
                placeholder="No encrypted file selected"
                readOnly
                disabled={loading}
              />
              <button
                type="button"
                className="toolbar-btn"
                onClick={() => {
                  void pickImportEncryptedCopyPath();
                }}
                disabled={loading}
              >
                Choose file
              </button>
            </div>
            <label
              className="import-encrypted-copy-dialog-label"
              htmlFor="import-encrypted-copy-output-path"
            >
              Output PDF
            </label>
            <div className="import-encrypted-copy-dialog-row">
              <input
                id="import-encrypted-copy-output-path"
                className="import-encrypted-copy-dialog-input import-encrypted-copy-dialog-input-readonly"
                value={importEncryptedCopyDialogDraft.outputPath}
                placeholder="No output selected"
                readOnly
                disabled={loading}
              />
              <button
                type="button"
                className="toolbar-btn"
                onClick={() => {
                  void pickImportDecryptedOutputPath();
                }}
                disabled={loading}
              >
                Choose output
              </button>
            </div>
            <label
              className="import-encrypted-copy-dialog-label"
              htmlFor="import-encrypted-copy-passphrase"
            >
              Passphrase
            </label>
            <input
              id="import-encrypted-copy-passphrase"
              className="import-encrypted-copy-dialog-input"
              type="password"
              value={importEncryptedCopyDialogDraft.passphrase}
              onChange={(event) => {
                const value = event.target.value;
                setImportEncryptedCopyDialogDraft((current) => ({
                  ...current,
                  passphrase: value,
                }));
              }}
              placeholder="Required"
              autoFocus
              disabled={loading}
            />
            <div className="import-encrypted-copy-dialog-actions">
              <button
                type="button"
                className="toolbar-btn"
                onClick={closeImportEncryptedCopyDialog}
                disabled={loading}
              >
                Cancel
              </button>
              <button
                type="submit"
                className="toolbar-btn toolbar-btn-primary"
                disabled={loading}
              >
                {loading ? "Importing..." : "Decrypt and open PDF"}
              </button>
            </div>
          </form>
        </div>
      )}
      {exportImagesDialogOpen && (
        <div
          className="export-images-dialog-backdrop"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget && !documentSaving) {
              closeExportImagesDialog();
            }
          }}
        >
          <form
            className="export-images-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="export-images-dialog-title"
            onSubmit={(event) => {
              event.preventDefault();
              void exportAsImages();
            }}
          >
            <h2 className="export-images-dialog-title" id="export-images-dialog-title">
              Export as images
            </h2>
            <p className="export-images-dialog-description">
              Export every page as `PNG` or `JPG` with custom render scale.
            </p>
            <div className="export-images-dialog-grid">
              <div className="export-images-dialog-field">
                <label className="export-images-dialog-label" htmlFor="export-images-format-select">
                  Format
                </label>
                <select
                  id="export-images-format-select"
                  className="export-images-dialog-input"
                  value={exportImagesDialogDraft.format}
                  onChange={(event) => {
                    const nextFormat = event.target.value === "jpg" ? "jpg" : "png";
                    setExportImagesDialogDraft((current) => ({
                      ...current,
                      format: nextFormat,
                      outputPath:
                        current.outputPath.trim().length === 0
                          ? filePath
                            ? replaceFileExtension(filePath, `.${nextFormat}`)
                            : ""
                          : current.outputPath.replace(/\.(png|jpe?g)$/i, `.${nextFormat}`),
                    }));
                  }}
                  disabled={documentSaving}
                >
                  <option value="png">PNG</option>
                  <option value="jpg">JPG</option>
                </select>
              </div>
              <div className="export-images-dialog-field">
                <label className="export-images-dialog-label" htmlFor="export-images-scale-input">
                  Scale (1-4)
                </label>
                <input
                  id="export-images-scale-input"
                  className="export-images-dialog-input"
                  value={exportImagesDialogDraft.scale}
                  onChange={(event) => {
                    const value = event.target.value;
                    setExportImagesDialogDraft((current) => ({
                      ...current,
                      scale: value,
                    }));
                  }}
                  autoFocus
                  disabled={documentSaving}
                />
              </div>
              <div className="export-images-dialog-field">
                <label className="export-images-dialog-label" htmlFor="export-images-jpeg-quality-input">
                  JPEG quality (0.4-1)
                </label>
                <input
                  id="export-images-jpeg-quality-input"
                  className="export-images-dialog-input"
                  value={exportImagesDialogDraft.jpegQuality}
                  onChange={(event) => {
                    const value = event.target.value;
                    setExportImagesDialogDraft((current) => ({
                      ...current,
                      jpegQuality: value,
                    }));
                  }}
                  disabled={documentSaving || exportImagesDialogDraft.format !== "jpg"}
                />
              </div>
            </div>
            <label className="export-images-dialog-label" htmlFor="export-images-output-input">
              Output file template
            </label>
            <div className="export-images-dialog-row">
              <input
                id="export-images-output-input"
                className="export-images-dialog-input export-images-dialog-input-readonly"
                value={exportImagesDialogDraft.outputPath}
                placeholder="No output selected"
                readOnly
                disabled={documentSaving}
              />
              <button
                type="button"
                className="toolbar-btn"
                onClick={() => {
                  void pickExportImagesOutputPath();
                }}
                disabled={documentSaving}
              >
                Choose output
              </button>
            </div>
            <div className="export-images-dialog-actions">
              <button
                type="button"
                className="toolbar-btn"
                onClick={closeExportImagesDialog}
                disabled={documentSaving}
              >
                Cancel
              </button>
              <button
                type="submit"
                className="toolbar-btn toolbar-btn-primary"
                disabled={documentSaving}
              >
                {documentSaving ? "Exporting..." : "Export images"}
              </button>
            </div>
          </form>
        </div>
      )}
      {addImageDialogOpen && (
        <div
          className="add-image-dialog-backdrop"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget && !documentSaving) {
              closeAddImageDialog();
            }
          }}
        >
          <form
            className="add-image-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="add-image-dialog-title"
            onSubmit={(event) => {
              event.preventDefault();
              void addImageOnCurrentPage();
            }}
          >
            <h2 className="add-image-dialog-title" id="add-image-dialog-title">
              Add image
            </h2>
            <p className="add-image-dialog-description">
              Select an image file and set the placement rectangle on the current page.
            </p>
            <label className="add-image-dialog-label" htmlFor="add-image-path-input">
              Image file
            </label>
            <div className="add-image-dialog-row">
              <input
                id="add-image-path-input"
                className="add-image-dialog-input add-image-dialog-input-readonly"
                value={addImageDialogDraft.imagePath}
                placeholder="No image selected"
                readOnly
                disabled={documentSaving}
              />
              <button
                type="button"
                className="toolbar-btn"
                onClick={() => {
                  void pickAddImageFile();
                }}
                disabled={documentSaving}
              >
                Choose image
              </button>
            </div>
            <div className="add-image-dialog-grid">
              <div className="add-image-dialog-field">
                <label className="add-image-dialog-label" htmlFor="add-image-x-input">
                  X
                </label>
                <input
                  id="add-image-x-input"
                  className="add-image-dialog-input"
                  value={addImageDialogDraft.x}
                  onChange={(event) => {
                    const value = event.target.value;
                    setAddImageDialogDraft((current) => ({
                      ...current,
                      x: value,
                    }));
                  }}
                  autoFocus
                  disabled={documentSaving}
                />
              </div>
              <div className="add-image-dialog-field">
                <label className="add-image-dialog-label" htmlFor="add-image-y-input">
                  Y
                </label>
                <input
                  id="add-image-y-input"
                  className="add-image-dialog-input"
                  value={addImageDialogDraft.y}
                  onChange={(event) => {
                    const value = event.target.value;
                    setAddImageDialogDraft((current) => ({
                      ...current,
                      y: value,
                    }));
                  }}
                  disabled={documentSaving}
                />
              </div>
              <div className="add-image-dialog-field">
                <label className="add-image-dialog-label" htmlFor="add-image-width-input">
                  Width
                </label>
                <input
                  id="add-image-width-input"
                  className="add-image-dialog-input"
                  value={addImageDialogDraft.width}
                  onChange={(event) => {
                    const value = event.target.value;
                    setAddImageDialogDraft((current) => ({
                      ...current,
                      width: value,
                    }));
                  }}
                  disabled={documentSaving}
                />
              </div>
              <div className="add-image-dialog-field">
                <label className="add-image-dialog-label" htmlFor="add-image-height-input">
                  Height
                </label>
                <input
                  id="add-image-height-input"
                  className="add-image-dialog-input"
                  value={addImageDialogDraft.height}
                  onChange={(event) => {
                    const value = event.target.value;
                    setAddImageDialogDraft((current) => ({
                      ...current,
                      height: value,
                    }));
                  }}
                  disabled={documentSaving}
                />
              </div>
              <div className="add-image-dialog-field">
                <label className="add-image-dialog-label" htmlFor="add-image-opacity-input">
                  Opacity
                </label>
                <input
                  id="add-image-opacity-input"
                  className="add-image-dialog-input"
                  value={addImageDialogDraft.opacity}
                  onChange={(event) => {
                    const value = event.target.value;
                    setAddImageDialogDraft((current) => ({
                      ...current,
                      opacity: value,
                    }));
                  }}
                  disabled={documentSaving}
                />
              </div>
              <div className="add-image-dialog-field">
                <label
                  className="add-image-dialog-label"
                  htmlFor="add-image-rotation-input"
                >
                  Rotation
                </label>
                <input
                  id="add-image-rotation-input"
                  className="add-image-dialog-input"
                  value={addImageDialogDraft.rotationDegrees}
                  onChange={(event) => {
                    const value = event.target.value;
                    setAddImageDialogDraft((current) => ({
                      ...current,
                      rotationDegrees: value,
                    }));
                  }}
                  disabled={documentSaving}
                />
              </div>
              <div className="add-image-dialog-field">
                <label
                  className="add-image-dialog-label"
                  htmlFor="add-image-layer-order-select"
                >
                  Layer
                </label>
                <select
                  id="add-image-layer-order-select"
                  className="add-image-dialog-input"
                  value={addImageDialogDraft.layerOrder}
                  onChange={(event) => {
                    const value = parseLayerOrderInput(event.target.value, "front");
                    setAddImageDialogDraft((current) => ({
                      ...current,
                      layerOrder: value,
                    }));
                  }}
                  disabled={documentSaving}
                >
                  <option value="front">Front</option>
                  <option value="back">Back</option>
                </select>
              </div>
            </div>
            <div className="add-image-dialog-actions">
              <button
                type="button"
                className="toolbar-btn"
                onClick={closeAddImageDialog}
                disabled={documentSaving}
              >
                Cancel
              </button>
              <button
                type="submit"
                className="toolbar-btn toolbar-btn-primary"
                disabled={documentSaving}
              >
                {documentSaving ? "Applying..." : "Add image"}
              </button>
            </div>
          </form>
        </div>
      )}
      {removeImageAreaDialogOpen && (
        <div
          className="remove-image-area-dialog-backdrop"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget && !documentSaving) {
              closeRemoveImageAreaDialog();
            }
          }}
        >
          <form
            className="remove-image-area-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="remove-image-area-dialog-title"
            onSubmit={(event) => {
              event.preventDefault();
              void removeImageAreaOnCurrentPage();
            }}
          >
            <h2
              className="remove-image-area-dialog-title"
              id="remove-image-area-dialog-title"
            >
              Remove image area
            </h2>
            <p className="remove-image-area-dialog-description">
              Define the area rectangle to blank out on the current page.
            </p>
            <div className="remove-image-area-dialog-grid">
              <div className="remove-image-area-dialog-field">
                <label
                  className="remove-image-area-dialog-label"
                  htmlFor="remove-image-area-x-input"
                >
                  X
                </label>
                <input
                  id="remove-image-area-x-input"
                  className="remove-image-area-dialog-input"
                  value={removeImageAreaDialogDraft.x}
                  onChange={(event) => {
                    const value = event.target.value;
                    setRemoveImageAreaDialogDraft((current) => ({
                      ...current,
                      x: value,
                    }));
                  }}
                  autoFocus
                  disabled={documentSaving}
                />
              </div>
              <div className="remove-image-area-dialog-field">
                <label
                  className="remove-image-area-dialog-label"
                  htmlFor="remove-image-area-y-input"
                >
                  Y
                </label>
                <input
                  id="remove-image-area-y-input"
                  className="remove-image-area-dialog-input"
                  value={removeImageAreaDialogDraft.y}
                  onChange={(event) => {
                    const value = event.target.value;
                    setRemoveImageAreaDialogDraft((current) => ({
                      ...current,
                      y: value,
                    }));
                  }}
                  disabled={documentSaving}
                />
              </div>
              <div className="remove-image-area-dialog-field">
                <label
                  className="remove-image-area-dialog-label"
                  htmlFor="remove-image-area-width-input"
                >
                  Width
                </label>
                <input
                  id="remove-image-area-width-input"
                  className="remove-image-area-dialog-input"
                  value={removeImageAreaDialogDraft.width}
                  onChange={(event) => {
                    const value = event.target.value;
                    setRemoveImageAreaDialogDraft((current) => ({
                      ...current,
                      width: value,
                    }));
                  }}
                  disabled={documentSaving}
                />
              </div>
              <div className="remove-image-area-dialog-field">
                <label
                  className="remove-image-area-dialog-label"
                  htmlFor="remove-image-area-height-input"
                >
                  Height
                </label>
                <input
                  id="remove-image-area-height-input"
                  className="remove-image-area-dialog-input"
                  value={removeImageAreaDialogDraft.height}
                  onChange={(event) => {
                    const value = event.target.value;
                    setRemoveImageAreaDialogDraft((current) => ({
                      ...current,
                      height: value,
                    }));
                  }}
                  disabled={documentSaving}
                />
              </div>
            </div>
            <div className="remove-image-area-dialog-actions">
              <button
                type="button"
                className="toolbar-btn"
                onClick={closeRemoveImageAreaDialog}
                disabled={documentSaving}
              >
                Cancel
              </button>
              <button
                type="submit"
                className="toolbar-btn toolbar-btn-primary"
                disabled={documentSaving}
              >
                {documentSaving ? "Applying..." : "Remove area"}
              </button>
            </div>
          </form>
        </div>
      )}
      {redactionDialogOpen && (
        <div
          className="redaction-dialog-backdrop"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget && !documentSaving) {
              closeRedactionDialog();
            }
          }}
        >
          <form
            className="redaction-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="redaction-dialog-title"
            onSubmit={(event) => {
              event.preventDefault();
              void redactCurrentPage();
            }}
          >
            <h2 className="redaction-dialog-title" id="redaction-dialog-title">
              Redact page
            </h2>
            <p className="redaction-dialog-description">
              Enter one or more regions as x,y,width,height,label. Separate regions with
              semicolons.
            </p>
            <label className="redaction-dialog-label" htmlFor="redaction-regions-input">
              Redaction regions
            </label>
            <textarea
              id="redaction-regions-input"
              className="redaction-dialog-textarea"
              value={redactionDialogDraft.regions}
              onChange={(event) => {
                const value = event.target.value;
                setRedactionDialogDraft((current) => ({
                  ...current,
                  regions: value,
                }));
              }}
              placeholder="36,36,220,24,REDACTED; 72,96,160,24"
              autoFocus
              disabled={documentSaving}
            />
            <div className="redaction-dialog-actions">
              <button
                type="button"
                className="toolbar-btn"
                onClick={closeRedactionDialog}
                disabled={documentSaving}
              >
                Cancel
              </button>
              <button
                type="submit"
                className="toolbar-btn toolbar-btn-primary"
                disabled={documentSaving}
              >
                {documentSaving ? "Applying..." : "Apply redaction"}
              </button>
            </div>
          </form>
        </div>
      )}
      {watermarkDialogOpen && (
        <div
          className="watermark-dialog-backdrop"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget && !documentSaving) {
              closeWatermarkDialog();
            }
          }}
        >
          <form
            className="watermark-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="watermark-dialog-title"
            onSubmit={(event) => {
              event.preventDefault();
              void addWatermark();
            }}
          >
            <h2 className="watermark-dialog-title" id="watermark-dialog-title">
              Add watermark
            </h2>
            <p className="watermark-dialog-description">
              Configure the watermark text and visual style for the full document.
            </p>
            <label className="watermark-dialog-label" htmlFor="watermark-text-input">
              Watermark text
            </label>
            <input
              id="watermark-text-input"
              className="watermark-dialog-input"
              value={watermarkDialogDraft.text}
              onChange={(event) => {
                const value = event.target.value;
                setWatermarkDialogDraft((current) => ({
                  ...current,
                  text: value,
                }));
              }}
              placeholder="CONFIDENTIAL"
              autoFocus
              disabled={documentSaving}
            />
            <div className="watermark-dialog-grid">
              <div className="watermark-dialog-field">
                <label className="watermark-dialog-label" htmlFor="watermark-opacity-input">
                  Opacity (0.05-0.95)
                </label>
                <input
                  id="watermark-opacity-input"
                  className="watermark-dialog-input"
                  value={watermarkDialogDraft.opacity}
                  onChange={(event) => {
                    const value = event.target.value;
                    setWatermarkDialogDraft((current) => ({
                      ...current,
                      opacity: value,
                    }));
                  }}
                  disabled={documentSaving}
                />
              </div>
              <div className="watermark-dialog-field">
                <label
                  className="watermark-dialog-label"
                  htmlFor="watermark-rotation-input"
                >
                  Rotation (degrees)
                </label>
                <input
                  id="watermark-rotation-input"
                  className="watermark-dialog-input"
                  value={watermarkDialogDraft.rotationDegrees}
                  onChange={(event) => {
                    const value = event.target.value;
                    setWatermarkDialogDraft((current) => ({
                      ...current,
                      rotationDegrees: value,
                    }));
                  }}
                  disabled={documentSaving}
                />
              </div>
              <div className="watermark-dialog-field">
                <label className="watermark-dialog-label" htmlFor="watermark-font-size-input">
                  Font size
                </label>
                <input
                  id="watermark-font-size-input"
                  className="watermark-dialog-input"
                  value={watermarkDialogDraft.fontSize}
                  onChange={(event) => {
                    const value = event.target.value;
                    setWatermarkDialogDraft((current) => ({
                      ...current,
                      fontSize: value,
                    }));
                  }}
                  disabled={documentSaving}
                />
              </div>
            </div>
            <div className="watermark-dialog-actions">
              <button
                type="button"
                className="toolbar-btn"
                onClick={closeWatermarkDialog}
                disabled={documentSaving}
              >
                Cancel
              </button>
              <button
                type="submit"
                className="toolbar-btn toolbar-btn-primary"
                disabled={documentSaving}
              >
                {documentSaving ? "Applying..." : "Apply watermark"}
              </button>
            </div>
          </form>
        </div>
      )}
      {protectDialogOpen && (
        <div
          className="protect-dialog-backdrop"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget && !documentSaving) {
              closeProtectDialog();
            }
          }}
        >
          <form
            className="protect-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="protect-dialog-title"
            onSubmit={(event) => {
              event.preventDefault();
              void protectDocument();
            }}
          >
            <h2 className="protect-dialog-title" id="protect-dialog-title">
              Protect PDF
            </h2>
            <p className="protect-dialog-description">
              Set a user password required to open this file. Optionally set an owner
              password for elevated permissions.
            </p>
            <label className="protect-dialog-label" htmlFor="protect-user-password-input">
              User password
            </label>
            <input
              id="protect-user-password-input"
              className="protect-dialog-input"
              type="password"
              value={protectDialogDraft.userPassword}
              onChange={(event) => {
                const value = event.target.value;
                setProtectDialogDraft((current) => ({
                  ...current,
                  userPassword: value,
                }));
              }}
              placeholder="Required"
              autoFocus
              disabled={documentSaving}
            />
            <label className="protect-dialog-label" htmlFor="protect-owner-password-input">
              Owner password
            </label>
            <input
              id="protect-owner-password-input"
              className="protect-dialog-input"
              type="password"
              value={protectDialogDraft.ownerPassword}
              onChange={(event) => {
                const value = event.target.value;
                setProtectDialogDraft((current) => ({
                  ...current,
                  ownerPassword: value,
                }));
              }}
              placeholder="Optional"
              disabled={documentSaving}
            />
            <div className="protect-dialog-actions">
              <button
                type="button"
                className="toolbar-btn"
                onClick={closeProtectDialog}
                disabled={documentSaving}
              >
                Cancel
              </button>
              <button
                type="submit"
                className="toolbar-btn toolbar-btn-primary"
                disabled={documentSaving}
              >
                {documentSaving ? "Applying..." : "Apply protection"}
              </button>
            </div>
          </form>
        </div>
      )}
      {signDialogOpen && (
        <div
          className="sign-dialog-backdrop"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget && !signing) {
              closeSignDialog();
            }
          }}
        >
          <form
            className="sign-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="sign-dialog-title"
            onSubmit={(event) => {
              event.preventDefault();
              void signDocument();
            }}
          >
            <h2 className="sign-dialog-title" id="sign-dialog-title">
              Sign document
            </h2>
            <p className="sign-dialog-description">
              Select a certificate and set signature details for the current page.
            </p>
            <label className="sign-dialog-label" htmlFor="sign-cert-input">
              Certificate
            </label>
            <div className="sign-dialog-row">
              <input
                id="sign-cert-input"
                className="sign-dialog-input sign-dialog-input-readonly"
                value={signDialogDraft.certPath}
                placeholder="No certificate selected"
                readOnly
                disabled={signing}
              />
              <button
                type="button"
                className="toolbar-btn"
                onClick={() => {
                  void selectSignCertificate();
                }}
                disabled={signing}
              >
                Choose
              </button>
            </div>
            <label className="sign-dialog-label" htmlFor="sign-password-input">
              Certificate password
            </label>
            <input
              id="sign-password-input"
              className="sign-dialog-input"
              type="password"
              value={signDialogDraft.password}
              onChange={(event) => {
                const value = event.target.value;
                setSignDialogDraft((current) => ({
                  ...current,
                  password: value,
                }));
              }}
              placeholder="Optional"
              disabled={signing}
            />
            <label className="sign-dialog-label" htmlFor="sign-name-input">
              Signer name
            </label>
            <input
              id="sign-name-input"
              className="sign-dialog-input"
              value={signDialogDraft.signerName}
              onChange={(event) => {
                const value = event.target.value;
                setSignDialogDraft((current) => ({
                  ...current,
                  signerName: value,
                }));
              }}
              disabled={signing}
            />
            <div className="sign-dialog-grid">
              <div className="sign-dialog-field">
                <label className="sign-dialog-label" htmlFor="sign-reason-input">
                  Reason
                </label>
                <input
                  id="sign-reason-input"
                  className="sign-dialog-input"
                  value={signDialogDraft.reason}
                  onChange={(event) => {
                    const value = event.target.value;
                    setSignDialogDraft((current) => ({
                      ...current,
                      reason: value,
                    }));
                  }}
                  disabled={signing}
                />
              </div>
              <div className="sign-dialog-field">
                <label className="sign-dialog-label" htmlFor="sign-location-input">
                  Location
                </label>
                <input
                  id="sign-location-input"
                  className="sign-dialog-input"
                  value={signDialogDraft.location}
                  onChange={(event) => {
                    const value = event.target.value;
                    setSignDialogDraft((current) => ({
                      ...current,
                      location: value,
                    }));
                  }}
                  disabled={signing}
                />
              </div>
            </div>
            <label className="sign-dialog-label" htmlFor="sign-contact-input">
              Contact info
            </label>
            <input
              id="sign-contact-input"
              className="sign-dialog-input"
              value={signDialogDraft.contactInfo}
              onChange={(event) => {
                const value = event.target.value;
                setSignDialogDraft((current) => ({
                  ...current,
                  contactInfo: value,
                }));
              }}
              placeholder="Optional"
              disabled={signing}
            />
            <div className="sign-dialog-grid sign-dialog-grid-signature">
              <div className="sign-dialog-field">
                <label className="sign-dialog-label" htmlFor="sign-x-input">
                  X
                </label>
                <input
                  id="sign-x-input"
                  className="sign-dialog-input"
                  value={signDialogDraft.x}
                  onChange={(event) => {
                    const value = event.target.value;
                    setSignDialogDraft((current) => ({
                      ...current,
                      x: value,
                    }));
                  }}
                  disabled={signing}
                />
              </div>
              <div className="sign-dialog-field">
                <label className="sign-dialog-label" htmlFor="sign-y-input">
                  Y
                </label>
                <input
                  id="sign-y-input"
                  className="sign-dialog-input"
                  value={signDialogDraft.y}
                  onChange={(event) => {
                    const value = event.target.value;
                    setSignDialogDraft((current) => ({
                      ...current,
                      y: value,
                    }));
                  }}
                  disabled={signing}
                />
              </div>
              <div className="sign-dialog-field">
                <label className="sign-dialog-label" htmlFor="sign-width-input">
                  Width
                </label>
                <input
                  id="sign-width-input"
                  className="sign-dialog-input"
                  value={signDialogDraft.width}
                  onChange={(event) => {
                    const value = event.target.value;
                    setSignDialogDraft((current) => ({
                      ...current,
                      width: value,
                    }));
                  }}
                  disabled={signing}
                />
              </div>
              <div className="sign-dialog-field">
                <label className="sign-dialog-label" htmlFor="sign-height-input">
                  Height
                </label>
                <input
                  id="sign-height-input"
                  className="sign-dialog-input"
                  value={signDialogDraft.height}
                  onChange={(event) => {
                    const value = event.target.value;
                    setSignDialogDraft((current) => ({
                      ...current,
                      height: value,
                    }));
                  }}
                  disabled={signing}
                />
              </div>
            </div>
            <div className="sign-dialog-actions">
              <button
                type="button"
                className="toolbar-btn"
                onClick={closeSignDialog}
                disabled={signing}
              >
                Cancel
              </button>
              <button
                type="submit"
                className="toolbar-btn toolbar-btn-primary"
                disabled={signing}
              >
                {signing ? "Signing..." : "Apply signature"}
              </button>
            </div>
          </form>
        </div>
      )}
      {splitDialogOpen && (
        <div
          className="split-dialog-backdrop"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget && !documentSaving) {
              closeSplitDialog();
            }
          }}
        >
          <form
            className="split-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="split-dialog-title"
            onSubmit={(event) => {
              event.preventDefault();
              void splitDocumentByRanges();
            }}
          >
            <h2 className="split-dialog-title" id="split-dialog-title">
              Split PDF ranges
            </h2>
            <p className="split-dialog-description">
              Enter page ranges like 1-3,4,7-9 and choose where split files should
              be saved.
            </p>
            <label className="split-dialog-label" htmlFor="split-ranges-input">
              Page ranges
            </label>
            <input
              id="split-ranges-input"
              className="split-dialog-input"
              value={splitRangesInput}
              onChange={(event) => setSplitRangesInput(event.target.value)}
              placeholder="1-3,4,7-9"
              autoFocus
              disabled={documentSaving}
            />
            <label className="split-dialog-label" htmlFor="split-target-directory-input">
              Output folder
            </label>
            <div className="split-dialog-directory-row">
              <input
                id="split-target-directory-input"
                className="split-dialog-input split-dialog-input-readonly"
                value={splitTargetDirectory}
                placeholder="No folder selected"
                readOnly
                disabled={documentSaving}
              />
              <button
                type="button"
                className="toolbar-btn"
                onClick={() => {
                  void pickSplitDirectory();
                }}
                disabled={documentSaving}
              >
                Choose folder
              </button>
            </div>
            <div className="split-dialog-actions">
              <button
                type="button"
                className="toolbar-btn"
                onClick={closeSplitDialog}
                disabled={documentSaving}
              >
                Cancel
              </button>
              <button
                type="submit"
                className="toolbar-btn toolbar-btn-primary"
                disabled={documentSaving}
              >
                {documentSaving ? "Splitting..." : "Split PDF"}
              </button>
            </div>
          </form>
        </div>
      )}
      <LicenseBanner
        tier={licenseStatus?.tier.toLowerCase() ?? "personal"}
        onActivate={() => setSettingsVisible(true)}
      />
      <Settings
        visible={settingsVisible}
        onClose={() => setSettingsVisible(false)}
        onLicenseChange={handleLicenseChange}
      />
      {showFirstRun && (
        <FirstRunDialog onComplete={handleFirstRunComplete} />
      )}
    </div>
  );
}
