param([string]$Image = "postgres:17-alpine")

# PORTAL-FIRST-DELIVERY-FIVE-STUDENT-SERVICES-LOCAL-OPERATIONAL-E2E-01
# Local disposable only: SEQ07-B → SEQ08..24 → F1/F2 hardening → Gate25 → lifecycle.
# Namespace: TEST_ONLY_B1_FIVE_SERVICES_OPERATIONAL_E2E
# NEVER Production/Staging write, Deploy, Publish, or student_visible cloud mutation.

$ErrorActionPreference = "Stop"
$repo = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
$integrated = Join-Path $repo "tests\b1-integrated-runtime\pg"
$rpcMatrix = Join-Path $repo "tests\b1-rpc-matrix\pg"
$opsPg = Join-Path $PSScriptRoot "pg"
$name = "b1-ops-e2e-$([guid]::NewGuid().ToString('N').Substring(0,12))"
$database = "b1_ops_e2e"
$namespace = "TEST_ONLY_B1_FIVE_SERVICES_OPERATIONAL_E2E"
$releaseSha = "b63725e02d4199b46dee604be8f8c03f72c5d414"
$artifactDir = Join-Path $repo ".tmp\b1-operational-e2e"
New-Item -ItemType Directory -Force -Path $artifactDir | Out-Null

function Get-LfSha256([string]$Path) {
  $bytes = [IO.File]::ReadAllBytes($Path)
  $norm = New-Object System.Collections.Generic.List[byte]
  foreach ($b in $bytes) { if ($b -ne 13) { [void]$norm.Add($b) } }
  return [BitConverter]::ToString(
    [Security.Cryptography.SHA256]::Create().ComputeHash($norm.ToArray())
  ).Replace('-','').ToLower()
}

function Invoke-PsqlFile([string]$Path) {
  Write-Host "APPLY $(Split-Path $Path -Leaf)"
  Get-Content -LiteralPath $Path -Raw |
    docker exec -i $name psql -X -v ON_ERROR_STOP=1 -U postgres -d $database | Out-Null
  if ($LASTEXITCODE -ne 0) { throw "psql failed: $Path" }
}

function Invoke-PsqlText([string]$Sql) {
  $Sql | docker exec -i $name psql -X -v ON_ERROR_STOP=1 -U postgres -d $database | Out-Null
  if ($LASTEXITCODE -ne 0) { throw "psql text failed" }
}

function Invoke-PsqlCapture([string]$Sql) {
  $out = $Sql | docker exec -i $name psql -X -At -v ON_ERROR_STOP=1 -U postgres -d $database
  if ($LASTEXITCODE -ne 0) { throw "psql capture failed" }
  return $out
}

$foundation = @(
  "docs/migration-drafts/REQUEST-B1-LOG-AUDIT-CALL-DISAMBIGUATION-01.sql",
  "docs/migration-drafts/STUDENT-REQUEST-WORKFLOW-ACTOR-AUTHORIZATION-HARDENING.sql",
  "docs/migration-drafts/B1-RUNTIME-PREDECESSOR-GUARD-REMEDIATION-02.sql",
  "docs/migration-drafts/REQUEST-PROCESSING-DOMAINS-EXPANSION-SOURCE-01.sql",
  "docs/migration-drafts/REQUEST-B1-ATOMIC-SUBMIT-ACTION-04.sql"
)

try {
  docker run --rm --detach --name $name `
    -e POSTGRES_PASSWORD=local_only `
    -e POSTGRES_DB=$database `
    $Image | Out-Null
  if ($LASTEXITCODE -ne 0) { throw "Unable to start disposable PostgreSQL 17" }

  $ready = $false
  for ($i = 0; $i -lt 50; $i++) {
    $prev = $ErrorActionPreference; $ErrorActionPreference = "Continue"
    $logs = docker logs $name 2>&1
    $ErrorActionPreference = $prev
    docker exec $name pg_isready -U postgres -d $database *> $null
    if ($LASTEXITCODE -eq 0 -and ($logs -join "`n") -match "PostgreSQL init process complete") {
      $ready = $true; break
    }
    Start-Sleep -Milliseconds 500
  }
  if (-not $ready) { throw "PostgreSQL 17 did not become ready" }

  $pg = (docker exec $name psql -X -At -U postgres -d $database -c "show server_version;").Trim()
  if ($pg -notmatch "^17\.") { throw "Expected PostgreSQL 17, got $pg" }
  Write-Output "PG_VERSION=$pg"

  Invoke-PsqlFile (Join-Path $rpcMatrix "10-minimal-schema.sql")
  Invoke-PsqlFile (Join-Path $repo "tests\b1-first-delivery-sequential-chain\10-local-schema-align.sql")
  foreach ($relative in $foundation) { Invoke-PsqlFile (Join-Path $repo $relative) }

  $stampPath = Join-Path $repo "docs\migration-drafts\REQUEST-B1-ATOMIC-CALLER-RELEASE-EVIDENCE-STAMP-01.sql"
  $stamp = Get-Content -LiteralPath $stampPath -Raw
  $prev = $ErrorActionPreference; $ErrorActionPreference = "Continue"
  $stampOut = $stamp | docker exec -i $name psql -X -v ON_ERROR_STOP=1 -U postgres -d $database 2>&1
  $ErrorActionPreference = $prev
  if ($LASTEXITCODE -eq 0 -or ($stampOut -join "`n") -notmatch "B1_ATOMIC_CALLER_RELEASE_EVIDENCE_NOT_APPROVED") {
    throw "Release stamp placeholder did not fail closed"
  }
  $approved = $stamp.Replace(
    "v_commit text := 'APPROVED_RELEASE_COMMIT_PLACEHOLDER';",
    "v_commit text := '$releaseSha';"
  )
  $approved | docker exec -i $name psql -X -v ON_ERROR_STOP=1 -U postgres -d $database | Out-Null
  if ($LASTEXITCODE -ne 0) { throw "Harness-only release stamp failed" }

  Invoke-PsqlFile (Join-Path $repo "supabase\migrations\20260725002135_13c05466-74a5-4a03-8c7d-8617be9e5353.sql")
  Invoke-PsqlFile (Join-Path $opsPg "05-namespace-marker.sql")

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

  $map = Get-Content -LiteralPath (Join-Path $repo "docs\migration-drafts\b1-backend-verifiers\PROMOTION-MAP.json") -Raw |
    ConvertFrom-Json
  $seq07b = $map | Where-Object { $_.order -eq 7.5 } | Select-Object -First 1
  if ((Get-LfSha256 (Join-Path $repo $seq07b.migration)) -ne $seq07b.migration_sha_lf) {
    throw "SEQ07-B SHA drift"
  }

  $chain = @($seq07b) + @(
    $map | Where-Object {
      $_.order -ge 8 -and $_.order -le 24 -and $_.order -ne 20
    } | Sort-Object order
  )

  foreach ($entry in $chain) {
    $orderLabel = if ($entry.canonical_order_label) { $entry.canonical_order_label } else { [string]$entry.order }
    Write-Output "PHASE=SEQ$orderLabel"
    $migAbs = Join-Path $repo ($entry.migration -replace '/', '\')
    $sha = Get-LfSha256 $migAbs
    if ($sha -ne $entry.migration_sha_lf) { throw "SHA mismatch SEQ$orderLabel" }
    Invoke-PsqlFile (Join-Path $repo ($entry.preflight -replace '/', '\'))
    Invoke-PsqlFile $migAbs
    Invoke-PsqlFile (Join-Path $repo ($entry.post_verifier -replace '/', '\'))

    if ($entry.order -eq 7.5) {
      $prev = $ErrorActionPreference; $ErrorActionPreference = "Continue"
      Get-Content -LiteralPath $migAbs -Raw |
        docker exec -i $name psql -X -v ON_ERROR_STOP=1 -U postgres -d $database 2>&1 | Out-Null
      $ErrorActionPreference = $prev
      if ($LASTEXITCODE -eq 0) { throw "SEQ07-B second apply unexpectedly succeeded" }
      Write-Output "SEQ07B_SECOND_APPLY_REFUSED=PASS"
    }
    Write-Output "SEQ${orderLabel}=PASS sha=$sha"
  }

  # Post-manifest F1/F2 actor/action hardening (not Gate25; required for assignment guards)
  Write-Output "PHASE=F1F2_actor_action_hardening"
  Invoke-PsqlFile (Join-Path $repo "docs\migration-drafts\B1-FIVE-SERVICES-ACTOR-ACTION-ASSIGNMENT-HARDENING-01.sql")

  Write-Output "PHASE=gate25_local_only"
  Invoke-PsqlFile (Join-Path $rpcMatrix "30-pre-activation-assert.sql")
  Invoke-PsqlFile (Join-Path $rpcMatrix "35-activate-workflows-local-only.sql")
  Write-Output "GATE25_LOCAL=PASS"

  Invoke-PsqlText "SELECT set_config('application_name', '$namespace', false);"
  Invoke-PsqlFile (Join-Path $integrated "10-e2e-helpers.sql")
  Invoke-PsqlFile (Join-Path $integrated "20-position-assignment-fixtures.sql")
  Invoke-PsqlFile (Join-Path $integrated "40-lifecycle-five-services.sql")
  Invoke-PsqlFile (Join-Path $integrated "45-authz-negatives.sql")
  Invoke-PsqlFile (Join-Path $integrated "50-draft-and-read-matrix.sql")
  Invoke-PsqlFile (Join-Path $integrated "55-attachments-stub.sql")
  Invoke-PsqlFile (Join-Path $integrated "60-enrollment-certificate-regression.sql")
  Invoke-PsqlFile (Join-Path $opsPg "65-per-service-ec-checkpoints.sql")
  Invoke-PsqlFile (Join-Path $integrated "70-summarize.sql")
  Invoke-PsqlFile (Join-Path $opsPg "75-service-report-rows.sql")

  $summary = (Invoke-PsqlCapture "select summary_line from b1_e2e.summary limit 1;").Trim()
  $failCount = [int](Invoke-PsqlCapture "select count(*) from b1_e2e.results where status='FAIL';").Trim()
  $completed = [int](Invoke-PsqlCapture "select services_completed from b1_e2e.summary limit 1;").Trim()
  $svcPass = [int](Invoke-PsqlCapture "select count(*) from b1_ops_e2e.service_report where result='PASS';").Trim()
  $reportCsv = Invoke-PsqlCapture @"
select service_code || '|' || request_lifecycle || '|' || roles_assignments || '|' ||
       positive_rpc_actions || '|' || negative_rpc_actions || '|' || zero_mutation || '|' ||
       final_state || '|' || ui_smoke || '|' || enrollment_certificate_regression || '|' || result
from b1_ops_e2e.service_report
order by service_code;
"@

  $reportCsv | Set-Content -LiteralPath (Join-Path $artifactDir "service-report.csv") -Encoding utf8
  $summary | Set-Content -LiteralPath (Join-Path $artifactDir "summary.txt") -Encoding utf8

  Write-Output "NAMESPACE=$namespace"
  Write-Output "SUMMARY=$summary"
  Write-Output "SERVICES_COMPLETED=$completed"
  Write-Output "SERVICE_REPORT_PASS=$svcPass"
  Write-Output "FAIL_COUNT=$failCount"
  Write-Output "NO_PRODUCTION_WRITE=PASS"
  Write-Output "SYNTHETIC_DATA_ONLY=PASS"

  if ($failCount -ne 0) {
    docker exec $name psql -P pager=off -U postgres -d $database -c `
      "select case_id, category, left(detail,160) from b1_e2e.results where status='FAIL' order by case_id;"
    throw "HOLD_FIRST_DELIVERY_CONFIRMED_OPERATIONAL_BLOCKER fail_rows=$failCount"
  }
  if ($completed -ne 5 -or $svcPass -ne 5) {
    throw "HOLD_FIRST_DELIVERY_CONFIRMED_OPERATIONAL_BLOCKER services=$completed report_pass=$svcPass"
  }

  Write-Output "PASS_B1_LOCAL_OPERATIONAL_E2E_5_OF_5"
} finally {
  docker stop $name *> $null
}
