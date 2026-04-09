#!/bin/sh
set -e

echo "[entrypoint] Waiting for database to be ready..."
# Extract host and port from DATABASE_URL (format: postgresql://user:pass@host:port/db?schema=agent)
DB_HOST=$(echo "$DATABASE_URL" | sed -n 's|.*@\([^:]*\):.*|\1|p')
DB_PORT=$(echo "$DATABASE_URL" | sed -n 's|.*:\([0-9]*\)/.*|\1|p')
DB_HOST=${DB_HOST:-pco-mcp-db}
DB_PORT=${DB_PORT:-5432}

retries=0
max_retries=30
until nc -z "$DB_HOST" "$DB_PORT" 2>/dev/null || [ $retries -ge $max_retries ]; do
  retries=$((retries + 1))
  echo "[entrypoint] Waiting for $DB_HOST:$DB_PORT... ($retries/$max_retries)"
  sleep 2
done

if [ $retries -ge $max_retries ]; then
  echo "[entrypoint] ERROR: Database not reachable at $DB_HOST:$DB_PORT after $max_retries attempts"
  exit 1
fi

echo "[entrypoint] Database is ready. Syncing schema..."
node ./node_modules/prisma/build/index.js db push
echo "[entrypoint] Schema synced. Seeding system rules..."
node ./node_modules/prisma/build/index.js db execute --file prisma/seed.sql --schema prisma/schema.prisma
echo "[entrypoint] Seed complete. Starting server..."

exec node server.js
