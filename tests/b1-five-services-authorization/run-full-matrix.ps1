param([string]$Image = "postgres:17-alpine")

# Full auth matrix on the SAME canonical first-delivery chain as operational E2E:
# B0 → SEQ07-B → SEQ08..24 → F1/F2 (local only, NOT Gate25) → matrix.
# Original SEQ07 is pin-only and must never apply. No silent fallback.

$ErrorActionPreference = "Stop"
$repo = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
. (Join-Path $repo "tests\b1-delivery-chain\local-seq07b-through-24.ps1")

$name = "b1-full-authz-$([guid]::NewGuid().ToString('N').Substring(0,12))"
$database = "b1_full_authz"
$releaseSha = "b63725e02d4199b46dee604be8f8c03f72c5d414"

$foundation = @(
  "docs/migration-drafts/REQUEST-B1-LOG-AUDIT-CALL-DISAMBIGUATION-01.sql",
  "docs/migration-drafts/STUDENT-REQUEST-WORKFLOW-ACTOR-AUTHORIZATION-HARDENING.sql",
  "docs/migration-drafts/B1-RUNTIME-PREDECESSOR-GUARD-REMEDIATION-02.sql",
  "docs/migration-drafts/REQUEST-PROCESSING-DOMAINS-EXPANSION-SOURCE-01.sql",
  "docs/migration-drafts/REQUEST-B1-ATOMIC-SUBMIT-ACTION-04.sql"
)

# Hard ban: any accidental original SEQ07 path in this runner's apply list must throw.
Assert-B1PathIsNotOriginalSeq07 "supabase/migrations/20260725110050_b1_07b_secure_attachments_sql_only_01.sql"
try {
  Assert-B1PathIsNotOriginalSeq07 $script:B1OriginalSeq07Migration
  throw "EXPECTED_BAN_OF_ORIGINAL_SEQ07_DID_NOT_FIRE"
} catch {
  if ("$_" -notmatch "FORBIDDEN_ORIGINAL_SEQ07_APPLY_PATH") { throw }
}

try {
  docker run --rm --detach --name $name -e POSTGRES_PASSWORD=local_only `
    -e POSTGRES_DB=$database $Image | Out-Null
  if ($LASTEXITCODE -ne 0) { throw "Unable to start isolated PostgreSQL container" }
  $ready = $false
  for ($i = 0; $i -lt 40; $i++) {
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

  Invoke-B1DockerPsqlFile -ContainerName $name -Database $database `
    -Path (Join-Path $repo "tests\b1-rpc-matrix\pg\10-minimal-schema.sql")
  Invoke-B1DockerPsqlFile -ContainerName $name -Database $database `
    -Path (Join-Path $repo "tests\b1-first-delivery-sequential-chain\10-local-schema-align.sql")
  foreach ($relative in $foundation) {
    Assert-B1PathIsNotOriginalSeq07 $relative
    Invoke-B1DockerPsqlFile -ContainerName $name -Database $database -Path (Join-Path $repo $relative)
  }

  $stampPath = Join-Path $repo "docs\migration-drafts\REQUEST-B1-ATOMIC-CALLER-RELEASE-EVIDENCE-STAMP-01.sql"
  $stamp = Get-Content -LiteralPath $stampPath -Raw
  $failedClosed = $false
  $previous = $ErrorActionPreference
  $ErrorActionPreference = "Continue"
  $stampOutput = $stamp | docker exec -i $name psql -X -v ON_ERROR_STOP=1 -U postgres -d $database 2>&1
  $ErrorActionPreference = $previous
  if ($LASTEXITCODE -ne 0 -and ($stampOutput -join "`n") -match "B1_ATOMIC_CALLER_RELEASE_EVIDENCE_NOT_APPROVED") {
    $failedClosed = $true
  }
  if (-not $failedClosed) { throw "Release stamp placeholder did not fail closed" }
  $approvedStamp = $stamp.Replace(
    "v_commit text := 'APPROVED_RELEASE_COMMIT_PLACEHOLDER';",
    "v_commit text := '$releaseSha';"
  )
  $approvedStamp | docker exec -i $name psql -X -v ON_ERROR_STOP=1 -U postgres -d $database | Out-Null
  if ($LASTEXITCODE -ne 0) { throw "Harness-only release stamp failed" }

  Invoke-B1DockerPsqlFile -ContainerName $name -Database $database `
    -Path (Join-Path $repo "supabase\migrations\20260725002135_13c05466-74a5-4a03-8c7d-8617be9e5353.sql")

  Invoke-B1B0PrivateBucketSim -ContainerName $name -Database $database
  Invoke-B1Seq07bThrough24Chain -Repo $repo -ContainerName $name -Database $database
  Invoke-B1F1F2HardeningLocalOnly -Repo $repo -ContainerName $name -Database $database

  # Auth matrix is NOT Gate25. It exercises assignment/authz over the same SEQ07-B→24 chain.
  Write-Output "PHASE=auth_matrix_on_canonical_chain"
  Write-Output "GATE25=SKIPPED_AUTH_MATRIX_NOT_ACTIVATION"

  $fixture = Get-Content -LiteralPath (
    Join-Path $repo "scripts\b1-safe-rpc-matrix-harness-01\01-runtime-matrix.sql"
  ) -Raw
  $fixture = $fixture.Replace(
    "INSERT INTO public.student_requests(id,request_type,status,request_number)`r`nSELECT request_id,service,'under_review','SYN-'||row_number() over () FROM matrix;",
    "INSERT INTO public.student_requests(id,student_profile_id,request_type,status,request_number)`r`nSELECT request_id,'89000000-0000-4000-8000-000000000009'::uuid,service,'under_review','SYN-'||row_number() over () FROM matrix;"
  ).Replace(
    "INSERT INTO public.student_requests(id,request_type,status,request_number)`nSELECT request_id,service,'under_review','SYN-'||row_number() over () FROM matrix;",
    "INSERT INTO public.student_requests(id,student_profile_id,request_type,status,request_number)`nSELECT request_id,'89000000-0000-4000-8000-000000000009'::uuid,service,'under_review','SYN-'||row_number() over () FROM matrix;"
  )
  $fixtureMarker = "DO `$`$`nDECLARE m matrix%ROWTYPE; ok boolean; before_row jsonb; after_row jsonb;"
  $fixtureMarkerCrLf = "DO `$`$`r`nDECLARE m matrix%ROWTYPE; ok boolean; before_row jsonb; after_row jsonb;"
  $markerIndex = $fixture.IndexOf($fixtureMarker)
  if ($markerIndex -lt 0) { $markerIndex = $fixture.IndexOf($fixtureMarkerCrLf) }
  if ($markerIndex -lt 0) { throw "Runtime fixture/setup boundary not found" }
  $fixture = $fixture.Substring(0, $markerIndex)
  $matrix = Get-Content -LiteralPath (
    Join-Path $repo "tests\b1-five-services-authorization\rpc-authorization-harness.sql"
  ) -Raw
  $bootstrap = @"
INSERT INTO auth.users(id) VALUES('89000000-0000-4000-8000-000000000009');
INSERT INTO public.student_profiles(id,user_id,status)
VALUES('89000000-0000-4000-8000-000000000009','89000000-0000-4000-8000-000000000009','active');
"@
  $combined = "BEGIN;`nSELECT set_config('b1.atomic_init','1',true);`n" +
    $bootstrap + "`n" + $fixture + "`n" + $matrix
  $output = $combined |
    docker exec -i $name psql -X -At -v ON_ERROR_STOP=1 -U postgres -d $database
  if ($LASTEXITCODE -ne 0) { throw "Full authorization matrix failed" }
  $summary = ($output | Where-Object { $_ -match '"positive_cells"' } | Select-Object -Last 1)
  if (-not $summary) { throw "Full matrix summary missing" }

  if ($summary -notmatch '"positive_cells"\s*:\s*24') { throw "AUTH_MATRIX_POSITIVE_NOT_24:$summary" }
  if ($summary -notmatch '"negative_cells"\s*:\s*528') { throw "AUTH_MATRIX_NEGATIVE_NOT_528:$summary" }
  if ($summary -notmatch '"zero_mutation_assertions"\s*:\s*528') { throw "AUTH_MATRIX_ZERO_MUTATION_NOT_528:$summary" }
  if ($summary -notmatch '"failures"\s*:\s*0') { throw "AUTH_MATRIX_FAILURES_NOT_ZERO:$summary" }

  # Source-level ban still present: runner must not apply original SEQ07.
  $runnerSelf = Get-Content -LiteralPath $PSCommandPath -Raw
  if ($runnerSelf -match "20260725110000_b1_07_secure_attachments_source_01\.sql") {
    # Allowed only inside the ban probe string variable reference, not as an Invoke apply path.
    if ($runnerSelf -match "Invoke-B1DockerPsqlFile[\s\S]{0,200}20260725110000") {
      throw "SILENT_FALLBACK_ORIGINAL_SEQ07_APPLY_DETECTED"
    }
  }

  Write-Output "PG_VERSION=$version"
  Write-Output "BOOTSTRAP=SEQ07B_THEN_SEQ08_TO_24"
  Write-Output "ORIGINAL_SEQ07_ABSENT=PASS"
  Write-Output "SEQ07B_APPLIED_EXACTLY_ONCE=PASS"
  Write-Output "SEQ07B_SECOND_APPLY_REFUSED=PASS"
  Write-Output "NO_SILENT_FALLBACK_TO_ORIGINAL_SEQ07=PASS"
  Write-Output "F1F2_AFTER_SEQ24_NOT_GATE25=PASS"
  Write-Output "AUTH_MATRIX_SAME_DELIVERY_CHAIN=PASS"
  Write-Output "FULL_MATRIX_SUMMARY=$summary"
  Write-Output "PASS_B1_AUTH_MATRIX_24_528_528_0"
} finally {
  docker stop $name *> $null
}
