#!/usr/bin/env bash
# PORTAL-GA-FINAL-PRODUCTION-READINESS-LONGRUN-14
# Failure / partial-state rehearsal against disposable PostgreSQL 17.
# Each scenario runs in its own container for isolation.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
USER="postgres"
DB="postgres"
export PGPASSWORD="ci_pg_verifier_password"

SETUP="$ROOT/tests/graduates-affairs/graduates-affairs-authorization-04.pg-setup.sql"
FOUNDATION="$ROOT/supabase/migrations/20260808210000_ga_mvp_foundation_01.sql"
COMPLETION="$ROOT/supabase/migrations/20260808210100_ga_mvp_completion_01.sql"
AUTH04="$ROOT/supabase/migrations/20260808210200_ga_authorization_04.sql"
CONFIG="$ROOT/docs/migration-drafts/GA-PRODUCTION-PROMOTION-CONFIG-01.sql"

PASS=0
FAIL=0

start_container() {
  local name="ga-failure-matrix-$(date +%s)-$RANDOM"
  docker run -d --name "$name" \
    -e POSTGRES_HOST_AUTH_METHOD=trust \
    -e POSTGRES_PASSWORD="$PGPASSWORD" \
    postgres:17 >/dev/null
  for i in {1..60}; do
    if docker exec "$name" pg_isready -U "$USER" -d "$DB" >/dev/null 2>&1; then
      break
    fi
    sleep 1
  done
  echo "$name"
}

stop_container() {
  local name="$1"
  docker rm -f "$name" >/dev/null 2>&1 || true
}

psql_file() {
  local name="$1"
  local file="$2"
  shift 2
  docker exec -i "$name" psql -v ON_ERROR_STOP=1 -U "$USER" -d "$DB" "$@" < "$file" 2>&1 || true
}

psql_sql() {
  local name="$1"
  shift
  docker exec -i "$name" psql -v ON_ERROR_STOP=1 -U "$USER" -d "$DB" 2>&1 || true <<EOF
$@
EOF
}

expect_failure() {
  local label="$1"
  local expected="$2"
  local output="$3"
  if echo "$output" | grep -q "$expected"; then
    echo "  [PASS] $label"
    PASS=$((PASS+1))
  else
    echo "  [FAIL] $label (expected: $expected)"
    echo "$output" | tail -5
    FAIL=$((FAIL+1))
  fi
}

echo "==> Scenario 1: Foundation already applied (re-apply must fail closed)"
C=$(start_container)
psql_file "$C" "$SETUP" >/dev/null
psql_file "$C" "$FOUNDATION" >/dev/null
OUT=$(psql_file "$C" "$FOUNDATION")
expect_failure "Foundation re-apply" "GA_FOUNDATION_PREFLIGHT_ALREADY_APPLIED" "$OUT"
stop_container "$C"

echo "==> Scenario 2: Foundation absent but Completion attempted"
C=$(start_container)
psql_file "$C" "$SETUP" >/dev/null
OUT=$(psql_file "$C" "$COMPLETION")
expect_failure "Completion without Foundation" "GA_COMPLETION_PREFLIGHT_MISSING" "$OUT"
stop_container "$C"

echo "==> Scenario 3: Completion absent but AUTH04 attempted"
C=$(start_container)
psql_file "$C" "$SETUP" >/dev/null
psql_file "$C" "$FOUNDATION" >/dev/null
OUT=$(psql_file "$C" "$AUTH04")
expect_failure "AUTH04 without Completion" "GA_AUTH04_PREFLIGHT_MISSING" "$OUT"
stop_container "$C"

echo "==> Scenario 4: Foundation applied then Completion failure (partial apply)"
C=$(start_container)
psql_file "$C" "$SETUP" >/dev/null
psql_file "$C" "$FOUNDATION" >/dev/null
# Pre-create a completion table to simulate a partial/conflicting prestate.
docker exec -i "$C" psql -U "$USER" -d "$DB" -c "CREATE TABLE graduate_followups (id uuid PRIMARY KEY);" >/dev/null 2>&1 || true
OUT=$(psql_file "$C" "$COMPLETION")
expect_failure "Completion after partial Foundation" "ERROR" "$OUT"
stop_container "$C"

echo "==> Scenario 5: Foundation+Completion then AUTH04 failure (partial apply)"
C=$(start_container)
psql_file "$C" "$SETUP" >/dev/null
psql_file "$C" "$FOUNDATION" >/dev/null
psql_file "$C" "$COMPLETION" >/dev/null
# Damage completion state by dropping a completion table.
docker exec -i "$C" psql -U "$USER" -d "$DB" -c "DROP TABLE graduate_followups;" >/dev/null 2>&1 || true
OUT=$(psql_file "$C" "$AUTH04")
expect_failure "AUTH04 after partial Completion" "ERROR" "$OUT"
stop_container "$C"

echo "==> Scenario 6: Full schema but config absent (empty inputs)"
C=$(start_container)
psql_file "$C" "$SETUP" >/dev/null
psql_file "$C" "$FOUNDATION" >/dev/null
psql_file "$C" "$COMPLETION" >/dev/null
psql_file "$C" "$AUTH04" >/dev/null
OUT=$(psql_file "$C" "$CONFIG")
expect_failure "Config without inputs" "CONFIG HOLD" "$OUT"
stop_container "$C"

echo "==> Scenario 7: Unit/role conflict (missing canonical graduate_affairs unit)"
C=$(start_container)
psql_file "$C" "$SETUP" >/dev/null
# Remove the graduate_affairs unit.
docker exec -i "$C" psql -U "$USER" -d "$DB" -c "DELETE FROM request_processing_units WHERE code = 'graduate_affairs';" >/dev/null 2>&1 || true
OUT=$(psql_file "$C" "$FOUNDATION")
expect_failure "Foundation without unit" "GA_FOUNDATION_PREFLIGHT_MISSING_UNIT" "$OUT"
stop_container "$C"

echo "==> Scenario 8: Duplicate current continuity"
C=$(start_container)
psql_file "$C" "$SETUP" >/dev/null
psql_file "$C" "$FOUNDATION" >/dev/null
psql_file "$C" "$COMPLETION" >/dev/null
psql_file "$C" "$AUTH04" >/dev/null
# Pre-seed a current policy.
psql_sql "$C" "INSERT INTO graduate_account_continuity_policies (policy_code, policy_state, allow_portal_sign_in, allow_university_email_reuse, allowed_capabilities, decided_by, decided_at, is_current) VALUES ('graduate-account-continuity', 'approved', true, false, '[]'::jsonb, (SELECT id FROM auth.users LIMIT 1), now(), true);" >/dev/null 2>&1 || true
OUT=$(psql_file "$C" "$CONFIG")
expect_failure "Duplicate current continuity" "CONFIG HOLD" "$OUT"
stop_container "$C"

echo "==> Scenario 9: Ambiguous staff identity"
C=$(start_container)
psql_file "$C" "$SETUP" >/dev/null
psql_file "$C" "$FOUNDATION" >/dev/null
psql_file "$C" "$COMPLETION" >/dev/null
psql_file "$C" "$AUTH04" >/dev/null
# Create two active staff profiles for the same manager user.
psql_sql "$C" "INSERT INTO staff_profiles (id, user_id, status) VALUES ('70000000-0000-0000-0000-000000000001', (SELECT id FROM auth.users LIMIT 1), 'active'), ('70000000-0000-0000-0000-000000000002', (SELECT id FROM auth.users LIMIT 1), 'active');" >/dev/null 2>&1 || true
OUT=$(psql_file "$C" "$CONFIG" -v manager_staff_profile_id="70000000-0000-0000-0000-000000000001" -v specialist_staff_profile_id="00000000-0000-0000-0000-000000000000" -v specialist_department_id="00000000-0000-0000-0000-000000000000" -v continuity_decided_by_user_id="00000000-0000-0000-0000-000000000000")
expect_failure "Ambiguous staff identity" "CONFIG HOLD" "$OUT"
stop_container "$C"

echo "==> Scenario 10: Wrong department scope"
C=$(start_container)
psql_file "$C" "$SETUP" >/dev/null
psql_file "$C" "$FOUNDATION" >/dev/null
psql_file "$C" "$COMPLETION" >/dev/null
psql_file "$C" "$AUTH04" >/dev/null
# Use valid UUIDs but wrong department scope for specialist.
DECIDED_BY=$(docker exec -i "$C" psql -U "$USER" -d "$DB" -At -c "SELECT id FROM auth.users LIMIT 1;")
psql_sql "$C" "INSERT INTO staff_profiles (id, user_id, status) VALUES ('80000000-0000-0000-0000-000000000001', '$DECIDED_BY', 'active'), ('80000000-0000-0000-0000-000000000002', (SELECT id FROM auth.users ORDER BY id LIMIT 1 OFFSET 1), 'active'); INSERT INTO staff_profile_departments (staff_profile_id, department_id) VALUES ('80000000-0000-0000-0000-000000000002', (SELECT id FROM departments LIMIT 1));" >/dev/null 2>&1 || true
OUT=$(psql_file "$C" "$CONFIG" -v manager_staff_profile_id="80000000-0000-0000-0000-000000000001" -v specialist_staff_profile_id="80000000-0000-0000-0000-000000000002" -v specialist_department_id="00000000-0000-0000-0000-000000000000" -v continuity_decided_by_user_id="$DECIDED_BY")
expect_failure "Wrong department scope" "CONFIG HOLD" "$OUT"
stop_container "$C"

echo ""
echo "==> FAILURE MATRIX RESULT: $PASS pass, $FAIL fail"
if [ "$FAIL" -eq 0 ]; then
  echo "LOCAL_FAILURE_MATRIX_REHEARSAL_PASS"
  exit 0
else
  echo "LOCAL_FAILURE_MATRIX_REHEARSAL_FAIL"
  exit 1
fi
