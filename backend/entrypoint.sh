#!/bin/sh
# =============================================================================
# entrypoint.sh — Backend container startup with retry logic
# =============================================================================
# ВАЖЛИВО: НЕ використовуємо `set -e` тут глобально, бо pg_isready
# повертає ненульовий код поки не готово — це нормально.

echo "⏳ Waiting for PostgreSQL to be ready..."
RETRIES=30
until pg_isready -h "${PGHOST:-postgres}" -U "${PGUSER:-postgres}" -q 2>/dev/null; do
  RETRIES=$((RETRIES - 1))
  if [ "$RETRIES" -le 0 ]; then
    echo "❌ PostgreSQL did not become ready in time. Exiting."
    exit 1
  fi
  echo "   PostgreSQL not ready, retrying in 2s... ($RETRIES retries left)"
  sleep 2
done
echo "✅ PostgreSQL is ready"

echo "⏳ Running Prisma database sync..."
# --skip-generate: клієнт вже згенеровано під час Docker build
# --accept-data-loss: дозволяє синхронізувати схему без міграцій
if ! npx prisma db push --accept-data-loss --skip-generate; then
  echo "❌ Prisma db push failed. Exiting."
  exit 1
fi
echo "✅ Prisma sync complete"

echo "🚀 Starting backend server..."
# exec: заміняє поточний shell процес на node,
# щоб SIGTERM від Docker доходив напряму до Node.js (graceful shutdown)
exec node dist/server.js
