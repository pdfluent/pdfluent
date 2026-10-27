// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary. The PDFluent application is free to use,
// including for commercial purposes. Redistribution, or extraction or reuse
// of its components (including the embedded PDF engine), requires a licence.
// See https://pdfluent.com/license for terms.

// Publishing the Mac build of a release must not take the Windows download off
// the website. On 27-10-2026 publishing macOS 1.1.2 started a fresh platform set
// and dropped the Windows 1.1.1 installer from releases/manifest.json; it was put
// back by hand. This pins the merge rule.

import { describe, expect, it } from 'vitest';
// @ts-expect-error plain ESM script without types
import { mergePlatform } from '../scripts/lib/release-manifest.mjs';

type Entry = { url: string; filename: string; size: number; arch: string; label: string; ext: string; version?: string };
const entry = (arch: string, version: string, filename: string): Entry => ({
  url: `https://pdfluent.com/releases/${version}/${filename}`, filename, size: 1, arch, label: arch, ext: filename.split('.').pop() ?? '',
});
const win111 = entry('windows-x86_64', '1.1.1', 'PDFluent_1.1.1_x64_en-US.msi');
const mac111 = entry('darwin-aarch64', '1.1.1', 'PDFluent_1.1.1_universal.dmg');
const base = () => ({ version: '1.1.1', pub_date: 'x', platforms: { 'darwin-aarch64': { ...mac111 }, 'windows-x86_64': { ...win111 } } });

describe('releases/manifest.json merge', () => {
  it('a newer Mac build keeps the Windows installer it had, marked with its own version', () => {
    const m = mergePlatform(base(), '1.1.2', 'darwin-aarch64', entry('darwin-aarch64', '1.1.2', 'PDFluent_1.1.2_universal.dmg'));
    expect(m.version).toBe('1.1.2');
    expect(m.platforms['darwin-aarch64'].filename).toBe('PDFluent_1.1.2_universal.dmg');
    expect(m.platforms['darwin-aarch64'].version).toBeUndefined();
    expect(m.platforms['windows-x86_64'].filename).toBe('PDFluent_1.1.1_x64_en-US.msi');
    expect(m.platforms['windows-x86_64'].url).toContain('/1.1.1/');
    expect(m.platforms['windows-x86_64'].version).toBe('1.1.1');
  });
  it('when Windows follows, its entry becomes current and loses the older-version mark', () => {
    const afterMac = mergePlatform(base(), '1.1.2', 'darwin-aarch64', entry('darwin-aarch64', '1.1.2', 'PDFluent_1.1.2_universal.dmg'));
    const m = mergePlatform(afterMac, '1.1.2', 'windows-x86_64', entry('windows-x86_64', '1.1.2', 'PDFluent_1.1.2_x64_en-US.msi'));
    expect(Object.keys(m.platforms).sort()).toEqual(['darwin-aarch64', 'windows-x86_64']);
    expect(m.platforms['windows-x86_64'].filename).toBe('PDFluent_1.1.2_x64_en-US.msi');
    expect(m.platforms['windows-x86_64'].version).toBeUndefined();
  });
  it('an older version is refused and changes nothing', () => {
    const warnings: string[] = [];
    const m = mergePlatform(base(), '1.1.0', 'darwin-aarch64', entry('darwin-aarch64', '1.1.0', 'old.dmg'), (w: string) => warnings.push(w));
    expect(m.version).toBe('1.1.1');
    expect(m.platforms['darwin-aarch64'].filename).toBe('PDFluent_1.1.1_universal.dmg');
    expect(warnings.join()).toContain('refusing');
  });
  it('an empty manifest starts with the platform being published', () => {
    const m = mergePlatform(null, '1.1.2', 'darwin-aarch64', entry('darwin-aarch64', '1.1.2', 'a.dmg'));
    expect(Object.keys(m.platforms)).toEqual(['darwin-aarch64']);
  });
});
