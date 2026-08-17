#!/bin/bash
set -euo pipefail
REPO="${1:-imakshayjoshi/ajo-releases}"
if ! command -v gh >/dev/null 2>&1; then
  echo "GitHub CLI is required. Install it, then run: gh auth login"
  exit 1
fi
gh auth status >/dev/null
git remote remove origin 2>/dev/null || true
git remote add origin "git@github.com:${REPO}.git"
git push -u origin main
