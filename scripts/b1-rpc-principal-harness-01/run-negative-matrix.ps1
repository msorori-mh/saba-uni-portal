<#
  PORTAL-B1-NEGATIVE-RPC-MATRIX-FINAL-EXECUTION-PACKAGE-REMEDIATION-07
  Operator launcher. Windows PowerShell 5.1+ / PowerShell 7+.

  G2 CREDENTIAL CONTRACT
    * DATABASE_URL is NOT read, NOT accepted and NOT supported.
    * No pgpass file is created. No PGPASSWORD is set. No password is ever
      passed on the command line, written to disk, or placed in an environment
      variable.
    * psql is invoked with -W so PostgreSQL prompts for the password directly
      on the operator's terminal, once, for the single master run.

  G3 TARGET CONTRACT
    * The endpoint comes ONLY from TARGET-MANIFEST.json. There is no -PgHost,
      -PgUser, -PgPort or -ExpectedRef parameter: an operator cannot point this
      script at another database.

  G9 EXECUTION CONTRACT
    * Exactly ONE psql process runs generated/master-negative-matrix.sql:
      preflight -> 264 executable rollback-only cases -> outside-transaction baseline check.
      (3 transfer-scope cases are BLOCKED_PENDING_ACTIVE_TEST_ONLY_FIXTURE and excluded.)
#>

[CmdletBinding()]
param()   # G3: no parameters at all. The target, the render and the case set
          # are fixed by TARGET-MANIFEST.json; -SkipRender is gone so a stale
          # generated/ tree can never be executed.

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$here = Split-Path -Parent $MyInvocation.MyCommand.Path
$manifestPath = Join-Path $here 'TARGET-MANIFEST.json'
$generated = Join-Path $here 'generated'
$master = Join-Path $generated 'master-negative-matrix.sql'
$reportDir = Join-Path $generated 'report'

function Protect-Output([string]$text) {
  if ($null -eq $text) { return '' }
  $out = $text
  $out = $out -replace '(?i)postgres(ql)?://[^\s]+', '<redacted-uri>'
  $out = $out -replace '(?i)password\s*=\s*[^\s;]+', 'password=<redacted>'
  $out = $out -replace '(?i)PGPASSWORD\s*=\s*[^\s;]+', 'PGPASSWORD=<redacted>'
  $out = $out -replace '(?i)PGPASSFILE\s*=\s*[^\s;]+', 'PGPASSFILE=<redacted>'
  $out = $out -replace '(?m)^[^\s:]+:\d+:[^\s:]+:[^\s:]+:.+$', '<redacted-pgpass-line>'
  return $out
}

# ---------------------------------------------------------------------------
# 0. tool availability
# ---------------------------------------------------------------------------
foreach ($tool in @('psql', 'bun')) {
  if (-not (Get-Command $tool -ErrorAction SilentlyContinue)) {
    throw "REQUIRED_TOOL_MISSING: $tool must be on PATH"
  }
}

# ---------------------------------------------------------------------------
# 1. G3 - endpoint is read from the in-repository manifest only
# ---------------------------------------------------------------------------
if (-not (Test-Path $manifestPath)) { throw 'TARGET_MANIFEST_MISSING' }
$manifest = Get-Content -Raw -Path $manifestPath | ConvertFrom-Json

$projectRef = $manifest.endpoint.project_ref
$pgHost = $manifest.endpoint.approved_pghost
$pgPort = $manifest.endpoint.approved_pgport
$pgDatabase = $manifest.endpoint.approved_pgdatabase
$pgUserRegex = $manifest.endpoint.approved_pguser_regex
$pgSslMode = $manifest.endpoint.approved_pgsslmode
$pgUser = "postgres.$projectRef"

if ($projectRef -ne 'wpmicqriltrowwonknox') { throw "TARGET_REF_MISMATCH: $projectRef" }
if ([string]::IsNullOrWhiteSpace($pgHost)) { throw 'TARGET_HOST_MISSING' }
if ($pgPort -ne '5432') { throw "TARGET_PORT_NOT_APPROVED: $pgPort (transaction-mode 6543 is forbidden)" }
if ($pgUser -notmatch $pgUserRegex) { throw 'TARGET_USER_SHAPE_MISMATCH' }
if ($pgSslMode -ne 'verify-full') { throw 'HOLD_NEEDS_VERIFIED_TLS_ENDPOINT: sslmode must be verify-full' }

$caRelative = $manifest.endpoint.approved_pgsslrootcert_path
$caPath = Join-Path (Split-Path -Parent (Split-Path -Parent $here)) $caRelative
if (-not (Test-Path $caPath)) {
  throw "HOLD_NEEDS_VERIFIED_TLS_ENDPOINT: CA bundle missing at $caRelative"
}

# G2 - refuse to run if a credential channel is present in the environment.
foreach ($banned in @($manifest.endpoint.forbidden_environment_channels)) {
  if (Test-Path "env:$banned") {
    throw "FORBIDDEN_CREDENTIAL_CHANNEL: $banned is set; unset it before running this package"
  }
}

$env:PGHOST = $pgHost
$env:PGPORT = $pgPort
$env:PGDATABASE = $pgDatabase
$env:PGUSER = $pgUser
$env:PGSSLMODE = $pgSslMode
$env:PGSSLROOTCERT = $caPath
$env:PGAPPNAME = 'b1-negative-rpc-matrix'
# G1: the session must be genuinely read-write. default_transaction_read_only
# must never be the layer that blocks a write, or an authorization bypass would
# be masked as a denial. Isolation comes from ROLLBACK-only cases instead.
$env:PGOPTIONS = '-c default_transaction_read_only=off'

Write-Host "target: ref=$projectRef host=$pgHost port=$pgPort db=$pgDatabase sslmode=$pgSslMode"

# ---------------------------------------------------------------------------
# 2. offline render (no connection)
# ---------------------------------------------------------------------------
Write-Host 'rendering cases offline (always; there is no skip path)...'
& bun (Join-Path $here 'render-negative-cases.ts')
if ($LASTEXITCODE -ne 0) { throw 'RENDER_FAILED' }
if (-not (Test-Path $master)) { throw 'MASTER_SCRIPT_MISSING' }

$allCases = Get-ChildItem -Path (Join-Path $generated 'cases') -Filter 'case-*.sql'
$blockedCases = @($allCases | Where-Object { $_.Name -like '*.BLOCKED.sql' })
$caseCount = $allCases.Count
if ($caseCount -ne 267) { throw "CASE_COUNT_DRIFT: $caseCount" }
# REMEDIATION-09 G2: blocked scope cases are rendered but never executed.
if ($blockedCases.Count -ne 3) { throw "BLOCKED_CASE_COUNT_DRIFT: $($blockedCases.Count)" }
$executableCount = $caseCount - $blockedCases.Count
if ($executableCount -ne 264) { throw "EXECUTABLE_CASE_COUNT_DRIFT: $executableCount" }
$masterIncludes = (Select-String -Path (Join-Path $generated 'master-negative-matrix.sql') -Pattern '\\ir cases/').Count
if ($masterIncludes -ne 264) { throw "MASTER_INCLUDE_COUNT_DRIFT: $masterIncludes" }
if (Select-String -Path (Join-Path $generated 'master-negative-matrix.sql') -Pattern 'BLOCKED\.sql') {
  throw 'BLOCKED_CASE_INCLUDED_IN_MASTER'
}

$commitHits = Select-String -Path (Join-Path $generated 'cases\*.sql') -Pattern '(?im)^\s*COMMIT\b'
if ($commitHits) { throw 'FORBIDDEN_COMMIT_IN_RENDERED_CASES' }

# G6: the observer must never take a row lock.
$lockHits = Select-String -Path (Join-Path $generated 'cases\*.sql') -Pattern '(?i)\bFOR\s+(SHARE|UPDATE|KEY\s+SHARE|NO\s+KEY\s+UPDATE)\b'
if ($lockHits) { throw 'FORBIDDEN_ROW_LOCK_IN_RENDERED_CASES' }

# ---------------------------------------------------------------------------
# 3. G9 - single psql process, interactive password prompt (-W)
# ---------------------------------------------------------------------------
New-Item -ItemType Directory -Force -Path $reportDir | Out-Null
$stamp = (Get-Date).ToUniversalTime().ToString('yyyyMMddTHHmmssZ')
$logPath = Join-Path $reportDir "negative-matrix-$stamp.log"

Write-Host 'psql will prompt for the operator password once. It is never stored.'

$psqlArgs = @(
  '-W',
  '-v', 'ON_ERROR_STOP=1',
  '--no-psqlrc',
  '--echo-errors',
  '-f', $master
)

Push-Location $generated
try {
  $output = & psql @psqlArgs 2>&1 | Out-String
  $exit = $LASTEXITCODE
} finally {
  Pop-Location
}

$redacted = Protect-Output $output
Set-Content -Path $logPath -Value $redacted -Encoding UTF8

$pass = ([regex]::Matches($redacted, 'CASE_PASS')).Count
$fail = ([regex]::Matches($redacted, 'CASE_FAIL|PREFLIGHT_FAIL|POST_RUN_FAIL|CASE_STATE_DRIFT')).Count

Write-Host "cases passed: $pass / 264 executable (3 blocked: BLOCKED_PENDING_ACTIVE_TEST_ONLY_FIXTURE)"
Write-Host "failures    : $fail"
Write-Host "report      : $logPath"

if ($exit -ne 0 -or $fail -gt 0 -or $pass -ne 264) {
  Write-Host 'RESULT: HOLD_B1_NEGATIVE_RPC_MATRIX'
  exit 1
}

Write-Host 'RESULT: PASS_B1_NEGATIVE_RPC_MATRIX_264_DENY_ZERO_MUTATION_3_BLOCKED_PENDING_ACTIVE_TEST_ONLY_FIXTURE'
exit 0
