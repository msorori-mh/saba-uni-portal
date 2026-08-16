#!/usr/bin/env bash
# PG17 isolated rehearsal for P1-06-ATOMIC-SUBMIT-PATH.sql.
# Never touches production: builds a throwaway cluster, replays P1-01..P1-05,
# then applies P1-06 twice (idempotency) and runs the full matrix.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
DRAFTS="$ROOT/docs/migration-drafts/p1"
BASE="$ROOT/scripts/p1-source-closure-02-pg17"
HARNESS="$ROOT/scripts/p1-atomic-submit-07a-pg17"
PGDIR="${PGDIR:-/tmp/p1-atomic-pg17}"
PORT="${PORT:-55433}"

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

echo "--- base harness (production-shaped preimages)"
psql -v ON_ERROR_STOP=1 -q -f "$BASE/00-harness.sql"

for f in P1-01-DETAIL-MODELS.sql P1-02-BACKEND-VALIDATION.sql \
         P1-03-WORKFLOW-SEEDS.sql P1-04-GRADE-APPEAL-TRIGGER-REPLACE.sql; do
  echo "--- applying $f"
  psql -v ON_ERROR_STOP=1 -q -f "$DRAFTS/$f"
done

psql -v ON_ERROR_STOP=1 -q -f "$BASE/02-p1-05-prereqs.sql"
echo "--- applying P1-05-PASS-THRESHOLD-48.sql"
psql -v ON_ERROR_STOP=1 -q -f "$DRAFTS/P1-05-PASS-THRESHOLD-48.sql"

echo "--- harness extension (create/submit/workflow preimages + legacy bypasses)"
psql -v ON_ERROR_STOP=1 -q -f "$HARNESS/00-harness-ext.sql"

echo "--- applying P1-06-ATOMIC-SUBMIT-PATH.sql"
psql -v ON_ERROR_STOP=1 -q -f "$DRAFTS/P1-06-ATOMIC-SUBMIT-PATH.sql"
echo "--- re-applying P1-06-ATOMIC-SUBMIT-PATH.sql (idempotency)"
psql -v ON_ERROR_STOP=1 -q -f "$DRAFTS/P1-06-ATOMIC-SUBMIT-PATH.sql"

echo "--- matrix"
psql -v ON_ERROR_STOP=1 -q -f "$HARNESS/01-cases.sql"

echo "P1_06_ATOMIC_SUBMIT_PG17_REHEARSAL_PASS"
