# Contributing to PDFluent

Thanks for your interest in contributing to PDFluent. Here's how to get started.

## Getting started

1. Fork the repository
2. Clone your fork
3. Create a branch for your change
4. Make your changes
5. Run tests: `cargo test` (Rust) and `npm test` (frontend)
6. Open a pull request

## Development setup

PDFluent uses Tauri v2 with a React + TypeScript frontend and a Rust backend.

**Prerequisites:**
- Rust (stable)
- Node.js 20+
- Platform-specific Tauri dependencies (see [Tauri prerequisites](https://v2.tauri.app/start/prerequisites/))

**Run locally:**
```bash
npm install
npm run tauri dev
```

The PDF engine is the PDFluent SDK, linked via Cargo path dependencies (see
`src-tauri/Cargo.toml`). The SDK workspace is licensed separately and isn't
included in this repository, so a full build requires access to it. See
[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for how the pieces fit together.

## Code style

- Rust: follow `cargo clippy` suggestions
- TypeScript: ESLint config in the repo
- Commits: use conventional commits (`feat:`, `fix:`, `docs:`, etc.)

## Pull requests

- Keep PRs focused on a single change
- Include tests where applicable
- Update documentation if you change user-facing behavior
- All source files must include the license header:
  ```
  // Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
  //
  // This software is proprietary. The PDFluent application is free to use,
  // including for commercial purposes. Redistribution, or extraction or reuse
  // of its components (including the embedded PDF engine), requires a licence.
  // See https://pdfluent.com/license for terms.
  ```

## Reporting bugs

Open an issue on GitHub with:
- Steps to reproduce
- Expected behavior
- Actual behavior
- OS and PDFluent version

## Community channels

- GitHub Discussions: https://github.com/pdfluent/pdfluent/discussions
- Discord: https://discord.gg/pdfluent

If you are new to the codebase, start with issues labeled **good first issue**.

## License

PDFluent is source-available, proprietary software, not an open-source project.
See [LICENSE.md](LICENSE.md) for the End-User License Agreement. Contributions
are accepted only under a separate written agreement. Contact
license@pdfluent.com before submitting a contribution.
