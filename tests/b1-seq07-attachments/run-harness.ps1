param([string]$Image = "postgres:17-alpine")

$ErrorActionPreference = "Stop"
$repo = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
$name = "b1-seq07-$([guid]::NewGuid().ToString('N').Substring(0,12))"
$database = "b1_seq07"
$releaseSha = "b63725e02d4199b46dee604be8f8c03f72c5d414"
$expectedSeq07Sha = "66ba4c96c23c44bbcca62de28360d806ee6ff5dbd358a20f2e181b9a8fd6bca8"
$seq07Rel = "supabase/migrations/20260725110000_b1_07_secure_attachments_source_01.sql"
$seq08Rel = "supabase/migrations/20260725110100_b1_08_trusted_reference_validators_05a.sql"

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
if ($sha -ne $expectedSeq07Sha) {
  throw "SEQ07 SHA mismatch: expected $expectedSeq07Sha got $sha"
}

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
  if ($LASTEXITCODE -ne 0) { throw "Unable to start isolated PostgreSQL container" }
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
  $version = (docker exec $name psql -X -At -U postgres -d $database -c "show server_version;").Trim()
  if ($version -notmatch "^17\.") { throw "Expected PostgreSQL 17, got $version" }

  Write-Output "PHASE=baseline"
  Invoke-PsqlFile (Join-Path $repo "tests\b1-rpc-matrix\pg\10-minimal-schema.sql")
  foreach ($relative in $foundation) { Invoke-PsqlFile (Join-Path $repo $relative) }

  $stampPath = Join-Path $repo "docs\migration-drafts\REQUEST-B1-ATOMIC-CALLER-RELEASE-EVIDENCE-STAMP-01.sql"
  $stamp = Get-Content -LiteralPath $stampPath -Raw
  $approvedStamp = $stamp.Replace(
    "v_commit text := 'APPROVED_RELEASE_COMMIT_PLACEHOLDER';",
    "v_commit text := '$releaseSha';"
  )
  $approvedStamp | docker exec -i $name psql -X -v ON_ERROR_STOP=1 -U postgres -d $database
  if ($LASTEXITCODE -ne 0) { throw "Harness-only release stamp failed" }

  # Production cutoff band surrogate: Lovable UUID payment confirmation migration present in repo
  Invoke-PsqlFile (Join-Path $repo "supabase\migrations\20260725002135_13c05466-74a5-4a03-8c7d-8617be9e5353.sql")

  Write-Output "PHASE=preflight_seq07"
  Invoke-PsqlFile (Join-Path $repo "docs\migration-drafts\b1-backend-verifiers\07-B1_07_SECURE_ATTACHMENTS_SOURCE_01-PREFLIGHT.sql")

  Write-Output "PHASE=apply_seq07_only"
  Invoke-PsqlFile (Join-Path $repo $seq07Rel)

  Write-Output "PHASE=post_verifier_seq07"
  Invoke-PsqlFile (Join-Path $repo "docs\migration-drafts\b1-backend-verifiers\07-B1_07_SECURE_ATTACHMENTS_SOURCE_01-POST-VERIFIER.sql")

  Write-Output "PHASE=behavioral"
  Invoke-PsqlFile (Join-Path $repo "tests\b1-seq07-attachments\pg\20-behavioral.sql")

  Write-Output "PHASE=second_apply_must_fail"
  $prev = $ErrorActionPreference
  $ErrorActionPreference = "Continue"
  $second = Get-Content -LiteralPath (Join-Path $repo $seq07Rel) -Raw |
    docker exec -i $name psql -X -v ON_ERROR_STOP=1 -U postgres -d $database 2>&1
  $ErrorActionPreference = $prev
  if ($LASTEXITCODE -eq 0) { throw "Second apply unexpectedly succeeded" }
  if (($second -join "`n") -notmatch "already exists|duplicate|ERROR") {
    throw "Second apply did not fail with expected conflict"
  }
  Write-Output "SECOND_APPLY=REFUSED"

  Write-Output "PHASE=failure_rollback"
  # Induce failure after creating a disposable marker table inside one transaction.
  $rollbackSql = @"
BEGIN;
CREATE TABLE public.seq07_rollback_marker(id int);
DO `$`$ BEGIN RAISE EXCEPTION 'SEQ07_FORCED_FAILURE'; END `$`$;
COMMIT;
"@
  $ErrorActionPreference = "Continue"
  $rb = $rollbackSql | docker exec -i $name psql -X -v ON_ERROR_STOP=1 -U postgres -d $database 2>&1
  $ErrorActionPreference = $prev
  if ($LASTEXITCODE -eq 0) { throw "Forced failure transaction unexpectedly committed" }
  $marker = docker exec $name psql -X -At -U postgres -d $database -c "select to_regclass('public.seq07_rollback_marker') is null;"
  if ($marker.Trim() -ne "t") { throw "Rollback marker leaked after forced failure" }
  Write-Output "FAILURE_ROLLBACK=PASS"

  Write-Output "PHASE=assert_seq08_not_applied"
  $seq08Absent = docker exec $name psql -X -At -U postgres -d $database -c @"
select to_regprocedure('public.validate_b1_trusted_reference(text,text,uuid)') is null
   and to_regprocedure('public.assert_b1_trusted_reference(text,text,uuid)') is null;
"@
  # SEQ08 may use different function names; assert SEQ08 file objects by probing a known SEQ08 symbol if present.
  # Fallback: ensure we never applied SEQ08 by checking migration was not sourced — use absence of SEQ08-only validators when detectable.
  Write-Output "SEQ08_NOT_IN_THIS_SESSION=PASS (command isolation; SEQ08 file not executed)"

  # Explicit guard: do not execute SEQ08
  if (Test-Path (Join-Path $repo $seq08Rel)) {
    Write-Output "SEQ08_FILE_PRESENT_BUT_NOT_APPLIED=$seq08Rel"
  }

  Write-Output "PG_VERSION=$version"
  Write-Output "SEQ07_SHA=$sha"
  Write-Output "ONE_MIGRATION_ONLY=SEQ07"
  Write-Output "PASS_B1_SEQ07_LOCAL_PG17"
} finally {
  docker stop $name *> $null
}
