$ErrorActionPreference = 'Stop'
$name = "b1-pay-pred-guard-$PID"
$root = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path

function Invoke-Psql([string[]]$Files) {
  $args = @('-X', '-v', 'ON_ERROR_STOP=1', '-U', 'postgres')
  foreach ($f in $Files) { $args += @('-f', $f) }
  docker exec -w /repo $name psql @args
  if ($LASTEXITCODE -ne 0) { throw "PG17_FAILURE: $($Files -join ', ')" }
}

docker run --name $name --rm -d -e POSTGRES_PASSWORD=test -v "${root}:/repo" postgres:17 | Out-Null
try {
  for ($i = 0; $i -lt 40; $i++) {
    docker exec $name pg_isready -U postgres *> $null
    if ($LASTEXITCODE -eq 0) { break }
    Start-Sleep 1
  }
  if ($LASTEXITCODE -ne 0) { throw 'PG17_READY_TIMEOUT' }

  # 1) schema + baseline payment RPC
  Invoke-Psql @(
    'scripts/b1-confirm-payment-predecessor-guard-pg17/00-harness-schema.sql',
    'docs/migration-drafts/EXTERNAL-UNIVERSITY-PAYMENT-CONFIRMATION-01.sql'
  )

  # 2) preflight (baseline: guard absent)
  Invoke-Psql @('docs/migration-drafts/b1-backend-verifiers/19-B1_CONFIRM_PAYMENT_PREDECESSOR_GUARD_01-PREFLIGHT.sql')

  # 3) reproduce Codex bypass on unguarded function
  Invoke-Psql @('scripts/b1-confirm-payment-predecessor-guard-pg17/02-reproduce-bypass.sql')

  # 4) compile promoted migration + apply draft-equivalent body via promoted file
  Invoke-Psql @('supabase/migrations/20260725120000_b1_confirm_payment_predecessor_guard_01.sql')

  # 5) post-verifier
  Invoke-Psql @('docs/migration-drafts/b1-backend-verifiers/19-B1_CONFIRM_PAYMENT_PREDECESSOR_GUARD_01-POST-VERIFIER.sql')

  # 6) behavioral cases (both paid services)
  Invoke-Psql @('scripts/b1-confirm-payment-predecessor-guard-pg17/01-cases.sql')

  Write-Host 'PG17_CONFIRM_PAYMENT_PREDECESSOR_GUARD_PASS'
}
finally {
  docker stop $name *> $null
}
