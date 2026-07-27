param([string]$Image = "postgres:17-alpine")

$ErrorActionPreference = "Stop"
$repo = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
$migRel = "supabase\migrations\20260725110300_b1_10_excused_absence_detail_05a.sql"
$preRel = "docs\migration-drafts\b1-backend-verifiers\10-B1_10_EXCUSED_ABSENCE_DETAIL_05A-PREFLIGHT.sql"
$postRel = "docs\migration-drafts\b1-backend-verifiers\10-B1_10_EXCUSED_ABSENCE_DETAIL_05A-POST-VERIFIER.sql"
$schemaRel = "tests\b1-seq10-sandbox-exec-acl\pg\10-minimal-schema.sql"
$expectedSha = "ff61ae4a400b2b7d9dfbbec03212d04032103d5343f54a4ad42e274cbb9ab505"
$results = New-Object System.Collections.Generic.List[string]

function Get-LfSha256([string]$Path) {
  $bytes = [IO.File]::ReadAllBytes($Path)
  $norm = New-Object System.Collections.Generic.List[byte]
  foreach ($b in $bytes) { if ($b -ne 13) { [void]$norm.Add($b) } }
  return [BitConverter]::ToString(
    [Security.Cryptography.SHA256]::Create().ComputeHash($norm.ToArray())
  ).Replace("-", "").ToLower()
}

function New-Pg([string]$Suffix) {
  $name = "b1-seq10-acl-$Suffix-$([guid]::NewGuid().ToString('N').Substring(0,8))"
  $db = "b1_seq10_acl"
  docker run --rm --detach --name $name -e POSTGRES_PASSWORD=local_only -e POSTGRES_DB=$db $Image | Out-Null
  $ready = $false
  for ($i = 0; $i -lt 40; $i++) {
    $prev = $ErrorActionPreference; $ErrorActionPreference = "Continue"
    $logs = docker logs $name 2>&1
    $ErrorActionPreference = $prev
    docker exec $name pg_isready -U postgres -d $db *> $null
    if ($LASTEXITCODE -eq 0 -and ($logs -join "`n") -match "PostgreSQL init process complete") {
      $ready = $true
      break
    }
    Start-Sleep -Milliseconds 500
  }
  if (-not $ready) { throw "PostgreSQL not ready ($name)" }
  return @{ Name = $name; Database = $db }
}

function Stop-Pg($pg) {
  if ($null -ne $pg) { docker stop $pg.Name *> $null }
}

function Invoke-PsqlFile($pg, [string]$Path) {
  Get-Content -LiteralPath $Path -Raw |
    docker exec -i $pg.Name psql -X -v ON_ERROR_STOP=1 -U postgres -d $pg.Database | Out-Null
  if ($LASTEXITCODE -ne 0) { throw "psql failed: $Path" }
}

function Invoke-PsqlText($pg, [string]$Sql) {
  $Sql | docker exec -i $pg.Name psql -X -v ON_ERROR_STOP=1 -U postgres -d $pg.Database | Out-Null
  if ($LASTEXITCODE -ne 0) { throw "psql text failed" }
}

function Invoke-PsqlTextSoft($pg, [string]$Sql) {
  $prev = $ErrorActionPreference; $ErrorActionPreference = "Continue"
  $Sql | docker exec -i $pg.Name psql -X -v ON_ERROR_STOP=1 -U postgres -d $pg.Database 2>&1 | Out-Null
  $code = $LASTEXITCODE
  $ErrorActionPreference = $prev
  return $code
}

function Assert-FinalAcl($pg) {
  $q = @"
SELECT
  has_table_privilege('authenticated','public.absence_excuse_details','SELECT')
  AND NOT has_table_privilege('authenticated','public.absence_excuse_details','INSERT')
  AND has_table_privilege('service_role','public.absence_excuse_details','SELECT')
  AND NOT has_table_privilege('service_role','public.absence_excuse_details','INSERT')
  AND (
    NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='sandbox_exec')
    OR NOT EXISTS (
      SELECT 1 FROM pg_class c
      CROSS JOIN LATERAL aclexplode(COALESCE(c.relacl, acldefault('r', c.relowner))) x
      JOIN pg_roles r ON r.oid=x.grantee
      WHERE c.oid='public.absence_excuse_details'::regclass AND r.rolname='sandbox_exec'
    )
  )
  AND (SELECT count(*) FROM pg_policies WHERE schemaname='public' AND tablename='absence_excuse_details')=1;
"@
  $ok = (docker exec $pg.Name psql -X -At -U postgres -d $pg.Database -c $q).Trim()
  if ($ok -ne "t") { throw "final ACL/policy contract failed: $ok" }
}

$migAbs = Join-Path $repo $migRel
$sha = Get-LfSha256 $migAbs
if ($sha -ne $expectedSha) { throw "SEQ10 migration SHA mismatch: $sha" }
Write-Output "SEQ10_SHA=$sha"

# ---- A: sandbox_exec present with SELECT+INSERT ----
$pgA = $null
try {
  Write-Output "PHASE=A_sandbox_exec_present"
  $pgA = New-Pg "a"
  Invoke-PsqlFile $pgA (Join-Path $repo $schemaRel)
  Invoke-PsqlText $pgA @"
DO `$r$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'sandbox_exec') THEN
    CREATE ROLE sandbox_exec NOLOGIN;
  END IF;
END
`$r$;
GRANT SELECT, INSERT ON TABLE public.absence_excuse_details TO sandbox_exec;
"@
  Invoke-PsqlFile $pgA (Join-Path $repo $preRel)
  Invoke-PsqlFile $pgA $migAbs
  Invoke-PsqlFile $pgA (Join-Path $repo $postRel)
  Assert-FinalAcl $pgA
  $priv = (docker exec $pgA.Name psql -X -At -U postgres -d $pgA.Database -c @"
SELECT COUNT(*) FROM pg_class c
CROSS JOIN LATERAL aclexplode(COALESCE(c.relacl, acldefault('r', c.relowner))) x
JOIN pg_roles r ON r.oid=x.grantee
WHERE c.oid='public.absence_excuse_details'::regclass AND r.rolname='sandbox_exec';
"@).Trim()
  if ($priv -ne "0") { throw "sandbox_exec still privileged: $priv" }
  $results.Add("A=PASS")
  Write-Output "A=PASS"
} finally {
  Stop-Pg $pgA
}

# ---- B: sandbox_exec role absent ----
$pgB = $null
try {
  Write-Output "PHASE=B_sandbox_exec_absent"
  $pgB = New-Pg "b"
  Invoke-PsqlFile $pgB (Join-Path $repo $schemaRel)
  Invoke-PsqlText $pgB "DROP ROLE IF EXISTS sandbox_exec;"
  Invoke-PsqlFile $pgB (Join-Path $repo $preRel)
  Invoke-PsqlFile $pgB $migAbs
  Invoke-PsqlFile $pgB (Join-Path $repo $postRel)
  Assert-FinalAcl $pgB
  $results.Add("B=PASS")
  Write-Output "B=PASS"
} finally {
  Stop-Pg $pgB
}

# ---- C: unknown grantee fail-closed ----
$pgC = $null
try {
  Write-Output "PHASE=C_unknown_grantee"
  $pgC = New-Pg "c"
  Invoke-PsqlFile $pgC (Join-Path $repo $schemaRel)
  Invoke-PsqlText $pgC @"
DO `$r$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'rogue_reader') THEN
    CREATE ROLE rogue_reader NOLOGIN;
  END IF;
END
`$r$;
GRANT SELECT ON TABLE public.absence_excuse_details TO rogue_reader;
"@
  $preSql = Get-Content -LiteralPath (Join-Path $repo $preRel) -Raw
  $preCode = Invoke-PsqlTextSoft $pgC $preSql
  if ($preCode -eq 0) { throw "preflight unexpectedly passed with rogue_reader" }
  # Migration itself must also fail-closed if preflight were skipped.
  Invoke-PsqlText $pgC @"
REVOKE ALL ON TABLE public.absence_excuse_details FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON TABLE public.absence_excuse_details TO authenticated, service_role;
GRANT SELECT ON TABLE public.absence_excuse_details TO rogue_reader;
"@
  $migSql = Get-Content -LiteralPath $migAbs -Raw
  $migCode = Invoke-PsqlTextSoft $pgC $migSql
  if ($migCode -eq 0) { throw "migration unexpectedly passed with rogue_reader" }
  $results.Add("C=PASS")
  Write-Output "C=PASS"
} finally {
  Stop-Pg $pgC
}

# ---- D: second apply idempotency ----
$pgD = $null
try {
  Write-Output "PHASE=D_second_apply"
  $pgD = New-Pg "d"
  Invoke-PsqlFile $pgD (Join-Path $repo $schemaRel)
  Invoke-PsqlText $pgD @"
DO `$r$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'sandbox_exec') THEN
    CREATE ROLE sandbox_exec NOLOGIN;
  END IF;
END
`$r$;
GRANT SELECT, INSERT ON TABLE public.absence_excuse_details TO sandbox_exec;
"@
  Invoke-PsqlFile $pgD $migAbs
  Invoke-PsqlFile $pgD $migAbs
  Invoke-PsqlFile $pgD (Join-Path $repo $postRel)
  Assert-FinalAcl $pgD
  $results.Add("D=PASS")
  Write-Output "D=PASS"
} finally {
  Stop-Pg $pgD
}

Write-Output ("RESULTS=" + ($results -join ";"))
Write-Output "PASS_B1_SEQ10_SANDBOX_EXEC_ACL_HARNESS"
