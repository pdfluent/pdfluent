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
  DownloadIcon,
} from 'lucide-react';
import type { ViewerMode } from '../types';

export interface ToolDefinition {
  icon: ComponentType<{ className?: string }>;
  label: string;
  /** Tailwind color class for AllToolsPanel icons (e.g. 'text-blue-600'). */
  color?: string;
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
      { icon: MousePointerIcon, label: 'toolbar.select',     color: 'text-blue-600' },
      { icon: HandIcon,         label: 'toolbar.pan',        color: 'text-blue-500' },
    ],
    [
      { icon: ZoomInIcon,   label: 'toolbar.zoomIn',     color: 'text-blue-600' },
      { icon: ZoomOutIcon,  label: 'toolbar.zoomOut',    color: 'text-blue-500' },
      { icon: MaximizeIcon, label: 'toolbar.fullscreen', color: 'text-blue-600' },
    ],
    [
      { icon: SearchIcon,   label: 'toolbar.searchText', color: 'text-green-600' },
      { icon: BookOpenIcon, label: 'toolbar.readAloud',  color: 'text-green-500' },
    ],
  ],
  review: [
    [
      { icon: HighlighterIcon,   label: 'toolbar.highlight',     color: 'text-yellow-600' },
      { icon: UnderlineIcon,     label: 'toolbar.underline',     color: 'text-yellow-500' },
      { icon: StrikethroughIcon, label: 'toolbar.strikethrough', color: 'text-yellow-600' },
    ],
    [
      { icon: StickyNoteIcon,    label: 'toolbar.note',    color: 'text-orange-500' },
      { icon: MessageSquareIcon, label: 'toolbar.comment', color: 'text-orange-600' },
    ],
    [
      { icon: PenIcon,    label: 'toolbar.freeDraw', color: 'text-pink-600' },
      { icon: LayersIcon, label: 'toolbar.stamp',    color: 'text-pink-500' },
    ],
  ],
  edit: [
    [
      { icon: TypeIcon, label: 'toolbar.editText', color: 'text-purple-600' },
      { icon: TypeIcon, label: 'toolbar.addText',  color: 'text-purple-500' },
    ],
    [
      { icon: ImageIcon, label: 'toolbar.image', color: 'text-blue-600' },
      { icon: LinkIcon,  label: 'toolbar.link',  color: 'text-blue-500' },
    ],
    [
      { icon: SlidersHorizontalIcon, label: 'toolbar.headerFooter', color: 'text-purple-500' },
      { icon: LayersIcon,            label: 'toolbar.watermark',    color: 'text-purple-600' },
    ],
  ],
  sign: [
    [
      { icon: FileSignatureIcon, label: 'toolbar.signature', color: 'text-pink-600' },
      { icon: PenIcon,           label: 'toolbar.initials',  color: 'text-pink-500' },
    ],
  ],
  organize: [
    [
      { icon: LayoutGridIcon, label: 'toolbar.insertPage',  color: 'text-green-600' },
      { icon: Trash2Icon,     label: 'toolbar.deletePage',  color: 'text-red-500' },
      { icon: RotateCcwIcon,  label: 'toolbar.rotateLeft',  color: 'text-green-500' },
      { icon: RotateCwIcon,   label: 'toolbar.rotateRight', color: 'text-green-500' },
    ],
    [
      { icon: ScissorsIcon, label: 'toolbar.split', color: 'text-green-600' },
      { icon: LayersIcon,   label: 'toolbar.merge', color: 'text-green-500' },
    ],
  ],
  forms: [
    [
      { icon: SlidersHorizontalIcon, label: 'toolbar.autoDetect', color: 'text-purple-600' },
    ],
    [
      { icon: TypeIcon,        label: 'toolbar.textField',   color: 'text-purple-500' },
      { icon: CheckSquareIcon, label: 'toolbar.checkbox',    color: 'text-purple-600' },
      { icon: CircleIcon,      label: 'toolbar.radioButton', color: 'text-purple-500' },
    ],
  ],
  protect: [
    [
      { icon: LockIcon, label: 'toolbar.password',    color: 'text-teal-600' },
      { icon: KeyIcon,  label: 'toolbar.permissions', color: 'text-teal-500' },
    ],
    [
      { icon: EyeOffIcon, label: 'toolbar.redact', color: 'text-pink-600' },
      { icon: Trash2Icon, label: 'toolbar.hide',   color: 'text-pink-500' },
    ],
    [
      { icon: SearchIcon,            label: 'toolbar.compare',      color: 'text-teal-600' },
      { icon: SlidersHorizontalIcon, label: 'toolbar.accessibility', color: 'text-teal-500' },
    ],
  ],
  convert: [
    [
      { icon: RefreshCwIcon, label: 'toolbar.toPdf',     color: 'text-red-600' },
      { icon: DownloadIcon,  label: 'toolbar.exportPdf', color: 'text-red-500' },
    ],
    [
      { icon: PackageIcon, label: 'toolbar.compress', color: 'text-red-500' },
      { icon: SearchIcon,  label: 'toolbar.ocrScan',  color: 'text-green-600' },
    ],
  ],
};
