// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary. The PDFluent application is free to use,
// including for commercial purposes. Redistribution, or extraction or reuse
// of its components (including the embedded PDF engine), requires a licence.
// See https://pdfluent.com/license for terms.

/**
 * product/editor-features.json is the one place the editor's promises are
 * written down; `features.mjs --check` decides whether a version of it may
 * land. Every case runs on a fixture built here, in both directions: the
 * guard must refuse the broken file and accept the sound one, or a guard that
 * refuses everything would pass these tests too.
 */

import { describe, it, expect } from 'vitest';
import { checkFeatures, parseRegister } from '../scripts/quality/features.mjs';

type Test = { id: string; kind: string; platforms: string[] };
type Feature = {
  id: string;
  group: string;
  journeys: string[];
  register: string[];
  tests: Test[];
  status: string;
  owner_stream?: string;
  limits: string[];
  copy: { name: string | null; site: string | null; store_bullet: string | null; claims: string[] };
  since: string | null;
  [extra: string]: unknown;
};
type Doc = { schema: number; groups: { id: string; title: string }[]; pending_proof_ceiling: string[]; features: Feature[] };

const BOTH = ['macos-arm64', 'windows-x64'];
const rust = (id: string, platforms: string[] = BOTH): Test => ({ id, kind: 'rust', platforms });

function feature(over: Partial<Feature> = {}): Feature {
  return {
    id: 'merge-pdfs',
    group: 'pages',
    journeys: ['J-74'],
    register: ['panels:merge'],
    tests: [rust('pdfluent_lib::pdf_engine::tests::op_merge_pdfs_combines_page_counts')],
    status: 'promised',
    limits: [],
    copy: { name: 'Merge PDFs', site: 'Combine several PDFs into one file.', store_bullet: null, claims: [] },
    since: '1.0.0',
    ...over,
  };
}

function doc(features: Feature[], ceiling?: string[]): Doc {
  return {
    schema: 2,
    groups: [{ id: 'pages', title: 'Put the document together' }],
    pending_proof_ceiling: ceiling ?? features.filter((f) => f.status === 'pending-proof').map((f) => f.id),
    features,
  };
}

const REGISTER_MD = [
  '## Right-hand panels',
  '',
  '| affordance | state | reaches | seen at | proven by |',
  '|---|---|---|---|---|',
  '| `merge` | `wired` | `merge_pdfs` | `src/x.tsx:1` | — |',
  '',
  '## All-tools tiles',
  '',
  '| affordance | state | reaches | seen at | proven by |',
  '|---|---|---|---|---|',
  '| `toolbar.stamp` | `NO ACTION` | — | `src/x.tsx:2` | — |',
].join('\n');

const CTX = {
  journeys: ['J-74', 'J-53', 'J-79'],
  register: parseRegister(REGISTER_MD),
  exclusions: { win32: { 'tests/only-posix.test.ts': 'POSIX shell' } },
};

const pending = (id: string, over: Partial<Feature> = {}): Feature =>
  feature({ id, status: 'pending-proof', owner_stream: 'A', tests: [], register: [], ...over });

describe('features --check: a sound file passes', () => {
  it('accepts a promised feature proven by a Rust test on both shipping platforms', () => {
    expect(checkFeatures(doc([feature()]), CTX)).toEqual([]);
  });

  it('accepts a not-offered feature with no journey, no test and a denial sentence', () => {
    const denied = feature({ id: 'automation', status: 'not-offered', journeys: [], register: [], tests: [], since: null });
    expect(checkFeatures(doc([denied]), CTX)).toEqual([]);
  });

  it('reads the register sections by the prefixes the site uses', () => {
    expect(parseRegister(REGISTER_MD)).toEqual({ 'panels:merge': 'wired', 'tiles:toolbar.stamp': 'NO ACTION' });
  });
});

describe('features --check: a promise needs proof on macOS and Windows', () => {
  it('refuses a promised feature with no test on windows-x64', () => {
    const problems = checkFeatures(doc([feature({ tests: [rust('x::y', ['macos-arm64'])] })]), CTX);
    expect(problems.join('\n')).toMatch(/"merge-pdfs": is promised with no test on windows-x64/);
  });

  it('refuses a promised feature whose only test is a playwright-mock test', () => {
    const problems = checkFeatures(doc([feature({ tests: [{ id: 'tests/e2e/x.spec.ts', kind: 'playwright-mock', platforms: BOTH }] })]), CTX);
    expect(problems.join('\n')).toMatch(/no test on macos-arm64 that runs the real code/);
  });

  it('refuses a test on a platform where its file is excluded', () => {
    const t: Test = { id: 'tests/only-posix.test.ts', kind: 'unit-behaviour', platforms: BOTH };
    const problems = checkFeatures(doc([feature({ tests: [rust('a::b'), t] })]), CTX);
    expect(problems.join('\n')).toMatch(/claims windows-x64, and tests\/platform-exclusions\.json leaves tests\/only-posix\.test\.ts out/);
  });

  it('refuses a promised feature that points at a control that does nothing', () => {
    const problems = checkFeatures(doc([feature({ register: ['tiles:toolbar.stamp'] })]), CTX);
    expect(problems.join('\n')).toMatch(/"tiles:toolbar\.stamp", which is `NO ACTION`/);
  });

  it('lets a pending-proof feature point at a control that does nothing yet', () => {
    const problems = checkFeatures(doc([pending('stamp', { journeys: ['J-53'], register: ['tiles:toolbar.stamp'] })]), CTX);
    expect(problems).toEqual([]);
  });
});

describe('features --check: references exist', () => {
  it('refuses a journey that is not in the catalogue', () => {
    const problems = checkFeatures(doc([feature({ journeys: ['J-99'] })]), CTX);
    expect(problems.join('\n')).toMatch(/journey "J-99" is not in product\/journeys\.json/);
  });

  it('refuses a register reference that is not in the register', () => {
    const problems = checkFeatures(doc([feature({ register: ['panels:mergee'] })]), CTX);
    expect(problems.join('\n')).toMatch(/register reference "panels:mergee" is not in docs\/UI_REGISTER\.md/);
  });

  it('refuses an unknown key, so a misspelt status field cannot hide', () => {
    const problems = checkFeatures(doc([feature({ staus: 'promised' })]), CTX);
    expect(problems.join('\n')).toMatch(/unknown key "staus"/);
  });

  it('refuses linux-x64: the editor promises nothing on Linux', () => {
    const problems = checkFeatures(doc([feature({ tests: [rust('a::b', [...BOTH, 'linux-x64'])] })]), CTX);
    expect(problems.join('\n')).toMatch(/platform "linux-x64" is not one of macos-arm64, windows-x64/);
  });

  it('refuses a duplicate id', () => {
    const problems = checkFeatures(doc([feature(), feature()]), CTX);
    expect(problems.join('\n')).toMatch(/id appears twice/);
  });
});

describe('features --check: a number in public copy carries a claim', () => {
  it('refuses a digit in copy.site without a CLAIMS.md id', () => {
    const f = feature({ copy: { name: 'Languages', site: 'Available in 27 languages.', store_bullet: null, claims: [] } });
    expect(checkFeatures(doc([f]), CTX).join('\n')).toMatch(/copy\.site contains a number/);
  });

  it('refuses a digit in a limit without a CLAIMS.md id', () => {
    const f = feature({ limits: ['Up to 500 pages.'] });
    expect(checkFeatures(doc([f]), CTX).join('\n')).toMatch(/limits\[0\] contains a number/);
  });

  it('accepts the same digit with an id, and refuses an id of the wrong shape', () => {
    const ok = feature({ copy: { name: 'Languages', site: 'Available in 27 languages.', store_bullet: null, claims: ['B26'] } });
    expect(checkFeatures(doc([ok]), CTX)).toEqual([]);
    const bad = feature({ copy: { name: 'Languages', site: 'Available in 27 languages.', store_bullet: null, claims: ['b26'] } });
    expect(checkFeatures(doc([bad]), CTX).join('\n')).toMatch(/"b26" is not a CLAIMS\.md id/);
  });
});

describe('features --check: the pending-proof ratchet only shrinks', () => {
  it('accepts pending-proof features that are all in the ceiling', () => {
    expect(checkFeatures(doc([feature(), pending('ocr')]), CTX)).toEqual([]);
  });

  it('refuses a feature that enters pending-proof outside the ceiling', () => {
    const problems = checkFeatures(doc([feature(), pending('ocr')], []), CTX);
    expect(problems.join('\n')).toMatch(/"ocr" is pending-proof and not in pending_proof_ceiling/);
  });

  it('refuses a promised feature that falls back to pending-proof', () => {
    // merge-pdfs was promised; the ceiling at seeding did not hold it.
    const problems = checkFeatures(doc([pending('merge-pdfs'), pending('ocr')], ['ocr']), CTX);
    expect(problems.join('\n')).toMatch(/"merge-pdfs" is pending-proof and not in pending_proof_ceiling/);
  });

  it('refuses a ceiling that did not shrink when a feature was proven', () => {
    const problems = checkFeatures(doc([feature({ id: 'ocr' })], ['ocr']), CTX);
    expect(problems.join('\n')).toMatch(/"ocr" is in pending_proof_ceiling and no longer pending-proof/);
  });

  it('refuses a ceiling that grew against the base, even when it matches the file', () => {
    const base = doc([pending('ocr')]);
    const problems = checkFeatures(doc([pending('ocr'), pending('stamp', { journeys: ['J-53'] })]), { ...CTX, base });
    expect(problems.join('\n')).toMatch(/"stamp" was added to pending_proof_ceiling/);
  });

  it('accepts a ceiling that shrank against the base', () => {
    const base = doc([pending('ocr'), pending('stamp', { journeys: ['J-53'] })]);
    expect(checkFeatures(doc([pending('ocr'), feature({ id: 'stamp', journeys: ['J-53'] })], ['ocr']), { ...CTX, base })).toEqual([]);
  });

  it('refuses a pending-proof feature that names no stream to make it true', () => {
    const problems = checkFeatures(doc([pending('ocr', { owner_stream: undefined })]), CTX);
    expect(problems.join('\n')).toMatch(/"ocr": is pending-proof and names no owner_stream/);
  });

  it('refuses a ceiling entry that is not a feature', () => {
    const problems = checkFeatures(doc([feature()], ['ghost']), CTX);
    expect(problems.join('\n')).toMatch(/names "ghost", which is not a feature/);
  });
});

describe('features --check: docs/JOURNEY_TESTS.json in the e2e stream\'s shape', () => {
  const entry = (over: object = {}) => ({ title: 'Merge', priority: 'P1', spec: 'tests/journeys/J-74-merge.e2e.ts', platforms: BOTH, gaps: [], ...over });

  it('accepts a journey with a spec, a journey without one, and a gap with an owner', () => {
    const journeyTests = {
      schema: 1,
      platforms: { 'macos-arm64': 'journeys:macos', 'windows-x64': 'journeys:windows' },
      journeys: { 'J-74': entry(), 'J-53': entry({ spec: null, gaps: [{ id: 'no-stamp', owner: 'stream-B', reason: 'x' }] }) },
    };
    expect(checkFeatures(doc([feature()]), { ...CTX, journeyTests })).toEqual([]);
  });

  it('refuses an unknown journey, a Linux platform, a gap without an owner and a list in place of an entry', () => {
    const journeyTests = {
      schema: 1,
      journeys: {
        'J-98': entry(),
        'J-74': entry({ platforms: ['linux-x64'], gaps: [{ id: 'x' }] }),
        'J-53': [{ test: 'old shape' }],
      },
    };
    const text = checkFeatures(doc([feature()]), { ...CTX, journeyTests }).join('\n');
    expect(text).toMatch(/"J-98" is not in product\/journeys\.json/);
    expect(text).toMatch(/"J-74" needs platforms from macos-arm64, windows-x64/);
    expect(text).toMatch(/"J-74" has a gap without an id or an owner/);
    expect(text).toMatch(/"J-53" must be an object with spec, platforms and gaps/);
  });
});
