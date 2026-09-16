// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary. The PDFluent application is free to use,
// including for commercial purposes. Redistribution, or extraction or reuse
// of its components (including the embedded PDF engine), requires a licence.
// See https://pdfluent.com/license for terms.
//
// A backend source file whose only origins are declared ones, plus a test
// module that names hosts the product must refuse. A refusal is the opposite
// of a request, and a scan that cannot tell them apart forces the allow-list
// to declare the very addresses the code exists to reject.

const WEBSITE_URL: &str = "https://pdfluent.com";

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn refuses_a_host_that_is_not_ours() {
        assert!(open_external_url("https://telemetry.example".into()).is_err());
        assert!(open_external_url("http://pdfluent.com".into()).is_err());
    }
}
