#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/../server"
npm install

cd ../frontend
npm install --include=optional

cd ..
npm install esbuild@^0.25.0 --omit=dev --no-package-lock

echo "Vercel install complete"
