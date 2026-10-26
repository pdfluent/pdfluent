// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary. The PDFluent application is free to use,
// including for commercial purposes. Redistribution, or extraction or reuse
// of its components (including the embedded PDF engine), requires a licence.
// See https://pdfluent.com/license for terms.

//! Print a PDF file through PDFKit with the system print panel (J-34).
//!
//! `PDFDocument printOperationForPrintInfo:scalingMode:autoRotate:` is how a
//! macOS app prints a PDF: the pages go to the printer as the PDF they are,
//! vector and all, and the user gets the standard panel with its preview.
//! It needs no entitlement beyond read access to the file, so it works in the
//! App Sandbox build too. The class is looked up at run time so this crate
//! needs no PDFKit bindings; the framework is linked below.

#[cfg(target_os = "macos")]
mod imp {
    use objc2_06::rc::{Allocated, Retained};
    use objc2_06::runtime::{AnyClass, AnyObject, Bool};
    use objc2_06::{msg_send, MainThreadMarker};
    use objc2_app_kit_03::{NSPrintInfo, NSPrintOperation};
    use objc2_foundation_03::{NSString, NSURL};

    #[link(name = "PDFKit", kind = "framework")]
    extern "C" {}

    /// `kPDFPrintPageScaleDownToFit`: shrink pages larger than the paper,
    /// never enlarge.
    const SCALE_DOWN_TO_FIT: isize = 2;

    pub fn print_pdf(path: &str) -> Result<bool, String> {
        let _main = MainThreadMarker::new().ok_or("printing must run on the main thread")?;
        let class = AnyClass::get(c"PDFDocument").ok_or("PDFKit is not available")?;
        let url = NSURL::fileURLWithPath(&NSString::from_str(path));
        // SAFETY: `PDFDocument` is an NSObject subclass; `alloc` +
        // `initWithURL:` is its designated initialiser and returns nil for a
        // file it cannot read, which the Option carries.
        let document: Option<Retained<AnyObject>> = unsafe {
            let allocated: Allocated<AnyObject> = msg_send![class, alloc];
            msg_send![allocated, initWithURL: &*url]
        };
        let document = document.ok_or("PDFKit could not read the print copy")?;
        let info = NSPrintInfo::sharedPrintInfo();
        // SAFETY: the selector exists on PDFDocument since macOS 10.4 and
        // returns an autoreleased NSPrintOperation or nil.
        let operation: Option<Retained<NSPrintOperation>> = unsafe {
            msg_send![
                &*document,
                printOperationForPrintInfo: &*info,
                scalingMode: SCALE_DOWN_TO_FIT,
                autoRotate: Bool::YES
            ]
        };
        let operation = operation.ok_or("PDFKit could not prepare the print operation")?;
        operation.setShowsPrintPanel(true);
        operation.setShowsProgressPanel(true);
        Ok(operation.runOperation())
    }
}

/// Show the system print panel for the PDF at `path`. Must be called on the
/// main thread; blocks until the panel closes. `Ok(true)` when the user
/// printed, `Ok(false)` when they cancelled.
#[cfg(target_os = "macos")]
pub fn print_pdf(path: &str) -> Result<bool, String> {
    imp::print_pdf(path)
}

#[cfg(not(target_os = "macos"))]
pub fn print_pdf(_path: &str) -> Result<bool, String> {
    Err("PDFKit printing is only available on macOS".to_string())
}
