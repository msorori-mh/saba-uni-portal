# Shared local disposable bootstrap for first-delivery chain.
# Canonical apply path ONLY: SEQ07-B → SEQ08..24 (skip superseded original SEQ07 + duplicate order 20).
# F1/F2 actor-action hardening is OPTIONAL and is NEVER Gate25.
# NEVER Production/Staging write. NEVER silent fallback to original SEQ07.

$script:B1OriginalSeq07Migration =
  "supabase/migrations/20260725110000_b1_07_secure_attachments_source_01.sql"
$script:B1Seq07bMigration =
  "supabase/migrations/20260725110050_b1_07b_secure_attachments_sql_only_01.sql"
$script:B1F1F2HardeningDraft =
  "docs/migration-drafts/B1-FIVE-SERVICES-ACTOR-ACTION-ASSIGNMENT-HARDENING-01.sql"

function Get-B1LfSha256([string]$Path) {
  $bytes = [IO.File]::ReadAllBytes($Path)
  $norm = New-Object System.Collections.Generic.List[byte]
  foreach ($b in $bytes) { if ($b -ne 13) { [void]$norm.Add($b) } }
  return [BitConverter]::ToString(
    [Security.Cryptography.SHA256]::Create().ComputeHash($norm.ToArray())
  ).Replace("-", "").ToLower()
}

function Assert-B1PathIsNotOriginalSeq07([string]$RelativePath) {
  $norm = ($RelativePath -replace "\\", "/").ToLowerInvariant()
  if ($norm -match "20260725110000_b1_07_secure_attachments_source_01\.sql") {
    throw "FORBIDDEN_ORIGINAL_SEQ07_APPLY_PATH:$RelativePath"
  }
}

function Get-B1PromotionMap([string]$Repo) {
  return Get-Content -LiteralPath (
    Join-Path $Repo "docs\migration-drafts\b1-backend-verifiers\PROMOTION-MAP.json"
  ) -Raw | ConvertFrom-Json
}

function Get-B1Seq07bThrough24Chain([string]$Repo) {
  $map = Get-B1PromotionMap $Repo
  $orig = $map | Where-Object { $_.order -eq 7 } | Select-Object -First 1
  $seq07b = $map | Where-Object { $_.order -eq 7.5 } | Select-Object -First 1
  if ($null -eq $orig -or $null -eq $seq07b) {
    throw "PROMOTION_MAP_MISSING_SEQ07_OR_SEQ07B"
  }

  $origAbs = Join-Path $Repo ($orig.migration -replace "/", "\")
  $seq07bAbs = Join-Path $Repo ($seq07b.migration -replace "/", "\")
  if ((Get-B1LfSha256 $origAbs) -ne $orig.migration_sha_lf) {
    throw "Original SEQ07 SHA drift (pin-only; must never apply)"
  }
  if ((Get-B1LfSha256 $seq07bAbs) -ne $seq07b.migration_sha_lf) {
    throw "SEQ07-B SHA drift"
  }

  $chain = @($seq07b) + @(
    $map | Where-Object {
      $_.order -ge 8 -and $_.order -le 24 -and $_.order -ne 20
    } | Sort-Object order
  )

  foreach ($entry in $chain) {
    Assert-B1PathIsNotOriginalSeq07 $entry.migration
  }
  if ($chain | Where-Object { $_.order -eq 7 }) {
    throw "FORBIDDEN_ORIGINAL_SEQ07_IN_CHAIN"
  }
  if (-not ($chain | Where-Object { $_.order -eq 7.5 })) {
    throw "SEQ07B_MISSING_FROM_CHAIN"
  }

  return $chain
}

function Invoke-B1DockerPsqlFile {
  param(
    [string]$ContainerName,
    [string]$Database,
    [string]$Path
  )
  Write-Host "APPLY $(Split-Path $Path -Leaf)"
  Get-Content -LiteralPath $Path -Raw |
    docker exec -i $ContainerName psql -X -v ON_ERROR_STOP=1 -U postgres -d $Database | Out-Null
  if ($LASTEXITCODE -ne 0) { throw "psql failed: $Path" }
}

function Invoke-B1DockerPsqlText {
  param(
    [string]$ContainerName,
    [string]$Database,
    [string]$Sql
  )
  $Sql | docker exec -i $ContainerName psql -X -v ON_ERROR_STOP=1 -U postgres -d $Database | Out-Null
  if ($LASTEXITCODE -ne 0) { throw "psql text failed" }
}

function Initialize-B1DeliveryChainLedger {
  param([string]$ContainerName, [string]$Database)
  Invoke-B1DockerPsqlText -ContainerName $ContainerName -Database $Database -Sql @"
CREATE SCHEMA IF NOT EXISTS b1_delivery_chain;
CREATE TABLE IF NOT EXISTS b1_delivery_chain.apply_log (
  order_label text PRIMARY KEY,
  migration_path text NOT NULL,
  sha_lf text NOT NULL,
  applied_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS b1_delivery_chain.proofs (
  key text PRIMARY KEY,
  value text NOT NULL,
  recorded_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO b1_delivery_chain.proofs(key, value) VALUES
  ('canonical_bootstrap', 'SEQ07B_THEN_SEQ08_TO_24'),
  ('original_seq07_policy', 'PIN_ONLY_NEVER_APPLY'),
  ('silent_fallback', 'FORBIDDEN')
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, recorded_at = now();
"@
}

function Invoke-B1B0PrivateBucketSim {
  param([string]$ContainerName, [string]$Database)
  Write-Output "PHASE=B0_storage_sim"
  Invoke-B1DockerPsqlText -ContainerName $ContainerName -Database $Database -Sql @"
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'student-request-secure-attachments',
  'student-request-secure-attachments',
  false,
  5242880,
  ARRAY['application/pdf','image/jpeg','image/png']::text[]
)
ON CONFLICT (id) DO NOTHING;
"@
  Write-Output "B0=PASS"
}

function Invoke-B1Seq07bThrough24Chain {
  param(
    [Parameter(Mandatory)][string]$Repo,
    [Parameter(Mandatory)][string]$ContainerName,
    [Parameter(Mandatory)][string]$Database
  )

  Initialize-B1DeliveryChainLedger -ContainerName $ContainerName -Database $Database
  $chain = Get-B1Seq07bThrough24Chain $Repo
  $appliedPaths = New-Object System.Collections.Generic.List[string]
  $seq07bCount = 0

  foreach ($entry in $chain) {
    $orderLabel = if ($entry.canonical_order_label) { $entry.canonical_order_label } else { [string]$entry.order }
    Write-Output "PHASE=SEQ$orderLabel"
    Assert-B1PathIsNotOriginalSeq07 $entry.migration

    $migAbs = Join-Path $Repo ($entry.migration -replace "/", "\")
    $sha = Get-B1LfSha256 $migAbs
    if ($sha -ne $entry.migration_sha_lf) { throw "SHA mismatch SEQ$orderLabel" }

    Invoke-B1DockerPsqlFile -ContainerName $ContainerName -Database $Database `
      -Path (Join-Path $Repo ($entry.preflight -replace "/", "\"))
    Invoke-B1DockerPsqlFile -ContainerName $ContainerName -Database $Database -Path $migAbs
    Invoke-B1DockerPsqlFile -ContainerName $ContainerName -Database $Database `
      -Path (Join-Path $Repo ($entry.post_verifier -replace "/", "\"))

    $migRel = ($entry.migration -replace "\\", "/")
    Invoke-B1DockerPsqlText -ContainerName $ContainerName -Database $Database -Sql @"
INSERT INTO b1_delivery_chain.apply_log(order_label, migration_path, sha_lf)
VALUES ('$orderLabel', '$migRel', '$sha')
ON CONFLICT (order_label) DO UPDATE
SET migration_path = EXCLUDED.migration_path, sha_lf = EXCLUDED.sha_lf, applied_at = now();
"@
    [void]$appliedPaths.Add($migRel)

    if ($entry.order -eq 7.5) {
      $seq07bCount++
      $prev = $ErrorActionPreference; $ErrorActionPreference = "Continue"
      Get-Content -LiteralPath $migAbs -Raw |
        docker exec -i $ContainerName psql -X -v ON_ERROR_STOP=1 -U postgres -d $Database 2>&1 | Out-Null
      $ErrorActionPreference = $prev
      if ($LASTEXITCODE -eq 0) { throw "SEQ07-B second apply unexpectedly succeeded" }
      Write-Output "SEQ07B_SECOND_APPLY_REFUSED=PASS"
      Invoke-B1DockerPsqlText -ContainerName $ContainerName -Database $Database -Sql @"
INSERT INTO b1_delivery_chain.proofs(key, value) VALUES
  ('seq07b_applied_exactly_once', 'PASS'),
  ('seq07b_second_apply_refused', 'PASS')
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, recorded_at = now();
"@
    }

    Write-Output "SEQ${orderLabel}=PASS sha=$sha"
  }

  foreach ($p in $appliedPaths) { Assert-B1PathIsNotOriginalSeq07 $p }
  if ($seq07bCount -ne 1) { throw "SEQ07B_APPLY_COUNT_UNEXPECTED:$seq07bCount" }

  Invoke-B1DockerPsqlFile -ContainerName $ContainerName -Database $Database `
    -Path (Join-Path $Repo "tests\b1-delivery-chain\pg\40-seq07b-canonical-proof.sql")

  Write-Output "ORIGINAL_SEQ07_ABSENT=PASS"
  Write-Output "SEQ07B_APPLIED_EXACTLY_ONCE=PASS"
  Write-Output "NO_SILENT_FALLBACK_TO_ORIGINAL_SEQ07=PASS"
  Write-Output "CANONICAL_BOOTSTRAP=SEQ07B_THEN_SEQ08_TO_24"
}

function Invoke-B1F1F2HardeningLocalOnly {
  param(
    [Parameter(Mandatory)][string]$Repo,
    [Parameter(Mandatory)][string]$ContainerName,
    [Parameter(Mandatory)][string]$Database
  )

  # LOCAL OPERATIONAL ONLY — after SEQ24, never Gate25, never a Production apply instruction.
  Write-Output "PHASE=F1F2_LOCAL_ONLY_AFTER_SEQ24_NOT_GATE25"
  Write-Output "F1F2_SCOPE=LOCAL_OPERATIONAL_E2E_OR_AUTH_HARNESS"
  Write-Output "F1F2_PRODUCTION_APPLY=FORBIDDEN"
  Assert-B1PathIsNotOriginalSeq07 $script:B1F1F2HardeningDraft
  Invoke-B1DockerPsqlFile -ContainerName $ContainerName -Database $Database `
    -Path (Join-Path $Repo ($script:B1F1F2HardeningDraft -replace "/", "\"))
  Invoke-B1DockerPsqlText -ContainerName $ContainerName -Database $Database -Sql @"
INSERT INTO b1_delivery_chain.proofs(key, value) VALUES
  ('f1f2_order', 'AFTER_SEQ24_BEFORE_OR_WITHIN_LOCAL_OPERATIONAL'),
  ('f1f2_is_gate25', 'FALSE'),
  ('f1f2_production', 'FORBIDDEN')
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, recorded_at = now();
"@
  Write-Output "F1F2_LOCAL_HARDENING=PASS"
}
