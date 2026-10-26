// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary. The PDFluent application is free to use,
// including for commercial purposes. Redistribution, or extraction or reuse
// of its components (including the embedded PDF engine), requires a licence.
// See https://pdfluent.com/license for terms.

//! The recovery copy (J-84).
//!
//! Settings has had an "Autosave" toggle since the first release, and nothing
//! behind it: `autosaveManager.ts` was never imported and the recovery dialog
//! never rendered. A crash or a power cut lost every unsaved change.
//!
//! While a document has unsaved changes, the webview asks for a recovery copy
//! every so often. It goes into the app's own data folder — one slot per open
//! document (J-90) — next to a small record of where the document came from.
//! A clean quit, a save and a deliberate close empty the document's slot;
//! whatever is still there at the next start is what a crash left behind, and
//! the app offers it.
//!
//! The slots are folders under `slots/` named after the launch and the session
//! (`l<launch>-s<session>`), so a copy a crashed launch left behind is never
//! overwritten by the session ids the next launch hands out. The folder
//! itself still holds the single slot earlier versions wrote; it is read as
//! a slot of its own.
//!
//! The copy is written the way a save would write it: a signed document as an
//! incremental update, a protected one encrypted with its own passwords. A
//! recovery copy must not be the one place a protected document lies around in
//! plaintext.

use std::fs;
use std::io;
use std::path::{Path, PathBuf};

const DOCUMENT: &str = "document.pdf";
const RECORD: &str = "record.json";
const SLOTS: &str = "slots";
/// The name the single slot of earlier versions goes by: the store's own folder.
pub const LEGACY_SLOT: &str = "root";

/// What the slot says about the copy it holds.
#[derive(Debug, Clone, PartialEq, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RecoveryRecord {
    /// Where the document was opened from or last saved to, if anywhere.
    pub original_path: Option<String>,
    /// Seconds since the Unix epoch when the copy was written.
    pub saved_at: u64,
    pub app_version: String,
}

/// One recovery slot in `dir`.
pub struct RecoveryStore {
    dir: PathBuf,
}

/// A slot name is made of what this module writes: letters, digits, `-`, `_`.
/// Names also arrive from the webview (restore, discard), so anything else is
/// refused instead of joined onto a path.
pub fn is_valid_slot_key(key: &str) -> bool {
    !key.is_empty()
        && key.len() <= 64
        && key.chars().all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_')
}

/// The slot name of session `session` in launch `launch`.
pub fn slot_key(launch: u64, session: u64) -> String {
    format!("l{launch}-s{session}")
}

/// Whether slot `key` was written by launch `launch`.
pub fn slot_belongs_to_launch(key: &str, launch: u64) -> bool {
    key.strip_prefix('l')
        .and_then(|rest| rest.split_once("-s"))
        .is_some_and(|(l, _)| l.parse::<u64>().is_ok_and(|l| l == launch))
}

impl RecoveryStore {
    pub fn new(dir: PathBuf) -> Self {
        Self { dir }
    }

    /// The slot `key` under this store. The key must pass [`is_valid_slot_key`];
    /// [`LEGACY_SLOT`] is the store's own folder.
    pub fn slot(&self, key: &str) -> Option<RecoveryStore> {
        if key == LEGACY_SLOT {
            return Some(RecoveryStore::new(self.dir.clone()));
        }
        is_valid_slot_key(key).then(|| RecoveryStore::new(self.dir.join(SLOTS).join(key)))
    }

    /// Every complete copy left in this store, with the name of its slot,
    /// oldest first: the single slot of earlier versions ([`LEGACY_SLOT`]) and
    /// each named slot. Slots written by `except_launch` are skipped: they
    /// belong to documents that are open right now, not to a crash.
    pub fn pending_all(&self, except_launch: Option<u64>) -> Vec<(String, RecoveryRecord)> {
        let mut found: Vec<(String, RecoveryRecord)> = Vec::new();
        if let Some(record) = self.pending() {
            found.push((LEGACY_SLOT.to_string(), record));
        }
        if let Ok(entries) = fs::read_dir(self.dir.join(SLOTS)) {
            for entry in entries.flatten() {
                let key = entry.file_name().to_string_lossy().into_owned();
                if except_launch.is_some_and(|l| slot_belongs_to_launch(&key, l)) {
                    continue;
                }
                if let Some(record) = self.slot(&key).and_then(|s| s.pending()) {
                    found.push((key, record));
                }
            }
        }
        found.sort_by_key(|(key, record)| (record.saved_at, key.clone()));
        found
    }

    /// Empty every slot written by `launch`: the documents are closed, or the
    /// app is leaving with nothing to keep.
    pub fn clear_launch(&self, launch: u64) -> io::Result<()> {
        let Ok(entries) = fs::read_dir(self.dir.join(SLOTS)) else {
            return Ok(());
        };
        for entry in entries.flatten() {
            let key = entry.file_name().to_string_lossy().into_owned();
            if slot_belongs_to_launch(&key, launch) {
                if let Some(slot) = self.slot(&key) {
                    slot.clear()?;
                }
            }
        }
        Ok(())
    }

    pub fn document_path(&self) -> PathBuf {
        self.dir.join(DOCUMENT)
    }

    /// Write the copy, then the record. Each replaces its file atomically, and
    /// the record goes last, so a crash in between leaves either the previous
    /// complete pair or a document without a record — which `pending` ignores.
    pub fn write(&self, bytes: &[u8], record: &RecoveryRecord) -> io::Result<()> {
        fs::create_dir_all(&self.dir)?;
        crate::atomic_file::replace(&self.dir.join(DOCUMENT), bytes)?;
        let json = serde_json::to_vec_pretty(record).map_err(io::Error::other)?;
        crate::atomic_file::replace(&self.dir.join(RECORD), &json)
    }

    /// The copy a previous session left, if there is a complete one.
    pub fn pending(&self) -> Option<RecoveryRecord> {
        if !self.dir.join(DOCUMENT).is_file() {
            return None;
        }
        let json = fs::read(self.dir.join(RECORD)).ok()?;
        serde_json::from_slice(&json).ok()
    }

    /// Copy the recovered document out of the slot, so the slot can take new
    /// copies while the user works on the restored one.
    pub fn take_copy(&self, target: &Path) -> io::Result<()> {
        let bytes = fs::read(self.dir.join(DOCUMENT))?;
        crate::atomic_file::replace(target, &bytes)
    }

    /// Empty the slot. Only this module's two files are touched.
    pub fn clear(&self) -> io::Result<()> {
        for name in [RECORD, DOCUMENT] {
            match fs::remove_file(self.dir.join(name)) {
                Ok(()) => {}
                Err(e) if e.kind() == io::ErrorKind::NotFound => {}
                Err(e) => return Err(e),
            }
        }
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn store(name: &str) -> RecoveryStore {
        let dir = std::env::temp_dir().join(format!("pdfluent-recovery-{name}-{}", std::process::id()));
        let store = RecoveryStore::new(dir);
        store.clear().expect("start empty");
        store
    }

    fn record() -> RecoveryRecord {
        RecoveryRecord {
            original_path: Some("/Users/a/report.pdf".into()),
            saved_at: 1_760_000_000,
            app_version: "1.0.1".into(),
        }
    }

    #[test]
    fn a_written_copy_is_offered_with_its_record() {
        let s = store("write");
        assert_eq!(s.pending(), None);
        s.write(b"%PDF-1.7 copy", &record()).expect("write");
        assert_eq!(s.pending(), Some(record()));
        assert_eq!(fs::read(s.document_path()).unwrap(), b"%PDF-1.7 copy");
    }

    #[test]
    fn a_cleared_slot_offers_nothing() {
        let s = store("clear");
        s.write(b"%PDF", &record()).expect("write");
        s.clear().expect("clear");
        assert_eq!(s.pending(), None);
        s.clear().expect("clearing an empty slot is fine");
    }

    #[test]
    fn a_document_without_its_record_is_not_offered() {
        let s = store("half");
        s.write(b"%PDF", &record()).expect("write");
        fs::remove_file(s.dir.join(RECORD)).unwrap();
        assert_eq!(s.pending(), None);
    }

    fn rec(at: u64, path: &str) -> RecoveryRecord {
        RecoveryRecord { original_path: Some(path.into()), saved_at: at, app_version: "1.1.0".into() }
    }

    #[test]
    fn two_documents_keep_two_copies() {
        let s = store("two-slots");
        let a = s.slot(&slot_key(7, 1)).expect("slot a");
        let b = s.slot(&slot_key(7, 2)).expect("slot b");
        a.write(b"%PDF a", &rec(10, "/a.pdf")).expect("write a");
        b.write(b"%PDF b", &rec(20, "/b.pdf")).expect("write b");
        assert_eq!(fs::read(a.document_path()).unwrap(), b"%PDF a");
        assert_eq!(fs::read(b.document_path()).unwrap(), b"%PDF b");
        a.clear().expect("clear a");
        assert_eq!(a.pending(), None);
        assert_eq!(b.pending(), Some(rec(20, "/b.pdf")), "saving a does not touch b's copy");
    }

    #[test]
    fn a_crashed_launch_is_offered_and_the_running_one_is_not() {
        let s = store("launches");
        s.slot(&slot_key(5, 1)).unwrap().write(b"%PDF", &rec(10, "/old.pdf")).unwrap();
        s.slot(&slot_key(5, 2)).unwrap().write(b"%PDF", &rec(11, "/old2.pdf")).unwrap();
        s.slot(&slot_key(9, 1)).unwrap().write(b"%PDF", &rec(99, "/live.pdf")).unwrap();
        s.write(b"%PDF", &rec(1, "/legacy.pdf")).unwrap();
        let offered: Vec<_> = s
            .pending_all(Some(9))
            .into_iter()
            .map(|(_, r)| r.original_path.unwrap())
            .collect();
        assert_eq!(offered, vec!["/legacy.pdf", "/old.pdf", "/old2.pdf"]);
        s.clear_launch(9).expect("clear launch 9");
        assert_eq!(s.slot(&slot_key(9, 1)).unwrap().pending(), None);
        assert_eq!(s.pending_all(Some(9)).len(), 3, "the crashed launch's copies survive");
    }

    #[test]
    fn a_slot_name_from_the_webview_cannot_leave_the_slots_folder() {
        let s = store("traversal");
        for bad in ["", "..", "../x", "a/b", "a\\b", "l1-s1/../..", "x y", "root/.."] {
            assert!(s.slot(bad).is_none(), "{bad:?} must be refused");
        }
        assert!(s.slot("l12-s3").is_some());
    }

    #[test]
    fn the_single_slot_of_earlier_versions_is_still_offered_under_its_own_name() {
        let s = store("legacy");
        s.write(b"%PDF", &rec(1, "/legacy.pdf")).unwrap();
        let pending = s.pending_all(None);
        assert_eq!(pending.len(), 1);
        assert_eq!(pending[0].0, LEGACY_SLOT);
        s.slot(LEGACY_SLOT).unwrap().clear().expect("clear the legacy slot");
        assert!(s.pending_all(None).is_empty());
    }

    #[test]
    fn taking_the_copy_leaves_the_slot_free_for_new_copies() {
        let s = store("take");
        s.write(b"%PDF old", &record()).expect("write");
        let target = s.dir.join("restored.pdf");
        s.take_copy(&target).expect("take");
        s.write(b"%PDF new", &record()).expect("rewrite");
        assert_eq!(fs::read(&target).unwrap(), b"%PDF old");
    }
}
