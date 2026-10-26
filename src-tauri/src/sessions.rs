// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary. The PDFluent application is free to use,
// including for commercial purposes. Redistribution, or extraction or reuse
// of its components (including the embedded PDF engine), requires a licence.
// See https://pdfluent.com/license for terms.

//! Several open documents, one active (J-90).
//!
//! The editor shows one document at a time in a row of tabs. Every command in
//! lib.rs works on "the open document"; rather than thread a document id
//! through a hundred commands, the open document is a *slot* and this book
//! keeps the others parked beside it. Switching tabs swaps the slot's content
//! with a parked document. A document keeps everything that belongs to it
//! while parked: its undo and redo steps, its unsaved flag, the path Save
//! writes to. Nothing is shared between two sessions, so an undo in one can
//! never reach the other.
//!
//! The book is generic over the document type so the swapping rules can be
//! tested without an engine; `tests/document_sessions.rs` runs the same code
//! on real documents.
//!
//! Lock order, for the one caller that holds all three: the open path, then
//! the book, then the document slot (`AppState` in lib.rs).

/// Identifies one open document for the life of the process. Never reused.
pub type SessionId = u64;

/// A document that is open but not the one on screen.
#[derive(Debug)]
pub struct Parked<D> {
    pub id: SessionId,
    pub doc: D,
    /// Where Save writes to; `None` for a document that has never been saved.
    pub path: Option<String>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum SessionError {
    /// No open document has this id: it was closed, or never existed.
    NotFound(SessionId),
}

impl std::fmt::Display for SessionError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            // The prefix is a code the webview recognises (viewer/state/openError
            // lists it among the expected refusals): the tab then reopens the
            // file instead of reporting a failure.
            SessionError::NotFound(id) => write!(f, "session-gone: no open document with session id {id}"),
        }
    }
}

impl std::error::Error for SessionError {}

/// The parked documents and the id of the one in the slot.
///
/// Invariant: `active` is `Some` exactly when the slot holds a document. Only
/// the methods below touch the slot together with the book, so it holds.
#[derive(Debug)]
pub struct SessionBook<D> {
    next_id: SessionId,
    active: Option<SessionId>,
    parked: Vec<Parked<D>>,
}

impl<D> Default for SessionBook<D> {
    fn default() -> Self {
        Self { next_id: 1, active: None, parked: Vec::new() }
    }
}

impl<D> SessionBook<D> {
    /// The id of the document in the slot, if any.
    pub fn active(&self) -> Option<SessionId> {
        self.active
    }

    /// The documents that are open but parked.
    pub fn parked(&self) -> &[Parked<D>] {
        &self.parked
    }

    pub fn parked_mut(&mut self) -> &mut [Parked<D>] {
        &mut self.parked
    }

    /// How many documents are open, parked or not.
    pub fn len(&self) -> usize {
        self.parked.len() + usize::from(self.active.is_some())
    }

    pub fn is_empty(&self) -> bool {
        self.len() == 0
    }

    pub fn contains(&self, id: SessionId) -> bool {
        self.active == Some(id) || self.parked.iter().any(|p| p.id == id)
    }

    /// Open `doc` as a new session and put it in the slot. The document that
    /// was in the slot is parked with its path; nothing of it is lost.
    pub fn open(
        &mut self,
        slot: &mut Option<D>,
        slot_path: &mut Option<String>,
        doc: D,
        doc_path: Option<String>,
    ) -> SessionId {
        self.park_active(slot, slot_path);
        let id = self.next_id;
        self.next_id += 1;
        *slot = Some(doc);
        *slot_path = doc_path;
        self.active = Some(id);
        id
    }

    /// Make `target` the document in the slot, parking the current one. A
    /// no-op when it already is.
    pub fn activate(
        &mut self,
        slot: &mut Option<D>,
        slot_path: &mut Option<String>,
        target: SessionId,
    ) -> Result<(), SessionError> {
        if self.active == Some(target) {
            return Ok(());
        }
        let at = self
            .parked
            .iter()
            .position(|p| p.id == target)
            .ok_or(SessionError::NotFound(target))?;
        let incoming = self.parked.remove(at);
        self.park_active(slot, slot_path);
        *slot = Some(incoming.doc);
        *slot_path = incoming.path;
        self.active = Some(incoming.id);
        Ok(())
    }

    /// Close `id`, handing its document back so the caller decides what drops
    /// with it. Closing the active session leaves the slot empty: the caller
    /// activates another one, or shows the welcome screen.
    pub fn close(
        &mut self,
        slot: &mut Option<D>,
        slot_path: &mut Option<String>,
        id: SessionId,
    ) -> Result<(D, Option<String>), SessionError> {
        if self.active == Some(id) {
            let doc = slot.take().ok_or(SessionError::NotFound(id))?;
            let path = slot_path.take();
            self.active = None;
            return Ok((doc, path));
        }
        let at = self
            .parked
            .iter()
            .position(|p| p.id == id)
            .ok_or(SessionError::NotFound(id))?;
        let gone = self.parked.remove(at);
        Ok((gone.doc, gone.path))
    }

    fn park_active(&mut self, slot: &mut Option<D>, slot_path: &mut Option<String>) {
        if let (Some(id), Some(doc)) = (self.active.take(), slot.take()) {
            self.parked.push(Parked { id, doc, path: slot_path.take() });
        } else {
            // A slot without an id (or an id without a slot) cannot be parked;
            // start from a clean slot rather than carry a half-state forward.
            *slot = None;
            *slot_path = None;
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    type Book = SessionBook<Vec<&'static str>>;

    fn setup() -> (Book, Option<Vec<&'static str>>, Option<String>) {
        (Book::default(), None, None)
    }

    #[test]
    fn the_first_session_fills_the_slot() {
        let (mut book, mut slot, mut path) = setup();
        let a = book.open(&mut slot, &mut path, vec!["a"], Some("/a.pdf".into()));
        assert_eq!(book.active(), Some(a));
        assert_eq!(slot, Some(vec!["a"]));
        assert_eq!(path.as_deref(), Some("/a.pdf"));
        assert_eq!(book.len(), 1);
    }

    #[test]
    fn opening_a_second_parks_the_first_with_its_path() {
        let (mut book, mut slot, mut path) = setup();
        let a = book.open(&mut slot, &mut path, vec!["a"], Some("/a.pdf".into()));
        let b = book.open(&mut slot, &mut path, vec!["b"], None);
        assert_ne!(a, b);
        assert_eq!(book.active(), Some(b));
        assert_eq!(path, None, "b was never saved; a's path did not leak into the slot");
        assert_eq!(book.parked().len(), 1);
        assert_eq!(book.parked()[0].id, a);
        assert_eq!(book.parked()[0].path.as_deref(), Some("/a.pdf"));
    }

    #[test]
    fn activating_swaps_documents_and_paths_back() {
        let (mut book, mut slot, mut path) = setup();
        let a = book.open(&mut slot, &mut path, vec!["a"], Some("/a.pdf".into()));
        let b = book.open(&mut slot, &mut path, vec!["b"], Some("/b.pdf".into()));
        book.activate(&mut slot, &mut path, a).expect("activate a");
        assert_eq!(slot, Some(vec!["a"]));
        assert_eq!(path.as_deref(), Some("/a.pdf"));
        assert_eq!(book.active(), Some(a));
        assert!(book.contains(b));
        book.activate(&mut slot, &mut path, b).expect("activate b");
        assert_eq!(slot, Some(vec!["b"]));
        assert_eq!(path.as_deref(), Some("/b.pdf"));
    }

    #[test]
    fn what_is_done_to_the_active_document_stays_with_it() {
        let (mut book, mut slot, mut path) = setup();
        let a = book.open(&mut slot, &mut path, vec!["a"], None);
        let b = book.open(&mut slot, &mut path, vec!["b"], None);
        slot.as_mut().expect("b").push("edit in b");
        book.activate(&mut slot, &mut path, a).expect("activate a");
        slot.as_mut().expect("a").push("edit in a");
        book.activate(&mut slot, &mut path, b).expect("activate b");
        assert_eq!(slot, Some(vec!["b", "edit in b"]));
        book.activate(&mut slot, &mut path, a).expect("activate a");
        assert_eq!(slot, Some(vec!["a", "edit in a"]));
    }

    #[test]
    fn activating_the_active_session_changes_nothing() {
        let (mut book, mut slot, mut path) = setup();
        let a = book.open(&mut slot, &mut path, vec!["a"], None);
        book.activate(&mut slot, &mut path, a).expect("no-op");
        assert_eq!(slot, Some(vec!["a"]));
        assert!(book.parked().is_empty());
    }

    #[test]
    fn activating_an_unknown_session_is_refused_and_keeps_the_slot() {
        let (mut book, mut slot, mut path) = setup();
        let a = book.open(&mut slot, &mut path, vec!["a"], None);
        assert_eq!(book.activate(&mut slot, &mut path, 99), Err(SessionError::NotFound(99)));
        assert_eq!(book.active(), Some(a));
        assert_eq!(slot, Some(vec!["a"]));
    }

    #[test]
    fn closing_a_parked_session_leaves_the_active_one_alone() {
        let (mut book, mut slot, mut path) = setup();
        let a = book.open(&mut slot, &mut path, vec!["a"], Some("/a.pdf".into()));
        let b = book.open(&mut slot, &mut path, vec!["b"], None);
        let (doc, closed_path) = book.close(&mut slot, &mut path, a).expect("close a");
        assert_eq!(doc, vec!["a"]);
        assert_eq!(closed_path.as_deref(), Some("/a.pdf"));
        assert_eq!(book.active(), Some(b));
        assert_eq!(slot, Some(vec!["b"]));
        assert!(!book.contains(a));
    }

    #[test]
    fn closing_the_active_session_empties_the_slot() {
        let (mut book, mut slot, mut path) = setup();
        let a = book.open(&mut slot, &mut path, vec!["a"], Some("/a.pdf".into()));
        let b = book.open(&mut slot, &mut path, vec!["b"], None);
        book.close(&mut slot, &mut path, b).expect("close b");
        assert_eq!(book.active(), None);
        assert_eq!(slot, None);
        assert_eq!(path, None);
        book.activate(&mut slot, &mut path, a).expect("a is still there");
        assert_eq!(slot, Some(vec!["a"]));
        assert_eq!(path.as_deref(), Some("/a.pdf"));
    }

    #[test]
    fn closing_twice_is_refused() {
        let (mut book, mut slot, mut path) = setup();
        let a = book.open(&mut slot, &mut path, vec!["a"], None);
        book.close(&mut slot, &mut path, a).expect("close");
        assert_eq!(book.close(&mut slot, &mut path, a).map(|_| ()), Err(SessionError::NotFound(a)));
    }

    #[test]
    fn ids_are_never_reused() {
        let (mut book, mut slot, mut path) = setup();
        let a = book.open(&mut slot, &mut path, vec!["a"], None);
        book.close(&mut slot, &mut path, a).expect("close");
        let b = book.open(&mut slot, &mut path, vec!["b"], None);
        assert_ne!(a, b, "a stale tab must not find a different document under its old id");
    }
}
