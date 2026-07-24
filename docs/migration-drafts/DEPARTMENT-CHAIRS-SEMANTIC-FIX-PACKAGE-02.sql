-- ============================================================================
-- NEVER_APPLY — SEMANTICALLY_INVALID.
-- Historical artifact only. Never promote, execute, or copy its academic
-- affiliation update. See DEPARTMENT-ADMINISTRATIVE-POSITIONS-SEPARATION-01.
-- DEPARTMENT-CHAIRS-SEMANTIC-FIX-PACKAGE-02  (refreshed D-01, semantic rebuild)
-- Track B: DEPARTMENT-CHAIRS-SEMANTIC-AUDIT-AND-D01-REFRESH-01
-- Base: main @ 45148e0939d6e2d8f2baba792df4ca79907df8ac
--
-- FORWARD-ONLY DRAFT. NEVER APPLIED BY THIS PR. Requires separate explicit
-- execution authorization (same HOLD posture as the historical package-01).
--
-- Refresh contract (vs DEPARTMENT-CHAIRS-CONTROLLED-FIX-PACKAGE-01, which is
-- historical and untouched):
--   * STOPS on identity mismatch (employee_number + UUID + status anchors).
--   * STOPS on duplicate active chairs (unknown membership or cardinality > 2).
--   * STOPS on any active department_head assignment outside CS/IT/IS.
--   * Creates NO auth user and NO faculty/staff profile (no INSERT anywhere
--     except at most ONE request_processing_assignments row for Osama-CS).
--   * Invents NO UUID: every referenced UUID is D-01 evidence; the single
--     possible new row takes the database default gen_random_uuid().
--   * Deletes NO history: correction is UPDATE/INSERT only; the wrong IT row
--     is preserved forever as is_active=false history.
--   * Forward correction only; companion ROLLBACK-BY-FORWARD script exists.
--   * Verifies cardinality = 1 active chair per department (CS/IT/IS) after
--     execution, holder identity = approved expected identity, in-unit.
--   * Never moves a person across departments without evidence: the Osama
--     IT->CS profile move is gated on app.department_chairs_semantic_fix_evidence
--     = 'DEPARTMENT-CHAIRS-IDENTITY-RESOLUTION-READONLY-01:CS=F2025006'.
--   * Touch-whitelist: pre/post row snapshots prove ONLY the whitelisted rows
--     changed (protected identities cannot be touched by construction).
--   * faculty_profiles.employee_number is the canonical academic number field.
--
-- Runtime-version pin (recon §7): this package corrects the DATA layer consumed
-- by the DEPLOYED actor RPCs of 20260710180000_student_request_actor_rpc_rls.sql
-- (user_matches_workflow_runtime_step with the registrar/admin fast-path and
-- the is_department_head_of-based fallback). The strict-binding rewrite
-- STUDENT-REQUEST-WORKFLOW-ACTOR-AUTHORIZATION-HARDENING.sql is an UNAPPLIED
-- draft; this package neither applies nor assumes it.
--
-- Protected identities (whitelist-enforced; package writes touch none of them):
--   chairs:  Osama F2025006 (fp d08a8509-...), Khaled F2025005 (fp 6f9f004d-...),
--            Ramzi F2025004 (fp c1fe6084-...) — Khaled/Ramzi rows must be
--            byte-identical after execution.
--   records: SR-20260713-2DE64041, SR-20260715-FEDCB3E1, SR-20260716-26BAD4C8,
--            USR-2026-000001, USR-2026-000002 — out of package scope; this
--            package references no student-request or auth-account table.
--
-- Required session settings (fail-closed gates):
--   set app.department_chairs_semantic_fix_ticket     = 'DEPARTMENT-CHAIRS-SEMANTIC-FIX-PACKAGE-02';
--   set app.department_chairs_semantic_fix_actor      = '<system_admin auth.users uuid>';
--   set app.department_chairs_semantic_fix_actor_role = 'system_admin';
--   set app.department_chairs_semantic_fix_evidence   = 'DEPARTMENT-CHAIRS-IDENTITY-RESOLUTION-READONLY-01:CS=F2025006';
-- ============================================================================

begin;

-- Pre-write snapshots for the touch-whitelist postcondition (temp = session-local).
create temp table rpa_before on commit drop as
  select id, unit_id, role_id, assignment_type, user_id, staff_profile_id,
         faculty_profile_id, position_assignment_id, department_id,
         is_active, starts_at, ends_at
  from public.request_processing_assignments;
create temp table fp_before on commit drop as
  select id, user_id, faculty_id, employee_number, full_name_ar, department_id,
         program_id, academic_rank, position_title, status, must_change_password
  from public.faculty_profiles;

do $$
declare
  v_cs constant uuid := '11111111-1111-4111-8111-111111111111';
  v_it constant uuid := 'ce485c67-5f7c-498d-b120-4b1130a86ae8';
  v_is constant uuid := '22222222-2222-4222-8222-222222222222';
  v_osama_user constant uuid := '97acbe02-c59c-409c-8d51-7d4ef72e6db7';
  v_osama_fp constant uuid := 'd08a8509-4c04-472e-885f-053a80be12ec';
  v_khaled_user constant uuid := 'd4aaa5c9-72d1-4996-b0e8-d30c6327da6e';
  v_khaled_fp constant uuid := '6f9f004d-c5f6-4dfe-b212-7f79ce8658e3';
  v_ramzi_user constant uuid := 'f602b62c-194b-4591-8e9c-956e5cbb347d';
  v_ramzi_fp constant uuid := 'c1fe6084-e594-482e-a178-ac8eaffed376';
  v_wrong constant uuid := '7ab0b14f-9007-40d6-9aaf-f1cba454ac8f';
  v_khaled_a constant uuid := '912bdb96-3fb9-494c-8caa-7778c7d0d402';
  v_ramzi_a constant uuid := '4d0f434e-57ab-40b2-8a6f-5f27f330db97';
  v_actor uuid;
  v_actor_role text;
  v_unit uuid;
  v_role uuid;
  v_cs_assignment uuid;
  v_count integer;
  v_rows integer;
  v_final boolean;
  v_khaled_profile jsonb;
  v_ramzi_profile jsonb;
  v_khaled_assignment jsonb;
  v_ramzi_assignment jsonb;
begin
  -- fail-closed gates ---------------------------------------------------------
  if current_setting('app.department_chairs_semantic_fix_ticket',true)
       is distinct from 'DEPARTMENT-CHAIRS-SEMANTIC-FIX-PACKAGE-02' then
    raise exception 'SEMANTIC_FIX_TICKET_REQUIRED';
  end if;
  begin
    v_actor := current_setting('app.department_chairs_semantic_fix_actor',true)::uuid;
  exception when others then
    raise exception 'SEMANTIC_FIX_ACTOR_UUID_REQUIRED';
  end;
  if v_actor is null then raise exception 'SEMANTIC_FIX_ACTOR_UUID_REQUIRED'; end if;
  v_actor_role := current_setting('app.department_chairs_semantic_fix_actor_role',true);
  if v_actor_role is distinct from 'system_admin' then
    raise exception 'SEMANTIC_FIX_EXPLICIT_SYSTEM_ADMIN_ROLE_REQUIRED';
  end if;
  if current_setting('app.department_chairs_semantic_fix_evidence',true)
       is distinct from 'DEPARTMENT-CHAIRS-IDENTITY-RESOLUTION-READONLY-01:CS=F2025006' then
    raise exception 'SEMANTIC_FIX_EVIDENCE_REQUIRED';
  end if;
  if not exists (
    select 1 from auth.users u join public.user_roles ur on ur.user_id=u.id
    where u.id=v_actor and (u.banned_until is null or u.banned_until<=now())
      and ur.role::text=v_actor_role
  ) then
    raise exception 'SEMANTIC_FIX_ACTOR_NOT_ACTIVE_AUTHORIZED_SYSTEM_ADMIN';
  end if;
  if to_regprocedure('public.log_audit(text,uuid,text,jsonb,jsonb,text,uuid)') is null then
    raise exception 'LOG_AUDIT_7_ARG_REQUIRED';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('department-chairs-semantic-fix-package-02',0));
  lock table public.faculty_profiles in share row exclusive mode;
  lock table public.request_processing_assignments in share row exclusive mode;

  -- semantic anchors: exact unit/role codes (never naming/substring matching)
  select count(*) into v_count from public.departments where id in (v_cs,v_it,v_is);
  if v_count<>3 then raise exception 'DEPARTMENT_ANCHOR_DRIFT_%',v_count; end if;
  select id into strict v_unit from public.request_processing_units where code='department' and is_active;
  select id into strict v_role from public.request_processing_roles
    where unit_id=v_unit and code='department_head' and is_active;

  -- STOP on identity mismatch: exact accounts + profile anchors (employee_number
  -- + UUID + status; Arabic names asserted exactly as STORED, simplified
  -- orthography — identity matching is by employee_number/UUIDs only).
  if (select count(*) from auth.users where id in (v_osama_user,v_khaled_user,v_ramzi_user))<>3 then
    raise exception 'AUTH_ACCOUNT_ANCHOR_DRIFT';
  end if;
  perform 1 from public.faculty_profiles where id=v_osama_fp and user_id=v_osama_user
    and full_name_ar='د. اسامه عبدالجليل احمد سيف' and employee_number='F2025006'
    and status='active' and department_id in (v_it,v_cs) for update;
  if not found then raise exception 'OSAMA_PROFILE_IDENTITY_DRIFT'; end if;
  perform 1 from public.faculty_profiles where id=v_khaled_fp and user_id=v_khaled_user
    and full_name_ar='د. خالد قاسم محمد البراحي' and employee_number='F2025005'
    and status='active' and department_id=v_it for update;
  if not found then raise exception 'KHALED_PROFILE_IDENTITY_DRIFT'; end if;
  perform 1 from public.faculty_profiles where id=v_ramzi_fp and user_id=v_ramzi_user
    and full_name_ar='د. رمزي حميد الجابري' and employee_number='F2025004'
    and status='active' and department_id=v_is for update;
  if not found then raise exception 'RAMZI_PROFILE_IDENTITY_DRIFT'; end if;

  select to_jsonb(fp) into strict v_khaled_profile from public.faculty_profiles fp where id=v_khaled_fp;
  select to_jsonb(fp) into strict v_ramzi_profile from public.faculty_profiles fp where id=v_ramzi_fp;
  select to_jsonb(a) into strict v_khaled_assignment from public.request_processing_assignments a where id=v_khaled_a;
  select to_jsonb(a) into strict v_ramzi_assignment from public.request_processing_assignments a where id=v_ramzi_a;

  perform 1 from public.request_processing_assignments where id=v_khaled_a and unit_id=v_unit
    and role_id=v_role and assignment_type='faculty_profile' and faculty_profile_id=v_khaled_fp
    and user_id is null and staff_profile_id is null and position_assignment_id is null
    and department_id=v_it and is_active for update;
  if not found then raise exception 'KHALED_ASSIGNMENT_DRIFT'; end if;
  perform 1 from public.request_processing_assignments where id=v_ramzi_a and unit_id=v_unit
    and role_id=v_role and assignment_type='faculty_profile' and faculty_profile_id=v_ramzi_fp
    and user_id is null and staff_profile_id is null and position_assignment_id is null
    and department_id=v_is and is_active for update;
  if not found then raise exception 'RAMZI_ASSIGNMENT_DRIFT'; end if;

  -- STOP on duplicate / out-of-scope active chairs -----------------------------
  -- IT pre-state may be exactly the known defect pair {Khaled, wrong-Osama}.
  -- Anything else (unknown member, or >2 actives anywhere) stops the package.
  if exists (
    select 1 from public.request_processing_assignments a
    where a.unit_id=v_unit and a.role_id=v_role and a.assignment_type='faculty_profile'
      and a.is_active and (a.starts_at is null or a.starts_at<=now())
      and (a.ends_at is null or a.ends_at>now())
      and a.department_id not in (v_cs,v_it,v_is)
  ) then
    raise exception 'ACTIVE_HEAD_OUTSIDE_CS_IT_IS_STOP';
  end if;
  select count(*) into v_count from public.request_processing_assignments a
    where a.unit_id=v_unit and a.role_id=v_role and a.assignment_type='faculty_profile'
      and a.department_id=v_it and a.is_active
      and (a.starts_at is null or a.starts_at<=now()) and (a.ends_at is null or a.ends_at>now())
      and a.id not in (v_khaled_a,v_wrong);
  if v_count<>0 then raise exception 'IT_DUPLICATE_UNKNOWN_MEMBER_STOP_%',v_count; end if;
  if (select count(*) from public.request_processing_assignments a
      where a.unit_id=v_unit and a.role_id=v_role and a.assignment_type='faculty_profile'
        and a.department_id=v_cs and a.is_active
        and (a.starts_at is null or a.starts_at<=now()) and (a.ends_at is null or a.ends_at>now()))>1 then
    raise exception 'CS_DUPLICATE_ACTIVE_STOP';
  end if;
  if (select count(*) from public.request_processing_assignments a
      where a.unit_id=v_unit and a.role_id=v_role and a.assignment_type='faculty_profile'
        and a.department_id=v_is and a.is_active
        and (a.starts_at is null or a.starts_at<=now()) and (a.ends_at is null or a.ends_at>now()))<>1 then
    raise exception 'IS_ACTIVE_HEAD_CARDINALITY_STOP';
  end if;

  -- forward correction: deactivate wrong IT row + evidence-gated profile move --
  select fp.department_id=v_cs and not a.is_active into v_final
  from public.faculty_profiles fp cross join public.request_processing_assignments a
  where fp.id=v_osama_fp and a.id=v_wrong;

  if not coalesce(v_final,false) then
    perform 1 from public.request_processing_assignments where id=v_wrong and unit_id=v_unit
      and role_id=v_role and assignment_type='faculty_profile' and faculty_profile_id=v_osama_fp
      and user_id is null and staff_profile_id is null and position_assignment_id is null
      and department_id=v_it and is_active for update;
    if not found then raise exception 'WRONG_OSAMA_IT_ASSIGNMENT_DRIFT'; end if;
    if (select department_id from public.faculty_profiles where id=v_osama_fp)<>v_it then
      raise exception 'OSAMA_PROFILE_PRESTATE_DRIFT';
    end if;

    -- history preserved: UPDATE only, row stays as is_active=false forever
    update public.request_processing_assignments set is_active=false,
      ends_at=coalesce(ends_at,now()),updated_at=now() where id=v_wrong and is_active;
    get diagnostics v_rows=row_count;
    if v_rows<>1 then raise exception 'WRONG_ASSIGNMENT_DISABLE_ROWCOUNT_%',v_rows; end if;
    -- evidence-gated cross-department move (app.department_chairs_semantic_fix_evidence)
    update public.faculty_profiles set department_id=v_cs,updated_at=now()
      where id=v_osama_fp and department_id=v_it;
    get diagnostics v_rows=row_count;
    if v_rows<>1 then raise exception 'OSAMA_PROFILE_MOVE_ROWCOUNT_%',v_rows; end if;
  end if;

  -- CS mapping: reuse exactly one inactive matching row; insert only when zero;
  -- STOP on duplicate inactive candidates. No UUID is invented (default uuid()).
  select count(*) into v_count
  from public.request_processing_assignments where unit_id=v_unit and role_id=v_role
    and assignment_type='faculty_profile' and faculty_profile_id=v_osama_fp
    and user_id is null and staff_profile_id is null and position_assignment_id is null
    and department_id=v_cs and not is_active;
  if v_count>1 then raise exception 'OSAMA_CS_INACTIVE_DUPLICATES_STOP_%',v_count; end if;
  if v_count=1 then
    select id into strict v_cs_assignment from public.request_processing_assignments
    where unit_id=v_unit and role_id=v_role and assignment_type='faculty_profile'
      and faculty_profile_id=v_osama_fp and user_id is null and staff_profile_id is null
      and position_assignment_id is null and department_id=v_cs and not is_active;
  end if;

  if not exists(select 1 from public.request_processing_assignments where unit_id=v_unit
      and role_id=v_role and faculty_profile_id=v_osama_fp and department_id=v_cs and is_active
      and (starts_at is null or starts_at<=now()) and (ends_at is null or ends_at>now())) then
    if v_count=1 then
      update public.request_processing_assignments set is_active=true,starts_at=now(),ends_at=null,updated_at=now()
        where id=v_cs_assignment and not is_active;
    else
      insert into public.request_processing_assignments
        (unit_id,role_id,assignment_type,faculty_profile_id,department_id,is_active,starts_at)
      values(v_unit,v_role,'faculty_profile',v_osama_fp,v_cs,true,now()) returning id into v_cs_assignment;
    end if;
  end if;

  -- postcondition 1: cardinality = 1 active chair per department --------------
  foreach v_count in array array[1,2,3] loop
    select count(*) into v_rows from public.request_processing_assignments
      where unit_id=v_unit and role_id=v_role and department_id=case v_count when 1 then v_cs when 2 then v_it else v_is end
      and is_active and (starts_at is null or starts_at<=now()) and (ends_at is null or ends_at>now());
    if v_rows<>1 then raise exception 'CHAIR_POST_TOTAL_DEPARTMENT_%_COUNT_%',v_count,v_rows; end if;
  end loop;

  -- postcondition 2: holders are exactly the approved expected identities -----
  if not exists (select 1 from public.request_processing_assignments a
      join public.faculty_profiles fp on fp.id=a.faculty_profile_id
      where a.unit_id=v_unit and a.role_id=v_role and a.department_id=v_cs and a.is_active
        and (a.starts_at is null or a.starts_at<=now()) and (a.ends_at is null or a.ends_at>now())
        and fp.id=v_osama_fp and fp.employee_number='F2025006' and fp.department_id=v_cs) then
    raise exception 'CS_POST_HOLDER_NOT_OSAMA_F2025006';
  end if;
  if not exists (select 1 from public.request_processing_assignments a
      join public.faculty_profiles fp on fp.id=a.faculty_profile_id
      where a.unit_id=v_unit and a.role_id=v_role and a.department_id=v_it and a.is_active
        and (a.starts_at is null or a.starts_at<=now()) and (a.ends_at is null or a.ends_at>now())
        and fp.id=v_khaled_fp and fp.employee_number='F2025005' and fp.department_id=v_it) then
    raise exception 'IT_POST_HOLDER_NOT_KHALED_F2025005';
  end if;
  if not exists (select 1 from public.request_processing_assignments a
      join public.faculty_profiles fp on fp.id=a.faculty_profile_id
      where a.unit_id=v_unit and a.role_id=v_role and a.department_id=v_is and a.is_active
        and (a.starts_at is null or a.starts_at<=now()) and (a.ends_at is null or a.ends_at>now())
        and fp.id=v_ramzi_fp and fp.employee_number='F2025004' and fp.department_id=v_is) then
    raise exception 'IS_POST_HOLDER_NOT_RAMZI_F2025004';
  end if;

  -- postcondition 3: Khaled/Ramzi byte-identical (protected chairs) -----------
  if (select to_jsonb(fp) from public.faculty_profiles fp where id=v_khaled_fp) is distinct from v_khaled_profile
    or (select to_jsonb(fp) from public.faculty_profiles fp where id=v_ramzi_fp) is distinct from v_ramzi_profile
    or (select to_jsonb(a) from public.request_processing_assignments a where id=v_khaled_a) is distinct from v_khaled_assignment
    or (select to_jsonb(a) from public.request_processing_assignments a where id=v_ramzi_a) is distinct from v_ramzi_assignment then
    raise exception 'KHALED_OR_RAMZI_CHANGED';
  end if;

  -- postcondition 4: touch-whitelist (changed set ⊆ {v_wrong, v_cs_assignment},
  -- new set ⊆ {v_cs_assignment}, faculty_profiles changed set ⊆ {v_osama_fp}) --
  if exists (
    select a.id from public.request_processing_assignments a
    join rpa_before b using (id)
    where (a.is_active, a.ends_at, a.starts_at, a.department_id, a.faculty_profile_id,
           a.unit_id, a.role_id, a.assignment_type, a.user_id, a.staff_profile_id,
           a.position_assignment_id)
       is distinct from
          (b.is_active, b.ends_at, b.starts_at, b.department_id, b.faculty_profile_id,
           b.unit_id, b.role_id, b.assignment_type, b.user_id, b.staff_profile_id,
           b.position_assignment_id)
      and a.id not in (v_wrong, coalesce(v_cs_assignment, v_wrong))
  ) then
    raise exception 'TOUCH_OUTSIDE_WHITELIST_ASSIGNMENTS';
  end if;
  if exists (
    select 1 from public.request_processing_assignments a
    where not exists (select 1 from rpa_before b where b.id=a.id)
      and a.id is distinct from v_cs_assignment
  ) then
    raise exception 'UNEXPECTED_NEW_ASSIGNMENT_ROW';
  end if;
  if exists (
    select fp.id from public.faculty_profiles fp
    join fp_before b using (id)
    where (fp.user_id, fp.faculty_id, fp.employee_number, fp.full_name_ar,
           fp.department_id, fp.program_id, fp.academic_rank, fp.position_title,
           fp.status, fp.must_change_password)
       is distinct from
          (b.user_id, b.faculty_id, b.employee_number, b.full_name_ar,
           b.department_id, b.program_id, b.academic_rank, b.position_title,
           b.status, b.must_change_password)
      and fp.id <> v_osama_fp
  ) then
    raise exception 'TOUCH_OUTSIDE_WHITELIST_FACULTY_PROFILES';
  end if;
  -- history preserved: no request_processing_assignments row may disappear
  if (select count(*) from public.request_processing_assignments)
       < (select count(*) from rpa_before) then
    raise exception 'ASSIGNMENT_HISTORY_ROW_LOST';
  end if;

  perform public.log_audit(
    'request_processing_assignment'::text,v_osama_fp::uuid,
    'department_chair_semantic_fix_verified'::text,null::jsonb,
    jsonb_build_object('faculty_profile_id',v_osama_fp,'department_id',v_cs)::jsonb,
    'DEPARTMENT-CHAIRS-SEMANTIC-FIX-PACKAGE-02'::text,v_actor::uuid);
end $$;

commit;

-- ROLLBACK-BY-FORWARD-CORRECTION only (companion file
-- DEPARTMENT-CHAIRS-SEMANTIC-FIX-PACKAGE-02-ROLLBACK-BY-FORWARD.sql);
-- never DELETE; never mutate position_assignments; history is preserved.
