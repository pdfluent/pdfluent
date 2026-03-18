// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary and confidential.
// Free for personal, non-commercial use.
// Commercial use requires a valid license.
// See https://pdfluent.com/license for terms.

// Shared tool definitions consumed by ModeToolbar and AllToolsPanel.
// Icons are stored as component references (not rendered JSX) so this
// module stays plain TypeScript with no JSX dependency.

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

/** Human-readable label for each viewer mode — used in AllToolsPanel section headings. */
export const MODE_LABELS: Record<ViewerMode, string> = {
  read:     'Lezen',
  review:   'Beoordelen',
  edit:     'Bewerken',
  organize: 'Indelen',
  forms:    'Formulieren',
  protect:  'Beveiligen',
  convert:  'Converteren',
};

/**
 * Tool groups per viewer mode.
 * Each entry is an array of groups; tools within a group are visually separated
 * from the next group by a divider in ModeToolbar.
 */
export const TOOLS_BY_MODE: Record<ViewerMode, ToolDefinition[][]> = {
  read: [
    [
      { icon: MousePointerIcon, label: 'Selecteren' },
      { icon: HandIcon,         label: 'Pannen' },
    ],
    [
      { icon: ZoomInIcon,   label: 'Inzoomen' },
      { icon: ZoomOutIcon,  label: 'Uitzoomen' },
      { icon: MaximizeIcon, label: 'Volledig scherm' },
    ],
    [
      { icon: SearchIcon,   label: 'Zoek tekst' },
      { icon: BookOpenIcon, label: 'Hardop lezen' },
    ],
  ],
  review: [
    [
      { icon: HighlighterIcon,    label: 'Markeren' },
      { icon: UnderlineIcon,      label: 'Onderstrepen' },
      { icon: StrikethroughIcon,  label: 'Doorstrepen' },
    ],
    [
      { icon: StickyNoteIcon,   label: 'Notitie' },
      { icon: MessageSquareIcon, label: 'Opmerking' },
    ],
    [
      { icon: PenIcon,    label: 'Vrij tekenen' },
      { icon: LayersIcon, label: 'Stempel' },
    ],
  ],
  edit: [
    [
      { icon: TypeIcon, label: 'Tekst bewerken' },
      { icon: TypeIcon, label: 'Tekst toevoegen' },
    ],
    [
      { icon: ImageIcon, label: 'Afbeelding' },
      { icon: LinkIcon,  label: 'Koppeling' },
    ],
    [
      { icon: SlidersHorizontalIcon, label: 'Koptekst/voettekst' },
      { icon: LayersIcon,            label: 'Watermerk' },
    ],
  ],
  organize: [
    [
      { icon: LayoutGridIcon, label: 'Pagina invoegen' },
      { icon: Trash2Icon,     label: 'Pagina verwijderen' },
      { icon: RotateCcwIcon,  label: 'Links roteren' },
      { icon: RotateCwIcon,   label: 'Rechts roteren' },
    ],
    [
      { icon: ScissorsIcon, label: 'Splitsen' },
      { icon: LayersIcon,   label: 'Samenvoegen' },
    ],
  ],
  forms: [
    [
      { icon: SlidersHorizontalIcon, label: 'Automatisch detecteren' },
    ],
    [
      { icon: TypeIcon,        label: 'Tekstveld' },
      { icon: CheckSquareIcon, label: 'Selectievakje' },
      { icon: CircleIcon,      label: 'Keuzerondje' },
    ],
    [
      { icon: FileSignatureIcon, label: 'Handtekening' },
      { icon: PenIcon,           label: 'Initialen' },
      { icon: CalendarIcon,      label: 'Datum' },
    ],
  ],
  protect: [
    [
      { icon: LockIcon, label: 'Wachtwoord' },
      { icon: KeyIcon,  label: 'Machtigingen' },
    ],
    [
      { icon: EyeOffIcon, label: 'Redigeren' },
      { icon: Trash2Icon, label: 'Verbergen' },
    ],
    [
      { icon: SearchIcon,            label: 'Vergelijken' },
      { icon: SlidersHorizontalIcon, label: 'Toegankelijkheid' },
    ],
  ],
  convert: [
    [
      { icon: RefreshCwIcon, label: 'Naar PDF' },
      { icon: LayersIcon,    label: 'PDF exporteren' },
    ],
    [
      { icon: PackageIcon, label: 'Comprimeren' },
      { icon: SearchIcon,  label: 'OCR scannen' },
    ],
  ],
};
