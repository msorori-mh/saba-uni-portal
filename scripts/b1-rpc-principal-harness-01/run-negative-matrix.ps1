<#
  PORTAL-B1-NEGATIVE-RPC-MATRIX-OPERATOR-EXECUTION-PACKAGE-01
  Windows PowerShell launcher for the 267-case negative authorization matrix.

  OPERATOR-RUN ONLY. Never invoked by CI or by the agent.

  Contract:
    * DATABASE_URL is read from the environment ONLY. Never printed, never logged,
      never written to the report, never committed.
    * psql must exist on PATH.
    * ON_ERROR_STOP=1 everywhere.
    * One case = one file = one transaction = one unconditional ROLLBACK.
    * Fail-closed preflight before case 001.
    * Outside-transaction fingerprint compared after EVERY case.
    * Stops at the first unexpected ALLOW or fingerprint mismatch.

  Usage:
    $env:DATABASE_URL = "postgresql://<operator-role>@<host>:5432/postgres?sslmode=require"
    $env:PGPASSWORD   = "<operator password, session-scoped only>"
    ./scripts/b1-rpc-principal-harness-01/run-negative-matrix.ps1 `
        -ExpectedRef wpmicqriltrowwonknox `
        -ProbeSub 3a279561-f8e6-41d9-b8ca-ce60682c9eab
#>
[CmdletBinding()]
param(
  [string]$ExpectedRef = 'wpmicqriltrowwonknox',
  [Parameter(Mandatory = $true)][string]$ProbeSub,
  [string]$ReportDir = "$PSScriptRoot/generated/report"
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

function Fail([string]$code, [string]$detail) {
  Write-Host "HOLD_B1_NEGATIVE_RPC_MATRIX_$code : $detail" -ForegroundColor Red
  exit 1
}

# --- 0. environment ---------------------------------------------------------
if (-not $env:DATABASE_URL) { Fail 'NO_DATABASE_URL' 'set $env:DATABASE_URL (never commit it)' }
if (-not (Get-Command psql -ErrorAction SilentlyContinue)) { Fail 'PSQL_NOT_FOUND' 'psql must be on PATH' }

$conn = $env:DATABASE_URL   # kept in-memory only; never echoed
$env:PGOPTIONS = '-c client_min_messages=notice'

function Invoke-Psql([string[]]$ExtraArgs) {
  $args = @('-X', '-v', 'ON_ERROR_STOP=1', '--no-psqlrc', $conn) + $ExtraArgs
  $out = & psql @args 2>&1
  return @{ ExitCode = $LASTEXITCODE; Output = ($out -join "`n") }
}

New-Item -ItemType Directory -Force -Path $ReportDir | Out-Null

# --- 1. render the cases offline -------------------------------------------
Write-Host 'Rendering negative cases from MATRIX.json ...'
& bun run "$PSScriptRoot/render-negative-cases.ts"
if ($LASTEXITCODE -ne 0) { Fail 'RENDER_FAILED' 'render-negative-cases.ts' }

$manifest = Get-Content "$PSScriptRoot/generated/MANIFEST.json" -Raw | ConvertFrom-Json
if ($manifest.total -ne 267) { Fail 'CASE_COUNT_MISMATCH' "expected 267, got $($manifest.total)" }

# --- 2. fail-closed preflight ----------------------------------------------
Write-Host 'Running fail-closed operator preflight ...'
$pf = Invoke-Psql @('-v', "expected_ref=$ExpectedRef", '-v', "probe_sub=$ProbeSub",
                    '-f', "$PSScriptRoot/00-preflight.sql")
if ($pf.ExitCode -ne 0 -or $pf.Output -notmatch 'B1_OPERATOR_PREFLIGHT_PASS') {
  Set-Content "$ReportDir/preflight.log" $pf.Output
  Fail 'PREFLIGHT_FAILED' "see $ReportDir/preflight.log"
}
Set-Content "$ReportDir/preflight.log" $pf.Output

# --- 3. baseline fingerprint ------------------------------------------------
function Get-Fingerprint {
  $r = Invoke-Psql @('-f', "$PSScriptRoot/fingerprint.sql")
  if ($r.ExitCode -ne 0) { Fail 'FINGERPRINT_FAILED' 'fingerprint.sql' }
  return ($r.Output -split "`n" | Where-Object { $_ -match '^[0-9a-f]{32}$' } | Select-Object -First 1)
}

$baseline = Get-Fingerprint
if (-not $baseline) { Fail 'FINGERPRINT_EMPTY' 'no baseline value' }
Write-Host "baseline fingerprint captured (len $($baseline.Length))"

# --- 4. execute every case in its own transaction ---------------------------
$results = @()
$files = Get-ChildItem "$PSScriptRoot/generated" -Filter '*.sql' | Sort-Object Name
foreach ($f in $files) {
  $case = $manifest.cases | Where-Object { $_.file -eq $f.Name }
  $r = Invoke-Psql @('-f', $f.FullName)
  $allow = $r.Output -match 'B1_NEG_UNEXPECTED_ALLOW'
  $mutation = $r.Output -match 'B1_NEG_MUTATION_DETECTED'
  $pass = ($r.ExitCode -eq 0) -and ($r.Output -match 'B1_NEG_CASE_PASS')

  $results += [pscustomobject]@{
    index = $case.index; class = $case.class; request_number = $case.request_number
    step_key = $case.step_key; action = $case.action; expected = 'DENY'
    verdict = if ($pass) { 'PASS' } else { 'FAIL' }
  }

  if ($allow) { Fail 'UNEXPECTED_ALLOW' "case $($case.index) $($case.class)" }
  if ($mutation) { Fail 'MUTATION_DETECTED' "case $($case.index) $($case.class)" }
  if (-not $pass) { Fail 'CASE_ERROR' "case $($case.index) $($case.class)" }

  $fp = Get-Fingerprint
  if ($fp -ne $baseline) { Fail 'FINGERPRINT_DRIFT' "after case $($case.index)" }
}

# --- 5. report (secret-free) ------------------------------------------------
$final = Get-Fingerprint
$summary = [pscustomobject]@{
  matrix_id                = $manifest.matrix_id
  executed                 = $results.Count
  passed                   = ($results | Where-Object verdict -eq 'PASS').Count
  failed                   = ($results | Where-Object verdict -eq 'FAIL').Count
  core_cross_role          = ($results | Where-Object { $_.class -notin @('illegal_action_by_exact_assignee') -and $_.class -notlike 'department_scope_swap*' -and $_.class -ne 'department_scope_unrelated_third_head' }).Count
  illegal_action           = ($results | Where-Object class -eq 'illegal_action_by_exact_assignee').Count
  transfer_scope           = ($results | Where-Object { $_.class -like 'department_scope*' }).Count
  positive_cases_executed  = 0
  baseline_equals_final    = ($final -eq $baseline)
}
$summary | ConvertTo-Json -Depth 4 | Set-Content "$ReportDir/negative-matrix-report.json"
$results | ConvertTo-Csv -NoTypeInformation | Set-Content "$ReportDir/negative-matrix-cases.csv"

if (-not $summary.baseline_equals_final) { Fail 'FINAL_FINGERPRINT_DRIFT' 'post-run mismatch' }

Write-Host "PASS_B1_NEGATIVE_RPC_MATRIX_EXECUTED $($summary.passed)/267" -ForegroundColor Green
