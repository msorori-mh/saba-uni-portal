param([string]$Image = "postgres:17-alpine")

# Local disposable proof for SEQ25 academic-effect markers (no Production write).
$ErrorActionPreference = "Stop"
$repo = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
$name = "b1-fx-$([guid]::NewGuid().ToString('N').Substring(0,10))"
$db = "b1_fx"

function Invoke-Sql([string]$Sql) {
  $Sql | docker exec -i $name psql -X -v ON_ERROR_STOP=1 -U postgres -d $db | Out-Null
  if ($LASTEXITCODE -ne 0) { throw "sql failed" }
}

try {
  docker run --rm --detach --name $name -e POSTGRES_PASSWORD=local_only -e POSTGRES_DB=$db $Image | Out-Null
  for ($i = 0; $i -lt 40; $i++) {
    docker exec $name pg_isready -U postgres -d $db *> $null
    if ($LASTEXITCODE -eq 0) { break }
    Start-Sleep -Milliseconds 400
  }

  # Minimal stubs sufficient for marker compile checks.
  # Use single-quoted here-string so PowerShell does not eat Postgres $$ dollar quotes.
  Invoke-Sql @'
CREATE ROLE authenticated NOLOGIN;
CREATE ROLE anon NOLOGIN;
CREATE ROLE service_role NOLOGIN;
CREATE SCHEMA IF NOT EXISTS extensions;
CREATE TABLE public.departments(id uuid PRIMARY KEY DEFAULT gen_random_uuid());
CREATE TABLE public.programs(id uuid PRIMARY KEY DEFAULT gen_random_uuid());
CREATE TABLE public.enrollment_suspension_details(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id uuid,
  updated_at timestamptz DEFAULT now()
);
CREATE TABLE public.transfer_request_details(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id uuid,
  updated_at timestamptz DEFAULT now()
);
CREATE TABLE public.file_withdrawal_details(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id uuid,
  updated_at timestamptz DEFAULT now(),
  library_cleared_at timestamptz,
  labs_cleared_at timestamptz,
  activities_cleared_at timestamptz,
  finance_cleared_at timestamptz,
  records_transferred_at timestamptz
);
'@

  Get-Content -LiteralPath (Join-Path $repo "supabase\migrations\20260727120000_b1_25_academic_effect_markers_01.sql") -Raw |
    docker exec -i $name psql -X -v ON_ERROR_STOP=1 -U postgres -d $db | Out-Null
  if ($LASTEXITCODE -ne 0) { throw "SEQ25 failed" }

  $cols = (docker exec $name psql -X -At -U postgres -d $db -c "SELECT count(*) FROM information_schema.columns WHERE column_name='effect_applied_at' AND table_name IN ('enrollment_suspension_details','transfer_request_details','file_withdrawal_details');").Trim()
  if ($cols -ne "3") { throw "markers missing: $cols" }

  Write-Host "SEQ25=PASS"
  Write-Host "PASS_B1_ACADEMIC_EFFECT_MARKERS_HARNESS"
}
finally {
  docker rm -f $name *> $null
}
