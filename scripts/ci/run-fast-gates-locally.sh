#!/usr/bin/env bash
# Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
#
# This software is proprietary. The PDFluent application is free to use,
# including for commercial purposes. Redistribution, or extraction or reuse
# of its components (including the embedded PDF engine), requires a licence.
# See https://pdfluent.com/license for terms.
#
# The checks that gate the rest of a Quality round, run on this checkout.
#
# quality-gates-fast, quality:ui-register, quality:i18n-parity,
# quality:no-silent-failures and quality:offline-allowlist are cheap, and when
# one of them is red the Linux jobs behind it are skipped and the Windows and
# macOS queue slot of that round is spent on nothing. Run this before every
# push to release/editor-next; push only when it prints "all fast gates pass".
#
#   scripts/ci/run-fast-gates-locally.sh            # everything, vitest included (~8 min)
#   scripts/ci/run-fast-gates-locally.sh --quick    # without the full vitest run and without clippy
#
#   scripts/ci/run-fast-gates-locally.sh --verify   # was the last full pass on exactly this tree?
#
# A pass writes a stamp of the working tree (every tracked and untracked file
# that is not ignored). .githooks/pre-push runs --verify when release/editor-next
# is pushed: an edit made after the last pass, such as a one-line fix to a Rust
# file, turns the push down. That is how round 15 went red in two Linux gates
# although this script had printed "all fast gates pass".
#
# It stops at the first red step and names it. It does not install anything
# (run `npm ci` first when node_modules is missing) and never pushes.
set -u
cd "$(dirname "$0")/../.."

# On an Apple Silicon Mac a bash started under Rosetta makes node an x64 process,
# and the native rollup package of the arm64 install is not found. Run as arm64.
if [ "$(uname -s)" = Darwin ] && [ "$(uname -m)" = x86_64 ] && [ "$(sysctl -n hw.optional.arm64 2>/dev/null)" = 1 ]; then
  exec arch -arm64 /bin/bash "$0" "$@"
fi

quick=0
[ "${1:-}" = "--quick" ] && quick=1

tree_stamp() { git ls-files -co --exclude-standard -z | sort -z | xargs -0 shasum | shasum | cut -d' ' -f1; }
stamp_file="$(git rev-parse --git-path fast-gates-passed)"
if [ "${1:-}" = "--verify" ]; then
  if [ "$(cat "$stamp_file" 2>/dev/null)" = "$(tree_stamp)" ]; then echo "fast gates: passed on exactly this tree"; exit 0; fi
  echo "fast gates: the tree changed since the last full pass (or none ran). Run scripts/ci/run-fast-gates-locally.sh" >&2
  exit 1
fi

fail() { echo; echo "FAST GATE RED: $1" >&2; exit 1; }
run() {
  local label="$1"; shift
  echo "-- $label"
  "$@" > /tmp/fast-gate.out 2>&1 || { tail -25 /tmp/fast-gate.out >&2; fail "$label"; }
}

[ -d node_modules ] || fail "node_modules is missing: run npm ci"

# quality-gates-fast, in the order of the job.
run "no hosted minutes"               node scripts/ci/no-hosted-ci-on-auto-triggers.mjs
run "rust toolchain pinned"            node scripts/ci/rust-toolchain-pinned.mjs
run "no critical advisory in shipped" node scripts/ci/no-critical-in-shipped-deps.mjs
run "nothing internal goes public"    node scripts/ci/internal-terms.mjs --tree
run "typecheck"                       npm run typecheck
run "typecheck of the journeys"       npx tsc -p tsconfig.journeys.json
run "eslint"                          npx eslint src
base="$(git merge-base origin/release/ga-readiness HEAD 2>/dev/null || echo HEAD~1)"
run "promises and journey gaps"       node scripts/quality/features.mjs --check --base "$base"
run "licensing claims drift-guard"    npx vitest run tests/licensing-claims-guard.test.ts
run "third-party notice generator"    npx vitest run tests/compliance-generator-optional-deps.test.ts
# The clippy job (needs: quality-gates-fast) runs the runners' `stable`, not
# whatever this machine has as its default: a lint added in a newer clippy
# (chunks_exact_to_as_chunks, 1.99) went red in CI while 1.94 here was clean.
# So this runs `stable` too, as the job does. The build goes to the external
# volume; delete that directory when done so the macOS runner's storage guard
# keeps its free space.
if [ "$quick" = 0 ]; then
  clippy_target="${CARGO_TARGET_DIR:-/Volumes/PDFluent-Builds/PDFluent/builds/editor-next-target}"
  command -v rustup >/dev/null 2>&1 || fail "rustup is missing: clippy has to run on the pinned toolchain (rust-toolchain.toml)"
  rustup component add clippy > /tmp/fast-gate.out 2>&1 || { tail -5 /tmp/fast-gate.out >&2; fail "clippy is not installed for the pinned toolchain"; }
  echo "-- clippy on $(cargo clippy --version) (target $clippy_target)"
  CARGO_TARGET_DIR="$clippy_target" cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets -- -D warnings > /tmp/fast-gate.out 2>&1 \
    || { grep -E '^(error|warning)' -A8 /tmp/fast-gate.out | head -40 >&2; fail "clippy (pinned toolchain, -D warnings)"; }
fi
if [ "$quick" = 0 ]; then
  run "the whole vitest suite"        npx vitest run --maxWorkers=3
fi
run "legacy shell fenced"             node scripts/ci/legacy-shell-fenced.mjs
run "production build"                npm run build
run "no personal-data in the bundle"  node scripts/ci/no-pii-in-release.mjs --dist dist

# The sibling jobs.
run "ui register is current"          node scripts/quality/ui-register.mjs --check
run "ui register has no gaps"         node scripts/quality/ui-register.mjs --gate
run "i18n parity"                     node scripts/quality/i18n-parity.mjs --check
run "no silent failures"              node scripts/quality/no-silent-failures.mjs --check
run "offline allow-list"              node scripts/ci/offline-allowlist.mjs --config --tree dist --tree src-tauri/src
run "journey map"                     node scripts/quality/journey-map.mjs

# Only a full run stamps the tree: --quick skips the vitest suite.
if [ "$quick" = 0 ]; then tree_stamp > "$stamp_file"; fi
echo
echo "all fast gates pass"
