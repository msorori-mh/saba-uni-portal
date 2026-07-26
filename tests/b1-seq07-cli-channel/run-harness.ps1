param([string]$Image = "postgres:17-alpine")

# Local simulation of Option B (single-migration runner + history registration).
# NEVER against Production. Disposable PostgreSQL only.

$ErrorActionPreference = "Stop"
$repo = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
$name = "b1-seq07-cli-$([guid]::NewGuid().ToString('N').Substring(0,12))"
$database = "b1_seq07_cli"
$releaseSha = "b63725e02d4199b46dee604be8f8c03f72c5d414"
$expectedSeq07Sha = "66ba4c96c23c44bbcca62de28360d806ee6ff5dbd358a20f2e181b9a8fd6bca8"
$seq07Rel = "supabase/migrations/20260725110000_b1_07_secure_attachments_source_01.sql"
$seq08Rel = "supabase/migrations/20260725110100_b1_08_trusted_reference_validators_05a.sql"
$version = "20260725110000"

function Get-LfSha256([string]$Path) {
  $bytes = [IO.File]::ReadAllBytes($Path)
  $norm = New-Object System.Collections.Generic.List[byte]
  foreach ($b in $bytes) { if ($b -ne 13) { [void]$norm.Add($b) } }
  return [BitConverter]::ToString(
    [Security.Cryptography.SHA256]::Create().ComputeHash($norm.ToArray())
  ).Replace('-','').ToLower()
}

function Invoke-PsqlFile([string]$Path) {
  Get-Content -LiteralPath $Path -Raw |
    docker exec -i $name psql -X -v ON_ERROR_STOP=1 -U postgres -d $database
  if ($LASTEXITCODE -ne 0) { throw "psql failed: $Path" }
}

function Invoke-PsqlText([string]$Sql) {
  $Sql | docker exec -i $name psql -X -v ON_ERROR_STOP=1 -U postgres -d $database
  if ($LASTEXITCODE -ne 0) { throw "psql text failed" }
}

$sha = Get-LfSha256 (Join-Path $repo $seq07Rel)
if ($sha -ne $expectedSeq07Sha) { throw "SEQ07 SHA mismatch: $sha" }

$foundation = @(
  "docs/migration-drafts/REQUEST-B1-LOG-AUDIT-CALL-DISAMBIGUATION-01.sql",
  "docs/migration-drafts/STUDENT-REQUEST-WORKFLOW-ACTOR-AUTHORIZATION-HARDENING.sql",
  "docs/migration-drafts/B1-RUNTIME-PREDECESSOR-GUARD-REMEDIATION-02.sql",
  "docs/migration-drafts/REQUEST-PROCESSING-DOMAINS-EXPANSION-SOURCE-01.sql",
  "docs/migration-drafts/REQUEST-B1-ATOMIC-SUBMIT-ACTION-04.sql"
)

try {
  docker run --rm --detach --name $name -e POSTGRES_PASSWORD=local_only `
    -e POSTGRES_DB=$database $Image | Out-Null
  $ready = $false
  for ($i=0; $i -lt 40; $i++) {
    $previousPreference = $ErrorActionPreference
    $ErrorActionPreference = "Continue"
    $logs = docker logs $name 2>&1
    $ErrorActionPreference = $previousPreference
    docker exec $name pg_isready -U postgres -d $database *> $null
    if ($LASTEXITCODE -eq 0 -and ($logs -join "`n") -match "PostgreSQL init process complete") {
      $ready = $true
      break
    }
    Start-Sleep -Milliseconds 500
  }
  if (-not $ready) { throw "PostgreSQL did not become ready" }
  $pg = (docker exec $name psql -X -At -U postgres -d $database -c "show server_version;").Trim()
  if ($pg -notmatch "^17\.") { throw "Expected PostgreSQL 17, got $pg" }

  Invoke-PsqlFile (Join-Path $repo "tests\b1-rpc-matrix\pg\10-minimal-schema.sql")
  foreach ($relative in $foundation) { Invoke-PsqlFile (Join-Path $repo $relative) }
  $stamp = (Get-Content -LiteralPath (Join-Path $repo "docs\migration-drafts\REQUEST-B1-ATOMIC-CALLER-RELEASE-EVIDENCE-STAMP-01.sql") -Raw).Replace(
    "v_commit text := 'APPROVED_RELEASE_COMMIT_PLACEHOLDER';",
    "v_commit text := '$releaseSha';"
  )
  $stamp | docker exec -i $name psql -X -v ON_ERROR_STOP=1 -U postgres -d $database
  if ($LASTEXITCODE -ne 0) { throw "stamp failed" }
  Invoke-PsqlFile (Join-Path $repo "supabase\migrations\20260725002135_13c05466-74a5-4a03-8c7d-8617be9e5353.sql")

  # Simulate remote history tip at Production cutoff (no SEQ07 yet)
  Invoke-PsqlText @"
CREATE SCHEMA IF NOT EXISTS supabase_migrations;
CREATE TABLE IF NOT EXISTS supabase_migrations.schema_migrations (
  version text PRIMARY KEY,
  statements text[],
  name text
);
INSERT INTO supabase_migrations.schema_migrations(version, name)
VALUES ('20260725002136','production_cutoff_surrogate')
ON CONFLICT DO NOTHING;
"@

  Write-Output "PHASE=preflight"
  Invoke-PsqlFile (Join-Path $repo "docs\migration-drafts\b1-backend-verifiers\07-B1_07_SECURE_ATTACHMENTS_SOURCE_01-PREFLIGHT.sql")

  # Dry-run gate simulation: only ONE pending migration in this isolated apply set
  $pending = @($seq07Rel)
  if ($pending.Count -ne 1) { throw "DRY_RUN_MUST_BE_EXACTLY_ONE" }
  Write-Output "DRY_RUN_PENDING_COUNT=1"
  Write-Output "DRY_RUN_PENDING=$seq07Rel"

  Write-Output "PHASE=apply_one_with_history"
  Invoke-PsqlFile (Join-Path $repo $seq07Rel)
  Invoke-PsqlText @"
INSERT INTO supabase_migrations.schema_migrations(version, name)
VALUES ('$version','b1_07_secure_attachments_source_01');
"@

  $histCount = (docker exec $name psql -X -At -U postgres -d $database -c "select count(*) from supabase_migrations.schema_migrations where version='$version';").Trim()
  if ($histCount -ne "1") { throw "history row missing" }

  Write-Output "PHASE=post_verifier"
  Invoke-PsqlFile (Join-Path $repo "docs\migration-drafts\b1-backend-verifiers\07-B1_07_SECURE_ATTACHMENTS_SOURCE_01-POST-VERIFIER.sql")

  $bucketPrivate = (docker exec $name psql -X -At -U postgres -d $database -c "select public=false from storage.buckets where id='student-request-secure-attachments';").Trim()
  if ($bucketPrivate -ne "t") { throw "bucket not private" }

  $anonDenied = (docker exec $name psql -X -At -U postgres -d $database -c "select not has_function_privilege('anon','public.create_student_request_attachment_upload_intent(uuid,text,text,text,bigint,text)','EXECUTE');").Trim()
  if ($anonDenied -ne "t") { throw "anon grant leak" }

  Write-Output "PHASE=second_apply_refuse"
  $prev = $ErrorActionPreference
  $ErrorActionPreference = "Continue"
  $second = Get-Content -LiteralPath (Join-Path $repo $seq07Rel) -Raw |
    docker exec -i $name psql -X -v ON_ERROR_STOP=1 -U postgres -d $database 2>&1
  $ErrorActionPreference = $prev
  if ($LASTEXITCODE -eq 0) { throw "second apply unexpectedly succeeded" }
  Write-Output "SECOND_APPLY=REFUSED"

  Write-Output "PHASE=failure_rollback"
  $ErrorActionPreference = "Continue"
  $rb = @"
BEGIN;
CREATE TABLE public.seq07_cli_rollback_marker(id int);
DO `$`$ BEGIN RAISE EXCEPTION 'SEQ07_CLI_FORCED_FAILURE'; END `$`$;
COMMIT;
"@ | docker exec -i $name psql -X -v ON_ERROR_STOP=1 -U postgres -d $database 2>&1
  $ErrorActionPreference = $prev
  if ($LASTEXITCODE -eq 0) { throw "forced failure committed" }
  $markerGone = (docker exec $name psql -X -At -U postgres -d $database -c "select to_regclass('public.seq07_cli_rollback_marker') is null;").Trim()
  if ($markerGone -ne "t") { throw "rollback marker leaked" }
  Write-Output "FAILURE_ROLLBACK=PASS"

  Write-Output "PHASE=assert_seq08_not_applied"
  if (Test-Path (Join-Path $repo $seq08Rel)) {
    Write-Output "SEQ08_FILE_PRESENT_BUT_NOT_APPLIED=$seq08Rel"
  }
  $seq08Fn = (docker exec $name psql -X -At -U postgres -d $database -c "select to_regprocedure('public.assert_b1_academic_period_reference(uuid,uuid)') is null;").Trim()
  if ($seq08Fn -ne "t") { throw "SEQ08 function unexpectedly present" }

  Write-Output "PG_VERSION=$pg"
  Write-Output "SEQ07_SHA=$sha"
  Write-Output "HISTORY_VERSION=$version"
  Write-Output "ONE_MIGRATION_ONLY=SEQ07"
  Write-Output "PASS_B1_SEQ07_CLI_CHANNEL_LOCAL"
} finally {
  docker stop $name *> $null
}
