#!/usr/bin/env bash
# =============================================================
#   Cedar - Drop-in Blog Engine & Studio (Linux)
# =============================================================
cd "$(dirname "${BASH_SOURCE[0]}")" || exit 1
echo "============================================================="
echo "   Starting Cedar Local Studio (Linux)..."
echo "============================================================="

if command -v python3 &>/dev/null; then
    exec python3 serve.py "$@"
elif command -v python &>/dev/null; then
    exec python serve.py "$@"
else
    echo "[-] Error: python3 is not installed or not in PATH."
    exit 1
fi