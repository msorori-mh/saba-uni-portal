#!/usr/bin/env bash
# Isolated PostgreSQL rehearsal for
#   docs/migration-drafts/EXCUSED-ABSENCE-PAID-SIGNATURE-WORKFLOW-01.sql
#
# NEVER touches production or any shared database: it builds a throwaway
# cluster on a private unix socket, replays the production-shaped P1-08
# rehearsal chain (which already carries the strict B1 runtime preimages and an
# in-flight excused_absence request on the old three-step cycle), adds the
# excused-absence preimages this package depends on, applies the draft TWICE
# (idempotency) and runs the direct-RPC authorization matrix.
#
#   PG_OS_USER  unprivileged OS user that owns the cluster (default: lovable,
#               falls back to postgres, then to the current non-root user)
#   PGDIR       throwaway data directory        (default: /tmp/eawf01-pg)
#   PORT        private port for the socket     (default: 55436)
#   KEEP=1      leave the cluster running for inspection
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
DRAFTS="$ROOT/docs/migration-drafts"
P1="$DRAFTS/p1"
BASE="$ROOT/scripts/p1-source-closure-02-pg17"
ATOMIC="$ROOT/scripts/p1-atomic-submit-07a-pg17"
STRICT="$ROOT/scripts/p1-strict-assignment-08a-pg17"
HARNESS="$ROOT/scripts/excused-absence-paid-signature-01-pg17"
DRAFT="$DRAFTS/EXCUSED-ABSENCE-PAID-SIGNATURE-WORKFLOW-01.sql"
PGDIR="${PGDIR:-/tmp/eawf01-pg}"
PORT="${PORT:-55436}"

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
echo "--- P1-08 matrix (leaves one in-flight excused_absence request on the old cycle)"
psql -v ON_ERROR_STOP=1 -q -f "$STRICT/02-cases.sql" >/dev/null 2>&1

# ---- this package
run "excused-absence production preimages" "$HARNESS/00-preimages.sql"
run "fixtures" "$HARNESS/01-fixtures.sql"

# A probe breaks ONE precondition, applies the draft (which must abort with the
# expected guard), proves the aborted apply changed nothing at all — workflow
# rows, pins, logs, runtime rows AND every function body — then restores.
probe() {
  local label="$1" mutate="$2" expected="$3" restore="$4" before after
  psql -v ON_ERROR_STOP=1 -q -c "$mutate"
  before="$(psql -v ON_ERROR_STOP=1 -q -Atc "select public.h_eawf01_fingerprint()")"
  if psql -v ON_ERROR_STOP=1 -q -f "$DRAFT" >"$PGDIR/probe.out" 2>&1; then
    echo "PROBE_FAIL($label): draft applied although it had to abort"; exit 1
  fi
  if ! grep -q "$expected" "$PGDIR/probe.out"; then
    echo "PROBE_FAIL($label): expected $expected, got:"; cat "$PGDIR/probe.out"; exit 1
  fi
  after="$(psql -v ON_ERROR_STOP=1 -q -Atc "select public.h_eawf01_fingerprint()")"
  if [ "$before" != "$after" ]; then
    echo "PROBE_FAIL($label): aborted apply left changes behind"; exit 1
  fi
  psql -v ON_ERROR_STOP=1 -q -c "$restore"
  echo "ok: fail-closed [$label] -> $expected; nothing changed"
}

ACT_ON="public.act_on_b1_student_request_step_atomic(uuid,text,text,jsonb)"
EFFECT="public.apply_b1_excused_absence_effect(uuid)"
# Rewrites a deployed function body in the throwaway cluster (drift simulation).
rewrite_fn() { # signature, from, to
  printf "DO \$do\$ BEGIN EXECUTE replace(pg_get_functiondef('%s'::regprocedure), \$a\$%s\$a\$, \$b\$%s\$b\$); END \$do\$" "$1" "$2" "$3"
}

echo "--- fail-closed probes (each must abort and change nothing)"
probe "dean has no effective direct assignee" \
  "UPDATE public.request_processing_assignments SET is_active=false WHERE staff_profile_id='33333333-3333-3333-3333-000000000011'" \
  "EXCUSED_ABSENCE_WF01_DIRECT_ASSIGNEE_MUST_RESOLVE_EXACTLY_ONCE:dean:dean:0" \
  "UPDATE public.request_processing_assignments SET is_active=true WHERE staff_profile_id='33333333-3333-3333-3333-000000000011'"
probe "archive unit missing" \
  "UPDATE public.request_processing_units SET is_active=false WHERE code='archive'" \
  "EXCUSED_ABSENCE_WF01_PROCESSING_UNIT_MUST_RESOLVE_EXACTLY_ONCE:archive:0" \
  "UPDATE public.request_processing_units SET is_active=true WHERE code='archive'"
probe "department_head role missing" \
  "UPDATE public.request_processing_roles SET is_active=false WHERE code='department_head'" \
  "EXCUSED_ABSENCE_WF01_PROCESSING_ROLE_MUST_RESOLVE_EXACTLY_ONCE:department_head:0" \
  "UPDATE public.request_processing_roles SET is_active=true WHERE code='department_head'"
probe "catalog action REGISTER_EXCUSED_ABSENCE inactive" \
  "UPDATE public.request_workflow_action_catalog SET is_active=false WHERE code='REGISTER_EXCUSED_ABSENCE'" \
  "EXCUSED_ABSENCE_WF01_CATALOG_ACTION_MISSING_OR_DRIFTED:REGISTER_EXCUSED_ABSENCE" \
  "UPDATE public.request_workflow_action_catalog SET is_active=true WHERE code='REGISTER_EXCUSED_ABSENCE'"
probe "request type missing" \
  "UPDATE public.request_types SET code='excused_absence_renamed' WHERE code='excused_absence'" \
  "EXCUSED_ABSENCE_WF01_REQUEST_TYPE_MUST_RESOLVE_EXACTLY_ONCE:0" \
  "UPDATE public.request_types SET code='excused_absence' WHERE code='excused_absence_renamed'"
probe "two heads for one department" \
  "INSERT INTO public.position_assignments (id,user_id,department_id,is_active,assigned_from) VALUES ('55555555-5555-5555-5555-0000000000ff','11111111-1111-1111-1111-000000000009','22222222-2222-2222-2222-000000000001',true,CURRENT_DATE-1); INSERT INTO public.request_processing_assignments (id,unit_id,role_id,assignment_type,position_assignment_id,department_id,is_active) SELECT '55555555-5555-5555-5555-0000000000fe',u.id,r.id,'position_assignment','55555555-5555-5555-5555-0000000000ff','22222222-2222-2222-2222-000000000001',true FROM public.request_processing_units u JOIN public.request_processing_roles r ON r.unit_id=u.id AND r.code='department_head' WHERE u.code='department'" \
  "EXCUSED_ABSENCE_WF01_AMBIGUOUS_DEPARTMENT_HEAD_ASSIGNMENT:1" \
  "DELETE FROM public.request_processing_assignments WHERE id='55555555-5555-5555-5555-0000000000fe'; DELETE FROM public.position_assignments WHERE id='55555555-5555-5555-5555-0000000000ff'"
probe "unexpected active workflow" \
  "UPDATE public.request_type_workflows SET code='excused_absence_someone_else' WHERE code='excused_absence_free_workflow' AND is_active" \
  "EXCUSED_ABSENCE_WF01_UNEXPECTED_ACTIVE_WORKFLOW_CODE" \
  "UPDATE public.request_type_workflows SET code='excused_absence_free_workflow' WHERE code='excused_absence_someone_else'"
# Engine drift: the fourth patch anchor is missing. The two initializer patches
# and the activation-guard patch were already executed inside the same
# transaction and must be rolled back with it.
probe "deployed executor drifted from the expected anchor" \
  "$(rewrite_fn "$ACT_ON" "v_canonical='file_withdrawal'" "v_canonical = 'file_withdrawal'")" \
  "EXCUSED_ABSENCE_WF01_PATCH_ANCHOR_MUST_MATCH_EXACTLY_ONCE:EAWF01:effect-before-archive:0" \
  "$(rewrite_fn "$ACT_ON" "v_canonical = 'file_withdrawal'" "v_canonical='file_withdrawal'")"
probe "effect function no longer bound to record_apply" \
  "$(rewrite_fn "$EFFECT" "record_apply" "registrar_apply")" \
  "EXCUSED_ABSENCE_WF01_EFFECT_STEP_KEY_BINDING_DRIFTED" \
  "$(rewrite_fn "$EFFECT" "registrar_apply" "record_apply")"

# Phase-2 anchors: the fee-decision routing condition and the notification label.
EVAL="public.evaluate_workflow_transition_condition(uuid,jsonb)"
NOTIFY="public.trg_notify_student_request()"
probe "deployed transition-condition evaluator drifted" \
  "$(rewrite_fn "$EVAL" "IF v_code = 'FEE_IS_ZERO' THEN" "IF v_code  =  'FEE_IS_ZERO' THEN")" \
  "EXCUSED_ABSENCE_WF01_PATCH_ANCHOR_MUST_MATCH_EXACTLY_ONCE:EAWF01:fee-not-required-condition:0" \
  "$(rewrite_fn "$EVAL" "IF v_code  =  'FEE_IS_ZERO' THEN" "IF v_code = 'FEE_IS_ZERO' THEN")"
probe "deployed student-notification trigger drifted" \
  "$(rewrite_fn "$NOTIFY" "WHEN 'absence_excuse' THEN 'عذر غياب'" "WHEN 'absence_excuse'  THEN 'عذر غياب'")" \
  "EXCUSED_ABSENCE_WF01_PATCH_ANCHOR_MUST_MATCH_EXACTLY_ONCE:EAWF01:notification-service-label:0" \
  "$(rewrite_fn "$NOTIFY" "WHEN 'absence_excuse'  THEN 'عذر غياب'" "WHEN 'absence_excuse' THEN 'عذر غياب'")"
probe "fee-not-required condition code inactive in the catalog" \
  "INSERT INTO public.request_workflow_transition_condition_catalog (code,name_ar,is_active) VALUES ('EXCUSED_ABSENCE_FEE_NOT_REQUIRED','معطّل',false)" \
  "EXCUSED_ABSENCE_WF01_FEE_CONDITION_MUST_BE_ACTIVE_IN_CATALOG" \
  "DELETE FROM public.request_workflow_transition_condition_catalog WHERE code='EXCUSED_ABSENCE_FEE_NOT_REQUIRED'"

# Why the engine patches are required: the new cycle WITHOUT them cannot even
# initialize (the department-head step resolves across ALL departments).
echo "--- necessity probe: the workflow definition alone is not runnable"
psql -v ON_ERROR_STOP=1 -q -c "create database eawf01_unpatched template postgres"
awk '/^DO \$patches\$/{skip=1} skip&&/^\$patches\$;/{skip=0; next} !skip' "$DRAFT" > "$PGDIR/draft-without-patches.sql"
PGDATABASE=eawf01_unpatched psql -v ON_ERROR_STOP=1 -q -f "$PGDIR/draft-without-patches.sql" >/dev/null 2>&1
PGDATABASE=eawf01_unpatched psql -v ON_ERROR_STOP=1 -q -f "$HARNESS/02-necessity-probe.sql" 2>&1 \
  | sed -n 's/^.*NOTICE:  //p'
psql -v ON_ERROR_STOP=1 -q -c "drop database eawf01_unpatched"

# ---- production pre-flight query (read-only, single statement) ----------------
PREFLIGHT="$DRAFTS/EXCUSED-ABSENCE-PAID-SIGNATURE-WORKFLOW-01.preflight.sql"
VERIFY="$DRAFTS/EXCUSED-ABSENCE-PAID-SIGNATURE-WORKFLOW-01.verify.sql"
ROLLBACK="$DRAFTS/EXCUSED-ABSENCE-PAID-SIGNATURE-WORKFLOW-01.rollback-by-forward.sql"
field() { # database, file, column -> value of that column in the single result row
  PGDATABASE="$1" psql -v ON_ERROR_STOP=1 -q -Atx -f "$2" | sed -n "s/^$3|//p"
}
expect_field() { # label, database, file, column, expected
  local got; got="$(field "$2" "$3" "$4")"
  [ "$got" = "$5" ] || { echo "QUERY_CHECK_FAIL($1): $4 = '$got', expected '$5'"; exit 1; }
  echo "ok: $1 -> $4 = $5"
}
echo "--- production pre-flight / post-apply queries"
before="$(psql -v ON_ERROR_STOP=1 -q -Atc "select public.h_eawf01_fingerprint()")"
expect_field "pre-flight before the apply" postgres "$PREFLIGHT" ready_to_apply t
expect_field "pre-flight before the apply" postgres "$PREFLIGHT" draft_already_applied f
psql -v ON_ERROR_STOP=1 -q -c "$(rewrite_fn "$ACT_ON" "v_canonical='file_withdrawal'" "v_canonical = 'file_withdrawal'")"
expect_field "pre-flight sees a drifted anchor" postgres "$PREFLIGHT" ready_to_apply f
expect_field "pre-flight names the drifted anchor" postgres "$PREFLIGHT" failing_anchors "{EAWF01:effect-before-archive:0}"
psql -v ON_ERROR_STOP=1 -q -c "$(rewrite_fn "$ACT_ON" "v_canonical = 'file_withdrawal'" "v_canonical='file_withdrawal'")"
psql -v ON_ERROR_STOP=1 -q -c "UPDATE public.request_processing_assignments SET is_active=false WHERE staff_profile_id='33333333-3333-3333-3333-000000000011'"
expect_field "pre-flight sees a role without its single assignee" postgres "$PREFLIGHT" ready_to_apply f
expect_field "pre-flight names that role" postgres "$PREFLIGHT" roles_without_single_assignee "{dean/dean:0}"
psql -v ON_ERROR_STOP=1 -q -c "UPDATE public.request_processing_assignments SET is_active=true WHERE staff_profile_id='33333333-3333-3333-3333-000000000011'"
expect_field "pre-flight is green again" postgres "$PREFLIGHT" ready_to_apply t
after="$(psql -v ON_ERROR_STOP=1 -q -Atc "select public.h_eawf01_fingerprint()")"
[ "$before" = "$after" ] || { echo "PREFLIGHT_QUERY_IS_NOT_READ_ONLY"; exit 1; }
echo "ok: the pre-flight query wrote nothing"

run "applying EXCUSED-ABSENCE-PAID-SIGNATURE-WORKFLOW-01" "$DRAFT"
psql -v ON_ERROR_STOP=1 -q -Atc "select public.h_eawf01_fingerprint()" > "$PGDIR/fingerprint-1.txt"
run "re-applying EXCUSED-ABSENCE-PAID-SIGNATURE-WORKFLOW-01 (idempotency)" "$DRAFT"
psql -v ON_ERROR_STOP=1 -q -Atc "select public.h_eawf01_fingerprint()" > "$PGDIR/fingerprint-2.txt"
cmp "$PGDIR/fingerprint-1.txt" "$PGDIR/fingerprint-2.txt" \
  || { echo "IDEMPOTENCY_FINGERPRINT_MISMATCH"; exit 1; }
echo "ok: second apply changed nothing (fingerprint identical)"

before="$(psql -v ON_ERROR_STOP=1 -q -Atc "select public.h_eawf01_fingerprint()")"
expect_field "post-apply verification" postgres "$VERIFY" applied_correctly t
expect_field "post-apply verification" postgres "$VERIFY" requests_on_the_new_cycle 0
expect_field "pre-flight after the apply" postgres "$PREFLIGHT" ready_to_apply t
expect_field "pre-flight after the apply" postgres "$PREFLIGHT" draft_already_applied t
after="$(psql -v ON_ERROR_STOP=1 -q -Atc "select public.h_eawf01_fingerprint()")"
[ "$before" = "$after" ] || { echo "VERIFY_QUERY_IS_NOT_READ_ONLY"; exit 1; }
echo "ok: the verification query wrote nothing"

# ---- rollback by forward, rehearsed on a copy -----------------------------------
echo "--- rollback-by-forward rehearsal (on a copy)"
psql -v ON_ERROR_STOP=1 -q -c "create database eawf01_rollback template postgres"
PGDATABASE=eawf01_rollback psql -v ON_ERROR_STOP=1 -q -f "$ROLLBACK" >/dev/null 2>&1
expect_field "after the rollback" eawf01_rollback "$PREFLIGHT" active_workflow "excused_absence_free_workflow v2"
PGDATABASE=eawf01_rollback psql -v ON_ERROR_STOP=1 -q -Atc "select public.h_eawf01_fingerprint()" > "$PGDIR/rb-1.txt"
PGDATABASE=eawf01_rollback psql -v ON_ERROR_STOP=1 -q -f "$ROLLBACK" >/dev/null 2>&1
PGDATABASE=eawf01_rollback psql -v ON_ERROR_STOP=1 -q -Atc "select public.h_eawf01_fingerprint()" > "$PGDIR/rb-2.txt"
cmp "$PGDIR/rb-1.txt" "$PGDIR/rb-2.txt" || { echo "ROLLBACK_IS_NOT_IDEMPOTENT"; exit 1; }
echo "ok: a second rollback changed nothing"
PGDATABASE=eawf01_rollback psql -v ON_ERROR_STOP=1 -q -Atc \
  "select public.initialize_b1_request_workflow_strict(public.h_seed_absence_after_rollback(), 'excused_absence') ->> 'initialized'" \
  | grep -qx true || { echo "ROLLBACK_NEW_REQUEST_NOT_ON_FREE_CYCLE"; exit 1; }
[ "$(PGDATABASE=eawf01_rollback psql -q -Atc "select string_agg(step_key, '>' order by step_order) from public.student_request_workflow_steps where student_request_id='88888888-8888-8888-8888-0000000000bb'")" \
  = "student_affairs_intake>manager_review>record_apply" ] || { echo "ROLLBACK_NEW_REQUEST_WRONG_STEPS"; exit 1; }
echo "ok: after the rollback a new request runs on the old three-step free cycle"
PGDATABASE=eawf01_rollback psql -v ON_ERROR_STOP=1 -q -f "$DRAFT" >/dev/null 2>&1
expect_field "draft re-applied after a rollback" eawf01_rollback "$VERIFY" applied_correctly t
psql -v ON_ERROR_STOP=1 -q -c "drop database eawf01_rollback"

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

echo "--- direct-RPC authorization matrix + lifecycle"
psql -v ON_ERROR_STOP=1 -f "$HARNESS/03-cases.sql"

# Once requests run on the new cycle the rollback must refuse (fail closed).
before="$(psql -v ON_ERROR_STOP=1 -q -Atc "select public.h_eawf01_fingerprint()")"
if psql -v ON_ERROR_STOP=1 -q -f "$ROLLBACK" >"$PGDIR/rollback.out" 2>&1; then
  echo "ROLLBACK_RAN_ALTHOUGH_REQUESTS_EXIST_ON_THE_NEW_CYCLE"; exit 1
fi
grep -q "EXCUSED_ABSENCE_WF01_ROLLBACK_BLOCKED_REQUESTS_EXIST_ON_NEW_CYCLE" "$PGDIR/rollback.out" \
  || { echo "ROLLBACK_WRONG_REFUSAL"; cat "$PGDIR/rollback.out"; exit 1; }
after="$(psql -v ON_ERROR_STOP=1 -q -Atc "select public.h_eawf01_fingerprint()")"
[ "$before" = "$after" ] || { echo "REFUSED_ROLLBACK_LEFT_CHANGES"; exit 1; }
echo "ok: rollback refuses while requests run on the new cycle; nothing changed"
expect_field "post-apply verification after real traffic" postgres "$VERIFY" applied_correctly t

echo "EXCUSED_ABSENCE_PAID_SIGNATURE_WORKFLOW_01_REHEARSAL_PASS"
