param([string]$Image = "postgres:17-alpine")

$ErrorActionPreference = "Stop"
$repo = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
$name = "b1-seq07b-$([guid]::NewGuid().ToString('N').Substring(0,12))"
$database = "b1_seq07b"
$releaseSha = "b63725e02d4199b46dee604be8f8c03f72c5d414"
$expected07b = "a49d615b11949f3c8594b282d2241e9dbd2d7be42d37bb5ac4b1d1952ddd4eec"
$seq07Rel = "supabase/migrations/20260725110000_b1_07_secure_attachments_source_01.sql"
$seq07bRel = "supabase/migrations/20260725110050_b1_07b_secure_attachments_sql_only_01.sql"
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

$sha = Get-LfSha256 (Join-Path $repo $seq07bRel)
if ($sha -ne $expected07b) { throw "SEQ07B SHA mismatch: $sha" }
$orig = Get-LfSha256 (Join-Path $repo $seq07Rel)
if ($orig -ne "66ba4c96c23c44bbcca62de28360d806ee6ff5dbd358a20f2e181b9a8fd6bca8") {
  throw "Original SEQ07 SHA drift"
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
  $ready = $false
  for ($i=0; $i -lt 40; $i++) {
    $prev = $ErrorActionPreference; $ErrorActionPreference = "Continue"
    $logs = docker logs $name 2>&1
    $ErrorActionPreference = $prev
    docker exec $name pg_isready -U postgres -d $database *> $null
    if ($LASTEXITCODE -eq 0 -and ($logs -join "`n") -match "PostgreSQL init process complete") {
      $ready = $true; break
    }
    Start-Sleep -Milliseconds 500
  }
  if (-not $ready) { throw "PostgreSQL not ready" }
  $pg = (docker exec $name psql -X -At -U postgres -d $database -c "show server_version;").Trim()
  if ($pg -notmatch "^17\.") { throw "Expected PG17, got $pg" }

  Invoke-PsqlFile (Join-Path $repo "tests\b1-rpc-matrix\pg\10-minimal-schema.sql")
  foreach ($relative in $foundation) { Invoke-PsqlFile (Join-Path $repo $relative) }
  $stamp = (Get-Content -LiteralPath (Join-Path $repo "docs\migration-drafts\REQUEST-B1-ATOMIC-CALLER-RELEASE-EVIDENCE-STAMP-01.sql") -Raw).Replace(
    "v_commit text := 'APPROVED_RELEASE_COMMIT_PLACEHOLDER';",
    "v_commit text := '$releaseSha';"
  )
  $stamp | docker exec -i $name psql -X -v ON_ERROR_STOP=1 -U postgres -d $database
  if ($LASTEXITCODE -ne 0) { throw "stamp failed" }
  Invoke-PsqlFile (Join-Path $repo "supabase\migrations\20260725002135_13c05466-74a5-4a03-8c7d-8617be9e5353.sql")

  Write-Output "PHASE=fail_sql_without_bucket"
  $prev = $ErrorActionPreference; $ErrorActionPreference = "Continue"
  $failOut = Get-Content -LiteralPath (Join-Path $repo $seq07bRel) -Raw |
    docker exec -i $name psql -X -v ON_ERROR_STOP=1 -U postgres -d $database 2>&1
  $ErrorActionPreference = $prev
  if ($LASTEXITCODE -eq 0) { throw "SQL without bucket unexpectedly succeeded" }
  if (($failOut -join "`n") -notmatch "B1_SEQ07B_BUCKET_PREREQUISITE_MISSING") {
    throw "Expected bucket prerequisite failure"
  }
  $tableAbsent = (docker exec $name psql -X -At -U postgres -d $database -c "select to_regclass('public.student_request_attachment_uploads') is null;").Trim()
  if ($tableAbsent -ne "t") { throw "partial table after failed B1" }
  Write-Output "FAIL_CLOSED_WITHOUT_BUCKET=PASS"

  Write-Output "PHASE=B0_storage_tool_sim"
  # Simulate Lovable Storage tool (not SEQ07 INSERT path): exact private bucket contract
  Invoke-PsqlText @"
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'student-request-secure-attachments',
  'student-request-secure-attachments',
  false,
  5242880,
  ARRAY['application/pdf','image/jpeg','image/png']::text[]
);
"@

  Write-Output "PHASE=preflight_7b"
  Invoke-PsqlFile (Join-Path $repo "docs\migration-drafts\b1-backend-verifiers\07B-B1_07B_SECURE_ATTACHMENTS_SQL_ONLY_01-PREFLIGHT.sql")

  Write-Output "PHASE=B1_apply_sql_only"
  Invoke-PsqlFile (Join-Path $repo $seq07bRel)

  Write-Output "PHASE=post_verifier_7b"
  Invoke-PsqlFile (Join-Path $repo "docs\migration-drafts\b1-backend-verifiers\07B-B1_07B_SECURE_ATTACHMENTS_SQL_ONLY_01-POST-VERIFIER.sql")

  Write-Output "PHASE=equivalence_vs_original_post_verifier"
  Invoke-PsqlFile (Join-Path $repo "docs\migration-drafts\b1-backend-verifiers\07-B1_07_SECURE_ATTACHMENTS_SOURCE_01-POST-VERIFIER.sql")

  Write-Output "PHASE=behavioral"
  Invoke-PsqlFile (Join-Path $repo "tests\b1-seq07-attachments\pg\20-behavioral.sql")

  Write-Output "PHASE=second_sql_refuse"
  $ErrorActionPreference = "Continue"
  $second = Get-Content -LiteralPath (Join-Path $repo $seq07bRel) -Raw |
    docker exec -i $name psql -X -v ON_ERROR_STOP=1 -U postgres -d $database 2>&1
  $ErrorActionPreference = $prev
  if ($LASTEXITCODE -eq 0) { throw "second B1 apply succeeded" }
  Write-Output "SECOND_B1_REFUSED=PASS"

  Write-Output "PHASE=seq08_not_applied"
  $seq08Abs = (docker exec $name psql -X -At -U postgres -d $database -c "select to_regprocedure('public.assert_b1_academic_period_reference(uuid,uuid)') is null;").Trim()
  if ($seq08Abs -ne "t") { throw "SEQ08 leaked" }
  if (Test-Path (Join-Path $repo $seq08Rel)) {
    Write-Output "SEQ08_FILE_PRESENT_BUT_NOT_APPLIED=$seq08Rel"
  }

  Write-Output "PHASE=original_seq07_file_unmodified"
  Write-Output "ORIGINAL_SEQ07_SHA=$orig"

  Write-Output "PG_VERSION=$pg"
  Write-Output "SEQ07B_SHA=$sha"
  Write-Output "PASS_B1_SEQ07B_LOCAL_EQUIVALENCE"
} finally {
  docker stop $name *> $null
}
