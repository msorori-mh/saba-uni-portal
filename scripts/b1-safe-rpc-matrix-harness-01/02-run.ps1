[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'
$here = Split-Path -Parent $PSCommandPath
$root = (Resolve-Path (Join-Path $here '..\..')).Path
$container = "b1-safe-rpc-matrix-$([guid]::NewGuid().ToString('N').Substring(0,12))"
$db = 'b1matrix'
$password = [guid]::NewGuid().ToString('N')

function Copy-LocalFile([string]$Path, [string]$Name) {
  & docker cp $Path "${container}:/tmp/$Name" | Out-Null
  if ($LASTEXITCODE -ne 0) { throw "docker cp failed: $Name" }
}

try {
  $run = & docker run -d --name $container -e "POSTGRES_PASSWORD=$password" -e "POSTGRES_DB=$db" -P postgres:17 2>&1
  if ($LASTEXITCODE -ne 0) { throw "LOCAL_POSTGRES_START_FAILED: $run" }
  $deadline = (Get-Date).AddSeconds(90)
  do {
    Start-Sleep -Milliseconds 500
    & docker exec $container pg_isready -U postgres -d $db 2>$null | Out-Null
  } while ($LASTEXITCODE -ne 0 -and (Get-Date) -lt $deadline)
  if ($LASTEXITCODE -ne 0) { throw 'LOCAL_POSTGRES_READY_TIMEOUT' }

  Copy-LocalFile (Join-Path $root 'scripts\b1-local-pg-compile\01-minimal-compatible-schema.sql') 'schema.sql'
  Copy-LocalFile (Join-Path $root 'docs\migration-drafts\STUDENT-REQUEST-WORKFLOW-ACTOR-AUTHORIZATION-HARDENING.sql') 'actor.sql'
  Copy-LocalFile (Join-Path $root 'docs\migration-drafts\B1-RUNTIME-PREDECESSOR-GUARD-REMEDIATION-01.sql') 'predecessor.sql'
  Copy-LocalFile (Join-Path $root 'docs\migration-drafts\EXTERNAL-UNIVERSITY-PAYMENT-CONFIRMATION-01.sql') 'payment.sql'
  Copy-LocalFile (Join-Path $root 'docs\migration-drafts\STUDENT-REQUEST-SECURE-ATTACHMENTS-SOURCE-01.sql') 'attachments.sql'
  Copy-LocalFile (Join-Path $root 'docs\migration-drafts\FINAL-CHANCE-CANONICAL-WRITE-03.sql') 'final-chance.sql'
  Copy-LocalFile (Join-Path $here '01-runtime-matrix.sql') 'matrix.sql'
  Copy-LocalFile (Join-Path $here '03-specialized-rpcs.sql') 'specialized.sql'
  $output = & docker exec $container psql -X -v ON_ERROR_STOP=1 -U postgres -d $db `
    -f /tmp/schema.sql -f /tmp/actor.sql -f /tmp/predecessor.sql -f /tmp/payment.sql -f /tmp/attachments.sql `
    -f /tmp/matrix.sql -f /tmp/specialized.sql 2>&1
  $matrixOutput = (($output | ForEach-Object { "$_" }) -join "`n")
  if ($LASTEXITCODE -ne 0) { throw $matrixOutput }
  $matrixOutput
  if ($matrixOutput -notmatch '"failed"\s*:\s*0') { exit 2 }
} finally {
  & docker rm -f $container 2>$null | Out-Null
}
