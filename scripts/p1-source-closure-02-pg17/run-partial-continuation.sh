#!/usr/bin/env bash
# 06A: PARTIAL-STATE CONTINUATION rehearsal (isolated PG17 cluster, never production).
# Models the REAL current production state:
#   P1-01 applied, P1-02 applied, P1-03/04/05 absent.
# Then executes ONLY corrected P1-03 -> P1-04 -> P1-05 and verifies postconditions.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
DRAFTS="$ROOT/docs/migration-drafts/p1"
HARNESS="$ROOT/scripts/p1-source-closure-02-pg17"
PGDIR="${PGDIR:-/tmp/p1-pg17-partial}"
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
psql -v ON_ERROR_STOP=1 -q -f "$HARNESS/00-harness.sql"

# --- Phase A: reproduce the ALREADY-APPLIED production prefix (P1-01, P1-02).
echo "--- [pre-applied] P1-01-DETAIL-MODELS.sql"
psql -v ON_ERROR_STOP=1 -q -f "$DRAFTS/P1-01-DETAIL-MODELS.sql"
echo "--- [pre-applied] P1-02-BACKEND-VALIDATION.sql"
psql -v ON_ERROR_STOP=1 -q -f "$DRAFTS/P1-02-BACKEND-VALIDATION.sql"

# Assert the partial baseline matches production: 01/02 present, 03/04/05 absent.
psql -v ON_ERROR_STOP=1 -q <<'SQL'
DO $$
BEGIN
  IF to_regclass('public.october_exam_entry_details') IS NULL
     OR to_regclass('public.replacement_card_details') IS NULL THEN
    RAISE EXCEPTION 'PARTIAL_BASELINE_FAIL: P1-01 objects missing';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
                 WHERE n.nspname='public' AND p.proname='p1_final_result_published_at') THEN
    RAISE EXCEPTION 'PARTIAL_BASELINE_FAIL: P1-02 functions missing';
  END IF;
  IF EXISTS (SELECT 1 FROM public.request_type_workflows
             WHERE change_note = 'P1 source closure 02 seed') THEN
    RAISE EXCEPTION 'PARTIAL_BASELINE_FAIL: P1-03 residue present';
  END IF;
  IF EXISTS (SELECT 1 FROM public.request_types WHERE code='grade_appeal') THEN
    RAISE EXCEPTION 'PARTIAL_BASELINE_FAIL: grade_appeal residue present';
  END IF;
  RAISE NOTICE 'PARTIAL_BASELINE_OK (P1-01+P1-02 applied, P1-03..05 absent)';
END $$;
SQL

# --- Phase B: continuation only.
for f in P1-03-WORKFLOW-SEEDS.sql P1-04-GRADE-APPEAL-TRIGGER-REPLACE.sql; do
  echo "--- [continuation] applying $f"
  psql -v ON_ERROR_STOP=1 -q -f "$DRAFTS/$f"
  echo "--- [continuation] re-applying $f (idempotency)"
  psql -v ON_ERROR_STOP=1 -q -f "$DRAFTS/$f"
done

psql -v ON_ERROR_STOP=1 -q -f "$HARNESS/02-p1-05-prereqs.sql"
echo "--- [continuation] applying P1-05-PASS-THRESHOLD-48.sql"
psql -v ON_ERROR_STOP=1 -q -f "$DRAFTS/P1-05-PASS-THRESHOLD-48.sql"
echo "--- [continuation] re-applying P1-05-PASS-THRESHOLD-48.sql (idempotency)"
psql -v ON_ERROR_STOP=1 -q -f "$DRAFTS/P1-05-PASS-THRESHOLD-48.sql"

psql -v ON_ERROR_STOP=1 -q -f "$HARNESS/01-cases.sql"
psql -v ON_ERROR_STOP=1 -q -f "$HARNESS/03-p1-05-cases.sql"
psql -v ON_ERROR_STOP=1 -q -f "$HARNESS/04-status-parity-cases.sql"
echo "PARTIAL_STATE_CONTINUATION_REHEARSAL_PASS (P1-03 -> P1-05 from applied P1-01/P1-02)"
