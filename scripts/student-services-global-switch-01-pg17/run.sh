#!/usr/bin/env bash
# Isolated PostgreSQL rehearsal for
#   docs/migration-drafts/STUDENT-SERVICES-GLOBAL-SWITCH-01.sql
#
# NEVER touches production or any shared database: it builds a throwaway
# cluster on a private unix socket (listen_addresses=''), replays the
# production-shaped P1-08 rehearsal chain, and then rehearses this package in
# TWO independent databases cloned from that chain:
#
#   phase A  the draft on today's main
#   phase B  the draft AFTER EXCUSED-ABSENCE-PAID-SIGNATURE-WORKFLOW-01
#            (PR #436), which goes to production first. Its draft, preimages
#            and fixtures are read with `git show` from PR436_REF; when that
#            ref is not available locally the phase is SKIPPED loudly.
#
# Each phase: read-only pre-flight -> fail-closed probes -> draft applied
# TWICE (idempotency fingerprint) -> read-only verification -> direct-RPC matrix.
#
#   PG_OS_USER  unprivileged OS user that owns the cluster (default: lovable,
#               then postgres, then the current non-root user)
#   PGDIR       throwaway data directory        (default: /tmp/ssgs01-pg)
#   PORT        private port for the socket     (default: 55441)
#   PR436_REF   git ref carrying PR #436        (default:
#               origin/feat/excused-absence-paid-signature-workflow)
#   KEEP=1      leave the cluster running for inspection
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
DRAFTS="$ROOT/docs/migration-drafts"
P1="$DRAFTS/p1"
BASE="$ROOT/scripts/p1-source-closure-02-pg17"
ATOMIC="$ROOT/scripts/p1-atomic-submit-07a-pg17"
STRICT="$ROOT/scripts/p1-strict-assignment-08a-pg17"
HARNESS="$ROOT/scripts/student-services-global-switch-01-pg17"
DRAFT="$DRAFTS/STUDENT-SERVICES-GLOBAL-SWITCH-01.sql"
PREFLIGHT="$DRAFTS/STUDENT-SERVICES-GLOBAL-SWITCH-01.preflight.sql"
VERIFY="$DRAFTS/STUDENT-SERVICES-GLOBAL-SWITCH-01.verify.sql"
PGDIR="${PGDIR:-/tmp/ssgs01-pg}"
PORT="${PORT:-55441}"
PR436_REF="${PR436_REF:-origin/feat/excused-absence-paid-signature-workflow}"

AS_PG=()
if [ "$(id -u)" = "0" ]; then
  OS_USER="${PG_OS_USER:-}"
  if [ -z "$OS_USER" ]; then
    for candidate in lovable postgres; do
      if id -u "$candidate" >/dev/null 2>&1; then OS_USER="$candidate"; break; fi
    done
  fi
  [ -n "$OS_USER" ] || { echo "no unprivileged OS user for the cluster"; exit 1; }
  UID_L=$(id -u "$OS_USER"); GID_L=$(id -g "$OS_USER")
  AS_PG=(setpriv --reuid="$UID_L" --regid="$GID_L" --clear-groups)
fi

rm -rf "$PGDIR"
mkdir -p "$PGDIR"
if [ "${#AS_PG[@]}" -gt 0 ]; then chown -R "$UID_L:$GID_L" "$PGDIR"; fi
"${AS_PG[@]}" initdb -D "$PGDIR/data" -U pg >/dev/null
"${AS_PG[@]}" pg_ctl -D "$PGDIR/data" \
  -o "-k $PGDIR -p $PORT -c listen_addresses=''" -l "$PGDIR/pg.log" -w start >/dev/null
if [ "${KEEP:-0}" != "1" ]; then
  trap '"${AS_PG[@]}" pg_ctl -D "$PGDIR/data" -m immediate stop >/dev/null 2>&1 || true' EXIT
fi

export PGHOST="$PGDIR" PGPORT="$PORT" PGUSER=pg PGDATABASE=postgres
unset PGPASSWORD || true

psql -Atc "select version()"

run() { echo "--- $1"; psql -v ON_ERROR_STOP=1 -q -f "$2"; }

# ---- production-shaped base: identical to scripts/p1-strict-assignment-08a-pg17/run.sh
run "base harness" "$BASE/00-harness.sql"
for f in P1-01-DETAIL-MODELS.sql P1-02-BACKEND-VALIDATION.sql \
         P1-03-WORKFLOW-SEEDS.sql P1-04-GRADE-APPEAL-TRIGGER-REPLACE.sql; do
  run "applying $f" "$P1/$f"
done
run "P1-05 prereqs" "$BASE/02-p1-05-prereqs.sql"
run "applying P1-05" "$P1/P1-05-PASS-THRESHOLD-48.sql"
run "atomic-submit harness extension" "$ATOMIC/00-harness-ext.sql"
run "applying P1-06" "$P1/P1-06-ATOMIC-SUBMIT-PATH.sql"
run "strict-runtime production preimages" "$STRICT/00-strict-preimages.sql"
run "applying P1-07" "$P1/P1-07-WORKFLOW-TRANSITIONS-AND-SPECIALIZED-ACTIONS.sql"
run "P1-08 fixtures" "$STRICT/01-fixtures.sql"
run "applying P1-08" "$P1/P1-08-STRICT-RUNTIME-ASSIGNMENT-REUSE.sql"
echo "--- P1-08 matrix (leaves one in-flight excused_absence request)"
psql -v ON_ERROR_STOP=1 -q -f "$STRICT/02-cases.sql" >/dev/null 2>&1

fingerprint() { psql -v ON_ERROR_STOP=1 -q -Atc "select public.h_ssgs_fingerprint()"; }

# A probe breaks ONE precondition, applies the draft (which must abort with the
# expected guard), proves the aborted apply changed nothing at all, then restores.
probe() {
  local label="$1" mutate="$2" expected="$3" restore="$4" before after
  psql -v ON_ERROR_STOP=1 -q -c "$mutate"
  before="$(fingerprint)"
  if psql -v ON_ERROR_STOP=1 -q -f "$DRAFT" >"$PGDIR/probe.out" 2>&1; then
    echo "PROBE_FAIL($label): draft applied although it had to abort"; exit 1
  fi
  if ! grep -q "$expected" "$PGDIR/probe.out"; then
    echo "PROBE_FAIL($label): expected $expected, got:"; cat "$PGDIR/probe.out"; exit 1
  fi
  after="$(fingerprint)"
  if [ "$before" != "$after" ]; then
    echo "PROBE_FAIL($label): aborted apply left changes behind"; exit 1
  fi
  psql -v ON_ERROR_STOP=1 -q -c "$restore"
  echo "ok: fail-closed [$label] -> $expected; nothing changed"
}

verdict() { # file, expected last verdict line
  local out
  out="$(psql -v ON_ERROR_STOP=1 -q -At -f "$1")"
  if ! printf '%s\n' "$out" | grep -qx "$2"; then
    echo "VERDICT_FAIL: $(basename "$1") did not report $2"; printf '%s\n' "$out"; exit 1
  fi
  echo "ok: $(basename "$1") -> $2"
}

rehearse() { # phase label
  local phase="$1"
  run "[$phase] harness extension (audit, B1 atomic submit preimage, actors)" "$HARNESS/00-preimages.sql"
  verdict "$PREFLIGHT" "READY_TO_APPLY"

  echo "--- [$phase] fail-closed probes (each must abort and change nothing)"
  probe "canonical log_audit missing" \
    "ALTER FUNCTION public.log_audit(text,uuid,text,jsonb,jsonb,text,uuid) RENAME TO log_audit_renamed" \
    "STUDENT_SERVICES_SWITCH_01_FUNCTION_MISSING:public.log_audit" \
    "ALTER FUNCTION public.log_audit_renamed(text,uuid,text,jsonb,jsonb,text,uuid) RENAME TO log_audit"
  probe "legacy 6-argument log_audit overload still present" \
    "CREATE FUNCTION public.log_audit(text,uuid,text,jsonb,jsonb,text) RETURNS void LANGUAGE sql AS 'SELECT NULL::void'" \
    "STUDENT_SERVICES_SWITCH_01_LOG_AUDIT_OVERLOADS:2" \
    "DROP FUNCTION public.log_audit(text,uuid,text,jsonb,jsonb,text)"
  probe "student_requests.status is not text" \
    "ALTER TABLE public.student_requests RENAME COLUMN status TO status_renamed" \
    "STUDENT_SERVICES_SWITCH_01_COLUMN_CONTRACT_MISMATCH:4" \
    "ALTER TABLE public.student_requests RENAME COLUMN status_renamed TO status"
  probe "guard trigger name already taken by another function" \
    "CREATE FUNCTION public.h_foreign_guard() RETURNS trigger LANGUAGE plpgsql AS 'BEGIN RETURN NEW; END'; CREATE TRIGGER trg_00_student_services_switch_guard BEFORE INSERT ON public.student_requests FOR EACH ROW EXECUTE FUNCTION public.h_foreign_guard()" \
    "STUDENT_SERVICES_SWITCH_01_TRIGGER_NAME_TAKEN" \
    "DROP TRIGGER trg_00_student_services_switch_guard ON public.student_requests; DROP FUNCTION public.h_foreign_guard()"
  probe "a foreign table already uses the switch table name" \
    "CREATE TABLE public.student_services_switch (id boolean PRIMARY KEY, something_else text)" \
    "STUDENT_SERVICES_SWITCH_01_TABLE_CONTRACT_MISMATCH" \
    "DROP TABLE public.student_services_switch"

  local before_data after_data
  before_data="$(psql -q -Atc "select md5(coalesce(string_agg(md5(r::text), ',' order by r.id), '')) from public.student_requests r")"
  run "[$phase] applying STUDENT-SERVICES-GLOBAL-SWITCH-01" "$DRAFT"
  fingerprint > "$PGDIR/fingerprint-1.txt"
  run "[$phase] re-applying STUDENT-SERVICES-GLOBAL-SWITCH-01 (idempotency)" "$DRAFT" 2>/dev/null
  fingerprint > "$PGDIR/fingerprint-2.txt"
  cmp "$PGDIR/fingerprint-1.txt" "$PGDIR/fingerprint-2.txt" \
    || { echo "IDEMPOTENCY_FINGERPRINT_MISMATCH"; exit 1; }
  echo "ok: second apply changed nothing (fingerprint identical)"
  after_data="$(psql -q -Atc "select md5(coalesce(string_agg(md5(r::text), ',' order by r.id), '')) from public.student_requests r")"
  [ "$before_data" = "$after_data" ] || { echo "APPLY_TOUCHED_STUDENT_REQUESTS"; exit 1; }
  echo "ok: applying the draft wrote no student_requests row"
  verdict "$VERIFY" "VERIFIED"

  echo "--- [$phase] direct-RPC matrix"
  psql -v ON_ERROR_STOP=1 -f "$HARNESS/01-cases.sql" 2>&1 \
    | sed -n 's/^.*NOTICE:  //p; /ERROR/p; /CASE_FAIL/p; /CASES_PASS/p' \
    | tee "$PGDIR/cases-$phase.out"
  grep -q "STUDENT_SERVICES_GLOBAL_SWITCH_01_CASES_PASS" "$PGDIR/cases-$phase.out" \
    || { echo "CASES_FAIL($phase)"; exit 1; }
  verdict "$VERIFY" "VERIFIED"
}

psql -v ON_ERROR_STOP=1 -q -c "create database ssgs_main template postgres"
psql -v ON_ERROR_STOP=1 -q -c "create database ssgs_after_pr436 template postgres"

echo "=== phase A: draft on main"
PGDATABASE=ssgs_main rehearse "A-main"

echo "=== phase B: draft AFTER EXCUSED-ABSENCE-PAID-SIGNATURE-WORKFLOW-01 (PR #436)"
PR436_DIR="$PGDIR/pr436"
mkdir -p "$PR436_DIR"
PR436_OK=1
for f in docs/migration-drafts/EXCUSED-ABSENCE-PAID-SIGNATURE-WORKFLOW-01.sql \
         scripts/excused-absence-paid-signature-01-pg17/00-preimages.sql \
         scripts/excused-absence-paid-signature-01-pg17/01-fixtures.sql; do
  if ! git -C "$ROOT" show "$PR436_REF:$f" > "$PR436_DIR/$(basename "$f")" 2>/dev/null; then
    PR436_OK=0
  fi
done
if [ "$PR436_OK" = "1" ]; then
  export PGDATABASE=ssgs_after_pr436
  run "[B] PR #436 production preimages" "$PR436_DIR/00-preimages.sql"
  run "[B] PR #436 fixtures" "$PR436_DIR/01-fixtures.sql"
  run "[B] applying EXCUSED-ABSENCE-PAID-SIGNATURE-WORKFLOW-01 first" \
    "$PR436_DIR/EXCUSED-ABSENCE-PAID-SIGNATURE-WORKFLOW-01.sql"
  psql -q -Atc "select md5(pg_get_functiondef('public.initialize_b1_request_workflow_strict(uuid,text)'::regprocedure)) || md5(pg_get_functiondef('public.act_on_b1_student_request_step_atomic(uuid,text,text,jsonb)'::regprocedure))" > "$PGDIR/pr436-bodies-1.txt"
  rehearse "B-after-pr436"
  psql -q -Atc "select md5(pg_get_functiondef('public.initialize_b1_request_workflow_strict(uuid,text)'::regprocedure)) || md5(pg_get_functiondef('public.act_on_b1_student_request_step_atomic(uuid,text,text,jsonb)'::regprocedure))" > "$PGDIR/pr436-bodies-2.txt"
  cmp "$PGDIR/pr436-bodies-1.txt" "$PGDIR/pr436-bodies-2.txt" \
    || { echo "PR436_PATCHED_BODIES_CHANGED"; exit 1; }
  echo "ok: the two function bodies PR #436 patches are byte-identical after this draft"
  export PGDATABASE=postgres
  echo "STUDENT_SERVICES_GLOBAL_SWITCH_01_AFTER_PR436_PASS"
else
  echo "PHASE_B_SKIPPED: git ref $PR436_REF is not available locally — the draft was NOT rehearsed after PR #436"
fi

echo "STUDENT_SERVICES_GLOBAL_SWITCH_01_REHEARSAL_PASS"
