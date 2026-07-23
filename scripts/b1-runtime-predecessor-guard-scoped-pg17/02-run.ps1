$ErrorActionPreference='Stop'; $name="b1-pred-guard-scoped-$PID"; $root=(Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
docker run --name $name --rm -d -e POSTGRES_PASSWORD=test -v "${root}:/repo" postgres:17 | Out-Null
try { for($i=0;$i-lt 30;$i++){docker exec $name pg_isready -U postgres *> $null;if($LASTEXITCODE-eq 0){break};Start-Sleep 1}; if($LASTEXITCODE-ne 0){throw 'PG17_READY_TIMEOUT'}
 docker exec -w /repo $name psql -v ON_ERROR_STOP=1 -U postgres -f scripts/b1-local-pg-compile/01-minimal-compatible-schema.sql -f docs/migration-drafts/STUDENT-REQUEST-WORKFLOW-ACTOR-AUTHORIZATION-HARDENING.sql -f docs/migration-drafts/B1-RUNTIME-PREDECESSOR-GUARD-REMEDIATION-02.sql -f scripts/b1-runtime-predecessor-guard-scoped-pg17/01-cases.sql
 if($LASTEXITCODE-ne 0){throw 'PG17_SCOPED_FAILURE'}
} finally { docker stop $name *> $null }
