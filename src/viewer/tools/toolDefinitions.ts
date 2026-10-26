// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary. The PDFluent application is free to use,
// including for commercial purposes. Redistribution, or extraction or reuse
// of its components (including the embedded PDF engine), requires a licence.
// See https://pdfluent.com/license for terms.

// Shared tool definitions consumed by ModeToolbar and AllToolsPanel.
// Icons are stored as component references (not rendered JSX) so this
// module stays plain TypeScript with no JSX dependency.
// Labels are i18n keys — translate at render time with t(tool.label).

import type { ComponentType } from 'react';
import {
  MousePointerIcon,
  HandIcon,
  ZoomInIcon,
  ZoomOutIcon,
  MaximizeIcon,
  SearchIcon,
  HighlighterIcon,
  UnderlineIcon,
  StrikethroughIcon,
  MessageSquareIcon,
  StickyNoteIcon,
  PenIcon,
  TypeIcon,
  ImageIcon,
  LinkIcon,
  LayoutGridIcon,
  Trash2Icon,
  RotateCwIcon,
  RotateCcwIcon,
  ScissorsIcon,
  LayersIcon,
  CheckSquareIcon,
  CircleIcon,
  LockIcon,
  KeyIcon,
  EyeOffIcon,
  RefreshCwIcon,
  PackageIcon,
  FileSignatureIcon,
  SlidersHorizontalIcon,
  BookOpenIcon,
  BookmarkIcon,
  DownloadIcon,
  FileCheckIcon,
  InfoIcon,
  ReceiptTextIcon,
} from 'lucide-react';
import type { ViewerMode } from '../types';

export interface ToolDefinition {
  icon: ComponentType<{ className?: string }>;
  label: string;
  /**
   * The affordance elsewhere in the shell that actually performs this tool,
   * as `<kind>:<id>` — a control in the register (`docs/UI_REGISTER.md`).
   *
   * This is a claim, and `scripts/quality/ui-register.mjs` checks it: the
   * target must exist, be rendered by the running app and reach a command or
   * a named effect. A tile without a claim, or with one that does not hold, is
   * not rendered at all — the panel used to grey such tiles out and invite the
   * click anyway, off a hand-written list that was wrong in both directions.
   */
  fulfilledBy?: string;
  /**
   * The right-hand panel this tile opens, when the tool has one.
   *
   * Without it a tile only switches mode, which is how "PDF/A" came to land the
   * user on the convert panel: near enough to look wired and not the thing the
   * tile names.
   */
  opensPanel?: string;
}

/** i18n key for each viewer mode — used in AllToolsPanel section headings. */
export const MODE_LABELS: Record<ViewerMode, string> = {
  read:     'modes.read',
  review:   'modes.reviewAnnotate',
  edit:     'modes.editContent',
  sign:     'modes.sign',
  organize: 'modes.organize',
  forms:    'modes.forms',
  protect:  'modes.protect',
  convert:  'modes.convert',
};

/**
 * Tool groups per viewer mode.
 * Each entry is an array of groups; tools within a group are visually separated
 * from the next group by a divider in ModeToolbar.
 * Labels are i18n keys — translate at render time with t(tool.label).
 */
export const TOOLS_BY_MODE: Record<ViewerMode, ToolDefinition[][]> = {
  read: [
    [
      { icon: MousePointerIcon, label: 'toolbar.select',     fulfilledBy: 'rail-tool:select' },
      { icon: HandIcon,         label: 'toolbar.pan',        fulfilledBy: 'rail-tool:hand' },
    ],
    [
      { icon: ZoomInIcon,   label: 'toolbar.zoomIn',     fulfilledBy: 'button:zoom-in-btn' },
      { icon: ZoomOutIcon,  label: 'toolbar.zoomOut',    fulfilledBy: 'button:zoom-out-btn' },
      { icon: MaximizeIcon, label: 'toolbar.fullscreen', fulfilledBy: 'palette:fullscreen' },
    ],
    [
      { icon: SearchIcon,   label: 'toolbar.searchText', fulfilledBy: 'button:search-btn' },
      { icon: BookOpenIcon, label: 'toolbar.readAloud',  fulfilledBy: 'button:read-aloud-btn' },
      { icon: BookmarkIcon, label: 'toolbar.bookmarks', fulfilledBy: 'button:v3-outline-item' },
    ],
  ],
  review: [
    [
      { icon: HighlighterIcon,   label: 'toolbar.highlight',     fulfilledBy: 'rail-tool:highlight' },
      { icon: UnderlineIcon,     label: 'toolbar.underline',     fulfilledBy: 'button:annotation-tool-underline' },
      { icon: StrikethroughIcon, label: 'toolbar.strikethrough', fulfilledBy: 'button:annotation-tool-strikeout' },
    ],
    [
      { icon: StickyNoteIcon,    label: 'toolbar.note',    fulfilledBy: 'rail-tool:comment' },
      { icon: MessageSquareIcon, label: 'toolbar.comment', fulfilledBy: 'rail-tool:comment' },
    ],
    [
      { icon: PenIcon,    label: 'toolbar.freeDraw', fulfilledBy: 'rail-tool:draw' },
      { icon: LayersIcon, label: 'toolbar.stamp',    fulfilledBy: 'button:place-stamp-btn', opensPanel: 'edit' },
    ],
  ],
  edit: [
    [
      { icon: TypeIcon, label: 'toolbar.editText', fulfilledBy: 'panel:edit', opensPanel: 'edit' },
      { icon: TypeIcon, label: 'toolbar.addText',  fulfilledBy: 'button:insert-text-box-btn', opensPanel: 'edit' },
    ],
    [
      { icon: ImageIcon, label: 'toolbar.image', fulfilledBy: 'button:place-image-btn', opensPanel: 'edit' },
      { icon: LinkIcon,  label: 'toolbar.link' },
    ],
    [
      { icon: SlidersHorizontalIcon, label: 'toolbar.headerFooter' },
      { icon: LayersIcon,            label: 'toolbar.watermark',    fulfilledBy: 'panel:watermark', opensPanel: 'watermark' },
    ],
    [
      { icon: InfoIcon, label: 'toolbar.metadata', fulfilledBy: 'panel:metadata', opensPanel: 'metadata' },
    ],
  ],
  sign: [
    [
      { icon: FileSignatureIcon, label: 'toolbar.signature', fulfilledBy: 'panel:esign', opensPanel: 'esign' },
      { icon: PenIcon,           label: 'toolbar.initials',  fulfilledBy: 'button:add-initials-btn', opensPanel: 'esign' },
    ],
  ],
  organize: [
    [
      { icon: LayoutGridIcon, label: 'toolbar.insertPage',  fulfilledBy: 'button:organize-insert-before-btn' },
      { icon: Trash2Icon,     label: 'toolbar.deletePage',  fulfilledBy: 'button:batch-delete-btn' },
      { icon: RotateCcwIcon,  label: 'toolbar.rotateLeft',  fulfilledBy: 'button:batch-rotate-left-btn' },
      { icon: RotateCwIcon,   label: 'toolbar.rotateRight', fulfilledBy: 'button:batch-rotate-right-btn' },
    ],
    [
      { icon: ScissorsIcon, label: 'toolbar.split', fulfilledBy: 'panel:split', opensPanel: 'split' },
      { icon: LayersIcon,   label: 'toolbar.merge', fulfilledBy: 'panel:merge', opensPanel: 'merge' },
    ],
  ],
  forms: [
    [
      { icon: SlidersHorizontalIcon, label: 'toolbar.autoDetect' },
    ],
    [
      { icon: TypeIcon,        label: 'toolbar.textField' },
      { icon: CheckSquareIcon, label: 'toolbar.checkbox' },
      { icon: CircleIcon,      label: 'toolbar.radioButton' },
    ],
  ],
  protect: [
    [
      { icon: LockIcon, label: 'toolbar.password',    fulfilledBy: 'panel:protect', opensPanel: 'protect' },
      { icon: KeyIcon,  label: 'toolbar.permissions' },
    ],
    [
      { icon: EyeOffIcon, label: 'toolbar.redact', fulfilledBy: 'panel:redact', opensPanel: 'redact' },
      { icon: Trash2Icon, label: 'toolbar.hide' },
    ],
    [
      { icon: SearchIcon,            label: 'toolbar.compare' },
      { icon: SlidersHorizontalIcon, label: 'toolbar.accessibility' },
    ],
  ],
  convert: [
    [
      { icon: RefreshCwIcon, label: 'toolbar.toPdf' },
      { icon: DownloadIcon,  label: 'toolbar.exportPdf', fulfilledBy: 'button:export-btn' },
    ],
    [
      { icon: PackageIcon, label: 'toolbar.compress', fulfilledBy: 'panel:compress', opensPanel: 'compress' },
      { icon: SearchIcon,  label: 'toolbar.ocrScan',  fulfilledBy: 'panel:convert', opensPanel: 'convert' },
    ],
    [
      { icon: FileCheckIcon,   label: 'toolbar.pdfa',    fulfilledBy: 'panel:pdfa', opensPanel: 'pdfa' },
      { icon: ReceiptTextIcon, label: 'toolbar.invoice', fulfilledBy: 'panel:invoice', opensPanel: 'invoice' },
    ],
  ],
};
