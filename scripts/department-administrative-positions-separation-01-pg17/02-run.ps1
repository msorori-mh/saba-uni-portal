$ErrorActionPreference='Stop'
$name="department-admin-position-pg17-$PID"
$root=(Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
docker run --name $name --rm -d -e POSTGRES_PASSWORD=test -v "${root}:/repo" postgres:17 | Out-Null
try {
  for($i=0;$i-lt 30;$i++){
    docker exec $name pg_isready -U postgres *> $null
    if($LASTEXITCODE-eq 0){break}
    Start-Sleep 1
  }
  if($LASTEXITCODE-ne 0){throw 'PG17_READY_TIMEOUT'}
  docker exec -w /repo $name psql -v ON_ERROR_STOP=1 -U postgres `
    -f scripts/b1-local-pg-compile/01-minimal-compatible-schema.sql `
    -f scripts/department-administrative-positions-separation-01-pg17/00-setup-legacy.sql `
    -f docs/migration-drafts/DEPARTMENT-ADMINISTRATIVE-POSITIONS-SEPARATION-01.sql `
    -f docs/migration-drafts/DEPARTMENT-ADMINISTRATIVE-POSITIONS-SEPARATION-01.sql `
    -f scripts/department-administrative-positions-separation-01-pg17/01-cases.sql
  if($LASTEXITCODE-ne 0){throw 'PG17_DEPARTMENT_ADMIN_POSITION_FAILURE'}
} finally {
  docker stop $name *> $null
}
