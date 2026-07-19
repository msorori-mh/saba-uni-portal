$ErrorActionPreference = 'Stop'
$name = "chairs-pg17-$PID"
$root = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
docker run --name $name --rm -d -e POSTGRES_PASSWORD=test -v "${root}:/repo" postgres:17 | Out-Null
try {
  for ($i=0; $i -lt 30; $i++) { docker exec $name pg_isready -U postgres *> $null; if ($LASTEXITCODE -eq 0) { break }; Start-Sleep -Seconds 1 }
  if ($LASTEXITCODE -ne 0) { throw 'PostgreSQL 17 did not become ready' }
  function Psql([string]$db,[string]$file) { docker exec -w /repo $name psql -v ON_ERROR_STOP=1 -U postgres -d $db -f $file; if ($LASTEXITCODE -ne 0) { throw "psql failed: $file" } }
  function Db([string]$db) { docker exec $name createdb -U postgres $db; Psql $db 'scripts/department-chairs-controlled-fix-package-01/seed.sql' }

  Db 'positive'; Psql 'positive' 'scripts/department-chairs-controlled-fix-package-01/apply.sql'; Psql 'positive' 'scripts/department-chairs-controlled-fix-package-01/verify.sql'
  # Idempotency: second execution preserves one effective CS row.
  Psql 'positive' 'scripts/department-chairs-controlled-fix-package-01/apply.sql'; Psql 'positive' 'scripts/department-chairs-controlled-fix-package-01/verify.sql'

  Db 'reuse'; docker exec $name psql -U postgres -d reuse -c "insert into request_processing_assignments(unit_id,role_id,assignment_type,faculty_profile_id,department_id,is_active) values('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','faculty_profile','d08a8509-4c04-472e-885f-053a80be12ec','11111111-1111-4111-8111-111111111111',false)" | Out-Null; Psql 'reuse' 'scripts/department-chairs-controlled-fix-package-01/apply.sql'; Psql 'reuse' 'scripts/department-chairs-controlled-fix-package-01/verify.sql'

  foreach ($case in @('stale','duplicate','rollback','actor_missing','actor_inactive','actor_wrong_role')) { Db $case }
  docker exec $name psql -U postgres -d stale -c "update faculty_profiles set employee_number='STALE' where id='d08a8509-4c04-472e-885f-053a80be12ec'" | Out-Null
  docker exec $name psql -U postgres -d duplicate -c "insert into request_processing_assignments(unit_id,role_id,assignment_type,faculty_profile_id,department_id,is_active) select 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','faculty_profile','d08a8509-4c04-472e-885f-053a80be12ec','11111111-1111-4111-8111-111111111111',false from generate_series(1,2)" | Out-Null
  Psql 'rollback' 'scripts/department-chairs-controlled-fix-package-01/force-audit-failure.sql'
  foreach ($case in @('stale','duplicate','rollback')) {
    $ErrorActionPreference = 'Continue'
    docker exec -w /repo $name psql -v ON_ERROR_STOP=1 -U postgres -d $case -f scripts/department-chairs-controlled-fix-package-01/apply.sql *> $null
    $ErrorActionPreference = 'Stop'
    if ($LASTEXITCODE -eq 0) { throw "$case unexpectedly succeeded" }
    $dept = docker exec $name psql -At -U postgres -d $case -c "select department_id from faculty_profiles where id='d08a8509-4c04-472e-885f-053a80be12ec'"
    if ($dept.Trim() -ne 'ce485c67-5f7c-498d-b120-4b1130a86ae8') { throw "$case did not roll back" }
  }
  $actors = @{ actor_missing='aaaaaaaa-0000-4000-8000-000000000099'; actor_inactive='aaaaaaaa-0000-4000-8000-000000000002'; actor_wrong_role='aaaaaaaa-0000-4000-8000-000000000003' }
  foreach ($case in $actors.Keys) {
    $ErrorActionPreference = 'Continue'
    docker exec -w /repo $name psql -v ON_ERROR_STOP=1 -v actor=$($actors[$case]) -U postgres -d $case -f scripts/department-chairs-controlled-fix-package-01/apply.sql *> $null
    $ErrorActionPreference = 'Stop'
    if ($LASTEXITCODE -eq 0) { throw "$case unexpectedly succeeded" }
    $state = docker exec $name psql -At -U postgres -d $case -c "select department_id::text||':'||(select count(*) from audit_logs) from faculty_profiles where id='d08a8509-4c04-472e-885f-053a80be12ec'"
    if ($state.Trim() -ne 'ce485c67-5f7c-498d-b120-4b1130a86ae8:0') { throw "$case mutated state or wrote audit" }
  }
  Write-Output 'PG17 compile/positive/reuse/idempotency/stale/duplicate/rollback/actor-negative: PASS'
} finally { docker stop $name *> $null }
