// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary. The PDFluent application is free to use,
// including for commercial purposes. Redistribution, or extraction or reuse
// of its components (including the embedded PDF engine), requires a licence.
// See https://pdfluent.com/license for terms.

//! Undo and redo for the open document (J-85).
//!
//! Undo used to exist for form fields only, as closures in the webview that
//! re-applied the previous value. Text edits, annotations, page operations and
//! redaction marks could not be taken back. The history now lives next to the
//! document: before an edit runs, the state it is about to change is kept, and
//! undo puts that state back. One mechanism covers every mutating command,
//! including the ones added later, because they all go through
//! [`crate::pdf_engine::OpenDocument::edit`].
//!
//! This module is the bookkeeping only (stacks, grouping, the memory budget);
//! what a state is and how it is restored belongs to the document.

/// One step that can be undone or redone.
pub struct Entry<S> {
    pub label: String,
    pub state: S,
    /// Approximate memory the state holds, for the budget.
    pub bytes: usize,
}

/// Linear undo/redo history with a size budget.
pub struct History<S> {
    undo: Vec<Entry<S>>,
    redo: Vec<Entry<S>>,
    /// An open group records its first change only: the user's one action
    /// (a text commit is replace + size/colour + weight) is one undo step.
    group: Option<Group>,
    max_entries: usize,
    max_bytes: usize,
}

struct Group {
    label: String,
    recorded: bool,
}

/// What the webview shows on the Undo and Redo controls.
#[derive(Debug, Clone, PartialEq, Eq, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct HistoryState {
    pub can_undo: bool,
    pub can_redo: bool,
    pub undo_label: Option<String>,
    pub redo_label: Option<String>,
    /// Whether the document differs from what was last opened or saved.
    pub modified: bool,
}

/// Fifty steps, and at most this much memory for the kept states. A step of a
/// very large document can exceed it alone; the newest step is always kept.
pub const DEFAULT_MAX_ENTRIES: usize = 50;
pub const DEFAULT_MAX_BYTES: usize = 768 * 1024 * 1024;

impl<S> Default for History<S> {
    fn default() -> Self {
        Self::with_limits(DEFAULT_MAX_ENTRIES, DEFAULT_MAX_BYTES)
    }
}

impl<S> History<S> {
    pub fn with_limits(max_entries: usize, max_bytes: usize) -> Self {
        Self { undo: Vec::new(), redo: Vec::new(), group: None, max_entries: max_entries.max(1), max_bytes, }
    }

    pub fn can_undo(&self) -> bool {
        !self.undo.is_empty()
    }

    pub fn can_redo(&self) -> bool {
        !self.redo.is_empty()
    }

    pub fn undo_label(&self) -> Option<&str> {
        self.undo.last().map(|e| e.label.as_str())
    }

    pub fn redo_label(&self) -> Option<&str> {
        self.redo.last().map(|e| e.label.as_str())
    }

    #[cfg(test)]
    pub fn undo_len(&self) -> usize {
        self.undo.len()
    }

    /// True when an open group already holds its state: the next edit belongs
    /// to the same step and needs no state of its own.
    pub fn group_already_recorded(&self) -> bool {
        self.group.as_ref().is_some_and(|g| g.recorded)
    }

    /// Start a group. A group left open by a failed caller is replaced.
    pub fn begin_group(&mut self, label: &str) {
        self.group = Some(Group { label: label.to_string(), recorded: false });
    }

    pub fn end_group(&mut self) {
        self.group = None;
    }

    /// Keep `state` (the document before an edit that changed it) as the newest
    /// undo step. A new edit ends the redo branch.
    pub fn record(&mut self, label: &str, state: S, bytes: usize) {
        let label = match self.group.as_mut() {
            Some(g) if g.recorded => return,
            Some(g) => {
                g.recorded = true;
                g.label.clone()
            }
            None => label.to_string(),
        };
        self.redo.clear();
        self.undo.push(Entry { label, state, bytes });
        self.enforce_budget();
    }

    /// Take the newest undo step. The caller restores it and hands the state
    /// it replaced to [`Self::push_redo`].
    pub fn pop_undo(&mut self) -> Option<Entry<S>> {
        self.group = None;
        self.undo.pop()
    }

    pub fn push_redo(&mut self, entry: Entry<S>) {
        self.redo.push(entry);
    }

    pub fn pop_redo(&mut self) -> Option<Entry<S>> {
        self.group = None;
        self.redo.pop()
    }

    /// Put a step back on the undo stack without ending the redo branch (redo).
    pub fn push_undo(&mut self, entry: Entry<S>) {
        self.undo.push(entry);
        self.enforce_budget();
    }

    pub fn clear(&mut self) {
        self.undo.clear();
        self.redo.clear();
        self.group = None;
    }

    pub fn state(&self, modified: bool) -> HistoryState {
        HistoryState {
            can_undo: self.can_undo(),
            can_redo: self.can_redo(),
            undo_label: self.undo_label().map(str::to_string),
            redo_label: self.redo_label().map(str::to_string),
            modified,
        }
    }

    fn enforce_budget(&mut self) {
        while self.undo.len() > self.max_entries {
            self.undo.remove(0);
        }
        let mut total: usize = self.undo.iter().chain(self.redo.iter()).map(|e| e.bytes).sum();
        // Oldest undo steps go first; the newest one always stays.
        while total > self.max_bytes && self.undo.len() > 1 {
            total -= self.undo.remove(0).bytes;
        }
        while total > self.max_bytes && !self.redo.is_empty() && self.undo.len() + self.redo.len() > 1 {
            total -= self.redo.remove(0).bytes;
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn records_undo_and_redo_in_order() {
        let mut h: History<u32> = History::default();
        h.record("a", 0, 1);
        h.record("b", 1, 1);
        assert_eq!(h.undo_label(), Some("b"));
        let e = h.pop_undo().unwrap();
        assert_eq!((e.label.as_str(), e.state), ("b", 1));
        h.push_redo(Entry { label: e.label, state: 2, bytes: 1 });
        assert!(h.can_redo());
        assert_eq!(h.redo_label(), Some("b"));
    }

    #[test]
    fn a_new_edit_ends_the_redo_branch() {
        let mut h: History<u32> = History::default();
        h.record("a", 0, 1);
        let e = h.pop_undo().unwrap();
        h.push_redo(e);
        h.record("c", 5, 1);
        assert!(!h.can_redo());
    }

    #[test]
    fn a_group_is_one_step_with_its_own_label() {
        let mut h: History<u32> = History::default();
        h.begin_group("Edit text");
        assert!(!h.group_already_recorded());
        h.record("replace", 0, 1);
        assert!(h.group_already_recorded());
        h.record("format", 1, 1);
        h.end_group();
        assert_eq!(h.undo_len(), 1);
        assert_eq!(h.undo_label(), Some("Edit text"));
    }

    #[test]
    fn the_budget_drops_the_oldest_steps_and_keeps_the_newest() {
        let mut h: History<u32> = History::with_limits(3, 100);
        for i in 0..5 {
            h.record("x", i, 10);
        }
        assert_eq!(h.undo_len(), 3);
        assert_eq!(h.pop_undo().unwrap().state, 4);

        let mut big: History<u32> = History::with_limits(10, 100);
        big.record("a", 1, 60);
        big.record("b", 2, 60);
        assert_eq!(big.undo_len(), 1, "over budget: only the newest stays");
        big.record("c", 3, 500);
        assert_eq!(big.undo_len(), 1, "a step larger than the budget is still kept");
        assert_eq!(big.undo_label(), Some("c"));
    }
}
