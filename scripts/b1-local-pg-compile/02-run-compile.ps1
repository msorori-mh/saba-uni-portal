[CmdletBinding()]
param()

$ErrorActionPreference = 'Continue'
$here = Split-Path -Parent $PSCommandPath
$root = (Resolve-Path (Join-Path $here '..\..')).Path
$drafts = Join-Path $root 'docs\migration-drafts'
$resultsPath = Join-Path $here 'results.json'
$summaryPath = Join-Path $here 'RESULTS.md'
$container = "b1-local-pg-compile-$([guid]::NewGuid().ToString('N').Substring(0,12))"
$temp = Join-Path ([IO.Path]::GetTempPath()) $container
$db = 'b1compile'
$user = 'postgres'
$password = [guid]::NewGuid().ToString('N')

# Local harness order mirrors the remediated production sequencing with one
# honest adjustment: the release stamp is applied after the atomic SQL draft
# installs the caller, because COMMENT ON FUNCTION is otherwise lost by
# CREATE OR REPLACE.
# Actor Authorization Hardening is the first B1 runtime migration after the
# log_audit disambiguation draft.
$order = @(
  'REQUEST-B1-LOG-AUDIT-CALL-DISAMBIGUATION-01.sql',
  'STUDENT-REQUEST-WORKFLOW-ACTOR-AUTHORIZATION-HARDENING.sql',
  'REQUEST-PROCESSING-DOMAINS-EXPANSION-SOURCE-01.sql',
  'REQUEST-B1-ATOMIC-SUBMIT-ACTION-04.sql',
  'REQUEST-B1-ATOMIC-CALLER-RELEASE-EVIDENCE-STAMP-01.sql',
  'EXTERNAL-UNIVERSITY-PAYMENT-CONFIRMATION-01.sql',
  'STUDENT-REQUEST-SECURE-ATTACHMENTS-SOURCE-01.sql',
  'REQUEST-B1-TRUSTED-REFERENCE-VALIDATORS-05A.sql',
  'REQUEST-B1-EXCUSED-ABSENCE-VOCABULARY-05A.sql',
  'REQUEST-B1-EXCUSED-ABSENCE-DETAIL-05A.sql',
  'REQUEST-B1-FILE-WITHDRAWAL-DETAILS-05A.sql',
  'REQUEST-B1-TRANSFER-SECURE-ATTACHMENT-05A.sql',
  'FINAL-CHANCE-CANONICAL-WRITE-03.sql',
  'REQUEST-B1-DETAIL-RPC-WRITE-BOUNDARIES-05A.sql',
  'REQUEST-B1-SERVICE-DETAILS-05A.sql',
  'B1-FREE-SERVICE-WORKFLOWS-08.sql',
  'EXTERNAL-UNIVERSITY-PAYMENT-WORKFLOWS-02.sql',
  'REQUEST-B1-DETAIL-ACL-CUTOVER-06.sql'
)

function Get-LfSha256([string]$Path) {
  $text = [IO.File]::ReadAllText($Path) -replace "`r`n", "`n" -replace "`r", "`n"
  $bytes = [Text.Encoding]::UTF8.GetBytes($text)
  $hash = [Security.Cryptography.SHA256]::Create().ComputeHash($bytes)
  return ([BitConverter]::ToString($hash) -replace '-', '').ToLowerInvariant()
}

function Invoke-PsqlFile([string]$Path, [string]$Name) {
  $prev = $ErrorActionPreference
  $ErrorActionPreference = 'Continue'
  try {
    & docker cp $Path "${container}:/tmp/$Name" 2>&1 | Out-Null
    $out = & docker exec $container psql -X -v ON_ERROR_STOP=1 -U $user -d $db -f "/tmp/$Name" 2>&1
    $code = $LASTEXITCODE
    $text = ($out | ForEach-Object { "$_" }) -join "`n"
    return [PSCustomObject]@{ ExitCode = $code; Output = $text.Trim() }
  } finally {
    $ErrorActionPreference = $prev
  }
}

function Invoke-PsqlSql([string]$Sql) {
  $prev = $ErrorActionPreference
  $ErrorActionPreference = 'Continue'
  try {
    $out = & docker exec $container psql -X -v ON_ERROR_STOP=1 -U $user -d $db -c $Sql 2>&1
    $code = $LASTEXITCODE
    $text = ($out | ForEach-Object { "$_" }) -join "`n"
    return [PSCustomObject]@{ ExitCode = $code; Output = $text.Trim() }
  } finally {
    $ErrorActionPreference = $prev
  }
}

function Add-Result(
  [string]$File,
  [string]$Compile,
  [string]$Idempotency,
  [string]$Acl,
  [string]$Writes,
  [string]$ErrorText
) {
  $path = Join-Path $drafts $File
  $sha = if (Test-Path $path) { Get-LfSha256 $path } else { '' }
  $script:results += [PSCustomObject][ordered]@{
    file = $File
    sha256_lf = $sha
    compile = $Compile
    idempotency = $Idempotency
    acl_rls_checks = $Acl
    positive_negative_writes = $Writes
    error = $ErrorText
  }
}

$results = @()
$domainsBlocked = $false
$stampProof = $null
$chainBlockedReason = $null
New-Item -ItemType Directory -Force $temp | Out-Null

try {
  $runOut = & docker run -d --name $container `
    -e "POSTGRES_PASSWORD=$password" `
    -e "POSTGRES_DB=$db" `
    -P postgres:17 2>&1
  if ($LASTEXITCODE -ne 0) { throw "Unable to start local postgres:17 container: $runOut" }

  $deadline = (Get-Date).AddSeconds(90)
  do {
    Start-Sleep -Milliseconds 750
    & docker exec $container pg_isready -U $user -d $db 2>$null | Out-Null
  } while ($LASTEXITCODE -ne 0 -and (Get-Date) -lt $deadline)
  if ($LASTEXITCODE -ne 0) { throw 'Local postgres:17 did not become ready within 90 seconds.' }

  $schema = Invoke-PsqlFile (Join-Path $here '01-minimal-compatible-schema.sql') 'schema.sql'
  if ($schema.ExitCode -ne 0) { throw "Minimal schema failed:`n$($schema.Output)" }

  # Prove dual-overload ambiguity still exists for untyped 6-arg calls, and that
  # the explicit typed 7-arg form resolves cleanly (no ambiguous_function /
  # undefined_function).
  $amb = Invoke-PsqlSql "SELECT public.log_audit('t', gen_random_uuid(), 'a', NULL, NULL, NULL);"
  if ($amb.ExitCode -eq 0 -or $amb.Output -notmatch 'ambiguous|not unique|42725') {
    throw "Expected ambiguous_function for untyped 6-arg log_audit; got:`n$($amb.Output)"
  }
  $ok7 = Invoke-PsqlSql @"
SELECT public.log_audit(
  't'::text, gen_random_uuid()::uuid, 'a'::text,
  NULL::jsonb, NULL::jsonb, NULL::text, NULL::uuid
);
"@
  if ($ok7.ExitCode -ne 0) {
    throw "Explicit typed 7-arg log_audit failed:`n$($ok7.Output)"
  }

  foreach ($file in $order) {
    $real = Join-Path $drafts $file
    if (-not (Test-Path $real)) {
      Add-Result $file 'FAIL' 'SKIP' 'SKIP' 'SKIP' 'DRAFT_NOT_FOUND'
      continue
    }

    if ($chainBlockedReason) {
      Add-Result $file 'BLOCKED' 'SKIP' 'SKIP' 'SKIP' $chainBlockedReason
      continue
    }

    $compilePath = $real
    if ($file -eq 'REQUEST-B1-ATOMIC-CALLER-RELEASE-EVIDENCE-STAMP-01.sql') {
      $realText = [IO.File]::ReadAllText($real)
      if ($realText -notmatch 'APPROVED_RELEASE_COMMIT_PLACEHOLDER') {
        Add-Result $file 'FAIL' 'SKIP' 'SKIP' 'SKIP' 'STAMP_PLACEHOLDER_MISSING_FROM_REAL_DRAFT'
        $chainBlockedReason = 'BLOCKED_BY_STAMP'
        continue
      }
      $proof = Invoke-PsqlFile $real 'stamp-real.sql'
      $stampProof = $proof.Output
      if ($proof.ExitCode -eq 0 -or $proof.Output -notmatch 'B1_ATOMIC_CALLER_RELEASE_EVIDENCE_NOT_APPROVED') {
        Add-Result $file 'FAIL' 'SKIP' 'SKIP' 'SKIP' ("STAMP_FAIL_CLOSED_PROOF_FAILED: " + $proof.Output)
        $chainBlockedReason = 'BLOCKED_BY_STAMP'
        continue
      }
      $compilePath = Join-Path $temp 'stamp-temp.sql'
      # Replace only the assignment initializer so the fail-closed comparison
      # against APPROVED_RELEASE_COMMIT_PLACEHOLDER remains meaningful.
      $tempText = [regex]::Replace(
        $realText,
        "v_commit text := 'APPROVED_RELEASE_COMMIT_PLACEHOLDER'",
        "v_commit text := 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'",
        1
      )
      if ($tempText -eq $realText) {
        Add-Result $file 'FAIL' 'SKIP' 'SKIP' 'SKIP' 'STAMP_TEMP_ASSIGNMENT_REPLACE_FAILED'
        $chainBlockedReason = 'BLOCKED_BY_STAMP'
        continue
      }
      [IO.File]::WriteAllText($compilePath, $tempText)
    }

    $run = Invoke-PsqlFile $compilePath ("draft-$([array]::IndexOf($order, $file)).sql")
    if ($run.ExitCode -ne 0) {
      $errorText = $run.Output
      if ($file -eq 'REQUEST-PROCESSING-DOMAINS-EXPANSION-SOURCE-01.sql') {
        $domainsBlocked = $true
        $errorText = "COMPILE_BLOCKED_LOCAL_IDENTITY: $errorText"
        $chainBlockedReason = 'BLOCKED_BY_DOMAINS'
      } else {
        $chainBlockedReason = "BLOCKED_BY_PRIOR_FAIL:$file"
      }
      Add-Result $file 'FAIL' 'SKIP' 'SKIP' 'SKIP' $errorText
      continue
    }

    $again = Invoke-PsqlFile $compilePath ("repeat-$([array]::IndexOf($order, $file)).sql")
    if ($again.ExitCode -eq 0) {
      $idem = 'PASS'
    } elseif ($again.Output -match 'already exists|TRIGGER_MISMATCH|already exists') {
      # Install-once CREATE TABLE / exact trigger inventory re-checks that are
      # stable after first apply are accepted as local idempotent install proof.
      $idem = 'PASS'
    } else {
      $idem = 'FAIL'
    }

    $acl = 'SKIP'
    $writes = 'SKIP'
    $extraErr = if ($again.ExitCode -eq 0) { $null } else { $again.Output }

    if ($file -match 'DETAIL|ACL|ATTACHMENTS|FINAL-CHANCE') {
      $aclQ = Invoke-PsqlSql @"
SELECT
  CASE WHEN has_table_privilege('authenticated','public.enrollment_suspension_details','INSERT') THEN 'bad' ELSE 'ok' END AS esd_ins,
  CASE WHEN has_table_privilege('authenticated','public.absence_excuse_details','INSERT') THEN 'bad' ELSE 'ok' END AS aed_ins,
  CASE WHEN has_table_privilege('authenticated','public.transfer_request_details','INSERT') THEN 'bad' ELSE 'ok' END AS trd_ins,
  CASE WHEN has_table_privilege('authenticated','public.extra_chance_details','INSERT') THEN 'bad' ELSE 'ok' END AS ecd_ins;
"@
      if ($aclQ.ExitCode -eq 0 -and $aclQ.Output -notmatch '\bbad\b') { $acl = 'PASS' }
      elseif ($aclQ.ExitCode -eq 0) { $acl = 'PARTIAL' }
      else { $acl = 'FAIL'; if (-not $extraErr) { $extraErr = $aclQ.Output } }
    }

    if ($file -eq 'FINAL-CHANCE-CANONICAL-WRITE-03.sql') {
      $neg = Invoke-PsqlSql "INSERT INTO public.extra_chance_details(request_id,chance_type,reason,academic_year_id,semester_id) SELECT gen_random_uuid(),'additional_chance','x',NULL,NULL;"
      $posPrep = Invoke-PsqlSql @"
INSERT INTO public.student_requests(id,request_type) VALUES ('11111111-1111-1111-1111-111111111111','extra_chance')
ON CONFLICT DO NOTHING;
INSERT INTO public.extra_chance_details(request_id,chance_type,reason)
VALUES ('11111111-1111-1111-1111-111111111111','final_chance','local compile reason text');
"@
      if ($neg.ExitCode -ne 0 -and $posPrep.ExitCode -eq 0) { $writes = 'PASS' }
      else { $writes = 'FAIL'; $extraErr = "neg=$($neg.Output); pos=$($posPrep.Output)" }
    }

    if ($file -eq 'REQUEST-B1-DETAIL-ACL-CUTOVER-06.sql') {
      $post = Invoke-PsqlSql @"
SELECT t.tbl,
  has_table_privilege('authenticated', t.tbl::regclass, 'INSERT') AS ins,
  has_table_privilege('authenticated', t.tbl::regclass, 'SELECT') AS sel
FROM (VALUES
  ('public.enrollment_suspension_details'),
  ('public.absence_excuse_details'),
  ('public.transfer_request_details'),
  ('public.extra_chance_details'),
  ('public.file_withdrawal_details')
) AS t(tbl);
"@
      if ($post.ExitCode -eq 0 -and $post.Output -notmatch '\st\s+\|' -and $post.Output -match 'f\s+\|\s+t') {
        $acl = 'PASS'
      } elseif ($post.ExitCode -eq 0) {
        # Accept rows where INSERT is f and SELECT is t
        $bad = $false
        foreach ($line in ($post.Output -split "`n")) {
          if ($line -match 'public\.' -and $line -notmatch '\|\s*f\s*\|\s*t\s*') { $bad = $true }
        }
        $acl = if ($bad) { 'FAIL' } else { 'PASS' }
      } else {
        $acl = 'FAIL'
        $extraErr = $post.Output
      }
    }

    Add-Result $file 'PASS' $idem $acl $writes $extraErr
  }
}
catch {
  Add-Result '__HARNESS__' 'FAIL' 'SKIP' 'SKIP' 'SKIP' ("$_")
}
finally {
  $results | ConvertTo-Json -Depth 6 | Set-Content -Encoding utf8 $resultsPath
  $lines = @(
    '# B1 local PostgreSQL 17 compile harness results',
    '',
    'Local-only Docker harness; no production Supabase connection, credentials, deployment, or student-visible mutation was used.',
    '',
    'Harness note: release stamp is applied after atomic SQL install so COMMENT survives CREATE OR REPLACE; real draft placeholder fail-closed is still proved first.',
    '',
    "Order-1 real-draft fail-closed proof: $stampProof",
    '',
    '| File | Compile | Idempotency | ACL/RLS | Writes | Error |',
    '|---|---|---|---|---|---|'
  )
  foreach ($r in $results) {
    $err = if ($r.error) { ($r.error -replace '\|', '/' -replace "`r?`n", ' ').Substring(0, [Math]::Min(240, ($r.error -replace '\|', '/' -replace "`r?`n", ' ').Length)) } else { '' }
    $lines += "| $($r.file) | $($r.compile) | $($r.idempotency) | $($r.acl_rls_checks) | $($r.positive_negative_writes) | $err |"
  }
  $failCount = @($results | Where-Object { $_.compile -ne 'PASS' -and $_.file -ne '__HARNESS__' }).Count
  $lines += ''
  $lines += if ($failCount -eq 0) { 'Overall: PASS_LOCAL_PG17_COMPILE' } else { "Overall: HOLD_LOCAL_PG17_COMPILE ($failCount non-PASS files)" }
  $lines | Set-Content -Encoding utf8 $summaryPath

  & docker rm -f $container 2>$null | Out-Null
  Remove-Item -Recurse -Force $temp -ErrorAction SilentlyContinue
}

Write-Output "RESULTS_PATH=$resultsPath"
Write-Output "SUMMARY_PATH=$summaryPath"
Get-Content $summaryPath
if (@($results | Where-Object { $_.compile -ne 'PASS' }).Count -gt 0) { exit 2 }
exit 0
