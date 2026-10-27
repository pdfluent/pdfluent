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
//! grants access to that one path, not to the folder it sits in, so creating a
//! sibling is refused with `PermissionDenied`. That holds for a file the user
//! is overwriting and, as 1.1.1 found out, for a file that does not exist yet:
//! the save panel grants the new name, nothing around it. Then the bytes go to
//! the granted path itself:
//!
//! - an existing file is rewritten in place, but only after a copy of the old
//!   contents is safely in the app's temporary directory; a failed or
//!   unverifiable write puts the old bytes back;
//! - a new file is created exclusively at the granted path and removed again if
//!   the write fails, so there is no half-written file and nothing to restore.
//!
//! Neither is atomic, and the log says so, but neither ends with a half-written
//! document and no way back. After the write the file is read back and compared
//! with what was meant to be written.

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
    // The e2e build can be told to fill the disk (journeys/J-B2); a shipped
    // build has no such branch.
    #[cfg(feature = "e2e")]
    let write = |file: &mut File, bytes: &[u8]| {
        crate::e2e::injected_write_failure(target, file, bytes)?;
        write(file, bytes)
    };
    replace_inner(target, bytes, write).map_err(|e| explain(e, target))
}

fn replace_inner<W>(target: &Path, bytes: &[u8], write: W) -> io::Result<()>
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
        Err(e) if e.kind() == io::ErrorKind::PermissionDenied => {
            // Only the path itself is writable (App Sandbox). A target that
            // exists is rewritten with a backup; one that does not is created.
            return if target.exists() {
                replace_in_place_with_backup(target, bytes, write)
            } else {
                create_at_granted_path(target, bytes, write)
            };
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
    if let Err(e) = rename_over(&tmp_path, target) {
        discard(&tmp_path);
        return Err(e);
    }
    sync_dir(dir);
    Ok(())
}

/// `fs::rename`, with one Windows allowance. A file that was closed a moment
/// ago is often still held by a virus scanner, the search indexer or OneDrive,
/// and the rename of a file onto one of those fails with a sharing violation
/// that is gone a few milliseconds later. A short, bounded retry rides that out
/// (about 1.3 seconds in all); a target another program really holds open
/// still fails, with the old file where it was.
#[cfg(windows)]
fn rename_over(from: &Path, to: &Path) -> io::Result<()> {
    let mut delay = std::time::Duration::from_millis(10);
    for _ in 0..7 {
        match fs::rename(from, to) {
            Err(e) if is_transient_windows_lock(&e) => {
                std::thread::sleep(delay);
                delay *= 2;
            }
            other => return other,
        }
    }
    fs::rename(from, to)
}

#[cfg(not(windows))]
fn rename_over(from: &Path, to: &Path) -> io::Result<()> {
    fs::rename(from, to)
}

/// ERROR_ACCESS_DENIED (5), ERROR_SHARING_VIOLATION (32), ERROR_LOCK_VIOLATION (33).
#[cfg(windows)]
fn is_transient_windows_lock(e: &io::Error) -> bool {
    matches!(e.raw_os_error(), Some(5) | Some(32) | Some(33))
}

/// Say what happened in words a person can act on. The raw operating-system
/// text stays at the end, so a support report still carries it. The error kind
/// is kept: callers branch on it.
#[cfg(windows)]
fn explain(e: io::Error, target: &Path) -> io::Error {
    let name = target
        .file_name()
        .map_or_else(|| "the file".to_string(), |n| n.to_string_lossy().into_owned());
    let reason = match e.raw_os_error() {
        Some(32) | Some(33) => format!(
            "'{name}' is open in another program that does not let it be replaced. Close it there, \
             or use Save As to keep your work in a new file"
        ),
        Some(5) => format!(
            "Windows denied access to '{name}'. The file or its folder may be read-only, \
             protected by Controlled Folder Access, or held by another program. \
             Use Save As to keep your work in a different place"
        ),
        _ => return e,
    };
    io::Error::new(e.kind(), format!("{reason} ({e})"))
}

#[cfg(not(windows))]
fn explain(e: io::Error, _target: &Path) -> io::Error {
    e
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
        // The stem only helps a person who finds a leftover. A file name is
        // limited to 255 bytes on APFS and 255 characters on NTFS, and a
        // document may already use most of that: a temporary name built from
        // the whole of it would fail where the document itself is fine.
        let stem: String = stem.chars().take(40).collect();
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
        file.sync_all()?;
        drop(file);
        verify_written(target, bytes)
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

/// The sandbox route for a file that does not exist: the save panel granted
/// this exact path and nothing around it. `create_new` refuses to overwrite a
/// file that appeared in the meantime (the caller then has a different story);
/// whatever fails after the file exists removes it again, because it is ours
/// and there is nothing of the user's to put back.
fn create_at_granted_path<W>(target: &Path, bytes: &[u8], write: W) -> io::Result<()>
where
    W: FnOnce(&mut File, &[u8]) -> io::Result<()>,
{
    crate::applog("save: no write access to the folder; creating the file at the granted path");
    let mut file = match OpenOptions::new().write(true).create_new(true).open(target) {
        Ok(file) => file,
        // Someone created it between the check and now: it is an existing file
        // after all, and the backup route protects its contents.
        Err(e) if e.kind() == io::ErrorKind::AlreadyExists => {
            return replace_in_place_with_backup(target, bytes, write);
        }
        Err(e) => return Err(e),
    };
    let result = (|| -> io::Result<()> {
        write(&mut file, bytes)?;
        file.flush()?;
        file.sync_all()
    })();
    drop(file);
    let result = result.and_then(|()| verify_written(target, bytes));
    if let Err(e) = result {
        discard(target);
        return Err(e);
    }
    Ok(())
}

/// Read the file back and compare. A write that returned `Ok` but left other
/// bytes (a share that lost the tail, a sync tool that raced us) is a failed
/// save, not a successful one.
fn verify_written(target: &Path, bytes: &[u8]) -> io::Result<()> {
    let on_disk = fs::read(target)?;
    if on_disk != bytes {
        return Err(io::Error::other(format!(
            "the saved file does not match what was written ({} bytes on disk, {} expected)",
            on_disk.len(),
            bytes.len()
        )));
    }
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
    fn a_file_name_near_the_length_limit_still_saves() {
        // 240 characters is a legal name on APFS and NTFS; the temporary name
        // beside it must not be what exceeds the limit.
        let dir = scratch_dir("longname");
        let name = format!("{}.pdf", "n".repeat(236));
        let target = dir.join(&name);
        fs::write(&target, b"old").unwrap();
        replace(&target, b"new").expect("a long name must save");
        assert_eq!(fs::read(&target).unwrap(), b"new");
        assert_eq!(entries(&dir), vec![name]);
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
    #[test]
    fn the_granted_path_route_creates_a_new_file_and_nothing_else() {
        let dir = scratch_dir("granted");
        let target = dir.join("fresh.pdf");
        create_at_granted_path(&target, b"%PDF new", |f, b| f.write_all(b)).expect("create");
        assert_eq!(fs::read(&target).unwrap(), b"%PDF new");
        assert_eq!(entries(&dir), vec!["fresh.pdf".to_string()]);
    }

    #[test]
    fn a_failed_write_to_a_new_granted_path_leaves_no_file() {
        let dir = scratch_dir("newfail");
        let target = dir.join("fresh.pdf");
        let err = create_at_granted_path(&target, b"%PDF-1.7 the new version", |f, bytes| {
            f.write_all(&bytes[..6])?;
            Err(io::Error::other("No space left on device"))
        })
        .expect_err("the injected failure must surface");
        assert!(err.to_string().contains("No space left"), "{err}");
        assert!(entries(&dir).is_empty(), "a half-written new file must not stay behind");
    }

    #[test]
    fn a_write_that_reports_success_but_lands_other_bytes_is_a_failed_save() {
        let dir = scratch_dir("verify");
        let target = dir.join("fresh.pdf");
        let err = create_at_granted_path(&target, b"%PDF full", |f, _| f.write_all(b"%PDF"))
            .expect_err("a short file must not count as saved");
        assert!(err.to_string().contains("does not match"), "{err}");
        assert!(entries(&dir).is_empty());

        let existing = dir.join("doc.pdf");
        fs::write(&existing, b"original").unwrap();
        let err = replace_in_place_with_backup(&existing, b"replacement", |f, _| f.write_all(b"repl"))
            .expect_err("a short rewrite must not count as saved");
        assert!(err.to_string().contains("does not match"), "{err}");
        assert_eq!(fs::read(&existing).unwrap(), b"original");
    }

    /// The real thing, short of a signed bundle: this test binary runs again
    /// under a `sandbox-exec` profile that gives it the one path the user chose
    /// and nothing around it, which is what the Mac App Store sandbox hands an
    /// app after a Save As (GOV-001: the 1.1.1 temp-sibling save failed there
    /// with EPERM for every new file). The signed, entitled bundle is judged by
    /// the sandboxed journeys; this one runs in `cargo test` on every push.
    #[cfg(target_os = "macos")]
    mod granted_path_only {
        use super::*;
        use std::process::Command;

        const TARGET: &str = "PDFLUENT_SANDBOX_CHILD_TARGET";
        const FAIL: &str = "PDFLUENT_SANDBOX_CHILD_FAIL";

        /// Runs inside the sandbox. Ignored so the ordinary run skips it; the
        /// parent test below runs it by name with `--ignored`.
        #[test]
        #[ignore = "child of granted_path_only, run under sandbox-exec"]
        fn sandbox_child() {
            let target = PathBuf::from(std::env::var(TARGET).expect("target"));
            let fail = std::env::var(FAIL).is_ok();
            let result = replace_with_writer(&target, b"%PDF-1.7 saved in the sandbox", |f, b| {
                if fail {
                    f.write_all(&b[..8])?;
                    return Err(io::Error::other("injected write failure"));
                }
                f.write_all(b)
            });
            match result {
                Ok(()) => println!("CHILD-RESULT ok"),
                Err(e) => println!("CHILD-RESULT err {:?} {e}", e.kind()),
            }
        }

        /// Returns the child's `CHILD-RESULT` line.
        fn run_sandboxed(folder: &Path, target: &Path, fail: bool) -> String {
            let folder = fs::canonicalize(folder).expect("canonical folder");
            let target = folder.join(target.file_name().unwrap());
            let profile = format!(
                "(version 1) (allow default) (deny file-write* (subpath {:?})) (allow file-write* (literal {:?}))",
                folder.display().to_string(),
                target.display().to_string()
            );
            let mut cmd = Command::new("/usr/bin/sandbox-exec");
            cmd.arg("-p").arg(&profile).arg(std::env::current_exe().unwrap());
            cmd.args(["--exact", "atomic_file::tests::granted_path_only::sandbox_child", "--ignored", "--nocapture"]);
            cmd.env(TARGET, &target);
            if fail {
                cmd.env(FAIL, "1");
            }
            let out = cmd.output().expect("sandbox-exec must run on macOS");
            let stdout = String::from_utf8_lossy(&out.stdout).into_owned();
            stdout
                .lines()
                .find(|l| l.starts_with("CHILD-RESULT"))
                .map(str::to_owned)
                .unwrap_or_else(|| {
                    panic!(
                        "the sandboxed child printed no result (exit {:?})\nstdout: {stdout}\nstderr: {}",
                        out.status.code(),
                        String::from_utf8_lossy(&out.stderr)
                    )
                })
        }

        #[test]
        fn save_as_to_a_new_file_works_with_access_to_that_file_only() {
            let dir = scratch_dir("sbx-new");
            let target = dir.join("chosen.pdf");
            let line = run_sandboxed(&dir, &target, false);
            assert_eq!(line, "CHILD-RESULT ok", "new file under file-only access: {line}");
            assert_eq!(fs::read(&target).unwrap(), b"%PDF-1.7 saved in the sandbox");
            assert_eq!(entries(&dir), vec!["chosen.pdf".to_string()], "no temp file may be left");
        }

        #[test]
        fn save_over_an_existing_file_works_with_access_to_that_file_only() {
            let dir = scratch_dir("sbx-existing");
            let target = dir.join("chosen.pdf");
            fs::write(&target, b"original").unwrap();
            let line = run_sandboxed(&dir, &target, false);
            assert_eq!(line, "CHILD-RESULT ok", "{line}");
            assert_eq!(fs::read(&target).unwrap(), b"%PDF-1.7 saved in the sandbox");
            assert_eq!(entries(&dir), vec!["chosen.pdf".to_string()]);
        }

        #[test]
        fn a_failed_write_leaves_no_new_file_and_keeps_an_existing_one_whole() {
            let dir = scratch_dir("sbx-fail-new");
            let target = dir.join("chosen.pdf");
            let line = run_sandboxed(&dir, &target, true);
            assert!(line.starts_with("CHILD-RESULT err"), "{line}");
            assert!(entries(&dir).is_empty(), "a failed Save As must not leave a file");

            let dir = scratch_dir("sbx-fail-existing");
            let target = dir.join("chosen.pdf");
            fs::write(&target, b"original document").unwrap();
            let line = run_sandboxed(&dir, &target, true);
            assert!(line.starts_with("CHILD-RESULT err"), "{line}");
            assert_eq!(fs::read(&target).unwrap(), b"original document");
            assert_eq!(entries(&dir), vec!["chosen.pdf".to_string()]);
        }
    }
    /// Windows: what another program does to a file we are saving over. Each
    /// case holds the target open the way a reader would and checks the three
    /// things that matter: the save says so in words, the document is as it
    /// was, and no temporary file is left in the folder.
    #[cfg(windows)]
    mod held_by_another_program {
        use super::*;
        use std::os::windows::fs::OpenOptionsExt;

        const FILE_SHARE_READ: u32 = 1;

        fn hold(target: &Path, share: u32) -> File {
            OpenOptions::new().read(true).share_mode(share).open(target).expect("hold the file")
        }

        #[test]
        fn a_file_held_without_sharing_is_not_replaced_and_the_error_says_why() {
            let dir = scratch_dir("win-held-none");
            let target = dir.join("doc.pdf");
            fs::write(&target, b"original").unwrap();
            let held = hold(&target, 0);

            let err = replace(&target, b"new").expect_err("a held file must not be replaced");
            drop(held);

            assert!(err.to_string().contains("another program"), "{err}");
            assert_eq!(fs::read(&target).unwrap(), b"original");
            assert_eq!(entries(&dir), vec!["doc.pdf".to_string()]);
        }

        #[test]
        fn a_file_held_by_a_reader_that_allows_no_delete_is_not_replaced() {
            // Acrobat, a previewer or a sync client: reading is shared, replacing is not.
            let dir = scratch_dir("win-held-read");
            let target = dir.join("doc.pdf");
            fs::write(&target, b"original").unwrap();
            let held = hold(&target, FILE_SHARE_READ);

            let err = replace(&target, b"new").expect_err("a held file must not be replaced");
            drop(held);

            assert!(err.to_string().contains("another program"), "{err}");
            assert_eq!(fs::read(&target).unwrap(), b"original");
            assert_eq!(entries(&dir), vec!["doc.pdf".to_string()]);
        }

        #[test]
        fn a_lock_that_lasts_a_few_hundred_milliseconds_is_waited_out() {
            // A scanner or the indexer opening the file right after a save.
            let dir = scratch_dir("win-held-brief");
            let target = dir.join("doc.pdf");
            fs::write(&target, b"original").unwrap();
            let held = hold(&target, 0);
            let releaser = std::thread::spawn(move || {
                std::thread::sleep(std::time::Duration::from_millis(300));
                drop(held);
            });

            replace(&target, b"new").expect("a brief lock must not fail the save");
            releaser.join().unwrap();

            assert_eq!(fs::read(&target).unwrap(), b"new");
            assert_eq!(entries(&dir), vec!["doc.pdf".to_string()]);
        }

        #[test]
        fn a_persistent_lock_gives_up_within_seconds() {
            let dir = scratch_dir("win-held-long");
            let target = dir.join("doc.pdf");
            fs::write(&target, b"original").unwrap();
            let held = hold(&target, 0);
            let started = std::time::Instant::now();
            let _ = replace(&target, b"new");
            drop(held);
            assert!(started.elapsed() < std::time::Duration::from_secs(10), "{:?}", started.elapsed());
        }
    }
}
