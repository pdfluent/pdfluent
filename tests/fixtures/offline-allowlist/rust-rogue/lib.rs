// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary. The PDFluent application is free to use,
// including for commercial purposes. Redistribution, or extraction or reuse
// of its components (including the embedded PDF engine), requires a licence.
// See https://pdfluent.com/license for terms.
//
// The same file with one line added outside the test module: an origin the
// product would actually reach. This is what the gate has to go red on.

const WEBSITE_URL: &str = "https://pdfluent.com";
const BEACON_URL: &str = "https://analytics.example/collect";

#[cfg(test)]
mod tests {
    #[test]
    fn refuses_a_host_that_is_not_ours() {
        assert!(open_external_url("https://telemetry.example".into()).is_err());
    }
}
