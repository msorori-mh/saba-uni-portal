#Requires -Version 5.1
<#
.SYNOPSIS
  Operator-side single-writer mutex for production mutation sequencing.

.DESCRIPTION
  Atomic local directory lease. Stale locks are NEVER auto-deleted.
  Destructive force-unlock is forbidden. Read-only agents do not need a lease.
  Release is allowed only by the owning session after a terminal state.

.NOTES
  AUTHORIZATION source for production writes remains:
  EXPLICIT_OWNER_RUNTIME_GRANT_REQUIRED
  A repo file, report, prompt, branch, commit, agent assertion, or historical
  owner grant MUST NOT authorize a future write.
#>

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$script:DefaultLeaseRoot = "C:\projects\saba-production-write-lease"

function Get-ProductionWriteLeaseRoot {
  param([string]$LeaseRoot = $script:DefaultLeaseRoot)
  return $LeaseRoot
}

function Get-ProductionWriteLeaseMetadataPath {
  param([string]$LeaseRoot = $script:DefaultLeaseRoot)
  return (Join-Path $LeaseRoot "lease.json")
}

function Read-ProductionWriteLeaseMetadata {
  param([string]$LeaseRoot = $script:DefaultLeaseRoot)
  $metaPath = Get-ProductionWriteLeaseMetadataPath -LeaseRoot $LeaseRoot
  if (-not (Test-Path -LiteralPath $metaPath)) {
    return $null
  }
  return (Get-Content -LiteralPath $metaPath -Raw -Encoding utf8 | ConvertFrom-Json)
}

function Acquire-ProductionWriteLease {
  [CmdletBinding()]
  param(
    [Parameter(Mandatory = $true)][string]$Session,
    [Parameter(Mandatory = $true)][string]$Mission,
    [Parameter(Mandatory = $true)][string]$LogicalStep,
    [Parameter(Mandatory = $true)][string]$SourceSha,
    [string]$LeaseRoot = $script:DefaultLeaseRoot,
    [switch]$ReadOnly
  )

  if ($ReadOnly) {
    return [pscustomobject]@{
      status     = "READ_ONLY_BYPASS"
      lease_root = $LeaseRoot
      held       = $false
    }
  }

  if ([string]::IsNullOrWhiteSpace($Session)) {
    throw "HOLD: production-write lease requires non-empty Session"
  }
  if ([string]::IsNullOrWhiteSpace($Mission)) {
    throw "HOLD: production-write lease requires non-empty Mission"
  }
  if ([string]::IsNullOrWhiteSpace($LogicalStep)) {
    throw "HOLD: production-write lease requires non-empty LogicalStep"
  }
  if ([string]::IsNullOrWhiteSpace($SourceSha)) {
    throw "HOLD: production-write lease requires non-empty SourceSha"
  }

  $parent = Split-Path -Parent $LeaseRoot
  if ($parent -and -not (Test-Path -LiteralPath $parent)) {
    New-Item -ItemType Directory -Path $parent -Force | Out-Null
  }

  # Atomic create: fails if directory already exists.
  try {
    New-Item -ItemType Directory -Path $LeaseRoot -ErrorAction Stop | Out-Null
  }
  catch {
    $existing = Read-ProductionWriteLeaseMetadata -LeaseRoot $LeaseRoot
    $holder = if ($null -ne $existing) { $existing.session } else { "UNKNOWN" }
    $step = if ($null -ne $existing) { $existing.logical_step } else { "UNKNOWN" }
    $started = if ($null -ne $existing) { $existing.started_at } else { "UNKNOWN" }
    throw ("HOLD: production-write lease already held by session={0} logical_step={1} started_at={2}. Stale locks are never auto-deleted." -f $holder, $step, $started)
  }

  $startedAt = [DateTime]::UtcNow.ToString("o")
  $metadata = [ordered]@{
    session      = $Session
    mission      = $Mission
    logical_step = $LogicalStep
    source_sha   = $SourceSha
    started_at   = $startedAt
  }
  $metaPath = Get-ProductionWriteLeaseMetadataPath -LeaseRoot $LeaseRoot
  ($metadata | ConvertTo-Json -Depth 5) | Set-Content -LiteralPath $metaPath -Encoding utf8 -NoNewline

  return [pscustomobject]@{
    status       = "ACQUIRED"
    lease_root   = $LeaseRoot
    held         = $true
    session      = $Session
    mission      = $Mission
    logical_step = $LogicalStep
    source_sha   = $SourceSha
    started_at   = $startedAt
  }
}

function Release-ProductionWriteLease {
  [CmdletBinding()]
  param(
    [Parameter(Mandatory = $true)][string]$Session,
    [Parameter(Mandatory = $true)][ValidateSet("PASS", "HOLD", "ABORT", "STOP")][string]$TerminalState,
    [string]$LeaseRoot = $script:DefaultLeaseRoot
  )

  if (-not (Test-Path -LiteralPath $LeaseRoot)) {
    throw "HOLD: production-write lease is not held; nothing to release"
  }

  $existing = Read-ProductionWriteLeaseMetadata -LeaseRoot $LeaseRoot
  if ($null -eq $existing) {
    throw "HOLD: production-write lease metadata missing; refuse release without owner proof"
  }
  if ($existing.session -ne $Session) {
    throw ("HOLD: wrong owner release refused. holder={0} requester={1}" -f $existing.session, $Session)
  }

  $metaPath = Get-ProductionWriteLeaseMetadataPath -LeaseRoot $LeaseRoot
  if (Test-Path -LiteralPath $metaPath) {
    Remove-Item -LiteralPath $metaPath -Force
  }
  Remove-Item -LiteralPath $LeaseRoot -Force -Recurse

  return [pscustomobject]@{
    status         = "RELEASED"
    terminal_state = $TerminalState
    session        = $Session
    held           = $false
  }
}

function Assert-NoForceUnlockProductionWriteLease {
  param([string]$RequestedAction)
  if ($RequestedAction -match "(?i)force.?unlock|break.?lock|steal.?lock|delete.?stale|auto.?clear") {
    throw "HOLD: destructive force unlock of production-write lease is forbidden"
  }
}

# Dot-source this script from operator packets and tests.
# Functions are defined in the caller's scope when dot-sourced.
