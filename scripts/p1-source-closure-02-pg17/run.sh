#!/usr/bin/env bash
# PG17 rehearsal for the FIVE P1 migration drafts (isolated cluster, never production).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
DRAFTS="$ROOT/docs/migration-drafts/p1"
HARNESS="$ROOT/scripts/p1-source-closure-02-pg17"
PGDIR="${PGDIR:-/tmp/p1-pg17}"
PORT="${PORT:-55432}"

UID_L=$(id -u lovable); GID_L=$(id -g lovable)
AS_PG=(setpriv --reuid="$UID_L" --regid="$GID_L" --clear-groups)

rm -rf "$PGDIR"
mkdir -p "$PGDIR"
chown -R "$UID_L:$GID_L" "$PGDIR"
"${AS_PG[@]}" initdb -D "$PGDIR/data" -U pg >/dev/null
"${AS_PG[@]}" pg_ctl -D "$PGDIR/data" \
  -o "-k $PGDIR -p $PORT -c listen_addresses=''" -l "$PGDIR/pg.log" -w start >/dev/null
trap '"${AS_PG[@]}" pg_ctl -D "$PGDIR/data" -m immediate stop >/dev/null 2>&1 || true' EXIT

export PGHOST="$PGDIR" PGPORT="$PORT" PGUSER=pg PGDATABASE=postgres
unset PGPASSWORD || true

psql -Atc "select version()"
psql -v ON_ERROR_STOP=1 -q -f "$HARNESS/00-harness.sql"

P1_FILES=(
  P1-01-DETAIL-MODELS.sql
  P1-02-BACKEND-VALIDATION.sql
  P1-03-WORKFLOW-SEEDS.sql
  P1-04-GRADE-APPEAL-TRIGGER-REPLACE.sql
)

for f in "${P1_FILES[@]}"; do
  echo "--- applying $f"
  psql -v ON_ERROR_STOP=1 -q -f "$DRAFTS/$f"
  echo "--- re-applying $f (idempotency)"
  psql -v ON_ERROR_STOP=1 -q -f "$DRAFTS/$f"
done

# Legacy (pre-P1-05) production-shaped objects P1-05 must replace.
psql -v ON_ERROR_STOP=1 -q -f "$HARNESS/02-p1-05-prereqs.sql"

echo "--- applying P1-05-PASS-THRESHOLD-48.sql"
psql -v ON_ERROR_STOP=1 -q -f "$DRAFTS/P1-05-PASS-THRESHOLD-48.sql"
echo "--- re-applying P1-05-PASS-THRESHOLD-48.sql (idempotency)"
psql -v ON_ERROR_STOP=1 -q -f "$DRAFTS/P1-05-PASS-THRESHOLD-48.sql"

psql -v ON_ERROR_STOP=1 -q -f "$HARNESS/01-cases.sql"
psql -v ON_ERROR_STOP=1 -q -f "$HARNESS/03-p1-05-cases.sql"
echo "P1_PG17_REHEARSAL_PASS (5/5 drafts)"
