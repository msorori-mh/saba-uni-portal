#!/usr/bin/env bash
# ============================================================================
# PORTAL-B1-ACTOR-IS-ACTIONABLE-VERIFIER-AND-RUNTIME-REGRESSION-REMEDIATION-33
# G4 executable regression runner — LOCAL DISPOSABLE POSTGRES ONLY.
#
# NEVER point this at production. It refuses to run if PGHOST/DATABASE_URL are
# exported, creates its own throw-away cluster under a temp directory, applies
# the minimal local schema, applies the *unmodified* Package 30 migration draft
# verbatim, runs pg/30-cases.sql (which ends with ROLLBACK) and prints results.
#
# Usage:  bash tests/b1-actor-is-actionable-runtime-regression-33/run-harness.sh
# ============================================================================
set -euo pipefail

if [ -n "${PGHOST:-}" ] || [ -n "${DATABASE_URL:-}" ] || [ -n "${PGURI:-}" ]; then
  echo "REFUSING TO RUN: PGHOST/DATABASE_URL/PGURI is set. This harness is local-only." >&2
  exit 2
fi

# PostgreSQL refuses to run as root. When the harness is invoked by root (CI
# containers, sandboxes), re-exec once as a dedicated unprivileged local user.
if [ "$(id -u)" = "0" ] && [ -z "${B1_REGRESSION_33_REEXEC:-}" ]; then
  HARNESS_USER="${B1_REGRESSION_33_USER:-pgharness}"
  if ! id "$HARNESS_USER" >/dev/null 2>&1; then
    useradd -m "$HARNESS_USER" >/dev/null 2>&1 || adduser -D "$HARNESS_USER" >/dev/null 2>&1
  fi
  SELF="$(cd "$(dirname "$0")" && pwd)/$(basename "$0")"
  exec su "$HARNESS_USER" -s /bin/bash -c "B1_REGRESSION_33_REEXEC=1 PATH='$PATH' bash '$SELF'"
fi

HERE="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$HERE/../.." && pwd)"
DRAFT="$ROOT/docs/migration-drafts/B1-ACTOR-IS-ACTIONABLE-CONFIGURED-ACTION-01.sql"

[ -f "$DRAFT" ] || { echo "MISSING DRAFT: $DRAFT" >&2; exit 2; }

WORK="$(mktemp -d /tmp/b1-actor-regression-33.XXXXXX)"
DATA="$WORK/data"
SOCK="$WORK/sock"
mkdir -p "$SOCK"

cleanup() {
  pg_ctl -D "$DATA" -m immediate stop >/dev/null 2>&1 || true
  rm -rf "$WORK"
}
trap cleanup EXIT

initdb -D "$DATA" -U postgres --auth=trust >"$WORK/initdb.log" 2>&1
pg_ctl -D "$DATA" -o "-k $SOCK -c listen_addresses=" -l "$WORK/pg.log" -w start >/dev/null

export PGHOST="$SOCK" PGUSER=postgres PGDATABASE=postgres
psql -v ON_ERROR_STOP=1 -q -c "create database b1_actor_regression_33" >/dev/null
export PGDATABASE=b1_actor_regression_33

echo "== applying local minimal schema"
psql -v ON_ERROR_STOP=1 -q -f "$HERE/pg/10-minimal-schema.sql"

echo "== applying Package 30 migration draft VERBATIM: $(basename "$DRAFT")"
psql -v ON_ERROR_STOP=1 -q -f "$DRAFT"

echo "== running CASE A..E (isolated transaction, ends with ROLLBACK)"
psql -v ON_ERROR_STOP=1 -f "$HERE/pg/30-cases.sql"
