#!/usr/bin/env bash
# PG17 isolated rehearsal for P1-08-STRICT-RUNTIME-ASSIGNMENT-REUSE.sql.
# Never touches production: throwaway cluster, production-shaped preimages.
#   base harness -> P1-01..P1-06 -> strict preimages -> P1-07 -> fixtures
#   -> P1-08 (applied twice for idempotency) -> matrix
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
DRAFTS="$ROOT/docs/migration-drafts/p1"
BASE="$ROOT/scripts/p1-source-closure-02-pg17"
ATOMIC="$ROOT/scripts/p1-atomic-submit-07a-pg17"
HARNESS="$ROOT/scripts/p1-strict-assignment-08a-pg17"
PGDIR="${PGDIR:-/tmp/p1-strict-pg17}"
PORT="${PORT:-55434}"

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

echo "--- base harness"
psql -v ON_ERROR_STOP=1 -q -f "$BASE/00-harness.sql"

for f in P1-01-DETAIL-MODELS.sql P1-02-BACKEND-VALIDATION.sql \
         P1-03-WORKFLOW-SEEDS.sql P1-04-GRADE-APPEAL-TRIGGER-REPLACE.sql; do
  echo "--- applying $f"
  psql -v ON_ERROR_STOP=1 -q -f "$DRAFTS/$f"
done
psql -v ON_ERROR_STOP=1 -q -f "$BASE/02-p1-05-prereqs.sql"
echo "--- applying P1-05-PASS-THRESHOLD-48.sql"
psql -v ON_ERROR_STOP=1 -q -f "$DRAFTS/P1-05-PASS-THRESHOLD-48.sql"

echo "--- atomic-submit harness extension"
psql -v ON_ERROR_STOP=1 -q -f "$ATOMIC/00-harness-ext.sql"
echo "--- applying P1-06-ATOMIC-SUBMIT-PATH.sql"
psql -v ON_ERROR_STOP=1 -q -f "$DRAFTS/P1-06-ATOMIC-SUBMIT-PATH.sql"

echo "--- strict-runtime production preimages"
psql -v ON_ERROR_STOP=1 -q -f "$HARNESS/00-strict-preimages.sql"

echo "--- applying P1-07-WORKFLOW-TRANSITIONS-AND-SPECIALIZED-ACTIONS.sql"
psql -v ON_ERROR_STOP=1 -q -f "$DRAFTS/P1-07-WORKFLOW-TRANSITIONS-AND-SPECIALIZED-ACTIONS.sql"

echo "--- fixtures (production actor topology + the 3 TEST_ONLY runtimes)"
psql -v ON_ERROR_STOP=1 -q -f "$HARNESS/01-fixtures.sql"

echo "--- preflight: the 3 TEST_ONLY runtimes have ZERO direct assignees"
psql -v ON_ERROR_STOP=1 -Atc "
  do \$\$
  begin
    if (select count(*) from public.student_request_workflow_steps s
        join public.student_requests r on r.id = s.student_request_id
        where r.request_number in ('SR-20260816-14A2339B','SR-20260816-F01018CE','SR-20260816-E852B4E3')
          and num_nonnulls(s.assigned_user_id,s.assigned_staff_profile_id,
              s.assigned_faculty_profile_id,s.assigned_position_assignment_id) = 0) <> 13 then
      raise exception 'PREFLIGHT_FAIL_EXPECTED_13_UNASSIGNED_RUNTIME_ROWS';
    end if;
  end \$\$;"

echo "--- applying P1-08-STRICT-RUNTIME-ASSIGNMENT-REUSE.sql"
psql -v ON_ERROR_STOP=1 -q -f "$DRAFTS/P1-08-STRICT-RUNTIME-ASSIGNMENT-REUSE.sql"
echo "--- re-applying P1-08 (idempotency)"
psql -v ON_ERROR_STOP=1 -q -f "$DRAFTS/P1-08-STRICT-RUNTIME-ASSIGNMENT-REUSE.sql"

echo "--- matrix"
psql -v ON_ERROR_STOP=1 -f "$HARNESS/02-cases.sql"

echo "P1_08_STRICT_RUNTIME_ASSIGNMENT_PG17_REHEARSAL_PASS"
