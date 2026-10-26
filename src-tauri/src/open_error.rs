// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary. The PDFluent application is free to use,
// including for commercial purposes. Redistribution, or extraction or reuse
// of its components (including the embedded PDF engine), requires a licence.
// See https://pdfluent.com/license for terms.

//! Why a file did not open, as a code the app can explain (J-16, J-17, J-18).
//!
//! `open_pdf` used to reject with the engine's own text, so a damaged file, a
//! renamed JPEG, an empty download and a certificate-protected contract all
//! reached the screen as `Failed to parse PDF: invalid PDF: Invalid`. It now
//! rejects with an [`OpenError`]: one of a fixed set of [`OpenErrorCode`]s,
//! which the frontend maps to a translated message
//! (`src/viewer/state/openError.ts`), and a `detail` for the log. The detail
//! never reaches the UI, and the path of the file is scrubbed from it.
//!
//! The codes are a contract with the frontend: renaming one breaks its
//! message. `src/viewer/state/__tests__/openError.test.ts` reads the names
//! from this file and fails on a code without a translation.

use serde::Serialize;
use std::fmt;
use std::io::{ErrorKind, Read};

/// Every reason a file can fail to open, as the frontend knows it.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
pub enum OpenErrorCode {
    /// It is a PDF (it has the header) but the engine cannot make a document of it.
    #[serde(rename = "open.corrupt")]
    Corrupt,
    /// Not a PDF at all, a name that does not end in `.pdf`, or a folder.
    #[serde(rename = "open.not_pdf")]
    NotPdf,
    /// Zero bytes.
    #[serde(rename = "open.empty")]
    Empty,
    /// Protected with a user password and none was given.
    #[serde(rename = "open.encrypted_needs_password")]
    EncryptedNeedsPassword,
    /// The password given does not open it.
    #[serde(rename = "open.wrong_password")]
    WrongPassword,
    /// Encrypted in a way no password opens here (certificate security, an
    /// unknown handler or algorithm).
    #[serde(rename = "open.unsupported_encryption")]
    UnsupportedEncryption,
    /// Larger than [`OpenLimits::max_bytes`].
    #[serde(rename = "open.too_large")]
    TooLarge,
    /// More pages than [`OpenLimits::max_pages`].
    #[serde(rename = "open.too_many_pages")]
    TooManyPages,
    /// The operating system refused to let the app read it.
    #[serde(rename = "open.io_denied")]
    IoDenied,
    /// There is no file at that path (moved, renamed, deleted, unmounted).
    #[serde(rename = "open.not_found")]
    NotFound,
    /// Anything else. The frontend shows a generic message for it.
    #[serde(rename = "open.unknown")]
    Unknown,
}

impl OpenErrorCode {
    pub const ALL: [Self; 11] = [
        Self::Corrupt,
        Self::NotPdf,
        Self::Empty,
        Self::EncryptedNeedsPassword,
        Self::WrongPassword,
        Self::UnsupportedEncryption,
        Self::TooLarge,
        Self::TooManyPages,
        Self::IoDenied,
        Self::NotFound,
        Self::Unknown,
    ];

    pub fn as_str(self) -> &'static str {
        match self {
            Self::Corrupt => "open.corrupt",
            Self::NotPdf => "open.not_pdf",
            Self::Empty => "open.empty",
            Self::EncryptedNeedsPassword => "open.encrypted_needs_password",
            Self::WrongPassword => "open.wrong_password",
            Self::UnsupportedEncryption => "open.unsupported_encryption",
            Self::TooLarge => "open.too_large",
            Self::TooManyPages => "open.too_many_pages",
            Self::IoDenied => "open.io_denied",
            Self::NotFound => "open.not_found",
            Self::Unknown => "open.unknown",
        }
    }
}

/// The rejection of `open_pdf`: `{ "code": "open.corrupt", "detail": "…" }`.
#[derive(Debug, Clone, Serialize)]
pub struct OpenError {
    pub code: OpenErrorCode,
    /// The underlying engine or OS text, for the log. Never shown.
    pub detail: String,
}

impl OpenError {
    pub fn new(code: OpenErrorCode, detail: impl Into<String>) -> Self {
        Self { code, detail: detail.into() }
    }

    /// The same error with every occurrence of `path` replaced, so the log
    /// line it ends up in does not carry the user's folder and file names.
    pub fn scrubbed(mut self, path: &str) -> Self {
        if !path.is_empty() {
            self.detail = self.detail.replace(path, "<file>");
        }
        self
    }
}

/// The text callers of the string API (`OpenDocument::open`) have always
/// received. The two password answers keep the codes the password prompt and
/// the save path match on.
impl fmt::Display for OpenError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self.code {
            OpenErrorCode::EncryptedNeedsPassword => f.write_str(crate::pdf_engine::PASSWORD_REQUIRED),
            OpenErrorCode::WrongPassword => f.write_str(crate::pdf_engine::PASSWORD_INCORRECT),
            _ => f.write_str(&self.detail),
        }
    }
}

/// The app's hard limits on what it will open (J-16).
///
/// The open path holds the file several times over (raw bytes, the render
/// document, the editing document), so a file well past these would take the
/// machine's memory with it rather than fail. The limits sit far above the
/// J-16 target (500 pages, 200 MB), which must open.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct OpenLimits {
    pub max_bytes: u64,
    pub max_pages: usize,
}

/// 1 GiB.
pub const DEFAULT_MAX_OPEN_BYTES: u64 = 1024 * 1024 * 1024;
pub const DEFAULT_MAX_OPEN_PAGES: usize = 50_000;

impl Default for OpenLimits {
    fn default() -> Self {
        Self { max_bytes: DEFAULT_MAX_OPEN_BYTES, max_pages: DEFAULT_MAX_OPEN_PAGES }
    }
}

/// The code for an I/O failure while reaching or reading the file.
pub fn classify_io_error(e: &std::io::Error) -> OpenError {
    let code = match e.kind() {
        ErrorKind::NotFound => OpenErrorCode::NotFound,
        ErrorKind::PermissionDenied => OpenErrorCode::IoDenied,
        ErrorKind::IsADirectory => OpenErrorCode::NotPdf,
        _ => OpenErrorCode::Unknown,
    };
    OpenError::new(code, format!("Failed to read file: {e}"))
}

/// Like [`classify_io_error`], for a failure of opening `path` itself.
///
/// Windows answers `File::open` on a folder with Access Denied
/// (`PermissionDenied`), where Unix opens it and fails on the first read.
/// A folder is not a PDF whatever the OS says, so the path is looked at
/// before the error kind is believed. A real permission error on a real file
/// stays `IoDenied`.
pub fn classify_io_error_at(path: &str, e: &std::io::Error) -> OpenError {
    if is_folder(path) {
        return OpenError::new(OpenErrorCode::NotPdf, "the path is a folder");
    }
    classify_io_error(e)
}

/// Whether `path` names a folder (symlinks followed). A path that cannot be
/// inspected is not a folder; the open that follows reports why.
fn is_folder(path: &str) -> bool {
    std::fs::metadata(path).map(|m| m.is_dir()).unwrap_or(false)
}

/// The code for a path `security::validate_pdf_input_path` refused.
pub fn classify_path_refusal(raw: &str, refusal: String) -> OpenError {
    let code = if crate::security::has_pdf_extension(raw) {
        OpenErrorCode::Unknown
    } else {
        OpenErrorCode::NotPdf
    };
    OpenError::new(code, refusal).scrubbed(raw)
}

/// The code for a parse failure of the rendering engine.
///
/// `PdfDocument::open` carries the decryption cause as its `Debug` name
/// (`pdf_syntax::DecryptionError`), so that is what is matched.
pub fn classify_engine_error(e: &pdf_engine::EngineError, password_given: bool, bytes: &[u8]) -> OpenError {
    let detail = format!("Failed to parse PDF: {e}");
    let code = match e {
        pdf_engine::EngineError::Encrypted(cause) => match cause.as_str() {
            "PasswordProtected" if password_given => OpenErrorCode::WrongPassword,
            "PasswordProtected" => OpenErrorCode::EncryptedNeedsPassword,
            "UnsupportedAlgorithm" => OpenErrorCode::UnsupportedEncryption,
            // A broken /Encrypt dictionary or a missing /ID: the file is damaged.
            _ => OpenErrorCode::Corrupt,
        },
        pdf_engine::EngineError::InvalidPdf(cause) if cause.starts_with("TooLarge") => OpenErrorCode::TooLarge,
        pdf_engine::EngineError::Io(io) => return classify_io_error(io),
        _ if !has_pdf_header(bytes) => OpenErrorCode::NotPdf,
        _ => OpenErrorCode::Corrupt,
    };
    OpenError::new(code, detail)
}

/// The code for a failure of the editing parser, after the rendering engine
/// accepted the file.
pub fn classify_lopdf_error(e: &lopdf::Error) -> OpenError {
    use lopdf::encryption::DecryptionError as D;
    let code = match e {
        lopdf::Error::InvalidPassword | lopdf::Error::Decryption(D::IncorrectPassword) => {
            OpenErrorCode::WrongPassword
        }
        lopdf::Error::Decryption(D::UnsupportedEncryption | D::UnsupportedVersion) => {
            OpenErrorCode::UnsupportedEncryption
        }
        lopdf::Error::IO(io) => return classify_io_error(io),
        _ => OpenErrorCode::Corrupt,
    };
    OpenError::new(code, format!("Failed to load PDF for editing: {e}"))
}

/// A PDF starts with `%PDF-` within its first 1024 bytes (ISO 32000-2, 7.5.2,
/// read leniently, as every viewer does).
pub fn has_pdf_header(bytes: &[u8]) -> bool {
    bytes[..bytes.len().min(1024)].windows(5).any(|w| w == b"%PDF-")
}

/// Read the file at `path`, refusing it before reading when it is empty, a
/// folder, or larger than `limits.max_bytes`.
///
/// The size comes from the open handle, not from a stat of the path: the
/// handle is the access the user's open already granted, and nothing of the
/// parent folder is touched (see `security::validate_existing_file`).
pub fn read_within_limits(path: &str, limits: &OpenLimits) -> Result<Vec<u8>, OpenError> {
    let scrub = |e: OpenError| e.scrubbed(path);
    // Before any open or read: a folder is not a PDF on every platform.
    if is_folder(path) {
        return Err(OpenError::new(OpenErrorCode::NotPdf, "the path is a folder"));
    }
    let mut file = std::fs::File::open(path).map_err(|e| scrub(classify_io_error_at(path, &e)))?;
    let meta = file.metadata().map_err(|e| scrub(classify_io_error(&e)))?;
    if meta.is_dir() {
        return Err(OpenError::new(OpenErrorCode::NotPdf, "the path is a folder"));
    }
    if meta.len() == 0 {
        return Err(OpenError::new(OpenErrorCode::Empty, "the file is 0 bytes"));
    }
    if meta.len() > limits.max_bytes {
        return Err(OpenError::new(
            OpenErrorCode::TooLarge,
            format!("the file is {} bytes; the limit is {}", meta.len(), limits.max_bytes),
        ));
    }
    let mut bytes = Vec::with_capacity(usize::try_from(meta.len()).unwrap_or(0));
    file.read_to_end(&mut bytes).map_err(|e| scrub(classify_io_error(&e)))?;
    Ok(bytes)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_header_may_follow_leading_junk_but_not_by_more_than_1024_bytes() {
        assert!(has_pdf_header(b"%PDF-1.7\n"));
        let mut late = vec![b' '; 1000];
        late.extend_from_slice(b"%PDF-1.4");
        assert!(has_pdf_header(&late));
        let mut too_late = vec![b' '; 1100];
        too_late.extend_from_slice(b"%PDF-1.4");
        assert!(!has_pdf_header(&too_late));
        assert!(!has_pdf_header(b""));
    }

    #[test]
    fn the_engine_s_decryption_causes_map_to_their_codes() {
        use pdf_engine::EngineError::{Encrypted, InvalidPdf};
        let pdf = b"%PDF-1.7\n";
        let code = |e: pdf_engine::EngineError, pw: bool| classify_engine_error(&e, pw, pdf).code;
        assert_eq!(code(Encrypted("PasswordProtected".into()), false), OpenErrorCode::EncryptedNeedsPassword);
        assert_eq!(code(Encrypted("PasswordProtected".into()), true), OpenErrorCode::WrongPassword);
        assert_eq!(code(Encrypted("UnsupportedAlgorithm".into()), false), OpenErrorCode::UnsupportedEncryption);
        assert_eq!(code(Encrypted("InvalidEncryption".into()), false), OpenErrorCode::Corrupt);
        assert_eq!(code(InvalidPdf("TooLarge(9, 9)".into()), false), OpenErrorCode::TooLarge);
        assert_eq!(code(InvalidPdf("Invalid".into()), false), OpenErrorCode::Corrupt);
        assert_eq!(
            classify_engine_error(&InvalidPdf("Invalid".into()), false, b"GIF89a").code,
            OpenErrorCode::NotPdf
        );
    }

    #[test]
    fn the_editing_parser_s_failures_map_to_their_codes() {
        use lopdf::encryption::DecryptionError as D;
        assert_eq!(classify_lopdf_error(&lopdf::Error::InvalidPassword).code, OpenErrorCode::WrongPassword);
        assert_eq!(
            classify_lopdf_error(&lopdf::Error::Decryption(D::UnsupportedEncryption)).code,
            OpenErrorCode::UnsupportedEncryption
        );
        assert_eq!(classify_lopdf_error(&lopdf::Error::MissingXrefEntry).code, OpenErrorCode::Corrupt);
    }

    #[test]
    fn a_refused_path_is_not_pdf_only_when_the_extension_is_wrong() {
        assert_eq!(
            classify_path_refusal("/u/report.docx", "Unsupported file extension".into()).code,
            OpenErrorCode::NotPdf
        );
        assert_eq!(classify_path_refusal("/u/noext", "no ext".into()).code, OpenErrorCode::NotPdf);
        assert_eq!(classify_path_refusal("u/rel.pdf", "relative".into()).code, OpenErrorCode::Unknown);
    }

    #[test]
    fn a_folder_is_not_pdf_even_when_the_os_says_access_denied() {
        // Windows reports File::open on a folder as PermissionDenied.
        let dir = std::env::temp_dir().join(format!("pdfluent-open-error-dir-{}.pdf", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        let path = dir.to_str().unwrap();
        let denied = std::io::Error::from(ErrorKind::PermissionDenied);
        assert_eq!(classify_io_error_at(path, &denied).code, OpenErrorCode::NotPdf);
        assert_eq!(read_within_limits(path, &OpenLimits::default()).unwrap_err().code, OpenErrorCode::NotPdf);

        // A real file the user may not read stays IoDenied.
        let file = dir.join("locked.bin");
        std::fs::write(&file, b"x").unwrap();
        assert_eq!(classify_io_error_at(file.to_str().unwrap(), &denied).code, OpenErrorCode::IoDenied);
        // So does a path that does not exist.
        let gone = dir.join("gone.pdf");
        assert_eq!(classify_io_error_at(gone.to_str().unwrap(), &denied).code, OpenErrorCode::IoDenied);
        std::fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn scrubbing_removes_the_path_from_the_detail() {
        let e = OpenError::new(OpenErrorCode::Unknown, "could not read /Users/x/secret.pdf: busy")
            .scrubbed("/Users/x/secret.pdf");
        assert_eq!(e.detail, "could not read <file>: busy");
    }
}
