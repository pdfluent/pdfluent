#!/usr/bin/env bash
# Unified Release Gate Runner — Shell wrapper for scripts/release_gate.py
#
# Usage:
#   ./scripts/run_release_gate.sh
#   ./scripts/run_release_gate.sh --skip-xfa-build
#   ./scripts/run_release_gate.sh --verbose
#   PDFLUENT_GATE_TIMEOUT=600 ./scripts/run_release_gate.sh

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

# Ensure Python 3 is available
if ! command -v python3 &> /dev/null; then
    echo "Error: python3 is required but not installed."
    exit 1
fi

# Forward all arguments to the Python orchestrator
exec python3 scripts/release_gate.py "$@"
