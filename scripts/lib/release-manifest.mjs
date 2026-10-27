// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary. The PDFluent application is free to use,
// including for commercial purposes. Redistribution, or extraction or reuse
// of its components (including the embedded PDF engine), requires a licence.
// See https://pdfluent.com/license for terms.

// How a release lands in releases/manifest.json (the website's download source).
// Split out of publish-artifact.mjs so a test can run it.
//
// A platform ships on its own day. When macOS 1.1.2 goes out while Windows is
// still 1.1.1, the manifest must keep offering the Windows 1.1.1 installer: the
// first version of this function started "a fresh platform set" for a newer
// release and dropped every other platform, which removed the Windows download
// button the day the Mac build shipped (27-10-2026). A carried-over entry keeps
// its own URL and gains a `version` so a reader can tell it is older than the
// manifest's.

// ── version compare (handles X.Y.Z and X.Y.Z-pre.N) ────────────────────────
export function parseVer(v) {
  const [core, pre] = String(v).split('-');
  const nums = core.split('.').map(n => parseInt(n, 10) || 0);
  return { nums, pre: pre || '' };
}
/** -1 if a<b, 0 if equal, 1 if a>b. A release (no pre) outranks a prerelease. */
export function cmpVer(a, b) {
  const A = parseVer(a), B = parseVer(b);
  for (let i = 0; i < 3; i++) {
    const d = (A.nums[i] || 0) - (B.nums[i] || 0);
    if (d) return d < 0 ? -1 : 1;
  }
  if (A.pre === B.pre) return 0;
  if (!A.pre) return 1;            // 1.0.0 > 1.0.0-beta.5
  if (!B.pre) return -1;
  // both prereleases: compare dot-separated identifiers numerically where possible
  const ap = A.pre.split('.'), bp = B.pre.split('.');
  for (let i = 0; i < Math.max(ap.length, bp.length); i++) {
    const x = ap[i], y = bp[i];
    if (x === y) continue;
    if (x === undefined) return -1;
    if (y === undefined) return 1;
    const nx = parseInt(x, 10), ny = parseInt(y, 10);
    if (!Number.isNaN(nx) && !Number.isNaN(ny)) return nx < ny ? -1 : 1;
    return x < y ? -1 : 1;
  }
  return 0;
}

// ── manifest merge ──────────────────────────────────────────────────────────
export function mergePlatform(manifest, version, platform, entry, warn = console.warn) {
  let m = manifest;
  if (!m || !m.version) {
    m = { version, pub_date: new Date().toISOString(), platforms: {} };
  } else if (cmpVer(version, m.version) > 0) {
    // Newer release: the manifest moves to this version, and every other
    // platform keeps the installer it had, marked with the version it is.
    const carried = {};
    for (const [name, old] of Object.entries(m.platforms || {})) {
      carried[name] = { ...old, version: old.version || m.version };
    }
    m = { version, pub_date: new Date().toISOString(), platforms: carried };
  } else if (cmpVer(version, m.version) < 0) {
    warn(`! refusing to register ${platform} for older ${version} (manifest is ${m.version}); skipping`);
    return m;
  } else {
    // same version → merge, refresh pub_date
    m.pub_date = new Date().toISOString();
  }
  // The platform being published is current: no carried-over version mark.
  const { version: _carried, ...current } = entry;
  m.platforms[platform] = current;
  return m;
}

