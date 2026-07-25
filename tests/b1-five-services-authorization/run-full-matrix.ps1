param([string]$Image = "postgres:17-alpine")

$ErrorActionPreference = "Stop"
$repo = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
$name = "b1-full-authz-$([guid]::NewGuid().ToString('N').Substring(0,12))"
$database = "b1_full_authz"
$releaseSha = "b63725e02d4199b46dee604be8f8c03f72c5d414"

function Invoke-PsqlFile([string]$Path) {
  Get-Content -LiteralPath $Path -Raw |
    docker exec -i $name psql -X -v ON_ERROR_STOP=1 -U postgres -d $database
  if ($LASTEXITCODE -ne 0) { throw "psql failed: $Path" }
}

$foundation = @(
  "docs/migration-drafts/REQUEST-B1-LOG-AUDIT-CALL-DISAMBIGUATION-01.sql",
  "docs/migration-drafts/STUDENT-REQUEST-WORKFLOW-ACTOR-AUTHORIZATION-HARDENING.sql",
  "docs/migration-drafts/B1-RUNTIME-PREDECESSOR-GUARD-REMEDIATION-02.sql",
  "docs/migration-drafts/REQUEST-PROCESSING-DOMAINS-EXPANSION-SOURCE-01.sql",
  "docs/migration-drafts/REQUEST-B1-ATOMIC-SUBMIT-ACTION-04.sql"
)
$promoted = @(
  "supabase/migrations/20260725002135_13c05466-74a5-4a03-8c7d-8617be9e5353.sql",
  "supabase/migrations/20260725110000_b1_07_secure_attachments_source_01.sql",
  "supabase/migrations/20260725110100_b1_08_trusted_reference_validators_05a.sql",
  "supabase/migrations/20260725110200_b1_09_excused_absence_vocabulary_05a.sql",
  "supabase/migrations/20260725110300_b1_10_excused_absence_detail_05a.sql",
  "supabase/migrations/20260725110400_b1_11_file_withdrawal_details_05a.sql",
  "supabase/migrations/20260725110500_b1_12_transfer_secure_attachment_05a.sql",
  "supabase/migrations/20260725110600_b1_13_final_chance_canonical_write_03.sql",
  "supabase/migrations/20260725110700_b1_14_detail_rpc_write_boundaries_05a.sql",
  "supabase/migrations/20260725110800_b1_15_service_details_dispatcher_05a.sql",
  "supabase/migrations/20260725110900_b1_16_free_service_workflows_08.sql",
  "supabase/migrations/20260725111000_b1_17_external_university_payment_workflows_02.sql",
  "supabase/migrations/20260725111100_b1_18_detail_acl_cutover_06.sql",
  "docs/migration-drafts/B1-FIVE-SERVICES-ACTOR-ACTION-ASSIGNMENT-HARDENING-01.sql"
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
  $approvedStamp | docker exec -i $name psql -X -v ON_ERROR_STOP=1 -U postgres -d $database
  if ($LASTEXITCODE -ne 0) { throw "Harness-only release stamp failed" }

  foreach ($relative in $promoted) { Invoke-PsqlFile (Join-Path $repo $relative) }

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
  Write-Output "PG_VERSION=$version"
  Write-Output "MIGRATIONS_LOCAL_ONLY=$($promoted.Count)"
  Write-Output "FULL_MATRIX_SUMMARY=$summary"
} finally {
  docker stop $name *> $null
}
