#!/usr/bin/env bash
# PORTAL-B1-FIVE-SERVICES-SAFE-RPC-FIXTURE-PACKAGE-RUNTIME-CONTRACT-REMEDIATION-15
# G7 — disposable local Postgres validation of the fixture + cleanup package.
# Never touches production. Creates and destroys a throwaway cluster in /tmp.
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PGDATA="${PGDATA:-/tmp/b1-fixture-15-pg}"
PORT="${PGPORT:-55415}"
export PGPORT="$PORT"
export PGHOST=/tmp
DB=b1fixture15

rm -rf "$PGDATA"
initdb -D "$PGDATA" -U postgres --auth=trust >/dev/null
pg_ctl -D "$PGDATA" -o "-p $PORT -k /tmp -c listen_addresses=''" -l "$PGDATA/log" -w start >/dev/null

cleanup() { pg_ctl -D "$PGDATA" -m immediate -w stop >/dev/null 2>&1 || true; }
trap cleanup EXIT

psql -U postgres -d postgres -qc "CREATE DATABASE $DB" >/dev/null
run() { psql -v ON_ERROR_STOP=1 -U postgres -d "$DB" -f "$1"; }

echo "== schema =="  && run "$HERE/pg/10-minimal-schema.sql" >/dev/null
echo "== seed =="    && run "$HERE/pg/20-seed.sql" >/dev/null
echo "== fixture apply =="
run "$HERE/../../docs/migration-drafts/B1-FIVE-SERVICES-SAFE-RPC-FIXTURES-13.NOT_APPLIED.sql"
echo "== verify =="
run "$HERE/pg/40-verify.sql"
echo "== cleanup apply =="
run "$HERE/../../docs/migration-drafts/B1-FIVE-SERVICES-SAFE-RPC-FIXTURES-CLEANUP-13.NOT_APPLIED.sql"
echo "== residue =="
psql -v ON_ERROR_STOP=1 -U postgres -d "$DB" -qtAc \
  "SELECT 'requests=' || (SELECT count(*) FROM public.student_requests WHERE internal_notes='TEST_ONLY_B1_FIXTURE_13')
        || ' steps='  || (SELECT count(*) FROM public.student_request_workflow_steps)
        || ' details='|| (SELECT count(*) FROM public.transfer_request_details)
        || ' certificate=' || (SELECT count(*) FROM public.student_requests WHERE request_type='enrollment_certificate')"
echo "LOCAL_FIXTURE_15_HARNESS_OK"
