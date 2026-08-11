#!/usr/bin/env bash
# PORTAL-GA-FINAL-PRODUCTION-READINESS-LONGRUN-14
# Local exact apply rehearsal on disposable PostgreSQL 17.
# Usage: bash scripts/ga-local-exact-rehearsal.sh
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
CONTAINER="ga-final-readiness-rehearsal-$(date +%s)"
DB="postgres"
USER="postgres"

export PGPASSWORD="ci_pg_verifier_password"

cleanup() {
  docker rm -f "$CONTAINER" >/dev/null 2>&1 || true
}
trap cleanup EXIT

echo "==> Starting postgres:17 container $CONTAINER"
docker run -d --name "$CONTAINER" \
  -e POSTGRES_HOST_AUTH_METHOD=trust \
  -e POSTGRES_PASSWORD="$PGPASSWORD" \
  postgres:17 >/dev/null

for i in {1..60}; do
  if docker exec "$CONTAINER" pg_isready -U "$USER" -d "$DB" >/dev/null 2>&1; then
    break
  fi
  sleep 1
done

exec_sql() {
  local label="$1"
  local file="$2"
  echo "==> $label: $file"
  docker exec -i "$CONTAINER" psql -v ON_ERROR_STOP=1 -U "$USER" -d "$DB" < "$file"
}

exec_sql "SETUP" "$ROOT/tests/graduates-affairs/graduates-affairs-authorization-04.pg-setup.sql"
exec_sql "FOUNDATION" "$ROOT/supabase/migrations/20260808210000_ga_mvp_foundation_01.sql"
exec_sql "FOUNDATION VERIFIER" "$ROOT/tests/graduates-affairs/ga-production-promotion-post-verifier-foundation.sql"
exec_sql "COMPLETION" "$ROOT/supabase/migrations/20260808210100_ga_mvp_completion_01.sql"
exec_sql "COMPLETION VERIFIER" "$ROOT/tests/graduates-affairs/ga-production-promotion-post-verifier-completion.sql"
exec_sql "AUTH04" "$ROOT/supabase/migrations/20260808210200_ga_authorization_04.sql"
exec_sql "AUTH04 VERIFIER" "$ROOT/tests/graduates-affairs/ga-production-promotion-post-verifier-auth04.sql"
exec_sql "AUTHORITY RACE MATRIX" "$ROOT/tests/graduates-affairs/graduates-affairs-followup-authority-race-01.pg-verify.sql"
exec_sql "REMEDIATION 02" "$ROOT/supabase/migrations/20260811230000_ga_independent_security_audit_remediation_02.sql"
exec_sql "REMEDIATION 02 VERIFIER" "$ROOT/tests/graduates-affairs/ga-independent-security-audit-remediation-02.pg-verify.sql"

echo "==> LOCAL_EXACT_APPLY_REHEARSAL_PASS"
