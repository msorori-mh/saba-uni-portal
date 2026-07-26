param([string]$Image = "postgres:17-alpine")

$ErrorActionPreference = "Stop"
$repo = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
$name = "b1-seq08-$([guid]::NewGuid().ToString('N').Substring(0,12))"
$database = "b1_seq08"
$releaseSha = "b63725e02d4199b46dee604be8f8c03f72c5d414"
$expectedSeq08Sha = "e04d7b0b2d3fa8cd9748796a2a9e59131894fdd726339ced594ba36d836df0a2"
$seq07Rel = "supabase/migrations/20260725110000_b1_07_secure_attachments_source_01.sql"
$seq08Rel = "supabase/migrations/20260725110100_b1_08_trusted_reference_validators_05a.sql"
$seq09Rel = "supabase/migrations/20260725110200_b1_09_excused_absence_vocabulary_05a.sql"

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

$sha = Get-LfSha256 (Join-Path $repo $seq08Rel)
if ($sha -ne $expectedSeq08Sha) {
  throw "SEQ08 SHA mismatch: expected $expectedSeq08Sha got $sha"
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

  Invoke-PsqlFile (Join-Path $repo "tests\b1-rpc-matrix\pg\10-minimal-schema.sql")
  foreach ($relative in $foundation) { Invoke-PsqlFile (Join-Path $repo $relative) }
  $stampPath = Join-Path $repo "docs\migration-drafts\REQUEST-B1-ATOMIC-CALLER-RELEASE-EVIDENCE-STAMP-01.sql"
  $stamp = (Get-Content -LiteralPath $stampPath -Raw).Replace(
    "v_commit text := 'APPROVED_RELEASE_COMMIT_PLACEHOLDER';",
    "v_commit text := '$releaseSha';"
  )
  $stamp | docker exec -i $name psql -X -v ON_ERROR_STOP=1 -U postgres -d $database
  if ($LASTEXITCODE -ne 0) { throw "release stamp failed" }
  Invoke-PsqlFile (Join-Path $repo "supabase\migrations\20260725002135_13c05466-74a5-4a03-8c7d-8617be9e5353.sql")

  # Local-only predecessor: SEQ07 must exist before SEQ08 in sequential protocol
  Invoke-PsqlFile (Join-Path $repo $seq07Rel)

  Write-Output "PHASE=preflight_seq08"
  Invoke-PsqlFile (Join-Path $repo "docs\migration-drafts\b1-backend-verifiers\08-B1_08_TRUSTED_REFERENCE_VALIDATORS_05A-PREFLIGHT.sql")

  Write-Output "PHASE=apply_seq08_only"
  Invoke-PsqlFile (Join-Path $repo $seq08Rel)

  Write-Output "PHASE=post_verifier_seq08"
  Invoke-PsqlFile (Join-Path $repo "docs\migration-drafts\b1-backend-verifiers\08-B1_08_TRUSTED_REFERENCE_VALIDATORS_05A-POST-VERIFIER.sql")

  Write-Output "PHASE=assert_seq09_not_applied"
  if (Test-Path (Join-Path $repo $seq09Rel)) {
    Write-Output "SEQ09_FILE_PRESENT_BUT_NOT_APPLIED=$seq09Rel"
  }

  Write-Output "PG_VERSION=$version"
  Write-Output "SEQ08_SHA=$sha"
  Write-Output "ONE_MIGRATION_ONLY=SEQ08"
  Write-Output "PASS_B1_SEQ08_LOCAL_PG17"
} finally {
  docker stop $name *> $null
}
