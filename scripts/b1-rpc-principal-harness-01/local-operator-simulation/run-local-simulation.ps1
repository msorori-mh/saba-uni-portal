# LONGRUN-08 G13 — local disposable PG17 operator simulation
# Does NOT touch production. Uses Docker postgres:17 + in-container psql.

[CmdletBinding()]
param()

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$here = Split-Path -Parent $MyInvocation.MyCommand.Path
$pkg = Split-Path -Parent $here
$repo = Split-Path -Parent (Split-Path -Parent $pkg)
$outDir = Join-Path $here 'out'
$container = 'b1-neg-matrix-local-sim-08'
$image = 'postgres:17'
$pgUser = 'postgres'
$pgDb = 'postgres'
$opUser = 'b1_matrix_operator'
$opPass = 'local-only-not-a-secret'

New-Item -ItemType Directory -Force -Path $outDir | Out-Null

function Invoke-DockerPsql([string]$User, [string]$File, [string]$Password = 'postgres') {
  $args = @(
    'exec', '-e', "PGPASSWORD=$Password", '-i', $container,
    'psql', '-U', $User, '-d', $pgDb, '-v', 'ON_ERROR_STOP=1', '-f', '-',
    '--no-psqlrc'
  )
  $sql = Get-Content -Raw -Path $File
  $output = $sql | & docker @args 2>&1 | Out-String
  if ($LASTEXITCODE -ne 0) {
    throw "PSQL_FAILED ($User / $File): $output"
  }
  return $output
}

# 0. refuse production endpoint vectors
foreach ($banned in @('DATABASE_URL','PGPASSWORD','PGPASSFILE','PGHOSTADDR','PGSERVICE','PGSERVICEFILE','PGOPTIONS','PGREQUIRESSL')) {
  if (Test-Path "env:$banned") { throw "FORBIDDEN_ENV: $banned" }
}

# 1. always wipe + render twice for deterministic hashes
Write-Host '=== RENDER PASS 1 ==='
if (Test-Path (Join-Path $pkg 'generated')) { Remove-Item -Recurse -Force (Join-Path $pkg 'generated') }
Push-Location $repo
try {
  & bun (Join-Path $pkg 'render-negative-cases.ts')
  if ($LASTEXITCODE -ne 0) { throw 'RENDER1_FAILED' }
} finally { Pop-Location }
function Get-StableRenderFingerprint([string]$generatedRoot) {
  $parts = New-Object System.Collections.Generic.List[string]
  foreach ($rel in @('pins.sql', 'fingerprint-check.sql', 'master-negative-matrix.sql')) {
    $h = (Get-FileHash -Algorithm SHA256 (Join-Path $generatedRoot $rel)).Hash.ToLowerInvariant()
    $parts.Add("$rel=$h")
  }
  Get-ChildItem (Join-Path $generatedRoot 'cases\case-*.sql') | Sort-Object Name | ForEach-Object {
    $h = (Get-FileHash -Algorithm SHA256 $_.FullName).Hash.ToLowerInvariant()
    $parts.Add("$($_.Name)=$h")
  }
  $manifest = Get-Content -Raw (Join-Path $generatedRoot 'MANIFEST.json') | ConvertFrom-Json
  $parts.Add("matrix_sha=$($manifest.matrix_sha256_lf)")
  $parts.Add("negative_total=$($manifest.negative_total)")
  return ($parts -join '|')
}

$fp1 = Get-StableRenderFingerprint (Join-Path $pkg 'generated')
$cases1 = (Get-ChildItem (Join-Path $pkg 'generated\cases\case-*.sql')).Count
if ($cases1 -ne 267) { throw "CASE_COUNT_DRIFT: $cases1" }

Write-Host '=== RENDER PASS 2 (determinism) ==='
Remove-Item -Recurse -Force (Join-Path $pkg 'generated')
Push-Location $repo
try {
  & bun (Join-Path $pkg 'render-negative-cases.ts')
  if ($LASTEXITCODE -ne 0) { throw 'RENDER2_FAILED' }
} finally { Pop-Location }
$fp2 = Get-StableRenderFingerprint (Join-Path $pkg 'generated')
if ($fp1 -ne $fp2) { throw 'RENDER_HASH_DRIFT: stable generated artifacts differ across rerenders' }
$fpSha = [BitConverter]::ToString(
  [System.Security.Cryptography.SHA256]::Create().ComputeHash([Text.Encoding]::UTF8.GetBytes($fp1))
).Replace('-', '').ToLowerInvariant()

# 2. disposable PG17
Write-Host '=== DOCKER PG17 ==='
docker rm -f $container 2>$null | Out-Null
# No host port publish — all access is via docker exec (avoids port collisions).
docker run -d --name $container -e POSTGRES_PASSWORD=postgres $image | Out-Null
$ready = $false
for ($i = 0; $i -lt 40; $i++) {
  Start-Sleep -Seconds 1
  $state = (docker inspect -f '{{.State.Running}}' $container 2>$null)
  if ($state -ne 'true') { continue }
  docker exec $container pg_isready -U postgres | Out-Null
  if ($LASTEXITCODE -eq 0) { $ready = $true; break }
}
if (-not $ready) {
  docker logs $container 2>&1 | Out-String | Write-Host
  docker rm -f $container 2>$null | Out-Null
  throw 'PG17_NOT_READY'
}

# Copy SQL into container
docker cp (Join-Path $here '10-schema-stubs.sql') "${container}:/tmp/10-schema-stubs.sql" | Out-Null
docker cp (Join-Path $here '15-case-functions.sql') "${container}:/tmp/15-case-functions.sql" | Out-Null
docker cp (Join-Path $here '20-focused-cases.sql') "${container}:/tmp/20-focused-cases.sql" | Out-Null

# Apply schema as superuser
$schemaOut = docker exec -e PGPASSWORD=postgres $container psql -U postgres -d postgres -v ON_ERROR_STOP=1 -f /tmp/10-schema-stubs.sql 2>&1 | Out-String
if ($LASTEXITCODE -ne 0) { throw "SCHEMA_FAILED: $schemaOut" }
$fnOut = docker exec -e PGPASSWORD=postgres $container psql -U postgres -d postgres -v ON_ERROR_STOP=1 -f /tmp/15-case-functions.sql 2>&1 | Out-String
if ($LASTEXITCODE -ne 0) { throw "CASE_FUNCTIONS_FAILED: $fnOut" }

# Run focused cases as SELECT-only operator
$caseOut = docker exec -e PGPASSWORD=$opPass $container psql -U $opUser -d postgres -v ON_ERROR_STOP=1 -f /tmp/20-focused-cases.sql 2>&1 | Out-String
if ($LASTEXITCODE -ne 0) { throw "CASES_FAILED: $caseOut" }
Set-Content -Path (Join-Path $outDir 'focused-cases.log') -Value $caseOut -Encoding utf8

# Pull results
$csv = docker exec -e PGPASSWORD=$opPass $container psql -U $opUser -d postgres -At -F ',' -c "SELECT case_id || ',' || verdict || ',' || replace(detail, ',', ';') FROM public.b1_sim_results ORDER BY case_id" 2>&1 | Out-String
Set-Content -Path (Join-Path $outDir 'sim-results.csv') -Value $csv -Encoding utf8

$lines = @($csv -split "`n" | Where-Object { $_.Trim() -ne '' })
$pass = @($lines | Where-Object { $_ -match ',PASS,' }).Count
$hold = @($lines | Where-Object { $_ -match ',HOLD,' }).Count
$unknownHold = ($csv -match 'E_unknown_42501,HOLD')
$paymentStep = ($csv -match 'C_payment_step_uuid,PASS')
$reqUuid = ($csv -match 'D_payment_request_uuid,PASS')

# Cleanup container
docker rm -f $container | Out-Null

$results = [ordered]@{
  mission_id = 'PORTAL-B1-NEGATIVE-RPC-MATRIX-EXECUTABLE-CLOSURE-LONGRUN-08'
  gate = 'G13_LOCAL_OPERATOR_SIMULATION'
  case_count_rendered = 267
  render_deterministic = $true
  stable_render_sha256 = $fpSha
  focused_pass = $pass
  focused_hold = $hold
  unknown_42501_hold = [bool]$unknownHold
  payment_uses_step_uuid_pass = [bool]$paymentStep
  payment_request_uuid_infra_shape = [bool]$reqUuid
  production_rpc_calls = 0
  production_writes = 0
  verdict = if ($pass -ge 5 -and $unknownHold -and $paymentStep -and $reqUuid) { 'PASS' } else { 'HOLD' }
}
$results | ConvertTo-Json -Depth 5 | Set-Content (Join-Path $outDir 'RESULTS.json') -Encoding utf8
Write-Host ($results | ConvertTo-Json -Depth 5)
if ($results.verdict -ne 'PASS') { exit 1 }
Write-Host 'RESULT: PASS_LOCAL_OPERATOR_SIMULATION'
exit 0
