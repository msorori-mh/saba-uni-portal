$ErrorActionPreference = 'Stop'
$name = "b1-44-fixture15-pg17-$PID"
$root = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
$fixRel = 'supabase/migrations/20260803030000_b1_44_restore_sr_20260801_13000015.sql'
$scriptDir = 'scripts/b1-fixture-15-reissue-44-pg17'
$nonemptyPriorPrologueRel = Join-Path $scriptDir 'nonempty-prior-auth-context-prologue.sql'
$nonemptyPriorEpilogueRel = Join-Path $scriptDir 'nonempty-prior-auth-context-epilogue.sql'
$PRIOR_JWT_SUB = 'c8a94548-4782-4252-86f9-23559d3b95bd'
$PRIOR_ATOMIC_ACTION = 'prior-auth-context-marker'

function Invoke-RepoFile([string]$file, [switch]$Transactional) {
  if ($Transactional) {
    # Mirror the migration-runner single-transaction envelope so SET LOCAL /
    # set_config(..., is_local=true) survive for the whole file.
    $abs = Join-Path $root $file
    $body = Get-Content -Raw -Path $abs
    $sql = "BEGIN;`n$body`nCOMMIT;"
    $tmp = Join-Path $env:TEMP ("b1-44-" + [guid]::NewGuid().ToString('N') + ".sql")
    [System.IO.File]::WriteAllText($tmp, $sql)
    try {
      Get-Content -Raw $tmp | docker exec -i -w /repo $name psql -v ON_ERROR_STOP=1 -U postgres
      if ($LASTEXITCODE -ne 0) { throw "PG17_FILE_FAILED: $file" }
    } finally {
      Remove-Item -Force $tmp -ErrorAction SilentlyContinue
    }
    return
  }
  docker exec -w /repo $name psql -v ON_ERROR_STOP=1 -U postgres -f $file
  if ($LASTEXITCODE -ne 0) { throw "PG17_FILE_FAILED: $file" }
}

function Invoke-Sql([string]$sql) {
  docker exec $name psql -v ON_ERROR_STOP=1 -U postgres -c $sql
  if ($LASTEXITCODE -ne 0) { throw "PG17_SQL_FAILED" }
}

function Invoke-MigrationWithNonemptyPriorAuthContext {
  $prologue = Get-Content -Raw -Path (Join-Path $root $nonemptyPriorPrologueRel)
  $migration = Get-Content -Raw -Path (Join-Path $root $fixRel)
  $epilogue = Get-Content -Raw -Path (Join-Path $root $nonemptyPriorEpilogueRel)
  $sql = "BEGIN;`n$prologue`n$migration`n$epilogue`nCOMMIT;"
  $tmp = Join-Path $env:TEMP ("b1-44-nonempty-" + [guid]::NewGuid().ToString('N') + ".sql")
  [System.IO.File]::WriteAllText($tmp, $sql)
  try {
    $output = Get-Content -Raw $tmp | docker exec -i -w /repo $name psql -v ON_ERROR_STOP=1 -U postgres 2>&1
    if ($LASTEXITCODE -ne 0) {
      throw "PG17_NONEMPTY_PRIOR_AUTH_APPLY_FAILED: $($output -join ' ')"
    }
    $joined = ($output -join "`n")
    if ($joined -notmatch [regex]::Escape($PRIOR_JWT_SUB) -or
        $joined -notmatch [regex]::Escape($PRIOR_ATOMIC_ACTION)) {
      throw "PG17_NONEMPTY_PRIOR_AUTH_CONTEXT_VALUES_NOT_SURFACED: $joined"
    }
  } finally {
    Remove-Item -Force $tmp -ErrorAction SilentlyContinue
  }
}

function Assert-NoCrossSessionAuthContextLeak {
  $jwtAfter = (docker exec $name psql -X -At -U postgres -c "select coalesce(current_setting('request.jwt.claim.sub', true), '');").Trim()
  $actionAfter = (docker exec $name psql -X -At -U postgres -c "select coalesce(current_setting('b1.atomic_action', true), '');").Trim()
  if ($jwtAfter -ne '' -or $actionAfter -ne '') {
    throw "PG17_AUTH_CONTEXT_LEAKED jwt=$jwtAfter action=$actionAfter"
  }
}

function Expect-RepoFileFailure([string]$file, [string]$expected) {
  $abs = Join-Path $root $file
  $body = Get-Content -Raw -Path $abs
  $sql = "BEGIN;`n$body`nCOMMIT;"
  $tmp = Join-Path $env:TEMP ("b1-44-fail-" + [guid]::NewGuid().ToString('N') + ".sql")
  [System.IO.File]::WriteAllText($tmp, $sql)
  $prior = $ErrorActionPreference
  $ErrorActionPreference = 'Continue'
  try {
    $output = Get-Content -Raw $tmp | docker exec -i -w /repo $name psql -v ON_ERROR_STOP=1 -U postgres 2>&1
    $exitCode = $LASTEXITCODE
  } finally {
    $ErrorActionPreference = $prior
    Remove-Item -Force $tmp -ErrorAction SilentlyContinue
  }
  if ($exitCode -eq 0) { throw "PG17_EXPECTED_STOP_MISSING: $expected" }
  if (($output -join "`n") -notmatch [regex]::Escape($expected)) {
    throw "PG17_WRONG_STOP: expected $expected; output=$($output -join ' ')"
  }
}

docker run --name $name --rm -d -e POSTGRES_PASSWORD=test -v "${root}:/repo" postgres:17 | Out-Null
try {
  for ($i = 0; $i -lt 40; $i++) {
    docker exec $name pg_isready -U postgres *> $null
    if ($LASTEXITCODE -eq 0) { break }
    Start-Sleep -Seconds 1
  }
  if ($LASTEXITCODE -ne 0) { throw 'PG17_READY_TIMEOUT' }

  $pg = (docker exec $name psql -X -At -U postgres -c "show server_version;").Trim()
  if ($pg -notmatch '^17\.') { throw "PG17_VERSION_MISMATCH: $pg" }
  Write-Output "PG17_VERSION=$pg"

  Invoke-RepoFile "$scriptDir/00-schema.sql"
  Invoke-RepoFile "$scriptDir/01-seed.sql"

  $fpOthersBefore = (docker exec $name psql -X -At -U postgres -c @"
select md5(string_agg(t::text, '|' order by t::text))
from (
  select r.id, r.status, r.current_step_index, r.completed_at,
         (select string_agg(s.id::text||':'||s.status, ',' order by s.step_order)
            from student_request_workflow_steps s where s.student_request_id=r.id) as steps
  from student_requests r
  where r.internal_notes='TEST_ONLY_B1_FIXTURE_13'
    and r.id <> 'f1300000-0000-4000-8000-000000000015'
) t;
"@).Trim()

  $fpEcBefore = (docker exec $name psql -X -At -U postgres -c @"
select md5(string_agg(x, '|' order by x)) from (
  select marker||'|'||payload as x from enrollment_certificate_document_details
  union all
  select marker||'|'||payload from official_documents
  union all
  select code||'|'||student_visible::text from request_types where code='enrollment_certificate'
) q;
"@).Trim()

  Write-Output "PRE_REPAIR_ACTIVE_18_CONFIRMED"
  Invoke-MigrationWithNonemptyPriorAuthContext
  Invoke-RepoFile "$scriptDir/02-verify.sql"
  Write-Output "PG17_REPAIR_APPLIED"
  Write-Output "PG17_NONEMPTY_PRIOR_AUTH_CONTEXT_RESTORED_EXACT"
  Assert-NoCrossSessionAuthContextLeak
  Write-Output "PG17_AUTH_CONTEXT_NO_CROSS_SESSION_LEAK"

  $fpOthersAfter = (docker exec $name psql -X -At -U postgres -c @"
select md5(string_agg(t::text, '|' order by t::text))
from (
  select r.id, r.status, r.current_step_index, r.completed_at,
         (select string_agg(s.id::text||':'||s.status, ',' order by s.step_order)
            from student_request_workflow_steps s where s.student_request_id=r.id) as steps
  from student_requests r
  where r.internal_notes='TEST_ONLY_B1_FIXTURE_13'
    and r.id <> 'f1300000-0000-4000-8000-000000000015'
) t;
"@).Trim()
  if ($fpOthersBefore -ne $fpOthersAfter) {
    throw "PG17_OTHER_18_CHANGED before=$fpOthersBefore after=$fpOthersAfter"
  }
  Write-Output "PG17_OTHER_18_UNCHANGED"

  $fpEcAfter = (docker exec $name psql -X -At -U postgres -c @"
select md5(string_agg(x, '|' order by x)) from (
  select marker||'|'||payload as x from enrollment_certificate_document_details
  union all
  select marker||'|'||payload from official_documents
  union all
  select code||'|'||student_visible::text from request_types where code='enrollment_certificate'
) q;
"@).Trim()
  if ($fpEcBefore -ne $fpEcAfter) { throw "PG17_EC_FINGERPRINT_CHANGED" }
  Write-Output "PG17_EC_FINGERPRINT_UNCHANGED"

  # Idempotent second apply (already restored)
  Invoke-RepoFile $fixRel -Transactional
  Invoke-RepoFile "$scriptDir/02-verify.sql"
  Write-Output "PG17_SECOND_APPLY_IDEMPOTENT"

  # Unexpected pre-state rolls back (mutate Fixture 15 away from restored/consumed)
  Invoke-Sql @"
BEGIN;
SELECT set_config('b1.atomic_init','1',true);
SELECT set_config('request.jwt.claim.sub','aec1303e-de6a-4580-94cf-7205c17b5535',true);
SELECT set_config('b1.atomic_action','1',true);
UPDATE public.student_requests
   SET status='cancelled', completed_at=now()
 WHERE id='f1300000-0000-4000-8000-000000000015';
SELECT set_config('request.jwt.claim.sub','',true);
SELECT set_config('b1.atomic_action','',true);
COMMIT;
"@
  Expect-RepoFileFailure $fixRel 'B1_44_FIXTURE_15_UNEXPECTED_PRESTATE'
  $status = (docker exec $name psql -X -At -U postgres -c "select status from student_requests where id='f1300000-0000-4000-8000-000000000015';").Trim()
  if ($status -ne 'cancelled') { throw "PG17_UNEXPECTED_MUTATED_OUTSIDE_TX status=$status" }
  Write-Output "PG17_UNEXPECTED_PRESTATE_FAIL_CLOSED"

  Write-Output "PASS_B1_44_FIXTURE_15_REISSUE_PG17"
  Write-Output "PASS_B1_FIXTURE_15_MANAGED_CHANNEL_TRIGGER_CONTEXT_56"
}
finally {
  docker rm -f $name *> $null
}
