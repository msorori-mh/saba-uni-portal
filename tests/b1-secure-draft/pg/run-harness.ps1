param([string]$Image = "postgres:17-alpine")

$ErrorActionPreference = "Stop"
$repo = (Resolve-Path (Join-Path $PSScriptRoot "..\..\..")).Path
$name = "b1-secure-draft-$([guid]::NewGuid().ToString('N').Substring(0,12))"

function Invoke-PsqlFile([string]$Path) {
  Get-Content -LiteralPath $Path -Raw | docker exec -i $name psql -v ON_ERROR_STOP=1 -U postgres -d postgres
  if ($LASTEXITCODE -ne 0) { throw "psql failed: $Path" }
}

try {
  docker run --rm --detach --name $name -e POSTGRES_PASSWORD=local_only $Image | Out-Null
  if ($LASTEXITCODE -ne 0) { throw "Unable to start isolated PostgreSQL container" }
  $ready = $false
  for ($i = 0; $i -lt 40; $i++) {
    docker exec $name pg_isready -U postgres *> $null
    if ($LASTEXITCODE -eq 0) { $ready = $true; break }
    Start-Sleep -Milliseconds 500
  }
  if (-not $ready) { throw "PostgreSQL 17 did not become ready" }

  $serverVersion = (docker exec $name psql -At -U postgres -c "show server_version;").Trim()
  if ($serverVersion -notmatch '^17\.') { throw "Expected PostgreSQL 17, got $serverVersion" }

  Invoke-PsqlFile (Join-Path $PSScriptRoot "10-minimal-schema.sql")
  Invoke-PsqlFile (Join-Path $repo "docs\migration-drafts\B1-FIVE-SERVICES-SECURE-READ-CONTRACTS-01.sql")
  Invoke-PsqlFile (Join-Path $repo "docs\migration-drafts\B1-FIVE-SERVICES-SECURE-DRAFT-MUTATIONS-01.sql")
  Invoke-PsqlFile (Join-Path $PSScriptRoot "40-verifier.sql")

  Write-Output "PG_VERSION=$serverVersion"
  Write-Output "B1_SECURE_DRAFT_PG17_PASS"
} finally {
  docker stop $name *> $null
}
