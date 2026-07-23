param([string]$Image = "postgres:17-alpine")

$ErrorActionPreference = "Stop"
$repo = (Resolve-Path (Join-Path $PSScriptRoot "..\..\..")).Path
$name = "b1-rpc-matrix-$([guid]::NewGuid().ToString('N').Substring(0,12))"
$releaseSha = (git -C $repo rev-parse origin/main).Trim()

function Invoke-PsqlFile([string]$Path) {
  Get-Content -LiteralPath $Path -Raw | docker exec -i $name psql -v ON_ERROR_STOP=1 -U postgres -d e_rpcmatrix
  if ($LASTEXITCODE -ne 0) { throw "psql failed: $Path" }
}

try {
  docker run --rm --detach --name $name -e POSTGRES_PASSWORD=local_only -e POSTGRES_DB=e_rpcmatrix $Image | Out-Null
  if ($LASTEXITCODE -ne 0) { throw "Unable to start isolated PostgreSQL container" }
  $ready = $false
  for ($i=0; $i -lt 40; $i++) {
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

  Invoke-PsqlFile (Join-Path $PSScriptRoot "10-minimal-schema.sql")

  $entries = Get-Content (Join-Path $PSScriptRoot "20-draft-apply-order.txt") |
    Where-Object { $_ -match '^\d{2} docs/migration-drafts/' }
  foreach ($entry in $entries) {
    $parts = $entry -split '\s+'
    $sequence = $parts[0]
    $relative = $parts[1]
    $expectedBlob = $parts[4]
    $path = Join-Path $repo ($relative -replace '/', '\')
    $actualBlob = (git -C $repo hash-object $path).Trim()
    if ($actualBlob -ne $expectedBlob) { throw "PIN MISMATCH seq$sequence $relative" }

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
  }

  Invoke-PsqlFile (Join-Path $PSScriptRoot "30-pre-activation-assert.sql")
  Invoke-PsqlFile (Join-Path $PSScriptRoot "35-activate-workflows-local-only.sql")
  Invoke-PsqlFile (Join-Path $PSScriptRoot "40-verifier.sql")
  Invoke-PsqlFile (Join-Path $PSScriptRoot "45-acl-cases.sql")

  $summary = docker exec $name psql -At -U postgres -d e_rpcmatrix -c `
    "select count(*) filter(where status='PASS'),count(*) filter(where status='STATIC'),count(*) filter(where status='FAIL') from e_rpcmatrix.results;"
  if ($LASTEXITCODE -ne 0) { throw "result summary query failed" }
  Write-Output "PG_VERSION=$serverVersion"
  Write-Output "RESULTS=$summary"
  if (($summary -split '\|')[2] -ne '0') {
    docker exec $name psql -P pager=off -U postgres -d e_rpcmatrix -c `
      "select case_id,sub_id,expected,actual,detail from e_rpcmatrix.results where status='FAIL' order by case_id,sub_id;"
    throw "PG matrix contains FAIL rows"
  }
} finally {
  docker stop $name *> $null
}
