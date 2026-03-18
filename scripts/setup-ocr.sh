#!/usr/bin/env bash
# SPDX-License-Identifier: AGPL-3.0-or-later
# Copyright (c) 2026 PDFluent Contributors

set -euo pipefail

PYTHON_BIN="${PDFLUENT_PYTHON_BIN:-python3}"
VENV_DIR="${PDFLUENT_OCR_VENV:-.venv-ocr}"
REQUIREMENTS_FILE="src-tauri/scripts/requirements-ocr.txt"

if ! command -v "${PYTHON_BIN}" >/dev/null 2>&1; then
  echo "Error: Python binary not found: ${PYTHON_BIN}" >&2
  exit 1
fi

if [[ ! -f "${REQUIREMENTS_FILE}" ]]; then
  echo "Error: requirements file not found: ${REQUIREMENTS_FILE}" >&2
  exit 1
fi

if [[ ! -d "${VENV_DIR}" ]]; then
  echo "Creating OCR virtual environment at ${VENV_DIR}..."
  "${PYTHON_BIN}" -m venv "${VENV_DIR}"
fi

if [[ -x "${VENV_DIR}/bin/python" ]]; then
  VENV_PYTHON="${VENV_DIR}/bin/python"
elif [[ -x "${VENV_DIR}/Scripts/python.exe" ]]; then
  VENV_PYTHON="${VENV_DIR}/Scripts/python.exe"
else
  echo "Error: unable to locate Python inside ${VENV_DIR}" >&2
  exit 1
fi

echo "Installing OCR requirements in ${VENV_DIR}..."
"${VENV_PYTHON}" -m pip install --upgrade pip
"${VENV_PYTHON}" -m pip install -r "${REQUIREMENTS_FILE}"

echo "Verifying PaddleOCR import..."
"${VENV_PYTHON}" - <<'PY'
import os
os.environ["PADDLE_PDX_DISABLE_MODEL_SOURCE_CHECK"] = "True"
import importlib
module = importlib.import_module("paddleocr")
print(f"OK: imported paddleocr from {module.__file__}")
PY

if command -v node >/dev/null 2>&1; then
  echo "Generating OCR model manifest..."
  node scripts/generate-ocr-model-manifest.mjs || true
fi

echo "OCR setup complete."
echo "Runtime uses this Python automatically if present: ${VENV_PYTHON}"
