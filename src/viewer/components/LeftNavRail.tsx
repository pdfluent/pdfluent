// Copyright (c) 2026 PDFluent B.V. All rights reserved.
//
// This software is proprietary and confidential.
// Free for personal, non-commercial use.
// Commercial use requires a valid license.
// See https://pdfluent.com/license for terms.

import { useState } from 'react';
import {
  LayoutIcon,
  BookmarkIcon,
  SearchIcon,
  MessageSquareIcon,
  PaperclipIcon,
  LayersIcon,
  FileInputIcon,
  XIcon,
} from 'lucide-react';
import type { NavigationPanel } from '../types';

interface LeftNavRailProps {
  thumbnails: Map<number, string>;
  pageCount: number;
  currentPage: number;
  onPageSelect: (index: number) => void;
}

interface PanelTab {
  id: NavigationPanel;
  icon: React.ReactNode;
  label: string;
}

const PANELS: PanelTab[] = [
  { id: 'thumbnails', icon: <LayoutIcon className="w-5 h-5" />, label: 'Miniaturen' },
  { id: 'bookmarks', icon: <BookmarkIcon className="w-5 h-5" />, label: 'Bladwijzers' },
  { id: 'search', icon: <SearchIcon className="w-5 h-5" />, label: 'Zoeken' },
  { id: 'comments', icon: <MessageSquareIcon className="w-5 h-5" />, label: 'Opmerkingen' },
  { id: 'attachments', icon: <PaperclipIcon className="w-5 h-5" />, label: 'Bijlagen' },
  { id: 'layers', icon: <LayersIcon className="w-5 h-5" />, label: 'Lagen' },
  { id: 'fields', icon: <FileInputIcon className="w-5 h-5" />, label: 'Formuliervelden' },
];

// ── Individual panel content ────────────────────────────────────────────────

function ThumbnailPanel({
  thumbnails,
  pageCount,
  currentPage,
  onPageSelect,
}: LeftNavRailProps) {
  return (
    <div className="flex-1 overflow-y-auto pf-scrollbar py-2 px-2 flex flex-col gap-2">
      {Array.from({ length: pageCount }, (_, i) => {
        const thumbUrl = thumbnails.get(i);
        const isActive = currentPage === i;
        return (
          <button
            key={i}
            data-testid={`thumbnail-${i}`}
            onClick={() => { onPageSelect(i); }}
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
              {i + 1}
            </span>
          </button>
        );
      })}
    </div>
  );
}

// TODO(pdfluent-viewer): implement bookmarks panel with PDF outline tree
// Status: design integrated, functionality not implemented yet
function BookmarksPanel() {
  return (
    <div className="flex-1 flex flex-col items-center justify-center p-4 text-center gap-2">
      <BookmarkIcon className="w-8 h-8 text-muted-foreground/40" />
      <p className="text-xs text-muted-foreground">Geen bladwijzers</p>
      <p className="text-[10px] text-muted-foreground/60">Bladwijzers worden weergegeven wanneer het document een inhoudsopgave heeft.</p>
    </div>
  );
}

// TODO(pdfluent-viewer): implement full-text search panel with result highlighting
// Status: design integrated, functionality not implemented yet
function SearchPanel() {
  return (
    <div className="flex-1 flex flex-col gap-2 p-2">
      <input
        disabled
        placeholder="Zoeken in document…"
        className="w-full text-xs bg-muted border border-border rounded-md px-2 py-1.5 text-muted-foreground/50 cursor-default"
        title="Search not yet available"
      />
      <p className="text-[10px] text-muted-foreground/60 text-center mt-4">Zoekfunctie wordt binnenkort beschikbaar.</p>
    </div>
  );
}

// TODO(pdfluent-viewer): implement comments panel showing annotation thread list
// Status: design integrated, functionality not implemented yet
function CommentsPanel() {
  return (
    <div className="flex-1 flex flex-col items-center justify-center p-4 text-center gap-2">
      <MessageSquareIcon className="w-8 h-8 text-muted-foreground/40" />
      <p className="text-xs text-muted-foreground">Geen opmerkingen</p>
      <p className="text-[10px] text-muted-foreground/60">Opmerkingen worden hier weergegeven.</p>
    </div>
  );
}

// TODO(pdfluent-viewer): implement attachments panel showing embedded files
// Status: design integrated, functionality not implemented yet
function AttachmentsPanel() {
  return (
    <div className="flex-1 flex flex-col items-center justify-center p-4 text-center gap-2">
      <PaperclipIcon className="w-8 h-8 text-muted-foreground/40" />
      <p className="text-xs text-muted-foreground">Geen bijlagen</p>
    </div>
  );
}

// TODO(pdfluent-viewer): implement layers panel with PDF optional content groups
// Status: design integrated, functionality not implemented yet
function LayersPanel() {
  return (
    <div className="flex-1 flex flex-col gap-1 p-2">
      {(['Tekst', 'Afbeeldingen', 'Annotaties', 'Formuliervelden'] as const).map((layer) => (
        <label key={layer} className="flex items-center gap-2 px-1 py-1 rounded text-xs text-muted-foreground/50 cursor-default">
          <input type="checkbox" disabled defaultChecked className="accent-primary" />
          {layer}
        </label>
      ))}
      <p className="text-[10px] text-muted-foreground/60 mt-2 text-center">Lagenbeheer wordt binnenkort beschikbaar.</p>
    </div>
  );
}

// TODO(pdfluent-viewer): implement form fields panel listing AcroForm/XFA fields
// Status: design integrated, functionality not implemented yet
function FieldsPanel() {
  return (
    <div className="flex-1 flex flex-col items-center justify-center p-4 text-center gap-2">
      <FileInputIcon className="w-8 h-8 text-muted-foreground/40" />
      <p className="text-xs text-muted-foreground">Geen velden gevonden</p>
      <button
        disabled
        className="mt-1 text-[10px] px-2 py-1 rounded border border-border text-muted-foreground/40 cursor-default"
      >
        Velden detecteren
      </button>
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
}: { panel: NavigationPanel } & LeftNavRailProps) {
  switch (panel) {
    case 'thumbnails':
      return <ThumbnailPanel thumbnails={thumbnails} pageCount={pageCount} currentPage={currentPage} onPageSelect={onPageSelect} />;
    case 'bookmarks':
      return <BookmarksPanel />;
    case 'search':
      return <SearchPanel />;
    case 'comments':
      return <CommentsPanel />;
    case 'attachments':
      return <AttachmentsPanel />;
    case 'layers':
      return <LayersPanel />;
    case 'fields':
      return <FieldsPanel />;
  }
}

// ── Root component ──────────────────────────────────────────────────────────

export function LeftNavRail(props: LeftNavRailProps) {
  const { pageCount } = props;
  const hasDoc = pageCount > 0;

  const [activePanel, setActivePanel] = useState<NavigationPanel | null>('thumbnails');

  function togglePanel(id: NavigationPanel) {
    if (!hasDoc) return;
    setActivePanel(prev => (prev === id ? null : id));
  }

  const panelOpen = hasDoc && activePanel !== null;
  const panelLabel = panelOpen && activePanel ? (PANELS.find(p => p.id === activePanel)?.label ?? '') : '';

  return (
    <div className="flex h-full border-r border-border bg-background shrink-0 z-10">
      {/* ── Icon rail (48px) ────────────────────────────────────────────── */}
      <div className="w-12 flex flex-col items-center py-3 gap-1 border-r border-border bg-muted/10 shrink-0">
        {PANELS.map((panel) => {
          const isActive = hasDoc && activePanel === panel.id;
          return (
            <button
              key={panel.id}
              onClick={() => { togglePanel(panel.id); }}
              title={panel.label}
              aria-label={panel.label}
              className={[
                'p-2 rounded-md transition-colors duration-100',
                isActive
                  ? 'bg-accent text-accent-foreground'
                  : hasDoc
                    ? 'text-muted-foreground hover:text-foreground hover:bg-muted'
                    : 'text-muted-foreground/40 cursor-default',
              ].join(' ')}
            >
              {panel.icon}
            </button>
          );
        })}
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
