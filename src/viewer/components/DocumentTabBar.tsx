// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary. The PDFluent application is free to use,
// including for commercial purposes. Redistribution, or extraction or reuse
// of its components (including the embedded PDF engine), requires a licence.
// See https://pdfluent.com/license for terms.

// J-90: the row of open documents under the top bar. Shown from the second
// document on; with one document the window looks as it always did.

import { useMemo, useRef, useState, type DragEvent, type KeyboardEvent, type MouseEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { PlusIcon, XIcon } from 'lucide-react';
import { tabLabels, type DocumentTab } from '../tabs/tabState';

interface DocumentTabBarProps {
  tabs: readonly DocumentTab[];
  activeId: string | null;
  /** A switch or an open is running: the strip shows it and ignores clicks. */
  busy: boolean;
  onSelect: (id: string) => void;
  onClose: (id: string) => void;
  onMove: (id: string, toIndex: number) => void;
  onNew: () => void;
}

export function DocumentTabBar({ tabs, activeId, busy, onSelect, onClose, onMove, onNew }: DocumentTabBarProps) {
  const { t } = useTranslation();
  const labels = useMemo(() => tabLabels(tabs), [tabs]);
  const refs = useRef(new Map<string, HTMLDivElement>());
  const [dragging, setDragging] = useState<string | null>(null);
  const [dropOn, setDropOn] = useState<string | null>(null);

  if (tabs.length < 2) return null;

  function focusTab(id: string | undefined): void {
    if (id) refs.current.get(id)?.focus();
  }

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>, tab: DocumentTab, index: number): void {
    const rtl = getComputedStyle(event.currentTarget).direction === 'rtl';
    const forward = rtl ? 'ArrowLeft' : 'ArrowRight';
    const backward = rtl ? 'ArrowRight' : 'ArrowLeft';
    switch (event.key) {
      case forward:
        event.preventDefault();
        focusTab(tabs[(index + 1) % tabs.length]?.id);
        break;
      case backward:
        event.preventDefault();
        focusTab(tabs[(index - 1 + tabs.length) % tabs.length]?.id);
        break;
      case 'Home':
        event.preventDefault();
        focusTab(tabs[0]?.id);
        break;
      case 'End':
        event.preventDefault();
        focusTab(tabs[tabs.length - 1]?.id);
        break;
      case 'Enter':
      case ' ':
        event.preventDefault();
        onSelect(tab.id);
        break;
      case 'Delete':
        event.preventDefault();
        onClose(tab.id);
        break;
      default:
        break;
    }
  }

  function onAuxClick(event: MouseEvent<HTMLDivElement>, id: string): void {
    // Middle button closes, as in every tabbed program.
    if (event.button === 1) {
      event.preventDefault();
      onClose(id);
    }
  }

  function onDrop(event: DragEvent<HTMLDivElement>, toIndex: number): void {
    event.preventDefault();
    if (dragging) onMove(dragging, toIndex);
    setDragging(null);
    setDropOn(null);
  }

  return (
    <div className="doc-tabs" data-testid="document-tabs" aria-busy={busy}>
      <div className="doc-tabs-list" role="tablist" aria-label={t('tabs.label')}>
        {tabs.map((tab, index) => {
          const selected = tab.id === activeId;
          const label = labels.get(tab.id) ?? tab.title;
          return (
            <div
              key={tab.id}
              ref={(node) => {
                if (node) refs.current.set(tab.id, node);
                else refs.current.delete(tab.id);
              }}
              role="tab"
              tabIndex={selected ? 0 : -1}
              aria-selected={selected}
              className="doc-tab"
              data-testid="document-tab"
              data-tab-title={tab.title}
              data-hibernated={!tab.resident}
              data-dragging={dragging === tab.id}
              data-drop-target={dropOn === tab.id && dragging !== tab.id}
              title={tab.path ?? label}
              draggable={!busy}
              onClick={() => { if (!busy) onSelect(tab.id); }}
              onAuxClick={(event) => { onAuxClick(event, tab.id); }}
              onKeyDown={(event) => { onKeyDown(event, tab, index); }}
              onDragStart={(event) => {
                setDragging(tab.id);
                event.dataTransfer.effectAllowed = 'move';
                event.dataTransfer.setData('text/plain', tab.id);
              }}
              onDragOver={(event) => {
                if (!dragging) return;
                event.preventDefault();
                setDropOn(tab.id);
              }}
              onDragEnd={() => { setDragging(null); setDropOn(null); }}
              onDrop={(event) => { onDrop(event, index); }}
            >
              <span className="doc-tab-name">{label}</span>
              {tab.dirty && (
                <span className="tab-dirty-dot" data-testid="tab-dirty-dot" role="img" aria-label={t('tabs.unsaved')} title={t('tabs.unsaved')} />
              )}
              <button
                type="button"
                className="doc-tab-close"
                data-testid="tab-close-btn"
                tabIndex={-1}
                aria-label={t('tabs.close', { name: tab.title })}
                title={t('tabs.close', { name: tab.title })}
                onClick={(event) => {
                  event.stopPropagation();
                  if (!busy) onClose(tab.id);
                }}
              >
                <XIcon aria-hidden="true" />
              </button>
            </div>
          );
        })}
      </div>
      <button
        type="button"
        className="doc-tab-new"
        data-testid="tab-new-btn"
        aria-label={t('tabs.new')}
        title={t('tabs.new')}
        onClick={onNew}
      >
        <PlusIcon aria-hidden="true" />
      </button>
    </div>
  );
}
