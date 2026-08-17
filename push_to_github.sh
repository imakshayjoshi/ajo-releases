#!/bin/bash
# AJO GitHub Uploader Script
# Usage: ./push_to_github.sh [GITHUB_TOKEN] [REPO_NAME]

TOKEN="$1"
REPO="${2:-imakshayjoshi/ajo-releases}"

if [ -z "$TOKEN" ]; then
  echo "❌ Please provide a GitHub Personal Access Token (with 'repo' scope):"
  echo "   ./push_to_github.sh <YOUR_GITHUB_TOKEN> [owner/repo]"
  echo ""
  echo "Or if you are already authenticated with gh CLI, simply run:"
  echo "   git push https://github.com/${REPO}.git main"
  exit 1
fi

echo "🚀 Setting up remote for https://github.com/${REPO}.git ..."
git remote remove origin 2>/dev/null || true
git remote add origin "https://${TOKEN}@github.com/${REPO}.git"

echo "📤 Pushing all source files to GitHub main branch..."
git push -u origin main --force

echo "✅ Successfully uploaded all source files to https://github.com/${REPO}!"
