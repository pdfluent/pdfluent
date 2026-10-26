// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary. The PDFluent application is free to use,
// including for commercial purposes. Redistribution, or extraction or reuse
// of its components (including the embedded PDF engine), requires a licence.
// See https://pdfluent.com/license for terms.

//! The picture a person picks to place on a page or to swap for a placed one
//! (J-45). The native open panel is opened from Rust, like every other file
//! pick in the app, so the journey suite can answer it; an `<input type=file>`
//! created in the page cannot be answered by any driver and, detached from
//! the document, may lose its `change` event in WKWebView.

use base64::Engine as _;

/// Largest picture the app reads into memory for a placement.
pub const MAX_IMAGE_BYTES: u64 = 32 * 1024 * 1024;

/// The data URL for a picked picture, judged on its bytes and not on its name:
/// a PNG or a JPEG, and nothing else (those are the two the PDF writer embeds).
pub fn data_url_from_bytes(bytes: &[u8]) -> Result<String, String> {
    let mime = if bytes.starts_with(&[0x89, b'P', b'N', b'G', 0x0D, 0x0A, 0x1A, 0x0A]) {
        "image/png"
    } else if bytes.starts_with(&[0xFF, 0xD8, 0xFF]) {
        "image/jpeg"
    } else {
        return Err("This file is not a PNG or JPEG picture.".to_string());
    };
    Ok(format!(
        "data:{mime};base64,{}",
        base64::engine::general_purpose::STANDARD.encode(bytes)
    ))
}

/// Read the picked file and turn it into a data URL. The size is checked
/// before the read, so a huge file is refused without being loaded.
pub fn read_picture(path: &std::path::Path) -> Result<String, String> {
    let len = std::fs::metadata(path)
        .map_err(|e| format!("The picture could not be read: {e}"))?
        .len();
    if len > MAX_IMAGE_BYTES {
        return Err(format!(
            "This picture is {} MB; the largest the editor places is {} MB.",
            len / (1024 * 1024),
            MAX_IMAGE_BYTES / (1024 * 1024)
        ));
    }
    let bytes = std::fs::read(path).map_err(|e| format!("The picture could not be read: {e}"))?;
    data_url_from_bytes(&bytes)
}

#[cfg(test)]
mod tests {
    use super::*;

    const PNG: &[u8] = &[0x89, b'P', b'N', b'G', 0x0D, 0x0A, 0x1A, 0x0A, 0, 0, 0, 0];

    #[test]
    fn a_png_becomes_a_png_data_url() {
        let url = data_url_from_bytes(PNG).expect("png");
        assert!(url.starts_with("data:image/png;base64,"), "{url}");
    }

    #[test]
    fn a_jpeg_becomes_a_jpeg_data_url() {
        let url = data_url_from_bytes(&[0xFF, 0xD8, 0xFF, 0xE0, 1, 2]).expect("jpeg");
        assert!(url.starts_with("data:image/jpeg;base64,"), "{url}");
    }

    #[test]
    fn a_pdf_named_like_a_picture_is_refused() {
        let err = data_url_from_bytes(b"%PDF-1.7\n").expect_err("not a picture");
        assert!(err.contains("not a PNG or JPEG"), "{err}");
    }

    #[test]
    fn the_data_url_decodes_to_the_picked_bytes() {
        let url = data_url_from_bytes(PNG).expect("png");
        let payload = url.split_once(',').expect("comma").1;
        let back = base64::engine::general_purpose::STANDARD.decode(payload).expect("base64");
        assert_eq!(back, PNG);
    }

    #[test]
    fn a_missing_file_is_an_error_not_a_panic() {
        let err = read_picture(std::path::Path::new("/nonexistent/picture.png")).expect_err("missing");
        assert!(err.contains("could not be read"), "{err}");
    }

    #[test]
    fn a_file_over_the_limit_is_refused_before_it_is_read() {
        let dir = std::env::temp_dir().join(format!("pdfluent-image-pick-{}", std::process::id()));
        std::fs::create_dir_all(&dir).expect("dir");
        let big = dir.join("big.png");
        let f = std::fs::File::create(&big).expect("create");
        f.set_len(MAX_IMAGE_BYTES + 1).expect("sparse file");
        let err = read_picture(&big).expect_err("too large");
        assert!(err.contains("largest the editor places"), "{err}");
    }
}
