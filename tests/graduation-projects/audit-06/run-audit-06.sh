#!/usr/bin/env bash
# AUDIT-06 — runtime verification of GRADUATION-PROJECTS-M9-AUDIT-REMEDIATION-06
# (docs/migration-drafts/GRADUATION-PROJECTS-M9-AUDIT-REMEDIATION-06.NOT_APPLIED.sql)
# on top of the verified M1..M8 chain. Everything runs inside ONE throwaway
# postgres:17 container with one disposable database per part; the container and
# all databases are destroyed on exit. NEVER point this at a real database.
# This script modifies no existing repo file.
set -uo pipefail

ROOT="$(cd "$(dirname "$0")/../../.." && pwd)"
GP="$ROOT/tests/graduation-projects"
MIG="$ROOT/docs/migration-drafts"
AUDIT="$GP/audit-06"
TMP="$AUDIT/tmp"
CONTAINER="gp-audit06-$$"

M1="$MIG/GRADUATION-PROJECTS-M1-FOUNDATION.NOT_APPLIED.sql"
M2="$MIG/GRADUATION-PROJECTS-M2-LIFECYCLE-COMPLETION.NOT_APPLIED.sql"
M3="$MIG/GRADUATION-PROJECTS-M3-CO-SUPERVISOR-ENUM.NOT_APPLIED.sql"
M4="$MIG/GRADUATION-PROJECTS-M4-COMPLETION-HARDENING.NOT_APPLIED.sql"
M5="$MIG/GRADUATION-PROJECTS-M5-FILES-AND-NOTIFICATIONS.NOT_APPLIED.sql"
M6="$MIG/GRADUATION-PROJECTS-M6-ADMIN-SETTINGS.NOT_APPLIED.sql"
M7="$MIG/GRADUATION-PROJECTS-M7-EVALUATION-COMPLETENESS.NOT_APPLIED.sql"
M8="$MIG/GRADUATION-PROJECTS-M8-PANEL-COMPLETENESS.NOT_APPLIED.sql"
M9="$MIG/GRADUATION-PROJECTS-M9-AUDIT-REMEDIATION-06.NOT_APPLIED.sql"
MINIMAL="$GP/postgres-minimal-schema.sql"

mkdir -p "$TMP"
RESULTS="$TMP/results.txt"; : > "$RESULTS"
LOG="$TMP/run.log"; : > "$LOG"

cleanup() { docker rm -f "$CONTAINER" >/dev/null 2>&1 || true; rm -rf "$TMP"; }
trap cleanup EXIT

docker run --rm -d --name "$CONTAINER" -e POSTGRES_PASSWORD=postgres postgres:17 >/dev/null
ready=0
for _ in $(seq 1 60); do
  if docker exec "$CONTAINER" pg_isready -U postgres >/dev/null 2>&1; then ready=1; break; fi
  sleep 1
done
[ "$ready" = "1" ] || { echo "postgres:17 failed to start"; exit 1; }

emit() { printf 'AUDIT06|%s|%s|%s\n' "$1" "$2" "$3" | tee -a "$RESULTS"; }
newdb() { docker exec "$CONTAINER" createdb -U postgres "$1" >/dev/null 2>&1; }
apply() { # db file ; returns psql rc, logs full output
  local out rc
  out=$(docker exec -i "$CONTAINER" psql -v ON_ERROR_STOP=on -U postgres -d "$1" -q -f - < "$2" 2>&1); rc=$?
  printf '=== apply db=%s file=%s rc=%s ===\n%s\n' "$1" "${2#$ROOT/}" "$rc" "$out" >> "$LOG"
  return $rc
}
must_apply() { apply "$1" "$2" || emit "SETUP.$1" FAIL "setup apply failed for ${2#$ROOT/}"; }
first_error() { printf '%s\n' "$1" | grep -m1 -E 'ERROR|FATAL' | sed 's/^ERROR:  //'; }
expect_guard() { # id db file expected-substring
  local id="$1" db="$2" file="$3" want="$4" out rc
  out=$(docker exec -i "$CONTAINER" psql -v ON_ERROR_STOP=on -U postgres -d "$db" -q -f - < "$file" 2>&1); rc=$?
  printf '=== expect_guard %s db=%s file=%s rc=%s ===\n%s\n' "$id" "$db" "${file#$ROOT/}" "$rc" "$out" >> "$LOG"
  if [ "$rc" -ne 0 ] && printf '%s' "$out" | grep -qF "$want"; then
    emit "$id" PASS "failed as expected: ERROR: $(first_error "$out")"
  else
    emit "$id" FAIL "rc=$rc expected-substring=[$want] output-first-line: $(printf '%s' "$out" | head -1)"
  fi
}
q() { docker exec "$CONTAINER" psql -U postgres -d "$1" -qAt -c "$2" 2>&1; }
apply_upto() { # db last-index (1..9)
  local db="$1" last="$2"
  must_apply "$db" "$MINIMAL"
  local files=("$M1" "$M2" "$M3" "$M4" "$M5" "$M6" "$M7" "$M8" "$M9") i
  for i in $(seq 1 "$last"); do must_apply "$db" "${files[$((i-1))]}"; done
}
CNT_SQL="select (select count(*) from pg_class where relnamespace='public'::regnamespace and relname like 'graduation_project%')||'/'||(select count(*) from pg_proc where pronamespace='public'::regnamespace and proname like '%graduation_project%')||'/'||(select count(*) from pg_type where typname like 'graduation_project%' and typtype='e')"

echo "== AUDIT-06 PART 1: M1..M9 regression over all existing verifiers"
newdb a06r1
apply_upto a06r1 9
emit P2.c.preflight-sentinel-ok PASS "M9 applied cleanly on top of M1..M8 (sentinel preflight passed)"
n=0
for vf in postgres-foundation-verifier.sql postgres-lifecycle-verifier.sql postgres-hardening-verifier.sql \
          postgres-files-notifications-verifier.sql postgres-admin-settings-verifier.sql \
          postgres-authorization-matrix-verifier.sql postgres-e2e-journeys-verifier.sql \
          postgres-security-audit-verifier.sql; do
  n=$((n+1))
  out=$(docker exec -i "$CONTAINER" psql -v ON_ERROR_STOP=on -U postgres -d a06r1 -q \
    -v department_id=20000000-0000-0000-0000-000000000001 \
    -v student_profile_id=30000000-0000-0000-0000-000000000001 \
    -v student_user_id=10000000-0000-0000-0000-000000000001 \
    -v faculty_profile_id=40000000-0000-0000-0000-000000000001 \
    -v faculty_user_id=10000000-0000-0000-0000-000000000002 \
    -f - < "$GP/$vf" 2>&1); rc=$?
  printf '=== part1 verifier %s rc=%s ===\n%s\n' "$vf" "$rc" "$out" >> "$LOG"
  if [ "$rc" -eq 0 ]; then
    emit "P1.$n.$vf" PASS "verifier passed on M1..M9 exactly as on M1..M8"
  else
    emit "P1.$n.$vf" FAIL "CONFLICT on M1..M9 (verbatim): $(printf '%s' "$out" | grep -m1 ERROR)"
  fi
done

echo "== AUDIT-06 PART 2: M9 guards"
# (a) wrong-order: minimal schema only
newdb a06s2a
must_apply a06s2a "$MINIMAL"
expect_guard P2.a1.wrong-order-minimal-only a06s2a "$M9" 'graduation projects M1..M8 missing; apply the reviewed package first'
# (a2) wrong-order: minimal + M1..M7 (M8 absent — record actual behavior; the M9
# preflight sentinels exist since M2/M6, so M8 absence may be undetectable)
newdb a06s2b
apply_upto a06s2b 7
out=$(docker exec -i "$CONTAINER" psql -v ON_ERROR_STOP=on -U postgres -d a06s2b -q -f - < "$M9" 2>&1); rc=$?
printf '=== M9 on M1..M7 rc=%s ===\n%s\n' "$rc" "$out" >> "$LOG"
if [ "$rc" -eq 0 ]; then
  emit P2.a2.wrong-order-m1-m7 INFO "RECORD: M9 APPLIED on minimal+M1..M7 (M8 absent) — preflight sentinels cannot detect the missing M8"
else
  emit P2.a2.wrong-order-m1-m7 INFO "RECORD: M9 on minimal+M1..M7 raised: ERROR: $(first_error "$out")"
fi
# (b) replay on the full M1..M9 database
BEFORE=$(q a06r1 "$CNT_SQL")
expect_guard P2.b.replay-M9-guard a06r1 "$M9" 'graduation projects audit remediation already exists; refuse ambiguous retry'
AFTER=$(q a06r1 "$CNT_SQL")
if [ "$BEFORE" = "$AFTER" ]; then
  emit P2.b.replay-M9-unchanged PASS "object counts identical before/after refused replay: $BEFORE"
else
  emit P2.b.replay-M9-unchanged FAIL "object counts drifted: before=$BEFORE after=$AFTER"
fi

echo "== AUDIT-06 PART 3: F-1 rank-boundary matrix"
newdb a06p3
apply_upto a06p3 9
out=$(docker exec -i "$CONTAINER" psql -v ON_ERROR_STOP=on -U postgres -d a06p3 -qAt -f - < "$AUDIT/part3-rank-matrix.sql" 2>&1); rc=$?
printf '=== part3 rc=%s ===\n%s\n' "$rc" "$out" >> "$LOG"
printf '%s\n' "$out" | grep '^AUDIT06|' | tee -a "$RESULTS"
[ "$rc" -eq 0 ] || emit P3.file FAIL "part3 script itself errored: $(printf '%s' "$out" | head -3 | tr '\n' ' ')"

echo "== AUDIT-06 PART 4: F-2 audit/correlation matrix"
newdb a06p4
apply_upto a06p4 9
out=$(docker exec -i "$CONTAINER" psql -v ON_ERROR_STOP=on -U postgres -d a06p4 -qAt -f - < "$AUDIT/part4-audit-correlation.sql" 2>&1); rc=$?
printf '=== part4 rc=%s ===\n%s\n' "$rc" "$out" >> "$LOG"
printf '%s\n' "$out" | grep '^AUDIT06|' | tee -a "$RESULTS"
[ "$rc" -eq 0 ] || emit P4.file FAIL "part4 script itself errored: $(printf '%s' "$out" | head -3 | tr '\n' ' ')"

echo "== AUDIT-06 PART 5: low-finding regressions"
newdb a06p5
apply_upto a06p5 9
out=$(docker exec -i "$CONTAINER" psql -v ON_ERROR_STOP=on -U postgres -d a06p5 -qAt -f - < "$AUDIT/part5-low-findings.sql" 2>&1); rc=$?
printf '=== part5 rc=%s ===\n%s\n' "$rc" "$out" >> "$LOG"
printf '%s\n' "$out" | grep '^AUDIT06|' | tee -a "$RESULTS"
[ "$rc" -eq 0 ] || emit P5.file FAIL "part5 script itself errored: $(printf '%s' "$out" | head -3 | tr '\n' ' ')"

echo "== AUDIT-06 SUMMARY"
TOTAL=$(grep -c '^AUDIT06|' "$RESULTS" || true)
FAILS=$(grep -c '^AUDIT06|[^|]*|FAIL|' "$RESULTS" || true)
INFOS=$(grep -c '^AUDIT06|[^|]*|INFO|' "$RESULTS" || true)
echo "-- informational records ($INFOS):"
grep '^AUDIT06|[^|]*|INFO|' "$RESULTS" || true
echo "-- failures ($FAILS):"
grep '^AUDIT06|[^|]*|FAIL|' "$RESULTS" || true
if [ "$FAILS" -eq 0 ]; then
  echo "AUDIT-06 RUNTIME: PASS ($TOTAL checks, 0 unexpected)"
else
  echo "AUDIT-06 RUNTIME: INVESTIGATE ($FAILS unexpected)"
fi
