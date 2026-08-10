#Requires -Version 7
<#
.SYNOPSIS
  Disposable PG17 harness for the fixed D-02 department-chair sensor.
.DESCRIPTION
  Creates a temporary database, applies the minimal schema, runs the focused
  sensor tests, then drops the database. Never targets production.
#>
$ErrorActionPreference = 'Stop'

$pgHost = if ($env:PGHOST) { $env:PGHOST } else { 'localhost' }
$pgPort = if ($env:PGPORT) { $env:PGPORT } else { '5432' }
$pgUser = if ($env:PGUSER) { $env:PGUSER } else { 'postgres' }
$pgPass = if ($env:PGPASSWORD) { $env:PGPASSWORD } else { 'postgres' }
$dbName = "d02_chair_sensor_test_$(Get-Random -Maximum 999999)"

$env:PGPASSWORD = $pgPass

function Invoke-Psql {
  param([string]$Database, [string]$File)
  psql -h $pgHost -p $pgPort -U $pgUser -d $Database -v ON_ERROR_STOP=1 -f $File
  if ($LASTEXITCODE -ne 0) { throw "psql failed: $File" }
}

$root = Split-Path -Parent $PSScriptRoot
$schemaFile = Join-Path $root 'pg/10-minimal-schema.sql'
$testFile = Join-Path $root 'pg/20-d02-sensor-tests.sql'

try {
  psql -h $pgHost -p $pgPort -U $pgUser -d postgres -c "CREATE DATABASE \"$dbName\";" -v ON_ERROR_STOP=1
  Invoke-Psql -Database $dbName -File $schemaFile
  Invoke-Psql -Database $dbName -File $testFile
  Write-Host "PASS_B1_D02_CHAIR_SENSOR_SEMANTIC_01" -ForegroundColor Green
}
finally {
  psql -h $pgHost -p $pgPort -U $pgUser -d postgres -c "DROP DATABASE IF EXISTS \"$dbName\";" -v ON_ERROR_STOP=1 | Out-Null
}
