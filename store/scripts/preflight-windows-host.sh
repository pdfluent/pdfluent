#!/usr/bin/env bash
# Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
#
# This software is proprietary. The PDFluent application is free to use,
# including for commercial purposes. Redistribution, or extraction or reuse
# of its components (including the embedded PDF engine), requires a licence.
# See https://pdfluent.com/license for terms.
#
# preflight-windows-host.sh — can the Windows build host produce the signed MSI?
# Read-only over SSH. Prints variable NAMES and yes/no, never values.
#
#   store/scripts/preflight-windows-host.sh
#
# Reads WIN_BUILD_HOST, WIN_EDITOR_PATH and PDFLUENT_OCR_COMPONENT_BUILD_WIN from
# the environment or from the .env that release-windows-remote.sh would use
# (PDFLUENT_ENV, else the main checkout's .env). Exit non-zero on any FAIL.
set -uo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
ENV_FILE="${PDFLUENT_ENV:-}"
if [ -z "${ENV_FILE}" ]; then
  common="$(git -C "${ROOT}" rev-parse --git-common-dir 2>/dev/null)"
  case "${common}" in /*) ;; *) common="${ROOT}/${common}" ;; esac
  ENV_FILE="$(cd "${common}/.." 2>/dev/null && pwd)/.env"
fi
val() { [ -f "${ENV_FILE}" ] && grep -E "^$1=" "${ENV_FILE}" | tail -1 | cut -d= -f2- | tr -d "\"'"; }
: "${WIN_BUILD_HOST:=$(val WIN_BUILD_HOST)}"
: "${WIN_EDITOR_PATH:=$(val WIN_EDITOR_PATH)}"
: "${PDFLUENT_OCR_COMPONENT_BUILD_WIN:=$(val PDFLUENT_OCR_COMPONENT_BUILD_WIN)}"
if [ -z "${WIN_BUILD_HOST}" ] || [ -z "${WIN_EDITOR_PATH}" ]; then
  echo "FAIL WIN_BUILD_HOST / WIN_EDITOR_PATH not set (env file tried: ${ENV_FILE}); set PDFLUENT_ENV"; exit 1
fi
OCR="${PDFLUENT_OCR_COMPONENT_BUILD_WIN:-}"
PS=$(cat <<PSX
\$ProgressPreference='SilentlyContinue'
\$r='${WIN_EDITOR_PATH}'; \$o='${OCR}'
function Emit(\$k,\$v){ Write-Output ("RESULT "+\$k+"="+\$v) }
Emit repo_exists (Test-Path "\$r/scripts/release-windows.ps1")
\$names='TRUSTED_SIGNING_PROFILE','AZURE_TENANT_ID','AZURE_CLIENT_ID','AZURE_CLIENT_SECRET','TAURI_SIGNING_PRIVATE_KEY','TAURI_SIGNING_PRIVATE_KEY_PASSWORD'
\$envf="\$r/.env"; \$have=@{}
if (Test-Path \$envf) { Get-Content \$envf | ForEach-Object { if (\$_ -match '^([^#=\s]+)=(.+)$') { \$have[\$Matches[1]]=\$true } } }
Emit host_env_file (Test-Path \$envf)
foreach (\$n in \$names) { Emit ("var_"+\$n) ([bool](\$have[\$n] -or [Environment]::GetEnvironmentVariable(\$n,'User') -or [Environment]::GetEnvironmentVariable(\$n,'Machine'))) }
if (Test-Path "\$r/.git") { Set-Location \$r; Emit git_dirty ((git status --porcelain | Measure-Object).Count); Emit git_origin ((git remote get-url origin) -replace '//[^@]*@','//') }
\$t="\$o\\windows-x86_64\\bin\\tesseract.exe"
Emit ocr_tesseract (Test-Path \$t); Emit ocr_tessdata (Test-Path "\$o\\tessdata")
if (Test-Path \$t) { Emit ocr_tesseract_signature ((Get-AuthenticodeSignature \$t).Status); Emit ocr_tesseract_sha256 ((Get-FileHash \$t -Algorithm SHA256).Hash.ToLower()) }
Emit signtool (Test-Path 'C:\Program Files (x86)\Windows Kits\10\bin\10.0.22621.0\x64\signtool.exe')
Emit trusted_signing_dlib ((@(Get-ChildItem "\$env:LOCALAPPDATA\TrustedSigning\Microsoft.Trusted.Signing.Client\*\bin\x64\Azure.CodeSigning.Dlib.dll" -ErrorAction SilentlyContinue)).Count -gt 0)
Emit free_gb_c ([math]::Floor((Get-PSDrive C).Free/1GB))
Emit cargo ([bool](Get-Command cargo -ErrorAction SilentlyContinue)); Emit node ([bool](Get-Command node -ErrorAction SilentlyContinue))
PSX
)
ENC=$(printf '%s' "$PS" | iconv -t UTF-16LE | base64 | tr -d '\n')
RAW="$(ssh -o BatchMode=yes -o ConnectTimeout=30 -o LogLevel=ERROR "${WIN_BUILD_HOST}" "powershell -NoProfile -EncodedCommand $ENC" 2>&1)"; RC=$?
OUT="$(printf '%s\n' "${RAW}" | tr -d '\r' | grep '^RESULT ' || true)"
if [ "${RC}" -ne 0 ] || [ -z "${OUT}" ]; then printf "%s\n" "${RAW}" | head -c 600; echo "FAIL no answer from ${WIN_BUILD_HOST} over ssh (BatchMode), exit ${RC}"; exit 1; fi
[ -n "${OCR}" ] || echo "FAIL PDFLUENT_OCR_COMPONENT_BUILD_WIN not set (env or ${ENV_FILE})"
FAILED=0
get() { printf '%s\n' "${OUT}" | sed -n "s/^RESULT $1=//p"; }
need() { [ "$(get "$1")" = "True" ] && echo "ok   $2" || { echo "FAIL $2"; FAILED=1; }; }
need repo_exists "editor checkout with scripts/release-windows.ps1 at ${WIN_EDITOR_PATH}"
need ocr_tesseract "OCR tesseract.exe at ${OCR:-<unset>}"
need ocr_tessdata "OCR tessdata"
sig="$(get ocr_tesseract_signature)"; [ "${sig}" = "Valid" ] && echo "ok   tesseract.exe signed" || echo "note tesseract.exe signature: ${sig:-n/a} (release-windows.ps1 signs and re-pins it when signing is enabled)"
need signtool "signtool.exe"
need trusted_signing_dlib "Azure.CodeSigning.Dlib.dll"
need cargo "cargo"; need node "node"
for n in TRUSTED_SIGNING_PROFILE AZURE_TENANT_ID AZURE_CLIENT_ID AZURE_CLIENT_SECRET TAURI_SIGNING_PRIVATE_KEY; do need "var_${n}" "${n} present on the host (name only)"; done
echo "info free GB on C: $(get free_gb_c); git dirty files: $(get git_dirty); origin: $(get git_origin)"
exit "${FAILED}"
