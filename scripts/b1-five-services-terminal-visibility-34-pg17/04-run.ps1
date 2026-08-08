$ErrorActionPreference = 'Stop'
$name = "b1-34-terminal-vis-pg17-$PID"
$root = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
$fixRel = 'supabase/migrations/20260802070000_b1_34_five_services_terminal_visibility_false.sql'
$scriptDir = 'scripts/b1-five-services-terminal-visibility-34-pg17'

function Invoke-RepoFile([string]$file) {
  docker exec -w /repo $name psql -v ON_ERROR_STOP=1 -U postgres -f $file
  if ($LASTEXITCODE -ne 0) { throw "PG17_FILE_FAILED: $file" }
}

function Invoke-Sql([string]$sql) {
  docker exec $name psql -v ON_ERROR_STOP=1 -U postgres -c $sql
  if ($LASTEXITCODE -ne 0) { throw "PG17_SQL_FAILED" }
}

function Expect-SqlFailure([string]$sql, [string]$expected) {
  $prior = $ErrorActionPreference
  $ErrorActionPreference = 'Continue'
  $output = docker exec $name psql -v ON_ERROR_STOP=1 -U postgres -c $sql 2>&1
  $exitCode = $LASTEXITCODE
  $ErrorActionPreference = $prior
  if ($exitCode -eq 0) { throw "PG17_EXPECTED_STOP_MISSING: $expected" }
  if (($output -join "`n") -notmatch [regex]::Escape($expected)) {
    throw "PG17_WRONG_STOP: expected $expected; output=$($output -join ' ')"
  }
}

function Expect-RepoFileFailure([string]$file, [string]$expected) {
  $prior = $ErrorActionPreference
  $ErrorActionPreference = 'Continue'
  $output = docker exec -w /repo $name psql -v ON_ERROR_STOP=1 -U postgres -f $file 2>&1
  $exitCode = $LASTEXITCODE
  $ErrorActionPreference = $prior
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
  Invoke-RepoFile "$scriptDir/02-replay-visibility-history.sql"

  $beforeEc = (docker exec $name psql -X -At -U postgres -c "select student_visible::text||'|'||marker from request_types where code='enrollment_certificate';").Trim()
  $beforeUnrelated = (docker exec $name psql -X -At -U postgres -c "select string_agg(code||'='||student_visible::text, ',' order by code) from request_types where marker='unrelated';").Trim()

  Invoke-RepoFile $fixRel
  Invoke-RepoFile "$scriptDir/03-verify-and-fail-closed.sql"

  $afterEc = (docker exec $name psql -X -At -U postgres -c "select student_visible::text||'|'||marker from request_types where code='enrollment_certificate';").Trim()
  $afterUnrelated = (docker exec $name psql -X -At -U postgres -c "select string_agg(code||'='||student_visible::text, ',' order by code) from request_types where marker='unrelated';").Trim()
  if ($beforeEc -ne $afterEc) { throw "PG17_EC_CHANGED: before=$beforeEc after=$afterEc" }
  if ($beforeUnrelated -ne $afterUnrelated) { throw "PG17_UNRELATED_CHANGED: before=$beforeUnrelated after=$afterUnrelated" }
  Write-Output 'PG17_EC_AND_UNRELATED_UNCHANGED'

  # Second apply is safe / idempotent
  Invoke-RepoFile $fixRel
  Invoke-RepoFile "$scriptDir/03-verify-and-fail-closed.sql"
  Write-Output 'PG17_SECOND_APPLY_SAFE'

  # Missing target fail-closed
  Invoke-Sql "DELETE FROM public.request_types WHERE code='final_chance';"
  Expect-RepoFileFailure $fixRel 'B1_34_TARGET_COUNT_MISMATCH'
  Invoke-Sql @"
INSERT INTO public.request_types (code, name_ar, is_active, student_visible, marker)
VALUES ('final_chance', 'فرصة أخيرة', true, true, 'five');
"@
  Write-Output 'PG17_MISSING_FAIL_CLOSED'

  # Duplicate target fail-closed (drop unique briefly)
  Invoke-Sql "ALTER TABLE public.request_types DROP CONSTRAINT request_types_code_key;"
  Invoke-Sql @"
INSERT INTO public.request_types (code, name_ar, is_active, student_visible, marker)
VALUES ('final_chance', 'duplicate', true, true, 'five');
"@
  Expect-RepoFileFailure $fixRel 'B1_34_TARGET_COUNT_MISMATCH'
  Invoke-Sql "DELETE FROM public.request_types WHERE code='final_chance' AND name_ar='duplicate';"
  Invoke-Sql "ALTER TABLE public.request_types ADD CONSTRAINT request_types_code_key UNIQUE (code);"
  Invoke-Sql "UPDATE public.request_types SET student_visible=true WHERE code='final_chance';"
  Invoke-RepoFile $fixRel
  Write-Output 'PG17_DUPLICATE_FAIL_CLOSED'

  # Partial failure rolls back (UPDATE then RAISE inside one transaction)
  Invoke-Sql "UPDATE public.request_types SET student_visible=true WHERE code IN ('enrollment_suspension','excused_absence','department_transfer','final_chance','file_withdrawal');"
  Expect-SqlFailure @"
BEGIN;
UPDATE public.request_types
SET student_visible = false, updated_at = now()
WHERE code IN ('enrollment_suspension','excused_absence','department_transfer','final_chance','file_withdrawal');
DO `$`$ BEGIN RAISE EXCEPTION 'B1_34_SIMULATED_PARTIAL_FAILURE'; END `$`$;
COMMIT;
"@ 'B1_34_SIMULATED_PARTIAL_FAILURE'

  $stillTrue = (docker exec $name psql -X -At -U postgres -c "select count(*) from request_types where code in ('enrollment_suspension','excused_absence','department_transfer','final_chance','file_withdrawal') and student_visible is true;").Trim()
  if ($stillTrue -ne '5') { throw "PG17_PARTIAL_ROLLBACK_FAILED: stillTrue=$stillTrue" }
  Write-Output 'PG17_PARTIAL_FAILURE_ROLLS_BACK'

  # Restore hidden terminal state via the real migration
  Invoke-RepoFile $fixRel
  Invoke-RepoFile "$scriptDir/03-verify-and-fail-closed.sql"

  Write-Output 'PASS_B1_34_TERMINAL_VISIBILITY_PG17'
} finally {
  docker stop $name *> $null
}
