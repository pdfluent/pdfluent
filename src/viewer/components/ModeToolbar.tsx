// Copyright (c) 2026 PDFluent B.V. All rights reserved.
//
// This software is proprietary and confidential.
// Free for personal, non-commercial use.
// Commercial use requires a valid license.
// See https://pdfluent.com/license for terms.

// TODO(pdfluent-viewer): wire all ModeToolbar tool buttons to their respective viewer actions
// Status: design integrated, functionality not implemented yet

import type { ReactNode } from 'react';
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

interface ModeToolbarProps {
  mode: ViewerMode;
}

interface ToolBtn {
  icon: ReactNode;
  label: string;
}

function ToolGroup({ tools }: { tools: ToolBtn[] }) {
  return (
    <div className="flex items-center gap-0.5">
      {tools.map((t) => (
        // TODO(pdfluent-viewer): connect individual tool buttons to viewer actions
        // Status: design integrated, functionality not implemented yet
        <button
          key={t.label}
          disabled
          title={`${t.label} (not yet available)`}
          aria-label={t.label}
          className="flex items-center gap-1 px-2 py-1 rounded text-xs text-muted-foreground/50 cursor-default hover:bg-transparent"
        >
          <span className="w-3.5 h-3.5">{t.icon}</span>
          <span className="hidden lg:inline">{t.label}</span>
        </button>
      ))}
    </div>
  );
}

function Divider() {
  return <div className="w-px h-4 bg-border mx-1 shrink-0" />;
}

const TOOLS_BY_MODE: Record<ViewerMode, Array<ToolBtn[]>> = {
  read: [
    [
      { icon: <MousePointerIcon />, label: 'Selecteren' },
      { icon: <HandIcon />, label: 'Pannen' },
    ],
    [
      { icon: <ZoomInIcon />, label: 'Inzoomen' },
      { icon: <ZoomOutIcon />, label: 'Uitzoomen' },
      { icon: <MaximizeIcon />, label: 'Volledig scherm' },
    ],
    [
      { icon: <SearchIcon />, label: 'Zoek tekst' },
      { icon: <BookOpenIcon />, label: 'Hardop lezen' },
    ],
  ],
  review: [
    [
      { icon: <HighlighterIcon />, label: 'Markeren' },
      { icon: <UnderlineIcon />, label: 'Onderstrepen' },
      { icon: <StrikethroughIcon />, label: 'Doorstrepen' },
    ],
    [
      { icon: <StickyNoteIcon />, label: 'Notitie' },
      { icon: <MessageSquareIcon />, label: 'Opmerking' },
    ],
    [
      { icon: <PenIcon />, label: 'Vrij tekenen' },
      { icon: <LayersIcon />, label: 'Stempel' },
    ],
  ],
  edit: [
    [
      { icon: <TypeIcon />, label: 'Tekst bewerken' },
      { icon: <TypeIcon />, label: 'Tekst toevoegen' },
    ],
    [
      { icon: <ImageIcon />, label: 'Afbeelding' },
      { icon: <LinkIcon />, label: 'Koppeling' },
    ],
    [
      { icon: <SlidersHorizontalIcon />, label: 'Koptekst/voettekst' },
      { icon: <LayersIcon />, label: 'Watermerk' },
    ],
  ],
  organize: [
    [
      { icon: <LayoutGridIcon />, label: 'Pagina invoegen' },
      { icon: <Trash2Icon />, label: 'Pagina verwijderen' },
      { icon: <RotateCwIcon />, label: 'Pagina roteren' },
    ],
    [
      { icon: <ScissorsIcon />, label: 'Splitsen' },
      { icon: <LayersIcon />, label: 'Samenvoegen' },
    ],
  ],
  forms: [
    [
      { icon: <SlidersHorizontalIcon />, label: 'Automatisch detecteren' },
    ],
    [
      { icon: <TypeIcon />, label: 'Tekstveld' },
      { icon: <CheckSquareIcon />, label: 'Selectievakje' },
      { icon: <CircleIcon />, label: 'Keuzerondje' },
    ],
    [
      { icon: <FileSignatureIcon />, label: 'Handtekening' },
      { icon: <PenIcon />, label: 'Initialen' },
      { icon: <CalendarIcon />, label: 'Datum' },
    ],
  ],
  protect: [
    [
      { icon: <LockIcon />, label: 'Wachtwoord' },
      { icon: <KeyIcon />, label: 'Machtigingen' },
    ],
    [
      { icon: <EyeOffIcon />, label: 'Redigeren' },
      { icon: <Trash2Icon />, label: 'Verbergen' },
    ],
    [
      { icon: <SearchIcon />, label: 'Vergelijken' },
      { icon: <SlidersHorizontalIcon />, label: 'Toegankelijkheid' },
    ],
  ],
  convert: [
    [
      { icon: <RefreshCwIcon />, label: 'Naar PDF' },
      { icon: <LayersIcon />, label: 'PDF exporteren' },
    ],
    [
      { icon: <PackageIcon />, label: 'Comprimeren' },
      { icon: <SearchIcon />, label: 'OCR scannen' },
    ],
  ],
};

export function ModeToolbar({ mode }: ModeToolbarProps) {
  const groups = TOOLS_BY_MODE[mode];

  return (
    <div className="h-10 flex items-center px-3 border-b border-border bg-background shrink-0 overflow-x-auto gap-0">
      {groups.map((group, gi) => (
        <span key={gi} className="flex items-center">
          {gi > 0 && <Divider />}
          <ToolGroup tools={group} />
        </span>
      ))}
    </div>
  );
}
