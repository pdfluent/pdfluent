// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary and confidential.
// Free for personal, non-commercial use.
// Commercial use requires a valid license.
// See https://pdfluent.com/license for terms.
import type { PdfRect } from "./pdf-manipulator";

export interface BookmarkNode {
  id: string;
  title: string;
  pageIndex: number;
  parentId: string | null;
  createdAt: string;
}

export interface DocumentLinkEntry {
  id: string;
  pageIndex: number;
  url: string;
  rect: PdfRect | null;
  createdAt: string;
}

export interface DocumentStructureState {
  bookmarks: BookmarkNode[];
  links: DocumentLinkEntry[];
}

function createId(prefix: string): string {
  const random = Math.random().toString(36).slice(2, 10);
  return `${prefix}_${Date.now()}_${random}`;
}

export function createEmptyDocumentStructureState(): DocumentStructureState {
  return {
    bookmarks: [],
    links: [],
  };
}

export function addBookmarkNode(
  state: DocumentStructureState,
  payload: {
    title: string;
    pageIndex: number;
    parentId?: string | null;
  },
): DocumentStructureState {
  const title = payload.title.trim();
  if (title.length === 0) {
    return state;
  }

  const bookmark: BookmarkNode = {
    id: createId("bookmark"),
    title,
    pageIndex: Math.max(0, Math.round(payload.pageIndex)),
    parentId: payload.parentId ?? null,
    createdAt: new Date().toISOString(),
  };

  return {
    ...state,
    bookmarks: [...state.bookmarks, bookmark],
  };
}

export function removeBookmarkNode(
  state: DocumentStructureState,
  bookmarkId: string,
): DocumentStructureState {
  const remaining = state.bookmarks.filter((bookmark) => bookmark.id !== bookmarkId);
  return {
    ...state,
    bookmarks: remaining.map((bookmark) => ({
      ...bookmark,
      parentId: bookmark.parentId === bookmarkId ? null : bookmark.parentId,
    })),
  };
}

export function addDocumentLink(
  state: DocumentStructureState,
  payload: {
    pageIndex: number;
    url: string;
    rect?: PdfRect | null;
  },
): DocumentStructureState {
  const url = payload.url.trim();
  if (url.length === 0) {
    return state;
  }

  const link: DocumentLinkEntry = {
    id: createId("link"),
    pageIndex: Math.max(0, Math.round(payload.pageIndex)),
    url,
    rect: payload.rect ?? null,
    createdAt: new Date().toISOString(),
  };

  return {
    ...state,
    links: [...state.links, link],
  };
}

export function removeDocumentLink(
  state: DocumentStructureState,
  linkId: string,
): DocumentStructureState {
  return {
    ...state,
    links: state.links.filter((link) => link.id !== linkId),
  };
}

export function summarizeDocumentStructure(state: DocumentStructureState): string {
  const bookmarks = state.bookmarks
    .slice()
    .sort((left, right) => left.pageIndex - right.pageIndex)
    .map(
      (bookmark, index) =>
        `${index + 1}. ${bookmark.title} (page ${bookmark.pageIndex + 1})`,
    );

  const links = state.links
    .slice()
    .sort((left, right) => left.pageIndex - right.pageIndex)
    .map((link, index) => `${index + 1}. ${link.url} (page ${link.pageIndex + 1})`);

  return [
    `Bookmarks: ${state.bookmarks.length}`,
    ...bookmarks,
    "",
    `Links: ${state.links.length}`,
    ...links,
  ].join("\n");
}

export function exportDocumentStructureAsJson(
  state: DocumentStructureState,
): string {
  return JSON.stringify(
    {
      exportedAt: new Date().toISOString(),
      bookmarks: state.bookmarks,
      links: state.links,
    },
    null,
    2,
  );
}
