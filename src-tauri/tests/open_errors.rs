// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary. The PDFluent application is free to use,
// including for commercial purposes. Redistribution, or extraction or reuse
// of its components (including the embedded PDF engine), requires a licence.
// See https://pdfluent.com/license for terms.

//! J-16 / J-17 / J-18: why a file did not open, as a code the app can explain.
//!
//! Until 1.0.1 every failed open reached the screen as the engine's own text,
//! `Failed to parse PDF: invalid PDF: Invalid`, whatever had gone wrong: a
//! damaged file, a JPEG renamed to .pdf, an empty download, a certificate-
//! protected contract. `open_for_app` now answers with one of a fixed set of
//! codes (`OpenErrorCode`), which the frontend turns into a translated
//! message with something the user can do about it. The engine text stays in
//! `detail`, for the log only.
//!
//! Every code is produced here from real bytes made in the test itself, from
//! the repository's own two-page fixture. Runs in `cargo-test` (Linux) and
//! in the macOS and Windows jobs (`cargo test -p pdfluent-desktop`).

use lopdf::{dictionary, Object, StringFormat};
use pdf_manip::encrypt::{encrypt_and_save, EncryptConfig, EncryptionAlgorithm, Permissions};
use pdfluent_lib::{open_for_app, OpenErrorCode, OpenLimits};
use std::fs;
use std::path::{Path, PathBuf};

fn s(p: &Path) -> &str {
    p.to_str().expect("utf-8 path")
}

fn scratch(name: &str) -> PathBuf {
    let dir = std::env::temp_dir().join(format!("pdfluent-open-errors-{}", std::process::id()));
    fs::create_dir_all(&dir).expect("scratch dir");
    dir.join(name)
}

fn fixture() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("tests/fixtures/two_pages.pdf")
}

fn write(name: &str, bytes: &[u8]) -> PathBuf {
    let path = scratch(name);
    fs::write(&path, bytes).expect("write fixture");
    path
}

/// The code `open_for_app` answers for `path` under `limits`, or a panic if it opened.
fn code_of(path: &Path, password: Option<&str>, limits: &OpenLimits) -> OpenErrorCode {
    match open_for_app(s(path), password, limits) {
        Ok(_) => panic!("{} opened, but it must not", path.display()),
        Err(e) => {
            assert!(
                !e.detail.contains(s(path)),
                "the detail goes to the log and must not carry the path: {}",
                e.detail
            );
            e.code
        }
    }
}

fn defaults() -> OpenLimits {
    OpenLimits::default()
}

fn protected(name: &str, user: &str) -> PathBuf {
    let mut doc = lopdf::Document::load(fixture()).expect("load fixture");
    let config = EncryptConfig {
        user_password: user.as_bytes().to_vec(),
        owner_password: b"owner-key".to_vec(),
        algorithm: EncryptionAlgorithm::Aes256,
        permissions: Permissions::allow_all(),
    };
    let mut bytes = Vec::new();
    encrypt_and_save(&mut doc, &config, &mut bytes).expect("encrypt");
    write(name, &bytes)
}

#[test]
fn a_healthy_pdf_opens_under_the_default_limits() {
    let opened = open_for_app(s(&fixture()), None, &defaults()).expect("the fixture opens");
    assert_eq!(opened.page_count(), 2);
}

#[test]
fn a_damaged_pdf_is_corrupt() {
    let original = fs::read(fixture()).unwrap();
    // A PDF header followed by bytes no parser can make a document of.
    let mut damaged = b"%PDF-1.7\n%\xe2\xe3\xcf\xd3\n".to_vec();
    damaged.extend(std::iter::repeat_n(b'#', 4096));
    assert_eq!(code_of(&write("damaged.pdf", &damaged), None, &defaults()), OpenErrorCode::Corrupt);

    // The first 64 bytes of a real PDF: the header survives, the rest is gone.
    let truncated = &original[..64];
    assert_eq!(code_of(&write("truncated.pdf", truncated), None, &defaults()), OpenErrorCode::Corrupt);
}

#[test]
fn something_that_is_not_a_pdf_is_not_pdf() {
    // A PNG signature and noise, named .pdf.
    let mut png = b"\x89PNG\r\n\x1a\n".to_vec();
    png.extend((0..2048u32).map(|i| (i * 31 % 251) as u8));
    assert_eq!(code_of(&write("photo.pdf", &png), None, &defaults()), OpenErrorCode::NotPdf);

    // A real PDF whose name does not end in .pdf is refused before it is read.
    let renamed = write("report.txt", &fs::read(fixture()).unwrap());
    assert_eq!(code_of(&renamed, None, &defaults()), OpenErrorCode::NotPdf);

    // A folder whose name ends in .pdf.
    let folder = scratch("folder.pdf");
    fs::create_dir_all(&folder).unwrap();
    assert_eq!(code_of(&folder, None, &defaults()), OpenErrorCode::NotPdf);
}

#[test]
fn a_zero_byte_file_is_empty() {
    assert_eq!(code_of(&write("empty.pdf", b""), None, &defaults()), OpenErrorCode::Empty);
}

#[test]
fn a_missing_file_is_not_found() {
    assert_eq!(code_of(&scratch("does-not-exist.pdf"), None, &defaults()), OpenErrorCode::NotFound);
}

#[test]
fn a_user_password_is_asked_for_and_a_wrong_one_is_told_apart() {
    let path = protected("user.pdf", "open-sesame");
    assert_eq!(code_of(&path, None, &defaults()), OpenErrorCode::EncryptedNeedsPassword);
    assert_eq!(code_of(&path, Some("guess"), &defaults()), OpenErrorCode::WrongPassword);
    assert!(open_for_app(s(&path), Some("open-sesame"), &defaults()).is_ok());
}

#[test]
fn certificate_security_is_unsupported_encryption() {
    // Public-key (certificate) security: the file is encrypted for a list of
    // recipients' certificates, not with a password. No password can open it.
    let mut doc = lopdf::Document::load(fixture()).expect("load fixture");
    let encrypt = doc.add_object(dictionary! {
        "Filter" => "Adobe.PubSec",
        "SubFilter" => "adbe.pkcs7.s5",
        "V" => 4,
        "R" => 4,
        "Length" => 128,
        "Recipients" => vec![Object::String(vec![0x30, 0x00], StringFormat::Hexadecimal)],
    });
    doc.trailer.set("Encrypt", Object::Reference(encrypt));
    let id = Object::String(vec![7u8; 16], StringFormat::Hexadecimal);
    doc.trailer.set("ID", vec![id.clone(), id]);
    let mut bytes = Vec::new();
    doc.save_to(&mut bytes).expect("write");
    let path = write("certificate.pdf", &bytes);
    assert_eq!(code_of(&path, None, &defaults()), OpenErrorCode::UnsupportedEncryption);
}

#[test]
fn a_file_above_the_size_limit_is_too_large_and_is_not_read() {
    let limits = OpenLimits { max_bytes: 100, ..defaults() };
    assert_eq!(code_of(&fixture(), None, &limits), OpenErrorCode::TooLarge);
}

#[test]
fn a_document_above_the_page_limit_is_too_many_pages() {
    let limits = OpenLimits { max_pages: 1, ..defaults() };
    assert_eq!(code_of(&fixture(), None, &limits), OpenErrorCode::TooManyPages);
}

#[cfg(unix)]
#[test]
fn a_file_the_user_may_not_read_is_io_denied() {
    use std::os::unix::fs::PermissionsExt;
    let path = write("locked.pdf", &fs::read(fixture()).unwrap());
    fs::set_permissions(&path, fs::Permissions::from_mode(0o000)).unwrap();
    if fs::read(&path).is_ok() {
        // root reads anything; there is no denial to classify.
        eprintln!("SKIPPED (not a pass): running with privileges that ignore file permissions");
        return;
    }
    assert_eq!(code_of(&path, None, &defaults()), OpenErrorCode::IoDenied);
    fs::set_permissions(&path, fs::Permissions::from_mode(0o644)).unwrap();
}

#[cfg(not(unix))]
#[test]
fn a_file_the_user_may_not_read_is_io_denied() {
    eprintln!(
        "SKIPPED (not a pass): a read-denied file needs a Windows ACL edit; the mapping itself is \
         covered by io_errors_map_to_their_codes"
    );
}

#[test]
fn io_errors_map_to_their_codes() {
    use pdfluent_lib::classify_io_error;
    use std::io::{Error, ErrorKind};
    assert_eq!(classify_io_error(&Error::from(ErrorKind::NotFound)).code, OpenErrorCode::NotFound);
    assert_eq!(classify_io_error(&Error::from(ErrorKind::PermissionDenied)).code, OpenErrorCode::IoDenied);
    assert_eq!(classify_io_error(&Error::from(ErrorKind::IsADirectory)).code, OpenErrorCode::NotPdf);
    assert_eq!(classify_io_error(&Error::other("disk on fire")).code, OpenErrorCode::Unknown);
}

#[test]
fn the_error_crosses_the_bridge_as_a_code_and_a_detail() {
    let err = open_for_app(s(&write("ser.pdf", b"")), None, &defaults()).err().unwrap();
    let json = serde_json::to_value(&err).unwrap();
    assert_eq!(json["code"], "open.empty");
    assert!(json["detail"].is_string());
    assert_eq!(json.as_object().unwrap().len(), 2, "{json}");
}

#[test]
fn every_code_serialises_to_its_stable_name() {
    let names: Vec<String> = OpenErrorCode::ALL
        .iter()
        .map(|c| serde_json::to_value(c).unwrap().as_str().unwrap().to_string())
        .collect();
    assert_eq!(
        names,
        [
            "open.corrupt",
            "open.not_pdf",
            "open.empty",
            "open.encrypted_needs_password",
            "open.wrong_password",
            "open.unsupported_encryption",
            "open.too_large",
            "open.too_many_pages",
            "open.io_denied",
            "open.not_found",
            "open.unknown",
        ]
    );
    for code in OpenErrorCode::ALL {
        assert_eq!(serde_json::to_value(code).unwrap().as_str().unwrap(), code.as_str());
    }
}

#[test]
fn the_password_answers_keep_the_text_the_password_prompt_matches() {
    // OpenDocument::open still answers a string; the prompt (#697) and the
    // existing callers match its leading code.
    let path = protected("legacy.pdf", "open-sesame");
    let err = pdfluent_lib::OpenDocument::open(s(&path)).err().unwrap();
    assert!(err.starts_with("password-required"), "{err}");
    let err = pdfluent_lib::OpenDocument::open_with_password(s(&path), Some("x")).err().unwrap();
    assert!(err.starts_with("password-incorrect"), "{err}");
}
