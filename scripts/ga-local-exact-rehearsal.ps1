#Requires -Version 7.0
<#
.SYNOPSIS
  Canonical Windows PowerShell GA local exact-apply rehearsal on disposable PostgreSQL 17.

.DESCRIPTION
  Companion to scripts/ga-local-exact-rehearsal.sh.
  Chain: setup → Foundation → verifier → Completion → verifier → AUTH04 → verifier
       → authority-race → config DRY RUN (expect CONFIG HOLD without inputs).
  LF-normalizes SQL before execution. No production writes.
#>

[CmdletBinding()]
param()

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$Root = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$PgUser = 'postgres'
$PgDb = 'postgres'
$env:PGPASSWORD = 'ci_pg_verifier_password'
$Container = "ga-exact-$(Get-Date -Format 'yyyyMMddHHmmss')-$([guid]::NewGuid().ToString('N').Substring(0,8))"

function ConvertTo-Lf([string]$Text) {
  return (($Text -replace "`r`n", "`n") -replace "`r", "`n")
}

function Invoke-SqlFile([string]$Label, [string]$File, [string[]]$ExtraArgs = @()) {
  Write-Host "==> ${Label}: $File"
  $lf = ConvertTo-Lf ([IO.File]::ReadAllText($File))
  $tmp = [IO.Path]::Combine([IO.Path]::GetTempPath(), ("ga-exact-" + [guid]::NewGuid().ToString('N') + '.sql'))
  $outFile = "$tmp.out"
  $errFile = "$tmp.err"
  $utf8NoBom = New-Object System.Text.UTF8Encoding $false
  [IO.File]::WriteAllText($tmp, $lf, $utf8NoBom)
  try {
    $args = [System.Collections.Generic.List[string]]::new()
    $args.AddRange([string[]]@('exec', '-i', $Container, 'psql', '-v', 'ON_ERROR_STOP=1', '-U', $PgUser, '-d', $PgDb))
    foreach ($a in $ExtraArgs) { $args.Add($a) }
    $p = Start-Process -FilePath 'docker' -ArgumentList $args.ToArray() `
      -RedirectStandardInput $tmp -RedirectStandardOutput $outFile -RedirectStandardError $errFile `
      -NoNewWindow -Wait -PassThru
    $stdout = if (Test-Path $outFile) { [IO.File]::ReadAllText($outFile) } else { '' }
    $stderr = if (Test-Path $errFile) { [IO.File]::ReadAllText($errFile) } else { '' }
    $combined = ($stdout + "`n" + $stderr).TrimEnd()
    if ($p.ExitCode -ne 0) {
      throw "STEP_FAILED: $Label exit=$($p.ExitCode)`n$combined"
    }
    return $combined
  }
  finally {
    Remove-Item -LiteralPath $tmp, $outFile, $errFile -Force -ErrorAction SilentlyContinue
  }
}

try {
  Write-Host "==> Starting postgres:17 container $Container"
  & docker run -d --name $Container `
    -e POSTGRES_HOST_AUTH_METHOD=trust `
    -e POSTGRES_PASSWORD=$env:PGPASSWORD `
    postgres:17 | Out-Null
  if ($LASTEXITCODE -ne 0) { throw 'DOCKER_RUN_FAILED' }

  $ready = $false
  for ($i = 0; $i -lt 60; $i++) {
    & docker exec $Container pg_isready -U $PgUser -d $PgDb 1>$null 2>$null
    if ($LASTEXITCODE -eq 0) { $ready = $true; break }
    Start-Sleep -Seconds 1
  }
  if (-not $ready) { throw 'PG_NOT_READY' }

  Invoke-SqlFile 'SETUP' (Join-Path $Root 'tests/graduates-affairs/graduates-affairs-authorization-04.pg-setup.sql') | Out-Null
  Invoke-SqlFile 'FOUNDATION' (Join-Path $Root 'supabase/migrations/20260808210000_ga_mvp_foundation_01.sql') | Out-Null
  $v1 = Invoke-SqlFile 'FOUNDATION VERIFIER' (Join-Path $Root 'tests/graduates-affairs/ga-production-promotion-post-verifier-foundation.sql')
  if ($v1 -notmatch 'FOUNDATION_POST_VERIFIER_PASS') { throw 'FOUNDATION_VERIFIER_TOKEN_MISSING' }

  Invoke-SqlFile 'COMPLETION' (Join-Path $Root 'supabase/migrations/20260808210100_ga_mvp_completion_01.sql') | Out-Null
  $v2 = Invoke-SqlFile 'COMPLETION VERIFIER' (Join-Path $Root 'tests/graduates-affairs/ga-production-promotion-post-verifier-completion.sql')
  if ($v2 -notmatch 'COMPLETION_POST_VERIFIER_PASS') { throw 'COMPLETION_VERIFIER_TOKEN_MISSING' }

  Invoke-SqlFile 'AUTH04' (Join-Path $Root 'supabase/migrations/20260808210200_ga_authorization_04.sql') | Out-Null
  $v3 = Invoke-SqlFile 'AUTH04 VERIFIER' (Join-Path $Root 'tests/graduates-affairs/ga-production-promotion-post-verifier-auth04.sql')
  if ($v3 -notmatch 'AUTH04_POST_VERIFIER_PASS') { throw 'AUTH04_VERIFIER_TOKEN_MISSING' }

  Invoke-SqlFile 'AUTHORITY RACE MATRIX' (Join-Path $Root 'tests/graduates-affairs/graduates-affairs-followup-authority-race-01.pg-verify.sql') | Out-Null

  Write-Host '==> Operational config DRY RUN only (empty inputs must HOLD)'
  $cfgTmp = [IO.Path]::Combine([IO.Path]::GetTempPath(), ("ga-cfg-" + [guid]::NewGuid().ToString('N') + '.sql'))
  $cfgOut = "$cfgTmp.out"
  $cfgErr = "$cfgTmp.err"
  try {
    $lf = ConvertTo-Lf ([IO.File]::ReadAllText((Join-Path $Root 'docs/migration-drafts/GA-PRODUCTION-PROMOTION-CONFIG-01.sql')))
    [IO.File]::WriteAllText($cfgTmp, $lf, (New-Object System.Text.UTF8Encoding $false))
    $p = Start-Process -FilePath 'docker' -ArgumentList @(
      'exec', '-i', $Container, 'psql', '-v', 'ON_ERROR_STOP=1', '-U', $PgUser, '-d', $PgDb
    ) -RedirectStandardInput $cfgTmp -RedirectStandardOutput $cfgOut -RedirectStandardError $cfgErr -NoNewWindow -Wait -PassThru
    $combined = ((Get-Content -Raw $cfgOut) + "`n" + (Get-Content -Raw $cfgErr))
    if ($p.ExitCode -eq 0) { throw 'CONFIG_DRY_RUN_UNEXPECTED_SUCCESS' }
    if ($combined -notmatch 'CONFIG HOLD') { throw "CONFIG_DRY_RUN_MARKER_MISSING: $combined" }
    Write-Host '==> CONFIG_DRY_RUN_HOLD_CONFIRMED'
  }
  finally {
    Remove-Item -LiteralPath $cfgTmp, $cfgOut, $cfgErr -Force -ErrorAction SilentlyContinue
  }

  Write-Host '==> LOCAL_EXACT_APPLY_REHEARSAL_PASS'
  exit 0
}
finally {
  & docker rm -f $Container 1>$null 2>$null
}
