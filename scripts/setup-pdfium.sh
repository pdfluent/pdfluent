#!/usr/bin/env bash
# SPDX-License-Identifier: AGPL-3.0-or-later
# Downloads pre-built Pdfium binary for the current platform.
# Source: https://github.com/nicbarker/pdfium-binaries (nicbarker fork, Apache-2.0)

set -euo pipefail

PDFIUM_VERSION="6938"
BASE_URL="https://github.com/nicbarker/pdfium-binaries/releases/download/chromium%2F${PDFIUM_VERSION}"
OUT_DIR="src-tauri/lib"

detect_platform() {
  local os arch
  os="$(uname -s)"
  arch="$(uname -m)"

  case "$os" in
    Darwin)
      case "$arch" in
        arm64) echo "pdfium-mac-arm64" ;;
        x86_64) echo "pdfium-mac-x64" ;;
        *) echo "unsupported" ;;
      esac
      ;;
    Linux)
      case "$arch" in
        x86_64) echo "pdfium-linux-x64" ;;
        aarch64) echo "pdfium-linux-arm64" ;;
        *) echo "unsupported" ;;
      esac
      ;;
    MINGW*|MSYS*|CYGWIN*)
      case "$arch" in
        x86_64|AMD64) echo "pdfium-win-x64" ;;
        aarch64|ARM64) echo "pdfium-win-arm64" ;;
        *) echo "unsupported" ;;
      esac
      ;;
    *) echo "unsupported" ;;
  esac
}

PLATFORM="$(detect_platform)"
if [ "$PLATFORM" = "unsupported" ]; then
  echo "Error: Unsupported platform $(uname -s)/$(uname -m)"
  exit 1
fi

ARCHIVE="${PLATFORM}.tgz"
URL="${BASE_URL}/${ARCHIVE}"

echo "Downloading Pdfium for ${PLATFORM}..."
mkdir -p "$OUT_DIR"

curl -L --fail --progress-bar "$URL" -o "/tmp/${ARCHIVE}"
tar xzf "/tmp/${ARCHIVE}" -C "$OUT_DIR"
rm "/tmp/${ARCHIVE}"

echo "Pdfium installed to ${OUT_DIR}/"
ls -lh "${OUT_DIR}/lib/"
