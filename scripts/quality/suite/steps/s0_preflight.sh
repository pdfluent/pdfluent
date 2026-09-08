# Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
#
# This software is proprietary. The PDFluent application is free to use,
# including for commercial purposes. Redistribution, or extraction or reuse
# of its components (including the embedded PDF engine), requires a licence.
# See https://pdfluent.com/license for terms.
#
# S0 — preflight. Everything the run assumes, checked before it starts, so an
# assumption that is false comes back as "could not run" with the reason rather
# than as a step that quietly measured nothing.

s0_die() { echo "✘ preflight: $*" >&2; return 1; }

step_s0() {
  local version expected_ver name
  version="$(node -p "require('${REPO_ROOT}/package.json').version")" || return 1

  # 1. Machine class. A number measured on "the Mac" is comparable to nothing.
  [ -n "${MACHINE}" ] || { s0_die "no machine class: pass --machine or set PDFLUENT_MACHINE_CLASS (classes live in quality/MACHINES.toml)"; return 1; }
  grep -q "^\[${MACHINE}\]" "${REPO_ROOT}/quality/MACHINES.toml" \
    || { s0_die "machine class '${MACHINE}' is not in quality/MACHINES.toml"; return 1; }

  # 2. The artefact is there and is the shape this platform publishes.
  [ -f "${ARTEFACT}" ] || { s0_die "artefact not found: ${ARTEFACT}"; return 1; }
  name="$(basename "${ARTEFACT}")"
  case "${PLATFORM}" in
    macos)
      case "${name}" in *.dmg) ;; *) s0_die "macOS publishes a .dmg; got ${name}"; return 1 ;; esac
      expected_ver="$(printf '%s' "${name}" | sed -n 's/^PDFluent_\(.*\)_universal\.dmg$/\1/p')"
      [ -n "${expected_ver}" ] || { s0_die "${name} is not PDFluent_<version>_universal.dmg"; return 1; }
      [ "${expected_ver}" = "${version}" ] || { s0_die "the artefact says ${expected_ver} and this checkout says ${version} — this is not the tree that artefact was built from"; return 1; }
      ;;
    windows)
      case "${name}" in *.msi) ;; *) s0_die "Windows publishes a .msi; got ${name}"; return 1 ;; esac
      expected_ver="$(printf '%s' "${name}" | sed -n 's/^PDFluent_\([0-9][^_]*\)_x64_en-US\.msi$/\1/p')"
      [ -n "${expected_ver}" ] || { s0_die "${name} is not PDFluent_<version>_x64_en-US.msi"; return 1; }
      # Tauri names the MSI by the numeric core; the full string is checked in S2
      # against what the running binary writes into sessions.log.
      case "${version}" in "${expected_ver}"|"${expected_ver}"-*) ;;
        *) s0_die "the installer says ${expected_ver} and this checkout says ${version}"; return 1 ;;
      esac
      ;;
  esac

  # 3. The golden documents are the ones the baseline was measured on.
  local golden_problem
  golden_problem="$(node "${SUITE_DIR}/golden_check.mjs" "${REPO_ROOT}")" || {
    s0_die "${golden_problem}"; return 1; }

  # 4. Tools, and a machine with no leftover copy of the app running.
  local tools_json
  tools_json="$(driver_check_tools)" || { s0_die "$(cat "${WORK}/preflight-tools.err" 2>/dev/null || echo 'a required tool is missing')"; return 1; }
  driver_kill_leftovers || true

  node "${SUITE_DIR}/write_meta.mjs" \
    --work "${WORK}" --repo "${REPO_ROOT}" --artefact "${ARTEFACT}" --platform "${PLATFORM}" \
    --machine "${MACHINE}" --commit "${COMMIT}" --tools "${tools_json}" \
    --os "$(driver_os_string)" --load1 "$(driver_load1)" \
    --expect-updater "${EXPECT_UPDATER}" --golden "${golden_problem}" || return 1

  # One row so S0 is visible in the report. A step that cannot fail is still a
  # step a reader looks for, and its absence reads as "not run".
  : > "${WORK}/probes/preflight.out"; echo 0 > "${WORK}/probes/preflight.rc"
  judge "preflight"
  return 0
}
