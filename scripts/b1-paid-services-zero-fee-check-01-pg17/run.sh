#!/usr/bin/env bash
# Isolated PostgreSQL rehearsal for the two existing paid B1 services
#   «التحويل بين الأقسام» (department_transfer) and «الفرصة الأخيرة» (final_chance)
# and for docs/migration-drafts/B1-PAID-SERVICES-ZERO-FEE-SKIP-FIX-01.sql.
#
# NEVER touches production or any shared database: it builds a throwaway
# cluster on a private unix socket.
#
# What is replayed from the APPLIED chain (verbatim, extracted at run time):
#   * supabase/migrations/20260727120100  the two academic-effect functions
#   * supabase/migrations/20260811202824  the version-2 publish block (the
#     service list is narrowed to the two paid services; nothing else changes)
# on top of the shared strict-runtime harness (P1-08 chain + the engine
# preimages of scripts/excused-absence-paid-signature-01-pg17).
#
# Databases:
#   paid_a  version 2 as deployed, WITHOUT the excused-absence draft
#   paid_b  the same, WITH the excused-absence draft applied first
#           -> the case output of both must be identical
#   paid_a / paid_b then get the fix draft TWICE (idempotency) + after-fix cases
#
#   PG_OS_USER  unprivileged OS user that owns the cluster (default: lovable,
#               falls back to postgres, then to the current non-root user)
#   PGDIR       throwaway data directory        (default: /tmp/b1paid01-pg)
#   PORT        private port for the socket     (default: 55437)
#   KEEP=1      leave the cluster running for inspection
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
DRAFTS="$ROOT/docs/migration-drafts"
MIGRATIONS="$ROOT/supabase/migrations"
P1="$DRAFTS/p1"
BASE="$ROOT/scripts/p1-source-closure-02-pg17"
ATOMIC="$ROOT/scripts/p1-atomic-submit-07a-pg17"
STRICT="$ROOT/scripts/p1-strict-assignment-08a-pg17"
ENGINE="$ROOT/scripts/excused-absence-paid-signature-01-pg17"
HARNESS="$ROOT/scripts/b1-paid-services-zero-fee-check-01-pg17"
ABSENCE_DRAFT="$DRAFTS/EXCUSED-ABSENCE-PAID-SIGNATURE-WORKFLOW-01.sql"
FIX="$DRAFTS/B1-PAID-SERVICES-ZERO-FEE-SKIP-FIX-01.sql"
PGDIR="${PGDIR:-/tmp/b1paid01-pg}"
PORT="${PORT:-55437}"

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

# ---- verbatim extracts from the applied chain --------------------------------
EFFECTS_SRC="$MIGRATIONS/20260727120100_b1_26_academic_effect_functions_01.sql"
V2_SRC="$MIGRATIONS/20260811202824_2e666deb-8cdd-41f4-9bd7-2bdcb5663e77.sql"
awk '/^CREATE OR REPLACE FUNCTION public.apply_b1_(department_transfer|final_chance)_effect/{p=1} p{print} p&&/^END \$\$;/{p=0}' \
  "$EFFECTS_SRC" > "$PGDIR/applied-effects.sql"
[ "$(grep -c '^CREATE OR REPLACE FUNCTION' "$PGDIR/applied-effects.sql")" = "2" ] \
  || { echo "EXTRACT_FAIL: effect functions"; exit 1; }
ALL="('enrollment_suspension','excused_absence','department_transfer','final_chance','file_withdrawal')"
[ "$(grep -cF "$ALL" "$V2_SRC")" = "1" ] || { echo "EXTRACT_FAIL: v2 service list drifted"; exit 1; }
awk '/^DO \$\$/{p=1} p{print} p&&/^END \$\$;/{p=0}' "$V2_SRC" \
  | sed "s/$ALL/('department_transfer','final_chance')/" > "$PGDIR/applied-v2-publish.sql"
grep -q "FEE_GREATER_THAN_ZERO" "$PGDIR/applied-v2-publish.sql" \
  || { echo "EXTRACT_FAIL: v2 publish block"; exit 1; }

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
run "engine preimages (conditions, effects dispatcher, notifications)" "$ENGINE/00-preimages.sql"
run "excused-absence fixtures (dean actor, free cycle)" "$ENGINE/01-fixtures.sql"
run "paid-services preimages" "$HARNESS/00-preimages.sql"
run "APPLIED academic-effect functions (verbatim)" "$PGDIR/applied-effects.sql"
run "paid-services version 1 (as migration 20260727062709)" "$HARNESS/01-fixtures.sql"
run "APPLIED version-2 publish block (verbatim, 20260811202824)" "$PGDIR/applied-v2-publish.sql"
run "post-cut-over state + helpers" "$HARNESS/02-after-v2.sql"

psql -v ON_ERROR_STOP=1 -q -c "create database paid_a template postgres"
psql -v ON_ERROR_STOP=1 -q -c "create database paid_b template postgres"

cases() { # database, file -> normalized NOTICE log
  PGDATABASE="$1" psql -v ON_ERROR_STOP=1 -q -f "$2" 2>&1 | sed 's/^psql:[^ ]* NOTICE:  //'
}

echo "=== A. version 2 as deployed (WITHOUT the excused-absence draft)"
cases paid_a "$HARNESS/03-cases-v2-as-deployed.sql" | tee "$PGDIR/v2-a.log"
grep -q "B1_PAID_SERVICES_ZERO_FEE_CHECK_01_V2_CASES_DONE" "$PGDIR/v2-a.log" || { echo "V2_CASES_FAILED(A)"; exit 1; }

echo "=== B. the same WITH the excused-absence draft applied first"
PGDATABASE=paid_b psql -v ON_ERROR_STOP=1 -q -f "$ABSENCE_DRAFT" >/dev/null 2>&1
cases paid_b "$HARNESS/03-cases-v2-as-deployed.sql" > "$PGDIR/v2-b.log"
grep -q "B1_PAID_SERVICES_ZERO_FEE_CHECK_01_V2_CASES_DONE" "$PGDIR/v2-b.log" || { echo "V2_CASES_FAILED(B)"; cat "$PGDIR/v2-b.log"; exit 1; }
cmp "$PGDIR/v2-a.log" "$PGDIR/v2-b.log" || { echo "EXCUSED_ABSENCE_DRAFT_CHANGED_PAID_SERVICE_BEHAVIOUR"; exit 1; }
echo "ok: identical case log with and without the excused-absence draft"

# ---- fix draft: fail-closed probes ---------------------------------------------
probe() {
  local label="$1" mutate="$2" expected="$3" restore="$4" before after
  PGDATABASE=paid_a psql -v ON_ERROR_STOP=1 -q -c "$mutate"
  before="$(PGDATABASE=paid_a psql -v ON_ERROR_STOP=1 -q -Atc "select public.hp_fingerprint()")"
  if PGDATABASE=paid_a psql -v ON_ERROR_STOP=1 -q -f "$FIX" >"$PGDIR/probe.out" 2>&1; then
    echo "PROBE_FAIL($label): fix draft applied although it had to abort"; exit 1
  fi
  grep -q "$expected" "$PGDIR/probe.out" || { echo "PROBE_FAIL($label): expected $expected, got:"; cat "$PGDIR/probe.out"; exit 1; }
  after="$(PGDATABASE=paid_a psql -v ON_ERROR_STOP=1 -q -Atc "select public.hp_fingerprint()")"
  [ "$before" = "$after" ] || { echo "PROBE_FAIL($label): aborted apply left changes behind"; exit 1; }
  PGDATABASE=paid_a psql -v ON_ERROR_STOP=1 -q -c "$restore"
  echo "ok: fail-closed [$label] -> $expected; nothing changed"
}
PAY="s.step_key='payment_confirmation' AND s.workflow_id IN (SELECT w.id FROM public.request_type_workflows w WHERE w.code='final_chance_external_payment_workflow' AND w.is_active)"
echo "--- fix draft: fail-closed probes (each must abort and change nothing)"
probe "payment step already skippable" \
  "UPDATE public.request_type_workflow_steps s SET can_skip=true WHERE $PAY" \
  "B1_PAID_FIX01_PAYMENT_STEP_IS_SKIPPABLE:final_chance" \
  "UPDATE public.request_type_workflow_steps s SET can_skip=false WHERE $PAY"
probe "workflow carries a fee-assessment step" \
  "UPDATE public.request_type_workflow_steps s SET action_type='assess_fee' WHERE s.step_key='manager_review' AND s.workflow_id IN (SELECT w.id FROM public.request_type_workflows w WHERE w.code='final_chance_external_payment_workflow' AND w.is_active)" \
  "B1_PAID_FIX01_WORKFLOW_HAS_A_FEE_ASSESSMENT_STEP:final_chance" \
  "UPDATE public.request_type_workflow_steps s SET action_type='approve' WHERE s.step_key='manager_review' AND s.workflow_id IN (SELECT w.id FROM public.request_type_workflows w WHERE w.code='final_chance_external_payment_workflow' AND w.is_active)"
probe "unexpected active workflow code" \
  "UPDATE public.request_type_workflows SET code='department_transfer_custom' WHERE code='department_transfer_external_payment_workflow' AND is_active" \
  "B1_PAID_FIX01_UNEXPECTED_ACTIVE_WORKFLOW_CODE:department_transfer" \
  "UPDATE public.request_type_workflows SET code='department_transfer_external_payment_workflow' WHERE code='department_transfer_custom'"
probe "fee branch edited by hand (different condition)" \
  "UPDATE public.request_type_workflow_transitions t SET condition_schema='{\"code\":\"FEE_IS_ZERO\",\"params\":{}}'::jsonb WHERE t.condition_schema->>'code'='FEE_GREATER_THAN_ZERO' AND t.workflow_id IN (SELECT w.id FROM public.request_type_workflows w WHERE w.code='department_transfer_external_payment_workflow' AND w.is_active)" \
  "B1_PAID_FIX01_UNEXPECTED_FEE_BRANCH_SHAPE:department_transfer" \
  "UPDATE public.request_type_workflow_transitions t SET condition_schema='{\"code\":\"FEE_GREATER_THAN_ZERO\",\"params\":{}}'::jsonb WHERE t.condition_schema->>'code'='FEE_IS_ZERO' AND t.workflow_id IN (SELECT w.id FROM public.request_type_workflows w WHERE w.code='department_transfer_external_payment_workflow' AND w.is_active)"
probe "request type missing" \
  "UPDATE public.request_types SET code='final_chance_renamed' WHERE code='final_chance'" \
  "B1_PAID_FIX01_REQUEST_TYPE_MUST_RESOLVE_EXACTLY_ONCE:final_chance:0" \
  "UPDATE public.request_types SET code='final_chance' WHERE code='final_chance_renamed'"

# ---- fix draft: apply twice, then prove the behaviour --------------------------
for db in paid_a paid_b; do
  echo "=== fix draft on $db"
  PGDATABASE="$db" psql -v ON_ERROR_STOP=1 -q -f "$FIX" 2>&1 | sed 's/^psql:[^ ]* NOTICE:  //'
  PGDATABASE="$db" psql -v ON_ERROR_STOP=1 -q -Atc "select public.hp_fingerprint()" > "$PGDIR/fp-1.txt"
  PGDATABASE="$db" psql -v ON_ERROR_STOP=1 -q -f "$FIX" 2>&1 | sed 's/^psql:[^ ]* NOTICE:  //'
  PGDATABASE="$db" psql -v ON_ERROR_STOP=1 -q -Atc "select public.hp_fingerprint()" > "$PGDIR/fp-2.txt"
  cmp "$PGDIR/fp-1.txt" "$PGDIR/fp-2.txt" || { echo "IDEMPOTENCY_FINGERPRINT_MISMATCH($db)"; exit 1; }
  echo "ok: second apply changed nothing (fingerprint identical)"
  cases "$db" "$HARNESS/04-cases-after-fix.sql" > "$PGDIR/fix-$db.log"
  if [ "$db" = "paid_a" ]; then cat "$PGDIR/fix-$db.log"; fi
  grep -q "B1_PAID_SERVICES_ZERO_FEE_SKIP_FIX_01_CASES_PASS" "$PGDIR/fix-$db.log" \
    || { echo "FIX_CASES_FAILED($db)"; cat "$PGDIR/fix-$db.log"; exit 1; }
done
cmp "$PGDIR/fix-paid_a.log" "$PGDIR/fix-paid_b.log" || { echo "FIX_BEHAVIOUR_DIFFERS_WITH_EXCUSED_ABSENCE_DRAFT"; exit 1; }
echo "ok: identical after-fix case log with and without the excused-absence draft"

# The excused-absence draft still applies cleanly AFTER the fix (either order).
PGDATABASE=paid_a psql -v ON_ERROR_STOP=1 -q -f "$ABSENCE_DRAFT" >/dev/null 2>&1 \
  || { echo "EXCUSED_ABSENCE_DRAFT_FAILS_AFTER_FIX"; exit 1; }
echo "ok: the excused-absence draft applies after the fix draft as well"

echo "B1_PAID_SERVICES_ZERO_FEE_CHECK_01_REHEARSAL_PASS"
