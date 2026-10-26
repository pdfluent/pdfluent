// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary. The PDFluent application is free to use,
// including for commercial purposes. Redistribution, or extraction or reuse
// of its components (including the embedded PDF engine), requires a licence.
// See https://pdfluent.com/license for terms.

//! Replace a file so that a failure leaves the old one whole.
//!
//! `save_to` used to hand the path straight to lopdf, which truncates the file
//! and then writes into it. A full disk, a pulled USB stick, a network share
//! that drops, or a crash halfway through left the user's only copy truncated:
//! the edit was lost and so was the document it was made to.
//!
//! The route here is the ordinary one: write the complete new file next to the
//! old one, flush it to the disk, and only then rename it over the old name.
//! A rename within one directory is atomic on APFS, ext4 and NTFS, so a reader
//! sees either the old file or the new one and never a mixture. On Windows
//! `std::fs::rename` is `MoveFileExW(MOVEFILE_REPLACE_EXISTING)`, which is the
//! replace-in-one-step semantics; a target another program holds open fails
//! the rename and leaves the old file where it was.
//!
//! One exception, and it is narrow. Under the macOS App Sandbox the user's pick
//! grants access to that file, not to the folder it sits in, so creating a
//! sibling can be refused with `PermissionDenied`. Then the new bytes are
//! written over the file in place — but only after the complete new contents
//! and a copy of the old ones are safely in the app's temporary directory, and
//! a failed write puts the old bytes back. That is not atomic, and it says so in
//! the log, but it never ends with a half-written document and no way back.

use std::fs::{self, File, OpenOptions};
use std::io::{self, Write};
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicU64, Ordering};

static SEQUENCE: AtomicU64 = AtomicU64::new(0);

/// Replace `target` with `bytes`.
///
/// On success the file holds exactly `bytes`. On failure the file holds exactly
/// what it held before, and no temporary file is left next to it.
pub fn replace(target: &Path, bytes: &[u8]) -> io::Result<()> {
    replace_with_writer(target, bytes, |file, bytes| file.write_all(bytes))
}

/// [`replace`] with the write itself injectable, so a test can fail it halfway
/// the way a full disk does. Production code calls [`replace`].
pub(crate) fn replace_with_writer<W>(target: &Path, bytes: &[u8], write: W) -> io::Result<()>
where
    W: FnOnce(&mut File, &[u8]) -> io::Result<()>,
{
    let dir = parent_dir(target)?;
    // A rename does not ask the file, only the folder, so on macOS and Linux it
    // would quietly replace a document the user marked read-only. Writing in
    // place would have been refused; keep that answer.
    if let Ok(meta) = fs::metadata(target) {
        if meta.permissions().readonly() {
            return Err(io::Error::new(
                io::ErrorKind::PermissionDenied,
                "the file is read-only; save a copy with Save As",
            ));
        }
    }
    let file_name = target
        .file_name()
        .ok_or_else(|| io::Error::new(io::ErrorKind::InvalidInput, "target has no file name"))?;

    let (tmp_path, mut file) = match create_unique(dir, &file_name.to_string_lossy()) {
        Ok(created) => created,
        Err(e) if e.kind() == io::ErrorKind::PermissionDenied && target.exists() => {
            return replace_in_place_with_backup(target, bytes, write);
        }
        Err(e) => return Err(e),
    };

    let written = (|| -> io::Result<()> {
        write(&mut file, bytes)?;
        file.flush()?;
        if let Ok(meta) = fs::metadata(target) {
            // Keep the permissions the user's file had; a fresh file gets the
            // process umask instead, which can widen or narrow them. Not fatal:
            // the document itself is what must arrive.
            if let Err(e) = fs::set_permissions(&tmp_path, meta.permissions()) {
                crate::applog(&format!("save: could not copy the file's permissions: {e}"));
            }
        }
        file.sync_all()
    })();
    drop(file);

    if let Err(e) = written {
        discard(&tmp_path);
        return Err(e);
    }
    if let Err(e) = fs::rename(&tmp_path, target) {
        discard(&tmp_path);
        return Err(e);
    }
    sync_dir(dir);
    Ok(())
}

fn parent_dir(target: &Path) -> io::Result<&Path> {
    match target.parent() {
        Some(p) if !p.as_os_str().is_empty() => Ok(p),
        _ => Err(io::Error::new(
            io::ErrorKind::InvalidInput,
            "target must be an absolute path with a parent directory",
        )),
    }
}

/// A new, empty, uniquely named file in `dir`. `create_new` means two saves in
/// flight cannot share one, and a name that happens to exist is skipped.
fn create_unique(dir: &Path, stem: &str) -> io::Result<(PathBuf, File)> {
    for _ in 0..16 {
        let n = SEQUENCE.fetch_add(1, Ordering::Relaxed);
        let name = format!(".{stem}.pdfluent-save-{}-{n}.tmp", std::process::id());
        let path = dir.join(name);
        match OpenOptions::new().write(true).create_new(true).open(&path) {
            Ok(file) => return Ok((path, file)),
            Err(e) if e.kind() == io::ErrorKind::AlreadyExists => continue,
            Err(e) => return Err(e),
        }
    }
    Err(io::Error::new(
        io::ErrorKind::AlreadyExists,
        "could not find a free temporary file name next to the target",
    ))
}

/// Make the rename itself durable. Without it a power cut can roll the
/// directory back to the old entry even though the new data reached the disk.
/// Windows has no directory handle to flush; NTFS journals the rename.
#[cfg(unix)]
fn sync_dir(dir: &Path) {
    if let Err(e) = File::open(dir).and_then(|d| d.sync_all()) {
        crate::applog(&format!("save: the folder could not be flushed after the rename: {e}"));
    }
}

#[cfg(not(unix))]
fn sync_dir(_dir: &Path) {}

/// Remove a temporary file this module created. A failure is logged, not
/// raised: the save already has its answer, and a stray `.tmp` is untidy, not
/// harmful.
fn discard(path: &Path) {
    if let Err(e) = fs::remove_file(path) {
        crate::applog(&format!("save: could not remove {}: {e}", path.display()));
    }
}

/// The sandbox route: no sibling can be created, so the file is rewritten in
/// place, with the old contents kept aside until the new ones are on disk.
fn replace_in_place_with_backup<W>(target: &Path, bytes: &[u8], write: W) -> io::Result<()>
where
    W: FnOnce(&mut File, &[u8]) -> io::Result<()>,
{
    crate::applog("save: no write access to the folder; replacing the file in place with a backup");
    let original = fs::read(target)?;
    let scratch = std::env::temp_dir();
    let (backup_path, mut backup) = create_unique(&scratch, "backup")?;
    let kept = backup.write_all(&original).and_then(|_| backup.sync_all());
    drop(backup);
    if let Err(e) = kept {
        discard(&backup_path);
        return Err(e);
    }

    let result = (|| -> io::Result<()> {
        let mut file = OpenOptions::new().write(true).truncate(true).open(target)?;
        write(&mut file, bytes)?;
        file.flush()?;
        file.sync_all()
    })();

    if let Err(e) = result {
        let restored = OpenOptions::new()
            .write(true)
            .truncate(true)
            .open(target)
            .and_then(|mut f| f.write_all(&original).and_then(|_| f.sync_all()));
        if let Err(restore_error) = restored {
            // The old bytes are still in the backup; say where, rather than
            // removing the only copy.
            crate::applog(&format!(
                "save: in-place write failed ({e}) and restoring failed ({restore_error}); \
                 the previous version is kept at {}",
                backup_path.display()
            ));
            return Err(e);
        }
        discard(&backup_path);
        return Err(e);
    }
    discard(&backup_path);
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn scratch_dir(name: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!(
            "pdfluent-atomic-{name}-{}-{}",
            std::process::id(),
            SEQUENCE.fetch_add(1, Ordering::Relaxed)
        ));
        fs::create_dir_all(&dir).expect("create scratch dir");
        dir
    }

    fn entries(dir: &Path) -> Vec<String> {
        let mut names: Vec<String> = fs::read_dir(dir)
            .expect("read dir")
            .map(|e| e.expect("entry").file_name().to_string_lossy().into_owned())
            .collect();
        names.sort();
        names
    }

    #[test]
    fn a_successful_replace_leaves_exactly_the_new_bytes_and_nothing_else() {
        let dir = scratch_dir("ok");
        let target = dir.join("doc.pdf");
        fs::write(&target, b"old contents").unwrap();

        replace(&target, b"new contents").expect("replace");

        assert_eq!(fs::read(&target).unwrap(), b"new contents");
        assert_eq!(entries(&dir), vec!["doc.pdf".to_string()]);
    }

    #[test]
    fn a_write_that_fails_halfway_leaves_the_original_untouched() {
        let dir = scratch_dir("halfway");
        let target = dir.join("doc.pdf");
        let original = b"%PDF-1.7 the user's only copy".to_vec();
        fs::write(&target, &original).unwrap();

        let err = replace_with_writer(&target, b"%PDF-1.7 the new version, longer", |f, bytes| {
            // What a full disk looks like from here: some bytes land, then the
            // write fails.
            f.write_all(&bytes[..10])?;
            f.flush()?;
            Err(io::Error::other("No space left on device"))
        })
        .expect_err("the injected failure must surface");

        assert!(err.to_string().contains("No space left"), "{err}");
        assert_eq!(
            fs::read(&target).unwrap(),
            original,
            "a failed save must not touch the document it was replacing"
        );
        assert_eq!(
            entries(&dir),
            vec!["doc.pdf".to_string()],
            "a failed save must not leave its temporary file behind"
        );
    }

    #[test]
    fn a_read_only_file_is_refused_rather_than_replaced() {
        let dir = scratch_dir("rofile");
        let target = dir.join("doc.pdf");
        fs::write(&target, b"locked").unwrap();
        let mut perms = fs::metadata(&target).unwrap().permissions();
        perms.set_readonly(true);
        fs::set_permissions(&target, perms).unwrap();

        let err = replace(&target, b"new").expect_err("a read-only file must not be replaced");
        assert_eq!(err.kind(), io::ErrorKind::PermissionDenied);
        assert_eq!(fs::read(&target).unwrap(), b"locked");
        assert_eq!(entries(&dir), vec!["doc.pdf".to_string()]);
    }

    #[test]
    fn a_new_file_is_created_when_nothing_was_there() {
        let dir = scratch_dir("new");
        let target = dir.join("fresh.pdf");
        replace(&target, b"%PDF").expect("replace");
        assert_eq!(fs::read(&target).unwrap(), b"%PDF");
        assert_eq!(entries(&dir), vec!["fresh.pdf".to_string()]);
    }

    #[test]
    fn a_missing_directory_is_an_error_and_creates_nothing() {
        let dir = scratch_dir("missing");
        let target = dir.join("no-such-dir").join("doc.pdf");
        assert!(replace(&target, b"%PDF").is_err());
        assert!(entries(&dir).is_empty());
    }

    #[cfg(unix)]
    #[test]
    fn the_in_place_route_restores_the_original_when_its_write_fails() {
        let dir = scratch_dir("inplace");
        let target = dir.join("doc.pdf");
        let original = b"%PDF-1.7 sandboxed original".to_vec();
        fs::write(&target, &original).unwrap();

        let err = replace_in_place_with_backup(&target, b"%PDF-1.7 replacement", |f, bytes| {
            f.write_all(&bytes[..4])?;
            Err(io::Error::other("connection to the share was lost"))
        })
        .expect_err("the injected failure must surface");

        assert!(err.to_string().contains("share was lost"), "{err}");
        assert_eq!(fs::read(&target).unwrap(), original);
    }

    #[cfg(unix)]
    #[test]
    fn a_read_only_folder_falls_back_to_the_in_place_route() {
        use std::os::unix::fs::PermissionsExt;
        let dir = scratch_dir("rofolder");
        let target = dir.join("doc.pdf");
        fs::write(&target, b"old").unwrap();
        fs::set_permissions(&dir, fs::Permissions::from_mode(0o555)).unwrap();

        let result = replace(&target, b"new");
        // Put the folder back before asserting so a failure does not leave an
        // undeletable directory behind.
        fs::set_permissions(&dir, fs::Permissions::from_mode(0o755)).unwrap();

        result.expect("the in-place route must save when only the file is writable");
        assert_eq!(fs::read(&target).unwrap(), b"new");
        assert_eq!(entries(&dir), vec!["doc.pdf".to_string()]);
    }
}
