// Copyright (c) 2026 PDFluent B.V. All rights reserved.
//
// This software is proprietary and confidential.
// Free for personal, non-commercial use.
// Commercial use requires a valid license.
// See https://pdfluent.com/license for terms.

// TODO(pdfluent-viewer): connect RightContextPanel to real document/annotation/form state
// Status: design integrated, functionality not implemented yet

import { useState } from 'react';
import { ChevronRightIcon } from 'lucide-react';
import type { ViewerMode } from '../types';

interface RightContextPanelProps {
  mode: ViewerMode;
}

interface Section {
  title: string;
  content: string;
}

const SECTIONS_BY_MODE: Record<ViewerMode, Section[]> = {
  read: [
    { title: 'Documentinfo', content: 'Titel, auteur en metadata worden hier weergegeven.' },
    { title: 'Paginaweergave', content: 'Pas de paginaweergave en lay-out aan.' },
    { title: 'Toegankelijkheid', content: 'Opties voor toegankelijkheid en leesondersteuning.' },
  ],
  review: [
    { title: 'Opmerkingen filteren', content: 'Filter opmerkingen op auteur, datum of status.' },
    { title: 'Markeerkleur', content: 'Kies een markeerkleur voor annotaties.' },
    { title: 'Overzicht', content: 'Samenvatting van alle opmerkingen in dit document.' },
  ],
  edit: [
    { title: 'Blokeigenschappen', content: 'Uitlijning, opvulling en marges van het geselecteerde blok.' },
    { title: 'Typografie', content: 'Lettertype, grootte, gewicht en stijl.' },
    { title: 'Weergave', content: 'Kleuren, randen en schaduwen.' },
    { title: 'Geavanceerd', content: 'Transformaties, dekking en geavanceerde opties.' },
  ],
  organize: [
    { title: 'Paginabereik', content: 'Selecteer een bereik van pagina\'s voor bewerkingen.' },
    { title: 'Uitvoer', content: 'Instellingen voor het splitsen of samenvoegen van bestanden.' },
  ],
  forms: [
    { title: 'Veldeigenschappen', content: 'Naam, beschrijving en standaardwaarde van het veld.' },
    { title: 'Weergave', content: 'Lettertype, kleur en randstijl van het formulierveld.' },
    { title: 'Validatie', content: 'Validatieregels, vereist veld en formaatopties.' },
    { title: 'Acties', content: 'Scriptacties bij invoer, wijziging of uitvoer van het veld.' },
  ],
  protect: [
    { title: 'Beveiligingsinstellingen', content: 'Overzicht van de huidige beveiligingsopties.' },
    { title: 'Machtigingen', content: 'Welke bewerkingen zijn toegestaan voor gebruikers.' },
    { title: 'Redigeren', content: 'Controleer welke inhoud wordt verborgen of verwijderd.' },
  ],
  convert: [
    { title: 'Uitvoerindeling', content: 'Doelbestandsindeling en versie-opties.' },
    { title: 'Kwaliteitsinstellingen', content: 'Resolutie, compressie en kleurruimte.' },
  ],
};

function CollapsibleSection({ title, content }: Section) {
  const [open, setOpen] = useState(true);

  return (
    <div className="border-b border-border last:border-b-0">
      <button
        onClick={() => { setOpen(o => !o); }}
        className="w-full flex items-center justify-between px-3 py-2 text-left hover:bg-muted/30 transition-colors"
      >
        <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
          {title}
        </span>
        <ChevronRightIcon
          className={`w-3 h-3 text-muted-foreground transition-transform duration-150 ${open ? 'rotate-90' : ''}`}
        />
      </button>
      {open && (
        <div className="px-3 pb-3">
          {/* TODO(pdfluent-viewer): replace placeholder text with real controls
              Status: design integrated, functionality not implemented yet */}
          <p className="text-[10px] text-muted-foreground/60 leading-relaxed">{content}</p>
        </div>
      )}
    </div>
  );
}

export function RightContextPanel({ mode }: RightContextPanelProps) {
  const sections = SECTIONS_BY_MODE[mode];

  return (
    <div className="w-48 flex flex-col bg-background border-l border-border shrink-0 overflow-hidden">
      {/* Panel header */}
      <div className="h-9 flex items-center px-3 border-b border-border shrink-0">
        <span className="text-xs font-medium text-foreground">Eigenschappen</span>
      </div>

      {/* Collapsible sections */}
      <div className="flex-1 overflow-y-auto pf-scrollbar">
        {sections.map((section) => (
          <CollapsibleSection key={section.title} {...section} />
        ))}
      </div>
    </div>
  );
}
