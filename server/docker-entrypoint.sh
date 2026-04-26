#!/bin/sh
set -e

echo "==> F3 Production Server — startup"

# ── Wait for MariaDB ──────────────────────────────────────────────────────────
echo "==> Waiting for MariaDB at ${DB_HOST}:${DB_PORT}..."
MAX_TRIES=30
TRIES=0
until node -e "
  const m = require('mariadb');
  const p = m.createPool({
    host:            process.env.DB_HOST || 'db',
    port:            parseInt(process.env.DB_PORT) || 3306,
    user:            process.env.DB_USER,
    password:        process.env.DB_PASS,
    database:        process.env.DB_NAME,
    connectionLimit: 1,
    acquireTimeout:  4000,
    connectTimeout:  4000,
  });
  p.getConnection()
    .then(c => { c.release(); return p.end(); })
    .then(() => process.exit(0))
    .catch(err => { p.end().catch(() => {}); process.exit(1); });
" 2>/dev/null
do
  TRIES=$((TRIES + 1))
  if [ "$TRIES" -ge "$MAX_TRIES" ]; then
    echo "ERROR: MariaDB did not become ready in time. Aborting."
    exit 1
  fi
  printf '.'
  sleep 2
done
echo ""
echo "==> MariaDB is ready."

# ── Run migrations ────────────────────────────────────────────────────────────
echo "==> Running database migrations..."
node src/db/migrate.js

# ── Run seed (idempotent — safe to re-run) ────────────────────────────────────
echo "==> Running database seed..."
node src/db/seed.js

# ── Start server ──────────────────────────────────────────────────────────────
echo "==> Starting F3 server on port ${PORT:-3001}..."
exec node src/index.js
