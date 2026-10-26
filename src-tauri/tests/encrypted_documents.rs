// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary. The PDFluent application is free to use,
// including for commercial purposes. Redistribution, or extraction or reuse
// of its components (including the embedded PDF engine), requires a licence.
// See https://pdfluent.com/license for terms.

//! J-18 / J-76: password-protected PDFs.
//!
//! Until 1.0.1 a PDF with a user password failed to open with a raw
//! "Failed to parse PDF" and no prompt. Three more things were wrong once one
//! did open, and each is pinned here:
//!
//! * a protected document that was edited and saved came back out with no
//!   protection at all — lopdf decrypts on load and writes plaintext;
//! * a file with only an owner password opened with every permission, so a
//!   "no changes" flag meant nothing;
//! * "Encrypt" encrypted the open document in place, so every later edit and
//!   save worked on ciphertext; and "Remove password" checked a trailer entry
//!   lopdf had already dropped, so it always said "not encrypted".
//!
//! The protected fixtures are made here from the repository's own two-page
//! fixture, so nothing of unknown licence is involved. Runs in `cargo-test`.

use pdf_manip::encrypt::{encrypt_and_save, EncryptConfig, EncryptionAlgorithm, Permissions};
use pdfluent_lib::{OpenDocument, PasswordRemoval};
use std::fs;
use std::path::{Path, PathBuf};

const USER: &str = "open-sesame";
const OWNER: &str = "owner-key";

fn s(p: &Path) -> &str {
    p.to_str().expect("utf-8 path")
}

fn scratch(name: &str) -> PathBuf {
    let dir = std::env::temp_dir().join(format!("pdfluent-encrypted-{}", std::process::id()));
    fs::create_dir_all(&dir).expect("scratch dir");
    dir.join(name)
}

fn fixture() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("tests/fixtures/two_pages.pdf")
}

fn protected(name: &str, user: &str, owner: &str, permissions: Permissions) -> PathBuf {
    let mut doc = lopdf::Document::load(fixture()).expect("load fixture");
    let config = EncryptConfig {
        user_password: user.as_bytes().to_vec(),
        owner_password: owner.as_bytes().to_vec(),
        algorithm: EncryptionAlgorithm::Aes256,
        permissions,
    };
    let mut bytes = Vec::new();
    encrypt_and_save(&mut doc, &config, &mut bytes).expect("encrypt");
    let path = scratch(name);
    fs::write(&path, bytes).expect("write protected fixture");
    path
}

fn first_page_text(doc: &OpenDocument) -> String {
    doc.extract_page_text(0).expect("text")
}

#[test]
fn a_user_password_is_asked_for_and_a_wrong_one_is_told_apart() {
    let path = protected("user.pdf", USER, OWNER, Permissions::allow_all());

    let err = OpenDocument::open(s(&path)).err().expect("no password must not open");
    assert!(err.starts_with("password-required"), "{err}");

    let err = OpenDocument::open_with_password(s(&path), Some("guess"))
        .err()
        .expect("a wrong password must not open");
    assert!(err.starts_with("password-incorrect"), "{err}");

    let doc = OpenDocument::open_with_password(s(&path), Some(USER)).expect("the right password opens");
    assert!(first_page_text(&doc).contains("Hello Page One"));
    assert!(doc.access.encrypted);
    assert!(!doc.access.owner, "the user password is not the owner password");
    assert!(!doc.access.read_only, "this fixture grants every permission");

    let owner = OpenDocument::open_with_password(s(&path), Some(OWNER)).expect("the owner password opens");
    assert!(owner.access.owner);
}

#[test]
fn saving_a_protected_document_keeps_it_protected() {
    let path = protected("keep.pdf", USER, OWNER, Permissions::allow_all());
    let mut doc = OpenDocument::open_with_password(s(&path), Some(USER)).expect("open");
    doc.delete_pages(&[1]).expect("edit");
    let out = scratch("keep-saved.pdf");
    doc.save_to(s(&out)).expect("save");

    let err = OpenDocument::open(s(&out)).err().expect("the saved file must still need its password");
    assert!(err.starts_with("password-required"), "{err}");
    let reopened = OpenDocument::open_with_password(s(&out), Some(USER)).expect("reopen with the password");
    assert_eq!(reopened.page_count(), 1, "the edit is in the saved file");
    assert!(first_page_text(&reopened).contains("Hello Page One"));
}

#[test]
fn an_owner_password_only_file_opens_read_only_when_its_permissions_say_so() {
    let no_changes = Permissions {
        modify_contents: false,
        modify_annotations: false,
        fill_forms: false,
        assemble_document: false,
        ..Permissions::allow_all()
    };
    let path = protected("owner-only.pdf", "", OWNER, no_changes);
    let before = fs::read(&path).unwrap();

    let mut doc = OpenDocument::open(s(&path)).expect("no user password: opens without asking");
    assert!(doc.access.encrypted);
    assert!(doc.access.read_only, "{:?}", doc.access);
    assert!(doc.access.can_print, "printing was allowed");
    assert!(!doc.access.can_modify);

    doc.rotate_page_right(0).expect("an edit in memory");
    let err = doc.save_to(s(&path)).expect_err("a read-only document must not be saved");
    assert!(err.starts_with("document-read-only"), "{err}");
    assert_eq!(fs::read(&path).unwrap(), before);

    // The owner removes the protection, and then it saves.
    let err = doc.decrypt("not-the-owner").expect_err("a wrong owner password");
    assert!(err.starts_with("password-incorrect"), "{err}");
    doc.decrypt(OWNER).expect("the owner password removes the protection");
    assert!(!doc.access.read_only);
    let out = scratch("owner-only-unlocked.pdf");
    doc.save_to(s(&out)).expect("save after removing the password");
    let reopened = OpenDocument::open(s(&out)).expect("reopen");
    assert!(!reopened.access.encrypted, "the protection is gone, as asked");
}

#[test]
fn encrypting_writes_a_protected_copy_and_leaves_the_open_document_usable() {
    let mut doc = OpenDocument::open(s(&fixture())).expect("open");
    let protected_copy = scratch("encrypted-copy.pdf");
    doc.encrypt(USER, OWNER, s(&protected_copy)).expect("encrypt");

    let err = OpenDocument::open(s(&protected_copy)).err().expect("the copy is protected");
    assert!(err.starts_with("password-required"), "{err}");
    assert!(OpenDocument::open_with_password(s(&protected_copy), Some(USER)).is_ok());

    // The open document is the unencrypted original, still editable.
    assert!(first_page_text(&doc).contains("Hello Page One"));
    doc.delete_pages(&[1]).expect("edit after encrypting a copy");
    let out = scratch("after-encrypt.pdf");
    doc.save_to(s(&out)).expect("save");
    let reopened = OpenDocument::open(s(&out)).expect("the original stays unprotected");
    assert_eq!(reopened.page_count(), 1);
    assert!(first_page_text(&reopened).contains("Hello Page One"));
}

#[test]
fn a_protected_document_has_the_same_size_every_time_it_is_saved() {
    // Encrypted strings are random bytes; written as literals each ( ) \ or CR
    // costs an escape, so the length changed from save to save and the size
    // axis flipped on a rounding boundary. Hexadecimal strings have one length.
    let path = protected("size.pdf", USER, OWNER, Permissions::allow_all());
    let mut lengths = std::collections::BTreeSet::new();
    for i in 0..40 {
        let mut doc = OpenDocument::open_with_password(s(&path), Some(USER)).expect("open");
        doc.delete_pages(&[1]).expect("edit");
        let out = scratch(&format!("size-{i}.pdf"));
        doc.save_to(s(&out)).expect("save");
        lengths.insert(fs::metadata(&out).expect("saved file").len());
    }
    assert_eq!(lengths.len(), 1, "saved sizes differ between saves: {lengths:?}");
}

// #726: removing a password is an owner operation. Opened with the owner
// password it needs nothing more; opened with the user password it needs the
// owner password, which is a different secret.
#[test]
fn removing_the_password_asks_for_the_owner_password_only_when_it_is_not_known() {
    let path = protected("remove-user.pdf", USER, OWNER, Permissions::allow_all());

    let mut as_user = OpenDocument::open_with_password(s(&path), Some(USER)).expect("open as user");
    assert_eq!(as_user.password_removal(), PasswordRemoval::NeedsOwnerPassword);
    let err = as_user.decrypt("").expect_err("an empty password is not the owner password");
    assert!(err.starts_with("password-incorrect"), "{err}");
    let err = as_user.decrypt(USER).expect_err("the user password is not the owner password");
    assert!(err.starts_with("password-incorrect"), "{err}");
    as_user.decrypt(OWNER).expect("the owner password removes it");
    assert_eq!(as_user.password_removal(), PasswordRemoval::NotProtected);

    let mut as_owner = OpenDocument::open_with_password(s(&path), Some(OWNER)).expect("open as owner");
    assert_eq!(as_owner.password_removal(), PasswordRemoval::Ready);
    as_owner.decrypt("").expect("opened as owner: no second prompt");
    let out = scratch("remove-as-owner.pdf");
    as_owner.save_to(s(&out)).expect("save");
    assert!(!OpenDocument::open(s(&out)).expect("reopen").access.encrypted);

    let plain = OpenDocument::open(s(&fixture())).expect("open plain");
    assert_eq!(plain.password_removal(), PasswordRemoval::NotProtected);
}
