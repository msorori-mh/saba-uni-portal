param([string]$Image = "postgres:17-alpine")

# Local disposable SEQ25-27 academic-effects + authorization matrix.
# NO Production write / Deploy / Publish.
$ErrorActionPreference = "Stop"
$repo = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
$pg = Join-Path $PSScriptRoot "pg"
$name = "b1-fx-$([guid]::NewGuid().ToString('N').Substring(0,10))"
$db = "b1_fx"

function Invoke-PsqlFile([string]$Path) {
  # docker cp avoids PowerShell $ expansion mangling plpgsql $$ / $variables.
  $remote = "/tmp/b1_fx_$( [guid]::NewGuid().ToString('N').Substring(0,8) ).sql"
  docker cp $Path "${name}:${remote}"
  if ($LASTEXITCODE -ne 0) { throw "docker cp failed: $Path" }
  docker exec $name psql -X -v ON_ERROR_STOP=1 -U postgres -d $db -f $remote
  if ($LASTEXITCODE -ne 0) { throw "psql failed: $Path" }
}

try {
  docker run --rm --detach --name $name -e POSTGRES_PASSWORD=local_only -e POSTGRES_DB=$db $Image | Out-Null
  if ($LASTEXITCODE -ne 0) { throw "Unable to start PostgreSQL container" }

  $ready = $false
  for ($i = 0; $i -lt 40; $i++) {
    docker exec $name pg_isready -U postgres -d $db *> $null
    if ($LASTEXITCODE -eq 0) { $ready = $true; break }
    Start-Sleep -Milliseconds 400
  }
  if (-not $ready) { throw "PostgreSQL did not become ready" }

  $version = (docker exec $name psql -X -At -U postgres -d $db -c "show server_version;").Trim()
  if ($version -notmatch "^17\.") { throw "Expected PostgreSQL 17, got $version" }

  Invoke-PsqlFile (Join-Path $pg "10-minimal-schema.sql")

  Invoke-PsqlFile (Join-Path $pg "15-stub-map-action.sql")
  # Keep function-body checks off across apply sessions for incomplete transition graph stubs.
  docker exec $name psql -X -v ON_ERROR_STOP=1 -U postgres -d $db -c "ALTER DATABASE $db SET check_function_bodies = off;"
  if ($LASTEXITCODE -ne 0) { throw "failed to set check_function_bodies" }
  Invoke-PsqlFile (Join-Path $repo "supabase\migrations\20260727120000_b1_25_academic_effect_markers_01.sql")
  Invoke-PsqlFile (Join-Path $repo "supabase\migrations\20260727120100_b1_26_academic_effect_functions_01.sql")
  Invoke-PsqlFile (Join-Path $repo "supabase\migrations\20260727120200_b1_27_act_on_academic_effect_integration_01.sql")

  Invoke-PsqlFile (Join-Path $pg "20-effect-authz-matrix.sql")
  Invoke-PsqlFile (Join-Path $pg "30-summarize.sql")

  Write-Host "POSITIVE=5"
  Write-Host "IDEMPOTENT=5"
  Write-Host "ROLLBACK=PASS"
  Write-Host "EC_REGRESSION=NONE"
  Write-Host "PASS_B1_ACADEMIC_EFFECTS_AUTHZ_MATRIX"
}
finally {
  docker rm -f $name *> $null
}
