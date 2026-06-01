#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT_DIR"

npm run news:snapshot

git add news-data.json

if git diff --cached --quiet; then
  echo "No changes in news-data.json. Nothing to commit."
  exit 0
fi

TS="$(date '+%Y-%m-%d %H:%M:%S')"
git commit -m "chore: update news snapshot (${TS})"
git push

echo "News snapshot updated and pushed successfully."
