#!/usr/bin/env bash
# PORTAL-GA-CROSS-PLATFORM-FAILURE-RECOVERY-AND-OPERATOR-REHEARSAL-LONGRUN-16
# Linux/CI companion for the failure matrix.
# CANONICAL operator contract on Windows: scripts/ga-failure-matrix-rehearsal.ps1
# This Bash runner is retained for Linux convenience only.
#
# Portability notes (root causes fixed here):
#   1) Working-tree CRLF under core.autocrlf=true made `start_container() {^M`
#      a syntax error in WSL/Git Bash. .gitattributes forces LF for this path;
#      inputs are also stripped of CR before docker/psql.
#   2) Windows path `C:\...` is not visible inside WSL without /mnt conversion.
#   3) `psql_sql` previously attached the heredoc to `true` (after `|| true`),
#      so SQL never reached psql.
#   4) Generic `|| true` + bare "ERROR" markers hid unexpected failures.
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

lf_copy() {
  local src="$1"
  local dst
  dst="$(mktemp)"
  tr -d '\r' < "$src" > "$dst"
  echo "$dst"
}

start_container() {
  local name="ga-failure-matrix-$(date +%s)-$RANDOM"
  docker run -d --name "$name" \
    -e POSTGRES_HOST_AUTH_METHOD=trust \
    -e POSTGRES_PASSWORD="$PGPASSWORD" \
    postgres:17 >/dev/null
  for _ in $(seq 1 60); do
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

# Returns: prints output; sets global LAST_PSQL_EXIT
LAST_PSQL_EXIT=0
psql_file() {
  local name="$1"
  local file="$2"
  shift 2
  local tmp
  tmp="$(lf_copy "$file")"
  set +e
  OUTPUT="$(docker exec -i "$name" psql -v ON_ERROR_STOP=1 -U "$USER" -d "$DB" "$@" < "$tmp" 2>&1)"
  LAST_PSQL_EXIT=$?
  set -e
  rm -f "$tmp"
  printf '%s' "$OUTPUT"
}

psql_sql() {
  local name="$1"
  shift
  set +e
  # Heredoc MUST attach to docker exec, not to `true`.
  OUTPUT="$(docker exec -i "$name" psql -v ON_ERROR_STOP=1 -U "$USER" -d "$DB" 2>&1 <<EOF
$@
EOF
)"
  LAST_PSQL_EXIT=$?
  set -e
  printf '%s' "$OUTPUT"
}

fingerprint() {
  local name="$1"
  local base extra
  base="$(docker exec -i "$name" psql -At -U "$USER" -d "$DB" <<'EOF'
SELECT coalesce(md5(string_agg(part, E'\n' ORDER BY part)), 'empty')
FROM (
  SELECT 'table:' || c.relname AS part
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public' AND c.relkind = 'r' AND c.relname LIKE 'graduate_%'
  UNION ALL
  SELECT 'policy:' || p.tablename || ':' || p.policyname
  FROM pg_policies p
  WHERE p.schemaname = 'public' AND p.tablename LIKE 'graduate_%'
  UNION ALL
  SELECT 'fn:' || pr.proname
  FROM pg_proc pr
  JOIN pg_namespace n ON n.oid = pr.pronamespace
  WHERE n.nspname = 'public'
    AND (pr.proname LIKE 'graduate_%' OR pr.proname LIKE '%graduate_affairs%')
  UNION ALL
  SELECT 'unit:' || u.code || ':' || u.is_active::text
  FROM public.request_processing_units u
  WHERE u.code = 'graduate_affairs'
) s;
EOF
)"
  if docker exec -i "$name" psql -At -U "$USER" -d "$DB" -c "SELECT EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind='r' AND c.relname='graduate_account_continuity_policies');" | grep -qx t; then
    extra="continuity_current:$(docker exec -i "$name" psql -At -U "$USER" -d "$DB" -c "SELECT count(*)::text FROM public.graduate_account_continuity_policies WHERE is_current;")"
  else
    extra="continuity_current:absent"
  fi
  printf '%s\n' "${base}|${extra}"
}

expect_failure() {
  local label="$1"
  local expected="$2"
  local output="$3"
  local exit_code="$4"
  local before_fp="${5:-}"
  local after_fp="${6:-}"
  local ok=1

  if [ "$exit_code" -eq 0 ]; then
    echo "  [FAIL] $label (expected non-zero exit; got 0 — SUCCESS misclassified)"
    ok=0
  fi
  if ! printf '%s' "$output" | grep -Fq "$expected"; then
    echo "  [FAIL] $label (expected marker: $expected)"
    printf '%s\n' "$output" | tail -5
    ok=0
  fi
  if [ -n "$before_fp" ] && [ -n "$after_fp" ] && [ "$before_fp" != "$after_fp" ]; then
    echo "  [FAIL] $label (unintended mutation before=$before_fp after=$after_fp)"
    ok=0
  fi

  if [ "$ok" -eq 1 ]; then
    echo "  [PASS] $label (EXPECTED_FAILURE exit=$exit_code marker=$expected)"
    PASS=$((PASS+1))
  else
    FAIL=$((FAIL+1))
  fi
}

echo "COMPANION_RUNNER=scripts/ga-failure-matrix-rehearsal.sh"
echo "CANONICAL_RUNNER=scripts/ga-failure-matrix-rehearsal.ps1"

echo "==> Scenario 1: Foundation already applied (re-apply must fail closed)"
C=$(start_container)
psql_file "$C" "$SETUP" >/dev/null
psql_file "$C" "$FOUNDATION" >/dev/null
BEFORE=$(fingerprint "$C")
OUT=$(psql_file "$C" "$FOUNDATION")
EC=$LAST_PSQL_EXIT
AFTER=$(fingerprint "$C")
expect_failure "Foundation re-apply" "GA_FOUNDATION_PREFLIGHT_ALREADY_APPLIED" "$OUT" "$EC" "$BEFORE" "$AFTER"
stop_container "$C"

echo "==> Scenario 2: Foundation absent but Completion attempted"
C=$(start_container)
psql_file "$C" "$SETUP" >/dev/null
BEFORE=$(fingerprint "$C")
OUT=$(psql_file "$C" "$COMPLETION")
EC=$LAST_PSQL_EXIT
AFTER=$(fingerprint "$C")
expect_failure "Completion without Foundation" "GA_COMPLETION_PREFLIGHT_MISSING" "$OUT" "$EC" "$BEFORE" "$AFTER"
stop_container "$C"

echo "==> Scenario 3: Completion absent but AUTH04 attempted"
C=$(start_container)
psql_file "$C" "$SETUP" >/dev/null
psql_file "$C" "$FOUNDATION" >/dev/null
BEFORE=$(fingerprint "$C")
OUT=$(psql_file "$C" "$AUTH04")
EC=$LAST_PSQL_EXIT
AFTER=$(fingerprint "$C")
expect_failure "AUTH04 without Completion" "GA_AUTH04_PREFLIGHT_MISSING" "$OUT" "$EC" "$BEFORE" "$AFTER"
stop_container "$C"

echo "==> Scenario 4: partial/conflicting Completion prestate"
C=$(start_container)
psql_file "$C" "$SETUP" >/dev/null
psql_file "$C" "$FOUNDATION" >/dev/null
docker exec -i "$C" psql -v ON_ERROR_STOP=1 -U "$USER" -d "$DB" -c "CREATE TABLE public.graduate_followups (id uuid PRIMARY KEY);" >/dev/null
OUT=$(psql_file "$C" "$COMPLETION")
EC=$LAST_PSQL_EXIT
# intentional partial: do not require fingerprint equality
expect_failure "Completion partial/conflicting prestate" "GA_COMPLETION_PREFLIGHT_ALREADY_APPLIED" "$OUT" "$EC"
stop_container "$C"

echo "==> Scenario 5: partial AUTH04 prestate"
C=$(start_container)
psql_file "$C" "$SETUP" >/dev/null
psql_file "$C" "$FOUNDATION" >/dev/null
psql_file "$C" "$COMPLETION" >/dev/null
docker exec -i "$C" psql -v ON_ERROR_STOP=1 -U "$USER" -d "$DB" -c "DROP TABLE public.graduate_followups;" >/dev/null
OUT=$(psql_file "$C" "$AUTH04")
EC=$LAST_PSQL_EXIT
expect_failure "AUTH04 after partial Completion" "GA_AUTH04_PREFLIGHT_MISSING" "$OUT" "$EC"
stop_container "$C"

echo "==> Scenario 6: Full schema but config absent (empty inputs)"
C=$(start_container)
psql_file "$C" "$SETUP" >/dev/null
psql_file "$C" "$FOUNDATION" >/dev/null
psql_file "$C" "$COMPLETION" >/dev/null
psql_file "$C" "$AUTH04" >/dev/null
BEFORE=$(fingerprint "$C")
OUT=$(psql_file "$C" "$CONFIG")
EC=$LAST_PSQL_EXIT
AFTER=$(fingerprint "$C")
expect_failure "Config without inputs" "CONFIG HOLD: manager_staff_profile_id is required" "$OUT" "$EC" "$BEFORE" "$AFTER"
stop_container "$C"

echo "==> Scenario 7: Unit/role conflict (missing canonical graduate_affairs unit)"
C=$(start_container)
psql_file "$C" "$SETUP" >/dev/null
docker exec -i "$C" psql -v ON_ERROR_STOP=1 -U "$USER" -d "$DB" -c "DELETE FROM public.request_processing_units WHERE code = 'graduate_affairs';" >/dev/null
BEFORE=$(fingerprint "$C")
OUT=$(psql_file "$C" "$FOUNDATION")
EC=$LAST_PSQL_EXIT
AFTER=$(fingerprint "$C")
expect_failure "Foundation without unit" "GA_FOUNDATION_PREFLIGHT_MISSING_UNIT" "$OUT" "$EC" "$BEFORE" "$AFTER"
stop_container "$C"

echo "==> Scenario 8: Duplicate current continuity"
C=$(start_container)
psql_file "$C" "$SETUP" >/dev/null
psql_file "$C" "$FOUNDATION" >/dev/null
psql_file "$C" "$COMPLETION" >/dev/null
psql_file "$C" "$AUTH04" >/dev/null
psql_sql "$C" "INSERT INTO public.graduate_account_continuity_policies (policy_code, policy_state, allow_portal_sign_in, allow_university_email_reuse, allowed_capabilities, decided_by, decided_at, is_current) VALUES ('graduate-account-continuity', 'approved', true, false, '[]'::jsonb, '10000000-0000-4000-8000-00000000000c'::uuid, now(), true);" >/dev/null
BEFORE=$(fingerprint "$C")
OUT=$(psql_file "$C" "$CONFIG" \
  -v manager_staff_profile_id="50000000-0000-4000-8000-00000000000c" \
  -v specialist_staff_profile_id="50000000-0000-4000-8000-00000000000d" \
  -v specialist_department_id="30000000-0000-4000-8000-000000000001" \
  -v continuity_decided_by_user_id="10000000-0000-4000-8000-00000000000c")
EC=$LAST_PSQL_EXIT
AFTER=$(fingerprint "$C")
expect_failure "Duplicate current continuity" "CONFIG HOLD: a current graduate_account_continuity_policies row already exists" "$OUT" "$EC" "$BEFORE" "$AFTER"
stop_container "$C"

echo "==> Scenario 9: Ambiguous staff identity"
C=$(start_container)
psql_file "$C" "$SETUP" >/dev/null
psql_file "$C" "$FOUNDATION" >/dev/null
psql_file "$C" "$COMPLETION" >/dev/null
psql_file "$C" "$AUTH04" >/dev/null
psql_sql "$C" "INSERT INTO public.staff_profiles (id, user_id, status) VALUES ('a1000000-0000-4000-8000-000000000001'::uuid, '10000000-0000-4000-8000-00000000000c'::uuid, 'active'), ('a1000000-0000-4000-8000-000000000002'::uuid, '10000000-0000-4000-8000-00000000000c'::uuid, 'active');" >/dev/null
BEFORE=$(fingerprint "$C")
OUT=$(psql_file "$C" "$CONFIG" \
  -v manager_staff_profile_id="a1000000-0000-4000-8000-000000000001" \
  -v specialist_staff_profile_id="00000000-0000-0000-0000-000000000000" \
  -v specialist_department_id="00000000-0000-0000-0000-000000000000" \
  -v continuity_decided_by_user_id="00000000-0000-0000-0000-000000000000")
EC=$LAST_PSQL_EXIT
AFTER=$(fingerprint "$C")
expect_failure "Ambiguous staff identity" "owns more than one active staff_profile" "$OUT" "$EC" "$BEFORE" "$AFTER"
stop_container "$C"

echo "==> Scenario 10: Wrong department scope"
C=$(start_container)
psql_file "$C" "$SETUP" >/dev/null
psql_file "$C" "$FOUNDATION" >/dev/null
psql_file "$C" "$COMPLETION" >/dev/null
psql_file "$C" "$AUTH04" >/dev/null
psql_sql "$C" "INSERT INTO public.staff_profiles (id, user_id, status) VALUES ('80000000-0000-4000-8000-000000000001'::uuid, '10000000-0000-4000-8000-000000000003'::uuid, 'active'), ('80000000-0000-4000-8000-000000000002'::uuid, '10000000-0000-4000-8000-000000000004'::uuid, 'active'); INSERT INTO public.staff_profile_departments (staff_profile_id, department_id) VALUES ('80000000-0000-4000-8000-000000000002'::uuid, '30000000-0000-4000-8000-000000000001'::uuid);" >/dev/null
BEFORE=$(fingerprint "$C")
OUT=$(psql_file "$C" "$CONFIG" \
  -v manager_staff_profile_id="80000000-0000-4000-8000-000000000001" \
  -v specialist_staff_profile_id="80000000-0000-4000-8000-000000000002" \
  -v specialist_department_id="00000000-0000-0000-0000-000000000000" \
  -v continuity_decided_by_user_id="10000000-0000-4000-8000-000000000003")
EC=$LAST_PSQL_EXIT
AFTER=$(fingerprint "$C")
expect_failure "Wrong department scope" "is not scoped to department" "$OUT" "$EC" "$BEFORE" "$AFTER"
stop_container "$C"

echo ""
echo "==> FAILURE MATRIX RESULT: $PASS pass, $FAIL fail"
if [ "$FAIL" -eq 0 ] && [ "$PASS" -eq 10 ]; then
  echo "LOCAL_FAILURE_MATRIX_REHEARSAL_PASS"
  exit 0
fi
echo "LOCAL_FAILURE_MATRIX_REHEARSAL_FAIL"
exit 1
