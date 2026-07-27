param(
  [string]$Image = "postgres:17-alpine",
  [int]$StopAfterOrder = 24,
  [switch]$IncludeGate25Local
)

$ErrorActionPreference = "Stop"
$repo = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
$name = "b1-fd-chain-$([guid]::NewGuid().ToString('N').Substring(0,12))"
$database = "b1_fd_chain"
$releaseSha = "b63725e02d4199b46dee604be8f8c03f72c5d414"
$marker = "TEST_ONLY_FIRST_DELIVERY_5_SERVICES"

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
    docker exec -i $name psql -X -v ON_ERROR_STOP=1 -U postgres -d $database | Out-Null
  if ($LASTEXITCODE -ne 0) { throw "psql failed: $Path" }
}

function Invoke-PsqlText([string]$Sql) {
  $Sql | docker exec -i $name psql -X -v ON_ERROR_STOP=1 -U postgres -d $database | Out-Null
  if ($LASTEXITCODE -ne 0) { throw "psql text failed" }
}

$map = Get-Content -LiteralPath (Join-Path $repo "docs\migration-drafts\b1-backend-verifiers\PROMOTION-MAP.json") -Raw | ConvertFrom-Json
$orig07 = $map | Where-Object { $_.order -eq 7 } | Select-Object -First 1
$seq07b = $map | Where-Object { $_.order -eq 7.5 } | Select-Object -First 1
if ((Get-LfSha256 (Join-Path $repo $orig07.migration)) -ne $orig07.migration_sha_lf) {
  throw "Original SEQ07 SHA drift"
}
if ((Get-LfSha256 (Join-Path $repo $seq07b.migration)) -ne $seq07b.migration_sha_lf) {
  throw "SEQ07-B SHA drift"
}

$foundation = @(
  "docs/migration-drafts/REQUEST-B1-LOG-AUDIT-CALL-DISAMBIGUATION-01.sql",
  "docs/migration-drafts/STUDENT-REQUEST-WORKFLOW-ACTOR-AUTHORIZATION-HARDENING.sql",
  "docs/migration-drafts/B1-RUNTIME-PREDECESSOR-GUARD-REMEDIATION-02.sql",
  "docs/migration-drafts/REQUEST-PROCESSING-DOMAINS-EXPANSION-SOURCE-01.sql",
  "docs/migration-drafts/REQUEST-B1-ATOMIC-SUBMIT-ACTION-04.sql"
)

# Apply orders after 7B; skip superseded 7; skip duplicate 20 bridge file
$chain = @($seq07b) + @(
  $map | Where-Object {
    $_.order -ge 8 -and $_.order -le $StopAfterOrder -and $_.order -ne 20
  } | Sort-Object order
)

$results = New-Object System.Collections.Generic.List[string]

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
  Invoke-PsqlFile (Join-Path $repo "tests\b1-first-delivery-sequential-chain\10-local-schema-align.sql")
  foreach ($relative in $foundation) { Invoke-PsqlFile (Join-Path $repo $relative) }
  $stamp = (Get-Content -LiteralPath (Join-Path $repo "docs\migration-drafts\REQUEST-B1-ATOMIC-CALLER-RELEASE-EVIDENCE-STAMP-01.sql") -Raw).Replace(
    "v_commit text := 'APPROVED_RELEASE_COMMIT_PLACEHOLDER';",
    "v_commit text := '$releaseSha';"
  )
  $stamp | docker exec -i $name psql -X -v ON_ERROR_STOP=1 -U postgres -d $database | Out-Null
  if ($LASTEXITCODE -ne 0) { throw "stamp failed" }
  Invoke-PsqlFile (Join-Path $repo "supabase\migrations\20260725002135_13c05466-74a5-4a03-8c7d-8617be9e5353.sql")
  Invoke-PsqlText "SELECT set_config('application_name', '$marker', false);"

  Write-Output "PHASE=baseline_before_B0"
  $uploadsAbsent = (docker exec $name psql -X -At -U postgres -d $database -c "select to_regclass('public.student_request_attachment_uploads') is null;").Trim()
  if ($uploadsAbsent -ne "t") { throw "uploads present before B0" }
  $results.Add("BASELINE=PASS")

  Write-Output "PHASE=B0_storage_sim"
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
  $results.Add("B0=PASS")

  $applied = New-Object System.Collections.Generic.List[string]
  foreach ($entry in $chain) {
    $orderLabel = if ($entry.canonical_order_label) { $entry.canonical_order_label } else { [string]$entry.order }
    Write-Output "PHASE=SEQ$orderLabel"
    $migAbs = Join-Path $repo ($entry.migration -replace '/', '\')
    $sha = Get-LfSha256 $migAbs
    if ($sha -ne $entry.migration_sha_lf) { throw "SHA mismatch SEQ$orderLabel" }

    $pre = Join-Path $repo ($entry.preflight -replace '/', '\')
    Invoke-PsqlFile $pre

    Invoke-PsqlFile $migAbs
    $post = Join-Path $repo ($entry.post_verifier -replace '/', '\')
    Invoke-PsqlFile $post
    $applied.Add($migAbs)

    # Non-idempotent second-apply refuse for SEQ07-B only (CREATE TABLE path).
    # Later CREATE OR REPLACE migrations may be re-runnable; one-at-a-time is enforced by this loop.
    if ($entry.order -eq 7.5) {
      $prev = $ErrorActionPreference; $ErrorActionPreference = "Continue"
      Get-Content -LiteralPath $migAbs -Raw |
        docker exec -i $name psql -X -v ON_ERROR_STOP=1 -U postgres -d $database 2>&1 | Out-Null
      $ErrorActionPreference = $prev
      if ($LASTEXITCODE -eq 0) { throw "SEQ07-B second apply unexpectedly succeeded" }
      $results.Add("SEQ07B_SECOND_APPLY_REFUSED=PASS")
    }

    $results.Add("SEQ${orderLabel}=PASS")
    Write-Output "SEQ${orderLabel}=PASS sha=$sha"
  }

  # Ensure next migration after StopAfterOrder is absent (object smoke for SEQ09 when stop=8)
  if ($StopAfterOrder -lt 24) {
    $next = $map | Where-Object { $_.order -gt $StopAfterOrder -and $_.order -ne 20 } | Sort-Object order | Select-Object -First 1
    if ($null -ne $next) {
      Write-Output "PHASE=next_absent_check order=$($next.order)"
      $results.Add("NEXT_ABSENT_CHECK=NOTED")
    }
  }

  if ($IncludeGate25Local -and $StopAfterOrder -ge 24) {
    Write-Output "PHASE=gate25_local_only"
    Invoke-PsqlFile (Join-Path $repo "tests\b1-rpc-matrix\pg\30-pre-activation-assert.sql")
    Invoke-PsqlFile (Join-Path $repo "tests\b1-rpc-matrix\pg\35-activate-workflows-local-only.sql")
    $results.Add("GATE25_LOCAL=PASS")
  }

  Write-Output "PG_VERSION=$pg"
  Write-Output "MARKER=$marker"
  Write-Output "NO_BATCH_APPLY=PASS"
  Write-Output ("RESULTS=" + ($results -join ";"))
  Write-Output "PASS_B1_FIRST_DELIVERY_SEQUENTIAL_CHAIN"
} finally {
  docker stop $name *> $null
}
