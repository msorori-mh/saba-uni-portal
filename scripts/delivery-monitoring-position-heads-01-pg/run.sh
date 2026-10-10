#!/usr/bin/env bash
# Isolated PostgreSQL rehearsal for
#   docs/migration-drafts/DELIVERY-MONITORING-POSITION-HEADS-01.sql
# NEVER touches production or any shared database: it builds a throwaway
# cluster on a private unix socket (no TCP listener).
#
# The functions the draft patches are extracted VERBATIM from the applied
# migrations at run time, so the anchors are proven against the deployed text.
#
#   PG_OS_USER  unprivileged OS user that owns the cluster (default: lovable,
#               falls back to postgres, then to the current non-root user)
#   PGDIR       throwaway data directory        (default: /tmp/dmph01-pg)
#   PORT        private port for the socket     (default: 55441)
#   KEEP=1      leave the cluster running for inspection
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
HARNESS="$ROOT/scripts/delivery-monitoring-position-heads-01-pg"
MIG="$ROOT/supabase/migrations"
D="$ROOT/docs/migration-drafts/DELIVERY-MONITORING-POSITION-HEADS-01"
DRAFT="$D.sql"; PREFLIGHT="$D.preflight.sql"; VERIFY="$D.verify.sql"; ROLLBACK="$D.rollback-by-forward.sql"
PGDIR="${PGDIR:-/tmp/dmph01-pg}"
PORT="${PORT:-55441}"

for bin in /usr/lib/postgresql/*/bin; do [ -x "$bin/initdb" ] && PATH="$bin:$PATH"; done
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
sql() { psql -v ON_ERROR_STOP=1 -q -Atc "$1"; }
fp() { sql "select public.hp_fingerprint()"; }
field() { PGDATABASE="${3:-postgres}" psql -v ON_ERROR_STOP=1 -q -Atx -f "$1" | sed -n "s/^$2|//p"; }
expect_field() { # label, file, column, expected[, database]
  local got; got="$(field "$2" "$3" "${5:-postgres}")"
  [ "$got" = "$4" ] || { echo "QUERY_CHECK_FAIL($1): $3 = '$got', expected '$4'"; exit 1; }
  echo "ok: $1 -> $3 = $4"
}
applied() { # migration prefix, function — verbatim extract of the applied definition
  python3 "$HARNESS/extract-applied.py" "$(ls "$MIG"/"$1"_*.sql)" "$2" > "$PGDIR/$2.sql"
  run "APPLIED $2 (verbatim from migration $1)" "$PGDIR/$2.sql"
}

run "schema" "$HARNESS/00-schema.sql"
applied 20260531225124 is_department_head_of
applied 20260812002411 cdp_can_manage_section
applied 20260812015421 cdp_can_view_section
applied 20260812225709 cdp_get_section_plan
applied 20260812015421 cdp_delivery_monitoring
run "fixtures" "$HARNESS/01-fixtures.sql"
sql "UPDATE public.hp_before SET mon = public.hp_mon(n),
       plan_cs = public.hp_plan(n, '5ec00000-0000-4000-8000-0000000000a1'),
       plan_it = public.hp_plan(n, '5ec00000-0000-4000-8000-0000000000b1')"
[ "$(sql "select mon from public.hp_before where n = 1")" = "ERR:CDP_NOT_AUTHORIZED" ] \
  || { echo "DEFECT_NOT_REPRODUCED"; exit 1; }
echo "ok: defect reproduced — the position-only head is denied by the deployed RPC"

# ---- pre-flight (read-only) + drift probes ------------------------------------
MON="public.cdp_delivery_monitoring(text)"
rewrite_fn() { # signature, from, to — drift simulation in the throwaway cluster
  printf "DO \$do\$ BEGIN EXECUTE replace(pg_get_functiondef('%s'::regprocedure), \$a\$%s\$a\$, \$b\$%s\$b\$); END \$do\$" "$1" "$2" "$3"
}
BODIES_MD5="select md5(pg_get_functiondef('$MON'::regprocedure) || pg_get_functiondef('public.cdp_can_view_section(uuid,uuid)'::regprocedure))"
PRE_MD5="$(sql "$BODIES_MD5")"
before="$(fp)"
expect_field "pre-flight on the deployed state" "$PREFLIGHT" ready_to_apply t
expect_field "pre-flight before the apply" "$PREFLIGHT" draft_already_applied f
expect_field "pre-flight data observation" "$PREFLIGHT" head_positions_without_department "{head_without_department}"
expect_field "pre-flight data observation" "$PREFLIGHT" heads_invisible_to_monitoring_today 2
[ "$before" = "$(fp)" ] || { echo "PREFLIGHT_QUERY_IS_NOT_READ_ONLY"; exit 1; }
probe() { # label, from, to, expected error, failing anchors
  sql "$(rewrite_fn "$MON" "$2" "$3")"
  local b; b="$(fp)"
  expect_field "pre-flight sees: $1" "$PREFLIGHT" ready_to_apply f
  [ -z "$5" ] || expect_field "pre-flight names: $1" "$PREFLIGHT" failing_anchors "$5"
  if psql -v ON_ERROR_STOP=1 -q -f "$DRAFT" >"$PGDIR/probe.out" 2>&1; then echo "PROBE_FAIL($1): draft applied"; exit 1; fi
  grep -q "$4" "$PGDIR/probe.out" || { echo "PROBE_FAIL($1): expected $4"; cat "$PGDIR/probe.out"; exit 1; }
  [ "$b" = "$(fp)" ] || { echo "PROBE_FAIL($1): aborted apply left changes behind"; exit 1; }
  sql "$(rewrite_fn "$MON" "$3" "$2")"
  echo "ok: fail-closed [$1] -> $4; nothing changed"
}
probe "role gate drifted" "elsif public.has_role(v_uid,'department_head'::public.app_role) then" \
  "elsif public.has_role(v_uid, 'department_head'::public.app_role) then" \
  "DMPH01_PATCH_ANCHOR_HITS:DMPH01:gate:0" "{DMPH01:gate:0}"
probe "one scope filter drifted" "from agg;" "from agg; -- public.is_department_head_of(v_uid, c.department_id)" \
  "DMPH01_PATCH_ANCHOR_HITS:DMPH01:scope:3" "{DMPH01:scope:3}"
probe "college role removed by hand" "or public.has_role(v_uid,'registrar'::public.app_role)" \
  "or public.has_role(v_uid,'hr_officer'::public.app_role)" "DMPH01_COLLEGE_SCOPE_OR_DENIAL_DRIFTED" ""
[ "$before" = "$(fp)" ] || { echo "PROBES_DID_NOT_RESTORE"; exit 1; }
expect_field "pre-flight is green again" "$PREFLIGHT" ready_to_apply t

# ---- apply twice ---------------------------------------------------------------
echo "--- applying DELIVERY-MONITORING-POSITION-HEADS-01"
psql -v ON_ERROR_STOP=1 -q -f "$DRAFT"
fp1="$(fp)"
[ "$fp1" != "$before" ] || { echo "APPLY_CHANGED_NOTHING"; exit 1; }
echo "--- re-applying (idempotency)"
psql -v ON_ERROR_STOP=1 -q -f "$DRAFT"
[ "$fp1" = "$(fp)" ] || { echo "IDEMPOTENCY_FINGERPRINT_MISMATCH"; exit 1; }
echo "ok: second apply changed nothing (fingerprint identical)"
expect_field "post-apply verification" "$VERIFY" applied_correctly t
expect_field "post-apply verification" "$VERIFY" departments_with_a_head_who_can_now_monitor "{\"علوم الحاسوب\",\"نظم المعلومات\"}"
expect_field "pre-flight after the apply" "$PREFLIGHT" ready_to_apply t
expect_field "pre-flight after the apply" "$PREFLIGHT" draft_already_applied t
[ "$fp1" = "$(fp)" ] || { echo "VERIFY_QUERY_IS_NOT_READ_ONLY"; exit 1; }

# ---- behaviour (direct RPC as `authenticated`) ------------------------------------
echo "=== authorization matrix"
psql -v ON_ERROR_STOP=1 -q -f "$HARNESS/02-cases.sql" 2>&1 | sed 's/^psql:[^ ]* NOTICE:  //'

# ---- rollback by forward, rehearsed on a copy ---------------------------------------
echo "--- rollback-by-forward rehearsal (on a copy)"
sql "create database dmph01_rollback template postgres"
PGDATABASE=dmph01_rollback psql -v ON_ERROR_STOP=1 -q -f "$ROLLBACK"
[ "$(PGDATABASE=dmph01_rollback sql "$BODIES_MD5")" = "$PRE_MD5" ] \
  || { echo "ROLLBACK_DID_NOT_RESTORE_THE_DEPLOYED_BODIES"; exit 1; }
echo "ok: rollback restored both deployed bodies byte-for-byte"
[ "$(PGDATABASE=dmph01_rollback sql "select public.hp_mon(1)")" = "ERR:CDP_NOT_AUTHORIZED" ] || { echo "ROLLBACK_BEHAVIOUR"; exit 1; }
r1="$(PGDATABASE=dmph01_rollback fp)"
PGDATABASE=dmph01_rollback psql -v ON_ERROR_STOP=1 -q -f "$ROLLBACK"
[ "$r1" = "$(PGDATABASE=dmph01_rollback fp)" ] || { echo "ROLLBACK_IS_NOT_IDEMPOTENT"; exit 1; }
PGDATABASE=dmph01_rollback psql -v ON_ERROR_STOP=1 -q -f "$DRAFT"
expect_field "draft re-applied after a rollback" "$VERIFY" applied_correctly t dmph01_rollback
sql "drop database dmph01_rollback"

echo "DELIVERY_MONITORING_POSITION_HEADS_01_REHEARSAL_PASS"
