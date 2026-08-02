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
      preflight -> execution authorization gate -> 267 executable rollback-only
      cases -> outside-transaction baseline check.
      (Blocked case files are abolished: all 267 cases render as executable SQL
       bound to deterministic ACTIVE TEST_ONLY fixture steps.)

  G3 FIXTURE READINESS GATE
    * While the fixture package is not applied and verified the launcher refuses
      to start the matrix and exits with
      HOLD_B1_NEGATIVE_RPC_MATRIX_FIXTURE_PACKAGE_NOT_APPLIED — before psql.

  REMEDIATION-26 EXECUTION AUTHORIZATION GATE
    * A PINNED baseline never authorizes execution by itself: the baseline must
      carry execution_authorized = false. The 267 cases stay impossible until a
      separate owner-approved authorization artifact is GRANTED and bound to
      the active baseline — and a successful read-only operator preflight has
      passed in the same session. While the artifact is NOT_GRANTED the
      launcher exits with HOLD_B1_NEGATIVE_RPC_MATRIX_EXECUTION_NOT_AUTHORIZED
      — before psql.
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
# 1b. INVALIDATION-09 - AUTHORITATIVE BASELINE FAIL-CLOSED GATE
#     Execution is refused unless the CANONICAL ACTIVE baseline is PINNED,
#     unexpired, and attests the required migration head — AND does NOT
#     self-authorize execution (REMEDIATION-26: execution_authorized must be
#     false; a read-only capture is never an authorization). Archived baselines
#     are never selectable: the path is hard-coded here and any artifact under
#     baseline/archive/ is rejected.
# ---------------------------------------------------------------------------
$canonicalBaselineRelative = 'scripts/b1-rpc-principal-harness-01/baseline/AUTHORITATIVE-BASELINE.json'
$requiredMigrationHead = '20260801021541'
$baselineHold = 'HOLD_STALE_OR_MISMATCHED_AUTHORITATIVE_BASELINE'
$bl = $manifest.authoritative_baseline

function Deny-Baseline([string]$why) {
  Write-Host "baseline gate: $why"
  Write-Host "RESULT: $baselineHold"
  exit 3
}

if ($bl.artifact_path -ne $canonicalBaselineRelative) { Deny-Baseline "baseline path is not the canonical active path: $($bl.artifact_path)" }
if ($bl.artifact_path -like '*baseline/archive/*') { Deny-Baseline 'archived baseline is not selectable' }

$baselinePath = Join-Path (Split-Path -Parent (Split-Path -Parent $here)) $bl.artifact_path
if (-not (Test-Path $baselinePath)) { Deny-Baseline 'active baseline artifact missing' }
$baselineRaw = (Get-Content -Raw -Path $baselinePath) -replace "`r`n", "`n"
$baseline = $baselineRaw | ConvertFrom-Json

$baselineSha = [BitConverter]::ToString(
  [System.Security.Cryptography.SHA256]::Create().ComputeHash([Text.Encoding]::UTF8.GetBytes($baselineRaw))
).Replace('-', '').ToLowerInvariant()
if ($baselineSha -ne $bl.artifact_sha256) { Deny-Baseline 'baseline artifact sha256 differs from the manifest pin' }

if ($bl.status -ne 'PINNED' -or $baseline.status -ne 'PINNED') { Deny-Baseline "status is $($baseline.status)" }
# REMEDIATION-26: a read-only capture must NEVER authorize execution. A
# baseline (or manifest) carrying execution_authorized = true is contract
# drift and fails closed; execution authorization lives only in the separate
# owner-approved artifact checked by the gate in section 2c.
if ($bl.execution_authorized -eq $true -or $baseline.execution_authorized -eq $true) { Deny-Baseline 'baseline self-authorizes execution (execution_authorized is true); a read-only capture must never authorize execution' }
if ([string]::IsNullOrWhiteSpace([string]$baseline.fingerprint) -or [string]::IsNullOrWhiteSpace([string]$bl.fingerprint)) { Deny-Baseline 'fingerprint is null' }
if ($baseline.fingerprint -ne $bl.fingerprint) { Deny-Baseline 'fingerprint mismatch between manifest and artifact' }
if ($bl.expected_migration_head -ne $requiredMigrationHead) { Deny-Baseline "expected migration head is not $requiredMigrationHead" }
if ($baseline.migration_head -ne $requiredMigrationHead -or $bl.migration_head -ne $requiredMigrationHead) { Deny-Baseline "migration head is not $requiredMigrationHead" }
if ([string]::IsNullOrWhiteSpace([string]$baseline.reviewed_package_sha)) { Deny-Baseline 'reviewed_package_sha is null' }
if ($baseline.reviewed_package_sha -ne $bl.reviewed_package_sha) { Deny-Baseline 'reviewed_package_sha mismatch' }
$executionSha = (& git -C (Split-Path -Parent (Split-Path -Parent $here)) rev-parse HEAD).Trim()
if ($baseline.reviewed_package_sha -ne $executionSha) { Deny-Baseline 'reviewed_package_sha differs from the exact execution SHA' }
if ($null -eq $baseline.scope -or @($baseline.scope).Count -eq 0) { Deny-Baseline 'request scope is empty' }
$manifestScope = @($bl.scope) -join ','
if ((@($baseline.scope) -join ',') -ne $manifestScope) { Deny-Baseline 'request scope differs from the manifest scope' }
if ($baseline.operator_preflight_executed -eq $true) { Deny-Baseline 'baseline already records an executed operator preflight' }
if ([string]::IsNullOrWhiteSpace([string]$baseline.captured_at_utc) -or $null -eq $baseline.valid_for_minutes) { Deny-Baseline 'baseline capture window is missing' }
$capturedAt = [DateTime]::Parse($baseline.captured_at_utc, [Globalization.CultureInfo]::InvariantCulture, [Globalization.DateTimeStyles]::AdjustToUniversal -bor [Globalization.DateTimeStyles]::AssumeUniversal)
if ((Get-Date).ToUniversalTime() -gt $capturedAt.AddMinutes([double]$baseline.valid_for_minutes)) { Deny-Baseline 'baseline is expired' }

Write-Host 'baseline gate: PINNED, non-self-authorizing, unexpired'


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
# RECONCILIATION-17: blocked rendering is abolished. Every one of the 267 cases
# is an executable SQL case bound to a deterministic ACTIVE fixture step; a
# rendered BLOCKED file is package drift, not a case class.
if ($blockedCases.Count -ne 0) { throw "BLOCKED_CASE_FILES_RENDERED: $($blockedCases.Count)" }
$executableCount = $caseCount - $blockedCases.Count
if ($executableCount -ne 267) { throw "EXECUTABLE_CASE_COUNT_DRIFT: $executableCount" }
$masterIncludes = (Select-String -Path (Join-Path $generated 'master-negative-matrix.sql') -Pattern '\\ir cases/').Count
if ($masterIncludes -ne 267) { throw "MASTER_INCLUDE_COUNT_DRIFT: $masterIncludes" }
if (Select-String -Path (Join-Path $generated 'master-negative-matrix.sql') -Pattern 'BLOCKED\.sql') {
  throw 'BLOCKED_CASE_INCLUDED_IN_MASTER'
}

# ---------------------------------------------------------------------------
# 2b. RECONCILIATION-17 - FIXTURE READINESS GATE (fail-closed, before psql)
#     Source contract and runtime readiness are separate: all 267 cases are
#     executable SQL, but the matrix may not start until the fixture package is
#     applied and verified. FIXTURE_PACKAGE_NOT_APPLIED stops the run here —
#     without reducing the executable case count.
# ---------------------------------------------------------------------------
$readiness = $manifest.matrix.readiness
if ($null -eq $readiness -or [string]::IsNullOrWhiteSpace([string]$readiness.status)) {
  throw 'FIXTURE_READINESS_STATUS_MISSING'
}
if ($readiness.status -ne 'FIXTURE_PACKAGE_APPLIED_AND_VERIFIED') {
  Write-Host "fixture readiness: $($readiness.status) (267/267 executable source contract unchanged)"
  Write-Host 'RESULT: HOLD_B1_NEGATIVE_RPC_MATRIX_FIXTURE_PACKAGE_NOT_APPLIED'
  exit 2
}

# ---------------------------------------------------------------------------
# 2c. REMEDIATION-26 - EXECUTION AUTHORIZATION GATE (fail-closed, before psql)
#     Gate 3 of 3. A PINNED baseline (gate 1) and a successful read-only
#     operator preflight (gate 2, proven in-session by 01-execution-gate.sql)
#     never authorize execution by themselves. The 267 cases stay impossible
#     until a SEPARATE owner-approved authorization artifact is GRANTED and
#     bound to the ACTIVE baseline fingerprint, artifact sha256 and reviewed
#     package SHA. REMEDIATION-26 does not grant it: the artifact is
#     NOT_GRANTED and this gate stops the run here. The same pins are
#     re-checked inside the SQL package by 01-execution-gate.sql, so invoking
#     psql directly cannot bypass this gate either.
# ---------------------------------------------------------------------------
$canonicalAuthRelative = 'scripts/b1-rpc-principal-harness-01/authorization/EXECUTION-AUTHORIZATION.json'
$authHold = 'HOLD_B1_NEGATIVE_RPC_MATRIX_EXECUTION_NOT_AUTHORIZED'
$ma = $manifest.execution_authorization

function Deny-Authorization([string]$why) {
  Write-Host "execution authorization gate: $why"
  Write-Host "RESULT: $authHold"
  exit 4
}

if ($null -eq $ma) { Deny-Authorization 'manifest carries no execution_authorization block' }
if ($ma.artifact_path -ne $canonicalAuthRelative) { Deny-Authorization "authorization path is not the canonical path: $($ma.artifact_path)" }

$authPath = Join-Path (Split-Path -Parent (Split-Path -Parent $here)) $ma.artifact_path
if (-not (Test-Path $authPath)) { Deny-Authorization 'execution authorization artifact missing' }
$authRaw = (Get-Content -Raw -Path $authPath) -replace "`r`n", "`n"
$auth = $authRaw | ConvertFrom-Json

$authSha = [BitConverter]::ToString(
  [System.Security.Cryptography.SHA256]::Create().ComputeHash([Text.Encoding]::UTF8.GetBytes($authRaw))
).Replace('-', '').ToLowerInvariant()
if ($authSha -ne $ma.artifact_sha256) { Deny-Authorization 'authorization artifact sha256 differs from the manifest pin' }
if ($auth.status -ne $ma.status) { Deny-Authorization 'authorization status differs from the manifest pin' }

if ($auth.status -ne 'GRANTED' -or $auth.execution_authorized -ne $true) {
  Deny-Authorization "no explicit owner-approved execution authorization (status $($auth.status))"
}
if ($auth.requires_operator_preflight_pass -ne $true) { Deny-Authorization 'authorization must require a successful operator preflight' }
if ([string]::IsNullOrWhiteSpace([string]$auth.authorized_by)) { Deny-Authorization 'authorized_by is empty' }
if ([string]::IsNullOrWhiteSpace([string]$auth.owner_approval_reference)) { Deny-Authorization 'owner approval reference is empty' }
if ($auth.bound_baseline_fingerprint -ne $baseline.fingerprint) { Deny-Authorization 'authorization is not bound to the active baseline fingerprint' }
if ($auth.bound_baseline_artifact_sha256 -ne $baselineSha) { Deny-Authorization 'authorization is not bound to the active baseline artifact sha256' }
if ($auth.bound_reviewed_package_sha -ne $executionSha) { Deny-Authorization 'authorization is not bound to the exact execution SHA' }
if ([string]::IsNullOrWhiteSpace([string]$auth.authorized_at_utc) -or $null -eq $auth.valid_for_minutes) { Deny-Authorization 'authorization validity window is missing' }
$grantedAt = [DateTime]::Parse($auth.authorized_at_utc, [Globalization.CultureInfo]::InvariantCulture, [Globalization.DateTimeStyles]::AdjustToUniversal -bor [Globalization.DateTimeStyles]::AssumeUniversal)
if ((Get-Date).ToUniversalTime() -gt $grantedAt.AddMinutes([double]$auth.valid_for_minutes)) { Deny-Authorization 'execution authorization is expired' }

Write-Host 'execution authorization gate: GRANTED, bound to the active baseline, unexpired'


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

Write-Host "cases passed: $pass / 267 executable (0 blocked; fixture gate passed)"
Write-Host "failures    : $fail"
Write-Host "report      : $logPath"

if ($exit -ne 0 -or $fail -gt 0 -or $pass -ne 267 -or $blockedCases.Count -gt 0) {
  Write-Host 'RESULT: HOLD_B1_NEGATIVE_RPC_MATRIX'
  exit 1
}

Write-Host 'RESULT: PASS_B1_NEGATIVE_RPC_MATRIX_267_DENY_ZERO_MUTATION_0_BLOCKED'
exit 0
