param(
  [switch]$SkipUi,
  [switch]$SkipFullTests,
  [switch]$SkipBuild
)

# Full local mission runner for PORTAL-FIRST-DELIVERY-FIVE-STUDENT-SERVICES-LOCAL-OPERATIONAL-E2E-01
$ErrorActionPreference = "Stop"
$repo = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
$artifactDir = Join-Path $repo ".tmp\b1-operational-e2e"
New-Item -ItemType Directory -Force -Path $artifactDir | Out-Null
$log = Join-Path $artifactDir "mission-run.log"
"" | Set-Content -LiteralPath $log -Encoding utf8

function Write-Step([string]$Name) {
  $line = "$(Get-Date -Format o) STEP=$Name"
  Write-Output $line
  Add-Content -LiteralPath $log -Value $line
}

function Invoke-Step([string]$Name, [scriptblock]$Block) {
  Write-Step $Name
  & $Block
  if ($LASTEXITCODE -ne 0 -and $null -ne $LASTEXITCODE) {
    throw "STEP_FAILED=$Name exit=$LASTEXITCODE"
  }
  Add-Content -LiteralPath $log -Value "OK=$Name"
}

Set-Location $repo

Invoke-Step "operational_e2e_harness" {
  powershell -NoProfile -ExecutionPolicy Bypass -File (Join-Path $PSScriptRoot "run-harness.ps1")
}

Invoke-Step "auth_matrix_24_528" {
  powershell -NoProfile -ExecutionPolicy Bypass -File (
    Join-Path $repo "tests\b1-five-services-authorization\run-full-matrix.ps1"
  ) | Tee-Object -FilePath (Join-Path $artifactDir "auth-matrix.txt")
}

Invoke-Step "secure_read_25" {
  powershell -NoProfile -ExecutionPolicy Bypass -File (
    Join-Path $repo "tests\b1-secure-read\pg\run-harness.ps1"
  ) | Tee-Object -FilePath (Join-Path $artifactDir "secure-read.txt")
}

Invoke-Step "secure_draft_35" {
  powershell -NoProfile -ExecutionPolicy Bypass -File (
    Join-Path $repo "tests\b1-secure-draft\pg\run-harness.ps1"
  ) | Tee-Object -FilePath (Join-Path $artifactDir "secure-draft.txt")
}

Invoke-Step "bun_student_requests" {
  bun test tests/student-requests tests/b1-operational-e2e 2>&1 |
    Tee-Object -FilePath (Join-Path $artifactDir "bun-student-requests.txt")
}

if (-not $SkipFullTests) {
  Invoke-Step "bun_full_tests" {
    bun test tests 2>&1 | Tee-Object -FilePath (Join-Path $artifactDir "bun-full-tests.txt")
  }
}

Invoke-Step "tsc" {
  bunx tsc --noEmit 2>&1 | Tee-Object -FilePath (Join-Path $artifactDir "tsc.txt")
}

if (-not $SkipBuild) {
  Invoke-Step "build" {
    bun run build 2>&1 | Tee-Object -FilePath (Join-Path $artifactDir "build.txt")
  }
}

if (-not $SkipUi) {
  Invoke-Step "real_app_http_smoke" {
    bun tests/student-requests/b1-real-app-browser-smoke/run.ts 2>&1 |
      Tee-Object -FilePath (Join-Path $artifactDir "real-app-smoke.txt")
  }
}

Invoke-Step "git_diff_check" {
  git diff --check
}

Write-Output "PASS_MISSION_LOCAL_VERIFIERS"
Add-Content -LiteralPath $log -Value "PASS_MISSION_LOCAL_VERIFIERS"
