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

run "applying EXCUSED-ABSENCE-PAID-SIGNATURE-WORKFLOW-01" "$DRAFT"
psql -v ON_ERROR_STOP=1 -q -Atc "select public.h_eawf01_fingerprint()" > "$PGDIR/fingerprint-1.txt"
run "re-applying EXCUSED-ABSENCE-PAID-SIGNATURE-WORKFLOW-01 (idempotency)" "$DRAFT"
psql -v ON_ERROR_STOP=1 -q -Atc "select public.h_eawf01_fingerprint()" > "$PGDIR/fingerprint-2.txt"
cmp "$PGDIR/fingerprint-1.txt" "$PGDIR/fingerprint-2.txt" \
  || { echo "IDEMPOTENCY_FINGERPRINT_MISMATCH"; exit 1; }
echo "ok: second apply changed nothing (fingerprint identical)"

echo "--- direct-RPC authorization matrix + lifecycle"
psql -v ON_ERROR_STOP=1 -f "$HARNESS/03-cases.sql"

echo "EXCUSED_ABSENCE_PAID_SIGNATURE_WORKFLOW_01_REHEARSAL_PASS"
