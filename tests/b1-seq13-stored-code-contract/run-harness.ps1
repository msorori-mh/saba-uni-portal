param([string]$Image = "postgres:17-alpine")

# SEQ13 stored request-type contract: legacy-only / canonical-only PASS; both/neither/dup FAIL_CLOSED.
$ErrorActionPreference = "Stop"
$repo = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
$mig = Join-Path $repo "supabase\migrations\20260725110600_b1_13_final_chance_canonical_write_03.sql"
$results = New-Object System.Collections.Generic.List[string]

function Invoke-Case([string]$CaseId, [string]$SeedSql, [bool]$ExpectPass) {
  $name = "b1-seq13-$CaseId-$([guid]::NewGuid().ToString('N').Substring(0,8))"
  try {
    docker run --rm --detach --name $name -e POSTGRES_PASSWORD=local_only -e POSTGRES_DB=b1_seq13 $Image | Out-Null
    $ready = $false
    for ($i=0; $i -lt 40; $i++) {
      docker exec $name pg_isready -U postgres -d b1_seq13 *> $null
      if ($LASTEXITCODE -eq 0) { $ready = $true; break }
      Start-Sleep -Milliseconds 400
    }
    if (-not $ready) { throw "pg not ready" }

    $bootstrap = @"
CREATE ROLE authenticated NOLOGIN;
CREATE ROLE anon NOLOGIN;
CREATE ROLE service_role NOLOGIN;
CREATE TABLE public.request_types (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL,
  name_ar text,
  audience text,
  is_active boolean DEFAULT true,
  student_visible boolean DEFAULT false
);
CREATE TABLE public.student_requests (id uuid PRIMARY KEY);
CREATE TABLE public.extra_chance_details (
  request_id uuid PRIMARY KEY REFERENCES public.student_requests(id),
  academic_year_id uuid,
  semester_id uuid,
  reason text,
  chance_type text NOT NULL DEFAULT 'final_chance',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.student_extra_chances (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_profile_id uuid,
  chance_type text NOT NULL DEFAULT 'final_chance',
  created_at timestamptz NOT NULL DEFAULT now()
);
$SeedSql
"@
    $bootstrap | docker exec -i $name psql -X -v ON_ERROR_STOP=1 -U postgres -d b1_seq13 | Out-Null
    if ($LASTEXITCODE -ne 0) { throw "bootstrap failed" }

    $prev = $ErrorActionPreference; $ErrorActionPreference = "Continue"
    Get-Content -LiteralPath $mig -Raw | docker exec -i $name psql -X -v ON_ERROR_STOP=1 -U postgres -d b1_seq13 2>&1 | Out-Null
    $code = $LASTEXITCODE
    $ErrorActionPreference = $prev

    $passed = ($ExpectPass -and $code -eq 0) -or ((-not $ExpectPass) -and $code -ne 0)
    if (-not $passed) { throw "case $CaseId unexpected result exit=$code expectPass=$ExpectPass" }

    if ($ExpectPass) {
      $mut = docker exec $name psql -X -At -U postgres -d b1_seq13 -c @"
SELECT count(*) FROM public.request_types WHERE code IN ('extra_chance','final_chance');
"@
      if ([int]$mut.Trim() -lt 1) { throw "case $CaseId lost request_types" }
      # prove no rewrite helpers mutated request_types codes beyond seed
      $codes = (docker exec $name psql -X -At -U postgres -d b1_seq13 -c "SELECT string_agg(code,',' ORDER BY code) FROM public.request_types WHERE code IN ('extra_chance','final_chance');").Trim()
      if ($CaseId -eq 'A' -and $codes -ne 'final_chance') { throw "A mutated codes=$codes" }
      if ($CaseId -eq 'B' -and $codes -ne 'extra_chance') { throw "B mutated codes=$codes" }
    }

    Write-Host "$CaseId=PASS"
    [void]$results.Add("$CaseId=PASS")
  }
  finally {
    docker rm -f $name *> $null
  }
}

Write-Host "PHASE=A_canonical_only"
Invoke-Case 'A' "INSERT INTO public.request_types(code,name_ar,audience,is_active,student_visible) VALUES ('final_chance','فرصة أخيرة','student',true,false);" $true

Write-Host "PHASE=B_legacy_only"
Invoke-Case 'B' "INSERT INTO public.request_types(code,name_ar,audience,is_active,student_visible) VALUES ('extra_chance','فرصة أخيرة','student',true,false);" $true

Write-Host "PHASE=C_both"
Invoke-Case 'C' @"
INSERT INTO public.request_types(code,name_ar,audience,is_active,student_visible) VALUES
 ('extra_chance','legacy','student',true,false),
 ('final_chance','canonical','student',true,false);
"@ $false

Write-Host "PHASE=D_neither"
Invoke-Case 'D' "SELECT 1;" $false

Write-Host "PHASE=E_dup_canonical"
Invoke-Case 'E' @"
INSERT INTO public.request_types(code,name_ar,audience,is_active,student_visible) VALUES
 ('final_chance','a','student',true,false),
 ('final_chance','b','student',true,false);
"@ $false

Write-Host "PHASE=E2_dup_legacy"
Invoke-Case 'E2' @"
INSERT INTO public.request_types(code,name_ar,audience,is_active,student_visible) VALUES
 ('extra_chance','a','student',true,false),
 ('extra_chance','b','student',true,false);
"@ $false

Write-Host ("RESULTS=" + ($results -join ';'))
Write-Host "PASS_B1_SEQ13_STORED_CODE_CONTRACT_HARNESS"
