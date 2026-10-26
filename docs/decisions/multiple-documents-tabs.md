<!--
Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
See https://pdfluent.com/license for terms.
-->

# Several documents at once: tabs in one window

Journey J-90. Until now the editor held one document; opening a second file
replaced the first, after a question. This records why several documents are
tabs in one window, and how each part of the editor behaves with more than one
document open.

## The choice

| | Tabs in one window | One window per document |
|---|---|---|
| Backend state | One process, one webview. The open document is a *slot*; the others are parked beside it (`src-tauri/src/sessions.rs`). Switching swaps the slot. | Every command would have to know which window it serves: a document id on every command, or a per-window state map reached through a window argument on each. |
| Undo, unsaved flag, save path | Belong to the document and travel with it when it is parked. | Same, once the commands are routed. |
| Close guard, recovery, quit | One webview to ask, one list of documents. | A quit has to gather answers from several webviews. |
| Single instance (Windows) | The second launch hands its file to the running window; a tab opens. | The running app creates a window per file. |
| macOS convention | Tab strip below the toolbar. | Native window tabs (`tabbingIdentifier`) group windows; they would still be separate webviews. |
| Cost to build | The viewer already handled "another document replaces this one"; a tab switch is that, with the backend swap instead of a file read. | A multi-webview state model the editor does not have. |

**Decision: tabs in one window.** The viewer keeps one set of per-document state
and re-initialises it when the document on screen changes, which it already did
when a file replaced a file. The backend does not need a document id on its
commands, because the command that acts on "the open document" acts on the slot.

macOS native window tabs were considered and set aside for the same reason as
windows: each tab would be a webview with its own copy of the viewer state.
`Cmd+T` (New Tab), `Cmd+W` (Close Tab) and `Cmd+Shift+[` / `Cmd+Shift+]` follow
the platform convention; `Ctrl+Tab` and `Ctrl+Shift+Tab` work on every platform.

## What each part does

- **Sessions.** `open_pdf` opens a new session and parks the one on screen with
  its undo and redo steps, its unsaved flag and the path Save writes to.
  `activate_session` swaps it back, `close_session` drops one,
  `hibernate_session` frees a parked document that has nothing unsaved.
  Lock order is the open path, then the book, then the document slot. The save
  commands hold the path lock from their policy check to the new path, so a
  switch cannot land between a save and the path it records.
- **Separation.** Nothing is shared between two sessions. `src-tauri/tests/document_sessions.rs`
  runs real documents through the same `SessionBook` the commands use: an undo
  in one does not reach the other, nor its redo steps, nor its unsaved flag.
- **Opening.** File > Open, drag and drop, Recent, a Finder or Explorer
  double-click and a second launch all end in the same call. A file that is
  already in a tab is brought to the front. Several files arriving together each
  get a tab, in order. A file is matched by its path with separators folded
  (and case, where the file system folds it); the file system is not asked,
  because resolving a path stats its parent folder, which on macOS raises a
  permission prompt. A symlink or alias to an open file is therefore a second tab.
- **Closing.** A tab with unsaved changes comes to the front and asks Save,
  Don't save or Cancel through the dialog the single document used. Quit with
  unsaved changes in several tabs asks about each, one at a time; Cancel on any
  of them keeps the app open.
- **Recovery.** One slot per open document under `slots/l<launch>-s<session>`.
  The launch is part of the name so session ids of the next launch (which start
  at 1) never overwrite a copy a crash left behind. Every timer tick writes a
  copy for each document with unsaved changes and empties the slot of the rest.
  The next start offers all the copies together and Recover opens each in its
  own tab. The single slot earlier versions wrote is still read.
- **Memory.** Only the document on screen is rendered. A tab that is not on
  screen keeps its document in memory, up to four. Past that, the least recently
  used tabs with nothing unsaved are freed (`hibernate_session`) and the tab keeps
  its file path, page and zoom; selecting it opens the file again. Tabs with
  unsaved changes (their undo history exists only in memory), protected
  documents (reopening needs the password) and documents that were never saved
  (no file to reopen) are never freed. There is a cap on open tabs; past it, a
  message says why.
- **A busy moment.** A switch or an open waits (up to 15 seconds) for a save,
  a load or OCR to finish rather than splitting it, and a file the system asked
  us to open is never dropped for that reason.

## Known limits

- Tabs exist in the desktop app. The browser build used for development keeps
  one document at a time.
- A copy a crash left behind may be the same file as one already open; both are
  shown, because the recovered copy is unsaved work, not the file on disk.
- Page and zoom are remembered per tab; the work mode, panel layout and
  selection are shared by all tabs.
