# SPDX-License-Identifier: AGPL-3.0-or-later

# Compliance

This folder contains compliance policy files used by CI and local checks.

## Files

- `policy.json` — policy baseline for allowed/blocked licenses and manual review stance.

## Generated deliverables

These files are generated in the repository root:

- `THIRD_PARTY.md`
- `THIRD_PARTY_ATTRIBUTIONS.md`
- `compliance-report.json`

Generate and validate:

```bash
npm run ocr:manifest
npm run compliance:generate
npm run compliance:check
```
