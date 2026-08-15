#!/usr/bin/env bash
# PG17 rehearsal for the P1 migration drafts (isolated cluster, never production).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
DRAFTS="$ROOT/docs/migration-drafts/p1"
PGDIR="${PGDIR:-/tmp/p1-pg17}"
PORT="${PORT:-55432}"

rm -rf "$PGDIR"
mkdir -p "$PGDIR"
initdb -D "$PGDIR/data" -U postgres >/dev/null
pg_ctl -D "$PGDIR/data" -o "-p $PORT -k $PGDIR" -l "$PGDIR/pg.log" -w start >/dev/null
trap 'pg_ctl -D "$PGDIR/data" -m immediate stop >/dev/null 2>&1 || true' EXIT

export PGHOST="$PGDIR" PGPORT="$PORT" PGUSER=postgres PGDATABASE=postgres
unset PGPASSWORD || true

psql -Atc "select version()"
psql -v ON_ERROR_STOP=1 -q -f "$ROOT/scripts/p1-source-closure-02-pg17/00-harness.sql"

for f in P1-01-DETAIL-MODELS.sql P1-02-BACKEND-VALIDATION.sql P1-03-WORKFLOW-SEEDS.sql P1-04-GRADE-APPEAL-TRIGGER-REPLACE.sql; do
  echo "--- applying $f"
  psql -v ON_ERROR_STOP=1 -q -f "$DRAFTS/$f"
  echo "--- re-applying $f (idempotency)"
  psql -v ON_ERROR_STOP=1 -q -f "$DRAFTS/$f"
done

psql -v ON_ERROR_STOP=1 -q -f "$ROOT/scripts/p1-source-closure-02-pg17/01-cases.sql"
echo "P1_PG17_REHEARSAL_PASS"
