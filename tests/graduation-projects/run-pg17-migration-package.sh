#!/usr/bin/env bash
# GRADUATION-PROJECTS migration package — disposable PostgreSQL 17 verification.
# Applies the packaged migrations ONE AT A TIME (preflight -> apply -> verifier)
# inside a throwaway postgres:17 container. Every verifier ends in ROLLBACK;
# the container is destroyed on exit. NEVER point this at a real database.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
GP="$ROOT/tests/graduation-projects"
MIG="$ROOT/supabase/migrations"
CONTAINER="gp-pg17-verify-$$"

docker run --rm -d --name "$CONTAINER" -e POSTGRES_PASSWORD=postgres postgres:17 >/dev/null
cleanup() { docker rm -f "$CONTAINER" >/dev/null 2>&1 || true; }
trap cleanup EXIT

ready=0
for _ in $(seq 1 60); do
  if docker exec "$CONTAINER" pg_isready -U postgres >/dev/null 2>&1; then ready=1; break; fi
  sleep 1
done
[ "$ready" = "1" ] || { echo "postgres:17 failed to start"; exit 1; }

step() { echo "== $1"; }
sql() { docker exec -i "$CONTAINER" psql -v ON_ERROR_STOP=on -U postgres -q -f - < "$1" >/dev/null; echo "   applied: ${1#$ROOT/}"; }
verify() { docker exec -i "$CONTAINER" psql -v ON_ERROR_STOP=on -U postgres -q \
  -v department_id=20000000-0000-0000-0000-000000000001 \
  -v student_profile_id=30000000-0000-0000-0000-000000000001 \
  -v student_user_id=10000000-0000-0000-0000-000000000001 \
  -v faculty_profile_id=40000000-0000-0000-0000-000000000001 \
  -v faculty_user_id=10000000-0000-0000-0000-000000000002 \
  -f - < "$1" >/dev/null; echo "   verified: ${1#$ROOT/}"; }

step "minimal schema"
sql "$GP/postgres-minimal-schema.sql"

step "M1 20260730100000 foundation"
sql "$GP/pg17/preflight-01-foundation.sql"
sql "$MIG/20260730100000_b1b476e7-0c92-42cf-80e3-925d7941d780.sql"
verify "$GP/postgres-foundation-verifier.sql"

step "M2 20260730100001 lifecycle completion"
sql "$GP/pg17/preflight-02-lifecycle.sql"
sql "$MIG/20260730100001_96beebe1-d809-4302-a782-c2f6483e102a.sql"
verify "$GP/postgres-lifecycle-verifier.sql"

step "M3 20260730100002 co_supervisor enum"
sql "$GP/pg17/preflight-03-co-supervisor-enum.sql"
sql "$MIG/20260730100002_c8f89b6d-6521-4597-97bc-aae0b837023f.sql"

step "M4 20260730100003 completion hardening"
sql "$GP/pg17/preflight-04-hardening.sql"
sql "$MIG/20260730100003_1811ed11-afad-4cbc-8f8a-287ba5b13a19.sql"

step "post-hardening regression: foundation + lifecycle verifiers re-run"
verify "$GP/postgres-foundation-verifier.sql"
verify "$GP/postgres-lifecycle-verifier.sql"

step "hardening verifier"
verify "$GP/postgres-hardening-verifier.sql"

step "M5 20260730100004 files & notifications"
sql "$GP/pg17/preflight-05-files-notifications.sql"
sql "$MIG/20260730100004_ff96c58a-8c93-4abe-9d0f-f0f44fe25a11.sql"

step "post-M5 regression: foundation + lifecycle + hardening verifiers re-run"
verify "$GP/postgres-foundation-verifier.sql"
verify "$GP/postgres-lifecycle-verifier.sql"
verify "$GP/postgres-hardening-verifier.sql"

step "files & notifications verifier"
verify "$GP/postgres-files-notifications-verifier.sql"

step "M6 20260730100005 admin settings & rubrics"
sql "$GP/pg17/preflight-06-admin-settings.sql"
sql "$MIG/20260730100005_a69a1dc9-8b9f-4dfc-a5e8-69a335909c8b.sql"

step "post-M6 regression: all prior verifiers re-run"
verify "$GP/postgres-foundation-verifier.sql"
verify "$GP/postgres-lifecycle-verifier.sql"
verify "$GP/postgres-hardening-verifier.sql"
verify "$GP/postgres-files-notifications-verifier.sql"

step "admin settings verifier"
verify "$GP/postgres-admin-settings-verifier.sql"

echo "MIGRATION PACKAGE PG17 VERIFICATION PASS"
