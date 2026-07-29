<#
  PORTAL-B1-NEGATIVE-RPC-MATRIX-OPERATOR-PACKAGE-CODEX-COMPREHENSIVE-HARDENING-03
  Windows PowerShell launcher for the 267-case negative authorization matrix.

  OPERATOR-RUN ONLY. Never invoked by CI or by the agent.

  G1 credential transport contract:
    * DATABASE_URL is NOT used, NOT read, NOT accepted.
    * No connection URI and no password is ever passed in psql argv.
    * Only non-secret libpq variables are exported: PGHOST, PGPORT, PGDATABASE,
      PGUSER, PGSSLMODE=require.
    * The password is read interactively with Read-Host -AsSecureString and is
      written to a randomly named temporary pgpass file OUTSIDE the repository,
      ACL-restricted to the current user only, referenced through PGPASSFILE,
      and removed in `finally` (including on Ctrl+C).
    * If a strict local ACL cannot be enforced, the run STOPS before psql.
    * psql output is captured in memory, redacted, and only the redacted text is
      ever written to the report.

  Usage:
    ./scripts/b1-rpc-principal-harness-01/run-negative-matrix.ps1 `
        -PgHost <project-endpoint-host> -PgUser <operator-role> `
        -ProbeSub 3a279561-f8e6-41d9-b8ca-ce60682c9eab `
        -FunctionGraphMd5 <pinned md5 from the reviewed attestation>
#>
[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)][string]$PgHost,
  [Parameter(Mandatory = $true)][string]$PgUser,
  [Parameter(Mandatory = $true)][string]$ProbeSub,
  [string]$PgPort = '5432',
  [string]$PgDatabase = 'postgres',
  [string]$ExpectedRef = 'wpmicqriltrowwonknox',
  [string]$MigrationVersion = '20260729014519',
  [Parameter(Mandatory = $true)][string]$FunctionGraphMd5,
  [string]$ReportDir = "$PSScriptRoot/generated/report"
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

function Fail([string]$code, [string]$detail) {
  Write-Host "HOLD_B1_NEGATIVE_RPC_MATRIX_$code : $detail" -ForegroundColor Red
  exit 1
}

# --- G1: output redaction ----------------------------------------------------
function Protect-Output([string]$text) {
  if ($null -eq $text) { return '' }
  $patterns = @(
    'postgresql://[^\s"'']*',
    'postgres://[^\s"'']*',
    '(?i)password\s*=\s*\S+',
    '(?i)PGPASSWORD\S*',
    '(?i)PGPASSFILE\s*=\s*\S+',
    '(?i)[^\s:]+:\d+:[^:]+:[^:]+:\S+'   # pgpass line shape host:port:db:user:pw
  )
  foreach ($p in $patterns) { $text = [regex]::Replace($text, $p, '[REDACTED]') }
  return $text
}

# --- G2A: endpoint attestation ----------------------------------------------
if ($ExpectedRef -ne 'wpmicqriltrowwonknox') { Fail 'TARGET_REF_NOT_APPROVED' 'ExpectedRef' }
if (-not (($PgHost -like "*$ExpectedRef*") -or ($PgUser -like "*$ExpectedRef*"))) {
  Fail 'TARGET_ATTESTATION_FAILED' 'neither PGHOST nor PGUSER carries the approved project ref'
}
if ($env:DATABASE_URL) {
  Write-Host 'note: DATABASE_URL is present in the environment and is deliberately ignored.'
}

if (-not (Get-Command psql -ErrorAction SilentlyContinue)) { Fail 'PSQL_NOT_FOUND' 'psql must be on PATH' }

# --- non-secret libpq environment -------------------------------------------
$env:PGHOST = $PgHost
$env:PGPORT = $PgPort
$env:PGDATABASE = $PgDatabase
$env:PGUSER = $PgUser
$env:PGSSLMODE = 'require'
$env:PGOPTIONS = '-c client_min_messages=notice'
Remove-Item Env:PGPASSWORD -ErrorAction SilentlyContinue

# --- G1: temporary, ACL-restricted pgpass outside the repository -------------
$passFile = $null
function New-TempPgpass([securestring]$secret) {
  $name = "b1pg-" + [guid]::NewGuid().ToString('N') + ".conf"
  $path = Join-Path ([System.IO.Path]::GetTempPath()) $name
  $plain = [System.Net.NetworkCredential]::new('', $secret).Password
  $line = "$($env:PGHOST):$($env:PGPORT):$($env:PGDATABASE):$($env:PGUSER):$plain"
  Set-Content -Path $path -Value $line -NoNewline -Encoding ascii
  $plain = $null

  try {
    $acl = Get-Acl $path
    $acl.SetAccessRuleProtection($true, $false)   # break inheritance
    foreach ($r in @($acl.Access)) { [void]$acl.RemoveAccessRule($r) }
    $me = [System.Security.Principal.WindowsIdentity]::GetCurrent().Name
    $rule = New-Object System.Security.AccessControl.FileSystemAccessRule(
      $me, 'Read,Write,Delete', 'Allow')
    $acl.AddAccessRule($rule)
    Set-Acl -Path $path -AclObject $acl

    $verify = Get-Acl $path
    $identities = @($verify.Access | ForEach-Object { $_.IdentityReference.Value })
    if ($verify.AreAccessRulesProtected -ne $true -or
        ($identities | Where-Object { $_ -ne $me }).Count -gt 0) {
      throw 'acl-not-restricted'
    }
  } catch {
    Remove-Item $path -Force -ErrorAction SilentlyContinue
    Fail 'PGPASS_ACL_NOT_ENFORCEABLE' 'refusing to run psql without a user-only pgpass ACL'
  }
  return $path
}

function Invoke-Psql([string[]]$ExtraArgs) {
  # argv carries NO uri and NO password; connection comes from PG* + PGPASSFILE.
  $psqlArgs = @('-X', '-v', 'ON_ERROR_STOP=1', '--no-psqlrc') + $ExtraArgs
  $out = & psql @psqlArgs 2>&1
  return @{ ExitCode = $LASTEXITCODE; Output = (Protect-Output ($out -join "`n")) }
}

function Get-Fingerprint {
  $r = Invoke-Psql @('-t', '-A', '-f', "$PSScriptRoot/fingerprint.sql")
  if ($r.ExitCode -ne 0) { Fail 'FINGERPRINT_FAILED' 'fingerprint.sql' }
  return ($r.Output -split "`n" | Where-Object { $_ -match '^[0-9a-f]{32}$' } | Select-Object -First 1)
}

try {
  # --- G9 step 1: render first (the renderer clears generated/cases) ---------
  Write-Host 'Rendering negative cases from MATRIX.json ...'
  & bun run "$PSScriptRoot/render-negative-cases.ts"
  if ($LASTEXITCODE -ne 0) { Fail 'RENDER_FAILED' 'render-negative-cases.ts' }

  $manifest = Get-Content "$PSScriptRoot/generated/MANIFEST.json" -Raw | ConvertFrom-Json
  if ($manifest.total -ne 267) { Fail 'CASE_COUNT_MISMATCH' "expected 267, got $($manifest.total)" }

  # --- G9 steps 2-4: create the report dir AFTER rendering, outside cases/ ---
  New-Item -ItemType Directory -Force -Path $ReportDir | Out-Null
  $probe = Join-Path $ReportDir '.writable'
  Set-Content -Path $probe -Value 'ok' -Encoding ascii
  if (-not (Test-Path $probe)) { Fail 'REPORT_DIR_NOT_WRITABLE' $ReportDir }
  Remove-Item $probe -Force

  # --- credentials ------------------------------------------------------------
  $secret = Read-Host -Prompt "Operator password for $($env:PGUSER)@$($env:PGHOST)" -AsSecureString
  if (-not $secret -or $secret.Length -eq 0) { Fail 'NO_PASSWORD' 'empty password' }
  $passFile = New-TempPgpass $secret
  $env:PGPASSFILE = $passFile
  $secret.Dispose()

  # --- G1-G4 + G8 fail-closed preflight --------------------------------------
  Write-Host 'Running fail-closed operator preflight ...'
  $pf = Invoke-Psql @('-v', "expected_ref=$ExpectedRef",
                      '-v', "probe_sub=$ProbeSub",
                      '-v', "migration_version=$MigrationVersion",
                      '-v', "fn_graph_md5=$FunctionGraphMd5",
                      '-f', "$PSScriptRoot/00-preflight.sql")
  Set-Content "$ReportDir/preflight.log" $pf.Output
  if ($pf.ExitCode -ne 0 -or $pf.Output -notmatch 'B1_OPERATOR_PREFLIGHT_PASS') {
    Fail 'PREFLIGHT_FAILED' "see $ReportDir/preflight.log"
  }

  # --- baseline fingerprint ---------------------------------------------------
  $baseline = Get-Fingerprint
  if (-not $baseline) { Fail 'FINGERPRINT_EMPTY' 'no baseline value' }
  Write-Host "baseline fingerprint captured (len $($baseline.Length))"

  # --- every case in its own SERIALIZABLE, rollback-only transaction ----------
  $results = @()
  $files = Get-ChildItem "$PSScriptRoot/generated/cases" -Filter 'case-*.sql' | Sort-Object Name
  if ($files.Count -ne 267) { Fail 'CASE_FILE_COUNT_MISMATCH' "$($files.Count)" }

  foreach ($f in $files) {
    $case = $manifest.cases | Where-Object { $_.file -eq $f.Name }
    $r = Invoke-Psql @('-f', $f.FullName)
    $allow = $r.Output -match 'B1_NEG_UNEXPECTED_ALLOW'
    $mutation = $r.Output -match 'B1_NEG_MUTATION_DETECTED'
    $drift = $r.Output -match 'B1_NEG_CONCURRENT_DRIFT_STEP'
    $serial = ($r.Output -match 'B1_NEG_SERIALIZATION_FAILURE') -or ($r.Output -match '40001')
    $pass = ($r.ExitCode -eq 0) -and ($r.Output -match 'B1_NEG_CASE_PASS')

    $results += [pscustomobject]@{
      index = $case.index; class = $case.class; request_number = $case.request_number
      step_key = $case.step_key; action = $case.action
      principal_role = $case.principal_role; expected = 'DENY'
      verdict = if ($pass) { 'PASS' } else { 'FAIL' }
    }

    # no automatic retry on any of these conditions
    if ($allow) { Fail 'UNEXPECTED_ALLOW' "case $($case.index) $($case.class)" }
    if ($mutation) { Fail 'MUTATION_DETECTED' "case $($case.index) $($case.class)" }
    if ($drift) { Fail 'CONCURRENT_DRIFT' "case $($case.index) $($case.class)" }
    if ($serial) { Fail 'SERIALIZATION_FAILURE' "case $($case.index) — no retry by contract" }
    if (-not $pass) { Fail 'CASE_ERROR' "case $($case.index) $($case.class)" }

    $fp = Get-Fingerprint
    if ($fp -ne $baseline) { Fail 'FINGERPRINT_DRIFT' "after case $($case.index)" }
  }

  # --- redacted report --------------------------------------------------------
  $final = Get-Fingerprint
  $summary = [pscustomobject]@{
    matrix_sha256            = $manifest.matrix_sha256
    executed                 = $results.Count
    passed                   = ($results | Where-Object verdict -eq 'PASS').Count
    failed                   = ($results | Where-Object verdict -eq 'FAIL').Count
    anon_cases               = ($results | Where-Object principal_role -eq 'anon').Count
    authenticated_cases      = ($results | Where-Object principal_role -eq 'authenticated').Count
    illegal_action           = ($results | Where-Object class -eq 'illegal_action_by_exact_assignee').Count
    transfer_scope           = ($results | Where-Object { $_.class -like 'department_scope*' }).Count
    positive_cases_executed  = 0
    baseline_equals_final    = ($final -eq $baseline)
  }
  (Protect-Output ($summary | ConvertTo-Json -Depth 4)) | Set-Content "$ReportDir/negative-matrix-report.json"
  (Protect-Output (($results | ConvertTo-Csv -NoTypeInformation) -join "`n")) |
    Set-Content "$ReportDir/negative-matrix-cases.csv"

  if (-not $summary.baseline_equals_final) { Fail 'FINAL_FINGERPRINT_DRIFT' 'post-run mismatch' }

  Write-Host "PASS_B1_NEGATIVE_RPC_MATRIX_EXECUTED $($summary.passed)/267" -ForegroundColor Green
}
finally {
  # G1: the temporary credential file never survives the run — success, failure,
  # exception or Ctrl+C.
  if ($passFile -and (Test-Path $passFile)) {
    try { Set-Content -Path $passFile -Value ('0' * 256) -NoNewline -Encoding ascii } catch { }
    Remove-Item $passFile -Force -ErrorAction SilentlyContinue
  }
  Remove-Item Env:PGPASSFILE -ErrorAction SilentlyContinue
  Remove-Item Env:PGPASSWORD -ErrorAction SilentlyContinue
}
