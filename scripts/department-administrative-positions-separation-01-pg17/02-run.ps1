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

  $safeDisable='docs/migration-drafts/DEPARTMENT-ADMINISTRATIVE-POSITIONS-SEPARATION-01-ROLLBACK-BY-FORWARD.sql'
  $postconditions='scripts/department-administrative-positions-separation-01-pg17/02-safe-disable-postconditions.sql'
  function Invoke-RepoFile([string]$file) {
    docker exec -w /repo $name psql -v ON_ERROR_STOP=1 -U postgres -f $file
    if($LASTEXITCODE-ne 0){throw "PG17_FILE_FAILED: $file"}
  }
  function Invoke-Sql([string]$sql) {
    docker exec $name psql -v ON_ERROR_STOP=1 -U postgres -c $sql
    if($LASTEXITCODE-ne 0){throw "PG17_SQL_FAILED: $sql"}
  }
  function Expect-RepoFileFailure([string]$file,[string]$expected) {
    $priorErrorPreference=$ErrorActionPreference
    $ErrorActionPreference='Continue'
    $output=docker exec -w /repo $name psql -v ON_ERROR_STOP=1 -U postgres -f $file 2>&1
    $exitCode=$LASTEXITCODE
    $ErrorActionPreference=$priorErrorPreference
    if($exitCode-eq 0){throw "PG17_EXPECTED_STOP_MISSING: $expected"}
    if(($output -join "`n") -notmatch [regex]::Escape($expected)){
      throw "PG17_WRONG_STOP: expected $expected; output=$($output -join ' ')"
    }
  }

  # Production contract fixture: is_active=true is allowed by itself.
  Invoke-RepoFile $safeDisable
  Invoke-Sql "DO `$`$ BEGIN IF NOT EXISTS(SELECT 1 FROM public.request_types WHERE code='department_transfer' AND is_active AND NOT student_visible) THEN RAISE EXCEPTION 'PRODUCTION_FIXTURE_CHANGED'; END IF; END `$`$;"
  Invoke-RepoFile $postconditions

  Invoke-Sql "UPDATE public.request_types SET student_visible=true WHERE code='department_transfer';"
  Expect-RepoFileFailure $safeDisable 'SAFE_DISABLE_TRANSFER_REQUEST_TYPE_VISIBLE'
  Invoke-Sql "UPDATE public.request_types SET student_visible=false WHERE code='department_transfer';"

  Invoke-Sql "INSERT INTO public.request_type_workflows(id,request_type_id,code,status,is_active) SELECT '51000000-0000-4000-8000-000000000001',id,'department_transfer_active','active',true FROM public.request_types WHERE code='department_transfer';"
  Expect-RepoFileFailure $safeDisable 'SAFE_DISABLE_ACTIVE_TRANSFER_WORKFLOW_EXISTS'
  Invoke-Sql "DELETE FROM public.request_type_workflows WHERE id='51000000-0000-4000-8000-000000000001';"

  Invoke-Sql "INSERT INTO public.student_requests(id,request_type,status) VALUES('52000000-0000-4000-8000-000000000001','department_transfer','under_review'); INSERT INTO public.student_request_workflow_steps(id,student_request_id,step_key,status) VALUES('53000000-0000-4000-8000-000000000001','52000000-0000-4000-8000-000000000001','source_department_head_approval','pending');"
  Expect-RepoFileFailure $safeDisable 'SAFE_DISABLE_EXECUTABLE_TRANSFER_RUNTIME_EXISTS'
  Invoke-Sql "DELETE FROM public.student_request_workflow_steps WHERE id='53000000-0000-4000-8000-000000000001'; DELETE FROM public.student_requests WHERE id='52000000-0000-4000-8000-000000000001';"

  Invoke-Sql "CREATE OR REPLACE FUNCTION public.current_user_matches_transfer_department_scope(p_step_id uuid,p_step_key text) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS 'SELECT true';"
  Expect-RepoFileFailure $postconditions 'SAFE_DISABLE_AUTHORIZATION_FUNCTION_NOT_FAIL_CLOSED'
  Invoke-RepoFile $safeDisable
  Invoke-RepoFile $postconditions
  Write-Output 'PG17_PR216_SAFE_DISABLE_PRODUCTION_CONTRACT_PASS'
} finally {
  docker stop $name *> $null
}
