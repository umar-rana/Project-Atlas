#!/bin/bash
set -e

if [ -f package.json ]; then
  npm install --no-audit --no-fund
fi

npx prisma generate
npx prisma migrate deploy
