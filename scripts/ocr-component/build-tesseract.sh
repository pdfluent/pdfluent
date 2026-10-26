#!/usr/bin/env bash
# Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
#
# This software is proprietary. The PDFluent application is free to use,
# including for commercial purposes. Redistribution, or extraction or reuse
# of its components (including the embedded PDF engine), requires a licence.
# See https://pdfluent.com/license for terms.
#
# Build the OCR component (owner decision D4): one self-contained Tesseract
# binary per platform, statically linked against Leptonica, libpng and zlib,
# plus the licence texts and the tessdata_fast language packs, laid out exactly
# as src-tauri/resources/ocr/tesseract-component.json names them.
#
# This script builds and hashes. It does not upload and it does not host:
# publishing is a separate, deliberate step (see the end of this header).
#
# Every source is pinned by version AND by SHA-256. For a version bump, run
# with --print-source-hashes: it fetches the pinned versions, prints their
# SHA-256 and stops, so a person compares them with an independent record and
# writes them in here in a reviewed commit. A run with an empty or wrong hash
# refuses to build.
#
# usage:
#   scripts/ocr-component/build-tesseract.sh --print-source-hashes
#   scripts/ocr-component/build-tesseract.sh --platform macos-aarch64 --out <dir>
#   scripts/ocr-component/build-tesseract.sh --platform macos-x86_64  --out <dir>
#   scripts/ocr-component/build-tesseract.sh --platform windows-x86_64 --out <dir>   (Git Bash/MSYS2 with MSVC + CMake)
#   scripts/ocr-component/build-tesseract.sh --tessdata --out <dir>
#
# Then:
#   node scripts/ocr-component/write-manifest.mjs --platform <key> --dir <dir>/<key>
#   node scripts/ocr-component/write-manifest.mjs --tessdata <dir>/tessdata
#   node scripts/ocr-component/write-manifest.mjs --publish     (only when every entry is pinned)
#
# Signing: macOS binaries are signed with $PDFLUENT_CODESIGN_IDENTITY
# (Developer ID Application, hardened runtime) when it is set, ad-hoc
# otherwise -- an ad-hoc binary runs on Apple Silicon but is not what ships.
# Windows binaries are signed by src-tauri/scripts/sign-windows.ps1 when
# PDFLUENT_SIGN_WINDOWS=1. Sign BEFORE write-manifest: the hash is of the
# signed file.
#
# Build directories go under $PDFLUENT_BUILD_ROOT (default
# /Volumes/PDFluent-Builds/PDFluent/builds/ocr-component); nothing is written
# to the internal disk.

set -euo pipefail

TESSERACT_VERSION="5.5.1"
LEPTONICA_VERSION="1.85.0"
LIBPNG_VERSION="1.6.59"
ZLIB_VERSION="1.3.1"
TESSDATA_FAST_VERSION="4.1.0"
LANGUAGES=(eng nld deu fra spa ita)

TESSERACT_URL="https://github.com/tesseract-ocr/tesseract/archive/refs/tags/${TESSERACT_VERSION}.tar.gz"
LEPTONICA_URL="https://github.com/DanBloomberg/leptonica/releases/download/${LEPTONICA_VERSION}/leptonica-${LEPTONICA_VERSION}.tar.gz"
LIBPNG_URL="https://download.sourceforge.net/libpng/libpng-${LIBPNG_VERSION}.tar.gz"
ZLIB_URL="https://zlib.net/fossils/zlib-${ZLIB_VERSION}.tar.gz"
TESSDATA_BASE="https://raw.githubusercontent.com/tesseract-ocr/tessdata_fast/${TESSDATA_FAST_VERSION}"

# Pinned SHA-256 of each source, checked on 18-10-2026 against an independent
# record: the Homebrew formula that shipped the same version (tesseract 5.5.1,
# leptonica 1.85.0, zlib 1.3.1, tessdata_fast eng). libpng 1.6.59 (moved from
# 1.6.47 for the 2025-2026 libpng security fixes): Homebrew pins the .tar.xz;
# this .tar.gz unpacks to a tree identical to it. The other tessdata_fast packs
# and the LICENSE come from the same tagged 4.1.0 tree as eng.
TESSERACT_SHA256="a7a3f2a7420cb6a6a94d80c24163e183cf1d2f1bed2df3bbc397c81808a57237"
LEPTONICA_SHA256="3745ae3bf271a6801a2292eead83ac926e3a9bc1bf622e9cd4dd0f3786e17205"
LIBPNG_SHA256="86a3e4b501f7f50e392c4e456ea158893e9a595b1c63eb88c7bb9f6cf8772dad"
ZLIB_SHA256="9a93b2b7dfdac77ceba5a558a580e74667dd6fede4585b91eefb60f03b72df23"
# One variable per language (macOS ships bash 3.2: no associative arrays).
TESSDATA_SHA256_eng="7d4322bd2a7749724879683fc3912cb542f19906c83bcc1a52132556427170b2"
TESSDATA_SHA256_nld="ced0e5e046a84c908a6aa7accbef9a232c4a5d9a8276691b81c6ee64d02963f6"
TESSDATA_SHA256_deu="19d219bbb6672c869d20a9636c6816a81eb9a71796cb93ebe0cb1530e2cdb22d"
TESSDATA_SHA256_fra="ced037562e8c80c13122dece28dd477d399af80911a28791a66a63ac1e3445ca"
TESSDATA_SHA256_spa="6f2e04d02774a18f01bed44b1111f2cd7f3ba7ac9dc4373cd3f898a40ea6b464"
TESSDATA_SHA256_ita="b8f89e1e785118dac4d51ae042c029a64edb5c3ee42ef73027a6d412748d8827"
TESSDATA_LICENSE_SHA256="cfc7749b96f63bd31c3c42b5c471bf756814053e847c10f3eb003417bc523d30"

BUILD_ROOT="${PDFLUENT_BUILD_ROOT:-/Volumes/PDFluent-Builds/PDFluent/builds/ocr-component}"

die() { echo "FAIL $*" >&2; exit 1; }

sha256_of() {
  if command -v shasum >/dev/null 2>&1; then shasum -a 256 "$1" | awk '{print $1}'
  else sha256sum "$1" | awk '{print $1}'; fi
}

fetch() { # url dest
  [ -f "$2" ] && return 0
  curl --fail --location --silent --show-error --max-time 600 --output "$2.partial" "$1"
  mv "$2.partial" "$2"
}

fetch_verified() { # url dest sha256
  [ -n "$3" ] || die "no pinned SHA-256 for $1 -- run --print-source-hashes and pin it in a reviewed commit"
  fetch "$1" "$2"
  local got; got="$(sha256_of "$2")"
  [ "$got" = "$3" ] || die "SHA-256 mismatch for $1: got $got, pinned $3"
}

mode=""; platform=""; out=""
while [ $# -gt 0 ]; do
  case "$1" in
    --print-source-hashes) mode=hashes ;;
    --platform) mode=build; platform="$2"; shift ;;
    --tessdata) mode=tessdata ;;
    --out) out="$2"; shift ;;
    *) die "unknown argument $1" ;;
  esac
  shift
done
[ -n "$mode" ] || die "say what to do: --print-source-hashes, --platform <key> or --tessdata"
[ -d "$(dirname "$BUILD_ROOT")" ] || die "build root parent $(dirname "$BUILD_ROOT") does not exist (external disk not mounted?)"
src="$BUILD_ROOT/src"; mkdir -p "$src"

if [ "$mode" = hashes ]; then
  for pair in "tesseract-${TESSERACT_VERSION}.tar.gz|$TESSERACT_URL" "leptonica-${LEPTONICA_VERSION}.tar.gz|$LEPTONICA_URL" \
              "libpng-${LIBPNG_VERSION}.tar.gz|$LIBPNG_URL" "zlib-${ZLIB_VERSION}.tar.gz|$ZLIB_URL" \
              "tessdata_fast-LICENSE|$TESSDATA_BASE/LICENSE"; do
    name="${pair%%|*}"; url="${pair#*|}"
    fetch "$url" "$src/$name"
    echo "$(sha256_of "$src/$name")  $name"
  done
  for lang in "${LANGUAGES[@]}"; do
    fetch "$TESSDATA_BASE/$lang.traineddata" "$src/$lang.traineddata"
    echo "$(sha256_of "$src/$lang.traineddata")  $lang.traineddata"
  done
  echo "Compare these with the upstream release pages before pinning them above."
  exit 0
fi

[ -n "$out" ] || die "--out <dir> is required"
mkdir -p "$out"

if [ "$mode" = tessdata ]; then
  dest="$out/tessdata"; mkdir -p "$dest"
  for lang in "${LANGUAGES[@]}"; do
    pin_var="TESSDATA_SHA256_$lang"
    fetch_verified "$TESSDATA_BASE/$lang.traineddata" "$src/$lang.traineddata" "${!pin_var}"
    cp "$src/$lang.traineddata" "$dest/$lang.traineddata"
  done
  echo "OK tessdata_fast ${TESSDATA_FAST_VERSION} -> $dest"
  exit 0
fi

case "$platform" in
  macos-aarch64) arch=arm64 ;;
  macos-x86_64) arch=x86_64 ;;
  windows-x86_64) arch=x64 ;;
  *) die "unsupported platform $platform (the editor ships on macOS and Windows only)" ;;
esac

fetch_verified "$TESSERACT_URL" "$src/tesseract-${TESSERACT_VERSION}.tar.gz" "$TESSERACT_SHA256"
fetch_verified "$LEPTONICA_URL" "$src/leptonica-${LEPTONICA_VERSION}.tar.gz" "$LEPTONICA_SHA256"
fetch_verified "$LIBPNG_URL" "$src/libpng-${LIBPNG_VERSION}.tar.gz" "$LIBPNG_SHA256"
fetch_verified "$ZLIB_URL" "$src/zlib-${ZLIB_VERSION}.tar.gz" "$ZLIB_SHA256"
fetch_verified "$TESSDATA_BASE/LICENSE" "$src/tessdata_fast-LICENSE" "$TESSDATA_LICENSE_SHA256"

work="$BUILD_ROOT/work-$platform"; prefix="$work/prefix"
mkdir -p "$work" "$prefix"
cd "$work" || exit 1
for t in "tesseract-${TESSERACT_VERSION}" "leptonica-${LEPTONICA_VERSION}" "libpng-${LIBPNG_VERSION}" "zlib-${ZLIB_VERSION}"; do
  [ -d "$t" ] || tar -xzf "$src/$t.tar.gz"
done

# CMake is a native program on Windows: hand it a C:/ path, not /c/.
case "$platform" in
  windows-*) prefix_native="$(cygpath -m "$prefix")" ;;
  *) prefix_native="$prefix" ;;
esac
# zlib 1.3.1 always installs a shared library beside the static one, and
# FindZLIB prefers the shared one; ZLIB_USE_STATIC_LIBS (CMake 3.24+) makes
# every consumer link the static archive, so the binary loads no libz.
cmake_common=(-DCMAKE_BUILD_TYPE=Release -DBUILD_SHARED_LIBS=OFF -DZLIB_USE_STATIC_LIBS=ON
  "-DCMAKE_INSTALL_PREFIX=$prefix_native" "-DCMAKE_PREFIX_PATH=$prefix_native")
case "$platform" in
  # CMAKE_SYSTEM_NAME/PROCESSOR: CMake takes the processor from the host it
  # runs on, and an x86_64 CMake under Rosetta on Apple Silicon reports
  # x86_64. Tesseract picks its SIMD sources by that value while its code picks
  # them by the compiler's target, so an arm64 build would link without the
  # NEON kernels it calls. Naming the target makes both agree, either way.
  macos-*) cmake_common+=("-DCMAKE_OSX_ARCHITECTURES=$arch" -DCMAKE_OSX_DEPLOYMENT_TARGET=10.15 -DCMAKE_FIND_FRAMEWORK=NEVER
             -DCMAKE_SYSTEM_NAME=Darwin "-DCMAKE_SYSTEM_PROCESSOR=$arch"
             # Naming the system flips CMake to cross-compiling mode, where
             # Tesseract's TIFF probe (a try_run) cannot run. Leptonica is
             # built without TIFF here, so the probe's answer is "not
             # supported": nonzero.
             -DLEPT_TIFF_RESULT=1 -DLEPT_TIFF_RESULT__TRYRUN_OUTPUT=) ;;
  # CMP0091 NEW: Leptonica declares cmake_minimum_required 3.5, which leaves the
  # policy OLD, and CMake then ignores CMAKE_MSVC_RUNTIME_LIBRARY for it. The
  # library comes out /MD while Tesseract is /MT and the link fails with
  # unresolved __imp_* symbols (first Windows build, 20-10).
  windows-*) cmake_common+=(-A x64 -DCMAKE_POLICY_DEFAULT_CMP0091=NEW -DCMAKE_MSVC_RUNTIME_LIBRARY=MultiThreaded) ;;
esac

build() { # dir extra-args...
  local dir="$1"; shift
  # --fresh: a cache from an earlier run must not carry a library choice over.
  cmake --fresh -S "$dir" -B "$dir/build" "${cmake_common[@]}" "$@"
  cmake --build "$dir/build" --config Release --parallel 4
  cmake --install "$dir/build" --config Release
}

build "zlib-${ZLIB_VERSION}"
# PNG_FRAMEWORK=OFF: on Apple platforms libpng otherwise also installs a
# png.framework, which FindPNG picks over the static archive.
build "libpng-${LIBPNG_VERSION}" -DPNG_SHARED=OFF -DPNG_FRAMEWORK=OFF -DPNG_TESTS=OFF -DPNG_TOOLS=OFF
# Leptonica with PNG and zlib only: the app hands Tesseract PNG over a pipe,
# so no JPEG, TIFF, GIF, WebP or JPEG 2000 reader (and no licence for one).
build "leptonica-${LEPTONICA_VERSION}" -DSW_BUILD=OFF -DENABLE_PNG=ON -DENABLE_ZLIB=ON \
  -DENABLE_JPEG=OFF -DENABLE_TIFF=OFF -DENABLE_GIF=OFF -DENABLE_WEBP=OFF -DENABLE_OPENJPEG=OFF
# Tesseract without libarchive and libcurl (no network inside the component),
# without OpenMP (the app runs one page per process) and without training tools.
build "tesseract-${TESSERACT_VERSION}" -DSW_BUILD=OFF -DDISABLE_ARCHIVE=ON -DDISABLE_CURL=ON \
  -DOPENMP_BUILD=OFF -DBUILD_TRAINING_TOOLS=OFF -DGRAPHICS_DISABLED=ON -DBUILD_TESTS=OFF

dest="$out/$platform"; mkdir -p "$dest/bin" "$dest/LICENSES"
case "$platform" in
  windows-*) cp "$prefix/bin/tesseract.exe" "$dest/bin/tesseract.exe"; binary="$dest/bin/tesseract.exe" ;;
  *) cp "$prefix/bin/tesseract" "$dest/bin/tesseract"; binary="$dest/bin/tesseract" ;;
esac

# The component must not load anything from the machine it lands on.
case "$platform" in
  macos-*)
    if otool -L "$binary" | tail -n +2 | grep -v -E '/usr/lib/|/System/Library/'; then
      die "$binary links a library outside the OS"
    fi
    if [ -n "${PDFLUENT_CODESIGN_IDENTITY:-}" ]; then
      codesign --force --options runtime --timestamp --sign "$PDFLUENT_CODESIGN_IDENTITY" "$binary"
    else
      echo "NOTE ad-hoc signature: set PDFLUENT_CODESIGN_IDENTITY for the binary that ships" >&2
      codesign --force --sign - "$binary"
    fi
    ;;
  windows-*)
    if [ "${PDFLUENT_SIGN_WINDOWS:-0}" = 1 ]; then
      powershell.exe -NoProfile -ExecutionPolicy Bypass -File "$(dirname "$0")/../../src-tauri/scripts/sign-windows.ps1" "$(cygpath -w "$binary")"
    fi
    ;;
esac

cp "tesseract-${TESSERACT_VERSION}/LICENSE" "$dest/LICENSES/tesseract-LICENSE.txt"
cp "leptonica-${LEPTONICA_VERSION}/leptonica-license.txt" "$dest/LICENSES/leptonica-LICENSE.txt"
cp "libpng-${LIBPNG_VERSION}/LICENSE" "$dest/LICENSES/libpng-LICENSE.txt"
cp "zlib-${ZLIB_VERSION}/LICENSE" "$dest/LICENSES/zlib-LICENSE.txt"
cp "$src/tessdata_fast-LICENSE" "$dest/LICENSES/tessdata_fast-LICENSE.txt"

"$binary" --version >/dev/null || die "$binary does not run"
echo "OK $platform -> $dest"
