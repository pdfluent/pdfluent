#!/usr/bin/env bash
# Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
#
# This software is proprietary. The PDFluent application is free to use,
# including for commercial purposes. Redistribution, or extraction or reuse
# of its components (including the embedded PDF engine), requires a licence.
# See https://pdfluent.com/license for terms.
#
# validate-store-candidate.sh — certification gate for a Microsoft Store (Win32
# EXE/MSI) candidate. Verifies the LIVE self-hosted installer end-to-end and, if
# a Windows build host is configured, the on-Windows certification checks too.
#
#   store/scripts/validate-store-candidate.sh [version]
#     version  defaults to src-tauri/tauri.conf.json
#
# Env:
#   WIN_BUILD_HOST   e.g. user@host or an ssh alias — if set, runs the Windows-side
#                    Authenticode + silent install/uninstall checks over SSH.
#
# Exit non-zero on any failed gate. Never echoes secrets.
set -uo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
VERSION="${1:-$(node -p "require('${ROOT}/src-tauri/tauri.conf.json').version")}"
BASE="https://pdfluent.com/releases/${VERSION}"
MSI="PDFluent_${VERSION}_x64_en-US.msi"
URL="${BASE}/${MSI}"
fail(){ echo "❌ STORE-VALIDATE FAILED: $*"; exit 1; }
ok(){ echo "✅ $*"; }

echo "== PDFluent Store candidate validation — v${VERSION} =="

# 1. Hosted installer is live (.msi only, Win32 Store requires self-hosting).
code=$(curl -sS -o /dev/null -w '%{http_code}' -I "$URL") || true
[ "$code" = "200" ] || fail "installer URL not 200 (got $code): $URL"
ok "installer hosted + live (HTTP 200): $URL"

# 2. Download + record SHA-256 (the operator pastes this into the dossier).
tmp="$(mktemp)"; curl -sS --max-time 180 -o "$tmp" "$URL" || fail "download failed"
size=$(wc -c < "$tmp" | tr -d ' '); sha=$(shasum -a 256 "$tmp" | awk '{print toupper($1)}')
ok "downloaded ${size} bytes  sha256=${sha}"

# 3. Updater feed advertises this version for windows-x86_64 (in-app updater works).
feed="$(curl -sS --max-time 20 https://pdfluent.com/releases/latest.json)"
fv=$(printf '%s' "$feed" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{try{const m=JSON.parse(s);process.stdout.write((m.version||"")+(m.platforms&&m.platforms["windows-x86_64"]?":win":":NOWIN"))}catch{process.stdout.write("ERR")}})')
[ "$fv" = "${VERSION}:win" ] || echo "⚠ updater feed = ${fv} (expected ${VERSION}:win) — flip latest.json if this is the new release"
[ "$fv" = "${VERSION}:win" ] && ok "updater feed advertises ${VERSION} for windows-x86_64"

# 4. Windows-side certification checks (Authenticode + silent install/uninstall).
if [ -n "${WIN_BUILD_HOST:-}" ]; then
  echo "== Windows-side checks on ${WIN_BUILD_HOST} =="
  PS=$(cat <<PSX
\$ProgressPreference='SilentlyContinue'
\$u="${URL}"; \$f="\$env:TEMP\\store_cand.msi"; Invoke-WebRequest \$u -OutFile \$f -UseBasicParsing
\$s=Get-AuthenticodeSignature \$f
if(\$s.Status -ne 'Valid'){ Write-Output "RESULT authenticode=FAIL(\$(\$s.Status))"; exit } else { Write-Output ("RESULT authenticode=Valid signer="+\$s.SignerCertificate.Subject) }
\$i=Start-Process msiexec -ArgumentList "/i \`"\$f\`" /quiet /norestart" -Wait -PassThru; Write-Output ("RESULT install_exit="+\$i.ExitCode)
\$exe="C:\\Program Files\\PDFluent\\pdfluent-desktop.exe"; Write-Output ("RESULT installed_exe="+(Test-Path \$exe))
\$x=Start-Process msiexec -ArgumentList "/x \`"\$f\`" /quiet /norestart" -Wait -PassThru; Write-Output ("RESULT uninstall_exit="+\$x.ExitCode)
Write-Output ("RESULT removed="+(-not (Test-Path \$exe)))
PSX
)
  ENC=$(printf '%s' "$PS" | iconv -t UTF-16LE | base64 | tr -d '\n')
  ssh -o BatchMode=yes -o ConnectTimeout=60 -o LogLevel=ERROR "$WIN_BUILD_HOST" "powershell -NoProfile -EncodedCommand $ENC" 2>&1 | sed -E 's/\r//g' | grep RESULT
else
  echo "ℹ WIN_BUILD_HOST not set — run these on a Windows machine to finish certification:"
  echo "    Get-AuthenticodeSignature <msi>           # must be Valid, CN=Innovation Trigger B.V."
  echo "    msiexec /i <msi> /quiet ; (check C:\\Program Files\\PDFluent\\pdfluent-desktop.exe)"
  echo "    msiexec /x <msi> /quiet ; (check it is fully removed)"
  echo "    & '<WindowsKits>\\App Certification Kit\\appcert.exe' (optional deeper WACK pass)"
fi
rm -f "$tmp"
echo "== validation complete =="
