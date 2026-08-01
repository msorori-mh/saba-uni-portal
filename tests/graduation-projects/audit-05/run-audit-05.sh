#!/usr/bin/env bash
# AUDIT-05 — INDEPENDENT runtime audit of the GRADUATION-PROJECTS M1..M8 forward-only
# migration package (docs/migration-drafts/GRADUATION-PROJECTS-M*.NOT_APPLIED.sql).
# Everything runs inside ONE throwaway postgres:17 container with one disposable
# database per scenario; the container and all databases are destroyed on exit.
# NEVER point this at a real database. This script modifies no existing repo file.
set -uo pipefail

ROOT="$(cd "$(dirname "$0")/../../.." && pwd)"
GP="$ROOT/tests/graduation-projects"
MIG="$ROOT/docs/migration-drafts"
AUDIT="$GP/audit-05"
TMP="$AUDIT/tmp"
CONTAINER="gp-audit05-$$"

M1="$MIG/GRADUATION-PROJECTS-M1-FOUNDATION.NOT_APPLIED.sql"
M2="$MIG/GRADUATION-PROJECTS-M2-LIFECYCLE-COMPLETION.NOT_APPLIED.sql"
M3="$MIG/GRADUATION-PROJECTS-M3-CO-SUPERVISOR-ENUM.NOT_APPLIED.sql"
M4="$MIG/GRADUATION-PROJECTS-M4-COMPLETION-HARDENING.NOT_APPLIED.sql"
M5="$MIG/GRADUATION-PROJECTS-M5-FILES-AND-NOTIFICATIONS.NOT_APPLIED.sql"
M6="$MIG/GRADUATION-PROJECTS-M6-ADMIN-SETTINGS.NOT_APPLIED.sql"
M7="$MIG/GRADUATION-PROJECTS-M7-EVALUATION-COMPLETENESS.NOT_APPLIED.sql"
M8="$MIG/GRADUATION-PROJECTS-M8-PANEL-COMPLETENESS.NOT_APPLIED.sql"
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

emit() { printf 'AUDIT05|%s|%s|%s\n' "$1" "$2" "$3" | tee -a "$RESULTS"; }
newdb() { docker exec "$CONTAINER" createdb -U postgres "$1" >/dev/null 2>&1; }
apply() { # db file ; returns psql rc, logs full output
  local out rc
  out=$(docker exec -i "$CONTAINER" psql -v ON_ERROR_STOP=on -U postgres -d "$1" -q -f - < "$2" 2>&1); rc=$?
  printf '=== apply db=%s file=%s rc=%s ===\n%s\n' "$1" "${2#$ROOT/}" "$rc" "$out" >> "$LOG"
  return $rc
}
must_apply() { apply "$1" "$2" || { emit "SETUP.$1" FAIL "setup apply failed for ${2#$ROOT/}"; }; }
first_error() { printf '%s\n' "$1" | grep -m1 -E 'ERROR|FATAL' | sed 's/^ERROR:  //'; }
# expect_guard <id> <db> <file> <expected-substring>
expect_guard() {
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

echo "== AUDIT-05 PART 1: order / replay / atomicity"

# ---- 1. wrong-order-M2-before-M1 -------------------------------------------
newdb a05s1
must_apply a05s1 "$MINIMAL"
expect_guard P1.1.wrong-order-M2-before-M1 a05s1 "$M2" 'graduation projects foundation missing; apply reviewed foundation first'

# ---- 2. wrong-order-M4-before-M3 -------------------------------------------
newdb a05s2
must_apply a05s2 "$MINIMAL"; must_apply a05s2 "$M1"; must_apply a05s2 "$M2"
expect_guard P1.2.wrong-order-M4-before-M3 a05s2 "$M4" 'co_supervisor enum value missing; apply the enum migration first'

# ---- 3. wrong-order-preflight ----------------------------------------------
newdb a05s3
must_apply a05s3 "$MINIMAL"
expect_guard P1.3.wrong-order-preflight-02 a05s3 "$GP/pg17/preflight-02-lifecycle.sql" 'PREFLIGHT FAIL: foundation missing; apply 20260730100000 first'

# ---- 4. replay-M1 ------------------------------------------------------------
newdb a05s4
must_apply a05s4 "$MINIMAL"; must_apply a05s4 "$M1"
CNT_SQL="select (select count(*) from pg_class where relnamespace='public'::regnamespace and relname like 'graduation_project%')||'/'||(select count(*) from pg_proc where pronamespace='public'::regnamespace and (proname like '%graduation_project%' or proname like 'guard_graduation%' or proname like 'reject_graduation%'))||'/'||(select count(*) from pg_type where typname like 'graduation_project%')"
BEFORE=$(q a05s4 "$CNT_SQL")
expect_guard P1.4.replay-M1-guard a05s4 "$M1" 'graduation projects foundation already exists; refuse ambiguous retry'
AFTER=$(q a05s4 "$CNT_SQL")
if [ "$BEFORE" = "$AFTER" ]; then
  emit P1.4.replay-M1-unchanged PASS "object counts identical before/after refused replay: $BEFORE"
else
  emit P1.4.replay-M1-unchanged FAIL "object counts drifted: before=$BEFORE after=$AFTER"
fi

# ---- shared full-apply database for items 5 and 7 ---------------------------
newdb a05full
must_apply a05full "$MINIMAL"
for m in "$M1" "$M2" "$M3" "$M4" "$M5" "$M6" "$M7" "$M8"; do must_apply a05full "$m"; done

# ---- 5. replay-M2..M8 ---------------------------------------------------------
i=1
for m in "$M2" "$M3" "$M4" "$M5" "$M6" "$M7" "$M8"; do
  i=$((i+1))
  out=$(docker exec -i "$CONTAINER" psql -v ON_ERROR_STOP=on -U postgres -d a05full -q -f - < "$m" 2>&1); rc=$?
  printf '=== replay M%s rc=%s ===\n%s\n' "$i" "$rc" "$out" >> "$LOG"
  if [ "$rc" -ne 0 ] && printf '%s' "$out" | grep -qF 'refuse ambiguous retry'; then
    emit "P1.5.replay-M$i" PASS "clean guard failure: ERROR: $(first_error "$out")"
  elif [ "$rc" -eq 0 ]; then
    emit "P1.5.replay-M$i" INFO "REPLAY SUCCEEDED (rc=0) — migration has no already-exists guard (create-or-replace only)"
  else
    emit "P1.5.replay-M$i" INFO "replay failed without the ambiguous-retry guard: ERROR: $(first_error "$out")"
  fi
done

# ---- 6a. partial-apply-atomicity (conflicting pre-existing object) -----------
newdb a05s6a
must_apply a05s6a "$MINIMAL"
docker exec -i "$CONTAINER" psql -v ON_ERROR_STOP=on -U postgres -d a05s6a -q -c 'create table public.graduation_projects(id uuid);' >/dev/null 2>&1
expect_guard P1.6a.partial-apply-guard a05s6a "$M1" 'graduation projects foundation already exists; refuse ambiguous retry'
LEFTOVER=$(q a05s6a "select (select count(*) from pg_class where relnamespace='public'::regnamespace and relname like 'graduation_project%' and relname<>'graduation_projects')||'/'||(select count(*) from pg_type where typname like 'graduation_project%' and typtype='e')||'/'||(select count(*) from pg_proc where pronamespace='public'::regnamespace and proname like '%graduation_project%')||'/'||(select count(*) from information_schema.columns where table_schema='public' and table_name='graduation_projects')")
if [ "$LEFTOVER" = "0/0/0/1" ]; then
  emit P1.6a.partial-apply-atomic PASS "abort was atomic: only the pre-existing 1-column conflict table remains (other-tables/types/functions/cols = $LEFTOVER)"
else
  emit P1.6a.partial-apply-atomic FAIL "leftover M1 objects after abort (other-tables/types/functions/cols = $LEFTOVER)"
fi

# ---- 6b. mid-migration fault injection ----------------------------------------
sed 's/^commit;$/select 1\/0;\ncommit;/' "$M1" > "$TMP/M1-fault-injected.sql"
grep -q 'select 1/0;' "$TMP/M1-fault-injected.sql" || { emit P1.6b.fault-injection FAIL "could not build fault-injected copy"; }
newdb a05s6b
must_apply a05s6b "$MINIMAL"
out=$(docker exec -i "$CONTAINER" psql -v ON_ERROR_STOP=on -U postgres -d a05s6b -q -f - < "$TMP/M1-fault-injected.sql" 2>&1); rc=$?
printf '=== fault-injected M1 rc=%s ===\n%s\n' "$rc" "$out" >> "$LOG"
if [ "$rc" -ne 0 ] && printf '%s' "$out" | grep -q 'division by zero'; then
  emit P1.6b.fault-injection-fails PASS "injected fault aborted the migration: ERROR: $(first_error "$out")"
else
  emit P1.6b.fault-injection-fails FAIL "rc=$rc unexpected output: $(printf '%s' "$out" | head -2 | tr '\n' ' ')"
fi
LEFTOVER=$(q a05s6b "select (select count(*) from pg_class where relnamespace='public'::regnamespace and relname like 'graduation_project%')||'/'||(select count(*) from pg_type where typname like 'graduation_project%')||'/'||(select count(*) from pg_proc where pronamespace='public'::regnamespace and proname like '%graduation_project%')")
if [ "$LEFTOVER" = "0/0/0" ]; then
  emit P1.6b.fault-injection-atomic PASS "zero M1 objects after mid-migration fault (tables+views/types/functions = $LEFTOVER)"
else
  emit P1.6b.fault-injection-atomic FAIL "leftover M1 objects after fault (tables+views/types/functions = $LEFTOVER)"
fi

# ---- 7. preflight rejects ambiguous retry ------------------------------------
n=0
for pf in "$GP"/pg17/preflight-0*.sql; do
  n=$((n+1))
  out=$(docker exec -i "$CONTAINER" psql -v ON_ERROR_STOP=on -U postgres -d a05full -q -f - < "$pf" 2>&1); rc=$?
  printf '=== preflight-0%s replay rc=%s ===\n%s\n' "$n" "$rc" "$out" >> "$LOG"
  if [ "$rc" -ne 0 ]; then
    emit "P1.7.preflight-0$n-replay" PASS "raised as expected: ERROR: $(first_error "$out")"
  else
    emit "P1.7.preflight-0$n-replay" INFO "REPLAY TOLERATED (rc=0): preflight has no already-applied guard — output: $(printf '%s' "$out" | tail -1)"
  fi
done

echo "== AUDIT-05 PART 2: catalog security"
newdb a05cat
must_apply a05cat "$MINIMAL"
for m in "$M1" "$M2" "$M3" "$M4" "$M5" "$M6" "$M7" "$M8"; do must_apply a05cat "$m"; done
out=$(docker exec -i "$CONTAINER" psql -v ON_ERROR_STOP=on -U postgres -d a05cat -qAt -f - < "$AUDIT/part2-catalog-checks.sql" 2>&1); rc=$?
printf '=== part2 rc=%s ===\n%s\n' "$rc" "$out" >> "$LOG"
printf '%s\n' "$out" | grep '^AUDIT05|' | tee -a "$RESULTS"
[ "$rc" -eq 0 ] || emit P2.file FAIL "part2 script itself errored: $(printf '%s' "$out" | head -3 | tr '\n' ' ')"

echo "== AUDIT-05 PART 3: extended actor matrix"
newdb a05act
must_apply a05act "$MINIMAL"
for m in "$M1" "$M2" "$M3" "$M4" "$M5" "$M6" "$M7" "$M8"; do must_apply a05act "$m"; done
out=$(docker exec -i "$CONTAINER" psql -v ON_ERROR_STOP=on -U postgres -d a05act -qAt -f - < "$AUDIT/part3-actor-matrix.sql" 2>&1); rc=$?
printf '=== part3 rc=%s ===\n%s\n' "$rc" "$out" >> "$LOG"
printf '%s\n' "$out" | grep '^AUDIT05|' | tee -a "$RESULTS"
[ "$rc" -eq 0 ] || emit P3.file FAIL "part3 script itself errored: $(printf '%s' "$out" | head -3 | tr '\n' ' ')"

echo "== AUDIT-05 SUMMARY"
TOTAL=$(grep -c '^AUDIT05|' "$RESULTS" || true)
FAILS=$(grep -c '^AUDIT05|[^|]*|FAIL|' "$RESULTS" || true)
INFOS=$(grep -c '^AUDIT05|[^|]*|INFO|' "$RESULTS" || true)
echo "-- informational records ($INFOS):"
grep '^AUDIT05|[^|]*|INFO|' "$RESULTS" || true
echo "-- failures ($FAILS):"
grep '^AUDIT05|[^|]*|FAIL|' "$RESULTS" || true
if [ "$FAILS" -eq 0 ]; then
  echo "AUDIT-05 RUNTIME: PASS ($TOTAL checks, 0 unexpected)"
else
  echo "AUDIT-05 RUNTIME: INVESTIGATE ($FAILS unexpected results)"
fi
