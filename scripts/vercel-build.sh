#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"

cd "$ROOT/server"
npx prisma generate

cd "$ROOT/frontend"
VERCEL=1 ./node_modules/.bin/vite build

cd "$ROOT"
node scripts/prepare-vercel.mjs

echo "Vercel build complete"
