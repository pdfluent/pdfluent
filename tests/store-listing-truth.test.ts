// SPDX-License-Identifier: LicenseRef-PDFluent-Proprietary
// Copyright (c) 2026 Innovation Trigger B.V.
//
// Drift-guard for the Microsoft Store dossier.
//
// PDFluent has been live on the Microsoft Store since 2026-07-27. The dossier
// under `store/` was written before that and kept describing a submission that
// had not happened yet: "Nothing here is published", "First release on the
// Microsoft Store", an installer URL from a superseded build. A dossier that
// describes the wrong state is worse than no dossier, because the next release
// is prepared from it.
//
// `store/live-listing.json` is the single record of what is actually live. Every
// factual claim the dossier makes about the listing is checked against it here,
// so the two cannot drift apart silently. The record itself is refreshed against
// the Store by `store/scripts/check-live-listing.sh` (network; a release step,
// not a CI step).

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it, expect } from 'vitest';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const STORE = join(ROOT, 'store');

interface LiveListing {
  storeId: string;
  storeUrl: string;
  publisherDisplayName: string;
  developerName: string;
  listingVersion: string;
  installerVersion: string;
  installerUrl: string;
  installerSha256: string;
  productCode: string;
  packageLastUpdateUtc: string;
  price: string;
  packageType: string;
  checkedAt: string;
}

const live = JSON.parse(
  readFileSync(join(STORE, 'live-listing.json'), 'utf8'),
) as LiveListing;

/** Docs that record a past state on purpose. They may name superseded versions,
 *  but only while they say so in their first lines — otherwise a stale doc is
 *  indistinguishable from a current one. */
const HISTORICAL = [
  'store/BLOCKER-screenshots.md',
  'store/screenshots/screenshot-brief.md',
  'store/screenshots/en/ENGLISH-BLOCKER.md',
  'store/screenshots/en/SCREENSHOTS.md',
];
const HISTORICAL_MARKER = '> **Historical record.**';

function markdownFiles(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const abs = join(dir, name);
    if (statSync(abs).isDirectory()) {
      markdownFiles(abs, out);
    } else if (name.endsWith('.md')) {
      out.push(abs);
    }
  }
  return out;
}

const relPath = (abs: string) => relative(ROOT, abs).split(sep).join('/');
const read = (abs: string) => readFileSync(abs, 'utf8');

describe('Microsoft Store dossier matches the live listing', () => {
  it('records every field a Store update submission needs', () => {
    expect(live.storeId).toMatch(/^[A-Z0-9]{12,14}$/);
    expect(live.storeUrl).toBe(`https://apps.microsoft.com/detail/${live.storeId}`);
    expect(live.installerVersion).toMatch(/^\d+\.\d+\.\d+(-[0-9A-Za-z.]+)?$/);
    expect(live.installerUrl).toContain(live.installerVersion);
    expect(live.installerSha256).toMatch(/^[0-9a-f]{64}$/);
    expect(live.packageLastUpdateUtc).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(live.developerName).toBe('Innovation Trigger B.V.');
  });

  it('names the Store ID and the listing URL in the dossier entry point', () => {
    const readme = read(join(STORE, 'README.md'));
    expect(readme).toContain(live.storeId);
    expect(readme).toContain(live.storeUrl);
  });

  it('names the Store ID and the listing URL in the in-app About copy', () => {
    const menu = read(join(ROOT, 'src-tauri/src/lib.rs'));
    expect(menu).toContain(live.storeId);
    expect(menu).toContain(live.storeUrl);
  });

  it('names the Store update submission in the release runbook', () => {
    const release = read(join(ROOT, 'RELEASE.md'));
    expect(release).toContain(live.storeUrl);
    expect(release.toLowerCase()).toContain('update submission');
  });

  it('quotes the live installer URL and hash, not a superseded build', () => {
    for (const abs of markdownFiles(STORE)) {
      const rel = relPath(abs);
      if (HISTORICAL.includes(rel)) continue;
      const text = read(abs);
      for (const url of text.match(/https:\/\/pdfluent\.com\/releases\/\S*?\.msi/g) ?? []) {
        // `<version>` templates are how the runbook describes the next release;
        // only a concrete URL is a claim about what the Store serves today.
        if (url.includes('<')) continue;
        expect(url, `${rel} quotes a superseded installer URL`).toBe(live.installerUrl);
      }
      for (const hash of text.match(/\b[0-9a-fA-F]{64}\b/g) ?? []) {
        expect(
          hash.toLowerCase(),
          `${rel} quotes a hash that is not the live installer's`,
        ).toBe(live.installerSha256);
      }
    }
  });

  it('names only the live version as the current candidate', () => {
    for (const abs of markdownFiles(STORE)) {
      const rel = relPath(abs);
      if (HISTORICAL.includes(rel)) continue;
      for (const version of read(abs).match(/\d+\.\d+\.\d+-beta\.\d+/g) ?? []) {
        expect(version, `${rel} still names a superseded version`).toBe(live.installerVersion);
      }
    }
  });

  it('marks every doc that records a past state as historical', () => {
    for (const rel of HISTORICAL) {
      expect(read(join(ROOT, rel)), `${rel} is not marked historical`).toContain(
        HISTORICAL_MARKER,
      );
    }
  });

  it('has no first-release copy left in the listing text', () => {
    for (const abs of markdownFiles(join(STORE, 'listing'))) {
      expect(
        read(abs),
        `${relPath(abs)} still offers first-release copy for an app that is live`,
      ).not.toMatch(/first release on the microsoft store/i);
    }
  });

  it('says the app is live, not awaiting submission', () => {
    const readme = read(join(STORE, 'README.md'));
    expect(readme).not.toMatch(/nothing here is published/i);
    expect(readme).not.toMatch(/submission-ready/i);
  });

  it('keeps an update runbook that describes the update loop', () => {
    const runbook = read(join(STORE, 'update-runbook.md'));
    expect(runbook).toContain(live.storeUrl);
    expect(runbook.toLowerCase()).toContain('update submission');
    // The Store hosts a URL, not the bytes: a new release must change the
    // package URL, or the Store keeps serving the old MSI under a new version.
    expect(runbook).toContain('scripts/validate-store-candidate.sh');
  });
});
