param([string]$Image = "postgres:17-alpine")
# SEQ08 local package harness: B0 + SEQ07-B + SEQ08 only. Stops before SEQ09.
& (Join-Path $PSScriptRoot "..\b1-first-delivery-sequential-chain\run-chain.ps1") `
  -Image $Image -StopAfterOrder 8
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
Write-Output "PASS_B1_SEQ08_LOCAL_HARNESS"
