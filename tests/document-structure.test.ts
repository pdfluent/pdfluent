// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 PDFluent Contributors

import { describe, expect, it } from "vitest";
import {
  addBookmarkNode,
  addDocumentLink,
  createEmptyDocumentStructureState,
  exportDocumentStructureAsJson,
  removeBookmarkNode,
  removeDocumentLink,
  summarizeDocumentStructure,
} from "../src/lib/document-structure";

describe("document structure editor model", () => {
  it("adds and removes bookmark and link entries", () => {
    const empty = createEmptyDocumentStructureState();
    const withBookmark = addBookmarkNode(empty, {
      title: "Introduction",
      pageIndex: 0,
    });
    const withLink = addDocumentLink(withBookmark, {
      pageIndex: 0,
      url: "https://example.com/reference",
    });

    expect(withLink.bookmarks).toHaveLength(1);
    expect(withLink.links).toHaveLength(1);

    const bookmarkId = withLink.bookmarks[0]?.id ?? "";
    const linkId = withLink.links[0]?.id ?? "";
    const withoutBookmark = removeBookmarkNode(withLink, bookmarkId);
    const withoutLink = removeDocumentLink(withoutBookmark, linkId);

    expect(withoutLink.bookmarks).toHaveLength(0);
    expect(withoutLink.links).toHaveLength(0);
  });

  it("summarizes and exports structure data", () => {
    const withEntries = addDocumentLink(
      addBookmarkNode(createEmptyDocumentStructureState(), {
        title: "Terms",
        pageIndex: 2,
      }),
      { pageIndex: 2, url: "https://example.com/terms" },
    );

    const summary = summarizeDocumentStructure(withEntries);
    const exported = exportDocumentStructureAsJson(withEntries);

    expect(summary).toContain("Bookmarks: 1");
    expect(summary).toContain("Links: 1");
    expect(exported).toContain("\"bookmarks\"");
    expect(exported).toContain("\"links\"");
    expect(exported).toContain("https://example.com/terms");
  });
});
