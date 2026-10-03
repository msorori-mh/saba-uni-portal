param(
  [string]$MaintenanceDatabase = $(if ($env:PGMAINTENANCE_DB) { $env:PGMAINTENANCE_DB } else { 'postgres' })
)

$ErrorActionPreference = 'Stop'
$repo = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
$releaseSha = (git -C $repo rev-parse origin/main 2>$null).Trim()
$runId = [guid]::NewGuid().ToString('N').Substring(0, 16)
$databaseName = "dept_transfer_10a_$runId"
$created = $false
$targetHost = if ($env:PGHOST) { $env:PGHOST } else { 'local socket' }

if (-not (Get-Command psql -ErrorAction SilentlyContinue)) {
  throw 'PG17_HARNESS_PSQL_UNAVAILABLE'
}
if ($env:PG_TARGET_DISPOSABLE -ne '1') {
  throw 'PG17_HARNESS_REQUIRES_PG_TARGET_DISPOSABLE_1'
}
if ($releaseSha -notmatch '^[0-9a-f]{40}$') {
  throw 'PG17_HARNESS_APPROVED_BASE_SHA_UNAVAILABLE'
}
if ($targetHost -match '(?i)(supabase\.co|quboolye|production|prod)') {
  throw 'PG17_HARNESS_REJECTED_NON_DISPOSABLE_TARGET'
}
if ($databaseName -notmatch '^dept_transfer_10a_[0-9a-f]{16}$') {
  throw 'PG17_HARNESS_DATABASE_NAME_GUARD_FAILED'
}

function Invoke-PsqlFile([string]$Database, [string]$Path) {
  Write-Output "APPLY_LOCAL_ONLY=$([System.IO.Path]::GetFileName($Path))"
  & psql -X -v ON_ERROR_STOP=1 -d $Database -f $Path
  if ($LASTEXITCODE -ne 0) { throw "PG17_HARNESS_PSQL_FILE_FAILED=$Path" }
}

function Invoke-PsqlText([string]$Database, [string]$Sql) {
  $Sql | & psql -X -v ON_ERROR_STOP=1 -d $Database
  if ($LASTEXITCODE -ne 0) { throw 'PG17_HARNESS_PSQL_TEXT_FAILED' }
}

try {
  & psql -X -v ON_ERROR_STOP=1 -d $MaintenanceDatabase -c "CREATE DATABASE $databaseName"
  if ($LASTEXITCODE -ne 0) { throw 'PG17_HARNESS_CREATE_DATABASE_FAILED' }
  $created = $true

  $version = (& psql -X -At -v ON_ERROR_STOP=1 -d $databaseName -c 'show server_version;').Trim()
  if ($version -notmatch '^17\.') { throw "PG17_HARNESS_EXPECTED_PG17_GOT_$version" }
  Invoke-PsqlText $databaseName "select set_config('application_name','TEST_ONLY_DEPARTMENT_TRANSFER_10A1',false);"

  $rpcMatrix = Join-Path $repo 'tests\b1-rpc-matrix\pg'
  $integrated = Join-Path $repo 'tests\b1-integrated-runtime\pg'
  Invoke-PsqlFile $databaseName (Join-Path $rpcMatrix '10-minimal-schema.sql')
  Invoke-PsqlFile $databaseName (Join-Path $PSScriptRoot 'PG17-DISPOSABLE-FIXTURE-COMPATIBILITY.sql')

  $entries = Get-Content (Join-Path $rpcMatrix '20-draft-apply-order.txt') |
    Where-Object { $_ -match '^\d{2} docs/migration-drafts/' }
  $entryCount = 0
  $sawSecureRead = $false
  $sawSecureDraft = $false
  foreach ($entry in $entries) {
    $parts = $entry -split '\s+'
    $sequence = $parts[0]
    $relative = $parts[1]
    $expectedBlob = $parts[4]
    $path = Join-Path $repo ($relative -replace '/', '\')
    $actualBlob = (git -C $repo hash-object $path).Trim()
    if ($actualBlob -ne $expectedBlob) {
      throw "PG17_HARNESS_PIN_MISMATCH=$relative expected=$expectedBlob actual=$actualBlob"
    }
    if ($sequence -eq '06') {
      $raw = Get-Content -LiteralPath $path -Raw
      if ($raw -notmatch 'APPROVED_RELEASE_COMMIT_PLACEHOLDER') {
        throw 'PG17_HARNESS_SEQ06_PLACEHOLDER_NOT_FOUND'
      }
      $approved = $raw.Replace(
        "v_commit text := 'APPROVED_RELEASE_COMMIT_PLACEHOLDER';",
        "v_commit text := '$releaseSha';"
      )
      if ($approved -notmatch "v_commit text := '$releaseSha';" -or $approved -notmatch "v_commit = 'APPROVED_RELEASE_COMMIT_PLACEHOLDER'") {
        throw 'PG17_HARNESS_RELEASE_STAMP_SUBSTITUTION_GUARD_FAILED'
      }
      Invoke-PsqlText $databaseName $approved
    } else {
      Invoke-PsqlFile $databaseName $path
    }
    $entryCount++
    if ($relative -match 'SECURE-READ-CONTRACTS') { $sawSecureRead = $true }
    if ($relative -match 'SECURE-DRAFT-MUTATIONS') {
      if (-not $sawSecureRead) { throw 'PG17_HARNESS_SECURE_DRAFT_ORDER_INVALID' }
      $sawSecureDraft = $true
    }
  }
  if ($entryCount -ne 28 -or -not $sawSecureRead -or -not $sawSecureDraft) {
    throw "PG17_HARNESS_APPLY_ORDER_INVALID_ENTRIES_$entryCount"
  }

  Invoke-PsqlFile $databaseName (Join-Path $rpcMatrix '30-pre-activation-assert.sql')
  Invoke-PsqlFile $databaseName (Join-Path $rpcMatrix '35-activate-workflows-local-only.sql')
  Invoke-PsqlFile $databaseName (Join-Path $integrated '10-e2e-helpers.sql')
  Invoke-PsqlFile $databaseName (Join-Path $integrated '20-position-assignment-fixtures.sql')
  Invoke-PsqlFile $databaseName (Join-Path $integrated '40-lifecycle-five-services.sql')
  Invoke-PsqlFile $databaseName (Join-Path $integrated '45-authz-negatives.sql')
  Invoke-PsqlFile $databaseName (Join-Path $PSScriptRoot 'DEPARTMENT-TRANSFER-DIRECT-MATRIX.sql')
  Invoke-PsqlFile $databaseName (Join-Path $integrated '50-draft-and-read-matrix.sql')
  Invoke-PsqlFile $databaseName (Join-Path $integrated '55-attachments-stub.sql')
  Invoke-PsqlFile $databaseName (Join-Path $integrated '60-enrollment-certificate-regression.sql')
  Invoke-PsqlFile $databaseName (Join-Path $integrated '70-summarize.sql')

  $failCount = (& psql -X -At -v ON_ERROR_STOP=1 -d $databaseName -c "select count(*) from b1_e2e.results where status='FAIL';").Trim()
  $completed = (& psql -X -At -v ON_ERROR_STOP=1 -d $databaseName -c 'select services_completed from b1_e2e.summary limit 1;').Trim()
  $matrixCases = (& psql -X -At -v ON_ERROR_STOP=1 -d $databaseName -c "select count(*) from b1_e2e.results where case_id like 'department_transfer/direct_rpc/%';").Trim()
  Write-Output "PG_VERSION=$version"
  Write-Output "NAMESPACE=TEST_ONLY_DEPARTMENT_TRANSFER_10A1"
  Write-Output "APPLY_ORDER_ENTRIES=$entryCount"
  Write-Output "DEPARTMENT_TRANSFER_DIRECT_RPC_CASES=$matrixCases"
  Write-Output "FAIL_COUNT=$failCount"
  Write-Output "SERVICES_COMPLETED=$completed"
  if ([int]$failCount -ne 0) { throw 'PG17_HARNESS_FAIL_ROWS_PRESENT' }
  if ([int]$completed -ne 5) { throw "PG17_HARNESS_SERVICES_COMPLETED_$completed_OF_5" }
  Write-Output 'DEPARTMENT_TRANSFER_10A1_PG17_HARNESS_PASS'
}
finally {
  if ($created) {
    & psql -X -v ON_ERROR_STOP=1 -d $MaintenanceDatabase -c "DROP DATABASE IF EXISTS $databaseName"
    if ($LASTEXITCODE -ne 0) { Write-Error "PG17_HARNESS_CLEANUP_FAILED=$databaseName" }
    else { Write-Output "CLEANUP_DATABASE=$databaseName" }
  }
}
