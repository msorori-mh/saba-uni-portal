param([string]$Image = "postgres:17-alpine")

$ErrorActionPreference = "Stop"
$repo = (Resolve-Path (Join-Path $PSScriptRoot "..\..\..")).Path
$rpcMatrix = Join-Path $repo "tests\b1-rpc-matrix\pg"
$name = "b1-integrated-e2e-$([guid]::NewGuid().ToString('N').Substring(0,12))"
$releaseSha = (git -C $repo rev-parse origin/main).Trim()
$namespace = "TEST_ONLY_B1_FIVE_SERVICES_INTEGRATED_RUNTIME"

function Invoke-PsqlFile([string]$Path) {
  Write-Host "APPLY $(Split-Path $Path -Leaf)"
  Get-Content -LiteralPath $Path -Raw | docker exec -i $name psql -v ON_ERROR_STOP=1 -U postgres -d e_rpcmatrix
  if ($LASTEXITCODE -ne 0) { throw "psql failed: $Path" }
}

function Invoke-PsqlText([string]$Sql) {
  $Sql | docker exec -i $name psql -v ON_ERROR_STOP=1 -U postgres -d e_rpcmatrix
  if ($LASTEXITCODE -ne 0) { throw "psql text failed" }
}

try {
  docker run --rm --detach --name $name -e POSTGRES_PASSWORD=local_only -e POSTGRES_DB=e_rpcmatrix $Image | Out-Null
  if ($LASTEXITCODE -ne 0) { throw "Unable to start isolated PostgreSQL container" }
  $ready = $false
  for ($i = 0; $i -lt 50; $i++) {
    $previousPreference = $ErrorActionPreference
    $ErrorActionPreference = "Continue"
    $logs = docker logs $name 2>&1
    $ErrorActionPreference = $previousPreference
    if (($logs -join "`n") -match 'PostgreSQL init process complete') {
      docker exec $name pg_isready -U postgres -d e_rpcmatrix *> $null
      if ($LASTEXITCODE -eq 0) { $ready = $true; break }
    }
    Start-Sleep -Milliseconds 500
  }
  if (-not $ready) { throw "PostgreSQL 17 did not become ready" }

  $serverVersion = (docker exec $name psql -At -U postgres -d e_rpcmatrix -c "show server_version;").Trim()
  if ($serverVersion -notmatch '^17\.') { throw "Expected PostgreSQL 17, got $serverVersion" }

  Invoke-PsqlFile (Join-Path $rpcMatrix "10-minimal-schema.sql")
  Invoke-PsqlText "SELECT set_config('application_name', '$namespace', false);"

  $entries = Get-Content (Join-Path $rpcMatrix "20-draft-apply-order.txt") |
    Where-Object { $_ -match '^\d{2} docs/migration-drafts/' }
  $secureReadApplied = $false
  foreach ($entry in $entries) {
    $parts = $entry -split '\s+'
    $sequence = $parts[0]
    $relative = $parts[1]
    $expectedBlob = $parts[4]
    $path = Join-Path $repo ($relative -replace '/', '\')

    if ($relative -match 'SECURE-DRAFT-MUTATIONS' -and -not $secureReadApplied) {
      throw "secure-read contracts must precede secure-draft in the pinned apply order"
    }

    $actualBlob = (git -C $repo hash-object $path).Trim()
    if ($actualBlob -ne $expectedBlob) { throw "PIN MISMATCH seq$sequence $relative expected=$expectedBlob actual=$actualBlob" }

    if ($sequence -eq '06') {
      $raw = Get-Content -LiteralPath $path -Raw
      $failed = $false
      $previousPreference = $ErrorActionPreference
      $ErrorActionPreference = "Continue"
      $output = $raw | docker exec -i $name psql -v ON_ERROR_STOP=1 -U postgres -d e_rpcmatrix 2>&1
      $ErrorActionPreference = $previousPreference
      if ($LASTEXITCODE -ne 0 -and ($output -join "`n") -match 'B1_ATOMIC_CALLER_RELEASE_EVIDENCE_NOT_APPROVED') { $failed = $true }
      if (-not $failed) { throw "seq06 unresolved placeholder did not fail closed" }
      $approved = $raw.Replace("v_commit text := 'APPROVED_RELEASE_COMMIT_PLACEHOLDER';", "v_commit text := '$releaseSha';")
      $approved | docker exec -i $name psql -v ON_ERROR_STOP=1 -U postgres -d e_rpcmatrix
      if ($LASTEXITCODE -ne 0) { throw "seq06 harness-only release evidence failed" }
    } else {
      Invoke-PsqlFile $path
    }
    if ($relative -match 'SECURE-READ-CONTRACTS') {
      $secureReadApplied = $true
    }
  }
  if (-not $secureReadApplied) { throw "secure-read contracts were not applied before secure-draft" }

  Invoke-PsqlFile (Join-Path $rpcMatrix "30-pre-activation-assert.sql")
  Invoke-PsqlFile (Join-Path $rpcMatrix "35-activate-workflows-local-only.sql")

  Invoke-PsqlFile (Join-Path $PSScriptRoot "10-e2e-helpers.sql")
  Invoke-PsqlFile (Join-Path $PSScriptRoot "20-position-assignment-fixtures.sql")
  Invoke-PsqlFile (Join-Path $PSScriptRoot "40-lifecycle-five-services.sql")
  Invoke-PsqlFile (Join-Path $PSScriptRoot "45-authz-negatives.sql")
  Invoke-PsqlFile (Join-Path $PSScriptRoot "50-draft-and-read-matrix.sql")
  Invoke-PsqlFile (Join-Path $PSScriptRoot "55-attachments-stub.sql")
  Invoke-PsqlFile (Join-Path $PSScriptRoot "60-enrollment-certificate-regression.sql")
  Invoke-PsqlFile (Join-Path $PSScriptRoot "70-summarize.sql")

  $summary = docker exec $name psql -At -U postgres -d e_rpcmatrix -c "select summary_line from b1_e2e.summary limit 1;"
  $failCount = docker exec $name psql -At -U postgres -d e_rpcmatrix -c "select count(*) from b1_e2e.results where status='FAIL';"
  $completed = docker exec $name psql -At -U postgres -d e_rpcmatrix -c "select services_completed from b1_e2e.summary limit 1;"

  Write-Output "PG_VERSION=$serverVersion"
  Write-Output "NAMESPACE=$namespace"
  Write-Output "SUMMARY=$summary"
  Write-Output "SERVICES_COMPLETED=$completed"
  Write-Output "FAIL_COUNT=$failCount"

  if ([int]$failCount -ne 0) {
    docker exec $name psql -P pager=off -U postgres -d e_rpcmatrix -c `
      "select case_id, category, detail from b1_e2e.results where status='FAIL' order by case_id;"
    throw "B1 integrated runtime harness has FAIL rows"
  }
  if ([int]$completed -ne 5) {
    throw "HOLD_B1_INTEGRATED_RUNTIME_SERVICES_COMPLETED_$completed_OF_5"
  }
  Write-Output "B1_INTEGRATED_RUNTIME_E2E_PASS"
} finally {
  docker stop $name *> $null
}
