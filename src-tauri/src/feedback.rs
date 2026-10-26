// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary. The PDFluent application is free to use,
// including for commercial purposes. Redistribution, or extraction or reuse
// of its components (including the embedded PDF engine), requires a licence.
// See https://pdfluent.com/license for terms.

//! The one document a feedback report may carry: the one that is open.
//!
//! The feedback form offers to share "this document" and nothing else. So the
//! backend, not the webview, decides which file that is: the frontend asks for
//! the open document and gets either its name and size (for the consent
//! prompt, shown locally and never sent) or its bytes (only after that prompt
//! was confirmed). There is no path argument, so a compromised or careless
//! frontend cannot use this to read any other file on the machine.

use std::path::Path;

/// The largest document a report may carry. Mirrors `LIMITS.attachmentBytes`
/// in infra/report-worker/src/feedback.js; the Worker refuses anything larger.
pub const MAX_ATTACHMENT_BYTES: u64 = 20 * 1024 * 1024;

/// What the consent prompt shows. `name` stays on the machine.
#[derive(Debug, Clone, PartialEq, Eq, serde::Serialize)]
pub struct FeedbackDocumentInfo {
    pub name: String,
    pub size: u64,
    /// False when the file is larger than a report may carry; the form then
    /// says so instead of offering a box that cannot work.
    pub shareable: bool,
}

/// Name and size of the open document, or `None` when nothing is open.
pub fn document_info(current: Option<&str>) -> Result<Option<FeedbackDocumentInfo>, String> {
    let Some(path) = current else { return Ok(None) };
    let meta = std::fs::metadata(path).map_err(|e| format!("feedback.document_unreadable: {e}"))?;
    let name = Path::new(path)
        .file_name()
        .map(|n| n.to_string_lossy().into_owned())
        .ok_or_else(|| "feedback.document_unreadable: path has no file name".to_string())?;
    Ok(Some(FeedbackDocumentInfo {
        name,
        size: meta.len(),
        shareable: meta.len() > 0 && meta.len() <= MAX_ATTACHMENT_BYTES,
    }))
}

/// The bytes of the open document as it is on disk, within the size limit.
pub fn document_bytes(current: Option<&str>) -> Result<Vec<u8>, String> {
    let Some(path) = current else {
        return Err("feedback.no_document".to_string());
    };
    let len = std::fs::metadata(path)
        .map_err(|e| format!("feedback.document_unreadable: {e}"))?
        .len();
    if len == 0 || len > MAX_ATTACHMENT_BYTES {
        return Err("feedback.document_too_large".to_string());
    }
    std::fs::read(path).map_err(|e| format!("feedback.document_unreadable: {e}"))
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Write;

    /// A fresh directory under the system temp dir. Removed by the test that
    /// made it; a leftover on a crash is harmless and uniquely named.
    fn temp_dir(tag: &str) -> std::path::PathBuf {
        let nanos = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|d| d.as_nanos())
            .unwrap_or_default();
        let dir = std::env::temp_dir().join(format!("pdfluent-feedback-{tag}-{}-{nanos}", std::process::id()));
        std::fs::create_dir_all(&dir).expect("temp dir");
        dir
    }

    fn temp_pdf(tag: &str, bytes: &[u8]) -> (std::path::PathBuf, String) {
        let dir = temp_dir(tag);
        let path = dir.join("quarterly report.pdf");
        std::fs::File::create(&path)
            .and_then(|mut f| f.write_all(bytes))
            .expect("write");
        let s = path.to_string_lossy().into_owned();
        (dir, s)
    }

    #[test]
    fn nothing_open_means_nothing_to_share() {
        assert_eq!(document_info(None).unwrap(), None);
        assert_eq!(document_bytes(None).unwrap_err(), "feedback.no_document");
    }

    #[test]
    fn the_open_document_is_described_and_read() {
        let (dir, path) = temp_pdf("read", b"%PDF-1.7\n%%EOF\n");
        let info = document_info(Some(&path)).unwrap().unwrap();
        assert_eq!(info.name, "quarterly report.pdf");
        assert_eq!(info.size, 15);
        assert!(info.shareable);
        assert_eq!(document_bytes(Some(&path)).unwrap(), b"%PDF-1.7\n%%EOF\n");
        let _ = std::fs::remove_dir_all(dir);
    }

    #[test]
    fn an_empty_file_is_not_offered() {
        let (dir, path) = temp_pdf("empty", b"");
        assert!(!document_info(Some(&path)).unwrap().unwrap().shareable);
        assert_eq!(document_bytes(Some(&path)).unwrap_err(), "feedback.document_too_large");
        let _ = std::fs::remove_dir_all(dir);
    }

    #[test]
    fn a_file_over_the_limit_is_refused() {
        let dir = temp_dir("big");
        let path = dir.join("big.pdf");
        let f = std::fs::File::create(&path).expect("create");
        f.set_len(MAX_ATTACHMENT_BYTES + 1).expect("set_len");
        let p = path.to_string_lossy().into_owned();
        assert!(!document_info(Some(&p)).unwrap().unwrap().shareable);
        assert_eq!(document_bytes(Some(&p)).unwrap_err(), "feedback.document_too_large");
        let _ = std::fs::remove_dir_all(dir);
    }
}
