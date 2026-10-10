#!/usr/bin/env bash
# Isolated PostgreSQL rehearsal for
#   docs/migration-drafts/B1-PAID-SERVICES-REGISTRAR-FEE-DECISION-01.sql
# «التحويل بين الأقسام» (department_transfer) + «الفرصة الأخيرة» (final_chance).
#
# NEVER touches production or any shared database: it builds a throwaway
# cluster on a private unix socket.
#
# Chain = the production-shaped strict-runtime harness (P1-08 chain + engine
# preimages) + the two paid services exactly as the applied chain publishes them
# (00a / 01a are verbatim extracts of the applied migrations, kept in sync by a
# test) + the APPLIED excused-absence draft (production state) + this draft TWICE.
#
#   PG_OS_USER  unprivileged OS user that owns the cluster (default: lovable,
#               falls back to postgres, then to the current non-root user)
#   PGDIR       throwaway data directory        (default: /tmp/b1pfd01-pg)
#   PORT        private port for the socket     (default: 55438)
#   KEEP=1      leave the cluster running for inspection
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
DRAFTS="$ROOT/docs/migration-drafts"
P1="$DRAFTS/p1"
BASE="$ROOT/scripts/p1-source-closure-02-pg17"
ATOMIC="$ROOT/scripts/p1-atomic-submit-07a-pg17"
STRICT="$ROOT/scripts/p1-strict-assignment-08a-pg17"
ENGINE="$ROOT/scripts/excused-absence-paid-signature-01-pg17"
HARNESS="$ROOT/scripts/b1-paid-services-registrar-fee-decision-01-pg17"
ABSENCE_DRAFT="$DRAFTS/EXCUSED-ABSENCE-PAID-SIGNATURE-WORKFLOW-01.sql"
DRAFT="$DRAFTS/B1-PAID-SERVICES-REGISTRAR-FEE-DECISION-01.sql"
PREFLIGHT="$DRAFTS/B1-PAID-SERVICES-REGISTRAR-FEE-DECISION-01.preflight.sql"
VERIFY="$DRAFTS/B1-PAID-SERVICES-REGISTRAR-FEE-DECISION-01.verify.sql"
ROLLBACK="$DRAFTS/B1-PAID-SERVICES-REGISTRAR-FEE-DECISION-01.rollback-by-forward.sql"
PGDIR="${PGDIR:-/tmp/b1pfd01-pg}"
PORT="${PORT:-55438}"

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

run() { echo "--- $1"; psql -v ON_ERROR_STOP=1 -q -f "$2" >/dev/null; }
fp() { psql -v ON_ERROR_STOP=1 -q -Atc "select public.hp_fingerprint()"; }
field() { PGDATABASE="${3:-postgres}" psql -v ON_ERROR_STOP=1 -q -Atx -f "$1" | sed -n "s/^$2|//p"; }
expect_field() { # label, file, column, expected[, database]
  local got; got="$(field "$2" "$3" "${5:-postgres}")"
  [ "$got" = "$4" ] || { echo "QUERY_CHECK_FAIL($1): $3 = '$got', expected '$4'"; exit 1; }
  echo "ok: $1 -> $3 = $4"
}

# ---- production-shaped base ---------------------------------------------------
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
echo "--- P1-08 matrix"
psql -v ON_ERROR_STOP=1 -q -f "$STRICT/02-cases.sql" >/dev/null 2>&1
run "engine preimages" "$ENGINE/00-preimages.sql"
run "excused-absence fixtures" "$ENGINE/01-fixtures.sql"
run "paid-services preimages" "$HARNESS/00-preimages.sql"
run "APPLIED academic-effect functions (verbatim extract)" "$HARNESS/00a-applied-effects.sql"
run "paid-services version 1 (as migration 20260727062709)" "$HARNESS/01-fixtures.sql"
run "APPLIED version-2 publish block (verbatim extract of 20260811202824)" "$HARNESS/01a-applied-v2-publish.sql"
run "post-cut-over state + helpers" "$HARNESS/02-after-v2.sql"
echo "--- APPLIED excused-absence draft (production state)"
psql -v ON_ERROR_STOP=1 -q -f "$ABSENCE_DRAFT" >/dev/null 2>&1

# ---- event-type CHECK (production defect 2026-10-07) ---------------------------------
# The schema carries production's CHECK without the fee-decision event types: prove the
# defect, apply B1-WORKFLOW-EVENT-TYPES-FEE-DECISION-01 twice (idempotent), then run the cases.
EVT_DRAFT="$DRAFTS/B1-WORKFLOW-EVENT-TYPES-FEE-DECISION-01.sql"
evt_def() { psql -v ON_ERROR_STOP=1 -q -Atc "select pg_get_constraintdef(oid) from pg_constraint where conrelid='public.student_request_workflow_events'::regclass and conname='student_request_workflow_events_event_type_chk'"; }
case "$(evt_def)" in *fee_decision_recorded*|*"'skip'"*) echo "EVT_PARITY_CONSTRAINT_ALREADY_WIDE"; exit 1;; esac
echo "ok: production-shaped CHECK rejects the fee-decision event types before the fix"
psql -v ON_ERROR_STOP=1 -q -f "$EVT_DRAFT" >/dev/null
evt_first="$(evt_def)"
psql -v ON_ERROR_STOP=1 -q -f "$EVT_DRAFT" >/dev/null
[ "$evt_first" = "$(evt_def)" ] || { echo "EVT_DRAFT_IS_NOT_IDEMPOTENT"; exit 1; }
case "$evt_first" in *fee_decision_recorded*"'skip'"*) ;; *) echo "EVT_DRAFT_DID_NOT_WIDEN"; exit 1;; esac
echo "ok: event-type CHECK widened (fee_decision_recorded, skip); second apply changed nothing"

echo "=== version 2 as deployed: the defect this package replaces (leaves two in-flight v2 requests)"
psql -v ON_ERROR_STOP=1 -q -f "$HARNESS/03-cases-v2-as-deployed.sql" 2>&1 | sed 's/^psql:[^ ]* NOTICE:  //' \
  | grep -E "^observed|DEFECT|CASES_DONE|ERROR|CASE_FAIL"

# ---- pre-flight (read-only) ------------------------------------------------------
ACT_ON="public.act_on_b1_student_request_step_atomic(uuid,text,text,jsonb)"
EVAL="public.evaluate_workflow_transition_condition(uuid,jsonb)"
HOOK="PERFORM public.b1_excused_absence_before_step_action(v_step.id, v_action, p_comment);"
rewrite_fn() { # signature, from, to — drift simulation in the throwaway cluster
  printf "DO \$do\$ BEGIN EXECUTE replace(pg_get_functiondef('%s'::regprocedure), \$a\$%s\$a\$, \$b\$%s\$b\$); END \$do\$" "$1" "$2" "$3"
}
echo "--- pre-flight query"
before="$(fp)"
expect_field "pre-flight on production state (excused-absence draft applied)" "$PREFLIGHT" ready_to_apply t
expect_field "pre-flight before the apply" "$PREFLIGHT" draft_already_applied f
psql -v ON_ERROR_STOP=1 -q -c "$(rewrite_fn "$EVAL" "ELSIF v_code = 'FEE_GREATER_THAN_ZERO' THEN" "ELSIF v_code  =  'FEE_GREATER_THAN_ZERO' THEN")"
expect_field "pre-flight sees a drifted anchor" "$PREFLIGHT" ready_to_apply f
expect_field "pre-flight names the drifted anchor" "$PREFLIGHT" failing_anchors "{B1PFD01:fee-not-required-condition:0}"
psql -v ON_ERROR_STOP=1 -q -c "$(rewrite_fn "$EVAL" "ELSIF v_code  =  'FEE_GREATER_THAN_ZERO' THEN" "ELSIF v_code = 'FEE_GREATER_THAN_ZERO' THEN")"
expect_field "pre-flight is green again" "$PREFLIGHT" ready_to_apply t
[ "$before" = "$(fp)" ] || { echo "PREFLIGHT_QUERY_IS_NOT_READ_ONLY"; exit 1; }
echo "ok: the pre-flight query wrote nothing"

# ---- fail-closed probes: the draft must abort and change nothing, and the
#      pre-flight must already say NO-GO ------------------------------------------
probe() {
  local label="$1" mutate="$2" expected="$3" restore="$4" before
  psql -v ON_ERROR_STOP=1 -q -c "$mutate"
  before="$(fp)"
  [ "$(field "$PREFLIGHT" ready_to_apply)" = "f" ] || { echo "PROBE_FAIL($label): pre-flight still says ready"; exit 1; }
  if psql -v ON_ERROR_STOP=1 -q -f "$DRAFT" >"$PGDIR/probe.out" 2>&1; then
    echo "PROBE_FAIL($label): draft applied although it had to abort"; exit 1
  fi
  grep -q "$expected" "$PGDIR/probe.out" || { echo "PROBE_FAIL($label): expected $expected, got:"; cat "$PGDIR/probe.out"; exit 1; }
  [ "$before" = "$(fp)" ] || { echo "PROBE_FAIL($label): aborted apply left changes behind"; exit 1; }
  psql -v ON_ERROR_STOP=1 -q -c "$restore"
  echo "ok: fail-closed [$label] -> $expected; pre-flight NO-GO; nothing changed"
}
ACTIVE_FC="(SELECT w.id FROM public.request_type_workflows w WHERE w.code='final_chance_external_payment_workflow' AND w.is_active)"
ACTIVE_DT="(SELECT w.id FROM public.request_type_workflows w WHERE w.code='department_transfer_external_payment_workflow' AND w.is_active)"
echo "--- fail-closed probes"
probe "excused-absence hook missing from the executor" \
  "$(rewrite_fn "$ACT_ON" "$HOOK" "PERFORM  public.b1_excused_absence_before_step_action(v_step.id, v_action, p_comment);")" \
  "B1_PFD01_PATCH_ANCHOR_MUST_MATCH_EXACTLY_ONCE:B1PFD01:fee-decision-required:0" \
  "$(rewrite_fn "$ACT_ON" "PERFORM  public.b1_excused_absence_before_step_action(v_step.id, v_action, p_comment);" "$HOOK")"
probe "condition evaluator drifted" \
  "$(rewrite_fn "$EVAL" "ELSIF v_code = 'FEE_GREATER_THAN_ZERO' THEN" "ELSIF v_code  =  'FEE_GREATER_THAN_ZERO' THEN")" \
  "B1_PFD01_PATCH_ANCHOR_MUST_MATCH_EXACTLY_ONCE:B1PFD01:fee-not-required-condition:0" \
  "$(rewrite_fn "$EVAL" "ELSIF v_code  =  'FEE_GREATER_THAN_ZERO' THEN" "ELSIF v_code = 'FEE_GREATER_THAN_ZERO' THEN")"
probe "registrar has no effective direct assignee" \
  "UPDATE public.request_processing_assignments SET is_active=false WHERE staff_profile_id='33333333-3333-3333-3333-000000000004'" \
  "B1_PFD01_REGISTRAR_DIRECT_ASSIGNEE_MUST_RESOLVE_EXACTLY_ONCE" \
  "UPDATE public.request_processing_assignments SET is_active=true WHERE staff_profile_id='33333333-3333-3333-3333-000000000004'"
probe "condition code present but inactive" \
  "INSERT INTO public.request_workflow_transition_condition_catalog (code,name_ar,is_active) VALUES ('B1_FEE_NOT_REQUIRED','معطّل',false)" \
  "B1_PFD01_FEE_CONDITION_MUST_BE_ACTIVE_IN_CATALOG" \
  "DELETE FROM public.request_workflow_transition_condition_catalog WHERE code='B1_FEE_NOT_REQUIRED'"
probe "unexpected active workflow code" \
  "UPDATE public.request_type_workflows SET code='department_transfer_custom' WHERE code='department_transfer_external_payment_workflow' AND is_active" \
  "B1_PFD01_UNEXPECTED_ACTIVE_WORKFLOW_CODE:department_transfer" \
  "UPDATE public.request_type_workflows SET code='department_transfer_external_payment_workflow' WHERE code='department_transfer_custom'"
probe "payment step already skippable" \
  "UPDATE public.request_type_workflow_steps s SET can_skip=true WHERE s.step_key='payment_confirmation' AND s.workflow_id=$ACTIVE_FC" \
  "B1_PFD01_UNEXPECTED_WORKFLOW_SHAPE:final_chance" \
  "UPDATE public.request_type_workflow_steps s SET can_skip=false WHERE s.step_key='payment_confirmation' AND s.workflow_id=$ACTIVE_FC"
probe "fee branch edited by hand" \
  "UPDATE public.request_type_workflow_transitions t SET condition_schema='{\"code\":\"FEE_IS_ZERO\",\"params\":{}}'::jsonb WHERE t.condition_schema->>'code'='FEE_GREATER_THAN_ZERO' AND t.workflow_id=$ACTIVE_DT" \
  "B1_PFD01_UNEXPECTED_WORKFLOW_SHAPE:department_transfer" \
  "UPDATE public.request_type_workflow_transitions t SET condition_schema='{\"code\":\"FEE_GREATER_THAN_ZERO\",\"params\":{}}'::jsonb WHERE t.condition_schema->>'code'='FEE_IS_ZERO' AND t.workflow_id=$ACTIVE_DT"
probe "request type missing" \
  "UPDATE public.request_types SET code='final_chance_renamed' WHERE code='final_chance'" \
  "B1_PFD01_REQUEST_TYPE_MUST_RESOLVE_EXACTLY_ONCE:final_chance:0" \
  "UPDATE public.request_types SET code='final_chance' WHERE code='final_chance_renamed'"

# ---- apply twice -------------------------------------------------------------------
echo "--- applying B1-PAID-SERVICES-REGISTRAR-FEE-DECISION-01"
psql -v ON_ERROR_STOP=1 -q -f "$DRAFT" 2>&1 | sed 's/^psql:[^ ]* NOTICE:  //'
fp > "$PGDIR/fp-1.txt"
echo "--- re-applying (idempotency)"
psql -v ON_ERROR_STOP=1 -q -f "$DRAFT" 2>&1 | sed 's/^psql:[^ ]* NOTICE:  //'
fp > "$PGDIR/fp-2.txt"
cmp "$PGDIR/fp-1.txt" "$PGDIR/fp-2.txt" || { echo "IDEMPOTENCY_FINGERPRINT_MISMATCH"; exit 1; }
echo "ok: second apply changed nothing (fingerprint identical)"
expect_field "post-apply verification" "$VERIFY" applied_correctly t
expect_field "post-apply verification" "$VERIFY" requests_on_the_new_versions 0
expect_field "pre-flight after the apply" "$PREFLIGHT" ready_to_apply t
expect_field "pre-flight after the apply" "$PREFLIGHT" draft_already_applied t
[ "$(cat "$PGDIR/fp-2.txt")" = "$(fp)" ] || { echo "VERIFY_QUERY_IS_NOT_READ_ONLY"; exit 1; }
echo "ok: the verification query wrote nothing"

# ---- rollback by forward, rehearsed on a copy ------------------------------------------
echo "--- rollback-by-forward rehearsal (on a copy)"
psql -v ON_ERROR_STOP=1 -q -c "create database b1pfd01_rollback template postgres"
PGDATABASE=b1pfd01_rollback psql -v ON_ERROR_STOP=1 -q -f "$ROLLBACK" >/dev/null 2>&1
expect_field "after the rollback" "$PREFLIGHT" active_workflows \
  '{"department_transfer=department_transfer_external_payment_workflow v2","final_chance=final_chance_external_payment_workflow v2"}' b1pfd01_rollback
r1="$(PGDATABASE=b1pfd01_rollback fp)"
PGDATABASE=b1pfd01_rollback psql -v ON_ERROR_STOP=1 -q -f "$ROLLBACK" >/dev/null 2>&1
[ "$r1" = "$(PGDATABASE=b1pfd01_rollback fp)" ] || { echo "ROLLBACK_IS_NOT_IDEMPOTENT"; exit 1; }
echo "ok: a second rollback changed nothing"
PGDATABASE=b1pfd01_rollback psql -v ON_ERROR_STOP=1 -q -f "$DRAFT" >/dev/null 2>&1
expect_field "draft re-applied after a rollback" "$VERIFY" applied_correctly t b1pfd01_rollback
psql -v ON_ERROR_STOP=1 -q -c "drop database b1pfd01_rollback"

# ---- behaviour -----------------------------------------------------------------------
echo "=== both services × both fee branches (direct RPC)"
psql -v ON_ERROR_STOP=1 -q -f "$HARNESS/05-cases-fee-decision.sql" 2>&1 | sed 's/^psql:[^ ]* NOTICE:  //'

echo "=== excused-absence behaviour unchanged: its full case file, after this draft"
psql -v ON_ERROR_STOP=1 -q -f "$HARNESS/06-before-absence-cases.sql"
psql -v ON_ERROR_STOP=1 -q -f "$ENGINE/03-cases.sql" >"$PGDIR/absence-cases.log" 2>&1 \
  || { echo "EXCUSED_ABSENCE_CASES_FAILED_AFTER_THIS_DRAFT"; tail -20 "$PGDIR/absence-cases.log"; exit 1; }
grep -q "EXCUSED_ABSENCE_PAID_SIGNATURE_WORKFLOW_01_CASES_PASS" "$PGDIR/absence-cases.log" \
  || { echo "EXCUSED_ABSENCE_CASES_FAILED_AFTER_THIS_DRAFT"; exit 1; }
sed -n 's/^.*NOTICE:  \(ok: .* lifecycle — .*\)$/\1/p' "$PGDIR/absence-cases.log"
echo "ok: every excused-absence case still passes"

# Once requests run on the new versions the rollback must refuse (fail closed).
before="$(fp)"
if psql -v ON_ERROR_STOP=1 -q -f "$ROLLBACK" >"$PGDIR/rollback.out" 2>&1; then
  echo "ROLLBACK_RAN_ALTHOUGH_REQUESTS_EXIST_ON_THE_NEW_VERSIONS"; exit 1
fi
grep -q "B1_PFD01_ROLLBACK_BLOCKED_REQUESTS_EXIST_ON_NEW_VERSION" "$PGDIR/rollback.out" \
  || { echo "ROLLBACK_WRONG_REFUSAL"; cat "$PGDIR/rollback.out"; exit 1; }
[ "$before" = "$(fp)" ] || { echo "REFUSED_ROLLBACK_LEFT_CHANGES"; exit 1; }
echo "ok: rollback refuses while requests run on the new versions; nothing changed"
expect_field "post-apply verification after real traffic" "$VERIFY" applied_correctly t

echo "B1_PAID_SERVICES_REGISTRAR_FEE_DECISION_01_REHEARSAL_PASS"
