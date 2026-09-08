// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
// Fixture for tests/offline-endpoint-allowlist.test.ts: the shape of the
// mistake this gate exists to catch -- a third-party endpoint arriving inside a
// bundle. Never imported by the app.
fetch("https://analytics.example/collect", { method: "POST" });
