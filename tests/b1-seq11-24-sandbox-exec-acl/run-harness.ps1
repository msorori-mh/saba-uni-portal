param([string]$Image = "postgres:17-alpine")

$ErrorActionPreference = "Stop"
$repo = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
$seq11Mig = "supabase\migrations\20260725110400_b1_11_file_withdrawal_details_05a.sql"
$seq11Pre = "docs\migration-drafts\b1-backend-verifiers\11-B1_11_FILE_WITHDRAWAL_DETAILS_05A-PREFLIGHT.sql"
$seq11Post = "docs\migration-drafts\b1-backend-verifiers\11-B1_11_FILE_WITHDRAWAL_DETAILS_05A-POST-VERIFIER.sql"
$seq14Mig = "supabase\migrations\20260725110700_b1_14_detail_rpc_write_boundaries_05a.sql"
$seq14Pre = "docs\migration-drafts\b1-backend-verifiers\14-B1_14_DETAIL_RPC_WRITE_BOUNDARIES_05A-PREFLIGHT.sql"
$seq14Post = "docs\migration-drafts\b1-backend-verifiers\14-B1_14_DETAIL_RPC_WRITE_BOUNDARIES_05A-POST-VERIFIER.sql"
$baseSql = "tests\b1-seq11-24-sandbox-exec-acl\pg\10-roles-and-default-acl.sql"
$expected11 = "35468e00c544833626ddec23a8cf5d81659d4a51a16bbaa1d1f3ad99944e6401"
$expected14 = "3d3f274d1d0f864b8ed387138f92a78bb3952e1cedfe9232d9a657564f50399b"
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
  $name = "b1-s1124-$Suffix-$([guid]::NewGuid().ToString('N').Substring(0,8))"
  $db = "b1_s1124"
  docker run --rm --detach --name $name -e POSTGRES_PASSWORD=local_only -e POSTGRES_DB=$db $Image | Out-Null
  for ($i = 0; $i -lt 40; $i++) {
    $prev = $ErrorActionPreference; $ErrorActionPreference = "Continue"
    $logs = docker logs $name 2>&1
    $ErrorActionPreference = $prev
    docker exec $name pg_isready -U postgres -d $db *> $null
    if ($LASTEXITCODE -eq 0 -and ($logs -join "`n") -match "PostgreSQL init process complete") {
      return @{ Name = $name; Database = $db }
    }
    Start-Sleep -Milliseconds 500
  }
  throw "PostgreSQL not ready ($name)"
}

function Stop-Pg($pg) { if ($null -ne $pg) { docker stop $pg.Name *> $null } }

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

function Assert-TableFinal($pg, [string]$Table) {
  $q = @"
SELECT
  has_table_privilege('authenticated','public.$Table','SELECT')
  AND NOT has_table_privilege('authenticated','public.$Table','INSERT')
  AND has_table_privilege('service_role','public.$Table','SELECT')
  AND NOT has_table_privilege('service_role','public.$Table','INSERT')
  AND NOT has_table_privilege('anon','public.$Table','SELECT')
  AND (
    NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='sandbox_exec')
    OR NOT EXISTS (
      SELECT 1 FROM pg_class c
      CROSS JOIN LATERAL aclexplode(COALESCE(c.relacl, acldefault('r', c.relowner))) x
      JOIN pg_roles r ON r.oid=x.grantee
      WHERE c.oid=('public.$Table')::regclass AND r.rolname='sandbox_exec'
    )
  );
"@
  $ok = (docker exec $pg.Name psql -X -At -U postgres -d $pg.Database -c $q).Trim()
  if ($ok -ne "t") { throw "final ACL failed for $Table : $ok" }
}

$sha11 = Get-LfSha256 (Join-Path $repo $seq11Mig)
$sha14 = Get-LfSha256 (Join-Path $repo $seq14Mig)
if ($sha11 -ne $expected11) { throw "SEQ11 SHA mismatch $sha11" }
if ($sha14 -ne $expected14) { throw "SEQ14 SHA mismatch $sha14" }
Write-Output "SEQ11_SHA=$sha11"
Write-Output "SEQ14_SHA=$sha14"

# ---- 1: SEQ11 with sandbox_exec default ACL ----
$pg = $null
try {
  Write-Output "PHASE=1_SEQ11_default_acl"
  $pg = New-Pg "1"
  Invoke-PsqlFile $pg (Join-Path $repo $baseSql)
  Invoke-PsqlText $pg @"
DO `$r$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='sandbox_exec') THEN
    CREATE ROLE sandbox_exec NOLOGIN;
  END IF;
END `$r$;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT ON TABLES TO sandbox_exec;
"@
  Invoke-PsqlFile $pg (Join-Path $repo $seq11Pre)
  Invoke-PsqlFile $pg (Join-Path $repo $seq11Mig)
  # Prove inheritance happened before revoke by checking migration succeeded and final is clean
  Assert-TableFinal $pg "file_withdrawal_details"
  Invoke-PsqlFile $pg (Join-Path $repo $seq11Post)
  $results.Add("1=PASS"); Write-Output "1=PASS"
} finally { Stop-Pg $pg }

# ---- 2: SEQ11 without sandbox_exec ----
$pg = $null
try {
  Write-Output "PHASE=2_SEQ11_no_sandbox_exec"
  $pg = New-Pg "2"
  Invoke-PsqlFile $pg (Join-Path $repo $baseSql)
  Invoke-PsqlText $pg "DROP ROLE IF EXISTS sandbox_exec;"
  Invoke-PsqlFile $pg (Join-Path $repo $seq11Pre)
  Invoke-PsqlFile $pg (Join-Path $repo $seq11Mig)
  Invoke-PsqlFile $pg (Join-Path $repo $seq11Post)
  Assert-TableFinal $pg "file_withdrawal_details"
  $results.Add("2=PASS"); Write-Output "2=PASS"
} finally { Stop-Pg $pg }

# ---- 3: SEQ11 rogue grantee fail-closed ----
$pg = $null
try {
  Write-Output "PHASE=3_SEQ11_rogue"
  $pg = New-Pg "3"
  Invoke-PsqlFile $pg (Join-Path $repo $baseSql)
  Invoke-PsqlText $pg @"
DO `$r$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='rogue_reader') THEN
    CREATE ROLE rogue_reader NOLOGIN;
  END IF;
END `$r$;
CREATE TABLE public.file_withdrawal_details (
  request_id uuid PRIMARY KEY REFERENCES public.student_requests(id),
  withdrawal_reason text NOT NULL,
  impact_ack boolean NOT NULL,
  library_cleared_at timestamptz,
  labs_cleared_at timestamptz,
  activities_cleared_at timestamptz,
  finance_cleared_at timestamptz,
  records_transferred_at timestamptz,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT file_withdrawal_details_reason_check CHECK (length(btrim(withdrawal_reason)) >= 10),
  CONSTRAINT file_withdrawal_details_impact_check CHECK (impact_ack)
);
GRANT SELECT ON TABLE public.file_withdrawal_details TO rogue_reader;
"@
  $preCode = Invoke-PsqlTextSoft $pg (Get-Content -LiteralPath (Join-Path $repo $seq11Pre) -Raw)
  if ($preCode -eq 0) { throw "SEQ11 preflight unexpectedly passed with rogue" }
  $migCode = Invoke-PsqlTextSoft $pg (Get-Content -LiteralPath (Join-Path $repo $seq11Mig) -Raw)
  if ($migCode -eq 0) { throw "SEQ11 migration unexpectedly passed with rogue" }
  $results.Add("3=PASS"); Write-Output "3=PASS"
} finally { Stop-Pg $pg }

# ---- 4/5/6: SEQ14 ----
function Install-Seq14Deps($pg) {
  Invoke-PsqlFile $pg (Join-Path $repo $baseSql)
  Invoke-PsqlText $pg @"
CREATE TABLE IF NOT EXISTS public.enrollment_suspension_details (
  request_id uuid PRIMARY KEY REFERENCES public.student_requests(id),
  notes text, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.transfer_request_details (
  request_id uuid PRIMARY KEY REFERENCES public.student_requests(id),
  notes text, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.extra_chance_details (
  request_id uuid PRIMARY KEY REFERENCES public.student_requests(id),
  notes text, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE OR REPLACE FUNCTION public.persist_validated_b1_request_details(
  p_request_id uuid, p_code text, p_payload jsonb, p_attachment_ids uuid[]
) RETURNS void LANGUAGE plpgsql AS `$f$ BEGIN NULL; END `$f$;
"@
}

$pg = $null
try {
  Write-Output "PHASE=4_SEQ14_sandbox_exec"
  $pg = New-Pg "4"
  Install-Seq14Deps $pg
  Invoke-PsqlText $pg @"
DO `$r$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='sandbox_exec') THEN
    CREATE ROLE sandbox_exec NOLOGIN;
  END IF;
END `$r$;
GRANT SELECT, INSERT ON TABLE public.enrollment_suspension_details TO sandbox_exec;
GRANT SELECT, INSERT ON TABLE public.transfer_request_details TO sandbox_exec;
GRANT SELECT, INSERT ON TABLE public.extra_chance_details TO sandbox_exec;
"@
  Invoke-PsqlFile $pg (Join-Path $repo $seq14Pre)
  Invoke-PsqlFile $pg (Join-Path $repo $seq14Mig)
  Invoke-PsqlFile $pg (Join-Path $repo $seq14Post)
  Invoke-PsqlText $pg "SELECT public.apply_b1_detail_rpc_write_boundaries();"
  Assert-TableFinal $pg "enrollment_suspension_details"
  Assert-TableFinal $pg "transfer_request_details"
  Assert-TableFinal $pg "extra_chance_details"
  $results.Add("4=PASS"); Write-Output "4=PASS"
} finally { Stop-Pg $pg }

$pg = $null
try {
  Write-Output "PHASE=5_SEQ14_no_sandbox_exec"
  $pg = New-Pg "5"
  Install-Seq14Deps $pg
  Invoke-PsqlText $pg "DROP ROLE IF EXISTS sandbox_exec;"
  Invoke-PsqlFile $pg (Join-Path $repo $seq14Pre)
  Invoke-PsqlFile $pg (Join-Path $repo $seq14Mig)
  Invoke-PsqlFile $pg (Join-Path $repo $seq14Post)
  Invoke-PsqlText $pg "SELECT public.apply_b1_detail_rpc_write_boundaries();"
  Assert-TableFinal $pg "enrollment_suspension_details"
  $results.Add("5=PASS"); Write-Output "5=PASS"
} finally { Stop-Pg $pg }

$pg = $null
try {
  Write-Output "PHASE=6_SEQ14_rogue"
  $pg = New-Pg "6"
  Install-Seq14Deps $pg
  Invoke-PsqlText $pg @"
DO `$r$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='rogue_reader') THEN
    CREATE ROLE rogue_reader NOLOGIN;
  END IF;
END `$r$;
GRANT SELECT ON TABLE public.enrollment_suspension_details TO rogue_reader;
"@
  $preCode = Invoke-PsqlTextSoft $pg (Get-Content -LiteralPath (Join-Path $repo $seq14Pre) -Raw)
  if ($preCode -eq 0) { throw "SEQ14 preflight unexpectedly passed with rogue" }
  Invoke-PsqlFile $pg (Join-Path $repo $seq14Mig)
  $invokeCode = Invoke-PsqlTextSoft $pg "SELECT public.apply_b1_detail_rpc_write_boundaries();"
  if ($invokeCode -eq 0) { throw "SEQ14 apply boundaries unexpectedly passed with rogue" }
  $results.Add("6=PASS"); Write-Output "6=PASS"
} finally { Stop-Pg $pg }

# ---- 8: SEQ11 second apply idempotency ----
$pg = $null
try {
  Write-Output "PHASE=8_SEQ11_second_apply"
  $pg = New-Pg "8"
  Invoke-PsqlFile $pg (Join-Path $repo $baseSql)
  Invoke-PsqlText $pg @"
DO `$r$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='sandbox_exec') THEN
    CREATE ROLE sandbox_exec NOLOGIN;
  END IF;
END `$r$;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT ON TABLES TO sandbox_exec;
"@
  Invoke-PsqlFile $pg (Join-Path $repo $seq11Mig)
  Invoke-PsqlFile $pg (Join-Path $repo $seq11Mig)
  Invoke-PsqlFile $pg (Join-Path $repo $seq11Post)
  $results.Add("8=PASS"); Write-Output "8=PASS"
} finally { Stop-Pg $pg }

Write-Output ("RESULTS=" + ($results -join ";"))
Write-Output "PASS_B1_SEQ11_24_SANDBOX_EXEC_ACL_HARNESS"
