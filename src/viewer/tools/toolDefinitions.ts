// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary and confidential.
// Free for personal, non-commercial use.
// Commercial use requires a valid license.
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
  CalendarIcon,
  SlidersHorizontalIcon,
  BookOpenIcon,
} from 'lucide-react';
import type { ViewerMode } from '../types';

export interface ToolDefinition {
  icon: ComponentType<{ className?: string }>;
  label: string;
}

/** i18n key for each viewer mode — used in AllToolsPanel section headings. */
export const MODE_LABELS: Record<ViewerMode, string> = {
  read:     'modes.read',
  review:   'modes.review',
  edit:     'modes.edit',
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
      { icon: MousePointerIcon, label: 'toolbar.select' },
      { icon: HandIcon,         label: 'toolbar.pan' },
    ],
    [
      { icon: ZoomInIcon,   label: 'toolbar.zoomIn' },
      { icon: ZoomOutIcon,  label: 'toolbar.zoomOut' },
      { icon: MaximizeIcon, label: 'toolbar.fullscreen' },
    ],
    [
      { icon: SearchIcon,   label: 'toolbar.searchText' },
      { icon: BookOpenIcon, label: 'toolbar.readAloud' },
    ],
  ],
  review: [
    [
      { icon: HighlighterIcon,    label: 'toolbar.highlight' },
      { icon: UnderlineIcon,      label: 'toolbar.underline' },
      { icon: StrikethroughIcon,  label: 'toolbar.strikethrough' },
    ],
    [
      { icon: StickyNoteIcon,    label: 'toolbar.note' },
      { icon: MessageSquareIcon, label: 'toolbar.comment' },
    ],
    [
      { icon: PenIcon,    label: 'toolbar.freeDraw' },
      { icon: LayersIcon, label: 'toolbar.stamp' },
    ],
  ],
  edit: [
    [
      { icon: TypeIcon, label: 'toolbar.editText' },
      { icon: TypeIcon, label: 'toolbar.addText' },
    ],
    [
      { icon: ImageIcon, label: 'toolbar.image' },
      { icon: LinkIcon,  label: 'toolbar.link' },
    ],
    [
      { icon: SlidersHorizontalIcon, label: 'toolbar.headerFooter' },
      { icon: LayersIcon,            label: 'toolbar.watermark' },
    ],
  ],
  organize: [
    [
      { icon: LayoutGridIcon, label: 'toolbar.insertPage' },
      { icon: Trash2Icon,     label: 'toolbar.deletePage' },
      { icon: RotateCcwIcon,  label: 'toolbar.rotateLeft' },
      { icon: RotateCwIcon,   label: 'toolbar.rotateRight' },
    ],
    [
      { icon: ScissorsIcon, label: 'toolbar.split' },
      { icon: LayersIcon,   label: 'toolbar.merge' },
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
    [
      { icon: FileSignatureIcon, label: 'toolbar.signature' },
      { icon: PenIcon,           label: 'toolbar.initials' },
      { icon: CalendarIcon,      label: 'toolbar.date' },
    ],
  ],
  protect: [
    [
      { icon: LockIcon, label: 'toolbar.password' },
      { icon: KeyIcon,  label: 'toolbar.permissions' },
    ],
    [
      { icon: EyeOffIcon, label: 'toolbar.redact' },
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
      { icon: LayersIcon,    label: 'toolbar.exportPdf' },
    ],
    [
      { icon: PackageIcon, label: 'toolbar.compress' },
      { icon: SearchIcon,  label: 'toolbar.ocrScan' },
    ],
  ],
};
