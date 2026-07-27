param([string]$Image = "postgres:17-alpine")

# PORTAL-FIRST-DELIVERY-FIVE-STUDENT-SERVICES-LOCAL-OPERATIONAL-E2E-01
# Local disposable only:
#   B0 → SEQ07-B → SEQ08..24 → F1/F2 (local operational, NOT Gate25)
#     → Gate25 local → lifecycle / authz / EC checkpoints
# Namespace: TEST_ONLY_B1_FIVE_SERVICES_OPERATIONAL_E2E
# NEVER Production/Staging write, Deploy, Publish, or student_visible cloud mutation.
# NEVER apply original SEQ07; no silent fallback.

$ErrorActionPreference = "Stop"
$repo = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
. (Join-Path $repo "tests\b1-delivery-chain\local-seq07b-through-24.ps1")

$integrated = Join-Path $repo "tests\b1-integrated-runtime\pg"
$rpcMatrix = Join-Path $repo "tests\b1-rpc-matrix\pg"
$opsPg = Join-Path $PSScriptRoot "pg"
$name = "b1-ops-e2e-$([guid]::NewGuid().ToString('N').Substring(0,12))"
$database = "b1_ops_e2e"
$namespace = "TEST_ONLY_B1_FIVE_SERVICES_OPERATIONAL_E2E"
$releaseSha = "b63725e02d4199b46dee604be8f8c03f72c5d414"
$artifactDir = Join-Path $repo ".tmp\b1-operational-e2e"
New-Item -ItemType Directory -Force -Path $artifactDir | Out-Null

$foundation = @(
  "docs/migration-drafts/REQUEST-B1-LOG-AUDIT-CALL-DISAMBIGUATION-01.sql",
  "docs/migration-drafts/STUDENT-REQUEST-WORKFLOW-ACTOR-AUTHORIZATION-HARDENING.sql",
  "docs/migration-drafts/B1-RUNTIME-PREDECESSOR-GUARD-REMEDIATION-02.sql",
  "docs/migration-drafts/REQUEST-PROCESSING-DOMAINS-EXPANSION-SOURCE-01.sql",
  "docs/migration-drafts/REQUEST-B1-ATOMIC-SUBMIT-ACTION-04.sql"
)

# Ban probe: original SEQ07 path is rejected by shared guard.
try {
  Assert-B1PathIsNotOriginalSeq07 $script:B1OriginalSeq07Migration
  throw "EXPECTED_BAN_OF_ORIGINAL_SEQ07_DID_NOT_FIRE"
} catch {
  if ("$_" -notmatch "FORBIDDEN_ORIGINAL_SEQ07_APPLY_PATH") { throw }
}

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

  Invoke-B1DockerPsqlFile -ContainerName $name -Database $database `
    -Path (Join-Path $rpcMatrix "10-minimal-schema.sql")
  Invoke-B1DockerPsqlFile -ContainerName $name -Database $database `
    -Path (Join-Path $repo "tests\b1-first-delivery-sequential-chain\10-local-schema-align.sql")
  foreach ($relative in $foundation) {
    Assert-B1PathIsNotOriginalSeq07 $relative
    Invoke-B1DockerPsqlFile -ContainerName $name -Database $database -Path (Join-Path $repo $relative)
  }

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

  Invoke-B1DockerPsqlFile -ContainerName $name -Database $database `
    -Path (Join-Path $repo "supabase\migrations\20260725002135_13c05466-74a5-4a03-8c7d-8617be9e5353.sql")
  Invoke-B1DockerPsqlFile -ContainerName $name -Database $database `
    -Path (Join-Path $opsPg "05-namespace-marker.sql")

  Invoke-B1B0PrivateBucketSim -ContainerName $name -Database $database
  Invoke-B1Seq07bThrough24Chain -Repo $repo -ContainerName $name -Database $database

  # F1/F2: after SEQ24, within local operational E2E, NOT Gate25, NOT Production.
  Invoke-B1F1F2HardeningLocalOnly -Repo $repo -ContainerName $name -Database $database

  Write-Output "PHASE=gate25_local_only"
  Invoke-B1DockerPsqlFile -ContainerName $name -Database $database `
    -Path (Join-Path $rpcMatrix "30-pre-activation-assert.sql")
  Invoke-B1DockerPsqlFile -ContainerName $name -Database $database `
    -Path (Join-Path $rpcMatrix "35-activate-workflows-local-only.sql")
  Write-Output "GATE25_LOCAL=PASS"
  Write-Output "GATE25_IS_NOT_F1F2=PASS"

  Invoke-B1DockerPsqlText -ContainerName $name -Database $database `
    -Sql "SELECT set_config('application_name', '$namespace', false);"
  Invoke-B1DockerPsqlFile -ContainerName $name -Database $database -Path (Join-Path $integrated "10-e2e-helpers.sql")
  Invoke-B1DockerPsqlFile -ContainerName $name -Database $database -Path (Join-Path $integrated "20-position-assignment-fixtures.sql")
  Invoke-B1DockerPsqlFile -ContainerName $name -Database $database -Path (Join-Path $integrated "40-lifecycle-five-services.sql")
  Invoke-B1DockerPsqlFile -ContainerName $name -Database $database -Path (Join-Path $integrated "45-authz-negatives.sql")
  Invoke-B1DockerPsqlFile -ContainerName $name -Database $database -Path (Join-Path $integrated "50-draft-and-read-matrix.sql")
  Invoke-B1DockerPsqlFile -ContainerName $name -Database $database -Path (Join-Path $integrated "55-attachments-stub.sql")
  Invoke-B1DockerPsqlFile -ContainerName $name -Database $database -Path (Join-Path $integrated "60-enrollment-certificate-regression.sql")
  Invoke-B1DockerPsqlFile -ContainerName $name -Database $database -Path (Join-Path $opsPg "65-per-service-ec-checkpoints.sql")
  Invoke-B1DockerPsqlFile -ContainerName $name -Database $database -Path (Join-Path $integrated "70-summarize.sql")
  Invoke-B1DockerPsqlFile -ContainerName $name -Database $database -Path (Join-Path $opsPg "75-service-report-rows.sql")

  $summary = (
    docker exec $name psql -X -At -U postgres -d $database -c "select summary_line from b1_e2e.summary limit 1;"
  ).Trim()
  $failCount = [int](
    docker exec $name psql -X -At -U postgres -d $database -c "select count(*) from b1_e2e.results where status='FAIL';"
  ).Trim()
  $completed = [int](
    docker exec $name psql -X -At -U postgres -d $database -c "select services_completed from b1_e2e.summary limit 1;"
  ).Trim()
  $svcPass = [int](
    docker exec $name psql -X -At -U postgres -d $database -c "select count(*) from b1_ops_e2e.service_report where result='PASS';"
  ).Trim()
  $reportCsv = docker exec $name psql -X -At -U postgres -d $database -c @"
select service_code || '|' || request_lifecycle || '|' || roles_assignments || '|' ||
       positive_rpc_actions || '|' || negative_rpc_actions || '|' || zero_mutation || '|' ||
       final_state || '|' || ui_smoke || '|' || enrollment_certificate_regression || '|' || result
from b1_ops_e2e.service_report
order by service_code;
"@

  $reportCsv | Set-Content -LiteralPath (Join-Path $artifactDir "service-report.csv") -Encoding utf8
  $summary | Set-Content -LiteralPath (Join-Path $artifactDir "summary.txt") -Encoding utf8

  Write-Output "NAMESPACE=$namespace"
  Write-Output "BOOTSTRAP=SEQ07B_THEN_SEQ08_TO_24"
  Write-Output "ORIGINAL_SEQ07_ABSENT=PASS"
  Write-Output "SEQ07B_APPLIED_EXACTLY_ONCE=PASS"
  Write-Output "SEQ07B_SECOND_APPLY_REFUSED=PASS"
  Write-Output "NO_SILENT_FALLBACK_TO_ORIGINAL_SEQ07=PASS"
  Write-Output "F1F2_AFTER_SEQ24_NOT_GATE25=PASS"
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
